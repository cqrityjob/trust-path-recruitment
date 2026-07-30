// Security Career Discovery v3.1 — version metadata.
//
// Every persisted answer and every report snapshot records these version
// strings, so a historical result stays exactly reproducible against the
// content, scoring and pattern definitions that produced it.
//
// These are the SINGLE source of truth. The migration that registers this
// definition repeats the same literals and scripts/career-discovery-v31-check.ts
// asserts the two agree.
//
// ── WHY VERSIONS ARE THE IMMUTABILITY MECHANISM ────────────────────────
//
// A stored report is never recomputed, so changing anything in this
// namespace cannot alter an issued snapshot. What versions add is the
// ability to KNOW which definitions produced a given report — and to prove
// it, because the frozen persona fixtures are keyed on these strings. Any
// change to scoring, dimensions, items or patterns that is not accompanied
// by a version bump fails CI.

/** Assessment Catalog definition id. Shared with v3.0: v3.1 is a new
 *  VERSION of the same instrument, not a different product. */
export const DEFINITION_ID = "security-career-discovery-v3" as const;

/** The instrument as a whole. */
export const DEFINITION_VERSION = "2026-scd-v3.1.0" as const;

/** Item wording and options. Bumped when any candidate-facing string
 *  changes. Owner-approved as "Core Question Options v3.1-draft-1". */
export const CONTENT_VERSION = "v3.1-draft-1" as const;

/** How answers become dimension scores: role weights, option loadings,
 *  aggregation and confidence. Bumped when any of those change. */
export const SCORING_VERSION = "v3.1-draft-1" as const;

/** Which option loadings the matrix table holds. Kept as its own string so
 *  the matrix can be re-seeded independently of the aggregation rules. */
export const OPTION_MATRIX_VERSION = "v3.1-draft-1" as const;

/** Central/supporting dimension sets and the resolution thresholds. */
export const PATTERN_DEFINITION_VERSION = "v3.1-draft-1" as const;

/** The Security Career Area taxonomy recommendations resolve against. */
export const TAXONOMY_VERSION = "cig-areas-v1" as const;

/** Locales this version is fully adapted for. Swedish is the source; English
 *  is an authored equivalent, never a runtime machine translation. */
export const AVAILABLE_LOCALES = ["sv", "en"] as const;
export type Locale = (typeof AVAILABLE_LOCALES)[number];

/** A bilingual string. Both locales are required — a half-translated
 *  instrument is not administrable. */
export type Bilingual = { readonly sv: string; readonly en: string };

/** The complete version tuple frozen into every report snapshot. */
export const VERSION_TUPLE = {
  definitionVersion: DEFINITION_VERSION,
  contentVersion: CONTENT_VERSION,
  scoringVersion: SCORING_VERSION,
  optionMatrixVersion: OPTION_MATRIX_VERSION,
  patternDefinitionVersion: PATTERN_DEFINITION_VERSION,
  taxonomyVersion: TAXONOMY_VERSION,
} as const;

export type VersionTuple = typeof VERSION_TUPLE;

/** Version lifecycle. Only `active` may be administered to real candidates. */
export type LifecycleStatus = "design" | "internal_test" | "pilot" | "active" | "retired";

/** Current status of v3.1. Internal testers only; the database carries the
 *  same rule as a trigger, so this constant is a fast client-side check and
 *  never the enforcement point. */
export const LIFECYCLE_STATUS: LifecycleStatus = "internal_test";
