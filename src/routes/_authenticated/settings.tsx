import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo } from "@/lib/session";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Prisca Honey Business Manager" },
      { name: "description", content: "Business details, invoice prefix and honey unit conversion." },
      { property: "og:title", content: "Settings — Prisca Honey" },
      { property: "og:description", content: "Business details, invoice prefix and honey unit conversion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("business_settings").select("*").single()).data,
  });
  const [f, setF] = useState({ business_name: "", brand_name: "", address: "", phone: "", email: "", invoice_prefix: "", honey_kg_to_litre: "" });
  useEffect(() => {
    if (q.data) setF({
      business_name: q.data.business_name, brand_name: q.data.brand_name, address: q.data.address ?? "",
      phone: q.data.phone ?? "", email: q.data.email ?? "", invoice_prefix: q.data.invoice_prefix, honey_kg_to_litre: String(q.data.honey_kg_to_litre),
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const ratio = Number(f.honey_kg_to_litre);
      if (!(ratio > 0)) throw new Error("Litres per kg must be above zero");
      const { error } = await supabase.from("business_settings").update({
        business_name: f.business_name, brand_name: f.brand_name, address: f.address || null, phone: f.phone || null,
        email: f.email || null, invoice_prefix: f.invoice_prefix, honey_kg_to_litre: ratio, updated_at: new Date().toISOString(),
      }).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (!s.isManager) return <Empty>You do not have access to this page.</Empty>;
  return (
    <>
      <PageHeader title="Settings" subtitle="Currency is Nigerian Naira (₦); timezone Africa/Lagos; dates DD/MM/YYYY." />
      <form className="grid max-w-2xl gap-3 rounded-2xl border bg-card p-6 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Business name"><Input value={f.business_name} onChange={set("business_name")} required /></Field>
        <Field label="Brand name"><Input value={f.brand_name} onChange={set("brand_name")} required /></Field>
        <Field label="Address"><Input value={f.address} onChange={set("address")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><Input value={f.email} onChange={set("email")} type="email" /></Field>
        <Field label="Invoice prefix"><Input value={f.invoice_prefix} onChange={set("invoice_prefix")} required /></Field>
        <Field label="Litres of honey per kg" hint="Used later to convert kg bought into bottled litres. Weigh your own honey to set this; it is not assumed to be 1.">
          <Input type="number" step="0.0001" min="0" value={f.honey_kg_to_litre} onChange={set("honey_kg_to_litre")} />
        </Field>
        <Button type="submit" className="sm:col-span-2" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</Button>
      </form>
    </>
  );
}
