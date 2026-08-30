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

/** The instrument as a whole. Unchanged at v3.1.0: this is the outer
 *  wrapper version (bumped only for a genuinely new product-level
 *  instrument, as v3.0 -> v3.1 was); CONTENT_VERSION, SCORING_VERSION and
 *  PATTERN_DEFINITION_VERSION below are the granular versions designed to
 *  move independently within v3.1 -- exactly the same pattern
 *  OPTION_MATRIX_VERSION's draft-1 -> draft-2 bump already established. */
export const DEFINITION_VERSION = "2026-scd-v3.1.0" as const;

/** Item wording and options. Bumped when any candidate-facing string
 *  changes. Bumped to draft-4 (Question Refinement v3.2): twelve Career DNA
 *  stems, the C2 context prompt and six adaptive prompts were rephrased for
 *  readers new to security, and the 1-10 scale gained explicit semantic
 *  endpoints. NOTHING else moved -- SCORING_VERSION, OPTION_MATRIX_VERSION
 *  and PATTERN_DEFINITION_VERSION are all deliberately unchanged below, and
 *  scripts/career-discovery-v32-equivalence-check.ts proves per-field that
 *  the same responses still produce the same dimensions, Career Areas,
 *  profession fit scores and ordering.
 *
 *  ── WHY THIS IS THE *ONLY* VERSION THAT MOVES ──────────────────────────
 *
 *  This file's whole design is that the granular versions travel
 *  independently. A rephrasing is a content event and nothing else; bumping
 *  SCORING_VERSION alongside it would be actively misleading, because it
 *  would tell a future reader that the way answers become scores changed on
 *  this date, and they would go looking for a recalibration that never
 *  happened.
 *
 *  Previous draft-3 (Final Autonomous Matching Engine Completion Mandate):
 *  CQ21 + CQ22 added (CID17 Regulatory & Compliance Orientation needed a
 *  real evidence source, and a second question was required to clear the
 *  0.60 dominance cap -- see core-items.ts). Same definition_version_id as
 *  before -- this is a same-generation content change, not a new
 *  product-level instrument (see DEFINITION_VERSION). */
/** Bumped to draft-5 (context/intent separation, v3.2 wording pass 2):
 *  C1's prompt and two of its five option labels were rephrased so the
 *  question describes the candidate's SITUATION only. `security_leader` had
 *  read "I am a manager and want to understand my strengths better" — a
 *  situation and a goal welded together, whose goal half was word-for-word
 *  one of C2's own options — and `exploring_security` now says plainly that
 *  arriving from another industry counts.
 *
 *  Wording and nothing else, again: no option value, no option order, no
 *  adaptive path mapping, no item, no loading, no weight. SCORING_VERSION,
 *  OPTION_MATRIX_VERSION and PATTERN_DEFINITION_VERSION are all deliberately
 *  unchanged below, and career-discovery-v32-equivalence-check.ts proves
 *  per-field against a baseline frozen on pre-refinement main that the same
 *  responses still produce the same dimensions, Career Areas, profession fit
 *  scores and ordering. */
export const CONTENT_VERSION = "v3.1-draft-5" as const;

/** How answers become dimension scores: role weights, option loadings,
 *  aggregation and confidence. Bumped when any of those change. Bumped to
 *  draft-3 alongside CONTENT_VERSION (not draft-2 -- STORY_TEMPLATE_VERSION
 *  already holds that string and story.ts's own guard requires this to
 *  differ from it): CID17 added as a 17th matchable dimension (CQ21/CQ22
 *  evidence); CID06 and CID11's evidence weights shift accordingly (see
 *  EXPECTED_WEIGHTS in scripts/career-discovery-v31-check.ts for the exact
 *  deltas).
 *
 *  Bumped to draft-4 (Profession Recommendation Validation mandate): the
 *  answer -> dimension arithmetic is BYTE-IDENTICAL -- no item, loading,
 *  role weight, aggregation rule or confidence threshold moved, and the
 *  frozen golden personas confirm every dimension score is unchanged. What
 *  moved is how scored dimensions become a RANKED recommendation, which is
 *  scoring behaviour a stored report must be reproducible against:
 *
 *    - Recommendation Priority now orders on `centralExpressionZ` (see
 *      professions.ts) instead of the floor-only `fitScore`, which
 *      saturated near 100 once neutral-baseline-z gating landed and was
 *      therefore deciding every ranking on differences as small as 0.2
 *      points.
 *    - The context/CIG priority bonuses moved onto that same z scale
 *      (0.1 SD each, was +6 on the 0-100 fitScore scale, where they were
 *      worth up to 8x the entire observable affinity spread).
 *    - The always-present top-3 ranking now runs through the same
 *      career-pivot stage classification the tier buckets do, so the two
 *      candidate-facing surfaces of one result can no longer disagree.
 *
 *  Historical snapshots keep their own frozen scoring_version and are not
 *  re-scored; this string is what makes that distinction legible. */
export const SCORING_VERSION = "v3.1-draft-4" as const;

/** Which option loadings the matrix table holds. Kept as its own string so
 *  the matrix can be re-seeded independently of the aggregation rules.
 *  Bumped to draft-2 (Owner Approval Gate item 2): CID02 Leadership had
 *  only one primary source across the whole instrument (CQ13) while
 *  materially contributing to two profession centrals (SP006, SP007).
 *  CQ06 and CQ09 each already carried a genuine, direct-observed-behaviour
 *  CID02 tertiary loading (not a stated preference) that was underweighted
 *  relative to its actual evidentiary strength -- promoted both to
 *  secondary. No question wording, option text, dimension spans or option
 *  values changed; only the role (and therefore weight) of two existing
 *  loadings. */
export const OPTION_MATRIX_VERSION = "v3.1-draft-2" as const;

/** Central/supporting dimension sets and the resolution thresholds. Bumped
 *  to draft-3 (not draft-2 -- see SCORING_VERSION's comment on
 *  STORY_TEMPLATE_VERSION) (Final Autonomous Matching Engine Completion
 *  Mandate): CP06 "Compliance Guardian"'s central set swapped CID09
 *  (Conflict Management, a work-style proxy that never actually described
 *  compliance work) for CID17 (Regulatory & Compliance Orientation), its
 *  genuine defining trait. */
export const PATTERN_DEFINITION_VERSION = "v3.1-draft-3" as const;

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

/** Version lifecycle. Only `pilot` or `active` may be administered to real
 *  candidates (both content-ready; the difference is scale of rollout, not
 *  readiness). This constant is never the enforcement point — the database
 *  row (`cd_definition_versions.lifecycle_status`) is, and it can change
 *  independently of this file. Kept in sync manually; if it drifts, nothing
 *  breaks (nothing in the codebase reads this constant as of 2026-08-14 —
 *  confirmed by repo-wide search), but a stale value here is exactly the
 *  kind of thing that misleads the next reader, so update it whenever the
 *  owner promotes v3.1's real lifecycle_status. */
export type LifecycleStatus = "design" | "internal_test" | "pilot" | "active" | "retired";

/** Current status of v3.1, as of 2026-08-14: `active` (promoted by
 *  20260731100000_career_discovery_v31_launch.sql on 2026-07-31). Content is
 *  live-ready. WHO may use it is a separate question, gated by
 *  cd_is_internal_tester()/is_platform_admin() in v31-public.functions.ts —
 *  see that file's header for why lifecycle readiness and access control
 *  were split into two independent gates. */
export const LIFECYCLE_STATUS: LifecycleStatus = "active";
