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

/** The candidate's inferred starting point, from C1 alone.
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
    },
    fitScore,
    distance,
  };
}

/** Sorts by fit tier first, then the actual fit magnitude within it — so
 *  when several professions all clear "strong", the candidate's genuinely
 *  best-fitting one leads rather than an alphabetical tie-break. fitScore is
 *  read here and nowhere past this function. */
function sortScore(m: ScoredMatch): number {
  return (
    (m.match.fitTier === "strong" ? 1 : 0) * 100000 +
    m.fitScore * 10 +
    m.match.alignedDimensions.length
  );
}

const STRONGEST_DIRECTIONS_MAX = 3;

/**
 * Reclassifies "explore_now" matches that are actually a change of
 * direction, not a next step, as "career_pivot" (§12-13).
 *
 * "primary direction" = the career area of the candidate's own best-fitting
 * match that is at or ahead of their baseline stage (distance >= 0) — the
 * direction their own explore-now/next-step tier is already pointing to. A
 * match strictly BEHIND the baseline (distance < 0, e.g. an entry-tier
 * profession for a developing-baseline candidate) is a pivot only when it
 * ALSO sits in a different career area than that primary direction — a
 * lesser role in the candidate's own track is still a normal, ordinary
 * "explore now" option (nothing dishonest about showing it), it is only
 * dishonest to present a genuinely different family as if it were the next
 * step. `scored` must already be sorted by fit (sortScore desc) so `.find`
 * picks the candidate's actual best same-or-ahead match, not an arbitrary
 * one — this is why classification happens here, after sorting, rather than
 * inside scoreProfession where no cross-profession ordering exists yet.
 */
function classifyStagesWithPivots(scored: readonly ScoredMatch[]): readonly ProfessionMatch[] {
  const primaryAreaId = scored.find((m) => m.distance >= 0)?.match.careerAreaId ?? null;

  return scored.map(({ match, distance }) => {
    const isPivot = distance < 0 && primaryAreaId !== null && match.careerAreaId !== primaryAreaId;
    return isPivot ? { ...match, stage: "career_pivot" as const } : match;
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
): ProfessionMatchResult {
  if (catalog.length === 0) {
    return {
      available: false,
      matches: [],
      strongestDirections: [],
      alsoWorthExploring: [],
      longerTermPossibilities: [],
      careerPivots: [],
    };
  }

  const baseline = contextStatus ? CANDIDATE_STAGE_BASELINE[contextStatus] : DEFAULT_STAGE_BASELINE;

  const scored = catalog
    .map((entry) => scoreProfession(entry, dims, baseline))
    .filter((m): m is ScoredMatch => m !== null)
    .sort(
      (a, b) =>
        sortScore(b) - sortScore(a) || a.match.professionId.localeCompare(b.match.professionId),
    );

  const matches = classifyStagesWithPivots(scored);

  const exploreNow = matches.filter((m) => m.stage === "explore_now");
  const possibleNext = matches.filter((m) => m.stage === "possible_next_step");
  const longerTerm = matches.filter((m) => m.stage === "longer_term");
  const careerPivots = matches.filter((m) => m.stage === "career_pivot");

  const strongestDirections = exploreNow.slice(0, STRONGEST_DIRECTIONS_MAX);
  const alsoWorthExploring = [...exploreNow.slice(STRONGEST_DIRECTIONS_MAX), ...possibleNext];

  return {
    available: matches.length > 0,
    matches,
    strongestDirections,
    alsoWorthExploring,
    longerTermPossibilities: longerTerm,
    careerPivots,
  };
}
