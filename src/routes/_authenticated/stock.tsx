import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo, fmtDate } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "./materials";

export const Route = createFileRoute("/_authenticated/stock")({
  head: () => ({
    meta: [
      { title: "Stock & locations — Prisca Honey Business Manager" },
      { name: "description", content: "Finished bottles by location and stock transfers to agents." },
      { property: "og:title", content: "Stock & locations — Prisca Honey" },
      { property: "og:description", content: "Finished goods stock per location and transfers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Stock,
});

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("*").order("is_default", { ascending: false }).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useStockByLocation() {
  return useQuery({
    queryKey: ["stock-loc"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_stock_by_location").select("*");
      if (error) throw error;
      const m = new Map<string, number>();
      (data ?? []).forEach((r) => m.set(`${r.location_id}:${r.product_id}`, Number(r.on_hand ?? 0)));
      return m;
    },
  });
}

interface Line { product_id: string; qty: string }
interface TForm { from: string; to: string; date: string; notes: string; lines: Line[] }

function Stock() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const canMove = s.isManager || s.roles.includes("storekeeper");
  const locs = useLocations();
  const stock = useStockByLocation();
  const [tf, setTf] = useState<TForm | null>(null);
  const [lf, setLf] = useState<{ id?: string; name: string; agent_id: string; is_active: boolean } | null>(null);

  const products = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => (await supabase.from("products").select("id,name,size_label,is_active").order("name")).data ?? [],
  });
  const agents = useQuery({
    queryKey: ["agents"],
    enabled: s.isManager,
    queryFn: async () => {
      const { data: r } = await supabase.from("user_roles").select("user_id").in("role", ["agent", "distributor"]);
      const ids = [...new Set((r ?? []).map((x) => x.user_id))];
      if (!ids.length) return [];
      return (await supabase.from("profiles").select("id,full_name,email").in("id", ids)).data ?? [];
    },
  });
  const transfers = useQuery({
    queryKey: ["transfers"],
    enabled: s.isStaff,
    queryFn: async () => {
      const { data: t } = await supabase.from("stock_transfers").select("*").order("created_at", { ascending: false }).limit(50);
      const ids = (t ?? []).map((x) => x.id);
      const { data: led } = ids.length
        ? await supabase.from("product_ledger").select("ref_id,qty_change,products(name,size_label)").eq("ref_type", "transfer").gt("qty_change", 0).in("ref_id", ids)
        : { data: [] };
      return (t ?? []).map((x) => ({ ...x, items: (led ?? []).filter((l) => l.ref_id === x.id) }));
    },
  });

  const move = useMutation({
    mutationFn: async (f: TForm) => {
      const lines = f.lines.filter((l) => l.product_id && Number(l.qty) > 0).map((l) => ({ product_id: l.product_id, qty: Number(l.qty) }));
      const { error } = await supabase.rpc("transfer_stock", { _from: f.from, _to: f.to, _date: f.date, _notes: f.notes, _lines: lines });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Stock moved"); setTf(null); ["transfers", "stock-loc"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveLoc = useMutation({
    mutationFn: async (f: NonNullable<typeof lf>) => {
      if (!f.name.trim()) throw new Error("Enter a name");
      const row = { name: f.name.trim(), agent_id: f.agent_id || null, is_active: f.is_active };
      const { error } = f.id ? await supabase.from("locations").update(row).eq("id", f.id) : await supabase.from("locations").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Location saved"); setLf(null); qc.invalidateQueries({ queryKey: ["locations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeLocs = (locs.data ?? []).filter((l) => l.is_active);
  const activeProds = (products.data ?? []).filter((p) => p.is_active);
  const agentName = (id: string | null) => agents.data?.find((a) => a.id === id)?.full_name || agents.data?.find((a) => a.id === id)?.email || (id ? "Agent" : "");
  const locName = (id: string) => locs.data?.find((l) => l.id === id)?.name ?? "";
  const setLine = (i: number, k: keyof Line, v: string) => setTf((f) => f && { ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  return (
    <>
      <PageHeader
        title={s.isStaff ? "Stock & locations" : "My stock"}
        subtitle={s.isStaff ? "Finished bottles at the main store and with each agent." : "Bottles you are holding to sell."}
        action={<div className="flex gap-2">
          {s.isManager && <Button variant="outline" onClick={() => setLf({ name: "", agent_id: "", is_active: true })}>Add location</Button>}
          {canMove && <Button onClick={() => setTf({ from: activeLocs[0]?.id ?? "", to: "", date: today(), notes: "", lines: [{ product_id: "", qty: "" }] })}>Move stock</Button>}
        </div>}
      />

      {activeLocs.length === 0 ? <Empty>No stock location assigned to you yet. Ask the owner to set one up.</Empty> : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {(s.isManager ? locs.data ?? [] : activeLocs).map((l) => (
            <div key={l.id} className={`rounded-2xl border bg-card p-5 ${l.is_active ? "" : "opacity-60"}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{l.name}{l.is_default && <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">Main</span>}</div>
                  {l.agent_id && s.isManager && <div className="text-xs text-muted-foreground">Held by {agentName(l.agent_id)}</div>}
                </div>
                {s.isManager && !l.is_default && <Button size="sm" variant="ghost" onClick={() => setLf({ id: l.id, name: l.name, agent_id: l.agent_id ?? "", is_active: l.is_active })}>Edit</Button>}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {activeProds.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-1.5">{p.name} · {p.size_label}</td>
                      <td className="py-1.5 text-right font-semibold">{(stock.data?.get(`${l.id}:${p.id}`) ?? 0).toLocaleString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {s.isStaff && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Recent transfers</h2>
          {transfers.data?.length === 0 ? <Empty>No transfers yet.</Empty> : (
            <div className="space-y-2">
              {transfers.data?.map((t) => (
                <div key={t.id} className="rounded-xl border bg-card p-4 text-sm">
                  <div className="font-medium">{fmtDate(t.transfer_date)} · {locName(t.from_location)} → {locName(t.to_location)}</div>
                  <div className="text-muted-foreground">{t.items.map((i) => `${Number(i.qty_change)} × ${i.products?.name} ${i.products?.size_label}`).join(", ")}{t.notes ? ` — ${t.notes}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={!!tf} onOpenChange={(o) => !o && setTf(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Move stock</DialogTitle></DialogHeader>
          {tf && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="From"><select className={selectCls} value={tf.from} onChange={(e) => setTf({ ...tf, from: e.target.value })}>
                  <option value="">Choose…</option>{activeLocs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
                <Field label="To"><select className={selectCls} value={tf.to} onChange={(e) => setTf({ ...tf, to: e.target.value })}>
                  <option value="">Choose…</option>{activeLocs.filter((l) => l.id !== tf.from).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              </div>
              <Field label="Date"><Input type="date" value={tf.date} onChange={(e) => setTf({ ...tf, date: e.target.value })} /></Field>
              {tf.lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select className={selectCls} value={l.product_id} onChange={(e) => setLine(i, "product_id", e.target.value)}>
                    <option value="">Product…</option>
                    {activeProds.map((p) => <option key={p.id} value={p.id}>{p.name} {p.size_label} (have {stock.data?.get(`${tf.from}:${p.id}`) ?? 0})</option>)}
                  </select>
                  <Input className="w-24" type="number" min="0" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setTf({ ...tf, lines: [...tf.lines, { product_id: "", qty: "" }] })}>Add product</Button>
              <Field label="Notes"><Input value={tf.notes} onChange={(e) => setTf({ ...tf, notes: e.target.value })} /></Field>
              <Button className="w-full" disabled={move.isPending} onClick={() => move.mutate(tf)}>Move stock</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!lf} onOpenChange={(o) => !o && setLf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{lf?.id ? "Edit location" : "Add location"}</DialogTitle></DialogHeader>
          {lf && (
            <div className="space-y-3">
              <Field label="Name" hint="e.g. Ikeja van, or the agent's name"><Input value={lf.name} onChange={(e) => setLf({ ...lf, name: e.target.value })} /></Field>
              <Field label="Held by agent" hint="The agent can see and sell this stock.">
                <select className={selectCls} value={lf.agent_id} onChange={(e) => setLf({ ...lf, agent_id: e.target.value })}>
                  <option value="">No agent (store)</option>
                  {agents.data?.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lf.is_active} onChange={(e) => setLf({ ...lf, is_active: e.target.checked })} /> Active</label>
              <Button className="w-full" disabled={saveLoc.isPending} onClick={() => saveLoc.mutate(lf)}>Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
