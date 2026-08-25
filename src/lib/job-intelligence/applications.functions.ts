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
  /** The candidate's Passport authorisation, recorded by the submit action
   *  itself. Defaults to false: applying is not consent, and a caller that
   *  says nothing discloses nothing. */
  includePassport: z.boolean().optional().default(false),
});

export const submitJobApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitApplicationSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      status: ApplicationStatus;
      /** What the candidate asked for. */
      passportRequested: boolean;
      /** What the database actually did. These differ when the candidate
       *  asked to include a Passport but had nothing verified to disclose —
       *  the application still succeeds, and the confirmation must not claim
       *  a share that does not exist. */
      passportShared: boolean;
    }> => {
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

      // ── ONE TRANSACTION ────────────────────────────────────────────────
      //
      // The application row and the application-scoped Passport disclosure are
      // written by one database function, so they commit or roll back together.
      // Doing it as two calls from here would allow the state the contract
      // cannot describe: an application that exists, a disclosure that does
      // not, and a candidate who has been told their Passport was included.
      //
      // The function is SECURITY INVOKER, so RLS, the BEFORE INSERT trigger and
      // the duplicate-application index apply exactly as they did when this was
      // a direct insert. `_include_passport` defaults to false in SQL as well.
      const { data: submitted, error: insertErr } = await ctx.supabase.rpc(
        "sp_submit_application_with_passport",
        {
          _application_id: applicationId,
          _job_id: data.jobId,
          _phone: data.phone || null,
          _cover_note: data.coverNote || null,
          _cv_storage_path: storagePath,
          _cv_original_filename: data.cvFilename,
          _cv_size_bytes: cvBuffer.length,
          _include_passport: data.includePassport,
        },
      );

      if (insertErr) {
        // Failed submission cleans up the uploaded CV -- never leave an
        // orphaned file for an application that doesn't exist. Because the
        // write was one transaction, there is also no half-submitted
        // application and no orphan disclosure to clean up.
        await supabaseAdmin.storage.from("job-application-cvs").remove([storagePath]);
        console.error("[applications] submitJobApplication failed", insertErr);
        if (insertErr.code === "23505") throw new Error("DUPLICATE_APPLICATION");
        if (insertErr.code === "23514") throw new Error("JOB_NOT_APPLICABLE");
        throw new Error("SUBMISSION_FAILED");
      }

      const result = submitted as unknown as {
        id: string;
        status: ApplicationStatus;
        passport_requested: boolean;
        passport_shared: boolean;
      };

      return {
        id: result.id,
        status: result.status,
        passportRequested: result.passport_requested,
        // Reported from what the database did, never from what the form asked
        // for. A candidate with nothing verified applied successfully and was
        // not told a Passport went with it.
        passportShared: result.passport_shared,
      };
    },
  );

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
    const status = row.new_status as ApplicationStatus;

    // ── HIRED ALREADY CONTINUES THE PERSON ────────────────────────────
    //
    // set_application_status() calls scp_employment_from_application() in the
    // SAME transaction when the status becomes 'hired' (migration
    // 20260903092000). It resolves the canonical scp_subjects identity, reuses
    // an existing employment record, binds a single unbound one by confirmed
    // address, or creates one -- and if it cannot, the whole hire rolls back
    // rather than half-happening.
    //
    // So there is nothing to call here, and calling anything would be a second
    // path to one outcome. What this does is read back WHICH employment record
    // the hire produced, through employees.hired_from_application_id, so the
    // candidate page can offer the way there instead of leaving the employer
    // to re-type the name.
    let employeeId: string | null = null;
    if (status === "hired") {
      const { data: emp } = await ctx.supabase
        .from("employees")
        .select("id")
        .eq("hired_from_application_id", data.applicationId)
        .maybeSingle();
      employeeId = emp?.id ? String(emp.id) : null;
    }

    // ── TELLING THE CANDIDATE ─────────────────────────────────────────
    //
    // Three transitions, and deliberately not four. 'reviewing' means somebody
    // at the employer opened the application: it tells the candidate nothing
    // they can act on, arrives at whatever hour a recruiter happened to click,
    // and teaches people to ignore mail from us. jase_notification_payload()
    // returns no row for it, so it cannot be sent even by a caller that asks.
    //
    // Deduplication is the event row, not this code: one transition is one
    // event, and the payload function refuses an event already notified. So a
    // double-submitted form cannot send twice even if it reaches here twice.
    //
    // A send failure is not rethrown. The status change is the employer's
    // decision and it happened; failing the whole action because an address
    // bounced would be the worse of the two wrong answers. The attempt is
    // recorded, which is what makes it retryable.
    let notified: "sent" | "skipped" | "failed" | "not_applicable" = "not_applicable";
    if (status === "interview" || status === "rejected" || status === "hired") {
      notified = await notifyCandidate(ctx, data.applicationId);
    }

    return {
      ok: true,
      notified,
      previousStatus: row.previous_status as ApplicationStatus,
      status,
      /** The employment record the hire linked or created, when it did. */
      employeeId,
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
      // Best-effort, and deliberately so. A display name is an ENRICHMENT of a
      // row that is already complete and already authorised: the job, the
      // status, the cover note and every control on it work without it, and the
      // surface already renders "anonymous candidate" when it is absent.
      //
      // Before this, a failure here threw and took the whole applications list
      // with it — so an environment with no service-role key configured showed
      // an employer "could not load applications" the moment their first
      // application arrived, having shown an empty list quite happily until
      // then. Losing a name is a smaller harm than losing the page, and the
      // failure is logged rather than swallowed.
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profileRows } = await supabaseAdmin
          .from("profiles")
          .select("id, display_name")
          .in("id", applicantIds);
        for (const p of profileRows ?? []) {
          namesByUserId.set(p.id as string, (p.display_name as string | null) ?? null);
        }
      } catch (e) {
        console.error(
          "[applications] applicant name lookup unavailable; rows render without names",
          e,
        );
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

// -------------------- WHERE A HIRED CANDIDATE WENT --------------------

/** The employment record a hire produced, for a page being opened fresh.
 *
 *  updateApplicationStatusAsEmployer already returns this the moment the hire
 *  happens, which covers the employer who is standing there. It does not cover
 *  the one who comes back tomorrow, and that is the case that matters: without
 *  a durable way from the application to the person, the employer's next move
 *  is to re-type the name into the employee form and create a second record of
 *  one human. That is the exact failure the canonical subject spine exists to
 *  prevent, reintroduced by an interface that forgot.
 *
 *  Reads nothing but an id. Membership is asserted rather than assumed, and
 *  employer_id is in the filter so the row cannot come from another
 *  organisation even if a policy is later loosened. */
export const getHiredEmployeeForApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ applicationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ employeeId: string | null }> => {
    const ctx = context as Ctx;
    const app = await loadApplication(ctx, data.applicationId);
    await assertEmployerWorkspaceMember(ctx, app.employer_id);

    if (app.status !== "hired") return { employeeId: null };

    const { data: emp, error } = await ctx.supabase
      .from("employees")
      .select("id")
      .eq("hired_from_application_id", data.applicationId)
      .eq("employer_id", app.employer_id)
      .maybeSingle();
    // Best-effort, like the timeline on the same page: the candidate view is
    // complete without the link, and losing a shortcut is a smaller harm than
    // losing the page.
    if (error) {
      console.error("[applications] hired employee lookup unavailable", error);
      return { employeeId: null };
    }
    return { employeeId: emp?.id ? String(emp.id) : null };
  });

/** Sends the one message this transition owes the candidate, and records it.
 *
 *  Returns what happened rather than throwing: the caller has already changed
 *  the status, and that stands whatever the mail provider does.
 *
 *  The recipient's address is read by jase_notification_payload() on the
 *  server and used here. It is never returned to the browser -- the caller
 *  gets "sent" or "failed", and nothing that identifies who was written to. */
async function notifyCandidate(
  ctx: Ctx,
  applicationId: string,
): Promise<"sent" | "skipped" | "failed" | "not_applicable"> {
  // The newest employer event for this application is the transition just
  // made. set_application_status() writes exactly one.
  const { data: ev } = await ctx.supabase
    .from("job_application_status_events")
    .select("id")
    .eq("application_id", applicationId)
    .eq("actor_role", "employer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ev?.id) return "not_applicable";

  const { data: rows } = await ctx.supabase.rpc("jase_notification_payload", {
    _event_id: ev.id,
  });
  const payload = Array.isArray(rows) ? rows[0] : rows;
  // No row means: an internal transition, already notified, no address, or a
  // caller outside the organisation. All of them mean "send nothing".
  if (!payload) return "not_applicable";

  const { sendApplicationStatusEmail } =
    await import("@/lib/email/send-application-status-email.server");
  // The same origin resolution every other outbound link in this product uses:
  // PUBLIC_SITE_URL when the deployment sets it, and otherwise the SITE_ORIGIN
  // constant that already builds every canonical and sitemap URL. A second
  // convention here would mean candidate mail was the one place whose links
  // pointed at a different environment from the rest of the app.
  const { SITE_ORIGIN } = await import("@/lib/job-intelligence/seo");
  const result = await sendApplicationStatusEmail({
    recipientEmail: String(payload.recipient_email),
    language: String(payload.language).toLowerCase().startsWith("en") ? "en" : "sv",
    status: payload.new_status as "interview" | "rejected" | "hired",
    employerName: String(payload.employer_name ?? ""),
    jobTitle: String(payload.job_title ?? ""),
    siteOrigin: process.env.PUBLIC_SITE_URL || SITE_ORIGIN,
  });

  if ("skipped" in result && result.skipped) {
    // No provider configured. Deliberately NOT recorded as an attempt: the
    // message is still owed, and counting this would burn the retry budget on
    // an environment that was never going to send anything.
    return "skipped";
  }

  await ctx.supabase.rpc("jase_record_notification", {
    _event_id: ev.id,
    _ok: result.ok,
    _error: result.ok ? null : ((result as { error?: string }).error ?? "UNKNOWN"),
  });
  return result.ok ? "sent" : "failed";
}
