// Phase E — slim Career Profile snapshot used to power personal job
// relevance guidance on the public jobs surfaces.
//
// Pure function of the user's AnswerMap. Reuses the same primitives as
// the full engine (`computeUserVector`, `computeCurrentFit`,
// `computePotential`, `deriveCareerProfile`, `rankFamilies`) — no new
// scoring logic and no CIG catalogue reads. The engine result itself is
// unchanged; this module only projects the existing signals into a
// candidate-side DTO that can be persisted per user and consumed by the
// jobs UI.
//
// The DTO deliberately omits raw score objects, evidence internals,
// mismatch penalties and any CIG object. The jobs UI only receives:
//   - top archetype + top motivations (for the natural-language framing)
//   - per-family current-fit / potential (for family-based relevance
//     fallback)
//   - per-legacy-slug current-fit / potential / confidence and a
//     truncated list of strong / development dimension IDs (for the
//     "why this role may suit you" panel).

import type { AnswerMap, DimensionId } from "@/lib/career-assessment/types";
import { computeUserVector } from "@/lib/career-assessment/matching-engine";
import { deriveCareerProfile } from "./career-profile";
import { computeCurrentFit, computePotential } from "./scoring";
import { rankFamilies } from "./family-ranking";
import { buildTargetVectorsFromLegacy } from "./target-vector";
import { ENGINE_VERSION, type ConfidenceLevel } from "./types";

export const PROFILE_FOR_JOBS_VERSION = "cpj-v1" as const;

export interface SlugScoreForJobs {
  familyKey: string;
  currentFit: number;
  potential: number;
  confidence: ConfidenceLevel;
  strongDims: DimensionId[];
  developDims: DimensionId[];
}

export interface FamilyScoreForJobs {
  currentFit: number;
  potential: number;
  memberCount: number;
}

export interface ArchetypeSummary {
  key: string;
  labelSv: string;
  labelEn: string;
  strength: number;
}

export interface MotivationSummary {
  key: string;
  labelSv: string;
  labelEn: string;
  strength: number;
}

/**
 * Slim Career Profile persisted server-side (as JSON) and consumed by the
 * jobs UI. Deliberately contains no raw score objects, no CIG rows and
 * nothing that could reconstruct the user's individual answers.
 */
export interface CareerProfileForJobsV1 {
  version: typeof PROFILE_FOR_JOBS_VERSION;
  engineVersion: typeof ENGINE_VERSION;
  computedAt: string;
  archetype: ArchetypeSummary | null;
  motivations: MotivationSummary[];
  familyScores: Record<string, FamilyScoreForJobs>;
  slugScores: Record<string, SlugScoreForJobs>;
}

function truncate<T>(arr: readonly T[], n: number): T[] {
  return arr.slice(0, n);
}

/**
 * Build the slim Career Profile snapshot from an AnswerMap. Pure — no
 * network, no DB, no AI. Callers are free to serialize the return value
 * as JSON for storage. The DTO version tag lets stale snapshots be
 * detected and ignored by the jobs UI.
 */
export function buildCareerProfileForJobs(
  answers: AnswerMap,
  now: () => string = () => new Date().toISOString(),
): CareerProfileForJobsV1 {
  const targets = buildTargetVectorsFromLegacy();
  const vector = computeUserVector(answers);
  const profile = deriveCareerProfile(vector);

  const slugScores: Record<string, SlugScoreForJobs> = {};
  const scored = targets.map((target) => {
    const currentFit = computeCurrentFit(target, vector);
    const potential = computePotential(target, vector);
    slugScores[target.legacySlug] = {
      familyKey: target.familyKey,
      currentFit: currentFit.displayed,
      potential: potential.displayed,
      confidence: currentFit.confidence,
      strongDims: truncate(currentFit.topDimensions, 4),
      developDims: truncate(currentFit.gaps, 4),
    };
    return { target, dual: { currentFit, potential } };
  });

  const familyRanking = rankFamilies(scored);
  const familyScores: Record<string, FamilyScoreForJobs> = {};
  for (const f of familyRanking) {
    familyScores[f.familyKey] = {
      currentFit: f.currentFit,
      potential: f.potential,
      memberCount: f.memberCount,
    };
  }

  const topArchetype = profile.archetypes.find((a) => a.strength >= 40);
  const archetype: ArchetypeSummary | null = topArchetype
    ? {
        key: topArchetype.key,
        labelSv: topArchetype.label.sv,
        labelEn: topArchetype.label.en,
        strength: topArchetype.strength,
      }
    : null;

  const motivations: MotivationSummary[] = profile.motivationSignals
    .filter((m) => m.strength >= 40)
    .slice(0, 3)
    .map((m) => ({
      key: m.key,
      labelSv: m.label.sv,
      labelEn: m.label.en,
      strength: m.strength,
    }));

  return {
    version: PROFILE_FOR_JOBS_VERSION,
    engineVersion: ENGINE_VERSION,
    computedAt: now(),
    archetype,
    motivations,
    familyScores,
    slugScores,
  };
}

/**
 * Type guard — recognises a JSON blob that decodes into a valid
 * `CareerProfileForJobsV1`. Used by the server function that reads back
 * a persisted snapshot so unknown or stale shapes are treated as
 * "no profile" rather than crashing the jobs UI.
 */
export function isCareerProfileForJobsV1(
  value: unknown,
): value is CareerProfileForJobsV1 {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.version !== PROFILE_FOR_JOBS_VERSION) return false;
  if (v.engineVersion !== ENGINE_VERSION) return false;
  if (typeof v.computedAt !== "string") return false;
  if (typeof v.familyScores !== "object" || v.familyScores === null) return false;
  if (typeof v.slugScores !== "object" || v.slugScores === null) return false;
  return true;
}