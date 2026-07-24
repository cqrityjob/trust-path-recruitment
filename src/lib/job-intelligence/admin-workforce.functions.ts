// Admin Portal — Workforce / Employees oversight.
//
// Reads/writes through the caller's own RLS-scoped client using the new
// employees_admin_select / employees_admin_update policies (20260724130000).
// Deliberately minimal, matching this file's own scope: list, inspect,
// toggle employment_status (active/inactive -- the only two values the
// existing CHECK constraint allows, no new status invented), and show
// related assessment assignments. Not a performance-management system --
// no reviews, no goals, no manager hierarchy, none of that is added here.

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

async function writeAudit(params: {
  actorId: string;
  action: string;
  employeeId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_role: "platform_admin",
    action: params.action,
    subject_type: "employee",
    subject_id: params.employeeId,
    metadata: params.metadata as any,
  });
}

export type AdminEmployeeListRow = {
  id: string;
  employerId: string;
  employerName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  roleTitle: string | null;
  employmentStatus: string;
  createdAt: string;
};

const listSchema = z.object({
  status: z.enum(["all", "active", "inactive"]).default("all"),
  employerId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});

export const adminListEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AdminEmployeeListRow[]> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    let q = ctx.supabase
      .from("employees")
      .select(
        "id, employer_id, first_name, last_name, email, role_title, employment_status, created_at, employers(name)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status !== "all") q = q.eq("employment_status", data.status);
    if (data.employerId) q = q.eq("employer_id", data.employerId);

    const { data: rows, error } = await q;
    if (error) {
      console.error("[admin-workforce] list failed", error);
      throw new Error("EMPLOYEES_LOAD_FAILED");
    }

    const search = data.search?.toLowerCase();
    return (rows ?? [])
      .map((r: any) => {
        const employer = Array.isArray(r.employers) ? r.employers[0] : r.employers;
        return {
          id: r.id as string,
          employerId: r.employer_id as string,
          employerName: (employer?.name as string) ?? "",
          firstName: r.first_name as string,
          lastName: r.last_name as string,
          email: (r.email as string | null) ?? null,
          roleTitle: (r.role_title as string | null) ?? null,
          employmentStatus: r.employment_status as string,
          createdAt: r.created_at as string,
        };
      })
      .filter((r: AdminEmployeeListRow) => {
        if (!search) return true;
        return (
          `${r.firstName} ${r.lastName}`.toLowerCase().includes(search) ||
          (r.email ?? "").toLowerCase().includes(search) ||
          r.employerName.toLowerCase().includes(search)
        );
      });
  });

export type AdminEmployeeAssignmentRow = {
  id: string;
  assessmentId: string;
  status: string;
  invitedAt: string;
  completedAt: string | null;
};

export type AdminEmployeeDetail = AdminEmployeeListRow & {
  siteName: string | null;
  startDate: string | null;
  assignments: AdminEmployeeAssignmentRow[];
};

const detailSchema = z.object({ employeeId: z.string().uuid() });

export const adminGetEmployeeDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }): Promise<AdminEmployeeDetail> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: row, error } = await ctx.supabase
      .from("employees")
      .select(
        "id, employer_id, first_name, last_name, email, role_title, site_name, employment_status, start_date, created_at, employers(name)",
      )
      .eq("id", data.employeeId)
      .maybeSingle();
    if (error) {
      console.error("[admin-workforce] detail failed", error);
      throw new Error("EMPLOYEE_LOAD_FAILED");
    }
    if (!row) throw new Error("EMPLOYEE_NOT_FOUND");

    const { data: assignmentRows, error: assignmentsErr } = await ctx.supabase
      .from("assessment_assignments")
      .select("id, assessment_id, status, invited_at, completed_at")
      .eq("employee_id", data.employeeId)
      .order("invited_at", { ascending: false });
    if (assignmentsErr) {
      console.error("[admin-workforce] related assignments failed", assignmentsErr);
      throw new Error("EMPLOYEE_LOAD_FAILED");
    }

    const employer = Array.isArray(row.employers) ? row.employers[0] : row.employers;

    return {
      id: row.id,
      employerId: row.employer_id,
      employerName: employer?.name ?? "",
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email ?? null,
      roleTitle: row.role_title ?? null,
      employmentStatus: row.employment_status,
      createdAt: row.created_at,
      siteName: row.site_name ?? null,
      startDate: row.start_date ?? null,
      assignments: (assignmentRows ?? []).map((a: any) => ({
        id: a.id as string,
        assessmentId: a.assessment_id as string,
        status: a.status as string,
        invitedAt: a.invited_at as string,
        completedAt: (a.completed_at as string | null) ?? null,
      })),
    };
  });

const setStatusSchema = z.object({
  employeeId: z.string().uuid(),
  employmentStatus: z.enum(["active", "inactive"]),
});

export const adminSetEmployeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setStatusSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertAdmin(ctx);

    const { data: before } = await ctx.supabase
      .from("employees")
      .select("employment_status")
      .eq("id", data.employeeId)
      .maybeSingle();

    const { error } = await ctx.supabase
      .from("employees")
      .update({ employment_status: data.employmentStatus, updated_at: new Date().toISOString() })
      .eq("id", data.employeeId);
    if (error) {
      console.error("[admin-workforce] set status failed", error);
      throw new Error("EMPLOYEE_UPDATE_FAILED");
    }

    await writeAudit({
      actorId: ctx.userId,
      action: data.employmentStatus === "active" ? "employee_reactivated" : "employee_deactivated",
      employeeId: data.employeeId,
      metadata: {
        previous_status: before?.employment_status ?? null,
        new_status: data.employmentStatus,
      },
    });

    return { id: data.employeeId };
  });
