// The candidate's ONE navigation — the canon, and the duplicates kept out.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The owner's pilot review found the candidate being shown two navigation
// systems at once. Under /my-career the primary navigation offered "Min
// karriär" → /my-career while a section strip directly beneath it offered
// "Översikt" → /my-career: one URL, two names, two navigations, stacked.
// Every other entry in that strip was a destination the primary navigation
// already owned or that the owner's sketches move elsewhere.
//
// The strip is retired and the label is "Översikt". None of that is
// visible to a type checker, and all of it is one careless edit from
// coming back. So this guard replaces scripts/my-career-hub-check.tsx,
// whose entire subject was the strip: it asserts the strip's ABSENCE and
// the canon that replaced it, which is strictly more than the old guard
// covered.
//
//   1. SEVEN destinations, the owner's seven, each exactly once, and no two
//      of them resolving to the same place.
//   2. No retired label returns. "Min karriär" may not be a candidate
//      navigation label while "Översikt" is the name of that destination.
//   3. Career Card is not in the navigation and is not a reachable pilot
//      page — its route must redirect, not render.
//   4. CV has one primary destination and remains contextually reachable.
//   5. No second candidate section navigation is rendered in the shell.
//   6. Every primary control has a destination that resolves to a real
//      route in the generated route tree. A nav item pointing at a path
//      the router does not know is a dead control that looks alive.
//   7. The brand mark goes to "/" unconditionally.
//
// Run: bun run candidate-navigation-canon:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const NAV_SRC = "src/components/site/candidate-app-nav.ts";
const SHELL = "src/routes/_authenticated.my-career.tsx";
const HEADER = "src/components/site/SiteHeader.tsx";
const CARD_ROUTE = "src/routes/_authenticated.my-career.career-card.tsx";
const IDENTITY_HEADER = "src/components/professional-identity/ProfessionalIdentityHeader.tsx";
const NEXT_ACTION = "src/lib/professional-identity/next-best-action.ts";
const HOME_PRESENTATION = "src/lib/professional-identity/home-presentation.ts";

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

/** Comments stripped, so a rule is never satisfied by prose ABOUT the
 *  rule. Every assertion below reads real code. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");
}

/** Route ids the router actually generated, read from the id map rather
 *  than by scanning the whole file: routeTree.gen.ts declares parallel
 *  maps by full path, by "to" and by id, and mixing them asserts a
 *  mapping for routes the router will never report. */
const ROUTE_IDS: string[] = (() => {
  const src = read("src/routeTree.gen.ts");
  const start = src.indexOf("export interface FileRoutesById {");
  if (start < 0) throw new Error("FileRoutesById not found in routeTree.gen.ts");
  const block = src.slice(start, src.indexOf("\n}", start));
  return Array.from(block.matchAll(/^ {2}'(\/[^']*)': typeof /gm)).map((m) => m[1]!);
})();

const navSrc = read(NAV_SRC);
const navCode = code(navSrc);

/* ------------------------------------------------------------------ */
/* 1 · The owner's seven, once each, no two the same                     */
/* ------------------------------------------------------------------ */
console.log("\n1 · the seven canonical destinations");

const keys = Array.from(navCode.matchAll(/key: "([^"]+)"/g)).map((m) => m[1]!);
const tos = Array.from(navCode.matchAll(/\n\s*to: "([^"]+)"/g)).map((m) => m[1]!);
const labelKeys = Array.from(navCode.matchAll(/labelKey: "([^"]+)"/g)).map((m) => m[1]!);

// Owner decision 2026-09-24 inserts Security Work directly after Passport.
// This legitimately supersedes the six-item canon, while preserving uniqueness.
const EXPECTED_KEYS = [
  "overview",
  "passport",
  "security-work",
  "cv",
  "jobs",
  "career",
  "assessments",
];
const EXPECTED_TOS = [
  "/my-career",
  "/passport",
  "/security-work",
  "/my-career/cv",
  "/jobs",
  "/career-center",
  "/academy",
];

check(
  keys.join(",") === EXPECTED_KEYS.join(","),
  `the navigation is exactly the owner's seven, in the current agreed order (got ${keys.join(",") || "nothing"})`,
);
check(
  tos.join(",") === EXPECTED_TOS.join(","),
  "each of the seven points at its canonical destination",
);
check(
  new Set(tos).size === tos.length,
  "no two navigation entries resolve to the same destination -- the Översikt/Min karriär defect, generalised",
);
check(new Set(labelKeys).size === labelKeys.length, "no two navigation entries share a label");

/* ------------------------------------------------------------------ */
/* 2 · Every primary control has a real destination                    */
/* ------------------------------------------------------------------ */
console.log("\n2 · no primary control without a destination");

for (const to of tos) {
  const resolves = ROUTE_IDS.some(
    (id) => id.replace(/^\/_authenticated/, "").replace(/\/+$/, "") === to,
  );
  check(resolves, `${to} resolves to a route the router generated`);
}

/* ------------------------------------------------------------------ */
/* 3 · Retired labels stay retired                                     */
/* ------------------------------------------------------------------ */
console.log("\n3 · the retired duplicate label does not return");

check(
  !labelKeys.includes("nav.my_career"),
  '"Min karriär" is not a candidate navigation label -- that destination is called Översikt, and one destination gets one name',
);
check(labelKeys.includes("nav.overview"), "the candidate home is labelled Översikt");

/* ------------------------------------------------------------------ */
/* 4 · The CV is a destination AND still contextually reachable        */
/* ------------------------------------------------------------------ */
//
// This section asserted the opposite until the owner's images 1 and 2 put
// the CV in the navigation: it required that NO nav entry point at the CV,
// on the earlier explicit rule that it is reached from Översikt and Jobb.
//
// The rule underneath survives the reversal and is what is asserted now.
// A capability has ONE canonical home, and a summary elsewhere LINKS to it
// rather than replacing it. So the CV must have exactly one navigation
// entry, pointing at its canonical route — and the contextual entries must
// STILL be there. Adding the nav item and ripping out the Overview tile or
// the Jobs card would be the regression this now catches, and it is the
// one a naive "the CV is in the nav now" edit would cause.
console.log("\n4 · the CV is a destination, and the contextual paths survive");

const cvEntries = tos.filter((t) => t.includes("/cv"));
check(
  cvEntries.length === 1,
  `exactly one navigation entry points at the CV (got ${cvEntries.length})`,
);
check(
  cvEntries[0] === "/my-career/cv",
  "and it points at the canonical CV route, not /cv/new or a deep link",
);
check(keys.includes("cv"), "the CV navigation key exists");

// The contextual paths the CV had before it was promoted. A nav item does
// not replace them: the Overview and the Jobs side column are where
// somebody meets the CV in the middle of doing something else.
//
// On the Overview the CV was one of four status tiles. It is a surface of
// its own now -- the CV card in OverviewSurfaces, with "Edit CV" -- so that
// is where this looks, and it requires the card to be MOUNTED as well as to
// exist: a component nobody renders reaches nothing.
const cvCard = code(read("src/components/professional-identity/OverviewSurfaces.tsx"));
const overviewRoute = code(read("src/routes/_authenticated.my-career.index.tsx"));
check(
  /<Link to="\/my-career\/cv" data-edit-cv/.test(cvCard) && /<OverviewCvCard/.test(overviewRoute),
  "the Overview still reaches the CV",
);
const jobsColumn = code(read("src/components/jobs/JobsSideColumn.tsx"));
check(/to="\/my-career\/cv"/.test(jobsColumn), "and the Jobs side column still does too");

// A destination promoted into the navigation must stop presenting itself as
// subordinate to a sibling. The CV index opened with a back arrow to
// Översikt — correct while the CV was reached only from there, wrong once
// somebody arrives from the nav bar, and labelled with the WORKSPACE name
// on top of that. Every primary destination is checked, not just the CV,
// because the next promotion will have the same defect.
for (const [label, file] of [
  ["the CV", "src/routes/_authenticated.my-career.cv.index.tsx"],
  ["the Passport", "src/routes/_authenticated.passport.index.tsx"],
  ["Tests & Development", "src/routes/_authenticated.academy.index.tsx"],
] as const) {
  const page = code(read(file));
  check(
    !/<Link\s+to="\/my-career"[\s>]/.test(page),
    `${label} does not open with a back-link to a sibling destination`,
  );
}

/* ------------------------------------------------------------------ */
/* 5 · Career Card is hidden for the pilot                             */
/* ------------------------------------------------------------------ */
console.log("\n5 · Career Card is hidden for the pilot");

check(!navCode.includes("career-card"), "Career Card is not in the candidate navigation");

const cardRoute = code(read(CARD_ROUTE));
check(
  /throw redirect\(/.test(cardRoute),
  "the Career Card route redirects rather than rendering a pilot page",
);
check(
  !/component:/.test(cardRoute),
  "and mounts no component, so it cannot render behind the redirect",
);
check(
  /to: "\/my-career"/.test(cardRoute),
  "and its redirect target is the canonical Översikt, so an old bookmark lands somewhere true",
);

check(
  !code(read(IDENTITY_HEADER)).includes("career-card"),
  '"Visa/View Career Card" is gone from the identity header',
);
check(
  !code(read(NEXT_ACTION)).includes("/my-career/career-card"),
  "no recommended next step points at the Career Card -- a recommendation that redirects away when followed is a dead control",
);
check(
  !code(read(HOME_PRESENTATION)).includes("/my-career/career-card"),
  "the career tools list does not offer the Career Card",
);

// ── THE ENTRY POINT THAT IS NOT A ROUTE ──────────────────────────────
//
// PR A hid the Career Card's route and every entry point that NAVIGATED
// to it, and missed this one: the Career Discovery report carried its own
// CTA that opened the creator INLINE, so nothing about hiding a route
// reached it. A control that opens a product removed from the pilot is
// the dead control the review was about, whether it navigates or not --
// so this guard checks for the component and the handler, not for a href.
const REPORT_VIEW = "src/components/career-discovery/v31/V31ReportView.tsx";
const reportView = code(read(REPORT_VIEW));
check(
  !/<CareerCardCreator/.test(reportView),
  "the Career Discovery report mounts no Career Card creator",
);
check(
  !/setCareerCardOpen|createCareerCardCta/.test(reportView),
  "and offers no inline control that opens one -- hiding a route does not reach a modal",
);

/* ------------------------------------------------------------------ */
/* 6 · One navigation, not two                                         */
/* ------------------------------------------------------------------ */
console.log("\n6 · no second candidate section navigation");

const shell = code(read(SHELL));
check(
  !/MyCareerHubNav/.test(shell),
  "the candidate shell renders no section strip beside the primary navigation",
);
check(
  !/resolveHubSection|MY_CAREER_HUB/.test(shell),
  "and computes no section-strip active state, so there is nothing to render one from",
);
check(
  !/<nav\b/.test(shell),
  "the shell declares no <nav> of its own -- the primary navigation is the candidate's only navigation",
);

/* ------------------------------------------------------------------ */
/* 7 · The brand mark leaves to the public homepage                    */
/* ------------------------------------------------------------------ */
console.log("\n7 · the logo goes to the public homepage");

const header = code(read(HEADER));
const brandLink = /<Link\s+to="\/"/.test(header);
check(brandLink, 'the brand mark links to "/" literally');
check(
  !/to=\{appMode \? "\/my-career" : "\/"\}/.test(header),
  "and not through a ternary that makes the mark mean two different things depending on who is reading it",
);

/* ------------------------------------------------------------------ */

console.log("");
if (failures.length > 0) {
  console.error(`candidate-navigation-canon-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Candidate navigation canon: ${assertions} of ${assertions} assertions passed.`);
