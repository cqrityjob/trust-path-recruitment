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
  /** The application this employment relationship came out of, when it came out
   *  of one. Lineage, not a dependency: an employee added by hand carries null
   *  and every surface works exactly as before.
   *
   *  It is the other half of the join the candidate page already draws. The
   *  column has existed since 20260903092000 and nothing read it, so a hire
   *  could be followed forwards and never backwards -- and an employer wanting
   *  to see the assessment and interview behind a colleague had to find the
   *  application by name. An application id is an opaque server-issued
   *  identifier and grants nothing: the candidate route re-establishes
   *  membership on arrival. */
  hiredFromApplicationId: string | null;
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
  hired_from_application_id: string | null;
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
    hiredFromApplicationId: row.hired_from_application_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const EMPLOYEE_SELECT =
  "id, employer_id, first_name, last_name, email, role_title, site_name, employment_status, start_date, hired_from_application_id, created_at, updated_at";

/**
 * Creating or importing an employment record requires an APPROVED organisation.
 *
 * ── WHY THIS IS A SEPARATE GATE ─────────────────────────────────────────
 *
 * `assertActiveMembership` below admits a `pending` organisation on purpose:
 * a new owner builds job drafts while they wait for approval, and reading and
 * correcting existing records must keep working through a suspension, or a
 * suspension destroys data rather than stopping new work.
 *
 * A JOB DRAFT and an EMPLOYMENT RECORD are not the same act. The second one
 * names a person and becomes the spine their assessment, training and Passport
 * history hangs off, and the Product Owner has decided it waits for approval.
 *
 * This is defence in depth and an honest error message, NOT the boundary. The
 * boundary is in the database: `employees_employer_insert` requires
 * `employer_is_active_status()`, and `employer_operational_guard()` refuses
 * the insert for every Postgres role including service_role
 * (20261205090000). A caller that reaches PostgREST directly meets the same
 * refusal this one gives.
 */
async function assertActiveEmployerForWorkforceWrite(ctx: Ctx, employerId: string): Promise<void> {
  const status = await employerStatusForActiveMember(ctx, employerId);
  if (status === null) throw new Error("ACCESS_NOT_AVAILABLE");
  // Named rather than folded into ACCESS_NOT_AVAILABLE: an owner whose
  // organisation is still being reviewed has done nothing wrong and needs to
  // know that waiting is the answer.
  if (status !== "active") throw new Error("EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE");
}

async function assertActiveMembership(ctx: Ctx, employerId: string): Promise<void> {
  const status = await employerStatusForActiveMember(ctx, employerId);
  if (status !== "active" && status !== "pending") throw new Error("ACCESS_NOT_AVAILABLE");
}

/** The caller's organisation status, or null when they are not an active
 *  member of it.
 *
 *  One read, written once, because the two gates above ask the same question
 *  and only disagree about which answers they accept. Two copies is how they
 *  eventually disagree about the question too. */
async function employerStatusForActiveMember(ctx: Ctx, employerId: string): Promise<string | null> {
  const { data: membership, error } = await ctx.supabase
    .from("employer_memberships")
    .select("id, employers!inner(status)")
    .eq("user_id", ctx.userId)
    .eq("employer_id", employerId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !membership) return null;
  const joined = (membership as { employers?: unknown }).employers;
  const emp = (Array.isArray(joined) ? joined[0] : joined) as { status?: string } | undefined;
  return emp?.status ?? null;
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
    await assertActiveEmployerForWorkforceWrite(ctx, data.employerId);

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
      // The database's own refusal, carried through with its meaning intact
      // rather than flattened into "could not add". It reaches here when the
      // organisation's status changed between the check above and the write,
      // and when anything else creates an employee by another route.
      if (String(error.message ?? "").includes("EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE")) {
        throw new Error("EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE");
      }
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
