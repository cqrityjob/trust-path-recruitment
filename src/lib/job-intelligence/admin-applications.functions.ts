// Admin Portal — Applications oversight (read-only).
//
// Every read goes through the caller's own RLS-scoped client using the
// existing job_applications_admin_select / job_application_status_events_admin_select
// policies (H3.4A) -- no service role for row data. Applicant display
// name is the one narrow, justified supabaseAdmin read (profiles is
// self-select-only RLS), scoped to exactly the applicant ids already
// resolved from the RLS-scoped read, mirroring admin-employer-moderation's
// own established rationale.
//
// Deliberately no status-change function in this file: admin oversight
// must never silently modify an employer's recruitment decision, and no
// automated candidate decision is introduced here. set_application_status()
// remains reachable only by the candidate (withdraw) and the employer
// (reviewing/interview/rejected/hired), unchanged.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

export type AdminApplicationListRow = {
  id: string;
  jobId: string;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  employerId: string;
  employerName: string;
  applicantUserId: string;
  applicantEmail: string | null;
  status: string;
  assignmentStatus: string | null;
  createdAt: string;
};

const listSchema = z.object({
  status: z
    .enum(["all", "submitted", "reviewing", "interview", "rejected", "hired", "withdrawn"])
    .default("all"),
  search: z.string().trim().max(120).optional(),
});

export const adminListApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminApplicationListRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    let q = ctx.supabase
      .from("job_applications")
      .select(
        "id, job_id, employer_id, applicant_user_id, status, created_at, jobs(title_sv, title_en), employers(name)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) {
      console.error("[admin-applications] list failed", error);
      throw new Error("APPLICATIONS_LOAD_FAILED");
    }

    const applicationIds = (rows ?? []).map((r: any) => r.id as string);
    const applicantIds: string[] = Array.from(
      new Set((rows ?? []).map((r: any) => r.applicant_user_id as string)),
    );

    const [assignmentsRes, applicantEmails] = await Promise.all([
      applicationIds.length > 0
        ? ctx.supabase
            .from("assessment_assignments")
            .select("application_id, status")
            .in("application_id", applicationIds)
        : Promise.resolve({ data: [], error: null }),
      (async () => {
        if (applicantIds.length === 0) return new Map<string, string | null>();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const emails = new Map<string, string | null>();
        await Promise.all(
          applicantIds.map(async (uid: string) => {
            const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
            emails.set(uid, u?.user?.email ?? null);
          }),
        );
        return emails;
      })(),
    ]);
    if (assignmentsRes.error) {
      console.error("[admin-applications] assignment lookup failed", assignmentsRes.error);
      throw new Error("APPLICATIONS_LOAD_FAILED");
    }

    const assignmentStatusByApplication = new Map<string, string>();
    for (const a of assignmentsRes.data ?? []) {
      if (a.application_id) assignmentStatusByApplication.set(a.application_id, a.status);
    }

    const search = data.search?.toLowerCase();
    return (rows ?? [])
      .map((r: any) => {
        const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
        const employer = Array.isArray(r.employers) ? r.employers[0] : r.employers;
        return {
          id: r.id as string,
          jobId: r.job_id as string,
          jobTitleSv: (job?.title_sv as string | null) ?? null,
          jobTitleEn: (job?.title_en as string | null) ?? null,
          employerId: r.employer_id as string,
          employerName: (employer?.name as string) ?? "",
          applicantUserId: r.applicant_user_id as string,
          applicantEmail: applicantEmails.get(r.applicant_user_id as string) ?? null,
          status: r.status as string,
          assignmentStatus: assignmentStatusByApplication.get(r.id as string) ?? null,
          createdAt: r.created_at as string,
        };
      })
      .filter((r: AdminApplicationListRow) => {
        if (!search) return true;
        return (
          (r.applicantEmail ?? "").toLowerCase().includes(search) ||
          r.employerName.toLowerCase().includes(search) ||
          (r.jobTitleSv ?? "").toLowerCase().includes(search) ||
          (r.jobTitleEn ?? "").toLowerCase().includes(search)
        );
      });
  });

export type AdminApplicationStatusEvent = {
  id: string;
  previousStatus: string;
  newStatus: string;
  actorRole: string | null;
  note: string | null;
  createdAt: string;
};

export type AdminApplicationDetail = {
  id: string;
  jobId: string;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  employerId: string;
  employerName: string;
  applicantUserId: string;
  applicantEmail: string | null;
  applicantDisplayName: string | null;
  status: string;
  createdAt: string;
  consentGivenAt: string | null;
  statusHistory: AdminApplicationStatusEvent[];
  linkedAssignmentId: string | null;
  linkedAssignmentStatus: string | null;
};

const detailSchema = z.object({ applicationId: z.string().uuid() });

export const adminGetApplicationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminApplicationDetail> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: row, error } = await ctx.supabase
      .from("job_applications")
      .select(
        "id, job_id, employer_id, applicant_user_id, status, created_at, consent_given_at, jobs(title_sv, title_en), employers(name)",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) {
      console.error("[admin-applications] detail failed", error);
      throw new Error("APPLICATION_LOAD_FAILED");
    }
    if (!row) throw new Error("APPLICATION_NOT_FOUND");

    const [{ data: historyRows }, { data: assignmentRows }] = await Promise.all([
      ctx.supabase
        .from("job_application_status_events")
        .select("id, previous_status, new_status, actor_role, note, created_at")
        .eq("application_id", data.applicationId)
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("assessment_assignments")
        .select("id, status")
        .eq("application_id", data.applicationId)
        .limit(1),
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: authUser }, { data: profileRow }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(row.applicant_user_id),
      supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", row.applicant_user_id)
        .maybeSingle(),
    ]);

    const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    const employer = Array.isArray(row.employers) ? row.employers[0] : row.employers;
    const assignment = (assignmentRows ?? [])[0] ?? null;

    return {
      id: row.id,
      jobId: row.job_id,
      jobTitleSv: job?.title_sv ?? null,
      jobTitleEn: job?.title_en ?? null,
      employerId: row.employer_id,
      employerName: employer?.name ?? "",
      applicantUserId: row.applicant_user_id,
      applicantEmail: authUser?.user?.email ?? null,
      applicantDisplayName: profileRow?.display_name ?? null,
      status: row.status,
      createdAt: row.created_at,
      consentGivenAt: row.consent_given_at ?? null,
      statusHistory: (historyRows ?? []).map((e: any) => ({
        id: e.id as string,
        previousStatus: e.previous_status as string,
        newStatus: e.new_status as string,
        actorRole: (e.actor_role as string) ?? null,
        note: (e.note as string) ?? null,
        createdAt: e.created_at as string,
      })),
      linkedAssignmentId: assignment?.id ?? null,
      linkedAssignmentStatus: assignment?.status ?? null,
    };
  });
