// Layer 1 — Career Profile derivation.
//
// Pure function of the dimension vector plus a small fixed mapping table.
// No CIG dependency. Reusable foundation for later AI services but not
// consumed by any AI in Phase D.

import type {
  ArchetypeKey,
  ArchetypeStrength,
  CareerProfile,
  DimensionId,
  DimensionScore,
  MotivationKey,
  MotivationStrength,
} from "./types";
import { CAREER_PROFILE_VERSION } from "./types";

type DimWeights = Partial<Record<DimensionId, number>>;

// Archetype dimension weights. Weights are normalized during scoring so
// each archetype's max reachable strength is 100.
const ARCHETYPE_MAP: Record<
  ArchetypeKey,
  { label: { sv: string; en: string }; weights: DimWeights }
> = {
  operational_guardian: {
    label: { sv: "Operativ väktare", en: "Operational guardian" },
    weights: {
      operational_orientation: 3,
      service_orientation: 2,
      risk_awareness: 2,
      teamwork: 1,
      conflict_management: 1,
    },
  },
  strategic_leader: {
    label: { sv: "Strategisk ledare", en: "Strategic leader" },
    weights: {
      leadership_orientation: 3,
      strategic_orientation: 3,
      communication: 1,
      independent_decision_making: 1,
      risk_awareness: 1,
    },
  },
  analytical_investigator: {
    label: { sv: "Analytisk utredare", en: "Analytical investigator" },
    weights: {
      analytical_orientation: 3,
      investigation_orientation: 3,
      structure_documentation: 2,
      learning_development: 1,
    },
  },
  technical_specialist: {
    label: { sv: "Teknisk specialist", en: "Technical specialist" },
    weights: {
      technical_orientation: 3,
      analytical_orientation: 2,
      structure_documentation: 1,
      learning_development: 2,
    },
  },
  service_communicator: {
    label: { sv: "Service och kommunikation", en: "Service and communication" },
    weights: {
      service_orientation: 3,
      communication: 3,
      teamwork: 2,
      conflict_management: 1,
    },
  },
  risk_crisis_responder: {
    label: { sv: "Risk och kris", en: "Risk and crisis" },
    weights: {
      risk_awareness: 3,
      independent_decision_making: 2,
      conflict_management: 2,
      operational_orientation: 1,
      strategic_orientation: 1,
    },
  },
};

const MOTIVATION_MAP: Record<
  MotivationKey,
  { label: { sv: string; en: string }; weights: DimWeights }
> = {
  service: {
    label: { sv: "Att hjälpa och skydda", en: "Helping and protecting" },
    weights: { service_orientation: 2, communication: 1, teamwork: 1 },
  },
  autonomy: {
    label: { sv: "Självständighet", en: "Autonomy" },
    weights: { independent_decision_making: 2, operational_orientation: 1 },
  },
  impact: {
    label: { sv: "Påverkan och ansvar", en: "Impact and responsibility" },
    weights: {
      leadership_orientation: 2,
      strategic_orientation: 1,
      risk_awareness: 1,
    },
  },
  mastery: {
    label: { sv: "Fördjupning och kunskap", en: "Mastery and depth" },
    weights: {
      learning_development: 2,
      analytical_orientation: 1,
      technical_orientation: 1,
    },
  },
  structure: {
    label: { sv: "Ordning och tydlighet", en: "Order and clarity" },
    weights: { structure_documentation: 2, teamwork: 1 },
  },
};

function score(
  vector: DimensionScore[],
  weights: DimWeights,
): number {
  const byId = new Map(vector.map((v) => [v.dimension, v] as const));
  let num = 0;
  let denom = 0;
  for (const [dim, w] of Object.entries(weights) as [DimensionId, number][]) {
    const v = byId.get(dim);
    // Unobserved dims contribute their neutral 50 baseline. This keeps the
    // profile computable at low evidence without inflating any single dim.
    const value = v ? v.normalized : 50;
    num += value * w;
    denom += 100 * w;
  }
  if (denom === 0) return 0;
  return Math.round((num / denom) * 100);
}

export function deriveCareerProfile(vector: DimensionScore[]): CareerProfile {
  const archetypes: ArchetypeStrength[] = (
    Object.entries(ARCHETYPE_MAP) as [ArchetypeKey, (typeof ARCHETYPE_MAP)[ArchetypeKey]][]
  ).map(([key, spec]) => ({
    key,
    label: spec.label,
    strength: score(vector, spec.weights),
  }));
  archetypes.sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key));

  const motivationSignals: MotivationStrength[] = (
    Object.entries(MOTIVATION_MAP) as [MotivationKey, (typeof MOTIVATION_MAP)[MotivationKey]][]
  ).map(([key, spec]) => ({
    key,
    label: spec.label,
    strength: score(vector, spec.weights),
  }));
  motivationSignals.sort(
    (a, b) => b.strength - a.strength || a.key.localeCompare(b.key),
  );

  const dim = (id: DimensionId) =>
    vector.find((v) => v.dimension === id)?.normalized ?? 50;

  const workingStyle = {
    independence: Math.round(dim("independent_decision_making")),
    teamwork: Math.round(dim("teamwork")),
    structurePreference: Math.round(dim("structure_documentation")),
    riskTolerance: Math.round(dim("risk_awareness")),
  };

  const developmentCapacity = Math.round(
    (dim("learning_development") * 3 + dim("analytical_orientation")) / 4,
  );

  const observed = vector.filter((v) => v.observed).length;
  const evidenceCoverage = vector.length > 0 ? observed / vector.length : 0;

  return {
    profileVersion: CAREER_PROFILE_VERSION,
    archetypes,
    motivationSignals,
    workingStyle,
    developmentCapacity,
    evidenceCoverage,
  };
}
