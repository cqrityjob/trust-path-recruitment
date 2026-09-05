// /my-career — the personal career home, asserted against the ONE view
// model and the RENDERED markup.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The home is built around ONE most-important next step, chosen by the
// deterministic ladder in a locked order, with every other fact shown ONCE
// by the section that owns it. Each property below was either a visible
// defect in the pre-redesign page or one careless edit from becoming one:
//
//   T1  the ladder's locked order, rung by rung, as a table
//   T2  the Passport summary and the recommendation state the SAME count
//   T3  self-reported, evidenced, under review and verified cannot be
//       confused, and no percentage or trust score is computed
//   T4  a passive "waiting for the employer" state is never a task
//   T5  a read that failed is never rendered as zero
//   T6  a verified state can never sit beside "nothing verified"
//   T7  the same report is never rendered twice as dominant content
//   T8  exactly one primary call to action exists above the fold
//   T9  every section resolves for every fixture in the brief
//   T10 the reviewer count is not in the candidate's primary navigation
//   T11 the workspace switch exposes reviewer and employer roles
//   T12 the profile line says "Grundprofil komplett", never a percentage
//   T13 no empty container is rendered
//   T14 mobile order is source order, and the Passport is early
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
// The fixtures are the SHARED ones (career-home-fixtures.ts), which the
// development preview route also renders. What a reviewer looks at and what
// CI checks are then the same account.
//
// Run: bun run my-career-premium-overview:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";
import type { HomePresentationInput } from "../src/lib/professional-identity/home-presentation";

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
const { CareerPageHeader } =
  await import("../src/components/professional-identity/CareerPageHeader");
const { NextBestAction } = await import("../src/components/professional-identity/NextBestAction");
const { PassportSummary } = await import("../src/components/professional-identity/PassportSummary");
const { CareerDirectionSection } =
  await import("../src/components/professional-identity/CareerDirectionSection");
const { JobRecommendations } =
  await import("../src/components/professional-identity/JobRecommendations");
const { ApplicationsAndResults } =
  await import("../src/components/professional-identity/ApplicationsAndResults");
const { CareerTools } = await import("../src/components/professional-identity/CareerTools");
const { RecentActivity } = await import("../src/components/professional-identity/RecentActivity");
const { ProfessionalIdentityHeader } =
  await import("../src/components/professional-identity/ProfessionalIdentityHeader");
const { CandidateAppNav } = await import("../src/components/site/CandidateAppNav");
const { CANDIDATE_APP_NAV } = await import("../src/components/site/candidate-app-nav");
const { buildCareerHomeViewModel } =
  await import("../src/lib/professional-identity/home-presentation");
const { computeNextBestActions, ACTION_CLASSIFICATION } =
  await import("../src/lib/professional-identity/next-best-action");
const { deriveVerificationAttention } =
  await import("../src/lib/professional-identity/verification-attention");
const { countMerits, countReadyForVerification } =
  await import("../src/lib/professional-identity/passport-merits");
const fixtures = await import("../src/lib/professional-identity/fixtures/career-home-fixtures");
const homeCopy = await import("../src/components/professional-identity/home-copy");
const actionCopy = await import("../src/components/professional-identity/next-action-copy");

const {
  FIXTURES,
  FIXTURE_NOW: NOW,
  ACTIVE_NONE,
  activeV31,
  application,
  assignment,
  claim,
  fixtureById,
  identity,
  interview,
  job,
  request,
  storedReport,
} = fixtures;

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${String(detail)}`}`,
  );
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

/** The whole page, in the order the route mounts it. */
function renderPage(input: HomePresentationInput): {
  m: ReturnType<typeof buildCareerHomeViewModel>;
  html: string;
} {
  const m = buildCareerHomeViewModel(input);
  return {
    m,
    html:
      render(<CareerPageHeader profile={m.profile} />) +
      render(<NextBestAction next={m.nextAction} calm={m.calm} />) +
      render(<PassportSummary passport={m.passport} />) +
      render(<CareerDirectionSection career={m.career} />) +
      render(<JobRecommendations jobs={m.jobs} />) +
      render(<ApplicationsAndResults assessments={m.assessments} jobs={m.jobs} />) +
      render(<CareerTools tools={m.tools} />) +
      render(<RecentActivity activity={m.activity} now={NOW} />),
  };
}

const fixture = (id: string): HomePresentationInput => {
  const f = fixtureById(id);
  if (!f) throw new Error(`unknown fixture: ${id}`);
  return f.input;
};

/** The established holder, as most of the ladder assertions want them:
 *  Passport open, analysis complete, every read answered. */
const ESTABLISHED = fixture("eight_unverified").identity;
const ANSWERED: Omit<HomePresentationInput, "identity"> = {
  verificationAttention: deriveVerificationAttention([], NOW),
  assignments: { state: "ready", rows: [] },
  interviews: { state: "ready", rows: [] },
  applications: { state: "ready", rows: [] },
  jobs: { state: "ready", rows: [] },
  activeReport: activeV31(),
  storedReport: storedReport(),
  careerDiscoveryOpen: false,
  now: NOW,
};

console.log("my-career-premium-overview-check");

/* ------------------------------------------------------------------ */
/* T1 · the locked priority ladder, rung by rung                       */
/* ------------------------------------------------------------------ */

group("T1 · the ladder answers each rung, in the locked order");
{
  // Each row is a state of the world plus the rung it must resolve to. A
  // table rather than prose, because "which action wins" is a product
  // decision that has to be readable and re-checkable in one place.
  const LADDER: readonly {
    p: number;
    label: string;
    input: HomePresentationInput;
    kind: string;
  }[] = [
    {
      p: 0,
      label: "a required action with a deadline",
      input: fixture("assessment_deadline"),
      kind: "complete_assessment_assignment",
    },
    {
      p: 0,
      label: "a reviewer is waiting on the candidate",
      input: {
        ...ANSWERED,
        identity: ESTABLISHED,
        verificationAttention: deriveVerificationAttention(
          [
            request({
              id: "r1",
              claimId: "c1",
              status: "clarification_requested",
              decidedAt: "2026-09-04T09:00:00Z",
            }),
          ],
          NOW,
        ),
      },
      kind: "respond_to_clarification",
    },
    {
      p: 1,
      label: "a result was released to the candidate",
      input: fixture("released_and_waiting"),
      kind: "read_released_report",
    },
    {
      p: 2,
      label: "the career analysis has not been taken",
      input: fixture("new_user"),
      kind: "take_career_discovery",
    },
    {
      p: 3,
      label: "the Passport holds no merits",
      input: {
        ...ANSWERED,
        identity: identity({ ...ESTABLISHED, claims: [], employment: [] }),
      },
      kind: "start_passport",
    },
    {
      p: 4,
      label: "the Passport holds unfinished drafts",
      input: {
        ...ANSWERED,
        identity: identity({
          ...ESTABLISHED,
          claims: [],
          employment: [],
          workload: { draftClaimCount: 2 },
        }),
      },
      kind: "resume_draft_merits",
    },
    {
      p: 5,
      label: "merits are ready to send to a verifier",
      input: fixture("eight_unverified"),
      kind: "submit_passport_verification",
    },
    {
      p: 6,
      label: "relevant jobs exist for somebody who is looking",
      input: {
        ...ANSWERED,
        identity: identity({
          ...ESTABLISHED,
          currentStatus: "changing_role",
          claims: [
            claim("v1", {
              assertionLevel: "verified",
              verifierName: "CQrityjob",
              verificationMethod: "document_review",
              verifiedOn: "2026-06-01",
            }),
          ],
          employment: [],
        }),
        jobs: { state: "ready", rows: [job({ id: "j1", slug: "s1" })] },
      },
      kind: "explore_jobs",
    },
  ];

  for (const row of LADDER) {
    const m = buildCareerHomeViewModel(row.input);
    ck(
      `P${row.p} · ${row.label} → ${row.kind}`,
      m.nextAction?.action.kind === row.kind && m.nextAction?.action.priority === row.p,
      `${m.nextAction?.action.priority}:${m.nextAction?.action.kind}`,
    );
  }

  // The rungs are strictly ordered: the deadline beats the reviewer, the
  // reviewer beats the released result, and the released result beats the
  // Passport work. Asserted by piling the states on top of each other.
  const piled = buildCareerHomeViewModel({
    ...fixture("assessment_deadline"),
    verificationAttention: deriveVerificationAttention(
      [
        request({
          id: "r1",
          claimId: "c1",
          status: "clarification_requested",
          decidedAt: "2026-09-04T09:00:00Z",
        }),
      ],
      NOW,
    ),
    identity: identity({
      ...fixture("assessment_deadline").identity,
      workload: {
        ...fixture("assessment_deadline").identity.workload,
        releasedReportCount: 1,
        releasedReportAttemptId: "att-released",
      },
    }),
  });
  ck(
    "a deadlined assessment outranks a reviewer's question and a released result",
    piled.nextAction?.action.kind === "complete_assessment_assignment",
    piled.nextAction?.action.kind,
  );
  ck(
    "and the state key names the rung it came from",
    piled.nextAction?.action.stateKey === "p0:complete_assessment_assignment",
  );
}

/* ------------------------------------------------------------------ */
/* T2 · the recommendation and the Passport state ONE count            */
/* ------------------------------------------------------------------ */

group("T2 · one number for one fact");
{
  const input = fixture("eight_unverified");
  const { m, html } = renderPage(input);
  const counts = countMerits(input.identity, input.verificationAttention, NOW);

  ck("eight merits are recorded", counts.addedCount === 8, counts.addedCount);
  ck("none of them is verified", counts.verifiedCount === 0);
  ck(
    "the recommendation is about the same eight",
    m.nextAction?.action.count === counts.addedCount,
    `${m.nextAction?.action.count} vs ${counts.addedCount}`,
  );
  ck(
    "the ladder and the summary count through the same module",
    countReadyForVerification(input.identity, [], NOW) === counts.addedCount,
  );
  // The brief's exact sentences, on the rendered page.
  ck("the eyebrow is the recommendation label", html.includes("Rekommenderat nästa steg"));
  ck('the title is "Verifiera dina meriter"', html.includes("Verifiera dina meriter"));
  ck(
    "the body states the count and what verification is for",
    html.includes(
      "Du har 8 registrerade meriter som ännu inte är verifierade. Verifierade meriter stärker ditt Security Passport när du delar det med arbetsgivare.",
    ),
  );
  ck(
    'the primary CTA is "Välj meriter att verifiera"',
    html.includes("Välj meriter att verifiera"),
  );
  ck('the secondary link is "Lägg till en merit"', html.includes("Lägg till en merit"));
  ck(
    "and the secondary is a link rather than a second button",
    count(html, "data-primary-cta") === 1 && html.includes("data-secondary-link"),
  );
}

/* ------------------------------------------------------------------ */
/* T3 · four states that cannot be confused, and no score              */
/* ------------------------------------------------------------------ */

group("T3 · self-reported, evidenced, under review and verified stay apart");
{
  const mixed = identity({
    ...ESTABLISHED,
    claims: [
      claim("a", { assertionLevel: "self_declared" }),
      claim("b", { assertionLevel: "document_provided" }),
      claim("c", { assertionLevel: "self_declared" }),
      claim("d", {
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2026-06-01",
      }),
      claim("e", {
        assertionLevel: "verified",
        verifierName: "CQrityjob",
        verificationMethod: "document_review",
        verifiedOn: "2024-06-01",
        validUntil: "2026-01-01",
      }),
    ],
    employment: [],
  });
  const attention = deriveVerificationAttention([request({ id: "r1", claimId: "c" })], NOW);
  const counts = countMerits(mixed, attention, NOW);
  ck("five merits recorded", counts.addedCount === 5, counts.addedCount);
  ck("one has a document attached and nobody has assessed it", counts.documentProvidedCount === 1);
  ck("one is under review", counts.pendingCount === 1, counts.pendingCount);
  ck("one is verified", counts.verifiedCount === 1, counts.verifiedCount);
  ck("and the lapsed one is NOT counted as verified", counts.expiredCount === 1);

  const html = render(
    <PassportSummary
      passport={
        buildCareerHomeViewModel({ ...ANSWERED, identity: mixed, verificationAttention: attention })
          .passport
      }
    />,
  );
  for (const label of ["Registrerade meriter", "Under verifiering", "Verifierade meriter"]) {
    ck(`"${label}" is stated in words`, html.includes(label));
  }
  ck(
    "the explanation keeps 'added by you' and 'verified' apart",
    html.includes(
      "Dina egna uppgifter märks som tillagda av dig. En merit visas som verifierad först när en behörig part har bekräftat den.",
    ),
  );
  // The six per-merit labels the brief names, all authored.
  for (const key of [
    "added_by_you",
    "document_provided",
    "verification_requested",
    "clarification_needed",
    "verified",
    "expired",
  ] as const) {
    ck(
      `the "${key}" merit label is authored in both languages`,
      Boolean(homeCopy.MERIT_LABEL[key]?.sv && homeCopy.MERIT_LABEL[key]?.en),
    );
  }
  ck(
    "a verified merit names the organisation that decided",
    homeCopy.MERIT_LABEL.verified.sv.includes("{0}"),
  );
  // No score of any kind.
  ck("no percentage is rendered", !/%/.test(html));
  const meritSrc = code(read("src/lib/professional-identity/passport-merits.ts"));
  ck(
    "and nothing computes a ratio, a score or a completeness figure",
    !/percent|ratio|score|\/\s*addedCount/i.test(meritSrc),
  );
}

/* ------------------------------------------------------------------ */
/* T4 · a passive state is a status, never a task                      */
/* ------------------------------------------------------------------ */

group("T4 · waiting for the employer is never a candidate task");
{
  const { m, html } = renderPage(fixture("released_and_waiting"));
  ck(
    "three assessments are waiting on the employer",
    m.assessments.state === "ready" && m.assessments.waitingCount === 3,
  );
  ck(
    "and it is said as a status, in the brief's words",
    html.includes(
      "3 tester väntar på resultat från arbetsgivaren. Du behöver inte göra något just nu.",
    ),
  );
  ck("classified as in progress, nothing needed", html.includes("Pågår – inget krävs av dig"));
  ck("never as the primary action", m.nextAction?.classification !== "in_progress_no_action");
  // Structurally impossible, not merely absent: no rule on the ladder emits
  // a passive kind.
  ck(
    "no action kind is classified as passive",
    !Object.values(ACTION_CLASSIFICATION).includes("in_progress_no_action"),
  );

  // Under review is a status too, and nothing is demanded of entries
  // somebody is already looking at.
  const underReview = buildCareerHomeViewModel(fixture("under_verification"));
  ck(
    "entries already under review are not asked to be submitted",
    underReview.nextAction?.action.kind !== "submit_passport_verification",
    underReview.nextAction?.action.kind,
  );
  ck(
    "the Passport summary states them as a count, not as a demand",
    underReview.passport.state === "counts" && underReview.passport.counts.pendingCount === 8,
    underReview.passport.state === "counts" ? underReview.passport.counts.pendingCount : "n/a",
  );
  ck(
    "and the engine itself is what stops counting them",
    computeNextBestActions(
      fixture("under_verification").identity,
      { underReviewSubjectIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "emp-period-1"] },
      NOW,
    ).all.every((a) => a.kind !== "submit_passport_verification"),
  );
}

/* ------------------------------------------------------------------ */
/* T5 · a read that failed is never rendered as zero                   */
/* ------------------------------------------------------------------ */

group("T5 · a read that failed is never rendered as zero");
{
  const { m, html } = renderPage(fixture("partial_failure"));
  ck("the Passport summary is unavailable", m.passport.state === "unavailable");
  ck("the career picture is unavailable", m.career.state === "unavailable");
  ck("the jobs section is unavailable", m.jobs.state === "unavailable");
  ck("the tests section is unavailable", m.assessments.state === "unavailable");
  ck("the activity feed is partial", m.activity.partial);
  ck(
    "every failed section says so in words",
    count(html, "kunde inte") >= 4,
    count(html, "kunde inte"),
  );
  ck("and no section prints a zero", !/>0<\/p>/.test(html));
  ck(
    "no Passport action is invented from an unreadable Passport",
    m.nextAction?.action.kind !== "submit_passport_verification" &&
      m.nextAction?.action.kind !== "start_passport",
    m.nextAction?.action.kind,
  );
  ck(
    "an unanswered verification read passes no count to the engine",
    m.signals.clarificationCount === undefined && m.signals.underReviewSubjectIds === undefined,
  );
}

/* ------------------------------------------------------------------ */
/* T6 · a verified state cannot render as nothing verified             */
/* ------------------------------------------------------------------ */

group("T6 · a verified merit is never reported as none");
{
  const holder = identity({
    ...ESTABLISHED,
    claims: [],
    employment: [
      {
        id: "e1",
        employerName: "Nordväkt AB",
        roleTitle: "Väktare",
        startedOn: "2018-01-01",
        endedOn: null,
        employmentType: "full_time",
        jurisdictionCode: "SE",
        assertionLevel: "verified",
        verifierName: "Nordväkt AB",
        verificationMethod: "employer_attestation",
        verifiedOn: "2026-09-04",
      },
    ],
  });
  const attention = deriveVerificationAttention(
    [request({ id: "r1", periodId: "e1", status: "approved", decidedAt: "2026-09-04T09:00:00Z" })],
    NOW,
  );
  const m = buildCareerHomeViewModel({
    ...ANSWERED,
    identity: holder,
    verificationAttention: attention,
  });
  ck(
    "the Passport summary counts the confirmed employment",
    m.passport.state === "counts" && m.passport.counts.verifiedCount === 1,
  );
  ck(
    "and never says nothing is verified",
    !render(<PassportSummary passport={m.passport} />).includes("0</p>\n"),
  );
  // THE contradiction the redesign exists to remove: the activity feed says
  // a merit was verified, so the summary must agree.
  const approved = m.activity.all.find((a) => a.kind === "verification_approved");
  ck("the approval is in the activity feed", Boolean(approved));
  ck(
    "and the summary agrees with it",
    m.passport.state === "counts" && m.passport.counts.verifiedCount > 0,
  );
}

/* ------------------------------------------------------------------ */
/* T7 · one report, one dominant place                                 */
/* ------------------------------------------------------------------ */

group("T7 · the released result is announced once");
{
  const { m, html } = renderPage(fixture("released_and_waiting"));
  ck(
    "the primary claims the report's event",
    m.nextAction?.eventIds.includes("report:att-released") === true,
  );
  ck(
    "the activity feed does not repeat it",
    !m.activity.all.some((a) => a.id === "report:att-released"),
  );
  ck(
    "the report link appears exactly once on the page",
    count(html, 'href="/academy/report/att-released"') === 1,
    count(html, 'href="/academy/report/att-released"'),
  );
  // The oversized report hero is gone: the report has no card of its own.
  ck(
    "and the employer's report owns no hero of its own",
    count(html, 'data-next-action="primary"') === 1,
  );
}

/* ------------------------------------------------------------------ */
/* T8 · exactly one primary call to action                             */
/* ------------------------------------------------------------------ */

group("T8 · exactly one primary call to action, in every fixture");
{
  for (const f of FIXTURES) {
    const { html } = renderPage(f.input);
    ck(`${f.id}: one primary card`, count(html, 'data-next-action="primary"') === 1);
    ck(`${f.id}: one primary call to action`, count(html, "data-primary-cta") === 1);
  }
  // The calm state is calm: a suggestion, on a light card, never the navy
  // treatment reserved for something waiting on the person.
  const calm = buildCareerHomeViewModel(fixture("established"));
  ck(
    "an established holder's recommendation is a suggestion",
    calm.nextAction?.classification === "suggestion",
  );
  const html = render(<NextBestAction next={calm.nextAction} calm={calm.calm} />);
  // The card's OWN class, not the page's: the CTA button inside a light card
  // is legitimately navy, and the rule is about the SURFACE.
  const card = html.slice(html.indexOf('data-next-action="primary"'));
  ck(
    "and it is not rendered on the dark surface",
    !card.slice(0, card.indexOf(">")).includes("bg-primary text-primary-foreground"),
  );
}

/* ------------------------------------------------------------------ */
/* T9 · every section resolves, for every fixture in the brief         */
/* ------------------------------------------------------------------ */

group("T9 · every section resolves for every fixture");
{
  for (const f of FIXTURES) {
    const { m, html } = renderPage(f.input);
    ck(`${f.id}: exactly one h1`, count(html, "<h1") === 1);
    ck(`${f.id}: the Passport section renders`, html.includes("data-passport-summary"));
    ck(`${f.id}: the career section renders`, html.includes("data-career-direction"));
    ck(`${f.id}: the jobs section renders`, html.includes("data-job-recommendations"));
    ck(`${f.id}: the work section renders`, html.includes("data-applications-and-results"));
    ck(
      `${f.id}: every section heading is an h2`,
      !/<h3[^>]*>\s*(Mitt Security Passport|Din karriärbild|Lediga jobb)/.test(html),
    );
    ck(`${f.id}: the model version is stated`, m.version === "career-home-view-model-v1");
  }
  // The career picture states the report's own recommendation, never one
  // this page computed.
  const ready = buildCareerHomeViewModel(fixture("eight_unverified"));
  ck(
    "the top occupation comes from the frozen report",
    ready.career.state === "ready" && ready.career.topRole?.titleSv === "Säkerhetssamordnare",
  );
  ck(
    "with up to two alternatives",
    ready.career.state === "ready" && ready.career.alternativeRoles.length === 2,
  );
  ck(
    "and the strength themes the report named",
    ready.career.state === "ready" && ready.career.strengthThemes.length === 2,
  );
  const careerHtml = render(<CareerDirectionSection career={ready.career} />);
  ck(
    "guidance is stated as guidance, never as a verdict",
    careerHtml.includes("Det är vägledning, inte ett bevis på kompetens"),
  );
  ck(
    "no ranking, suitability or readiness language reaches the page",
    !/rankning|lämplighet|lämplig för|redo för|sannolikhet|poäng|betyg\b/i.test(careerHtml),
  );

  // A candidate whose only assessment is v2.1 is never told they have none.
  const legacy = buildCareerHomeViewModel({
    ...ANSWERED,
    identity: identity({
      ...ESTABLISHED,
      discovery: {
        hasCompletedReport: false,
        snapshotId: null,
        generatedAt: null,
        namesCareers: false,
      },
    }),
    activeReport: { kind: "legacy_v21", runId: "run-1", completedAt: "2025-05-01T09:00:00Z" },
    storedReport: undefined,
  });
  ck("a legacy report is a result, not an absence", legacy.career.state === "legacy");
  ck(
    "and it opens where that instrument's report lives",
    legacy.career.state === "legacy" && legacy.career.reportHref === "/my-career/reports/run-1",
  );

  // No supported job recommendations: a compact, actionable empty state.
  const noJobs = renderPage(fixture("no_matching_jobs"));
  ck("no matching jobs is an empty state, not a failure", noJobs.html.includes("data-jobs-empty"));
  ck(
    "with the brief's title",
    noJobs.html.includes("Vi hittade inga jobb som matchar din inriktning just nu"),
  );
  ck(
    "and both of the brief's actions",
    noJobs.html.includes("Se alla jobb") && noJobs.html.includes("Komplettera mina uppgifter"),
  );
  ck("four live applications are still stated", noJobs.html.includes("4 aktiva ansökningar"));
  ck(
    "and the selection never claims a personal match",
    !/matchar dig|personlig matchning för dig|rekommenderade för dig/i.test(noJobs.html),
  );
}

/* ------------------------------------------------------------------ */
/* T10 · no reviewer count in the candidate's primary navigation       */
/* ------------------------------------------------------------------ */

group("T10 · the reviewer count is not candidate navigation");
{
  for (const variant of ["desktop", "mobile"] as const) {
    const html = render(
      <CandidateAppNav variant={variant} activeKey="myCareer" badgeFor={() => 34} />,
    );
    ck(`${variant}: no reviewer link`, !html.includes('href="/reviews"'));
    ck(`${variant}: no "Granskningar"`, !html.includes("Granskningar"));
    ck(`${variant}: the five candidate destinations`, count(html, "<a ") === 5);
  }
  ck(
    "no reviewer destination in the nav array",
    !CANDIDATE_APP_NAV.some((i) => i.to === "/reviews"),
  );
  const header = code(read("src/components/site/SiteHeader.tsx"));
  ck("the header no longer renders a reviews pill", !header.includes('t("nav.reviews")'));
  ck(
    "the only /reviews link in the header is in the account section, gated on the queue",
    /reviewCount > 0 && \([\s\S]{0,400}to="\/reviews"/.test(header),
  );
}

/* ------------------------------------------------------------------ */
/* T11 · the workspace switch exposes the roles                        */
/* ------------------------------------------------------------------ */

group("T11 · workspace switch exposes reviewer and employer where authorised");
{
  const menu = code(read("src/components/site/AccountMenu.tsx"));
  const header = code(read("src/components/site/SiteHeader.tsx"));
  ck("the menu is headed as a workspace switch", menu.includes('t("account.context.switchTo")'));
  ck(
    "the personal workspace is listed first",
    menu.indexOf('data-workspace="personal"') < menu.indexOf('data-workspace="employer"'),
  );
  ck(
    "organisations are named and typed as employers",
    /workspace\.employerName\} – \{t\("account\.context\.employer"\)\}/.test(menu),
  );
  ck(
    "the reviewer view is listed, gated on the queue",
    /identity\.reviewQueueCount > 0 && \(/.test(menu) && menu.includes('data-workspace="reviewer"'),
  );
  ck(
    "with the number of items waiting",
    menu.includes('tp("account.context.reviewerPending", identity.reviewQueueCount)'),
  );
  ck(
    "the mobile sheet carries the same three kinds of workspace",
    ["personal", "employer", "reviewer"].every((w) => header.includes(`data-workspace="${w}"`)),
  );
  ck(
    "the header hands the queue count to the menu",
    header.includes("reviewQueueCount: reviewCount"),
  );
  ck(
    "the current context knows the reviewer view",
    /"reviewer"/.test(header) && menu.includes('"reviewer"'),
  );
  for (const [key, sv, en] of [
    ["account.context.switchTo", "Byt arbetsyta", "Switch workspace"],
    ["account.context.personal", "Min karriär", "My Career"],
    ["account.context.employer", "Arbetsgivare", "Employer"],
    ["account.context.reviewer", "Granskarvy", "Reviewer view"],
  ] as const) {
    ck(`sv ${key} reads "${sv}"`, dictionaries.sv[key] === sv);
    ck(`en ${key} reads "${en}"`, dictionaries.en[key] === en);
  }
  ck(
    "no client-side role literal gates any of it",
    !/isReviewer|hasReviewerRole|isEmployer|role === "/.test(menu + header),
  );
}

/* ------------------------------------------------------------------ */
/* T12 · "Grundprofil komplett", never a percentage                    */
/* ------------------------------------------------------------------ */

group("T12 · profile completion is a fact about answered sections");
{
  const complete = buildCareerHomeViewModel(fixture("eight_unverified"));
  ck("an answered basic profile is complete", complete.profile.complete);
  const html = render(<CareerPageHeader profile={complete.profile} />);
  ck('the header says "Grundprofil komplett"', html.includes("Grundprofil komplett"));
  ck("and never a percentage", !/%/.test(html));
  ck(
    "the identity row is role, country and the way to edit them",
    html.includes("Väktare med inriktning mot larm och teknik · Sverige") &&
      html.includes("Redigera mina uppgifter"),
  );
  ck("the h1 is the brief's heading", html.includes("Din karriär, Amina"));
  ck("and the lede is the brief's sentence", html.includes(homeCopy.HEADER.lede.sv));

  const partial = buildCareerHomeViewModel({
    ...ANSWERED,
    identity: identity({
      ...ESTABLISHED,
      headline: null,
      currentProfessionSlug: null,
      currentProfessionTitleSv: null,
      currentProfessionTitleEn: null,
    }),
  });
  ck("a missing basic section is not complete", !partial.profile.complete);
  ck(
    "the unreadable case is withheld, not computed",
    !buildCareerHomeViewModel({
      ...ANSWERED,
      identity: identity({ ...ESTABLISHED, unavailable: ["profile"] }),
    }).profile.complete,
  );

  // The name rule: preferred name, then the account's first name, then no
  // name at all. Never an email local part.
  ck(
    "a preferred name wins",
    buildCareerHomeViewModel({ ...ANSWERED, identity: ESTABLISHED, preferredName: "Mina" }).profile
      .greetingName === "Mina",
  );
  ck(
    "otherwise the account's first name",
    buildCareerHomeViewModel({ ...ANSWERED, identity: ESTABLISHED }).profile.greetingName ===
      "Amina",
  );
  ck(
    "and with neither, no name is invented",
    buildCareerHomeViewModel({
      ...ANSWERED,
      identity: identity({ ...ESTABLISHED, displayName: null }),
    }).profile.greetingName === null,
  );
  ck(
    "the route never falls back to the email local part",
    !/email.*split\("@"\)/.test(code(read("src/routes/_authenticated.my-career.index.tsx"))),
  );
}

/* ------------------------------------------------------------------ */
/* T13 · no empty container is rendered                                */
/* ------------------------------------------------------------------ */

group("T13 · empty sections do not consume premium space");
{
  const m = buildCareerHomeViewModel({ ...ANSWERED, identity: ESTABLISHED });
  ck(
    "nothing happened, so no activity items",
    m.activity.items.length === 0 && !m.activity.partial,
  );
  ck(
    "the feed renders nothing at all",
    render(<RecentActivity activity={m.activity} now={NOW} />) === "",
  );
  ck("an empty tools list renders nothing", render(<CareerTools tools={[]} />) === "");

  const feed = buildCareerHomeViewModel({
    ...ANSWERED,
    identity: ESTABLISHED,
    applications: { state: "ready", rows: [application({ id: "a1" })] },
  });
  ck(
    "with something to say the feed appears",
    render(<RecentActivity activity={feed.activity} now={NOW} />).includes(
      "Ansökan skickad · Väktare, Stockholm",
    ),
  );
  const many = buildCareerHomeViewModel({
    ...ANSWERED,
    identity: ESTABLISHED,
    applications: {
      state: "ready",
      rows: ["a1", "a2", "a3", "a4"].map((id) =>
        application({ id, createdAt: `2026-08-2${id.slice(1)}T09:00:00Z` }),
      ),
    },
  });
  ck("and is capped at three rows", many.activity.items.length === 3);
  ck(
    "with the rest behind one disclosure",
    many.activity.hasMore && many.activity.all.length === 4,
  );
  ck(
    "which is a control, not a link to a page that does not exist",
    render(<RecentActivity activity={many.activity} now={NOW} />).includes(
      "data-show-all-activity",
    ),
  );

  // A tool that cannot produce a result is not offered at all.
  const noHistory = buildCareerHomeViewModel({
    ...ANSWERED,
    identity: identity({ ...ESTABLISHED, employment: [], claims: [] }),
  });
  ck("no CV tool for somebody with no history", !noHistory.tools.some((t) => t.key === "cv"));
  ck(
    "and no CV sentence contradicting itself",
    !render(<CareerTools tools={noHistory.tools} />).includes("Byggt av de meriter"),
  );
  ck(
    "the CV tool IS offered once there is history",
    buildCareerHomeViewModel({ ...ANSWERED, identity: ESTABLISHED }).tools.some(
      (t) => t.key === "cv",
    ),
  );
}

/* ------------------------------------------------------------------ */
/* T14 · mobile order is source order                                  */
/* ------------------------------------------------------------------ */

group("T14 · the page order, and the Passport early");
{
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  const order = [
    "<CareerPageHeader",
    "<NextBestAction",
    "<PassportSummary",
    "<CareerDirectionSection",
    "<JobRecommendations",
    "<ApplicationsAndResults",
    "<CareerTools",
    "<RecentActivity",
  ];
  const positions = order.map((tag) => route.indexOf(tag));
  ck(
    "every section is mounted",
    positions.every((p) => p >= 0),
    positions.join(","),
  );
  ck(
    "in the brief's order",
    positions.every((p, i) => i === 0 || p > positions[i - 1]!),
    positions.join(","),
  );
  const components = [
    "src/components/professional-identity/CareerPageHeader.tsx",
    "src/components/professional-identity/NextBestAction.tsx",
    "src/components/professional-identity/PassportSummary.tsx",
    "src/components/professional-identity/CareerDirectionSection.tsx",
    "src/components/professional-identity/JobRecommendations.tsx",
    "src/components/professional-identity/ApplicationsAndResults.tsx",
    "src/components/professional-identity/CareerTools.tsx",
    "src/components/professional-identity/RecentActivity.tsx",
  ]
    .map((f) => code(read(f)))
    .join("\n");
  ck(
    "no section reorders itself with CSS",
    !/\border-(first|last|\d)\b|\blg:order-/.test(components + route),
  );
  ck(
    "the two-column pair is a desktop-only split",
    /lg:col-span-7/.test(route) &&
      /lg:col-span-5/.test(route) &&
      !/\bmd:col-span|\bsm:col-span/.test(route),
  );
  // Every interactive target is at least 44px tall.
  const { html } = renderPage(fixture("eight_unverified"));
  const anchors = [...html.matchAll(/<a [^>]*class="([^"]*)"/g)].map((m) => m[1]!);
  const short = anchors.filter((c) => !/min-h-11/.test(c) && !/rounded-xl border/.test(c));
  ck(
    "every link is at least 44px tall or is a full card",
    short.length === 0,
    short.slice(0, 2).join(" | "),
  );
}

/* ------------------------------------------------------------------ */
/* T15 · sv/en parity                                                  */
/* ------------------------------------------------------------------ */

group("T15 · sv/en parity");
{
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
  ck(
    "every pair has both languages",
    pairs.every((p) => p.sv.trim().length > 0 && p.en.trim().length > 0),
  );
  const swedishOnly = pairs.filter(
    (p) => /[åäö]/i.test(p.en) && !/Career|CQrityjob|Passport/.test(p.en),
  );
  ck(
    "no English string is Swedish",
    swedishOnly.length === 0,
    swedishOnly.map((p) => p.where).join(","),
  );
  for (const key of [
    "nav.my_career",
    "nav.myPassport",
    "nav.findJobs",
    "nav.professionsAndPaths",
    "nav.testsAndResults",
    "account.context.employer",
    "account.context.reviewer",
  ] as const) {
    ck(
      `${key} exists in both dictionaries`,
      typeof dictionaries.sv[key] === "string" && typeof dictionaries.en[key] === "string",
    );
  }
  for (const kind of Object.keys(ACTION_CLASSIFICATION) as (keyof typeof ACTION_CLASSIFICATION)[]) {
    const w = actionCopy.wordsFor(kind, null);
    ck(
      `${kind}: title, why, outcome and verb in both languages`,
      [w.title, w.why, w.outcome, w.verb].every((x) => x.sv && x.en),
    );
  }

  // The brief's locked copy direction, in Swedish, on the surfaces.
  ck('"Din karriär, {0}" is the heading', homeCopy.HEADER.title.sv === "Din karriär, {0}");
  ck('"Din karriärbild" is the career heading', homeCopy.CAREER.heading.sv === "Din karriärbild");
  ck(
    '"Baserat på din karriäranalys" is the eyebrow',
    homeCopy.CAREER.eyebrow.sv === "Baserat på din karriäranalys",
  );
  ck(
    '"Grundprofil komplett" is the completion line',
    homeCopy.HEADER.basicsComplete.sv === "Grundprofil komplett",
  );
  ck(
    '"Uppgiften har verifierats." replaces "Godkänt."',
    read("src/components/professional-identity/VerificationOutcomes.tsx").includes(
      'approved: c("Uppgiften har verifierats."',
    ),
  );
  ck(
    "the retired heading copy is gone",
    !/Ditt nästa steg|Också möjligt nu|Din karriärresa|% ifyllt|Viktigast just nu|Alla mina rapporter/.test(
      code(read("src/components/professional-identity/NextBestAction.tsx")) +
        code(read("src/components/professional-identity/home-copy.ts")),
    ),
  );
  ck(
    "no waving emoji on the home",
    !/👋/.test(
      read("src/routes/_authenticated.my-career.index.tsx") +
        read("src/components/professional-identity/CareerPageHeader.tsx"),
    ),
  );

  // The Swedish page never says "Career Discovery". "Security Passport" and
  // "Career Card" stay: they are registered product names.
  const swedishSurfaces = [
    code(read("src/components/professional-identity/home-copy.ts")),
    code(read("src/components/professional-identity/next-action-copy.ts")),
    code(read("src/routes/_authenticated.my-career.index.tsx")),
  ].join("\n");
  const svStrings = pairs.map((p) => p.sv).join("\n");
  ck(
    'no Swedish string on the home says "Career Discovery"',
    !svStrings.includes("Career Discovery"),
  );
  ck("nor does the route", !swedishSurfaces.includes("Career Discovery"));
  ck('"Security Passport" is kept as the product name', svStrings.includes("Security Passport"));
  // The vague words the brief bans, unqualified.
  ck(
    'no Swedish string says "rapport" or "uppgift" without naming the object',
    !pairs.some((p) => /^(Din |Ditt )?(rapport|uppgift)( är klar)?\.?$/i.test(p.sv.trim())),
  );
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`FAIL — my-career-premium-overview-check (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — my-career-premium-overview-check");
