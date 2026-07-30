// The 16-dimension scoring engine.
//
// A pure function. No I/O, no state, no clock, no randomness. Given the same
// answers it returns the same result forever, which is what makes a stored
// report reproducible and what lets the frozen persona fixtures detect any
// unversioned change.
//
// ── THE MODEL ──────────────────────────────────────────────────────────
//
//   contribution(item, dimension) = roleWeight × value
//
//   score(d)          = Σ contribution / Σ roleWeight      ∈ [0,1]
//   evidenceWeight(d) = Σ roleWeight
//   dominance(d)      = max single roleWeight / evidenceWeight
//
// Scale items contribute (raw−1)/9 to their declared primary at 0.70 and
// secondary at 0.30. Single-choice items contribute the selected option's
// loading for every dimension in the item's span.
//
// ── THE DEFECT THIS ENGINE EXISTS NOT TO REPEAT ────────────────────────
//
// The v2.1 engine could not distinguish "answered neutral" from "never
// asked": both arrived at the matcher as 0.5. A candidate who skipped a
// section was scored as average on it and matched accordingly.
//
// Here an unobserved dimension is `null` with confidence "none". It is never
// imputed, never defaulted, and never silently treated as a midpoint. Every
// consumer must handle null explicitly, which is the point.

import { DIMENSION_IDS, type DimensionId } from "./dimensions";
import { CORE_ITEM_BY_ID, normaliseScale, SCALE_MAX, SCALE_MIN } from "./core-items";
import { OPTION_BY_ID, ROLE_WEIGHTS, type LoadingRole } from "./option-matrix";
import { SCORING_VERSION } from "./version";

/** One stored answer, in the shape cd_evidence holds it. */
export type Answer =
  | { readonly itemId: string; readonly format: "scale"; readonly value: number }
  | { readonly itemId: string; readonly format: "single_choice"; readonly optionId: string };

export type Confidence = "none" | "low" | "medium" | "high";

/** Evidence-weight thresholds for the confidence bands.
 *
 *  Versioned configuration rather than literals at the point of use, so a
 *  recalibration after pilot is a config change and a version bump — not an
 *  engine rewrite (owner decision 6). */
export const CONFIDENCE_THRESHOLDS = {
  low: 0.7,
  medium: 1.2,
} as const;

export interface DimensionScore {
  readonly dimension: DimensionId;
  /** Normalised [0,1], or null when no evidence was observed. NEVER 0.5. */
  readonly score: number | null;
  /** Σ role weights actually realised by the answers given. */
  readonly evidenceWeight: number;
  /** Largest single item's share of the realised weight. */
  readonly dominance: number | null;
  /** Realised weight ÷ the weight a complete run would have produced. */
  readonly coverage: number;
  readonly confidence: Confidence;
  /** Item ids that contributed. The first link of the explanation chain. */
  readonly sources: readonly string[];
  /** True when every contribution came from a tertiary loading.
   *
   *  Owner decision A-2: tertiary evidence may not independently determine a
   *  Career Pattern, Career Area or Profession Match. Downstream consumers
   *  read this flag rather than re-deriving it. */
  readonly tertiaryOnly: boolean;
}

export interface DimensionResult {
  readonly scoringVersion: string;
  readonly dimensions: Readonly<Record<DimensionId, DimensionScore>>;
  /** Item ids answered, in registry order. */
  readonly answeredItems: readonly string[];
  /** True when all 20 core items were answered. */
  readonly complete: boolean;
}

interface Contribution {
  readonly itemId: string;
  readonly role: LoadingRole;
  readonly weight: number;
  readonly value: number;
}

export interface ScoringOptions {
  /** Owner decision A-2 requires results to be tested with and without
   *  tertiary contributions. That is a parameter, not a code branch, so the
   *  comparison is a function call in a test rather than an edit. */
  readonly includeTertiary?: boolean;
}

/** Every contribution a complete run would produce, used as the denominator
 *  for coverage. Computed once from the definition, not per call. */
const MAX_WEIGHT: Readonly<Record<DimensionId, number>> = buildMaxWeights();

function buildMaxWeights(): Record<DimensionId, number> {
  const max = Object.fromEntries(DIMENSION_IDS.map((d) => [d, 0])) as Record<DimensionId, number>;
  for (const item of Object.values(CORE_ITEM_BY_ID)) {
    if (item.format === "scale") {
      max[item.primary] += ROLE_WEIGHTS.primary;
      max[item.secondary] += ROLE_WEIGHTS.secondary;
    } else {
      // Every option in a set spans the same dimensions, so the first option
      // describes the item's full contribution regardless of what is chosen.
      const set = OPTION_BY_ID[`${item.id}_A`];
      if (!set) throw new Error(`option matrix is missing ${item.id}_A`);
      for (const l of set.loadings) max[l.dimension] += ROLE_WEIGHTS[l.role];
    }
  }
  return max;
}

/** The maximum evidence weight per dimension for a complete run. Exported so
 *  the guard script can assert the coverage table without recomputing it. */
export const MAX_EVIDENCE_WEIGHT = MAX_WEIGHT;

function confidenceFor(weight: number): Confidence {
  if (weight <= 0) return "none";
  if (weight < CONFIDENCE_THRESHOLDS.low) return "low";
  if (weight < CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "high";
}

/** Round to 4 decimal places.
 *
 *  Floating-point addition is not associative, so the same contributions
 *  summed in a different order can differ in the last bits. Rounding at the
 *  boundary makes the output byte-identical across runs, which the frozen
 *  fixtures depend on. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function scoreDimensions(
  answers: readonly Answer[],
  options: ScoringOptions = {},
): DimensionResult {
  const includeTertiary = options.includeTertiary ?? true;

  const byDimension = new Map<DimensionId, Contribution[]>();
  for (const d of DIMENSION_IDS) byDimension.set(d, []);

  const answeredItems: string[] = [];

  for (const answer of answers) {
    const item = CORE_ITEM_BY_ID[answer.itemId];
    if (!item) throw new Error(`unknown item: ${answer.itemId}`);
    if (item.format !== answer.format) {
      throw new Error(
        `${answer.itemId}: registry says ${item.format}, answer says ${answer.format}`,
      );
    }
    answeredItems.push(item.id);

    if (answer.format === "scale") {
      if (!Number.isFinite(answer.value) || answer.value < SCALE_MIN || answer.value > SCALE_MAX) {
        throw new Error(
          `${answer.itemId}: scale value ${answer.value} outside ${SCALE_MIN}..${SCALE_MAX}`,
        );
      }
      const v = normaliseScale(answer.value);
      byDimension.get(item.primary)!.push({
        itemId: item.id,
        role: "primary",
        weight: ROLE_WEIGHTS.primary,
        value: v,
      });
      byDimension.get(item.secondary)!.push({
        itemId: item.id,
        role: "secondary",
        weight: ROLE_WEIGHTS.secondary,
        value: v,
      });
      continue;
    }

    const option = OPTION_BY_ID[answer.optionId];
    if (!option) throw new Error(`unknown option: ${answer.optionId}`);
    if (!option.id.startsWith(`${item.id}_`)) {
      throw new Error(`${answer.optionId} does not belong to ${item.id}`);
    }
    for (const l of option.loadings) {
      if (l.role === "tertiary" && !includeTertiary) continue;
      byDimension.get(l.dimension)!.push({
        itemId: item.id,
        role: l.role,
        weight: ROLE_WEIGHTS[l.role],
        value: l.value,
      });
    }
  }

  const dimensions = Object.fromEntries(
    DIMENSION_IDS.map((d) => {
      const contributions = byDimension.get(d)!;
      const weight = contributions.reduce((s, c) => s + c.weight, 0);

      if (weight === 0) {
        return [
          d,
          {
            dimension: d,
            score: null,
            evidenceWeight: 0,
            dominance: null,
            coverage: 0,
            confidence: "none" as Confidence,
            sources: [],
            tertiaryOnly: false,
          } satisfies DimensionScore,
        ];
      }

      const weighted = contributions.reduce((s, c) => s + c.weight * c.value, 0);
      const maxSingle = contributions.reduce((m, c) => Math.max(m, c.weight), 0);
      const denominator = includeTertiary ? MAX_WEIGHT[d] : maxWeightWithoutTertiary(d);

      return [
        d,
        {
          dimension: d,
          score: round4(weighted / weight),
          evidenceWeight: round4(weight),
          dominance: round4(maxSingle / weight),
          coverage: denominator > 0 ? round4(weight / denominator) : 0,
          confidence: confidenceFor(weight),
          // Deduplicated and ordered, so the explanation chain is stable.
          sources: [...new Set(contributions.map((c) => c.itemId))].sort(),
          tertiaryOnly: contributions.every((c) => c.role === "tertiary"),
        } satisfies DimensionScore,
      ];
    }),
  ) as Record<DimensionId, DimensionScore>;

  return {
    scoringVersion: SCORING_VERSION,
    dimensions,
    answeredItems: answeredItems.sort(),
    complete: new Set(answeredItems).size === Object.keys(CORE_ITEM_BY_ID).length,
  };
}

let withoutTertiaryCache: Record<DimensionId, number> | null = null;

function maxWeightWithoutTertiary(d: DimensionId): number {
  if (!withoutTertiaryCache) {
    const max = Object.fromEntries(DIMENSION_IDS.map((x) => [x, 0])) as Record<DimensionId, number>;
    for (const item of Object.values(CORE_ITEM_BY_ID)) {
      if (item.format === "scale") {
        max[item.primary] += ROLE_WEIGHTS.primary;
        max[item.secondary] += ROLE_WEIGHTS.secondary;
      } else {
        for (const l of OPTION_BY_ID[`${item.id}_A`].loadings) {
          if (l.role !== "tertiary") max[l.dimension] += ROLE_WEIGHTS[l.role];
        }
      }
    }
    withoutTertiaryCache = max;
  }
  return withoutTertiaryCache[d];
}
