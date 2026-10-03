// The public homepage — asserted against the RENDERED markup and the
// dictionaries, in both languages.
//
// ── WHAT THIS FILE NOW DEFENDS (locked public website, 2026-09-30) ─────
//
//   HOMEPAGE = BREADTH. SUBPAGE = DEPTH. CTA = THE PATH FORWARD.
//
// The owner's locked decisions replace the seven-section page (three core
// parts explained in depth on the homepage) with SIX sections that point the
// way and leave the depth to each product's own page. A guard that still
// encoded the old page would be the most effective way to stop the new one
// shipping, so the page-shape assertions are rewritten rather than extended.
//
// NOTHING THAT GUARDS A DATA BOUNDARY, ACCESS, RANKING OR THE HUMAN DECISION
// WAS RELAXED. Those assertions are carried over; where the sentence they
// pinned now lives on a product's own page, they pin it there.
//
//   T1  main carries exactly six sections, in the locked order
//   T2  the hero: the locked H1, ONE supporting sentence, two EQUAL audience
//       entrances and no other hero action
//   T3  exactly one h1, the five h2 in order, h3 only on cards and steps
//   T4  "För dig i säkerhetsbranschen": four equal cards, ONE action each,
//       every one to that area's own public page
//   T5  every account action is canonical and safe, and each intent survives
//       every account path the auth form supports
//   T6  "Senaste jobben": REAL vacancies from the public query, each opening
//       its own advert page, "Se alla lediga jobb", and honest empty and
//       closed states
//   T7  the employer band: the locked journey, benefit first, ending in the
//       employer's own decision; /employer intent, no role by metadata, the
//       release flag still fails closed
//   T8  every link on the page is an existing canonical route, and every
//       sign-up landing survives safeReturnPath
//   T9  the recruitment services band, and its one WORKING contact action
//   T10 "Varför CQrityjob": concise, ending in the brand line
//   T11 the signed-in redirect to /my-career is intact, and is the only
//       redirect implementation on the route
//   T12 the public chrome: six destinations from one definition, one Login,
//       one Create account, the published legal links, and the signed-in
//       candidate nav untouched
//   T13 sv and en carry the same keys, structure and destinations
//   T14 NO FORBIDDEN CLAIM was introduced — the data boundaries, as
//       strings a reader could actually meet
//   T15 the English page is English, and every section stays inside its
//       own word budget
//   T16 the products' own pages keep the safety sentences the homepage no
//       longer carries
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
    params,
    search,
    hash,
    children,
    // Swallowed rather than spread: `activeOptions` is a router prop and
    // React would warn about it as an unknown DOM attribute, which makes
    // this guard's output noisy for a reason that is not the page's.
    activeOptions: _activeOptions,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "").replace(/\$([A-Za-z]+)/g, (_, k: string) =>
      String((params as Record<string, unknown> | undefined)?.[k] ?? `$${k}`),
    );
    if (search && typeof search === "object" && Object.keys(search).length > 0) {
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

// The release flags the page reads at render, pinned so the guard renders
// the same page wherever it runs. T6 and T7 re-render with each one off.
process.env.VITE_JOBS_ENABLED = "true";
process.env.VITE_EMPLOYER_PORTAL_ENABLED = "true";

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
const { CANONICAL_ASSESSMENT_PATH } = await import("../src/lib/career-discovery/routes");
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
// The sections render inside the route, so a key the route "no longer asks
// for" must not simply have moved into them.
const pageCode = [routeCode, sectionsCode].join("\n");
const headerCode = code(read("src/components/site/SiteHeader.tsx"));
const footerSrc = read("src/components/site/SiteFooter.tsx");
const footerCode = code(footerSrc);

type Lang = "sv" | "en";
const LANGS: readonly Lang[] = ["sv", "en"];

const Page = (Route as { component: () => React.ReactElement }).component;

/** Two real-shaped vacancies, as the public query returns them. The section
 *  renders whatever that query answers; seeding the cache is how a static
 *  render shows the loaded state without a network. */
const JOBS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "vaktare-stockholm",
    title_sv: "Väktare",
    title_en: "Security officer",
    location_text: "Stockholm",
    country: "SE",
    city: "Stockholm",
    region: null,
    workplace_type: "onsite",
    employment_type: "full_time",
    experience_level: null,
    family_id: null,
    profession_slug: null,
    application_method: "internal",
    application_url: null,
    application_email: null,
    published_at: "2026-09-20T08:00:00Z",
    deadline_at: "2026-10-31T21:59:59Z",
    employer_id: "00000000-0000-4000-8000-0000000000e1",
    employer: {
      id: "00000000-0000-4000-8000-0000000000e1",
      name: "Northgate Security AB",
      slug: "northgate-security",
      logo_url: null,
      website: null,
      country: "SE",
      description_sv: null,
      description_en: null,
    },
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "sakerhetschef-uppsala",
    title_sv: "Säkerhetschef",
    title_en: "Head of security",
    location_text: null,
    country: "SE",
    city: "Uppsala",
    region: null,
    workplace_type: "hybrid",
    employment_type: "full_time",
    experience_level: null,
    family_id: null,
    profession_slug: null,
    application_method: "external",
    application_url: "https://example.test/apply",
    application_email: null,
    published_at: "2026-09-22T08:00:00Z",
    deadline_at: null,
    employer_id: "00000000-0000-4000-8000-0000000000e2",
    employer: null,
  },
];

function renderWith(lang: Lang, jobs: unknown[] | null): string {
  const client = new QueryClient();
  if (jobs) client.setQueryData(["home-latest-jobs"], jobs);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <I18nProvider initialLang={lang}>
        <Page />
      </I18nProvider>
    </QueryClientProvider>,
  );
}
const render = (lang: Lang) => renderWith(lang, JOBS);
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

const d = (lang: Lang) => dictionaries[lang] as Record<string, string>;

console.log("public-homepage-check");

const ORDER = [
  "hero",
  "for-dig",
  "senaste-jobben",
  "for-arbetsgivare",
  "rekryteringstjanster",
  "varfor",
] as const;

/* T1 ---------------------------------------------------------------- */
group("T1 · main carries exactly six sections, in the locked order");
{
  const ids = [...svMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1]);
  ck(`the six ids are ${ORDER.join(", ")}`, JSON.stringify(ids) === JSON.stringify(ORDER), ids);
  ck(
    "no seventh top-level section",
    (svMain.match(/<section\b/g) ?? []).length === ORDER.length,
    (svMain.match(/<section\b/g) ?? []).length,
  );
  ck("one main landmark", html.sv.split("<main").length - 1 === 1);
  ck("the route's whole body is the six sections", /^\s*<section id="hero"/.test(svMain));
  // No product is explained in depth here any more: each has its own page.
  for (const retired of ["security-intelligence", "passport", "career", "get-started", "faq"]) {
    ck(`the retired section #${retired} is gone`, !svMain.includes(`id="${retired}"`));
  }
  // An old link into a retired section keeps working: it is forwarded to
  // the page that holds that content now.
  const { RETIRED_HOME_ANCHORS } = await import("../src/components/site/legacy-home-anchors");
  ck(
    "the homepage forwards its retired anchors",
    routeCode.includes("useRetiredHomeAnchors()") &&
      RETIRED_HOME_ANCHORS.passport.to === "/security-passport" &&
      RETIRED_HOME_ANCHORS["security-intelligence"].to === "/sakerhetsarbete" &&
      RETIRED_HOME_ANCHORS.career.to === "/career-center",
  );
  ck(
    "no retired anchor is forwarded to a section that still exists under its old name",
    Object.keys(RETIRED_HOME_ANCHORS).every((id) => !svMain.includes(`id="${id}"`)),
  );
  ck(
    "the Passport example card is not on the homepage — it lives on /security-passport",
    !svMain.includes("data-home-passport-preview") && !pageCode.includes("HomePassportPreview"),
  );
}

/* T2 ---------------------------------------------------------------- */
group("T2 · the hero: the locked headline, the positioning, two equal entrances");
{
  const SPEC: Record<Lang, Record<string, string>> = {
    sv: {
      // Locked owner decision, 2026-10-03: the visitor's own headline is the
      // H1; the English brand statement sits below the entrances as a slogan.
      "home.hero.title": "Din karriär, din kompetens, ditt säkerhetsarbete.",
      "home.hero.individual.title": "För dig i säkerhetsbranschen",
      "home.hero.employer.title": "För arbetsgivare",
    },
    en: {
      "home.hero.title": "Your career, your expertise, your security work.",
      "home.hero.individual.title": "For security professionals",
      "home.hero.employer.title": "For employers",
    },
  };
  for (const lang of LANGS) {
    for (const [key, expected] of Object.entries(SPEC[lang])) {
      ck(`${lang} "${key}" is the locked copy`, d(lang)[key] === expected, d(lang)[key]);
    }
    const hero = sectionOf(mainOfLang[lang], "hero");
    const heroCopy = await copyText(hero);
    ck(
      `${lang}: the h1 is the locked headline`,
      headings(hero, "h1")[0] === SPEC[lang]["home.hero.title"],
    );
    ck(
      `${lang}: the slogan is the English brand statement, marked lang="en"`,
      /<p[^>]*lang="en"[^>]*>\s*Security careers, without limits\.\s*<\/p>/.test(hero),
    );
    ck(`${lang}: the hero is centred`, /<section id="hero"[\s\S]*?text-center/.test(hero));
    // The positioning is two sentences, one per audience (brand story,
    // 2026-09-30) -- never a paragraph.
    ck(
      `${lang}: the positioning is rendered, in at most two sentences`,
      heroCopy.includes(d(lang)["home.hero.subtitle"]) &&
        (d(lang)["home.hero.subtitle"].match(/[.!?](\s|$)/g) ?? []).length <= 2,
      d(lang)["home.hero.subtitle"],
    );
    // It speaks to BOTH audiences (owner review, point 3), and says the
    // ambition is local OR international without claiming current scale.
    ck(
      `${lang}: the positioning addresses individuals and employers, locally or internationally`,
      lang === "sv"
        ? /Jobb, kompetens, Security Passport/.test(d(lang)["home.hero.subtitle"]) &&
            /Rekryteringsverktyg för arbetsgivare/.test(d(lang)["home.hero.subtitle"])
        : /Jobs, expertise, Security Passport/.test(d(lang)["home.hero.subtitle"]) &&
            /Recruitment tools for employers/.test(d(lang)["home.hero.subtitle"]),
      d(lang)["home.hero.subtitle"],
    );
    const entrances = anchorsOf(hero);
    ck(
      `${lang}: exactly two hero actions — the two audience entrances`,
      entrances.length === 2 &&
        entrances.every((a) => /data-home-audience="(individual|employer)"/.test(a)),
      entrances,
    );
    ck(
      `${lang}: each entrance jumps to its audience's own section`,
      JSON.stringify(hrefsOf(hero)) === JSON.stringify(["#for-dig", "#for-arbetsgivare"]),
      hrefsOf(hero),
    );
    ck(
      `${lang}: the two entrances are EQUAL — one class`,
      new Set(entrances.map(classOf)).size === 1,
    );
    ck(`${lang}: no solid action in the hero`, entrances.filter(isSolid).length === 0);
  }
}

/* T3 ---------------------------------------------------------------- */
group("T3 · one h1, the five h2 in order, h3 only on cards and steps");
{
  for (const lang of LANGS) {
    const m = mainOfLang[lang];
    ck(`${lang}: exactly one h1`, headings(m, "h1").length === 1, headings(m, "h1"));
    const H2 = [
      "home.individual.title",
      "home.jobs.title",
      "home.employers.title",
      "home.services.title",
      "home.why.title",
    ].map((k) => d(lang)[k]);
    ck(
      `${lang}: the five h2, in order`,
      JSON.stringify(headings(m, "h2")) === JSON.stringify(H2),
      headings(m, "h2"),
    );
    for (const id of ORDER.slice(1)) {
      ck(
        `${lang}: #${id} is headed by exactly one h2`,
        headings(sectionOf(m, id), "h2").length === 1,
      );
    }
    // h3: the four entry cards, the vacancies, the five steps, the three
    // services — nothing else.
    const expectedH3 = 4 + JOBS.length + 5 + 3;
    ck(
      `${lang}: ${expectedH3} h3 — four entries, ${JOBS.length} vacancies, five steps, three services`,
      headings(m, "h3").length === expectedH3,
      headings(m, "h3"),
    );
  }
}

/* T4 ---------------------------------------------------------------- */
group("T4 · four equal entries, one action each, to each area's own page");
{
  const EXPECTED = [
    ["career", "/career-center"],
    ["jobs", "/jobs"],
    ["passport", "/security-passport"],
    ["work", "/sakerhetsarbete"],
  ] as const;
  for (const lang of LANGS) {
    const section = sectionOf(mainOfLang[lang], "for-dig");
    const cards = [
      ...section.matchAll(/<article\b[^>]*data-home-entry="([a-z]+)"[^>]*>([\s\S]*?)<\/article>/g),
    ].map((m) => ({ key: m[1], html: m[0] }));
    ck(
      `${lang}: Karriär, Jobb, Security Passport, Säkerhetsarbete — in that order`,
      JSON.stringify(cards.map((c) => c.key)) === JSON.stringify(EXPECTED.map((e) => e[0])),
      cards.map((c) => c.key),
    );
    for (const [key, to] of EXPECTED) {
      const card = cards.find((c) => c.key === key);
      ck(
        `${lang}: the ${key} card has ONE action, to ${to}`,
        Boolean(card) && JSON.stringify(hrefsOf(card!.html)) === JSON.stringify([to]),
        card && hrefsOf(card.html),
      );
      ck(
        `${lang}: the ${key} card renders its title, body and action`,
        Boolean(card) &&
          ["title", "body", "cta"].every((f) =>
            fullText(card!.html).includes(d(lang)[`home.individual.${key}.${f}`]),
          ),
      );
    }
    ck(
      `${lang}: the four are EQUALS — one card class`,
      new Set(cards.map((c) => c.html.match(/^<article\b[^>]*class="([^"]*)"/)?.[1])).size === 1,
    );
    ck(
      `${lang}: no solid call to action among them`,
      anchorsOf(section).filter(isSolid).length === 0,
    );
    // Säkerhetsarbete is its own area, not a fifth career step, and the
    // signed-out page never links straight into an authenticated product.
    ck(
      `${lang}: no card links an authenticated product directly`,
      !hrefsOf(section).some((h) => /^\/(passport|security-work|my-career)/.test(h)),
    );
  }
}

/* T5 ---------------------------------------------------------------- */
group("T5 · every account action is canonical and safe");
{
  ck(
    "the Passport's public page declares the Passport intent once, as a constant",
    /const PASSPORT_INTENT = \{ redirect: "\/passport" \} as const;/.test(
      code(read("src/routes/security-passport.index.tsx")),
    ),
  );
  ck(
    "safeReturnPath accepts the Passport landing",
    safeReturnPath("/passport", "/my-career") === "/passport",
  );
  ck("the landing is not an auth surface (that would loop)", !AUTH_SURFACES.includes("/passport"));
  ck(
    "the landing is a real route",
    existsSync(path.join(root, "src/routes/_authenticated.passport.index.tsx")),
  );
  ck("the homepage links no alias path", !svMain.includes('href="/discovery'));
  ck(
    "the homepage links the career analysis only through the Career page",
    !pageCode.includes(CANONICAL_ASSESSMENT_PATH) &&
      !svMain.includes("/security-career-assessment"),
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
group("T6 · the latest jobs: real vacancies, each opening its own advert");
{
  ck(
    "the section reads the SAME public query the jobs page lists",
    /listPublicJobs\(\{ limit: LATEST_JOB_COUNT \}\)/.test(sectionsCode) &&
      /const LATEST_JOB_COUNT = 4;/.test(sectionsCode),
  );
  ck(
    "and only while the jobs release is open",
    /enabled: open/.test(sectionsCode) && /jobsEnabled\(\)/.test(sectionsCode),
  );
  ck("no vacancy is hard-coded into the page", !/title_sv:\s*"/.test(sectionsCode));
  for (const lang of LANGS) {
    const section = sectionOf(mainOfLang[lang], "senaste-jobben");
    const cards = [...section.matchAll(/<a\b[^>]*data-home-job="([^"]+)"[^>]*>/g)];
    ck(`${lang}: each vacancy renders as one card`, cards.length === JOBS.length, cards.length);
    for (const job of JOBS) {
      ck(
        `${lang}: "${job.slug}" opens its own advert page`,
        hrefsOf(section).includes(`/jobs/${job.slug}`),
      );
    }
    ck(
      `${lang}: "Se alla lediga jobb" leads to /jobs`,
      hrefsOf(section).filter((h) => h === "/jobs").length >= 1 &&
        fullText(section).includes(d(lang)["home.jobs.all"]),
    );
    ck(
      `${lang}: each card says "${d(lang)["jobs.card.read"]}"`,
      fullText(section).split(d(lang)["jobs.card.read"]).length - 1 === JOBS.length,
    );
    // An empty market says so, rather than showing invented jobs.
    const empty = sectionOf(mainOf(renderWith(lang, [])), "senaste-jobben");
    ck(
      `${lang}: an empty market says there are no published jobs`,
      empty.includes("data-home-jobs-empty") &&
        fullText(empty).includes(d(lang)["home.jobs.empty"]) &&
        !empty.includes("data-home-job="),
    );
  }
  // With the jobs release closed, nothing is fetched and nothing is linked
  // as if it were open: the section says there are no published jobs.
  process.env.VITE_JOBS_ENABLED = "false";
  const closed = sectionOf(mainOf(renderWith("sv", JOBS)), "senaste-jobben");
  process.env.VITE_JOBS_ENABLED = "true";
  ck(
    "with the jobs release closed, no vacancy is shown",
    !closed.includes("data-home-job=") && closed.includes("data-home-jobs-empty"),
  );
}

/* T7 ---------------------------------------------------------------- */
group("T7 · the employer band: the locked journey, and the flag that fails closed");
{
  const band = sectionOf(svMain, "for-arbetsgivare");
  ck("the band renders", band.length > 0);
  ck(
    "it carries /signup?redirect=/employer",
    band.includes('href="/signup?redirect=%2Femployer"'),
    band.match(/href="[^"]*"/g),
  );
  ck("and it links the employer page", band.includes('href="/employers"'));
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
  for (const banned of ["user_metadata", "employer_memberships", "role:", "is_platform_admin"]) {
    ck(`the homepage never touches "${banned}"`, !pageCode.includes(banned));
  }
  const employerRoute = code(read("src/routes/_authenticated.employer.index.tsx"));
  ck(
    "/employer resolves membership server-side on arrival",
    employerRoute.includes("listMyEmployerWorkspaces") || employerRoute.includes("useServerFn"),
  );
  // ── THE RELEASE FLAG ──────────────────────────────────────────────
  ck("the route reads employerPortalEnabled()", routeCode.includes("employerPortalEnabled()"));
  process.env.VITE_EMPLOYER_PORTAL_ENABLED = "false";
  const closedBand = sectionOf(mainOf(renderWith("sv", JOBS)), "for-arbetsgivare");
  process.env.VITE_EMPLOYER_PORTAL_ENABLED = "true";
  ck(
    "rendered with the portal off, the band offers no registration",
    !hrefsOf(closedBand).some((h) => h.startsWith("/signup") || h.startsWith("/login")) &&
      hrefsOf(closedBand).includes("/employers"),
    hrefsOf(closedBand),
  );
  const flag = read("src/lib/job-intelligence/feature-flag.ts");
  ck(
    "the flag fails closed — an unset variable is not enabled",
    flag.includes('String(raw).toLowerCase() === "true"'),
  );
  // ── THE LOCKED JOURNEY, BENEFIT FIRST ─────────────────────────────
  const LOCKED: Record<Lang, readonly string[]> = {
    sv: ["Annonsera", "Ta emot och hantera", "Bedöm", "Intervjua", "Besluta"],
    en: ["Advertise", "Receive and manage", "Assess", "Interview", "Decide"],
  };
  for (const lang of LANGS) {
    const b = sectionOf(mainOfLang[lang], "for-arbetsgivare");
    const list = b.match(/<ol\b[\s\S]*?<\/ol>/)?.[0] ?? "";
    ck(`${lang}: the journey is an ordered list`, list.length > 0);
    ck(
      `${lang}: ${LOCKED[lang].join(" → ")}`,
      JSON.stringify(headings(list, "h3")) === JSON.stringify(LOCKED[lang]),
      headings(list, "h3"),
    );
    ck(
      `${lang}: the last step is the employer's own decision`,
      lang === "sv"
        ? /^Ni fattar beslutet/.test(d(lang)["home.employers.step.decide.body"])
        : /^You make the decision/.test(d(lang)["home.employers.step.decide.body"]),
      d(lang)["home.employers.step.decide.body"],
    );
    ck(
      `${lang}: the structured interview is named before its tool`,
      lang === "sv"
        ? /strukturerade intervjuer med stöd av Interview Intelligence/.test(
            d(lang)["home.employers.step.interview.body"],
          )
        : /structured interviews supported by Interview Intelligence/.test(
            d(lang)["home.employers.step.interview.body"],
          ),
      d(lang)["home.employers.step.interview.body"],
    );
  }
  ck(
    'sv: "ta emot ansökningar", never "samla ansökningar"',
    !Object.values(d("sv")).some((v) => /samla ansökningar/i.test(v)),
  );
}

/* T8 ---------------------------------------------------------------- */
group("T8 · every link on the page is an existing canonical route");
{
  const ROUTES: Record<string, string> = {
    "/signup": "src/routes/signup.tsx",
    "/login": "src/routes/login.tsx",
    "/career-center": "src/routes/career-center.index.tsx",
    "/employers": "src/routes/employers.tsx",
    "/jobs": "src/routes/jobs.index.tsx",
    "/about": "src/routes/about.tsx",
    "/contact": "src/routes/contact.tsx",
    "/security-passport": "src/routes/security-passport.index.tsx",
    "/sakerhetsarbete": "src/routes/sakerhetsarbete.tsx",
    "/feedback": "src/routes/_authenticated.feedback.tsx",
    // Signed-in destinations the chrome offers a signed-in reader, from the
    // same scan.
    "/academy": "src/routes/_authenticated.academy.index.tsx",
    "/security-work": "src/routes/_authenticated.security-work.index.tsx",
    "/passport": "src/routes/_authenticated.passport.index.tsx",
    "/my-career": "src/routes/_authenticated.my-career.index.tsx",
    "/my-career/profile": "src/routes/_authenticated.my-career.profile.tsx",
    "/reviews": "src/routes/_authenticated.reviews.tsx",
    "/employer/pending": "src/routes/_authenticated.employer.pending.tsx",
  };
  const LANDINGS: Record<string, string> = {
    "/employer": "src/routes/_authenticated.employer.index.tsx",
  };
  const linked = new Set(
    [
      ...[
        ...`${svMain}${headerCode}${footerCode}${sectionsCode}`.matchAll(
          /href="([^"#?]+)|to="([^"]+)"|to: "([^"]+)"/g,
        ),
      ].map((m) => m[1] ?? m[2] ?? m[3]),
      ...[false, true].flatMap((signedIn) => publicNav(signedIn).map((i) => i.to)),
    ].filter((h) => h && h.startsWith("/") && !h.includes("$") && !/^\/jobs\/[^/]+$/.test(h)),
  );
  for (const lang of LANGS) {
    ck(
      `${lang}: the signed-out page links no /security-work or /passport route directly`,
      !hrefsOf(mainOfLang[lang]).some((href) => /^\/(security-work|passport)/.test(href)),
    );
  }
  for (const href of linked) {
    if (href === "/") continue;
    const file = ROUTES[href];
    ck(`${href} is a known canonical route`, Boolean(file), href);
    if (file) ck(`  backed by ${file}`, existsSync(path.join(root, file)));
  }
  ck(
    "no unknown route is linked from this page",
    [...linked].every((h) => h === "/" || h in ROUTES),
    [...linked].filter((h) => h !== "/" && !(h in ROUTES)),
  );
  const usedLandings = new Set(
    hrefsOf(svMain)
      .map((h) => h.match(/^\/signup\?redirect=(.+)$/)?.[1])
      .filter((v): v is string => Boolean(v))
      .map((v) => decodeURIComponent(v)),
  );
  ck(
    "the page hands exactly one landing to the one door — the employer's",
    JSON.stringify([...usedLandings]) === JSON.stringify(["/employer"]),
    [...usedLandings],
  );
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
}

/* T9 ---------------------------------------------------------------- */
group("T9 · the recruitment services band, and its one working contact action");
{
  for (const lang of LANGS) {
    const band = sectionOf(mainOfLang[lang], "rekryteringstjanster");
    ck(
      `${lang}: "${d(lang)["home.services.title"]}"`,
      headings(band, "h2")[0] === d(lang)["home.services.title"],
    );
    ck(
      `${lang}: Rekrytering, Executive Search, Interim och konsulter`,
      JSON.stringify(headings(band, "h3")) ===
        JSON.stringify(
          ["recruitment", "executive", "interim"].map((k) => d(lang)[`home.services.${k}.title`]),
        ),
      headings(band, "h3"),
    );
    ck(
      `${lang}: ONE action, to the contact page`,
      JSON.stringify(hrefsOf(band)) === JSON.stringify(["/contact"]),
      hrefsOf(band),
    );
  }
  const contact = code(read("src/routes/contact.tsx"));
  ck(
    "the contact page sends through the server — never a form that discards what you type",
    contact.includes("sendRecruitmentEnquiry") && contact.includes("useServerFn"),
  );
  ck(
    "and says it is closed when mail is not configured",
    contact.includes("getRecruitmentEnquiryAvailability") &&
      contact.includes("data-contact-closed"),
  );
  const sender = code(read("src/lib/email/send-recruitment-enquiry-email.server.ts"));
  const emailFn = code(read("supabase/functions/transactional-email/index.ts"));
  ck(
    "the enquiry uses the one product-mail transport — no key in the app, no new service",
    sender.includes("sendTransactionalEmail(") &&
      !/process\.env\.RESEND_|api\.resend\.com/.test(sender) &&
      emailFn.includes('Deno.env.get("RESEND_API_KEY")') &&
      emailFn.includes("https://api.resend.com/emails"),
  );
  ck(
    "the recipient is decided by the e-mail function, never the request; the enquirer is only the Reply-To",
    /kind: "contact_enquiry",\s*replyTo: enquiry\.email,/.test(sender) &&
      /contact_enquiry: \{ to: "admin", replyTo: "caller" \}/.test(emailFn) &&
      /const ADMIN_INBOX = "info@cqrityjob\.com";/.test(emailFn),
  );
  ck(
    "nothing is stored — the enquiry path writes no table",
    !/\.from\(|\.insert\(|\.rpc\(/.test(
      code(read("src/lib/contact/recruitment-enquiry.functions.ts")) + sender,
    ),
  );
  const throttle = code(read("src/lib/contact/enquiry-throttle.server.ts"));
  const throttleRpcs = [...throttle.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]);
  ck(
    "the durable abuse limit calls only the shared throttle and stores hashed keys, never the enquiry",
    JSON.stringify(throttleRpcs) === JSON.stringify(["sp_throttle_public_access"]) &&
      !/\.from\(|\.insert\(/.test(throttle) &&
      throttle.includes('createHash("sha256")'),
    throttleRpcs,
  );
  ck(
    "every enquiry passes the durable limit before anything is sent",
    /takeEnquiryAllowance\([\s\S]*?\)[\s\S]*?sendRecruitmentEnquiryEmail\(data\)/.test(
      code(read("src/lib/contact/recruitment-enquiry.functions.ts")),
    ),
  );
  ck(
    "the acknowledgement goes only to the validated sender, replies go to CQrityjob's inbox, and it follows a sent enquiry",
    /kind: "contact_acknowledgement",\s*to: enquiry\.email,/.test(sender) &&
      /contact_acknowledgement: \{ to: "caller", replyTo: "admin" \}/.test(emailFn) &&
      /status === "sent"\) \{[\s\S]*?sendEnquiryAcknowledgementEmail\(data\)/.test(
        code(read("src/lib/contact/recruitment-enquiry.functions.ts")),
      ),
  );
}

/* T10 --------------------------------------------------------------- */
group("T10 · Varför CQrityjob — concise, ending in the brand line");
{
  for (const lang of LANGS) {
    const why = sectionOf(mainOfLang[lang], "varfor");
    ck(
      `${lang}: "Where trust comes first." is rendered, in English, in both languages`,
      d(lang)["brand.slogan"] === "Where trust comes first." &&
        /<p[^>]*lang="en"[^>]*>Where trust comes first\.<\/p>/.test(why),
    );
    ck(
      `${lang}: it links on to /about`,
      JSON.stringify(hrefsOf(why)) === JSON.stringify(["/about"]),
    );
    ck(
      `${lang}: it is about the company, not a founder CV`,
      !/Mostafa|Alshawi|polis|police/i.test(fullText(why)),
    );
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
  const shape = (signedIn: boolean) => publicNav(signedIn).map((i) => i.to);
  ck(
    "the locked six public destinations, each area's own page",
    JSON.stringify(shape(false)) ===
      JSON.stringify([
        "/career-center",
        "/jobs",
        "/security-passport",
        "/sakerhetsarbete",
        "/employers",
        "/about",
      ]),
    shape(false),
  );
  ck(
    "a signed-in reader's product entries open the products themselves",
    JSON.stringify(shape(true).slice(2, 4)) === JSON.stringify(["/passport", "/security-work"]),
    shape(true),
  );
  ck(
    "the header renders them from the one definition",
    headerCode.includes("const nav = publicNav(signedIn === true)"),
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
  // The contact path sends now (T9), so the footer may offer it.
  ck(
    "the footer's contact link opens the working enquiry form",
    !footerCode.includes('"/contact"') ||
      code(read("src/routes/contact.tsx")).includes("sendRecruitmentEnquiry"),
  );
  // The terms and the privacy policy are published (owner, 2026-10-03):
  // the legal row links both and names the contact address.
  ck(
    "the legal row links the terms of use and the privacy policy",
    footerCode.includes("<Link to={TERMS_PATH}") &&
      footerCode.includes("<Link to={PRIVACY_PATH}") &&
      footerCode.includes('{t("footer.terms")}') &&
      footerCode.includes('{t("footer.privacy")}'),
  );
  ck(
    "the legal row names info@ as the contact address",
    footerCode.includes("href={`mailto:${CONTACT_EMAIL}`}") &&
      read("src/lib/site-contact.ts").includes(
        'export const CONTACT_EMAIL = "info@cqrityjob.com";',
      ),
  );
  ck(
    "the not-published line is gone",
    !footerCode.includes("footer.legal.notice") &&
      !("footer.legal.notice" in d("sv")) &&
      !("footer.legal.notice" in d("en")),
  );
  for (const [lang, terms, privacy] of [
    ["sv", "Användarvillkor", "Integritetspolicy"],
    ["en", "Terms of use", "Privacy policy"],
  ] as const) {
    ck(
      `${lang} legal link names`,
      d(lang)["footer.terms"] === terms && d(lang)["footer.privacy"] === privacy,
    );
  }
  for (const route of ["src/routes/villkor.tsx", "src/routes/integritetspolicy.tsx"]) {
    ck(
      `${route} exists and renders the owner's document`,
      code(read(route)).includes("<LegalDocumentView"),
    );
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
  // Product names (and the locked brand statements below) are the same in
  // both. Nothing else may be — an untouched
  // English string is an untranslated one. Each exception is PROVEN to be a
  // product name rather than trusted to be one: it must equal, in both
  // languages, the name the product itself carries elsewhere. A sentence
  // cannot hide in this list, because no product is named with a sentence.
  const PRODUCT_NAMES: Record<string, string> = {
    "home.markets.eyebrow": "nav.securityPassport",
    "home.individual.passport.title": "nav.securityPassport",
    "home.services.executive.title": "nav.forEmployers.recruitment",
  };
  // The locked brand statement (owner decision, 2026-10-03: the H1 is the
  // visitor's own headline; the English statement is the slogan below the
  // entrances) is English in both languages, like "brand.slogan". It is
  // PROVEN by its exact, approved wording, so no other sentence can join it
  // untranslated.
  const BRAND_STATEMENTS: Record<string, string> = {
    "home.hero.slogan": "Security careers, without limits.",
  };
  for (const [key, locked] of Object.entries(BRAND_STATEMENTS)) {
    for (const lang of LANGS) {
      ck(`${lang} "${key}" is the locked brand statement`, d(lang)[key] === locked, d(lang)[key]);
    }
  }
  const SAME_IN_BOTH = new Set<string>([
    ...Object.keys(PRODUCT_NAMES),
    ...Object.keys(BRAND_STATEMENTS),
  ]);
  for (const [key, nameKey] of Object.entries(PRODUCT_NAMES)) {
    for (const lang of LANGS) {
      ck(
        `${lang} "${key}" is the product name "${nameKey}"`,
        typeof d(lang)[nameKey] === "string" &&
          (d(lang)[key] === d(lang)[nameKey] || d(lang)[nameKey].includes(d(lang)[key])),
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
  // The sentences that must be there now live on each product's own page,
  // and T16 renders those pages to assert them.
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
  //    #senaste-jobben is sized for four vacancies, the most it shows.
  const BUDGET: Record<string, number> = {
    // Brand story, 2026-09-30: the positioning names both audiences.
    hero: 80,
    "for-dig": 100,
    "senaste-jobben": 75,
    "for-arbetsgivare": 110,
    rekryteringstjanster: 60,
    varfor: 75,
  };
  const TOTAL_CEILING = 450;
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
group("T16 · the products' own pages keep the safety sentences");
{
  const renderRoute = async (file: string, lang: Lang) => {
    const mod = (await import(`../${file}`)) as { Route: { component: () => React.ReactElement } };
    const C = mod.Route.component;
    return mainOf(
      renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
          <I18nProvider initialLang={lang}>
            <C />
          </I18nProvider>
        </QueryClientProvider>,
      ),
    );
  };

  // ── SECURITY PASSPORT (/security-passport) ────────────────────────
  // Certifications, licences and authorisations -- education and employment
  // history are the CV's -- an upload is not a verification, sharing is the
  // holder's, and the disclaimer is the owner-approved sentence, verbatim.
  const DISCLAIMER: Record<Lang, string> = {
    sv: "Security Passport hjälper dig att strukturera och dela information. Det ersätter inte en myndighetslicens, säkerhetsprövning, rätt att arbeta eller arbetsgivarens egna kontroller.",
    en: "Security Passport helps you structure and share information. It does not replace a government licence, security vetting, right-to-work check or an employer's own due diligence.",
  };
  for (const lang of LANGS) {
    const page = await renderRoute("src/routes/security-passport.index.tsx", lang);
    const copy = await copyText(page);
    ck(
      `${lang}: /security-passport renders the approved disclaimer verbatim`,
      d(lang)["passportPage.disclaimer"] === DISCLAIMER[lang] && copy.includes(DISCLAIMER[lang]),
      d(lang)["passportPage.disclaimer"],
    );
    ck(
      `${lang}: a credential is valid where it was issued — never elsewhere by being in the Passport`,
      copy.includes(d(lang)["passportPage.jurisdiction"]),
    );
    ck(
      `${lang}: applying for a job shares nothing by itself`,
      lang === "sv"
        ? /En jobbansökan delar inte ditt Security Passport automatiskt\./.test(copy)
        : /Applying for a job does not automatically share your Security Passport\./.test(copy),
    );
    ck(
      `${lang}: the four status levels are named, weakest first`,
      JSON.stringify([...page.matchAll(/data-passport-status="([a-zA-Z]+)"/g)].map((m) => m[1])) ===
        JSON.stringify(["selfDeclared", "documentProvided", "documented", "sourceConfirmed"]),
    );
    ck(
      `${lang}: a read document is not a verified credential`,
      copy.includes(d(lang)["passportPage.hayat.note"]) &&
        copy.includes(d(lang)["passportPage.status.documentProvided.body"]),
    );
    // Release gate B is not met: HAYAT reads, it does not verify.
    ck(
      `${lang}: HAYAT is described as a reader, not a verifier`,
      !/HAYAT (verifierar|bekräftar|kontrollerar mot)|HAYAT (verifies|confirms|checks against)/i.test(
        copy,
      ),
    );
    ck(
      `${lang}: the example card is labelled as fictional`,
      page.includes("data-home-passport-example") &&
        copy.includes(d(lang)["home.passportPreview.exampleCaption"]),
    );
    ck(
      `${lang}: its one account action enters the one door with the Passport intent`,
      hrefsOf(page).filter((h) => h === "/signup?redirect=%2Fpassport").length >= 1 &&
        !hrefsOf(page).some((h) => h.startsWith("/signup") && h !== "/signup?redirect=%2Fpassport"),
    );
  }

  // ── SÄKERHETSARBETE (/sakerhetsarbete) ────────────────────────────
  // Release gate A is not met: the page says AI support is not activated,
  // and that the person decides. The information warning is contextual —
  // never the hero.
  for (const lang of LANGS) {
    const page = await renderRoute("src/routes/sakerhetsarbete.tsx", lang);
    const copy = await copyText(page);
    ck(
      `${lang}: /sakerhetsarbete says the AI support is not yet activated`,
      lang === "sv"
        ? /AI-stödet är (förberett men )?ännu inte aktiverat/.test(copy)
        : /AI assistance is (prepared but )?not yet activated/.test(copy),
    );
    ck(
      `${lang}: "AI helps you with the work. You are responsible for the decisions."`,
      lang === "sv"
        ? copy.includes("AI hjälper dig med arbetet. Du ansvarar för besluten.")
        : copy.includes("AI helps you with the work. You are responsible for the decisions."),
    );
    ck(
      `${lang}: the classified-information warning is on the page, but not in the hero`,
      copy.includes(d(lang)["securityWorkPage.privacy.body"]) &&
        !(await copyText(page.slice(0, page.indexOf("</section>")))).includes(
          d(lang)["securityWorkPage.privacy.body"],
        ),
    );
    ck(
      `${lang}: its account action enters the one door, landing in the workspace`,
      hrefsOf(page).includes("/signup?redirect=%2Fsecurity-work"),
    );
    ck(
      `${lang}: nothing promises autonomy, live monitoring or integrations`,
      !/automatisk (informationsinhämtning|bevakning)|automatic (collection|monitoring)|realtid|real[- ]time|autonom|autonomous/i.test(
        copy,
      ),
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
