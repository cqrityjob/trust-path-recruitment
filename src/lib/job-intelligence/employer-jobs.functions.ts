// Phase H3 — Employer self-service server functions.
//
// Security model (mirrors employer-dashboard.functions.ts):
//   1. requireSupabaseAuth authenticates the caller and injects
//      ctx.userId from verified claims (never client-supplied).
//   2. Every function verifies an *active* membership on an *active*
//      employer through ctx.supabase (RLS-scoped) before performing
//      any read or write. RLS is still the authoritative boundary —
//      the jobs_employer_* policies + jobs_validate_before_write()
//      trigger jointly enforce tenant isolation and the C1 transition
//      allow-list. The explicit check here gives a friendly error
//      before the trigger fires and mirrors the established pattern.
//   3. Writes happen exclusively through ctx.supabase — the DB trigger
//      is the source of truth for what an employer may change and to
//      what status. Audit rows are written through supabaseAdmin
//      (loaded lazily) because job_audit_events has no authenticated
//      grant, matching admin.functions.ts's writeAudit() pattern.
//   4. published_at is NEVER set by employer code paths — the trigger
//      rejects any employer write that touches it.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertActiveMembership(ctx: Ctx, employerId: string): Promise<{ employerSlug: string }> {
  // Membership + employer editable-status check via caller's RLS-scoped
  // client. Employers in `pending` (self-service onboarding) and `active`
  // may edit their own drafts; the database is the source of truth via
  // employer_members_can_edit() + jobs_employer_* RLS + jobs_validate_
  // before_write() (which still forbids pending employers from submitting
  // for review). Public visibility remains gated on `active` only via
  // employer_is_active_status.
  const { data: membership, error: memErr } = await ctx.supabase
    .from("employer_memberships")
    .select("id, employers!inner(slug, status)")
    .eq("user_id", ctx.userId)
    .eq("employer_id", employerId)
    .eq("status", "active")
    .maybeSingle();
  if (memErr) throw new Error("Access not available");
  if (!membership) throw new Error("Access not available");
  const emp = Array.isArray((membership as any).employers)
    ? (membership as any).employers[0]
    : (membership as any).employers;
  if (!emp || (emp.status !== "active" && emp.status !== "pending")) {
    throw new Error("Access not available");
  }
  return { employerSlug: emp.slug as string };
}

async function writeAudit(params: {
  jobId: string;
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
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// -------------------- LIST --------------------

const listSchema = z.object({ employerId: z.string().uuid() });

export type EmployerJobRow = {
  id: string;
  slug: string;
  short_id: string;
  status: string;
  title_sv: string | null;
  title_en: string | null;
  application_method: string;
  published_at: string | null;
  deadline_at: string | null;
  expires_at: string | null;
  updated_at: string;
};

export const listEmployerJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerJobRow[]> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: rows, error } = await ctx.supabase
      .from("jobs")
      .select(
        "id, slug, short_id, status, title_sv, title_en, application_method, published_at, deadline_at, expires_at, updated_at",
      )
      .eq("employer_id", data.employerId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Could not load jobs.");
    return (rows ?? []) as EmployerJobRow[];
  });

// -------------------- GET --------------------

const getSchema = z.object({
  employerId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const getEmployerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: job, error } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("employer_id", data.employerId)
      .maybeSingle();
    if (error) throw new Error("Could not load job.");
    if (!job) throw new Error("Job not found");
    return job;
  });

// -------------------- SAVE DRAFT (insert or update) --------------------

const draftPayloadSchema = z.object({
  employerId: z.string().uuid(),
  id: z.string().uuid().optional(),
  title_sv: z.string().trim().max(200).optional().nullable(),
  title_en: z.string().trim().max(200).optional().nullable(),
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
  application_url: z.string().url().max(500).optional().nullable().or(z.literal("").transform(() => null)),
  application_email: z.string().email().max(200).optional().nullable().or(z.literal("").transform(() => null)),
  deadline_at: z.string().datetime().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
});

export const saveEmployerJobDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftPayloadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const nowIso = new Date().toISOString();
    const rowBase = {
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

    if (data.id) {
      // UPDATE — RLS jobs_employer_update_editable + trigger enforce
      // that only draft/rejected can be freely modified.
      const { data: before, error: bErr } = await ctx.supabase
        .from("jobs")
        .select("*")
        .eq("id", data.id)
        .eq("employer_id", data.employerId)
        .maybeSingle();
      if (bErr) throw new Error("Could not load job.");
      if (!before) throw new Error("Job not found");
      if (before.status !== "draft" && before.status !== "rejected") {
        throw new Error("This job cannot be edited in its current state.");
      }

      const { error: uErr } = await ctx.supabase
        .from("jobs")
        .update(rowBase)
        .eq("id", data.id)
        .eq("employer_id", data.employerId);
      if (uErr) throw new Error(uErr.message);

      await writeAudit({
        jobId: data.id,
        slugSnapshot: before.slug,
        actorId: ctx.userId,
        action: "updated",
        before,
        after: { ...before, ...rowBase },
      });
      return { id: data.id };
    }

    // INSERT — RLS jobs_employer_insert_draft requires status='draft'
    // AND active membership AND active employer. We must set slug and
    // short_id ourselves (NOT NULL, no defaults). Employer slug is used
    // as the human-readable prefix.
    const { data: emp, error: empErr } = await ctx.supabase
      .from("employers")
      .select("slug")
      .eq("id", data.employerId)
      .maybeSingle();
    if (empErr) throw new Error("Could not load employer.");
    if (!emp) throw new Error("Employer not found");

    const short = randomShortId();
    const titleBase = data.title_sv || data.title_en || "draft";
    const slug = `${emp.slug}-${slugify(titleBase)}-${short}`;

    const { data: inserted, error: iErr } = await ctx.supabase
      .from("jobs")
      .insert({
        ...rowBase,
        employer_id: data.employerId,
        slug,
        short_id: short,
        status: "draft",
      })
      .select("id, slug")
      .single();
    if (iErr) throw new Error(iErr.message);

    await writeAudit({
      jobId: inserted.id as string,
      slugSnapshot: inserted.slug as string,
      actorId: ctx.userId,
      action: "created",
      before: null,
      after: { ...rowBase, status: "draft", slug },
    });
    return { id: inserted.id as string };
  });

// -------------------- SUBMIT FOR REVIEW --------------------

const submitSchema = z.object({
  employerId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const submitEmployerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: before, error: bErr } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("employer_id", data.employerId)
      .maybeSingle();
    if (bErr) throw new Error("Could not load job.");
    if (!before) throw new Error("Job not found");
    if (before.status !== "draft" && before.status !== "rejected") {
      throw new Error("Only draft or rejected jobs can be submitted for review.");
    }

    // MVP submission gate (Part J / M2): title, description, application
    // method with valid target, and a non-null expires_at. The DB trigger
    // is the final authority when the admin later publishes; this is a
    // clearer, earlier check for the employer.
    const missing: string[] = [];
    if (!(before.title_sv || before.title_en)) missing.push("title");
    if (!(before.description_sv || before.description_en)) missing.push("description");
    if (before.application_method === "unavailable") missing.push("application method");
    if (before.application_method === "external" && !before.application_url) missing.push("application URL");
    if (before.application_method === "email" && !before.application_email) missing.push("application email");
    if (!before.expires_at) missing.push("expires at");
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }

    const { error: uErr } = await ctx.supabase
      .from("jobs")
      .update({ status: "pending_review", updated_at: new Date().toISOString() })
      .eq("id", data.jobId)
      .eq("employer_id", data.employerId);
    if (uErr) throw new Error(uErr.message);

    await writeAudit({
      jobId: data.jobId,
      slugSnapshot: before.slug,
      actorId: ctx.userId,
      action: before.status === "rejected" ? "resubmitted" : "submitted",
      before,
      after: { ...before, status: "pending_review" },
    });
    return { id: data.jobId, status: "pending_review" as const };
  });

// -------------------- CLOSE (published -> archived) --------------------

const closeSchema = z.object({
  employerId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const closeEmployerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => closeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: before, error: bErr } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("employer_id", data.employerId)
      .maybeSingle();
    if (bErr) throw new Error("Could not load job.");
    if (!before) throw new Error("Job not found");
    if (before.status !== "published") {
      throw new Error("Only a published job can be closed.");
    }

    // Trigger rejects any content change alongside published->archived.
    // We only touch status + updated_at.
    const { error: uErr } = await ctx.supabase
      .from("jobs")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", data.jobId)
      .eq("employer_id", data.employerId);
    if (uErr) throw new Error(uErr.message);

    await writeAudit({
      jobId: data.jobId,
      slugSnapshot: before.slug,
      actorId: ctx.userId,
      action: "closed",
      before,
      after: { ...before, status: "archived" },
    });
    return { id: data.jobId, status: "archived" as const };
  });

// -------------------- DUPLICATE (any status -> new draft) --------------------

const duplicateSchema = z.object({
  employerId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const duplicateEmployerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => duplicateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: src, error: sErr } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .eq("employer_id", data.employerId)
      .maybeSingle();
    if (sErr) throw new Error("Could not load job.");
    if (!src) throw new Error("Job not found");

    const { data: emp, error: empErr } = await ctx.supabase
      .from("employers")
      .select("slug")
      .eq("id", data.employerId)
      .maybeSingle();
    if (empErr) throw new Error("Could not load employer.");
    if (!emp) throw new Error("Employer not found");

    const short = randomShortId();
    const titleBase = src.title_sv || src.title_en || "draft";
    const newSlug = `${emp.slug}-${slugify(titleBase)}-${short}`;

    // Only copy content columns the employer is allowed to write; never
    // published_at, moderation state, or admin-only fields.
    const clone = {
      employer_id: data.employerId,
      slug: newSlug,
      short_id: short,
      status: "draft",
      title_sv: src.title_sv,
      title_en: src.title_en,
      description_sv: src.description_sv,
      description_en: src.description_en,
      family_id: src.family_id,
      profession_slug: src.profession_slug,
      location_text: src.location_text,
      country: src.country,
      region: src.region,
      city: src.city,
      workplace_type: src.workplace_type,
      employment_type: src.employment_type,
      experience_level: src.experience_level,
      application_method: src.application_method === "unavailable" ? "external" : src.application_method,
      application_url: src.application_url,
      application_email: src.application_email,
      deadline_at: null,
      expires_at: null,
    };
    const { data: inserted, error: iErr } = await ctx.supabase
      .from("jobs")
      .insert(clone)
      .select("id, slug")
      .single();
    if (iErr) throw new Error(iErr.message);

    await writeAudit({
      jobId: inserted.id as string,
      slugSnapshot: inserted.slug as string,
      actorId: ctx.userId,
      action: "duplicated_from",
      before: { source_job_id: data.jobId, source_slug: src.slug },
      after: { new_job_id: inserted.id, new_slug: inserted.slug },
    });
    return { id: inserted.id as string };
  });