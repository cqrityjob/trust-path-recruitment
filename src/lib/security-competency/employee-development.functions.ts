// Employee 360 — the two reads and the one write behind the post-hire page.
//
// ── THE SHAPE OF THE PROBLEM THIS SOLVES ────────────────────────────────
//
// The employee page had three headings and two of them rendered nothing.
// "Competencies & certificates" was a lede over empty space; "Competence
// development" was a link to every programme the organisation has ever
// assigned to anybody. Both were signposts to rooms that did not exist.
//
// The data for both exists. What was missing was a read that starts from an
// EMPLOYEE, and that is the whole of this module.
//
// ── EVERY FUNCTION TAKES employeeId, NEVER subjectId ────────────────────
//
// Governance rule 10 says an employer read model does not carry a subject
// reference, and the Product Owner has now made it a contract: the browser
// passes a product-level identifier and the server resolves canonical identity
// behind it. So each function below takes `{ employerId, employeeId }`, reads
// `employees.subject_id` server-side, and returns rows with no subject in
// them. The subject never crosses the boundary in either direction.
//
// This is not the authorisation. `employees` is RLS-scoped to a member of the
// organisation and `scp_employer_training_status` re-checks active membership
// for itself; the employer-scoped read below is defence in depth and a way to
// give an honest refusal rather than an empty list.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The shared client typing. `RpcRow` keeps every PostgREST value `unknown`, so
// a misread column name is a compile error rather than an undefined at
// runtime; the CLIENT stays the documented exception, because the generated
// Database type does not describe SECURITY DEFINER RPCs and a narrower type
// would have to be cast away at every call site. See rpc-types.ts.
import type { Ctx, RpcRow } from "./rpc-types";

const employeeInput = z.object({
  employerId: z.string().uuid(),
  employeeId: z.string().uuid(),
});

/**
 * The employment record, read once, server-side.
 *
 * Returns the two fields the surfaces below need and nothing else. A record
 * that is not this organisation's comes back null, and every caller renders
 * the same "not found" it renders for an id that does not exist -- the two are
 * deliberately indistinguishable.
 */
async function readEmployee(
  ctx: Ctx,
  employerId: string,
  employeeId: string,
): Promise<{
  subjectId: string | null;
  professionSlug: string | null;
  email: string | null;
} | null> {
  const { data, error } = await ctx.supabase
    .from("employees")
    .select("id, subject_id, cig_profession_slug, email")
    .eq("id", employeeId)
    .eq("employer_id", employerId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    subjectId: (data.subject_id as string | null) ?? null,
    professionSlug: (data.cig_profession_slug as string | null) ?? null,
    email: (data.email as string | null) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Competence today                                                    */
/* ------------------------------------------------------------------ */

export type CompetenceRequirement = {
  competencyId: string;
  slug: string;
  titleSv: string;
  titleEn: string;
  descriptionSv: string | null;
  descriptionEn: string | null;
  /** The catalogue's own words for how central this is to the profession.
   *  Passed through untouched: it describes the ROLE, never the person. */
  criticality: string;
  importance: number;
};

export type EmployeeCompetenceContext = {
  /** Why the section is empty, when it is. Named rather than left blank, so
   *  the page can say what is missing instead of rendering a heading over
   *  nothing -- which is exactly what it used to do. */
  state: "ready" | "noProfession" | "professionNotPublished";
  professionSlug: string | null;
  professionTitleSv: string | null;
  professionTitleEn: string | null;
  requirements: CompetenceRequirement[];
};

/**
 * What this employee's role requires, from the canonical catalogue.
 *
 * ── HOW THE PROFESSION IS RESOLVED ──────────────────────────────────────
 *
 * Through `employees.cig_profession_slug`, which is a FOREIGN KEY onto
 * `cig_professions.slug` -- so this is a join, not a string match. That
 * matters: this codebase has three profession slug namespaces which overlap on
 * exactly four values, and resolving by equality against the wrong one is a
 * defect that looks like it works. Nothing here compares a Career Center id to
 * a CIG slug; where a cross-namespace link is ever needed, it goes through
 * profession-links.ts, and this function does not need one.
 *
 * ── WHAT IT DOES NOT COMPUTE ────────────────────────────────────────────
 *
 * No readiness score, no gap percentage, no met/unmet, no pass or fail. It
 * returns the requirements of a ROLE. Whether a person meets one is a
 * governed assessment's answer, and this product does not guess it.
 */
export const getEmployeeCompetenceContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employeeInput.parse(d))
  .handler(async ({ data, context }): Promise<EmployeeCompetenceContext> => {
    const ctx = context as Ctx;
    const empty: EmployeeCompetenceContext = {
      state: "noProfession",
      professionSlug: null,
      professionTitleSv: null,
      professionTitleEn: null,
      requirements: [],
    };

    const employee = await readEmployee(ctx, data.employerId, data.employeeId);
    if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
    if (!employee.professionSlug) return empty;

    const { data: profession, error: professionError } = await ctx.supabase
      .from("cig_professions")
      .select("id, slug, title_sv, title_en, content_status")
      .eq("slug", employee.professionSlug)
      .eq("content_status", "published")
      .maybeSingle();
    if (professionError) throw new Error("Could not load the profession catalogue.");

    // The role is recorded and its catalogue entry is not published. That is a
    // different sentence from "no role recorded", and the page says so: a
    // reader who sees an empty section under a role title they recognise needs
    // to know the catalogue is the reason, not their colleague.
    if (!profession) {
      return {
        ...empty,
        state: "professionNotPublished",
        professionSlug: employee.professionSlug,
      };
    }

    const { data: reqs, error: reqError } = await ctx.supabase
      .from("cig_profession_competency_req")
      .select("competency_id, criticality, importance, content_status")
      .eq("profession_id", profession.id as string)
      .eq("content_status", "published");
    if (reqError) throw new Error("Could not load the profession's requirements.");

    const rows = (reqs ?? []) as {
      competency_id: string;
      criticality: string;
      importance: number;
    }[];
    const ids = [...new Set(rows.map((r) => r.competency_id))];

    let competencies: Record<string, RpcRow> = {};
    if (ids.length > 0) {
      const { data: comps, error: compError } = await ctx.supabase
        .from("cig_competencies")
        .select("id, slug, title_sv, title_en, description_sv, description_en, content_status")
        .eq("content_status", "published")
        .in("id", ids);
      if (compError) throw new Error("Could not load the competency catalogue.");
      competencies = Object.fromEntries(
        ((comps ?? []) as RpcRow[]).map((c) => [c.id as string, c]),
      );
    }

    const requirements: CompetenceRequirement[] = rows
      .map((r) => {
        const c = competencies[r.competency_id];
        if (!c) return null;
        return {
          competencyId: r.competency_id,
          slug: String(c.slug),
          titleSv: String(c.title_sv),
          titleEn: String(c.title_en),
          descriptionSv: (c.description_sv as string | null) ?? null,
          descriptionEn: (c.description_en as string | null) ?? null,
          criticality: String(r.criticality),
          importance: Number(r.importance ?? 0),
        };
      })
      .filter((r): r is CompetenceRequirement => r !== null)
      // Most central first, then alphabetically so the order is total and the
      // list does not shuffle between two reads of the same data.
      .sort((a, b) => b.importance - a.importance || a.titleSv.localeCompare(b.titleSv));

    return {
      state: "ready",
      professionSlug: String(profession.slug),
      professionTitleSv: (profession.title_sv as string | null) ?? null,
      professionTitleEn: (profession.title_en as string | null) ?? null,
      requirements,
    };
  });

/* ------------------------------------------------------------------ */
/* Development activity, for ONE person                                */
/* ------------------------------------------------------------------ */

export type EmployeeDevelopmentRow = {
  assignmentId: string;
  programmeNameSv: string;
  programmeNameEn: string;
  versionNumber: number;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  modulesTotal: number;
  modulesCompleted: number;
  assignedAt: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  language: string;
};

export type EmployeeDevelopmentActivity = {
  /**
   * `unlinked` is the honest answer for an employment record that is not yet
   * bound to a person. Development activity is attached to a SUBJECT, so an
   * unbound record has nothing to show -- and an empty list would say "this
   * person has had no development", which is a claim about them rather than
   * about the record.
   */
  state: "ready" | "unlinked";
  rows: EmployeeDevelopmentRow[];
};

/**
 * This employee's development assignments, and nobody else's.
 *
 * Reads the same governed RPC the organisation-wide list reads, then filters
 * to this employment record's own subject -- resolved here, server-side, from
 * the employment record the caller named. The subject does not appear in the
 * result.
 */
export const listEmployeeDevelopmentActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employeeInput.parse(d))
  .handler(async ({ data, context }): Promise<EmployeeDevelopmentActivity> => {
    const ctx = context as Ctx;
    const employee = await readEmployee(ctx, data.employerId, data.employeeId);
    if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
    if (!employee.subjectId) return { state: "unlinked", rows: [] };

    const { data: rows, error } = await ctx.supabase.rpc("scp_employer_training_status", {
      _employer_id: data.employerId,
    });
    if (error) throw new Error("Could not load this person's development activity.");

    const mine = ((rows ?? []) as RpcRow[]).filter(
      (r) => String(r.subject_id) === employee.subjectId,
    );

    return {
      state: "ready",
      rows: mine.map((r) => ({
        assignmentId: String(r.assignment_id),
        programmeNameSv: String(r.programme_name_sv),
        programmeNameEn: String(r.programme_name_en),
        versionNumber: Number(r.version_number ?? 1),
        status: String(r.status) as EmployeeDevelopmentRow["status"],
        modulesTotal: Number(r.modules_total ?? 0),
        modulesCompleted: Number(r.modules_completed ?? 0),
        assignedAt: (r.assigned_at as string | null) ?? null,
        dueAt: (r.due_at as string | null) ?? null,
        startedAt: (r.started_at as string | null) ?? null,
        completedAt: (r.completed_at as string | null) ?? null,
        language: String(r.language ?? "sv"),
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Assigning, without losing the person                                */
/* ------------------------------------------------------------------ */

/** Why an assignment could not be made, in the product's own words. Each one
 *  is actionable by the person reading it; none of them is a stack trace. */
export type AssignRefusal =
  | "employeeNotFound"
  | "noEmailOnRecord"
  | "noAccount"
  | "notAuthorised"
  | "programmeNotAssignable"
  | "failed";

export type AssignDevelopmentResult =
  | { readonly kind: "assigned"; readonly assignmentId: string }
  | { readonly kind: "refused"; readonly reason: AssignRefusal };

/**
 * Assign a governed development programme to ONE employee.
 *
 * ── THE CONTRACT THE PRODUCT OWNER ASKED FOR ────────────────────────────
 *
 *   employeeId -> the server resolves the person -> a governed assignment
 *
 * The browser passes an employment record and a programme version. It does not
 * pass a subject, and it does not pass an address: the recipient is read from
 * the employment record this organisation already holds, so the employer never
 * re-types a person they were already looking at.
 *
 * ── WHY THE EMPLOYEE TRAVELS ALL THE WAY INTO THE DATABASE ──────────────
 *
 * `scp_assign_training` takes `_employee_id` (20261206090000) and binds the
 * employment record to the subject it resolves, when that record carries none.
 * Without that, an assignment made from this page would attach to a subject
 * the employment record does not share, and the programme would be invisible
 * on the page it was assigned from -- with no error, because nothing failed.
 * The binding is what makes "return to the employee and see it" true.
 *
 * Every refusal the RPC can raise keeps its own reason here. "Could not
 * assign" is not a message somebody can act on.
 */
export const assignDevelopmentProgrammeToEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    employeeInput
      .extend({
        programVersionId: z.string().uuid(),
        language: z.enum(["sv", "en"]).default("sv"),
        deadline: z.string().nullable().default(null),
        message: z.string().max(2000).nullable().default(null),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<AssignDevelopmentResult> => {
    const ctx = context as Ctx;
    const employee = await readEmployee(ctx, data.employerId, data.employeeId);
    if (!employee) return { kind: "refused", reason: "employeeNotFound" };
    // An employment record may legitimately have no address -- the directory
    // does not require one -- and development is attached to a person, not to
    // a record. Said plainly rather than attempted and failed.
    if (!employee.email) return { kind: "refused", reason: "noEmailOnRecord" };

    const { data: rows, error } = await ctx.supabase.rpc("scp_assign_training", {
      _employer_id: data.employerId,
      _program_version_id: data.programVersionId,
      _recipient_email: employee.email,
      _language: data.language,
      _due_at: data.deadline,
      _message: data.message,
      _source_decision_id: null,
      _employee_id: data.employeeId,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("SCP_RECIPIENT_HAS_NO_ACCOUNT")) {
        return { kind: "refused", reason: "noAccount" };
      }
      if (message.includes("SCP_NOT_AUTHORISED_TO_ASSIGN")) {
        return { kind: "refused", reason: "notAuthorised" };
      }
      if (
        message.includes("SCP_PROGRAMME_NOT_ASSIGNABLE") ||
        message.includes("SCP_TRAINING_TARGET") ||
        message.includes("SCP_PURPOSE_NOT_AVAILABLE")
      ) {
        return { kind: "refused", reason: "programmeNotAssignable" };
      }
      console.error("[employee-development] assign failed", message);
      return { kind: "refused", reason: "failed" };
    }

    const r = (Array.isArray(rows) ? rows[0] : rows) as RpcRow | null;
    if (!r?.assignment_id) return { kind: "refused", reason: "failed" };
    // The assignment id and nothing else. `scp_assign_training` also returns
    // the subject it resolved, and it stops here: the browser has no use for
    // it and governance rule 10 says it must not have it.
    return { kind: "assigned", assignmentId: String(r.assignment_id) };
  });
