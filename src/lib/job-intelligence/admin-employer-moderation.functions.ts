import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -----------------------------------------------------------------------------
// Phase H3.3 — Platform Admin Employer Moderation server functions.
//
// Security model (mirrors admin.functions.ts's own assertAdmin() pattern,
// and the H3.2.x lesson learned the hard way: never use supabaseAdmin for
// a read RLS already grants):
//   1. requireSupabaseAuth authenticates the caller and injects
//      ctx.userId from verified claims (never client-supplied).
//   2. assertAdmin() re-verifies is_platform_admin(auth.uid()) through the
//      caller's own RLS-scoped client before any read or write. RLS is
//      still the actual boundary (employers_admin_all,
//      employer_memberships_admin_all, jobs_admin_select,
//      employer_moderation_events_admin_select all independently gate on
//      the same is_platform_admin() check) -- this call gives a clean
//      error before those policies would otherwise silently return zero
//      rows.
//   3. Every ordinary read (employer rows, membership counts, job counts,
//      moderation history) goes through ctx.supabase -- the caller's own
//      RLS-scoped client -- never supabaseAdmin, because the admin RLS
//      policies above already grant a verified admin everything these
//      reads need. supabaseAdmin is used for exactly one thing: reading
//      an employer owner's profile display name and email, because
//      profiles is self-select-only RLS (candidate data minimisation,
//      unchanged) and auth.users has no RLS-bypassable read path for any
//      role at all -- both require service-role, narrowly scoped to the
//      specific owner user id already resolved from an RLS-scoped
//      membership read.
//   4. The one write this file exposes (adminModerateEmployer) is a thin
//      wrapper around the moderate_employer() SECURITY DEFINER RPC, which
//      independently re-verifies platform-admin status itself and is the
//      sole place transition validation and audit-row atomicity live.
//      This file adds no additional trust of its own beyond what the RPC
//      already enforces.
// -----------------------------------------------------------------------------

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) {
    console.error("[admin-employer-moderation] is_platform_admin check failed", error);
    throw new Error("ROLE_CHECK_FAILED");
  }
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

// -------------------- PENDING COUNT (nav badge) --------------------

export const adminCountPendingEmployers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);
    const { count, error } = await ctx.supabase
      .from("employers")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) {
      console.error("[admin-employer-moderation] pending count failed", error);
      throw new Error("LOAD_EMPLOYERS_FAILED");
    }
    return count ?? 0;
  });

// -------------------- LIST --------------------

const listSchema = z.object({
  status: z
    .enum(["all", "pending", "active", "rejected", "suspended", "draft", "archived"])
    .default("pending"),
  search: z.string().trim().max(120).optional(),
});

export type AdminEmployerListRow = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  registrationNumber: string | null;
  website: string | null;
  status: string;
  createdAt: string;
  ownerDisplayName: string | null;
  memberCount: number;
  draftJobCount: number;
  latestModerationAction: string | null;
  latestModerationAt: string | null;
};

export const adminListEmployersForModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminEmployerListRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    let q = ctx.supabase
      .from("employers")
      .select("id, slug, name, country, registration_number, website, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`name.ilike.${s},registration_number.ilike.${s}`);
    }

    const { data: rows, error } = await q;
    if (error) {
      console.error("[admin-employer-moderation] list employers failed", error);
      throw new Error("LOAD_EMPLOYERS_FAILED");
    }
    if (!rows || rows.length === 0) return [];

    const employerIds = rows.map((r: any) => r.id as string);

    // RLS-scoped reads only -- employer_memberships_admin_all and
    // jobs_admin_select already grant a verified admin exactly these rows.
    const [membershipsRes, jobsRes, eventsRes] = await Promise.all([
      ctx.supabase
        .from("employer_memberships")
        .select("employer_id, user_id, role, status")
        .in("employer_id", employerIds)
        .eq("status", "active"),
      ctx.supabase.from("jobs").select("employer_id, status").in("employer_id", employerIds),
      ctx.supabase
        .from("employer_moderation_events")
        .select("employer_id, action, created_at")
        .in("employer_id", employerIds)
        .order("created_at", { ascending: false }),
    ]);
    if (membershipsRes.error || jobsRes.error || eventsRes.error) {
      console.error(
        "[admin-employer-moderation] aggregate reads failed",
        membershipsRes.error,
        jobsRes.error,
        eventsRes.error,
      );
      throw new Error("LOAD_EMPLOYERS_FAILED");
    }

    const memberCountByEmployer = new Map<string, number>();
    const ownerUserIdByEmployer = new Map<string, string>();
    for (const m of membershipsRes.data ?? []) {
      const eid = m.employer_id as string;
      memberCountByEmployer.set(eid, (memberCountByEmployer.get(eid) ?? 0) + 1);
      if (m.role === "owner" && !ownerUserIdByEmployer.has(eid)) {
        ownerUserIdByEmployer.set(eid, m.user_id as string);
      }
    }

    const draftCountByEmployer = new Map<string, number>();
    for (const j of jobsRes.data ?? []) {
      if (j.status === "draft") {
        const eid = j.employer_id as string;
        draftCountByEmployer.set(eid, (draftCountByEmployer.get(eid) ?? 0) + 1);
      }
    }

    const latestEventByEmployer = new Map<string, { action: string; createdAt: string }>();
    for (const ev of eventsRes.data ?? []) {
      const eid = ev.employer_id as string;
      if (!latestEventByEmployer.has(eid)) {
        latestEventByEmployer.set(eid, { action: ev.action, createdAt: ev.created_at });
      }
    }

    // Owner display names: profiles is self-select-only RLS -- this is
    // the one narrow, justified supabaseAdmin read in this file, scoped
    // to exactly the owner user ids already resolved above.
    const ownerUserIds = Array.from(new Set(ownerUserIdByEmployer.values()));
    const nameByUserId = new Map<string, string | null>();
    if (ownerUserIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profileRows } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", ownerUserIds);
      for (const p of profileRows ?? []) {
        nameByUserId.set(p.id as string, (p.display_name as string | null) ?? null);
      }
    }

    return rows.map((r: any) => {
      const ownerUserId = ownerUserIdByEmployer.get(r.id);
      const latest = latestEventByEmployer.get(r.id);
      return {
        id: r.id as string,
        slug: r.slug as string,
        name: r.name as string,
        country: r.country as string | null,
        registrationNumber: r.registration_number as string | null,
        website: r.website as string | null,
        status: r.status as string,
        createdAt: r.created_at as string,
        ownerDisplayName: ownerUserId ? (nameByUserId.get(ownerUserId) ?? null) : null,
        memberCount: memberCountByEmployer.get(r.id) ?? 0,
        draftJobCount: draftCountByEmployer.get(r.id) ?? 0,
        latestModerationAction: latest?.action ?? null,
        latestModerationAt: latest?.createdAt ?? null,
      };
    });
  });

// -------------------- DETAIL --------------------

export type AdminEmployerModerationEvent = {
  id: string;
  action: string;
  previousStatus: string;
  newStatus: string;
  adminUserId: string | null;
  adminDisplayName: string | null;
  note: string | null;
  createdAt: string;
};

export type AdminEmployerMembershipRow = {
  id: string;
  userId: string;
  role: string;
  status: string;
  displayName: string | null;
};

export type AdminEmployerJobRow = {
  id: string;
  slug: string;
  status: string;
  titleSv: string | null;
  titleEn: string | null;
  updatedAt: string;
};

export type AdminEmployerDetail = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  registrationNumber: string | null;
  website: string | null;
  descriptionSv: string | null;
  descriptionEn: string | null;
  status: string;
  createdAt: string;
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  ownerEmail: string | null;
  memberships: AdminEmployerMembershipRow[];
  jobs: AdminEmployerJobRow[];
  moderationHistory: AdminEmployerModerationEvent[];
};

const detailSchema = z.object({ employerId: z.string().uuid() });

export const adminGetEmployerForModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminEmployerDetail> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: employer, error: empErr } = await ctx.supabase
      .from("employers")
      .select(
        "id, slug, name, country, registration_number, website, description_sv, description_en, status, created_at",
      )
      .eq("id", data.employerId)
      .maybeSingle();
    if (empErr) {
      console.error("[admin-employer-moderation] load employer failed", empErr);
      throw new Error("LOAD_EMPLOYER_FAILED");
    }
    if (!employer) throw new Error("EMPLOYER_NOT_FOUND");

    const [membershipsRes, jobsRes, eventsRes] = await Promise.all([
      ctx.supabase
        .from("employer_memberships")
        .select("id, user_id, role, status")
        .eq("employer_id", data.employerId)
        .order("created_at", { ascending: true }),
      ctx.supabase
        .from("jobs")
        .select("id, slug, status, title_sv, title_en, updated_at")
        .eq("employer_id", data.employerId)
        .order("updated_at", { ascending: false })
        .limit(200),
      ctx.supabase
        .from("employer_moderation_events")
        .select("id, action, previous_status, new_status, admin_user_id, note, created_at")
        .eq("employer_id", data.employerId)
        .order("created_at", { ascending: false }),
    ]);
    if (membershipsRes.error || jobsRes.error || eventsRes.error) {
      console.error(
        "[admin-employer-moderation] load employer detail failed",
        membershipsRes.error,
        jobsRes.error,
        eventsRes.error,
      );
      throw new Error("LOAD_EMPLOYER_FAILED");
    }

    const memberships = (membershipsRes.data ?? []) as any[];
    const ownerMembership = memberships.find((m) => m.role === "owner" && m.status === "active");

    // Narrow, justified supabaseAdmin reads: profiles (self-select-only
    // RLS) for every member's display name, and the Auth Admin API for
    // the owner's email specifically -- auth.users has no RLS-bypassable
    // read path for any role. Both scoped to user ids already resolved
    // from the RLS-scoped membership read above.
    const memberUserIds = Array.from(new Set(memberships.map((m) => m.user_id as string)));
    const nameByUserId = new Map<string, string | null>();
    let ownerEmail: string | null = null;
    if (memberUserIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profileRows } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", memberUserIds);
      for (const p of profileRows ?? []) {
        nameByUserId.set(p.id as string, (p.display_name as string | null) ?? null);
      }
      if (ownerMembership) {
        const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(
          ownerMembership.user_id as string,
        );
        ownerEmail = ownerUser?.user?.email ?? null;
      }
    }

    const adminIds = Array.from(
      new Set((eventsRes.data ?? []).map((e: any) => e.admin_user_id).filter(Boolean)),
    ) as string[];
    const adminNameByUserId = new Map<string, string | null>();
    if (adminIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: adminProfileRows } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", adminIds);
      for (const p of adminProfileRows ?? []) {
        adminNameByUserId.set(p.id as string, (p.display_name as string | null) ?? null);
      }
    }

    return {
      id: employer.id,
      slug: employer.slug,
      name: employer.name,
      country: employer.country,
      registrationNumber: employer.registration_number,
      website: employer.website,
      descriptionSv: employer.description_sv,
      descriptionEn: employer.description_en,
      status: employer.status,
      createdAt: employer.created_at,
      ownerUserId: (ownerMembership?.user_id as string) ?? null,
      ownerDisplayName: ownerMembership
        ? (nameByUserId.get(ownerMembership.user_id as string) ?? null)
        : null,
      ownerEmail,
      memberships: memberships.map((m) => ({
        id: m.id as string,
        userId: m.user_id as string,
        role: m.role as string,
        status: m.status as string,
        displayName: nameByUserId.get(m.user_id as string) ?? null,
      })),
      jobs: (jobsRes.data ?? []).map((j: any) => ({
        id: j.id as string,
        slug: j.slug as string,
        status: j.status as string,
        titleSv: j.title_sv as string | null,
        titleEn: j.title_en as string | null,
        updatedAt: j.updated_at as string,
      })),
      moderationHistory: (eventsRes.data ?? []).map((e: any) => ({
        id: e.id as string,
        action: e.action as string,
        previousStatus: e.previous_status as string,
        newStatus: e.new_status as string,
        adminUserId: (e.admin_user_id as string) ?? null,
        adminDisplayName: e.admin_user_id ? (adminNameByUserId.get(e.admin_user_id) ?? null) : null,
        note: e.note as string | null,
        createdAt: e.created_at as string,
      })),
    };
  });

// -------------------- MODERATE --------------------

const moderateSchema = z.object({
  employerId: z.string().uuid(),
  action: z.enum(["approved", "rejected", "suspended", "reactivated"]),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const adminModerateEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moderateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    // assertAdmin() gives a clean pre-check error; moderate_employer()
    // itself independently re-verifies is_platform_admin() server-side
    // regardless -- the RPC, not this wrapper, is the real boundary.
    await assertAdmin(ctx);

    const { data: result, error } = await ctx.supabase.rpc("moderate_employer", {
      _employer_id: data.employerId,
      _action: data.action,
      _note: data.note ?? null,
    });
    if (error) {
      console.error("[admin-employer-moderation] moderate_employer RPC failed", error);
      if (error.code === "23514") throw new Error("INVALID_MODERATION_TRANSITION");
      throw new Error("MODERATION_ACTION_FAILED");
    }
    const row = Array.isArray(result) ? result[0] : result;
    return {
      employerId: row.employer_id as string,
      previousStatus: row.previous_status as string,
      newStatus: row.new_status as string,
      action: row.action as string,
    };
  });
