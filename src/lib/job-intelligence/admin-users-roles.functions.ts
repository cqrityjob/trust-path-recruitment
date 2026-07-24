// Admin Portal — Users & Roles.
//
// Security model:
//   - Every read/write re-verifies the caller server-side (assertAdmin /
//     assertSuperadmin), never trusts a client-supplied flag.
//   - user_roles is readable admin-wide via the new user_roles_admin_select
//     RLS policy (20260724130000) -- read through ctx.supabase, not
//     service-role, since RLS already grants exactly this.
//   - auth.users has no RLS-bypassable read path for any Postgres role
//     (Supabase-managed schema) -- listing/looking up users goes through
//     supabaseAdmin.auth.admin.*, the Auth Admin API, exactly like the
//     existing owner-email lookup in admin-employer-moderation.functions.ts.
//     Only email / created_at / last_sign_in_at / email_confirmed_at are
//     ever read from that API's response -- never a password hash, MFA
//     secret, or any token field, even if present on the raw object.
//   - Granting/revoking a platform role never happens directly against
//     user_roles from this file -- it calls admin_set_platform_role(),
//     the one SECURITY DEFINER RPC that independently re-checks
//     is_superadmin(), blocks self-role-change, blocks removing the last
//     superadmin, and audit-logs itself. This file adds no authorization
//     logic of its own beyond what that RPC already enforces.
//   - Pilot scale (this platform's current stated scale is a ten-person
//     pilot): listUsers() is called with a single generous page size and
//     filtered in-memory server-side. This is not designed to scale to a
//     large user base -- if that becomes necessary, paginating through
//     the Admin API and/or moving search server-side is future work, not
//     attempted here as speculative enterprise scaffolding.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

async function assertSuperadmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_superadmin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_SUPERADMIN_REQUIRED");
}

export type AdminUserListRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  isEmployerMember: boolean;
  isAdmin: boolean;
  isSuperadmin: boolean;
};

const listSchema = z.object({
  search: z.string().trim().max(120).optional(),
});

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminUserListRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      console.error("[admin-users-roles] listUsers failed", listErr);
      throw new Error("USERS_LOAD_FAILED");
    }
    const authUsers = page?.users ?? [];

    const [{ data: profileRows }, { data: roleRows }, { data: membershipRows }] = await Promise.all(
      [
        supabaseAdmin.from("profiles").select("id, display_name"),
        ctx.supabase.from("user_roles").select("user_id, role"),
        ctx.supabase.from("employer_memberships").select("user_id").eq("status", "active"),
      ],
    );

    const nameByUserId = new Map<string, string | null>();
    for (const p of profileRows ?? []) nameByUserId.set(p.id as string, p.display_name ?? null);

    const rolesByUserId = new Map<string, Set<string>>();
    for (const r of roleRows ?? []) {
      const uid = r.user_id as string;
      if (!rolesByUserId.has(uid)) rolesByUserId.set(uid, new Set());
      rolesByUserId.get(uid)!.add(r.role as string);
    }

    const employerMemberUserIds = new Set((membershipRows ?? []).map((m: any) => m.user_id));

    const search = data.search?.toLowerCase();
    const rows: AdminUserListRow[] = authUsers
      .map((u: any) => {
        const roles = rolesByUserId.get(u.id) ?? new Set();
        return {
          id: u.id as string,
          email: (u.email as string | null) ?? null,
          displayName: nameByUserId.get(u.id) ?? null,
          createdAt: (u.created_at as string | null) ?? null,
          lastSignInAt: (u.last_sign_in_at as string | null) ?? null,
          isEmployerMember: employerMemberUserIds.has(u.id),
          isAdmin: roles.has("admin"),
          isSuperadmin: roles.has("superadmin"),
        };
      })
      .filter((u) => {
        if (!search) return true;
        return (
          (u.email ?? "").toLowerCase().includes(search) ||
          (u.displayName ?? "").toLowerCase().includes(search)
        );
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    return rows;
  });

export type AdminUserMembershipRow = {
  employerId: string;
  employerName: string;
  employerSlug: string;
  role: string;
  status: string;
};

export type AdminUserDetail = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  isCandidate: boolean;
  isAdmin: boolean;
  isSuperadmin: boolean;
  memberships: AdminUserMembershipRow[];
};

const detailSchema = z.object({ userId: z.string().uuid() });

export const adminGetUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminUserDetail> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (userErr || !authUser?.user) throw new Error("USER_NOT_FOUND");

    const [{ data: profileRow }, { data: roleRows }, { data: membershipRows }] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name").eq("id", data.userId).maybeSingle(),
      ctx.supabase.from("user_roles").select("role").eq("user_id", data.userId),
      ctx.supabase
        .from("employer_memberships")
        .select("employer_id, role, status, employers(name, slug)")
        .eq("user_id", data.userId),
    ]);

    const roles = new Set((roleRows ?? []).map((r: any) => r.role as string));

    return {
      id: data.userId,
      email: (authUser.user.email as string | null) ?? null,
      displayName: profileRow?.display_name ?? null,
      createdAt: (authUser.user.created_at as string | null) ?? null,
      lastSignInAt: (authUser.user.last_sign_in_at as string | null) ?? null,
      emailConfirmedAt: (authUser.user.email_confirmed_at as string | null) ?? null,
      isCandidate: true,
      isAdmin: roles.has("admin"),
      isSuperadmin: roles.has("superadmin"),
      memberships: (membershipRows ?? []).map((m: any) => {
        const emp = Array.isArray(m.employers) ? m.employers[0] : m.employers;
        return {
          employerId: m.employer_id as string,
          employerName: emp?.name ?? "",
          employerSlug: emp?.slug ?? "",
          role: m.role as string,
          status: m.status as string,
        };
      }),
    };
  });

const setRoleSchema = z.object({
  targetUserId: z.string().uuid(),
  role: z.enum(["admin", "superadmin"]),
  grant: z.boolean(),
});

export const adminSetPlatformRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setRoleSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ targetUserId: string; role: string; granted: boolean }> => {
      const ctx = context as Ctx;
      // assertSuperadmin() gives a clean pre-check error; admin_set_platform_role()
      // itself independently re-verifies is_superadmin() regardless -- the
      // RPC, not this wrapper, is the real boundary.
      await assertSuperadmin(ctx);

      const { data: result, error } = await ctx.supabase.rpc("admin_set_platform_role", {
        _target_user_id: data.targetUserId,
        _role: data.role,
        _grant: data.grant,
      });
      if (error) {
        console.error("[admin-users-roles] admin_set_platform_role RPC failed", error);
        if (error.message?.includes("SELF_ROLE_CHANGE_NOT_ALLOWED")) {
          throw new Error("SELF_ROLE_CHANGE_NOT_ALLOWED");
        }
        if (error.message?.includes("LAST_SUPERADMIN_PROTECTED")) {
          throw new Error("LAST_SUPERADMIN_PROTECTED");
        }
        throw new Error("ROLE_CHANGE_FAILED");
      }
      const row = Array.isArray(result) ? result[0] : result;
      return {
        targetUserId: row.target_user_id as string,
        role: row.granted_role as string,
        granted: row.granted as boolean,
      };
    },
  );
