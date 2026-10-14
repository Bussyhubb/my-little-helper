import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo } from "@/lib/session";
import { PageHeader } from "@/components/page";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Prisca Honey Business Manager" },
      { name: "description", content: "Overview of products, customers, suppliers and team." },
      { property: "og:title", content: "Dashboard — Prisca Honey" },
      { property: "og:description", content: "Overview of products, customers, suppliers and team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

async function count(table: "products" | "customers" | "suppliers") {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("is_active", true);
  return count ?? 0;
}

function Dashboard() {
  const s = useSessionInfo();
  const q = useQuery({
    queryKey: ["dash-counts", s.userId],
    queryFn: async () => ({
      products: await count("products"),
      customers: await count("customers"),
      suppliers: s.isStaff ? await count("suppliers") : null,
      team: s.isManager
        ? (await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true)).count ?? 0
        : null,
    }),
  });

  const cards = [
    { label: "Active products", value: q.data?.products, to: "/products" },
    { label: s.isManager ? "Customers" : "My customers", value: q.data?.customers, to: "/customers" },
    ...(q.data?.suppliers != null ? [{ label: "Suppliers", value: q.data.suppliers, to: "/suppliers" }] : []),
    ...(q.data?.team != null ? [{ label: "Active team members", value: q.data.team, to: "/team" }] : []),
  ] as { label: string; value?: number; to: "/products" | "/customers" | "/suppliers" | "/team" }[];

  return (
    <>
      <PageHeader title={`Hello, ${s.fullName.split(" ")[0]}`} subtitle="Prisca Household and Enterprise — Lagos" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="rounded-2xl border bg-card p-5 shadow-soft transition-transform hover:-translate-y-0.5">
            <div className="text-sm text-muted-foreground">{c.label}</div>
            <div className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold">{c.value ?? "–"}</div>
          </Link>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">What is ready</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Secure logins with owner and sales-agent roles, products with price history, suppliers, customers
          (agents see only their own) and an audit log. Purchasing, bottling, stock, sales, payments, commissions and
          profit reports are the next build phases, so sales and profit figures will appear here once those
          modules record real transactions.
        </p>
      </div>
    </>
  );
}
