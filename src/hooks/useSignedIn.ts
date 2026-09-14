/**
 * Is there a live Supabase session in this tab?
 *
 * Three states, and the third one matters: `null` means the client has not
 * answered yet. Treating "not yet known" as signed out is what makes a
 * personal panel paint on a public page and then vanish, and treating it as
 * signed in fires authenticated work on every anonymous page view.
 *
 * ── WHY A HOOK, AND WHY IT DOES NOT REPLACE THE OTHER TWO ──────────────
 *
 * The public landing page mounts UnifiedAuthPanel, which navigates a
 * signed-in visitor away to their workspace. That is right on /login and
 * wrong on /: it would eject somebody from the public homepage for the
 * offence of being logged in. So / must decide BEFORE mounting it.
 *
 * SiteHeader and useCareerProfileForJobs observe the session too and are
 * deliberately left alone: the header also reads the account's name and
 * email from the session, and the jobs hook uses the signal to gate a
 * server function and cache its result. Neither is a plain boolean, so
 * folding them in here would be a rewrite of two working surfaces rather
 * than a de-duplication. This hook is the boolean, for callers that only
 * need the boolean.
 *
 * Read-only. It observes auth state; it decides nothing and grants nothing.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SignedInState = boolean | null;

export function useSignedIn(): SignedInState {
  const [signedIn, setSignedIn] = useState<SignedInState>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) {
        setSignedIn(Boolean(session));
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
