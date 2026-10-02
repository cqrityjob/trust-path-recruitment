import { z } from "zod";
import { REPORT_SECTIONS, decisionSchema, narrativeSectionSchema } from "./management-report";

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const version = z.number().int().positive();
export const scope = z.object({ workspaceId: uuid }).strict();

export const saveMandateInput = scope
  .extend({
    version: version.nullable(),
    organisation_description: text(8000),
    security_mission: text(8000),
    reporting_line: text(2000),
    key_stakeholders: text(4000),
    decision_authority: text(4000),
    risk_acceptance_authority: text(4000),
    geographic_scope: text(2000),
    key_requirements: text(8000),
    review_date: date,
    status: z.enum(["draft", "confirmed"]),
  })
  .strict();
/** The accepted mandate text: written by the user, or copied from an
 * approved suggestion that the user names here. */
export const saveMandateDocumentInput = scope
  .extend({
    version,
    mandate_document: text(32000),
    suggestionId: uuid.nullable(),
  })
  .strict();
export const saveAssetInput = scope
  .extend({
    id: uuid,
    version: version.nullable(),
    name: required(300),
    description: text(8000),
    category: z.enum(["people", "operations", "facilities", "information", "systems", "suppliers", "reputation", "other"]),
    owner_id: uuid.nullable(),
    owner_label: text(200),
    business_importance: z.enum(["low", "medium", "high", "critical"]),
    consequence_level: z.number().int().min(1).max(5).nullable(),
    consequence_description: text(8000),
    status: z.enum(["active", "retired"]),
    review_date: date,
  })
  .strict();
export const linkRiskAssetInput = scope
  .extend({ riskId: uuid, assetId: uuid, linked: z.boolean() })
  .strict();
export const saveProgrammeRiskInput = scope
  .extend({
    id: uuid,
    version: version.nullable(),
    title: required(500),
    description: text(16000),
    threat_scenario: text(8000),
    owner_id: uuid.nullable(),
    likelihood: z.number().int().min(1).max(5).nullable(),
    consequence: z.number().int().min(1).max(5).nullable(),
    uncertainty: text(8000),
    decision_rationale: text(8000),
    assetIds: z.array(uuid).max(50),
  })
  .strict();
export const decideRiskInput = scope
  .extend({
    id: uuid,
    version,
    status: z.enum(["accepted", "closed"]),
    decision_rationale: required(8000),
  })
  .strict();
export const startBaselineInput = scope
  .extend({ market: z.enum(["global", "se"]), mode: z.enum(["quick", "detailed"]) })
  .strict();
export const answerBaselineInput = scope
  .extend({
    baselineId: uuid,
    questionId: z.string().min(1).max(120),
    answer: z.enum(["yes", "partly", "no", "not_applicable"]),
    note: text(4000),
  })
  .strict();
export const completeBaselineInput = scope
  .extend({ baselineId: uuid, version, mode: z.enum(["quick", "detailed"]) })
  .strict();
export const saveGapInput = scope
  .extend({
    id: uuid,
    version: version.nullable(),
    source_kind: z.enum(["baseline", "risk", "monitoring", "analysis", "incident", "manual"]),
    domain: z
      .enum(["governance", "personnel", "physical", "information_cyber", "incident", "continuity", "suppliers", "travel_events", "culture_training", "compliance"])
      .nullable(),
    title: required(500),
    description: text(8000),
    evidence_note: text(4000),
    business_impact: z.enum(["low", "medium", "high"]),
    related_asset_id: uuid.nullable(),
    related_risk_id: uuid.nullable(),
    related_assessment_id: uuid.nullable(),
    baselineId: uuid.nullable(),
    baselineQuestionId: z.string().min(1).max(120).nullable(),
    suggested_action: text(4000),
    owner_id: uuid.nullable(),
    status: z.enum(["open", "in_progress", "resolved", "accepted"]),
    resolution_note: text(4000),
  })
  .strict()
  .refine((value) => (value.baselineId === null) === (value.baselineQuestionId === null));
export const saveProgrammeActionInput = scope
  .extend({
    id: uuid,
    version: version.nullable(),
    assessmentId: uuid.nullable(),
    riskId: uuid.nullable(),
    gapId: uuid.nullable(),
    assetId: uuid.nullable(),
    source_kind: z.enum(["analysis", "gap", "risk", "plan", "manual"]),
    title: required(500),
    description: text(16000),
    assigneeUserId: uuid.nullable(),
    dueDate: date,
    priority: z.enum(["low", "medium", "high", "urgent"]),
    status: z.enum(["open", "in_progress", "blocked", "completed", "cancelled"]),
    rationale: text(8000),
    completionEvidence: text(8000),
    approval_required: z.boolean(),
    approval_note: text(4000),
  })
  .strict();
export const evidenceLinkInput = scope
  .extend({
    sourceId: uuid,
    targetKind: z.enum(["mandate", "asset", "risk", "baseline_answer", "gap", "action", "report", "management_report"]),
    targetId: uuid,
    note: text(2000),
    linked: z.boolean(),
  })
  .strict();
export const planInput = scope
  .extend({
    status: z.enum(["active", "dismissed", "completed"]),
    completedTaskIds: z.array(z.string().min(1).max(120)).max(200),
    version: version.nullable(),
  })
  .strict();
export const createManagementReportInput = scope
  .extend({
    id: uuid,
    title: required(500),
    language: z.enum(["sv", "en"]),
    period_start: date,
    period_end: date,
  })
  .strict();
export const saveManagementReportInput = scope
  .extend({
    id: uuid,
    version,
    title: required(500),
    narrative: z.record(z.enum(REPORT_SECTIONS), narrativeSectionSchema),
    decisions_required: z.array(decisionSchema).max(50),
    refreshData: z.boolean(),
  })
  .strict();
export const decideManagementReportInput = scope
  .extend({ id: uuid, version, status: z.enum(["approved", "archived"]) })
  .strict();
export const suggestionInput = scope.extend({ suggestionId: uuid }).strict();
export const decideSuggestionInput = scope
  .extend({
    suggestionId: uuid,
    version,
    status: z.enum(["approved", "rejected"]),
    decision_note: text(2000),
    /** What the approving user chose to create from the proposal. The server
     * writes these through the ordinary editor path, as that user. */
    apply: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("none") }).strict(),
        z.object({ kind: z.literal("mandate_document"), version }).strict(),
        z
          .object({
            kind: z.literal("assets"),
            assets: z
              .array(
                z
                  .object({
                    name: required(300),
                    category: z.enum(["people", "operations", "facilities", "information", "systems", "suppliers", "reputation", "other"]),
                    description: text(8000),
                  })
                  .strict(),
              )
              .max(15),
          })
          .strict(),
        z
          .object({ kind: z.literal("risk_scenario"), riskId: uuid, version })
          .strict(),
        z
          .object({
            kind: z.literal("actions"),
            gapId: uuid,
            actions: z
              .array(z.object({ title: required(500), description: text(4000) }).strict())
              .max(5),
          })
          .strict(),
        z
          .object({
            kind: z.literal("report_narrative"),
            reportId: uuid,
            version,
            sections: z.array(z.enum(REPORT_SECTIONS)).max(12),
          })
          .strict(),
      ])
      .default({ kind: "none" }),
  })
  .strict();
export const requestSuggestionInput = scope
  .extend({
    capability: z.enum([
      "mandate_draft",
      "mandate_ceo_questions",
      "asset_suggestions",
      "asset_missing",
      "risk_scenario",
      "risk_controls",
      "baseline_explain",
      "baseline_good_looks_like",
      "gap_action",
      "report_narrative",
      "explain_term",
    ]),
    contextKind: z.enum(["workspace", "mandate", "asset", "risk", "gap", "baseline_question", "action", "management_report"]),
    contextId: z.string().min(1).max(120).nullable(),
    requestText: text(2000),
    requestId: uuid,
  })
  .strict();

export type SaveMandateInput = z.infer<typeof saveMandateInput>;
export type SaveMandateDocumentInput = z.infer<typeof saveMandateDocumentInput>;
export type SaveAssetInput = z.infer<typeof saveAssetInput>;
export type LinkRiskAssetInput = z.infer<typeof linkRiskAssetInput>;
export type SaveProgrammeRiskInput = z.infer<typeof saveProgrammeRiskInput>;
export type DecideRiskInput = z.infer<typeof decideRiskInput>;
export type StartBaselineInput = z.infer<typeof startBaselineInput>;
export type AnswerBaselineInput = z.infer<typeof answerBaselineInput>;
export type CompleteBaselineInput = z.infer<typeof completeBaselineInput>;
export type SaveGapInput = z.infer<typeof saveGapInput>;
export type SaveProgrammeActionInput = z.infer<typeof saveProgrammeActionInput>;
export type EvidenceLinkInput = z.infer<typeof evidenceLinkInput>;
export type PlanInput = z.infer<typeof planInput>;
export type CreateManagementReportInput = z.infer<typeof createManagementReportInput>;
export type SaveManagementReportInput = z.infer<typeof saveManagementReportInput>;
export type DecideManagementReportInput = z.infer<typeof decideManagementReportInput>;
export type DecideSuggestionInput = z.infer<typeof decideSuggestionInput>;
export type RequestSuggestionInput = z.infer<typeof requestSuggestionInput>;
