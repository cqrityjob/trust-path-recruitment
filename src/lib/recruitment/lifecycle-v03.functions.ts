// Lifecycle v0.3: the supplement request, the reopen act and the interview
// composition -- the client side of slots 20270311100000 and 20270312100000.
//
// Schema first. These functions may run against a database where the two
// slots are NOT installed yet (the application ships before or after the
// schema, never coupled to it). A missing function is therefore not an error
// of the act: every read answers `{ installed: false }` and every write throws
// SCHEMA_NOT_INSTALLED, which the screens turn into one true sentence and a
// fallback that exists today (a plain message draft; the "not in this
// version" note). Nothing here sends, scores or generates anything.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/database";

type Context = { supabase: SupabaseClient<Database>; userId: string };

const CODES = [
  "RECRUITMENT_NOT_PERMITTED",
  "RECRUITMENT_DECISION_NOT_PERMITTED",
  "RECRUITMENT_COMPLETED",
  "APPLICATION_NOT_FOUND",
  "APPLICATION_NOT_OPEN",
  "APPLICATION_ARCHIVED",
  "STALE_APPLICATION_STAGE",
  "RETENTION_ERASURE_PENDING",
  "REOPEN_REASON_REQUIRED",
  "REOPEN_NOT_ALLOWED",
  "RI_STALE_VERSION",
  "RI_OPERATION_CONFLICT",
  "RI_SUPPLEMENT_INVALID",
  "RI_SUPPLEMENT_OPEN",
  "RI_SUPPLEMENT_RESOLVED",
  "RI_SUPPLEMENT_NOT_FOUND",
  "RI_COMPOSITION_INVALID",
  "RI_COMPOSITION_CORE_REQUIRED",
  "RI_COMPOSITION_FOREIGN_ITEM",
  "RI_COMPOSITION_DUPLICATE",
  "RI_COMPOSITION_REASON_REQUIRED",
  "RI_COMPOSITION_PACK_FIXED",
  "RI_PACK_VERSION_NOT_FOUND",
  "SCP_IV_NOT_CASE_MEMBER",
] as const;

/** PostgREST answers PGRST202 ("Could not find the function …") when the RPC
 *  does not exist in the schema cache: the slot is not installed. */
export function isSchemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    /Could not find the function|does not exist/i.test(error.message ?? "")
  );
}

function lifecycleError(error: { code?: string; message?: string } | null): Error {
  if (isSchemaMissing(error)) return new Error("SCHEMA_NOT_INSTALLED");
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

// ── Supplement ────────────────────────────────────────────────────────────

const supplementRequestSchema = z.object({
  requestId: z.string(),
  profileVersion: z.number(),
  requirementIds: z.array(z.string()),
  requestedAt: z.string(),
  requestedBy: z.string().nullable(),
  messageId: z.string().nullable(),
  messageStatus: z.string().nullable(),
  emailStatus: z.string().nullable(),
  sentAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  outcome: z.enum(["answered", "withdrawn"]).nullable(),
  resolutionNote: z.string().nullable(),
});
export type SupplementRequest = z.infer<typeof supplementRequestSchema>;
const supplementStateSchema = z.object({
  applicationId: z.string(),
  awaitingSupplement: z.boolean(),
  requests: z.array(supplementRequestSchema),
});
export type SupplementState =
  | { installed: false }
  | ({ installed: true } & z.infer<typeof supplementStateSchema>);

export const getSupplementState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), applicationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<SupplementState> => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_ri_supplement_state", {
      _application_id: data.applicationId,
    });
    if (result.error) {
      if (isSchemaMissing(result.error)) return { installed: false };
      throw lifecycleError(result.error);
    }
    return { installed: true, ...supplementStateSchema.parse(result.data) };
  });

export const requestSupplement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        applicationId: z.string().uuid(),
        profileId: z.string().uuid(),
        requirementIds: z.array(z.string().uuid()).min(1).max(30),
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(10000),
        language: z.enum(["sv", "en"]),
        operationId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_ri_request_supplement", {
      _application_id: data.applicationId,
      _profile_id: data.profileId,
      _requirement_ids: data.requirementIds,
      _subject: data.subject,
      _body: data.body,
      _language: data.language,
      _operation_id: data.operationId,
    });
    if (result.error) throw lifecycleError(result.error);
    return z
      .object({ requestId: z.string(), messageId: z.string(), messageStatus: z.literal("draft") })
      .parse(result.data);
  });

export const resolveSupplement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        applicationId: z.string().uuid(),
        requestId: z.string().uuid(),
        outcome: z.enum(["answered", "withdrawn"]),
        note: z.string().trim().max(2000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_ri_resolve_supplement", {
      _request_id: data.requestId,
      _outcome: data.outcome,
      _note: data.note || null,
    });
    if (result.error) throw lifecycleError(result.error);
    return supplementStateSchema.parse(result.data);
  });

// ── Reopen ────────────────────────────────────────────────────────────────

export const reopenApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        applicationId: z.string().uuid(),
        expectedStatus: z.literal("rejected"),
        reason: z.string().trim().min(5).max(1000),
        operationId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "application", data.applicationId);
    const result = await ctx.supabase.rpc("rec_reopen_application", {
      _application_id: data.applicationId,
      _expected_status: data.expectedStatus,
      _reason: data.reason,
      _operation_id: data.operationId,
    });
    if (result.error) throw lifecycleError(result.error);
    return z
      .object({
        applicationId: z.string(),
        previousStatus: z.literal("rejected"),
        status: z.literal("reviewing"),
        reopenedAt: z.string(),
        reason: z.string(),
      })
      .parse(result.data);
  });

// ── Interview composition ─────────────────────────────────────────────────

export const selectionItemSchema = z.object({
  group: z.string().min(1).max(60),
  kind: z.enum(["core_question", "approved_probe"]),
  itemId: z.string().uuid(),
  position: z.number().int(),
});
export type SelectionItem = z.infer<typeof selectionItemSchema>;

const compositionSchema = z.object({
  jobId: z.string(),
  compositionId: z.string().nullable(),
  version: z.number(),
  packVersionId: z.string().nullable(),
  selection: z.array(selectionItemSchema),
  reason: z.string().nullable(),
  confirmedBy: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  boundCases: z.number(),
  olderBoundCases: z.number(),
  canManage: z.boolean().optional(),
});
export type Composition = z.infer<typeof compositionSchema>;
export type CompositionRead = { installed: false } | ({ installed: true } & Composition);

export const getInterviewComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), jobId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CompositionRead> => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "job", data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_get_composition", { _job_id: data.jobId });
    if (result.error) {
      if (isSchemaMissing(result.error)) return { installed: false };
      throw lifecycleError(result.error);
    }
    return { installed: true, ...compositionSchema.parse(result.data) };
  });

const catalogSchema = z.object({
  packVersionId: z.string(),
  packId: z.string(),
  versionNumber: z.number(),
  contentStatus: z.string(),
  validationLabel: z.string(),
  locale: z.string(),
  packName: z.object({ sv: z.string().nullable(), en: z.string().nullable() }).nullable(),
  competencies: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      nameSv: z.string(),
      nameEn: z.string().nullable(),
    }),
  ),
  coreQuestions: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      displayOrder: z.number(),
      questionType: z.enum(["behavioural", "situational"]),
      promptSv: z.string(),
      promptEn: z.string().nullable(),
      durationMin: z.number().nullable(),
      durationMax: z.number().nullable(),
      competencyCodes: z.array(z.string()),
    }),
  ),
  approvedProbes: z.array(
    z.object({
      id: z.string(),
      questionId: z.string().nullable(),
      purpose: z.string(),
      wordingSv: z.string(),
      wordingEn: z.string().nullable(),
      displayOrder: z.number(),
    }),
  ),
});
export type CompositionCatalog = z.infer<typeof catalogSchema>;

export const getCompositionCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employerId: z.string().uuid(), packVersionId: z.string().uuid() }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ installed: false } | ({ installed: true } & CompositionCatalog)> => {
      const ctx = context as Context;
      const result = await ctx.supabase.rpc("rec_ri_composition_catalog", {
        _employer_id: data.employerId,
        _pack_version_id: data.packVersionId,
      });
      if (result.error) {
        if (isSchemaMissing(result.error)) return { installed: false };
        throw lifecycleError(result.error);
      }
      return { installed: true, ...catalogSchema.parse(result.data) };
    },
  );

export const saveInterviewComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employerId: z.string().uuid(),
        jobId: z.string().uuid(),
        expectedVersion: z.number().int().min(0),
        operationId: z.string().uuid(),
        packVersionId: z.string().uuid(),
        selection: z.array(selectionItemSchema).min(1).max(200),
        reason: z.string().trim().max(2000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertScope(ctx, data.employerId, "job", data.jobId);
    const result = await ctx.supabase.rpc("rec_ri_save_composition", {
      _job_id: data.jobId,
      _expected_version: data.expectedVersion,
      _operation_id: data.operationId,
      _pack_version_id: data.packVersionId,
      _selection: data.selection,
      _reason: data.reason || null,
    });
    if (result.error) throw lifecycleError(result.error);
    return compositionSchema.parse(result.data);
  });

const caseCompositionSchema = z.object({
  caseId: z.string(),
  compositionId: z.string().nullable(),
  version: z.number(),
  packVersionId: z.string().optional(),
  selection: z.array(selectionItemSchema),
  confirmedAt: z.string().optional(),
  currentVersion: z.number(),
});
export type CaseComposition = z.infer<typeof caseCompositionSchema>;

export const getCaseComposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ installed: false } | ({ installed: true } & CaseComposition)> => {
      const ctx = context as Context;
      const result = await ctx.supabase.rpc("rec_ri_case_composition", { _case_id: data.caseId });
      if (result.error) {
        if (isSchemaMissing(result.error)) return { installed: false };
        throw lifecycleError(result.error);
      }
      return { installed: true, ...caseCompositionSchema.parse(result.data) };
    },
  );
