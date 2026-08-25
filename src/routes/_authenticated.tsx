import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

/** Which portal an unauthenticated arrival should be sent to.
 *
 *  ── WHY THIS IS NOT ALWAYS "CANDIDATE" ────────────────────────────────
 *
 *  The return path has always been preserved, so a signed-out person
 *  following an ORGANISATION invitation (/employer/join?org=..., a reviewer
 *  or colleague being brought into a workspace) did eventually get back to
 *  the invite. What they saw first was "Log in as a candidate" -- a portal
 *  for a different kind of account, with no indication that it had anything
 *  to do with the invitation they had just been sent. Several people will
 *  reasonably conclude the link is broken and stop there.
 *
 *  /admin already had this treatment (Phase H3.3). /employer now does too.
 *  Nothing about the organisation is disclosed by this: the intent is
 *  derived from the URL the person already has, it selects a login form and
 *  nothing else, and /auth's own contract is that intent chooses a
 *  destination and is never treated as a permission.
 *
 *  Everything outside /admin and /employer keeps the candidate default,
 *  exactly as before. */
function intentSearch(): { intent?: "admin" | "employer" } {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return { intent: "admin" };
  if (path.startsWith("/employer")) return { intent: "employer" };
  return {};
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
        navigate({
          to: "/auth",
          search: {
            // pathname + search: a bare pathname discards the query
            // string, which silently destroyed the Career Discovery
            // session uuid on every login round trip.
            redirect: window.location.pathname + window.location.search,
            ...intentSearch(),
          } as never,
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
        navigate({
          to: "/auth",
          search: {
            redirect: window.location.pathname + window.location.search,
            ...intentSearch(),
          } as never,
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
