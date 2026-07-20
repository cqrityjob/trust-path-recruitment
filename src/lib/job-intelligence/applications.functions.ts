import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Jobs MVP v1 H1 + H3.4A: server functions for job applications.
//
// H3.4A adds the candidate-facing submission path (submitJobApplication,
// listMyApplications) and switches every status change (employer- and
// candidate-driven alike) onto the new set_application_status() SECURITY
// DEFINER RPC (supabase/migrations/20260720150000_h3_4a_candidate_
// application_core.sql) -- mirroring the H3.3 employer-moderation design:
// role is derived server-side inside the RPC (never trusted from client
// input), a fixed transition allow-list is enforced in the database, and
// every change atomically writes exactly one job_application_status_events
// audit row. There remains no UPDATE grant/policy for `authenticated` on
// job_applications at all beyond the pre-existing admin-only one, so there
// is no client-side raw-update bypass to guard against separately -- the
// RPC is genuinely the only path.
//
// - submitJobApplication: candidate applies to a published, on-platform
//   ("internal") job. Uploads the CV (service-role only -- the storage
//   bucket has zero client-facing policies, unchanged) THEN inserts the
//   job_applications row through the caller's own RLS-scoped client (owner
//   INSERT policy + the job-eligibility/duplicate checks enforced by the
//   database itself). If the insert fails for any reason, the just-
//   uploaded CV is deleted before the error is surfaced.
// - listMyApplications: candidate's own application history.
// - withdrawMyApplication: candidate withdraws their own eligible
//   application, via set_application_status().
// - updateApplicationStatusAsEmployer: active employer member advances an
//   application's status and/or records a note, via
//   set_application_status().
// - listApplicationsForEmployer: unchanged read path (RLS-scoped), status
//   union extended.
// - listApplicationStatusEvents: the audit trail for one application,
//   visible to the applicant and to the employer.
// - getApplicationCvSignedUrl: unchanged (still service-role, still a
//   short-lived 5-minute signed URL, still gated on applicant ownership or
//   active employer membership).
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "interview"
  | "rejected"
  | "hired"
  | "withdrawn";

const MAX_CV_BYTES = 5 * 1024 * 1024; // 5MB, matches the DB CHECK constraint
const PDF_MAGIC = "%PDF-";

async function loadApplication(ctx: Ctx, applicationId: string) {
  const { data, error } = await ctx.supabase
    .from("job_applications")
    .select("id, job_id, employer_id, applicant_user_id, status, cv_storage_path")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) {
    console.error("[applications] loadApplication query failed", error);
    throw new Error("Could not load this application.");
  }
  if (!data) throw new Error("Application not found or access denied");
  return data as {
    id: string;
    job_id: string;
    employer_id: string;
    applicant_user_id: string;
    status: ApplicationStatus;
    cv_storage_path: string | null;
  };
}

// Phase H3.2.1 correction (unchanged): active-only would incorrectly hard-
// error a pending employer's own applications page, which legitimately has
// zero rows. Membership is independently verified via has_employer_role()
// first; actual row visibility stays governed by RLS.
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

// -------------------- SUBMIT (candidate) --------------------

const submitApplicationSchema = z.object({
  jobId: z.string().uuid(),
  phone: z.string().trim().max(40).optional().nullable(),
  coverNote: z.string().trim().max(1000).optional().nullable(),
  consent: z.literal(true),
  cvFilename: z.string().trim().min(1).max(200),
  cvBase64: z.string().min(1),
});

export const submitJobApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitApplicationSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; status: ApplicationStatus }> => {
    const ctx = context as Ctx;

    // Early, friendly checks via the caller's own RLS-scoped client -- the
    // database (BEFORE INSERT trigger + partial unique index) is the real
    // boundary and re-validates both independently.
    const { data: job, error: jobErr } = await ctx.supabase
      .from("jobs")
      .select("id, status, application_method")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jobErr) {
      console.error("[applications] submitJobApplication job lookup failed", jobErr);
      throw new Error("JOB_LOOKUP_FAILED");
    }
    if (!job || job.status !== "published" || job.application_method !== "internal") {
      throw new Error("JOB_NOT_APPLICABLE");
    }

    const { data: existing, error: existingErr } = await ctx.supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", data.jobId)
      .eq("applicant_user_id", ctx.userId)
      .neq("status", "withdrawn")
      .maybeSingle();
    if (existingErr) {
      console.error("[applications] submitJobApplication duplicate check failed", existingErr);
      throw new Error("DUPLICATE_CHECK_FAILED");
    }
    if (existing) throw new Error("DUPLICATE_APPLICATION");

    // Decode + validate the CV. PDF only (brief: "secure PDF CV upload").
    let cvBuffer: Buffer;
    try {
      cvBuffer = Buffer.from(data.cvBase64, "base64");
    } catch {
      throw new Error("CV_INVALID");
    }
    if (cvBuffer.length === 0 || cvBuffer.length > MAX_CV_BYTES) {
      throw new Error("CV_TOO_LARGE");
    }
    if (cvBuffer.subarray(0, PDF_MAGIC.length).toString("ascii") !== PDF_MAGIC) {
      throw new Error("CV_NOT_PDF");
    }

    const applicationId = crypto.randomUUID();
    const safeFilename = data.cvFilename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "cv.pdf";
    const storagePath = `${ctx.userId}/${applicationId}/${safeFilename}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("job-application-cvs")
      .upload(storagePath, cvBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadErr) {
      console.error("[applications] CV upload failed", uploadErr);
      throw new Error("CV_UPLOAD_FAILED");
    }

    const { data: inserted, error: insertErr } = await ctx.supabase
      .from("job_applications")
      .insert({
        id: applicationId,
        job_id: data.jobId,
        applicant_user_id: ctx.userId,
        phone: data.phone || null,
        cover_note: data.coverNote || null,
        cv_storage_path: storagePath,
        cv_original_filename: data.cvFilename,
        cv_mime_type: "application/pdf",
        cv_size_bytes: cvBuffer.length,
        consent_given_at: new Date().toISOString(),
      })
      .select("id, status")
      .single();

    if (insertErr) {
      // Failed submission cleans up the uploaded CV -- never leave an
      // orphaned file for an application that doesn't exist.
      await supabaseAdmin.storage.from("job-application-cvs").remove([storagePath]);
      console.error("[applications] submitJobApplication insert failed", insertErr);
      if (insertErr.code === "23505") throw new Error("DUPLICATE_APPLICATION");
      if (insertErr.code === "23514") throw new Error("JOB_NOT_APPLICABLE");
      throw new Error("SUBMISSION_FAILED");
    }

    return { id: inserted.id as string, status: inserted.status as ApplicationStatus };
  });

// -------------------- CANDIDATE HISTORY --------------------

export type MyApplicationRow = {
  id: string;
  jobId: string;
  jobSlug: string | null;
  jobTitleSv: string | null;
  jobTitleEn: string | null;
  employerName: string | null;
  status: ApplicationStatus;
  hasCv: boolean;
  createdAt: string;
  updatedAt: string;
};

export const listMyApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyApplicationRow[]> => {
    const ctx = context as Ctx;

    // RLS-scoped -- job_applications_owner_select already limits this to
    // exactly the caller's own rows.
    const { data: rows, error } = await ctx.supabase
      .from("job_applications")
      .select(
        "id, job_id, status, cv_storage_path, created_at, updated_at, jobs(slug, title_sv, title_en, employers(name))",
      )
      .eq("applicant_user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[applications] listMyApplications failed", error);
      throw new Error("Could not load your applications.");
    }

    return (rows ?? []).map((r: any) => {
      const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
      const employer = job
        ? Array.isArray(job.employers)
          ? job.employers[0]
          : job.employers
        : null;
      return {
        id: r.id as string,
        jobId: r.job_id as string,
        jobSlug: (job?.slug as string | null) ?? null,
        jobTitleSv: (job?.title_sv as string | null) ?? null,
        jobTitleEn: (job?.title_en as string | null) ?? null,
        employerName: (employer?.name as string | null) ?? null,
        status: r.status as ApplicationStatus,
        hasCv: Boolean(r.cv_storage_path),
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      };
    });
  });

// -------------------- STATUS CHANGES (candidate + employer) --------------------

export const withdrawMyApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: result, error } = await ctx.supabase.rpc("set_application_status", {
      _application_id: data.applicationId,
      _new_status: "withdrawn",
      _note: null,
    });
    if (error) {
      console.error("[applications] withdrawMyApplication RPC failed", error);
      if (error.code === "23514") throw new Error("INVALID_APPLICATION_TRANSITION");
      throw new Error("WITHDRAW_FAILED");
    }
    const row = Array.isArray(result) ? result[0] : result;
    return { ok: true, status: row.new_status as ApplicationStatus };
  });

const updateApplicationStatusSchema = z.object({
  applicationId: z.string().uuid(),
  newStatus: z.enum(["reviewing", "interview", "rejected", "hired"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const updateApplicationStatusAsEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateApplicationStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    // set_application_status() independently re-verifies active employer
    // membership itself -- this is the real authorization boundary, not a
    // pre-check here.
    const { data: result, error } = await ctx.supabase.rpc("set_application_status", {
      _application_id: data.applicationId,
      _new_status: data.newStatus,
      _note: data.note ?? null,
    });
    if (error) {
      console.error("[applications] updateApplicationStatusAsEmployer RPC failed", error);
      if (error.code === "23514") throw new Error("INVALID_APPLICATION_TRANSITION");
      throw new Error("STATUS_UPDATE_FAILED");
    }
    const row = Array.isArray(result) ? result[0] : result;
    return {
      ok: true,
      previousStatus: row.previous_status as ApplicationStatus,
      status: row.new_status as ApplicationStatus,
    };
  });

// -------------------- STATUS HISTORY (audit trail) --------------------

export type ApplicationStatusEvent = {
  id: string;
  actorRole: "candidate" | "employer";
  previousStatus: ApplicationStatus;
  newStatus: ApplicationStatus;
  note: string | null;
  createdAt: string;
};

export const listApplicationStatusEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ApplicationStatusEvent[]> => {
    const ctx = context as Ctx;
    // RLS-scoped -- job_application_status_events_applicant_select /
    // _employer_select already grant exactly the rows the caller may see.
    const { data: rows, error } = await ctx.supabase
      .from("job_application_status_events")
      .select("id, actor_role, previous_status, new_status, note, created_at")
      .eq("application_id", data.applicationId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[applications] listApplicationStatusEvents failed", error);
      throw new Error("Could not load the status history.");
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      actorRole: r.actor_role as "candidate" | "employer",
      previousStatus: r.previous_status as ApplicationStatus,
      newStatus: r.new_status as ApplicationStatus,
      note: r.note as string | null,
      createdAt: r.created_at as string,
    }));
  });

// -------------------- EMPLOYER LIST --------------------

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
  status: ApplicationStatus;
  hasCv: boolean;
  createdAt: string;
};

export const listApplicationsForEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listApplicationsForEmployerSchema.parse(input))
  .handler(async ({ data, context }): Promise<EmployerApplicationRow[]> => {
    const ctx = context as Ctx;
    await assertEmployerWorkspaceMember(ctx, data.employerId);

    // RLS-scoped read -- job_applications_employer_select already limits
    // this to the caller's own active employer's rows.
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
        status: r.status as ApplicationStatus,
        hasCv: Boolean(r.cv_storage_path),
        createdAt: r.created_at as string,
      };
    });
  });

// -------------------- CV DOWNLOAD --------------------

export const getApplicationCvSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
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
      console.error("[applications] CV signed-URL creation failed", error);
      throw new Error("Could not generate a download link for this CV.");
    }
    return { url: signed.signedUrl, expiresInSeconds: 300 };
  });
