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
// ── SCORING MIRRORS rankCareerAreas ──────────────────────────────────────
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

export interface ProfessionDimensionBand {
  readonly dimensionId: DimensionId;
  readonly bandLow: number;
  readonly bandHigh: number;
  /** 0 for CID15 always (DB CHECK constraint), 0-1 otherwise. */
  readonly weight: number;
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

/** Below this fitScore (0-100), a profession is excluded from every
 *  recommendation tier regardless of career stage — a candidate is never
 *  shown a direction the evidence actively contradicts, even as
 *  "longer-term". Set above the ~56 a uniformly-near-floor candidate can
 *  still reach against a wide-banded supporting-dimension calibration (see
 *  scripts/career-discovery-v31-professions-check.ts §8) — a threshold that
 *  only excludes candidates who miss on a profession's CENTRAL dimensions,
 *  not one that a flat, uninformative score can accidentally clear. */
export const PROFESSION_MIN_FIT = 62;

const FIT_TIER_STRONG = 80;

export type ProfessionFitTier = "strong" | "moderate";

export type ProfessionStage = "explore_now" | "possible_next_step" | "longer_term";

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
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fitTierFor(score: number): ProfessionFitTier {
  return score >= FIT_TIER_STRONG ? "strong" : "moderate";
}

function stageFor(professionStage: ProfessionCareerStage, baseline: StageRank): ProfessionStage {
  const distance = PROFESSION_STAGE_RANK[professionStage] - baseline;
  if (distance <= 0) return "explore_now";
  if (distance === 1) return "possible_next_step";
  return "longer_term";
}

/** A scored match plus its internal fitScore, used only for sorting within
 *  this module. fitScore never reaches the public ProfessionMatch shape —
 *  see the file header's "no percentages, ever" rule. */
interface ScoredMatch {
  readonly match: ProfessionMatch;
  readonly fitScore: number;
}

/**
 * Score one profession against a candidate's dimensions. Returns null when
 * coverage is too thin or fit falls below PROFESSION_MIN_FIT — the caller
 * filters nulls rather than this function silently including a profession
 * it cannot honestly evaluate.
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

  let observedWeight = 0;
  let penalty = 0;
  const aligned: { dimension: DimensionId; margin: number; weight: number }[] = [];

  for (const band of weighted) {
    const score = dims.dimensions[band.dimensionId]?.score;
    if (score === null || score === undefined) continue;

    observedWeight += band.weight;

    if (score >= band.bandLow) {
      // At or above the floor is a full match, including above bandHigh —
      // exceeding a calibrated band is never a penalty (PMR001).
      aligned.push({
        dimension: band.dimensionId,
        margin: score - band.bandLow,
        weight: band.weight,
      });
    } else {
      penalty += (band.bandLow - score) * band.weight;
    }
  }

  const coverage = observedWeight / totalWeight;
  if (coverage < PROFESSION_MIN_COVERAGE) return null;

  const fitScore = round1(Math.max(0, 100 * (1 - penalty / observedWeight)));
  if (fitScore < PROFESSION_MIN_FIT) return null;

  return {
    match: {
      professionId: entry.professionId,
      cigProfessionSlug: entry.cigProfessionSlug,
      careerAreaId: entry.careerAreaId,
      titleSv: entry.titleSv,
      titleEn: entry.titleEn,
      fitTier: fitTierFor(fitScore),
      stage: stageFor(entry.careerStage, baseline),
      regulated: entry.regulated,
      inclusionRationaleSv: entry.inclusionRationaleSv,
      inclusionRationaleEn: entry.inclusionRationaleEn,
      limitationNoteSv: entry.limitationNoteSv,
      limitationNoteEn: entry.limitationNoteEn,
      alignedDimensions: aligned
        .sort(
          (a, b) =>
            b.weight - a.weight || b.margin - a.margin || a.dimension.localeCompare(b.dimension),
        )
        .slice(0, 4)
        .map((a) => a.dimension),
      coverage: round1(coverage * 100) / 100,
    },
    fitScore,
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
    };
  }

  const baseline = contextStatus ? CANDIDATE_STAGE_BASELINE[contextStatus] : DEFAULT_STAGE_BASELINE;

  const matches = catalog
    .map((entry) => scoreProfession(entry, dims, baseline))
    .filter((m): m is ScoredMatch => m !== null)
    .sort(
      (a, b) =>
        sortScore(b) - sortScore(a) || a.match.professionId.localeCompare(b.match.professionId),
    )
    .map((m) => m.match);

  const exploreNow = matches.filter((m) => m.stage === "explore_now");
  const possibleNext = matches.filter((m) => m.stage === "possible_next_step");
  const longerTerm = matches.filter((m) => m.stage === "longer_term");

  const strongestDirections = exploreNow.slice(0, STRONGEST_DIRECTIONS_MAX);
  const alsoWorthExploring = [...exploreNow.slice(STRONGEST_DIRECTIONS_MAX), ...possibleNext];

  return {
    available: matches.length > 0,
    matches,
    strongestDirections,
    alsoWorthExploring,
    longerTermPossibilities: longerTerm,
  };
}
