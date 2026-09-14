// The public homepage — asserted against the RENDERED markup and the
// dictionaries, in both languages.
//
// ── WHAT THIS FILE NOW DEFENDS (2026-09-13) ────────────────────────────
//
// It used to assert the opposite architecture, out loud and in detail:
// "Security Passport is the product, it leads, and the Career Analysis is a
// SUPPORTING tool offered once, quietly, from section 3". That position is
// SUPERSEDED by the owner-approved public entry architecture, and a guard
// that still encoded it would be the single most effective way to prevent
// the new one from ever shipping. So the assertions below are rewritten
// rather than extended.
//
//   T1  main carries exactly four sections, in the settled order
//   T2  TWO PEER individual entry products render, in both languages, and
//       the superseded single-product page is gone from the markup
//   T3  exactly one h1, the settled h2 set, and a sane heading hierarchy
//   T4  the two entrances are PEERS — same card shape, same solid action,
//       and Career Discovery is not a quiet text link
//   T5  both primary destinations are canonical and safe, and the Passport
//       intent survives every account path the auth form supports
//   T6  Career Discovery's anonymous start and result claim are intact,
//       and this page adds no signup wall
//   T7  the employer strip: /employer intent, no role by metadata, and the
//       release flag still fails closed
//   T8  the connected lifecycle links only existing canonical routes
//   T9  the Passport market scale agrees with the governed overview, and
//       the owner-approved disclaimer is rendered verbatim
//   T10 the trust levels respect PR #189 — three levels, named and
//       separated, only source-confirmed reads as confirmed
//   T11 the signed-in redirect to /my-career is intact, and is the only
//       redirect implementation on the route
//   T12 the public chrome: five nav destinations, one Login, one Create
//       account, and the signed-in candidate nav is untouched
//   T13 sv and en carry the same keys, structure and destinations
//   T14 NO FORBIDDEN CLAIM was introduced — the data boundaries, as
//       strings a reader could actually meet
//   T15 the English page is English
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

// ── WHAT IS MOCKED, AND WHY IT IS ONLY THESE TWO THINGS ────────────────
//
// The router, because a RouterProvider renders empty under
// renderToStaticMarkup: `createFileRoute` is made to return its own options
// object, so `Route.component` is the REAL component this guard renders, and
// `Link` becomes an anchor whose href carries `to`, `search` and `hash` —
// which is what lets the destination assertions read the rendered markup
// rather than the source text.
//
// And SiteLayout, because SiteHeader pulls in TanStack Start's server-function
// machinery and three React Query subscriptions. Standing all of that up would
// mean this guard passed or failed on the health of the query client rather
// than on the homepage. The layout is replaced by the three landmarks it
// renders, so `<main>` still bounds the counts below.
//
// The chrome itself is NOT unasserted: T12 reads SiteHeader, SiteFooter and
// candidate-app-nav as source, and e2e/public-homepage.spec.ts renders and
// CLICKS the real ones in a browser.
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
      href += "?" + new URLSearchParams(search as Record<string, string>).toString();
    }
    if (hash) href += `#${String(hash)}`;
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => (options: Record<string, unknown>) => options,
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: "/", search: "", hash: "" }),
  useMatches: () => [],
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
const headerCode = code(read("src/components/site/SiteHeader.tsx"));
const footerSrc = read("src/components/site/SiteFooter.tsx");
const footerCode = code(footerSrc);

type Lang = "sv" | "en";
const LANGS: readonly Lang[] = ["sv", "en"];

const Page = (Route as { component: () => React.ReactElement }).component;
const html: Record<Lang, string> = {
  sv: renderToStaticMarkup(
    <I18nProvider initialLang="sv">
      <Page />
    </I18nProvider>,
  ),
  en: renderToStaticMarkup(
    <I18nProvider initialLang="en">
      <Page />
    </I18nProvider>,
  ),
};

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
const isSolid = (tag: string) =>
  (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).includes("bg-primary");
const wc = (s: string) => s.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length;

const d = (lang: Lang) => dictionaries[lang] as Record<string, string>;

console.log("public-homepage-check");

/* T1 ---------------------------------------------------------------- */
group("T1 · main carries exactly four sections, in the settled order");
{
  const ORDER = ["hero", "employers", "lifecycle", "passport"];
  const ids = [...svMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1]);
  ck(`the four ids are ${ORDER.join(", ")}`, JSON.stringify(ids) === JSON.stringify(ORDER), ids);
  ck(
    "no fifth top-level section",
    (svMain.match(/<section\b/g) ?? []).length === 4,
    (svMain.match(/<section\b/g) ?? []).length,
  );
  ck("one main landmark", html.sv.split("<main").length - 1 === 1);
  // The route renders its sections INTO SiteLayout's `<main>` and adds no
  // wrapper of its own — so a section added outside the layout, where the
  // counts above cannot see it, fails here.
  ck("the route's whole body is the four sections", /^\s*<section id="hero"/.test(svMain));
  // The employer strip is BELOW the two individual cards and outside the
  // hero, which is what "visually separate" means structurally.
  ck("the employer strip is its own section, after the hero", ids.indexOf("employers") === 1, ids);
}

/* T2 ---------------------------------------------------------------- */
group("T2 · two PEER individual entry products render, in both languages");
{
  const hero: Record<Lang, string> = {
    sv: sectionOf(svMain, "hero"),
    en: sectionOf(enMain, "hero"),
  };
  for (const lang of LANGS) {
    const heroCopy = await copyText(hero[lang]);
    for (const key of [
      "home.entry.passport.title",
      "home.entry.passport.body",
      "home.entry.discovery.title",
      "home.entry.discovery.body",
    ] as const) {
      ck(`${lang}: the hero renders "${key}"`, heroCopy.includes(d(lang)[key]), d(lang)[key]);
    }
    ck(`${lang}: the Passport action is rendered`, heroCopy.includes(d(lang)["cta.passport"]));
    ck(
      `${lang}: the Career Discovery action is rendered`,
      heroCopy.includes(d(lang)["cta.discovery"]),
    );
  }
  // The owner-approved card copy, verbatim, in both languages.
  const CARD_COPY: Record<Lang, Record<string, string>> = {
    sv: {
      "home.entry.passport.title": "Bygg ditt Security Passport",
      "home.entry.passport.body":
        "Samla erfarenhet, utbildning och certifieringar. Välj Sverige, Storbritannien eller Dubai och bestäm själv vad du delar.",
      "home.entry.discovery.title": "Upptäck din säkerhetskarriär",
      "home.entry.discovery.body":
        "Utforska din arbetsinriktning och få förklarade förslag på roller och karriärvägar inom säkerhet.",
      "cta.passport": "Skapa mitt Security Passport",
      "cta.discovery": "Starta Career Discovery",
      "home.hero.eyebrow": "Säkerhetskarriären samlad på ett ställe",
      "home.hero.title": "Bygg din framtid inom säkerhet",
    },
    en: {
      "home.entry.passport.title": "Build your Security Passport",
      "home.entry.passport.body":
        "Bring together experience, education and credentials. Choose Sweden, Great Britain or Dubai and control what you share.",
      "home.entry.discovery.title": "Discover your security career",
      "home.entry.discovery.body":
        "Explore your work orientation and receive explained suggestions for security roles and career paths.",
      "cta.passport": "Create my Security Passport",
      "cta.discovery": "Start Career Discovery",
      "home.hero.eyebrow": "Your security career in one place",
      "home.hero.title": "Build your future in security",
    },
  };
  for (const lang of LANGS) {
    for (const [key, expected] of Object.entries(CARD_COPY[lang])) {
      ck(`${lang} "${key}" is the approved copy`, d(lang)[key] === expected, d(lang)[key]);
    }
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
    "home.passport.title",
    "home.passport.body",
    "home.passport.callout",
    "home.passport.cta",
    "home.passport.use.cv",
    "home.mock.subtitle",
    "home.mock.cat.experience",
    "home.employers.cta",
    "home.employers.subtitle",
    "cta.howItWorks",
  ];
  for (const lang of LANGS) {
    for (const key of RETIRED) {
      ck(`${lang}: the retired key "${key}" is deleted`, !(key in dictionaries[lang]));
    }
  }
  ck("nothing still asks for one of them", !RETIRED.some((k) => routeCode.includes(`"${k}"`)));
}

/* T3 ---------------------------------------------------------------- */
group("T3 · one h1, the settled h2 set, and a sane hierarchy");
{
  for (const lang of LANGS) {
    const m = mainOfLang[lang];
    ck(`${lang}: exactly one h1`, headings(m, "h1").length === 1, headings(m, "h1"));
    // Five: the two peer entry cards, the employer strip, the lifecycle and
    // the Passport section. The two CARDS carry h2 deliberately — a heading
    // level is a weight, and a peer that sat one level lower would be a
    // sub-product of whatever came before it.
    ck(`${lang}: exactly five h2`, headings(m, "h2").length === 5, headings(m, "h2"));
    ck(
      `${lang}: h3 is the six lifecycle stages and nothing else`,
      headings(m, "h3").length === 6,
      headings(m, "h3"),
    );
  }
  ck(
    "sv h1",
    headings(svMain, "h1")[0] === "Bygg din framtid inom säkerhet",
    headings(svMain, "h1")[0],
  );
  ck(
    "en h1 says the same thing",
    headings(enMain, "h1")[0] === "Build your future in security",
    headings(enMain, "h1")[0],
  );
  // The two entry cards are the FIRST two h2s, in the settled order, in
  // both languages.
  for (const lang of LANGS) {
    const h2 = headings(mainOfLang[lang], "h2");
    ck(
      `${lang}: the first two h2 are the two entrances, Passport first`,
      h2[0] === d(lang)["home.entry.passport.title"] &&
        h2[1] === d(lang)["home.entry.discovery.title"],
      h2.slice(0, 2),
    );
  }
  // The hero's subtitle is the approved framing sentence, verbatim.
  ck(
    "sv subtitle",
    d("sv")["home.hero.subtitle"] ===
      "Samla dina meriter i ett Security Passport eller upptäck vilka säkerhetsroller som passar din riktning. Fortsätt sedan med karriärvägar, CV, jobb och utveckling i samma plattform.",
  );
  ck(
    "en subtitle",
    d("en")["home.hero.subtitle"] ===
      "Bring your credentials together in a Security Passport or discover which security roles fit your direction. Then continue with career paths, CV, jobs and development in the same platform.",
  );
}

/* T4 ---------------------------------------------------------------- */
group("T4 · the two entrances are PEERS, structurally");
{
  const hero = sectionOf(svMain, "hero");
  // ── SAME SHAPE ────────────────────────────────────────────────────
  //
  // Both cards come out of ONE component, so "equal size and equal visual
  // weight" cannot decay into two class lists that drift apart. Asserted on
  // the RENDERED class attributes: the two <article> elements in the hero
  // must be class-identical.
  const cards = [...hero.matchAll(/<article class="([^"]*)"/g)].map((m) => m[1]);
  ck("the hero holds exactly two entry cards", cards.length === 2, cards.length);
  ck("and they are class-identical", cards[0] === cards[1], cards);
  ck(
    "they come from one component, not two",
    (routeCode.match(/function EntryCard\(/g) ?? []).length === 1 &&
      (routeCode.match(/<EntryCard\b/g) ?? []).length === 2,
  );
  // ── SAME WEIGHT OF ACTION ─────────────────────────────────────────
  //
  // Two solid navy controls in the hero and exactly two: one per card.
  // Career Discovery may NOT be a text link, which is what it used to be.
  const heroAnchors = anchorsOf(hero);
  const solid = heroAnchors.filter(isSolid);
  ck("two solid controls in the hero", solid.length === 2, solid.length);
  ck(
    "the first is the Passport signup",
    solid[0]?.includes('href="/signup?redirect=%2Fpassport"'),
    solid[0],
  );
  ck(
    "the second is Career Discovery's canonical route",
    solid[1]?.includes(`href="${CANONICAL_ASSESSMENT_PATH}"`),
    solid[1],
  );
  ck(
    "the two actions wear the same classes",
    (solid[0]?.match(/class="([^"]*)"/)?.[1] ?? "a") ===
      (solid[1]?.match(/class="([^"]*)"/)?.[1] ?? "b"),
  );
  // Neither product is described as a prerequisite for the other.
  for (const lang of LANGS) {
    for (const rx of [
      /innan du kan|krävs för att|måste först/i,
      /before you can|required before|must first/i,
    ]) {
      ck(`${lang}: no prerequisite claim "${rx.source}"`, !rx.test(copyOf[lang]));
    }
  }
  // And the page does not collapse them into one data product.
  for (const lang of LANGS) {
    for (const rx of [
      /resultatet (blir|läggs) .{0,20}(merit|passport)/i,
      /result becomes .{0,20}(credential|passport)/i,
      /career discovery.{0,40}(kompetens|competence)/i,
    ]) {
      ck(`${lang}: the two products are not merged ("${rx.source}")`, !rx.test(copyOf[lang]));
    }
  }
}

/* T5 ---------------------------------------------------------------- */
group("T5 · both primary destinations are canonical and safe");
{
  const PASSPORT_LANDING = "/passport";
  ck(
    "the route declares the Passport intent once, as a constant",
    /const PASSPORT_INTENT = \{ redirect: "\/passport" \} as const;/.test(routeCode),
  );
  ck(
    "the Passport control renders /signup?redirect=/passport",
    svMain.includes('href="/signup?redirect=%2Fpassport"'),
    svMain.match(/href="\/signup[^"]*"/)?.[0],
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
    "the route uses the canonical constant rather than a literal",
    routeCode.includes("CANONICAL_ASSESSMENT_PATH") &&
      !routeCode.includes('"/security-career-assessment"'),
  );
  ck("and it is canonical", isCanonicalPath(CANONICAL_ASSESSMENT_PATH));
  ck("and it is not the alias", !isAliasPath(CANONICAL_ASSESSMENT_PATH));
  ck("the homepage links no alias path", !svMain.includes('href="/discovery'));
  ck(
    "the canonical route file exists",
    existsSync(path.join(root, "src/routes/security-career-assessment.tsx")),
  );

  // And the Passport intent survives every account path the form supports.
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
group("T6 · Career Discovery's anonymous start and claim are intact");
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
  // And the homepage says so, in the approved words, beside the action.
  ck(
    "sv disclosure is the approved sentence",
    d("sv")["home.entry.discovery.disclosure"] ===
      "Du kan börja utan konto. Skapa ett konto när du vill spara resultatet och fortsätta i My Career.",
    d("sv")["home.entry.discovery.disclosure"],
  );
  ck(
    "en disclosure is the approved sentence",
    d("en")["home.entry.discovery.disclosure"] ===
      "You can start without an account. Create one when you want to save the result and continue in My Career.",
    d("en")["home.entry.discovery.disclosure"],
  );
  for (const lang of LANGS) {
    ck(
      `${lang}: it is rendered inside the hero`,
      (await copyText(sectionOf(mainOfLang[lang], "hero"))).includes(
        d(lang)["home.entry.discovery.disclosure"],
      ),
    );
  }
  // No signup wall: the Career Discovery action goes to the product, not to
  // an account form.
  ck(
    "the Career Discovery action does not route through /signup",
    !anchorsOf(sectionOf(svMain, "hero"))
      .filter((a) => a.includes(">"))
      .some((a) => a.includes("/signup") && a.includes("assessment")),
  );
}

/* T7 ---------------------------------------------------------------- */
group("T7 · the employer strip, and the flag that still fails closed");
{
  const strip = sectionOf(svMain, "employers");
  ck("the strip renders", strip.length > 0);
  ck(
    "it carries /signup?redirect=/employer",
    strip.includes('href="/signup?redirect=%2Femployer"'),
    strip.match(/href="[^"]*"/g),
  );
  ck("and it links the employer information page", strip.includes('href="/employers"'));
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
  // The approved strip copy, verbatim.
  ck(
    "sv strip copy",
    d("sv")["home.employers.title"] === "Rekryterar du inom säkerhet?" &&
      d("sv")["home.employers.body"] ===
        "Publicera jobb, hantera kandidater och använd strukturerade tester och intervjuer i samma plattform.",
  );
  ck(
    "en strip copy",
    d("en")["home.employers.title"] === "Hiring in security?" &&
      d("en")["home.employers.body"] ===
        "Publish jobs, manage candidates and use structured assessments and interviews in one platform.",
  );
  for (const [lang, register, explore] of [
    ["sv", "Registrera företag", "Se företagsplattformen"],
    ["en", "Register company", "Explore the employer platform"],
  ] as const) {
    ck(`${lang} register label`, d(lang)["home.employers.cta.register"] === register);
    ck(`${lang} explore label`, d(lang)["home.employers.cta.explore"] === explore);
  }
}

/* T8 ---------------------------------------------------------------- */
group("T8 · the connected lifecycle links only canonical routes");
{
  const lifecycle = sectionOf(svMain, "lifecycle");
  const STAGES = ["Upptäck", "Förstå", "Utvecklas", "Visa", "Arbeta", "Fortsätt"];
  const EN_STAGES = ["Discover", "Understand", "Grow", "Trust", "Work", "Continue"];
  ck(
    "sv: the six stages, in order",
    JSON.stringify(headings(lifecycle, "h3").map((h) => h.replace(/^\d+\.\s*/, ""))) ===
      JSON.stringify(STAGES),
    headings(lifecycle, "h3"),
  );
  ck(
    "en: the six stages, in order",
    JSON.stringify(
      headings(sectionOf(enMain, "lifecycle"), "h3").map((h) => h.replace(/^\d+\.\s*/, "")),
    ) === JSON.stringify(EN_STAGES),
    headings(sectionOf(enMain, "lifecycle"), "h3"),
  );
  // An EXPLANATION, not six competing product cards: no solid action lives
  // inside this section.
  ck(
    "no solid call to action inside the lifecycle",
    anchorsOf(lifecycle).filter(isSolid).length === 0,
  );
  ck("it is an ordered list", lifecycle.includes("<ol"));
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
    // Header-only, signed-in entries the same scan sees.
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
    "/academy": "src/routes/_authenticated.academy.index.tsx",
  };
  const linked = new Set(
    [...`${svMain}${headerCode}${footerCode}`.matchAll(/href="([^"#?]+)|to="([^"]+)"/g)]
      .map((m) => m[1] ?? m[2])
      .filter((h) => h && h.startsWith("/") && !h.includes("$")),
  );
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
  // "Trust" points at this page's own Passport section, because the
  // Passport has no public page and a link onto a login wall is a dead end
  // wearing a product name.
  ck(
    "the lifecycle's Trust stage points at the on-page section",
    lifecycle.includes('href="/#passport"'),
  );
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
group("T9 · the Passport market scale, and the approved disclaimer");
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
  }
  // No fabricated credential record. The section is names and nothing else.
  ck(
    "the section carries no invented credential, holder or number",
    !/VU1|VU2|SIA|SIRA|ordningsvakt|licens(nummer)?\s*\d/i.test(passport),
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
  const navBlock = headerCode.slice(headerCode.indexOf("const nav = ["));
  const nav = navBlock.slice(0, navBlock.indexOf("] as const;"));
  const entries = [...nav.matchAll(/to:\s*(?:"([^"]+)"|(CANONICAL_ASSESSMENT_PATH))/g)].map(
    (m) => m[1] ?? CANONICAL_ASSESSMENT_PATH,
  );
  ck(
    "five primary nav destinations: audiences and topics, no product names",
    JSON.stringify(entries) ===
      JSON.stringify(["/", "/jobs", "/employers", "/career-center", "/about"]),
    entries,
  );
  ck(
    'the first entry is "För dig", the public candidate umbrella',
    nav.includes('t("nav.forYou")'),
  );
  ck(
    "and it points at the public landing page itself, with no hash and no second page",
    /\{ to: "\/", hash: undefined, label: t\("nav\.forYou"\) \}/.test(nav),
  );
  ck(
    "neither product is a public-header nav item any more",
    !nav.includes("nav.passportPublic") && !nav.includes("nav.careerDiscovery"),
  );
  ck(
    "the homepage entry is matched exactly and its section hash participates in active state",
    headerCode.includes(
      'activeOptions={{ exact: item.to === "/", includeHash: item.hash !== undefined }}',
    ),
  );
  ck('"Bedömningar" is out of the primary nav', !nav.includes("/assessment"));
  ck('"Kontakt" is out of the primary nav', !nav.includes("/contact"));
  for (const [lang, expected] of [
    ["sv", "Career Discovery"],
    ["en", "Career Discovery"],
  ] as const) {
    ck(`${lang} "nav.careerDiscovery"`, d(lang)["nav.careerDiscovery"] === expected);
  }

  // ── ONE LOGIN, ONE CREATE ACCOUNT, AND NEITHER NAMES A PRODUCT ────
  ck("the header offers /login", headerCode.includes('to="/login"'));
  ck("and one product-neutral account action", headerCode.includes('{t("nav.createAccount")}'));
  ck(
    "the chrome no longer carries a product-specific signup intent",
    !headerCode.includes('{ redirect: "/passport" } as never'),
  );
  ck(
    "exactly one account-creation control per viewport (desktop + compact)",
    (headerCode.match(/\{t\("nav\.createAccount"\)\}/g) ?? []).length === 2,
    (headerCode.match(/\{t\("nav\.createAccount"\)\}/g) ?? []).length,
  );

  // The footer mirrors the header's six, plus beta feedback.
  ck("the footer names Career Discovery too", footerCode.includes('t("nav.careerDiscovery")'));
  ck("the footer does not promote the contact form", !footerCode.includes('"/contact"'));
  ck("the footer leads with the Passport section", footerCode.includes('t("nav.passportPublic")'));
  ck(
    "the legal lines are rendered, and rendered as text",
    footerCode.includes('<span>{t("footer.legal.privacy")}</span>') &&
      footerCode.includes('<span>{t("footer.legal.terms")}</span>'),
  );
  ck(
    "no anchor wraps either legal line",
    !/<Link[^>]*>\s*\{t\("footer\.legal\.(privacy|terms)"\)\}/.test(footerSrc),
  );

  // ── THE SIGNED-IN CANDIDATE'S FIVE ITEMS ARE UNTOUCHED ────────────
  //
  // This PR changes the SIGNED-OUT navigation. A change that quietly
  // reshaped the workspace nav as well would be out of scope and would
  // break route highlighting, so the six are pinned here.
  ck(
    // Six since the owner's images 1 and 2 put the CV in the navigation.
    "the candidate workspace still has exactly six destinations",
    CANDIDATE_APP_NAV.length === 6,
    CANDIDATE_APP_NAV.length,
  );
  ck(
    "in the settled order",
    JSON.stringify(CANDIDATE_APP_NAV.map((i) => i.key)) ===
      JSON.stringify(["overview", "passport", "cv", "jobs", "career", "assessments"]),
    CANDIDATE_APP_NAV.map((i) => i.key),
  );
  // Career Discovery keeps lighting ONE workspace destination for a signed-in
  // candidate, which is what stops the public nav entry from changing
  // highlighting inside the workspace. That destination is now Karriär
  // rather than Min karriär: Career Discovery, the saved analysis and the
  // career journey are one career product, and Karriär is a real
  // destination now instead of a label with nowhere to point.
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
      .filter((k) => k.startsWith("home.") || k === "cta.passport" || k === "cta.discovery")
      .sort();
  ck(
    "the same keys exist in both languages",
    JSON.stringify(pageKeys("sv")) === JSON.stringify(pageKeys("en")),
    pageKeys("sv").filter((k) => !pageKeys("en").includes(k)),
  );
  // Product names are the same in both. Nothing else may be — an untouched
  // English string is an untranslated one.
  const SAME_IN_BOTH = new Set<string>(["home.markets.eyebrow"]);
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
  // English names the second product ONE way.
  ck('en copy says "Career Discovery"', /Career Discovery/.test(copyOf.en));
  for (const drift of [/career test/i, /career analysis/i, /skills test/i]) {
    ck(`en copy does not also say "${drift.source}"`, !drift.test(copyOf.en));
  }
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
      rule: "Career Discovery measures orientation, not competence",
      patterns: [
        /mäter din kompetens|mät din kompetens|kompetenstest/i,
        /measures? your competence|competence test/i,
        /karriärtest|career test/i,
        /\bkunskapsprov\b|\bexam\b/i,
      ],
    },
    {
      rule: "Career Discovery data is candidate-owned and never enters employer ranking",
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
  ];
  for (const lang of LANGS) {
    for (const { rule, patterns } of FORBIDDEN) {
      for (const rx of patterns) {
        ck(`${lang} · ${rule} — no "${rx.source}"`, !rx.test(copyOf[lang]));
      }
    }
  }
  // And the two sentences that must be there, not merely the absences.
  for (const lang of LANGS) {
    ck(
      `${lang}: the Passport disclaimer is rendered in full`,
      copyOf[lang].includes(d(lang)["home.markets.disclaimer"]),
    );
    ck(
      `${lang}: the anonymous-start disclosure is rendered in full`,
      copyOf[lang].includes(d(lang)["home.entry.discovery.disclosure"]),
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
    (k) => k.startsWith("home.") || k === "cta.passport" || k === "cta.discovery",
  );
  for (const [lang, other] of [
    ["en", "sv"],
    ["sv", "en"],
  ] as const) {
    // Every value this language legitimately renders, so a SHARED product
    // name is not reported as a leak. "Career Discovery" is the product's
    // name in Swedish too, and the English title of the Discover stage is
    // "Discover" -- a substring of it. Without this the guard would demand
    // that the Swedish page stop naming the product.
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
  // 3. No Swedish string literal is left anywhere in the route's own source.
  //    The document <title> is exempt: the whole site's SSR head is
  //    Swedish-first and is not per-language on any route.
  const literals = [...routeCode.matchAll(/"([^"\n]*[åäöÅÄÖ][^"\n]*)"/g)]
    .map((m) => m[1])
    .filter((v) => !v.startsWith("CQrityjob —"));
  ck("no Swedish string literal remains in the route", literals.length === 0, literals.join(" · "));
  // 4. The page's word count, so a rebuild cannot quietly become a brochure.
  //    A CEILING rather than a snapshot of today.
  for (const lang of LANGS) {
    ck(
      `${lang}: ${wc(seenOf[lang])} words rendered in total (ceiling 340)`,
      wc(seenOf[lang]) <= 340,
      wc(seenOf[lang]),
    );
    ck(
      `${lang}: hero subtitle <= 40 words`,
      wc(d(lang)["home.hero.subtitle"]) <= 40,
      wc(d(lang)["home.hero.subtitle"]),
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
