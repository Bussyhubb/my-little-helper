import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo, naira } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/materials")({
  head: () => ({
    meta: [
      { title: "Raw honey & packaging — Prisca Honey Business Manager" },
      { name: "description", content: "Stock of raw honey, bottles, lids, labels and cartons." },
      { property: "og:title", content: "Raw honey & packaging — Prisca Honey" },
      { property: "og:description", content: "Stock of raw honey and packaging materials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Materials,
});

export const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type Kind = "raw_honey" | "packaging";
interface Form { id?: string; name: string; kind: Kind; unit: string; min_stock: string }
const blank: Form = { name: "", kind: "packaging", unit: "pcs", min_stock: "0" };

export function useMaterials(enabled = true) {
  return useQuery({
    queryKey: ["materials"],
    enabled,
    queryFn: async () => {
      const [{ data: m, error }, { data: st }] = await Promise.all([
        supabase.from("materials").select("*").order("kind").order("name"),
        supabase.from("material_stock").select("*"),
      ]);
      if (error) throw error;
      const map = new Map((st ?? []).map((r) => [r.material_id, Number(r.on_hand ?? 0)]));
      return (m ?? []).map((x) => ({ ...x, on_hand: map.get(x.id) ?? 0 }));
    },
  });
}

function Materials() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [adj, setAdj] = useState<{ id: string; name: string; qty: string; note: string } | null>(null);
  const list = useMaterials(s.isStaff);

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const row = { name: f.name.trim(), kind: f.kind, unit: f.unit.trim() || "pcs", min_stock: Number(f.min_stock) || 0 };
      if (!row.name) throw new Error("Name is required");
      const { error } = f.id ? await supabase.from("materials").update(row).eq("id", f.id) : await supabase.from("materials").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setForm(null); qc.invalidateQueries({ queryKey: ["materials"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const adjust = useMutation({
    mutationFn: async (a: NonNullable<typeof adj>) => {
      const { error } = await supabase.rpc("adjust_material_stock", { _material_id: a.id, _qty_change: Number(a.qty), _note: a.note });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Stock adjusted"); setAdj(null); qc.invalidateQueries({ queryKey: ["materials"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async (p: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("materials").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materials"] }),
  });

  if (!s.isStaff) return <Empty>You do not have access to materials.</Empty>;

  return (
    <>
      <PageHeader title="Raw honey & packaging" subtitle="Stock goes up when a purchase is received and down when you bottle." action={s.isManager && <Button onClick={() => setForm(blank)}>Add material</Button>} />
      {list.data?.length === 0 ? <Empty>No materials yet. Add raw honey, bottles, lids, labels and cartons.</Empty> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3 text-right">In stock</th><th className="p-3 text-right">Avg cost</th><th className="p-3">Status</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {list.data?.map((m) => {
                const low = m.on_hand <= Number(m.min_stock) && Number(m.min_stock) > 0;
                return (
                  <tr key={m.id} className="border-t">
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3">{m.kind === "raw_honey" ? "Raw honey" : "Packaging"}</td>
                    <td className="p-3 text-right">{m.on_hand.toLocaleString("en-GB")} {m.unit} {low && <Badge variant="destructive" className="ml-1">Low</Badge>}</td>
                    <td className="p-3 text-right">{naira(m.avg_cost)}/{m.unit}</td>
                    <td className="p-3"><Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {s.isManager && (<>
                        <Button size="sm" variant="ghost" onClick={() => setAdj({ id: m.id, name: m.name, qty: "", note: "" })}>Adjust</Button>
                        <Button size="sm" variant="ghost" onClick={() => setForm({ id: m.id, name: m.name, kind: m.kind, unit: m.unit, min_stock: String(m.min_stock) })}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate(m)}>{m.is_active ? "Deactivate" : "Activate"}</Button>
                      </>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? "Edit material" : "Add material"}</DialogTitle></DialogHeader>
          {form && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 500ml bottle" required /></Field>
              <Field label="Type">
                <select className={selectCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind, unit: e.target.value === "raw_honey" ? "kg" : form.unit })}>
                  <option value="raw_honey">Raw honey</option><option value="packaging">Packaging</option>
                </select>
              </Field>
              <Field label="Unit" hint="e.g. kg, litre, pcs"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
              <Field label="Low-stock warning level"><Input type="number" step="any" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></Field>
              <Button type="submit" disabled={save.isPending}>Save</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!adj} onOpenChange={(o) => !o && setAdj(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adjust stock — {adj?.name}</DialogTitle></DialogHeader>
          {adj && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); adjust.mutate(adj); }}>
              <Field label="Quantity change" hint="Use a minus sign for losses, e.g. -3. Use this for opening stock, counts, breakages."><Input type="number" step="any" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} required /></Field>
              <Field label="Reason"><Input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} required /></Field>
              <Button type="submit" disabled={adjust.isPending}>Record adjustment</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
