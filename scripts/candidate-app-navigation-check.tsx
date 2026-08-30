// The signed-in candidate's navigation and vocabulary — asserted against
// the RENDERED markup and against the router's own route table.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// Before this guard existed the product had one navigation, the marketing
// site's, and served it to people standing inside their own workspace.
// Concretely, a signed-in candidate was shown:
//
//   Säkerhetskarriärcenter · Jobb · Arbetsgivare · Bedömningar ·
//   Om oss · Kontakt        (+ a second "Kontakt" in the utility bar)
//
// — six items, not one of which was their own career; "Min karriär"
// demoted to a small outlined button on the far right; and Security
// Passport, the product the brand is built on, absent from the chrome
// entirely at every width. Every one of those properties is one careless
// edit from returning, and none of them is visible to a type checker.
//
//   1. FOUR destinations, each exactly ONCE, desktop and mobile, in the
//      same order. Not five. Not four on desktop and three at 375.
//
//   2. The candidate's chrome carries no marketing item. /employers,
//      /about, /contact, /assessment and /career-center may not appear in
//      it — they are the website's navigation and they stay on the
//      website.
//
//   3. Current location survives NESTING. /my-career/cv/new lights My
//      Career; /passport/information lights Security Passport;
//      /academy/report/$attemptId lights Bedömningar. A guard that only
//      checked the four index routes would pass while every real page a
//      candidate visits showed nothing as current.
//
//   4. /passport-attestations does NOT light Security Passport. It lives
//      under the Passport's name and is authorised by has_employer_role —
//      it is an employer's attestation desk. A bare startsWith would have
//      swallowed it, which is why the match is segment-bounded.
//
//   5. Current location is never colour alone: aria-current, a weight
//      change and a rule, on both viewports.
//
//   6. ONE NAME PER PRODUCT. Career Discovery, Karriäranalys, Security
//      Passport, Career Card and Min profil are five different things and
//      the candidate surfaces used ten words for them — "Din
//      karriärprofil" and "Karriärprofil" for two DIFFERENT objects on one
//      page, "karriärutforskningen"/"Career Discovery" for one product in
//      one language, "Säkerhetspasset" where the product is called
//      Security Passport everywhere else.
//
//   7. Provenance survives the simplification. Self-reported, assessment-
//      derived and verified must stay three distinct things — a shorter
//      vocabulary that lets a Passport claim look user-editable is worse
//      than the long one.
//
//   8. No raw route name is a product name. The path stays /academy; the
//      word "Academy" never reaches a candidate as a product.
//
// ── WHY IT RENDERS AND WHY IT READS THE ROUTE TABLE ────────────────────
//
// Rendered, because every navigation property above is a property of what
// somebody SEES; a rule that holds while the component renders nothing
// passes a source scan and fixes nothing. Against routeTree.gen.ts,
// because "this nav item resolves" and "this prefix matches a real route"
// are claims about the router, and the router already wrote them down.
//
// I18nProvider starts at "sv" on the server, so Swedish is asserted from
// markup and English from the copy tables — the same constraint and the
// same split as my-career-experience-check.
//
// Run: bun run candidate-app-navigation:check

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same substitute, and for the same reason, as my-career-experience-check:
// <Link> needs a live router and does not render synchronously under
// renderToStaticMarkup. Params are resolved faithfully so an href proved
// here is the href a candidate clicks.
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
const { CandidateAppNav } = await import("../src/components/site/CandidateAppNav");
const { CANDIDATE_APP_NAV, resolveCandidateNav, matchesRouteId } =
  await import("../src/components/site/candidate-app-nav");

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
/** Comments DISCUSS the copy they are about, so a naive scan reads prose
 *  as code. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const render = (el: React.ReactElement): string =>
  renderToStaticMarkup(React.createElement(I18nProvider, null, el));

/** Every route id the router actually generated.
 *
 *  Read from the FileRoutesById interface specifically. routeTree.gen.ts
 *  declares three parallel maps -- by full path, by "to" and by id -- and
 *  scanning the whole file mixes URL PATHS in with ROUTE IDS. That is not
 *  cosmetic: "/passport" exists as a path and "/_authenticated/passport"
 *  as the id, and a guard that conflates them asserts the mapping for
 *  routes the router will never report. */
const ROUTE_IDS: string[] = (() => {
  const src = read("src/routeTree.gen.ts");
  const start = src.indexOf("export interface FileRoutesById {");
  if (start < 0) throw new Error("FileRoutesById not found in routeTree.gen.ts");
  const block = src.slice(start, src.indexOf("\n}", start));
  return Array.from(block.matchAll(/^ {2}'(\/[^']*)': typeof /gm)).map((m) => m[1]!);
})();

/* ------------------------------------------------------------------ */
/* 1 · Four destinations, once each, on BOTH viewports                 */
/* ------------------------------------------------------------------ */

group("1 · one canonical link per product, desktop and mobile");
{
  const EXPECTED: { key: string; to: string; sv: string; en: string }[] = [
    { key: "myCareer", to: "/my-career", sv: "Min karriär", en: "My Career" },
    { key: "jobs", to: "/jobs", sv: "Jobb", en: "Jobs" },
    { key: "passport", to: "/passport", sv: "Security Passport", en: "Security Passport" },
    { key: "assessments", to: "/academy", sv: "Bedömningar", en: "Assessments" },
  ];

  ck(
    "the navigation is exactly four items, in the agreed order",
    CANDIDATE_APP_NAV.map((i) => i.key).join(",") === EXPECTED.map((e) => e.key).join(","),
  );

  for (const variant of ["desktop", "mobile"] as const) {
    const html = render(React.createElement(CandidateAppNav, { variant, activeKey: "myCareer" }));
    const hrefs = Array.from(html.matchAll(/href="([^"]*)"/g)).map((m) => m[1]!);

    ck(`${variant}: exactly four links`, hrefs.length === 4);
    ck(
      `${variant}: the four destinations, in order`,
      hrefs.join(",") === EXPECTED.map((e) => e.to).join(","),
    );
    for (const e of EXPECTED) {
      ck(`${variant}: "${e.sv}" appears exactly once`, html.split(`>${e.sv}<`).length - 1 === 1);
      ck(
        `${variant}: ${e.to} is linked exactly once`,
        hrefs.filter((h) => h === e.to).length === 1,
      );
    }
    ck(`${variant}: it is a real <nav>`, html.startsWith("<nav "));
    ck(`${variant}: the nav is labelled`, /aria-label="[^"]+"/.test(html));
  }

  // English is authored in the same dictionary entry the Swedish label
  // comes from, so it is proved from the table rather than from a locale
  // the server renderer cannot reach.
  for (const e of EXPECTED) {
    const item = CANDIDATE_APP_NAV.find((i) => i.key === e.key)!;
    ck(`sv "${e.key}" reads "${e.sv}"`, dictionaries.sv[item.labelKey] === e.sv);
    ck(`en "${e.key}" reads "${e.en}"`, dictionaries.en[item.labelKey] === e.en);
  }
}

/* ------------------------------------------------------------------ */
/* 2 · No marketing item follows a candidate into the workspace        */
/* ------------------------------------------------------------------ */

group("2 · the workspace carries no marketing navigation");
{
  const MARKETING = ["/contact", "/about", "/employers", "/assessment", "/career-center"];
  for (const variant of ["desktop", "mobile"] as const) {
    const html = render(React.createElement(CandidateAppNav, { variant, activeKey: null }));
    for (const route of MARKETING) {
      ck(
        `${variant}: no ${route} in the candidate's primary navigation`,
        !html.includes(`href="${route}"`),
      );
    }
  }

  // "Kontakt" appeared TWICE on every signed-in desktop page: once in the
  // primary nav and once in the navy utility bar above it. Both are gated
  // on !appMode now, and the header must keep gating them.
  const header = code(read("src/components/site/SiteHeader.tsx"));
  ck(
    "the marketing nav array is rendered only outside the workspace",
    /\{appMode \? \(\s*<CandidateAppNav variant="desktop"/.test(header),
  );
  ck(
    "the utility bar (the second Kontakt) is gated on !appMode",
    /!appMode && "lg:block"/.test(header),
  );
  ck(
    'no second "Min karriär" control beside the nav item',
    /\{!appMode && \(/.test(header) && /signedIn && !appMode \?/.test(header),
  );
  // Presentation only, and the header must keep saying so with data
  // rather than a role literal.
  ck(
    "the workspace switch is still driven by what RLS returned",
    header.includes("listMyEmployerWorkspaces"),
  );
  ck(
    "no client-side role literal decides the chrome",
    !/\bis(Candidate|Employer|Recruiter)\b/.test(header),
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Current location, including nested routes                       */
/* ------------------------------------------------------------------ */

group("3 · current location survives nesting");
{
  const CASES: [string, string | null][] = [
    ["/_authenticated/my-career/", "myCareer"],
    ["/_authenticated/my-career/profile", "myCareer"],
    ["/_authenticated/my-career/career-card", "myCareer"],
    ["/_authenticated/my-career/cv/new", "myCareer"],
    ["/_authenticated/my-career/reports/$runId", "myCareer"],
    ["/_authenticated/journey/$targetId", "myCareer"],
    ["/_authenticated/discovery/report/$snapshotId", "myCareer"],
    ["/_authenticated/passport/", "passport"],
    ["/_authenticated/passport/information", "passport"],
    ["/_authenticated/passport/card", "passport"],
    ["/_authenticated/passport/entry/$kind/$entryId", "passport"],
    ["/_authenticated/academy/", "assessments"],
    ["/_authenticated/academy/report/$attemptId", "assessments"],
    ["/_authenticated/academy/training/$assignmentId/", "assessments"],
    ["/jobs/", "jobs"],
    ["/jobs/$slug", "jobs"],
    ["/jobs/profession/$professionSlug", "jobs"],
    // Applications are a JOBS concept to the person holding them, even
    // though the row is owned under the My Career URL. Longest prefix
    // wins, which is why this does not silently fall back to My Career.
    ["/_authenticated/my-career/applications", "jobs"],
  ];
  for (const [routeId, expected] of CASES) {
    ck(
      `${routeId} → ${expected}`,
      resolveCandidateNav([routeId]).activeKey === expected &&
        resolveCandidateNav([routeId]).inCandidateApp,
    );
  }

  // ── THE ROUTER MUST NOT DISAGREE WITH THE CONFIG ──────────────────
  //
  // <Link> appends its own aria-current="page" last, so on any URL it
  // considers active its opinion WINS over this component's. It is pinned
  // to activeOptions={{ exact: true }}, which reduces its opinion to "the
  // URL is literally this link's href". This proves the only case that
  // then survives is one where the two already agree: the route backing
  // item.to must resolve to item.key. Without it, a future item could be
  // added whose own destination lights a different tab -- and the browser,
  // not this guard, would be the first to know. It already was once.
  for (const item of CANDIDATE_APP_NAV) {
    const own = ROUTE_IDS.filter(
      (id) => id.replace(/^\/_authenticated/, "").replace(/\/+$/, "") === item.to,
    );
    ck(`${item.key}: its own destination resolves to a route`, own.length > 0);
    for (const id of own) {
      ck(
        `${item.key}: ${id} (its own href) marks ${item.key}, so the router cannot contradict it`,
        resolveCandidateNav([id]).activeKey === item.key,
      );
    }
  }
  ck(
    "the router's own matching is pinned to exact",
    read("src/components/site/CandidateAppNav.tsx").includes("activeOptions={{ exact: true }}"),
  );

  // Every case above must be a route that EXISTS. A guard that asserts a
  // mapping for an imaginary path proves nothing.
  for (const [routeId] of CASES) {
    ck(`${routeId} is a real route`, ROUTE_IDS.includes(routeId));
  }
}

/* ------------------------------------------------------------------ */
/* 4 · The chrome does not leak across contexts                        */
/* ------------------------------------------------------------------ */

group("4 · employer and marketing routes are not the candidate workspace");
{
  // The one that a bare startsWith gets wrong.
  ck(
    "/passport-attestations does NOT light Security Passport",
    resolveCandidateNav(["/_authenticated/passport-attestations"]).activeKey === null,
  );
  ck(
    "/passport-attestations is not treated as the candidate workspace",
    !resolveCandidateNav(["/_authenticated/passport-attestations"]).inCandidateApp,
  );
  ck(
    "the segment boundary is what does it",
    matchesRouteId("/_authenticated/passport/card", "/_authenticated/passport") &&
      !matchesRouteId("/_authenticated/passport-attestations", "/_authenticated/passport"),
  );

  for (const routeId of [
    "/_authenticated/employer/$employerSlug/",
    "/_authenticated/employer/$employerSlug/applications/",
    "/_authenticated/admin/",
    "/_authenticated/reviews",
    "/about",
    "/contact",
    "/employers",
    "/",
  ]) {
    ck(
      `${routeId} keeps the marketing / employer chrome`,
      !resolveCandidateNav([routeId]).inCandidateApp,
    );
  }

  // Dual role: an employer member reading a candidate route is in their
  // personal context and gets the candidate chrome — which grants nothing
  // — while their workspace keeps its own shell. Both remain reachable.
  ck(
    "a dual-role account still reaches its workspace shell",
    read("src/components/employer/EmployerAppShell.tsx").length > 0 &&
      !read("src/components/employer/EmployerAppShell.tsx").includes("CandidateAppNav"),
  );
  ck(
    "the account menu still lists organisations by name",
    code(read("src/components/site/AccountMenu.tsx")).includes("workspace.employerName"),
  );
  ck(
    "no employer destination is in the candidate navigation",
    !CANDIDATE_APP_NAV.some((i) => i.to.startsWith("/employer")),
  );
}

/* ------------------------------------------------------------------ */
/* 5 · Active state is accessible, and never colour alone              */
/* ------------------------------------------------------------------ */

group("5 · the current item is announced, weighted and ruled");
{
  for (const variant of ["desktop", "mobile"] as const) {
    const html = render(React.createElement(CandidateAppNav, { variant, activeKey: "passport" }));
    ck(
      `${variant}: exactly one aria-current="page"`,
      html.split('aria-current="page"').length - 1 === 1,
    );
    ck(
      `${variant}: it is on the item that is current`,
      /<a[^>]*href="\/passport"[^>]*aria-current="page"/.test(html) ||
        /<a[^>]*aria-current="page"[^>]*href="\/passport"/.test(html),
    );
    const activeTag = html.split("<a ").find((chunk) => chunk.includes('aria-current="page"'))!;
    ck(`${variant}: the current item is weighted`, activeTag.includes("font-semibold"));
    ck(
      `${variant}: the current item carries a rule, not just a colour`,
      variant === "desktop"
        ? activeTag.includes("after:h-[2px]") && activeTag.includes("after:bg-accent")
        : activeTag.includes("border-accent"),
    );

    const none = render(React.createElement(CandidateAppNav, { variant, activeKey: null }));
    ck(
      `${variant}: nothing is marked current when nothing is`,
      !none.includes('aria-current="page"'),
    );
  }

  const header = code(read("src/components/site/SiteHeader.tsx"));
  ck(
    "the mobile menu toggle names its state in the reader's language",
    header.includes('t("nav.menu.close")') && header.includes('t("nav.menu.open")'),
  );
  ck("the menu toggle points at the panel it opens", header.includes('aria-controls="site-menu"'));
  ck("the panel it names exists", header.includes('id="site-menu"'));
}

/* ------------------------------------------------------------------ */
/* 6 · Every destination is real, and reached where a candidate is     */
/* ------------------------------------------------------------------ */

group("6 · every navigation item resolves");
{
  const ROUTE_FILES: Record<string, string> = {
    "/my-career": "src/routes/_authenticated.my-career.index.tsx",
    "/jobs": "src/routes/jobs.index.tsx",
    "/passport": "src/routes/_authenticated.passport.index.tsx",
    "/academy": "src/routes/_authenticated.academy.index.tsx",
  };
  for (const item of CANDIDATE_APP_NAV) {
    const file = ROUTE_FILES[item.to];
    ck(`${item.to} is backed by a real route file`, !!file && existsSync(path.join(root, file)));
  }
  for (const item of CANDIDATE_APP_NAV) {
    for (const prefix of item.routeIds) {
      ck(
        `${item.key}: "${prefix}" matches at least one generated route`,
        ROUTE_IDS.some((id) => matchesRouteId(id, prefix)),
      );
    }
  }

  // The Assessments destination used to render in AssessmentShell, whose
  // only link is the logo — pointing OUT to the marketing landing page.
  // Arriving there from a nav item and finding no way back is the exact
  // dead end this navigation exists to remove. The RUN keeps that shell.
  for (const f of [
    "src/routes/_authenticated.academy.index.tsx",
    "src/routes/_authenticated.academy.report.$attemptId.tsx",
  ]) {
    const src = read(f);
    ck(
      `${path.basename(f)} carries the app chrome`,
      src.includes("<AssessmentLayout>") && !/<AssessmentShell[\s>]/.test(code(src)),
    );
  }
  for (const f of [
    "src/routes/_authenticated.academy.$attemptId.tsx",
    "src/routes/_authenticated.academy.learning.$formId.tsx",
  ]) {
    ck(
      `${path.basename(f)} keeps the distraction-free run shell`,
      /<AssessmentShell[\s>]/.test(code(read(f))),
    );
  }
}

/* ------------------------------------------------------------------ */
/* 7 · One name per product, on the surfaces a candidate reads         */
/* ------------------------------------------------------------------ */

group("7 · one name per product");
{
  // Files a signed-in candidate actually reads. Public marketing copy is
  // deliberately NOT in scope here — the website may speak the website's
  // language; this is about the workspace.
  const SURFACES = [
    "src/routes/_authenticated.my-career.index.tsx",
    "src/routes/_authenticated.my-career.profile.tsx",
    "src/routes/_authenticated.my-career.career-card.tsx",
    "src/components/professional-identity/NextActions.tsx",
    "src/components/professional-identity/CareerJourney.tsx",
    "src/components/professional-identity/ProfessionalIdentityHeader.tsx",
    "src/components/professional-identity/cv-copy.ts",
    "src/components/professional-identity/CvDocumentView.tsx",
    "src/components/assessment/SecurityCareerProfileCard.tsx",
  ];
  const workspace = SURFACES.map((f) => code(read(f))).join("\n");

  // Each of these was a SECOND Swedish name for a product that already
  // had one, on the same screens that used the product name.
  const RETIRED: [RegExp, string][] = [
    [/karriärutforskning/i, "Career Discovery"],
    [/Säkerhetspass/i, "Security Passport"],
    [/karriärkort/i, "Career Card"],
    [/Din karriärprofil/i, "Min profil"],
    [/Din karriärinsikt/i, "Karriäranalys"],
    // "Din yrkesprofil", "din karriärprofil" and "Din yrkesidentitet" were
    // three names for ONE thing -- the information the person types in
    // about themselves -- and all three appeared within two clicks of each
    // other. The concept is "Min profil" / "My Profile".
    [/yrkesprofil/i, "Min profil"],
    [/yrkesidentitet/i, "Min profil"],
    [/Professional Profile/, "My Profile"],
  ];
  for (const [pattern, replacement] of RETIRED) {
    ck(
      `no candidate surface says ${pattern.source} — the product is "${replacement}"`,
      !pattern.test(workspace),
    );
  }

  // The route is /academy and stays /academy. The WORD is never a product.
  ck(
    'no candidate surface presents "Academy" as a product name',
    !/["'>][^"'<]*\bAcademy\b/.test(workspace),
  );
  for (const lang of ["sv", "en"] as const) {
    const values = Object.values(dictionaries[lang]).join("\n");
    ck(
      `${lang}: the navigation label for /academy is the product, not the path`,
      !/\bAcademy\b/i.test(dictionaries[lang]["nav.myAssessments"]),
    );
    ck(`${lang}: dictionaries still load`, values.length > 0);
  }

  // The five concepts stay five concepts.
  ck(
    "Career Card and Security Passport are never the same sentence's subject",
    !/Career Card[^.]{0,40}(är|is) [^.]{0,20}Security Passport/i.test(workspace),
  );
  ck(
    "Career Discovery is named as the product where a product name is needed",
    workspace.includes("Career Discovery"),
  );
  ck("Career Card keeps its name", workspace.includes("Career Card"));
  ck("Security Passport keeps its name", workspace.includes("Security Passport"));
  ck("the result is called Karriäranalys / Career Analysis", workspace.includes("Karriäranalys"));

  // ── PROVENANCE SURVIVES THE SIMPLIFICATION ────────────────────────
  //
  // The whole risk of a vocabulary cleanup: "Min profil" must not make a
  // verified Passport claim look like something the holder typed. The
  // profile page still says, in both languages, which side of the line
  // each section is on — and passport-separation:check independently
  // pins the boundary sentence.
  const profile = read("src/routes/_authenticated.my-career.profile.tsx");
  ck("self-reported is still named as such", profile.includes("Det du fyller i själv"));
  ck(
    "verified is still attributed to a reviewer",
    profile.includes("Verifierat av en behörig granskare."),
  );
  ck(
    "each section still says which product owns it",
    profile.includes("Tillhör Security Passport") && profile.includes("Tillhör Career Discovery"),
  );

  // The card's own controls and states, which live in the dictionary
  // rather than beside the screen. The card is headed "Min profil"; a
  // button under it reading "Redigera karriärprofil" is the same collision
  // one line further down.
  for (const [key, sv, en] of [
    ["sca.scp.summary.edit", "Redigera profil", "Edit profile"],
    ["sca.scp.summary.fillIn", "Fyll i din profil", "Fill in your profile"],
    ["sca.scp.summary.dialogTitle", "Min profil", "My Profile"],
  ] as const) {
    ck(`sv ${key} reads "${sv}"`, dictionaries.sv[key] === sv);
    ck(`en ${key} reads "${en}"`, dictionaries.en[key] === en);
  }

  // ── THE ONE DELIBERATE EXCEPTION ──────────────────────────────────
  //
  // sca.scp.notPassport is the governance sentence that tells somebody the
  // profile they just filled in is NOT verified Passport evidence. Its
  // exact wording -- including the word "karriärprofil" -- is pinned by
  // passport-separation:check, which owns that boundary. It is an
  // explanatory sentence, not a competing product name, and renaming it
  // here would mean editing a governance guard to suit a vocabulary
  // change. Recorded so the exception stays deliberate.
  ck(
    "the profile/Passport boundary sentence is still stated",
    read("src/components/assessment/SecurityCareerProfileCard.tsx").includes("sca.scp.notPassport"),
  );

  // Rendered proof for the one that changed name: the hero states the
  // boundary in the output, not merely in the source.
  const heroCopy = read("src/components/professional-identity/ProfessionalIdentityHeader.tsx");
  ck(
    "the hero still separates self-reported from verified",
    heroCopy.includes("självrapporterade") && heroCopy.includes("verifierat"),
  );
}

/* ------------------------------------------------------------------ */
/* 8 · The account menu owns My Profile, the nav does not              */
/* ------------------------------------------------------------------ */

group("8 · primary navigation stays four items");
{
  const menu = code(read("src/components/site/AccountMenu.tsx"));
  ck("My Profile is reached from the account menu", menu.includes('to="/my-career/profile"'));
  ck(
    "the account menu calls it what the page calls itself",
    dictionaries.sv["account.settings"] === "Min profil" &&
      dictionaries.en["account.settings"] === "My Profile",
  );
  for (const to of ["/my-career/profile", "/my-career/career-card", "/discovery"]) {
    ck(`${to} is NOT a fifth primary navigation item`, !CANDIDATE_APP_NAV.some((i) => i.to === to));
  }
  ck("sign out is still in the account menu", menu.includes('t("account.signOut")'));
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`FAIL — candidate-app-navigation-check (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — candidate-app-navigation-check");
