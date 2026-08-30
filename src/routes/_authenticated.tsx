import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

/** ── ONE DOOR ──────────────────────────────────────────────────────────
 *
 *  This used to derive a portal "intent" from the pathname, so that a
 *  signed-out person following an organisation invitation was not shown a
 *  form headed "Log in as a candidate" — a portal for a different kind of
 *  account, with nothing to connect it to the invitation they had just been
 *  sent. Several people would reasonably conclude the link was broken.
 *
 *  The unified entrance removes the problem rather than steering around it:
 *  there is one sign-in form, it belongs to everybody, and no arrival has to
 *  be classified before it can be shown. See
 *  docs/architecture/adr-unified-account-and-professional-identity.md.
 *
 *  The return path is still preserved exactly as before — pathname AND
 *  search, because a bare pathname discards the query string, which silently
 *  destroyed the Career Discovery session uuid on every login round trip.
 */
function returnSearch(): { redirect: string } {
  return { redirect: window.location.pathname + window.location.search };
}

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
        navigate({ to: "/login", search: returnSearch() as never });
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
        navigate({ to: "/login", search: returnSearch() as never });
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
