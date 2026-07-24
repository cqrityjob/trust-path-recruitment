// Admin Portal — Overview metrics.
//
// Every number here is a live count or a live row set read through the
// caller's own RLS-scoped client (ctx.supabase) against the exact same
// tables and *_admin_select policies every other admin module reads
// through -- no separate "admin stats" table, no cached/precomputed
// values, nothing fabricated. audit_logs is the one exception: it grants
// nothing to `authenticated` at all (by design, established in the
// original schema), so it is read via supabaseAdmin, exactly like every
// other justified service-role read in this codebase (profiles owner
// lookups in admin-employer-moderation.functions.ts) -- narrowly scoped
// to this one read-only aggregate feed, never written to from a client.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error("ROLE_CHECK_FAILED");
  if (!data) throw new Error("FORBIDDEN_ADMIN_REQUIRED");
}

async function countWhere(ctx: Ctx, table: string, build: (q: any) => any): Promise<number> {
  const base = ctx.supabase.from(table).select("id", { count: "exact", head: true });
  const { count, error } = await build(base);
  if (error) {
    console.error(`[admin-overview] count(${table}) failed`, error);
    throw new Error("OVERVIEW_LOAD_FAILED");
  }
  return count ?? 0;
}

export type AdminOverviewMetrics = {
  employersPending: number;
  employersActive: number;
  employersSuspended: number;
  jobsPendingModeration: number;
  jobsPublished: number;
  applicationsActive: number;
  assignmentsInvited: number;
  assignmentsInProgress: number;
  assignmentsCompleted: number;
  assignmentsExpired: number;
  employeesTotal: number;
  recentFeedback: Array<{
    id: string;
    category: string;
    message: string;
    createdAt: string;
  }>;
  recentAdminActions: Array<{
    id: string;
    source: "employer_moderation" | "job_audit" | "general_audit";
    action: string;
    subjectType: string | null;
    subjectId: string | null;
    at: string;
  }>;
};

export const adminGetOverviewMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverviewMetrics> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const [
      employersPending,
      employersActive,
      employersSuspended,
      jobsPendingModeration,
      jobsPublished,
      applicationsActive,
      assignmentsInvited,
      assignmentsOpened,
      assignmentsStarted,
      assignmentsCompleted,
      assignmentsExpired,
      employeesTotal,
    ] = await Promise.all([
      countWhere(ctx, "employers", (q) => q.eq("status", "pending")),
      countWhere(ctx, "employers", (q) => q.eq("status", "active")),
      countWhere(ctx, "employers", (q) => q.eq("status", "suspended")),
      countWhere(ctx, "jobs", (q) => q.eq("status", "pending_review")),
      countWhere(ctx, "jobs", (q) => q.eq("status", "published")),
      countWhere(ctx, "job_applications", (q) =>
        q.in("status", ["submitted", "reviewing", "interview"]),
      ),
      countWhere(ctx, "assessment_assignments", (q) => q.eq("status", "invited")),
      countWhere(ctx, "assessment_assignments", (q) => q.eq("status", "opened")),
      countWhere(ctx, "assessment_assignments", (q) => q.eq("status", "started")),
      countWhere(ctx, "assessment_assignments", (q) => q.eq("status", "completed")),
      countWhere(ctx, "assessment_assignments", (q) => q.eq("status", "expired")),
      countWhere(ctx, "employees", (q) => q),
    ]);

    const { data: feedbackRows, error: feedbackErr } = await ctx.supabase
      .from("beta_feedback")
      .select("id, category, message, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    if (feedbackErr) {
      console.error("[admin-overview] recent feedback failed", feedbackErr);
      throw new Error("OVERVIEW_LOAD_FAILED");
    }

    const [moderationEventsRes, jobAuditRes] = await Promise.all([
      ctx.supabase
        .from("employer_moderation_events")
        .select("id, action, employer_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      ctx.supabase
        .from("job_audit_events")
        .select("id, action, job_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (moderationEventsRes.error || jobAuditRes.error) {
      console.error(
        "[admin-overview] recent actions failed",
        moderationEventsRes.error,
        jobAuditRes.error,
      );
      throw new Error("OVERVIEW_LOAD_FAILED");
    }

    // audit_logs grants nothing to `authenticated` -- service-role read,
    // narrowly scoped to this one aggregate feed (see file header).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: generalAuditRows } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, subject_type, subject_id, at")
      .order("at", { ascending: false })
      .limit(10);

    const merged: AdminOverviewMetrics["recentAdminActions"] = [
      ...(moderationEventsRes.data ?? []).map((e: any) => ({
        id: e.id as string,
        source: "employer_moderation" as const,
        action: e.action as string,
        subjectType: "employer",
        subjectId: e.employer_id as string,
        at: e.created_at as string,
      })),
      ...(jobAuditRes.data ?? []).map((e: any) => ({
        id: e.id as string,
        source: "job_audit" as const,
        action: e.action as string,
        subjectType: "job",
        subjectId: e.job_id as string,
        at: e.created_at as string,
      })),
      ...(generalAuditRows ?? []).map((e: any) => ({
        id: e.id as string,
        source: "general_audit" as const,
        action: e.action as string,
        subjectType: (e.subject_type as string) ?? null,
        subjectId: (e.subject_id as string) ?? null,
        at: e.at as string,
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 15);

    return {
      employersPending,
      employersActive,
      employersSuspended,
      jobsPendingModeration,
      jobsPublished,
      applicationsActive,
      assignmentsInvited,
      assignmentsInProgress: assignmentsOpened + assignmentsStarted,
      assignmentsCompleted,
      assignmentsExpired,
      employeesTotal,
      recentFeedback: (feedbackRows ?? []).map((f: any) => ({
        id: f.id as string,
        category: f.category as string,
        message: f.message as string,
        createdAt: f.created_at as string,
      })),
      recentAdminActions: merged,
    };
  });
