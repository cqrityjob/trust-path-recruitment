// Admin Control Center — platform lifecycle and safe data management.
//
// Security model, identical in shape to admin-employer-moderation.functions.ts
// and admin-users-roles.functions.ts, and deliberately adding no trust of its
// own on top of what the database already enforces:
//
//   1. requireSupabaseAuth authenticates the caller and injects ctx.userId
//      from verified claims. No handler in this file ever accepts an
//      administrator id, a role, or an "isSuperadmin" flag from the client.
//   2. assertAdmin() / assertSuperadmin() give a clean pre-check error, but
//      they are NOT the boundary. Every function called here is a SECURITY
//      DEFINER RPC that independently re-verifies is_platform_admin() or
//      is_superadmin(), revalidates the data-level blockers under its own row
//      lock, and writes its audit row in the same transaction as the mutation.
//   3. Every read goes through ctx.supabase -- the caller's own RLS-scoped
//      client. supabaseAdmin appears exactly once, for administrator display
//      names on the audit trail, because profiles is self-select-only RLS.
//      There is no read here that service-role reaches and RLS would not.
//
// Error handling: the RPCs raise `STABLE_CODE: human sentence`. extractCode()
// lifts the code so the interface can translate it; the sentence is never
// shown raw, because it is written for an engineer reading a log, not for an
// administrator deciding what to do.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The RLS-scoped client the auth middleware injects, and the shape of a row
// coming back from PostgREST or from a jsonb-returning RPC, are both untyped
// at this seam -- generated Database types do not cover the RPCs added by this
// phase. Every sibling admin module models this the same way. Naming the two
// escapes once, here, keeps the rest of the file honest about where the
// boundary actually is instead of scattering the same escape across 12 call
// sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseRlsClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRow = Record<string, any>;

type Ctx = { supabase: SupabaseRlsClient; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", { _user_id: ctx.userId });
  if (error) {
    console.error("[admin-lifecycle] is_platform_admin check failed", error);
    throw new Error("ROLE_CHECK_FAILED");
  }
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

async function assertSuperadmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_superadmin", { _user_id: ctx.userId });
  if (error) {
    console.error("[admin-lifecycle] is_superadmin check failed", error);
    throw new Error("ROLE_CHECK_FAILED");
  }
  if (!data) throw new Error("FORBIDDEN_SUPERADMIN_REQUIRED");
}

/** `EMPLOYER_HAS_APPLICATIONS: this organisation ...` -> `EMPLOYER_HAS_APPLICATIONS`.
 *  A refusal that does not follow the convention falls back to the caller's
 *  own generic code rather than leaking a raw Postgres message to the browser. */
function extractCode(error: unknown, fallback: string): string {
  const message = (error as { message?: string } | null)?.message ?? "";
  const match = /\b([A-Z][A-Z0-9_]{3,})\b/.exec(message);
  return match ? match[1] : fallback;
}

// ---------------------------------------------------------------------------
// Employer lifecycle
// ---------------------------------------------------------------------------

export type DeletionBlocker = { code: string; count: number };

export type AdminEmployerDeletionImpact = {
  employerId: string;
  name: string;
  status: string;
  deletable: boolean;
  blockers: DeletionBlocker[];
  removedOnDelete: Record<string, number>;
};

const employerIdSchema = z.object({ employerId: z.string().uuid() });

export const adminGetEmployerDeletionImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employerIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminEmployerDeletionImpact> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: result, error } = await ctx.supabase.rpc("admin_employer_deletion_impact", {
      _employer_id: data.employerId,
    });
    if (error) {
      console.error("[admin-lifecycle] employer deletion impact failed", error);
      throw new Error(extractCode(error, "IMPACT_LOAD_FAILED"));
    }
    return {
      employerId: result.employer_id as string,
      name: result.name as string,
      status: result.status as string,
      deletable: Boolean(result.deletable),
      blockers: (result.blockers ?? []) as DeletionBlocker[],
      removedOnDelete: (result.removed_on_delete ?? {}) as Record<string, number>,
    };
  });

const deleteEmployerSchema = z.object({
  employerId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  confirmName: z.string().min(1).max(300),
});

export const adminDeleteEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteEmployerSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ employerId: string; name: string }> => {
    const ctx = context as Ctx;
    // The pre-check is courtesy. admin_delete_employer_if_safe() re-verifies
    // is_superadmin(), re-checks the typed name, and recomputes every blocker
    // under the employer row lock regardless of what this wrapper concluded.
    await assertSuperadmin(ctx);

    const { data: result, error } = await ctx.supabase.rpc("admin_delete_employer_if_safe", {
      _employer_id: data.employerId,
      _reason: data.reason,
      _confirm_name: data.confirmName,
    });
    if (error) {
      console.error("[admin-lifecycle] employer delete refused", error);
      throw new Error(extractCode(error, "EMPLOYER_DELETE_FAILED"));
    }
    return { employerId: result.employer_id as string, name: result.name as string };
  });

// ---------------------------------------------------------------------------
// Person lifecycle
// ---------------------------------------------------------------------------

export type AdminPersonOverview = {
  account: {
    id: string;
    email: string | null;
    createdAt: string | null;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
    disabled: boolean;
    disabledUntil: string | null;
  };
  profile: { displayName: string | null; country: string | null; locale: string | null } | null;
  roles: string[];
  subjectId: string | null;
  memberships: Array<{
    employerId: string;
    employerName: string;
    employerSlug: string;
    employerStatus: string;
    role: string;
    status: string;
  }>;
  employment: Array<{
    employeeId: string;
    employerId: string;
    employerName: string;
    employmentStatus: string;
  }>;
  applications: Array<{
    id: string;
    jobId: string;
    employerName: string;
    titleSv: string | null;
    titleEn: string | null;
    status: string;
    createdAt: string;
  }>;
  assessments: {
    assignments: number;
    runs: number;
    attempts: number;
    releasedReports: number;
  };
  passport: {
    hasProfile: boolean;
    claims: number;
    evidence: number;
    activeDisclosures: number;
    verificationRequests: number;
  };
};

const userIdSchema = z.object({ userId: z.string().uuid() });

export const adminGetPersonOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminPersonOverview> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_person_overview", {
      _user_id: data.userId,
    });
    if (error) {
      console.error("[admin-lifecycle] person overview failed", error);
      throw new Error(extractCode(error, "PERSON_LOAD_FAILED"));
    }

    return {
      account: {
        id: r.account.id as string,
        email: (r.account.email as string | null) ?? null,
        createdAt: (r.account.created_at as string | null) ?? null,
        lastSignInAt: (r.account.last_sign_in_at as string | null) ?? null,
        emailConfirmedAt: (r.account.email_confirmed_at as string | null) ?? null,
        disabled: Boolean(r.account.disabled),
        disabledUntil: (r.account.disabled_until as string | null) ?? null,
      },
      profile: r.profile
        ? {
            displayName: (r.profile.display_name as string | null) ?? null,
            country: (r.profile.country as string | null) ?? null,
            locale: (r.profile.locale as string | null) ?? null,
          }
        : null,
      roles: (r.roles ?? []) as string[],
      subjectId: (r.subject_id as string | null) ?? null,
      memberships: (r.memberships ?? []).map((m: JsonRow) => ({
        employerId: m.employer_id as string,
        employerName: m.employer_name as string,
        employerSlug: m.employer_slug as string,
        employerStatus: m.employer_status as string,
        role: m.role as string,
        status: m.status as string,
      })),
      employment: (r.employment ?? []).map((e: JsonRow) => ({
        employeeId: e.employee_id as string,
        employerId: e.employer_id as string,
        employerName: e.employer_name as string,
        employmentStatus: e.employment_status as string,
      })),
      applications: (r.applications ?? []).map((a: JsonRow) => ({
        id: a.id as string,
        jobId: a.job_id as string,
        employerName: a.employer_name as string,
        titleSv: (a.title_sv as string | null) ?? null,
        titleEn: (a.title_en as string | null) ?? null,
        status: a.status as string,
        createdAt: a.created_at as string,
      })),
      assessments: {
        assignments: Number(r.assessments?.assignments ?? 0),
        runs: Number(r.assessments?.runs ?? 0),
        attempts: Number(r.assessments?.attempts ?? 0),
        releasedReports: Number(r.assessments?.released_reports ?? 0),
      },
      passport: {
        hasProfile: Boolean(r.passport?.has_profile),
        claims: Number(r.passport?.claims ?? 0),
        evidence: Number(r.passport?.evidence ?? 0),
        activeDisclosures: Number(r.passport?.active_disclosures ?? 0),
        verificationRequests: Number(r.passport?.verification_requests ?? 0),
      },
    };
  });

export type AdminUserDeletionImpact = {
  userId: string;
  email: string | null;
  deletable: boolean;
  blockers: DeletionBlocker[];
  actedOn: Array<{ table: string; column: string; count: number }>;
  removedOnDelete: Record<string, number>;
};

export const adminGetUserDeletionImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminUserDeletionImpact> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_user_deletion_impact", {
      _user_id: data.userId,
    });
    if (error) {
      console.error("[admin-lifecycle] user deletion impact failed", error);
      throw new Error(extractCode(error, "IMPACT_LOAD_FAILED"));
    }
    return {
      userId: r.user_id as string,
      email: (r.email as string | null) ?? null,
      deletable: Boolean(r.deletable),
      blockers: (r.blockers ?? []) as DeletionBlocker[],
      actedOn: (r.acted_on ?? []) as Array<{ table: string; column: string; count: number }>,
      removedOnDelete: (r.removed_on_delete ?? {}) as Record<string, number>,
    };
  });

const setDisabledSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
  reason: z.string().trim().min(1).max(2000),
});

export const adminSetUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setDisabledSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ userId: string; disabled: boolean }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_set_user_disabled", {
      _user_id: data.userId,
      _disabled: data.disabled,
      _reason: data.reason,
    });
    if (error) {
      console.error("[admin-lifecycle] set user disabled refused", error);
      throw new Error(extractCode(error, "ACCOUNT_ACCESS_CHANGE_FAILED"));
    }
    return { userId: r.user_id as string, disabled: Boolean(r.disabled) };
  });

const anonymiseSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  confirmEmail: z.string().min(1).max(320),
});

export const adminAnonymiseUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => anonymiseSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ userId: string }> => {
    const ctx = context as Ctx;
    await assertSuperadmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_anonymise_user", {
      _user_id: data.userId,
      _reason: data.reason,
      _confirm_email: data.confirmEmail,
    });
    if (error) {
      console.error("[admin-lifecycle] anonymise refused", error);
      throw new Error(extractCode(error, "ANONYMISE_FAILED"));
    }
    return { userId: r.user_id as string };
  });

const deleteUserSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  confirmEmail: z.string().min(1).max(320),
});

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteUserSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ userId: string }> => {
    const ctx = context as Ctx;
    await assertSuperadmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_delete_user_if_safe", {
      _user_id: data.userId,
      _reason: data.reason,
      _confirm_email: data.confirmEmail,
    });
    if (error) {
      console.error("[admin-lifecycle] user delete refused", error);
      throw new Error(extractCode(error, "USER_DELETE_FAILED"));
    }
    return { userId: r.user_id as string };
  });

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

const deleteJobSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
});

export const adminDeleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteJobSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ jobId: string }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_delete_job_if_safe", {
      _job_id: data.jobId,
      _reason: data.reason,
    });
    if (error) {
      console.error("[admin-lifecycle] job delete refused", error);
      throw new Error(extractCode(error, "JOB_DELETE_FAILED"));
    }
    return { jobId: r.job_id as string };
  });

// ---------------------------------------------------------------------------
// Data management
// ---------------------------------------------------------------------------

export type AdminIdentityFinding = {
  code: string;
  userId?: string;
  subjectId?: string;
  employeeId?: string;
  employerId?: string;
  email?: string;
  count?: number;
};

export const adminGetIdentityDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminIdentityFinding[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_identity_diagnostics");
    if (error) {
      console.error("[admin-lifecycle] identity diagnostics failed", error);
      throw new Error(extractCode(error, "DIAGNOSTICS_LOAD_FAILED"));
    }
    return ((r?.findings ?? []) as JsonRow[]).map((f) => ({
      code: f.code as string,
      userId: (f.user_id as string | undefined) ?? undefined,
      subjectId: (f.subject_id as string | undefined) ?? undefined,
      employeeId: (f.employee_id as string | undefined) ?? undefined,
      employerId: (f.employer_id as string | undefined) ?? undefined,
      email: (f.email as string | undefined) ?? undefined,
      count: f.count as number | undefined,
    }));
  });

export type AdminDisposableRecords = {
  employers: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    removedOnDelete: Record<string, number>;
  }>;
  users: Array<{
    id: string;
    email: string | null;
    createdAt: string;
    removedOnDelete: Record<string, number>;
  }>;
};

export const adminGetDisposableRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDisposableRecords> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: r, error } = await ctx.supabase.rpc("admin_disposable_records", { _limit: 100 });
    if (error) {
      console.error("[admin-lifecycle] disposable inventory failed", error);
      throw new Error(extractCode(error, "DISPOSABLE_LOAD_FAILED"));
    }
    return {
      employers: ((r?.employers ?? []) as JsonRow[]).map((e) => ({
        id: e.id as string,
        name: e.name as string,
        status: e.status as string,
        createdAt: e.created_at as string,
        removedOnDelete: (e.removed_on_delete ?? {}) as Record<string, number>,
      })),
      users: ((r?.users ?? []) as JsonRow[]).map((u) => ({
        id: u.id as string,
        email: (u.email as string | null) ?? null,
        createdAt: u.created_at as string,
        removedOnDelete: (u.removed_on_delete ?? {}) as Record<string, number>,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Audit trail
//
// The platform writes administrative history to three tables. Consolidating
// them into one is a separate, larger change; reading them as one list is not,
// and is what an administrator actually needs. audit_logs and
// employer_moderation_events are both already admin-readable under RLS
// (audit_logs since 20260803114922, employer_moderation_events since H3.3), so
// both reads go through the caller's own client.
//
// Deliberately projected, never dumped: action, subject, actor, reason and
// timestamp. `metadata` is reduced to its reason string -- the raw column can
// carry removal counts and identifiers that have no business being rendered
// into a page, and future writers could put more there.
// ---------------------------------------------------------------------------

export type AdminAuditEvent = {
  id: string;
  at: string;
  source: "audit_logs" | "employer_moderation_events";
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  subjectType: string | null;
  subjectId: string | null;
  reason: string | null;
};

const auditListSchema = z.object({
  action: z.string().trim().max(64).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const adminListAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => auditListSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminAuditEvent[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    let logsQuery = ctx.supabase
      .from("audit_logs")
      .select("id, at, action, actor_id, actor_role, subject_type, subject_id, metadata")
      .order("at", { ascending: false })
      .limit(data.limit);
    if (data.action) logsQuery = logsQuery.eq("action", data.action);

    const [logsRes, moderationRes] = await Promise.all([
      logsQuery,
      ctx.supabase
        .from("employer_moderation_events")
        .select(
          "id, created_at, action, previous_status, new_status, admin_user_id, note, employer_id",
        )
        .order("created_at", { ascending: false })
        .limit(data.limit),
    ]);
    if (logsRes.error || moderationRes.error) {
      console.error("[admin-lifecycle] audit read failed", logsRes.error, moderationRes.error);
      throw new Error("AUDIT_LOAD_FAILED");
    }

    const rows: AdminAuditEvent[] = [
      ...(logsRes.data ?? []).map((r: JsonRow) => ({
        id: r.id as string,
        at: r.at as string,
        source: "audit_logs" as const,
        action: r.action as string,
        actorId: (r.actor_id as string | null) ?? null,
        actorName: null,
        actorRole: (r.actor_role as string | null) ?? null,
        subjectType: (r.subject_type as string | null) ?? null,
        subjectId: (r.subject_id as string | null) ?? null,
        reason: (r.metadata?.reason as string | undefined) ?? null,
      })),
      ...(moderationRes.data ?? []).map((r: JsonRow) => ({
        id: r.id as string,
        at: r.created_at as string,
        source: "employer_moderation_events" as const,
        action: `employer_${r.action}`,
        actorId: (r.admin_user_id as string | null) ?? null,
        actorName: null,
        actorRole: "platform_admin",
        subjectType: "employer",
        subjectId: r.employer_id as string,
        reason: (r.note as string | null) ?? null,
      })),
    ]
      .filter((r) => !data.action || r.action === data.action)
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
      .slice(0, data.limit);

    // profiles is self-select-only RLS, so administrator display names are the
    // one thing here that needs the service-role client -- scoped to exactly
    // the actor ids the RLS-scoped reads above already returned.
    const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter(Boolean))) as string[];
    if (actorIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profileRows } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      const nameById = new Map<string, string | null>();
      for (const p of profileRows ?? []) {
        nameById.set(p.id as string, (p.display_name as string | null) ?? null);
      }
      for (const r of rows) {
        if (r.actorId) r.actorName = nameById.get(r.actorId) ?? null;
      }
    }

    return rows;
  });
