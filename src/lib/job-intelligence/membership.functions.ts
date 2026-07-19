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

// Final active-owner protection (Phase G1 §8): a server-side check before
// any role/status change, not a DB trigger — Phase G1 has no self-service
// removal path, so a full invariant-enforcing trigger would be unused
// complexity today. Revisit as a DB-level constraint once self-service
// membership management ships (see docs/job-intelligence/phase-g1-report.md
// "Known limitations").
async function assertNotRemovingLastActiveOwner(
  ctx: Ctx,
  employerId: string,
  excludeMembershipId: string,
): Promise<void> {
  const { count, error } = await ctx.supabase
    .from("employer_memberships")
    .select("id", { count: "exact", head: true })
    .eq("employer_id", employerId)
    .eq("role", "owner")
    .eq("status", "active")
    .neq("id", excludeMembershipId);
  if (error) throw new Error(error.message);
  if (!count || count === 0) {
    throw new Error(
      "Cannot change this membership: it is the only active owner for this employer. Assign another active owner first.",
    );
  }
}

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

    const { data: existing, error: exErr } = await ctx.supabase
      .from("employer_memberships")
      .select("id, employer_id, role, status")
      .eq("id", data.membershipId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Membership not found");

    // Final active-owner protection: only relevant when this row is
    // currently an active owner and the change would make it not one.
    if (existing.role === "owner" && existing.status === "active" && data.role !== "owner") {
      await assertNotRemovingLastActiveOwner(ctx, existing.employer_id, existing.id);
    }

    const { error } = await ctx.supabase
      .from("employer_memberships")
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq("id", data.membershipId);
    if (error) throw new Error(error.message);

    await writeMembershipAudit({
      action: "membership_role_changed",
      employerId: existing.employer_id,
      membershipId: data.membershipId,
      actorId: ctx.userId,
      metadata: { before_role: existing.role, after_role: data.role },
    });

    return { id: data.membershipId, role: data.role };
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

    const { data: existing, error: exErr } = await ctx.supabase
      .from("employer_memberships")
      .select("id, employer_id, role, status")
      .eq("id", data.membershipId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Membership not found");

    // Final active-owner protection: only relevant when this row is
    // currently an active owner and the change would move it out of
    // status = 'active' (suspend or remove).
    if (existing.role === "owner" && existing.status === "active" && data.status !== "active") {
      await assertNotRemovingLastActiveOwner(ctx, existing.employer_id, existing.id);
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status, updated_at: nowIso };
    if (data.status === "active" && existing.status !== "active") patch.accepted_at = nowIso;
    if (data.status === "removed") patch.removed_at = nowIso;

    const { error } = await ctx.supabase
      .from("employer_memberships")
      .update(patch)
      .eq("id", data.membershipId);
    if (error) throw new Error(error.message);

    await writeMembershipAudit({
      action: "membership_status_changed",
      employerId: existing.employer_id,
      membershipId: data.membershipId,
      actorId: ctx.userId,
      metadata: { before_status: existing.status, after_status: data.status },
    });

    return { id: data.membershipId, status: data.status };
  });
