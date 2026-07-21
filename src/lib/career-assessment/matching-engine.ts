import { questions, type Question } from "@/lib/assessment-content";
import { allDimensionIds, dimensionById } from "./dimensions";
import { questionMappingById, questionMappings } from "./question-mappings";
import { professionProfileById, professionProfiles } from "./profession-profiles";
import { getProfession } from "@/lib/career-center";
import type {
  AnswerMap,
  Bi,
  ConfidenceLevel,
  DimensionId,
  DimensionScore,
  EngineResult,
  MatchResult,
  ProfessionTargetProfile,
  QuestionMapping,
} from "./types";

// A question set the scoring engine can be pointed at, in place of the
// module-level legacy `questions`/`questionMappingById`. Used by the
// Question Library's `assembleQuestionSet()` to score a Public Career
// Assessment profile's assembled 16 questions with the exact same math as
// the frozen legacy content. Every function below defaults to the legacy
// set, so every existing caller (security-guard-foundation, historical
// scoring, the persona harness) behaves byte-for-byte identically with zero
// code change.
export interface ScoringQuestionSet {
  questions: Question[];
  mappingById: Record<string, QuestionMapping>;
}

const legacyQuestionSet: ScoringQuestionSet = { questions, mappingById: questionMappingById };

// Engine settings — provisional and testable.
const settings = {
  // Confidence caps on displayed match (0..100).
  displayedCap: { limited: 65, moderate: 82, stronger: 100 } as const,
  // Gate failure caps raw similarity here.
  gateFailCap: 0.55,
  // Fraction thresholds for coverage-based confidence.
  confidenceMod: 0.5,
  confidenceStrong: 0.8,
  // Gate normalized threshold.
  gateThreshold: 55,
  // Mismatch penalty size (per triggered dim).
  mismatchPenalty: 0.06,
  // Distinguishing-dim floor: dims flagged as distinguishing must clear this
  // observed normalized level, or the profession is dampened.
  distinguishingFloor: 55,
  distinguishingPenalty: 0.08,
};

// -------- Score bounds (theoretical raw min/max per dimension) --------
function computeDimensionBounds(
  set: ScoringQuestionSet = legacyQuestionSet,
): Record<DimensionId, { min: number; max: number }> {
  const bounds = Object.fromEntries(allDimensionIds.map((d) => [d, { min: 0, max: 0 }])) as Record<
    DimensionId,
    { min: number; max: number }
  >;

  for (const q of set.questions) {
    const m = set.mappingById[q.id];
    if (!m) continue;
    // Per-dimension min/max contribution for this question.
    const perDim = Object.fromEntries(
      allDimensionIds.map((d) => [d, { min: 0, max: 0 }]),
    ) as Record<DimensionId, { min: number; max: number }>;

    if (q.type === "single" && m.options) {
      // Best-case = max option per dim, worst-case = min option per dim.
      for (const d of allDimensionIds) {
        let mn = 0,
          mx = 0;
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
        let mn = 0,
          mx = 0;
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

// Bounds are static per question set (they depend only on the mapping
// tables, never on answers), so a non-legacy set's bounds are computed once
// and cached by a stable signature of its question ids.
const boundsCache = new Map<string, Record<DimensionId, { min: number; max: number }>>();

function boundsFor(set: ScoringQuestionSet): Record<DimensionId, { min: number; max: number }> {
  if (set === legacyQuestionSet) return dimensionBounds;
  const signature = set.questions.map((q) => q.id).join(",");
  let cached = boundsCache.get(signature);
  if (!cached) {
    cached = computeDimensionBounds(set);
    boundsCache.set(signature, cached);
  }
  return cached;
}

// -------- User vector --------
export function computeUserVector(
  answers: AnswerMap,
  questionSet: ScoringQuestionSet = legacyQuestionSet,
): DimensionScore[] {
  const raw = Object.fromEntries(allDimensionIds.map((d) => [d, 0])) as Record<DimensionId, number>;
  const evidence = Object.fromEntries(allDimensionIds.map((d) => [d, 0])) as Record<
    DimensionId,
    number
  >;
  const bounds = boundsFor(questionSet);

  for (const q of questionSet.questions) {
    const val = answers[q.id];
    if (val === undefined || (Array.isArray(val) && val.length === 0)) continue;
    const m = questionSet.mappingById[q.id];
    if (!m) continue;
    const cap = m.maxAbsPerDimension;
    const contrib = Object.fromEntries(allDimensionIds.map((d) => [d, 0])) as Record<
      DimensionId,
      number
    >;

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
    const b = bounds[d];
    const span = b.max - b.min;
    const observed = evidence[d] > 0;
    const normalized = observed && span > 0 ? ((raw[d] - b.min) / span) * 100 : 50;
    return {
      dimension: d,
      raw: raw[d],
      normalized: Math.max(0, Math.min(100, normalized)),
      evidence: evidence[d],
      observed,
    };
  });
}

// -------- Gate check --------
function checkGate(
  profile: ProfessionTargetProfile,
  vector: DimensionScore[],
): { passed: boolean; note?: Bi } {
  const get = (d: DimensionId) => vector.find((v) => v.dimension === d)!;
  const th = settings.gateThreshold;
  const check = (d: DimensionId) => {
    const v = get(d);
    return v.observed && v.normalized >= th;
  };
  switch (profile.gate) {
    case "leadership_strategic": {
      const passed = check("leadership_orientation") && check("strategic_orientation");
      return {
        passed,
        note: passed
          ? undefined
          : {
              sv: "Kräver tydliga signaler på både ledarskap och strategiskt tänkande.",
              en: "Requires clear signals in both leadership and strategic thinking.",
            },
      };
    }
    case "technical":
      return { passed: check("technical_orientation") };
    case "investigative_analytical":
      return {
        passed: check("investigation_orientation") || check("analytical_orientation"),
      };
    case "operational":
      return { passed: check("operational_orientation") };
    case "none":
    default:
      return { passed: true };
  }
}

// -------- Per-profession similarity --------
function similarity(
  profile: ProfessionTargetProfile,
  vector: DimensionScore[],
): {
  raw: number;
  contributing: DimensionId[];
  gaps: DimensionId[];
  unobservedImportant: DimensionId[];
  importantWithEvidence: number;
  importantCount: number;
  distinguishingCoverage: number;
  mismatchPenalty: number;
} {
  const contributing: {
    dim: DimensionId;
    score: number;
    imp: number;
    user: number;
    target: number;
    observed: boolean;
  }[] = [];
  let weightedSum = 0;
  let weightSum = 0;
  let importantWithEvidence = 0;
  let importantCount = 0;
  const unobservedImportant: DimensionId[] = [];

  for (const [dim, spec] of Object.entries(profile.targets)) {
    if (!spec) continue;
    const v = vector.find((x) => x.dimension === (dim as DimensionId))!;
    if (spec.importance >= 2) {
      importantCount += 1;
      if (!v.observed) unobservedImportant.push(dim as DimensionId);
    }
    if (!v.observed) {
      // Unobserved dims contribute no evidence at all.
      contributing.push({
        dim: dim as DimensionId,
        score: 0,
        imp: spec.importance,
        user: v.normalized,
        target: spec.target,
        observed: false,
      });
      continue;
    }
    const diff = Math.abs(v.normalized - spec.target);
    const dimSim = 1 - diff / 100;
    weightedSum += dimSim * spec.importance;
    weightSum += spec.importance;
    contributing.push({
      dim: dim as DimensionId,
      score: dimSim,
      imp: spec.importance,
      user: v.normalized,
      target: spec.target,
      observed: true,
    });
    if (spec.importance >= 2 && v.normalized >= 50) importantWithEvidence += 1;
  }

  let raw = weightSum > 0 ? weightedSum / weightSum : 0;

  // Distinguishing coverage: fraction of distinguishing dims that are observed
  // and clear the floor. Missing evidence dampens the score so a profession
  // cannot ride generic mid-range signals into a top slot.
  const dist = profile.distinguishing ?? [];
  const distObs = dist.map((d) => {
    const v = vector.find((x) => x.dimension === d)!;
    return v.observed && v.normalized >= settings.distinguishingFloor;
  });
  const distinguishingCoverage =
    dist.length === 0 ? 1 : distObs.filter(Boolean).length / dist.length;
  if (dist.length > 0) {
    const missing = dist.length - distObs.filter(Boolean).length;
    raw -= missing * settings.distinguishingPenalty;
  }

  // Mismatch penalty: penalise strong user signal on dims flagged as
  // potential mismatches (e.g. a heavy technical orientation for a strategic
  // management role).
  let mismatchPenalty = 0;
  for (const d of profile.potentialMismatch ?? []) {
    const v = vector.find((x) => x.dimension === d)!;
    if (v.observed && v.normalized >= 70) {
      mismatchPenalty += settings.mismatchPenalty;
    }
  }
  raw -= mismatchPenalty;
  raw = Math.max(0, Math.min(1, raw));

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

  return {
    raw,
    contributing: top,
    gaps,
    unobservedImportant,
    importantWithEvidence,
    importantCount,
    distinguishingCoverage,
    mismatchPenalty,
  };
}

// -------- Confidence --------
function confidenceFor(
  profile: ProfessionTargetProfile,
  vector: DimensionScore[],
  importantWithEvidence: number,
  gatePassed: boolean,
  distinguishingCoverage: number,
): { level: ConfidenceLevel; reason: Bi; importantCount: number; observedImportant: number } {
  const importantEntries = Object.entries(profile.targets).filter(
    ([, spec]) => spec && spec.importance >= 2,
  );
  const importantCount = importantEntries.length;

  const observedImportant = importantEntries.filter(([dim, spec]) => {
    if (!spec) return false;
    const v = vector.find((x) => x.dimension === (dim as DimensionId))!;
    return v.observed;
  }).length;

  const frac = importantCount === 0 ? 0 : observedImportant / importantCount;
  const meetsMinEvidence = importantWithEvidence >= (profile.minRelevantEvidence ?? 3);
  const distinguishingOk = distinguishingCoverage >= 0.5;

  let level: ConfidenceLevel;
  if (frac >= settings.confidenceStrong && meetsMinEvidence && gatePassed && distinguishingOk) {
    level = "stronger";
  } else if (frac >= settings.confidenceMod && observedImportant >= 2) {
    level = "moderate";
  } else {
    level = "limited";
  }

  const reason: Bi =
    level === "stronger"
      ? {
          sv: "Underlaget är starkare eftersom dina svar täckte de flesta dimensionerna som är relevanta för den här karriärvägen.",
          en: "Confidence is stronger because your answers covered most of the dimensions relevant to this career path.",
        }
      : level === "moderate"
        ? {
            sv: "Underlaget är måttligt eftersom dina svar täckte flera men inte alla relevanta dimensioner.",
            en: "Confidence is moderate because your answers covered most of the dimensions relevant to this career path.",
          }
        : {
            sv: "Underlaget är begränsat eftersom flera relevanta områden inte täcktes av dina svar.",
            en: "Confidence is limited because several relevant areas were not covered by your completed answers.",
          };
  return { level, reason, importantCount, observedImportant };
}

// -------- Main entry --------
export function computeMatches(answers: AnswerMap): EngineResult {
  const vector = computeUserVector(answers);
  const answeredCount = Object.values(answers).filter(
    (v) => v !== undefined && !(Array.isArray(v) && v.length === 0),
  ).length;

  const matches: MatchResult[] = professionProfiles.map((profile) => {
    const gate = checkGate(profile, vector);
    const sim = similarity(profile, vector);
    let raw = sim.raw;

    // Evidence scaling: important dims with no answered evidence dampen the
    // similarity so missing signal cannot inflate a match.
    const minEv = profile.minRelevantEvidence ?? 3;
    const evidenceScale = 0.4 + 0.6 * Math.min(1, sim.importantWithEvidence / Math.max(1, minEv));
    raw = raw * evidenceScale;

    if (!gate.passed) raw = Math.min(raw, settings.gateFailCap);

    const conf = confidenceFor(
      profile,
      vector,
      sim.importantWithEvidence,
      gate.passed,
      sim.distinguishingCoverage,
    );
    const cap = settings.displayedCap[conf.level];
    const displayedMatch = Math.round(Math.min(raw * 100, cap));
    const ccProfession = getProfession(profile.professionId);

    return {
      professionId: profile.professionId,
      family: profile.family,
      rawSimilarity: raw,
      displayedMatch,
      confidence: conf.level,
      confidenceReason: conf.reason,
      gatePassed: gate.passed,
      gateNote: gate.note,
      topDimensions: sim.contributing,
      gaps: sim.gaps,
      unobservedImportant: sim.unobservedImportant,
      contributingImportantCount: sim.importantWithEvidence,
      importantDimensionCount: sim.importantCount,
      mismatchPenalty: sim.mismatchPenalty,
      distinguishingCoverage: sim.distinguishingCoverage,
      regulated: profile.regulated,
      status: profile.status,
      professionContentStatus: ccProfession?.status,
    };
  });

  matches.sort((a, b) => b.displayedMatch - a.displayedMatch);
  return {
    userVector: vector,
    matches,
    answeredCount,
    observedDimensions: vector.filter((v) => v.observed).map((v) => v.dimension),
    unobservedDimensions: vector.filter((v) => !v.observed).map((v) => v.dimension),
  };
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
