import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { contextSchema, calibrated } from "../analysis-model";
import {
  activationSchema,
  SwAiError,
  validateAnalysisInput,
  type SwAiActivation,
} from "./ai.server";
import type { AnalysisInput, AnalysisUserInput, ManifestSegment } from "./contracts";

const uuid = z.string().uuid();
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function stableId(namespace: string, field: string): string {
  const bytes = createHash("sha256")
    .update(`sw-input-v1\n${namespace}\n${field}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function chunks(text: string, size: number): string[] {
  const result: string[] = [];
  for (let offset = 0; offset < text.length; ) {
    let end = Math.min(offset + size, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
    const chunk = text.slice(offset, end).trim();
    if (chunk) result.push(chunk);
    offset = end;
  }
  return result;
}

/** Deliberate allowlist: approval metadata, never credentials, comes from the DB. */
export function activationFromRow(value: unknown, workspaceId: string): SwAiActivation {
  const row = z
    .object({
      id: uuid,
      workspace_id: uuid,
      provider: z.string(),
      model: z.string(),
      environment: z.string(),
      purpose: z.string(),
      task_version: z.string(),
      prompt_version: z.string(),
      policy_version: z.string(),
      output_schema_version: z.string(),
      data_processing_approval: z.string(),
      approved_at: z.string(),
      valid_until: z.string(),
      max_output_tokens: z.number(),
      timeout_ms: z.number(),
    })
    .safeParse(value);
  if (!row.success || row.data.workspace_id !== workspaceId)
    throw new SwAiError("activation_required");
  const a = row.data;
  const parsed = activationSchema.safeParse({
    id: a.id,
    workspaceId: a.workspace_id,
    provider: a.provider,
    model: a.model,
    environment: a.environment,
    purpose: a.purpose,
    taskVersion: a.task_version,
    promptVersion: a.prompt_version,
    policyVersion: a.policy_version,
    outputSchemaVersion: a.output_schema_version,
    dataProcessingApprovalId: a.data_processing_approval,
    approvedAt: a.approved_at,
    expiresAt: a.valid_until,
    revokedAt: null,
    maxOutputTokens: a.max_output_tokens,
    timeoutMs: a.timeout_ms,
  });
  if (!parsed.success) throw new SwAiError("activation_required");
  return parsed.data;
}

const text = z.string().max(65536).default("");
const assessmentSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  version: z.number().int().positive(),
  analysis_type: z.enum(["rsa", "monitoring", "legacy_security"]),
  title: text,
  purpose: text,
  scope: text,
  horizon: text,
  situation: text,
  affected_activity: text,
  assets: text,
  threat: text,
  vulnerability: text,
  existing_controls: text,
  uncertainty: text,
  assumptions: text,
  proposed_measures: text,
  professional_conclusion: text,
  context_snapshot: z.unknown(),
});
const manifestSchema = z.object({
  assessment: assessmentSchema,
  activation: z.unknown(),
  sources: z
    .array(
      z.object({
        segmentId: uuid,
        sourceItemId: uuid,
        text: z.string().min(1).max(65536),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        locator: z.string().min(1).max(500),
        reviewVersion: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(200),
  questions: z
    .array(
      z.object({
        id: uuid,
        workspace_id: uuid,
        assessment_id: uuid,
        question: z.string().max(4000),
        answer: z.string().max(65536),
        evidence_kind: z.enum(["user_input", "assumption"]),
      }),
    )
    .max(100),
});

/** Only immutable DB reservation content is eligible for provider dispatch. */
export function analysisInputFromJob(
  value: unknown,
  expected: { workspaceId: string; assessmentId: string; version: number; activationId: string },
  language: "sv" | "en",
): { input: AnalysisInput; activation: SwAiActivation } {
  const checked = manifestSchema.safeParse(value);
  if (!checked.success) throw new SwAiError("input_invalid");
  const manifest = checked.data;
  const assessment = manifest.assessment;
  if (
    assessment.id !== expected.assessmentId ||
    assessment.workspace_id !== expected.workspaceId ||
    assessment.version !== expected.version
  )
    throw new SwAiError("input_conflict");
  const activation = activationFromRow(manifest.activation, expected.workspaceId);
  if (activation.id !== expected.activationId) throw new SwAiError("activation_required");
  const sources: ManifestSegment[] = [];
  for (const source of manifest.sources) {
    if (sha(source.text) !== source.sha256) throw new SwAiError("manifest_hash_mismatch");
    const pieces = chunks(source.text, 16000);
    pieces.forEach((part, index) =>
      sources.push({
        segmentId:
          pieces.length === 1 ? source.segmentId : stableId(source.segmentId, `chunk:${index}`),
        sourceItemId: source.sourceItemId,
        text: part,
        sha256: sha(part),
        locator: `${source.locator.slice(0, 200)}${pieces.length > 1 ? ` · chunk ${index + 1}` : ""}`,
      }),
    );
  }
  const userInputs: AnalysisUserInput[] = [];
  const addInput = (
    namespace: string,
    field: string,
    value: string,
    kind: "user_input" | "assumption",
    context: string,
  ) => {
    const pieces = chunks(value, 4000);
    pieces.forEach((part, index) =>
      userInputs.push({ id: stableId(namespace, `${field}:${index}`), text: part, kind, context }),
    );
  };
  for (const field of [
    "title",
    "purpose",
    "scope",
    "horizon",
    "situation",
    "affected_activity",
    "assets",
    "threat",
    "vulnerability",
    "existing_controls",
    "uncertainty",
    "assumptions",
    "proposed_measures",
    "professional_conclusion",
  ] as const) {
    addInput(
      assessment.id,
      field,
      assessment[field],
      field === "assumptions" ? "assumption" : "user_input",
      `User-authored assessment field: ${field}`,
    );
  }
  for (const question of manifest.questions) {
    if (
      question.workspace_id !== expected.workspaceId ||
      question.assessment_id !== expected.assessmentId
    )
      throw new SwAiError("input_conflict");
    addInput(question.id, "answer", question.answer, question.evidence_kind, question.question);
  }
  const context = contextSchema.safeParse(assessment.context_snapshot);
  if (context.success)
    addInput(
      assessment.id,
      "profile",
      context.data.profile,
      "user_input",
      "User-authored organisation context snapshot",
    );
  const calibration =
    context.success && calibrated(context.data, assessment.horizon)
      ? {
          id: stableId(assessment.id, `calibration:${assessment.version}`),
          likelihoodScale: context.data.calibration.likelihood.map((definition, index) => ({
            level: index + 1,
            definition,
          })),
          consequenceScale: context.data.calibration.consequence.map((definition, index) => ({
            level: index + 1,
            definition,
          })),
          horizon: assessment.horizon,
          riskAcceptance: context.data.calibration.riskAcceptance,
        }
      : null;
  return {
    activation,
    input: validateAnalysisInput({
      language,
      purpose: "draft_report",
      manifest: sources,
      userInputs,
      reportKind: assessment.analysis_type,
      calibration,
    }),
  };
}
