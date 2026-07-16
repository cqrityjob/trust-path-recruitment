import type { Bi, ContentStatus as CareerCenterStatus } from "@/lib/career-center/types";

export type { Bi };
export type { CareerCenterStatus };

// Assessment-side content lifecycle for target profiles.
// Provisional = hypothesis in the matching engine, not the same as Career Center
// content status (placeholder | researched | reviewed | published).
export type ContentStatus = "placeholder" | "provisional" | "researched" | "reviewed";

// -------- Dimensions --------
export type DimensionId =
  | "operational_orientation"
  | "leadership_orientation"
  | "analytical_orientation"
  | "technical_orientation"
  | "strategic_orientation"
  | "risk_awareness"
  | "communication"
  | "service_orientation"
  | "conflict_management"
  | "investigation_orientation"
  | "structure_documentation"
  | "independent_decision_making"
  | "teamwork"
  | "learning_development";

export interface Dimension {
  id: DimensionId;
  name: Bi;
  description: Bi;
  explanationKey: string; // reserved for future i18n templates
  status: ContentStatus;
  // Theoretical raw score bounds are derived from the mapping.
  min?: number;
  max?: number;
}

// -------- Question mappings --------
// A single weight contribution to a dimension.
export interface DimensionWeight {
  dimension: DimensionId;
  weight: number; // may be negative
}

// Option-based mapping (single / multi choice questions).
export interface OptionMapping {
  optionId: string;
  weights: DimensionWeight[];
}

// Rating (1..N) mapping — contribution = (value - center) * factor, per dimension.
export interface RatingWeight {
  dimension: DimensionId;
  factor: number; // multiplier applied to (value - center)
  center?: number; // defaults to 3 for a 1..5 scale
}

export interface QuestionMapping {
  questionId: string;
  // Cap on absolute contribution any single question can push into a dimension.
  maxAbsPerDimension: number;
  options?: OptionMapping[];
  rating?: RatingWeight[];
}

// -------- Profession target profile --------
export type ProfessionMatchGate =
  | "leadership_strategic"
  | "technical"
  | "investigative_analytical"
  | "operational"
  | "none";

export interface ProfessionTargetProfile {
  professionId: string; // matches career-center Profession.id
  family: string;       // career-center ProfessionFamilyId or free-form family label
  status: ContentStatus;
  gate: ProfessionMatchGate;
  // For each relevant dimension: target normalized value 0..100 + importance 0..3.
  // Dimensions omitted from this record are treated as not relevant.
  targets: Partial<Record<DimensionId, { target: number; importance: 1 | 2 | 3 }>>;
  distinguishing: DimensionId[]; // dimensions that mark this role apart
  potentialMismatch?: DimensionId[]; // dimensions where a low score is a red flag
  minRelevantEvidence?: number; // min number of important dims with evidence for "stronger"
  regulated?: boolean;
  notes?: Bi;
}

// -------- Engine outputs --------
export type ConfidenceLevel = "limited" | "moderate" | "stronger";

export interface DimensionScore {
  dimension: DimensionId;
  raw: number;
  normalized: number; // 0..100
  evidence: number;   // number of questions that contributed
  observed: boolean;  // false when no answered question contributed
}

export interface MatchResult {
  professionId: string;
  family: string;
  rawSimilarity: number;    // 0..1
  displayedMatch: number;   // 0..100 after caps
  confidence: ConfidenceLevel;
  confidenceReason: Bi;
  gatePassed: boolean;
  gateNote?: Bi;
  topDimensions: DimensionId[];
  gaps: DimensionId[];
  unobservedImportant: DimensionId[];
  contributingImportantCount: number;
  importantDimensionCount: number;
  mismatchPenalty: number;
  distinguishingCoverage: number; // 0..1
  regulated?: boolean;
  status: ContentStatus;                       // profile hypothesis status
  professionContentStatus?: CareerCenterStatus; // Career Center content lifecycle
}

export interface EngineResult {
  userVector: DimensionScore[];
  matches: MatchResult[]; // sorted by displayedMatch desc
  answeredCount: number;
  observedDimensions: DimensionId[];
  unobservedDimensions: DimensionId[];
}

// -------- Answers --------
export type AnswerValue = string | string[] | number | undefined;
export type AnswerMap = Record<string, AnswerValue>;

// -------- Test personas --------
export interface TestPersona {
  id: string;
  name: Bi;
  description: Bi;
  answers: AnswerMap;
  expectedTopFamilies: string[]; // any of these acceptable
  disallowedTop?: string[];      // professions that must NOT be #1
}
