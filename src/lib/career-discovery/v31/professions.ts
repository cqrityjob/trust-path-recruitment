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
import { MATCHABLE_DIMENSION_IDS, type DimensionId } from "./dimensions";
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
 *  the central-dominant fit formula below and its header comment. */
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

const FIT_TIER_STRONG = 80;

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
  SCA02: ["trusted_operator", "operational_interest", "immediate_correction", "preventive_interest"],
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
  SCA10: ["specialist_path", "specialist_role", "trusted_adviser", "executive_alignment", "strategic_role"],
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

export interface ProfessionMatchResult {
  readonly available: boolean;
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

function fitTierFor(score: number): ProfessionFitTier {
  return score >= FIT_TIER_STRONG ? "strong" : "moderate";
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
  /** Recommendation Priority (Mandate items 1/4/5) — starts equal to
   *  fitScore (pure Profession Affinity) and gets the bounded context/CIG
   *  bonuses added by withPriorityScore below, once cigReachableSlugs is
   *  known. Never used inside scoreProfession itself — Affinity is computed
   *  with zero knowledge of context, by construction. */
  readonly priorityScore: number;
}

/** Attaches the bounded Recommendation Priority bonus on top of a already-
 *  computed Profession Affinity (scoreProfession's fitScore) — see the
 *  CONTEXT_PRIORITY_BONUS / CIG_PATHWAY_PRIORITY_BONUS doc comment below
 *  for why the ceiling is deliberately small. Pure post-processing: cannot
 *  change which professions cleared the fit gate, only how the survivors
 *  are ordered against each other. */
function withPriorityScore(m: ScoredMatch, cigReachableSlugs: ReadonlySet<string>): ScoredMatch {
  const contextBonus = m.match.contextCorroborated ? CONTEXT_PRIORITY_BONUS : 0;
  const cigBonus =
    m.match.cigProfessionSlug !== null && cigReachableSlugs.has(m.match.cigProfessionSlug)
      ? CIG_PATHWAY_PRIORITY_BONUS
      : 0;
  return { ...m, priorityScore: m.fitScore + contextBonus + cigBonus };
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
      aligned.push({ dimension: band.dimensionId, margin: score - band.bandLow, weight: band.weight });
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
 * Score one profession against a candidate's dimensions. Returns null when
 * coverage is too thin, central fit cannot be honestly assessed, or the
 * combined fit falls below PROFESSION_MIN_FIT — the caller filters nulls
 * rather than this function silently including a profession it cannot
 * honestly evaluate, or one the candidate has no real affinity with.
 */
function scoreProfession(
  entry: ProfessionCatalogEntry,
  dims: DimensionResult,
  baseline: StageRank,
  discoveryTags: readonly string[],
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
  if (coverage < PROFESSION_MIN_COVERAGE) return null;

  // The actual overmatching fix: a profession's central (defining)
  // dimensions must themselves be both sufficiently observed AND
  // sufficiently well matched. Generic supporting evidence cannot buy a
  // profession's way past this gate — see the file header.
  if (central.totalWeight > 0) {
    const centralCoverage = central.observedWeight / central.totalWeight;
    if (centralCoverage < PROFESSION_MIN_CENTRAL_COVERAGE) return null;
    if ((central.fitScore ?? 0) < PROFESSION_MIN_CENTRAL_FIT) return null;
    // Hard per-dimension floor — see CENTRAL_DIMENSION_MAX_MISS. Catches the
    // case the weighted average above cannot: one badly missed central
    // dimension diluted by others that were comfortably met.
    if (central.worstMiss !== null && central.worstMiss > CENTRAL_DIMENSION_MAX_MISS) return null;
  }

  // Combine central-dominant. A profession with no central dimensions at
  // all (should not occur given first-wave authoring, but the formula
  // stays honest about it) falls back to supporting fit alone.
  const fitScore =
    central.totalWeight > 0 && supporting.totalWeight > 0
      ? round1(CENTRAL_WEIGHT * (central.fitScore ?? 0) + (1 - CENTRAL_WEIGHT) * (supporting.fitScore ?? 0))
      : round1((central.fitScore ?? supporting.fitScore ?? 0));

  if (fitScore < PROFESSION_MIN_FIT) return null;

  const aligned = [...central.aligned, ...supporting.aligned];
  const distance = stageDistance(entry.careerStage, baseline);

  return {
    match: {
      professionId: entry.professionId,
      cigProfessionSlug: entry.cigProfessionSlug,
      careerAreaId: entry.careerAreaId,
      titleSv: entry.titleSv,
      titleEn: entry.titleEn,
      fitTier: fitTierFor(fitScore),
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
    // Pure Profession Affinity, no context bonus yet — withPriorityScore
    // adds that afterward, once cigReachableSlugs is known. Affinity itself
    // is computed with zero knowledge of context, by construction.
    priorityScore: fitScore,
  };
}

/**
 * Recommendation Priority (Master Completion Mandate items 1/4/5): a
 * bounded, deterministic reordering signal layered ON TOP of Profession
 * Affinity (fitScore) — never a replacement for it, and never able to
 * rescue a profession that did not clear the fit gate in scoreProfession
 * (this function only ever runs on matches that already survived it).
 *
 * The combined ceiling (CONTEXT_PRIORITY_BONUS + CIG_PATHWAY_PRIORITY_BONUS
 * = 12) is kept well under the 18-point gap between PROFESSION_MIN_FIT (62)
 * and FIT_TIER_STRONG (80) specifically so context/pathway evidence can
 * only ever reorder professions that are already close in Affinity — it
 * cannot let a barely-qualifying profession leapfrog a clearly stronger
 * one two fit tiers away. This is the deterministic, documented
 * reinterpretation of the historical "60% DNA / 25% context / 15% stage"
 * hypothesis: not a blind weighted sum, but Affinity remaining dominant by
 * construction, with context/pathway only nudging order among near-peers.
 */
const CONTEXT_PRIORITY_BONUS = 6;
const CIG_PATHWAY_PRIORITY_BONUS = 6;

/** Sorts by fit tier first, then Recommendation Priority (Affinity +
 *  the bounded context/pathway bonus above) — so when several professions
 *  all clear "strong", the one with the strongest COMBINED case leads,
 *  never one whose only edge is a generic tie-break. */
function sortScore(m: ScoredMatch): number {
  return (
    (m.match.fitTier === "strong" ? 1 : 0) * 100000 +
    m.priorityScore * 10 +
    m.match.alignedDimensions.length
  );
}

const STRONGEST_DIRECTIONS_MAX = 3;

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
    .sort(
      (a, b) =>
        sortScore(b) - sortScore(a) || a.match.professionId.localeCompare(b.match.professionId),
    );

  const currentProfessionAreaId = currentProfessionEntry?.careerAreaId ?? null;
  const classified = classifyStagesWithPivots(scored, currentProfessionAreaId, reachable);

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
  const careerPivots = matches.filter((m) => m.stage === "career_pivot");

  const strongestDirections = exploreNow.slice(0, STRONGEST_DIRECTIONS_MAX);
  const alsoWorthExploring = [...exploreNow.slice(STRONGEST_DIRECTIONS_MAX), ...possibleNext];

  return {
    // A candidate whose ONLY clearing profession is their own current role
    // still gets a real report (§8: "YOU ARE HERE"), not the "pending"
    // placeholder -- `matches` being empty in that case just means there is
    // nothing new to recommend today, which the renderer shows honestly.
    available: matches.length > 0 || currentProfessionMatch !== null,
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
  readonly overallCoverage: number;
  // --- Recommendation Priority (context-aware interpretation) ---
  readonly contextPriorityBonus: number;
  readonly cigPathwayBonus: number;
  readonly priorityScore: number;
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
    .sort(
      (a, b) =>
        sortScore(b) - sortScore(a) || a.match.professionId.localeCompare(b.match.professionId),
    );

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
      overallCoverage: m.match.coverage,
      contextPriorityBonus: m.match.contextCorroborated ? CONTEXT_PRIORITY_BONUS : 0,
      cigPathwayBonus:
        m.match.cigProfessionSlug !== null && reachable.has(m.match.cigProfessionSlug)
          ? CIG_PATHWAY_PRIORITY_BONUS
          : 0,
      priorityScore: m.priorityScore,
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
