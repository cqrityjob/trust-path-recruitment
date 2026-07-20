import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Job Intelligence — Admin Moderation server functions (Phase B).
//
// All functions are authenticated via requireSupabaseAuth and additionally
// gated on `is_platform_admin(auth.uid())` (platform admin OR superadmin —
// corrected in Phase G1; previously checked has_role(admin) only, which
// locked superadmin-only users out of this entire module). RLS on the
// underlying tables enforces the same rule; the explicit check gives
// clearer error messages and makes intent obvious in code review.
//
// Audit events are written with service_role (via supabaseAdmin, loaded
// inside the handler) because RLS forbids writes from anon/authenticated.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function writeOrgAudit(params: {
  action: "employer_created" | "employer_updated" | "employer_status_changed";
  employerId: string;
  actorId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_role: "platform_admin",
    action: params.action,
    subject_type: "employer",
    subject_id: params.employerId,
    org_id: params.employerId,
    metadata: params.metadata as any,
  });
}

async function writeAudit(params: {
  jobId: string | null;
  slugSnapshot: string | null;
  actorId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("job_audit_events").insert({
    job_id: params.jobId,
    job_slug_snapshot: params.slugSnapshot,
    actor_id: params.actorId,
    action: params.action,
    before: (params.before ?? null) as any,
    after: (params.after ?? null) as any,
  });
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function randomShortId(): string {
  // base32-ish, 10 chars — collision domain is fine for admin-created rows
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// ---------------------------- JOBS: LIST -------------------------------------

const listJobsSchema = z.object({
  status: z
    .enum(["all", "draft", "pending_review", "published", "expired", "rejected", "archived"])
    .default("all"),
  search: z.string().trim().max(120).optional(),
});

export const adminListJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listJobsSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    let q = ctx.supabase
      .from("jobs")
      .select(
        "id, slug, short_id, status, title_sv, title_en, employer_id, family_id, profession_slug, published_at, deadline_at, expires_at, updated_at, application_method",
      )
      .order("updated_at", { ascending: false })
      .limit(200);

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`title_sv.ilike.${s},title_en.ilike.${s},slug.ilike.${s},short_id.ilike.${s}`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Attach employer names in a second query to avoid embedding through RLS.
    const employerIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.employer_id).filter(Boolean)),
    );
    let employersById: Record<string, { name: string; slug: string }> = {};
    if (employerIds.length > 0) {
      const { data: emps, error: eErr } = await ctx.supabase
        .from("employers")
        .select("id, name, slug")
        .in("id", employerIds);
      if (eErr) throw new Error(eErr.message);
      for (const e of emps ?? []) {
        employersById[e.id as string] = { name: e.name, slug: e.slug };
      }
    }

    return (rows ?? []).map((r: any) => ({
      ...r,
      employer: employersById[r.employer_id] ?? null,
    }));
  });

// ---------------------------- JOBS: GET --------------------------------------

export const adminGetJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: job, error } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found");

    const { data: meta } = await ctx.supabase
      .from("job_admin_meta")
      .select("*")
      .eq("job_id", data.id)
      .maybeSingle();

    return { job, meta: meta ?? null };
  });

// ---------------------------- JOBS: UPSERT (draft edits) ---------------------

const jobPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  employer_id: z.string().uuid(),
  title_sv: z.string().trim().min(1).max(200).optional().nullable(),
  title_en: z.string().trim().min(1).max(200).optional().nullable(),
  description_sv: z.string().max(20000).optional().nullable(),
  description_en: z.string().max(20000).optional().nullable(),
  family_id: z.string().max(64).optional().nullable(),
  profession_slug: z.string().max(120).optional().nullable(),
  location_text: z.string().max(200).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  workplace_type: z.string().max(32).optional().nullable(),
  employment_type: z.string().max(32).optional().nullable(),
  experience_level: z.string().max(32).optional().nullable(),
  application_method: z.enum(["external", "email", "internal", "unavailable"]),
  application_url: z.string().url().max(500).optional().nullable(),
  application_email: z.string().email().max(200).optional().nullable(),
  deadline_at: z.string().datetime().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  moderation_notes: z.string().max(4000).optional().nullable(),
});

export const adminSaveJobDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => jobPayloadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const nowIso = new Date().toISOString();

    // Build the row. Drafts stay status='draft'; publication is a separate
    // action that runs the DB validation trigger.
    const rowBase = {
      employer_id: data.employer_id,
      title_sv: data.title_sv ?? null,
      title_en: data.title_en ?? null,
      description_sv: data.description_sv ?? null,
      description_en: data.description_en ?? null,
      family_id: data.family_id || null,
      profession_slug: data.profession_slug || null,
      location_text: data.location_text ?? null,
      country: data.country ?? null,
      region: data.region ?? null,
      city: data.city ?? null,
      workplace_type: data.workplace_type ?? null,
      employment_type: data.employment_type ?? null,
      experience_level: data.experience_level ?? null,
      application_method: data.application_method,
      application_url: data.application_url ?? null,
      application_email: data.application_email ?? null,
      deadline_at: data.deadline_at ?? null,
      expires_at: data.expires_at ?? null,
      updated_at: nowIso,
    };

    let jobId = data.id;
    let before: any = null;
    let action = "created";

    if (jobId) {
      const { data: existing, error: exErr } = await ctx.supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (!existing) throw new Error("Job not found");
      before = existing;
      action = "updated";

      const { error: upErr } = await ctx.supabase.from("jobs").update(rowBase).eq("id", jobId);
      if (upErr) throw new Error(upErr.message);
    } else {
      // fetch employer for slug base
      const { data: emp, error: empErr } = await ctx.supabase
        .from("employers")
        .select("slug")
        .eq("id", data.employer_id)
        .maybeSingle();
      if (empErr) throw new Error(empErr.message);
      if (!emp) throw new Error("Employer not found");

      const short = randomShortId();
      const titleBase = data.title_sv || data.title_en || "job";
      const slug = `${emp.slug}-${slugify(titleBase)}-${short}`;

      const insertRow = {
        ...rowBase,
        slug,
        short_id: short,
        status: "draft",
      };
      const { data: inserted, error: insErr } = await ctx.supabase
        .from("jobs")
        .insert(insertRow)
        .select("id, slug")
        .single();
      if (insErr) throw new Error(insErr.message);
      jobId = inserted.id as string;
    }

    // Upsert admin meta (moderation notes + actor tracking) via service_role
    // so we can touch admin-only columns even if the caller's RLS scope on
    // the sibling table changes in a future migration.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("job_admin_meta").upsert(
      {
        job_id: jobId,
        moderation_notes: data.moderation_notes ?? null,
        created_by: before ? undefined : ctx.userId,
        updated_by: ctx.userId,
        updated_at: nowIso,
      },
      { onConflict: "job_id" },
    );

    const { data: after } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();

    await writeAudit({
      jobId: jobId!,
      slugSnapshot: (after?.slug as string) ?? null,
      actorId: ctx.userId,
      action,
      before,
      after,
    });

    return { id: jobId! };
  });

// ---------------------------- JOBS: TRANSITION ------------------------------

// H3.4B: rejecting a job requires a non-empty internal note -- the note is
// the only record of why a job was rejected, so a blank rejection is a
// dead end for both the employer and any future reviewer. Every other
// action keeps the note optional, unchanged.
const transitionSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["submit", "publish", "reject", "archive", "unpublish"]),
    moderation_notes: z.string().max(4000).optional().nullable(),
  })
  .refine((v) => v.action !== "reject" || (v.moderation_notes ?? "").trim().length > 0, {
    message: "REJECTION_NOTE_REQUIRED",
    path: ["moderation_notes"],
  });

export const adminTransitionJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transitionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: before, error: exErr } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!before) throw new Error("Job not found");

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: nowIso };
    let auditAction: string;

    switch (data.action) {
      case "submit":
        patch.status = "pending_review";
        auditAction = "submitted";
        break;
      case "publish":
        patch.status = "published";
        if (!before.published_at) patch.published_at = nowIso;
        auditAction = "published";
        break;
      case "reject":
        patch.status = "rejected";
        auditAction = "rejected";
        break;
      case "archive":
        patch.status = "archived";
        auditAction = "archived";
        break;
      case "unpublish":
        patch.status = "draft";
        auditAction = "updated";
        break;
    }

    const { error: upErr } = await ctx.supabase.from("jobs").update(patch).eq("id", data.id);
    if (upErr) throw new Error(upErr.message); // DB trigger enforces publish rules

    // Record reviewer on publish/reject
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "publish" || data.action === "reject") {
      await supabaseAdmin.from("job_admin_meta").upsert(
        {
          job_id: data.id,
          reviewed_by: ctx.userId,
          reviewed_at: nowIso,
          moderation_notes: data.moderation_notes ?? null,
          updated_by: ctx.userId,
          updated_at: nowIso,
        },
        { onConflict: "job_id" },
      );
    } else if (data.moderation_notes !== undefined) {
      await supabaseAdmin.from("job_admin_meta").upsert(
        {
          job_id: data.id,
          moderation_notes: data.moderation_notes,
          updated_by: ctx.userId,
          updated_at: nowIso,
        },
        { onConflict: "job_id" },
      );
    }

    const { data: after } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    await writeAudit({
      jobId: data.id,
      slugSnapshot: (after?.slug as string) ?? null,
      actorId: ctx.userId,
      action: auditAction,
      before,
      after,
    });

    return { id: data.id, status: patch.status as string };
  });

// ---------------------------- EMPLOYERS -------------------------------------

export const adminListEmployers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { data, error } = await ctx.supabase
      .from("employers")
      .select("id, slug, name, country, website")
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// H3.3 integrity fix: status is accepted ONLY as a starting value for a
// brand-new employer (no `id`), and only 'draft'/'pending' -- never a
// moderation outcome ('active'/'suspended'/'archived'/'rejected'). This
// tool can therefore never create an employer that is already active,
// and (see assertNoExistingEmployerStatusChange below) can never change
// an existing employer's status at all -- every status change, for every
// employer, must go through moderate_employer(), the one canonical,
// validated, audited transition path introduced in H3.3. Previously this
// field accepted 'active'/'suspended'/'archived' and was honoured on
// update with no transition validation and no audit row -- that gap is
// what this fix closes.
//
// Exported (not just used internally) so scripts/admin-employer-status-
// guard-check.ts can assert the allowed status enum directly rather than
// re-deriving it -- this file's createServerFn-wrapped handlers cannot be
// invoked outside the TanStack Start server runtime (confirmed: calling
// one directly throws "No Start context found in AsyncLocalStorage"), so
// the schema and the pure helpers below are the actual testable surface.
export const employerPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120).optional(),
  website: z.string().url().max(500).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  description_sv: z.string().max(4000).optional().nullable(),
  description_en: z.string().max(4000).optional().nullable(),
  status: z.enum(["draft", "pending"]).optional(),
});

// H3.3 integrity fix. Pure guard, deliberately factored out of the
// handler so it's directly unit-testable without the server runtime: an
// existing employer's status can only ever change through
// moderate_employer(). Throws rather than silently dropping the field,
// so no caller is ever misled into thinking a status they sent took
// effect.
export function assertNoExistingEmployerStatusChange(
  isUpdate: boolean,
  requestedStatus: "draft" | "pending" | undefined,
): void {
  if (isUpdate && requestedStatus !== undefined) {
    throw new Error(
      "EMPLOYER_STATUS_UPDATE_NOT_ALLOWED: an existing employer's status can only be " +
        "changed through the employer moderation workflow (moderate_employer), not this tool.",
    );
  }
}

// H3.3 integrity fix. Pure default-resolution, also factored out for
// direct unit testing: a newly created employer always starts 'pending'
// unless the caller explicitly asked for 'draft' -- never defaults to
// 'active' (the bare column DEFAULT this tool previously relied on
// implicitly).
export function resolveNewEmployerStatus(
  requestedStatus: "draft" | "pending" | undefined,
): "draft" | "pending" {
  return requestedStatus ?? "pending";
}

export const adminUpsertEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerPayloadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const nowIso = new Date().toISOString();
    const slug = data.slug?.trim() || slugify(data.name);

    if (data.id) {
      const { data: before, error: beforeErr } = await ctx.supabase
        .from("employers")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (beforeErr) throw new Error(beforeErr.message);
      if (!before) throw new Error("Employer not found");

      assertNoExistingEmployerStatusChange(true, data.status);

      // No-op guard (Phase G1 code-review fix): if every mutable field
      // is already exactly what's requested, skip the UPDATE entirely
      // and write no audit event — an unconditional "employer_updated"
      // on a no-op save (e.g. re-submitting an unchanged edit form)
      // would otherwise be a misleading audit row (before === after).
      const isNoOp =
        before.name === data.name &&
        before.slug === slug &&
        (before.website ?? null) === (data.website ?? null) &&
        (before.country ?? null) === (data.country ?? null) &&
        (before.description_sv ?? null) === (data.description_sv ?? null) &&
        (before.description_en ?? null) === (data.description_en ?? null);

      if (isNoOp) {
        return { id: data.id };
      }

      // status is deliberately never included here -- see the guard above.
      const updatePatch: Record<string, unknown> = {
        name: data.name,
        slug,
        website: data.website ?? null,
        country: data.country ?? null,
        description_sv: data.description_sv ?? null,
        description_en: data.description_en ?? null,
        updated_at: nowIso,
      };

      const { error } = await ctx.supabase.from("employers").update(updatePatch).eq("id", data.id);
      if (error) throw new Error(error.message);

      const { data: after } = await ctx.supabase
        .from("employers")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();

      await writeOrgAudit({
        action: "employer_updated",
        employerId: data.id,
        actorId: ctx.userId,
        metadata: {
          before: { name: before.name, slug: before.slug, status: before.status },
          after: { name: after?.name, slug: after?.slug, status: after?.status },
        },
      });

      return { id: data.id };
    }

    const { data: inserted, error } = await ctx.supabase
      .from("employers")
      .insert({
        name: data.name,
        slug,
        website: data.website ?? null,
        country: data.country ?? null,
        description_sv: data.description_sv ?? null,
        description_en: data.description_en ?? null,
        // H3.3 integrity fix: always explicit, always 'draft' or 'pending'
        // (zod-enforced above), defaulting to 'pending' -- the same safe
        // starting status create_my_employer_company() already uses for
        // self-service creation (H3.1). This tool can no longer create an
        // employer that starts out active/suspended/archived/rejected;
        // every employer, however it was created, must pass through
        // moderate_employer() to reach those states.
        status: resolveNewEmployerStatus(data.status),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("employer_admin_meta").upsert(
      {
        employer_id: inserted.id as string,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      },
      { onConflict: "employer_id" },
    );

    await writeOrgAudit({
      action: "employer_created",
      employerId: inserted.id as string,
      actorId: ctx.userId,
      metadata: { name: data.name, slug, status: resolveNewEmployerStatus(data.status) },
    });

    return { id: inserted.id as string };
  });

// ---------------------------- ADMIN GATE CHECK (client) ---------------------

export const adminWhoAmI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
      _user_id: ctx.userId,
    });
    if (error) throw new Error(error.message);
    return { userId: ctx.userId, isAdmin: Boolean(data) };
  });
