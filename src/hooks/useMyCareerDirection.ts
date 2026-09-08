// The signed-in visitor's own career analysis, on a PUBLIC route.
//
// ── WHY A HOOK AND NOT A LOADER ────────────────────────────────────────
//
// `/career-center` is public, indexed and server-rendered. Its content must
// not depend on who is asking, or the same URL would serve different HTML to
// a crawler and to a reader, and the personal half would sit inside the
// cacheable shell.
//
// So the personal section is resolved on the CLIENT, after a live Supabase
// session has been observed — exactly the pattern `useCareerProfileForJobs`
// already uses to put a signed-in relevance panel on the public jobs pages.
// An anonymous visitor issues no authenticated request at all.
//
// ── TWO READS, BOTH ALREADY OWNED BY MY CAREER ─────────────────────────
//
// `getActiveCareerReport` decides WHICH report is current (v3 beats legacy,
// classified by its definition-version column). `getStoredDiscoveryReport`
// reads that snapshot under the caller's own RLS-scoped client.
// `deriveCareerDirection` turns it into the frozen career picture.
//
// All three already exist and are unchanged. This hook adds no server
// function, no query and no interpretation: it composes the same three steps
// My Career composes, so the Career Center cannot show a different top
// recommendation from the one on the candidate's own home page.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getActiveCareerReport,
  isRenderableDiscovery,
} from "@/lib/career-discovery/active-report.functions";
import { getStoredDiscoveryReport } from "@/lib/career-discovery/stored-report.functions";
import {
  deriveCareerDirection,
  type CareerDirection,
} from "@/lib/professional-identity/career-direction";

/**
 * Whether a live Supabase session exists in THIS browser.
 *
 * `null` until the first answer, which is the state that matters: defaulting
 * to `false` flashes the signed-out treatment at every signed-in reader on
 * every visit, and defaulting to `true` does the reverse. Public routes that
 * only need to pick the right entry point — not to read any personal data —
 * use this alone and issue no authenticated request at all.
 */
export function useSupabaseSessionFlag(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

export interface MyCareerDirectionState {
  /** `null` until the session has been observed. Drives the "loading" state
   *  rather than a default of `false`, which would flash the anonymous
   *  invitation at every signed-in reader on every visit. */
  readonly signedIn: boolean | null;
  readonly career: CareerDirection | undefined;
  readonly refetch: () => void;
}

export function useMyCareerDirection(): MyCareerDirectionState {
  const signedIn = useSupabaseSessionFlag();

  const loadActive = useServerFn(getActiveCareerReport);
  const activeQ = useQuery({
    queryKey: ["career-center", "active-report", signedIn],
    queryFn: () => loadActive({}),
    enabled: signedIn === true,
    staleTime: 60_000,
    // One retry, matching My Career. The default three with backoff leaves
    // the section a skeleton for about seven seconds after a failed read,
    // which reads as a permanently broken section to anyone waiting on it.
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const snapshotId = isRenderableDiscovery(activeQ.data) ? activeQ.data.snapshotId : null;
  const loadStored = useServerFn(getStoredDiscoveryReport);
  const storedQ = useQuery({
    queryKey: ["career-center", "stored-report", snapshotId],
    queryFn: () => loadStored({ data: { snapshotId: snapshotId! } }),
    enabled: Boolean(snapshotId),
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const refetch = () => {
    void activeQ.refetch();
    void storedQ.refetch();
  };

  if (signedIn !== true) return { signedIn, career: undefined, refetch };

  if (activeQ.isError) {
    return { signedIn, career: deriveCareerDirection(undefined, { isError: true }), refetch };
  }
  if (activeQ.isLoading) return { signedIn, career: { state: "loading" }, refetch };

  const active = activeQ.data;
  // No report at all, and a legacy v2.1 run, are genuinely different answers.
  // A candidate whose only assessment is legacy must never be told they have
  // not taken one, so the legacy kind is passed through as its own state
  // rather than collapsed into "none".
  if (!active || active.kind === "none") {
    return { signedIn, career: { state: "none" }, refetch };
  }
  if (active.kind === "legacy_v21") {
    return {
      signedIn,
      career: {
        state: "legacy",
        completedAt: active.completedAt,
        reportHref: `/security-career-assessment/report/${active.runId}`,
      },
      refetch,
    };
  }
  if (active.kind === "discovery_unreadable") {
    return {
      signedIn,
      career: { state: "unreadable", completedAt: active.generatedAt },
      refetch,
    };
  }

  if (storedQ.isError) {
    return { signedIn, career: deriveCareerDirection(undefined, { isError: true }), refetch };
  }
  if (storedQ.isLoading || !storedQ.data) {
    return { signedIn, career: { state: "loading" }, refetch };
  }

  return { signedIn, career: deriveCareerDirection(storedQ.data), refetch };
}
