// Who may read what an organisation learned about a person -- the UI's half.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ───────────────────────────────────
//
// This module is UX TRUTHFULNESS, not authorisation. The boundary is the
// database: `employer_reports_readable` (the one definition) and the functions
// and row policies that ask it. A member who is not an owner, an admin, the
// holder of a reviewer grant for the use case or the named responsible
// recruiter of a vacancy reads NOTHING there -- no rows, no counts -- and that
// holds whatever this file says. What this file prevents is the screen lying
// about it: an empty candidate list that reads as "no candidates" when the true
// answer is "you may not see them", and entry points that lead only to refusals.
//
// ── WHY IT MIRRORS THE DATABASE BY ASKING IT ───────────────────────────
//
// The caller's facts come from `employer_report_access`, a read-only function
// that answers FOR THE CALLER ONLY by calling the same definition the policies
// call. The decision below is a pure function of those facts and re-derives
// nothing about roles itself, so the two cannot drift: there is no second copy
// of "owner or admin" in the browser to forget when the rule changes.
//
// ── BEFORE THE MIGRATION IS APPLIED ────────────────────────────────────
//
// If `employer_report_access` does not exist yet, the answer is `unknown` and
// every screen behaves exactly as it did before: it shows what the database
// returns. The application therefore works before and after the migration, in
// either order of deployment.

export type ReportUseCase = "workforce" | "recruitment";

/** The caller's own facts about one organisation, as the database reports them. */
export type ReportAccessFacts = {
  /** An active member of an active organisation. */
  isMember: boolean;
  /** Owner or admin: reads everything of the organisation. */
  ownerOrAdmin: boolean;
  /** The use cases the caller may read as a whole (owner/admin: both; a reviewer: their grants). */
  readableUseCases: ReportUseCase[];
  /** Vacancies the caller is the named responsible recruiter of. */
  responsibleJobIds: string[];
  /** Whether the caller may open at least one interview case (creator, panel member, or any basis above). */
  caseAccess: boolean;
};

/** What the screen should do. `unknown` means: behave as before, show what the database returns. */
export type ReportAccessState = "loading" | "unknown" | "allowed" | "none";

const USE_CASES: readonly ReportUseCase[] = ["workforce", "recruitment"];

function isUseCase(v: unknown): v is ReportUseCase {
  return typeof v === "string" && (USE_CASES as readonly string[]).includes(v);
}

/** Maps the row `employer_report_access` returns; null when there is no usable row. */
export function mapReportAccess(row: unknown): ReportAccessFacts | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.is_member !== "boolean" || typeof r.owner_or_admin !== "boolean") return null;
  const uses = Array.isArray(r.readable_use_cases) ? r.readable_use_cases.filter(isUseCase) : [];
  const jobs = Array.isArray(r.responsible_job_ids)
    ? r.responsible_job_ids.filter((j): j is string => typeof j === "string")
    : [];
  return {
    isMember: r.is_member,
    ownerOrAdmin: r.owner_or_admin,
    readableUseCases: uses,
    responsibleJobIds: jobs,
    caseAccess: r.case_access === true,
  };
}

/**
 * Whether the caller may read ANY employer-audience report, list or count.
 *
 * Owner or admin; or a reviewer grant for a use case; or the named responsible
 * recruiter of at least one vacancy. The same three bases as the database
 * (R1, R2, R3). Interview cases have a fourth (creator, panel) and are asked
 * separately: see `canOpenInterviewCases`.
 */
export function canReadReports(f: ReportAccessFacts): boolean {
  return (
    f.isMember &&
    (f.ownerOrAdmin || f.readableUseCases.length > 0 || f.responsibleJobIds.length > 0)
  );
}

/**
 * Whether the caller may open at least one interview case.
 *
 * `caseAccess` is the database's own answer (a case the caller may read: the
 * creator, a panel member, a recruitment reviewer, a vacancy's responsible
 * recruiter, an owner or admin). It is NOT inferred from `canReadReports`: a
 * workforce reviewer reads workforce results and no interview case at all.
 */
export function canOpenInterviewCases(f: ReportAccessFacts): boolean {
  return f.isMember && (f.ownerOrAdmin || f.caseAccess);
}

export type ReportAccessInput =
  | { status: "pending" }
  | { status: "error" }
  | { status: "success"; known: boolean; facts: ReportAccessFacts | null };

/** What a screen needs access to: any results, one use case's, or interview cases. */
export type ReportNeed = "reports" | "workforce" | "recruitment" | "interviews";

/**
 * The state a screen with a stated NEED should render.
 *
 * `workforce` and `recruitment` are for screens that only ever show that use
 * case (workforce training, the recruitment candidate list): an owner or admin,
 * or a reviewer for that use case; for recruitment also a vacancy's responsible
 * recruiter. `reports` is "anything"; `interviews` adds the case's own people.
 */
export function reportAccessStateFor(
  input: ReportAccessInput,
  need: ReportNeed,
): ReportAccessState {
  if (input.status === "pending") return "loading";
  if (input.status === "error") return "unknown";
  if (!input.known || !input.facts || !input.facts.isMember) return "unknown";
  const f = input.facts;
  const ok =
    need === "interviews"
      ? canOpenInterviewCases(f)
      : need === "workforce"
        ? f.ownerOrAdmin || f.readableUseCases.includes("workforce")
        : need === "recruitment"
          ? f.ownerOrAdmin ||
            f.readableUseCases.includes("recruitment") ||
            f.responsibleJobIds.length > 0
          : canReadReports(f);
  return ok ? "allowed" : "none";
}

/** Whether the caller may read the recruitment results of ONE vacancy. */
export function canReadVacancyResults(
  f: ReportAccessFacts,
  jobId: string | null | undefined,
): boolean {
  if (!f.isMember) return false;
  if (f.ownerOrAdmin || f.readableUseCases.includes("recruitment")) return true;
  return jobId != null && f.responsibleJobIds.includes(jobId);
}

/** True when a PostgREST / Postgres error means "this function does not exist (yet)". */
export function isMissingFunctionError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  return (
    code === "PGRST202" ||
    code === "42883" ||
    /could not find the function|function .* does not exist/i.test(message)
  );
}
