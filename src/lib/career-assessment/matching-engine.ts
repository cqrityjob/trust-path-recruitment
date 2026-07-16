import { questions } from "@/lib/assessment-content";
import { allDimensionIds, dimensionById } from "./dimensions";
import { questionMappingById, questionMappings } from "./question-mappings";
import { professionProfileById, professionProfiles } from "./profession-profiles";
import type {
  AnswerMap,
  ConfidenceLevel,
  DimensionId,
  DimensionScore,
  EngineResult,
  MatchResult,
  ProfessionTargetProfile,
} from "./types";

// Engine settings — provisional and testable.
const settings = {
  // Confidence caps on displayed match (0..100).
  displayedCap: { limited: 65, moderate: 82, stronger: 100 } as const,
  // Gate failure caps raw similarity here.
  gateFailCap: 0.55,
  // Evidence gate: normalized value considered "meaningful evidence" for a dim.
  evidenceThreshold: 55,
  // Confidence thresholds: fraction of important dimensions with evidence.
  confidenceMod: 0.5,
  confidenceStrong: 0.8,
};

// -------- Score bounds (theoretical raw min/max per dimension) --------
function computeDimensionBounds(): Record<DimensionId, { min: number; max: number }> {
  const bounds = Object.fromEntries(
    allDimensionIds.map((d) => [d, { min: 0, max: 0 }]),
  ) as Record<DimensionId, { min: number; max: number }>;

  for (const q of questions) {
    const m = questionMappingById[q.id];
    if (!m) continue;
    // Per-dimension min/max contribution for this question.
    const perDim = Object.fromEntries(
      allDimensionIds.map((d) => [d, { min: 0, max: 0 }]),
    ) as Record<DimensionId, { min: number; max: number }>;

    if (q.type === "single" && m.options) {
      // Best-case = max option per dim, worst-case = min option per dim.
      for (const d of allDimensionIds) {
        let mn = 0, mx = 0;
        for (const opt of m.options) {
          const w = opt.weights.find((x) => x.dimension === d)?.weight ?? 0;
          if (w < mn) mn = w;
          if (w > mx) mx = w;
        }
        perDim[d] = { min: mn, max: mx };
      }
    } else if (q.type === "multi" && m.options) {
      // User can pick multiple: sum positives for max, sum negatives for min.
      for (const d of allDimensionIds) {
        let mn = 0, mx = 0;
        for (const opt of m.options) {
          const w = opt.weights.find((x) => x.dimension === d)?.weight ?? 0;
          if (w > 0) mx += w;
          if (w < 0) mn += w;
        }
        perDim[d] = { min: mn, max: mx };
      }
    } else if (q.type === "rating" && m.rating) {
      const min = q.scaleMin ?? 1;
      const max = q.scaleMax ?? 5;
      const center = 3;
      for (const rw of m.rating) {
        const lo = (min - center) * rw.factor;
        const hi = (max - center) * rw.factor;
        perDim[rw.dimension] = {
          min: Math.min(lo, hi),
          max: Math.max(lo, hi),
        };
      }
    }

    // Apply per-question cap.
    for (const d of allDimensionIds) {
      const cap = m.maxAbsPerDimension;
      perDim[d].min = Math.max(perDim[d].min, -cap);
      perDim[d].max = Math.min(perDim[d].max, cap);
      bounds[d].min += perDim[d].min;
      bounds[d].max += perDim[d].max;
    }
  }
  return bounds;
}

export const dimensionBounds = computeDimensionBounds();

// -------- User vector --------
export function computeUserVector(answers: AnswerMap): DimensionScore[] {
  const raw = Object.fromEntries(allDimensionIds.map((d) => [d, 0])) as Record<DimensionId, number>;
  const evidence = Object.fromEntries(
    allDimensionIds.map((d) => [d, 0]),
  ) as Record<DimensionId, number>;

  for (const q of questions) {
    const val = answers[q.id];
    if (val === undefined || (Array.isArray(val) && val.length === 0)) continue;
    const m = questionMappingById[q.id];
    if (!m) continue;
    const cap = m.maxAbsPerDimension;
    const contrib = Object.fromEntries(
      allDimensionIds.map((d) => [d, 0]),
    ) as Record<DimensionId, number>;

    if (q.type === "single" && typeof val === "string" && m.options) {
      const opt = m.options.find((o) => o.optionId === val);
      if (opt) for (const w of opt.weights) contrib[w.dimension] += w.weight;
    } else if (q.type === "multi" && Array.isArray(val) && m.options) {
      for (const id of val) {
        const opt = m.options.find((o) => o.optionId === id);
        if (opt) for (const w of opt.weights) contrib[w.dimension] += w.weight;
      }
    } else if (q.type === "rating" && typeof val === "number" && m.rating) {
      const center = 3;
      for (const rw of m.rating) contrib[rw.dimension] += (val - center) * rw.factor;
    }

    for (const d of allDimensionIds) {
      if (contrib[d] === 0) continue;
      const clamped = Math.max(-cap, Math.min(cap, contrib[d]));
      raw[d] += clamped;
      evidence[d] += 1;
    }
  }

  return allDimensionIds.map((d) => {
    const b = dimensionBounds[d];
    const span = b.max - b.min;
    const normalized = span > 0 ? ((raw[d] - b.min) / span) * 100 : 50;
    return {
      dimension: d,
      raw: raw[d],
      normalized: Math.max(0, Math.min(100, normalized)),
      evidence: evidence[d],
    };
  });
}

// -------- Gate check --------
function checkGate(
  profile: ProfessionTargetProfile,
  vector: DimensionScore[],
): boolean {
  const norm = (d: DimensionId) => vector.find((v) => v.dimension === d)!.normalized;
  switch (profile.gate) {
    case "leadership_strategic":
      return norm("leadership_orientation") >= 55 && norm("strategic_orientation") >= 55;
    case "technical":
      return norm("technical_orientation") >= 55;
    case "investigative_analytical":
      return norm("investigation_orientation") >= 55 || norm("analytical_orientation") >= 55;
    case "operational":
      return norm("operational_orientation") >= 55;
    case "none":
    default:
      return true;
  }
}

// -------- Per-profession similarity --------
function similarity(
  profile: ProfessionTargetProfile,
  vector: DimensionScore[],
): { raw: number; contributing: DimensionId[]; gaps: DimensionId[]; importantWithEvidence: number } {
  const contributing: { dim: DimensionId; score: number; imp: number; user: number; target: number }[] = [];
  let weightedSum = 0;
  let weightSum = 0;
  let importantWithEvidence = 0;

  for (const [dim, spec] of Object.entries(profile.targets)) {
    if (!spec) continue;
    const v = vector.find((x) => x.dimension === (dim as DimensionId))!;
    const diff = Math.abs(v.normalized - spec.target);
    // Similarity per-dimension: 1 when equal, 0 when 100pt apart.
    const dimSim = 1 - diff / 100;
    weightedSum += dimSim * spec.importance;
    weightSum += spec.importance;
    contributing.push({
      dim: dim as DimensionId,
      score: dimSim,
      imp: spec.importance,
      user: v.normalized,
      target: spec.target,
    });
    if (v.evidence > 0 && v.normalized >= 50) importantWithEvidence += 1;
  }

  const raw = weightSum > 0 ? weightedSum / weightSum : 0;

  // Top matching dims: high user score, meaningful importance, close to target.
  const top = [...contributing]
    .filter((c) => c.user >= 55 && c.imp >= 2)
    .sort((a, b) => b.score * b.imp - a.score * a.imp)
    .slice(0, 3)
    .map((c) => c.dim);

  // Gaps: important dims where user is significantly below target.
  const gaps = [...contributing]
    .filter((c) => c.imp >= 2 && c.target - c.user >= 15)
    .sort((a, b) => (b.target - b.user) * b.imp - (a.target - a.user) * a.imp)
    .slice(0, 3)
    .map((c) => c.dim);

  return { raw, contributing: top, gaps, importantWithEvidence };
}

// -------- Confidence --------
function confidenceFor(
  profile: ProfessionTargetProfile,
  vector: DimensionScore[],
  importantWithEvidence: number,
): ConfidenceLevel {
  const importantCount = Object.entries(profile.targets).filter(
    ([, spec]) => spec && spec.importance >= 2,
  ).length;
  if (importantCount === 0) return "limited";

  // Fraction of important dims where the user has at least some evidence.
  const withAnyEvidence = Object.entries(profile.targets).filter(([dim, spec]) => {
    if (!spec || spec.importance < 2) return false;
    const v = vector.find((x) => x.dimension === (dim as DimensionId))!;
    return v.evidence > 0;
  }).length;
  const frac = withAnyEvidence / importantCount;

  const meetsMinEvidence = importantWithEvidence >= (profile.minRelevantEvidence ?? 3);
  if (frac >= settings.confidenceStrong && meetsMinEvidence) return "stronger";
  if (frac >= settings.confidenceMod) return "moderate";
  return "limited";
}

// -------- Main entry --------
export function computeMatches(answers: AnswerMap): EngineResult {
  const vector = computeUserVector(answers);

  const matches: MatchResult[] = professionProfiles.map((profile) => {
    const gatePassed = checkGate(profile, vector);
    const sim = similarity(profile, vector);
    let raw = sim.raw;
    if (!gatePassed) raw = Math.min(raw, settings.gateFailCap);

    const confidence = confidenceFor(profile, vector, sim.importantWithEvidence);
    const cap = settings.displayedCap[confidence];
    const displayedMatch = Math.round(Math.min(raw * 100, cap));

    return {
      professionId: profile.professionId,
      family: profile.family,
      rawSimilarity: raw,
      displayedMatch,
      confidence,
      gatePassed,
      topDimensions: sim.contributing,
      gaps: sim.gaps,
      contributingImportantCount: sim.importantWithEvidence,
      regulated: profile.regulated,
      status: profile.status,
    };
  });

  matches.sort((a, b) => b.displayedMatch - a.displayedMatch);
  return { userVector: vector, matches };
}

export function getEngineSettings() {
  return settings;
}

export function getProfessionProfile(id: string) {
  return professionProfileById[id];
}

export function getDimension(id: DimensionId) {
  return dimensionById[id];
}

export { questionMappings, professionProfiles };