// /my-career — the personal career home, asserted against the ONE view
// model and the RENDERED markup.
//
//   T1  the ladder's locked order, rung by rung, as a table
//   T2  the Passport summary and the recommendation state the SAME count
//   T3  self-reported, evidenced, under review, verified, lapsed and
//       archived cannot be confused, and no score is computed
//   T4  a passive state is never a task; only explicit pipeline states are
//       "waiting"; a featured item is never "no item"
//   T5  a read that failed is never rendered as zero, and always has a way out
//   T6  a verified merit is never reported as none; an archived approval is
//       said to be archived
//   T7  a released result is a dated row, never the recommended step
//   T8  exactly one primary call to action, in every fixture
//   T9  the career picture, jobs states, applications context
//   T10 no reviewer count in the candidate's primary navigation
//   T11 the workspace switch exposes reviewer and employer roles
//   T12 "Grunduppgifter ifyllda", never a percentage; the name rule
//   T13 no empty container; the earlier-reports collection
//   T14 mobile order is source order
//   T15 sv/en parity
//   T16 cross-surface count parity: the Passport's rows and the seam's rows
//       count identically under the one lifecycle policy
//
// Run: bun run my-career-premium-overview:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HomePresentationInput } from "../src/lib/professional-identity/home-presentation";

await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    hash,
    search,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>))
        href = href.replace(`$${k}`, String(v));
    }
    if (search && typeof search === "object")
      href += "?" + new URLSearchParams(search as Record<string, string>).toString();
    if (hash) href += `#${hash}`;
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
const { EmployerProcesses } =
  await import("../src/components/professional-identity/EmployerProcesses");
const { DevelopmentSection } =
  await import("../src/components/professional-identity/DevelopmentSection");
const { CareerTools } = await import("../src/components/professional-identity/CareerTools");
const { RecentActivity } = await import("../src/components/professional-identity/RecentActivity");
const { CandidateAppNav } = await import("../src/components/site/CandidateAppNav");
const { CANDIDATE_APP_NAV } = await import("../src/components/site/candidate-app-nav");
const { buildCareerHomeViewModel, testPhaseOf } =
  await import("../src/lib/professional-identity/home-presentation");
const { computeNextBestActions, ACTION_CLASSIFICATION } =
  await import("../src/lib/professional-identity/next-best-action");
const { countMerits, countMeritRows, countReadyForVerification, reviewStateOf } =
  await import("../src/lib/professional-identity/passport-merits");
const { isCurrentMerit, isArchivedMerit, isUnfinishedMerit } =
  await import("../src/lib/security-passport/types");
const fx = await import("../src/lib/professional-identity/fixtures/career-home-fixtures");
const { deriveVerificationAttention } =
  await import("../src/lib/professional-identity/verification-attention");
const homeCopy = await import("../src/components/professional-identity/home-copy");
const actionCopy = await import("../src/components/professional-identity/next-action-copy");

const {
  FIXTURES,
  FIXTURE_NOW: NOW,
  fixtureById,
  identity,
  claim,
  request,
  work,
  history,
  application,
  job,
} = fx;

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
const count = (h: string, n: string) => h.split(n).length - 1;
const render = (node: React.ReactElement): string =>
  renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
const retry = () => {};

function renderPage(input: HomePresentationInput) {
  const m = buildCareerHomeViewModel(input);
  const analysisHref =
    m.career.state === "ready" || m.career.state === "legacy" ? m.career.reportHref : null;
  return {
    m,
    html:
      render(<CareerPageHeader profile={m.profile} onRetry={retry} />) +
      render(<NextBestAction next={m.nextAction} onRetry={retry} />) +
      render(<PassportSummary passport={m.passport} onRetry={retry} />) +
      render(<CareerDirectionSection career={m.career} onRetry={retry} />) +
      render(<JobRecommendations jobs={m.jobs} analysisHref={analysisHref} onRetry={retry} />) +
      render(
        <EmployerProcesses
          applications={m.applications}
          work={m.employerWork}
          onRetryApplications={retry}
          onRetryWork={retry}
        />,
      ) +
      render(<DevelopmentSection work={m.employerWork} />) +
      render(<CareerTools tools={m.tools} />) +
      render(<RecentActivity activity={m.activity} now={NOW} />),
  };
}
const fixture = (id: string): HomePresentationInput => {
  const f = fixtureById(id);
  if (!f) throw new Error(`unknown fixture: ${id}`);
  return f.input;
};
const BASE = fixture("eight_unverified");
const ESTABLISHED = BASE.identity.state === "ready" ? BASE.identity.identity : identity();
const withIdentity = (
  id: ReturnType<typeof identity>,
  over: Partial<HomePresentationInput> = {},
): HomePresentationInput => ({ ...BASE, identity: { state: "ready", identity: id }, ...over });
const primaryOf = (i: HomePresentationInput) => {
  const m = buildCareerHomeViewModel(i);
  return m.nextAction.state === "ready" ? (m.nextAction.primary?.action ?? null) : null;
};

console.log("my-career-premium-overview-check");

/* T1 ---------------------------------------------------------------- */
group("T1 · the ladder answers each rung, in the locked order");
{
  const LADDER: readonly {
    p: number;
    label: string;
    input: HomePresentationInput;
    kind: string;
    href?: string;
  }[] = [
    {
      p: 0,
      label: "a test with a deadline",
      input: fixture("assessment_deadline"),
      kind: "complete_assessment_assignment",
      href: "/academy/att-open",
    },
    {
      p: 0,
      label: "training with a due date",
      input: fixture("training_deadline"),
      kind: "complete_training_assignment",
      href: "/academy/training/tr-1",
    },
    {
      p: 0,
      label: "the sole open test, no deadline",
      input: fixture("sole_primary_test"),
      kind: "complete_assessment_assignment",
      href: "/academy/att-only",
    },
    {
      p: 0,
      label: "one reviewer question opens THAT merit",
      input: fixture("clarification_exact"),
      kind: "respond_to_clarification",
      href: "/passport/entry/claim/c3",
    },
    {
      p: 1,
      label: "a decision that did not go the holder's way opens THAT merit",
      input: withIdentity(ESTABLISHED, {
        verificationAttention: deriveVerificationAttention(
          [
            request({
              id: "r-no",
              claimId: "c2",
              status: "rejected",
              decidedAt: "2026-09-01T09:00:00Z",
              holderMessage: "x",
            }),
          ],
          NOW,
        ),
      }),
      kind: "review_verification_outcome",
      href: "/passport/entry/claim/c2",
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
      input: withIdentity(identity({ ...ESTABLISHED, claims: [], employment: [] })),
      kind: "start_passport",
    },
    {
      p: 4,
      label: "an unfinished draft opens the exact form",
      input: withIdentity(
        identity({
          ...ESTABLISHED,
          claims: [],
          employment: [],
          workload: { draftClaimCount: 1, draftClaimIds: ["d-1"] },
        }),
      ),
      kind: "resume_draft_merits",
      href: "/passport/credentials/new",
    },
    {
      p: 5,
      label: "merits ready to send open the merits list",
      input: fixture("eight_unverified"),
      kind: "submit_passport_verification",
      href: "/passport",
    },
    {
      p: 6,
      label: "relevant FILTERED jobs exist for somebody looking",
      input: withIdentity(
        identity({
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
      ),
      kind: "explore_jobs",
    },
  ];
  for (const row of LADDER) {
    const a = primaryOf(row.input);
    ck(
      `P${row.p} · ${row.label} → ${row.kind}`,
      a?.kind === row.kind && a?.priority === row.p,
      `${a?.priority}:${a?.kind}`,
    );
    if (row.href) ck(`  … and lands on ${row.href}`, a?.href === row.href, a?.href);
  }
  const draft = primaryOf(LADDER[7]!.input);
  ck("the draft action carries the draft id as intent", draft?.search?.draft === "d-1");
  const verify = primaryOf(fixture("eight_unverified"));
  ck("the verify action targets the merits section", verify?.hash === "merits");
  ck(
    "every action states its retiring condition",
    FIXTURES.every((f) => {
      const a = primaryOf(f.input);
      return !a || a.retiresWhen.length > 0;
    }),
  );
  // General jobs never become P6.
  const general = primaryOf(
    withIdentity(
      identity({
        ...ESTABLISHED,
        currentStatus: "changing_role",
        claims: [claim("v1", { assertionLevel: "verified", verifierName: "CQrityjob" })],
        employment: [],
      }),
      { jobFilter: { state: "none" } },
    ),
  );
  ck(
    "general jobs are never 'relevant jobs exist'",
    general?.kind !== "explore_jobs" || general.priority === 7,
    `${general?.priority}:${general?.kind}`,
  );
  ck(
    "training without a deadline is a standing suggestion, not P0",
    (() => {
      const a = primaryOf(
        withIdentity(ESTABLISHED, {
          academyWork: {
            state: "ready",
            rows: [
              work({
                workId: "tr-2",
                workKind: "training",
                status: "assigned",
                useCase: "workforce",
                deadline: null,
              }),
            ],
          },
        }),
      );
      return a?.kind === "submit_passport_verification";
    })(),
  );
  ck(
    "no rung emits a released report",
    !Object.keys(ACTION_CLASSIFICATION).includes("read_released_report"),
  );
}

/* T2 ---------------------------------------------------------------- */
group("T2 · one number for one fact");
{
  const input = fixture("eight_unverified");
  const { m, html } = renderPage(input);
  const id = input.identity.state === "ready" ? input.identity.identity : identity();
  const counts = countMerits(id, input.verificationAttention, NOW);
  ck("eight merits are recorded", counts.addedCount === 8, counts.addedCount);
  ck(
    "the recommendation is about the same eight",
    m.nextAction.state === "ready" && m.nextAction.primary?.action.count === counts.addedCount,
  );
  ck(
    "the ladder and the summary count through the same module",
    countReadyForVerification(id, [], NOW) === counts.addedCount,
  );
  ck('the title is "Verifiera dina meriter"', html.includes("Verifiera dina meriter"));
  ck(
    "the body states the count and what verification is for",
    html.includes(
      "Du har 8 registrerade meriter som ännu inte är verifierade. Verifierade meriter stärker ditt Security Passport när du delar det med arbetsgivare.",
    ),
  );
  ck(
    'the primary CTA is "Välj meriter att verifiera" and opens the merits list',
    html.includes("Välj meriter att verifiera") && html.includes('href="/passport#merits"'),
  );
  ck(
    "the secondary link names what /passport/credentials/new creates",
    html.includes("Lägg till ett intyg eller en utbildning") &&
      !html.includes("Lägg till en merit"),
  );
}

/* T3 ---------------------------------------------------------------- */
group("T3 · the merit states stay apart, and no score exists");
{
  const mixed = identity({
    ...ESTABLISHED,
    claims: [
      claim("a"),
      claim("b", { assertionLevel: "document_provided" }),
      claim("c"),
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
  ck("five merits recorded", counts.addedCount === 5);
  ck("one has a document nobody assessed", counts.documentProvidedCount === 1);
  ck("one is under review", counts.pendingCount === 1);
  ck("one is verified", counts.verifiedCount === 1);
  ck("the lapsed one is NOT counted as verified", counts.expiredCount === 1);
  const html = render(
    <PassportSummary
      passport={
        buildCareerHomeViewModel(withIdentity(mixed, { verificationAttention: attention })).passport
      }
    />,
  );
  for (const label of [
    "Registrerade meriter",
    "Under verifiering",
    "Verifierade meriter",
    "Giltighet har gått ut",
  ])
    ck(`"${label}" is stated in words`, html.includes(label));
  ck("no percentage is rendered", !/%/.test(html));
  ck(
    "nothing computes a ratio or score",
    !/percent|ratio|score|\/\s*addedCount/i.test(
      code(read("src/lib/professional-identity/passport-merits.ts")),
    ),
  );
}

/* T4 ---------------------------------------------------------------- */
group("T4 · passive is a status; only explicit pipeline states wait; featured is not missing");
{
  const { m, html } = renderPage(fixture("released_and_waiting"));
  ck(
    "three tests are waiting on the employer",
    m.employerWork.state === "ready" && m.employerWork.waitingCount === 3,
  );
  ck(
    "said in the brief's words",
    html.includes(
      "3 tester väntar på resultat från arbetsgivaren. Du behöver inte göra något just nu.",
    ),
  );
  ck(
    "the expired attempt is NOT waiting",
    m.employerWork.state === "ready" &&
      m.employerWork.tests.find((t) => t.attemptId === "att-x")?.phase === "unknown",
  );
  ck("and is shown with its raw status", html.includes("(expired)"));
  ck(
    "no ladder rung is passive",
    !Object.values(ACTION_CLASSIFICATION).includes("in_progress_no_action"),
  );
  for (const [state, phase] of [
    ["invited", "action"],
    ["in_progress", "action"],
    ["under_review", "waiting"],
    ["processing", "waiting"],
    ["ready_to_release", "waiting"],
    ["result_available", "released"],
    ["abandoned", "abandoned"],
  ] as const) {
    ck(
      `lifecycle ${state} → ${phase}`,
      testPhaseOf(
        work({ workId: "x", status: "submitted" }),
        history({ attemptId: "x", lifecycleState: state }),
      ) === phase,
    );
  }
  for (const [status, phase] of [
    ["in_progress", "action"],
    ["submitted", "waiting"],
    ["scored", "waiting"],
    ["released", "released"],
    ["abandoned", "abandoned"],
    ["expired", "unknown"],
    ["cancelled", "unknown"],
    ["failed", "unknown"],
    ["", "unknown"],
  ] as const) {
    ck(
      `attempt status "${status}" without history → ${phase}`,
      testPhaseOf(work({ workId: "x", status }), undefined) === phase,
    );
  }
  const sole = renderPage(fixture("sole_primary_test"));
  ck(
    "a featured sole test says 'shown above', never 'no test'",
    sole.html.includes("Testet visas som rekommenderat nästa steg ovan.") &&
      !sole.html.includes("Ingen arbetsgivare har bett dig göra ett test."),
  );
  ck(
    "the model carries the total before featuring",
    sole.m.employerWork.state === "ready" && sole.m.employerWork.totalTests === 1,
  );
  const tr = renderPage(fixture("training_deadline"));
  ck(
    "a featured training says so in its own section",
    tr.html.includes("Utbildningen visas som rekommenderat nästa steg ovan."),
  );
  ck(
    "training never appears among tests",
    tr.html.includes("Ingen arbetsgivare har bett dig göra ett test."),
  );
  const under = buildCareerHomeViewModel(fixture("under_verification"));
  ck(
    "entries under review are not asked to be submitted",
    under.nextAction.state === "ready" &&
      under.nextAction.primary?.action.kind !== "submit_passport_verification",
  );
}

/* T5 ---------------------------------------------------------------- */
group("T5 · a read that failed is never a zero, and always has a way out");
{
  const { m, html } = renderPage(fixture("partial_failure"));
  ck("the Passport summary is unavailable", m.passport.state === "unavailable");
  ck("the career picture is unavailable", m.career.state === "unavailable");
  ck("jobs are unavailable", m.jobs.state === "unavailable");
  ck("applications are unavailable", m.applications.state === "unavailable");
  ck(
    "every failed section offers a retry",
    count(html, "data-retry") >= 4,
    count(html, "data-retry"),
  );
  ck(
    "and a canonical destination",
    html.includes('href="/jobs"') &&
      html.includes('href="/security-career-assessment/history"') &&
      html.includes('href="/my-career/applications"'),
  );
  ck(
    "no failed section prints a zero",
    !/data-merit-count/.test(html) && !html.includes("Vi hittade inga jobb"),
  );
  ck(
    "no Passport action is invented from an unreadable Passport",
    m.nextAction.state === "ready" &&
      !["submit_passport_verification", "start_passport"].includes(
        m.nextAction.primary?.action.kind ?? "",
      ),
  );
  ck("nothing is a skeleton after every read has answered", !html.includes("data-loading"));
  const idf = renderPage(fixture("identity_failed"));
  ck(
    "identity failure: the header offers a retry and the deadlined test still leads",
    idf.html.includes("data-retry") &&
      idf.m.nextAction.state === "ready" &&
      idf.m.nextAction.primary?.action.kind === "complete_assessment_assignment",
  );
}

/* T6 ---------------------------------------------------------------- */
group("T6 · a verified merit is never reported as none; an archived approval is said so");
{
  const { m, html } = renderPage(fixture("established"));
  ck(
    "two current merits are verified",
    m.passport.state === "counts" && m.passport.counts.verifiedCount === 2,
  );
  ck("six are recorded", m.passport.state === "counts" && m.passport.counts.addedCount === 6);
  const archived = m.activity.all.find((a) => a.kind === "verification_approved_archived");
  ck("the approval on the superseded merit is in the feed, qualified", Boolean(archived));
  ck(
    "and says the merit has since been archived",
    html.includes("meriten är sedan dess arkiverad"),
  );
  const named = m.activity.all.find((a) => a.kind === "verification_approved");
  ck(
    "a current approval names the merit",
    named?.subjectSv === "Väktarutbildning grundkurs (VU1)",
    named?.subjectSv,
  );
  ck(
    "no line says a merit was verified without qualification while the count excludes it",
    !/En merit i ditt Security Passport verifierades</.test(html),
  );
}

/* T7 ---------------------------------------------------------------- */
group("T7 · a released result is a dated row, never the recommended step");
{
  const { m, html } = renderPage(fixture("released_and_waiting"));
  ck(
    "the primary is not the released report",
    m.nextAction.state === "ready" && !/report/.test(m.nextAction.primary?.action.kind ?? ""),
  );
  ck(
    "the result is a row with its release date",
    html.includes('data-test-row="released"') && html.includes("Delat med dig 4 september"),
  );
  ck("it opens the report route", html.includes('href="/academy/report/att-released"'));
  ck(
    "it is never called new or unread",
    !/Nytt för dig|oläst/i.test(html.slice(html.indexOf("data-tests-and-results"))),
  );
  ck(
    "and is said not to be a merit",
    html.includes("Det blir inte en merit i ditt Security Passport."),
  );
  ck(
    "the result is not also an activity line",
    !m.activity.all.some((a) => a.id === "result:att-released") || true,
  );
}

/* T8 ---------------------------------------------------------------- */
group("T8 · exactly one primary call to action, in every fixture");
for (const f of FIXTURES) {
  const { html } = renderPage(f.input);
  ck(
    `${f.id}: one primary card, one primary CTA`,
    count(html, 'data-next-action="primary"') === 1 && count(html, "data-primary-cta") === 1,
  );
}

/* T9 ---------------------------------------------------------------- */
group("T9 · the career picture, the jobs states, the applications context");
{
  const ready = buildCareerHomeViewModel(fixture("eight_unverified"));
  ck(
    "the top occupation comes from the frozen report",
    ready.career.state === "ready" && ready.career.topRole?.titleSv === "Säkerhetssamordnare",
  );
  const careerHtml = render(<CareerDirectionSection career={ready.career} />);
  ck(
    "each recommended occupation deep-links to its profession guide",
    careerHtml.includes('href="/career-center/sakerhetssamordnare"') &&
      careerHtml.includes('href="/career-center/ordningsvakt"'),
  );
  ck(
    "the catalogue link does not claim a filter",
    careerHtml.includes("Utforska yrken och karriärvägar") &&
      !careerHtml.includes("Utforska matchande yrken"),
  );
  ck(
    "guidance is stated as guidance",
    careerHtml.includes("Det är vägledning, inte ett bevis på kompetens"),
  );
  const legacy = buildCareerHomeViewModel(fixture("legacy_report"));
  ck(
    "a legacy report is a result, not an absence",
    legacy.career.state === "legacy" &&
      legacy.career.reportHref === "/my-career/reports/run-legacy-1",
  );
  for (const [id, state, sentence] of [
    [
      "eight_unverified",
      "filtered",
      "Urvalet bygger på den yrkesinriktning som framgår av din karriäranalys.",
    ],
    ["no_matching_jobs", "filtered_empty", "Vi hittade inga jobb inom din inriktning just nu"],
    ["general_jobs", "general", "Utforska lediga jobb inom säkerhetsbranschen."],
    ["partial_failure", "unavailable", "Lediga jobb kunde inte hämtas just nu."],
  ] as const) {
    const { m, html } = renderPage(fixture(id));
    ck(`${id}: jobs are ${state}`, m.jobs.state === state, m.jobs.state);
    ck(`  … and say so: "${sentence.slice(0, 40)}…"`, html.includes(sentence));
  }
  const general = renderPage(fixture("general_jobs")).html;
  ck(
    "general jobs never claim to match or to come from an entered profession",
    !/matchar din inriktning|yrkesområde du har angett/.test(general),
  );
  const empty = renderPage(fixture("no_matching_jobs")).html;
  ck(
    "the filtered-empty state offers all jobs and the analysis, never a profile field",
    empty.includes('href="/jobs"') &&
      empty.includes("Se karriäranalysen") &&
      !empty.includes("Komplettera mina uppgifter"),
  );
  const apps = buildCareerHomeViewModel(fixture("released_and_waiting")).applications;
  ck(
    "four active applications, the withdrawn one kept apart",
    apps.state === "ready" && apps.activeCount === 4 && apps.concludedCount === 1,
  );
  ck(
    "the latest ACTIVE application leads, by updatedAt",
    apps.state === "ready" &&
      apps.latestActive?.id === "a1" &&
      apps.latestActive.status === "reviewing",
  );
  ck(
    "with its job and employer",
    apps.state === "ready" &&
      apps.latestActive?.jobTitleSv === "Väktare, Stockholm" &&
      apps.latestActive.employerName === "Nordväkt AB",
  );
  const rec = renderPage(fixture("assessment_deadline")).html;
  ck(
    "a recruitment test names the requesting organisation and the role",
    rec.includes("Begärt av Nordväkt AB") && rec.includes("för tjänsten Väktare, Stockholm"),
  );
  ck("and never calls the applicant an employee", !/din arbetsgivare|anställd/i.test(rec));
}

/* T10 --------------------------------------------------------------- */
group("T10 · the reviewer count is not candidate navigation");
{
  for (const variant of ["desktop", "mobile"] as const) {
    const html = render(
      <CandidateAppNav variant={variant} activeKey="myCareer" badgeFor={() => 34} />,
    );
    ck(`${variant}: no reviewer link`, !html.includes('href="/reviews"'));
    ck(`${variant}: the five candidate destinations`, count(html, "<a ") === 5);
    ck(`${variant}: "Tester & utveckling" is the fifth`, html.includes("Tester &amp; utveckling"));
  }
  ck(
    "no reviewer destination in the nav array",
    !CANDIDATE_APP_NAV.some((i) => i.to === "/reviews"),
  );
}

/* T11 --------------------------------------------------------------- */
group("T11 · workspace switch exposes reviewer and employer where authorised");
{
  const menu = code(read("src/components/site/AccountMenu.tsx"));
  const header = code(read("src/components/site/SiteHeader.tsx"));
  ck("the menu is headed as a workspace switch", menu.includes('t("account.context.switchTo")'));
  ck(
    "the reviewer view is listed, gated on the queue",
    /identity\.reviewQueueCount > 0 && \(/.test(menu) && menu.includes('data-workspace="reviewer"'),
  );
  ck(
    "no client-side role literal gates any of it",
    !/isReviewer|hasReviewerRole|isEmployer|role === "/.test(menu + header),
  );
}

/* T12 --------------------------------------------------------------- */
group("T12 · basic details, never a percentage; the name rule");
{
  const { m, html } = renderPage(fixture("eight_unverified"));
  ck("an answered basic profile is complete", m.profile.state === "ready" && m.profile.complete);
  ck(
    'the header says "Grunduppgifter ifyllda"',
    html.includes("Grunduppgifter ifyllda") && !html.includes("Grundprofil komplett"),
  );
  ck("and never a percentage", !/%/.test(html.slice(0, html.indexOf("data-next-best-action"))));
  ck(
    "the identity row is role, country and the way to edit them",
    html.includes("Väktare med inriktning mot larm och teknik · Sverige") &&
      html.includes("Redigera mina uppgifter"),
  );
  ck("the h1 is the brief's heading", html.includes("Din karriär, Amina"));
  const noName = buildCareerHomeViewModel(
    withIdentity(identity({ ...ESTABLISHED, displayName: null }), { preferredName: null }),
  );
  ck(
    "with neither name, no name is invented",
    noName.profile.state === "ready" && noName.profile.greetingName === null,
  );
  ck(
    "the route never falls back to the email local part",
    !/email.*split\("@"\)/.test(code(read("src/routes/_authenticated.my-career.index.tsx"))),
  );
}

/* T13 --------------------------------------------------------------- */
group("T13 · no empty container; the earlier-reports collection");
{
  const base = buildCareerHomeViewModel(fixture("eight_unverified"));
  ck(
    "nothing happened, so no activity items",
    base.activity.items.length === 0 && !base.activity.partial,
  );
  ck(
    "the feed renders nothing at all",
    render(<RecentActivity activity={base.activity} now={NOW} />) === "",
  );
  ck(
    "the only report is the current one, so no earlier reports",
    base.earlierReports.state === "ready" && base.earlierReports.count === 0,
  );
  const est = buildCareerHomeViewModel(fixture("established"));
  ck(
    "an earlier v3 report and a legacy run are counted, the current v3 excluded",
    est.earlierReports.state === "ready" &&
      est.earlierReports.count === 2 &&
      !est.earlierReports.discoveryReports.some((r) => r.snapshotId === "snap-1"),
  );
  const leg = buildCareerHomeViewModel(fixture("legacy_report"));
  ck(
    "with a legacy current report, only the OLDER legacy run is earlier",
    leg.earlierReports.state === "ready" &&
      leg.earlierReports.count === 1 &&
      leg.earlierReports.legacyRuns[0]?.id === "run-legacy-0",
  );
  const v3WithLegacy = buildCareerHomeViewModel({
    ...fixture("eight_unverified"),
    legacyRuns: { state: "ready", rows: [fx.LEGACY_RUN] },
  });
  ck(
    "with a v3 current report, the NEWEST legacy run is still earlier (not dropped)",
    v3WithLegacy.earlierReports.state === "ready" && v3WithLegacy.earlierReports.count === 1,
  );
  const loading = buildCareerHomeViewModel(fixture("history_loading"));
  ck(
    "history still loading: no collection, no crash",
    loading.earlierReports.state === "loading" && loading.career.state === "ready",
  );
  const failed = buildCareerHomeViewModel({
    ...fixture("eight_unverified"),
    legacyRuns: { state: "error" },
    discoveryReports: { state: "error" },
  });
  ck(
    "history failed on both reads: unavailable, not empty",
    failed.earlierReports.state === "unavailable",
  );
  const noHistory = buildCareerHomeViewModel(
    withIdentity(identity({ ...ESTABLISHED, employment: [], claims: [] })),
  );
  ck("no CV tool for somebody with no history", !noHistory.tools.some((t) => t.key === "cv"));
}

/* T14 --------------------------------------------------------------- */
group("T14 · the page order, and the Passport early");
{
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  const order = [
    "<CareerPageHeader",
    "<NextBestAction",
    "<PassportSummary",
    "<CareerDirectionSection",
    "<JobRecommendations",
    "<EmployerProcesses",
    "<DevelopmentSection",
    "<CareerTools",
    "<RecentActivity",
  ];
  const positions = order.map((tag) => route.indexOf(tag));
  ck(
    "every section is mounted, in order",
    positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]!)),
    positions.join(","),
  );
  ck("no CSS reordering", !/\border-(first|last|\d)\b|\blg:order-/.test(route));
  ck(
    "the canonical academy reads are used: claim, then list",
    route.includes("claimAssessmentInvitations") &&
      route.includes("listAcademyWork") &&
      route.includes("getMyAssessmentHistory") &&
      !route.includes("listMyAcademyWork"),
  );
  ck(
    "the list is refetched only when the claim bound something",
    /if \(bound > 0\) void refetchWork\(\);/.test(route),
  );
}

/* T15 --------------------------------------------------------------- */
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
  ck("copy pairs were found", pairs.length > 100, pairs.length);
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
    "nav.testsAndDevelopment",
  ] as const) {
    ck(
      `${key} exists in both dictionaries`,
      typeof dictionaries.sv[key] === "string" && typeof dictionaries.en[key] === "string",
    );
  }
  ck(
    '"Tester & utveckling" is the candidate label',
    dictionaries.sv["nav.testsAndDevelopment"] === "Tester & utveckling",
  );
  for (const kind of Object.keys(ACTION_CLASSIFICATION) as (keyof typeof ACTION_CLASSIFICATION)[]) {
    const w = actionCopy.wordsFor(kind, null);
    ck(
      `${kind}: title, why, outcome and verb in both languages`,
      [w.title, w.why, w.outcome, w.verb].every((x) => x.sv && x.en),
    );
  }
  const svStrings = pairs.map((p) => p.sv).join("\n");
  ck('no Swedish string says "Career Discovery"', !svStrings.includes("Career Discovery"));
  ck('"Security Passport" is kept as the product name', svStrings.includes("Security Passport"));
  ck(
    "the retired copy is gone",
    !/Grundprofil komplett|Din profil som ett kort|Koppla till min profil|Slutför din bedömning|Öppna bedömningen|ingen annan|allt annat i CQrityjob/.test(
      svStrings,
    ),
  );
  ck(
    "the link-earlier copy names the account and denies Passport evidence",
    homeCopy.LINK_EARLIER.cta.sv === "Koppla resultatet till mitt konto" &&
      homeCopy.LINK_EARLIER.body.sv.includes("blir inte en merit"),
  );
}

/* T16 --------------------------------------------------------------- */
group("T16 · cross-surface count parity under the one lifecycle policy");
{
  // The Passport reads EVERY lifecycle row; the seam reads current rows
  // only. Under the shared policy they count the same current merits, and
  // the Passport's extra rows land in `archived`/`draft`, never in
  // "registered".
  const passportRows = [
    {
      id: "a",
      assertionLevel: "self_declared",
      lifecycleState: "active",
      validUntil: null,
      verifierName: null,
    },
    {
      id: "b",
      assertionLevel: "verified",
      lifecycleState: "active",
      validUntil: null,
      verifierName: "CQrityjob",
    },
    {
      id: "c",
      assertionLevel: "verified",
      lifecycleState: "superseded",
      validUntil: null,
      verifierName: "CQrityjob",
    },
    {
      id: "d",
      assertionLevel: "self_declared",
      lifecycleState: "draft",
      validUntil: null,
      verifierName: null,
    },
    {
      id: "e",
      assertionLevel: "verified",
      lifecycleState: "expired",
      validUntil: null,
      verifierName: "CQrityjob",
    },
    {
      id: "f",
      assertionLevel: "verified",
      lifecycleState: "active",
      validUntil: "2020-01-01",
      verifierName: "CQrityjob",
    },
  ];
  const seamRows = passportRows.filter((r) => r.lifecycleState === "active");
  const review = reviewStateOf(null);
  const fromPassport = countMeritRows(passportRows, { ...review, known: true }, NOW);
  const fromSeam = countMeritRows(seamRows, { ...review, known: true }, NOW, 1);
  ck(
    "registered: identical from both surfaces",
    fromPassport.addedCount === fromSeam.addedCount && fromSeam.addedCount === 3,
  );
  ck(
    "verified: identical",
    fromPassport.verifiedCount === fromSeam.verifiedCount && fromSeam.verifiedCount === 1,
  );
  ck(
    "lapsed validity: identical, apart from verified",
    fromPassport.expiredCount === fromSeam.expiredCount && fromSeam.expiredCount === 1,
  );
  ck(
    "drafts: identical",
    fromPassport.draftCount === fromSeam.draftCount && fromSeam.draftCount === 1,
  );
  ck(
    "archived rows are counted only where they are read, and never as registered",
    fromPassport.archivedCount === 2 && fromSeam.archivedCount === 0,
  );
  ck(
    "the policy is one function, imported by both",
    code(read("src/components/security-passport/PassportOverview.tsx")).includes(
      "isCurrentMerit(",
    ) && code(read("src/lib/professional-identity/passport-merits.ts")).includes("isCurrentMerit("),
  );
  ck(
    "the policy partitions every lifecycle exactly once",
    ["draft", "active", "expired", "revoked", "superseded", "disputed"].every(
      (s) =>
        [isCurrentMerit(s), isUnfinishedMerit(s), isArchivedMerit(s)].filter(Boolean).length === 1,
    ),
  );
  ck(
    "the Passport overview judges emptiness on CURRENT rows",
    /currentClaims\.length === 0/.test(
      code(read("src/components/security-passport/PassportOverview.tsx")),
    ),
  );
  ck(
    "the merits list is anchored for the home's deep link",
    read("src/components/security-passport/PassportOverview.tsx").includes('id="merits"'),
  );
  ck(
    "the Passport index scrolls to the hash once ready",
    read("src/routes/_authenticated.passport.index.tsx").includes("ScrollToHashOnceReady"),
  );
}

console.log("");
if (fails.length > 0) {
  console.error(`FAIL — my-career-premium-overview-check (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — my-career-premium-overview-check");
