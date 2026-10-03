/**
 * Employer report-access negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * employer-report-access:check asserts that the screens tell an ordinary member
 * the truth (no access, not "nothing here"), that only a CONFIRMED answer from
 * the database withholds anything, that the browser holds no copy of "owner or
 * admin", and that the two refusals of a suspended person reach them as
 * sentences. None of its assertions proves it would NOTICE if one of those
 * stopped being true. Each mutation below introduces exactly one of those
 * defects, in the real file, in the shape a careless edit would produce, and
 * requires the guard to fail with a named diagnostic.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:employer-report-access
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "employer-report-access:check";

const LIB = "src/lib/security-competency/report-access.ts";
const FN = "src/lib/security-competency/report-access.functions.ts";
const UI = "src/components/employer/ReportAccess.tsx";
const WORKSPACE = "src/components/academy/AcademyWorkspace.tsx";
const OVERVIEW = "src/components/academy/AcademyOverview.tsx";
const RESULTS_ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.assessments.results.$attemptId.tsx";
const DASH = "src/routes/_authenticated.employer.$employerSlug.index.tsx";
const II_INDEX =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx";
const WF_INDEX = "src/routes/_authenticated.employer.$employerSlug.workforce.index.tsx";
const PANEL = "src/components/academy/ApplicationAssessmentPanel.tsx";
const APP_PAGE = "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx";
const ARQ = "src/lib/job-intelligence/access-request-errors.ts";
const ONBOARDING = "src/lib/job-intelligence/employer-onboarding.functions.ts";
const JOIN = "src/routes/_authenticated.employer.join.tsx";
const TEAM = "src/components/employer/EmployerTeamPanel.tsx";
const DICT = "src/i18n/dictionaries.ts";
const MIGRATION = "supabase/migrations/20270203090000_employer_report_access_model.sql";

const MUTATIONS: readonly Mutation[] = [
  /* ---- 1 · the decision ------------------------------------------- */
  {
    id: "RA-FAILED-READ-BECOMES-NONE",
    defect:
      "a call that failed is treated as 'no access', so a network error tells a recruiter they may not see their own candidates",
    file: LIB,
    find: '  if (input.status === "error") return "unknown";',
    replace: '  if (input.status === "error") return "none";',
    guard: GUARD,
    expect: "a call that failed is `unknown`, never `none`",
  },
  {
    id: "RA-NON-MEMBER-BECOMES-NONE",
    defect:
      "a caller the database does not know as a member is told they have no access, a statement about a person nothing established",
    file: LIB,
    find: '  if (!input.known || !input.facts || !input.facts.isMember) return "unknown";',
    replace: '  if (!input.known || !input.facts) return "unknown";',
    guard: GUARD,
    expect: "a caller the database does not know as a member is `unknown`",
  },
  {
    id: "RA-EVERYONE-ALLOWED",
    defect: "the decision never withholds, so an ordinary member meets the empty list again",
    file: LIB,
    find: '  return ok ? "allowed" : "none";',
    replace: '  return "allowed";',
    guard: GUARD,
    expect: "an ordinary member, with no basis at all, is `none` for every need",
  },
  {
    id: "RA-ANY-GRANT-READS-RECRUITMENT",
    defect:
      "a reviewer grant for ANY use case opens the recruitment screens, so a workforce reviewer is offered candidates they cannot read",
    file: LIB,
    find: '            f.readableUseCases.includes("recruitment") ||\n',
    replace: "            f.readableUseCases.length > 0 ||\n",
    guard: GUARD,
    expect: "a workforce reviewer reads workforce results and nothing of recruitment or interviews",
  },
  {
    id: "RA-INTERVIEWS-FROM-RESULTS",
    defect:
      "interview access is inferred from result access instead of the database's own case answer, so a workforce reviewer is offered interviews that do not exist for them",
    file: LIB,
    find: "  return f.isMember && (f.ownerOrAdmin || f.caseAccess);",
    replace: "  return f.isMember && (f.ownerOrAdmin || f.caseAccess || canReadReports(f));",
    guard: GUARD,
    expect: "a workforce reviewer reads workforce results and nothing of recruitment or interviews",
  },
  {
    id: "RA-RECRUITER-READS-EVERY-VACANCY",
    defect:
      "a vacancy's responsible recruiter is told they may read every vacancy's results, so the panel of another vacancy claims access that is refused",
    file: LIB,
    find: "  return jobId != null && f.responsibleJobIds.includes(jobId);",
    replace: "  return f.responsibleJobIds.length > 0;",
    guard: GUARD,
    expect: "one vacancy at a time",
  },
  {
    id: "RA-BROWSER-COMPARES-ROLE",
    defect:
      "the browser starts deciding on a role of its own, a second copy of 'owner or admin' that will drift from the database's",
    file: LIB,
    find: "  if (!f.isMember) return false;\n  if (f.ownerOrAdmin ||",
    replace:
      '  if ((f as { role?: string }).role === "owner") return true;\n  if (!f.isMember) return false;\n  if (f.ownerOrAdmin ||',
    guard: GUARD,
    expect:
      "none of the three files compares a role, reads a membership, or names the role helpers",
  },

  /* ---- 2 · the call ----------------------------------------------- */
  {
    id: "RA-MISSING-FUNCTION-IS-ERROR",
    defect:
      "a database without the function (the migration not applied) now makes every employer screen fail instead of behaving as before",
    file: FN,
    find: "      if (isMissingFunctionError(error)) return { known: false, facts: null };",
    replace:
      '      if (isMissingFunctionError(error)) throw new Error("Could not load your access to results.");',
    guard: GUARD,
    expect: "a missing function is `known: false`, not an error",
  },
  {
    id: "RA-SECOND-CALL-SITE",
    defect:
      "another file starts naming the function, so the decision is no longer made in one place",
    file: UI,
    find: '    queryKey: ["employer", employerId, "report-access"],',
    replace: '    queryKey: ["employer", employerId, "report-access", "employer_report_access"],',
    guard: GUARD,
    expect: "the call is made in one place only",
  },
  {
    id: "RA-WRAPPER-WITHHOLDS-ON-UNKNOWN",
    defect:
      "the wrapper withholds the screen whenever access is not CONFIRMED, so before the migration every member meets the notice",
    file: UI,
    find: '  if (state === "none") return <ReportAccessNotice need={need} />;',
    replace: '  if (state !== "allowed") return <ReportAccessNotice need={need} />;',
    guard: GUARD,
    expect: "the wrapper withholds ONLY on a confirmed `none`",
  },
  {
    id: "RA-FAILED-READ-IS-LOADING",
    defect: "a failed read is shown as 'still loading', forever",
    file: UI,
    find: '  const input: ReportAccessInput = query.isError\n    ? { status: "error" }',
    replace: '  const input: ReportAccessInput = query.isError\n    ? { status: "pending" }',
    guard: GUARD,
    expect: "a failed read is `error` (so `unknown`)",
  },

  /* ---- 3 · the screens -------------------------------------------- */
  {
    id: "RA-WORKSPACE-DOES-NOT-REQUIRE",
    defect: "the workspace frame stops asking, so every page declares a need that nothing enforces",
    file: WORKSPACE,
    find: "<ReportsRequired employerId={workspace.employerId} need={requires}>",
    replace: "<ReportsRequired employerId={workspace.employerId}>",
    guard: GUARD,
    expect: "the assessment, review and training workspaces thread a `requires` to the wrapper",
  },
  {
    id: "RA-RESULTS-PAGE-DOES-NOT-DECLARE",
    defect:
      "the report page stops declaring that it shows results, so a member meets a failed read",
    file: RESULTS_ROUTE,
    find: '<AcademyPage employerSlug={employerSlug} requires="reports">',
    replace: "<AcademyPage employerSlug={employerSlug}>",
    guard: GUARD,
    expect: "the pages that show results declare what they need",
  },
  {
    id: "RA-OVERVIEW-TODO-STAYS",
    defect: "the to-do list stays visible beside the notice, counting work the member cannot see",
    file: OVERVIEW,
    find: "        hidden={noAccess}\n",
    replace: "",
    guard: GUARD,
    expect: "the assessments overview replaces its four tiles and its to-do with the notice",
  },
  {
    id: "RA-DASHBOARD-ZEROS",
    defect:
      "the dashboard draws its zeros under a notice, so 'you may not see this' and '0' are said together",
    file: DASH,
    find: "      {stats && !withheld && (",
    replace: "      {stats && (",
    guard: GUARD,
    expect: "the dashboard replaces the three cards that count results, assessments and interviews",
  },
  {
    id: "RA-INTERVIEW-LIST-STAYS",
    defect: "the interview list stays on the page under the notice, saying 'no interviews'",
    file: II_INDEX,
    find: '<section className="mt-8" aria-labelledby="ii-cases-heading" hidden={noCases}>',
    replace: '<section className="mt-8" aria-labelledby="ii-cases-heading">',
    guard: GUARD,
    expect: "the interview overview and the reports overview say there is no interview to open",
  },
  {
    id: "RA-DIRECTORY-SAYS-ASSIGN",
    defect:
      "the workforce directory offers 'assign' next to every colleague, as if no assessment were in flight, to a member who may not read them",
    file: WF_INDEX,
    find: "                      if (noAssessmentAccess) return null;\n",
    replace: "",
    guard: GUARD,
    expect: "the workforce directory withholds the per-person assessment action",
  },
  {
    id: "RA-PANEL-SAYS-NOTHING-SENT",
    defect:
      "a candidate's panel says 'no assessment has been sent' to a member who is not allowed to know, a statement about the candidate nobody checked",
    file: PANEL,
    find: "      ) : cannotReadResults ? (",
    replace: "      ) : false ? (",
    guard: GUARD,
    expect:
      "the candidate's assessment panel names the access instead of 'no assessment has been sent'",
  },
  {
    id: "RA-STRIP-READS-AS-FAILED",
    defect:
      "a confirmed lack of access is drawn as a technical failure ('could not be read, try again') instead of 'you are not authorised to see this'",
    file: APP_PAGE,
    find: '    refused && read !== "loading" ? "refused" : read;',
    replace: '    refused && read !== "loading" ? "failed" : read;',
    guard: GUARD,
    expect: "the candidate's process strip reports a CONFIRMED lack of access as `refused`",
  },

  /* ---- 4 · the copy ----------------------------------------------- */
  {
    id: "RA-COPY-SAYS-EMPTY",
    defect:
      "the Swedish notice says there are no results instead of that the list is not theirs to see",
    file: DICT,
    find: 'Listan är inte tom — du har bara inte rätt att se den. Inget är fel på ditt konto.",\n    "reportAccess.workforce.title"',
    replace:
      'Det finns inga resultat. Inget är fel på ditt konto.",\n    "reportAccess.workforce.title"',
    guard: GUARD,
    expect: "the two list notices say the list is NOT EMPTY",
  },

  /* ---- 5 · suspension --------------------------------------------- */
  {
    id: "RA-BLOCKED-CODE-DROPPED",
    defect:
      "the request server function swallows the 'blocked' code again, so a suspended person is told to try again",
    file: ONBOARDING,
    find: "        throw new Error(ACCESS_REQUEST_MEMBERSHIP_BLOCKED);",
    replace: '        throw new Error("Could not submit the access request. Please try again.");',
    guard: GUARD,
    expect: "the request server function carries the 'blocked' code through instead of 'try again'",
  },
  {
    id: "RA-JOIN-SAYS-TRY-AGAIN",
    defect: "the join page says 'try again' to a person whose access was suspended or ended",
    file: JOIN,
    find: '              ? t("employer.join.blocked")',
    replace: '              ? t("employer.join.error")',
    guard: GUARD,
    expect: "the join page says the access was suspended or ended and not to retry",
  },
  {
    id: "RA-TEAM-SAYS-COULD-NOT-CHANGE",
    defect:
      "the approval queue says 'the authorisation could not be changed' when approving is refused for a suspended person, which invites the same click again",
    file: TEAM,
    find: '            ? t("employer.team.requests.reactivationRefused")',
    replace: '            ? t("employer.team.actionError")',
    guard: GUARD,
    expect: "the join page says the access was suspended or ended and not to retry",
  },
  {
    id: "RA-REFUSAL-NOT-RECOGNISED",
    defect:
      "the approval refusal is no longer recognised, so it reaches the owner as a generic failure",
    file: ARQ,
    find: '  if (message.includes(ACCESS_REQUEST_REACTIVATION_REFUSED)) return "reactivationRefused";',
    replace: '  if (message.includes("never matches this wording")) return "reactivationRefused";',
    guard: GUARD,
    expect: "a refusal is recognised in an Error, a bare string and a server-function wrapper",
  },

  /* ---- 6 · the contract ------------------------------------------- */
  {
    id: "RA-COLUMN-RENAMED",
    defect:
      "the database function renames a column the application reads, so every caller would be read as having no case access",
    file: MIGRATION,
    find: "responsible_job_ids uuid[], case_access boolean)",
    replace: "responsible_job_ids uuid[], case_open boolean)",
    guard: GUARD,
    expect:
      "returns exactly is_member, owner_or_admin, readable_use_cases, responsible_job_ids, case_access",
  },
  {
    id: "RA-FUNCTION-GRANTED-TO-ANON",
    defect: "the facts function becomes executable by logged-out callers",
    file: MIGRATION,
    find: "GRANT EXECUTE ON FUNCTION public.employer_report_access(uuid) TO authenticated;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.employer_report_access(uuid) TO authenticated, anon;",
    guard: GUARD,
    expect: "the function is executable by `authenticated` only, never by `anon`",
  },
];

runControls("employer-report-access", MUTATIONS);
