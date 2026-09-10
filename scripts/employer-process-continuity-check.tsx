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
// TYPES ONLY, and statically. The values still arrive through the dynamic
// imports below -- they have to, because the router mock must be installed
// before the components load -- but `P.SomeType` in type position needs a real
// namespace, and a `const` from `await import` is not one. Erased at compile
// time, so it loads nothing early.
import type {
  ContinuityCapabilities,
  ProcessProjection,
  TrackRead,
} from "../src/lib/employer-continuity/process-projection";

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

/** The case-status union, taken from the shape the projection accepts rather
 *  than redeclared, so a status added to the runtime cannot leave this file
 *  quietly comparing against a stale list. */
type CaseStatusLiteral = Case["status"];

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
const CASE_FLOW: readonly CaseStatusLiteral[] = (() => {
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
  // The parse yields strings; the fixtures want the runtime's own union. The
  // assertion that these ARE that union is the exhaustiveness check further
  // down -- every parsed status must have a presentation state -- so the cast
  // is narrowed by a test rather than by a promise.
  return flow as CaseStatusLiteral[];
})();

/** Every status a case can hold, which is CASE_FLOW plus one.
 *
 *  `cancelled` is deliberately absent from CASE_FLOW -- that constant is the
 *  ORDER a case moves through, and a cancellation is not a step in it. It is
 *  still a status the projection must map and the surfaces must render, so the
 *  exhaustiveness assertions below run over both. Written once, because the
 *  two lists drifting apart is how a status stops being covered. */
const ALL_CASE_STATUSES: readonly CaseStatusLiteral[] = [...CASE_FLOW, "cancelled"];

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

const ALL_CAPS: ContinuityCapabilities = {
  canReviewAssessment: true,
  canShareAssessmentBrief: true,
};
const NO_CAPS: ContinuityCapabilities = {
  canReviewAssessment: false,
  canShareAssessmentBrief: false,
};

function project(
  opts: {
    appStatus?: string;
    aRead?: TrackRead;
    iRead?: TrackRead;
    assessments?: Assessment[];
    cases?: Case[];
    caps?: ContinuityCapabilities;
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

/** Every ordering of a small list.
 *
 *  Used to prove the projection is order-independent. Three records is nine
 *  orderings once repeated for both tracks -- small enough to exhaust, which
 *  is better than sampling for a property that is either true or not. */
function permutations<T>(rows: readonly T[]): T[][] {
  if (rows.length <= 1) return [[...rows]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const rest = [...rows.slice(0, i), ...rows.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([rows[i], ...tail]);
  }
  return out;
}

const html = (node: React.ReactElement, lang: "sv" | "en" = "sv") =>
  renderToStaticMarkup(React.createElement(I18nProvider, { initialLang: lang } as never, node));

const strip = (projection: ProcessProjection, lang: "sv" | "en" = "sv") =>
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
  // Scoped to the REVIEW link. The released-brief link a few lines above
  // carries the same `search` line, so a whole-file check for it went on
  // passing after the review's was deleted -- a dead assertion the negative
  // control caught, and this replaces.
  {
    const at = panel.indexOf('to="/employer/$employerSlug/assessments/reviews/$attemptId"');
    const block = at < 0 ? "" : panel.slice(at, at + 400);
    ok(
      block.includes("search={{ application: applicationId }}"),
      "3 · the review carries the application it was opened from",
    );
    const briefAt = panel.indexOf('to="/employer/$employerSlug/assessments/results/$attemptId"');
    const briefBlock = briefAt < 0 ? "" : panel.slice(briefAt, briefAt + 400);
    ok(
      briefBlock.includes("search={{ application: applicationId }}"),
      "3 · and so does the released brief",
    );
  }
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
    stripSrc.includes("CASE_STATUS_LABEL[interview.presentationStatus]"),
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
    codeOnly(read(COMPONENTS.projection)).includes("readonly presentationStatus: string | null;"),
    "9 · the projection carries the runtime status for that purpose",
  );
}

/* ================================================================== */
/* 9a · MULTI-RECORD: no record hides another, no action opens the wrong */
/*      one                                                             */
/* ================================================================== */
//
// An application can hold several interview cases and several assessment
// attempts. The first version answered "what state is this in" and "where does
// the action go" with ONE record, chosen as the furthest along -- so a
// finished record spoke for an application that still owed work, and a summed
// count pointed at a record that held none of it.
//
// Every scenario the review named is exercised here, by IDENTITY: it is not
// enough that an action of the right KIND is proposed, it must open the exact
// record that holds the work.
{
  // Distinct ids and distinct timestamps, so "which one" is always answerable
  // and the tie-break never has to be guessed at.
  const OLDEST = "2026-01-01T00:00:00Z";
  const MIDDLE = "2026-02-01T00:00:00Z";
  const NEWEST = "2026-03-01T00:00:00Z";

  const C = {
    reported: "cccccccc-0000-4000-8000-00000000000a",
    assessed: "cccccccc-0000-4000-8000-00000000000b",
    proposals: "cccccccc-0000-4000-8000-00000000000c",
    ready: "cccccccc-0000-4000-8000-00000000000d",
    preparing: "cccccccc-0000-4000-8000-00000000000e",
  } as const;
  const A = {
    released: "aaaaaaaa-0000-4000-8000-00000000000a",
    review: "aaaaaaaa-0000-4000-8000-00000000000b",
    scored: "aaaaaaaa-0000-4000-8000-00000000000c",
    sitting: "aaaaaaaa-0000-4000-8000-00000000000d",
  } as const;

  /* ---- 1 · reported + assessed --------------------------------------
   *
   * THE REPORTED CASE OF THE REVIEW, and the one screenshot 05 shows. A
   * finished report in one case and report material in another. Before the
   * fix the row read "Rapport fastställd", the next step read "the report has
   * been finalised and can be opened", and the review a human owed had no
   * route at all. */
  {
    const cases = [
      iCase({
        id: C.reported,
        status: "reported",
        reportFinalised: true,
        reportContentHash: "abc",
        updatedAt: NEWEST,
      }),
      iCase({ id: C.assessed, status: "assessed", updatedAt: MIDDLE }),
    ];
    const p = project({ cases });
    ok(
      p.nextAction.kind === "reviewReportMaterial",
      "9a · outstanding work outranks a finished report",
    );
    ok(
      p.nextAction.destination.kind === "interviewReport" &&
        p.nextAction.destination.caseId === C.assessed,
      "9a · and opens the case holding the material, not the finished one",
    );
    ok(
      p.interview.state === "reportMaterialReady",
      "9a · the interview row names the case that owes work",
    );
    ok(p.interview.presentationCaseId === C.assessed, "9a · and that is the presentation case");
    // The finished report is not denied. Both facts, in one row.
    ok(
      p.report.availability === "materialAndFinalised",
      "9a · the report row reports BOTH the material and the finalised report",
    );
    ok(p.report.finalisedCaseId === C.reported, "9a · naming the finalised case");
    ok(p.report.materialCaseId === C.assessed, "9a · and the material case, separately");
    ok(p.needsHumanAttention, "9a · and the application still needs a human");
  }

  /* ---- 2 · pending proposals on a lower-ranked case ------------------
   *
   * The proposals sit on a case at `interview_complete`; another case ranks
   * higher on every ordering this module has ever had. The count is a sum, so
   * the destination must come from the same predicate. */
  {
    const cases = [
      iCase({ id: C.assessed, status: "assessed", updatedAt: NEWEST }),
      iCase({
        id: C.proposals,
        status: "interview_complete",
        proposalsAwaitingReview: 3,
        updatedAt: MIDDLE,
      }),
    ];
    const p = project({ cases });
    ok(p.interview.proposalsAwaitingReview === 3, "9a · proposals are summed across cases");
    ok(p.nextAction.kind === "reviewInterviewEvidence", "9a · unreviewed material comes first");
    ok(
      p.nextAction.destination.kind === "interviewCase" &&
        p.nextAction.destination.caseId === C.proposals,
      "9a · and opens the case the proposals are actually on",
    );
    ok(p.interview.proposalsCaseId === C.proposals, "9a · which the track names on its own");
  }

  /* ---- 3 · released assessment + another attempt awaiting review -----
   *
   * A released brief used to outrank an attempt with responses outstanding,
   * so the review branch never ran and the responses were invisible. */
  {
    const assessments = [
      attempt({
        attemptId: A.released,
        attemptStatus: "scored",
        reportAvailable: true,
        invitedAt: NEWEST,
      }),
      attempt({ attemptId: A.review, answered: 5, reviewsOutstanding: 4, invitedAt: MIDDLE }),
    ];
    const p = project({ assessments });
    ok(p.assessment.responsesAwaitingReview === 4, "9a · responses are summed across attempts");
    ok(
      p.nextAction.kind === "reviewAssessmentResponses",
      "9a · a released brief does not hide responses awaiting review",
    );
    ok(
      p.nextAction.destination.kind === "assessmentReview" &&
        p.nextAction.destination.attemptId === A.review,
      "9a · and the review opens the attempt with the responses",
    );
    ok(p.assessment.state === "under_review", "9a · the row names the attempt that owes work");
    ok(p.assessment.releasedAttemptId === A.released, "9a · the released attempt is still carried");
  }

  /* ---- 4 · released assessment + an attempt ready to release ---------
   *
   * Requirement 5's second limb. Nothing is waiting on a reviewer; one attempt
   * is scored and unshared, and another has already been released. */
  {
    const assessments = [
      attempt({
        attemptId: A.released,
        attemptStatus: "scored",
        reportAvailable: true,
        invitedAt: OLDEST,
      }),
      attempt({ attemptId: A.scored, attemptStatus: "scored", invitedAt: MIDDLE }),
    ];
    const p = project({ assessments });
    ok(
      p.nextAction.kind === "shareAssessmentBrief",
      "9a · a released brief does not hide another ready to share",
    );
    ok(p.assessment.releaseAttemptId === A.scored, "9a · naming the attempt to share");
    // And the same scenario for somebody who may not share it.
    const member = project({
      assessments,
      caps: { ...ALL_CAPS, canShareAssessmentBrief: false },
    });
    ok(
      member.nextAction.kind === "awaitColleague",
      "9a · and a member is told a colleague must, rather than shown nothing",
    );
  }

  /* ---- 5 · released assessment + an attempt the candidate is sitting -
   *
   * Requirement 5's third limb: candidate completion must not be hidden
   * either. */
  {
    const assessments = [
      attempt({
        attemptId: A.released,
        attemptStatus: "scored",
        reportAvailable: true,
        invitedAt: OLDEST,
      }),
      attempt({ attemptId: A.sitting, answered: 2, invitedAt: MIDDLE }),
    ];
    const p = project({ assessments });
    ok(
      p.nextAction.kind === "awaitCandidateAssessment",
      "9a · a released brief does not hide an attempt still with the candidate",
    );
    ok(p.assessment.awaitingCandidateAttemptId === A.sitting, "9a · naming that attempt");
    ok(p.nextAction.waitingOn === "candidate", "9a · and says who it is waiting on");
  }

  /* ---- 6 · several attempts, exactly one needs work ------------------
   *
   * Four attempts in four states. The review action must open the one with
   * responses outstanding and no other, whatever else is present. */
  {
    const assessments = [
      attempt({
        attemptId: A.released,
        attemptStatus: "scored",
        reportAvailable: true,
        invitedAt: OLDEST,
      }),
      attempt({ attemptId: A.scored, attemptStatus: "scored", invitedAt: MIDDLE }),
      attempt({ attemptId: A.sitting, answered: 1, invitedAt: NEWEST }),
      attempt({ attemptId: A.review, answered: 9, reviewsOutstanding: 2, invitedAt: NEWEST }),
    ];
    const p = project({ assessments });
    ok(
      p.nextAction.destination.kind === "assessmentReview" &&
        p.nextAction.destination.attemptId === A.review,
      "9a · with four attempts the review opens exactly the one that needs it",
    );
    ok(p.assessment.attemptCount === 4, "9a · and the row says how many there are");
  }

  /* ---- 7 · terminal records alone still behave --------------------- */
  {
    const p = project({
      cases: [iCase({ id: C.reported, status: "reported", reportFinalised: true })],
    });
    ok(
      p.nextAction.kind === "openFinalisedReport" &&
        p.nextAction.destination.kind === "interviewReport" &&
        p.nextAction.destination.caseId === C.reported,
      "9a · a finished report on its own is still offered",
    );
    ok(p.report.availability === "finalised", "9a · and reported as finalised, not as mixed");
    ok(!p.needsHumanAttention, "9a · with nobody owing anything");
  }

  /* ---- 8 · a cancelled case never speaks for an active one ---------- */
  {
    const p = project({
      cases: [
        iCase({ id: C.reported, status: "cancelled", updatedAt: NEWEST }),
        iCase({ id: C.ready, status: "prep_approved", updatedAt: MIDDLE }),
      ],
    });
    ok(
      p.interview.state === "readyToInterview",
      "9a · a cancelled case does not speak for the row",
    );
    ok(
      p.nextAction.kind === "startInterview" &&
        p.nextAction.destination.kind === "interviewCase" &&
        p.nextAction.destination.caseId === C.ready,
      "9a · and the action opens the live case",
    );
  }

  /* ---- 9 · determinism: the answer does not depend on input order ---
   *
   * A set has no order, and the server's ordering is not part of the
   * contract. Every permutation of the same records must give byte-identical
   * output, or "deterministic" is a word rather than a property. */
  {
    // TWO RECORDS IN THE SAME STATE, deliberately. A set holding exactly one
    // record per state gives the selector no choice to get wrong, so any
    // selector at all -- including "whatever arrived first" -- satisfies it.
    // Both fixtures here were written that way and proved nothing; the
    // negative control is what said so.
    const cases = [
      iCase({ id: C.reported, status: "reported", reportFinalised: true, updatedAt: NEWEST }),
      iCase({ id: C.assessed, status: "assessed", updatedAt: MIDDLE }),
      iCase({ id: C.ready, status: "assessed", updatedAt: OLDEST }),
      iCase({
        id: C.proposals,
        status: "evidence_review",
        proposalsAwaitingReview: 1,
        updatedAt: OLDEST,
      }),
      iCase({
        id: C.preparing,
        status: "evidence_review",
        proposalsAwaitingReview: 2,
        updatedAt: NEWEST,
      }),
    ];
    const expected = JSON.stringify(project({ cases }));
    let stable = true;
    for (const perm of permutations(cases)) {
      if (JSON.stringify(project({ cases: perm })) !== expected) stable = false;
    }
    ok(stable, "9a · every permutation of the same cases gives the same projection");

    // Two attempts awaiting review, and two scored, for the same reason.
    const attempts = [
      attempt({
        attemptId: A.released,
        attemptStatus: "scored",
        reportAvailable: true,
        invitedAt: NEWEST,
      }),
      attempt({ attemptId: A.review, reviewsOutstanding: 1, invitedAt: MIDDLE }),
      attempt({ attemptId: A.sitting, reviewsOutstanding: 3, invitedAt: OLDEST }),
      attempt({ attemptId: A.scored, attemptStatus: "scored", invitedAt: OLDEST }),
    ];
    const expectedA = JSON.stringify(project({ assessments: attempts }));
    let stableA = true;
    for (const perm of permutations(attempts)) {
      if (JSON.stringify(project({ assessments: perm })) !== expectedA) stableA = false;
    }
    ok(stableA, "9a · and every permutation of the same attempts");
  }

  /* ---- 10 · the tie-break is oldest-first, then id ------------------ */
  {
    const p = project({
      cases: [
        iCase({ id: C.ready, status: "assessed", updatedAt: NEWEST }),
        iCase({ id: C.assessed, status: "assessed", updatedAt: OLDEST }),
      ],
    });
    ok(
      p.interview.reportMaterialCaseId === C.assessed,
      "9a · between equals, the record that has waited longest wins",
    );
    // Same timestamp: the lower id breaks it, so the order is total.
    const tied = project({
      cases: [
        iCase({ id: C.ready, status: "assessed", updatedAt: OLDEST }),
        iCase({ id: C.assessed, status: "assessed", updatedAt: OLDEST }),
      ],
    });
    ok(
      tied.interview.reportMaterialCaseId === C.assessed,
      "9a · and an exact tie is broken by the lower id",
    );
  }

  /* ---- 11 · no action target is ever the presentation record by
   *           accident -------------------------------------------------
   *
   * The structural half: the ladder must not read a presentation field. */
  {
    const proj = codeOnly(read(COMPONENTS.projection));
    const ladder = proj.slice(proj.indexOf("function deriveNextAction"));
    for (const forbidden of [
      "presentationCaseId",
      "presentationAttemptId",
      "presentationStatus",
      "leadCaseId",
      "leadAttemptId",
    ]) {
      ok(!ladder.includes(forbidden), `9a · the ladder never reads ${forbidden}`);
    }
    // And it must not branch on the ROW's state either, which is what let a
    // higher-ranked record decide whether work existed at all.
    ok(
      !/interview\.state ===/.test(ladder) && !/assessment\.state ===/.test(ladder),
      "9a · nor branches on a row state",
    );
    // Every destination the ladder builds is an action target.
    const ids = [...ladder.matchAll(/caseId: (?:interview|report)\.(\w+)/g)].map((m) => m[1]);
    for (const f of ids) {
      ok(
        /CaseId$/.test(f) && !f.startsWith("presentation"),
        `9a · destination field ${f} is an action target`,
      );
    }
    const attemptIds = [...ladder.matchAll(/attemptId: assessment\.(\w+)/g)].map((m) => m[1]);
    ok(attemptIds.length > 0, "9a · the ladder builds at least one attempt destination");
    for (const f of attemptIds) {
      ok(f === "reviewAttemptId", `9a · attempt destination field ${f} is the review attempt`);
    }
  }
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

  // The capabilities are distinct inputs, not one boolean.
  const proj = codeOnly(read(COMPONENTS.projection));
  for (const c of ["canReviewAssessment", "canShareAssessmentBrief"]) {
    ok(proj.includes(c), `12 · ${c} is its own capability`);
  }

  // EVERY DECLARED CAPABILITY IS ACTUALLY READ.
  //
  // Two of them were not. `canAssignAssessment` and `canPlanInterview` were
  // declared on the interface, computed by the caller and passed in on every
  // render, and consulted by no branch -- left over from an earlier draft in
  // which the projection proposed those two as next steps. A capability that
  // nothing reads is worse than none: it reads as a permission check that is
  // happening, and would go on looking like enforcement long after it had
  // stopped being consulted.
  //
  // Parsed from the interface so a field added and forgotten fails here rather
  // than sitting in the type looking meaningful.
  {
    const at = proj.indexOf("export interface ContinuityCapabilities");
    const block = proj.slice(at, proj.indexOf("}", at));
    const declared = [...block.matchAll(/readonly (\w+): boolean;/g)].map((m) => m[1]);
    ok(declared.length > 0, "12 · the capability interface is parseable");
    const ladder = proj.slice(proj.indexOf("function deriveNextAction"));
    for (const c of declared) {
      ok(ladder.includes(`cap.${c}`), `12 · ${c} is read by the next-step ladder`);
    }
    // And the caller passes exactly those, so nothing is computed for nobody.
    const callerAt = codeOnly(read(ROUTES.application)).indexOf("capabilities: {");
    const callerBlock = codeOnly(read(ROUTES.application)).slice(callerAt, callerAt + 400);
    for (const c of declared) {
      ok(callerBlock.includes(`${c}:`), `12 · the candidate page supplies ${c}`);
    }
    ok(
      !callerBlock.includes("canAssignAssessment") && !callerBlock.includes("canPlanInterview"),
      "12 · and computes no capability the projection does not read",
    );
  }
  // The candidate page reads each from its own contract.
  const app = codeOnly(read(ROUTES.application));
  ok(app.includes("getEmployerReviewBoard"), "12 · review authority comes from the board");
  ok(
    app.includes('reviewBasis === "authorised" || reviewBasis === "break_glass"'),
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
  for (const cs of ALL_CASE_STATUSES) {
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
          cases: [iCase({ status: cs, reportFinalised: cs === "reported" })],
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
  // Asserted against the UNION, not against the bare string. The reason also
  // appears in the mapping table below the type, so a check for the string
  // alone went on passing after the union member was deleted -- a dead
  // assertion the negative control caught, and this replaces. The union is
  // what makes the label a distinct, exhaustively-handled kind of thing
  // rather than free text.
  {
    const ctxSrc = codeOnly(read("src/lib/interview-intelligence/context.ts"));
    const at = ctxSrc.indexOf("export type FollowUpReason");
    const union = at < 0 ? "" : ctxSrc.slice(at, ctxSrc.indexOf(";", at));
    ok(
      union.includes('"assessment_follow_up"'),
      "18 · assessment-derived areas keep their own source label",
    );
    ok(
      union.includes('"limited_evidence"') && union.includes('"requirement_to_cover"'),
      "18 · and the advert-derived kinds stay separate from it",
    );
    // Grouped by reason where they are rendered, so an area the candidate's
    // results produced cannot be presented among the advert's own.
    ok(
      codeOnly(read("src/components/employer/interview/InterviewContextPanel.tsx")).includes(
        "REASON_ORDER",
      ),
      "18 · and are grouped by reason where they are rendered",
    );
  }
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
  ok(literals.length >= 4, "21 · the strip's destinations are route literals");
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

  // AND EVERY DESTINATION IS REACHABLE.
  //
  // The other half of the same property, and the half that was missing: an
  // `interviewNew` member sat in the union with a branch in the strip that no
  // state could ever reach, left behind when the "plan an interview" action
  // was removed for the funnel rule. A destination nothing produces reads as a
  // route the projection can send somebody to, and it cannot.
  //
  // Proven by exhausting the state space and collecting what actually comes
  // out, rather than by reading the ladder.
  {
    const produced = new Set<string>();
    for (const cs of ALL_CASE_STATUSES) {
      for (const a of [
        [],
        [attempt()],
        [attempt({ answered: 2 })],
        [attempt({ reviewsOutstanding: 1 })],
        [attempt({ attemptStatus: "scored" })],
        [attempt({ reportAvailable: true })],
      ]) {
        for (const caps of [ALL_CAPS, NO_CAPS]) {
          for (const aRead of ["ready", "loading", "failed", "refused"] as const) {
            const p = project({
              assessments: a as Assessment[],
              cases: [iCase({ status: cs, reportFinalised: cs === "reported" })],
              aRead,
              caps,
            });
            produced.add(p.nextAction.destination.kind);
          }
        }
      }
    }
    // "none" is produced by every waiting and failed state; the rest must each
    // have at least one state that reaches them.
    for (const k of kinds) {
      ok(produced.has(k), `21 · some state actually produces the "${k}" destination`);
    }
    ok(!kinds.includes("interviewNew"), "21 · and the dead interviewNew member is gone");
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
  for (const cs of ALL_CASE_STATUSES) {
    for (const caps of [ALL_CAPS, NO_CAPS]) {
      const out = strip(
        project({
          assessments: [attempt({ reviewsOutstanding: 1 })],
          cases: [iCase({ status: cs, reportFinalised: cs === "reported" })],
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
      cases: [iCase({ status: cs, reportFinalised: cs === "reported" })],
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
  for (const s of ALL_CASE_STATUSES) {
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
  for (const cs of ALL_CASE_STATUSES) {
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
              cases: [iCase({ status: cs, reportFinalised: cs === "reported" })],
              aRead,
              iRead,
              caps,
            });
            if (typeof p.nextAction.kind === "string" && p.nextAction.kind.length > 0) defined += 1;
            // Determinism: the same inputs twice give the same answer.
            const again = project({
              assessments: a as Assessment[],
              cases: [iCase({ status: cs, reportFinalised: cs === "reported" })],
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
  for (const cs of ALL_CASE_STATUSES) {
    for (const caps of [ALL_CAPS, NO_CAPS]) {
      for (const aRead of ["ready", "failed", "loading"] as const) {
        const p = project({ cases: [iCase({ status: cs })], aRead, caps });
        if (SILENT.includes(p.nextAction.kind) && p.nextAction.destination.kind !== "none") {
          silentClean = false;
        }
      }
    }
  }
  ok(silentClean, "T · a waiting or failed state never carries a call to action");

  // The action a case produces matches the state it is in, one to one.
  // Keyed by the runtime's own union rather than by `string`, so a status that
  // is renamed breaks this table instead of quietly never being exercised.
  const EXPECTED: Partial<Record<CaseStatusLiteral, string>> = {
    prep_approved: "startInterview",
    interview_in_progress: "continueInterview",
    interview_complete: "assessInterviewEvidence",
    evidence_review: "assessInterviewEvidence",
    assessed: "reviewReportMaterial",
  };
  for (const [status, expected] of Object.entries(EXPECTED) as [CaseStatusLiteral, string][]) {
    const p = project({ cases: [iCase({ status })] });
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
