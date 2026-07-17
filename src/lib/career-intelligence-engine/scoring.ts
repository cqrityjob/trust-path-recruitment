// Layer 2 — Current Fit vs Potential scoring.
//
// Pure functions. Reuse the exact similarity math from the legacy engine
// (matching-engine.ts) applied to a normalized TargetVector, so the
// deterministic scoring model is preserved across the phase boundary.

import type {
  Bi,
  ConfidenceLevel,
  DimensionId,
  DimensionScore,
  ScoreBreakdown,
  TargetVector,
} from "./types";

// Engine settings (mirror legacy `matching-engine.ts::settings`).
const SETTINGS = {
  displayedCap: { limited: 65, moderate: 82, stronger: 100 } as const,
  gateFailCap: 0.55,
  confidenceMod: 0.5,
  confidenceStrong: 0.8,
  gateThreshold: 55,
  mismatchPenalty: 0.06,
  distinguishingFloor: 55,
  distinguishingPenalty: 0.08,
};

// Behavioural dimensions boosted for Potential (learning capacity and
// underlying orientation, as opposed to earned-through-experience signals).
const POTENTIAL_BOOST: Partial<Record<DimensionId, number>> = {
  learning_development: 1.5,
  leadership_orientation: 1.25,
  strategic_orientation: 1.25,
  analytical_orientation: 1.15,
  service_orientation: 1.1,
  communication: 1.1,
  teamwork: 1.1,
};

function checkGate(
  target: TargetVector,
  vector: DimensionScore[],
): { passed: boolean; note?: Bi } {
  const byId = new Map(vector.map((v) => [v.dimension, v] as const));
  const check = (d: DimensionId) => {
    const v = byId.get(d);
    return !!v && v.observed && v.normalized >= SETTINGS.gateThreshold;
  };
  switch (target.gate) {
    case "leadership_strategic": {
      const passed =
        check("leadership_orientation") && check("strategic_orientation");
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
        passed:
          check("investigation_orientation") || check("analytical_orientation"),
      };
    case "operational":
      return { passed: check("operational_orientation") };
    case "none":
    default:
      return { passed: true };
  }
}

interface ScoreVariant {
  boostImportance?: Partial<Record<DimensionId, number>>;
  disableEvidenceScale?: boolean;
  gateCaps?: boolean;
  applyMismatchPenalty?: boolean;
  minRelevantEvidenceOverride?: number;
}

function scoreOne(
  target: TargetVector,
  vector: DimensionScore[],
  variant: ScoreVariant,
): ScoreBreakdown {
  const byId = new Map(vector.map((v) => [v.dimension, v] as const));

  const gate = checkGate(target, vector);

  interface Contrib {
    dim: DimensionId;
    score: number;
    imp: number;
    user: number;
    target: number;
    observed: boolean;
  }
  const contributions: Contrib[] = [];
  let weightedSum = 0;
  let weightSum = 0;
  let importantWithEvidence = 0;
  let importantCount = 0;
  let observedImportant = 0;

  for (const [dimStr, spec] of Object.entries(target.targets)) {
    if (!spec) continue;
    const dim = dimStr as DimensionId;
    const v = byId.get(dim);
    const boost = variant.boostImportance?.[dim] ?? 1;
    const importance = spec.importance * boost;

    if (spec.importance >= 2) importantCount += 1;
    if (!v || !v.observed) {
      contributions.push({
        dim,
        score: 0,
        imp: importance,
        user: v?.normalized ?? 50,
        target: spec.target,
        observed: false,
      });
      continue;
    }
    if (spec.importance >= 2) observedImportant += 1;
    const diff = Math.abs(v.normalized - spec.target);
    const dimSim = 1 - diff / 100;
    weightedSum += dimSim * importance;
    weightSum += importance;
    contributions.push({
      dim,
      score: dimSim,
      imp: importance,
      user: v.normalized,
      target: spec.target,
      observed: true,
    });
    if (spec.importance >= 2 && v.normalized >= 50) importantWithEvidence += 1;
  }

  let raw = weightSum > 0 ? weightedSum / weightSum : 0;

  // Distinguishing coverage.
  const dist = target.distinguishing;
  const distObs = dist.map((d) => {
    const v = byId.get(d);
    return !!v && v.observed && v.normalized >= SETTINGS.distinguishingFloor;
  });
  const distinguishingCoverage =
    dist.length === 0 ? 1 : distObs.filter(Boolean).length / dist.length;
  if (dist.length > 0) {
    const missing = dist.length - distObs.filter(Boolean).length;
    raw -= missing * SETTINGS.distinguishingPenalty;
  }

  // Mismatch penalty (only for current-fit).
  let mismatchPenalty = 0;
  if (variant.applyMismatchPenalty !== false) {
    for (const d of target.potentialMismatch) {
      const v = byId.get(d);
      if (v && v.observed && v.normalized >= 70) {
        mismatchPenalty += SETTINGS.mismatchPenalty;
      }
    }
    raw -= mismatchPenalty;
  }
  raw = Math.max(0, Math.min(1, raw));

  // Gate cap.
  if (variant.gateCaps !== false && !gate.passed) {
    raw = Math.min(raw, SETTINGS.gateFailCap);
  }

  // Evidence scale.
  const minEv = variant.minRelevantEvidenceOverride ?? target.minRelevantEvidence;
  const evidenceScale = variant.disableEvidenceScale
    ? 1
    : 0.4 + 0.6 * Math.min(1, importantWithEvidence / Math.max(1, minEv));
  const scaled = raw * evidenceScale;

  // Confidence.
  const frac = importantCount === 0 ? 0 : observedImportant / importantCount;
  const meetsMinEvidence = importantWithEvidence >= minEv;
  const distinguishingOk = distinguishingCoverage >= 0.5;
  let confidence: ConfidenceLevel;
  if (
    frac >= SETTINGS.confidenceStrong &&
    meetsMinEvidence &&
    gate.passed &&
    distinguishingOk
  ) {
    confidence = "stronger";
  } else if (frac >= SETTINGS.confidenceMod && observedImportant >= 2) {
    confidence = "moderate";
  } else {
    confidence = "limited";
  }
  const cap = SETTINGS.displayedCap[confidence];
  const displayed = Math.round(Math.min(scaled * 100, cap));

  const topDimensions = [...contributions]
    .filter((c) => c.observed && c.user >= 55 && c.imp >= 2)
    .sort((a, b) => b.score * b.imp - a.score * a.imp || a.dim.localeCompare(b.dim))
    .slice(0, 3)
    .map((c) => c.dim);

  const gaps = [...contributions]
    .filter((c) => c.imp >= 2 && c.target - c.user >= 15)
    .sort(
      (a, b) =>
        (b.target - b.user) * b.imp - (a.target - a.user) * a.imp ||
        a.dim.localeCompare(b.dim),
    )
    .slice(0, 3)
    .map((c) => c.dim);

  return {
    raw,
    evidenceScale,
    gatePassed: gate.passed,
    gateNote: gate.note,
    distinguishingCoverage,
    mismatchPenalty,
    importantWithEvidence,
    importantCount,
    observedImportant,
    displayed,
    confidence,
    topDimensions,
    gaps,
  };
}

export function computeCurrentFit(
  target: TargetVector,
  vector: DimensionScore[],
): ScoreBreakdown {
  return scoreOne(target, vector, {
    disableEvidenceScale: false,
    gateCaps: true,
    applyMismatchPenalty: true,
  });
}

export function computePotential(
  target: TargetVector,
  vector: DimensionScore[],
): ScoreBreakdown {
  return scoreOne(target, vector, {
    boostImportance: POTENTIAL_BOOST,
    disableEvidenceScale: true,
    gateCaps: false, // gate still evaluated for reporting
    applyMismatchPenalty: false,
    minRelevantEvidenceOverride: Math.max(2, target.minRelevantEvidence - 1),
  });
}

export function scoringSettings() {
  return SETTINGS;
}
