// Employer OS Phase 1 — Workforce (Employee Directory) server functions.
//
// Security model mirrors employer-jobs.functions.ts exactly: requireSupabaseAuth
// authenticates the caller; every function re-verifies an *active* membership
// on an *active-or-draft* employer through ctx.supabase (RLS-scoped) before any
// read or write, as defense-in-depth alongside the employees_employer_*
// RLS policies (supabase/migrations/20260722090000_employer_workforce_
// employees.sql), which are the actual authorization boundary.
//
// Data minimisation: only first/last name, optional email, role title,
// optional site name, employment status and start date are ever
// accepted or returned. No identity numbers, no health/criminal/vetting
// data, no union membership -- there is nowhere in this schema to put
// them even if a caller tried.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

export type EmploymentStatus = "active" | "inactive";

export type EmployerEmployeeRow = {
  id: string;
  employerId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  roleTitle: string | null;
  siteName: string | null;
  employmentStatus: EmploymentStatus;
  startDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type EmployeeDbRow = {
  id: string;
  employer_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role_title: string | null;
  site_name: string | null;
  employment_status: EmploymentStatus;
  start_date: string | null;
  created_at: string;
  updated_at: string;
};

function fromDbRow(row: EmployeeDbRow): EmployerEmployeeRow {
  return {
    id: row.id,
    employerId: row.employer_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    roleTitle: row.role_title,
    siteName: row.site_name,
    employmentStatus: row.employment_status,
    startDate: row.start_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const EMPLOYEE_SELECT =
  "id, employer_id, first_name, last_name, email, role_title, site_name, employment_status, start_date, created_at, updated_at";

async function assertActiveMembership(ctx: Ctx, employerId: string): Promise<void> {
  const { data: membership, error } = await ctx.supabase
    .from("employer_memberships")
    .select("id, employers!inner(status)")
    .eq("user_id", ctx.userId)
    .eq("employer_id", employerId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("ACCESS_NOT_AVAILABLE");
  if (!membership) throw new Error("ACCESS_NOT_AVAILABLE");
  const emp = Array.isArray((membership as any).employers)
    ? (membership as any).employers[0]
    : (membership as any).employers;
  if (!emp || (emp.status !== "active" && emp.status !== "pending")) {
    throw new Error("ACCESS_NOT_AVAILABLE");
  }
}

// -------- listEmployerEmployees --------

const listSchema = z.object({
  employerId: z.string().uuid(),
});

export const listEmployerEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerEmployeeRow[]> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: rows, error } = await ctx.supabase
      .from("employees")
      .select(EMPLOYEE_SELECT)
      .eq("employer_id", data.employerId)
      .order("employment_status", { ascending: true })
      .order("last_name", { ascending: true });
    if (error) throw new Error("Could not load the employee directory.");
    return ((rows ?? []) as EmployeeDbRow[]).map(fromDbRow);
  });

// -------- createEmployerEmployee --------

const createSchema = z.object({
  employerId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(200),
  lastName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(200).optional().or(z.literal("")),
  siteName: z.string().trim().max(200).optional().or(z.literal("")),
  startDate: z.string().trim().optional().or(z.literal("")),
});

export const createEmployerEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: inserted, error } = await ctx.supabase
      .from("employees")
      .insert({
        employer_id: data.employerId,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email || null,
        role_title: data.roleTitle || null,
        site_name: data.siteName || null,
        start_date: data.startDate || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[employer-workforce] create failed", error);
      throw new Error("Could not add this employee.");
    }
    return { id: inserted.id as string };
  });

// -------- updateEmployerEmployee --------

const updateSchema = z.object({
  employerId: z.string().uuid(),
  employeeId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(200),
  lastName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(200).optional().or(z.literal("")),
  siteName: z.string().trim().max(200).optional().or(z.literal("")),
  startDate: z.string().trim().optional().or(z.literal("")),
});

export const updateEmployerEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: updated, error } = await ctx.supabase
      .from("employees")
      .update({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email || null,
        role_title: data.roleTitle || null,
        site_name: data.siteName || null,
        start_date: data.startDate || null,
      })
      .eq("id", data.employeeId)
      .eq("employer_id", data.employerId)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[employer-workforce] update failed", error);
      throw new Error("Could not update this employee.");
    }
    if (!updated) throw new Error("EMPLOYEE_NOT_FOUND");
    return { id: updated.id as string };
  });

// -------- setEmployerEmployeeStatus (deactivate / reactivate) --------

const setStatusSchema = z.object({
  employerId: z.string().uuid(),
  employeeId: z.string().uuid(),
  employmentStatus: z.enum(["active", "inactive"]),
});

export const setEmployerEmployeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setStatusSchema.parse(d))
  .handler(
    async ({ data, context }): Promise<{ id: string; employmentStatus: EmploymentStatus }> => {
      const ctx = context as Ctx;
      await assertActiveMembership(ctx, data.employerId);

      const { data: updated, error } = await ctx.supabase
        .from("employees")
        .update({ employment_status: data.employmentStatus })
        .eq("id", data.employeeId)
        .eq("employer_id", data.employerId)
        .select("id, employment_status")
        .maybeSingle();
      if (error) {
        console.error("[employer-workforce] status update failed", error);
        throw new Error("Could not update this employee's status.");
      }
      if (!updated) throw new Error("EMPLOYEE_NOT_FOUND");
      return {
        id: updated.id as string,
        employmentStatus: updated.employment_status as EmploymentStatus,
      };
    },
  );

// -------- getEmployerWorkforceSummary --------
//
// Real-data-only summary for the Command Center's Workforce lane. Every
// value here is a direct count/aggregate over the caller's own employees
// rows -- never a fabricated or interpolated figure.

export type EmployerWorkforceSummary = {
  activeEmployees: number;
  rolesRepresented: number;
  sitesRepresented: number;
};

const summarySchema = z.object({
  employerId: z.string().uuid(),
});

export const getEmployerWorkforceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => summarySchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployerWorkforceSummary> => {
    const ctx = context as Ctx;
    await assertActiveMembership(ctx, data.employerId);

    const { data: rows, error } = await ctx.supabase
      .from("employees")
      .select("role_title, site_name")
      .eq("employer_id", data.employerId)
      .eq("employment_status", "active");
    if (error) throw new Error("Could not load workforce summary.");

    const typedRows = (rows ?? []) as Array<{
      role_title: string | null;
      site_name: string | null;
    }>;
    const roles = new Set(
      typedRows.map((r) => r.role_title).filter((v): v is string => Boolean(v?.trim())),
    );
    const sites = new Set(
      typedRows.map((r) => r.site_name).filter((v): v is string => Boolean(v?.trim())),
    );

    return {
      activeEmployees: typedRows.length,
      rolesRepresented: roles.size,
      sitesRepresented: sites.size,
    };
  });
