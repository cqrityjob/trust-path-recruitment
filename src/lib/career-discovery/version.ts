// Security Career Discovery v3.0 — version metadata and lifecycle.
//
// Every persisted answer and every report snapshot records these four
// version strings, so a historical result stays exactly reproducible
// against the content, scoring and taxonomy that produced it.
//
// These are the SINGLE source of truth. The migration that registers this
// definition in the Assessment Catalog repeats the same literals, and
// scripts/career-discovery-check.ts asserts the two agree.

/** Assessment Catalog definition id. Distinct from the live, frozen
 *  'public-career-assessment' (v2.1) and from 'career-guidance'. Nothing
 *  about either is modified by this definition. */
export const DEFINITION_ID = "security-career-discovery-v3" as const;

/** The instrument as a whole. */
export const DEFINITION_VERSION = "2026-scd-v3.0.0" as const;

/** Item wording and options. Bumped when any candidate-facing string in
 *  this namespace changes. */
export const CONTENT_VERSION = "scd-content-v3.0.0" as const;

/** How answers become axis positions. Bumped when any loading, aggregation
 *  rule or coverage rule changes. */
export const SCORING_VERSION = "scd-scoring-v3.0.0" as const;

/** The Security Career Area taxonomy the recommendations resolve against. */
export const TAXONOMY_VERSION = "cig-areas-v1" as const;

/** Locales this version is fully adapted for. English is an adaptation
 *  authored alongside the Swedish, never a runtime machine translation. */
export const AVAILABLE_LOCALES = ["sv", "en"] as const;
export type DiscoveryLocale = (typeof AVAILABLE_LOCALES)[number];

/** Date this version was authored. */
export const CREATED_AT = "2026-07-28" as const;

// -------------------------------------------------------------------------
// Lifecycle
// -------------------------------------------------------------------------

/** Version lifecycle. Only `active` may be administered to real
 *  candidates; `internal_test` and `pilot` are for named, informed
 *  participants under the review gates. */
export type DiscoveryLifecycleStatus = "design" | "internal_test" | "pilot" | "active" | "retired";

/** The statuses under which a version may be administered to a real,
 *  unconsented candidate. `design` and `internal_test` are not among them.
 *  The database carries the same rule as a trigger, so this constant is a
 *  fast client-side check, never the enforcement point. */
export const CANDIDATE_ADMINISTRABLE_STATUSES: readonly DiscoveryLifecycleStatus[] = [
  "pilot",
  "active",
];

/** Current status of v3.0.
 *
 *  `design` — authored, not reviewed. Per question-blueprint-v3.0.md §8 all
 *  six review gates (SME, language, accessibility, bias, privacy/legal,
 *  psychometric) are ☐ not started. Nothing here may be administered to a
 *  real candidate until they are cleared and the owner approves promotion.
 *
 *  Promoting this constant alone is NOT sufficient to activate the version:
 *  the catalog row's own status governs, and the migration ships it
 *  unpublished. */
export const LIFECYCLE_STATUS: DiscoveryLifecycleStatus = "design";

/** Review-gate state, mirroring question-blueprint-v3.0.md §8. Recorded in
 *  code so the guard script can refuse to let LIFECYCLE_STATUS advance past
 *  `internal_test` while any gate is outstanding. */
export const REVIEW_GATES = {
  content_review: false,
  sme_review: false,
  language_review: false,
  accessibility_review: false,
  bias_review: false,
  privacy_legal_review: false,
  psychometric_review: false,
} as const;

export function allReviewGatesCleared(): boolean {
  return Object.values(REVIEW_GATES).every(Boolean);
}

/** True only when this version may be put in front of a real candidate.
 *  Deliberately conjunctive: the status must permit it AND every gate must
 *  be cleared. */
export function isAdministrableToCandidates(): boolean {
  return CANDIDATE_ADMINISTRABLE_STATUSES.includes(LIFECYCLE_STATUS) && allReviewGatesCleared();
}

/** The full version tuple stamped onto every evidence row and report
 *  snapshot. */
export interface DiscoveryVersionStamp {
  definitionId: typeof DEFINITION_ID;
  definitionVersion: typeof DEFINITION_VERSION;
  contentVersion: typeof CONTENT_VERSION;
  scoringVersion: typeof SCORING_VERSION;
  taxonomyVersion: typeof TAXONOMY_VERSION;
}

export function versionStamp(): DiscoveryVersionStamp {
  return {
    definitionId: DEFINITION_ID,
    definitionVersion: DEFINITION_VERSION,
    contentVersion: CONTENT_VERSION,
    scoringVersion: SCORING_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
  };
}
