// Career Intelligence Engine v1 — public types.
//
// Deterministic, layered output. The engine reuses the existing assessment
// dimension vector as the sole numerical source of truth. Career Profile,
// Current Fit vs Potential, family ranking, Evidence Score and structured
// explanations are all pure functions over that vector plus CIG catalogue
// data.

import type {
  Bi,
  DimensionId,
  DimensionScore,
  ConfidenceLevel,
} from "@/lib/career-assessment/types";

export type { Bi, DimensionId, DimensionScore, ConfidenceLevel };

export const ENGINE_VERSION = "cie-v1.0" as const;
export const CAREER_PROFILE_VERSION = "cp-v1" as const;

// -------------- Career Profile (layer 1) --------------

export type ArchetypeKey =
  | "operational_guardian"
  | "strategic_leader"
  | "analytical_investigator"
  | "technical_specialist"
  | "service_communicator"
  | "risk_crisis_responder";

export type MotivationKey =
  | "service"
  | "autonomy"
  | "impact"
  | "mastery"
  | "structure";

export interface ArchetypeStrength {
  key: ArchetypeKey;
  label: Bi;
  strength: number; // 0..100
}

export interface MotivationStrength {
  key: MotivationKey;
  label: Bi;
  strength: number; // 0..100
}

export interface CareerProfile {
  profileVersion: typeof CAREER_PROFILE_VERSION;
  archetypes: ArchetypeStrength[]; // sorted desc, all six included
  motivationSignals: MotivationStrength[];
  workingStyle: {
    independence: number;
    teamwork: number;
    structurePreference: number;
    riskTolerance: number;
  };
  developmentCapacity: number; // 0..100
  evidenceCoverage: number; // 0..1
}

// -------------- Target vector (per profession) --------------

export type ProfessionGate =
  | "leadership_strategic"
  | "technical"
  | "investigative_analytical"
  | "operational"
  | "none";

export interface TargetVector {
  professionKey: string; // stable key used for tie-break sorting
  legacySlug: string; // slug used by TS career-center / profile source
  cigSlug?: string; // slug in cig_professions when known
  familyKey: string;
  targets: Partial<Record<DimensionId, { target: number; importance: 1 | 2 | 3 }>>;
  distinguishing: DimensionId[];
  potentialMismatch: DimensionId[];
  gate: ProfessionGate;
  minRelevantEvidence: number;
  regulated: boolean;
}

// -------------- Scoring result --------------

export interface ScoreBreakdown {
  raw: number; // 0..1 similarity after penalties
  evidenceScale: number; // 0..1
  gatePassed: boolean;
  distinguishingCoverage: number; // 0..1
  mismatchPenalty: number;
  importantWithEvidence: number;
  importantCount: number;
  observedImportant: number;
  displayed: number; // 0..100 after cap
  confidence: ConfidenceLevel;
  gateNote?: Bi;
  topDimensions: DimensionId[];
  gaps: DimensionId[];
}

export interface DualScore {
  currentFit: ScoreBreakdown;
  potential: ScoreBreakdown;
}

// -------------- Enrichment (from CIG catalogue) --------------

export interface EnrichmentSource {
  label: string;
  url?: string;
  kind?: string;
  retrievedAt?: string | null;
}

export interface EnrichmentBundle {
  cigSlug?: string;
  titleSv?: string;
  titleEn?: string;
  disclaimer?: Bi | null;
  formalRequirements: Array<{
    label: Bi;
    isLegal: boolean;
    isEmployer: boolean;
    kind?: string;
    jurisdiction?: string | null;
  }>;
  relatedProfessions: Array<{ slug: string; title: Bi; familyKey?: string }>;
  transitions: Array<{
    direction: "from" | "to";
    otherSlug: string;
    effort?: string | null;
    notes?: Bi | null;
  }>;
  educationPathways: Array<{ slug: string; title: Bi; level?: string | null }>;
  certifications: Array<{ slug: string; title: Bi; issuer?: string | null }>;
  sources: EnrichmentSource[];
  sourceCoverage: number; // 0..1 heuristic
}

// -------------- Match --------------

export interface StructuredExplanation {
  kind:
    | "matched_dimension"
    | "gap_dimension"
    | "gate_pass"
    | "gate_fail"
    | "formal_requirement"
    | "low_evidence"
    | "why_ranked_lower"
    | "regulated_notice"
    | "profile_archetype"
    | "current_vs_potential"
    | "family_rationale"
    | "evidence_note";
  text: Bi;
  data?: Record<string, unknown>;
}

export interface Match {
  professionKey: string;
  legacySlug: string;
  cigSlug?: string;
  titleSv?: string;
  titleEn?: string;
  family: { key: string; titleSv?: string; titleEn?: string };
  currentFit: number; // 0..100
  potential: number; // 0..100
  confidence: ConfidenceLevel;
  evidenceScore: number; // 0..100
  gatePassed: boolean;
  gateNote?: Bi;
  regulated: boolean;
  strongestDimensions: DimensionId[];
  developmentAreas: DimensionId[];
  enrichment: EnrichmentBundle;
  reason: StructuredExplanation[];
}

// -------------- Family ranking --------------

export interface FamilyRankingEntry {
  familyKey: string;
  cigFamilySlug?: string;
  titleSv?: string;
  titleEn?: string;
  currentFit: number; // 0..100 aggregate
  potential: number; // 0..100 aggregate
  memberCount: number;
  topProfessionKeys: string[];
}

// -------------- Envelope --------------

export interface JourneyHooks {
  developmentRoadmap: null;
  educationTrack: null;
  certificationTrack: null;
  jobsQuery: null;
  nextReviewAt: null;
}

export interface EngineResultV1 {
  engineVersion: typeof ENGINE_VERSION;
  computedAt: string; // ISO; deterministic when caller provides a fixed clock
  inputsHash: string;
  careerProfile: CareerProfile;
  familyRanking: FamilyRankingEntry[];
  matches: Match[]; // top-N
  overallEvidenceScore: number; // 0..100
  dataStatus:
    | "ok"
    | "no_matches"
    | "cig_enrichment_missing"; // engine ran but CIG catalogue is thin
  disclaimers: Bi[]; // aggregated across regulated matches
  journeyHooks: JourneyHooks;
}

// -------------- Options --------------

export interface ComputeOptions {
  topN?: number; // default 3
  now?: () => string; // for deterministic tests
  lang?: "sv" | "en";
}
