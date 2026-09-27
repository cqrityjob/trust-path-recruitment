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
import { getProfessionDetails } from "@/lib/career-discovery/profession-detail.functions";
import { getMySecurityCareerProfile } from "@/lib/security-career-profile/profile.functions";
import {
  deriveCareerDirection,
  type CareerDirection,
} from "@/lib/professional-identity/career-direction";
import { careerCenterKeys } from "@/lib/career-center/personal-cache";
import {
  isWellFormedCigSlug,
  publishedProfessionFromAnySlug,
} from "@/lib/career-center/profession-links";

/** Who is signed in in THIS browser, as far as the page has observed.
 *
 *  `signedIn` is `null` until the first answer, which is the state that
 *  matters: defaulting to `false` flashes the signed-out treatment at every
 *  signed-in reader on every visit, and defaulting to `true` does the
 *  reverse. `userId` is what personal reads are keyed on — see
 *  personal-cache.ts for why a boolean is not enough. */
export interface SupabaseSessionState {
  readonly signedIn: boolean | null;
  readonly userId: string | null;
}

export function useSupabaseSession(): SupabaseSessionState {
  const [state, setState] = useState<SupabaseSessionState>({ signedIn: null, userId: null });
  useEffect(() => {
    let alive = true;
    // An auth event that arrives before getSession() resolves is newer than
    // it; the late getSession() answer must not overwrite it.
    let sawEvent = false;
    const apply = (userId: string | null) => {
      if (!alive) return;
      setState((prev) =>
        prev.signedIn === Boolean(userId) && prev.userId === userId
          ? prev
          : { signedIn: Boolean(userId), userId },
      );
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (!sawEvent) apply(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      sawEvent = true;
      apply(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return state;
}

/**
 * Whether a live Supabase session exists in THIS browser. Public routes that
 * only need to pick the right entry point — not to read any personal data —
 * use this alone and issue no authenticated request at all.
 */
export function useSupabaseSessionFlag(): boolean | null {
  return useSupabaseSession().signedIn;
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
 * It is NOT derived from Security Passport merits, employment history or
 * their absence. See career-origin.ts.
 *
 * ── A SAVED ROLE WITHOUT A GUIDE IS STILL A SAVED ROLE ─────────────────
 *
 * The profile stores a CIG slug, and the catalogue has more CIG professions
 * than published guides (Larmoperatör, Polis, SOC-analytiker…). For those,
 * the catalogue's OWN title is read, so the page can name the role the
 * person saved instead of printing a slug or silently dropping it — and can
 * link to the reviewed catalogue page for exactly that role.
 *
 * A failed read is reported as `error`, which the surface renders as its
 * own state: "we could not read your profile" is not "you have not said".
 */
export interface StatedProfession {
  readonly status: "anonymous" | "loading" | "ready" | "error";
  readonly slug: string | null;
  /** Free text the person typed because their role was not listed. */
  readonly otherLabel: string | null;
  /** The catalogue's title for `slug`, when it has no published guide. */
  readonly catalogueTitleSv: string | null;
  readonly catalogueTitleEn: string | null;
  readonly refetch: () => void;
}

export function useMyStatedProfession(session: SupabaseSessionState): StatedProfession {
  const loadProfile = useServerFn(getMySecurityCareerProfile);
  const userId = session.signedIn === true ? session.userId : null;
  const q = useQuery({
    queryKey: careerCenterKeys.statedProfession(userId ?? "anonymous"),
    queryFn: () => loadProfile(),
    enabled: userId !== null,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const slug = userId && q.data ? (q.data.currentProfessionSlug ?? null) : null;
  // Only a slug with no published guide needs the catalogue's title.
  const needsTitle = isWellFormedCigSlug(slug) && !publishedProfessionFromAnySlug(slug);
  const loadDetails = useServerFn(getProfessionDetails);
  const titleQ = useQuery({
    queryKey: ["career-center", "catalogue-title", slug],
    queryFn: () => loadDetails({ data: { slugs: [slug as string] } }),
    enabled: needsTitle,
    staleTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const detail = needsTitle && slug ? titleQ.data?.[slug] : undefined;

  const refetch = () => {
    void q.refetch();
  };
  const empty = { slug: null, otherLabel: null, catalogueTitleSv: null, catalogueTitleEn: null };
  if (session.signedIn === false) return { status: "anonymous", ...empty, refetch };
  if (session.signedIn === null || !userId || q.isPending) {
    return { status: "loading", ...empty, refetch };
  }
  if (q.isError) return { status: "error", ...empty, refetch };
  return {
    status: "ready",
    slug,
    otherLabel: q.data?.currentProfessionOther?.trim() || null,
    catalogueTitleSv: detail?.titleSv ?? null,
    catalogueTitleEn: detail?.titleEn ?? null,
    refetch,
  };
}

export interface MyCareerDirectionState {
  /** `null` until the session has been observed. Drives the "loading" state
   *  rather than a default of `false`, which would flash the anonymous
   *  invitation at every signed-in reader on every visit. */
  readonly signedIn: boolean | null;
  readonly userId: string | null;
  readonly career: CareerDirection | undefined;
  readonly refetch: () => void;
}

export function useMyCareerDirection(session?: SupabaseSessionState): MyCareerDirectionState {
  const own = useSupabaseSession();
  const { signedIn, userId } = session ?? own;
  const accountId = signedIn === true ? userId : null;

  const loadActive = useServerFn(getActiveCareerReport);
  const activeQ = useQuery({
    queryKey: careerCenterKeys.activeReport(accountId ?? "anonymous"),
    queryFn: () => loadActive({}),
    // No request at all until a specific account has been observed.
    enabled: accountId !== null,
    staleTime: 60_000,
    // One retry, matching My Career. The default three with backoff leaves
    // the section a skeleton for about seven seconds after a failed read,
    // which reads as a permanently broken section to anyone waiting on it.
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const snapshotId =
    accountId && isRenderableDiscovery(activeQ.data) ? activeQ.data.snapshotId : null;
  const loadStored = useServerFn(getStoredDiscoveryReport);
  const storedQ = useQuery({
    queryKey: careerCenterKeys.storedReport(accountId ?? "anonymous", snapshotId),
    queryFn: () => loadStored({ data: { snapshotId: snapshotId! } }),
    enabled: Boolean(accountId && snapshotId),
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const refetch = () => {
    void activeQ.refetch();
    if (snapshotId) void storedQ.refetch();
  };

  if (signedIn !== true || !accountId) {
    return { signedIn, userId: null, career: undefined, refetch };
  }
  const base = { signedIn, userId: accountId, refetch } as const;

  if (activeQ.isError) {
    return { ...base, career: deriveCareerDirection(undefined, { isError: true }) };
  }
  // `isLoading` alone is not enough. A query that has SETTLED without an error
  // and without data — a server function that resolved to null, a response the
  // client could not unwrap — leaves `isLoading` false, `isError` false and
  // `data` undefined. Testing only `isLoading` left that case rendering the
  // loading state forever, with no retry and no way for the reader to tell a
  // slow read from a broken one. Settled-and-empty fails closed.
  if (activeQ.isPending) return { ...base, career: { state: "loading" } };
  // `== null` deliberately: the response can carry `null` as well as be
  // absent, and the original bug was a truthiness test that treated both as
  // "still loading". The handler's return type is non-nullable, so either
  // value means the response was malformed — a fault, not an absence.
  if (activeQ.data == null) {
    return { ...base, career: deriveCareerDirection(undefined, { isError: true }) };
  }

  const active = activeQ.data;
  // No report at all, and a legacy v2.1 run, are genuinely different answers.
  // A candidate whose only assessment is legacy must never be told they have
  // not taken one, so the legacy kind is passed through as its own state
  // rather than collapsed into "none".
  if (!active || active.kind === "none") {
    return { ...base, career: { state: "none" } };
  }
  if (active.kind === "legacy_v21") {
    return {
      ...base,
      career: {
        state: "legacy",
        completedAt: active.completedAt,
        reportHref: `/security-career-assessment/report/${active.runId}`,
      },
    };
  }
  if (active.kind === "discovery_unreadable") {
    return { ...base, career: { state: "unreadable", completedAt: active.generatedAt } };
  }
  // A read that did not answer. Never "you have no analysis".
  if (active.kind === "read_failed") {
    return { ...base, career: deriveCareerDirection(undefined, { isError: true }) };
  }

  if (storedQ.isError) {
    return { ...base, career: deriveCareerDirection(undefined, { isError: true }) };
  }
  // Same rule as above: pending is loading; settled-and-empty is a failure.
  if (storedQ.isPending) return { ...base, career: { state: "loading" } };
  if (storedQ.data == null) {
    return { ...base, career: deriveCareerDirection(undefined, { isError: true }) };
  }

  return { ...base, career: deriveCareerDirection(storedQ.data) };
}
