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

// Phase H3.2.1 correction: this previously gated on employer_is_active_status
// (active-only), so a pending employer's owner got a hard "Forbidden" error
// just from opening the applications page -- even though a pending employer
// legitimately has zero applications (it cannot yet have a published job)
// and per the H3.2 spec must be able to *view* (an empty) applications list
// without error. Renamed and switched to employer_members_can_edit(), the
// same active/draft/pending gate already used for job drafts -- membership
// is still independently verified via has_employer_role() first. Actual row
// visibility for job_applications remains governed by
// job_applications_employer_select RLS (active employers only), so a
// pending employer still correctly sees zero rows -- this only removes the
// spurious hard error, it does not widen what data is reachable.
async function assertEmployerWorkspaceMember(ctx: Ctx, employerId: string): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("has_employer_role", {
    _user_id: ctx.userId,
    _employer_id: employerId,
    _roles: null,
  });
  if (error) throw new Error("Membership check failed.");
  if (!data) throw new Error("Forbidden: employer membership required");

  const { data: canAccess, error: canAccessErr } = await ctx.supabase.rpc(
    "employer_members_can_edit",
    { _employer_id: employerId },
  );
  if (canAccessErr) throw new Error("Employer status check failed.");
  if (!canAccess) throw new Error("Forbidden: employer workspace not accessible");
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
    await assertEmployerWorkspaceMember(ctx, app.employer_id);

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
// Phase H3.2 addition, corrected in H3.2.1 — listApplicationsForEmployer.
//
// The job_applications + jobs read now goes through the caller's own
// RLS-scoped ctx.supabase, not supabaseAdmin — job_applications_employer_select
// RLS already grants exactly the right rows (active employer, membership
// verified) and jobs_employer_select_own already permits the embedded jobs
// join. This satisfies the H3.2.1 requirement that ordinary employer reads
// never depend on a service-role key.
//
// The one narrow, still-justified exception is the applicant's display
// name: it lives in `public.profiles`, which is self-select-only RLS
// (profiles_self_select: id = auth.uid()) -- an employer's own RLS-scoped
// client structurally cannot join to another user's profile row, by
// design (candidate data minimisation). That lookup alone uses
// supabaseAdmin, after assertEmployerWorkspaceMember() has already
// verified membership, and is scoped to exactly the applicant IDs already
// returned by the RLS-scoped query above -- never an open-ended read. No
// CV bytes are returned here; only cv_storage_path's presence (boolean) is
// surfaced, so the UI can offer a signed-URL download via the existing
// getApplicationCvSignedUrl, which re-checks authorization again
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
    await assertEmployerWorkspaceMember(ctx, data.employerId);

    // RLS-scoped read -- job_applications_employer_select already limits
    // this to the caller's own active employer's rows (a pending employer
    // correctly gets zero rows here, not an error); jobs_employer_select_own
    // permits the embedded jobs(title_sv, title_en) join the same way.
    let query = ctx.supabase
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

    // Only the narrow, already-scoped applicant name lookup needs
    // service-role (profiles is self-select-only RLS) -- membership was
    // already verified above, and this only ever reads the exact
    // applicant IDs the RLS-scoped query above already authorised.
    const applicantIds: string[] = Array.from(
      new Set((rows ?? []).map((r: any) => r.applicant_user_id as string)),
    );
    const namesByUserId = new Map<string, string | null>();
    if (applicantIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      await assertEmployerWorkspaceMember(ctx, app.employer_id);
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
