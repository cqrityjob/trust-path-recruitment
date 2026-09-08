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
import { getMySecurityCareerProfile } from "@/lib/security-career-profile/profile.functions";
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

/**
 * The reader's own stated CURRENT profession, for `pathFrom`.
 *
 * ── WHY THIS READ AND NOT ANOTHER ──────────────────────────────────────
 *
 * `security_career_profiles.current_profession_slug` is the canonical,
 * single-writer, USER-AUTHORED answer to "what do you do": the candidate
 * chooses it from the same profession picker their profile page offers, and
 * My Career prints it as their professional identity. Reusing it is right
 * precisely because it was authored for that purpose.
 *
 * `getMySecurityCareerProfile` is also the narrowest read that answers the
 * question — one row, five columns — rather than the whole professional
 * identity seam, which a public career page has no business assembling.
 *
 * It is NOT derived from Security Passport merits, employment history or
 * their absence. See career-origin.ts.
 *
 * A failed read yields `null`, which the surface treats as "no role stated"
 * and offers the selector. That is the correct failure here and not a
 * fail-open: nothing is claimed, and the reader can answer for themselves in
 * one click.
 */
export function useMyStatedProfession(signedIn: boolean | null): {
  readonly slug: string | null;
  readonly label: string | null;
} {
  const loadProfile = useServerFn(getMySecurityCareerProfile);
  const q = useQuery({
    queryKey: ["career-center", "career-profile", signedIn],
    queryFn: () => loadProfile(),
    enabled: signedIn === true,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  if (signedIn !== true || q.isPending || q.isError || !q.data) {
    return { slug: null, label: null };
  }
  return {
    slug: q.data.currentProfessionSlug ?? null,
    label: q.data.currentProfessionOther ?? null,
  };
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
  // `isLoading` alone is not enough. A query that has SETTLED without an error
  // and without data — a server function that resolved to null, a response the
  // client could not unwrap — leaves `isLoading` false, `isError` false and
  // `data` undefined. Testing only `isLoading` left that case rendering the
  // loading state forever, with no retry and no way for the reader to tell a
  // slow read from a broken one. Settled-and-empty fails closed.
  if (activeQ.isPending) return { signedIn, career: { state: "loading" }, refetch };
  // `== null` deliberately: the response can carry `null` as well as be
  // absent, and the original bug was a truthiness test that treated both as
  // "still loading". The handler's return type is non-nullable, so either
  // value means the response was malformed — a fault, not an absence.
  if (activeQ.data == null) {
    return { signedIn, career: deriveCareerDirection(undefined, { isError: true }), refetch };
  }

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
  // A read that did not answer. Never "you have no analysis".
  if (active.kind === "read_failed") {
    return { signedIn, career: deriveCareerDirection(undefined, { isError: true }), refetch };
  }

  if (storedQ.isError) {
    return { signedIn, career: deriveCareerDirection(undefined, { isError: true }), refetch };
  }
  // Same rule as above: pending is loading; settled-and-empty is a failure.
  // This is the case that hung: `!storedQ.data` was true for a completed read
  // that carried nothing, so the section rendered its loading state forever
  // with no retry and no way to tell a slow read from a broken one.
  if (storedQ.isPending) return { signedIn, career: { state: "loading" }, refetch };
  if (storedQ.data == null) {
    return { signedIn, career: deriveCareerDirection(undefined, { isError: true }), refetch };
  }

  return { signedIn, career: deriveCareerDirection(storedQ.data), refetch };
}
