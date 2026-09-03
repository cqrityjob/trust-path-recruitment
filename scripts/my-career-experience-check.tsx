// /my-career — the guided experience, asserted against the RENDERED markup.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The home had already ranked what somebody should do next and then
// declined to say so: the top three actions rendered as three identical
// cards, each ending in the word "Continue". Every property that fixed it
// is one careless edit from coming back, and none of them is visible to the
// existing guards, which read source rather than output:
//
//   1. EXACTLY ONE recommendation is marked primary. Not two, not three.
//      A second primary is the old three-card treatment returning by
//      degrees, and it is a one-word change to `data-next-action`.
//
//   2. The recommendation is the engine's TOP action. The ranking lives in
//      next-best-action.ts and this surface may express it, never re-rank
//      it — a renderer that sorts by its own idea of importance is a second
//      recommendation engine nobody versioned.
//
//   3. Everything else that qualified stays REACHABLE — as a secondary
//      status beside the primary, or as a row under "Bygg vidare".
//
//   4. No CTA says merely "Continue"/"Fortsätt". A verb that does not name
//      what it does is the one word that tells nobody anything.
//
//   5. Career Discovery's gate still withholds the action it cannot honour.
//
//   6. The Career Card is offered with ONE verb across the whole page.
//
//   7. No raw slug or bare jurisdiction code reaches the rendered output.
//
//   8. /my-career/profile names itself, and the compact greeting on the
//      home greets by first name with exactly one h1.
//
//   9. Sections that are irrelevant self-hide rather than standing empty.
//
// ── WHY IT RENDERS RATHER THAN READS ───────────────────────────────────
//
// Because every one of the above is a property of what a candidate SEES. A
// rule that holds while the component renders nothing passes a source scan
// and fixes nothing. I18nProvider starts at "sv" on the server, so Swedish
// is what is asserted from markup and the English half is asserted from
// the copy tables directly.
//
// Run: bun run my-career-experience:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";
import type { HomePresentationInput } from "../src/lib/professional-identity/home-presentation";

// ── WHY <Link> IS REPLACED BY <a> ──────────────────────────────────────
//
// These components are reached through TanStack Router's <Link>, which
// needs a live router in context and does not render synchronously under
// renderToStaticMarkup. The substitute renders the same element with the
// same resolved href, faithfully about params.
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
const { NextActions } = await import("../src/components/professional-identity/NextActions");
const { ExploreAndGrow } = await import("../src/components/professional-identity/ExploreAndGrow");
const { ActiveWork } = await import("../src/components/professional-identity/ActiveWork");
const { RecentActivity } = await import("../src/components/professional-identity/RecentActivity");
const { CareerJourney } = await import("../src/components/professional-identity/CareerJourney");
const { ProfessionalIdentityHeader } = await import(
  "../src/components/professional-identity/ProfessionalIdentityHeader"
);
const { computeNextBestActions } = await import(
  "../src/lib/professional-identity/next-best-action"
);
const { buildHomePresentation } = await import(
  "../src/lib/professional-identity/home-presentation"
);

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Comments DISCUSS the copy they are about, so a naive scan reads prose as
 *  code. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

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

function identity(over: Partial<ProfessionalIdentityV1> = {}): ProfessionalIdentityV1 {
  return { ...EMPTY, ...over };
}

function claim(over: Partial<ProfessionalIdentityV1["claims"][number]> = {}) {
  return {
    id: "c1",
    claimType: "certification",
    title: "Väktarutbildning VU1",
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

/** A holder in Dubai with a completed, career-naming report — the state that
 *  exercises the jurisdiction formatter AND the Career Card verb at once. */
const DUBAI = identity({
  displayName: "Amina Rashid",
  headline: "Säkerhetssamordnare",
  accountCountry: "AE",
  workCountry: "AE",
  workSubJurisdiction: "AE-DU",
  currentProfessionSlug: "vaktare",
  currentProfessionTitleSv: "Väktare",
  currentProfessionTitleEn: "Security officer",
  yearsOfExperience: "5-10",
  hasPassport: true,
  claims: [claim({ assertionLevel: "verified" }), claim({ id: "c2" })],
  discovery: { hasCompletedReport: true, snapshotId: "s1", generatedAt: "2026-01-01", namesCareers: true },
});

const NOW = new Date("2026-09-03T12:00:00Z");

/** The presentation model with every optional read still loading — the
 *  identity alone, which is what the engine ranked on before. */
function model(id: ProfessionalIdentityV1, over: Partial<HomePresentationInput> = {}) {
  return buildHomePresentation({
    identity: id,
    verificationAttention: null,
    assignments: { state: "loading" },
    interviews: { state: "loading" },
    applications: { state: "loading" },
    now: NOW,
    ...over,
  });
}

/** I18nProvider starts at "sv" on the server, so Swedish is what is
 *  rendered and therefore what is asserted. */
function render(node: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

/** The whole action surface for one state: the workspace plus the explore
 *  section, which between them must carry every action the engine returned. */
function renderActions(id: ProfessionalIdentityV1, over: Partial<HomePresentationInput> = {}) {
  const m = model(id, over);
  return {
    m,
    html:
      render(<NextActions workspace={m.workspace} />) + render(<ExploreAndGrow items={m.explore} />),
  };
}

/** Count non-overlapping occurrences. */
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

console.log("my-career-experience-check");

/* ------------------------------------------------------------------ */
/* 1 · One recommendation, and it is the engine's                      */
/* ------------------------------------------------------------------ */

group("1 · exactly one primary next action");
{
  // Four states chosen to produce different ladder winners, so the property
  // is proven across the ladder rather than for one lucky account.
  const cases: readonly (readonly [string, ProfessionalIdentityV1])[] = [
    ["a brand-new candidate", identity({ displayName: "Ny" })],
    [
      "an employer is waiting",
      identity({
        displayName: "A",
        hasPassport: true,
        workload: { ...EMPTY.workload, assessmentAssignmentCount: 2 },
      }),
    ],
    [
      "a report has been released",
      identity({
        displayName: "A",
        hasPassport: true,
        headline: "H",
        currentProfessionSlug: "vaktare",
        currentProfessionTitleSv: "Väktare",
        workload: {
          ...EMPTY.workload,
          releasedReportCount: 1,
          releasedReportAttemptId: "att-1",
        },
      }),
    ],
    ["an established holder in Dubai", DUBAI],
  ];

  for (const [label, id] of cases) {
    const { html } = renderActions(id);
    ck(`${label}: exactly one element is marked primary`, count(html, 'data-next-action="primary"') === 1);
    ck(`${label}: exactly one primary call to action`, count(html, "data-primary-cta") === 1);
  }

  // The primary must BE the engine's top-ranked action — same href, so a
  // renderer that quietly promoted a different one is caught.
  for (const [label, id] of cases) {
    const { m, html } = renderActions(id);
    const expected = computeNextBestActions(id, m.signals).all[0];
    if (!expected) {
      ck(`${label}: no action, so no primary call to action`, !html.includes("data-primary-cta"));
      continue;
    }
    const primaryBlock = html.slice(html.indexOf('data-next-action="primary"'));
    ck(
      `${label}: the primary card links to the engine's top action (${expected.kind})`,
      primaryBlock.slice(0, primaryBlock.indexOf("</article>")).includes(`href="${expected.href}"`),
    );
  }

  // Everything else the engine returned stays reachable.
  {
    const many = identity({
      displayName: "A",
      hasPassport: true,
      claims: [claim()],
      workload: {
        ...EMPTY.workload,
        assessmentAssignmentCount: 1,
        releasedReportCount: 1,
        releasedReportAttemptId: "a1",
      },
    });
    const { m, html } = renderActions(many);
    const engine = computeNextBestActions(many, m.signals).all;
    ck("more than one action qualified in this state", engine.length > 1);
    ck(
      "every qualifying action is still reachable by href",
      engine.every((a) => html.includes(`href="${a.href}"`)),
    );
    ck(
      "and the ones that are not the recommendation are marked secondary or more",
      count(html, 'data-next-action="secondary"') + count(html, 'data-next-action="more"') ===
        engine.length - 1,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 2 · No CTA says merely "Continue"                                   */
/* ------------------------------------------------------------------ */

group("2 · every call to action names what it does");
{
  const src = code(read("src/components/professional-identity/next-action-copy.ts"));
  // The generic verb, in both languages, as a rendered CTA string.
  ck('the renderer authors no "Fortsätt" CTA', !/c\("Fortsätt",\s*"Continue"\)/.test(src));

  // Every kind the engine can emit has a verb of its own.
  const verbBlock = src.slice(src.indexOf("const VERB"), src.indexOf("const SECTION_TITLE"));
  for (const kind of [
    "complete_assessment_assignment",
    "prepare_interview",
    "respond_to_clarification",
    "read_released_report",
    "review_verification_outcome",
    "complete_profile_basics",
    "start_passport",
    "submit_passport_verification",
    "take_career_discovery",
    "create_career_card",
    "create_cv",
    "open_cv",
    "explore_jobs",
  ]) {
    ck(`${kind} has its own verb`, verbBlock.includes(`${kind}:`));
  }

  // And a reason, which is the half the three-card treatment had nowhere to
  // put. A recommendation nobody can interrogate is an instruction. The
  // classification is said in words beside it.
  const { html } = renderActions(DUBAI);
  ck(
    "the recommendation states what kind of thing it is",
    /Förslag|Nytt för dig|Kräver din åtgärd/.test(html),
  );
  ck("and why it is being made", html.includes("1 uppgift är inlagd men ännu inte granskad."));
}

/* ------------------------------------------------------------------ */
/* 3 · The Career Discovery gate still withholds                       */
/* ------------------------------------------------------------------ */

group("3 · the Career Discovery gate reaches the rendering");
{
  const fresh = identity({
    displayName: "A",
    hasPassport: true,
    headline: "H",
    currentProfessionSlug: "vaktare",
    currentProfessionTitleSv: "Väktare",
  });
  const open = renderActions(fresh, { careerDiscoveryOpen: true }).html;
  const closed = renderActions(fresh, { careerDiscoveryOpen: false }).html;
  ck("an admitted candidate is offered the assessment", open.includes('href="/security-career-assessment"'));
  ck(
    "a candidate the gate refuses is NOT offered it",
    !closed.includes('href="/security-career-assessment"'),
  );
}

/* ------------------------------------------------------------------ */
/* 4 · The Career Card is offered with ONE verb                        */
/* ------------------------------------------------------------------ */

group("4 · one Career Card verb across the page");
{
  const hero = render(<ProfessionalIdentityHeader identity={DUBAI} />);
  const actions = renderActions(DUBAI).html;
  const both = hero + actions;
  ck("the hero offers the card", hero.includes('href="/my-career/career-card"'));
  ck("the workspace offers the card", actions.includes('href="/my-career/career-card"'));
  ck(
    'nothing on the page says "Skapa ditt karriärkort" about a card built from an existing report',
    !both.includes("Skapa ditt karriärkort"),
  );
  ck(
    "the card destination is described with the same verb wherever it appears",
    !(both.includes("Skapa karriärkort") && both.includes("Visa karriärkort")),
  );
}

/* ------------------------------------------------------------------ */
/* 5 · No raw slug or bare jurisdiction code is rendered               */
/* ------------------------------------------------------------------ */

group("5 · no identifier reaches the screen");
{
  const hero = render(<ProfessionalIdentityHeader identity={DUBAI} />);
  const compact = render(<ProfessionalIdentityHeader identity={DUBAI} variant="compact" />);
  const journey = render(<CareerJourney identity={DUBAI} />);
  const html = hero + compact + journey;
  ck("the stored profession slug is never printed", !html.includes("vaktare"));
  ck("the sub-jurisdiction code is never printed", !html.includes("AE-DU"));
  // ">AE<" rather than "AE": the string appears inside class names and hrefs.
  ck("the bare country code is never printed as a value", !/>\s*AE\s*</.test(html));
  ck("the emirate is named", html.includes("Dubai") && compact.includes("Dubai"));
  // The experience BAND is a stored enum. The compact greeting resolves it
  // through the same catalogue the editor offers.
  ck("the compact greeting never prints the stored experience band", !/5-10/.test(compact));
  ck("and states the experience in words", compact.includes("5–10 års erfarenhet"));

  const profilePage = code(read("src/routes/_authenticated.my-career.profile.tsx"));
  ck(
    "the profile page resolves the experience band through its catalogue",
    profilePage.includes("yearsOfExperienceOptions"),
  );
  ck(
    "and never prints the stored band directly",
    !/text:\s*identity\.yearsOfExperience\s*\?\?/.test(profilePage),
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Unknown is never rendered as zero                               */
/* ------------------------------------------------------------------ */

group("6 · a read that did not answer says so");
{
  const broken = identity({
    displayName: "A",
    hasPassport: true,
    unavailable: ["claims", "passport", "applications"],
  });
  const hero = render(<ProfessionalIdentityHeader identity={broken} />);
  const compact = render(<ProfessionalIdentityHeader identity={broken} variant="compact" />);
  const journey = render(<CareerJourney identity={broken} />);
  ck("the hero refuses to print a verified count", hero.includes("Kunde inte läsas"));
  ck("the compact greeting says parts could not be read", compact.includes("kunde inte läsas"));
  ck("the journey refuses to print an application count", journey.includes("Kunde inte läsas"));
  ck(
    "and the completeness percentage is withheld rather than computed from a partial read",
    !/\d+\s*% ifyllt/.test(hero),
  );

  // A genuine zero is still a zero — the guard must not be satisfied by a
  // component that says "could not be read" about everything.
  const genuine = render(<CareerJourney identity={identity({ displayName: "A" })} />);
  ck("a real empty state is still stated as empty", genuine.includes("Inga ansökningar ännu"));
  ck("and is not disguised as a failure", !genuine.includes("Kunde inte läsas"));
}

/* ------------------------------------------------------------------ */
/* 7 · The profile page names itself; the home greets                  */
/* ------------------------------------------------------------------ */

group("7 · /my-career/profile is not /my-career");
{
  const home = render(<ProfessionalIdentityHeader identity={DUBAI} />);
  const compact = render(<ProfessionalIdentityHeader identity={DUBAI} variant="compact" />);
  const profile = render(<ProfessionalIdentityHeader identity={DUBAI} variant="profile" showProfileLink={false} />);

  ck("the profile hero carries the page name in its h1", /<h1[^>]*>Min profil<\/h1>/.test(profile));
  ck("the home hero does not", !/<h1[^>]*>Min profil<\/h1>/.test(home));
  ck("the home hero leads with the professional title", /<h1[^>]*>Säkerhetssamordnare<\/h1>/.test(home));
  ck(
    "the compact greeting greets by first name",
    /<h1[^>]*>Välkommen tillbaka, Amina<\/h1>/.test(compact),
  );
  ck("and carries the professional title in the identity row", compact.includes("Säkerhetssamordnare"));
  ck("the profile page still shows the professional title", profile.includes("Säkerhetssamordnare"));
  ck("the profile page states its purpose", profile.includes("avsnitt för avsnitt"));
  ck("the profile page does not link to itself", !profile.includes('href="/my-career/profile"'));
  ck("the home hero does", home.includes('href="/my-career/profile"'));
  ck("the compact greeting does", compact.includes('href="/my-career/profile"'));

  // Exactly one h1 per surface.
  ck("the home hero renders exactly one h1", count(home, "<h1") === 1);
  ck("the compact greeting renders exactly one h1", count(compact, "<h1") === 1);
  ck("the profile hero renders exactly one h1", count(profile, "<h1") === 1);

  const page = code(read("src/routes/_authenticated.my-career.profile.tsx"));
  ck('the profile route mounts the hero as variant="profile"', /variant="profile"/.test(page));
  ck("and no other h1 is authored on that page", !/<h1/.test(page));
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  ck('the home route mounts the greeting as variant="compact"', /variant="compact"/.test(route));
}

/* ------------------------------------------------------------------ */
/* 8 · Sections self-hide when they are irrelevant                     */
/* ------------------------------------------------------------------ */

group("8 · nothing stands permanently empty");
{
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  ck("the onboarding journey renders only for a new account", /presentation\.showJourney && \(/.test(route));
  ck("relevant roles render only once the read answered", /jobsQ\.isSuccess && \(/.test(route));
  ck("the candidate home carries no reviewer surface", !/MyReviewQueueCard|\/reviews/.test(route));

  const titleOf = () => "x";
  ck("an empty active-work section renders nothing", render(<ActiveWork items={[]} titleOf={titleOf} />) === "");
  ck(
    "an empty activity feed renders nothing",
    render(<RecentActivity activity={{ items: [], partial: false, unavailable: false }} />) === "",
  );
  ck("an empty explore section renders nothing", render(<ExploreAndGrow items={[]} />) === "");

  // The hero's own action row disappears rather than holding open an empty
  // strip for somebody with no card and no profile link.
  const bare = render(
    <ProfessionalIdentityHeader identity={identity({ displayName: "A" })} showProfileLink={false} />,
  );
  ck("the hero's action row is hidden when it would be empty", bare.includes('class="hidden"'));
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`my-career-experience-check FAILED (${fails.length} issue(s)):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — my-career-experience-check");
