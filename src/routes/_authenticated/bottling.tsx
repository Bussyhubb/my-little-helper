import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo, naira, fmtDate } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMaterials, selectCls } from "./materials";

export const Route = createFileRoute("/_authenticated/bottling")({
  head: () => ({
    meta: [
      { title: "Bottling — Prisca Honey Business Manager" },
      { name: "description", content: "Turn raw honey and packaging into finished bottles." },
      { property: "og:title", content: "Bottling — Prisca Honey" },
      { property: "og:description", content: "Bottling runs and finished goods stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Bottling,
});

interface Input_ { material_id: string; qty: string }
interface Form { product_id: string; qty: string; run_date: string; notes: string; inputs: Input_[] }
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function Bottling() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const canWrite = s.isManager || s.roles.includes("storekeeper");
  const [form, setForm] = useState<Form | null>(null);
  const materials = useMaterials(s.isStaff);

  const products = useQuery({
    queryKey: ["products-stock"],
    enabled: s.isStaff,
    queryFn: async () => {
      const [{ data: p }, { data: st }] = await Promise.all([
        supabase.from("products").select("id,name,size_label,is_active,min_stock").order("name"),
        supabase.from("product_stock").select("*"),
      ]);
      const map = new Map((st ?? []).map((r) => [r.product_id, Number(r.on_hand ?? 0)]));
      return (p ?? []).map((x) => ({ ...x, on_hand: map.get(x.id) ?? 0 }));
    },
  });
  const runs = useQuery({
    queryKey: ["bottling"],
    enabled: s.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("bottling_runs")
        .select("*, products(name,size_label), bottling_inputs(id, qty, materials(name,unit))")
        .order("run_date", { ascending: false }).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const post = useMutation({
    mutationFn: async (f: Form) => {
      const inputs = f.inputs.filter((i) => i.material_id && Number(i.qty) > 0).map((i) => ({ material_id: i.material_id, qty: Number(i.qty) }));
      if (!f.product_id) throw new Error("Choose a product");
      const { error } = await supabase.rpc("post_bottling", { _product_id: f.product_id, _qty: Number(f.qty), _run_date: f.run_date, _notes: f.notes, _inputs: inputs });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bottling recorded — stock updated"); setForm(null);
      ["bottling", "materials", "products-stock"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!s.isStaff) return <Empty>You do not have access to bottling.</Empty>;

  const activeMats = (materials.data ?? []).filter((m) => m.is_active);
  const setIn = (i: number, k: keyof Input_, v: string) => setForm((f) => f && { ...f, inputs: f.inputs.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  return (
    <>
      <PageHeader title="Bottling" subtitle="Uses up raw honey and packaging, adds finished bottles at weighted average cost." action={canWrite && (
        <Button onClick={() => setForm({ product_id: "", qty: "", run_date: today(), notes: "", inputs: [{ material_id: "", qty: "" }] })}>Record bottling</Button>
      )} />

      <h2 className="mb-3 text-lg font-semibold">Finished goods in stock</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {products.data?.filter((p) => p.is_active).map((p) => (
          <div key={p.id} className="rounded-2xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">{p.name} · {p.size_label}</div>
            <div className={`text-2xl font-bold ${Number(p.min_stock) > 0 && p.on_hand <= Number(p.min_stock) ? "text-destructive" : ""}`}>{p.on_hand.toLocaleString("en-GB")}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Bottling history</h2>
      {runs.data?.length === 0 ? <Empty>No bottling recorded yet.</Empty> : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">Date</th><th className="p-3">Product</th><th className="p-3 text-right">Qty</th><th className="p-3">Materials used</th><th className="p-3 text-right">Cost/unit</th><th className="p-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {runs.data?.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3">{fmtDate(r.run_date)}</td>
                  <td className="p-3 font-medium">{r.products?.name} {r.products?.size_label}</td>
                  <td className="p-3 text-right">{Number(r.qty_produced)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.bottling_inputs.map((i) => `${i.materials?.name} ${Number(i.qty)}${i.materials?.unit}`).join(", ")}</td>
                  <td className="p-3 text-right">{naira(r.unit_cost)}</td>
                  <td className="p-3 text-right">{naira(r.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Record bottling</DialogTitle></DialogHeader>
          {form && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (confirm("Post this bottling? Stock will change and it cannot be edited.")) post.mutate(form); }}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Product made">
                  <select className={selectCls} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} required>
                    <option value="">Choose…</option>
                    {products.data?.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} {p.size_label}</option>)}
                  </select>
                </Field>
                <Field label="Bottles produced"><Input type="number" min="1" step="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} required /></Field>
                <Field label="Date"><Input type="date" value={form.run_date} onChange={(e) => setForm({ ...form, run_date: e.target.value })} /></Field>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Materials used</div>
                {form.inputs.map((x, i) => {
                  const m = activeMats.find((a) => a.id === x.material_id);
                  return (
                    <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                      <select className={selectCls} value={x.material_id} onChange={(e) => setIn(i, "material_id", e.target.value)}>
                        <option value="">Material…</option>
                        {activeMats.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.on_hand} {a.unit} left</option>)}
                      </select>
                      <Input type="number" step="any" min="0" placeholder={m?.unit ?? "Qty"} value={x.qty} onChange={(e) => setIn(i, "qty", e.target.value)} />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, inputs: form.inputs.filter((_, j) => j !== i) })}>✕</Button>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, inputs: [...form.inputs, { material_id: "", qty: "" }] })}>Add material</Button>
              </div>
              <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              <Button type="submit" disabled={post.isPending}>Post bottling</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
