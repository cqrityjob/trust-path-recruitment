// Security Career DNA — deterministic scoring.
//
// Implements security-career-dna-model-v3.0.md §7 (confidence), §8
// (context-dependence) and §9 (missing evidence).
//
// ── THE SCORING BOUNDARY, RESTATED ─────────────────────────────────────
//
// This module reads ONLY orientation evidence: the 16 single-axis and
// trade-off items. It cannot see adaptive or context answers, because
// `scoreDna()` filters on `isScoredEvidenceClass` and orientation loadings,
// and no adaptive or context item carries either. Behavioural signals are
// read separately into `signals` and never touch an axis position.
//
// There is no AI anywhere in this file. Given the same answers it returns
// byte-identical output, forever — which is what makes a stored report
// reproducible against its scoring version.

import { BEHAVIOURAL_SIGNALS, CAREER_ORIENTATION_AXES, MIN_ITEMS_PER_AXIS } from "./axes";
import { CORE_ITEMS_BY_ID } from "./core-items";
import type { BehaviouralSignalId, CareerOrientationAxisId } from "./types";
import { SCORING_VERSION } from "./version";

/** One answered item, as read back from cd_evidence. */
export interface ScoringInput {
  itemId: string;
  answerValue: string;
}

export type AxisConfidence = "emerging" | "established" | "strong";

export interface AxisScore {
  axis: CareerOrientationAxisId;
  /** 0..1, or null when there is no usable evidence. */
  position: number | null;
  confidence: AxisConfidence;
  /** Items that contributed, in canonical order. */
  contributingItemIds: string[];
  /** Spread between the highest and lowest contributing loading. */
  spread: number;
  /** True when the contributing items disagree enough that averaging them
   *  would destroy the finding. Treated as compatible with BOTH ends during
   *  matching — never resolved to a midpoint. */
  contextDependent: boolean;
  /** Excluded from matching entirely. Never included at a reduced weight:
   *  a weak signal that shifts a recommendation the user cannot inspect is
   *  worse than an absent one. */
  usableForMatching: boolean;
}

export interface SignalReading {
  signal: BehaviouralSignalId;
  itemId: string;
  /** Stable option value. Never a score — signals have no numeric level. */
  answerValue: string | null;
  /** True when the answer is 'no_recall' on B4, which is MISSING evidence
   *  and never a negative reading. */
  missing: boolean;
}

export interface DnaResult {
  scoringVersion: typeof SCORING_VERSION;
  axes: AxisScore[];
  signals: SignalReading[];
  /** Fraction of the 20 core items answered, 0..1. */
  coverage: number;
  /** Fraction of the 8 axes usable for matching, 0..1. */
  axisCoverage: number;
  answeredCoreItemCount: number;
  /** Axes with no usable read, for the report's honest-uncertainty section. */
  emergingAxes: CareerOrientationAxisId[];
  contextDependentAxes: CareerOrientationAxisId[];
}

/** Above this spread, contributing items are treated as genuinely
 *  disagreeing rather than noisy. 0.5 is one full step on the four-position
 *  0.00/0.33/0.67/1.00 scale plus a margin, so an adjacent-option
 *  difference never trips it but an opposite-end one always does. */
export const CONTEXT_DEPENDENCE_SPREAD = 0.5;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Round to 4 decimal places so results are stable across platforms and
 *  a stored snapshot compares equal to a recomputation. */
function stable(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Compute the Security Career DNA from answered core items.
 *
 * Deterministic and total: unknown item ids and unknown option values are
 * ignored rather than throwing, so a partially answered session still
 * yields an honest partial read.
 */
export function scoreDna(answers: readonly ScoringInput[]): DnaResult {
  // Collect loadings per axis. Only items in the core bank contribute, and
  // only through their authored option loadings.
  const perAxis = new Map<CareerOrientationAxisId, { itemId: string; value: number }[]>(
    CAREER_ORIENTATION_AXES.map((a) => [a.id, []]),
  );
  const signalAnswers = new Map<BehaviouralSignalId, { itemId: string; value: string }>();
  const answeredCoreItemIds = new Set<string>();

  for (const answer of answers) {
    const item = CORE_ITEMS_BY_ID.get(answer.itemId);
    if (!item) continue; // adaptive, context, or unknown — never scored
    answeredCoreItemIds.add(item.id);

    if (item.signal) {
      signalAnswers.set(item.signal, { itemId: item.id, value: answer.answerValue });
      continue; // behavioural items carry no axis loading, by construction
    }

    const option = item.options.find((o) => o.value === answer.answerValue);
    if (!option?.loadings) continue;

    for (const [axis, value] of Object.entries(option.loadings) as Array<
      [CareerOrientationAxisId, number]
    >) {
      perAxis.get(axis)?.push({ itemId: item.id, value });
    }
  }

  const axes: AxisScore[] = CAREER_ORIENTATION_AXES.map((axisDef) => {
    // Sort by item id so contributingItemIds is canonical regardless of the
    // order answers came back from the database.
    const contributions = (perAxis.get(axisDef.id) ?? [])
      .slice()
      .sort((a, b) => a.itemId.localeCompare(b.itemId));

    if (contributions.length === 0) {
      return {
        axis: axisDef.id,
        position: null,
        confidence: "emerging" as const,
        contributingItemIds: [],
        spread: 0,
        contextDependent: false,
        usableForMatching: false,
      };
    }

    const values = contributions.map((c) => c.value);
    const spread = Math.max(...values) - Math.min(...values);
    const contextDependent =
      contributions.length >= MIN_ITEMS_PER_AXIS && spread >= CONTEXT_DEPENDENCE_SPREAD;

    // Emerging: fewer than the three-item floor, or strong disagreement.
    // `strong` requires ≥5 items across ≥2 sessions and is therefore
    // unreachable from a single session — it exists for [V1] living DNA and
    // is deliberately not awarded here rather than being redefined.
    const confidence: AxisConfidence =
      contributions.length < MIN_ITEMS_PER_AXIS || contextDependent ? "emerging" : "established";

    return {
      axis: axisDef.id,
      position: stable(mean(values)),
      confidence,
      contributingItemIds: contributions.map((c) => c.itemId),
      spread: stable(spread),
      contextDependent,
      // A context-dependent axis IS usable — matching treats it as
      // compatible with both ends, which is more informative than a
      // midpoint. An under-covered axis is not usable at all.
      usableForMatching: contributions.length >= MIN_ITEMS_PER_AXIS,
    };
  });

  const signals: SignalReading[] = BEHAVIOURAL_SIGNALS.map((signalDef) => {
    const answer = signalAnswers.get(signalDef.id);
    return {
      signal: signalDef.id,
      itemId: answer?.itemId ?? "",
      answerValue: answer?.value ?? null,
      // B4 'no_recall' is missing evidence, not a negative reading. Reading
      // it as avoidance would be a construct error.
      missing: !answer || answer.value === "no_recall",
    };
  });

  const usable = axes.filter((a) => a.usableForMatching);

  return {
    scoringVersion: SCORING_VERSION,
    axes,
    signals,
    coverage: stable(answeredCoreItemIds.size / CORE_ITEMS_BY_ID.size),
    axisCoverage: stable(usable.length / axes.length),
    answeredCoreItemCount: answeredCoreItemIds.size,
    emergingAxes: axes.filter((a) => !a.usableForMatching).map((a) => a.axis),
    contextDependentAxes: axes.filter((a) => a.contextDependent).map((a) => a.axis),
  };
}

/** The axes a person leans furthest toward either end on, strongest first.
 *  Used for the report's "strongest patterns" section. Only established
 *  axes qualify — an emerging axis must never be presented as a pattern. */
export function strongestPatterns(dna: DnaResult, limit = 3): AxisScore[] {
  return dna.axes
    .filter((a) => a.usableForMatching && !a.contextDependent && a.position !== null)
    .slice()
    .sort((a, b) => {
      const da = Math.abs((a.position as number) - 0.5);
      const db = Math.abs((b.position as number) - 0.5);
      if (db !== da) return db - da;
      return a.axis.localeCompare(b.axis); // deterministic tie-break
    })
    .slice(0, limit);
}
