/**
 * The employer lifecycle guard — phases 2 and 3.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────
 *
 * The 2026-09-22 audit found the employer product to be a strong recruitment
 * half joined to an unbuilt second half. Phase 1's properties belong to the
 * process spine and live in employer-process-continuity:check. This file owns
 * the other two:
 *
 *   JOB      a vacancy summarises its own pipeline, every count lands on the
 *            rows it counted, and a read that failed is never a zero.
 *
 *   EMPLOYEE one colleague's page shows that colleague's own development, the
 *            role's requirements without judging the person, and carries the
 *            person through to an assignment -- with no subject reference
 *            anywhere on the wire.
 *
 * plus the two rules the Product Owner set alongside them: an employment
 * record waits for an approved organisation, and a completed programme is
 * never called verified competence.
 *
 * ── HOW IT ASSERTS ──────────────────────────────────────────────────────
 *
 * Behaviour first: the two pure projections are RUN over their state spaces
 * and the answers are checked. Where a property is about what a file may
 * contain -- a boundary, a vocabulary, an identifier that must not be on the
 * wire -- it reads the source, and says so.
 *
 * Deterministic, offline, credential-free. Run: bun run employer-lifecycle:check
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

// The router is mocked before anything imports it, exactly as the E1 guard
// does: `hash` is rendered into the href rather than spread onto the anchor,
// or an assertion about where a link goes would be testing the wrong string.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    hash,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    if (search && typeof search === "object") {
      const q = Object.entries(search as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("&");
      if (q) href += `?${q}`;
    }
    if (hash) href += `#${String(hash)}`;
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
  useRouter: () => ({ navigate: () => {}, history: { back: () => {} } }),
  useNavigate: () => () => {},
  useSearch: () => ({}),
  useParams: () => ({}),
  redirect: () => {
    throw new Error("redirect");
  },
  notFound: () => new Error("notFound"),
  isNotFound: () => false,
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const JP = await import("../src/lib/employer-continuity/job-pipeline");
const CS = await import("../src/lib/interview-intelligence/case-stage");

const root = process.cwd();
let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
  }
}

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Source with comments stripped, for assertions about what a file DOES.
 *  A rule that a comment can satisfy is a rule about prose.
 *
 *  ── THE ORDER MATTERS, AND IT COST AN HOUR ─────────────────────────────
 *
 *  WHOLE LINE COMMENTS GO FIRST. Several files in this repository have a `/*`
 *  inside a `//` line -- a path, an example, a sketch of a block comment -- and
 *  stripping block comments first treats that as an opener and swallows
 *  everything up to the next `*\/`. On the workforce page that was nine
 *  thousand characters of real code, and every assertion over it passed,
 *  because the strings they were looking for were gone along with the code: a
 *  guard reading an empty string cannot fail. It was found by writing an
 *  assertion that should have passed and did not.
 *
 *  Block comments come second, and trailing line comments last. `[^:]` keeps
 *  `https://` intact. */
const codeOnly = (source: string) =>
  source
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const FILES = {
  jobPipeline: "src/lib/employer-continuity/job-pipeline.ts",
  openAssessments: "src/lib/employer-continuity/open-assessments.ts",
  caseStage: "src/lib/interview-intelligence/case-stage.ts",
  jobHub: "src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.index.tsx",
  applications: "src/routes/_authenticated.employer.$employerSlug.applications.index.tsx",
  overview: "src/routes/_authenticated.employer.$employerSlug.index.tsx",
  iiIndex: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx",
  person: "src/routes/_authenticated.employer.$employerSlug.workforce.$personId.tsx",
  workforce: "src/routes/_authenticated.employer.$employerSlug.workforce.index.tsx",
  trainingParticipants:
    "src/routes/_authenticated.employer.$employerSlug.training.participants.tsx",
  trainingProgrammes: "src/routes/_authenticated.employer.$employerSlug.training.programmes.tsx",
  library: "src/components/academy/ContentLibrary.tsx",
  employeeDev: "src/lib/security-competency/employee-development.functions.ts",
  academyEmployer: "src/lib/security-competency/academy-employer.functions.ts",
  lifecycleFns: "src/lib/security-competency/assessment-lifecycle.functions.ts",
  workforceFns: "src/lib/job-intelligence/employer-workforce.functions.ts",
  runtime: "src/lib/interview-intelligence/runtime.functions.ts",
  shell: "src/components/employer/EmployerAppShell.tsx",
  workforceMigration: "supabase/migrations/20261205090000_employer_workforce_active_only.sql",
  trainingMigration:
    "supabase/migrations/20261206090000_scp_training_assignment_person_context.sql",
};

const APP = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Row = { id: string; status: "submitted" | "reviewing" | "interview" | "hired" | "rejected" };

function pipeline(
  over: Partial<Parameters<typeof JP.projectJobPipeline>[0]> = {},
): ReturnType<typeof JP.projectJobPipeline> {
  return JP.projectJobPipeline({
    jobStatus: "published",
    applicationsRead: "ready",
    applications: [],
    assessmentRead: "ready",
    applicationsWithOpenAssessment: new Set<string>(),
    ...over,
  });
}

console.log("employer lifecycle — phases 2 and 3\n");

/* ================================================================== */
/* 1 · The job's counts are counts, and they are right                  */
/* ================================================================== */
{
  const rows: Row[] = [
    { id: APP(1), status: "submitted" },
    { id: APP(2), status: "submitted" },
    { id: APP(3), status: "reviewing" },
    { id: APP(4), status: "interview" },
    { id: APP(5), status: "hired" },
    { id: APP(6), status: "rejected" },
  ];
  const p = pipeline({
    applications: rows,
    applicationsWithOpenAssessment: new Set([APP(3), APP(4)]),
  });

  ok(p.counts.total.value === 6, "1 · the total counts every application the job received");
  ok(p.counts.awaitingReview.value === 2, "1 · awaiting review counts `submitted`");
  ok(p.counts.interview.value === 1, "1 · the interview count is the interview stage");
  ok(p.counts.hired.value === 1, "1 · and the hired count is the recorded hires");
  ok(p.counts.assessmentOpen.value === 2, "1 · the assessment count is this job's own rows");

  // A closed outcome is part of the total and of nothing else: the vacancy
  // received it, and it is not work in flight.
  ok(
    (p.counts.awaitingReview.value ?? 0) +
      (p.counts.interview.value ?? 0) +
      (p.counts.hired.value ?? 0) <
      (p.counts.total.value ?? 0),
    "1 · a closed outcome is in the total and in no stage",
  );

  // The assessment set is employer-wide; the count must not pick up another
  // vacancy's candidate who happens to be in it.
  const other = pipeline({
    applications: [{ id: APP(1), status: "reviewing" }],
    applicationsWithOpenAssessment: new Set([APP(1), APP(99)]),
  });
  ok(
    other.counts.assessmentOpen.value === 1,
    "1 · and never another vacancy's candidate from the same employer-wide read",
  );
}

/* ================================================================== */
/* 2 · A read that failed is never a zero                               */
/* ================================================================== */
{
  for (const r of ["loading", "failed"] as const) {
    const p = pipeline({
      applicationsRead: r,
      applications: [{ id: APP(1), status: "submitted" }],
    });
    let clean = true;
    for (const c of Object.values(p.counts)) if (c.value !== null) clean = false;
    ok(clean, `2 · an applications read that is "${r}" yields no number at all`);
    ok(
      p.nextAction.kind === (r === "loading" ? "loading" : "unavailable"),
      `2 · and proposes no action from a "${r}" read`,
    );
  }

  // The two reads fail independently. A broken assessment read must cost ONE
  // number, not the other four -- that is the whole reason they are separate.
  const half = pipeline({
    applications: [
      { id: APP(1), status: "submitted" },
      { id: APP(2), status: "hired" },
    ],
    assessmentRead: "failed",
  });
  ok(half.counts.total.value === 2, "2 · a failed assessment read leaves the total intact");
  ok(half.counts.awaitingReview.value === 1, "2 · and the stage counts intact");
  ok(half.counts.assessmentOpen.value === null, "2 · while the assessment number is unknown");
  ok(
    half.counts.assessmentOpen.read === "failed",
    "2 · and says the read failed rather than showing nothing",
  );
  // And it never becomes the basis of an action.
  ok(
    half.nextAction.kind !== "awaitAssessments",
    "2 · an unknown assessment count proposes no assessment action",
  );

  // THE SHAPE OF THE TYPE, not just the behaviour: there must be no way to
  // express "zero, because something broke".
  const src = codeOnly(read(FILES.jobPipeline));
  ok(
    src.includes('value: read === "ready" ? value : null'),
    "2 · the count constructor cannot produce a number from a failed read",
  );

  // The page must have an error branch of its own, not an empty state.
  const hub = codeOnly(read(FILES.jobHub));
  // The BRANCH, not the identifier: `applicationsQuery.isError` also appears
  // where the read state is derived, so testing for the name alone passed
  // with the branch replaced by `false` -- which the control proved.
  ok(
    /\) : applicationsQuery\.isError \? \(/.test(hub),
    "2 · the job page distinguishes a failed read from an empty one",
  );
  ok(
    /employer\.jobHub\.candidates\.loadFailed/.test(hub),
    "2 · and says so in words rather than showing the empty state",
  );
}

/* ================================================================== */
/* 3 · The next action is operational, and ordered by who is waiting     */
/* ================================================================== */
{
  const waiting = pipeline({
    applications: [
      { id: APP(1), status: "submitted" },
      { id: APP(2), status: "interview" },
    ],
    applicationsWithOpenAssessment: new Set([APP(2)]),
  });
  ok(
    waiting.nextAction.kind === "reviewNewApplications",
    "3 · an unopened application outranks everything else",
  );

  const interviewing = pipeline({
    applications: [{ id: APP(2), status: "interview" }],
    applicationsWithOpenAssessment: new Set([APP(2)]),
  });
  ok(
    interviewing.nextAction.kind === "prepareInterviews",
    "3 · work the employer owes outranks work they are waiting for",
  );

  const assessing = pipeline({
    applications: [{ id: APP(3), status: "reviewing" }],
    applicationsWithOpenAssessment: new Set([APP(3)]),
  });
  ok(assessing.nextAction.kind === "awaitAssessments", "3 · waiting on a candidate is said last");
  ok(assessing.nextAction.stage === "assessmentOpen", "3 · and lands on those candidates");

  ok(
    pipeline({ jobStatus: "published" }).nextAction.kind === "noApplicationsYet",
    "3 · a live advertisement with nobody in it says so",
  );
  ok(
    pipeline({ jobStatus: "draft" }).nextAction.kind === "notPublished",
    "3 · and a draft says the different thing that is true of it",
  );

  // Vocabulary: nothing here may express an opinion about the applicants.
  const src = read(FILES.jobPipeline);
  const union = src.slice(
    src.indexOf("export type JobNextActionKind"),
    src.indexOf("export interface JobNextAction"),
  );
  const members = [...union.matchAll(/^\s*\|\s*"([a-zA-Z]+)"/gm)].map((m) => m[1]);
  ok(members.length >= 8, "3 · the job action union is enumerated");
  for (const forbidden of [
    "recommend",
    "suitab",
    "rank",
    "score",
    "shortlist",
    "strong",
    "quality",
    "best",
  ]) {
    ok(
      !members.some((m) => m.toLowerCase().includes(forbidden)),
      `3 · no job action mentions "${forbidden}"`,
    );
  }
  for (const m of members) {
    for (const suffix of ["", ".one", ".other"]) {
      const key = `employer.jobHub.next.${m}${suffix}`;
      if (!(key in sv)) continue;
      const text = `${sv[key]} ${en[key] ?? ""}`.toLowerCase();
      ok(
        !/rekommend|lämplig|bäst|recommend|suitab|\bbest\b|\bstrong\b|\bquality\b|poäng|\bscore\b/.test(
          text,
        ),
        `3 · "${key}" copy judges nobody`,
      );
    }
  }
}

/* ================================================================== */
/* 4 · Every count lands on exactly the rows it counted                 */
/* ================================================================== */
{
  const hub = codeOnly(read(FILES.jobHub));
  // One table of search parameters, read by both the cards and the action, so
  // the number and the list it opens cannot be filtered differently.
  ok(hub.includes("const PIPELINE_SEARCH"), "4 · one table of destinations exists");
  const searchTable = hub.slice(
    hub.indexOf("const PIPELINE_SEARCH"),
    hub.indexOf("const PIPELINE_CARDS"),
  );
  for (const [stage, expected] of [
    ["awaitingReview", 'status: "submitted"'],
    ["interview", 'status: "interview"'],
    ["hired", 'status: "hired"'],
    ["assessmentOpen", 'assessment: "open"'],
  ] as const) {
    ok(searchTable.includes(expected), `4 · the ${stage} card filters by ${expected}`);
  }
  ok(
    /search=\{\{ job: jobId, \.\.\.search \}\}/.test(hub),
    "4 · and every card carries this vacancy",
  );

  // The destination must actually accept those parameters.
  const list = codeOnly(read(FILES.applications));
  ok(list.includes("assessment: z.enum(ASSESSMENT_FILTERS)"), "4 · the list accepts the filter");
  // Applied in the predicate, not merely declared above it: the control
  // removed it from the return and this assertion went on passing.
  ok(
    /return jobMatches && statusMatches && assessmentMatches && textMatches;/.test(list),
    "4 · and applies it to the rows",
  );
  // Withheld rather than guessed while the pair of reads is unresolved.
  ok(
    /openAssessments\.read === "ready" && openAssessments\.ids\.has/.test(list),
    "4 · a filter whose read has not answered matches nothing rather than everything",
  );

  // THE ASSESSMENT FILTER IS A PROCESS FILTER. A value that filtered by what
  // an assessment FOUND would make the applications list a ranking.
  const filters = list.slice(
    list.indexOf("const ASSESSMENT_FILTERS"),
    list.indexOf("const searchSchema"),
  );
  ok(/\["open"\]/.test(filters), "4 · the assessment filter has exactly one, process-only value");

  // And "open" means a process that has not finished, never a verdict.
  const jp = codeOnly(read(FILES.jobPipeline));
  for (const forbidden of ["score", "passed", "failed_assessment", "maturity", "band"]) {
    ok(!jp.includes(forbidden), `4 · the pipeline reads no ${forbidden}`);
  }
}

/* ================================================================== */
/* 5 · One stage table, so a count and its list cannot drift             */
/* ================================================================== */
{
  // The Overview's interview rows link filtered; the index filters with the
  // same table the counter counted with.
  const runtime = codeOnly(read(FILES.runtime));
  // EVERY field, not the presence of the import: one field reverted to an
  // inline status list while the others still used the table, and testing for
  // `caseIsInStage` anywhere in the file passed -- which the control proved.
  for (const field of [
    "inPreparation",
    "awaitingPlanApproval",
    "readyToInterview",
    "inEvidenceReview",
    "awaitingReport",
  ]) {
    ok(
      runtime.includes(`${field}: count("${field}")`),
      `5 · the ${field} count goes through the shared stage table`,
    );
  }
  ok(runtime.includes('reported: count("done")'), "5 · and so does the reported count");
  ok(
    !/\[\s*"draft",\s*"sources_ready"\s*\]/.test(runtime),
    "5 · and the counter carries no copy of the statuses",
  );

  const index = codeOnly(read(FILES.iiIndex));
  ok(index.includes("caseIsInStage(c.status, stage)"), "5 · the list filters with the same table");

  const overview = codeOnly(read(FILES.overview));
  for (const stage of [
    "awaitingPlanApproval",
    "readyToInterview",
    "inEvidenceReview",
    "awaitingReport",
  ]) {
    ok(
      overview.includes(`stage: "${stage}" as const`),
      `5 · the ${stage} row lands on those interviews`,
    );
  }
  // Every interview destination in the work list carries a stage. Counted
  // rather than pattern-matched on absence: four rows, four stages.
  {
    const interviewLinks = [
      ...overview.matchAll(/to: "\/employer\/\$employerSlug\/interview-intelligence"/g),
    ].length;
    const stagedLinks = [...overview.matchAll(/stage: "[a-zA-Z]+" as const/g)].length;
    ok(interviewLinks > 0 && stagedLinks >= 4, "5 · every interview work-list row carries a stage");
  }

  // Behaviour: the stages partition the work, and `active` excludes a
  // finalised report.
  ok(CS.caseIsInStage("assessed", "awaitingReport"), "5 · assessed is a report to finalise");
  ok(CS.caseIsInStage("assessed", "active"), "5 · and is still active work");
  ok(!CS.caseIsInStage("reported", "active"), "5 · a finalised report is not active");
  ok(CS.caseIsInStage("reported", "done"), "5 · it is done");
  ok(CS.asCaseStage("not-a-stage") === null, "5 · an unknown stage from a URL resolves to null");

  // The summary numbers describe the organisation, not the filter.
  ok(
    index.includes("const active = allCases.filter"),
    "5 · the summary counters ignore the stage filter",
  );
}

/* ================================================================== */
/* 6 · The bound interview is the default                               */
/* ================================================================== */
{
  const index = read(FILES.iiIndex);
  // The standalone entry stays reachable -- a standalone interview is
  // legitimate -- and stops looking like the primary path.
  ok(
    index.includes("/employer/$employerSlug/interview-intelligence/new"),
    "6 · the standalone form is still reachable",
  );
  ok(
    !/search=\{\{ applicationId: undefined, jobId: undefined \}\}\s*\n\s*className=\{BUTTON\}/.test(
      index,
    ),
    "6 · and is no longer the page's primary button",
  );
  ok(
    index.includes("iiu.ix.startFromCandidate"),
    "6 · the default path is named before the exception is offered",
  );
  for (const lang of [sv, en]) {
    const text = String(lang["iiu.ix.startFromCandidate"]).toLowerCase();
    ok(
      /kandidat|candidate/.test(text),
      "6 · and the sentence says an interview starts from the candidate",
    );
  }
}

/* ================================================================== */
/* 7 · Employee 360 shows THIS person, and resolves them server-side    */
/* ================================================================== */
{
  const fns = codeOnly(read(FILES.employeeDev));
  // Every entry point takes the employment record.
  for (const fn of [
    "getEmployeeCompetenceContext",
    "listEmployeeDevelopmentActivity",
    "assignDevelopmentProgrammeToEmployee",
  ]) {
    ok(fns.includes(fn), `7 · ${fn} exists`);
  }
  ok(
    fns.includes("employeeId: z.string().uuid()"),
    "7 · the employee is the identifier the browser passes",
  );
  ok(
    !/subjectId: z\.string\(\)\.uuid\(\)/.test(fns),
    "7 · and no entry point accepts a subject from the browser",
  );
  // The filter is by subject, resolved from the employment record, server-side.
  ok(
    fns.includes("String(r.subject_id) === employee.subjectId"),
    "7 · development activity is filtered to this person's own subject",
  );
  ok(
    fns.includes('return { state: "unlinked", rows: [] }'),
    "7 · and an unbound employment record says so rather than showing an empty list",
  );
  // No subject in anything returned.
  const returnedRow = fns.slice(
    fns.indexOf("export type EmployeeDevelopmentRow = {"),
    fns.indexOf("export type EmployeeDevelopmentActivity"),
  );
  ok(!/subjectId/.test(returnedRow), "7 · no returned development row carries a subject");

  // The competence section resolves the profession through the FOREIGN KEY,
  // never by comparing slugs across namespaces.
  ok(
    fns.includes('.from("cig_professions")') &&
      fns.includes('.eq("slug", employee.professionSlug)'),
    "7 · the profession is resolved through employees.cig_profession_slug",
  );
  // All THREE catalogue reads -- profession, requirements, competencies.
  // Counting matters: the control removed one and left two, and a single
  // `includes` went on passing.
  ok(
    [...fns.matchAll(/\.eq\("content_status", "published"\)/g)].length >= 3,
    "7 · and only published catalogue rows are read",
  );
  // No computed judgement about the person.
  for (const forbidden of ["readiness", "gapPercent", "gap_percent", "met:", "passRate", "score"]) {
    ok(!fns.includes(forbidden), `7 · the competence read computes no ${forbidden}`);
  }
  // Two honest empty states, not one blank heading.
  for (const state of ["noProfession", "professionNotPublished"]) {
    ok(fns.includes(state), `7 · "${state}" is a named answer`);
    ok(
      `employer.person.competence.${state}` in sv && `employer.person.competence.${state}` in en,
      `7 · and has copy in both languages`,
    );
  }
}

/* ================================================================== */
/* 8 · The person survives the handoff to an assignment                 */
/* ================================================================== */
{
  const person = codeOnly(read(FILES.person));
  ok(
    /to="\/employer\/\$employerSlug\/training\/programmes"[\s\S]{0,200}search=\{\{ employee: personId \}\}/.test(
      person,
    ),
    "8 · the assign action carries the employee",
  );
  const programmes = codeOnly(read(FILES.trainingProgrammes));
  ok(programmes.includes("employee: z.string().uuid()"), "8 · the library accepts it");
  ok(programmes.includes("employeeId={employee ?? null}"), "8 · and passes it to the catalogue");
  ok(
    programmes.includes("academy.assign.employee.backToPerson"),
    "8 · and the way back to the person is on the page",
  );

  const library = codeOnly(read(FILES.library));
  ok(
    library.includes("const boundToEmployee = isTraining && employeeId !== null"),
    "8 · the employee-bound path exists",
  );
  ok(library.includes("assignDevelopmentProgrammeToEmployee"), "8 · and is the one it uses");
  ok(
    library.includes("assign-bound-to-employee"),
    "8 · with no address field when the person came with the navigation",
  );

  const fns = codeOnly(read(FILES.employeeDev));
  ok(
    fns.includes("_employee_id: data.employeeId"),
    "8 · and the employee travels all the way into the database",
  );
  ok(
    fns.includes("_recipient_email: employee.email"),
    "8 · the recipient is read from the employment record, never from the browser",
  );
  // Every refusal keeps its own sentence.
  for (const reason of [
    "noEmailOnRecord",
    "noAccount",
    "notAuthorised",
    "programmeNotAssignable",
  ]) {
    ok(fns.includes(`"${reason}"`), `8 · "${reason}" is a named refusal`);
  }

  // The binding is what makes "assign, come back, see it" true. Asserted
  // against the migration that does it, so removing it breaks this guard.
  const migration = read(FILES.trainingMigration);
  ok(
    migration.includes("_employee_id        uuid DEFAULT NULL"),
    "8 · the RPC takes the employment record",
  );
  ok(
    /SET subject_id = _subject[\s\S]{0,400}e\.subject_id IS NULL/.test(migration),
    "8 · and binds it only when it carries no person",
  );
}

/* ================================================================== */
/* 9 · No subject reference reaches an employer's browser               */
/* ================================================================== */
{
  // The read models an employer surface receives.
  for (const [file, label] of [
    [FILES.academyEmployer, "the academy read models"],
    [FILES.lifecycleFns, "the assessment pipeline"],
    [FILES.employeeDev, "the employee read models"],
  ] as const) {
    const src = codeOnly(read(file));
    // A returned FIELD, not a server-side local: the former crosses the wire.
    ok(!/^\s+subjectId: (String\(|\(r\.|r\.)/m.test(src), `9 · ${label} return no subjectId field`);
  }

  const types = read(FILES.academyEmployer);
  for (const [type, label] of [
    ["ParticipantRow", "the participants list"],
    ["TrainingStatusRow", "the training status list"],
    ["ReportSnapshot", "a released report"],
    ["ApplicationAssessment", "the application's assessments"],
    ["InviteResult", "an invitation"],
  ] as const) {
    const start = types.indexOf(`export type ${type} = {`);
    const body = start < 0 ? "" : types.slice(start, types.indexOf("\n};", start));
    ok(start > 0 && !/^\s+subjectId/m.test(body), `9 · ${label} carries no subject`);
  }

  // And no employer surface renders one.
  for (const file of [
    FILES.trainingParticipants,
    FILES.person,
    FILES.workforce,
    FILES.jobHub,
    FILES.applications,
  ]) {
    ok(
      !/subjectId/.test(codeOnly(read(file))),
      `9 · ${file.split(".").slice(-2)[0]} holds no subject`,
    );
  }

  // The actions take a product-level identifier instead, and the resolution is
  // server-side.
  const academy = codeOnly(read(FILES.academyEmployer));
  ok(
    academy.includes("async function subjectOfEmployerAttempt"),
    "9 · an attempt resolves to a person server-side",
  );
  ok(
    academy.includes("async function subjectOfReport"),
    "9 · and so does a released report, through its own audience RPC",
  );
  ok(
    academy.includes("employerId: z.string().uuid(), attemptId: z.string().uuid()"),
    "9 · identity resolution takes the attempt",
  );
  // An attempt this organisation cannot see must answer exactly as a refusal
  // does, or the resolver becomes an oracle for whether it exists.
  ok(
    /if \(!subjectId\) return null;/.test(academy),
    "9 · an attempt outside the organisation resolves to the refusal answer",
  );
}

/* ================================================================== */
/* 10 · Training is never displayed as verified competence              */
/* ================================================================== */
{
  const person = read(FILES.person);
  ok(
    person.includes("employer.person.development.state.completed"),
    "10 · a finished programme has its own word",
  );
  for (const [lang, dict] of [
    ["sv", sv],
    ["en", en],
  ] as const) {
    const done = String(dict["employer.person.development.state.completed"]);
    ok(
      /genomfört|completed/i.test(done),
      `10 · the ${lang} word for a finished programme names the programme`,
    );
    ok(
      !/verifierad|styrkt|bekräftad|verified|proven|certified|competence met/i.test(done),
      `10 · and never claims competence (${lang}: "${done}")`,
    );
  }
  // The whole development vocabulary, both languages.
  const devKeys = Object.keys(sv).filter((k) => k.startsWith("employer.person.development."));
  ok(devKeys.length >= 8, "10 · the development vocabulary is enumerated");
  for (const k of devKeys) {
    ok(typeof en[k] === "string" && en[k].trim() !== "", `10 · ${k} exists in English`);
    // The lede is excluded because it DENIES the claim -- "är aldrig bevis på
    // styrkt kompetens" contains the words precisely in order to rule them
    // out, and it is asserted on its own below. Every other key must not
    // contain them at all.
    if (k.endsWith(".lede")) continue;
    const text = `${sv[k]} ${en[k]}`.toLowerCase();
    ok(
      !/styrkt kompetens|verifierad kompetens|verified competence|proves competence|competence verified/.test(
        text,
      ),
      `10 · ${k} does not present training as verified competence`,
    );
  }
  // The lede says the boundary out loud, in both languages.
  for (const dict of [sv, en]) {
    ok(
      /aldrig bevis|never evidence/i.test(String(dict["employer.person.development.lede"])),
      "10 · the section's own lede states the boundary",
    );
  }
}

/* ================================================================== */
/* 11 · An employment record waits for an approved organisation         */
/* ================================================================== */
{
  const fns = codeOnly(read(FILES.workforceFns));
  ok(
    fns.includes("assertActiveEmployerForWorkforceWrite"),
    "11 · creating an employee has its own gate",
  );
  ok(
    /createEmployerEmployee[\s\S]{0,600}assertActiveEmployerForWorkforceWrite/.test(fns),
    "11 · and create uses it",
  );
  {
    const gate = fns.slice(
      fns.indexOf("async function assertActiveEmployerForWorkforceWrite"),
      fns.indexOf("async function assertActiveMembership"),
    );
    ok(gate.includes('status !== "active"'), "11 · which accepts only an active organisation");
    // And says nothing about pending. The control widened the condition to
    // `!== "active" && !== "pending"` and the previous assertion, which only
    // looked for the first half, passed with a pending organisation admitted.
    ok(!gate.includes("pending"), "11 · and admits no organisation still under review");
  }
  // Reads and corrections are untouched: a suspension stops new work, it does
  // not destroy records.
  ok(
    /listEmployerEmployees[\s\S]{0,400}assertActiveMembership/.test(fns),
    "11 · reading the directory is unchanged",
  );
  ok(
    /updateEmployerEmployee[\s\S]{0,700}assertActiveMembership/.test(fns),
    "11 · and correcting a record is unchanged",
  );

  // The UI explains rather than offering work that would be refused.
  const page = codeOnly(read(FILES.workforce));
  ok(page.includes('const canAddWorkforce = status === "active"'), "11 · the page knows the rule");
  ok(page.includes("employer.workforce.notActive"), "11 · and says why the control is absent");

  // THE BOUNDARY ITSELF is in the database, for every role.
  const migration = read(FILES.workforceMigration);
  ok(
    migration.includes("public.employer_is_active_status(employer_id)"),
    "11 · the insert policy requires an approved organisation",
  );
  // THE CONDITION, not the message. The control disabled the branch and left
  // the RAISE in place, and an assertion about the error string passed while
  // service_role could create the record.
  ok(
    migration.includes("IF TG_TABLE_NAME = 'employees' AND _status <> 'active' THEN"),
    "11 · and the trigger refuses it for every Postgres role",
  );
  ok(
    migration.includes("EMPLOYER_NOT_ACTIVE_FOR_WORKFORCE"),
    "11 · with a reason an operator can act on",
  );
  ok(!/ON public\.jobs/.test(migration), "11 · while nothing in it touches job drafts");
}

/* ================================================================== */
/* 12 · Development, in the navigation                                  */
/* ================================================================== */
{
  ok(sv["employer.nav.training"] === "Utveckling", "12 · the Swedish navigation reads Utveckling");
  ok(en["employer.nav.training"] === "Development", "12 · and the English reads Development");
  ok(sv["training.overview.title"] === "Utveckling", "12 · the area heading agrees");
  ok(en["training.overview.title"] === "Development", "12 · in both languages");
  ok(
    sv["employer.overview.card.development.title"] === "Utveckling" &&
      en["employer.overview.card.development.title"] === "Development",
    "12 · and so does the Overview card",
  );
  // A presentation change and nothing else: the database concept is untouched.
  const fns = read(FILES.academyEmployer);
  ok(
    fns.includes("scp_employer_training_status") && fns.includes("scp_assign_training"),
    "12 · training is still training in the database",
  );
  ok(
    codeOnly(read(FILES.shell)).includes('to: "/employer/$employerSlug/training"'),
    "12 · and the route is unchanged, so every existing link still resolves",
  );
}

/* ================================================================== */

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
console.log(
  "\nOK: a vacancy summarises its own pipeline and every count lands on the rows it counted;",
);
console.log(
  "    a failed read is never a zero; one colleague's page shows that colleague and carries",
);
console.log(
  "    them into an assignment; no subject reaches a browser; training is never verified",
);
console.log("    competence; and an employment record waits for an approved organisation.");
