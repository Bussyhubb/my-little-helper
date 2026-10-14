import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo } from "@/lib/session";
import { PageHeader, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Prisca Honey Business Manager" },
      { name: "description", content: "A permanent record of every change to business data." },
      { property: "og:title", content: "Audit log — Prisca Honey" },
      { property: "og:description", content: "A permanent record of every change to business data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Audit,
});

const PAGE = 25;

function Audit() {
  const s = useSessionInfo();
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["audit", page],
    enabled: s.isManager,
    queryFn: async () => {
      const [{ data, error }, { data: profs }] = await Promise.all([
        supabase.from("audit_logs").select("*").order("at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1),
        supabase.from("profiles").select("id,full_name,email"),
      ]);
      if (error) throw error;
      return { rows: data, names: Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name || p.email])) };
    },
  });
  if (!s.isManager) return <Empty>You do not have access to this page.</Empty>;
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every create, edit and role change, with who did it. Entries cannot be edited or deleted." />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Record</th></tr>
          </thead>
          <tbody>
            {q.data?.rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3 whitespace-nowrap">{new Date(r.at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}</td>
                <td className="p-3">{(r.user_id && q.data.names[r.user_id]) || "System"}</td>
                <td className="p-3">{r.action}</td>
                <td className="p-3 text-muted-foreground">{r.table_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={(q.data?.rows.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </>
  );
}
