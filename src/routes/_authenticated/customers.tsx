import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { naira, useSessionInfo } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Prisca Honey Business Manager" },
      { name: "description", content: "Customer records, categories, credit limits and assigned agents." },
      { property: "og:title", content: "Customers — Prisca Honey" },
      { property: "og:description", content: "Customer records, categories, credit limits and assigned agents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Customers,
});

const categories = ["retail", "wholesale", "supermarket", "distributor", "corporate"] as const;
type Cat = (typeof categories)[number];
interface Form {
  id?: string; name: string; phone: string; address: string; category: Cat;
  assigned_agent: string; credit_limit: string; payment_terms: string; notes: string;
}
const blank: Form = { name: "", phone: "", address: "", category: "retail", assigned_agent: "", credit_limit: "0", payment_terms: "", notes: "" };

function Customers() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [search, setSearch] = useState("");
  const canAssign = s.isManager;

  const list = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name").limit(500);
      if (error) throw error;
      return data;
    },
  });
  const agents = useQuery({
    queryKey: ["agent-profiles"],
    enabled: canAssign,
    queryFn: async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email"),
        supabase.from("user_roles").select("user_id,role").in("role", ["agent", "distributor"]),
      ]);
      const ids = new Set((r ?? []).map((x) => x.user_id));
      return (p ?? []).filter((x) => ids.has(x.id));
    },
  });
  const agentName = (id: string | null) => agents.data?.find((a) => a.id === id)?.full_name || (id === s.userId ? "Me" : id ? "Agent" : "—");

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const row: { name: string; phone: string | null; address: string | null; category: Cat; payment_terms: string | null; notes: string | null; credit_limit?: number; assigned_agent?: string | null } = {
        name: f.name.trim(), phone: f.phone.trim() || null, address: f.address.trim() || null,
        category: f.category, payment_terms: f.payment_terms.trim() || null, notes: f.notes.trim() || null,
      };
      if (!row.name) throw new Error("Customer name is required");
      if (canAssign) {
        row.credit_limit = Number(f.credit_limit);
        row.assigned_agent = f.assigned_agent || null;
      }
      if (f.id) {
        const { error } = await supabase.from("customers").update(row).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert({ ...row, assigned_agent: canAssign ? (row.assigned_agent ?? null) : s.userId });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Customer saved"); setForm(null); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (list.data ?? []).filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={s.isManager || s.isFinance ? "All customers" : "Only the customers assigned to you"}
        action={<Button onClick={() => setForm(blank)}>Add customer</Button>}
      />
      <Input className="mb-4 max-w-sm" placeholder="Search by name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      {items.length === 0 ? (
        <Empty>No customers yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Category</th><th className="p-3">Agent</th><th className="p-3 text-right">Credit limit</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.phone ?? "—"}</td>
                  <td className="p-3"><Badge variant="secondary" className="capitalize">{c.category}</Badge></td>
                  <td className="p-3">{agentName(c.assigned_agent)}</td>
                  <td className="p-3 text-right">{naira(c.credit_limit)}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setForm({
                      id: c.id, name: c.name, phone: c.phone ?? "", address: c.address ?? "", category: c.category,
                      assigned_agent: c.assigned_agent ?? "", credit_limit: String(c.credit_limit),
                      payment_terms: c.payment_terms ?? "", notes: c.notes ?? "",
                    })}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? "Edit customer" : "Add customer"}</DialogTitle></DialogHeader>
          {form && (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <Field label="Customer name"><Input value={form.name} onChange={set("name")} required /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={set("phone")} inputMode="tel" /></Field>
              <Field label="Address"><Input value={form.address} onChange={set("address")} /></Field>
              <Field label="Category">
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm capitalize" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Cat })}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              {canAssign && (
                <>
                  <Field label="Assigned agent">
                    <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.assigned_agent}
                      onChange={(e) => setForm({ ...form, assigned_agent: e.target.value })}>
                      <option value="">Unassigned (owner)</option>
                      {agents.data?.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
                    </select>
                  </Field>
                  <Field label="Credit limit (₦)" hint="Only the owner can set this"><Input type="number" min="0" step="0.01" value={form.credit_limit} onChange={set("credit_limit")} /></Field>
                </>
              )}
              <Field label="Payment terms"><Input value={form.payment_terms} onChange={set("payment_terms")} placeholder="e.g. 14 days" /></Field>
              <Field label="Notes"><Input value={form.notes} onChange={set("notes")} /></Field>
              <Button type="submit" className="sm:col-span-2" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save customer"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
