// Layer 4 — deterministic profession matching.
//
// ── PURE, LIKE EVERYTHING ELSE IN THIS DIRECTORY ─────────────────────────
//
// `matchProfessions` takes a candidate's scored dimensions and a profession
// catalogue as plain data and returns a plain result. It does not query the
// database and does not know what "approved for ranking" means — that gate
// is the orchestration layer's job (see cd_guard_profession_ranking_approval
// in 20260730090000_career_discovery_v3_1_schema.sql and validateSnapshot's
// CD_UNAPPROVED_PROFESSION_RANKING check in ./snapshot.ts). The caller is
// responsible for passing only `approved_for_ranking = true` rows here.
// Today that set is empty, so `available` is false for every real candidate
// until an owner actually approves a profession — this file does not and
// cannot change that.
//
// ── SCORING MIRRORS rankCareerAreas, WITH ONE DELIBERATE ADDITION ────────
//
// Same shape as ./career-areas.ts: distance-based, asymmetric (exceeding a
// calibrated band is never penalised, matching rule PMR001), coverage-gated,
// deterministic tie-breaking. The difference is the target is a [low, high]
// band per dimension rather than a single point, and each dimension carries
// its own weight rather than being uniformly "Core" — because unlike the
// locked Career Area sheet, Layer 4 calibration is authored per profession
// and is expected to vary in how confidently each dimension differentiates
// it (see cd_profession_profiles.evidence_basis / confidence).
//
// ── CENTRAL-DOMINANT FIT (Execution Mandate §9-11) ────────────────────────
//
// A first version of this engine pooled every weighted dimension — central
// and supporting alike — into one averaged penalty. That let GENERIC
// security traits (risk awareness, composure, structure — present to some
// degree in nearly every profession's calibration) dilute a candidate's
// failure on the dimensions that actually DEFINE a profession. Concretely:
// a strongly technical/analytical candidate with genuinely low operational
// interest still cleared "strong" fit for Väktare, because Väktare's many
// wide, low-floor SUPPORTING bands were easy to clear even while its
// central dimension (CID01, operational orientation) was badly missed —
// the miss just got averaged away against everything else.
//
// The fix: score central and supporting evidence separately, then combine
// central-dominant (CENTRAL_WEIGHT below), AND gate on central fit
// specifically — a profession a candidate has NOT engaged with on its own
// defining dimensions is excluded even if generic traits alone would have
// cleared the old pooled threshold. This is still deterministic, still a
// closed-form distance calculation, still fully attributable to specific
// dimensions in `alignedDimensions` — not a new opaque model, just scoring
// central and supporting evidence as the genuinely different things
// cd_profession_profiles.centrality already declares them to be.
//
// ── THIS WAS STILL NOT ENOUGH: NEUTRAL-BASELINE Z-SCORE (Release Completion
//    mandate §89) ─────────────────────────────────────────────────────────
//
// Central-dominant fit above closed the "generic traits mask a real miss"
// gap, but left a second, more fundamental one: `fitOver` is floor-only
// (PMR001 — exceeding `bandLow` is never a penalty, and `bandHigh` is
// calibrated, persisted and round-tripped into this module's input but never
// actually READ by any scoring path). Central `bandLow` floors cluster
// 0.5-0.65 across the whole catalogue (verified against the live authored
// data). Any candidate whose central scores broadly clear ~0.65-0.7 —
// unremarkable for an accomplished, broadly-capable person, NOT a fixture
// edge case — clears nearly every profession's central floor with room to
// spare, so `PROFESSION_MIN_CENTRAL_FIT`/`CENTRAL_DIMENSION_MAX_MISS` never
// fire and every profession comes back "strong" fit, indistinguishable.
// Proven empirically, not assumed: the owner's own real, saved v3.1 report
// (Säkerhetschef, 8+ years) scored 99.4-99.8 "strong" fit on all 14
// professions in the catalogue, including Väktare — exactly the false
// "natural progression" presentation Owner Approval Gate §6/§8 forbid. The
// golden persona fixtures never caught this because — by the fixture
// author's own documented account (golden-persona-fixtures.ts's
// "broad-profile" comment) — they had to be hand-engineered into an
// artificially bimodal shape specifically to trigger CENTRAL_DIMENSION_MAX_MISS,
// which a realistic, moderately-varying human profile does not naturally do.
//
// Considered and rejected: making `bandHigh` a symmetric penalty. The
// authored `bandHigh` values are not independently calibrated optimal
// ceilings — they are a mechanical `bandLow + 0.3..0.4` offset (capped at
// 1.0) with no documented semantics anywhere in the schema, the fixture
// source, or the migrations, and 58% of all 238 rows sit at bandHigh >= 0.9.
// Treating that as "scoring too high is bad" would penalise candidates for
// genuine strength on data that was never meant to bear that weight.
//
// The actual fix mirrors career-areas.ts's own AREA_RANK_METHOD =
// "neutral-baseline-zscore-v1" exactly (same defect class already solved
// there: an easy, low-bar target is trivially cleared by anyone regardless
// of fit, while a demanding, high-variance one only rewards genuine
// strength). `neutralBaselineCentralZ` computes, per profession, how many
// standard deviations the candidate's ACTUAL central-band shortfall sits
// below the shortfall an uninformative candidate (each central dimension
// independently Uniform(0,1) — the same maximum-entropy H0 career-areas.ts
// uses) would be expected to show against that SAME profession's own
// central bands. A profession with several demanding central floors
// discriminates far more than one with one lenient central floor, exactly
// the missing signal. Empirically validated central-only (not blended with
// supporting): supporting bands' floors are low enough (mostly 0.2-0.4) that
// their neutral-baseline variance collapses toward zero, so ANY clearance
// produces an enormous, non-discriminating z (2.0-3.0 for nearly every
// profession regardless of true fit) — confirmed by hand-running the real
// Säkerhetschef data both blended and central-only; blending drowns the
// genuinely informative central signal in supporting noise, central-only
// preserves it. `centralZ` now decides inclusion (must clear the neutral
// baseline, `centralZ > 0`) and `fitTier` (`FIT_TIER_STRONG_Z`) —
// `fitScore`/`priorityScore` keep their exact original 0-100 meaning and
// formula (a closeness percentage, still shown internally per the "no
// percentages, ever" rule below), unchanged, so nothing about Recommendation
// Priority's bonus arithmetic or the owner diagnostics' existing numeric
// fields is disturbed by this — only WHICH professions clear the gate and
// WHICH tier they land in.
//
// ── STAGE IS CAREER-STAGE-AWARE, NEVER SCORE-AWARE ───────────────────────
//
// "Explore now" / "Possible next step" / "Longer-term direction" is NOT a
// fit-score band. It is the distance between the candidate's inferred
// baseline stage (derived from C1 — ContextStatus, already collected,
// already unscored, see ../context-items.ts) and the profession's own
// career_stage. Fit only decides WHETHER a profession is shown at all
// (below PROFESSION_MIN_FIT it is excluded outright); it never decides HOW
// SOON. A perfect-fit senior role is still "longer-term" for a candidate
// just starting out — that is the whole point of owner decision C-1's
// worked examples (Student -> Police "explore now" but Security Manager
// "longer-term only"; Väktare -> Skyddsvakt "explore now", Security
// Coordinator "possible next step", Security Manager "longer-term").
//
// C1 is read here exactly as ../context-items.ts and ./personal-layer.ts
// already document it: personalisation input, never scoring input. Nothing
// in this file adds it to a dimension score or a fit calculation.
//
// ── NO PERCENTAGES, EVER ─────────────────────────────────────────────────
//
// `fitScore` (0-100) exists so results can be sorted and so the >= threshold
// checks below have somewhere to live. It is never exposed on
// ProfessionMatch as a candidate-facing number — only `fitTier`
// ("strong" | "moderate") is, exactly as area scores are internal and only
// their band reaches the candidate (PMR006).

import type { ExperienceBand } from "../career-context";
import type { ContextStatus } from "../types";
import { DOMAIN_DIMENSION_IDS, MATCHABLE_DIMENSION_IDS, type DimensionId } from "./dimensions";
import type { DimensionResult } from "./scoring";

// -------------------------------------------------------------------------
// Catalogue shape — the matching-relevant subset of cd_professions +
// cd_profession_profiles. The orchestration layer maps DB rows into this;
// this module never sees a Supabase client.
// -------------------------------------------------------------------------

export type ProfessionCareerStage = "entry" | "developing" | "senior";

/** Mirrors cd_profession_profiles.centrality. "central" dimensions are what
 *  actually DEFINE a profession; "supporting"/"neutral" are dimensions most
 *  security roles share to some degree (risk awareness, composure,
 *  structure...) and cannot, on their own, justify a recommendation — see
 *  the central-dominant fit formula below and its header comment.
 *
 *  ── DOMAIN_ONLY_CENTRAL_RULE (Final Autonomous Matching Engine Completion
 *  Mandate) ────────────────────────────────────────────────────────────────
 *
 *  Root cause of the owner's real Security Manager result (Guarding #1,
 *  explained by Composure/Risk Awareness/Collaboration/Conflict Management —
 *  generic, universally-necessary WORK STYLE traits, not career-direction
 *  evidence): several first-wave professions had a work-style dimension as
 *  part of their "central" (defining) set, alongside genuine domain/career-
 *  direction dimensions. Because the central-dominant formula above
 *  (CENTRAL_WEIGHT = 0.75) treats every central dimension as equally
 *  decisive, a candidate who only clears the low, near-universal style bars
 *  could look like a strong match for many professions regardless of true
 *  specialty — the CENTRAL_WEIGHT/CENTRAL_DIMENSION_MAX_MISS machinery was
 *  sound, it was just being fed the wrong INPUT data.
 *
 *  Every dimension in dimensions.ts now carries a `signalType`: "domain"
 *  (career-direction/specialty evidence — Operational, Investigative,
 *  Technical, Regulatory & Compliance, etc.) or "style" (transferable work-
 *  style evidence — Communication, Collaboration, Composure Under Pressure,
 *  etc., useful across nearly all of security and therefore structurally
 *  incapable of telling two professions apart on their own). The rule this
 *  file now enforces: `centrality: "central"` may ONLY be assigned to a
 *  DOMAIN_DIMENSION_IDS-classified dimension. A style dimension remains
 *  perfectly valid, genuinely differentiating SUPPORTING evidence (e.g. an
 *  elevated supporting weight for Personskyddsvakt's Composure) — it simply
 *  cannot, on its own, structurally drive a "strong" match. Checked by
 *  validateDomainOnlyCentralRule below, run by the guard script against
 *  every profession in the catalogue; not runtime-enforced in scoreProfession
 *  itself; a bad catalogue row fails CI before it fails a candidate. */
export type ProfessionDimensionCentrality = "central" | "supporting" | "neutral";

export interface ProfessionDimensionBand {
  readonly dimensionId: DimensionId;
  readonly bandLow: number;
  readonly bandHigh: number;
  /** 0 for CID15 always (DB CHECK constraint), 0-1 otherwise. */
  readonly weight: number;
  readonly centrality: ProfessionDimensionCentrality;
}

export interface ProfessionCatalogEntry {
  readonly professionId: string;
  readonly careerAreaId: string;
  readonly titleSv: string;
  readonly titleEn: string;
  readonly careerStage: ProfessionCareerStage;
  readonly entryRole: boolean;
  readonly regulated: boolean;
  /** 1-10, or null when not yet assessed. */
  readonly transitionDifficulty: number | null;
  readonly inclusionRationaleSv: string;
  readonly inclusionRationaleEn: string;
  readonly limitationNoteSv: string | null;
  readonly limitationNoteEn: string | null;
  readonly bands: readonly ProfessionDimensionBand[];
  /** Soft link to cig_professions.slug (see the migration that added this
   *  column to cd_professions). Carried through onto ProfessionMatch so a
   *  renderer can look up live CIG content — pathway, requirements,
   *  education, jobs — for a recommendation without re-running matching.
   *  Null only if a profession is somehow approved without ever being
   *  linked to CIG, which authoring practice does not currently allow. */
  readonly cigProfessionSlug: string | null;
}

/** One catalogue row assigning `centrality: "central"` to a dimension that
 *  is not domain-classified — see DOMAIN_ONLY_CENTRAL_RULE above. */
export interface DomainOnlyCentralViolation {
  readonly professionId: string;
  readonly dimensionId: DimensionId;
}

/**
 * Data-integrity check for DOMAIN_ONLY_CENTRAL_RULE (see the doc comment on
 * ProfessionDimensionCentrality). Pure, catalogue-in/violations-out — run by
 * the guard script against the real first-wave catalogue; not called from
 * scoreProfession itself, so a violation fails CI rather than silently
 * shipping a work-style-driven "strong" match.
 */
export function validateDomainOnlyCentralRule(
  catalog: readonly ProfessionCatalogEntry[],
): readonly DomainOnlyCentralViolation[] {
  const violations: DomainOnlyCentralViolation[] = [];
  for (const entry of catalog) {
    for (const band of entry.bands) {
      if (band.centrality === "central" && !DOMAIN_DIMENSION_IDS.includes(band.dimensionId)) {
        violations.push({ professionId: entry.professionId, dimensionId: band.dimensionId });
      }
    }
  }
  return violations;
}

// -------------------------------------------------------------------------
// Career-stage baseline — derived from C1, never from a new question.
// -------------------------------------------------------------------------

export type StageRank = 0 | 1 | 2;

const PROFESSION_STAGE_RANK: Readonly<Record<ProfessionCareerStage, StageRank>> = {
  entry: 0,
  developing: 1,
  senior: 2,
};

/** The candidate's inferred starting point, from C1 alone — the FALLBACK
 *  used only when no concrete current profession is known (see
 *  resolveStageBaseline below, which this backs).
 *
 *  Not a claim about years of experience or seniority — a coarse, honest
 *  read of what C1 already tells us. `changing_career_area`'s own label is
 *  "I already work in security and want to move into another Security
 *  Career Area" (see ../context-items.ts), so it baselines at "developing",
 *  never "entry" — the mandate's explicit instruction that a career changer
 *  with real security experience must not be reset to a novice baseline. */
export const CANDIDATE_STAGE_BASELINE: Readonly<Record<ContextStatus, StageRank>> = {
  exploring_security: 0,
  working_in_security: 0,
  developing_current_role: 1,
  changing_career_area: 1,
  security_leader: 2,
};

/** Used when C1 was not answered (should not happen — it is a required
 *  context item — but a domain engine does not trust that from outside). */
const DEFAULT_STAGE_BASELINE: StageRank = 0;

/** A self-reported experience band's OWN stage-rank floor — used only as
 *  one input to resolveStageBaseline below, never on its own to infer
 *  seniority from nothing. */
const EXPERIENCE_STAGE_RANK: Readonly<Record<ExperienceBand, StageRank>> = {
  under_1y: 0,
  "1_3y": 0,
  "4_7y": 1,
  "8_plus_y": 2,
};

/**
 * Real-world defect fix (Owner Security Manager scenario, found live): C1
 * alone is a coarse five-way bucket answered BEFORE the candidate names a
 * concrete current profession. A real Säkerhetschef (Head of Security) who
 * answered C1 with the generic, honestly-true "I already work in security"
 * (working_in_security, baseline rank 0 -- entry) and only LATER, in the
 * separate post-assessment Career Context step, named their actual current
 * profession and 8+ years of experience was still being scored against an
 * entry baseline. Every entry-level profession then computed distance 0
 * ("explore now" -- the most prominent tier) while their OWN senior role
 * computed distance +2 ("longer-term"). C1 was never wrong, it was just
 * being trusted as the ONLY signal even after a more concrete one existed.
 *
 * Fix: prefer the best available FACTUAL signal, most concrete first.
 *   1. The candidate's own current profession's real, catalogued career
 *      level (cd_professions.career_stage) -- the single most concrete fact
 *      available, when it resolves to a profession actually in the catalog.
 *   2. Self-reported experience band, which can only ever push the baseline
 *      UP from what (1) establishes (a person 8+ years into a "developing"-
 *      level role is at least as advanced as that role's own rank -- never
 *      down: a self-reported band is never used to demote someone below
 *      their own profession's documented level).
 *   3. When no concrete current profession is known at all, C1 alone --
 *      exactly the previous behaviour, byte-for-byte unchanged for the
 *      "current profession unknown" case (item 2: unknown must stay
 *      unknown, nothing here infers a profession or a stage from Career
 *      DNA). Experience is deliberately NOT used standalone here: without a
 *      real catalogued profession behind it, a self-reported band alone is
 *      a weaker signal than C1's own honest coarse read -- it only ever
 *      refines a baseline that already rests on a known profession.
 *
 * Still not a claim about competence and never reads Career DNA -- every
 * input here is either a real catalogued fact (career_stage) or a direct
 * self-report (experience band, C1), exactly as before.
 */
function resolveStageBaseline(
  contextStatus: ContextStatus | null,
  currentProfessionEntry: ProfessionCatalogEntry | undefined,
  experienceBand: ExperienceBand | null | undefined,
): StageRank {
  // Experience only refines a baseline that already rests on a known,
  // catalogued current profession (mandate: "MAY refine... when combined
  // with known current profession") — deliberately NOT used standalone.
  // Without a real profession behind it, a self-reported band alone is a
  // weaker, less grounded signal than C1's own coarse-but-honest read, and
  // item 2's "unknown stays unknown" applies to stage inference too, not
  // just profession identity.
  if (currentProfessionEntry) {
    const profRank = PROFESSION_STAGE_RANK[currentProfessionEntry.careerStage];
    const expRank = experienceBand ? EXPERIENCE_STAGE_RANK[experienceBand] : null;
    return expRank !== null ? (Math.max(profRank, expRank) as StageRank) : profRank;
  }

  return contextStatus ? CANDIDATE_STAGE_BASELINE[contextStatus] : DEFAULT_STAGE_BASELINE;
}

// -------------------------------------------------------------------------
// Fit
// -------------------------------------------------------------------------

/** Mirrors AREA_MIN_COVERAGE. Below this share of weighted, observed
 *  dimensions, a profession is not scored honestly enough to show at all. */
export const PROFESSION_MIN_COVERAGE = 0.6;

/** A profession with observed central evidence must reach at least THIS
 *  central-only fit to be shown at all — independent of supporting fit.
 *  This is the actual fix for overmatching (see the file header): generic
 *  traits can no longer compensate for missing a profession's own defining
 *  dimensions. */
export const PROFESSION_MIN_CENTRAL_FIT = 55;

/** Below this share of a profession's CENTRAL weight observed, its central
 *  fit cannot be assessed honestly, so the profession is excluded — the
 *  same honesty rule PROFESSION_MIN_COVERAGE applies overall, applied here
 *  specifically to the dimensions that define the profession. */
export const PROFESSION_MIN_CENTRAL_COVERAGE = 0.5;

/** Below this fitScore (0-100), a profession is excluded from every
 *  recommendation tier regardless of career stage — a candidate is never
 *  shown a direction the evidence actively contradicts, even as
 *  "longer-term". */
export const PROFESSION_MIN_FIT = 62;

/** How much central fit dominates the combined score. 0.75 means a
 *  profession's central (defining) dimensions outweigh its supporting
 *  (generic) ones three to one — enough that failing the central
 *  dimensions badly cannot be masked by clearing many easy supporting
 *  ones, without making supporting evidence meaningless. */
const CENTRAL_WEIGHT = 0.75;

/** No single CENTRAL dimension may miss its band floor by more than this.
 *
 *  PROFESSION_MIN_CENTRAL_FIT alone is a WEIGHTED AVERAGE across a
 *  profession's central dimensions — which means a candidate who badly
 *  misses just one central dimension but comfortably clears the other two
 *  or three can still average out well above the floor. That is exactly the
 *  residual overmatching pattern from the mandate's worked examples: a
 *  technical candidate whose operational-orientation score badly misses
 *  Väktare's central band (CID01) still cleared "strong" fit because
 *  Väktare's other three central dimensions were close, diluting the miss
 *  away in the average. A weighted average, by construction, always lets
 *  enough small hits outvote one big miss.
 *
 *  This constant closes that gap with a hard per-dimension floor: any one
 *  central dimension missed by more than this margin disqualifies the
 *  profession outright, regardless of how the weighted average comes out.
 *  Deterministic and fully attributable (the disqualifying dimension is
 *  identifiable, not hidden inside an averaged score) — the whole point of
 *  keeping central-dominant fit a closed-form calculation rather than an
 *  opaque model. */
const CENTRAL_DIMENSION_MAX_MISS = 0.18;

/** A profession's central neutral-baseline z-score (see the file header's
 *  "NEUTRAL-BASELINE Z-SCORE" section) must exceed this to be included at
 *  all — i.e. the candidate's central alignment must be genuinely better
 *  than an uninformative, no-signal candidate would show, not merely clear
 *  each band's absolute floor. Replaces PROFESSION_MIN_FIT as the primary
 *  discriminator; PROFESSION_MIN_FIT stays as a belt-and-suspenders absolute
 *  floor underneath it (unchanged value, now rarely the binding constraint).
 *  0 is the natural, non-arbitrary choice: exactly the neutral baseline
 *  itself, no invented margin. */
const PROFESSION_MIN_CENTRAL_Z = 0;

/** Z threshold for fitTier "strong": one standard deviation above the
 *  neutral baseline, unchanged in value and in meaning.
 *
 *  ── WHICH Z IT IS APPLIED TO CHANGED (defect D8) ───────────────────────
 *
 *  It was applied to `centralZ`, the CLIPPED-shortfall statistic. That
 *  statistic's maximum attainable value is a property of the profession's
 *  own calibration rather than of any candidate — a profession's ceiling is
 *  reached by everyone who simply clears its floors. For most of the
 *  catalogue that ceiling sits comfortably above 1.0, so the threshold
 *  behaved. For one profession it did not:
 *
 *    Security Coordinator (SP006) has a single central band (CID02,
 *    bandLow 0.55, weight 0.7). Its maximum attainable centralZ is 0.84.
 *    It could therefore NEVER reach "strong" — not for a perfectly matched
 *    candidate, not for anyone, ever.
 *
 *  Because the comparator sorts by tier before priority, that permanently
 *  suppressed Security Coordinator beneath every "strong" profession even
 *  when it was the candidate's single best-expressed match. Observed on the
 *  Beginner Service/Coordination persona, whose highest Recommendation
 *  Priority of the whole catalogue was Security Coordinator, and whose
 *  delivered recommendation was front-line policing and guarding — the
 *  coordination direction its answers actually pointed at could not be
 *  shown. That is a scoring defect masquerading as a catalogue gap.
 *
 *  Applying the same threshold to `centralExpressionZ` removes the
 *  structural cap: that statistic's ceiling is
 *  `0.5 * Σw / sqrt(Σw²/12)`, which for a single band is 0.5*sqrt(12) =
 *  1.73 regardless of weight, and only grows with more bands. No profession
 *  can be locked out of "strong" by its band count again, and the tier now
 *  reflects how strongly the candidate expresses the profession's defining
 *  dimensions rather than merely that they cleared its floors.
 *
 *  `centralZ` is untouched and still gates INCLUSION
 *  (PROFESSION_MIN_CENTRAL_Z) — clearing the calibrated floors remains a
 *  precondition, and no profession reaches a tier without it. */
const FIT_TIER_STRONG_Z = 1.0;

export type ProfessionFitTier = "strong" | "moderate";

/**
 * Master Completion Mandate item 6: the four Discovery Path answers already
 * produce structured "report tags" (see ../adaptive-items.ts and
 * reportTagsFor in ./personal-layer.ts) that are collected and persisted
 * today but never read by anything downstream. This is a curated,
 * deterministic mapping from each career area to the report tags that
 * corroborate genuine interest in it — used ONLY to set
 * `ProfessionMatch.contextCorroborated`, which explainMatch (see
 * profession-explanations.ts) may turn into one additional explanatory
 * sentence. It never touches fit, coverage, stage or ranking — Career DNA
 * stays the only input to Profession Affinity, exactly as the mandate
 * requires ("do NOT let Career Context fabricate affinity... instead
 * change PRIORITY and PATHWAY interpretation" — here, "interpretation"
 * means richer explanation, the most conservative reading available that
 * still cannot contradict or dilute a DNA-driven recommendation).
 *
 * Not exhaustive over the full ~80-tag vocabulary — a first-pass curated
 * set per area, extensible without touching scoring.
 */
const CORROBORATING_TAGS_BY_AREA: Readonly<Record<string, readonly string[]>> = {
  SCA01: ["trusted_operator", "operational_interest", "operational_energy", "immediate_protection"],
  SCA02: [
    "trusted_operator",
    "operational_interest",
    "immediate_correction",
    "preventive_interest",
  ],
  SCA03: ["technology_interest", "technical_development", "practical_development"],
  SCA04: [
    "leadership_path",
    "trusted_coordinator",
    "people_leadership",
    "coordination_energy",
    "team_orientation",
    "stakeholder_leadership",
    "formal_leadership",
  ],
  SCA05: ["strategic_resilience", "incident_direction", "root_cause"],
  SCA06: [
    "investigative_interest",
    "trusted_analyst",
    "advanced_analysis",
    "transferable_analysis",
    "investigative_energy",
  ],
  SCA07: ["governance_path", "transferable_governance", "assurance_structure"],
  SCA08: ["technology_interest", "technical_development", "systems_leadership"],
  SCA09: ["technology_interest", "technical_development", "advanced_analysis"],
  SCA10: [
    "specialist_path",
    "specialist_role",
    "trusted_adviser",
    "executive_alignment",
    "strategic_role",
  ],
};

/** "career_pivot" (Execution Mandate §12-13): a profession the candidate has
 *  genuine Career-DNA affinity with, but which is NOT a natural next step
 *  from where they are today — a different career area, at or below their
 *  current baseline stage, rather than a progression within the area they
 *  are already heading toward. Worked example: an experienced Security
 *  Coordinator (developing baseline, SCA04-track affinity) who also scores
 *  well on Protective Security Guard's (SCA01, entry) central dimensions.
 *  That affinity is real and must not be hidden, but showing it as
 *  "explore now" would dishonestly imply it is the obvious next move — it
 *  is an alternative direction, not a step forward. See
 *  classifyCareerPivots below for the deterministic rule. */
export type ProfessionStage = "explore_now" | "possible_next_step" | "longer_term" | "career_pivot";

export interface ProfessionMatch {
  readonly professionId: string;
  readonly cigProfessionSlug: string | null;
  readonly careerAreaId: string;
  readonly titleSv: string;
  readonly titleEn: string;
  readonly fitTier: ProfessionFitTier;
  readonly stage: ProfessionStage;
  readonly regulated: boolean;
  readonly inclusionRationaleSv: string;
  readonly inclusionRationaleEn: string;
  readonly limitationNoteSv: string | null;
  readonly limitationNoteEn: string | null;
  /** Dimensions where the candidate meets or exceeds the calibrated band,
   *  most-aligned first. The "why this direction" evidence, same role
   *  AreaScore.alignedDimensions plays for Career Areas. */
  readonly alignedDimensions: readonly DimensionId[];
  readonly coverage: number;
  /** True when the candidate's Discovery Path answers (contextual
   *  self-report, never scored) corroborate this profession's career area —
   *  see CORROBORATING_TAGS_BY_AREA. Explanation-only signal (Mandate item
   *  6): explainMatch may turn this into one extra sentence; it never
   *  affects fitTier, stage, coverage or which professions clear matching. */
  readonly contextCorroborated: boolean;
}

/** How much the report is entitled to claim about one ranked profession.
 *
 *  "strong" / "moderate" mirror ProfessionMatch.fitTier and mean exactly
 *  what they have always meant: this profession cleared every recommendation
 *  gate. "indicative" is the new, deliberately weaker word — it means the
 *  profession is the CLOSEST to the candidate's answers out of the whole
 *  calibrated catalogue, and nothing more. It is an orientation signal, not
 *  a fit claim, and the copy that renders it says so.
 *
 *  The distinction is the whole reason a recommendation can always exist
 *  without the product overclaiming: the ordering is real and deterministic
 *  in both cases; only the strength of the sentence around it changes. */
export type RecommendationConfidence = "strong" | "moderate" | "indicative";

/** One entry of the always-present top-3 occupational recommendation.
 *
 *  ── WHY THIS EXISTS ──────────────────────────────────────────────────
 *
 *  Every threshold in this file is an EXCLUSION: a profession the candidate
 *  has no differentiated affinity with is dropped rather than shown weakly.
 *  Applied to a genuinely balanced profile — several comparable strengths,
 *  no dominant one, which is a real and common result and the one the report
 *  calls "Bred profil" — every profession in the catalogue can fail on the
 *  per-dimension miss floor or the neutral-baseline z, and the candidate
 *  reaches the end of twenty-eight questions with no occupation named at
 *  all. Career Discovery is an orientation product; producing no orientation
 *  is not an acceptable outcome of completing it.
 *
 *  So ordering and eligibility are separated. The gated tiers above are
 *  untouched and still decide what may be presented as a FIT. This ranking
 *  answers the different, always-answerable question "of the calibrated
 *  professions, which are closest to these answers, in what order" — same
 *  scoring, same comparator, same determinism, weaker words. */
export interface RankedProfession {
  /** 1, 2, 3 — the presentation order, stated rather than implied by array
   *  position so a consumer cannot re-sort it into a different claim. */
  readonly rank: number;
  readonly match: ProfessionMatch;
  readonly confidence: RecommendationConfidence;
}

/** How many professions the recommendation names. Mirrors
 *  STRONGEST_DIRECTIONS_MAX deliberately: the report already treats three as
 *  the number of directions a person can hold in mind at once. */
const RANKED_RECOMMENDATION_MAX = 3;

export interface ProfessionMatchResult {
  readonly available: boolean;
  /** The always-present top-3 occupational recommendation, rank 1 first.
   *  Empty ONLY when the catalogue itself is empty or nothing in it could be
   *  scored at all — never merely because nothing cleared the fit gates.
   *  Entries may or may not also appear in `matches`; `confidence` says
   *  which. See RankedProfession. */
  readonly ranked: readonly RankedProfession[];
  /** Every profession that cleared PROFESSION_MIN_FIT and PROFESSION_MIN_COVERAGE,
   *  in no particular cross-tier order — group by `stage` to render. */
  readonly matches: readonly ProfessionMatch[];
  /** Presentation grouping (see file header): the top explore_now
   *  professions by fit, usually 3. */
  readonly strongestDirections: readonly ProfessionMatch[];
  /** Remaining explore_now professions, plus possible_next_step. */
  readonly alsoWorthExploring: readonly ProfessionMatch[];
  /** stage === "longer_term". */
  readonly longerTermPossibilities: readonly ProfessionMatch[];
  /** stage === "career_pivot" — real affinity, different direction. Kept
   *  separate from alsoWorthExploring so a renderer never has to guess
   *  whether a card in that bucket is "next" or "sideways" (§12-13). */
  readonly careerPivots: readonly ProfessionMatch[];
  /** The candidate's self-reported current profession's OWN match entry,
   *  when it also clears matching against their Career DNA (Master
   *  Completion Mandate item 8) — pulled OUT of `matches` and every bucket
   *  above, never presented as a new discovery just because raw affinity
   *  happens to be high. A renderer shows this as "YOU ARE HERE" /
   *  "DEVELOP IN YOUR CURRENT ROLE", never alongside "explore now" cards.
   *  Null when current profession is unknown, or known but did not itself
   *  clear scoreProfession's fit gate against this candidate's DNA (the
   *  title still reaches the report separately, via ReportSnapshot.
   *  currentProfession — this field only carries the match/explanation
   *  data, never invents one). */
  readonly currentProfessionMatch: ProfessionMatch | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Mirrors scoring.ts's own round4, and for the same reason: floating-point
 *  addition is not associative, so a z-score plus a bonus can differ in the
 *  last bits depending on evaluation order. Rounding at the boundary keeps
 *  the ranking byte-identical across runs, which the frozen fixtures and the
 *  immutable stored reports both depend on. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function fitTierFor(expressionZ: number | null): ProfessionFitTier {
  return expressionZ !== null && expressionZ >= FIT_TIER_STRONG_Z ? "strong" : "moderate";
}

/** Raw stage-rank distance (profession minus candidate baseline). Positive
 *  means "ahead of the candidate", negative means "behind them" — the sign
 *  classifyCareerPivots needs and the pre-existing explore_now /
 *  possible_next_step / longer_term bucketing collapses away. */
function stageDistance(professionStage: ProfessionCareerStage, baseline: StageRank): number {
  return PROFESSION_STAGE_RANK[professionStage] - baseline;
}

function stageFor(distance: number): Exclude<ProfessionStage, "career_pivot"> {
  if (distance <= 0) return "explore_now";
  if (distance === 1) return "possible_next_step";
  return "longer_term";
}

/** A scored match plus internal-only fields used for sorting and pivot
 *  classification within this module. Neither fitScore nor distance ever
 *  reaches the public ProfessionMatch shape — see the file header's "no
 *  percentages, ever" rule; distance is likewise fully absorbed into the
 *  qualitative `stage` before anything leaves this module. */
interface ScoredMatch {
  readonly match: ProfessionMatch;
  readonly fitScore: number;
  readonly distance: number;
  readonly centralFitScore: number | null;
  readonly supportingFitScore: number | null;
  readonly centralCoverage: number | null;
  /** See the file header's "NEUTRAL-BASELINE Z-SCORE" section — the actual
   *  discriminator behind inclusion (PROFESSION_MIN_CENTRAL_Z) and fitTier
   *  (FIT_TIER_STRONG_Z). Null only when the profession has no central bands
   *  at all (should not occur given first-wave authoring). */
  readonly centralZ: number | null;
  /** The RANKING half of Profession Affinity — see centralExpressionZ.
   *  `centralZ` decides whether a profession qualifies; this decides where
   *  it sits among the ones that did. Null under the same conditions. */
  readonly centralExpressionZ: number | null;
  /** Recommendation Priority (Mandate items 1/4/5) — starts equal to
   *  `centralExpressionZ` (pure Profession Affinity, in standard deviations above the
   *  neutral baseline) and gets the bounded context/CIG bonuses added by
   *  withPriorityScore below, once cigReachableSlugs is known. Never used
   *  inside scoreProfession itself — Affinity is computed with zero
   *  knowledge of context, by construction.
   *
   *  Null exactly when `centralZ` is null (a profession with no central
   *  bands at all): there is no differentiated affinity to prioritise, so
   *  comparePriority orders such a profession below every profession that
   *  has one rather than inventing a number for it. */
  readonly priorityZ: number | null;
}

/** Attaches the bounded Recommendation Priority bonus on top of a already-
 *  computed Profession Affinity (scoreProfession's fitScore) — see the
 *  CONTEXT_PRIORITY_BONUS / CIG_PATHWAY_PRIORITY_BONUS doc comment below
 *  for why the ceiling is deliberately small. Pure post-processing: cannot
 *  change which professions cleared the fit gate, only how the survivors
 *  are ordered against each other. */
function withPriorityScore(m: ScoredMatch, cigReachableSlugs: ReadonlySet<string>): ScoredMatch {
  if (m.centralExpressionZ === null) return { ...m, priorityZ: null };
  const contextBonus = m.match.contextCorroborated ? CONTEXT_PRIORITY_BONUS_Z : 0;
  const cigBonus =
    m.match.cigProfessionSlug !== null && cigReachableSlugs.has(m.match.cigProfessionSlug)
      ? CIG_PATHWAY_PRIORITY_BONUS_Z
      : 0;
  return { ...m, priorityZ: round4(m.centralExpressionZ + contextBonus + cigBonus) };
}

interface BandFit {
  readonly fitScore: number | null; // null when nothing in this subset was observed
  readonly observedWeight: number;
  readonly totalWeight: number;
  readonly aligned: readonly { dimension: DimensionId; margin: number; weight: number }[];
  /** Largest single (bandLow - score) among observed, missed bands in this
   *  subset — null when nothing was missed. Feeds CENTRAL_DIMENSION_MAX_MISS;
   *  see that constant for why the weighted average alone isn't enough. */
  readonly worstMiss: number | null;
}

/** Asymmetric distance fit (PMR001: exceeding a band is never a penalty)
 *  over exactly the bands passed in — the shared arithmetic core, applied
 *  once to central dimensions and once to supporting/neutral ones so they
 *  can be combined central-dominant rather than pooled. */
function fitOver(bands: readonly ProfessionDimensionBand[], dims: DimensionResult): BandFit {
  const totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
  let observedWeight = 0;
  let penalty = 0;
  let worstMiss: number | null = null;
  const aligned: { dimension: DimensionId; margin: number; weight: number }[] = [];

  for (const band of bands) {
    const score = dims.dimensions[band.dimensionId]?.score;
    if (score === null || score === undefined) continue;

    observedWeight += band.weight;

    if (score >= band.bandLow) {
      aligned.push({
        dimension: band.dimensionId,
        margin: score - band.bandLow,
        weight: band.weight,
      });
    } else {
      const miss = band.bandLow - score;
      penalty += miss * band.weight;
      worstMiss = worstMiss === null ? miss : Math.max(worstMiss, miss);
    }
  }

  return {
    fitScore: observedWeight > 0 ? round1(Math.max(0, 100 * (1 - penalty / observedWeight))) : null,
    observedWeight,
    totalWeight,
    aligned,
    worstMiss,
  };
}

/**
 * See the file header's "NEUTRAL-BASELINE Z-SCORE" section — this mirrors
 * career-areas.ts's AREA_RANK_METHOD derivation exactly, applied to a
 * profession's CENTRAL bands only (empirically the only group whose z is
 * discriminating; supporting bands' low floors give them near-zero neutral
 * variance, so any clearance produces an enormous, uninformative z).
 *
 * For one weighted band (floor L, weight w), under H0 the candidate's score
 * on that dimension ~ Uniform(0,1), independent across dimensions:
 *   E[w * max(0, L - X)]   = w * L^2 / 2            (expected shortfall)
 *   Var[w * max(0, L - X)] = w^2 * (L^3/3 - L^4/4)   (variance of shortfall)
 * Summed over the candidate's OBSERVED central bands gives this profession's
 * own difficulty and discriminating power — a pure function of its locked
 * band data, nothing invented. z = (expected - actual) / sqrt(variance): a
 * HIGHER z means the candidate clears this profession's central bar by more
 * standard deviations than an uninformative candidate would, correctly
 * rewarding genuine central alignment more for a profession whose central
 * bands are demanding/high-variance than for one whose are lenient.
 */
function neutralBaselineCentralZ(
  bands: readonly ProfessionDimensionBand[],
  dims: DimensionResult,
): number | null {
  let actualPenalty = 0;
  let eNeutral = 0;
  let varNeutral = 0;
  let anyObserved = false;

  for (const band of bands) {
    const score = dims.dimensions[band.dimensionId]?.score;
    if (score === null || score === undefined) continue;
    anyObserved = true;
    const L = band.bandLow;
    const w = band.weight;
    if (score < L) actualPenalty += (L - score) * w;
    eNeutral += (w * L * L) / 2;
    varNeutral += w * w * (L ** 3 / 3 - L ** 4 / 4);
  }

  if (!anyObserved) return null;
  // Zero variance only if every observed central floor is 0 or 1, which does
  // not occur in the locked data — guarded anyway so a future content change
  // degrades honestly to "no separation signal" rather than dividing by zero.
  if (varNeutral <= 0) return 0;
  return (eNeutral - actualPenalty) / Math.sqrt(varNeutral);
}

/**
 * Central EXPRESSION strength, standardised under the same neutral H0 that
 * neutralBaselineCentralZ uses — the ranking statistic (Profession
 * Recommendation Validation mandate, defect D5).
 *
 * ── WHY A SECOND STATISTIC WAS UNAVOIDABLE ─────────────────────────────
 *
 * `neutralBaselineCentralZ` is built on the CLIPPED shortfall
 * `max(0, bandLow - score)`. That is exactly right for deciding
 * ELIGIBILITY: it asks "did the candidate fail this profession's defining
 * floors, and by more than chance would explain?". It is structurally
 * incapable of deciding ORDER, because every candidate who clears all of a
 * profession's central floors has shortfall 0 and therefore receives that
 * profession's maximum possible z — a constant of the profession's own
 * calibration, not a fact about the candidate.
 *
 * Measured on the locked first-wave catalogue, that ceiling is essentially
 * the number of central bands the calibration author happened to write:
 * 3 bands -> 1.46-1.65, 2 bands -> 1.17-1.33, 1 band -> 0.84. So whenever
 * two professions both clear (the common case — the floors cluster at
 * 0.5-0.65), ranking on centralZ ranks them by band COUNT and by nothing
 * about the candidate at all. Verified directly: the Beginner Technical
 * persona sits at the exact ceiling for both SOC Analyst (1.59) and
 * Security Technician (1.17), so their relative order carried zero fit
 * information.
 *
 * ── THE STATISTIC ──────────────────────────────────────────────────────
 *
 * Rather than invent a gradation for the shortfall, this asks the question
 * the ranking actually needs and the floors cannot answer: how strongly
 * does this candidate express THIS profession's defining dimensions,
 * compared with an uninformative candidate? For weighted central bands and
 * the same maximum-entropy H0 (each central dimension independently
 * Uniform(0,1)):
 *
 *   A        = Σ w · score                     (weighted expression)
 *   E[A]     = Σ w / 2
 *   Var[A]   = Σ w² / 12
 *   z_expr   = (A - Σw/2) / sqrt(Σw²/12)
 *
 * Full gradation above the floor, so exceeding a band keeps earning credit
 * — and it reads only `weight` and the candidate's own scores, both locked
 * data. It deliberately does NOT read `bandHigh`: that column is a
 * mechanical bandLow + 0.3..0.4 offset with no calibrated semantics (see
 * the file header's rejected-alternatives note), and nothing here gives it
 * new authority it was never calibrated to carry.
 *
 * ── THE DIVISION OF LABOUR THIS CREATES ────────────────────────────────
 *
 * Floors decide ELIGIBILITY (PROFESSION_MIN_CENTRAL_FIT,
 * CENTRAL_DIMENSION_MAX_MISS, PROFESSION_MIN_CENTRAL_Z, and fitTier — all
 * unchanged, all still on the clipped statistic). Expression decides ORDER.
 * A profession whose defining dimensions the candidate has not actually
 * engaged with is still excluded outright before this function's value is
 * ever consulted, so a high expression score can never rescue poor
 * affinity — it only ever orders professions that already qualified.
 */
function centralExpressionZ(
  bands: readonly ProfessionDimensionBand[],
  dims: DimensionResult,
): number | null {
  let a = 0;
  let sumW = 0;
  let sumW2 = 0;
  let anyObserved = false;

  for (const band of bands) {
    const score = dims.dimensions[band.dimensionId]?.score;
    if (score === null || score === undefined) continue;
    anyObserved = true;
    a += band.weight * score;
    sumW += band.weight;
    sumW2 += band.weight * band.weight;
  }

  if (!anyObserved || sumW2 <= 0) return null;
  return (a - sumW / 2) / Math.sqrt(sumW2 / 12);
}

/**
 * Score one profession against a candidate's dimensions. Returns null when
 * coverage is too thin, central fit cannot be honestly assessed, or the
 * candidate's central neutral-baseline z-score does not clear
 * PROFESSION_MIN_CENTRAL_Z — the caller filters nulls rather than this
 * function silently including a profession it cannot honestly evaluate, or
 * one the candidate has no real, differentiated affinity with.
 */
function scoreProfession(
  entry: ProfessionCatalogEntry,
  dims: DimensionResult,
  baseline: StageRank,
  discoveryTags: readonly string[],
  /** Whether the recommendation gates apply.
   *
   *  `true` (the default, and the only mode that feeds the tier buckets)
   *  keeps every threshold below exactly as it was: a profession the
   *  candidate has no real, differentiated affinity with is excluded
   *  outright, and the report never claims a fit it cannot support.
   *
   *  `false` scores the same profession by the same formula and skips only
   *  the EXCLUSION returns, so an affinity ORDER exists across the whole
   *  catalogue even when nothing clears. That ordering is what the always-
   *  present top-3 recommendation is built from, and it is presented with
   *  its own, weaker confidence word — see RankedProfession. Structural
   *  impossibilities (no weighted bands, nothing observed at all) still
   *  return null in both modes: there is no honest ordering to give. */
  gate = true,
): ScoredMatch | null {
  const weighted = entry.bands.filter(
    (b) => b.weight > 0 && MATCHABLE_DIMENSION_IDS.includes(b.dimensionId),
  );
  const totalWeight = weighted.reduce((sum, b) => sum + b.weight, 0);
  if (totalWeight <= 0) return null;

  const centralBands = weighted.filter((b) => b.centrality === "central");
  const supportingBands = weighted.filter((b) => b.centrality !== "central");

  const central = fitOver(centralBands, dims);
  const supporting = fitOver(supportingBands, dims);

  const observedWeight = central.observedWeight + supporting.observedWeight;
  const coverage = observedWeight / totalWeight;
  // Nothing observed at all is a structural impossibility, not a threshold:
  // there is no ordering to give, gated or not.
  if (observedWeight <= 0) return null;
  if (gate && coverage < PROFESSION_MIN_COVERAGE) return null;

  let centralZ: number | null = null;
  let expressionZ: number | null = null;
  // A profession's central (defining) dimensions must themselves be both
  // sufficiently observed AND genuinely, differentially matched — generic
  // supporting evidence cannot buy a profession's way past this gate. See
  // the file header for why the discriminator is centralZ, not fitScore.
  if (central.totalWeight > 0) {
    const centralCoverage = central.observedWeight / central.totalWeight;
    if (gate && centralCoverage < PROFESSION_MIN_CENTRAL_COVERAGE) return null;
    if (gate && (central.fitScore ?? 0) < PROFESSION_MIN_CENTRAL_FIT) return null;
    // Hard per-dimension floor — see CENTRAL_DIMENSION_MAX_MISS. Catches the
    // case the weighted average above cannot: one badly missed central
    // dimension diluted by others that were comfortably met.
    if (gate && central.worstMiss !== null && central.worstMiss > CENTRAL_DIMENSION_MAX_MISS) {
      return null;
    }
    centralZ = neutralBaselineCentralZ(centralBands, dims);
    if (gate && centralZ !== null && centralZ <= PROFESSION_MIN_CENTRAL_Z) return null;
    expressionZ = centralExpressionZ(centralBands, dims);
  }

  // Combine central-dominant. A profession with no central dimensions at
  // all (should not occur given first-wave authoring, but the formula
  // stays honest about it) falls back to supporting fit alone.
  const fitScore =
    central.totalWeight > 0 && supporting.totalWeight > 0
      ? round1(
          CENTRAL_WEIGHT * (central.fitScore ?? 0) +
            (1 - CENTRAL_WEIGHT) * (supporting.fitScore ?? 0),
        )
      : round1(central.fitScore ?? supporting.fitScore ?? 0);

  // Belt-and-suspenders absolute floor, unchanged value — rarely the
  // binding constraint now that centralZ gates inclusion above, but kept so
  // a profession with no central bands at all (falls back to supporting
  // fit alone, centralZ stays null) still cannot clear on trivial supporting
  // evidence alone.
  if (gate && fitScore < PROFESSION_MIN_FIT) return null;

  const aligned = [...central.aligned, ...supporting.aligned];
  const distance = stageDistance(entry.careerStage, baseline);

  return {
    match: {
      professionId: entry.professionId,
      cigProfessionSlug: entry.cigProfessionSlug,
      careerAreaId: entry.careerAreaId,
      titleSv: entry.titleSv,
      titleEn: entry.titleEn,
      fitTier: fitTierFor(expressionZ),
      stage: stageFor(distance),
      regulated: entry.regulated,
      inclusionRationaleSv: entry.inclusionRationaleSv,
      inclusionRationaleEn: entry.inclusionRationaleEn,
      limitationNoteSv: entry.limitationNoteSv,
      limitationNoteEn: entry.limitationNoteEn,
      // Central evidence leads even here — margin/weight only break ties
      // among dimensions of the same centrality, not across it, so a
      // profession's own defining traits are what the candidate sees cited
      // as "why", not incidentally-strong generic ones.
      alignedDimensions: aligned
        .sort((a, b) => {
          const aCentral = centralBands.some((b2) => b2.dimensionId === a.dimension) ? 1 : 0;
          const bCentral = centralBands.some((b2) => b2.dimensionId === b.dimension) ? 1 : 0;
          return (
            bCentral - aCentral ||
            b.weight - a.weight ||
            b.margin - a.margin ||
            a.dimension.localeCompare(b.dimension)
          );
        })
        .slice(0, 4)
        .map((a) => a.dimension),
      coverage: round1(coverage * 100) / 100,
      contextCorroborated: (CORROBORATING_TAGS_BY_AREA[entry.careerAreaId] ?? []).some((tag) =>
        discoveryTags.includes(tag),
      ),
    },
    fitScore,
    distance,
    centralFitScore: central.fitScore,
    supportingFitScore: supporting.fitScore,
    centralCoverage: central.totalWeight > 0 ? central.observedWeight / central.totalWeight : null,
    centralZ,
    centralExpressionZ: expressionZ,
    // Pure Profession Affinity, no context bonus yet — withPriorityScore
    // adds that afterward, once cigReachableSlugs is known. Affinity itself
    // is computed with zero knowledge of context, by construction.
    priorityZ: expressionZ,
  };
}

/**
 * Recommendation Priority (Master Completion Mandate items 1/4/5): a
 * bounded, deterministic reordering signal layered ON TOP of Profession
 * Affinity — never a replacement for it, and never able to rescue a
 * profession that did not clear the fit gate in scoreProfession (this
 * function only ever runs on matches that already survived it).
 *
 * ── WHY THIS IS EXPRESSED IN Z UNITS (Profession Recommendation Validation
 *    mandate, defect D2) ────────────────────────────────────────────────
 *
 * The previous constants were +6 and +6 on the 0-100 `fitScore` scale, and
 * their doc comment justified that ceiling against "the 18-point gap between
 * PROFESSION_MIN_FIT (62) and FIT_TIER_STRONG (80)". That reasoning was
 * sound when it was written and was silently invalidated by the later
 * neutral-baseline-z change (see the file header): once `centralZ` became
 * the inclusion gate, everything that survives scoring has already cleared
 * its band floors, so `fitScore` — which is floor-only, and never reads
 * `bandHigh` — saturates near the top of its range. The gap the bonus was
 * measured against stopped existing.
 *
 * Measured on the eight answer-level regression personas (see
 * scripts/fixtures/career-dna-personas.ts): the fitScore spread across a
 * persona's entire STRONG tier is 0.7-3.9 points, so a flat +6 was worth
 * between 1.5x and 8x the whole observable affinity range. It could not
 * "only nudge near-peers"; it decided the order outright. Demonstrated: the
 * Beginner Technical persona, identical Career DNA, returns Säkerhetstekniker
 * #1 with an SCA03 Discovery-Path tag and SOC Analyst #1 with an SCA09 one —
 * a single unscored contextual self-report answer moving the headline
 * recommendation, which is exactly what "context must not fabricate
 * affinity" forbids.
 *
 * The fix is not a smaller number on the wrong scale — it is to express the
 * bonus in the SAME UNITS as the discriminator it is nudging. `centralZ` is
 * in standard deviations above the neutral baseline, and its spread across a
 * persona's strong tier is 0.16-0.60 SD. A combined ceiling of 0.20 SD is
 * therefore comparable to the gap between genuine near-peers (typically
 * 0.02-0.15 SD) and structurally incapable of bridging the 0.4 SD-plus gaps
 * that separate real affinity levels. "Reorders close matches, cannot
 * overwhelm poor affinity" is now a property of the arithmetic rather than a
 * claim in a comment — and it is asserted directly by the mandate's
 * context-dominance regression check.
 */
export const CONTEXT_PRIORITY_BONUS_Z = 0.1;
export const CIG_PATHWAY_PRIORITY_BONUS_Z = 0.1;

/**
 * The recommendation comparator. Most significant criterion first.
 *
 * ── WHY THIS IS NOT `fitScore` ANY MORE (defect D1) ────────────────────
 *
 * The previous `sortScore` packed everything into one number, with
 * `priorityScore` (= `fitScore` + bonuses) as the dominant continuous term.
 * That made the floor-only closeness percentage the thing that actually
 * decided every ranking, while `centralZ` — the metric the file header
 * introduces specifically BECAUSE fitScore cannot discriminate — was reduced
 * to setting a binary tier. Across all eight answer-level regression
 * personas the delivered order differed from the centralZ order in 8 of 8
 * cases, on fitScore differences as small as 0.2 points: an experienced
 * Security Technician's #1 recommendation came out as Security Investigator
 * (99.6 vs 99.4), and a Head of Security with 8+ years was recommended
 * Police Officer at #2 — the same false-progression presentation Owner
 * Approval Gate §6/§8 forbid, arriving through the ranking layer this time
 * rather than through the fit layer the header had already fixed.
 *
 * So the order now runs on `priorityZ` (centralZ plus the bounded bonuses
 * above). `fitScore` keeps its exact original meaning and formula and stays
 * in the diagnostics, but is demoted to a tie-break — which is all a
 * saturating metric can honestly support.
 */
function comparePriority(a: ScoredMatch, b: ScoredMatch): number {
  const aStrong = a.match.fitTier === "strong" ? 1 : 0;
  const bStrong = b.match.fitTier === "strong" ? 1 : 0;
  if (aStrong !== bStrong) return bStrong - aStrong;

  // A profession with no central bands at all has no differentiated
  // affinity to prioritise. It orders below every profession that has one
  // rather than being given an invented number — same honesty rule the
  // rest of this module applies to unobserved evidence.
  if (a.priorityZ === null || b.priorityZ === null) {
    if (a.priorityZ !== b.priorityZ) return a.priorityZ === null ? 1 : -1;
  } else if (a.priorityZ !== b.priorityZ) {
    return b.priorityZ - a.priorityZ;
  }

  if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
  const breadth = b.match.alignedDimensions.length - a.match.alignedDimensions.length;
  if (breadth !== 0) return breadth;
  return a.match.professionId.localeCompare(b.match.professionId);
}

const STRONGEST_DIRECTIONS_MAX = 3;

/** Release Completion mandate §89: a career_pivot claim ("consider a
 *  different, lower-stage direction") is a stronger claim than a same-or-
 *  higher-stage recommendation and deserves the same restraint
 *  STRONGEST_DIRECTIONS_MAX already applies there — mirrors that constant
 *  rather than inventing a new number. Before centralZ-based inclusion
 *  (see the file header), a broadly capable senior candidate could see 7-11
 *  career_pivot cards (every lower-stage profession that cleared the old
 *  floor-only gate); `scored` is already sorted by Recommendation Priority
 *  before classifyStagesWithPivots runs, so this keeps only the most
 *  genuinely differentiated pivots. */
const CAREER_PIVOT_MAX = STRONGEST_DIRECTIONS_MAX;

/**
 * Reclassifies "explore_now" matches that are actually a change of
 * direction, not a next step, as "career_pivot" (§12-13, refined further by
 * Master Completion Mandate items 2, 5 and 7).
 *
 * Requires a REAL, self-reported current profession (career-context.ts).
 * Item 2 is explicit: Career DNA tells us how a candidate prefers to work,
 * never what job they currently hold — inferring a "primary direction"
 * from their best-fitting match (the previous version of this function)
 * was exactly that violation, removed here. When current profession is
 * unknown, NOTHING in this function runs — every match keeps its plain
 * stage-distance classification (explore_now / possible_next_step /
 * longer_term) and career_pivot simply never appears. Unknown stays
 * unknown; no concrete "you are here" is fabricated.
 *
 * When current profession IS known, a match strictly behind the candidate's
 * baseline stage (distance < 0) is a pivot UNLESS either:
 *
 *   1. It is directly reachable from the current profession via a real CIG
 *      transition edge (`cigReachableSlugs` — item 7: "actual profession
 *      relationships are more useful" than area comparison) — a documented
 *      next step stays a next step even across career areas; or
 *   2. It sits in the SAME career area as the current profession — a
 *      lesser role in the candidate's own track, kept as a fallback signal
 *      when no CIG edge data exists for this specific pair.
 *
 * `scored` must already be sorted by Recommendation Priority so tie-break
 * ordering elsewhere in this module stays consistent.
 */
function classifyStagesWithPivots(
  scored: readonly ScoredMatch[],
  currentProfessionAreaId: string | null,
  cigReachableSlugs: ReadonlySet<string>,
): readonly ProfessionMatch[] {
  if (currentProfessionAreaId === null) {
    // Item 2: current profession unknown -> no pivot computation at all.
    return scored.map((m) => m.match);
  }

  return scored.map(({ match, distance }) => {
    if (distance >= 0) return match;
    const isDocumentedNextStep =
      (match.cigProfessionSlug !== null && cigReachableSlugs.has(match.cigProfessionSlug)) ||
      match.careerAreaId === currentProfessionAreaId;
    return isDocumentedNextStep ? match : { ...match, stage: "career_pivot" as const };
  });
}

/**
 * Match a candidate's scored dimensions against a profession catalogue.
 *
 * Pure. The catalogue must already be filtered to `approved_for_ranking =
 * true` professions by the caller — this function has no way to check that
 * and does not try to. An empty catalogue (the case for every real
 * candidate today, since nothing is yet approved) correctly yields
 * `available: false`, matching the ProfessionOutput stub this replaces.
 */
export function matchProfessions(
  dims: DimensionResult,
  catalog: readonly ProfessionCatalogEntry[],
  contextStatus: ContextStatus | null,
  /** The candidate's self-reported current profession (career-context.ts),
   *  as a CIG slug — contextual self-report. Read ONLY to (a) ground the
   *  career-pivot decision in fact (classifyStagesWithPivots — never
   *  inferred, see item 2) and (b) resolve cigReachableSlugs. Never affects
   *  fit, never affects which professions clear matching, never touched by
   *  scoreProfession. */
  currentProfessionCigSlug?: string | null,
  /** Report tags from the candidate's 4 Discovery Path answers (Mandate
   *  item 6, personal-layer.ts's reportTagsFor) — contextual self-report,
   *  never scored. Read to set ProfessionMatch.contextCorroborated
   *  (explanation) AND the bounded Recommendation Priority bonus
   *  (withPriorityScore) — never affects fit, coverage or which
   *  professions clear matching. */
  discoveryTags?: readonly string[],
  /** CIG profession slugs directly reachable from the candidate's current
   *  profession via a real `cig_career_transitions` edge (Mandate item 7)
   *  — fetched by the orchestration layer, this module never queries CIG
   *  itself. Empty/absent when current profession is unknown or has no
   *  documented transitions. Used only for career-pivot classification and
   *  the bounded CIG_PATHWAY_PRIORITY_BONUS — never fabricated, never
   *  invented to make a test pass (see classifyStagesWithPivots's header). */
  cigReachableSlugs?: ReadonlySet<string>,
  /** Self-reported experience band (career-context.ts) — contextual
   *  self-report, never scored, never fabricated. Read ONLY by
   *  resolveStageBaseline to refine WHICH stage a known current profession
   *  anchors at; absent/unknown falls back to the pre-existing C1-only
   *  baseline exactly as before (Owner Security Manager scenario fix). */
  experienceBand?: ExperienceBand | null,
): ProfessionMatchResult {
  if (catalog.length === 0) {
    return {
      available: false,
      ranked: [],
      matches: [],
      strongestDirections: [],
      alsoWorthExploring: [],
      longerTermPossibilities: [],
      careerPivots: [],
      currentProfessionMatch: null,
    };
  }

  const currentProfessionEntry = currentProfessionCigSlug
    ? catalog.find((c) => c.cigProfessionSlug === currentProfessionCigSlug)
    : undefined;
  const baseline = resolveStageBaseline(contextStatus, currentProfessionEntry, experienceBand);
  const tags = discoveryTags ?? [];
  const reachable = cigReachableSlugs ?? new Set<string>();

  const scored = catalog
    .map((entry) => scoreProfession(entry, dims, baseline, tags))
    .filter((m): m is ScoredMatch => m !== null)
    .map((m) => withPriorityScore(m, reachable))
    .sort(comparePriority);

  // ── THE ALWAYS-PRESENT RANKING ──────────────────────────────────────
  //
  // The same catalogue, the same scoring, the same comparator — with the
  // exclusion gates off, so an ORDER exists whether or not anything clears.
  // Computed separately from `scored` rather than by loosening it: the tier
  // buckets below must keep receiving exactly the gated set they always
  // have, and the two lists must be visibly, structurally different things.
  const gatedIds = new Set(scored.map((m) => m.match.professionId));
  const rankedAll = catalog
    .map((entry) => scoreProfession(entry, dims, baseline, tags, false))
    .filter((m): m is ScoredMatch => m !== null)
    .map((m) => withPriorityScore(m, reachable))
    .sort(comparePriority);

  const currentProfessionAreaId = currentProfessionEntry?.careerAreaId ?? null;
  const classified = classifyStagesWithPivots(scored, currentProfessionAreaId, reachable);
  // Defect D3 (Profession Recommendation Validation mandate): the ranking
  // pass has to run through the SAME stage classification the tier buckets
  // do. It previously did not, so `ranked[].match.stage` carried the raw
  // stage-distance value while `matches` carried the pivot-corrected one,
  // and the two candidate-facing surfaces of one result disagreed — a Head
  // of Security's own report called Police Officer "explore now" in the
  // recommendation and "career pivot" in the tier list, from the same run.
  // Five such mismatches across the eight regression personas.
  const rankedClassified = classifyStagesWithPivots(rankedAll, currentProfessionAreaId, reachable);

  // Item 8: the candidate's own current profession is never a "discovery" —
  // pull it out of the recommendation pool entirely before building buckets,
  // regardless of how high its raw affinity happens to be.
  const currentProfessionMatch =
    currentProfessionCigSlug !== null && currentProfessionCigSlug !== undefined
      ? (classified.find((m) => m.cigProfessionSlug === currentProfessionCigSlug) ?? null)
      : null;
  const matches =
    currentProfessionMatch !== null
      ? classified.filter((m) => m.professionId !== currentProfessionMatch.professionId)
      : classified;

  const exploreNow = matches.filter((m) => m.stage === "explore_now");
  const possibleNext = matches.filter((m) => m.stage === "possible_next_step");
  const longerTerm = matches.filter((m) => m.stage === "longer_term");
  // CAREER_PIVOT_MAX keeps only the MOST differentiated pivots, not
  // whichever happened to sort first under Recommendation Priority — a
  // stage-down claim needs the strongest evidence available, so this reaches
  // past `matches`' priority order back to each candidate's own centralZ
  // (Profession Affinity, computed with zero knowledge of context; see the
  // file header). `scored` still carries centralZ before classification
  // strips it away into the public ProfessionMatch shape.
  const centralZById = new Map(scored.map((m) => [m.match.professionId, m.centralZ] as const));
  const careerPivots = matches
    .filter((m) => m.stage === "career_pivot")
    .sort(
      (a, b) => (centralZById.get(b.professionId) ?? 0) - (centralZById.get(a.professionId) ?? 0),
    )
    .slice(0, CAREER_PIVOT_MAX);

  const strongestDirections = exploreNow.slice(0, STRONGEST_DIRECTIONS_MAX);
  const alsoWorthExploring = [...exploreNow.slice(STRONGEST_DIRECTIONS_MAX), ...possibleNext];

  // The recommendation. The candidate's OWN current profession is excluded
  // for the same reason item 8 excludes it from every discovery bucket: it
  // is where they already are, and naming it as the thing to move towards
  // is not a recommendation. It still reaches the report through
  // currentProfessionMatch / ReportSnapshot.currentProfession.
  //
  // `confidence` is read off the gated pass, not recomputed: a profession
  // that cleared every gate keeps the exact fitTier it earned there, and one
  // that did not is "indicative" no matter how high it ordered.
  const ranked: readonly RankedProfession[] = rankedClassified
    .filter((m) => m.cigProfessionSlug !== (currentProfessionCigSlug ?? null))
    .slice(0, RANKED_RECOMMENDATION_MAX)
    .map((m, i) => ({
      rank: i + 1,
      match: m,
      confidence: gatedIds.has(m.professionId)
        ? (m.fitTier satisfies "strong" | "moderate")
        : ("indicative" as const),
    }));

  return {
    // A candidate whose ONLY clearing profession is their own current role
    // still gets a real report (§8: "YOU ARE HERE"), not the "pending"
    // placeholder -- `matches` being empty in that case just means there is
    // nothing new to recommend today, which the renderer shows honestly.
    available: matches.length > 0 || currentProfessionMatch !== null,
    ranked,
    matches,
    strongestDirections,
    alsoWorthExploring,
    longerTermPossibilities: longerTerm,
    careerPivots,
    currentProfessionMatch,
  };
}

// -------------------------------------------------------------------------
// Diagnostics — ADMIN-ONLY (§14 / Master Completion Mandate item 3, "explicit
// separation"). Internal numeric diagnostics are acceptable in an owner
// review tool that will never be candidate-facing; ProfessionMatch itself
// still carries no fitScore, no percentage, ever (see the file header).
// This is a deliberately separate function, not a parameter that could leak
// onto the public path — matchProfessions above is completely unchanged by
// its existence.
// -------------------------------------------------------------------------

/** Named per the mandate's own two questions:
 *  Profession Affinity = "which professions resemble this candidate's
 *  Career DNA?" — fitScore/centralFitScore/supportingFitScore/
 *  centralCoverage, driven ONLY by scoreProfession, never by context.
 *  Recommendation Priority = "which of those affinities are most useful to
 *  show this candidate now?" — priorityScore (fitScore + the bounded
 *  contextPriorityBonus/cigPathwayBonus) and stageBeforePivotCheck/
 *  finalStage. Both live on one row here so an owner can compare them side
 *  by side; they are never combined into a single candidate-facing score. */
export interface ProfessionAffinityDiagnostic {
  readonly professionId: string;
  readonly titleEn: string;
  // --- Profession Affinity (Career DNA only) ---
  readonly fitScore: number;
  readonly fitTier: ProfessionFitTier;
  readonly centralFitScore: number | null;
  readonly supportingFitScore: number | null;
  readonly centralCoverage: number | null;
  /** The actual discriminator behind inclusion/fitTier now — see the file
   *  header's "NEUTRAL-BASELINE Z-SCORE" section. fitScore/centralFitScore
   *  keep their original 0-100 "closeness" meaning; this is what decides
   *  whether that closeness is genuinely differentiated from an
   *  uninformative baseline. Null only when the profession has no central
   *  bands at all. */
  readonly centralZ: number | null;
  readonly overallCoverage: number;
  // --- Recommendation Priority (context-aware interpretation) ---
  //
  // All three are in `centralZ`'s units (standard deviations above the
  // neutral baseline), not on fitScore's 0-100 scale — see
  // CONTEXT_PRIORITY_BONUS_Z for why the bonus had to move onto the same
  // scale as the quantity it nudges.
  readonly contextPriorityBonus: number;
  readonly cigPathwayBonus: number;
  /** centralZ + the two bounded bonuses. Null exactly when centralZ is
   *  null (a profession with no central bands at all). */
  readonly priorityScore: number | null;
  readonly stageDistance: number;
  readonly stageBeforePivotCheck: Exclude<ProfessionStage, "career_pivot">;
  readonly finalStage: ProfessionStage;
  readonly priorityChangedByPivot: boolean;
  /** True when this row IS the candidate's self-reported current profession
   *  (item 8) — the owner tool still shows its full Affinity/Priority
   *  numbers here for review, but the public `matches`/bucket output has
   *  already excluded it (see ProfessionMatchResult.currentProfessionMatch)
   *  so it never renders as a new discovery. */
  readonly isCurrentProfession: boolean;
}

export interface ProfessionMatchDiagnostics {
  readonly result: ProfessionMatchResult;
  readonly diagnostics: readonly ProfessionAffinityDiagnostic[];
  /** What grounded the career-pivot decision for this run (item 2: no
   *  DNA-inferred fallback exists any more — either a real current
   *  profession was reported, or pivot classification does not run at
   *  all). Answers "why did priority change" at the run level, before
   *  reading individual rows. */
  readonly pivotPrimaryAreaId: string | null;
  readonly pivotPrimarySource: "current_profession" | "none";
}

/**
 * Same matching as matchProfessions, plus the raw internal numbers behind
 * it — for the admin owner-preview tool ONLY (see the section header).
 */
export function matchProfessionsDiagnostics(
  dims: DimensionResult,
  catalog: readonly ProfessionCatalogEntry[],
  contextStatus: ContextStatus | null,
  currentProfessionCigSlug?: string | null,
  discoveryTags?: readonly string[],
  cigReachableSlugs?: ReadonlySet<string>,
  /** See matchProfessions's own doc comment for this parameter. */
  experienceBand?: ExperienceBand | null,
): ProfessionMatchDiagnostics {
  const result = matchProfessions(
    dims,
    catalog,
    contextStatus,
    currentProfessionCigSlug,
    discoveryTags,
    cigReachableSlugs,
    experienceBand,
  );

  if (catalog.length === 0) {
    return { result, diagnostics: [], pivotPrimaryAreaId: null, pivotPrimarySource: "none" };
  }

  const currentProfessionEntry = currentProfessionCigSlug
    ? catalog.find((c) => c.cigProfessionSlug === currentProfessionCigSlug)
    : undefined;
  const baseline = resolveStageBaseline(contextStatus, currentProfessionEntry, experienceBand);
  const tags = discoveryTags ?? [];
  const reachable = cigReachableSlugs ?? new Set<string>();
  const scored = catalog
    .map((entry) => scoreProfession(entry, dims, baseline, tags))
    .filter((m): m is ScoredMatch => m !== null)
    .map((m) => withPriorityScore(m, reachable))
    .sort(comparePriority);

  const currentProfessionAreaId = currentProfessionEntry?.careerAreaId ?? null;
  const pivotPrimaryAreaId = currentProfessionAreaId;
  const pivotPrimarySource: ProfessionMatchDiagnostics["pivotPrimarySource"] =
    currentProfessionAreaId !== null ? "current_profession" : "none";

  const finalStageById = new Map(result.matches.map((m) => [m.professionId, m.stage] as const));

  const diagnostics: ProfessionAffinityDiagnostic[] = scored.map((m) => {
    const stageBeforePivotCheck = stageFor(m.distance);
    const finalStage = finalStageById.get(m.match.professionId) ?? stageBeforePivotCheck;
    return {
      professionId: m.match.professionId,
      titleEn: m.match.titleEn,
      fitScore: m.fitScore,
      fitTier: m.match.fitTier,
      centralFitScore: m.centralFitScore,
      supportingFitScore: m.supportingFitScore,
      centralCoverage: m.centralCoverage,
      centralZ: m.centralZ,
      overallCoverage: m.match.coverage,
      contextPriorityBonus: m.match.contextCorroborated ? CONTEXT_PRIORITY_BONUS_Z : 0,
      cigPathwayBonus:
        m.match.cigProfessionSlug !== null && reachable.has(m.match.cigProfessionSlug)
          ? CIG_PATHWAY_PRIORITY_BONUS_Z
          : 0,
      priorityScore: m.priorityZ,
      stageDistance: m.distance,
      stageBeforePivotCheck,
      finalStage,
      priorityChangedByPivot: finalStage !== stageBeforePivotCheck,
      isCurrentProfession:
        currentProfessionCigSlug != null && m.match.cigProfessionSlug === currentProfessionCigSlug,
    };
  });

  return { result, diagnostics, pivotPrimaryAreaId, pivotPrimarySource };
}
