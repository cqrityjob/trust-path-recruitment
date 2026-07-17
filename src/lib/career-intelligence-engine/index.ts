// Career Intelligence Engine v1 — public API.
//
// Deterministic, layered orchestrator:
//   Career Profile → Current Fit + Potential → Family ranking →
//   Profession ranking → Enrichment → Structured explanations →
//   Evidence Score → Envelope with Journey hooks
//
// The engine is a pure function of `answers`, `targets`, and an optional
// `enrichmentByLegacySlug` bundle. The compute.functions.ts wrapper loads
// enrichment from the CIG catalogue via server-side reads.

import type { AnswerMap } from "@/lib/career-assessment/types";
import { computeUserVector } from "@/lib/career-assessment/matching-engine";

import { deriveCareerProfile } from "./career-profile";
import { computeCurrentFit, computePotential } from "./scoring";
import { rankFamilies, enforceFamilyDiversity } from "./family-ranking";
import { computeEvidenceScore } from "./evidence-score";
import {
  explainMatch,
  explainCareerProfile,
  explainFamily,
} from "./explanations";
import { hashInputs } from "./inputs-hash";
import { buildTargetVectorsFromLegacy } from "./target-vector";
import {
  ENGINE_VERSION,
  type ComputeOptions,
  type DualScore,
  type EngineResultV1,
  type EnrichmentBundle,
  type FamilyRankingEntry,
  type JourneyHooks,
  type Match,
  type StructuredExplanation,
  type TargetVector,
} from "./types";

export * from "./types";
export { deriveCareerProfile } from "./career-profile";
export { computeCurrentFit, computePotential } from "./scoring";
export { rankFamilies, enforceFamilyDiversity } from "./family-ranking";
export { computeEvidenceScore } from "./evidence-score";
export { hashInputs } from "./inputs-hash";
export { buildTargetVectorsFromLegacy } from "./target-vector";
export { LEGACY_TO_CIG_SLUG, toCigSlug } from "./slug-map";

function emptyEnrichment(): EnrichmentBundle {
  return {
    disclaimer: null,
    formalRequirements: [],
    relatedProfessions: [],
    transitions: [],
    educationPathways: [],
    certifications: [],
    sources: [],
    sourceCoverage: 0,
  };
}

export interface ComputeInput {
  answers: AnswerMap;
  targets?: TargetVector[];
  enrichmentByLegacySlug?: Record<string, EnrichmentBundle>;
  publishedCigSlugs?: Set<string>; // if provided, restrict matching to those with cigSlug in set
  options?: ComputeOptions;
}

export function computeEngineResultV1(input: ComputeInput): EngineResultV1 {
  const {
    answers,
    targets = buildTargetVectorsFromLegacy(),
    enrichmentByLegacySlug = {},
    publishedCigSlugs,
    options = {},
  } = input;
  const topN = Math.max(1, options.topN ?? 3);

  const vector = computeUserVector(answers);
  const careerProfile = deriveCareerProfile(vector);

  // Filter matching set to published CIG when requested. Absence of a CIG
  // slug is tolerated so legacy TS-only professions can still surface in
  // dev/preview and in tests. Callers that must enforce published-only
  // pass `publishedCigSlugs`.
  const eligible = publishedCigSlugs
    ? targets.filter((t) => t.cigSlug && publishedCigSlugs.has(t.cigSlug))
    : targets;

  const scored = eligible.map((target) => {
    const dual: DualScore = {
      currentFit: computeCurrentFit(target, vector),
      potential: computePotential(target, vector),
    };
    return { target, dual };
  });

  scored.sort(
    (a, b) =>
      b.dual.currentFit.displayed - a.dual.currentFit.displayed ||
      b.dual.potential.displayed - a.dual.potential.displayed ||
      a.target.professionKey.localeCompare(b.target.professionKey),
  );

  const diversified = enforceFamilyDiversity(scored, topN);
  const topScored = diversified.slice(0, topN);
  const familyRanking: FamilyRankingEntry[] = rankFamilies(diversified);

  const topReferenceKey = topScored[0]?.target.professionKey;

  const matches: Match[] = topScored.map((s, i) => {
    const enrichment =
      (s.target.legacySlug && enrichmentByLegacySlug[s.target.legacySlug]) ||
      emptyEnrichment();
    const evidenceScore = computeEvidenceScore({
      answers,
      breakdown: s.dual.currentFit,
      distinguishingCoverage: s.dual.currentFit.distinguishingCoverage,
      enrichment,
    });
    const reason: StructuredExplanation[] = explainMatch({
      target: s.target,
      dual: s.dual,
      enrichment,
      evidenceScore,
      rankIndex: i,
      topReferenceKey:
        i > 0 && topReferenceKey ? topReferenceKey : undefined,
    });
    return {
      professionKey: s.target.professionKey,
      legacySlug: s.target.legacySlug,
      cigSlug: s.target.cigSlug,
      titleSv: enrichment.titleSv,
      titleEn: enrichment.titleEn,
      family: { key: s.target.familyKey },
      currentFit: s.dual.currentFit.displayed,
      potential: s.dual.potential.displayed,
      confidence: s.dual.currentFit.confidence,
      evidenceScore,
      gatePassed: s.dual.currentFit.gatePassed,
      gateNote: s.dual.currentFit.gateNote,
      regulated: s.target.regulated,
      strongestDimensions: s.dual.currentFit.topDimensions,
      developmentAreas: s.dual.currentFit.gaps,
      enrichment,
      reason,
    };
  });

  // Career-profile and family explanations are stored on the envelope via
  // family ranking + a synthetic profile block that callers surface above
  // the profession list.
  const profileExplanations = explainCareerProfile(careerProfile);
  if (familyRanking[0]) {
    const famExpl = explainFamily(familyRanking[0]);
    // Attach to top match as first-in-list rationale so a single render
    // path suffices; the UI can also read it via familyRanking.
    if (matches[0]) {
      matches[0].reason = [...famExpl, ...profileExplanations, ...matches[0].reason];
    }
  }

  const overallEvidenceScore =
    matches.length === 0
      ? 0
      : Math.round(
          matches.reduce((sum, m) => sum + m.evidenceScore, 0) / matches.length,
        );

  const disclaimers = matches
    .filter((m) => m.regulated && m.enrichment.disclaimer)
    .map((m) => m.enrichment.disclaimer!)
    .filter((v, i, arr) => arr.findIndex((x) => x.sv === v.sv) === i);

  const cigEnrichmentPresent = matches.some(
    (m) => m.enrichment.sourceCoverage > 0 || m.enrichment.formalRequirements.length > 0,
  );

  const dataStatus: EngineResultV1["dataStatus"] =
    matches.length === 0
      ? "no_matches"
      : !cigEnrichmentPresent
        ? "cig_enrichment_missing"
        : "ok";

  const journeyHooks: JourneyHooks = {
    developmentRoadmap: null,
    educationTrack: null,
    certificationTrack: null,
    jobsQuery: null,
    nextReviewAt: null,
  };

  return {
    engineVersion: ENGINE_VERSION,
    computedAt: (options.now ?? (() => new Date().toISOString()))(),
    inputsHash: hashInputs(answers),
    careerProfile,
    familyRanking,
    matches,
    overallEvidenceScore,
    dataStatus,
    disclaimers,
    journeyHooks,
  };
}
