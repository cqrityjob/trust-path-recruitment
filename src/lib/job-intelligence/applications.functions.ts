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

async function assertActiveEmployerMember(
  ctx: Ctx,
  employerId: string,
): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("has_employer_role", {
    _user_id: ctx.userId,
    _employer_id: employerId,
    _roles: null,
  });
  if (error) throw new Error(`Membership check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: employer membership required");

  const { data: isActive, error: activeErr } = await ctx.supabase.rpc(
    "employer_is_active_status",
    { _employer_id: employerId },
  );
  if (activeErr) throw new Error(`Employer status check failed: ${activeErr.message}`);
  if (!isActive) throw new Error("Forbidden: employer is not active");
}

export const withdrawMyApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ applicationId: z.string().uuid() }).parse(input),
  )
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

export const getApplicationCvSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ applicationId: z.string().uuid() }).parse(input),
  )
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