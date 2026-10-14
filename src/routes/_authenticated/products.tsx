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

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products — Prisca Honey Business Manager" },
      { name: "description", content: "Honey products, sizes, prices and stock levels." },
      { property: "og:title", content: "Products — Prisca Honey" },
      { property: "og:description", content: "Honey products, sizes, prices and stock levels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Products,
});

interface Form {
  id?: string;
  name: string; sku: string; size_label: string; unit: string; barcode: string;
  retail_price: string; wholesale_price: string; agent_price: string;
  production_cost: string; min_stock: string; reorder_qty: string; packaging_notes: string;
}
const blank: Form = {
  name: "Prisca Honey", sku: "", size_label: "", unit: "ml", barcode: "",
  retail_price: "0", wholesale_price: "0", agent_price: "0",
  production_cost: "0", min_stock: "0", reorder_qty: "0", packaging_notes: "",
};

function Products() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [search, setSearch] = useState("");

  const list = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name").order("size_label");
      if (error) throw error;
      return data;
    },
  });
  const costs = useQuery({
    queryKey: ["product-costs"],
    enabled: s.isFinance,
    queryFn: async () => {
      const { data } = await supabase.from("product_costs").select("*");
      return Object.fromEntries((data ?? []).map((c) => [c.product_id, Number(c.production_cost)]));
    },
  });

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const row = {
        name: f.name.trim(), sku: f.sku.trim(), size_label: f.size_label.trim(), unit: f.unit.trim(),
        barcode: f.barcode.trim() || null, retail_price: Number(f.retail_price),
        wholesale_price: Number(f.wholesale_price), agent_price: Number(f.agent_price),
        min_stock: Number(f.min_stock), reorder_qty: Number(f.reorder_qty),
        packaging_notes: f.packaging_notes.trim() || null,
      };
      if (!row.name || !row.sku || !row.size_label) throw new Error("Name, SKU and size are required");
      let id = f.id;
      if (id) {
        const { error } = await supabase.from("products").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(row).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const { error: ce } = await supabase.from("product_costs").upsert({ product_id: id!, production_cost: Number(f.production_cost), updated_at: new Date().toISOString() });
      if (ce) throw ce;
    },
    onSuccess: () => {
      toast.success("Product saved");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-costs"] });
    },
    onError: (e: Error) => toast.error(e.message.includes("products_sku_key") ? "That SKU is already in use" : e.message),
  });

  const toggle = useMutation({
    mutationFn: async (p: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const starters = useMutation({
    mutationFn: async () => {
      const rows = [
        { size_label: "24g", unit: "g", sku: "PH-24G" },
        { size_label: "250ml", unit: "ml", sku: "PH-250ML" },
        { size_label: "500ml", unit: "ml", sku: "PH-500ML" },
        { size_label: "1 litre", unit: "L", sku: "PH-1L" },
      ].map((r) => ({ ...r, name: "Prisca Honey" }));
      const { error } = await supabase.from("products").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sizes added. Now set your real prices."); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (list.data ?? []).filter((p) => `${p.name} ${p.sku} ${p.size_label}`.toLowerCase().includes(search.toLowerCase()));
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Sizes, selling prices and stock levels. Price changes are kept in history."
        action={s.isManager && <Button onClick={() => setForm(blank)}>Add product</Button>}
      />
      <Input className="mb-4 max-w-sm" placeholder="Search by name, SKU or size" value={search} onChange={(e) => setSearch(e.target.value)} />
      {list.data?.length === 0 ? (
        <Empty>
          No products yet.
          {s.isManager && (
            <div className="mt-3">
              <Button variant="secondary" onClick={() => starters.mutate()} disabled={starters.isPending}>
                Add 24g, 250ml, 500ml and 1 litre (prices at ₦0 until you set them)
              </Button>
            </div>
          )}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Product</th><th className="p-3">SKU</th>
                <th className="p-3 text-right">Retail</th><th className="p-3 text-right">Wholesale</th><th className="p-3 text-right">Agent</th>
                {s.isFinance && <th className="p-3 text-right">Prod. cost</th>}
                <th className="p-3 text-right">Min stock</th><th className="p-3">Status</th><th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">{p.name} <span className="text-muted-foreground">{p.size_label}</span></td>
                  <td className="p-3">{p.sku}</td>
                  <td className="p-3 text-right">{naira(p.retail_price)}</td>
                  <td className="p-3 text-right">{naira(p.wholesale_price)}</td>
                  <td className="p-3 text-right">{naira(p.agent_price)}</td>
                  {s.isFinance && <td className="p-3 text-right">{naira(costs.data?.[p.id])}</td>}
                  <td className="p-3 text-right">{Number(p.min_stock)}</td>
                  <td className="p-3"><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge></td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {s.isManager && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setForm({
                          id: p.id, name: p.name, sku: p.sku, size_label: p.size_label, unit: p.unit, barcode: p.barcode ?? "",
                          retail_price: String(p.retail_price), wholesale_price: String(p.wholesale_price), agent_price: String(p.agent_price),
                          production_cost: String(costs.data?.[p.id] ?? 0), min_stock: String(p.min_stock), reorder_qty: String(p.reorder_qty),
                          packaging_notes: p.packaging_notes ?? "",
                        })}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (confirm(p.is_active ? "Deactivate this product? History is kept." : "Reactivate this product?")) toggle.mutate(p);
                        }}>{p.is_active ? "Deactivate" : "Activate"}</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? "Edit product" : "Add product"}</DialogTitle></DialogHeader>
          {form && (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
              <Field label="Product name"><Input value={form.name} onChange={set("name")} required /></Field>
              <Field label="SKU" hint="A short unique code"><Input value={form.sku} onChange={set("sku")} required /></Field>
              <Field label="Size"><Input value={form.size_label} onChange={set("size_label")} placeholder="e.g. 500ml" required /></Field>
              <Field label="Unit"><Input value={form.unit} onChange={set("unit")} /></Field>
              <Field label="Barcode (optional)"><Input value={form.barcode} onChange={set("barcode")} /></Field>
              <Field label="Retail price (₦)"><Input type="number" min="0" step="0.01" value={form.retail_price} onChange={set("retail_price")} /></Field>
              <Field label="Wholesale price (₦)"><Input type="number" min="0" step="0.01" value={form.wholesale_price} onChange={set("wholesale_price")} /></Field>
              <Field label="Agent price (₦)" hint="Approved selling price for agents"><Input type="number" min="0" step="0.01" value={form.agent_price} onChange={set("agent_price")} /></Field>
              <Field label="Production cost (₦)" hint="Visible to owner and accountant only"><Input type="number" min="0" step="0.01" value={form.production_cost} onChange={set("production_cost")} /></Field>
              <Field label="Minimum stock"><Input type="number" min="0" value={form.min_stock} onChange={set("min_stock")} /></Field>
              <Field label="Reorder quantity"><Input type="number" min="0" value={form.reorder_qty} onChange={set("reorder_qty")} /></Field>
              <Field label="Packaging notes"><Input value={form.packaging_notes} onChange={set("packaging_notes")} /></Field>
              <Button type="submit" className="sm:col-span-2" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save product"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
