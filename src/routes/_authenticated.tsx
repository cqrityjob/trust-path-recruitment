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
            // pathname + search: a bare pathname discards the query
            // string, which silently destroyed the Career Discovery
            // session uuid on every login round trip.
            redirect: window.location.pathname + window.location.search,
            ...(isAdminPath ? { intent: "admin" } : {}),
          } as any,
        });
      } else {
        setSignedIn(true);
      }
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSignedIn(!!session);
      // INITIAL_SESSION fires while the session is still being restored from
      // storage and can carry a null session for an already-signed-in user.
      // Redirecting on it bounced people out mid-navigation and threw away
      // their query string. getSession() above is the authority for the
      // first decision; this handler only reacts to a real sign-out.
      if (!session && event !== "INITIAL_SESSION") {
        const isAdminPath = window.location.pathname.startsWith("/admin");
        navigate({
          to: "/auth",
          search: {
            redirect: window.location.pathname + window.location.search,
            ...(isAdminPath ? { intent: "admin" } : {}),
          } as any,
        });
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
