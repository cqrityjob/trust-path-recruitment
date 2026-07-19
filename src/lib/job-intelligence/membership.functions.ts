import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Job Intelligence — Employer Membership server functions (Phase G1).
//
// Phase G1 is backend-only: `employers` (existing, reused as the
// organisation entity), `employer_memberships` (new), and the
// is_platform_admin/has_employer_role helpers are the whole surface. No
// employer-facing self-service exists yet — every write here is gated by
// assertPlatformAdmin(), mirroring admin.functions.ts's own assertAdmin()
// pattern exactly (a local, module-scoped helper, not a shared import —
// this codebase's established one-helper-per-file convention).
//
// Writes to employer_memberships go through the caller's own RLS-scoped
// `ctx.supabase`, relying on the `employer_memberships_admin_all` policy
// (the caller already passes is_platform_admin() at that point) — not
// supabaseAdmin. supabaseAdmin is used only for the audit_logs write
// below, because audit_logs has zero grant to `authenticated` (existing,
// already-approved pattern — see admin.functions.ts's writeAudit()); no
// new service-role dependency is introduced by this file.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

const EMPLOYER_ROLES = ["owner", "admin", "member"] as const;
type EmployerRole = (typeof EMPLOYER_ROLES)[number];

const EMPLOYER_MEMBERSHIP_STATUSES = ["invited", "active", "suspended", "removed"] as const;
type EmployerMembershipStatus = (typeof EMPLOYER_MEMBERSHIP_STATUSES)[number];

// Mirrors the RETURNS TABLE shape of public.update_employer_membership()
// (supabase/migrations/20260719100000_employer_memberships.sql, section
// 9) — the atomic, race-free RPC that adminUpdateEmployerMembershipRole
// and adminUpdateEmployerMembershipStatus both call instead of doing
// their own SELECT + UPDATE. `changed` is what those two functions use
// to decide whether a state change actually happened, and therefore
// whether an audit event should be written.
type UpdateEmployerMembershipResult = {
  id: string;
  employer_id: string;
  user_id: string;
  role: EmployerRole;
  status: EmployerMembershipStatus;
  invited_at: string | null;
  accepted_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
  changed: boolean;
};

async function assertPlatformAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: platform admin role required");
}

async function writeMembershipAudit(params: {
  action: "membership_created" | "membership_role_changed" | "membership_status_changed";
  employerId: string;
  membershipId: string;
  actorId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_role: "platform_admin",
    action: params.action,
    subject_type: "employer_membership",
    subject_id: params.membershipId,
    org_id: params.employerId,
    metadata: params.metadata as any,
  });
}

// Final active-owner protection (Phase G1 code-review fix): the
// check-then-act TS pre-check that used to live here was replaced after
// the security review identified a real race — two concurrent
// platform-admin requests, each demoting a different active owner of
// the same employer, could both pass a plain SELECT-count check before
// either committed, jointly leaving the employer with zero active
// owners. The authoritative check now lives inside a single atomic
// database function, `public.update_employer_membership`, which locks
// the relevant rows and performs the count-check and the mutation in
// one transaction — see
// supabase/migrations/20260719100000_employer_memberships.sql section 9
// and docs/job-intelligence/phase-g1-report.md for the full design.
// `adminUpdateEmployerMembershipRole`/`Status` below call that RPC
// instead of doing their own SELECT + UPDATE.

// -------- listMyEmployerMemberships (owner-scoped, any authenticated user) --------

export type MyEmployerMembership = {
  id: string;
  employer_id: string;
  role: EmployerRole;
  status: EmployerMembershipStatus;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export const listMyEmployerMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyEmployerMembership[]> => {
    const ctx = context as Ctx;
    // ctx.userId is sourced only from the verified bearer token via
    // requireSupabaseAuth — never a client-supplied field. RLS's
    // employer_memberships_self_select policy is the actual boundary; this
    // explicit .eq is defense-in-depth / clearer intent, same rationale as
    // admin.functions.ts's assertAdmin() alongside RLS.
    const { data, error } = await ctx.supabase
      .from("employer_memberships")
      .select("id, employer_id, role, status, invited_at, accepted_at, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MyEmployerMembership[];
  });

// -------- adminListEmployerMemberships --------

const listMembershipsSchema = z.object({
  employerId: z.string().uuid(),
});

export const adminListEmployerMemberships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listMembershipsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPlatformAdmin(ctx);

    const { data: rows, error } = await ctx.supabase
      .from("employer_memberships")
      .select(
        "id, employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at, removed_at, created_at, updated_at",
      )
      .eq("employer_id", data.employerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// -------- adminCreateEmployerMembership --------

const createMembershipSchema = z.object({
  employerId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(EMPLOYER_ROLES),
  status: z.enum(EMPLOYER_MEMBERSHIP_STATUSES).default("active"),
});

export const adminCreateEmployerMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createMembershipSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPlatformAdmin(ctx);

    // Confirm the target employer exists before creating a membership — a
    // clearer error than a raw FK violation. The target user's existence
    // is enforced by the FK itself (user_id -> auth.users(id)); a friendly
    // "no such user" message would require an admin-only auth.users
    // lookup, which is out of scope for this minimal G1 surface — the FK
    // violation is surfaced as-is.
    const { data: employer, error: empErr } = await ctx.supabase
      .from("employers")
      .select("id")
      .eq("id", data.employerId)
      .maybeSingle();
    if (empErr) throw new Error(empErr.message);
    if (!employer) throw new Error("Employer not found");

    const nowIso = new Date().toISOString();
    const { data: inserted, error } = await ctx.supabase
      .from("employer_memberships")
      .insert({
        employer_id: data.employerId,
        user_id: data.userId,
        role: data.role,
        status: data.status,
        created_by: ctx.userId,
        invited_by: ctx.userId,
        invited_at: nowIso,
        accepted_at: data.status === "active" ? nowIso : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await writeMembershipAudit({
      action: "membership_created",
      employerId: data.employerId,
      membershipId: inserted.id as string,
      actorId: ctx.userId,
      metadata: { user_id: data.userId, role: data.role, status: data.status },
    });

    return { id: inserted.id as string };
  });

// -------- adminUpdateEmployerMembershipRole --------

const updateRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(EMPLOYER_ROLES),
});

export const adminUpdateEmployerMembershipRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateRoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPlatformAdmin(ctx);

    // User-friendly early check only — NOT the security boundary and NOT
    // where the final-owner rule is enforced. Its only purposes are (a)
    // a clear "not found" message before the RPC round-trip and (b) a
    // "before" value for the audit event. The atomic RPC below re-reads
    // the row fresh under a row lock and is the sole authority on
    // whether the change is a no-op or would violate the final-owner
    // invariant.
    const { data: existing, error: exErr } = await ctx.supabase
      .from("employer_memberships")
      .select("id, role, status")
      .eq("id", data.membershipId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Membership not found");

    const { data: result, error } = await ctx.supabase.rpc("update_employer_membership", {
      _membership_id: data.membershipId,
      _new_role: data.role,
      _new_status: null,
    });
    if (error) throw new Error(error.message);
    const row = (result as UpdateEmployerMembershipResult[] | null)?.[0];
    if (!row) throw new Error("Membership not found");

    // Audit only a real state change (Phase G1 code-review fix) — the
    // RPC's own no-op detection (role/status both unchanged) is
    // authoritative; `row.changed` reflects it directly.
    if (row.changed) {
      await writeMembershipAudit({
        action: "membership_role_changed",
        employerId: row.employer_id,
        membershipId: row.id,
        actorId: ctx.userId,
        metadata: { before_role: existing.role, after_role: row.role },
      });
    }

    return { id: row.id, role: row.role as EmployerRole, changed: row.changed };
  });

// -------- adminUpdateEmployerMembershipStatus --------

const updateStatusSchema = z.object({
  membershipId: z.string().uuid(),
  status: z.enum(EMPLOYER_MEMBERSHIP_STATUSES),
});

export const adminUpdateEmployerMembershipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPlatformAdmin(ctx);

    // Same rationale as adminUpdateEmployerMembershipRole above: a
    // friendly early "not found" + audit "before" value only, not the
    // security boundary and not where the final-owner rule or
    // removed_at semantics are enforced — the atomic RPC owns both.
    const { data: existing, error: exErr } = await ctx.supabase
      .from("employer_memberships")
      .select("id, role, status")
      .eq("id", data.membershipId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Membership not found");

    const { data: result, error } = await ctx.supabase.rpc("update_employer_membership", {
      _membership_id: data.membershipId,
      _new_role: null,
      _new_status: data.status,
    });
    if (error) throw new Error(error.message);
    const row = (result as UpdateEmployerMembershipResult[] | null)?.[0];
    if (!row) throw new Error("Membership not found");

    if (row.changed) {
      await writeMembershipAudit({
        action: "membership_status_changed",
        employerId: row.employer_id,
        membershipId: row.id,
        actorId: ctx.userId,
        metadata: { before_status: existing.status, after_status: row.status },
      });
    }

    return { id: row.id, status: row.status as EmployerMembershipStatus, changed: row.changed };
  });
