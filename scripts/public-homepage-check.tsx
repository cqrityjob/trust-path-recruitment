// The public homepage — asserted against the RENDERED markup and the
// dictionaries, in both languages.
//
// ── WHAT THIS FILE NOW DEFENDS (MVP text specification, 2026-09-27) ────
//
// The owner's latest decision makes security work, Security Passport and
// career/jobs THREE EQUAL core parts, with a separate employer entrance, and
// keeps the headline "Din karriär och ditt säkerhetsarbete. På samma plats."
// That supersedes the two-peer-entrance page this file used to assert
// (Security Passport and Career Discovery as the only two individual
// entrances, the Passport as the hero's dark product anchor). A guard that
// still encoded it would be the most effective way to stop the new one
// shipping, so the page-shape assertions are rewritten rather than extended.
//
// NOTHING THAT GUARDS A DATA BOUNDARY, THE DISCLAIMER, ACCESS, RANKING OR THE
// HUMAN DECISION WAS RELAXED. Those assertions are carried over; where the
// sentence they pinned was replaced by the specification's own, they pin the
// specification's sentence.
//
//   T1  main carries exactly seven sections, in the specified order
//   T2  the three core parts render in the hero, in both languages, in the
//       specified words, and the superseded page is gone from the markup
//   T3  exactly one h1, the nine h2 in order, and h3 only on the three
//       security-work examples and the two get-started audiences
//   T4  the three core cards are EQUALS — one card class, one heading, one
//       outlined button each — and none of them is a solid call to action
//   T5  every account action is canonical and safe, and each intent survives
//       every account path the auth form supports
//   T6  the career analysis: its canonical route, no signup wall, the
//       guidance boundary, and an action that follows the existing access
//       status
//   T7  the employer band: /employer intent, no role by metadata, the
//       release flag still fails closed, and learning after the five steps
//   T8  every link on the page is an existing canonical route, and every
//       sign-up landing survives safeReturnPath
//   T9  the Passport market scale agrees with the governed overview, the
//       fictional example says so, and the disclaimer is rendered verbatim
//   T10 the trust levels respect PR #189 — three levels, named and
//       separated, only source-confirmed reads as confirmed
//   T11 the signed-in redirect to /my-career is intact, and is the only
//       redirect implementation on the route
//   T12 the public chrome: six destinations from one definition, one Login,
//       one Create account, an honest legal line, and the signed-in
//       candidate nav untouched
//   T13 sv and en carry the same keys, structure and destinations
//   T14 NO FORBIDDEN CLAIM was introduced — the data boundaries, as
//       strings a reader could actually meet
//   T15 the English page is English, and every section stays inside its
//       own word budget
//   T16 the sections keep their content and their safety sentences
//
// The height, overflow, focus-ring, target-size, viewport and click-through
// halves of the brief are properties of a LAYOUT and cannot be read out of
// markup. They live in e2e/public-homepage.spec.ts, which drives the real
// route in a real browser at 320/375/390/768/1024/1440.
//
// Run: bun run public-homepage:check

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── WHAT IS MOCKED, AND WHY IT IS ONLY THESE THREE THINGS ──────────────
//
// The router, because a RouterProvider renders empty under
// renderToStaticMarkup: `createFileRoute` is made to return its own options
// object, so `Route.component` is the REAL component this guard renders, and
// `Link` becomes an anchor whose href carries `to`, `search` and `hash` —
// which is what lets the destination assertions read the rendered markup
// rather than the source text.
//
// The career analysis status (useCareerAnalysisOpen), the one server read the
// homepage makes. It is a switch here, so the render never loads TanStack
// Start's server-function client — which needs the real router this mock
// replaces — and so BOTH answers can be rendered: `undefined` (not answered
// yet, the page's default) and `false` (definitely not open). What the hook
// asks is asserted from its source in T6, and e2e/public-homepage.spec.ts
// answers it through the real server-function boundary in a browser.
//
// And SiteLayout, because SiteHeader pulls in TanStack Start's server-function
// machinery and three React Query subscriptions. Standing all of that up would
// mean this guard passed or failed on the health of the query client rather
// than on the homepage. The layout is replaced by the three landmarks it
// renders, so `<main>` still bounds the counts below.
//
// The chrome itself is NOT unasserted: T12 reads SiteHeader, SiteFooter,
// public-nav and candidate-app-nav, and e2e/public-homepage.spec.ts renders
// and CLICKS the real ones in a browser.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    hash,
    children,
    // Swallowed rather than spread: `activeOptions` is a router prop and
    // React would warn about it as an unknown DOM attribute, which makes
    // this guard's output noisy for a reason that is not the page's.
    activeOptions: _activeOptions,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (search && typeof search === "object") {
      href +=
        "?" +
        new URLSearchParams(
          Object.entries(search as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        ).toString();
    }
    if (hash) href += `#${String(hash)}`;
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => (options: Record<string, unknown>) => options,
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: "/", search: "", hash: "" }),
  useMatches: () => [],
}));

let analysisOpen: boolean | undefined = undefined;
await mock.module("@/components/career-discovery/use-career-analysis-open", () => ({
  useCareerAnalysisOpen: () => analysisOpen,
}));

await mock.module("@/components/site/SiteLayout", () => ({
  SiteLayout: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      "div",
      null,
      React.createElement("header", null),
      React.createElement("main", null, children),
      React.createElement("footer", null),
    ),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { AUTH_SURFACES, safeReturnPath } = await import("../src/lib/auth/safe-redirect");
const { CANONICAL_ASSESSMENT_PATH, isAliasPath, isCanonicalPath } =
  await import("../src/lib/career-discovery/routes");
const { PUBLIC_MARKET_SCALE } = await import("../src/components/site/passport-market-scale");
const { CANDIDATE_APP_NAV } = await import("../src/components/site/candidate-app-nav");
const { publicNav } = await import("../src/components/site/public-nav");
const { Route } = await import("../src/routes/index");

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
/** Source text with comments removed, so a rule is never "satisfied" by a
 *  sentence in a comment that describes it. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const routeCode = code(read("src/routes/index.tsx"));
const sectionsCode = code(read("src/components/site/HomeSections.tsx"));
const previewCode = code(read("src/components/site/HomePassportPreview.tsx"));
// The sections and the Passport example render inside the route, so a key
// the route "no longer asks for" must not simply have moved into them.
const pageCode = [routeCode, sectionsCode, previewCode].join("\n");
const headerCode = code(read("src/components/site/SiteHeader.tsx"));
const footerSrc = read("src/components/site/SiteFooter.tsx");
const footerCode = code(footerSrc);

type Lang = "sv" | "en";
const LANGS: readonly Lang[] = ["sv", "en"];

const Page = (Route as { component: () => React.ReactElement }).component;
const render = (lang: Lang) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLang={lang}>
        <Page />
      </I18nProvider>
    </QueryClientProvider>,
  );
const html: Record<Lang, string> = { sv: render("sv"), en: render("en") };

/** Everything between <main …> and </main>. The site chrome is asserted
 *  separately; the counts below are all "inside main". */
function mainOf(markup: string): string {
  const open = markup.indexOf("<main");
  const start = markup.indexOf(">", open) + 1;
  return markup.slice(start, markup.lastIndexOf("</main>"));
}

/** One top-level section of main, by id. */
function sectionOf(markup: string, id: string): string {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start === -1) return "";
  const next = markup.slice(start + 1).search(/<section id="/);
  return next === -1 ? markup.slice(start) : markup.slice(start, start + 1 + next);
}

const entities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** The page's COPY: rendered text with every aria-hidden subtree removed,
 *  so decoration does not count as prose. */
async function copyText(markup: string): Promise<string> {
  const out = await new HTMLRewriter()
    .on("[aria-hidden]", { element: (el) => el.remove() })
    .transform(new Response(`<body>${markup}</body>`))
    .text();
  return entities(out.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Everything a person SEES, decoration included.
 *
 *  `copyText` drops aria-hidden subtrees, because they are not prose. That
 *  exclusion is also exactly how a Swedish product mock once shipped inside
 *  the English homepage: aria-hidden removes a subtree from the ACCESSIBILITY
 *  TREE, not from the screen. Anything about what is RENDERED — above all
 *  whether the English page is in English — reads this projection instead. */
function fullText(markup: string): string {
  return entities(markup.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const svMain = mainOf(html.sv);
const enMain = mainOf(html.en);
const mainOfLang: Record<Lang, string> = { sv: svMain, en: enMain };
const copyOf: Record<Lang, string> = { sv: await copyText(svMain), en: await copyText(enMain) };
const seenOf: Record<Lang, string> = { sv: fullText(svMain), en: fullText(enMain) };

const headings = (markup: string, tag: "h1" | "h2" | "h3") =>
  [...markup.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) =>
    entities(m[1].replace(/<[^>]*>/g, ""))
      .replace(/\s+/g, " ")
      .trim(),
  );

const anchorsOf = (markup: string) => [...markup.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
const hrefsOf = (markup: string) =>
  [...markup.matchAll(/href="([^"]*)"/g)].map((m) => entities(m[1]));
/** Token equality, not a substring: `bg-primary` as a WORD. A substring test
 *  also matches "hover:bg-primary-foreground/10", and reporting the outlined
 *  control on the navy band as a solid action is the guard failing rather
 *  than the page. */
const classOf = (tag: string) => tag.match(/class="([^"]*)"/)?.[1] ?? "";
const isSolid = (tag: string) => classOf(tag).split(/\s+/).includes("bg-primary");
/** The outlined PrimaryLink button: its own height and padding tokens, as
 *  WORDS -- a text link's `min-h-11` is not a button. */
const isButton = (tag: string) => {
  const tokens = classOf(tag).split(/\s+/);
  return tokens.includes("h-11") && tokens.includes("px-5");
};
const wc = (s: string) => s.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length;

/** The three core cards, in document order, by their data attribute. */
function coreCards(markup: string): { key: string; html: string }[] {
  return [
    ...markup.matchAll(/<article\b[^>]*data-home-core="([a-z]+)"[^>]*>([\s\S]*?)<\/article>/g),
  ].map((m) => ({ key: m[1], html: m[0] }));
}

/** The Passport section with the illustrative example removed: the example
 *  is fictional, labelled so twice, and guarded by passport-card-surface
 *  :check; everything else in the section is a statement about the product. */
function withoutExample(markup: string): string {
  return markup.replace(/<figure\b[^>]*data-home-passport-example[\s\S]*?<\/figure>/g, "");
}

const d = (lang: Lang) => dictionaries[lang] as Record<string, string>;

console.log("public-homepage-check");

const ORDER = [
  "hero",
  "security-intelligence",
  "passport",
  "career",
  "employers",
  "get-started",
  "faq",
] as const;

/* T1 ---------------------------------------------------------------- */
group("T1 · main carries exactly seven sections, in the specified order");
{
  const ids = [...svMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1]);
  ck(`the seven ids are ${ORDER.join(", ")}`, JSON.stringify(ids) === JSON.stringify(ORDER), ids);
  ck(
    "no eighth top-level section",
    (svMain.match(/<section\b/g) ?? []).length === ORDER.length,
    (svMain.match(/<section\b/g) ?? []).length,
  );
  ck("one main landmark", html.sv.split("<main").length - 1 === 1);
  // The route renders its sections INTO SiteLayout's `<main>` and adds no
  // wrapper of its own — so a section added outside the layout, where the
  // counts above cannot see it, fails here.
  ck("the route's whole body is the seven sections", /^\s*<section id="hero"/.test(svMain));
  // The employer band is its own section, after the three core parts' deep
  // dives, which is what "a separate entrance" means structurally.
  ck(
    "the employer band is its own section, after the three core parts",
    ids.indexOf("employers") > ids.indexOf("career") && ids.indexOf("career") > 0,
    ids,
  );
}

/* T2 ---------------------------------------------------------------- */
group("T2 · the three core parts render in the hero, in the specified words");
{
  const SPEC: Record<Lang, Record<string, string>> = {
    sv: {
      "home.hero.title": "Din karriär och ditt säkerhetsarbete. På samma plats.",
      "home.hero.subtitle":
        "Samla dina meriter i Security Passport, hitta rätt yrkesväg och jobb, och få stöd i ditt arbete med säkerhet, risk och krisberedskap.",
      "home.core.work.title": "Stöd i ditt säkerhetsarbete",
      "home.core.work.body":
        "Strukturera underlag för omvärldsanalys, riskbedömning och beredskap. Arbeta vidare med rapporter och åtgärder. AI-stöd finns där det är aktiverat för arbetsytan.",
      "home.core.work.cta": "Utforska säkerhetsarbetet",
      "home.core.passport.title": "Visa dina meriter med Security Passport",
      "home.core.passport.body":
        "Samla dina certifieringar, licenser och yrkesbehörigheter med underlag och tydlig status. Du väljer vilka uppgifter du delar.",
      "home.core.passport.cta": "Utforska Security Passport",
      "home.core.career.title": "Hitta rätt yrkesväg och jobb",
      "home.core.career.body":
        "Utforska säkerhetsyrken, få yrkesförslag genom karriäranalysen och läs vad olika roller kräver. Hitta sedan relevanta lediga jobb.",
      "home.core.career.cta": "Utforska yrken",
      "home.core.career.jobs": "Hitta jobb",
      "home.core.career.note": "Du kan läsa yrkesinformation och jobbannonser utan konto.",
      "home.account.returning": "Har du redan ett konto?",
      "home.cta.employersLead": "Rekryterar du?",
      "home.cta.employers": "Se företagsportalen",
    },
    en: {
      "home.hero.title": "Your career and your security work. In one place.",
      "home.hero.subtitle":
        "Bring your credentials together in Security Passport, find your career path and next role, and get support for security, risk and crisis preparedness work.",
      "home.core.work.title": "Support for your security work",
      "home.core.work.body":
        "Structure evidence for monitoring analysis, risk assessment and preparedness. Continue with reports and actions. AI assistance is available where enabled for the workspace.",
      "home.core.work.cta": "Explore security work",
      "home.core.passport.title": "Present your credentials with Security Passport",
      "home.core.passport.body":
        "Bring together your certifications, licences and professional authorisations with supporting documents and a clear status. You choose which information to share.",
      "home.core.passport.cta": "Explore Security Passport",
      "home.core.career.title": "Find your career path and next role",
      "home.core.career.body":
        "Explore security professions, get role suggestions through the career analysis and understand what different roles require. Then find relevant vacancies.",
      "home.core.career.cta": "Explore professions",
      "home.core.career.jobs": "Find jobs",
      "home.core.career.note":
        "You can read profession information and job adverts without an account.",
      "home.account.returning": "Already have an account?",
      "home.cta.employersLead": "Hiring?",
      "home.cta.employers": "Explore the employer portal",
    },
  };
  for (const lang of LANGS) {
    for (const [key, expected] of Object.entries(SPEC[lang])) {
      ck(`${lang} "${key}" is the specified copy`, d(lang)[key] === expected, d(lang)[key]);
    }
    const heroCopy = await copyText(sectionOf(mainOfLang[lang], "hero"));
    for (const key of Object.keys(SPEC[lang])) {
      ck(`${lang}: the hero renders "${key}"`, heroCopy.includes(d(lang)[key]), d(lang)[key]);
    }
    ck(
      `${lang}: the hero's account action is "${d(lang)["nav.createAccount"]}"`,
      heroCopy.includes(d(lang)["nav.createAccount"]),
    );
  }

  // ── THE SUPERSEDED PAGE IS GONE FROM THE MARKUP ──────────────────
  //
  // Absence from the MARKUP, not from the rendered text: a section hidden
  // with `hidden` or `sr-only` still ships its words to a crawler and to a
  // screen reader, which is not what "removed" means.
  const REMOVED: Record<Lang, readonly string[]> = {
    sv: [
      "Din säkerhetskarriär. Samlad på ett ställe.",
      "Din yrkesidentitet inom säkerhet",
      "Samla. Styrk. Dela.",
      "Ett Passport genom hela karriären",
      "Utforska din karriärväg",
      "Skapa ditt Security Passport",
      "Strukturerat stöd för rekrytering och kompetensutveckling",
      "Karriäranalysen hjälper dig",
      // The two-peer-entrance page (2026-09-13 to 2026-09-27).
      "Upptäck din säkerhetskarriär",
      "Starta Career Discovery",
      "fortsätta i My Career",
      "Hitta jobb inom säkerhet, samla certifieringar och behörigheter",
      "Rekryterar du inom säkerhet?",
      "Se företagsplattformen",
      "Öppna Security Intelligence",
      "Det här får du gjort",
      "Byggt för en karriär som rör sig",
    ],
    en: [
      "Your security career. All in one place.",
      "Your professional identity in security",
      "Collect. Support. Share.",
      "One Passport for your whole career",
      "Explore your career path",
      "Create your Security Passport",
      "Structured support for recruitment and competence development",
      "The Career Analysis helps you",
      "Discover your security career",
      "Start Career Discovery",
      "Find security jobs, keep your certifications and licences",
      "Hiring in security?",
      "Explore the employer platform",
      "Open Security Intelligence",
      "What you can get done",
      "Built for a career that moves",
    ],
  };
  for (const lang of LANGS) {
    for (const phrase of REMOVED[lang]) {
      ck(
        `${lang}: the superseded "${phrase}" is gone`,
        !mainOfLang[lang].toLowerCase().includes(phrase.toLowerCase()),
      );
    }
  }
  const RETIRED = [
    "home.hero.note",
    "home.hero.portable",
    "home.how.title",
    "home.how.step1.title",
    "home.passport.cta",
    "home.passport.callout",
    "home.passport.use.cv",
    "home.mock.subtitle",
    "home.mock.cat.experience",
    "home.employers.cta",
    "home.employers.subtitle",
    "cta.howItWorks",
    "home.hero.eyebrow",
    "home.value.passport.link",
    "home.passportPreview.markets",
    // Retired with the MVP text specification (2026-09-27): the two peer
    // entrances, the value cards, the old hero note and jobs button, the
    // contact invitation, the market title, the unused lifecycle (which
    // described the Passport as a place for the CV and used "My Career" in
    // Swedish text), and the public nav labels the six replaced.
    "home.entry.passport.title",
    "home.entry.passport.body",
    "home.entry.discovery.title",
    "home.entry.discovery.body",
    "home.entry.discovery.disclosure",
    "home.value.eyebrow",
    "home.value.passport.title",
    "home.value.cv.title",
    "home.value.career.title",
    "home.cta.start",
    "home.cta.jobs",
    "home.cta.jobsNote",
    "home.faq.contact",
    "home.markets.title",
    "home.passportPreview.record",
    "home.passportPreview.title",
    "home.passportPreview.body",
    "home.lifecycle.eyebrow",
    "home.lifecycle.trust.body",
    "home.lifecycle.grow.body",
    "home.lifecycle.grow.link",
    "cta.discovery",
    "nav.forYou",
    "nav.career_center",
    "nav.careerDiscovery",
    "footer.legal.privacy",
    "footer.legal.terms",
  ];
  for (const lang of LANGS) {
    for (const key of RETIRED) {
      ck(`${lang}: the retired key "${key}" is deleted`, !(key in dictionaries[lang]));
    }
  }
  ck(
    "nothing on the page still asks for one of them",
    !RETIRED.some((k) => pageCode.includes(`"${k}"`)),
    RETIRED.filter((k) => pageCode.includes(`"${k}"`)),
  );
}

/* T3 ---------------------------------------------------------------- */
group("T3 · one h1, the nine h2 in order, and h3 only where the layout puts it");
{
  for (const lang of LANGS) {
    const m = mainOfLang[lang];
    ck(`${lang}: exactly one h1`, headings(m, "h1").length === 1, headings(m, "h1"));
    // Nine: the three core cards, then one per section below the hero. The
    // three CARDS carry h2 deliberately — a heading level is a weight, and a
    // part that sat one level lower would be a sub-product of the others.
    ck(`${lang}: exactly nine h2`, headings(m, "h2").length === 9, headings(m, "h2"));
    ck(
      `${lang}: the hero carries exactly the three core-card h2, in order`,
      JSON.stringify(headings(sectionOf(m, "hero"), "h2")) ===
        JSON.stringify([
          d(lang)["home.core.work.title"],
          d(lang)["home.core.passport.title"],
          d(lang)["home.core.career.title"],
        ]),
      headings(sectionOf(m, "hero"), "h2"),
    );
    for (const id of ORDER.slice(1)) {
      ck(
        `${lang}: #${id} is headed by exactly one h2`,
        headings(sectionOf(m, id), "h2").length === 1,
        headings(sectionOf(m, id), "h2"),
      );
    }
    // h3 is the three security-work examples and the two get-started
    // audiences, and nothing else.
    ck(
      `${lang}: h3 is the three examples and the two audiences, nothing else`,
      headings(m, "h3").length === 5 &&
        JSON.stringify(headings(sectionOf(m, "security-intelligence"), "h3")) ===
          JSON.stringify([
            d(lang)["home.ai.examples.monitoring.title"],
            d(lang)["home.ai.examples.risk.title"],
            d(lang)["home.ai.examples.preparedness.title"],
          ]) &&
        JSON.stringify(headings(sectionOf(m, "get-started"), "h3")) ===
          JSON.stringify([d(lang)["home.start.person"], d(lang)["home.start.employer"]]),
      headings(m, "h3"),
    );
  }
  ck(
    "sv h1",
    headings(svMain, "h1")[0] === "Din karriär och ditt säkerhetsarbete. På samma plats.",
    headings(svMain, "h1")[0],
  );
  ck(
    "en h1 says the same thing",
    headings(enMain, "h1")[0] === "Your career and your security work. In one place.",
    headings(enMain, "h1")[0],
  );
  for (const lang of LANGS) {
    ck(
      `${lang}: hero subtitle <= 40 words`,
      wc(d(lang)["home.hero.subtitle"]) <= 40,
      wc(d(lang)["home.hero.subtitle"]),
    );
  }
}

/* T4 ---------------------------------------------------------------- */
group("T4 · the three core cards are EQUALS");
{
  for (const lang of LANGS) {
    const hero = sectionOf(mainOfLang[lang], "hero");
    const cards = coreCards(hero);
    ck(
      `${lang}: the hero holds exactly three core cards, work · passport · career`,
      JSON.stringify(cards.map((c) => c.key)) === JSON.stringify(["work", "passport", "career"]),
      cards.map((c) => c.key),
    );
    const articleClasses = new Set(cards.map((c) => classOf(c.html)));
    ck(`${lang}: one card class for all three`, articleClasses.size === 1, [...articleClasses]);
    const headingTags = new Set(
      cards.map((c) => c.html.match(/<(h[1-6])\b[^>]*>/)?.[0] ?? "(none)"),
    );
    ck(
      `${lang}: one heading tag and class for all three`,
      headingTags.size === 1 && [...headingTags][0].startsWith("<h2"),
      [...headingTags],
    );
    // The button: the one control with the outlined button's classes. The
    // career card also has text links; those are not buttons.
    const buttons = cards.map((c) => anchorsOf(c.html).filter(isButton));
    ck(
      `${lang}: exactly one button per card`,
      buttons.every((b) => b.length === 1),
      buttons.map((b) => b.length),
    );
    ck(
      `${lang}: the three buttons share one style`,
      new Set(buttons.map((b) => classOf(b[0] ?? ""))).size === 1,
    );
    ck(
      `${lang}: none of the three is a solid call to action`,
      cards.every((c) => anchorsOf(c.html).filter(isSolid).length === 0),
    );
    // No large Passport visual in the hero: the illustrative card lives in
    // the Passport section.
    ck(`${lang}: no Passport preview in the hero`, !hero.includes("data-home-passport-preview"));
  }
  // Destinations, for the signed-out reader this markup is: each button
  // explains the part on this page before anything asks for an account.
  const cards = coreCards(sectionOf(svMain, "hero"));
  const buttonHref = (key: string) =>
    hrefsOf(
      anchorsOf(cards.find((c) => c.key === key)?.html ?? "")
        .filter(isButton)
        .join(""),
    )[0];
  ck("work → its section", buttonHref("work") === "/#security-intelligence", buttonHref("work"));
  ck("passport → its section", buttonHref("passport") === "/#passport", buttonHref("passport"));
  ck(
    "career → the opened profession catalogue",
    buttonHref("career") === "/career-center?all=true#utforska-yrken",
    buttonHref("career"),
  );
  // A signed-in reader is redirected away from /, so for them the button
  // opens the part itself. Asserted in source: the static render is signed
  // out.
  ck(
    "a signed-in reader's work and Passport buttons open the parts themselves",
    /inside \? \(\s*<PrimaryLink to="\/security-work"/.test(sectionsCode) &&
      /inside \? \(\s*<PrimaryLink to="\/passport"/.test(sectionsCode),
  );
  const career = cards.find((c) => c.key === "career")?.html ?? "";
  ck("the career card offers the jobs", hrefsOf(career).includes("/jobs"));
  ck(
    "the career card offers the career analysis directly",
    hrefsOf(career).includes(CANONICAL_ASSESSMENT_PATH),
  );
}

/* T5 ---------------------------------------------------------------- */
group("T5 · every account action is canonical and safe");
{
  const PASSPORT_LANDING = "/passport";
  ck(
    "the route declares the Passport intent once, as a constant",
    /const PASSPORT_INTENT = \{ redirect: "\/passport" \} as const;/.test(routeCode),
  );
  ck(
    "the Passport section's action renders /signup?redirect=/passport",
    sectionOf(svMain, "passport").includes('href="/signup?redirect=%2Fpassport"'),
    svMain.match(/href="\/signup[^"]*passport[^"]*"/)?.[0],
  );
  ck(
    "the hero's account action lands in My Career",
    sectionOf(svMain, "hero").includes('href="/signup?redirect=%2Fmy-career"'),
  );
  ck(
    "safeReturnPath accepts the Passport landing",
    safeReturnPath(PASSPORT_LANDING, "/my-career") === PASSPORT_LANDING,
  );
  ck(
    "the landing is not an auth surface (that would loop)",
    !AUTH_SURFACES.includes(PASSPORT_LANDING),
  );
  ck(
    "the landing is a real route",
    existsSync(path.join(root, "src/routes/_authenticated.passport.index.tsx")),
  );

  // ── CAREER DISCOVERY'S DESTINATION IS THE CANONICAL ONE ───────────
  //
  // Taken from the module that owns the answer rather than typed out here,
  // and proven to be the canonical route and not the temporary alias — an
  // alias linked from the homepage is how a second competing product
  // surface starts.
  ck(
    "the page uses the canonical constant rather than a literal",
    sectionsCode.includes("CANONICAL_ASSESSMENT_PATH") &&
      !pageCode.includes('"/security-career-assessment"'),
  );
  ck("and it is canonical", isCanonicalPath(CANONICAL_ASSESSMENT_PATH));
  ck("and it is not the alias", !isAliasPath(CANONICAL_ASSESSMENT_PATH));
  ck("the homepage links no alias path", !svMain.includes('href="/discovery'));
  ck(
    "the canonical route file exists",
    existsSync(path.join(root, "src/routes/security-career-assessment.tsx")),
  );

  // And every intent survives every account path the form supports.
  const authForm = code(read("src/components/auth/UnifiedAuthPanel.tsx"));
  ck(
    "signup reads ?redirect= through safeReturnPath",
    authForm.includes('safeReturnPath(params.get("redirect")'),
  );
  ck(
    "an emailed confirmation link carries it back",
    authForm.includes("emailRedirectTo: `${window.location.origin}/login?redirect="),
  );
  ck("a session returned by signUp goes straight there", authForm.includes("if (data.session)"));
  ck(
    "and it survives the OAuth hop, in storage and in redirect_uri",
    authForm.includes("rememberOAuthReturn(resolveDestination()") &&
      authForm.includes("oauthRedirectUri(destination)"),
  );
  ck(
    "the swap between login and signup preserves the redirect",
    authForm.includes('to={isSignup ? "/login" : "/signup"}') &&
      authForm.includes("swapSearch.redirect = validated"),
  );
}

/* T6 ---------------------------------------------------------------- */
group("T6 · the career analysis: canonical, no signup wall, guidance, access status");
{
  // The homepage must not become the thing that breaks the low-friction
  // model, so it asserts the model rather than merely linking at it.
  const flow = code(read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx"));
  ck(
    "the public flow buffers answers rather than persisting them",
    flow.includes("v31-public-buffer") ||
      flow.includes("readBuffer") ||
      flow.includes("writeBuffer"),
  );
  ck("a ?claim= token is still resolved", flow.includes("claim"));
  const buffer = code(read("src/lib/career-discovery/v31-public-buffer.ts"));
  ck("the buffer is sessionStorage — this tab only", buffer.includes("sessionStorage"));
  ck(
    "the canonical route does not gate on a session",
    !code(read("src/routes/security-career-assessment.tsx")).includes("beforeLoad"),
  );
  // No signup wall: the analysis action goes to the product, not to an
  // account form.
  const career = sectionOf(svMain, "career");
  ck(
    "the career section's action is the canonical route itself",
    hrefsOf(career).includes(CANONICAL_ASSESSMENT_PATH),
    hrefsOf(career),
  );
  ck(
    "no analysis action anywhere routes through /signup",
    !hrefsOf(svMain).some((h) => h.startsWith("/signup") && h.includes("assessment")),
  );
  // The guidance boundary and the closed state, in the specified words.
  const SPEC: Record<Lang, Record<string, string>> = {
    sv: {
      "home.career.title": "Förstå dina möjligheter. Ta nästa steg.",
      "home.career.analysis": "Gör karriäranalysen",
      "home.career.note":
        "Karriäranalysen ger vägledning. Den avgör inte din kompetens, behörighet eller om du får ett jobb.",
      "home.career.closed":
        "Karriäranalysen är inte öppen för nya deltagare just nu. Du kan fortfarande utforska yrken och jobb.",
    },
    en: {
      "home.career.title": "Understand your options. Take the next step.",
      "home.career.analysis": "Take the career analysis",
      "home.career.note":
        "The career analysis provides guidance. It does not determine your competence, professional eligibility or whether you get a job.",
      "home.career.closed":
        "The career analysis is not open to new participants right now. You can still explore professions and jobs.",
    },
  };
  for (const lang of LANGS) {
    for (const [key, expected] of Object.entries(SPEC[lang])) {
      ck(`${lang} "${key}" is the specified copy`, d(lang)[key] === expected, d(lang)[key]);
    }
    const careerCopy = await copyText(sectionOf(mainOfLang[lang], "career"));
    ck(
      `${lang}: the guidance boundary is rendered beside the action`,
      careerCopy.includes(d(lang)["home.career.note"]),
    );
  }
  // ── THE ACTION FOLLOWS THE EXISTING ACCESS STATUS ─────────────────
  //
  // The same two questions the canonical route asks (availability, and the
  // tester gate for a signed-in reader). A definite "not open" replaces the
  // action with the exact sentence; an unknown or failed answer keeps it,
  // because the canonical route asks again and shows its own honest state.
  const hook = code(read("src/components/career-discovery/use-career-analysis-open.ts"));
  ck(
    "the status is the canonical availability read",
    hook.includes("getV31Availability") && hook.includes("getV31TesterStatus"),
  );
  ck(
    "a definite 'not open' shows the specified sentence instead of the action",
    /analysisOpen === false \? \([\s\S]{0,260}home\.career\.closed/.test(sectionsCode),
  );
  ck(
    "and the career card drops its analysis link rather than advertise a closed door",
    /analysisOpen !== false && \([\s\S]{0,200}CAREER_DISCOVERY/.test(sectionsCode),
  );
  // Rendered, not only read: a definite "not open" answer.
  analysisOpen = false;
  for (const lang of LANGS) {
    const closedMain = mainOf(render(lang));
    const closedCareer = sectionOf(closedMain, "career");
    ck(
      `${lang}: a closed analysis renders the specified sentence in the career section`,
      (await copyText(closedCareer)).includes(d(lang)["home.career.closed"]),
    );
    ck(
      `${lang}: and no link anywhere on the page opens the closed analysis`,
      !hrefsOf(closedMain).some((h) => h.startsWith(CANONICAL_ASSESSMENT_PATH)),
      hrefsOf(closedMain).filter((h) => h.startsWith(CANONICAL_ASSESSMENT_PATH)),
    );
  }
  analysisOpen = undefined;
}

/* T7 ---------------------------------------------------------------- */
group("T7 · the employer band, and the flag that still fails closed");
{
  const band = sectionOf(svMain, "employers");
  ck("the band renders", band.length > 0);
  ck(
    "it carries /signup?redirect=/employer",
    band.includes('href="/signup?redirect=%2Femployer"'),
    band.match(/href="[^"]*"/g),
  );
  ck("and it links the employer information page", band.includes('href="/employers"'));
  ck(
    "safeReturnPath accepts the employer landing",
    safeReturnPath("/employer", "/my-career") === "/employer",
  );
  ck("the employer landing is not an auth surface", !AUTH_SURFACES.includes("/employer"));
  ck(
    "the employer landing is a real route",
    existsSync(path.join(root, "src/routes/_authenticated.employer.index.tsx")),
  );
  // ── INTENT IS NEVER A ROLE ────────────────────────────────────────
  //
  // Nothing on this page grants anything, and the destination re-derives
  // membership server-side. Asserted where a regression would land: the
  // route may not write user metadata, set a role or read one.
  for (const banned of ["user_metadata", "employer_memberships", "role:", "is_platform_admin"]) {
    ck(`the homepage never touches "${banned}"`, !routeCode.includes(banned));
  }
  const employerRoute = code(read("src/routes/_authenticated.employer.index.tsx"));
  ck(
    "/employer resolves membership server-side on arrival",
    employerRoute.includes("listMyEmployerWorkspaces") || employerRoute.includes("useServerFn"),
  );
  // ── THE RELEASE FLAG ──────────────────────────────────────────────
  //
  // Read at render, and the REGISTRATION action is what it gates. A
  // disabled product may not be presented as an available one.
  ck("the route reads employerPortalEnabled()", routeCode.includes("employerPortalEnabled()"));
  ck(
    "and the registration action is conditional on it",
    /employerOpen\s*&&\s*\(\s*\n?\s*<PrimaryLink/.test(routeCode),
    routeCode.match(/employerOpen[\s\S]{0,60}/)?.[0],
  );
  const flag = read("src/lib/job-intelligence/feature-flag.ts");
  ck(
    "the flag fails closed — an unset variable is not enabled",
    flag.includes('String(raw).toLowerCase() === "true"'),
  );
  // The specified band copy, verbatim.
  const SPEC: Record<Lang, Record<string, string>> = {
    sv: {
      "home.employers.title": "Rekrytera och utveckla säkerhetspersonal",
      "home.employers.body":
        "Samla jobbannonser, ansökningar, rekryteringstester och strukturerade intervjuer i Företagsportalen. Fortsätt med kompetensutveckling för medarbetarna. Ni fattar och dokumenterar besluten.",
      "home.employers.cta.explore": "Utforska Företagsportalen",
      "home.employers.cta.register": "Registrera företag",
      "home.employers.flow.jobs": "Publicera jobb",
      "home.employers.flow.applications": "Hantera ansökningar",
      "home.employers.flow.tests": "Använd rekryteringstester",
      "home.employers.flow.interview": "Förbered intervjun",
      "home.employers.flow.decision": "Fatta och dokumentera beslutet",
    },
    en: {
      "home.employers.title": "Recruit and develop security professionals",
      "home.employers.body":
        "Bring job adverts, applications, recruitment assessments and structured interviews together in the Employer portal. Continue with learning and development for employees. You make and document the decisions.",
      "home.employers.cta.explore": "Explore the Employer portal",
      "home.employers.cta.register": "Register your organisation",
      "home.employers.flow.jobs": "Post a job",
      "home.employers.flow.applications": "Manage applications",
      "home.employers.flow.tests": "Use recruitment assessments",
      "home.employers.flow.interview": "Prepare the interview",
      "home.employers.flow.decision": "Make and document the decision",
    },
  };
  for (const lang of LANGS) {
    for (const [key, expected] of Object.entries(SPEC[lang])) {
      ck(`${lang} "${key}" is the specified copy`, d(lang)[key] === expected, d(lang)[key]);
    }
    // Learning and development is continued use AFTER the five recruitment
    // steps — never a sixth, numbered selection step.
    const band = sectionOf(mainOfLang[lang], "employers");
    const list = band.match(/<ol\b[\s\S]*?<\/ol>/)?.[0] ?? "";
    const after = band.slice(band.indexOf("</ol>"));
    ck(
      `${lang}: learning and development follows the steps, outside the numbered list`,
      !list.includes(d(lang)["home.employers.flow.development"]) &&
        (await copyText(after)).includes(d(lang)["home.employers.flow.development"]),
    );
  }
}

/* T8 ---------------------------------------------------------------- */
group("T8 · every link on the page is an existing canonical route");
{
  // The deep-dive sections explain and link, and add no solid call to
  // action of their own -- the page's solid actions are the hero's account
  // action and the employer registration -- and every sequence on the page
  // is an ordered list.
  for (const id of ["security-intelligence", "passport", "career", "get-started", "faq"]) {
    ck(
      `no solid call to action inside #${id}`,
      anchorsOf(sectionOf(svMain, id)).filter(isSolid).length === 0,
      anchorsOf(sectionOf(svMain, id)).filter(isSolid),
    );
  }
  ck(
    "the hero has exactly one solid action, the account action",
    anchorsOf(sectionOf(svMain, "hero")).filter(isSolid).length === 1,
  );
  ck(
    "both audiences' steps are ordered lists",
    (sectionOf(svMain, "get-started").match(/<ol\b/g) ?? []).length === 2,
  );
  ck("the employer flow is an ordered list", sectionOf(svMain, "employers").includes("<ol"));
  // Every destination is an existing canonical route.
  const ROUTES: Record<string, string> = {
    "/signup": "src/routes/signup.tsx",
    "/login": "src/routes/login.tsx",
    "/security-career-assessment": "src/routes/security-career-assessment.tsx",
    "/career-center": "src/routes/career-center.index.tsx",
    "/employers": "src/routes/employers.tsx",
    "/jobs": "src/routes/jobs.index.tsx",
    "/about": "src/routes/about.tsx",
    "/feedback": "src/routes/_authenticated.feedback.tsx",
    // Signed-in destinations the chrome and the cards offer a signed-in
    // reader, from the same scan.
    "/security-work": "src/routes/_authenticated.security-work.index.tsx",
    "/passport": "src/routes/_authenticated.passport.index.tsx",
    "/my-career": "src/routes/_authenticated.my-career.index.tsx",
    "/my-career/profile": "src/routes/_authenticated.my-career.profile.tsx",
    "/reviews": "src/routes/_authenticated.reviews.tsx",
    "/employer/pending": "src/routes/_authenticated.employer.pending.tsx",
  };
  // The `?redirect=` LANDINGS the page hands to the one door. Each must be
  // a real route and must pass safeReturnPath, or the intent is silently
  // swapped for the default destination and the link quietly stops keeping
  // its promise.
  const LANDINGS: Record<string, string> = {
    "/passport": "src/routes/_authenticated.passport.index.tsx",
    "/employer": "src/routes/_authenticated.employer.index.tsx",
    "/my-career": "src/routes/_authenticated.my-career.index.tsx",
    // Security work's action: a signed-in account context, reached only
    // through the one door by a signed-out reader.
    "/security-work": "src/routes/_authenticated.security-work.index.tsx",
  };
  const linked = new Set(
    [
      ...[
        ...`${svMain}${headerCode}${footerCode}${sectionsCode}`.matchAll(
          /href="([^"#?]+)|to="([^"]+)"/g,
        ),
      ].map((m) => m[1] ?? m[2]),
      ...[false, true].flatMap((signedIn) => publicNav(signedIn).map((i) => i.to)),
    ].filter((h) => h && h.startsWith("/") && !h.includes("$")),
  );
  // A signed-out reader is never linked straight into the security work
  // app from the page's content: the section's action goes through the one
  // door with its validated destination.
  for (const lang of LANGS) {
    ck(
      `${lang}: the signed-out page links no /security-work route directly`,
      !hrefsOf(mainOfLang[lang]).some((href) => href.startsWith("/security-work")),
    );
  }
  for (const href of linked) {
    if (href === "/") continue;
    const file = ROUTES[href];
    ck(`${href} is a known canonical route`, Boolean(file), href);
    if (file) ck(`  backed by ${file}`, existsSync(path.join(root, file)));
  }
  ck(
    "no new route was invented for this page",
    [...linked].every((h) => h === "/" || h in ROUTES),
    [...linked].filter((h) => h !== "/" && !(h in ROUTES)),
  );
  const usedLandings = new Set(
    hrefsOf(svMain)
      .map((h) => h.match(/^\/signup\?redirect=(.+)$/)?.[1])
      .filter((v): v is string => Boolean(v))
      .map((v) => decodeURIComponent(v)),
  );
  ck("the page hands four landings to the one door", usedLandings.size === 4, [...usedLandings]);
  for (const landing of usedLandings) {
    ck(`  ${landing} survives safeReturnPath`, safeReturnPath(landing, "/my-career") === landing);
    ck(`  ${landing} is not an auth surface`, !AUTH_SURFACES.includes(landing));
    const file = LANDINGS[landing];
    ck(
      `  ${landing} is a real route`,
      Boolean(file) && existsSync(path.join(root, file!)),
      landing,
    );
  }
  // The contact form sends nothing, so the homepage invites nobody into it.
  ck("the homepage does not link the contact form", !svMain.includes('href="/contact"'));
  ck(
    "the homepage still never links a signed-out visitor straight into a Passport route",
    !/href="\/passport/.test(svMain),
  );
  ck(
    "no public Passport route has appeared without the nav being revisited",
    !existsSync(path.join(root, "src/routes/passport.tsx")) &&
      !existsSync(path.join(root, "src/routes/security-passport.tsx")),
  );
}

/* T9 ---------------------------------------------------------------- */
group("T9 · the Passport market scale, the fictional example, and the disclaimer");
{
  const passport = sectionOf(svMain, "passport");
  ck("three markets are presented", PUBLIC_MARKET_SCALE.length === 3, PUBLIC_MARKET_SCALE.length);
  // ── AGREEMENT WITH THE GOVERNED LIST ──────────────────────────────
  //
  // `PASSPORT_OVERVIEW_MARKETS` is the governed declaration and lives in a
  // server-function module the public route must not import. It is read
  // here as SOURCE TEXT rather than imported, which is the same
  // mirror-and-prove shape identity/market-rules.ts already uses against
  // its migration: the two may not disagree about a single code.
  const governedSrc = read("src/lib/security-passport/credentials.functions.ts");
  const governed = governedSrc
    .match(/PASSPORT_OVERVIEW_MARKETS = \[([^\]]*)\]/)?.[1]
    ?.match(/"([^"]+)"/g)
    ?.map((s) => s.slice(1, -1));
  ck("the governed overview list is readable", Array.isArray(governed), governed);
  for (const market of PUBLIC_MARKET_SCALE) {
    ck(
      `  "${market.code}" is one of the governed market packs`,
      Boolean(governed?.includes(market.code)),
      governed,
    );
  }
  ck(
    "and the public page does not name a pack the overview omits",
    PUBLIC_MARKET_SCALE.every((m) => governed?.includes(m.code)),
  );
  // Northern Ireland is a SUBMARKET of Great Britain, not a fourth country,
  // and Abu Dhabi is closed by owner decision. Neither is named publicly.
  for (const lang of LANGS) {
    for (const banned of ["GB-NI", "Nordirland", "Northern Ireland", "Abu Dhabi", "AE-AZ"]) {
      ck(`${lang}: the page does not name "${banned}"`, !seenOf[lang].includes(banned));
    }
  }
  for (const [lang, names] of [
    ["sv", ["Sverige", "Storbritannien", "Dubai"]],
    ["en", ["Sweden", "Great Britain", "Dubai"]],
  ] as const) {
    for (const name of names) {
      ck(`${lang}: "${name}" is stated on the page`, copyOf[lang].includes(name));
    }
    ck(`${lang}: and so is their real status`, copyOf[lang].includes(d(lang)["home.markets.body"]));
  }
  // No fabricated credential record OUTSIDE the illustrative example. The
  // example is fictional and says so, visibly and in its accessible name.
  ck(
    "outside the labelled example, the section carries no invented credential, holder or number",
    !/VU1|VU2|SIA|SIRA|ordningsvakt|licens(nummer)?\s*\d/i.test(withoutExample(passport)),
  );
  for (const lang of LANGS) {
    const section = sectionOf(mainOfLang[lang], "passport");
    const figure = section.match(/<figure\b[^>]*data-home-passport-example[\s\S]*?<\/figure>/)?.[0];
    ck(`${lang}: the example lives in the Passport section`, Boolean(figure));
    ck(
      `${lang}: and says it is a fictional person with fictional credentials`,
      Boolean(figure) &&
        figure!.includes(`aria-label="${d(lang)["home.passportPreview.exampleCaption"]}"`) &&
        fullText(figure!).includes(d(lang)["home.passportPreview.exampleCaption"]),
    );
    ck(
      `${lang}: the example carries no control`,
      Boolean(figure) && anchorsOf(figure!).length === 0 && !figure!.includes("<button"),
    );
  }
  ck(
    "sv example marking is the specified sentence",
    d("sv")["home.passportPreview.exampleCaption"] ===
      "Exempel – påhittad person och påhittade meriter.",
  );
  ck(
    "en example marking is the specified sentence",
    d("en")["home.passportPreview.exampleCaption"] ===
      "Example – fictional person and fictional credentials.",
  );
  ck(
    "and the route reads no Passport table or entitlement",
    !routeCode.includes("sp_") &&
      !routeCode.includes("getRegulatedCredentialAvailability") &&
      !routeCode.includes("supabase.from"),
  );
  // ── THE DISCLAIMER, VERBATIM ──────────────────────────────────────
  ck(
    "sv disclaimer is the approved sentence",
    d("sv")["home.markets.disclaimer"] ===
      "Security Passport hjälper dig att strukturera och dela information. Det ersätter inte en myndighetslicens, säkerhetsprövning, rätt att arbeta eller arbetsgivarens egna kontroller.",
    d("sv")["home.markets.disclaimer"],
  );
  ck(
    "en disclaimer is the approved sentence",
    d("en")["home.markets.disclaimer"] ===
      "Security Passport helps you structure and share information. It does not replace a government licence, security vetting, right-to-work check or an employer's own due diligence.",
    d("en")["home.markets.disclaimer"],
  );
  for (const lang of LANGS) {
    ck(`${lang}: and it is rendered`, copyOf[lang].includes(d(lang)["home.markets.disclaimer"]));
  }
}

/* T10 --------------------------------------------------------------- */
group("T10 · the trust levels respect the PR #189 semantics");
{
  const passport: Record<Lang, string> = {
    sv: sectionOf(svMain, "passport"),
    en: sectionOf(enMain, "passport"),
  };
  for (const [lang, levels] of [
    ["sv", ["Registrerat", "Dokumenterat", "Källbekräftat"]],
    ["en", ["Registered", "Documented", "Source-confirmed"]],
  ] as const) {
    for (const level of levels) ck(`${lang}: "${level}" is named`, passport[lang].includes(level));
  }
  // ── ONLY SOURCE-CONFIRMED READS AS CONFIRMED ──────────────────────
  //
  // Scoped to the trust list by its own aria-label rather than to every
  // <li> in the section: the market chips are a list too, and counting them
  // as trust levels would be the guard misreading the page.
  const trustList = (() => {
    const legend = d("sv")["home.trust.legend"];
    const start = passport.sv.indexOf(`<ul aria-label="${legend}"`);
    if (start === -1) return "";
    return passport.sv.slice(start, passport.sv.indexOf("</ul>", start));
  })();
  ck("the trust list is labelled for a screen reader", trustList.length > 0);
  const chipBlocks = trustList.split("<li>").slice(1);
  ck("three level chips", chipBlocks.length === 3, chipBlocks.length);
  for (const block of chipBlocks) {
    const label = block
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const green = /emerald/.test(block);
    ck(
      `"${label}" ${green ? "uses" : "does not use"} the confirmation treatment`,
      green === label.includes("Källbekräftat"),
      label,
    );
  }
  // Colour is never what carries it: three distinct glyphs and three
  // distinct border treatments, before any colour is perceived.
  ck("the weakest level is dashed", /border-dashed/.test(routeCode));
  for (const g of ["PencilLine", "FileText", "CheckCircle2"]) {
    ck(`the level list uses ${g}`, new RegExp(`glyph: ${g}`).test(routeCode));
  }
  ck(
    "and every level prints its own word",
    ["home.trust.registered", "home.trust.documented", "home.trust.sourceConfirmed"].every((k) =>
      routeCode.includes(k),
    ),
  );
  // A TRUST state is not a LIFECYCLE state.
  for (const lang of LANGS) {
    for (const rx of [
      /\butgången\b/i,
      /\båterkallad\b/i,
      /\barkiverad\b/i,
      /\bexpired\b/i,
      /\brevoked\b/i,
      /\barchived\b/i,
    ]) {
      ck(`${lang}: no lifecycle word "${rx.source}"`, !rx.test(copyOf[lang]));
    }
  }
}

/* T11 --------------------------------------------------------------- */
group("T11 · the signed-in redirect is intact and is the only one");
{
  ck("the route reads the session", routeCode.includes("supabase.auth.getSession()"));
  ck(
    "and navigates a signed-in visitor to /my-career, replacing history",
    /navigate\(\{\s*to:\s*"\/my-career",\s*replace:\s*true\s*\}\)/.test(routeCode),
  );
  ck(
    "the redirect is guarded by an actual session",
    /if\s*\(alive\s*&&\s*data\.session\)/.test(routeCode),
  );
  ck(
    "exactly one navigate() call on the route",
    (routeCode.match(/navigate\(/g) ?? []).length === 1,
    (routeCode.match(/navigate\(/g) ?? []).length,
  );
  ck("no beforeLoad redirect on the public homepage", !routeCode.includes("beforeLoad"));
  ck("no catch-and-redirect", !/\.catch\([^)]*navigate/.test(routeCode));
}

/* T12 --------------------------------------------------------------- */
group("T12 · the public chrome, and the untouched candidate chrome");
{
  const shape = (signedIn: boolean) =>
    publicNav(signedIn).map((i) => `${i.to}${i.hash ? `#${i.hash}` : ""}`);
  ck(
    "six public destinations, the three core parts first",
    JSON.stringify(shape(false)) ===
      JSON.stringify([
        "/#security-intelligence",
        "/#passport",
        "/career-center",
        "/jobs",
        "/employers",
        "/about",
      ]),
    shape(false),
  );
  ck(
    "a signed-in reader's product entries open the products, never a section they are redirected away from",
    JSON.stringify(shape(true).slice(0, 2)) === JSON.stringify(["/security-work", "/passport"]),
    shape(true),
  );
  ck(
    "the header renders them, matching a section entry by its hash",
    headerCode.includes("const nav = publicNav(signedIn === true)") &&
      headerCode.includes(
        'activeOptions={{ exact: item.to === "/", includeHash: item.hash !== undefined }}',
      ),
  );
  ck('"Bedömningar" is out of the public nav', !shape(false).includes("/assessment"));
  ck('"Kontakt" is out of the public nav', !shape(false).includes("/contact"));
  ck(
    "Career Discovery is not a public nav entry",
    !shape(false).includes(CANONICAL_ASSESSMENT_PATH),
  );

  // ── ONE LOGIN, ONE CREATE ACCOUNT, AND NEITHER NAMES A PRODUCT ────
  ck("the header offers /login", headerCode.includes('to="/login"'));
  ck("and one product-neutral account action", headerCode.includes('{t("nav.createAccount")}'));
  ck(
    "the chrome carries no product-specific signup intent",
    !headerCode.includes('{ redirect: "/passport" } as never'),
  );
  ck(
    "exactly one account-creation control per viewport (desktop + compact)",
    (headerCode.match(/\{t\("nav\.createAccount"\)\}/g) ?? []).length === 2,
    (headerCode.match(/\{t\("nav\.createAccount"\)\}/g) ?? []).length,
  );

  // The footer renders the header's six, plus beta feedback.
  ck(
    "the footer renders the same six from the one definition",
    footerCode.includes("publicNav(signedIn === true)"),
  );
  ck("the footer does not promote the contact form", !footerCode.includes('"/contact"'));
  ck(
    "the legal line says the documents are not published, as text",
    footerCode.includes('<span>{t("footer.legal.notice")}</span>'),
  );
  ck(
    "no anchor wraps the legal line",
    !/<Link[^>]*>\s*\{t\("footer\.legal\.notice"\)\}/.test(footerSrc),
  );
  for (const [lang, expected] of [
    ["sv", "Integritetspolicy och användarvillkor är inte publicerade ännu."],
    ["en", "The privacy policy and terms of use have not been published yet."],
  ] as const) {
    ck(`${lang} legal notice`, d(lang)["footer.legal.notice"] === expected);
  }

  // The owner's 2026-09-24 decision adds Security Work immediately after
  // Passport. Keep the signed-in seven separate from the public six.
  ck(
    "the candidate workspace has exactly the seven approved destinations",
    CANDIDATE_APP_NAV.length === 7,
    CANDIDATE_APP_NAV.length,
  );
  ck(
    "in the settled order",
    JSON.stringify(CANDIDATE_APP_NAV.map((i) => i.key)) ===
      JSON.stringify([
        "overview",
        "passport",
        "security-work",
        "cv",
        "jobs",
        "career",
        "assessments",
      ]),
    CANDIDATE_APP_NAV.map((i) => i.key),
  );
  // Career Discovery keeps lighting ONE workspace destination for a signed-in
  // candidate — Karriär.
  const career = CANDIDATE_APP_NAV.find((i) => i.key === "career");
  ck(
    "and Career Discovery still lights exactly one workspace destination -- Karriär",
    Boolean(career?.routeIds.includes(CANONICAL_ASSESSMENT_PATH)),
    career?.routeIds,
  );
}

/* T13 --------------------------------------------------------------- */
group("T13 · sv and en say the same thing, with the same structure");
{
  const pageKeys = (lang: Lang) =>
    Object.keys(dictionaries[lang])
      .filter((k) => k.startsWith("home.") || k === "cta.passport")
      .sort();
  ck(
    "the same keys exist in both languages",
    JSON.stringify(pageKeys("sv")) === JSON.stringify(pageKeys("en")),
    pageKeys("sv").filter((k) => !pageKeys("en").includes(k)),
  );
  // Product names are the same in both. Nothing else may be — an untouched
  // English string is an untranslated one. Each exception is PROVEN to be a
  // product name rather than trusted to be one: it must equal, in both
  // languages, the name the product itself carries elsewhere. A sentence
  // cannot hide in this list, because no product is named with a sentence.
  const PRODUCT_NAMES: Record<string, string> = {
    "home.markets.eyebrow": "nav.securityPassport",
    "home.ai.title": "sw.product",
  };
  const SAME_IN_BOTH = new Set<string>(Object.keys(PRODUCT_NAMES));
  for (const [key, nameKey] of Object.entries(PRODUCT_NAMES)) {
    for (const lang of LANGS) {
      ck(
        `${lang} "${key}" is the product name "${nameKey}"`,
        typeof d(lang)[nameKey] === "string" && d(lang)[key] === d(lang)[nameKey],
        `${d(lang)[key]} vs ${d(lang)[nameKey]}`,
      );
    }
  }
  for (const key of pageKeys("sv")) {
    for (const lang of LANGS) {
      const v = d(lang)[key];
      ck(`${lang} "${key}" is non-empty`, typeof v === "string" && v.trim().length > 0);
    }
    ck(
      `"${key}" is actually translated`,
      d("sv")[key] !== d("en")[key] || SAME_IN_BOTH.has(key),
      key,
    );
  }
  ck(
    "same section ids in both languages",
    JSON.stringify([...svMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1])) ===
      JSON.stringify([...enMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1])),
  );
  ck(
    "same destinations, same order",
    JSON.stringify(hrefsOf(svMain)) === JSON.stringify(hrefsOf(enMain)),
    JSON.stringify(hrefsOf(svMain)),
  );
  ck(
    "same number of solid controls",
    anchorsOf(svMain).filter(isSolid).length === anchorsOf(enMain).filter(isSolid).length,
  );
  // English names the career tool one way: Career Discovery is the product,
  // and "the career analysis" is what the specification calls using it.
  ck('en copy says "Career Discovery"', /Career Discovery/.test(copyOf.en));
  for (const drift of [/career test/i, /skills test/i]) {
    ck(`en copy does not also say "${drift.source}"`, !drift.test(copyOf.en));
  }
  // And Swedish body text says "Min karriär", never "My Career".
  ck('sv copy never says "My Career"', !/My Career/.test(copyOf.sv));
}

/* T14 --------------------------------------------------------------- */
group("T14 · no forbidden claim was introduced");
{
  // ── THE NON-NEGOTIABLE DATA BOUNDARIES, AS STRINGS ────────────────
  //
  // Each entry below is a sentence a reader could actually meet on this
  // page. They are grouped by the boundary they would breach, because a
  // failure here should say WHICH rule broke and not merely that a regex
  // matched.
  //
  // The two disclaimers are deliberately NEGATED forms ("ersätter inte",
  // "does not replace"), so every pattern about replacement requires the
  // affirmative: `(?<!inte )ersätter` and `(?<!does not )replaces?`. A guard
  // that banned the substring outright would ban the disclaimer the brief
  // requires.
  const FORBIDDEN: readonly { rule: string; patterns: readonly RegExp[] }[] = [
    {
      rule: "the career analysis gives guidance, and never measures competence",
      patterns: [
        /mäter din kompetens|mät din kompetens|kompetenstest/i,
        /measures? your competence|competence test/i,
        /karriärtest|career test/i,
        /\bkunskapsprov\b|\bexam\b/i,
      ],
    },
    {
      rule: "career analysis data is candidate-owned and never enters employer ranking",
      patterns: [
        /arbetsgivare (ser|får|läser) (din|ditt) (karriär|discovery|resultat)/i,
        /employers? (see|receive|read) your (career|discovery|result)/i,
        /rangordn/i,
        /\branking\b|\brank(s|ed)? candidates\b/i,
      ],
    },
    {
      rule: "the Passport receives no raw answers, prompts, scoring keys or rubrics",
      patterns: [
        /svar.{0,20}(sparas|lagras) i (ditt )?passport/i,
        /answers.{0,20}(stored|saved) in your passport/i,
        /\brubrik(er)?mall\b|\bscoring key\b|\brubric\b/i,
      ],
    },
    {
      rule: "an assessment result is not a Passport credential, and there is no overall score",
      patterns: [
        /testresultat.{0,20}(blir|som) (en )?merit/i,
        /assessment result.{0,20}(becomes|is a) credential/i,
        /(total|sammanlagd|övergripande)\s*(poäng|betyg|score)/i,
        /overall (score|rating|grade)/i,
        /\bpoängsätt/i,
      ],
    },
    {
      rule: "no hire, reject, credibility, deception, personality or protected-trait inference",
      patterns: [
        /(vi|ai|plattformen|cqrityjob) (avgör|bedömer|väljer) (om )?(du|kandidaten) (är )?lämplig/i,
        /(we|ai|the platform|cqrityjob) (decides?|determines?) (if |whether )?(you|the candidate) (is |are )?suitable/i,
        /\blämplighetsbedömning\b|\bsuitability (score|assessment|rating)\b/i,
        /trovärdighet|credibility|deception|lie detect/i,
        /personlighetstest|personality test|personality profile/i,
        /automatiskt (urval|avslag|beslut)/i,
        /automatic (screening|rejection|decision)/i,
      ],
    },
    {
      rule: "humans make and document every employment and personnel-security decision",
      patterns: [
        /ai (fattar|tar) beslut/i,
        /ai (makes|takes) the decision/i,
        /\bautomatisk matchning\b|\bautomatic (job )?match\b/i,
        /garanterar (jobb|anställning)/i,
        /guarantees? (a )?job/i,
      ],
    },
    {
      rule: "the Passport is not recognised, approved or valid anywhere, and replaces nothing",
      patterns: [
        /globalt erkän/i,
        /globally recognis|globally recogniz/i,
        /internationellt godkän/i,
        /internationally approved/i,
        /giltig i alla länder/i,
        /valid in (every|all) countr/i,
        /automatiskt likvärdig/i,
        /automatically equivalent/i,
        /(?<!inte )ersätter (en |ett )?(licens|myndighetslicens|tillstånd|bakgrundskontroll|säkerhetsprövning)/i,
        /(?<!does not )replaces? (a )?(licence|license|work permit|background|security vetting)/i,
      ],
    },
    {
      rule: "no issuer claim — CQrityjob issues, verifies and revokes nothing",
      patterns: [
        /\butfärdare\b|\bissuer\b/i,
        /verifierade meriter|verified merits/i,
        /kompetensverifiering|competence verification/i,
      ],
    },
    {
      // The FAQ says pricing is not published. A price or a "free" promise
      // anywhere else on the page would contradict it.
      rule: "no price and no free promise — pricing is not published",
      patterns: [
        /\bgratis\b|\bkostnadsfri/i,
        /\bfree( of charge)?\b/i,
        /\d\s*(kr|sek|eur|usd|gbp|aed)\b|[€$£]\s*\d/i,
      ],
    },
    {
      // What the security workspace does is what the code does: no
      // autonomous collection, no bulk-document claims, no integration and
      // no real-time alerting, and AI is never promised to be on.
      rule: "security work is described as it is — no autonomy, volume, integration or live claims",
      patterns: [
        /automatisk (informationsinhämtning|bevakning)|automatic (collection|monitoring)/i,
        /tusentals dokument|thousands of documents/i,
        /sharepoint|microsoft word|word-integration/i,
        /realtid|real[- ]time/i,
        /krisledningscentral|crisis management centre|crisis command/i,
        /\bai fungerar\b|\bai works\b|alla system fungerar|all systems (are )?(working|operational)/i,
        /självständig(a)? agent|autonomous agent/i,
      ],
    },
  ];
  for (const lang of LANGS) {
    for (const { rule, patterns } of FORBIDDEN) {
      for (const rx of patterns) {
        ck(`${lang} · ${rule} — no "${rx.source}"`, !rx.test(copyOf[lang]));
      }
    }
  }
  // And the sentences that must be there, not merely the absences.
  for (const lang of LANGS) {
    ck(
      `${lang}: the Passport disclaimer is rendered in full`,
      copyOf[lang].includes(d(lang)["home.markets.disclaimer"]),
    );
    ck(
      `${lang}: the career analysis boundary is rendered in full`,
      copyOf[lang].includes(d(lang)["home.career.note"]),
    );
  }
}

/* T15 --------------------------------------------------------------- */
group("T15 · the English page is English, decoration included");
{
  // 1. No Swedish-specific character survives into the English page.
  const diacritics = seenOf.en.match(/[åäöÅÄÖ]/g) ?? [];
  ck(
    "no å/ä/ö anywhere on the English page",
    diacritics.length === 0,
    diacritics.length === 0
      ? ""
      : `${diacritics.length} found, e.g. ${seenOf.en
          .match(/\S*[åäöÅÄÖ]\S*/g)
          ?.slice(0, 6)
          .join(", ")}`,
  );
  // 2. The words with no diacritic to give them away. For every key that IS
  //    translated, the other language's value must not appear on this page.
  //    Symmetric, so an English leak into the Swedish page fails too.
  const pageKeys = Object.keys(dictionaries.sv).filter(
    (k) => k.startsWith("home.") || k === "cta.passport",
  );
  for (const [lang, other] of [
    ["en", "sv"],
    ["sv", "en"],
  ] as const) {
    // Every value this language legitimately renders, so a SHARED product
    // name is not reported as a leak.
    const mineAll = pageKeys.map((k) => d(lang)[k]).filter(Boolean);
    const leaked: string[] = [];
    for (const key of pageKeys) {
      const mine = d(lang)[key];
      const theirs = d(other)[key];
      if (!theirs || theirs === mine || theirs.length < 4) continue;
      if (mineAll.some((v) => v.includes(theirs))) continue;
      if (seenOf[lang].includes(theirs)) leaked.push(`${key}="${theirs}"`);
    }
    ck(`${lang}: no ${other} string is rendered`, leaked.length === 0, leaked.join(" · "));
  }
  // 3. No Swedish string literal is left anywhere in the route's own source:
  //    even the <head> reads its Swedish pair from the dictionary.
  const literals = [...routeCode.matchAll(/"([^"\n]*[åäöÅÄÖ][^"\n]*)"/g)].map((m) => m[1]);
  ck("no Swedish string literal remains in the route", literals.length === 0, literals.join(" · "));
  // 4. The word budget, so a rebuild cannot quietly become a brochure. A
  //    CEILING rather than a snapshot of today, counted over everything a
  //    person sees, decoration included.
  //
  //    Each section's ceiling is its specified content in the longer
  //    language plus about five per cent, rounded up to a multiple of five.
  //    The page's total ceiling is lower than the sum of the sections, so the
  //    headroom cannot be spent everywhere at once. A section grows by
  //    raising its own line here, in a diff somebody reads.
  //
  //    #career is sized for its LONGER state: when the career analysis is not
  //    open, the specified sentence replaces the two-word action.
  const BUDGET: Record<string, number> = {
    hero: 165,
    "security-intelligence": 220,
    passport: 150,
    career: 90,
    employers: 75,
    "get-started": 100,
    faq: 240,
  };
  const TOTAL_CEILING = 1015;
  ck(
    "every section of the page has a budget, and nothing else does",
    JSON.stringify(Object.keys(BUDGET)) ===
      JSON.stringify([...svMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1])),
    Object.keys(BUDGET),
  );
  ck(
    "the total ceiling is below the sum of the section budgets",
    TOTAL_CEILING < Object.values(BUDGET).reduce((a, b) => a + b, 0),
  );
  for (const lang of LANGS) {
    for (const [id, ceiling] of Object.entries(BUDGET)) {
      const n = wc(fullText(sectionOf(mainOfLang[lang], id)));
      ck(`${lang}: #${id} renders ${n} words (budget ${ceiling})`, n <= ceiling, n);
    }
    ck(
      `${lang}: ${wc(seenOf[lang])} words rendered in total (ceiling ${TOTAL_CEILING})`,
      wc(seenOf[lang]) <= TOTAL_CEILING,
      wc(seenOf[lang]),
    );
  }
}

/* T16 --------------------------------------------------------------- */
group("T16 · the sections keep their content and their safety sentences");
{
  // ── PROFESSIONS AND JOBS CAN BE READ WITHOUT AN ACCOUNT ───────────
  for (const lang of LANGS) {
    const career = coreCards(sectionOf(mainOfLang[lang], "hero")).find((c) => c.key === "career");
    ck(
      `${lang}: the career card says professions and jobs are readable without an account`,
      Boolean(career) && (await copyText(career!.html)).includes(d(lang)["home.core.career.note"]),
    );
  }

  // ── THE PASSPORT KEEPS ITS OWN SCOPE, AND SHARING IS THE HOLDER'S ─
  // Certifications, licences and authorisations -- education and employment
  // history are the CV's -- and an upload is not a verification.
  for (const lang of LANGS) {
    for (const key of ["home.core.passport.body", "home.passport.body"]) {
      ck(
        `${lang}: "${key}" claims no education or experience for the Passport`,
        !/utbildning|erfarenhet|training|education|experience/i.test(d(lang)[key]),
        d(lang)[key],
      );
    }
    const passportCopy = await copyText(sectionOf(mainOfLang[lang], "passport"));
    for (const key of ["home.passport.body", "home.passport.sharing"]) {
      ck(`${lang}: the Passport section says "${key}"`, passportCopy.includes(d(lang)[key]));
    }
  }
  ck(
    "an upload is not a verification, in both languages",
    d("sv")["home.passport.body"].includes(
      "Ett uppladdat dokument innebär inte i sig att uppgiften har verifierats.",
    ) &&
      d("en")["home.passport.body"].includes(
        "Uploading a document does not by itself verify the information.",
      ),
  );
  ck(
    "and applying for a job shares nothing by itself",
    d("sv")["home.passport.sharing"] ===
      "Du väljer vad som delas. En jobbansökan delar inte ditt Security Passport automatiskt." &&
      d("en")["home.passport.sharing"] ===
        "You choose what to share. Applying for a job does not automatically share your Security Passport.",
  );

  // ── THE EMPLOYER HAS ITS OWN ENTRANCE, AND DECIDES ────────────────
  for (const lang of LANGS) {
    const band = sectionOf(mainOfLang[lang], "employers");
    ck(
      `${lang}: the employer band is labelled for the employer`,
      (await copyText(band)).startsWith(d(lang)["home.employers.eyebrow"]),
      d(lang)["home.employers.eyebrow"],
    );
    const steps = [...band.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) =>
      fullText(m[1]).replace(/^\d+\.\s*/, ""),
    );
    ck(`${lang}: the employer flow has five numbered steps`, steps.length === 5, steps);
    ck(
      `${lang}: and the last one is the employer's own documented decision`,
      steps.at(-1) === d(lang)["home.employers.flow.decision"],
      steps.at(-1),
    );
  }

  // ── SECURITY INTELLIGENCE: WHAT IT DOES, WHAT NEVER GOES IN, WHO JUDGES
  const NOTE: Record<Lang, string> = {
    sv: "Lägg inte in säkerhetsskyddsklassificerad eller hemlig information. Ditt säkerhetsarbete delas inte automatiskt med din karriärprofil, Security Passport eller arbetsgivare.",
    en: "Do not enter classified or secret information. Your security work is not automatically shared with your career profile, Security Passport or employers.",
  };
  const AVAILABILITY: Record<Lang, string> = {
    sv: "Arbetsytan kan användas manuellt. AI-stöd och dokumentbearbetning har separat tillgänglighet som visas när du öppnar arbetsytan.",
    en: "The workspace supports manual work. Availability of AI assistance and document processing is shown separately when you open the workspace.",
  };
  const ROWS = [
    ["home.ai.task.label", "home.ai.task.body"],
    ["home.ai.input.label", "home.ai.input.body"],
    ["home.ai.output.label", "home.ai.output.body"],
    ["home.ai.review.label", "home.ai.review.body"],
  ] as const;
  const JUDGEMENT: Record<Lang, string> = {
    sv: "Kontrollera källor, osäkerheter och slutsatser. Du väljer vilka förslag du använder och godkänner rapporten.",
    en: "Check sources, uncertainties and conclusions. You choose which suggestions to use and approve the report.",
  };
  const WHEN_AVAILABLE: Record<Lang, string> = {
    sv: "När AI-stödet är tillgängligt",
    en: "When AI assistance is available",
  };
  for (const lang of LANGS) {
    const si = sectionOf(mainOfLang[lang], "security-intelligence");
    const siCopy = await copyText(si);
    ck(
      `${lang}: the classified-information warning and the sharing boundary, verbatim`,
      d(lang)["home.ai.note"] === NOTE[lang] && siCopy.includes(NOTE[lang]),
      d(lang)["home.ai.note"],
    );
    ck(
      `${lang}: availability is the workspace's to show`,
      d(lang)["home.ai.availability"] === AVAILABILITY[lang] && siCopy.includes(AVAILABILITY[lang]),
    );
    ck(`${lang}: AI is described only as "when available"`, siCopy.includes(WHEN_AVAILABLE[lang]));
    const terms = [...si.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/g)];
    ck(
      `${lang}: task, evidence, results and review, as four described rows`,
      terms.length === 4 &&
        ROWS.every(
          ([label, body]) => siCopy.includes(d(lang)[label]) && siCopy.includes(d(lang)[body]),
        ),
      terms.length,
    );
    ck(`${lang}: the person owns the review`, siCopy.includes(JUDGEMENT[lang]));
    ck(
      `${lang}: three examples within the existing methods`,
      [
        "home.ai.examples.monitoring.body",
        "home.ai.examples.risk.body",
        "home.ai.examples.preparedness.body",
      ].every((k) => siCopy.includes(d(lang)[k])),
    );
    ck(
      `${lang}: its one action goes through the one door, to /security-work`,
      JSON.stringify(hrefsOf(si)) === JSON.stringify(["/signup?redirect=%2Fsecurity-work"]),
      hrefsOf(si),
    );
    ck(
      `${lang}: the action is "${d(lang)["home.ai.cta"]}"`,
      siCopy.includes(d(lang)["home.ai.cta"]) &&
        d(lang)["home.ai.cta"] ===
          (lang === "sv" ? "Öppna Mitt säkerhetsarbete" : "Open My Security Work"),
    );
  }

  // ── THREE STEPS FOR A PERSON, THREE FOR AN EMPLOYER ───────────────
  for (const lang of LANGS) {
    const start = sectionOf(mainOfLang[lang], "get-started");
    const lists = [...start.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/g)].map(
      (m) => (m[1].match(/<li\b/g) ?? []).length,
    );
    ck(`${lang}: two audiences, three steps each`, JSON.stringify(lists) === "[3,3]", lists);
    ck(
      `${lang}: an employer is told the registration is reviewed`,
      (await copyText(start)).includes(d(lang)["home.start.employer.2"]),
      d(lang)["home.start.employer.2"],
    );
    ck(
      `${lang}: and a person is told not every part is required`,
      (await copyText(start)).includes(d(lang)["home.start.person.3"]),
    );
  }

  // ── SIX QUESTIONS: VERIFICATION, WHO DECIDES, AND WHAT AI DOES ────
  const VERIFIED: Record<Lang, string> = {
    sv: "En egen uppgift eller en uppladdad handling är inte automatiskt källbekräftad.",
    en: "A self-reported claim or an uploaded document is not automatically source-confirmed.",
  };
  const DECIDES: Record<Lang, string> = {
    sv: "Arbetsgivaren granskar underlaget och fattar och dokumenterar beslutet.",
    en: "The employer reviews the evidence and makes and documents the decision.",
  };
  const AI_REVIEW: Record<Lang, string> = {
    sv: "Du granskar förslagen och ansvarar för slutsatserna.",
    en: "You review the suggestions and remain responsible for the conclusions.",
  };
  const PRICING: Record<Lang, string> = {
    sv: "Priser och paket är inte publicerade ännu.",
    en: "Pricing and packages have not been published yet.",
  };
  for (const lang of LANGS) {
    const faq = sectionOf(mainOfLang[lang], "faq");
    const faqCopy = await copyText(faq);
    const items = [...faq.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1]);
    ck(`${lang}: six questions`, items.length === 6, items.length);
    // A native disclosure: every answer is in the markup, inside its own
    // question, and the browser suite opens it by keyboard.
    ck(
      `${lang}: every question carries its answer`,
      items.length === 6 &&
        [1, 2, 3, 4, 5, 6].every(
          (i) =>
            items[i - 1].includes("<summary") &&
            fullText(items[i - 1]).includes(d(lang)[`home.faq.q${i}`]) &&
            fullText(items[i - 1]).includes(d(lang)[`home.faq.a${i}`]),
        ),
    );
    ck(`${lang}: verification is not overstated`, faqCopy.includes(VERIFIED[lang]));
    ck(`${lang}: the employer makes and documents the decision`, faqCopy.includes(DECIDES[lang]));
    ck(`${lang}: the person owns the conclusions of AI support`, faqCopy.includes(AI_REVIEW[lang]));
    ck(
      `${lang}: pricing is said, once, to be unpublished`,
      d(lang)["home.faq.pricing"] === PRICING[lang] &&
        faqCopy.split(PRICING[lang]).length - 1 === 1,
    );
  }
}

/* -------------------------------------------------------------------- */
console.log("");
if (fails.length > 0) {
  console.error(`public-homepage:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("public-homepage:check OK");
