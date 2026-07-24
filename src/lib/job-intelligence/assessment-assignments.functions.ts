// Employer Assessment Assignment workflow — server functions.
//
// Reuses the existing Assessment Platform end to end: the Question Library
// (assembleQuestionSet / resolveQuestionSet) for the exact preserved
// question set, and computeEngineResultV1 (career-intelligence-engine/index.ts)
// for the exact same deterministic scoring the public assessment and
// saveMyCareerReport already use. Nothing here re-implements or forks
// scoring, mapping, or question content.
//
// Two access models, matching the two kinds of caller:
//   1. Employer-side functions (create/list/cancel/report) run through the
//      caller's own RLS-scoped client (ctx.supabase from requireSupabaseAuth)
//      — RLS (assessment_assignments migration) is the real boundary, these
//      re-checks are defense-in-depth, same convention as every other
//      employer server function in this codebase.
//   2. Recipient-side functions (getAssignmentByToken, complete, result-by-
//      token) accept no employer/candidate identity at all — the plaintext
//      invitation token IS the bearer credential, exactly like a password-
//      reset link. An anonymous visitor has no Postgres role any RLS policy
//      could match, so these functions use the service-role client
//      (supabaseAdmin) and are themselves the entire authorization boundary:
//      hash the incoming token, look up the exact row, verify status/
//      expiry, and never return more than that one row's own safe fields.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { byDefinition } from "@/lib/question-library/registry";
import type { AssessmentProfileId } from "@/lib/question-library/types";
import type { AnswerMap } from "@/lib/career-assessment/types";
import {
  computeEngineResultV1,
  buildTargetVectorsFromLegacy,
} from "@/lib/career-intelligence-engine/index";
import {
  loadEnrichmentForSlugs,
  resolveQuestionSet,
} from "@/lib/career-intelligence-engine/compute.functions";
import type { EngineResultV1 } from "@/lib/career-intelligence-engine/types";

type Ctx = { supabase: any; userId: string; claims: any };

export type AssignmentUseCase = "recruitment" | "workforce";
export type AssignmentStatus =
  | "invited"
  | "opened"
  | "started"
  | "completed"
  | "expired"
  | "cancelled";

// The only Assessment Catalog definition employers can assign today.
// Extending this map is the entire change needed to support a second
// definition later -- no other code in this file is definition-specific.
const ASSESSMENT_PROFILE_BY_DEFINITION: Record<string, AssessmentProfileId> = {
  "security-guard-foundation": "security_professional",
};

function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.round((questionCount * 18) / 60));
}

async function assertActiveMembership(ctx: Ctx, employerId: string): Promise<void> {
  const { data: membership, error } = await ctx.supabase
    .from("employer_memberships")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("employer_id", employerId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !membership) throw new Error("ACCESS_NOT_AVAILABLE");
}

async function assertOrgActiveForAssignment(ctx: Ctx, employerId: string): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("employer_is_active_status", {
    _employer_id: employerId,
  });
  if (error) throw new Error("ACCESS_NOT_AVAILABLE");
  if (!data) throw new Error("ORGANISATION_NOT_ACTIVE");
}

function generateInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// -------- createAssessmentAssignment --------

const createSchema = z.object({
  employerId: z.string().uuid(),
  assessmentId: z.string().min(1),
  useCase: z.enum(["recruitment", "workforce"]),
  recipientEmail: z.string().trim().email().max(320),
  recipientUserId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  language: z.enum(["sv", "en"]).default("sv"),
  employerMessage: z.string().trim().max(2000).nullable().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const createAssessmentAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ id: string; invitationToken: string; expiresAt: string }> => {
      const ctx = context as Ctx;
      await assertActiveMembership(ctx, data.employerId);
      await assertOrgActiveForAssignment(ctx, data.employerId);

      const profileId = ASSESSMENT_PROFILE_BY_DEFINITION[data.assessmentId];
      if (!profileId) throw new Error("ASSESSMENT_NOT_ASSIGNABLE");

      // Same catalog-visibility gate as the employer catalogue itself — an
      // employer can only ever assign an assessment they were already shown.
      const { data: catalogRow, error: catalogErr } = await ctx.supabase
        .from("assessments")
        .select("id")
        .eq("id", data.assessmentId)
        .eq("employer_visible", true)
        .maybeSingle();
      if (catalogErr) throw new Error("ASSESSMENT_NOT_ASSIGNABLE");
      if (!catalogRow) throw new Error("ASSESSMENT_NOT_ASSIGNABLE");

      const { data: version, error: versionErr } = await ctx.supabase
        .from("assessment_versions")
        .select("id")
        .eq("assessment_id", data.assessmentId)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionErr || !version) throw new Error("NO_PUBLISHED_VERSION");

      // Cross-tenant guards: an application/employee id supplied by the
      // employer must actually belong to their own organisation. RLS already
      // enforces this for the underlying tables, but a friendly, specific
      // error here is worth the extra read.
      if (data.applicationId) {
        const { data: appRow } = await ctx.supabase
          .from("job_applications")
          .select("id, employer_id, job_id")
          .eq("id", data.applicationId)
          .eq("employer_id", data.employerId)
          .maybeSingle();
        if (!appRow) throw new Error("APPLICATION_NOT_FOUND");
      }
      if (data.employeeId) {
        const { data: empRow } = await ctx.supabase
          .from("employees")
          .select("id, employer_id")
          .eq("id", data.employeeId)
          .eq("employer_id", data.employerId)
          .maybeSingle();
        if (!empRow) throw new Error("EMPLOYEE_NOT_FOUND");
      }

      const { token, hash } = generateInvitationToken();
      const expiresAt =
        data.expiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { data: inserted, error } = await ctx.supabase
        .from("assessment_assignments")
        .insert({
          employer_id: data.employerId,
          assessment_id: data.assessmentId,
          assessment_version_id: version.id,
          profile_id: profileId,
          use_case: data.useCase,
          job_id: data.jobId ?? null,
          application_id: data.applicationId ?? null,
          employee_id: data.employeeId ?? null,
          recipient_email: data.recipientEmail.toLowerCase(),
          recipient_user_id: data.recipientUserId ?? null,
          assigned_by: ctx.userId,
          language: data.language,
          employer_message: data.employerMessage ?? null,
          invitation_token_hash: hash,
          expires_at: expiresAt,
        })
        .select("id, expires_at")
        .single();
      if (error) {
        console.error("[assessment-assignments] create failed", error.code ?? error.message);
        throw new Error("ASSIGNMENT_CREATE_FAILED");
      }

      return {
        id: inserted.id as string,
        invitationToken: token,
        expiresAt: inserted.expires_at as string,
      };
    },
  );

// -------- listAssignmentsForEmployer --------

export type EmployerAssignmentRow = {
  id: string;
  assessmentId: string;
  assessmentNameSv: string;
  assessmentNameEn: string;
  useCase: AssignmentUseCase;
  status: AssignmentStatus;
  recipientEmail: string;
  recipientUserId: string | null;
  jobId: string | null;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  applicationId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  invitedAt: string;
  expiresAt: string;
  completedAt: string | null;
  language: "sv" | "en";
};

const listSchema = z.object({
  employerId: z.string().uuid(),
  statusFilter: z.enum(["all", "active", "completed", "expired"]).default("all"),
});

const ACTIVE_STATUSES = ["invited", "opened", "started"] as const;

export const listAssignmentsForEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerAssignmentRow[]> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    let query = ctx.supabase
      .from("assessment_assignments")
      .select(
        "id, assessment_id, use_case, status, recipient_email, recipient_user_id, job_id, application_id, employee_id, invited_at, expires_at, completed_at, language, assessments(name_sv, name_en), jobs(title_sv, title_en), employees(first_name, last_name)",
      )
      .eq("employer_id", data.employerId)
      .order("invited_at", { ascending: false });

    if (data.statusFilter === "active")
      query = query.in("status", ACTIVE_STATUSES as unknown as string[]);
    else if (data.statusFilter === "completed") query = query.eq("status", "completed");
    else if (data.statusFilter === "expired") query = query.eq("status", "expired");

    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load assessment assignments.");

    return ((rows ?? []) as any[]).map((r) => {
      const assessment = Array.isArray(r.assessments) ? r.assessments[0] : r.assessments;
      const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
      const employee = Array.isArray(r.employees) ? r.employees[0] : r.employees;
      return {
        id: r.id,
        assessmentId: r.assessment_id,
        assessmentNameSv: assessment?.name_sv ?? r.assessment_id,
        assessmentNameEn: assessment?.name_en ?? r.assessment_id,
        useCase: r.use_case,
        status: r.status,
        recipientEmail: r.recipient_email,
        recipientUserId: r.recipient_user_id,
        jobId: r.job_id,
        jobTitleSv: job?.title_sv ?? null,
        jobTitleEn: job?.title_en ?? null,
        applicationId: r.application_id,
        employeeId: r.employee_id,
        employeeName: employee ? `${employee.first_name} ${employee.last_name}` : null,
        invitedAt: r.invited_at,
        expiresAt: r.expires_at,
        completedAt: r.completed_at,
        language: r.language,
      };
    });
  });

// -------- cancelAssessmentAssignment --------

const cancelSchema = z.object({
  employerId: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

export const cancelAssessmentAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cancelSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: updated, error } = await ctx.supabase
      .from("assessment_assignments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.assignmentId)
      .eq("employer_id", data.employerId)
      .in("status", ["invited", "opened", "started"])
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Could not cancel this assignment.");
    if (!updated) throw new Error("ASSIGNMENT_NOT_CANCELLABLE");
    return { id: updated.id as string };
  });

// -------- getEmployerAssignmentReport --------

export type EmployerAssignmentReport = {
  id: string;
  assessmentNameSv: string;
  assessmentNameEn: string;
  recipientEmail: string;
  employeeName: string | null;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  useCase: AssignmentUseCase;
  language: "sv" | "en";
  completedAt: string;
  assessmentVersionLabel: string;
  engineResult: EngineResultV1;
};

const employerReportSchema = z.object({
  employerId: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

export const getEmployerAssignmentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerReportSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerAssignmentReport | null> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: row, error } = await ctx.supabase
      .from("assessment_assignments")
      .select(
        "id, recipient_email, use_case, language, completed_at, engine_result, job_id, employee_id, assessment_version_id, assessments(name_sv, name_en), jobs(title_sv, title_en), employees(first_name, last_name), assessment_versions(model_version)",
      )
      .eq("id", data.assignmentId)
      .eq("employer_id", data.employerId)
      .eq("status", "completed")
      .maybeSingle();
    if (error) throw new Error("Could not load this result.");
    if (!row || !row.engine_result) return null;

    const assessment = Array.isArray(row.assessments) ? row.assessments[0] : row.assessments;
    const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    const employee = Array.isArray(row.employees) ? row.employees[0] : row.employees;
    const version = Array.isArray(row.assessment_versions)
      ? row.assessment_versions[0]
      : row.assessment_versions;

    return {
      id: row.id,
      assessmentNameSv: assessment?.name_sv ?? "",
      assessmentNameEn: assessment?.name_en ?? "",
      recipientEmail: row.recipient_email,
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : null,
      jobTitleSv: job?.title_sv ?? null,
      jobTitleEn: job?.title_en ?? null,
      useCase: row.use_case,
      language: row.language,
      completedAt: row.completed_at as string,
      assessmentVersionLabel: version?.model_version ?? "",
      engineResult: row.engine_result as EngineResultV1,
    };
  });

// ============================================================
// Recipient-side (token-authorized, no Postgres role) functions
// ============================================================

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

// Best-effort: if the request carries a valid Supabase bearer token, return
// the caller's userId + verified email; otherwise null. Never throws — an
// anonymous recipient completing an invited assessment is the expected,
// supported case, not an error. This intentionally duplicates only the
// token-parsing shape of requireSupabaseAuth (auth-middleware.ts is
// generated, never edited) and never treats a missing/invalid token as
// anything other than "anonymous caller".
async function getOptionalCaller(): Promise<{ userId: string; email: string | null } | null> {
  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length);
    if (!token || token.split(".").length !== 3) return null;

    const admin = await getAdminClient();
    const { data, error } = await admin.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return {
      userId: data.claims.sub as string,
      email: (data.claims.email as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export type AssignmentTokenView = {
  id: string;
  status: AssignmentStatus;
  assessmentId: string;
  assessmentNameSv: string;
  assessmentNameEn: string;
  employerName: string;
  language: "sv" | "en";
  useCase: AssignmentUseCase;
  employerMessage: string | null;
  expiresAt: string;
  questionCount: number;
  estimatedMinutes: number;
  profileId: string;
};

const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const getAssignmentByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<AssignmentTokenView | null> => {
    const admin = await getAdminClient();
    const hash = hashToken(data.token);

    const { data: row, error } = await admin
      .from("assessment_assignments")
      .select(
        "id, status, assessment_id, employer_message, language, use_case, expires_at, profile_id, assessments(name_sv, name_en), employers(name)",
      )
      .eq("invitation_token_hash", hash)
      .maybeSingle();
    if (error || !row) return null;

    let status = row.status as AssignmentStatus;
    const isExpired =
      status !== "completed" && status !== "cancelled" && new Date(row.expires_at) < new Date();
    if (isExpired && status !== "expired") {
      await admin
        .from("assessment_assignments")
        .update({ status: "expired" })
        .eq("id", row.id)
        .eq("status", status);
      status = "expired";
    } else if (status === "invited") {
      // Best-effort, idempotent: first open transitions invited -> opened.
      await admin
        .from("assessment_assignments")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "invited");
      status = "opened";
    }

    const assets = byDefinition(row.assessment_id);
    const assessment = Array.isArray(row.assessments) ? row.assessments[0] : row.assessments;
    const employer = Array.isArray(row.employers) ? row.employers[0] : row.employers;

    return {
      id: row.id,
      status,
      assessmentId: row.assessment_id,
      assessmentNameSv: assessment?.name_sv ?? row.assessment_id,
      assessmentNameEn: assessment?.name_en ?? row.assessment_id,
      employerName: employer?.name ?? "",
      language: row.language,
      useCase: row.use_case,
      employerMessage: row.employer_message,
      expiresAt: row.expires_at,
      questionCount: assets.length,
      estimatedMinutes: estimateMinutes(assets.length),
      profileId: row.profile_id,
    };
  });

// -------- getCompletedAssignmentResultByToken --------
//
// Read-only re-display for a recipient returning to their own invitation
// link after completion. Token-authorized exactly like getAssignmentByToken
// — never exposes anything unless status is already 'completed'.

export const getCompletedAssignmentResultByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<{ engineResult: EngineResultV1 } | null> => {
    const admin = await getAdminClient();
    const hash = hashToken(data.token);
    const { data: row, error } = await admin
      .from("assessment_assignments")
      .select("engine_result, status")
      .eq("invitation_token_hash", hash)
      .eq("status", "completed")
      .maybeSingle();
    if (error || !row?.engine_result) return null;
    return { engineResult: row.engine_result as EngineResultV1 };
  });

// -------- startAssessmentAssignment --------

export const startAssessmentAssignment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<{ completionId: string }> => {
    const admin = await getAdminClient();
    const hash = hashToken(data.token);

    const { data: row, error } = await admin
      .from("assessment_assignments")
      .select("id, status, completion_id, expires_at")
      .eq("invitation_token_hash", hash)
      .maybeSingle();
    if (error || !row) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (row.status === "cancelled" || row.status === "expired")
      throw new Error("ASSIGNMENT_NOT_AVAILABLE");
    if (row.status === "completed") throw new Error("ASSIGNMENT_ALREADY_COMPLETED");
    if (new Date(row.expires_at) < new Date()) throw new Error("ASSIGNMENT_EXPIRED");

    if (row.completion_id) return { completionId: row.completion_id as string };

    const completionId = crypto.randomUUID();
    await admin
      .from("assessment_assignments")
      .update({
        status: "started",
        started_at: new Date().toISOString(),
        completion_id: completionId,
      })
      .eq("id", row.id)
      .in("status", ["invited", "opened"]);
    return { completionId };
  });

// -------- completeAssessmentAssignment --------

const completeSchema = z.object({
  token: z.string().min(20).max(200),
  completionId: z.string().uuid(),
  answers: z.record(z.string(), z.any()),
});

export type CompleteAssignmentResult = {
  engineResult: EngineResultV1;
  alreadyCompleted: boolean;
};

export const completeAssessmentAssignment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => completeSchema.parse(d))
  .handler(async ({ data }): Promise<CompleteAssignmentResult> => {
    const admin = await getAdminClient();
    const hash = hashToken(data.token);

    const { data: row, error } = await admin
      .from("assessment_assignments")
      .select(
        "id, status, assessment_id, profile_id, completion_id, engine_result, recipient_email, expires_at",
      )
      .eq("invitation_token_hash", hash)
      .maybeSingle();
    if (error || !row) throw new Error("ASSIGNMENT_NOT_FOUND");

    // Idempotent replay: same completion attempt, already processed.
    if (row.status === "completed") {
      if (row.completion_id === data.completionId && row.engine_result) {
        return { engineResult: row.engine_result as EngineResultV1, alreadyCompleted: true };
      }
      throw new Error("ASSIGNMENT_ALREADY_COMPLETED");
    }
    if (row.status === "cancelled") throw new Error("ASSIGNMENT_NOT_AVAILABLE");
    if (new Date(row.expires_at) < new Date()) throw new Error("ASSIGNMENT_EXPIRED");
    if (row.completion_id && row.completion_id !== data.completionId) {
      throw new Error("ASSIGNMENT_COMPLETION_MISMATCH");
    }

    // Compute via the existing, unmodified scoring engine -- identical call
    // shape to saveMyCareerReport(). Never a second scoring implementation.
    const questionSet = resolveQuestionSet(
      row.assessment_id,
      row.profile_id as AssessmentProfileId,
    );
    const targets = buildTargetVectorsFromLegacy();
    const enrichmentByLegacySlug = await loadEnrichmentForSlugs(targets.map((t) => t.legacySlug));
    const engineResult = computeEngineResultV1({
      answers: data.answers as AnswerMap,
      targets,
      enrichmentByLegacySlug,
      options: { topN: 5 },
      assessmentDefinitionId: row.assessment_id,
      questionSet,
    });

    const nowIso = new Date().toISOString();
    const { data: updated } = await admin
      .from("assessment_assignments")
      .update({
        status: "completed",
        completed_at: nowIso,
        completion_id: data.completionId,
        answers: data.answers,
        engine_result: engineResult,
      })
      .eq("id", row.id)
      .in("status", ["invited", "opened", "started"])
      .select("id")
      .maybeSingle();

    if (!updated) {
      // Lost a race to a concurrent completion attempt -- re-read and
      // return the winner's result rather than erroring the recipient.
      const { data: winner } = await admin
        .from("assessment_assignments")
        .select("engine_result")
        .eq("id", row.id)
        .maybeSingle();
      if (winner?.engine_result)
        return { engineResult: winner.engine_result as EngineResultV1, alreadyCompleted: true };
      throw new Error("ASSIGNMENT_COMPLETE_FAILED");
    }

    // If the recipient is authenticated right now and their verified email
    // matches, materialise a real assessment_runs row immediately via the
    // exact same save_career_report() RPC saveMyCareerReport() uses -- no
    // duplicate scoring, no duplicate persistence path. A mismatched
    // signed-in identity never gets linked; the cached result above is
    // already the complete, correct employer-facing record regardless.
    const caller = await getOptionalCaller();
    if (caller?.email && caller.email.toLowerCase() === row.recipient_email) {
      await linkAssignmentRun(
        admin,
        row.id,
        caller.userId,
        data.completionId,
        engineResult,
        data.answers as AnswerMap,
        row.assessment_id,
        row.profile_id,
      );
    }

    return { engineResult, alreadyCompleted: false };
  });

// -------- claimAssessmentAssignment (explicit post-hoc linking) --------

const claimSchema = z.object({ assignmentId: z.string().uuid() });

export const claimAssessmentAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => claimSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ linked: boolean; runId: string | null }> => {
    const ctx = context as Ctx;
    const admin = await getAdminClient();

    // Verified email comes from the caller's own JWT claims (the same
    // requireSupabaseAuth-verified token every other employer/candidate
    // function trusts), never a client-supplied field -- this is the
    // entire security boundary for linking a pre-authentication
    // completion to a real account.
    const email = (ctx.claims?.email as string | undefined)?.toLowerCase();
    if (!email) throw new Error("EMAIL_NOT_VERIFIED");

    const { data: row } = await admin
      .from("assessment_assignments")
      .select(
        "id, status, recipient_email, recipient_user_id, assessment_run_id, engine_result, answers, completion_id, assessment_id, profile_id",
      )
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (!row) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (row.status !== "completed") throw new Error("ASSIGNMENT_NOT_COMPLETED");
    if (row.recipient_email !== email) throw new Error("EMAIL_MISMATCH");
    if (row.assessment_run_id) return { linked: true, runId: row.assessment_run_id as string };

    const runId = await linkAssignmentRun(
      admin,
      row.id,
      ctx.userId,
      row.completion_id as string,
      row.engine_result as EngineResultV1,
      row.answers as AnswerMap,
      row.assessment_id as string,
      row.profile_id as string,
    );
    return { linked: true, runId };
  });

// Shared by completeAssessmentAssignment (inline, if already signed in) and
// claimAssessmentAssignment (explicit, after the fact). Calls the exact
// same save_career_report() RPC saveMyCareerReport() uses, passing the
// already-computed engineResult's own inputs rather than recomputing --
// one scoring pass per completion, ever.
async function linkAssignmentRun(
  admin: any,
  assignmentId: string,
  userId: string,
  completionId: string,
  engineResult: EngineResultV1,
  answers: AnswerMap,
  assessmentId: string,
  profileId: string,
): Promise<string | null> {
  const { GRAPH_VERSION } = await import("@/lib/knowledge-graph/graph-meta");
  const { data: version } = await admin
    .from("assessment_versions")
    .select("id")
    .eq("assessment_id", assessmentId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return null;

  const { data: rpcResult, error } = await admin.rpc("save_career_report", {
    p_user_id: userId,
    p_completion_id: completionId,
    p_assessment_id: assessmentId,
    p_assessment_version_id: version.id,
    p_graph_version: GRAPH_VERSION,
    p_locale: "sv",
    p_result_summary: {},
    p_profile_snapshot: null,
    p_report: {
      reportVersion: "employer-assignment-v1",
      completionId,
      savedAt: new Date().toISOString(),
      engineVersion: engineResult.engineVersion,
      graphVersion: GRAPH_VERSION,
      inputsHash: engineResult.inputsHash,
      locale: "sv",
      engineResult,
      profileSnapshot: null,
      assessmentDefinitionId: assessmentId,
      profileId,
    },
    p_report_version: "employer-assignment-v1",
    p_engine_version: engineResult.engineVersion,
    p_profile_version: null,
    p_inputs_hash: engineResult.inputsHash,
  });
  if (error) {
    console.error("[assessment-assignments] link run failed", error.code ?? error.message);
    return null;
  }
  const row = (rpcResult as Array<{ run_id: string }> | null)?.[0];
  if (!row) return null;

  await admin
    .from("assessment_assignments")
    .update({ recipient_user_id: userId, assessment_run_id: row.run_id })
    .eq("id", assignmentId)
    .is("assessment_run_id", null);

  return row.run_id;
}

// -------- getMyLinkableAssignments --------
//
// For a signed-in candidate: any completed assignment matching their
// verified email that hasn't been linked to a run yet -- surfaced so My
// Career can offer "link this result to your profile" explicitly, per the
// product requirement that linking is offered, never automatic without
// their own signed-in action.

export const getMyLinkableAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<
      Array<{ id: string; assessmentNameSv: string; assessmentNameEn: string; completedAt: string }>
    > => {
      const ctx = context as Ctx;
      const email = (ctx.claims?.email as string | undefined)?.toLowerCase();
      if (!email) return [];

      const admin = await getAdminClient();
      const { data: rows } = await admin
        .from("assessment_assignments")
        .select("id, completed_at, assessments(name_sv, name_en)")
        .eq("recipient_email", email)
        .eq("status", "completed")
        .is("assessment_run_id", null);

      return ((rows ?? []) as any[]).map((r) => {
        const assessment = Array.isArray(r.assessments) ? r.assessments[0] : r.assessments;
        return {
          id: r.id,
          assessmentNameSv: assessment?.name_sv ?? "",
          assessmentNameEn: assessment?.name_en ?? "",
          completedAt: r.completed_at,
        };
      });
    },
  );
