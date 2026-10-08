import { z } from "zod";

export const REQUIREMENT_STATUSES = ["green", "yellow", "gray", "not_established"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];
export const REVIEW_STATES = ["pending", "reviewed", "stale"] as const;
export type RequirementReviewState = (typeof REVIEW_STATES)[number];
export const CRITERION_STATES = ["met", "not_met", "clarify"] as const;
export type CriterionState = (typeof CRITERION_STATES)[number];
export const SOURCE_KINDS = [
  "application_answer",
  "application_cv",
  "interview_source",
  "external_reference",
] as const;
export type RequirementSourceKind = (typeof SOURCE_KINDS)[number];
export const DECISION_RULES = ["boolean_yes", "valid_at_start", "human_confirmed"] as const;
export type RequirementDecisionRule = (typeof DECISION_RULES)[number];

export type IntelligenceCounts = {
  received: number;
  reviewed: number;
  remaining: number;
  green: number;
  yellow: number;
  gray: number;
  notEstablished: number;
  filtered: number;
  filteredReviewed: number;
  filteredRemaining: number;
  archived: number;
  withdrawn: number;
  decided: number;
};

export const requirementRuleSchema = z.object({
  requirementId: z.string().uuid(),
  kind: z.enum(["mandatory", "desirable"]),
  acceptedSources: z.array(z.enum(SOURCE_KINDS)).min(1).max(4),
  decisionRule: z.enum(DECISION_RULES),
  questionId: z.string().uuid().nullable(),
  instructionSv: z.string().trim().min(1).max(2000),
  instructionEn: z.string().trim().max(2000).nullable(),
});
export type RequirementRuleInput = z.infer<typeof requirementRuleSchema>;
export type RequirementRule = RequirementRuleInput & {
  labelSv: string | null;
  labelEn: string | null;
  position: number;
};
export type RequirementProfile = {
  jobId: string;
  profileId: string | null;
  version: number;
  startDate: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  canManage: boolean;
  rules: RequirementRule[];
  requirements: {
    id: string;
    kind: "mandatory" | "desirable";
    labelSv: string | null;
    labelEn: string | null;
    position: number;
  }[];
  questions: {
    id: string;
    requirementId: string | null;
    promptSv: string | null;
    promptEn: string | null;
    answerKind: "text" | "yes_no";
  }[];
};
export type RequirementSourceChoice = {
  kind: RequirementSourceKind;
  reference: string;
  version: string;
  label: string;
  answerBool: boolean | null;
  answerText: string | null;
  caseId?: string | null;
};
export type RequirementCriterion = RequirementRule & {
  state: CriterionState;
  source: RequirementSourceChoice | null;
  sourceCurrent: boolean;
  validUntil: string | null;
  note: string | null;
  neutralQuestion: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};
export type RequirementReview = {
  applicationId: string;
  jobId: string;
  employerId: string;
  profile: RequirementProfile;
  revision: number;
  assignmentVersion: number | null;
  bindingToken: string;
  canManage: boolean;
  requirementStatus: RequirementStatus;
  reviewState: RequirementReviewState;
  analysisState: "not_used";
  criteria: RequirementCriterion[];
  availableSources: RequirementSourceChoice[];
  nextAction: string | null;
  responsibleUserId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export const requirementDecisionSchema = z.object({
  requirementId: z.string().uuid(),
  state: z.enum(CRITERION_STATES),
  sourceKind: z.enum(SOURCE_KINDS).nullable(),
  sourceReference: z.string().trim().max(500).nullable(),
  sourceVersion: z.string().trim().max(128).nullable(),
  sourceLabel: z.string().trim().max(500).nullable(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  note: z.string().trim().min(1).max(3000),
  neutralQuestion: z.string().trim().max(3000).nullable(),
});
export type RequirementDecision = z.infer<typeof requirementDecisionSchema>;

export const confirmProfileSchema = z.object({
  employerId: z.string().uuid(),
  jobId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  operationId: z.string().uuid(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  rules: z.array(requirementRuleSchema).max(30),
});
export const saveRequirementReviewSchema = z.object({
  employerId: z.string().uuid(),
  applicationId: z.string().uuid(),
  profileId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  expectedAssignmentVersion: z.number().int().min(1).nullable(),
  bindingToken: z.string().regex(/^[a-f0-9]{32}$/),
  operationId: z.string().uuid(),
  decisions: z.array(requirementDecisionSchema).max(30),
  confirm: z.boolean(),
  nextAction: z.string().trim().max(2000).nullable(),
  responsibleUserId: z.string().uuid().nullable(),
});
