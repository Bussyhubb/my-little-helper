import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "admin" | "agent" | "storekeeper" | "accountant" | "distributor";

export interface SessionInfo {
  userId: string;
  email: string | null;
  fullName: string;
  isActive: boolean;
  roles: AppRole[];
  isManager: boolean;
  isFinance: boolean;
  isStaff: boolean;
}

const Ctx = createContext<SessionInfo | null>(null);

export function useSessionInfo() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSessionInfo outside provider");
  return v;
}

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [info, setInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("full_name,is_active,email").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const roles = (roleRows ?? []).map((r) => r.role as AppRole);
      const isManager = roles.includes("owner") || roles.includes("admin");
      if (cancelled) return;
      setInfo({
        userId: u.user.id,
        email: profile?.email ?? u.user.email ?? null,
        fullName: profile?.full_name || u.user.email || "",
        isActive: profile?.is_active ?? false,
        roles,
        isManager,
        isFinance: isManager || roles.includes("accountant"),
        isStaff: isManager || roles.includes("storekeeper") || roles.includes("accountant"),
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return <>{fallback}</>;
  return <Ctx.Provider value={info}>{children}</Ctx.Provider>;
}

export const naira = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(Number(n ?? 0));

export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(d));
