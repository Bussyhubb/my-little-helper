import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutDashboard, Package, Truck, Users, UserCog, Settings, LogOut, Menu, ScrollText, Boxes, ShoppingCart, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SessionProvider, useSessionInfo } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

function Shell() {
  return (
    <SessionProvider fallback={<div className="p-10 text-muted-foreground">Loading…</div>}>
      <Gate />
    </SessionProvider>
  );
}

function Gate() {
  const s = useSessionInfo();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!s.isActive || s.roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl bg-card p-8 text-center shadow-soft">
          <h1 className="text-xl font-bold">{s.isActive ? "Awaiting access" : "Account deactivated"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {s.isActive
              ? "Your account has no role yet. Ask the business owner to assign one."
              : "This account has been deactivated. Please contact the business owner."}
          </p>
          <Button className="mt-5" variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  const links = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/products", label: "Products", icon: Package, show: true },
    { to: "/customers", label: "Customers", icon: Users, show: true },
    { to: "/suppliers", label: "Suppliers", icon: Truck, show: s.isStaff },
    { to: "/materials", label: "Honey & packaging", icon: Boxes, show: s.isStaff },
    { to: "/purchases", label: "Purchases", icon: ShoppingCart, show: s.isStaff },
    { to: "/bottling", label: "Bottling", icon: FlaskConical, show: s.isStaff },
    { to: "/team", label: "Team & roles", icon: UserCog, show: s.isManager },
    { to: "/audit", label: "Audit log", icon: ScrollText, show: s.isManager },
    { to: "/settings", label: "Settings", icon: Settings, show: s.isManager },
  ] as const;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {links.filter((l) => l.show).map((l) => (
        <Link
          key={l.to}
          to={l.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-primary !text-sidebar-primary-foreground hover:bg-sidebar-primary" }}
        >
          <l.icon className="size-4" />
          {l.label}
        </Link>
      ))}
    </nav>
  );

  const brand = (
    <div className="mb-6 flex items-center gap-2 px-1">
      <span className="flex size-9 items-center justify-center rounded-full bg-honey">🍯</span>
      <div className="leading-tight">
        <div className="font-[family-name:var(--font-display)] text-lg font-bold text-sidebar-foreground">Prisca Honey</div>
        <div className="text-[11px] uppercase tracking-widest text-sidebar-foreground/60">Business Manager</div>
      </div>
    </div>
  );

  const user = (
    <div className="mt-4 border-t border-sidebar-border pt-4">
      <div className="truncate px-1 text-sm font-medium text-sidebar-foreground">{s.fullName}</div>
      <div className="px-1 pb-2 text-xs capitalize text-sidebar-foreground/60">{s.roles.join(", ")}</div>
      <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 md:flex">
        {brand}{nav}{user}
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between bg-sidebar px-4 py-3 md:hidden">
        <span className="font-[family-name:var(--font-display)] text-lg font-bold text-sidebar-foreground">🍯 Prisca Honey</span>
        <Button variant="ghost" size="icon" className="text-sidebar-foreground" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-72 flex-col border-sidebar-border bg-sidebar p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {brand}{nav}{user}
        </SheetContent>
      </Sheet>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
