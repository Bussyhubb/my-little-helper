import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Prisca Honey Business Manager" },
      { name: "description", content: "Raw honey and packaging suppliers." },
      { property: "og:title", content: "Suppliers — Prisca Honey" },
      { property: "og:description", content: "Raw honey and packaging suppliers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Suppliers,
});

interface Form { id?: string; name: string; contact_person: string; phone: string; address: string; notes: string }
const blank: Form = { name: "", contact_person: "", phone: "", address: "", notes: "" };

function Suppliers() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);

  const list = useQuery({
    queryKey: ["suppliers"],
    enabled: s.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const row = {
        name: f.name.trim(), contact_person: f.contact_person.trim() || null, phone: f.phone.trim() || null,
        address: f.address.trim() || null, notes: f.notes.trim() || null,
      };
      if (!row.name) throw new Error("Supplier name is required");
      const { error } = f.id ? await supabase.from("suppliers").update(row).eq("id", f.id) : await supabase.from("suppliers").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Supplier saved"); setForm(null); qc.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (p: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("suppliers").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  if (!s.isStaff) return <Empty>You do not have access to suppliers.</Empty>;

  return (
    <>
      <PageHeader title="Suppliers" subtitle="People you buy raw honey and packaging from." action={s.isManager && <Button onClick={() => setForm(blank)}>Add supplier</Button>} />
      {list.data?.length === 0 ? <Empty>No suppliers yet.</Empty> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Name</th><th className="p-3">Contact</th><th className="p-3">Phone</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {list.data?.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.contact_person ?? "—"}</td>
                  <td className="p-3">{p.phone ?? "—"}</td>
                  <td className="p-3"><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge></td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {s.isManager && (<>
                      <Button size="sm" variant="ghost" onClick={() => setForm({ id: p.id, name: p.name, contact_person: p.contact_person ?? "", phone: p.phone ?? "", address: p.address ?? "", notes: p.notes ?? "" })}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm(p.is_active ? "Deactivate supplier? History is kept." : "Reactivate supplier?") && toggle.mutate(p)}>{p.is_active ? "Deactivate" : "Activate"}</Button>
                    </>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Edit supplier" : "Add supplier"}</DialogTitle></DialogHeader>
          {form && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <Field label="Supplier name"><Input value={form.name} onChange={set("name")} required /></Field>
              <Field label="Contact person"><Input value={form.contact_person} onChange={set("contact_person")} /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={set("phone")} inputMode="tel" /></Field>
              <Field label="Address"><Input value={form.address} onChange={set("address")} /></Field>
              <Field label="Notes"><Input value={form.notes} onChange={set("notes")} /></Field>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save supplier"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
