import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo, naira, fmtDate } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMaterials, selectCls } from "./materials";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — Prisca Honey Business Manager" },
      { name: "description", content: "Record and receive raw honey and packaging purchases." },
      { property: "og:title", content: "Purchases — Prisca Honey" },
      { property: "og:description", content: "Record and receive purchases from suppliers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Purchases,
});

interface Line { material_id: string; qty: string; unit_cost: string }
interface Form { supplier_id: string; purchase_date: string; reference: string; notes: string; lines: Line[] }
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function Purchases() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const canWrite = s.isManager || s.roles.includes("storekeeper");
  const [form, setForm] = useState<Form | null>(null);
  const [view, setView] = useState<string | null>(null);
  const materials = useMaterials(s.isStaff);

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    enabled: s.isStaff,
    queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [],
  });
  const list = useQuery({
    queryKey: ["purchases"],
    enabled: s.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases")
        .select("*, suppliers(name), purchase_lines(id, qty, unit_cost, materials(name, unit))")
        .order("purchase_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: Form) => {
      if (!f.supplier_id) throw new Error("Choose a supplier");
      const lines = f.lines.filter((l) => l.material_id && Number(l.qty) > 0);
      if (!lines.length) throw new Error("Add at least one item");
      const { data: p, error } = await supabase.from("purchases").insert({
        supplier_id: f.supplier_id, purchase_date: f.purchase_date, reference: f.reference.trim() || null, notes: f.notes.trim() || null,
        total: lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_cost || 0), 0),
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("purchase_lines").insert(
        lines.map((l) => ({ purchase_id: p.id, material_id: l.material_id, qty: Number(l.qty), unit_cost: Number(l.unit_cost || 0) })),
      );
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Purchase saved as draft"); setForm(null); qc.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const act = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: "receive" | "cancel" }) => {
      const { error } = kind === "receive"
        ? await supabase.rpc("receive_purchase", { _purchase_id: id })
        : await supabase.rpc("cancel_purchase", { _purchase_id: id });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.kind === "receive" ? "Received — stock updated" : "Purchase cancelled");
      qc.invalidateQueries({ queryKey: ["purchases"] }); qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!s.isStaff) return <Empty>You do not have access to purchases.</Empty>;

  const setLine = (i: number, k: keyof Line, v: string) => setForm((f) => f && { ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });
  const activeMats = (materials.data ?? []).filter((m) => m.is_active);
  const viewing = list.data?.find((p) => p.id === view);

  return (
    <>
      <PageHeader title="Purchases" subtitle="Stock only increases once a purchase is marked received." action={canWrite && (
        <Button onClick={() => setForm({ supplier_id: "", purchase_date: today(), reference: "", notes: "", lines: [{ material_id: "", qty: "", unit_cost: "" }] })}>New purchase</Button>
      )} />
      {list.data?.length === 0 ? <Empty>No purchases yet.</Empty> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Date</th><th className="p-3">Supplier</th><th className="p-3">Ref</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {list.data?.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">{fmtDate(p.purchase_date)}</td>
                  <td className="p-3 font-medium">{p.suppliers?.name}</td>
                  <td className="p-3">{p.reference ?? "—"}</td>
                  <td className="p-3 text-right">{naira(p.total)}</td>
                  <td className="p-3"><Badge variant={p.status === "received" ? "default" : p.status === "draft" ? "outline" : "secondary"} className="capitalize">{p.status}</Badge></td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setView(p.id)}>View</Button>
                    {canWrite && p.status === "draft" && (<>
                      <Button size="sm" onClick={() => confirm("Mark as received? Stock will increase and this cannot be undone.") && act.mutate({ id: p.id, kind: "receive" })}>Receive</Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm("Cancel this purchase?") && act.mutate({ id: p.id, kind: "cancel" })}>Cancel</Button>
                    </>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{viewing?.suppliers?.name} — {viewing && fmtDate(viewing.purchase_date)}</DialogTitle></DialogHeader>
          <ul className="divide-y text-sm">
            {viewing?.purchase_lines.map((l) => (
              <li key={l.id} className="flex justify-between py-2"><span>{l.materials?.name} × {Number(l.qty)} {l.materials?.unit}</span><span>{naira(Number(l.qty) * Number(l.unit_cost))}</span></li>
            ))}
          </ul>
          {viewing?.notes && <p className="text-sm text-muted-foreground">{viewing.notes}</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>New purchase</DialogTitle></DialogHeader>
          {form && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Supplier">
                  <select className={selectCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} required>
                    <option value="">Choose…</option>
                    {suppliers.data?.filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </Field>
                <Field label="Date"><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></Field>
                <Field label="Invoice / reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
                <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Items</div>
                {activeMats.length === 0 && <p className="text-sm text-muted-foreground">Add materials on the Raw honey & packaging page first.</p>}
                {form.lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5.5rem_7rem_auto] gap-2">
                    <select className={selectCls} value={l.material_id} onChange={(e) => setLine(i, "material_id", e.target.value)}>
                      <option value="">Material…</option>
                      {activeMats.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                    </select>
                    <Input type="number" step="any" min="0" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
                    <Input type="number" step="0.01" min="0" placeholder="₦ per unit" value={l.unit_cost} onChange={(e) => setLine(i, "unit_cost", e.target.value)} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}>✕</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, lines: [...form.lines, { material_id: "", qty: "", unit_cost: "" }] })}>Add item</Button>
              </div>
              <div className="text-right font-semibold">Total {naira(form.lines.reduce((a, l) => a + Number(l.qty || 0) * Number(l.unit_cost || 0), 0))}</div>
              <Button type="submit" disabled={save.isPending}>Save draft</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
