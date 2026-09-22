/**
 * Employer lifecycle negative controls — phases 2 and 3.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * employer-lifecycle:check makes 176 assertions and not one of them, on its
 * own, proves it would NOTICE if the property stopped holding. This repository
 * has already shipped a guard whose comment stripper silently swallowed nine
 * thousand characters of the file it was reading, so every assertion over that
 * file passed against an empty string -- found, in the end, by an assertion
 * that should have passed and did not. That is the failure mode these exist to
 * close.
 *
 * Each mutation below reintroduces exactly one of the defects the audit found
 * or the Product Owner ruled out, in the real file, in the shape a careless
 * edit would actually produce, and requires the guard to fail with a named
 * diagnostic.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:employer-lifecycle
 */

import { runControls, type Mutation } from "./runner";

const PIPELINE = "src/lib/employer-continuity/job-pipeline.ts";
const STAGE = "src/lib/interview-intelligence/case-stage.ts";
const JOB_HUB = "src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.index.tsx";
const APPLICATIONS = "src/routes/_authenticated.employer.$employerSlug.applications.index.tsx";
const OVERVIEW = "src/routes/_authenticated.employer.$employerSlug.index.tsx";
const II_INDEX =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx";
const PERSON = "src/routes/_authenticated.employer.$employerSlug.workforce.$personId.tsx";
const WORKFORCE = "src/routes/_authenticated.employer.$employerSlug.workforce.index.tsx";
const EMPLOYEE_FNS = "src/lib/security-competency/employee-development.functions.ts";
const ACADEMY_FNS = "src/lib/security-competency/academy-employer.functions.ts";
const WORKFORCE_FNS = "src/lib/job-intelligence/employer-workforce.functions.ts";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const DICT = "src/i18n/dictionaries.ts";
const WORKFORCE_MIGRATION =
  "supabase/migrations/20261205090000_employer_workforce_active_only.sql";
const TRAINING_MIGRATION =
  "supabase/migrations/20261206090000_scp_training_assignment_person_context.sql";

const G = "employer-lifecycle:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- A failed read becomes a zero -------------------------------- */
  {
    id: "EL-FAILED-READ-AS-ZERO",
    defect:
      "the count constructor starts returning a number whatever the read did, so a broken read renders as 'nobody has applied'",
    file: PIPELINE,
    find: '  return { read, value: read === "ready" ? value : null };',
    replace: "  return { read, value };",
    guard: G,
    expect: "the count constructor cannot produce a number from a failed read",
  },
  {
    id: "EL-FAILED-READ-PROPOSES-AN-ACTION",
    defect: "an action is proposed from a picture that could not be read",
    file: PIPELINE,
    find: `  if (counts.total.read === "failed" || counts.total.value === null) {
    return { kind: "unavailable", count: 0, stage: null };
  }`,
    replace: "  ",
    guard: G,
    expect: 'proposes no action from a "failed" read',
  },
  {
    id: "EL-ASSESSMENT-FAILURE-TAKES-THE-OTHER-COUNTS-WITH-IT",
    defect:
      "one broken read costs all five numbers, because the two reads are collapsed into one state",
    file: PIPELINE,
    find: "    total: count(r, rows.length),",
    replace: '    total: count(r === "ready" ? input.assessmentRead : r, rows.length),',
    guard: G,
    expect: "a failed assessment read leaves the total intact",
  },
  {
    id: "EL-JOB-PAGE-LOSES-ITS-ERROR-BRANCH",
    defect:
      "the candidate list goes back to rendering a failed read as the empty state under a live advertisement",
    file: JOB_HUB,
    find: "        ) : applicationsQuery.isError ? (",
    replace: "        ) : (false as boolean) ? (",
    guard: G,
    expect: "the job page distinguishes a failed read from an empty one",
  },

  /* ---- A count that does not land on its own rows ------------------- */
  {
    id: "EL-COUNT-OPENS-THE-WRONG-ROWS",
    defect: "the awaiting-review card opens every application instead of the ones it counted",
    file: JOB_HUB,
    find: '  awaitingReview: { status: "submitted" },',
    replace: "  awaitingReview: {},",
    guard: G,
    expect: 'the awaitingReview card filters by status: "submitted"',
  },
  {
    id: "EL-ASSESSMENT-FILTER-NOT-APPLIED",
    defect:
      "the applications list accepts the assessment filter and ignores it, so the number and the list disagree",
    file: APPLICATIONS,
    find: "      return jobMatches && statusMatches && assessmentMatches && textMatches;",
    replace: "      return jobMatches && statusMatches && textMatches;",
    guard: G,
    expect: "and applies it to the rows",
  },
  {
    id: "EL-FILTER-MATCHES-EVERYTHING-WHILE-UNREAD",
    defect:
      "a filter whose reads have not answered matches every row, so the list shows people who are not being assessed",
    file: APPLICATIONS,
    find: '        (openAssessments.read === "ready" && openAssessments.ids.has(r.id));',
    replace: "        openAssessments.ids.has(r.id) ||\n        openAssessments.read !== \"ready\";",
    guard: G,
    expect: "a filter whose read has not answered matches nothing rather than everything",
  },
  {
    id: "EL-INTERVIEW-ROW-LOSES-ITS-FILTER",
    defect:
      "an interview work-list row goes back to linking at the unfiltered index, so a count lands on every case the organisation has",
    file: OVERVIEW,
    find: '        search: { stage: "readyToInterview" as const },',
    replace: "",
    guard: G,
    expect: "every interview work-list row carries a stage",
  },

  /* ---- One stage table --------------------------------------------- */
  {
    id: "EL-COUNTER-KEEPS-ITS-OWN-STATUS-LIST",
    defect:
      "the workload counter goes back to its own copy of the statuses, so the number and the filtered list can drift apart",
    file: RUNTIME,
    find: "      inPreparation: count(\"inPreparation\"),",
    replace: "      inPreparation: cases.filter((c) =>\n        [\"draft\", \"sources_ready\"].includes(c.status),\n      ).length,",
    guard: G,
    expect: "the inPreparation count goes through the shared stage table",
  },
  {
    id: "EL-FINALISED-REPORT-COUNTED-AS-ACTIVE",
    defect: "a finalised report is counted as an interview still in flight",
    file: STAGE,
    find: '  done: ["reported"],',
    replace: '  done: [],',
    guard: G,
    expect: "it is done",
  },
  {
    id: "EL-SUMMARY-NARROWED-BY-THE-FILTER",
    defect:
      "the summary totals start reading the filtered rows, so narrowing the list makes the organisation's interviews appear to vanish",
    file: II_INDEX,
    find: '  const active = allCases.filter((c) => !["reported", "cancelled"].includes(c.status));',
    replace: '  const active = cases.filter((c) => !["reported", "cancelled"].includes(c.status));',
    guard: G,
    expect: "the summary counters ignore the stage filter",
  },

  /* ---- The job page judges the field -------------------------------- */
  {
    id: "EL-JOB-ACTION-JUDGES-THE-APPLICANTS",
    defect: "the vacancy's next action starts describing the quality of the field",
    file: PIPELINE,
    find: '  | "noApplicationsYet"',
    replace: '  | "noApplicationsYet"\n  | "strongFieldShortlistNow"',
    guard: G,
    expect: 'no job action mentions "strong"',
  },

  /* ---- The person is lost on the way -------------------------------- */
  {
    id: "EL-ASSIGN-LOSES-THE-PERSON",
    defect:
      "the assign action goes back to linking at the catalogue with nobody attached, so the employer re-types the colleague they were looking at",
    file: PERSON,
    find: "      search={{ employee: personId }}",
    replace: "      search={{ employee: undefined }}",
    guard: G,
    expect: "the assign action carries the employee",
  },
  {
    id: "EL-ASSIGNMENT-DOES-NOT-REACH-THE-DATABASE",
    defect:
      "the employee stops travelling into the RPC, so the employment record is never bound and the programme is invisible on the page it was assigned from",
    file: EMPLOYEE_FNS,
    find: "      _employee_id: data.employeeId,",
    replace: "      _employee_id: null,",
    guard: G,
    expect: "the employee travels all the way into the database",
  },
  {
    id: "EL-BINDING-REMOVED-FROM-THE-MIGRATION",
    defect:
      "the RPC stops binding the employment record, so an assignment attaches to a subject the record does not share",
    file: TRAINING_MIGRATION,
    find: "    UPDATE public.employees e\n       SET subject_id = _subject, updated_at = now()",
    replace: "    UPDATE public.employees e\n       SET updated_at = now()",
    guard: G,
    expect: "binds it only when it carries no person",
  },
  {
    id: "EL-RECIPIENT-COMES-FROM-THE-BROWSER",
    defect: "the recipient address is taken from the request instead of the employment record",
    file: EMPLOYEE_FNS,
    find: "      _recipient_email: employee.email,",
    replace: '      _recipient_email: "",',
    guard: G,
    expect: "the recipient is read from the employment record, never from the browser",
  },
  {
    id: "EL-DEVELOPMENT-NOT-FILTERED-TO-THE-PERSON",
    defect:
      "the employee's development section shows every assignment in the organisation again",
    file: EMPLOYEE_FNS,
    find: "      (r) => String(r.subject_id) === employee.subjectId,",
    replace: "      () => true,",
    guard: G,
    expect: "development activity is filtered to this person's own subject",
  },
  {
    id: "EL-UNBOUND-RECORD-SHOWS-AN-EMPTY-LIST",
    defect:
      "an employment record with no person bound to it renders as 'no development', which is a claim about the colleague",
    file: EMPLOYEE_FNS,
    find: '    if (!employee.subjectId) return { state: "unlinked", rows: [] };',
    replace: '    if (!employee.subjectId) return { state: "ready", rows: [] };',
    guard: G,
    expect: "an unbound employment record says so rather than showing an empty list",
  },

  /* ---- The competence section judges the person --------------------- */
  {
    id: "EL-COMPETENCE-COMPUTES-A-READINESS",
    defect: "the competence section starts computing how ready the person is for their role",
    file: EMPLOYEE_FNS,
    find: "      state: \"ready\",\n      professionSlug: String(profession.slug),",
    replace:
      "      readiness: requirements.length === 0 ? 0 : 100,\n      state: \"ready\",\n      professionSlug: String(profession.slug),",
    guard: G,
    expect: "the competence read computes no readiness",
  },
  {
    id: "EL-COMPETENCE-READS-UNPUBLISHED-CATALOGUE",
    defect: "unpublished catalogue content is shown to an employer as a requirement of the role",
    file: EMPLOYEE_FNS,
    find: '      .eq("slug", employee.professionSlug)\n      .eq("content_status", "published")',
    replace: '      .eq("slug", employee.professionSlug)',
    guard: G,
    expect: "only published catalogue rows are read",
  },

  /* ---- The subject reaches the browser again ------------------------ */
  {
    id: "EL-SUBJECT-BACK-ON-THE-PARTICIPANTS-ROW",
    defect: "the participants read model carries a subject reference to the browser again",
    file: ACADEMY_FNS,
    find: "export type ParticipantRow = {",
    replace: "export type ParticipantRow = {\n  subjectId: string;",
    guard: G,
    expect: "the participants list carries no subject",
  },
  {
    id: "EL-SUBJECT-BACK-IN-THE-REPORT-SNAPSHOT",
    defect: "a released report hands the employer's browser the subject behind it",
    file: ACADEMY_FNS,
    find: "export type ReportSnapshot = {\n  id: string;\n  attemptId: string;",
    replace: "export type ReportSnapshot = {\n  id: string;\n  attemptId: string;\n  subjectId: string;",
    guard: G,
    expect: "a released report carries no subject",
  },
  {
    id: "EL-IDENTITY-RESOLUTION-TAKES-A-SUBJECT-AGAIN",
    defect:
      "resolving who a participant is goes back to taking the subject from the browser rather than the attempt",
    file: ACADEMY_FNS,
    find: "    z.object({ employerId: z.string().uuid(), attemptId: z.string().uuid() }).parse(d),",
    replace: "    z.object({ employerId: z.string().uuid(), subjectId: z.string().uuid() }).parse(d),",
    guard: G,
    expect: "identity resolution takes the attempt",
  },
  {
    id: "EL-RESOLVER-BECOMES-AN-ORACLE",
    defect:
      "an attempt outside the organisation stops answering like a refusal, so the resolver reveals whether it exists",
    file: ACADEMY_FNS,
    find: "    if (!subjectId) return null;",
    replace: '    if (!subjectId) throw new Error("no such attempt for this employer");',
    guard: G,
    expect: "an attempt outside the organisation resolves to the refusal answer",
  },

  /* ---- Training becomes verified competence ------------------------- */
  {
    id: "EL-COMPLETED-PROGRAMME-CALLED-VERIFIED",
    defect: "a completed programme is displayed as verified competence",
    file: DICT,
    find: '    "employer.person.development.state.completed": "Programme completed",',
    replace: '    "employer.person.development.state.completed": "Competence verified",',
    guard: G,
    expect: "never claims competence",
  },
  {
    id: "EL-DEVELOPMENT-LEDE-DROPS-THE-BOUNDARY",
    defect:
      "the development section stops saying that a completed programme is not evidence of competence",
    file: DICT,
    find: "      \"Programmes assigned to this person, and how far they have got. A completed programme is a development activity and is never evidence of verified competence.\",",
    replace: '      "Programmes assigned to this person, and how far they have got.",',
    guard: G,
    expect: "the section's own lede states the boundary",
  },

  /* ---- An unapproved organisation creates a person ------------------ */
  {
    id: "EL-PENDING-ORG-CREATES-AN-EMPLOYEE",
    defect:
      "creating an employment record goes back to the gate that admits a pending organisation",
    file: WORKFORCE_FNS,
    find: "    await assertActiveEmployerForWorkforceWrite(ctx, data.employerId);",
    replace: "    await assertActiveMembership(ctx, data.employerId);",
    guard: G,
    expect: "and create uses it",
  },
  {
    id: "EL-WORKFORCE-GATE-ADMITS-PENDING",
    defect: "the workforce gate is loosened to accept a pending organisation",
    file: WORKFORCE_FNS,
    find: '  if (status !== "active") throw new Error("EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE");',
    replace:
      '  if (status !== "active" && status !== "pending")\n    throw new Error("EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE");',
    guard: G,
    expect: "which accepts only an active organisation",
  },
  {
    id: "EL-RLS-GATE-REMOVED",
    defect:
      "the database stops requiring an approved organisation, leaving only a server-side check a direct PostgREST call would miss",
    file: WORKFORCE_MIGRATION,
    find: "    AND public.employer_is_active_status(employer_id)\n    AND created_by = auth.uid()",
    replace: "    AND created_by = auth.uid()",
    guard: G,
    expect: "the insert policy requires an approved organisation",
  },
  {
    id: "EL-TRIGGER-GATE-REMOVED",
    defect:
      "the refusal is left to RLS alone, so service_role and any future import path can do what the product refuses",
    file: WORKFORCE_MIGRATION,
    find: "  IF TG_TABLE_NAME = 'employees' AND _status <> 'active' THEN",
    replace: "  IF FALSE THEN",
    guard: G,
    expect: "the trigger refuses it for every Postgres role",
  },
  {
    id: "EL-JOB-DRAFTS-CAUGHT-BY-THE-WORKFORCE-RULE",
    defect:
      "the workforce migration starts touching jobs, which would stop a pending organisation preparing an advertisement",
    file: WORKFORCE_MIGRATION,
    find: "DROP POLICY IF EXISTS \"employees_employer_insert\" ON public.employees;",
    replace:
      'DROP POLICY IF EXISTS "jobs_employer_insert_own" ON public.jobs;\nDROP POLICY IF EXISTS "employees_employer_insert" ON public.employees;',
    guard: G,
    expect: "while nothing in it touches job drafts",
  },
  {
    id: "EL-WORKFORCE-PAGE-OFFERS-REFUSED-WORK",
    defect:
      "the workforce page offers the add control to an organisation the database will refuse, with no explanation",
    file: WORKFORCE,
    find: '  const canAddWorkforce = status === "active";',
    replace: "  const canAddWorkforce = true;",
    guard: G,
    expect: "the page knows the rule",
  },

  /* ---- Terminology --------------------------------------------------- */
  {
    id: "EL-NAVIGATION-REVERTS",
    defect: "the People group goes back to reading as a course catalogue",
    file: DICT,
    find: '    "employer.nav.training": "Utveckling",',
    replace: '    "employer.nav.training": "Kompetensutveckling",',
    guard: G,
    expect: "the Swedish navigation reads Utveckling",
  },
  {
    id: "EL-RENAME-TOUCHES-THE-ROUTE",
    defect:
      "the presentation rename is taken into the route tree, breaking every existing link and bookmark",
    file: "src/components/employer/EmployerAppShell.tsx",
    find: '        to: "/employer/$employerSlug/training",',
    replace: '        to: "/employer/$employerSlug/workforce",',
    guard: G,
    expect: "the route is unchanged, so every existing link still resolves",
  },

  /* ---- The guard's own blind spot ------------------------------------ */
  {
    id: "EL-COMMENT-STRIPPER-GOES-BLIND",
    defect:
      "the comment stripper strips block comments first again, so a `/*` inside a `//` line swallows the file and every source assertion over it passes against nothing",
    file: "scripts/employer-lifecycle-check.tsx",
    find: `  source
    .split("\\n")
    .filter((l) => !/^\\s*\\/\\//.test(l))
    .join("\\n")
    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ")
    .replace(/(^|[^:])\\/\\/[^\\n]*/g, "$1 ");`,
    replace: `  source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, " ").replace(/(^|[^:])\\/\\/[^\\n]*/g, "$1 ");`,
    guard: G,
    expect: "the page knows the rule",
  },
];

await runControls("employer-lifecycle", MUTATIONS);
