import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSessionInfo } from "@/lib/session";
import { createTeamMember, changeMemberRole, setMemberActive } from "@/lib/team.functions";
import { PageHeader, Field, Empty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & roles — Prisca Honey Business Manager" },
      { name: "description", content: "Create sales agent logins, assign roles and deactivate users." },
      { property: "og:title", content: "Team & roles — Prisca Honey" },
      { property: "og:description", content: "Create sales agent logins, assign roles and deactivate users." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Team,
});

const roles = ["agent", "distributor", "storekeeper", "accountant", "admin"] as const;
type R = (typeof roles)[number];

function Team() {
  const s = useSessionInfo();
  const qc = useQueryClient();
  const create = useServerFn(createTeamMember);
  const changeRole = useServerFn(changeMemberRole);
  const setActive = useServerFn(setMemberActive);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: "", email: "", phone: "", password: "", role: "agent" as R });

  const list = useQuery({
    queryKey: ["team"],
    enabled: s.isManager,
    queryFn: async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return (p ?? []).map((x) => ({ ...x, role: (r ?? []).find((y) => y.user_id === x.id)?.role ?? null }));
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });

  const add = useMutation({
    mutationFn: () => create({ data: f }),
    onSuccess: () => { toast.success("Login created. Share the email and password with them."); setOpen(false); setF({ fullName: "", email: "", phone: "", password: "", role: "agent" }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: R }) => changeRole({ data: v }),
    onSuccess: () => { toast.success("Role updated"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const activeMut = useMutation({
    mutationFn: (v: { userId: string; active: boolean }) => setActive({ data: v }),
    onSuccess: () => { toast.success("Updated"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const isOwner = s.roles.includes("owner");

  if (!s.isManager) return <Empty>You do not have access to this page.</Empty>;

  return (
    <>
      <PageHeader title="Team & roles" subtitle="Create a login for each sales agent. Agents only ever see their own customers." action={<Button onClick={() => setOpen(true)}>Create user</Button>} />
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {list.data?.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-medium">{u.full_name || "—"}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  {u.role === "owner" || !isOwner ? (
                    <Badge className="capitalize">{u.role ?? "no role"}</Badge>
                  ) : (
                    <select className="h-8 rounded-md border border-input bg-background px-2 text-sm capitalize" value={u.role ?? ""}
                      onChange={(e) => roleMut.mutate({ userId: u.id, role: e.target.value as R })}>
                      {!u.role && <option value="">no role</option>}
                      {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </td>
                <td className="p-3"><Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? "Active" : "Deactivated"}</Badge></td>
                <td className="p-3 text-right">
                  {u.role !== "owner" && u.id !== s.userId && (
                    <Button size="sm" variant="ghost" onClick={() => confirm(u.is_active ? "Deactivate this user? They will be locked out." : "Reactivate this user?") && activeMut.mutate({ userId: u.id, active: !u.is_active })}>
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <Field label="Full name"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></Field>
            <Field label="Email (used to sign in)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Temporary password" hint="At least 8 characters. Share it privately."><Input type="text" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
            <Field label="Role">
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm capitalize" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as R })}>
                {roles.filter((r) => r !== "admin" || isOwner).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Button type="submit" disabled={add.isPending}>{add.isPending ? "Creating…" : "Create login"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
