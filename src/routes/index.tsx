import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prisca Honey Business Manager — sign in" },
      {
        name: "description",
        content: "Secure business manager for Prisca Honey: stock, sales, customers and commissions.",
      },
      { property: "og:title", content: "Prisca Honey Business Manager" },
      {
        property: "og:description",
        content: "Secure business manager for Prisca Honey: stock, sales, customers and commissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-honey px-6">
      <div className="max-w-md rounded-2xl bg-card p-10 text-center shadow-soft">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-honey text-2xl">🍯</div>
        <h1 className="text-3xl font-bold">Prisca Honey</h1>
        <p className="mt-1 text-sm uppercase tracking-widest text-muted-foreground">Business Manager</p>
        <p className="mt-5 text-muted-foreground">
          Products, suppliers, customers and your sales team, all in one secure place.
        </p>
        <Button asChild size="lg" className="mt-7 w-full">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
