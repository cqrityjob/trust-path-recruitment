// Admin Portal — Assessment Assignments oversight.
//
// Reads through the caller's own RLS-scoped client using the new
// assignments_admin_select policy (20260724130000) -- admin-wide, every
// organisation, read-only. `invitation_token_hash` is never selected by
// any function in this file, in any form -- there is no operational
// reason for admin oversight to see it, hashed or not. Cancellation goes
// exclusively through admin_cancel_assessment_assignment() (SECURITY
// DEFINER, required reason, fixed precondition, self-audited) -- this
// file adds no cancellation logic of its own.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminFail, CANCELLATION_REASON_MAX } from "@/lib/admin/admin-error";
import type { EngineResultV1 } from "@/lib/career-intelligence-engine/types";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

const ASSIGNMENT_SELECT =
  "id, employer_id, assessment_id, use_case, status, recipient_email, recipient_user_id, " +
  "job_id, application_id, employee_id, language, expires_at, invited_at, opened_at, started_at, " +
  "completed_at, cancelled_at, cancellation_reason, cancelled_by, " +
  "email_delivery_status, email_delivery_error, email_sent_at, " +
  "employers(name), assessments(name_sv, name_en), jobs(title_sv, title_en), " +
  "employees(first_name, last_name)";

export type AdminAssignmentListRow = {
  id: string;
  employerId: string;
  employerName: string;
  assessmentId: string;
  assessmentNameSv: string;
  assessmentNameEn: string;
  useCase: string;
  status: string;
  recipientEmail: string;
  invitedAt: string;
  expiresAt: string;
  completedAt: string | null;
};

function mapRow(r: any) {
  const employer = Array.isArray(r.employers) ? r.employers[0] : r.employers;
  const assessment = Array.isArray(r.assessments) ? r.assessments[0] : r.assessments;
  const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
  const employee = Array.isArray(r.employees) ? r.employees[0] : r.employees;
  return { employer, assessment, job, employee };
}

const listSchema = z.object({
  status: z
    .enum(["all", "invited", "opened", "started", "completed", "expired", "cancelled"])
    .default("all"),
  employerId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});

export const adminListAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminAssignmentListRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    let q = ctx.supabase
      .from("assessment_assignments")
      .select(ASSIGNMENT_SELECT)
      .order("invited_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.employerId) q = q.eq("employer_id", data.employerId);

    const { data: rows, error } = await q;
    if (error) {
      console.error("[admin-assessment-assignments] list failed", error);
      throw new Error("ASSIGNMENTS_LOAD_FAILED");
    }

    const search = data.search?.toLowerCase();
    return (rows ?? [])
      .map((r: any) => {
        const { employer, assessment } = mapRow(r);
        return {
          id: r.id as string,
          employerId: r.employer_id as string,
          employerName: (employer?.name as string) ?? "",
          assessmentId: r.assessment_id as string,
          assessmentNameSv: (assessment?.name_sv as string) ?? r.assessment_id,
          assessmentNameEn: (assessment?.name_en as string) ?? r.assessment_id,
          useCase: r.use_case as string,
          status: r.status as string,
          recipientEmail: r.recipient_email as string,
          invitedAt: r.invited_at as string,
          expiresAt: r.expires_at as string,
          completedAt: (r.completed_at as string | null) ?? null,
        };
      })
      .filter((r: AdminAssignmentListRow) => {
        if (!search) return true;
        return (
          r.recipientEmail.toLowerCase().includes(search) ||
          r.employerName.toLowerCase().includes(search)
        );
      });
  });

export type AdminAssignmentDetail = AdminAssignmentListRow & {
  recipientUserId: string | null;
  jobId: string | null;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  applicationId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  language: "sv" | "en";
  openedAt: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  emailDeliveryStatus: "not_attempted" | "sent" | "failed";
  emailDeliveryError: string | null;
  emailSentAt: string | null;
};

const detailSchema = z.object({ assignmentId: z.string().uuid() });

export const adminGetAssignmentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminAssignmentDetail> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: row, error } = await ctx.supabase
      .from("assessment_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (error) {
      console.error("[admin-assessment-assignments] detail failed", error);
      throw new Error("ASSIGNMENT_LOAD_FAILED");
    }
    if (!row) throw new Error("ASSIGNMENT_NOT_FOUND");

    const { employer, assessment, job, employee } = mapRow(row);

    return {
      id: row.id,
      employerId: row.employer_id,
      employerName: employer?.name ?? "",
      assessmentId: row.assessment_id,
      assessmentNameSv: assessment?.name_sv ?? row.assessment_id,
      assessmentNameEn: assessment?.name_en ?? row.assessment_id,
      useCase: row.use_case,
      status: row.status,
      recipientEmail: row.recipient_email,
      recipientUserId: row.recipient_user_id ?? null,
      invitedAt: row.invited_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at ?? null,
      jobId: row.job_id ?? null,
      jobTitleSv: job?.title_sv ?? null,
      jobTitleEn: job?.title_en ?? null,
      applicationId: row.application_id ?? null,
      employeeId: row.employee_id ?? null,
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : null,
      language: row.language,
      openedAt: row.opened_at ?? null,
      startedAt: row.started_at ?? null,
      cancelledAt: row.cancelled_at ?? null,
      cancellationReason: row.cancellation_reason ?? null,
      cancelledBy: row.cancelled_by ?? null,
      emailDeliveryStatus: row.email_delivery_status,
      emailDeliveryError: row.email_delivery_error ?? null,
      emailSentAt: row.email_sent_at ?? null,
    };
  });

// The ceiling is CANCELLATION_REASON_MAX, not a literal, because the textarea
// and admin_cancel_assessment_assignment() enforce the same number and an admin
// who hits it should be told by the form rather than by a failed round trip.
const cancelSchema = z.object({
  assignmentId: z.string().uuid(),
  reason: z.string().trim().min(1).max(CANCELLATION_REASON_MAX),
});

export const adminCancelAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cancelSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; status: string }> => {
    const ctx = context as Ctx;
    // assertAdmin() gives a clean pre-check error; admin_cancel_assessment_assignment()
    // itself independently re-verifies is_platform_admin() regardless.
    await assertAdmin(ctx);

    const { data: result, error } = await ctx.supabase.rpc("admin_cancel_assessment_assignment", {
      _assignment_id: data.assignmentId,
      _reason: data.reason,
    });
    // Before 20261028090000 this branched on `error.code === "23514"` and threw
    // one string for it. Five unrelated conditions raise that SQLSTATE -- three
    // of the function's own refusals plus two table constraints reached from
    // inside its UPDATE -- so the string had to name all of them at once and
    // named none of them usefully. The refusals now carry their own identifiers
    // and adminFail() forwards whichever one arrived; anything unrecognised is
    // logged here and replaced, so a constraint name or a row fragment cannot
    // reach a browser.
    if (error) throw adminFail("admin-assessment-assignments", error, "ASSIGNMENT_CANCEL_FAILED");
    const row = Array.isArray(result) ? result[0] : result;
    return { id: row.id as string, status: row.new_status as string };
  });

// -------------------- Assessment Results oversight --------------------
// Admin-wide equivalent of getEmployerAssignmentReport
// (assessment-assignments.functions.ts) -- identical shape, identical
// cached EngineResultV1 read, no re-scoring, no second report
// implementation. Only differs in scope: any organisation's completed
// assignment, gated on assignments_admin_select RLS instead of the
// employer's own membership.

export type AdminAssignmentReport = {
  id: string;
  employerName: string;
  assessmentNameSv: string;
  assessmentNameEn: string;
  recipientEmail: string;
  employeeName: string | null;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  useCase: string;
  language: "sv" | "en";
  completedAt: string;
  assessmentVersionLabel: string;
  engineResult: EngineResultV1;
};

const reportSchema = z.object({ assignmentId: z.string().uuid() });

export const adminGetAssignmentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminAssignmentReport | null> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: row, error } = await ctx.supabase
      .from("assessment_assignments")
      .select(
        "id, recipient_email, use_case, language, completed_at, engine_result, job_id, employee_id, assessment_version_id, employers(name), assessments(name_sv, name_en), jobs(title_sv, title_en), employees(first_name, last_name), assessment_versions(model_version)",
      )
      .eq("id", data.assignmentId)
      .eq("status", "completed")
      .maybeSingle();
    if (error) {
      console.error("[admin-assessment-assignments] report load failed", error);
      throw new Error("REPORT_LOAD_FAILED");
    }
    if (!row || !row.engine_result) return null;

    const { employer, assessment, job, employee } = mapRow(row);
    const version = Array.isArray(row.assessment_versions)
      ? row.assessment_versions[0]
      : row.assessment_versions;

    return {
      id: row.id,
      employerName: employer?.name ?? "",
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
