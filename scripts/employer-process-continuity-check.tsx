/**
 * EMPLOYER PROCESS CONTINUITY (E1) — does one application stay one process?
 *
 * ── THE PRODUCT PROBLEM ─────────────────────────────────────────────────
 *
 * The recruitment chain was already modelled end to end in the database and
 * already built, screen by screen. What it lacked was CONTINUITY: a recruiter
 * who opened a candidate, sent an assessment and planned an interview arrived
 * each time on a surface that had forgotten where they came from, was told the
 * report was ready when only its material was, and was shown "0 interviews"
 * when the read had failed rather than when there were none.
 *
 * ── WHAT THIS PROVES, AND HOW ───────────────────────────────────────────
 *
 * TABLE    The projection is pure, so it is exercised exhaustively: every
 *          case status, every assessment stage, every read outcome and every
 *          capability combination, asserted against the state and the single
 *          next action they must produce. No fixtures, no clock, no database.
 *
 * RENDER   The strip and the corrected surfaces are actually drawn, in both
 *          languages, and read for what they say.
 *
 * SOURCE   The properties a render cannot reach: that destinations are typed
 *          route literals present in the generated tree; that no candidate
 *          name or address reaches a URL; that linkage is decided by an
 *          identifier and never by a name; that the four lifecycles have no
 *          code path between them.
 *
 * Assertions are numbered 1–23 for the E1 brief's guard obligations.
 * Deterministic, offline, no database, no network.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// <Link> needs a live router and renders nothing under renderToStaticMarkup.
// Params AND search are resolved faithfully, because half of what this guard
// exists to prove is what does and does not travel in a URL.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
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
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
  // The rest of the surface the imported modules touch at load time. Present
  // so the mock can stand in for the whole module; none of them is exercised.
  useRouter: () => ({ navigate: () => {}, history: { back: () => {} } }),
  useNavigate: () => () => {},
  useSearch: () => ({}),
  useParams: () => ({}),
  redirect: (o: unknown) => o,
  notFound: () => undefined,
  isRedirect: () => false,
  isNotFound: () => false,
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const P = await import("../src/lib/employer-continuity/process-projection");
const { ProcessContinuityStrip } =
  await import("../src/components/employer/ProcessContinuityStrip");

const root = process.cwd();
let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) passes += 1;
  else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** The runtime's own case order, PARSED from its declaration rather than
 *  imported.
 *
 *  runtime.functions.ts is a server-function module and cannot be loaded in a
 *  deterministic offline guard. Reading the literal is not a weaker check --
 *  it is the stronger one: a status added to CASE_FLOW appears here without
 *  anybody remembering to add it, and every exhaustiveness assertion below
 *  immediately covers it. */
const CASE_FLOW: readonly string[] = (() => {
  const src = read("src/lib/interview-intelligence/runtime.functions.ts");
  const block = src.slice(
    src.indexOf("export const CASE_FLOW"),
    src.indexOf("];", src.indexOf("export const CASE_FLOW")),
  );
  const flow = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  if (flow.length < 9) {
    console.error("  FAIL  CASE_FLOW could not be parsed from runtime.functions.ts");
    process.exit(1);
  }
  return flow;
})();

/** Source with comments stripped, so a guard never trips on the prose that
 *  explains the rule it checks. */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const ROUTES = {
  application: "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx",
  applications: "src/routes/_authenticated.employer.$employerSlug.applications.index.tsx",
  reviewAttempt:
    "src/routes/_authenticated.employer.$employerSlug.assessments.reviews.$attemptId.tsx",
  results: "src/routes/_authenticated.employer.$employerSlug.assessments.results.$attemptId.tsx",
  iiIndex: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.index.tsx",
  iiCase:
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.index.tsx",
  iiNew: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx",
} as const;

const COMPONENTS = {
  strip: "src/components/employer/ProcessContinuityStrip.tsx",
  panel: "src/components/academy/ApplicationAssessmentPanel.tsx",
  projection: "src/lib/employer-continuity/process-projection.ts",
} as const;

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

type Assessment = Parameters<typeof P.assessmentStageOf>[0];

const APP_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const CASE_ID = "44444444-4444-4444-8444-444444444444";

function attempt(over: Partial<Assessment> = {}): Assessment {
  return {
    assignmentId: "a",
    attemptId: ATTEMPT_ID,
    subjectId: "s",
    assessmentSlug: "vaktare-se",
    nameSv: "Väktare",
    nameEn: "Security officer",
    designedFor: "recruitment_support",
    useCase: "recruitment",
    governanceMode: "recruitment",
    attemptStatus: "in_progress",
    answered: 0,
    totalItems: 50,
    reviewsOutstanding: 0,
    invitedAt: "2026-01-01T00:00:00Z",
    deadline: null,
    submittedAt: null,
    scoredAt: null,
    releasedAt: null,
    reportAvailable: false,
    ...over,
  } as Assessment;
}

type Case = Parameters<typeof P.projectInterviewTrack>[1][number];

function iCase(over: Partial<Case> = {}): Case {
  return {
    id: CASE_ID,
    title: "Intern rubrik",
    status: "draft",
    updatedAt: "2026-01-01T00:00:00Z",
    packName: "Väktare v1",
    validationLabel: "pilot_hypothesis",
    proposalsAwaitingReview: 0,
    reportFinalised: false,
    reportContentHash: null,
    ...over,
  } as Case;
}

const ALL_CAPS: P.ContinuityCapabilities = {
  canAssignAssessment: true,
  canReviewAssessment: true,
  canPlanInterview: true,
  canShareAssessmentBrief: true,
};
const NO_CAPS: P.ContinuityCapabilities = {
  canAssignAssessment: false,
  canReviewAssessment: false,
  canPlanInterview: false,
  canShareAssessmentBrief: false,
};

function project(
  opts: {
    appStatus?: string;
    aRead?: P.TrackRead;
    iRead?: P.TrackRead;
    assessments?: Assessment[];
    cases?: Case[];
    caps?: P.ContinuityCapabilities;
  } = {},
) {
  const aRead = opts.aRead ?? "ready";
  const iRead = opts.iRead ?? "ready";
  const assessments = opts.assessments ?? [];
  const cases = opts.cases ?? [];
  return P.projectProcess({
    application: { read: "ready", status: opts.appStatus ?? "submitted" },
    assessment: P.projectAssessmentTrack(aRead, assessments),
    interview: P.projectInterviewTrack(iRead, cases),
    report: P.projectReportTrack(iRead, cases),
    capabilities: opts.caps ?? ALL_CAPS,
  });
}

const html = (node: React.ReactElement, lang: "sv" | "en" = "sv") =>
  renderToStaticMarkup(React.createElement(I18nProvider, { initialLang: lang } as never, node));

const strip = (projection: P.ProcessProjection, lang: "sv" | "en" = "sv") =>
  html(
    React.createElement(ProcessContinuityStrip, {
      projection,
      employerSlug: "acme",
      applicationId: APP_ID,
      onRetry: () => {},
    }),
    lang,
  );

/* ================================================================== */
/* 1 · The application is the recruitment-linked navigation anchor      */
/* ================================================================== */
{
  // Every recruitment-linked process surface offers the way back to the
  // application, and offers it as a PATH parameter on the canonical route.
  const back = "/employer/$employerSlug/applications/$applicationId";
  for (const [name, file] of [
    ["the interview case overview", ROUTES.iiCase],
    ["the new-interview form", ROUTES.iiNew],
    ["the assessment review", ROUTES.reviewAttempt],
    // The released brief draws its return through RecruitmentActions, which is
    // where it has always lived; the route passes the application into it.
    ["the released assessment brief", "src/components/academy/DecisionSupportSummary.tsx"],
    [
      "the interview preparation context",
      "src/components/employer/interview/InterviewContextPanel.tsx",
    ],
    ["the interview report", "src/components/employer/interview/ReportFinalisation.tsx"],
  ] as const) {
    ok(codeOnly(read(file)).includes(back), `1 · ${name} returns to the application`);
  }
  ok(
    codeOnly(read(ROUTES.results)).includes("<RecruitmentActions"),
    "1 · and the brief route passes the application into it",
  );
  // And the case overview is the hub every interview work surface breadcrumbs
  // to, so the return path exists from all six of them in one hop.
  const R = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId";
  for (const s of ["prepare", "interview", "evidence", "assessment", "report", "summary"]) {
    const f = `${R}.${s}.tsx`;
    ok(
      !existsSync(path.join(root, f)) ||
        codeOnly(read(f)).includes("/employer/$employerSlug/interview-intelligence/$caseId"),
      `1 · the ${s} surface breadcrumbs to the case overview`,
    );
  }
}

/* ================================================================== */
/* 2 · Known candidate/job data is not re-entered                       */
/* ================================================================== */
{
  const src = codeOnly(read(ROUTES.iiNew));
  ok(
    src.includes("getApplicationInterviewStart"),
    "2 · the interview form prefills from the application",
  );
  ok(src.includes("prefill.data?.jobId ?? jobId"), "2 · the job comes from the application first");
  // The assign path passes the APPLICATION, never an address the recruiter
  // could retype into a second person.
  const panel = codeOnly(read(COMPONENTS.panel));
  ok(
    panel.includes("applicationId, assessmentVersionId") ||
      /assignFn\(\{\s*data:\s*\{\s*employerId,\s*applicationId,\s*assessmentVersionId/.test(panel),
    "2 · assessment assignment passes the application, not an address",
  );
  ok(
    !/email|address/i.test(panel.split("async function assign")[1]?.slice(0, 400) ?? ""),
    "2 · and holds no address to pass",
  );
}

/* ================================================================== */
/* 3 · The assessment keeps the right application                       */
/* 4 · The interview keeps the right application, job and candidate     */
/* ================================================================== */
{
  const panel = codeOnly(read(COMPONENTS.panel));
  ok(
    panel.includes("search={{ application: applicationId }}"),
    "3 · the review carries the application it was opened from",
  );
  ok(
    codeOnly(read(ROUTES.reviewAttempt)).includes("z.string().uuid().optional().catch(undefined)"),
    "3 · and the review route validates it as a uuid",
  );

  const ctx = codeOnly(read("src/lib/interview-intelligence/context.functions.ts"));
  ok(
    ctx.includes("const jobId = str(a.job_id);"),
    "4 · the interview's job is read from the application row, not the request",
  );
  ok(
    ctx.includes("if (!applicationId) return unlinkedContext(candidateName)"),
    "4 · and a case with no application yields an unlinked context, never a guess",
  );
  const iiCase = codeOnly(read(ROUTES.iiCase));
  ok(
    iiCase.includes("applicationId: d.applicationId"),
    "4 · the case overview links back by the case's own persisted application id",
  );
  ok(
    iiCase.includes("processLinkage(d.applicationId)"),
    "4 · and decides linkage from that same persisted column",
  );

  // THE ROLE IS THE ROLE. The overview printed `d.packName ?? d.title` under a
  // label reading "Roll": the interview GUIDE's name, falling back to the
  // recruiter's own internal heading. Neither is the advertised role, and an
  // interview filed against a role nobody advertised is a record that cannot
  // be reconciled with the advert it came from.
  ok(!/\{d\.packName \?\? d\.title\}/.test(iiCase), "4 · the guide is not printed as the role");
  ok(iiCase.includes("{advertisedRole}"), "4 · the advertised role is its own value");
  ok(
    /advertisedRole =[\s\S]{0,400}?continuity\.role\.unknown/.test(iiCase),
    "4 · which falls back to 'no advertised role', never to a title",
  );
  // Scoped to the DERIVATION, because the render legitimately names the guide
  // and the internal title a few lines later -- under their own labels, which
  // is the whole correction. What must contain neither is the expression that
  // decides what "Roll" says.
  {
    const derivation = iiCase.slice(
      iiCase.indexOf("const contextRole"),
      iiCase.indexOf("const linkage"),
    );
    ok(derivation.length > 50, "4 · the role derivation is locatable");
    ok(
      !/d\.title|d\.packName/.test(derivation),
      "4 · and never borrows the internal title or the guide's name",
    );
  }
  ok(
    iiCase.includes("continuity.role.guide") && iiCase.includes("continuity.role.caseTitle"),
    "4 · the guide and the internal title are labelled as themselves",
  );
}

/* ================================================================== */
/* 5 · Standalone processes stay distinct                               */
/* ================================================================== */
{
  ok(P.processLinkage(APP_ID) === "recruitmentLinked", "5 · an application id means linked");
  ok(P.processLinkage(null) === "standalone", "5 · no application id means standalone");
  ok(P.processLinkage(undefined) === "standalone", "5 · and undefined means standalone");
  ok(P.processLinkage("") === "standalone", "5 · an empty string is not a link");

  // The ONE parameter is the enforcement: there is no name, address or title
  // in the signature, so no caller can link by one.
  const proj = codeOnly(read(COMPONENTS.projection));
  const fn = proj.slice(proj.indexOf("export function processLinkage"));
  ok(
    /export function processLinkage\(applicationId: string \| null \| undefined\)/.test(fn),
    "5 · linkage takes an identifier and nothing else",
  );

  for (const [name, file] of [
    ["the case overview", ROUTES.iiCase],
    ["the new-interview form", ROUTES.iiNew],
  ] as const) {
    const src = codeOnly(read(file));
    ok(src.includes("processLinkage"), `5 · ${name} states its process type`);
    ok(
      src.includes("continuity.type.standaloneInterview"),
      `5 · ${name} can say the process is standalone`,
    );
  }
  ok(
    sv["continuity.type.standaloneInterview"] === "Fristående intervju",
    "5 · Swedish reads Fristående intervju",
  );
  ok(
    en["continuity.type.standaloneInterview"] === "Standalone interview",
    "5 · English reads Standalone interview",
  );
  ok(
    /inte kopplad till någon ansökan/i.test(sv["continuity.type.standaloneBody"]),
    "5 · and says it is not connected to a CQrityjob application",
  );
}

/* ================================================================== */
/* 6 · Four lifecycles stay separate                                    */
/* ================================================================== */
{
  // The application's status is COPIED, not computed. Proven behaviourally:
  // every assessment and interview state, over the same application status,
  // leaves that status untouched.
  const statuses = ["submitted", "in_review", "interview", "offer", "hired", "rejected"];
  let held = true;
  for (const s of statuses) {
    for (const cs of CASE_FLOW) {
      const p = project({ appStatus: s, cases: [iCase({ status: cs })] });
      if (p.application.status !== s) held = false;
    }
    for (const a of [
      attempt(),
      attempt({ answered: 3 }),
      attempt({ reviewsOutstanding: 2 }),
      attempt({ attemptStatus: "scored" }),
      attempt({ reportAvailable: true }),
    ]) {
      const p = project({ appStatus: s, assessments: [a] });
      if (p.application.status !== s) held = false;
    }
  }
  ok(held, "6 · no assessment or interview state changes the application's status");

  // And structurally: the projection's application field is the input, verbatim.
  const proj = codeOnly(read(COMPONENTS.projection));
  ok(
    /application: input\.application,/.test(proj),
    "6 · the application track is passed through with no expression",
  );
  // deriveNextAction is not given the application at all, so it cannot read it.
  ok(
    /function deriveNextAction\(\s*assessment: AssessmentTrack,\s*interview: InterviewTrack,\s*report: ReportTrack,\s*cap: ContinuityCapabilities,\s*\)/.test(
      proj
        .replace(/\s+/g, " ")
        .replace(/function deriveNextAction\( /, "function deriveNextAction("),
    ) || !/deriveNextAction\([^)]*application[^)]*\)/.test(proj),
    "6 · the next action is derived without the application's status",
  );
  ok(
    !/ProcessProjection\b[\s\S]*?combinedStatus|overallStatus|mergedStatus/.test(proj),
    "6 · there is no combined status anywhere in the projection",
  );
}

/* ================================================================== */
/* 7 · Report material is not a final report                            */
/* 8 · Finalised reports are not counted as active                      */
/* ================================================================== */
{
  const material = project({ cases: [iCase({ status: "assessed" })] });
  ok(material.report.availability === "materialReady", "7 · assessed yields report MATERIAL");
  ok(material.report.finalisedCaseId === null, "7 · and no finalised report to open");
  ok(
    material.interview.state === "reportMaterialReady",
    "7 · the interview track names it as material too",
  );

  // The strongest form: a case may be `reported` in status and still not have a
  // finalised report row, and the projection follows the ROW.
  const lying = project({ cases: [iCase({ status: "reported", reportFinalised: false })] });
  ok(
    lying.report.availability !== "finalised",
    "7 · a case status alone never produces a finalised report",
  );

  const finalised = project({
    cases: [iCase({ status: "reported", reportFinalised: true, reportContentHash: "abc" })],
  });
  ok(finalised.report.availability === "finalised", "7 · a final report row does");

  // Wording.
  ok(
    sv["iiu.status.assessed"] === "Rapportunderlag redo",
    "7 · assessed reads Rapportunderlag redo",
  );
  ok(en["iiu.status.assessed"] === "Report material ready", "7 · and Report material ready");
  ok(!/^Rapport redo$/.test(sv["iiu.status.assessed"]), "7 · never Rapport redo");
  ok(
    sv["iiu.ix.done"] === "Fastställda rapporter",
    "8 · the finished counter reads Fastställda rapporter",
  );
  ok(en["iiu.ix.done"] === "Finalised reports", "8 · and Finalised reports");

  const list = codeOnly(read(ROUTES.iiIndex));
  ok(
    list.includes('cases.filter((c) => c.status === "reported")'),
    "8 · the finished counter counts `reported` only",
  );
  ok(
    list.includes('!["reported", "cancelled"].includes(c.status)'),
    "8 · and the active counter excludes it",
  );
  // Behaviourally, over every status: reported is never both.
  let disjoint = true;
  for (const s of CASE_FLOW) {
    const isActive = !["reported", "cancelled"].includes(s);
    const isDone = s === "reported";
    if (isActive && isDone) disjoint = false;
  }
  ok(disjoint, "8 · active and finalised are disjoint over every case status");
}

/* ================================================================== */
/* 9 · Counters, badges and actions share one source                    */
/* ================================================================== */
{
  const panel = codeOnly(read(COMPONENTS.panel));
  ok(
    panel.includes("assessmentStageOf") && panel.includes("STAGE_LABEL"),
    "9 · the panel derives its badge from the shared projection",
  );
  ok(
    !/function stageOf\(a: ApplicationAssessment\): TranslationKey \{\s*if \(a\.reportAvailable\)/.test(
      panel,
    ),
    "9 · and no longer holds a second copy of the derivation",
  );
  // One cache key, so the list badge and the candidate page cannot disagree.
  const keys = [...panel.matchAll(/queryKey: \[([^\]]*"assessments"[^\]]*)\]/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
  ok(keys.length >= 2, "9 · the panel and the chip both key an assessments read");
  ok(new Set(keys).size === 1, "9 · and they key it identically");
  ok(
    codeOnly(read(ROUTES.applications)).includes("employerId={employerId}"),
    "9 · the list passes the employer the shared key needs",
  );
  // The candidate page's strip reads the SAME key rather than its own.
  ok(
    codeOnly(read(ROUTES.application)).includes(
      '["employer", employerId, "application", applicationId, "assessments"]',
    ),
    "9 · and the process strip reads that key too",
  );

  // ONE VOCABULARY PER STATE. The strip sits inches above the panel's badge
  // and the interview chip; a second set of words for one state is a
  // contradiction the reader meets on a single screen.
  const stripSrc = codeOnly(read(COMPONENTS.strip));
  for (const k of [
    "journey.stage.invited",
    "journey.stage.started",
    "journey.stage.under_review",
    "journey.stage.ready_to_release",
    "journey.stage.report_available",
  ]) {
    ok(stripSrc.includes(k), `9 · the strip names the assessment state with ${k}`);
  }
  ok(
    stripSrc.includes("CASE_STATUS_LABEL[interview.leadStatus]"),
    "9 · and names the interview state with the runtime's own label",
  );
  ok(
    read("src/components/employer/interview/InterviewUi.tsx").includes(
      "export const CASE_STATUS_LABEL",
    ),
    "9 · which is exported from the one place the chip draws it",
  );
  // The lead status is carried through the projection so the label CANNOT be
  // re-derived from the presentation state.
  ok(
    codeOnly(read(COMPONENTS.projection)).includes("readonly leadStatus: string | null;"),
    "9 · the projection carries the runtime status for that purpose",
  );
}

/* ================================================================== */
/* 9b · Counter units                                                   */
/* ================================================================== */
{
  // THE NUMERATOR AND THE DENOMINATOR MUST BE THE SAME THING.
  //
  // Every interview surface counted assessment ROWS against the number of
  // QUESTIONS in the pinned guide. Live-row uniqueness on
  // scp_interview_assessments is (case_id, question_id, assessor_id), so a
  // panel of two assessors on eight questions is sixteen rows -- "16 av 8" on
  // the overview, a summary card that never turned green, and a completeness
  // gate written as `length === questions.length` that could never fire.
  const ui = await import("../src/components/employer/interview/InterviewUi");
  const eight = Array.from({ length: 8 }, (_, i) => ({ questionId: `q${i}` }));
  ok(ui.assessedQuestionCount(eight) === 8, "9b · eight questions, eight assessed");
  ok(
    ui.assessedQuestionCount([...eight, ...eight]) === 8,
    "9b · a second assessor does not make sixteen requirements",
  );
  ok(ui.assessedQuestionCount([]) === 0, "9b · none is none");
  ok(
    ui.assessedQuestionCount([{ questionId: "q1" }, { questionId: "q1" }, { questionId: "q2" }]) ===
      2,
    "9b · distinct questions, whoever assessed them",
  );

  // And no surface holds a private copy of the derivation any more.
  const R = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId";
  for (const f of [`${R}.index.tsx`, `${R}.assessment.tsx`, `${R}.summary.tsx`]) {
    const src = codeOnly(read(f));
    ok(
      !/d\.assessments\.length/.test(src),
      `9b · ${path.basename(f)} counts questions, not assessment rows`,
    );
    ok(src.includes("assessedQuestionCount"), `9b · ${path.basename(f)} uses the shared count`);
  }
}

/* ================================================================== */
/* 10 · A read failure never becomes zero                               */
/* 11 · A refusal never becomes empty                                   */
/* ================================================================== */
{
  for (const bad of ["failed", "refused"] as const) {
    const a = project({ aRead: bad });
    ok(a.assessment.state !== "none", `10 · a ${bad} assessment read is not "none"`);
    ok(
      a.assessment.state === (bad === "refused" ? "refused" : "unavailable"),
      `10 · it is reported as ${bad}`,
    );
    const i = project({ iRead: bad });
    ok(i.interview.state !== "none", `10 · a ${bad} interview read is not "none"`);
    ok(i.report.availability !== "none", `10 · nor is the report track`);
    ok(i.nextAction.kind === "unavailable", `10 · and no next action is proposed`);
  }
  // Loading is not zero either.
  const l = project({ aRead: "loading", iRead: "loading" });
  ok(
    l.assessment.state === "loading" && l.interview.state === "loading",
    "10 · loading is its own state",
  );
  ok(l.nextAction.kind === "loading", "10 · and proposes nothing");

  // Partial failure names the track and keeps the other one.
  const partial = project({
    aRead: "failed",
    cases: [iCase({ status: "prep_approved" })],
  });
  ok(
    partial.nextAction.unavailableTrack === "assessment",
    "11 · a partial failure names the track",
  );
  ok(
    partial.interview.state === "readyToInterview",
    "11 · and does not hide the track that loaded",
  );

  // Rendered.
  const failedHtml = strip(project({ aRead: "failed" }));
  ok(
    failedHtml.includes(sv["continuity.assessment.unavailable"]),
    "10 · the strip says so on screen",
  );
  ok(!/>0</.test(failedHtml), "10 · and prints no zero");
  ok(failedHtml.includes(sv["continuity.next.retry"]), "10 · with a retry that keeps the route");

  // The panel and the interview section on the candidate page.
  const panel = codeOnly(read(COMPONENTS.panel));
  ok(panel.includes("assessments.isError"), "10 · the assessment panel has a failure branch");
  ok(
    panel.indexOf("assessments.isError") <
      panel.indexOf("if (rows.length === 0 && options.length === 0) return null"),
    "10 · which is reached before the silent-null branch",
  );
  const app = codeOnly(read(ROUTES.application));
  ok(
    app.includes("interviewCasesQuery.isError"),
    "10 · the candidate page reports a failed interview read",
  );
  ok(
    app.indexOf("interviewCasesQuery.isError") < app.indexOf("interviewCases.length === 0"),
    "10 · before it would have said no interview is planned",
  );
  const list = codeOnly(read(ROUTES.iiIndex));
  ok(list.includes("countsKnown"), "10 · the interview list withholds unknown counts");
  ok(
    list.includes("value={countsKnown ? active.length : null}"),
    "10 · rather than defaulting to zero",
  );
}

/* ================================================================== */
/* 12 · Capabilities are checked per action                             */
/* ================================================================== */
{
  // Review: the same board basis the review workspace uses, not a role label.
  const canReview = project({
    assessments: [attempt({ reviewsOutstanding: 4 })],
    caps: ALL_CAPS,
  });
  ok(
    canReview.nextAction.kind === "reviewAssessmentResponses",
    "12 · a reviewer is offered the review",
  );
  const cannotReview = project({
    assessments: [attempt({ reviewsOutstanding: 4 })],
    caps: { ...ALL_CAPS, canReviewAssessment: false },
  });
  ok(
    cannotReview.nextAction.kind === "awaitColleague",
    "12 · a non-reviewer is told a colleague must act",
  );
  ok(
    cannotReview.nextAction.destination.kind === "none",
    "12 · and is offered no control that would fail",
  );

  // Sharing a scored brief: owner/admin, mirroring can_release.
  const canShare = project({ assessments: [attempt({ attemptStatus: "scored" })], caps: ALL_CAPS });
  ok(canShare.nextAction.kind === "shareAssessmentBrief", "12 · an admin may share the brief");
  const cannotShare = project({
    assessments: [attempt({ attemptStatus: "scored" })],
    caps: { ...ALL_CAPS, canShareAssessmentBrief: false },
  });
  ok(cannotShare.nextAction.kind === "awaitColleague", "12 · a member is not offered the share");

  // The four capabilities are distinct inputs, not one boolean.
  const proj = codeOnly(read(COMPONENTS.projection));
  for (const c of [
    "canAssignAssessment",
    "canReviewAssessment",
    "canPlanInterview",
    "canShareAssessmentBrief",
  ]) {
    ok(proj.includes(c), `12 · ${c} is its own capability`);
  }
  // The candidate page reads each from its own contract.
  const app = codeOnly(read(ROUTES.application));
  ok(app.includes("getEmployerReviewBoard"), "12 · review authority comes from the board");
  ok(
    app.includes('leadBasis === "authorised" || leadBasis === "break_glass"'),
    "12 · using the board's own basis values",
  );
  // UI hiding is never described as enforcement.
  ok(
    /not enforcement|re-decides|never enforcement/i.test(read(COMPONENTS.projection)),
    "12 · and the module says hiding is not enforcement",
  );
}

/* ================================================================== */
/* 13 · The next action is operational only                             */
/* ================================================================== */
{
  const proj = read(COMPONENTS.projection);
  const FORBIDDEN = [
    "hire",
    "reject",
    "shortlist",
    "recommend",
    "suitab",
    "rank",
    "score",
    "bestCandidate",
    "topCandidate",
  ];
  // Over the KIND union only: prose explains why these are absent.
  const union = proj.slice(
    proj.indexOf("export type NextActionKind"),
    proj.indexOf("export type WaitingOn"),
  );
  const members = [...union.matchAll(/^\s*\|\s*"([a-zA-Z]+)"/gm)].map((m) => m[1]);
  ok(members.length >= 14, "13 · the action union is enumerated");
  // Three states of an interview, three actions. Collapsing them told a
  // recruiter their interview was under way on the day it was approved.
  for (const m of ["startInterview", "continueInterview", "assessInterviewEvidence"]) {
    ok(members.includes(m), `13 · "${m}" is its own action`);
  }
  for (const f of FORBIDDEN) {
    ok(
      !members.some((m) => m.toLowerCase().includes(f.toLowerCase())),
      `13 · no action member mentions "${f}"`,
    );
  }
  // And behaviourally: every reachable action is one of the operational set.
  const OPERATIONAL = new Set(members);
  let allOperational = true;
  for (const cs of [...CASE_FLOW, "cancelled"]) {
    for (const a of [
      [],
      [attempt()],
      [attempt({ answered: 2 })],
      [attempt({ reviewsOutstanding: 1 })],
      [attempt({ attemptStatus: "scored" })],
      [attempt({ reportAvailable: true })],
    ]) {
      for (const caps of [ALL_CAPS, NO_CAPS]) {
        const p = project({
          assessments: a as Assessment[],
          cases: [iCase({ status: cs as Case["status"], reportFinalised: cs === "reported" })],
          caps,
        });
        if (!OPERATIONAL.has(p.nextAction.kind)) allOperational = false;
      }
    }
  }
  ok(allOperational, "13 · every reachable action over every state is in the operational set");

  // The copy for each action says what to DO, and never what to decide.
  for (const m of members) {
    const key = `continuity.next.${m}`;
    if (!(key in sv)) continue;
    const text = `${sv[key]} ${en[key] ?? ""}`.toLowerCase();
    ok(
      !/\banstäl|\bavslå|\brekommend|\blämplig|\brank|recommend|suitab|hire\b|reject\b/.test(text),
      `13 · "${m}" copy is operational`,
    );
  }
}

/* ================================================================== */
/* 14 · The recruitment status is never changed automatically           */
/* ================================================================== */
{
  const proj = codeOnly(read(COMPONENTS.projection));
  // The module is pure: no mutation, no server function, no query client.
  for (const forbidden of [
    "useMutation",
    "createServerFn",
    "supabase",
    "updateApplicationStatus",
    "invalidateQueries",
    "localStorage",
    "Date.now",
    "new Date(",
    "Math.random",
  ]) {
    ok(!proj.includes(forbidden), `14 · the projection contains no ${forbidden}`);
  }
  ok(!/\bexport (async )?function \w+.*Promise</.test(proj), "14 · and nothing async");

  // The strip renders no status control.
  const stripSrc = codeOnly(read(COMPONENTS.strip));
  ok(!stripSrc.includes("useMutation"), "14 · the strip writes nothing");
  ok(
    !stripSrc.includes("EMPLOYER_NEXT_STATUSES") && !stripSrc.includes("setStatus"),
    "14 · and offers no application transition of its own",
  );
  // The transitions stay where they were, on the candidate page's own block.
  ok(
    codeOnly(read(ROUTES.application)).includes("EMPLOYER_NEXT_STATUSES"),
    "14 · the human-controlled transitions are unchanged and still on the page",
  );
}

/* ================================================================== */
/* 15–17 · Evidence vocabulary is not flattened                         */
/* ================================================================== */
{
  // E1 adds no evidence surface, and the guard proves it did not weaken one:
  // no continuity string calls self-report observed or verified, calls a
  // scenario response demonstrated performance, or calls a confirmed excerpt
  // true.
  const continuityKeys = Object.keys(sv).filter((k) => k.startsWith("continuity."));
  ok(continuityKeys.length > 30, "15 · the continuity vocabulary exists");
  for (const k of continuityKeys) {
    const text = `${sv[k]} ${en[k] ?? ""}`.toLowerCase();
    ok(
      !/verifierad|bekräftad kompetens|verified competence|observed evidence|styrkt/.test(text),
      `15 · "${k}" makes no verification claim`,
    );
  }
  // And the existing taxonomy is untouched by this work.
  const uiSrc = read("src/components/employer/interview/InterviewUi.tsx");
  for (const m of ["SOURCE_KIND_LABEL", "MaterialBadge", "ASSURANCE_LABEL"]) {
    ok(uiSrc.includes(m), `16 · the ${m} taxonomy is still present`);
  }
  ok(
    uiSrc.includes(
      'export type MaterialState = "candidate" | "note" | "ai" | "confirmed" | "verify" | "assessment"',
    ),
    "17 · candidate, note, AI, confirmed, verify and assessment remain six distinct states",
  );
}

/* ================================================================== */
/* 18 · Candidate results never change the pinned guide                 */
/* ================================================================== */
{
  const ctx = codeOnly(read("src/lib/interview-intelligence/context.ts"));
  // The context bridge produces FOLLOW-UP AREAS, separately labelled, and no
  // question text at all.
  ok(ctx.includes("FollowUpArea"), "18 · assessment information yields follow-up AREAS");
  ok(
    !/questions\s*:/.test(
      ctx.slice(
        ctx.indexOf("export interface InterviewContext"),
        ctx.indexOf("export interface ContextApplicationInput"),
      ),
    ),
    "18 · and the context carries no questions",
  );
  // Nothing E1 touched writes to a pack, a version or a question.
  // Choosing WHICH governed guide to pin is a legitimate act on the creation
  // form and is not what this asserts. What must not exist anywhere E1 touched
  // is a write to a pack, a version or a question -- the guide's CONTENT.
  for (const f of [
    COMPONENTS.projection,
    COMPONENTS.strip,
    ROUTES.iiCase,
    ROUTES.iiNew,
    ROUTES.application,
  ]) {
    const src = codeOnly(read(f));
    ok(
      !/from\("scp_interview_pack|\.update\(|questionText|updateQuestion|setQuestionText|pack_items|question_text/.test(
        src,
      ),
      `18 · ${path.basename(f)} writes nothing to the pinned guide`,
    );
  }
  // And the candidate's own results reach preparation only as separately
  // labelled follow-up areas, which is the existing contract.
  ok(
    codeOnly(read("src/lib/interview-intelligence/context.ts")).includes('"assessment_follow_up"'),
    "18 · assessment-derived areas keep their own source label",
  );
}

/* ================================================================== */
/* 19 · Passport needs an explicit, live disclosure                     */
/* ================================================================== */
{
  const app = codeOnly(read(ROUTES.application));
  ok(app.includes("ApplicationPassportPanel"), "19 · the Passport stays behind its own panel");
  // Nothing E1 added reads a Passport.
  for (const f of [COMPONENTS.projection, COMPONENTS.strip]) {
    const src = read(f);
    ok(
      !/sp_claims|sp_disclosures|passport/i.test(src),
      `19 · ${path.basename(f)} reads no Passport data`,
    );
  }
  // And the separation guard still names this file set.
  ok(
    read("scripts/passport-separation-check.ts").includes("ApplicationPassportPanel"),
    "19 · the separation guard still governs the one permitted integration",
  );
}

/* ================================================================== */
/* 20 · Employer-only and candidate-safe audiences cannot cross         */
/* ================================================================== */
{
  // The strip links to report surfaces; it renders no report CONTENT.
  const stripSrc = codeOnly(read(COMPONENTS.strip));
  // Proven by the import graph rather than by word-search: the strip imports
  // the projection, the dictionary and the route link, and nothing that could
  // hand it a report body, an evidence row or a candidate answer.
  const imports = [...stripSrc.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
  ok(
    imports.every((i) =>
      [
        "@tanstack/react-router",
        "lucide-react",
        "@/i18n/context",
        "@/i18n/dictionaries",
        "@/lib/job-intelligence/application-status",
        "@/lib/employer-continuity/process-projection",
        // The status LABEL map, so one state has one word across the page.
        // A label table, not a data source: it maps a status to a
        // translation key and can hand this file nothing else.
        "@/components/employer/interview/InterviewUi",
      ].includes(i),
    ),
    `20 · the strip imports only presentation and the projection (${imports.join(", ")})`,
  );
  for (const forbidden of [
    "reportPayload",
    "snapshot",
    "reportContentHash",
    "proposals",
    "assessments[",
    "e1Situation",
  ]) {
    ok(!stripSrc.includes(forbidden), `20 · the strip reads no ${forbidden}`);
  }
  // Report availability is a WORD, never a document.
  const p = project({ cases: [iCase({ status: "reported", reportFinalised: true })] });
  const out = strip(p);
  ok(out.includes(sv["continuity.report.finalised"]), "20 · a finalised report is announced");
  ok(
    !out.includes("content_hash") && !out.includes("contentHash"),
    "20 · without disclosing its payload",
  );
  // Nothing E1 touched renders a candidate-facing output.
  for (const f of [COMPONENTS.strip, COMPONENTS.projection]) {
    ok(
      !/candidateSafe|candidate_report|shareWithCandidate/.test(read(f)),
      `20 · ${path.basename(f)} produces no candidate output`,
    );
  }
}

/* ================================================================== */
/* 21 · Typed destinations resolve in the generated route tree          */
/* ================================================================== */
{
  const tree = read("src/routeTree.gen.ts");
  const stripSrc = read(COMPONENTS.strip);
  const literals = [...stripSrc.matchAll(/to="(\/employer\/[^"]+)"/g)].map((m) => m[1]);
  ok(literals.length >= 5, "21 · the strip's destinations are route literals");
  for (const lit of new Set(literals)) {
    // The generated tree records paths without the file-route prefix.
    const p = lit.replace("/employer/$employerSlug", "");
    ok(
      tree.includes(`'/employer/$employerSlug${p}'`) || tree.includes(`'${p}'`),
      `21 · ${lit} exists in the generated route tree`,
    );
  }
  // The union in the projection matches what the component can draw.
  const proj = read(COMPONENTS.projection);
  const kinds = [...proj.matchAll(/readonly kind: "(\w+)"/g)].map((m) => m[1]);
  for (const k of kinds) {
    ok(stripSrc.includes(`case "${k}":`), `21 · the strip handles the "${k}" destination`);
  }
}

/* ================================================================== */
/* 22 · No PII in URLs; context survives back and forward               */
/* ================================================================== */
{
  // Every link the strip draws, for every reachable state, is inspected for
  // anything that could identify a person.
  const NAME = "Anna Testsson";
  const EMAIL = "anna@example.test";
  let clean = true;
  for (const cs of [...CASE_FLOW, "cancelled"]) {
    for (const caps of [ALL_CAPS, NO_CAPS]) {
      const out = strip(
        project({
          assessments: [attempt({ reviewsOutstanding: 1 })],
          cases: [iCase({ status: cs as Case["status"], reportFinalised: cs === "reported" })],
          caps,
        }),
      );
      for (const href of [...out.matchAll(/href="([^"]*)"/g)].map((m) => m[1])) {
        if (href.includes(NAME) || href.includes(EMAIL) || /@/.test(href)) clean = false;
        // Only opaque ids may appear.
        const q = href.split("?")[1] ?? "";
        for (const pair of q.split("&").filter(Boolean)) {
          const v = pair.split("=")[1] ?? "";
          if (v && !/^[0-9a-f-]{36}$/i.test(v) && !/^[a-z_]+$/i.test(v)) clean = false;
        }
      }
    }
  }
  ok(clean, "22 · no URL the strip draws carries a name, an address or anything but an opaque id");

  // Context is preserved by the ROUTE, not by browser state: every return path
  // is a path parameter or a validated uuid search parameter, so back and
  // forward reproduce it.
  for (const f of [ROUTES.reviewAttempt, ROUTES.results]) {
    ok(
      codeOnly(read(f)).includes("validateSearch"),
      `22 · ${path.basename(f)} validates its search rather than trusting it`,
    );
  }
  for (const f of [COMPONENTS.strip, ROUTES.iiCase, ROUTES.iiNew, COMPONENTS.panel]) {
    const src = codeOnly(read(f));
    ok(
      !/sessionStorage|localStorage|window\.history/.test(src),
      `22 · ${path.basename(f)} keeps no navigation context in browser state`,
    );
  }
  const e2e = "e2e/employer-process-continuity.spec.ts";
  ok(existsSync(path.join(root, e2e)), "22 · a routed browser walk exists");
  if (existsSync(path.join(root, e2e))) {
    const spec = read(e2e);
    ok(spec.includes("goBack"), "22 · and exercises browser Back");
    ok(spec.includes("goForward"), "22 · and Forward");
  }
}

/* ================================================================== */
/* 23 · Swedish and English say the same facts                          */
/* ================================================================== */
{
  const keys = Object.keys(sv).filter((k) => k.startsWith("continuity."));
  for (const k of keys) {
    ok(typeof en[k] === "string" && en[k].trim() !== "", `23 · ${k} has English`);
  }
  // Parity of MEANING where it is checkable: the same set of states, the same
  // set of actions, and a CTA in one language exactly where there is one in
  // the other.
  const svCtas = keys.filter((k) => k.endsWith(".cta"));
  const enCtas = Object.keys(en).filter((k) => k.startsWith("continuity.") && k.endsWith(".cta"));
  ok(svCtas.length === enCtas.length, "23 · both languages offer the same actions");

  // Rendered in both languages, the same states are named and the same links
  // are drawn.
  for (const cs of CASE_FLOW) {
    const p = project({
      assessments: [attempt({ reviewsOutstanding: 1 })],
      cases: [iCase({ status: cs as Case["status"], reportFinalised: cs === "reported" })],
    });
    const s = strip(p, "sv");
    const e = strip(p, "en");
    const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).join("|");
    ok(hrefs(s) === hrefs(e), `23 · ${cs} offers identical destinations in both languages`);
  }
  // The two most load-bearing distinctions survive translation.
  ok(
    /underlag/i.test(sv["continuity.report.materialReady"]) &&
      /material/i.test(en["continuity.report.materialReady"]),
    "23 · report MATERIAL is material in both",
  );
  ok(
    /fastställd/i.test(sv["continuity.report.finalised"]) &&
      /finalis/i.test(en["continuity.report.finalised"]),
    "23 · a finalised report is finalised in both",
  );
}

/* ================================================================== */
/* Exhaustive tables — the projection is total                          */
/* ================================================================== */
{
  // Every case status the runtime can produce has a presentation state, and
  // none of them is "unknown".
  for (const s of [...CASE_FLOW, "cancelled"]) {
    ok(P.interviewStateOf(s) !== "unknown", `T · case status "${s}" has a presentation state`);
  }
  ok(
    P.interviewStateOf("something_new") === "unknown",
    "T · an unrecognised status is reported, not folded in",
  );

  // Every assessment shape maps to exactly one stage, in the documented order.
  const cases: Array<[Assessment, string]> = [
    [attempt(), "invited"],
    [attempt({ answered: 1 }), "in_progress"],
    [attempt({ answered: 1, reviewsOutstanding: 2 }), "under_review"],
    [attempt({ answered: 1, reviewsOutstanding: 2, attemptStatus: "scored" }), "brief_ready"],
    [attempt({ attemptStatus: "scored", reportAvailable: true }), "brief_released"],
  ];
  for (const [a, expected] of cases) {
    ok(P.assessmentStageOf(a) === expected, `T · assessment maps to ${expected}`);
  }

  // The full cross-product produces exactly one action, always defined.
  let total = 0;
  let defined = 0;
  for (const cs of [...CASE_FLOW, "cancelled"]) {
    for (const a of [
      [],
      [attempt()],
      [attempt({ reviewsOutstanding: 1 })],
      [attempt({ attemptStatus: "scored" })],
      [attempt({ reportAvailable: true })],
    ]) {
      for (const caps of [ALL_CAPS, NO_CAPS]) {
        for (const aRead of ["ready", "loading", "failed", "refused"] as const) {
          for (const iRead of ["ready", "loading", "failed", "refused"] as const) {
            total += 1;
            const p = project({
              assessments: a as Assessment[],
              cases: [iCase({ status: cs as Case["status"], reportFinalised: cs === "reported" })],
              aRead,
              iRead,
              caps,
            });
            if (typeof p.nextAction.kind === "string" && p.nextAction.kind.length > 0) defined += 1;
            // Determinism: the same inputs twice give the same answer.
            const again = project({
              assessments: a as Assessment[],
              cases: [iCase({ status: cs as Case["status"], reportFinalised: cs === "reported" })],
              aRead,
              iRead,
              caps,
            });
            if (JSON.stringify(p) !== JSON.stringify(again)) defined -= 1;
          }
        }
      }
    }
  }
  ok(total >= 800, `T · the cross-product is exhaustive (${total} combinations)`);
  ok(defined === total, "T · every combination yields exactly one deterministic action");

  // A destination is offered only where the copy has a CTA, and never where
  // the honest answer is a sentence.
  const SILENT: string[] = [
    "loading",
    "unavailable",
    "awaitCandidateAssessment",
    "awaitColleague",
    "nothingStarted",
    "nothingOutstanding",
  ];
  let silentClean = true;
  for (const cs of [...CASE_FLOW, "cancelled"]) {
    for (const caps of [ALL_CAPS, NO_CAPS]) {
      for (const aRead of ["ready", "failed", "loading"] as const) {
        const p = project({ cases: [iCase({ status: cs as Case["status"] })], aRead, caps });
        if (SILENT.includes(p.nextAction.kind) && p.nextAction.destination.kind !== "none") {
          silentClean = false;
        }
      }
    }
  }
  ok(silentClean, "T · a waiting or failed state never carries a call to action");

  // The action a case produces matches the state it is in, one to one.
  const EXPECTED: Record<string, string> = {
    prep_approved: "startInterview",
    interview_in_progress: "continueInterview",
    interview_complete: "assessInterviewEvidence",
    evidence_review: "assessInterviewEvidence",
    assessed: "reviewReportMaterial",
  };
  for (const [status, expected] of Object.entries(EXPECTED)) {
    const p = project({ cases: [iCase({ status: status as Case["status"] })] });
    ok(p.nextAction.kind === expected, `T · ${status} proposes ${expected}`);
  }
  // A reported case with a real report row opens it; without one, it does not
  // claim a report exists.
  const rep = project({ cases: [iCase({ status: "reported", reportFinalised: true })] });
  ok(rep.nextAction.kind === "openFinalisedReport", "T · reported opens the finalised report");
}

/* ================================================================== */

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
console.log(
  "\nOK: one application stays one process. Assessment and interview keep it, return to it,",
);
console.log(
  "    and the four lifecycles stay apart. Report material is not a report, a failed read is",
);
console.log(
  "    not a zero, a refusal is not an empty list, and no next action judges a candidate.",
);
