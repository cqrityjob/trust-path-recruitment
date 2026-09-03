// /my-career — the premium overview, asserted against the presentation
// model and the RENDERED markup.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The personal home is built around ONE most-important next step, chosen
// by the deterministic ladder in a locked order, with every other status
// shown ONCE by ONE owner. Each of the fifteen properties below was either
// a visible defect in the pre-restructure page or one careless edit from
// becoming one:
//
//   T1  a new report beats a passive "under review" status
//   T2  a reviewer's open question beats a new report
//   T3  an assessment with a deadline, or an interview, beats a new report
//   T4  "9 entries under review" is a status, never a task
//   T5  a read that failed is never rendered as zero
//   T6  a verified state can never sit beside "nothing verified"
//   T7  the same report is never rendered twice as dominant content
//   T8  exactly one primary call to action exists above the fold
//   T9  the four snapshot destinations all resolve
//   T10 the reviewer count is not in the candidate's primary navigation
//   T11 the workspace switch exposes reviewer and employer roles
//   T12 the profile line says "Grundprofil komplett", never a percentage
//   T13 an empty activity feed does not render a panel
//   T14 on a phone the primary action precedes every low-priority tool
//   T15 sv/en parity across every copy table the home reads
//
// ── WHY IT RENDERS AND WHY IT BUILDS THE MODEL ─────────────────────────
//
// The model is a pure function over query results, so every state here is
// a typed fixture and the same fixture must always give the same page. The
// components are rendered so the assertions are about what a candidate
// SEES; I18nProvider starts at "sv", so Swedish is asserted from markup and
// English from the copy tables.
//
// Run: bun run my-career-premium-overview:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";
import type { HomePresentationInput } from "../src/lib/professional-identity/home-presentation";
import type { MyAssignment } from "../src/lib/security-competency/academy-learning.functions";
import type { CandidateInterviewRow } from "../src/lib/interview-intelligence/candidate.functions";
import type { MyApplicationRow } from "../src/lib/job-intelligence/applications.functions";
import type { MyVerificationRequest } from "../src/lib/security-passport/verification.functions";

await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { NextActions } = await import("../src/components/professional-identity/NextActions");
const { CareerSnapshot } = await import("../src/components/professional-identity/CareerSnapshot");
const { RecentActivity } = await import("../src/components/professional-identity/RecentActivity");
const { ActiveWork } = await import("../src/components/professional-identity/ActiveWork");
const { ExploreAndGrow } = await import("../src/components/professional-identity/ExploreAndGrow");
const { ProfessionalIdentityHeader } = await import(
  "../src/components/professional-identity/ProfessionalIdentityHeader"
);
const { CandidateAppNav } = await import("../src/components/site/CandidateAppNav");
const { CANDIDATE_APP_NAV } = await import("../src/components/site/candidate-app-nav");
const { buildHomePresentation, MAX_SECONDARY_STATUSES } = await import(
  "../src/lib/professional-identity/home-presentation"
);
const { computeNextBestActions, ACTION_CLASSIFICATION } = await import(
  "../src/lib/professional-identity/next-best-action"
);
const { deriveVerificationAttention } = await import(
  "../src/lib/professional-identity/verification-attention"
);
const homeCopy = await import("../src/components/professional-identity/home-copy");
const actionCopy = await import("../src/components/professional-identity/next-action-copy");

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${String(detail)}`}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const render = (node: React.ReactElement): string =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-09-03T12:00:00Z");

const EMPTY: ProfessionalIdentityV1 = {
  identityVersion: "professional-identity-v1",
  displayName: null,
  accountCountry: null,
  locale: "sv",
  currentStatus: null,
  currentProfessionSlug: null,
  currentProfessionOther: null,
  currentProfessionTitleSv: null,
  currentProfessionTitleEn: null,
  yearsOfExperience: null,
  hasPassport: false,
  headline: null,
  workCountry: null,
  workSubJurisdiction: null,
  employment: [],
  claims: [],
  discovery: { hasCompletedReport: false, snapshotId: null, generatedAt: null, namesCareers: false },
  workload: {
    applicationCount: 0,
    assessmentAssignmentCount: 0,
    releasedReportCount: 0,
    releasedReportAttemptId: null,
    assessmentAssignmentAttemptId: null,
    employerWorkspaceCount: 0,
  },
  unavailable: [],
};

const identity = (over: Partial<ProfessionalIdentityV1> = {}): ProfessionalIdentityV1 => ({
  ...EMPTY,
  ...over,
});

function claim(id: string, over: Partial<ProfessionalIdentityV1["claims"][number]> = {}) {
  return {
    id,
    claimType: "certification",
    title: `Intyg ${id}`,
    issuerName: "Polismyndigheten",
    issuedOn: "2019-04-01",
    validUntil: null,
    skillLevel: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

function request(over: Partial<MyVerificationRequest> & { id: string }): MyVerificationRequest {
  return {
    claimId: null,
    periodId: null,
    kind: "cqrityjob_review",
    status: "pending",
    submittedAt: "2026-09-01T09:00:00Z",
    decidedAt: null,
    method: null,
    holderMessage: null,
    validFrom: null,
    validUntil: null,
    targetEmployerId: null,
    ...over,
  };
}

function assignment(over: Partial<MyAssignment> & { attemptId: string }): MyAssignment {
  return {
    mode: "assessment",
    programmeNameSv: "Väktare – Rekryteringsbedömning",
    programmeNameEn: "Security Officer – Recruitment Assessment",
    employerName: "Säkerhet AB",
    attemptStatus: "released",
    answered: 56,
    totalItems: 56,
    deadline: null,
    releasedAt: "2026-09-03T08:00:00Z",
    purposeSv: "Rekryteringsbedömning",
    purposeEn: "Recruitment assessment",
    ...over,
  };
}

function interview(over: Partial<CandidateInterviewRow> & { caseId: string }): CandidateInterviewRow {
  return {
    applicationId: null,
    employerName: "Nordväkt AB",
    roleTitle: "Väktare",
    status: "interview_offered",
    updatedAt: "2026-09-02T10:00:00Z",
    ...over,
  };
}

function application(over: Partial<MyApplicationRow> & { id: string }): MyApplicationRow {
  return {
    jobId: "j1",
    jobSlug: "vaktare-stockholm",
    jobTitleSv: "Väktare, Stockholm",
    jobTitleEn: "Security officer, Stockholm",
    employerName: "Säkerhet AB",
    status: "submitted",
    hasCv: true,
    cvSource: "cqrityjob_cv",
    createdAt: "2026-08-30T10:00:00Z",
    updatedAt: "2026-08-30T10:00:00Z",
    ...over,
  };
}

/** Nine self-declared claims, each with an OPEN review. */
const NINE = Array.from({ length: 9 }, (_, i) => `c${i + 1}`);
const nineClaims = NINE.map((id) => claim(id));
const nineWaiting = NINE.map((id, i) =>
  request({ id: `r-${id}`, claimId: id, submittedAt: `2026-08-2${i % 9}T09:00:00Z` }),
);

/** An established holder: profile basics answered, Passport open, a
 *  completed career-naming report. */
const ESTABLISHED = identity({
  displayName: "Mostafa Alshawi",
  accountCountry: "SE",
  workCountry: "SE",
  currentStatus: "working_in_industry",
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  currentProfessionTitleEn: "Security officer",
  yearsOfExperience: "10+",
  hasPassport: true,
  headline: "Grundare, CQrityjob",
  employment: [
    {
      id: "e1",
      employerName: "Säkerhet AB",
      roleTitle: "Väktare",
      startedOn: "2016-01-01",
      endedOn: null,
      employmentType: "full_time",
      jurisdictionCode: "SE",
      assertionLevel: "self_declared",
      verifierName: null,
      verificationMethod: null,
      verifiedOn: null,
    },
  ],
  claims: nineClaims,
  discovery: { hasCompletedReport: true, snapshotId: "s1", generatedAt: "2026-08-20", namesCareers: true },
  workload: { ...EMPTY.workload, applicationCount: 0 },
});

/** STATE A · a new report, nine entries under review, a Career Card. */
const STATE_A: HomePresentationInput = {
  identity: identity({
    ...ESTABLISHED,
    workload: { ...ESTABLISHED.workload, releasedReportCount: 1, releasedReportAttemptId: "att-1" },
  }),
  verificationAttention: deriveVerificationAttention(nineWaiting, NOW),
  assignments: { state: "ready", rows: [assignment({ attemptId: "att-1" })] },
  interviews: { state: "ready", rows: [] },
  applications: { state: "ready", rows: [] },
  savedCvCount: 1,
  careerDiscoveryOpen: false,
  now: NOW,
};

const withAttention = (input: HomePresentationInput, requests: MyVerificationRequest[]) => ({
  ...input,
  verificationAttention: deriveVerificationAttention(requests, NOW),
});

console.log("my-career-premium-overview-check");

/* ------------------------------------------------------------------ */
/* T1 · a new report beats a passive review status                     */
/* ------------------------------------------------------------------ */

group("T1 · a new report beats passive Passport review status");
{
  const m = buildHomePresentation(STATE_A);
  ck("the primary action is the released report", m.workspace.primary?.action.kind === "read_released_report", m.workspace.primary?.action.kind);
  ck("and it is classified as new for the person", m.workspace.primary?.classification === "new_for_you");
  ck("it opens the report itself", m.workspace.primary?.action.href === "/academy/report/att-1");
  ck(
    "the nine entries under review are a secondary status",
    m.workspace.secondary.some((s) => s.kind === "passport_under_review" && s.count === 9),
  );
  const html = render(<NextActions workspace={m.workspace} />);
  ck('the card says "Din nya rapport är klar"', html.includes("Din nya rapport är klar"));
  ck('the chip says "Nytt för dig"', html.includes("Nytt för dig"));
  ck("who asked, and what kind of assessment", html.includes("Säkerhet AB · Rekryteringsbedömning"));
  ck('the verb is "Läs rapporten"', html.includes(">Läs rapporten"));
  ck("nine under review, said as a status", html.includes("9 uppgifter granskas"));
  ck("no submission is demanded of entries already under review", !html.includes("Skicka in"));
}

/* ------------------------------------------------------------------ */
/* T2 · a reviewer's question beats a new report                       */
/* ------------------------------------------------------------------ */

group("T2 · candidate-action-required verification beats a new report");
{
  const m = buildHomePresentation(
    withAttention(STATE_A, [
      ...nineWaiting.slice(1),
      request({ id: "r-c1", claimId: "c1", status: "clarification_requested" }),
    ]),
  );
  ck("the primary action is the reviewer's question", m.workspace.primary?.action.kind === "respond_to_clarification", m.workspace.primary?.action.kind);
  ck("classified as action required", m.workspace.primary?.classification === "action_required");
  ck(
    "the report is still reachable as a secondary status",
    m.workspace.secondary.some((s) => s.action?.kind === "read_released_report"),
  );
  const html = render(<NextActions workspace={m.workspace} />);
  ck('the chip says "Kräver din åtgärd"', html.includes("Kräver din åtgärd"));
}

/* ------------------------------------------------------------------ */
/* T3 · a deadline or an interview beats a new report                  */
/* ------------------------------------------------------------------ */

group("T3 · assessment deadline and interview beat a new report");
{
  const withAssignment = buildHomePresentation({
    ...STATE_A,
    identity: identity({
      ...STATE_A.identity,
      workload: {
        ...STATE_A.identity.workload,
        assessmentAssignmentCount: 1,
        assessmentAssignmentAttemptId: "att-2",
      },
    }),
    assignments: {
      state: "ready",
      rows: [
        assignment({ attemptId: "att-1" }),
        assignment({
          attemptId: "att-2",
          attemptStatus: "in_progress",
          releasedAt: null,
          answered: 3,
          deadline: "2026-09-30T00:00:00Z",
          employerName: "Nordväkt AB",
        }),
      ],
    },
  });
  ck("an open assessment with a deadline is the primary", withAssignment.workspace.primary?.action.kind === "complete_assessment_assignment", withAssignment.workspace.primary?.action.kind);
  ck("and it opens the run itself", withAssignment.workspace.primary?.action.href === "/academy/att-2");
  const html = render(<NextActions workspace={withAssignment.workspace} />);
  ck("the deadline is stated", /Senast 30 september/.test(html));
  ck("the released report is the secondary status", withAssignment.workspace.secondary[0]?.action?.kind === "read_released_report");

  const withInterview = buildHomePresentation({
    ...STATE_A,
    interviews: { state: "ready", rows: [interview({ caseId: "iv-1" })] },
  });
  ck("an interview being held beats a new report", withInterview.workspace.primary?.action.kind === "prepare_interview", withInterview.workspace.primary?.action.kind);
  ck("and links to the interview information", withInterview.workspace.primary?.action.href === "/my-career/interviews/iv-1");
  const both = buildHomePresentation({
    ...STATE_A,
    interviews: { state: "ready", rows: [interview({ caseId: "iv-1" })] },
    verificationAttention: deriveVerificationAttention(
      [request({ id: "r-c1", claimId: "c1", status: "clarification_requested" })],
      NOW,
    ),
  });
  ck("an interview beats a reviewer's question, which beats a report", both.workspace.primary?.action.kind === "prepare_interview" && both.workspace.secondary[0]?.action?.kind === "respond_to_clarification");
}

/* ------------------------------------------------------------------ */
/* T4 · "9 under review" is a status, never a task                     */
/* ------------------------------------------------------------------ */

group("T4 · nine items under review is a passive status");
{
  const m = buildHomePresentation({
    ...STATE_A,
    identity: ESTABLISHED,
    assignments: { state: "ready", rows: [] },
  });
  const kinds = computeNextBestActions(ESTABLISHED, m.signals).all.map((a) => a.kind);
  ck("no submission is asked for entries already under review", !kinds.includes("submit_passport_verification"), kinds.join(","));
  const status = m.workspace.secondary.find((s) => s.kind === "passport_under_review");
  ck("the review is a secondary status", Boolean(status));
  ck("classified as in progress, nothing needed", status?.classification === "in_progress_no_action");
  ck("never as the primary", m.workspace.primary?.action.kind !== "submit_passport_verification");
  const html = render(<NextActions workspace={m.workspace} />);
  ck('rendered as "inget krävs av dig"', html.includes("inget krävs av dig"));
  ck('with "Visa status" as the way in', html.includes(">Visa status"));

  // Without the signal the engine would still count them -- proof that the
  // classification is the engine's rule, not a renderer's filter.
  const naive = computeNextBestActions(ESTABLISHED, {}).all.map((a) => a.kind);
  ck("the engine itself is what stops counting reviewed entries as pending", naive.includes("submit_passport_verification"));
  ck(
    "and a verification read that failed withholds the suggestion rather than asking for what may be in hand",
    !computeNextBestActions(ESTABLISHED, { verificationStateUnavailable: true }).all.some(
      (a) => a.kind === "submit_passport_verification",
    ),
  );
}

/* ------------------------------------------------------------------ */
/* T5 · query error ≠ zero                                             */
/* ------------------------------------------------------------------ */

group("T5 · a read that failed is never rendered as zero");
{
  const m = buildHomePresentation({
    identity: identity({ ...ESTABLISHED, unavailable: ["claims", "passport"] }),
    verificationAttention: { ...deriveVerificationAttention([], NOW), clear: false, unavailable: true },
    assignments: { state: "error" },
    interviews: { state: "error" },
    applications: { state: "error" },
    now: NOW,
  });
  ck("the Passport pillar is unavailable", m.snapshot.passport.state === "unavailable");
  ck("the assessments pillar is unavailable", m.snapshot.assessments.state === "unavailable");
  ck("the jobs pillar is unavailable", m.snapshot.jobs.state === "unavailable");
  ck("the activity feed is unavailable, not empty", m.activity.unavailable && m.activity.partial);
  const html = render(<CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "loading" }} />);
  ck("three pillars say they could not be read", count(html, "Kunde inte läsas") === 3);
  ck("no pillar prints a zero", !/>0 |0 verifierade|0 aktiva|0 att göra/.test(html));
  const feed = render(<RecentActivity activity={m.activity} now={NOW} />);
  ck("the feed says it could not be loaded rather than showing nothing", feed.includes("kunde inte hämtas"));
  ck("and it is one quiet line, not a list", !feed.includes("<ul"));

  // The engine decides nothing on a failed read.
  const kinds = computeNextBestActions(m.snapshot ? identity({ ...ESTABLISHED, unavailable: ["claims", "passport"] }) : ESTABLISHED, m.signals).all.map((a) => a.kind);
  ck("no Passport action is invented from an unreadable Passport", !kinds.includes("start_passport") && !kinds.includes("submit_passport_verification"));

  // A verification read that has not answered is not "nobody is waiting".
  const loading = buildHomePresentation({ ...STATE_A, verificationAttention: null });
  ck("an unanswered verification read passes no count to the engine", loading.signals.clarificationCount === undefined && loading.signals.underReviewSubjectIds === undefined);
  ck("and the Passport pillar says the review status is unknown rather than 0", loading.snapshot.passport.state === "counts" && loading.snapshot.passport.underReview === null);
}

/* ------------------------------------------------------------------ */
/* T6 · verified never beside "nothing verified"                       */
/* ------------------------------------------------------------------ */

group("T6 · a verified state cannot render as nothing verified");
{
  // A holder whose only verified fact is an EMPLOYMENT confirmed by an
  // employer, approved yesterday. The old header counted claims alone and
  // said "Inget ännu" beside "Nyligen verifierat".
  const holder = identity({
    ...ESTABLISHED,
    claims: [claim("c1")],
    employment: [
      {
        ...ESTABLISHED.employment[0]!,
        assertionLevel: "verified",
        verifierName: "Säkerhet AB",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2026-09-02",
      },
    ],
  });
  const m = buildHomePresentation({
    ...STATE_A,
    identity: holder,
    assignments: { state: "ready", rows: [] },
    verificationAttention: deriveVerificationAttention(
      [
        request({
          id: "r-e1",
          periodId: "e1",
          kind: "employer_attestation",
          status: "approved",
          decidedAt: "2026-09-02T10:00:00Z",
          targetEmployerId: "emp-1",
        }),
      ],
      NOW,
    ),
  });
  ck("the Passport pillar counts the confirmed employment", m.snapshot.passport.state === "counts" && m.snapshot.passport.verified === 1);
  const snapshot = render(<CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "loading" }} />);
  ck('the pillar says "1 verifierad"', snapshot.includes("1 verifierad"));
  ck("and never says nothing is verified", !/Inget ännu|Inget verifierat|0 verifierade/.test(snapshot));
  const feed = render(<RecentActivity activity={m.activity} now={NOW} />);
  ck("the approval is in the activity feed", feed.includes("Uppgift i Passport verifierad"));
  ck("dated yesterday", feed.includes(">igår<"));
  const greeting = render(<ProfessionalIdentityHeader identity={holder} variant="compact" />);
  ck("the greeting states no verified count at all", !/Verifierat|Inget ännu/.test(greeting));
  // The journey strip, when it renders for a new account, never prints "0
  // verifierade" beside a confirmed employment.
  const { CareerJourney } = await import("../src/components/professional-identity/CareerJourney");
  const journey = render(<CareerJourney identity={holder} />);
  ck("the journey says the employment is confirmed", journey.includes("1 anställning bekräftad"));
  ck('and not "0 verifierade" beside it', !journey.includes("0 verifierade"));
}

/* ------------------------------------------------------------------ */
/* T7 · one dominant representation per report                         */
/* ------------------------------------------------------------------ */

group("T7 · the same report is not rendered twice as dominant content");
{
  const m = buildHomePresentation(STATE_A);
  ck("the primary claims the report's event", m.workspace.primary?.eventIds.includes("report:att-1") === true);
  ck("the activity feed does not repeat it", !m.activity.items.some((i) => i.id === "report:att-1"));
  ck("active work does not repeat it", !m.activeWork.some((w) => w.id === "report:att-1"));
  ck("no secondary status repeats it", !m.workspace.secondary.some((s) => s.eventIds.includes("report:att-1")));
  ck("the explore section does not offer it", !m.explore.some((e) => e.action?.kind === "read_released_report"));
  const page =
    render(<NextActions workspace={m.workspace} />) +
    render(<CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "ready", href: "/security-career-assessment/report/s1", completedAt: "2026-08-20" }} />) +
    render(<RecentActivity activity={m.activity} now={NOW} />) +
    render(<ActiveWork items={m.activeWork} titleOf={() => "x"} />) +
    render(<ExploreAndGrow items={m.explore} />);
  ck("the report link appears exactly once on the page", count(page, 'href="/academy/report/att-1"') === 1);
  ck("the assessments pillar states the count, not the report", page.includes("1 rapport tillgänglig"));

  // Same rule for a clarification: claimed by the primary, absent below.
  const c = buildHomePresentation(
    withAttention(STATE_A, [request({ id: "r-c1", claimId: "c1", status: "clarification_requested" })]),
  );
  ck("a clarification claimed by the primary is not listed as active work too", !c.activeWork.some((w) => w.id === "clarification:r-c1"));
}

/* ------------------------------------------------------------------ */
/* T8 · exactly one primary CTA above the fold                         */
/* ------------------------------------------------------------------ */

group("T8 · exactly one primary call to action");
{
  const states: [string, HomePresentationInput][] = [
    ["state A", STATE_A],
    ["a reviewer waiting", withAttention(STATE_A, [request({ id: "r-c1", claimId: "c1", status: "clarification_requested" })])],
    ["calm", { ...STATE_A, identity: ESTABLISHED, assignments: { state: "ready", rows: [] }, verificationAttention: deriveVerificationAttention([], NOW) }],
    ["a brand-new account", { ...STATE_A, identity: identity({ displayName: "Ny" }), assignments: { state: "ready", rows: [] }, verificationAttention: deriveVerificationAttention([], NOW) }],
  ];
  for (const [label, input] of states) {
    const m = buildHomePresentation(input);
    const page =
      render(<ProfessionalIdentityHeader identity={input.identity} variant="compact" profileComplete={m.profileComplete} />) +
      render(<NextActions workspace={m.workspace} />) +
      render(<CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "none", closed: true }} />) +
      render(<RecentActivity activity={m.activity} now={NOW} />) +
      render(<ActiveWork items={m.activeWork} titleOf={() => "x"} />) +
      render(<ExploreAndGrow items={m.explore} />);
    ck(`${label}: exactly one primary card`, count(page, 'data-next-action="primary"') === 1);
    ck(`${label}: exactly one primary call to action`, count(page, "data-primary-cta") === 1);
    ck(`${label}: at most ${MAX_SECONDARY_STATUSES} secondary statuses`, count(page, 'data-next-action="secondary"') <= MAX_SECONDARY_STATUSES);
    // The navy surface: the primary card when something is waiting, the
    // primary button when nothing is. Never a second one.
    ck(`${label}: exactly one navy surface`, (page.match(/\bbg-primary(?![-/])/g) ?? []).length === 1);
  }
  const calm = buildHomePresentation(states[2]![1]);
  ck("the calm state is calm", calm.workspace.calm);
  const calmHtml = render(<NextActions workspace={calm.workspace} />);
  ck('and says "Du är i fas"', calmHtml.includes("Du är i fas"));
  ck("and still offers one suggestion", calmHtml.includes("data-primary-cta"));
}

/* ------------------------------------------------------------------ */
/* T9 · four destinations that resolve                                 */
/* ------------------------------------------------------------------ */

group("T9 · the four snapshot destinations resolve");
{
  const m = buildHomePresentation(STATE_A);
  const html = render(
    <CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "ready", href: "/security-career-assessment/report/s1", completedAt: "2026-08-20" }} />,
  );
  ck("four cards", count(html, "data-snapshot=") === 4);
  const ctas = Array.from(html.matchAll(/data-snapshot-cta[^>]*href="([^"]*)"|href="([^"]*)"[^>]*data-snapshot-cta/g)).map((x) => x[1] ?? x[2]);
  ck("four calls to action", ctas.length === 4, ctas.join(","));
  for (const to of ["/passport", "/security-career-assessment/report/s1", "/academy", "/jobs"]) {
    ck(`${to} is linked exactly once`, ctas.filter((h) => h === to).length === 1);
  }
  const routeIds = (() => {
    const src = read("src/routeTree.gen.ts");
    const start = src.indexOf("export interface FileRoutesById {");
    const block = src.slice(start, src.indexOf("\n}", start));
    return Array.from(block.matchAll(/^ {2}'(\/[^']*)': typeof /gm)).map((x) => x[1]!);
  })();
  for (const id of [
    "/_authenticated/passport/",
    "/_authenticated/security-career-assessment/report/$snapshotId",
    "/_authenticated/academy/",
    "/jobs/",
    "/career-center/",
    "/_authenticated/security-career-assessment/history",
  ]) {
    ck(`${id} is a real route`, routeIds.includes(id));
  }
  // Each card states its status in words the reader can see, and the four
  // states are distinguishable in markup for a guard.
  ck("statuses are carried in markup", count(html, 'data-status-state="counts"') >= 3);
  ck("the closed gate offers professions instead of a dead door", render(<CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "none", closed: true }} />).includes('href="/career-center"'));
  ck("an open gate offers the assessment", render(<CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "none", closed: false }} />).includes('href="/security-career-assessment"'));
  ck("an unreadable report stays a state, linking to the history", render(<CareerSnapshot snapshot={m.snapshot} analysis={{ kind: "unreadable", title: "Rapporten kan inte visas här", completedAt: null }} />).includes('href="/security-career-assessment/history"'));
}

/* ------------------------------------------------------------------ */
/* T10 · no reviewer count in the candidate's primary navigation       */
/* ------------------------------------------------------------------ */

group("T10 · the reviewer count is not candidate navigation");
{
  for (const variant of ["desktop", "mobile"] as const) {
    const html = render(<CandidateAppNav variant={variant} activeKey="myCareer" badgeFor={() => 34} />);
    ck(`${variant}: no reviewer link`, !html.includes('href="/reviews"'));
    ck(`${variant}: no "Granskningar"`, !html.includes("Granskningar"));
    ck(`${variant}: the five candidate destinations`, count(html, "<a ") === 5);
  }
  ck("no reviewer destination in the nav array", !CANDIDATE_APP_NAV.some((i) => i.to === "/reviews"));
  const header = code(read("src/components/site/SiteHeader.tsx"));
  ck("the header no longer renders a reviews pill", !header.includes('t("nav.reviews")'));
  ck("the only /reviews link in the header is in the account section, gated on the queue", /reviewCount > 0 && \([\s\S]{0,400}to="\/reviews"/.test(header));
}

/* ------------------------------------------------------------------ */
/* T11 · the workspace switch exposes the roles                        */
/* ------------------------------------------------------------------ */

group("T11 · workspace switch exposes reviewer and employer where authorised");
{
  const menu = code(read("src/components/site/AccountMenu.tsx"));
  const header = code(read("src/components/site/SiteHeader.tsx"));
  ck("the menu is headed as a workspace switch", menu.includes('t("account.context.switchTo")'));
  ck("the personal workspace is listed first", menu.indexOf('data-workspace="personal"') < menu.indexOf('data-workspace="employer"'));
  ck("organisations are named and typed as employers", /workspace\.employerName\} – \{t\("account\.context\.employer"\)\}/.test(menu));
  ck("the reviewer view is listed, gated on the queue", /identity\.reviewQueueCount > 0 && \(/.test(menu) && menu.includes('data-workspace="reviewer"'));
  ck("with the number of items waiting", menu.includes('tp("account.context.reviewerPending", identity.reviewQueueCount)'));
  ck("the mobile sheet carries the same three kinds of workspace", ["personal", "employer", "reviewer"].every((w) => header.includes(`data-workspace="${w}"`)));
  ck("the header hands the queue count to the menu", header.includes("reviewQueueCount: reviewCount"));
  ck("the current context knows the reviewer view", /"reviewer"/.test(header) && menu.includes('"reviewer"'));
  for (const [key, sv, en] of [
    ["account.context.switchTo", "Byt arbetsyta", "Switch workspace"],
    ["account.context.personal", "Min karriär", "My Career"],
    ["account.context.employer", "Arbetsgivare", "Employer"],
    ["account.context.reviewer", "Granskarvy", "Reviewer view"],
  ] as const) {
    ck(`sv ${key} reads "${sv}"`, dictionaries.sv[key] === sv);
    ck(`en ${key} reads "${en}"`, dictionaries.en[key] === en);
  }
  ck("no client-side role literal gates any of it", !/isReviewer|hasReviewerRole|isEmployer|role === "/.test(menu + header));
}

/* ------------------------------------------------------------------ */
/* T12 · "Grundprofil komplett", never a percentage                    */
/* ------------------------------------------------------------------ */

group("T12 · profile completion is a fact about answered sections");
{
  const complete = buildHomePresentation({ ...STATE_A, identity: ESTABLISHED });
  ck("an answered basic profile is complete", complete.profileComplete);
  const html = render(<ProfessionalIdentityHeader identity={ESTABLISHED} variant="compact" profileComplete />);
  ck('the greeting says "Grundprofil komplett"', html.includes("Grundprofil komplett"));
  ck("and never a percentage", !/%/.test(html));
  ck("the identity row reads as the brief specifies", html.includes("Grundare, CQrityjob · Sverige · 10+ års erfarenhet"));
  const partial = buildHomePresentation({ ...STATE_A, identity: identity({ ...ESTABLISHED, headline: null, currentProfessionSlug: null, currentProfessionTitleSv: null, currentProfessionTitleEn: null }) });
  ck("a missing basic section is not complete", !partial.profileComplete);
  const compact = code(read("src/components/professional-identity/ProfessionalIdentityHeader.tsx"));
  ck("the compact greeting authors no percentage", !/CompactGreeting[\s\S]*?trustProfileFilled/.test(compact.slice(compact.indexOf("function CompactGreeting"), compact.indexOf("export function ProfessionalIdentityHeader"))));
  ck("the unreadable case is withheld, not computed", !buildHomePresentation({ ...STATE_A, identity: identity({ ...ESTABLISHED, unavailable: ["profile"] }) }).profileComplete);
}

/* ------------------------------------------------------------------ */
/* T13 · an empty feed renders nothing                                 */
/* ------------------------------------------------------------------ */

group("T13 · empty sections do not consume premium space");
{
  const m = buildHomePresentation({
    ...STATE_A,
    identity: ESTABLISHED,
    assignments: { state: "ready", rows: [] },
    verificationAttention: deriveVerificationAttention([], NOW),
  });
  ck("nothing happened, so no activity items", m.activity.items.length === 0 && !m.activity.partial);
  ck("the feed renders nothing at all", render(<RecentActivity activity={m.activity} now={NOW} />) === "");
  ck("no active work, so nothing rendered", render(<ActiveWork items={m.activeWork} titleOf={() => "x"} />) === "");
  const feed = buildHomePresentation({
    ...STATE_A,
    applications: { state: "ready", rows: [application({ id: "a1" })] },
  });
  ck("with something to say the feed appears", render(<RecentActivity activity={feed.activity} now={NOW} />).includes("Ansökan skickad · Väktare, Stockholm"));
  ck("and is capped at three rows", buildHomePresentation({ ...STATE_A, applications: { state: "ready", rows: ["a1", "a2", "a3", "a4"].map((id) => application({ id })) } }).activity.items.length === 3);
}

/* ------------------------------------------------------------------ */
/* T14 · mobile order                                                  */
/* ------------------------------------------------------------------ */

group("T14 · on a phone the primary action precedes every low-priority tool");
{
  // The page stacks in DOM order at 375px: no section reorders itself with
  // CSS. So the order in the route IS the mobile order.
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  const order = ["<ProfessionalIdentityHeader", "<NextActions", "<CareerSnapshot", "<RecentActivity", "<ActiveWork", "<ExploreAndGrow"];
  const positions = order.map((tag) => route.indexOf(tag));
  ck("every section is mounted", positions.every((p) => p >= 0), positions.join(","));
  ck("in the agreed order", positions.every((p, i) => i === 0 || p > positions[i - 1]!));
  const components = [
    "src/components/professional-identity/NextActions.tsx",
    "src/components/professional-identity/CareerSnapshot.tsx",
    "src/components/professional-identity/RecentActivity.tsx",
    "src/components/professional-identity/ActiveWork.tsx",
    "src/components/professional-identity/ExploreAndGrow.tsx",
  ]
    .map((f) => code(read(f)))
    .join("\n");
  ck("no section reorders itself with CSS", !/\border-(first|last|\d)\b|\blg:order-/.test(components + route));
  const m = buildHomePresentation(STATE_A);
  const ws = render(<NextActions workspace={m.workspace} />);
  ck("the primary card precedes the secondary statuses in markup", ws.indexOf('data-next-action="primary"') < ws.indexOf('data-next-action="secondary"'));
  ck("the workspace stacks below lg", ws.includes("lg:grid-cols-12") && !/\bmd:grid-cols|\bsm:grid-cols/.test(ws.slice(0, ws.indexOf('data-next-action="primary"'))));
  ck("the primary card is full width on a phone", !/(?<!lg:)\bcol-span-\d/.test(ws.slice(ws.indexOf('data-next-action="primary"'), ws.indexOf('data-next-action="primary"') + 200)));
}

/* ------------------------------------------------------------------ */
/* T15 · sv/en parity                                                  */
/* ------------------------------------------------------------------ */

group("T15 · sv/en parity");
{
  // Every copy value the home reads is a {sv, en} pair with both halves
  // authored. Walk the tables rather than listing them.
  const pairs: { where: string; sv: string; en: string }[] = [];
  const walk = (value: unknown, where: string) => {
    if (!value || typeof value !== "object") return;
    const v = value as Record<string, unknown>;
    if (typeof v.sv === "string" && typeof v.en === "string") {
      pairs.push({ where, sv: v.sv, en: v.en });
      return;
    }
    for (const [k, child] of Object.entries(v)) walk(child, `${where}.${k}`);
  };
  walk(homeCopy, "home-copy");
  walk(actionCopy, "next-action-copy");
  ck("copy pairs were found", pairs.length > 80, pairs.length);
  ck("every pair has both languages", pairs.every((p) => p.sv.trim().length > 0 && p.en.trim().length > 0));
  const swedishOnly = pairs.filter((p) => /[åäö]/i.test(p.en) && !/Career|CQrityjob|Passport/.test(p.en));
  ck("no English string is Swedish", swedishOnly.length === 0, swedishOnly.map((p) => p.where).join(","));
  for (const key of ["nav.overview", "nav.exploreProfessions", "account.context.employer", "account.context.reviewer", "account.context.reviewerPending.one", "account.context.reviewerPending.other"] as const) {
    ck(`${key} exists in both dictionaries`, typeof dictionaries.sv[key] === "string" && typeof dictionaries.en[key] === "string");
  }
  // Every action kind has a classification and copy in both languages.
  for (const kind of Object.keys(ACTION_CLASSIFICATION) as (keyof typeof ACTION_CLASSIFICATION)[]) {
    const w = actionCopy.wordsFor(kind, null);
    ck(`${kind}: title, why, outcome and verb in both languages`, [w.title, w.why, w.outcome, w.verb].every((x) => x.sv && x.en));
  }
  // The brief's locked copy direction, in Swedish, on the surfaces.
  ck('"Viktigast just nu" is the workspace heading', homeCopy.WORKSPACE.heading.sv === "Viktigast just nu");
  ck('"Fler saker du kan göra" is the explore sub-heading', homeCopy.EXPLORE.more.sv === "Fler saker du kan göra");
  ck('"Din nya rapport är klar" is the report title', actionCopy.wordsFor("read_released_report", null).title.sv === "Din nya rapport är klar");
  ck('"Grundprofil komplett" is the completion line', homeCopy.GREETING.basicsComplete.sv === "Grundprofil komplett");
  ck('"Vi har inga relevanta roller att visa just nu." is the jobs empty state', read("src/routes/_authenticated.my-career.index.tsx").includes("Vi har inga relevanta roller att visa just nu."));
  ck('"Uppgiften har verifierats." replaces "Godkänt."', read("src/components/professional-identity/VerificationOutcomes.tsx").includes('approved: c("Uppgiften har verifierats."'));
  ck("the retired heading copy is gone", !/Ditt nästa steg|Också möjligt nu|Din karriärresa|% ifyllt/.test(code(read("src/components/professional-identity/NextActions.tsx")) + code(read("src/components/professional-identity/CareerJourney.tsx")) + code(read("src/components/professional-identity/home-copy.ts"))));
  ck("no waving emoji on the home", !/👋/.test(read("src/routes/_authenticated.my-career.index.tsx") + read("src/components/professional-identity/ProfessionalIdentityHeader.tsx")));
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`FAIL — my-career-premium-overview-check (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — my-career-premium-overview-check");
