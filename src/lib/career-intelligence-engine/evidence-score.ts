// Layer 7 — Evidence Score.
//
// Pure function of already-computed inputs. Reported alongside Confidence
// as a transparency metric. Does not affect ranking.

import type { AnswerMap } from "@/lib/career-assessment/types";
import type { EnrichmentBundle, ScoreBreakdown } from "./types";

const TOTAL_QUESTIONS = 16;

export function answeredCoverage(answers: AnswerMap): number {
  const answered = Object.values(answers).filter(
    (v) => v !== undefined && !(Array.isArray(v) && v.length === 0),
  ).length;
  return Math.min(1, answered / TOTAL_QUESTIONS);
}

export function computeEvidenceScore(input: {
  answers: AnswerMap;
  breakdown: ScoreBreakdown;
  distinguishingCoverage: number;
  enrichment: EnrichmentBundle;
}): number {
  const answered = answeredCoverage(input.answers);
  const importantRatio =
    input.breakdown.importantCount === 0
      ? 0
      : input.breakdown.observedImportant / input.breakdown.importantCount;
  const sourceCoverage = input.enrichment.sourceCoverage;
  const distinguishing = input.distinguishingCoverage;

  // Weighted mean: answered 30%, important 30%, distinguishing 20%, sources 20%.
  const score =
    answered * 0.3 +
    importantRatio * 0.3 +
    distinguishing * 0.2 +
    sourceCoverage * 0.2;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
