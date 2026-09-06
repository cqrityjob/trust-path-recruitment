// /my-career — the candidate experience, asserted against RENDERED markup.
//
// Complements my-career-premium-overview-check (the model) with what only
// markup can show: one primary CTA per state, every engine action reachable
// somewhere on the page, no identifier printed raw, unknown never rendered
// as zero, one h1, and sections that self-hide. I18nProvider starts at
// "sv", so Swedish is asserted from markup and English from the tables.
//
// Run: bun run my-career-experience:check

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
const { ProfessionalIdentityHeader } =
  await import("../src/components/professional-identity/ProfessionalIdentityHeader");
const { computeNextBestActions } =
  await import("../src/lib/professional-identity/next-best-action");
const { buildCareerHomeViewModel } =
  await import("../src/lib/professional-identity/home-presentation");
const fx = await import("../src/lib/professional-identity/fixtures/career-home-fixtures");

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
const NOW = fx.FIXTURE_NOW;

const DUBAI: ProfessionalIdentityV1 = fx.identity({
  displayName: "Amina Karlsson",
  accountCountry: "AE",
  workCountry: "AE",
  workSubJurisdiction: "AE-DU",
  currentStatus: "working_in_industry",
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  currentProfessionTitleEn: "Security officer",
  yearsOfExperience: "5-10",
  hasPassport: true,
  claims: [
    fx.claim("v", {
      assertionLevel: "verified",
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
      verifiedOn: "2026-06-01",
    }),
    fx.claim("c2"),
  ],
  discovery: {
    hasCompletedReport: true,
    snapshotId: "s1",
    generatedAt: "2026-01-01",
    namesCareers: true,
  },
});

function input(
  id: ProfessionalIdentityV1,
  over: Partial<HomePresentationInput> = {},
): HomePresentationInput {
  return {
    ...fx.fixtureById("eight_unverified")!.input,
    identity: { state: "ready", identity: id },
    ...over,
  };
}
function renderPage(i: HomePresentationInput) {
  const m = buildCareerHomeViewModel(i);
  const analysisHref =
    m.career.state === "ready" || m.career.state === "legacy" ? m.career.reportHref : null;
  // Retry handlers are given, as the route gives them: a failure state
  // renders its retry only when there is something to call.
  const retry = () => {};
  const html =
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
    render(<RecentActivity activity={m.activity} now={NOW} />);
  return { m, html };
}

console.log("my-career-experience-check");

group("1 · exactly one primary next action, and it is the engine's");
{
  for (const f of fx.FIXTURES) {
    const { m, html } = renderPage(f.input);
    ck(
      `${f.id}: exactly one element is marked primary`,
      count(html, 'data-next-action="primary"') === 1,
    );
    ck(`${f.id}: exactly one primary call to action`, count(html, "data-primary-cta") === 1);
    if (m.nextAction.state === "ready" && m.nextAction.primary) {
      const a = m.nextAction.primary.action;
      const expected =
        a.href +
        (a.search ? "?" + new URLSearchParams(a.search).toString() : "") +
        (a.hash ? `#${a.hash}` : "");
      const block = html.slice(html.indexOf('data-next-action="primary"'));
      ck(
        `${f.id}: the primary links to the engine's top action (${a.kind})`,
        block.slice(0, block.indexOf("</article>")).includes(`href="${expected}"`),
        expected,
      );
    }
    ck(`${f.id}: exactly one h1`, count(html, "<h1") === 1);
  }
  // Every action the engine returned is reachable somewhere on the page.
  const many = fx.identity({
    displayName: "A",
    hasPassport: true,
    claims: [fx.claim("c1")],
    workload: { assessmentAssignmentCount: 1, assessmentAssignmentAttemptId: "a1" },
  });
  const { m, html } = renderPage(
    input(many, {
      academyWork: { state: "ready", rows: [fx.work({ workId: "a1" })] },
      assessmentHistory: { state: "ready", rows: [fx.history({ attemptId: "a1" })] },
    }),
  );
  const engine = computeNextBestActions(many, m.signals, NOW).all;
  ck("more than one action qualified", engine.length > 1);
  ck(
    "every qualifying action is reachable by href",
    engine.every((a) => html.includes(`href="${a.href}`)),
    engine
      .filter((a) => !html.includes(`href="${a.href}`))
      .map((a) => a.kind)
      .join(","),
  );
  ck("and only one wears the primary treatment", count(html, 'data-next-action="') === 1);
}

group("2 · every call to action names what it does, and why");
{
  const src = code(read("src/components/professional-identity/next-action-copy.ts"));
  ck('no "Fortsätt" CTA', !/c\("Fortsätt",\s*"Continue"\)/.test(src));
  const verbBlock = src.slice(src.indexOf("const VERB"), src.indexOf("const SECONDARY_LINK"));
  for (const kind of [
    "complete_assessment_assignment",
    "complete_training_assignment",
    "prepare_interview",
    "respond_to_clarification",
    "review_verification_outcome",
    "complete_profile_basics",
    "start_passport",
    "resume_draft_merits",
    "submit_passport_verification",
    "take_career_discovery",
    "create_career_card",
    "create_cv",
    "open_cv",
    "explore_jobs",
  ]) {
    ck(`${kind} has its own verb`, verbBlock.includes(`${kind}:`));
  }
  const { html } = renderPage(fx.fixtureById("eight_unverified")!.input);
  ck(
    "the recommendation states what kind of thing it is",
    /Rekommenderat nästa steg|Nytt för dig|Kräver din åtgärd/.test(html),
  );
  ck(
    "and why it is being made",
    html.includes("Du har 8 registrerade meriter som ännu inte är verifierade."),
  );
  ck(
    "a candidate takes a TEST, never a 'bedömning'",
    !/Slutför din bedömning|Öppna bedömningen/.test(src),
  );
  ck("no privacy overclaim about who sees a result", !/ingen annan|nobody else/.test(src));
  ck(
    "no 'used by everything' claim about a profile field",
    !/allt annat i CQrityjob|everything else in CQrityjob/.test(src),
  );
}

group("3 · the career analysis gate reaches the rendering");
{
  const fresh = fx.identity({
    displayName: "A",
    hasPassport: true,
    headline: "H",
    currentProfessionSlug: "vaktare",
    currentProfessionTitleSv: "Väktare",
  });
  const open = renderPage(
    input(fresh, {
      activeReport: fx.ACTIVE_NONE,
      storedReport: undefined,
      careerDiscoveryOpen: true,
    }),
  ).html;
  const shut = renderPage(
    input(fresh, {
      activeReport: fx.ACTIVE_NONE,
      storedReport: undefined,
      careerDiscoveryOpen: false,
    }),
  ).html;
  ck(
    "an admitted candidate is offered the assessment",
    open.includes('href="/security-career-assessment"'),
  );
  ck(
    "a refused candidate is NOT offered it as the recommendation",
    !shut
      .slice(shut.indexOf('data-next-action="primary"'), shut.indexOf("</article>"))
      .includes('href="/security-career-assessment"'),
  );
}

group("4 · one Career Card verb, and the card is guidance");
{
  const hero = render(<ProfessionalIdentityHeader identity={DUBAI} />);
  const { html } = renderPage(input(DUBAI));
  ck("the hero offers the card", hero.includes('href="/my-career/career-card"'));
  ck("the home offers the card", html.includes('href="/my-career/career-card"'));
  ck("the card is never 'your profile as a card'", !/Din profil som ett kort/.test(html));
  ck(
    "and is said to be guidance, not verification",
    html.includes("Career Card är karriärvägledning och är inte ett verifieringsbevis."),
  );
}

group("5 · no identifier reaches the screen");
{
  const hero = render(<ProfessionalIdentityHeader identity={DUBAI} />);
  const { html: home } = renderPage(input(DUBAI));
  const all = hero + home;
  ck("the stored profession slug is never printed", !/>vaktare</.test(all));
  ck("the sub-jurisdiction code is never printed", !all.includes("AE-DU"));
  ck("the bare country code is never printed as a value", !/>\s*AE\s*</.test(all));
  ck("the emirate is named", home.includes("Dubai"));
  ck("the career header never prints the stored experience band", !/5-10/.test(home));
  const profilePage = code(read("src/routes/_authenticated.my-career.profile.tsx"));
  ck(
    "the profile page resolves the experience band through its catalogue",
    profilePage.includes("yearsOfExperienceOptions"),
  );
}

group("6 · a read that did not answer says so, with a way out");
{
  const broken = fx.identity({
    displayName: "A",
    hasPassport: true,
    unavailable: ["claims", "passport", "applications", "provenance"],
  });
  const { html } = renderPage(
    input(broken, {
      applications: { state: "error" },
      jobs: { state: "error" },
      academyWork: { state: "error" },
      activeReportError: true,
      activeReport: undefined,
    }),
  );
  ck(
    "the Passport summary refuses to print a merit count",
    html.includes("Dina meriter kunde inte läsas") && !/data-merit-count/.test(html),
  );
  ck(
    "the career section says it could not be read and links to the history",
    html.includes("Din karriäranalys kunde inte läsas") &&
      html.includes('href="/security-career-assessment/history"'),
  );
  ck(
    "jobs failure offers the jobs page, never 'no matching jobs'",
    html.includes("Lediga jobb kunde inte hämtas") && !html.includes("Vi hittade inga jobb"),
  );
  ck(
    "tests failure offers the canonical area",
    html.includes("Dina tester kunde inte hämtas") &&
      html.includes("Öppna Tester &amp; utveckling"),
  );
  ck(
    "every failed section has a retry control",
    count(html, "data-retry") >= 4,
    count(html, "data-retry"),
  );
  // A genuine empty state is still stated as empty.
  const { html: genuine } = renderPage(input(fx.identity({ displayName: "A", hasPassport: true })));
  ck(
    "a real empty Passport shows real zeroes",
    genuine.includes('data-merit-count="registered"') && genuine.includes(">0</dd>"),
  );
  ck("and is not disguised as a failure", !genuine.includes("kunde inte läsas"));
}

group("7 · identity failure degrades one section, not the page");
{
  const { m, html } = renderPage(fx.fixtureById("identity_failed")!.input);
  ck(
    "the header says the details could not be loaded, with a retry",
    html.includes("Dina uppgifter kunde inte hämtas") && html.includes("data-retry"),
  );
  ck(
    "the deadlined test is still the recommended step",
    m.nextAction.state === "ready" &&
      m.nextAction.primary?.action.kind === "complete_assessment_assignment",
  );
  ck(
    "the Passport is unavailable, not a skeleton and not zero",
    m.passport.state === "unavailable" && !html.includes("data-loading"),
  );
  ck("the career picture still renders", m.career.state === "ready");
  ck("jobs still render", m.jobs.state === "filtered");
  ck(
    "applications still render",
    m.applications.state === "ready" && m.applications.activeCount === 1,
  );
}

group("8 · nothing stands permanently empty");
{
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  ck(
    "the lifecycle is the page ORDER, never a rendered checklist",
    !/showJourney|CareerJourney/.test(route),
  );
  ck(
    "earlier analyses render only when the model counted one",
    /model\.earlierReports\.state === "ready" && model\.earlierReports\.count > 0 && \(/.test(
      route,
    ),
  );
  ck("the candidate home carries no reviewer surface", !/MyReviewQueueCard|\/reviews/.test(route));
  ck(
    "an empty activity feed renders nothing",
    render(
      <RecentActivity
        activity={{ items: [], all: [], partial: false, unavailable: false, hasMore: false }}
      />,
    ) === "",
  );
  ck("an empty tools section renders nothing", render(<CareerTools tools={[]} />) === "");
  ck(
    "no training, no development section",
    render(
      <DevelopmentSection
        work={{
          state: "ready",
          tests: [],
          training: [],
          totalTests: 0,
          totalTraining: 0,
          waitingCount: 0,
        }}
      />,
    ) === "",
  );
  const profile = render(<ProfessionalIdentityHeader identity={DUBAI} variant="profile" />);
  ck("the profile hero renders exactly one h1", count(profile, "<h1") === 1);
  ck("the home route mounts its own header", /<CareerPageHeader/.test(route));
}

console.log("");
if (fails.length > 0) {
  console.error(`my-career-experience-check FAILED (${fails.length} issue(s)):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — my-career-experience-check");
