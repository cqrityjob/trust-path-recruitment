// `fit` — the occupations the frozen Career Discovery report ranked.
//
// ── ONE OF THREE CONCEPTS, AND THE NARROWER ONE ────────────────────────
//
// This module answers "which occupations did the instrument suggest for me".
// It does NOT answer "I work as a väktare, where can I go from here" — that
// is `pathFrom`, and it lives in `career-origin.ts` with a different input,
// different evidence and a different failure mode. The two are rendered as
// separate sections with separate headings, each stating its own basis,
// because a reader who cannot tell which one they are looking at cannot
// trust either. Neither ever appears under a combined "Rekommenderat för
// dig" heading.
//
// The third concept, `eligibility`, has no module: it is never computed. See
// ELIGIBILITY_IS_NEVER_ASSESSED in career-origin.ts.
//
// ── THE RULE THAT SHAPES EVERY BRANCH BELOW ────────────────────────────
//
// A page is allowed to be personal only when it actually has the person's
// result in hand. Anything else — a signed-in visitor with no analysis, a
// report this build cannot read, a failed read — must say so plainly and
// offer the general product. "Rekommenderat för dig" over a list computed
// from nothing is the single most damaging thing a career service can print,
// because it is indistinguishable from the real thing until the reader acts
// on it.
//
// So this module returns a discriminated state, never a list-that-might-be-
// empty. Every non-ready state names its own reason and the surface renders
// it as itself.
//
// ── NOTHING HERE RANKS ANYTHING ────────────────────────────────────────
//
// The occupations, their order and their confidence are READ from the frozen
// report snapshot (`deriveCareerDirection`, which is itself a pure read of
// stored JSON). This module resolves each one to a published Career Center
// guide and stops. Deleting it would remove a section from a page; it would
// not change one number in one report.
//
// That matters because reopening an old report has to show what it said at
// the time. A Career Center that recomputed "your top profession" from the
// live catalogue would quietly disagree with the report it links to.
//
// ── FORMAL REQUIREMENTS ARE NOT PART OF THE MATCH ──────────────────────
//
// Career Discovery ranks fit between a person's stated preferences and a
// profession's working profile. It does not check whether the reader holds a
// väktarlegitimation, has a police appointment, or would pass a suitability
// review — and it must not, because that would turn career guidance into an
// eligibility verdict. The consequence is a sentence the surface is REQUIRED
// to print, carried on the model rather than left to copy discipline:
// `formalRequirementsAssessed` is `false`, permanently, by construction.
//
// ── THREE, NOT FIVE ────────────────────────────────────────────────────
//
// The report names at most three occupations. `MAX_PERSONAL_RECOMMENDATIONS`
// caps the surface at the same number rather than padding the list with
// catalogue neighbours, which would mix "your report said this" with "this is
// nearby" under one heading.

import type { CareerDirection, RoleSummary } from "@/lib/professional-identity/career-direction";
import type { Profession } from "./types";
import { publishedProfessionFromAnySlug } from "./profession-links";
import { ELIGIBILITY_IS_NEVER_ASSESSED } from "./career-origin";

export const MAX_PERSONAL_RECOMMENDATIONS = 3;

/** Why this profession is on the reader's screen. One closed set, so the
 *  surface cannot invent a fourth reason in copy. */
export type RecommendationReason =
  /** The report ranked it. `rank` says where. */
  | "ranked_by_report"
  /** The report ranked it and flagged the match as indicative — "closest in
   *  the catalogue", which is not the same claim as "a good fit". */
  | "ranked_indicative";

export interface PersonalRecommendation {
  /** The report's own presentation order, carried rather than implied by
   *  array position so nothing can re-sort it into a different claim. */
  readonly rank: number;
  readonly reason: RecommendationReason;
  /** The published guide, when the catalogue has one. */
  readonly profession: Profession | null;
  /** What the report called it, in the language the report was frozen in.
   *  Rendered when no guide resolves — and never as a link. */
  readonly reportTitleSv: string;
  readonly reportTitleEn: string;
}

export type PersonalDirection =
  /** Nothing has answered yet.
   *
   *  `reason` separates the two waits, and the separation is not cosmetic.
   *  `"session"` is the SERVER-RENDERED state: this route is public and
   *  indexed, and at that moment nobody — crawler included — has been
   *  identified, so the surface must not print "Hämtar din karriäranalys…"
   *  over HTML that an anonymous reader will keep. `"report"` only ever
   *  happens after a live session has been observed in the browser, where
   *  that sentence is true. */
  | { readonly state: "loading"; readonly reason: "session" | "report" }
  /** No signed-in visitor. The page is not personal and does not pretend. */
  | { readonly state: "anonymous" }
  /** Signed in, no completed analysis. */
  | { readonly state: "no_result" }
  /** The read failed, or the newest report is one this build cannot read.
   *  Distinct from `no_result`: telling somebody who has a report that they
   *  have not taken one is a lie, and they would stop looking for it. */
  | { readonly state: "unreadable"; readonly reportHref: string | null }
  /** The newest result names career AREAS and no occupation — a v2.1 or v3.0
   *  report. There is a result and it is worth opening; it simply does not
   *  answer "which job". */
  | {
      readonly state: "no_roles_named";
      readonly reportHref: string;
      readonly completedAt: string | null;
    }
  | {
      readonly state: "ready";
      readonly reportHref: string;
      readonly completedAt: string | null;
      readonly items: readonly PersonalRecommendation[];
      /** Always false. See the header comment: guidance is not eligibility. */
      readonly formalRequirementsAssessed: typeof ELIGIBILITY_IS_NEVER_ASSESSED;
      /** The locale the snapshot was frozen in, when it differs from what the
       *  reader has selected. The surface says so rather than presenting
       *  frozen Swedish strings as though they were translated. */
      readonly frozenLocale: "sv" | "en" | null;
    };

function toRecommendation(role: RoleSummary): PersonalRecommendation {
  return {
    rank: role.rank,
    reason: role.confidence === "indicative" ? "ranked_indicative" : "ranked_by_report",
    // The report stores a CIG slug; the Career Center's URL space uses its
    // own. One resolver bridges the two, and returns null rather than a
    // link into the "not published yet" state.
    profession: publishedProfessionFromAnySlug(role.cigSlug) ?? null,
    reportTitleSv: role.titleSv,
    reportTitleEn: role.titleEn,
  };
}

/**
 * Map the candidate's own career picture onto the Career Center.
 *
 * `signedIn === false` short-circuits every other branch: an anonymous
 * visitor has no result to read and the page must not spend a state on
 * pretending otherwise.
 */
export function personalDirection(
  career: CareerDirection | undefined,
  options: { readonly signedIn: boolean | null },
): PersonalDirection {
  if (options.signedIn === false) return { state: "anonymous" };
  if (options.signedIn === null) return { state: "loading", reason: "session" };
  if (!career || career.state === "loading") return { state: "loading", reason: "report" };
  if (career.state === "none") return { state: "no_result" };
  if (career.state === "unavailable") return { state: "unreadable", reportHref: null };
  if (career.state === "unreadable") return { state: "unreadable", reportHref: null };
  if (career.state === "legacy") {
    return {
      state: "no_roles_named",
      reportHref: career.reportHref,
      completedAt: career.completedAt,
    };
  }

  const roles = career.topRole ? [career.topRole, ...career.alternativeRoles] : [];
  if (roles.length === 0) {
    return {
      state: "no_roles_named",
      reportHref: career.reportHref,
      completedAt: career.completedAt,
    };
  }

  return {
    state: "ready",
    reportHref: career.reportHref,
    completedAt: career.completedAt,
    items: roles.slice(0, MAX_PERSONAL_RECOMMENDATIONS).map(toRecommendation),
    formalRequirementsAssessed: ELIGIBILITY_IS_NEVER_ASSESSED,
    frozenLocale: career.frozenLocale,
  };
}

/** True when the surface may present itself as personal at all. Everything
 *  else renders the general entry points. */
export function isPersonalised(d: PersonalDirection): boolean {
  return d.state === "ready";
}
