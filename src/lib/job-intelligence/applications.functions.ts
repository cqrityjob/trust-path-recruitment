import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Jobs MVP v1 — H1: Server functions for job applications.
//
// All application state changes go through these functions. The
// `job_applications` table has no UPDATE policy for the `authenticated` role,
// so employers and candidates cannot bypass moderation by writing directly.
//
// - withdraw_my_application: candidate withdraws their own submitted/viewed
//   application. Sets status='withdrawn' and withdrawn_at=now().
// - update_application_as_employer: active employer member marks a
//   submitted application as viewed and optionally records an employer note.
// - get_application_cv_signed_url: issues a short-lived signed URL for a
//   stored CV, gated on either applicant ownership or active employer role
//   on the parent job's employer.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

async function loadApplication(ctx: Ctx, applicationId: string) {
  const { data, error } = await ctx.supabase
    .from("job_applications")
    .select("id, job_id, employer_id, applicant_user_id, status, cv_storage_path")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load application: ${error.message}`);
  if (!data) throw new Error("Application not found or access denied");
  return data as {
    id: string;
    job_id: string;
    employer_id: string;
    applicant_user_id: string;
    status: string;
    cv_storage_path: string | null;
  };
}

async function assertActiveEmployerMember(ctx: Ctx, employerId: string): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("has_employer_role", {
    _user_id: ctx.userId,
    _employer_id: employerId,
    _roles: null,
  });
  if (error) throw new Error(`Membership check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: employer membership required");

  const { data: isActive, error: activeErr } = await ctx.supabase.rpc("employer_is_active_status", {
    _employer_id: employerId,
  });
  if (activeErr) throw new Error(`Employer status check failed: ${activeErr.message}`);
  if (!isActive) throw new Error("Forbidden: employer is not active");
}

export const withdrawMyApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const app = await loadApplication(ctx, data.applicationId);
    if (app.applicant_user_id !== ctx.userId) {
      throw new Error("Forbidden: not the applicant");
    }
    if (app.status === "withdrawn") return { ok: true, alreadyWithdrawn: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("job_applications")
      .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("applicant_user_id", ctx.userId);
    if (error) throw new Error(`Failed to withdraw application: ${error.message}`);
    return { ok: true, alreadyWithdrawn: false };
  });

export const updateApplicationAsEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        applicationId: z.string().uuid(),
        markViewed: z.boolean().optional(),
        employerNote: z.string().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const app = await loadApplication(ctx, data.applicationId);
    await assertActiveEmployerMember(ctx, app.employer_id);

    const patch: { status?: "viewed"; employer_note?: string | null } = {};
    if (data.markViewed && app.status === "submitted") patch.status = "viewed";
    if (data.employerNote !== undefined) patch.employer_note = data.employerNote;

    if (Object.keys(patch).length === 0) return { ok: true, changed: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("job_applications")
      .update(patch)
      .eq("id", app.id)
      .eq("employer_id", app.employer_id);
    if (error) throw new Error(`Failed to update application: ${error.message}`);
    return { ok: true, changed: true };
  });

// -----------------------------------------------------------------------------
// Phase H3.2 addition — listApplicationsForEmployer.
//
// The candidate applicant's display name lives in `public.profiles`, which
// is self-select-only (profiles_self_select: id = auth.uid()) -- an
// employer's own RLS-scoped client cannot join to it. This function
// therefore follows the same two-step pattern already established
// elsewhere in this codebase (getEmployerDashboardStats,
// updateApplicationAsEmployer's own use of supabaseAdmin after an
// app-level check): verify the caller's active employer membership first
// via assertActiveEmployerMember() (RLS-scoped RPC calls, not trusted from
// any client-supplied role/status), THEN use supabaseAdmin only for the
// actual privileged read, scoped explicitly by employer_id (and,
// optionally, job_id) in the query itself -- never a blanket unscoped
// select. No CV bytes are returned here; only cv_storage_path's presence
// (boolean) is surfaced, so the UI can offer a signed-URL download via the
// existing getApplicationCvSignedUrl, which re-checks authorization again
// independently.
// -----------------------------------------------------------------------------

const listApplicationsForEmployerSchema = z.object({
  employerId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
});

export type EmployerApplicationRow = {
  id: string;
  jobId: string;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  applicantDisplayName: string | null;
  phone: string | null;
  coverNote: string | null;
  status: "submitted" | "viewed" | "withdrawn";
  hasCv: boolean;
  createdAt: string;
};

export const listApplicationsForEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listApplicationsForEmployerSchema.parse(input))
  .handler(async ({ data, context }): Promise<EmployerApplicationRow[]> => {
    const ctx = context as unknown as Ctx;
    await assertActiveEmployerMember(ctx, data.employerId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("job_applications")
      .select(
        "id, job_id, applicant_user_id, phone, cover_note, status, cv_storage_path, created_at, jobs(title_sv, title_en)",
      )
      .eq("employer_id", data.employerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.jobId) query = query.eq("job_id", data.jobId);

    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load applications.");

    const applicantIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.applicant_user_id as string)),
    );
    const namesByUserId = new Map<string, string | null>();
    if (applicantIds.length > 0) {
      const { data: profileRows } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", applicantIds);
      for (const p of profileRows ?? []) {
        namesByUserId.set(p.id as string, (p.display_name as string | null) ?? null);
      }
    }

    return (rows ?? []).map((r: any) => {
      const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
      return {
        id: r.id as string,
        jobId: r.job_id as string,
        jobTitleSv: (job?.title_sv as string | null) ?? null,
        jobTitleEn: (job?.title_en as string | null) ?? null,
        applicantDisplayName: namesByUserId.get(r.applicant_user_id as string) ?? null,
        phone: r.phone as string | null,
        coverNote: r.cover_note as string | null,
        status: r.status as EmployerApplicationRow["status"],
        hasCv: Boolean(r.cv_storage_path),
        createdAt: r.created_at as string,
      };
    });
  });

export const getApplicationCvSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const app = await loadApplication(ctx, data.applicationId);
    if (!app.cv_storage_path) throw new Error("No CV attached to this application");

    const isApplicant = app.applicant_user_id === ctx.userId;
    if (!isApplicant) {
      await assertActiveEmployerMember(ctx, app.employer_id);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("job-application-cvs")
      .createSignedUrl(app.cv_storage_path, 60 * 5); // 5 minutes
    if (error || !signed) {
      throw new Error(`Failed to sign CV URL: ${error?.message ?? "unknown error"}`);
    }
    return { url: signed.signedUrl, expiresInSeconds: 300 };
  });
