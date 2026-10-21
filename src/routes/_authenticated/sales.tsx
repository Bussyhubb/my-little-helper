import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useSessionInfo, naira, fmtDate } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "./materials";
import { useLocations, useStockByLocation } from "./stock";
import { priceFor } from "@/lib/pricing";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales & payments — Prisca Honey Business Manager" },
      { name: "description", content: "Record honey sales, collect payments and track what customers owe." },
      { property: "og:title", content: "Sales & payments — Prisca Honey" },
      { property: "og:description", content: "Sales, payments and customer balances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sales,
});

type Method = Database["public"]["Enums"]["payment_method"];
const METHODS: { v: Method; l: string }[] = [{ v: "cash", l: "Cash" }, { v: "transfer", l: "Bank transfer" }, { v: "pos", l: "POS" }, { v: "other", l: "Other" }];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

interface Line { product_id: string; qty: string }
interface SForm { customer_id: string; location_id: string; date: string; discount: string; notes: string; lines: Line[]; pay: string; method: Method; ref: string }
interface PForm { sale_id: string; balance: number; amount: string; method: Method; ref: string; date: string }

function Sales() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const locs = useLocations();
  const stock = useStockByLocation();
  const [sf, setSf] = useState<SForm | null>(null);
  const [pf, setPf] = useState<PForm | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "owing">("all");

  const products = useQuery({
    queryKey: ["products-prices"],
    queryFn: async () => (await supabase.from("products").select("id,name,size_label,retail_price,wholesale_price,agent_price,is_active").eq("is_active", true).order("name")).data ?? [],
  });
  const customers = useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => (await supabase.from("customers").select("id,name,category,credit_limit").eq("is_active", true).order("name")).data ?? [],
  });
  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const [{ data, error }, { data: bal }] = await Promise.all([
        supabase.from("sales").select("*, customers(name), locations(name), sale_lines(id,qty,unit_price,line_total,products(name,size_label)), payments(*)")
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("sale_balances").select("*"),
      ]);
      if (error) throw error;
      const m = new Map((bal ?? []).map((b) => [b.sale_id, Number(b.balance ?? 0)]));
      return (data ?? []).map((x) => ({ ...x, balance: m.get(x.id) ?? 0 }));
    },
  });

  const refresh = () => ["sales", "stock-loc"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const post = useMutation({
    mutationFn: async (f: SForm) => {
      const lines = f.lines.filter((l) => l.product_id && Number(l.qty) > 0).map((l) => ({ product_id: l.product_id, qty: Number(l.qty) }));
      const { error } = await supabase.rpc("post_sale", {
        _customer_id: (f.customer_id || null) as string, _location_id: f.location_id, _sale_date: f.date, _discount: Number(f.discount || 0),
        _notes: f.notes, _lines: lines, _pay_amount: Number(f.pay || 0), _pay_method: f.method, _pay_ref: f.ref,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sale recorded"); setSf(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pay = useMutation({
    mutationFn: async (f: PForm) => {
      const { error } = await supabase.rpc("record_payment", { _sale_id: f.sale_id, _amount: Number(f.amount), _method: f.method, _ref: f.ref, _date: f.date });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); setPf(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reverseSale = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt("Why is this sale being reversed?");
      if (!reason) throw new Error("Reversal cancelled");
      const { error } = await supabase.rpc("reverse_sale", { _sale_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sale reversed — stock returned"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reversePay = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt("Why is this payment being reversed?");
      if (!reason) throw new Error("Reversal cancelled");
      const { error } = await supabase.rpc("reverse_payment", { _payment_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment reversed"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeLocs = (locs.data ?? []).filter((l) => l.is_active && (s.isManager || s.roles.includes("storekeeper") || l.agent_id === s.userId));
  const cust = customers.data?.find((c) => c.id === sf?.customer_id);
  const subtotal = sf ? sf.lines.reduce((t, l) => {
    const p = products.data?.find((x) => x.id === l.product_id);
    return t + (p ? priceFor(p, cust?.category ?? null) * Number(l.qty || 0) : 0);
  }, 0) : 0;
  const total = subtotal - Number(sf?.discount || 0);
  const setLine = (i: number, k: keyof Line, v: string) => setSf((f) => f && { ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  const list = (sales.data ?? []).filter((x) => filter === "all" || (x.status === "posted" && x.balance > 0));
  const owing = (sales.data ?? []).reduce((t, x) => t + (x.status === "posted" ? x.balance : 0), 0);

  return (
    <>
      <PageHeader title="Sales & payments" subtitle={`Outstanding from customers: ${naira(owing)}`}
        action={activeLocs.length > 0 && (
          <Button onClick={() => setSf({ customer_id: "", location_id: activeLocs[0].id, date: today(), discount: "", notes: "", lines: [{ product_id: "", qty: "" }], pay: "", method: "cash", ref: "" })}>New sale</Button>
        )} />

      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All sales</Button>
        <Button size="sm" variant={filter === "owing" ? "default" : "outline"} onClick={() => setFilter("owing")}>Still owing</Button>
      </div>

      {list.length === 0 ? <Empty>{sales.isLoading ? "Loading…" : "No sales yet."}</Empty> : (
        <div className="space-y-2">
          {list.map((x) => (
            <div key={x.id} className={`rounded-xl border bg-card ${x.status === "reversed" ? "opacity-60" : ""}`}>
              <button className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left" onClick={() => setOpen(open === x.id ? null : x.id)}>
                <div>
                  <div className="font-medium">#{x.sale_no} · {x.customers?.name ?? "Walk-in"}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(x.sale_date)} · {x.locations?.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{naira(x.total)}</div>
                  <div className={`text-xs ${x.status === "reversed" ? "text-muted-foreground" : x.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {x.status === "reversed" ? "Reversed" : x.balance > 0 ? `Owes ${naira(x.balance)}` : "Paid"}
                  </div>
                </div>
              </button>
              {open === x.id && (
                <div className="space-y-3 border-t p-4 text-sm">
                  {x.sale_lines.map((l) => (
                    <div key={l.id} className="flex justify-between"><span>{Number(l.qty)} × {l.products?.name} {l.products?.size_label} @ {naira(l.unit_price)}</span><span>{naira(l.line_total)}</span></div>
                  ))}
                  {Number(x.discount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>−{naira(x.discount)}</span></div>}
                  <div className="font-medium">Payments</div>
                  {x.payments.length === 0 && <div className="text-muted-foreground">None yet.</div>}
                  {x.payments.map((p) => (
                    <div key={p.id} className={`flex items-center justify-between gap-2 ${p.status === "reversed" ? "line-through opacity-60" : ""}`}>
                      <span>{fmtDate(p.paid_at)} · {METHODS.find((m) => m.v === p.method)?.l}{p.reference ? ` · ${p.reference}` : ""}</span>
                      <span className="flex items-center gap-2">{naira(p.amount)}
                        {s.isManager && p.status === "posted" && x.status === "posted" && <Button size="sm" variant="ghost" onClick={() => reversePay.mutate(p.id)}>Reverse</Button>}
                      </span>
                    </div>
                  ))}
                  {x.reverse_reason && <div className="text-muted-foreground">Reversed: {x.reverse_reason}</div>}
                  {x.status === "posted" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {x.balance > 0 && <Button size="sm" onClick={() => setPf({ sale_id: x.id, balance: x.balance, amount: String(x.balance), method: "cash", ref: "", date: today() })}>Record payment</Button>}
                      {s.isManager && <Button size="sm" variant="outline" onClick={() => reverseSale.mutate(x.id)}>Reverse sale</Button>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!sf} onOpenChange={(o) => !o && setSf(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New sale</DialogTitle></DialogHeader>
          {sf && (
            <div className="space-y-3">
              <Field label="Customer" hint="Price is set by the customer's category.">
                <select className={selectCls} value={sf.customer_id} onChange={(e) => setSf({ ...sf, customer_id: e.target.value })}>
                  <option value="">Walk-in (retail, pay in full)</option>
                  {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.category})</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sell from"><select className={selectCls} value={sf.location_id} onChange={(e) => setSf({ ...sf, location_id: e.target.value })}>
                  {activeLocs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
                <Field label="Date"><Input type="date" value={sf.date} onChange={(e) => setSf({ ...sf, date: e.target.value })} /></Field>
              </div>
              {sf.lines.map((l, i) => {
                const p = products.data?.find((x) => x.id === l.product_id);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select className={selectCls} value={l.product_id} onChange={(e) => setLine(i, "product_id", e.target.value)}>
                      <option value="">Product…</option>
                      {products.data?.map((pp) => <option key={pp.id} value={pp.id}>{pp.name} {pp.size_label} (have {stock.data?.get(`${sf.location_id}:${pp.id}`) ?? 0})</option>)}
                    </select>
                    <Input className="w-20" type="number" min="0" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
                    <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{p ? naira(priceFor(p, cust?.category ?? null)) : ""}</span>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setSf({ ...sf, lines: [...sf.lines, { product_id: "", qty: "" }] })}>Add product</Button>
              {s.isManager && <Field label="Discount (₦)"><Input type="number" min="0" value={sf.discount} onChange={(e) => setSf({ ...sf, discount: e.target.value })} /></Field>}
              <div className="rounded-lg bg-secondary p-3 text-sm"><div className="flex justify-between font-semibold"><span>Total</span><span>{naira(total)}</span></div></div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount paid now (₦)" hint="Less than total = credit"><Input type="number" min="0" value={sf.pay} onChange={(e) => setSf({ ...sf, pay: e.target.value })} /></Field>
                <Field label="Method"><select className={selectCls} value={sf.method} onChange={(e) => setSf({ ...sf, method: e.target.value as Method })}>
                  {METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></Field>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSf({ ...sf, pay: String(total) })}>Paid in full</Button>
              <Field label="Payment reference"><Input value={sf.ref} onChange={(e) => setSf({ ...sf, ref: e.target.value })} /></Field>
              <Field label="Notes"><Input value={sf.notes} onChange={(e) => setSf({ ...sf, notes: e.target.value })} /></Field>
              <Button className="w-full" disabled={post.isPending} onClick={() => post.mutate(sf)}>Record sale</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pf} onOpenChange={(o) => !o && setPf(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          {pf && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Balance owed: {naira(pf.balance)}</p>
              <Field label="Amount (₦)"><Input type="number" min="0" value={pf.amount} onChange={(e) => setPf({ ...pf, amount: e.target.value })} /></Field>
              <Field label="Method"><select className={selectCls} value={pf.method} onChange={(e) => setPf({ ...pf, method: e.target.value as Method })}>
                {METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></Field>
              <Field label="Date"><Input type="date" value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} /></Field>
              <Field label="Reference"><Input value={pf.ref} onChange={(e) => setPf({ ...pf, ref: e.target.value })} /></Field>
              <Button className="w-full" disabled={pay.isPending} onClick={() => pay.mutate(pf)}>Save payment</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
