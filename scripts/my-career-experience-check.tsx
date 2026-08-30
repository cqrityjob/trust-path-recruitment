// /my-career — the guided experience, asserted against the RENDERED markup.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The dashboard had already ranked what somebody should do next and then
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
//   3. Everything else that qualified stays REACHABLE. Showing one action
//      must not be implemented by discarding the rest.
//
//   4. No CTA says merely "Continue"/"Fortsätt". A verb that does not name
//      what it does is the one word that tells nobody anything.
//
//   5. Career Discovery's gate still withholds the action it cannot honour.
//
//   6. The Career Card is offered with ONE verb across the whole page.
//      The hero said "Visa karriärkort" while the action list said "Skapa
//      ditt karriärkort", about the same single destination.
//
//   7. No raw slug or bare jurisdiction code reaches the rendered output.
//
//   8. /my-career/profile names itself. It used to mount the dashboard's
//      hero unchanged and was indistinguishable from /my-career above the
//      fold.
//
//   9. Sections that are irrelevant self-hide rather than standing empty.
//
// ── WHY IT RENDERS RATHER THAN READS ───────────────────────────────────
//
// Because every one of the above is a property of what a candidate SEES. A
// rule that holds while the component renders nothing passes a source scan
// and fixes nothing. Same approach and same constraint as
// prepilot-candidate-surface-check: I18nProvider starts at "sv" on the
// server, so Swedish is what is asserted from markup and the English half
// is asserted from the copy tables directly.
//
// Run: bun run my-career-experience:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";

// ── WHY <Link> IS REPLACED BY <a> ──────────────────────────────────────
//
// These components are reached through TanStack Router's <Link>, which
// needs a live router in context and does not render synchronously under
// renderToStaticMarkup. Standing one up would put a router's loading
// behaviour between this guard and the markup it is asserting on.
//
// The substitute renders the same element with the same resolved href, and
// it is deliberately faithful about params: `/academy/report/$id` with
// `{ id: "x" }` must come out as `/academy/report/x`, because "the primary
// card points at the engine's href" is one of the properties being proven
// and a stub that dropped params would prove it against a template.
//
// The mock has to be installed before the components are imported, which is
// why they arrive by dynamic import below rather than at the top.
await mock.module("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
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
const { CareerJourney } = await import("../src/components/professional-identity/CareerJourney");
const { ProfessionalIdentityHeader } = await import(
  "../src/components/professional-identity/ProfessionalIdentityHeader"
);
const { computeNextBestActions } = await import(
  "../src/lib/professional-identity/next-best-action"
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

/** I18nProvider starts at "sv" on the server, so Swedish is what is
 *  rendered and therefore what is asserted. */
function render(node: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
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
    const html = render(<NextActions identity={id} />);
    ck(`${label}: exactly one element is marked primary`, count(html, 'data-next-action="primary"') === 1);
  }

  // The primary must BE the engine's top-ranked action — same href, so a
  // renderer that quietly promoted a different one is caught.
  for (const [label, id] of cases) {
    const expected = computeNextBestActions(id).primary[0];
    if (!expected) {
      ck(`${label}: no action, so no primary card`, !render(<NextActions identity={id} />).includes('data-next-action="primary"'));
      continue;
    }
    const html = render(<NextActions identity={id} />);
    const primaryBlock = html.slice(html.indexOf('data-next-action="primary"'));
    ck(
      `${label}: the primary card links to the engine's top action (${expected.kind})`,
      primaryBlock.includes(`href="${expected.href}"`),
    );
  }

  // Everything else the engine returned stays reachable.
  {
    const many = identity({
      displayName: "A",
      hasPassport: true,
      claims: [claim()],
      workload: { ...EMPTY.workload, assessmentAssignmentCount: 1, releasedReportCount: 1, releasedReportAttemptId: "a1" },
    });
    const engine = computeNextBestActions(many).primary;
    const html = render(<NextActions identity={many} />);
    ck("more than one action qualified in this state", engine.length > 1);
    ck(
      "every qualifying action is still reachable by href",
      engine.every((a) => html.includes(`href="${a.href}"`)),
    );
    ck(
      "and the ones that are not the recommendation are marked secondary",
      count(html, 'data-next-action="secondary"') === engine.length - 1,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 2 · No CTA says merely "Continue"                                   */
/* ------------------------------------------------------------------ */

group("2 · every call to action names what it does");
{
  const src = code(read("src/components/professional-identity/NextActions.tsx"));
  // The generic verb, in both languages, as a rendered CTA string.
  ck('the renderer authors no "Fortsätt" CTA', !/c\("Fortsätt",\s*"Continue"\)/.test(src));

  // Every kind the engine can emit has a verb of its own.
  const verbBlock = src.slice(src.indexOf("const VERB"), src.indexOf("const HEADING"));
  for (const kind of [
    "complete_assessment_assignment",
    "read_released_report",
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
  // put. A recommendation nobody can interrogate is an instruction.
  const html = render(<NextActions identity={DUBAI} />);
  const why = computeNextBestActions(DUBAI).primary[0];
  ck("the recommendation states why it is being made", Boolean(why) && html.includes("Rekommenderat"));
}

/* ------------------------------------------------------------------ */
/* 3 · The Career Discovery gate still withholds                       */
/* ------------------------------------------------------------------ */

group("3 · the Career Discovery gate reaches the rendering");
{
  const fresh = identity({ displayName: "A", hasPassport: true, headline: "H", currentProfessionSlug: "vaktare", currentProfessionTitleSv: "Väktare" });
  const open = render(<NextActions identity={fresh} signals={{ careerDiscoveryOpen: true }} />);
  const closed = render(<NextActions identity={fresh} signals={{ careerDiscoveryOpen: false }} />);
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
  const actions = render(<NextActions identity={DUBAI} />);
  const both = hero + actions;
  ck("the hero offers the card", hero.includes('href="/my-career/career-card"'));
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
  const journey = render(<CareerJourney identity={DUBAI} />);
  const html = hero + journey;
  ck("the stored profession slug is never printed", !html.includes("vaktare"));
  ck("the sub-jurisdiction code is never printed", !html.includes("AE-DU"));
  // ">AE<" rather than "AE": the string appears inside class names and hrefs.
  ck("the bare country code is never printed as a value", !/>\s*AE\s*</.test(html));
  ck("the emirate is named", html.includes("Dubai"));

  // The experience BAND is a stored enum too. The profile page printed "1-3"
  // straight from `years_of_experience` -- same class of leak as a slug, and
  // invisible to a render check of the hero, which formats it correctly.
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
  const journey = render(<CareerJourney identity={broken} />);
  ck("the hero refuses to print a verified count", hero.includes("Kunde inte läsas"));
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
/* 7 · The profile page names itself                                   */
/* ------------------------------------------------------------------ */

group("7 · /my-career/profile is not /my-career");
{
  const home = render(<ProfessionalIdentityHeader identity={DUBAI} />);
  const profile = render(<ProfessionalIdentityHeader identity={DUBAI} variant="profile" showProfileLink={false} />);

  ck("the profile hero carries the page name in its h1", /<h1[^>]*>Min profil<\/h1>/.test(profile));
  ck("the home hero does not", !/<h1[^>]*>Min profil<\/h1>/.test(home));
  ck("the home hero leads with the professional title", /<h1[^>]*>Säkerhetssamordnare<\/h1>/.test(home));
  ck("the profile page still shows the professional title", profile.includes("Säkerhetssamordnare"));
  ck("the profile page states its purpose", profile.includes("avsnitt för avsnitt"));
  ck("the profile page does not link to itself", !profile.includes('href="/my-career/profile"'));
  ck("the home hero does", home.includes('href="/my-career/profile"'));

  // Exactly one h1 per surface. The profile page adds its own headings below
  // this hero, so a second h1 here would be two page titles.
  ck("the home hero renders exactly one h1", count(home, "<h1") === 1);
  ck("the profile hero renders exactly one h1", count(profile, "<h1") === 1);

  const page = code(read("src/routes/_authenticated.my-career.profile.tsx"));
  ck('the profile route mounts the hero as variant="profile"', /variant="profile"/.test(page));
  ck("and no other h1 is authored on that page", !/<h1/.test(page));
}

/* ------------------------------------------------------------------ */
/* 8 · Sections self-hide when they are irrelevant                     */
/* ------------------------------------------------------------------ */

group("8 · nothing stands permanently empty");
{
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  ck("employer tasks render only when one exists", /\{hasEmployerTask && \(/.test(route));
  ck("the interview panel renders only when there is an interview", /\{nextInterview && \(/.test(route));
  ck("the career journey renders only once the identity read answered", /identityQ\.data && <CareerJourney/.test(route));
  ck("the self-hiding reviewer queue card stays on the page", route.includes("MyReviewQueueCard"));

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
