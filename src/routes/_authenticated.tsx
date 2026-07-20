import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const session = data.session;
      if (!session) {
        // Phase H3.3 — an unauthenticated attempt at an /admin/* route
        // goes through /auth?intent=admin, landing on /admin/login
        // specifically rather than the candidate-oriented default;
        // every other authenticated route is completely unaffected.
        const isAdminPath = window.location.pathname.startsWith("/admin");
        navigate({
          to: "/auth",
          search: {
            redirect: window.location.pathname,
            ...(isAdminPath ? { intent: "admin" } : {}),
          } as any,
        });
      } else {
        setSignedIn(true);
      }
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
      if (!session) {
        const isAdminPath = window.location.pathname.startsWith("/admin");
        navigate({ to: "/auth", search: isAdminPath ? ({ intent: "admin" } as any) : undefined });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (!ready) {
    return (
      <SiteLayout>
        <Section>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </Section>
      </SiteLayout>
    );
  }
  if (!signedIn) return null;
  return <Outlet />;
}
