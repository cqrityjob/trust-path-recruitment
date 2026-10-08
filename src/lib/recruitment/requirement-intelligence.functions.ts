import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/database";
import {
  confirmProfileSchema,
  requirementRuleSchema,
  saveRequirementReviewSchema,
  SOURCE_KINDS,
  CRITERION_STATES,
  REQUIREMENT_STATUSES,
  REVIEW_STATES,
} from "./requirement-intelligence";

type Context = { supabase: SupabaseClient<Database>; userId: string };
const stringOrNull = z.string().nullable();
const ruleSchema = requirementRuleSchema.extend({
  labelSv: stringOrNull,
  labelEn: stringOrNull,
  position: z.number(),
});
const sourceSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  reference: z.string(),
  version: z.string(),
  label: z.string(),
  answerBool: z.boolean().nullable(),
  answerText: stringOrNull,
  caseId: stringOrNull.optional(),
});
const profileSchema = z.object({
  jobId: z.string().uuid(),
  profileId: stringOrNull,
  version: z.number(),
  startDate: stringOrNull,
  confirmedAt: stringOrNull,
  confirmedBy: stringOrNull,
  canManage: z.boolean(),
  rules: z.array(ruleSchema),
  requirements: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["mandatory", "desirable"]),
      labelSv: stringOrNull,
      labelEn: stringOrNull,
      position: z.number(),
    }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      requirementId: stringOrNull,
      promptSv: stringOrNull,
      promptEn: stringOrNull,
      answerKind: z.enum(["text", "yes_no"]),
    }),
  ),
});
const criterionSchema = ruleSchema.extend({
  state: z.enum(CRITERION_STATES),
  source: sourceSchema.nullable(),
  sourceCurrent: z.boolean(),
  validUntil: stringOrNull,
  note: stringOrNull,
  neutralQuestion: stringOrNull,
  reviewedBy: stringOrNull,
  reviewedAt: stringOrNull,
});
const reviewSchema = z.object({
  applicationId: z.string(),
  jobId: z.string(),
  employerId: z.string(),
  profile: profileSchema,
  revision: z.number(),
  bindingToken: z.string(),
  canManage: z.boolean(),
  requirementStatus: z.enum(REQUIREMENT_STATUSES),
  reviewState: z.enum(REVIEW_STATES),
  analysisState: z.literal("not_used"),
  criteria: z.array(criterionSchema),
  availableSources: z.array(sourceSchema),
  nextAction: stringOrNull,
  responsibleUserId: stringOrNull,
  reviewedBy: stringOrNull,
  reviewedAt: stringOrNull,
});

const CODES = [
  "RECRUITMENT_NOT_PERMITTED",
  "APPLICATION_NOT_FOUND",
  "APPLICATION_NOT_OPEN",
  "RESPONSIBLE_NOT_A_MEMBER",
  "RI_STALE_VERSION",
  "RI_SOURCE_STALE",
  "RI_OPERATION_CONFLICT",
  "RI_PROFILE_INVALID",
  "RI_REVIEW_INVALID",
  "RI_REVIEW_INCOMPLETE",
  "RI_ACCEPTED_SOURCE_REQUIRED",
  "RI_PROFILE_IDENTITY_IN_USE",
  "RI_PROFILE_IMMUTABLE",
] as const;
export function requirementError(error: { message?: string } | null): Error {
  const code = CODES.find((value) => error?.message?.includes(value));
  return new Error(code ?? "RECRUITMENT_ACTION_FAILED");
}
async function assertScope(
  ctx: Context,
  employerId: string,
  kind: "job" | "application",
  id: string,
) {
  const query = kind === "job" ? ctx.supabase.from("jobs") : ctx.supabase.from("job_applications");
  const { data, error } = await query
    .select("id")
    .eq("id", id)
    .eq("employer_id", employerId)
    .maybeSingle();
  if (error || !data) throw new Error("RECRUITMENT_NOT_PERMITTED");
}

export const getRequirementProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), jobId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "job", data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_get_profile", { _job_id: data.jobId });
    if (result.error) throw requirementError(result.error);
    return profileSchema.parse(result.data);
  });

export const confirmRequirementProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmProfileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "job", data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_confirm_profile", {
      _job_id: data.jobId,
      _expected_version: data.expectedVersion,
      _operation_id: data.operationId,
      _start_date: data.startDate ?? null,
      _rules: data.rules,
    });
    if (result.error) throw requirementError(result.error);
    return profileSchema.parse(result.data);
  });

export const getRequirementReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), applicationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_ri_get_review", {
      _application_id: data.applicationId,
    });
    if (result.error) throw requirementError(result.error);
    return reviewSchema.parse(result.data);
  });

export const saveRequirementReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveRequirementReviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_ri_save_review", {
      _application_id: data.applicationId,
      _profile_id: data.profileId,
      _expected_revision: data.expectedRevision,
      _binding_token: data.bindingToken,
      _operation_id: data.operationId,
      _decisions: data.decisions,
      _confirm: data.confirm,
      _next_action: data.nextAction ?? null,
      _responsible_user_id: data.responsibleUserId ?? null,
    });
    if (result.error) throw requirementError(result.error);
    return z.object({ applicationId: z.string(), revision: z.number() }).parse(result.data);
  });

export const prepareManualRequirementSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        applicationId: z.string().uuid(),
        label: z.string().trim().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_ri_manual_reference", {
      _application_id: data.applicationId,
      _label: data.label,
    });
    if (result.error) throw requirementError(result.error);
    return sourceSchema.parse(result.data);
  });

export const transferRequirementSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        applicationId: z.string().uuid(),
        caseId: z.string().uuid(),
        expectedRevision: z.number().int().min(0),
        bindingToken: z.string().regex(/^[a-f0-9]{32}$/),
        operationId: z.string().uuid(),
        requirementIds: z.array(z.string().uuid()).min(1).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_ri_transfer_requirements", {
      _application_id: data.applicationId,
      _case_id: data.caseId,
      _expected_revision: data.expectedRevision,
      _binding_token: data.bindingToken,
      _operation_id: data.operationId,
      _requirement_ids: data.requirementIds,
    });
    if (result.error) throw requirementError(result.error);
    return z.object({ sourceIds: z.array(z.string()), count: z.number() }).parse(result.data);
  });
