// The public homepage — asserted against the RENDERED markup and the
// dictionaries, in both languages.
//
//   T1  main carries exactly four sections, in the settled order
//   T2  the eight-section page's headings and claims are gone from the
//       markup, not hidden by CSS, and their keys are deleted
//   T3  exactly one h1, exactly three h2, and a sane heading hierarchy
//   T4  Security Passport is the product: it is what the h1 is about, it
//       is named in the hero, and the Career Analysis is not
//   T5  exactly ONE visually primary call to action, and it creates a
//       Security Passport
//   T6  that action carries the Passport intent through registration, to
//       a landing that explains the next step
//   T7  the Career Analysis is offered ONCE, quietly, from section 3, and
//       is never described as a test or as measuring anything
//   T8  the trust levels respect PR #189 — three levels, named and
//       separated, only source-confirmed reads as confirmed, no issuer
//       claim, no lifecycle state mixed in
//   T9  every destination is an existing canonical route
//   T10 the signed-in redirect to /my-career is intact, and is the only
//       redirect implementation on the route
//   T11 the public chrome: five nav items, two account actions, and
//       neither the header nor the footer promotes a dead destination
//   T12 sv and en carry the same keys, structure and meaning, and English
//       names the supporting tool one way
//   T13 the copy budget: <= 220 words inside main, excluding buttons and
//       the aria-hidden illustrations
//   T14 nothing on the page claims international recognition, or that the
//       Passport replaces a licence, permit, screening or due diligence
//   T15 the English page is ENGLISH — including the decorative product
//       illustrations, which aria-hidden removes from the accessibility
//       tree and does not remove from the screen
//
// The height, overflow, focus-ring, target-size and click-through halves of
// the brief are a property of a LAYOUT and cannot be read out of markup.
// They live in e2e/public-homepage.spec.ts, which drives the real route in
// a real browser.
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
// The chrome itself is NOT unasserted: T11 reads SiteHeader and SiteFooter
// as source, and e2e/public-homepage.spec.ts renders and CLICKS the real
// ones in a browser.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    hash,
    children,
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
 *  separately; the brief's counts are all "inside main". */
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

/** The page's COPY: rendered text with every aria-hidden subtree removed,
 *  so the decorative product illustrations do not count as prose. */
async function copyText(markup: string): Promise<string> {
  const out = await new HTMLRewriter()
    .on("[aria-hidden]", { element: (el) => el.remove() })
    .transform(new Response(`<body>${markup}</body>`))
    .text();
  return out
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Everything a person SEES, decoration included.
 *
 *  `copyText` above deliberately drops aria-hidden subtrees, because they
 *  are not prose and must not be measured as prose. That exclusion is also
 *  exactly how a Swedish product mock shipped inside the English homepage
 *  without one assertion noticing: aria-hidden removes a subtree from the
 *  ACCESSIBILITY TREE, not from the screen. Anything about what is
 *  RENDERED — above all whether the English page is in English — is
 *  asserted against this projection instead. */
function fullText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const svMain = mainOf(html.sv);
const enMain = mainOf(html.en);
const svCopy = await copyText(svMain);
const enCopy = await copyText(enMain);
const copyOf: Record<Lang, string> = { sv: svCopy, en: enCopy };
const seenOf: Record<Lang, string> = { sv: fullText(svMain), en: fullText(enMain) };

const headings = (markup: string, tag: "h1" | "h2" | "h3") =>
  [...markup.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) =>
    m[1]
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );

const wc = (s: string) => s.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length;

console.log("public-homepage-check");

/* T1 ---------------------------------------------------------------- */
group("T1 · main carries exactly four sections, in the settled order");
{
  const ORDER = ["hero", "how", "passport", "employers"];
  const ids = [...svMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1]);
  ck(`the four ids are ${ORDER.join(", ")}`, JSON.stringify(ids) === JSON.stringify(ORDER), ids);
  ck(
    "no fifth top-level section",
    (svMain.match(/<section\b/g) ?? []).length === 4,
    (svMain.match(/<section\b/g) ?? []).length,
  );
  ck("one main landmark", html.sv.split("<main").length - 1 === 1);
  // The route renders its four sections INTO SiteLayout's `<main>` and adds
  // no wrapper of its own — so a section added outside the layout, where the
  // counts above cannot see it, fails here.
  ck("the route's whole body is the four sections", /^\s*<section id="hero"/.test(svMain));
}

/* T2 ---------------------------------------------------------------- */
group("T2 · the removed sections and claims are absent from the markup");
{
  // Absence from the MARKUP, not from the rendered text: a section hidden
  // with `hidden` or `sr-only` still ships its words to a crawler and to a
  // screen reader, which is not what "removed" means.
  const REMOVED: Record<Lang, readonly string[]> = {
    sv: [
      "Karriär · Rekrytering · Tester",
      "Gör karriärtestet",
      "Tre sätt vi stöttar din utveckling",
      "Din säkerhetskarriär. En yrkesidentitet.",
      "Byggd för individer och organisationer",
      "Utforska roller i säkerhetsbranschen",
      "Kostnadsfritt karriärtest inom säkerhet",
      "Rollbaserade kompetenstest för organisationer",
      "Bli anställd",
      "Möt arbetsgivare",
      "mät din kompetens",
      "Prata med oss",
      "verifierade meriter",
      "kompetensverifiering",
      "testa personal",
      "rätt kandidat",
      "säkrare rekrytering",
    ],
    en: [
      "Career · Recruitment · Assessments",
      "Take the career test",
      "Three ways CQrityjob supports your journey",
      "Built for individuals and organizations",
      "Explore roles across the security industry",
      "Free security career test",
      "Role-based competence assessments for organizations",
      "Get hired",
      "Talk to our team",
      "measure your competence",
      "competence verification",
    ],
  };
  for (const lang of LANGS) {
    for (const phrase of REMOVED[lang]) {
      ck(
        `${lang}: "${phrase}" is gone`,
        !mainOf(html[lang]).toLowerCase().includes(phrase.toLowerCase()),
      );
    }
  }
  const RETIRED = [
    "home.pillars.title",
    "home.pillar.hired.title",
    "home.account.title",
    "home.paths.title",
    "home.careers.title",
    "home.assessment.title",
    "home.assessment.point.time",
    "home.platform.title",
    "home.employers.item.verify.title",
  ];
  for (const lang of LANGS) {
    for (const key of RETIRED) {
      ck(`${lang}: the retired key "${key}" is deleted`, !(key in dictionaries[lang]));
    }
  }
  ck("nothing still asks for one of them", !RETIRED.some((k) => routeCode.includes(k)));
}

/* T3 ---------------------------------------------------------------- */
group("T3 · one h1, three h2, and a sane hierarchy");
{
  for (const lang of LANGS) {
    const m = mainOf(html[lang]);
    ck(`${lang}: exactly one h1`, headings(m, "h1").length === 1, headings(m, "h1"));
    ck(`${lang}: exactly three h2`, headings(m, "h2").length === 3, headings(m, "h2"));
    ck(
      `${lang}: h3 is the three journey steps and nothing else`,
      headings(m, "h3").length === 3,
      headings(m, "h3"),
    );
  }
  ck(
    "sv h1",
    headings(svMain, "h1")[0] === "Din säkerhetskarriär. Samlad på ett ställe.",
    headings(svMain, "h1")[0],
  );
  ck(
    "en h1 says the same thing",
    headings(enMain, "h1")[0] === "Your security career. All in one place.",
    headings(enMain, "h1")[0],
  );
  ck(
    "sv h2s, in order",
    JSON.stringify(headings(svMain, "h2")) ===
      JSON.stringify([
        "Samla. Styrk. Dela.",
        "Ett Passport genom hela karriären",
        "Strukturerat stöd för rekrytering och kompetensutveckling",
      ]),
    headings(svMain, "h2"),
  );
}

/* T4 ---------------------------------------------------------------- */
group("T4 · Security Passport is the product, and it leads");
{
  const hero: Record<Lang, string> = {
    sv: sectionOf(svMain, "hero"),
    en: sectionOf(enMain, "hero"),
  };
  for (const lang of LANGS) {
    const heroCopy = await copyText(hero[lang]);
    ck(`${lang}: the hero names Security Passport`, heroCopy.includes("Security Passport"));
    // The Career Analysis is a SUPPORTING tool. It may not appear in the
    // hero at all: not as a heading, not as copy, and not as a control.
    ck(
      `${lang}: the hero does not mention the Career Analysis`,
      !/karriäranalys|career analysis/i.test(heroCopy),
      heroCopy.slice(0, 120),
    );
    ck(
      `${lang}: the hero holds no link to the Career Analysis`,
      !hero[lang].includes("/security-career-assessment"),
    );
  }
  // The eyebrow states the positioning rather than a list of features.
  ck(
    "sv eyebrow",
    dictionaries.sv["home.hero.eyebrow"] === "Din yrkesidentitet inom säkerhet",
    dictionaries.sv["home.hero.eyebrow"],
  );
  ck(
    "en eyebrow",
    dictionaries.en["home.hero.eyebrow"] === "Your professional identity in security",
    dictionaries.en["home.hero.eyebrow"],
  );
  // The two promises under the actions, in both languages.
  ck("sv trust line", svCopy.includes("Dina uppgifter · Du bestämmer vad som delas"));
  ck("en trust line", enCopy.includes("Your information · You choose what to share"));
}

/* T5 ---------------------------------------------------------------- */
group("T5 · exactly one visually primary call to action");
{
  // The design system's one solid navy control is `bg-primary`. Counted from
  // the RENDERED class attributes of controls inside main, so a second solid
  // action added anywhere on the page fails here.
  const anchors = [...svMain.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  // Token equality, not a substring: `\bbg-primary\b` also matches
  // "hover:bg-primary-foreground/10", which is what the employer button on
  // the navy band wears — and reporting that as a second primary action is
  // the guard failing rather than the page.
  const isSolid = (tag: string) =>
    (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).includes("bg-primary");
  const solid = anchors.filter(isSolid);
  ck("one solid navy control inside main", solid.length === 1, solid.length);
  ck("and it is the account/Passport action", solid[0]?.includes('href="/signup'), solid[0]);
  for (const [lang, expected] of [
    ["sv", "Skapa ditt Security Passport"],
    ["en", "Create your Security Passport"],
  ] as const) {
    ck(
      `${lang} primary label is "${expected}"`,
      (dictionaries[lang] as Record<string, string>)["cta.passport"] === expected,
      (dictionaries[lang] as Record<string, string>)["cta.passport"],
    );
    ck(`${lang}: and it is rendered`, copyOf[lang].includes(expected));
  }
  // The other two controls are controls, and neither is the loud one.
  for (const href of ["/security-career-assessment", "/employers"]) {
    const a = anchors.find((x) => x.includes(`href="${href}"`));
    ck(`a control points at ${href}`, Boolean(a), href);
    ck(`  ${href} is not solid navy`, Boolean(a) && !isSolid(a!));
  }
  // The hero's second control is an in-page anchor, not a second journey.
  ck('the hero offers "Se hur det fungerar" as a same-page anchor', svMain.includes('href="#how"'));
  ck(
    "and the anchor has a target that exists",
    svMain.includes('<section id="how"') || svMain.includes('id="how"'),
  );
  // One destination, one control.
  const hrefs = anchors
    .map((a) => a.match(/href="([^"]*)"/)?.[1])
    .filter((h): h is string => Boolean(h));
  ck("no destination is offered twice inside main", new Set(hrefs).size === hrefs.length, hrefs);
}

/* T6 ---------------------------------------------------------------- */
group("T6 · the primary action carries the Passport intent, to a real landing");
{
  const INTENT = "/passport";
  ck(
    "the route declares the intent once, as a constant",
    /const PASSPORT_INTENT = \{ redirect: "\/passport" \} as const;/.test(routeCode),
  );
  ck(
    "the primary control renders /signup?redirect=/passport",
    svMain.includes('href="/signup?redirect=%2Fpassport"'),
    svMain.match(/href="\/signup[^"]*"/)?.[0],
  );
  // The mechanism is the product's own, and it accepts this value: a landing
  // that safeReturnPath refused would be silently swapped for the default
  // destination, and the button would quietly stop keeping its promise.
  ck(
    "safeReturnPath accepts the landing",
    safeReturnPath(INTENT, "/my-career") === INTENT,
    safeReturnPath(INTENT, "/my-career"),
  );
  ck("the landing is not an auth surface (that would loop)", !AUTH_SURFACES.includes(INTENT));
  ck(
    "the landing is a real route",
    existsSync(path.join(root, "src/routes/_authenticated.passport.index.tsx")),
  );

  // The landing EXPLAINS the next step rather than being a dashboard.
  //
  // PR #192 changed the MECHANISM and not the promise. /passport used to hold
  // a "you have no Passport yet" branch with a create button; it now derives
  // the first-run state from persisted rows and hands the whole first run to
  // /passport/onboarding, which is a four-screen journey ending in a real
  // merit. So the assertions follow the hand-off rather than the old branch --
  // what must stay true is that a new account is given a NAMED FIRST ACTION,
  // not an empty page.
  //
  // The condition is deliberately a CURRENT MERIT and not `onboarding_state`:
  // a profile can say completed and hold nothing, and telling that person
  // they are finished above an empty Passport is the failure this whole
  // branch exists to prevent.
  const landing = code(read("src/routes/_authenticated.passport.index.tsx"));
  ck(
    "the landing derives the first-run state from persisted rows",
    landing.includes("deriveFirstRunState("),
  );
  ck(
    "and hands a Passport with no current merit to the first-run journey",
    landing.includes('firstRun.screen !== "overview"') &&
      landing.includes('to: "/passport/onboarding"'),
  );
  ck(
    "the journey route exists",
    existsSync(path.join(root, "src/routes/_authenticated.passport.onboarding.tsx")),
  );
  const journey = code(read("src/components/security-passport/FirstRunJourney.tsx"));
  ck(
    "which names the first action in words",
    journey.includes('pt("fr.create.title")') && journey.includes('pt("fr.create.cta")'),
  );
  const passportCopy = read("src/lib/security-passport/i18n.ts");
  for (const key of ["fr.create.title", "fr.create.body", "fr.create.cta"]) {
    ck(`"${key}" has copy`, new RegExp(`"${key}":`).test(passportCopy));
  }

  // And the intent survives every account path the form supports.
  const authForm = code(read("src/components/auth/UnifiedAuthForm.tsx"));
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
}

/* T7 ---------------------------------------------------------------- */
group("T7 · the Career Analysis is the supporting tool, offered once");
{
  const uses = (svMain.match(/\/security-career-assessment/g) ?? []).length;
  ck("exactly one link to the Career Analysis on the page", uses === 1, uses);
  ck(
    "and it lives in section 3, not the hero",
    sectionOf(svMain, "passport").includes("/security-career-assessment"),
  );
  ck(
    "sv label",
    dictionaries.sv["home.passport.cta"] === "Utforska din karriärväg",
    dictionaries.sv["home.passport.cta"],
  );
  // The sentence that keeps the two products apart.
  ck(
    "sv callout separates record from guidance",
    svCopy.includes(
      "Security Passport visar vad du har gjort. Karriäranalysen hjälper dig att se vad du kan göra härnäst.",
    ),
  );
  ck(
    "en callout says the same",
    enCopy.includes(
      "Security Passport shows what you have done. The Career Analysis helps you see what you could do next.",
    ),
  );
  // It is not a test, and it measures nothing.
  const BANNED: Record<Lang, readonly RegExp[]> = {
    sv: [/kompetenstest/i, /mäter din kompetens/i, /mät din kompetens/i, /karriärtest/i, /prov\b/i],
    en: [/competence test/i, /measures your competence/i, /career test/i, /\bexam\b/i],
  };
  for (const lang of LANGS) {
    for (const rx of BANNED[lang]) {
      ck(`${lang}: no "${rx.source}"`, !rx.test(copyOf[lang]));
    }
  }
  // A CV is an OUTPUT, never a second source of truth, and nothing promises
  // a match or a job.
  for (const lang of LANGS) {
    for (const rx of [
      /automatisk matchning/i,
      /automatic (job )?match/i,
      /garanterar (jobb|anställning)/i,
      /guarantees? (a )?job/i,
    ]) {
      ck(`${lang}: no "${rx.source}"`, !rx.test(copyOf[lang]));
    }
  }
}

/* T8 ---------------------------------------------------------------- */
group("T8 · the trust levels respect the PR #189 semantics");
{
  const how: Record<Lang, string> = { sv: sectionOf(svMain, "how"), en: sectionOf(enMain, "how") };
  for (const [lang, levels] of [
    ["sv", ["Registrerat", "Dokumenterat", "Källbekräftat"]],
    ["en", ["Registered", "Documented", "Source-confirmed"]],
  ] as const) {
    for (const level of levels) ck(`${lang}: "${level}" is named`, how[lang].includes(level));
  }
  ck(
    "sv step 2 says what the three levels are for",
    dictionaries.sv["home.how.step2.desc"] ===
      "Se tydligt vad som är registrerat, dokumenterat eller källbekräftat.",
  );

  // ── ONLY SOURCE-CONFIRMED READS AS CONFIRMED ──────────────────────
  //
  // The green treatment is reserved. A page where "Registrerat" or
  // "Dokumenterat" wore it would say, in the one channel most people read
  // first, that a document somebody uploaded had been confirmed by its
  // source. Asserted on the rendered class attributes, per chip.
  const chips = [...how.sv.matchAll(/<span class="([^"]*rounded-full border[^"]*)">/g)].map(
    (m) => m[1],
  );
  const chipBlocks = how.sv.split("<li>").slice(1);
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
  void chips;

  // Colour is never what carries it: three distinct glyphs and three
  // distinct border treatments, before any colour is perceived (Product
  // Architecture v1.1 §5.4, and AssertionChip.tsx).
  ck("the weakest level is dashed", /border-dashed/.test(routeCode));
  const glyphNames = ["PencilLine", "FileText", "CheckCircle2"];
  for (const g of glyphNames) {
    ck(`the level list uses ${g}`, new RegExp(`glyph: ${g}`).test(routeCode));
  }
  ck(
    "and every level prints its own word",
    ["home.trust.registered", "home.trust.documented", "home.trust.sourceConfirmed"].every((k) =>
      routeCode.includes(k),
    ),
  );

  // No issuer claim, anywhere on the page. The product has no issuer
  // identity, membership, receipt, signature or revocation authority.
  for (const lang of LANGS) {
    for (const banned of [
      "utfärdare",
      "issuer",
      "verifierade meriter",
      "verified merits",
      "kompetensverifiering",
      "competence verification",
    ]) {
      ck(`${lang}: no "${banned}"`, !copyOf[lang].toLowerCase().includes(banned));
    }
  }

  // A TRUST state is not a LIFECYCLE state. Neither vocabulary may leak
  // into the other on a page that is teaching somebody the difference.
  for (const lang of LANGS) {
    for (const rx of [
      /\bgiltig\b/i,
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

  // The Passport section itself has NO call to action into the Passport:
  // every Passport route is authenticated, so a "read more" there would
  // drop a signed-out visitor on a login wall.
  for (const file of [
    "src/routes/_authenticated.passport.index.tsx",
    "src/routes/_authenticated.passport.information.tsx",
  ]) {
    ck(`${file} is still authenticated-only`, existsSync(path.join(root, file)));
  }
  ck(
    "no public passport route has appeared without the nav being revisited",
    !existsSync(path.join(root, "src/routes/passport.tsx")) &&
      !existsSync(path.join(root, "src/routes/security-passport.tsx")),
  );
  ck(
    "the homepage never links a signed-out visitor into a Passport route",
    !/href="\/passport/.test(svMain),
  );
}

/* T9 ---------------------------------------------------------------- */
group("T9 · every destination is an existing canonical route");
{
  const ROUTES: Record<string, string> = {
    "/signup": "src/routes/signup.tsx",
    "/security-career-assessment": "src/routes/security-career-assessment.tsx",
    "/career-center": "src/routes/career-center.index.tsx",
    "/employers": "src/routes/employers.tsx",
    "/jobs": "src/routes/jobs.index.tsx",
    "/login": "src/routes/login.tsx",
    "/about": "src/routes/about.tsx",
    "/feedback": "src/routes/_authenticated.feedback.tsx",
    // Not homepage destinations: these are the header's SIGNED-IN entries,
    // which the same scan sees. They are asserted here for the same reason
    // as the rest -- a header that points at a route file nobody wrote is
    // the defect this section exists to catch.
    "/my-career": "src/routes/_authenticated.my-career.index.tsx",
    "/my-career/profile": "src/routes/_authenticated.my-career.profile.tsx",
    "/reviews": "src/routes/_authenticated.reviews.tsx",
    "/employer/pending": "src/routes/_authenticated.employer.pending.tsx",
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
}

/* T10 --------------------------------------------------------------- */
group("T10 · the signed-in redirect is intact and is the only one");
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
  // A failed session read must leave the visitor here, not bounce them.
  ck("no catch-and-redirect", !/\.catch\([^)]*navigate/.test(routeCode));
}

/* T11 --------------------------------------------------------------- */
group("T11 · the public chrome");
{
  const navBlock = headerCode.slice(headerCode.indexOf("const nav = ["));
  const nav = navBlock.slice(0, navBlock.indexOf("] as const;"));
  const entries = [...nav.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
  ck(
    "five primary nav destinations, product first",
    JSON.stringify(entries) ===
      JSON.stringify(["/", "/career-center", "/jobs", "/employers", "/about"]),
    entries,
  );
  ck('the first entry is "Security Passport"', nav.includes('t("nav.passportPublic")'));
  ck("and it points at the homepage section, with a hash", /to: "\/", hash: "passport"/.test(nav));
  // A Link matches by PREFIX, so a "/" entry without exact matching is
  // marked current on every route on the site.
  ck(
    "the homepage entry is matched exactly, not by prefix",
    headerCode.includes('activeOptions={{ exact: item.to === "/" }}'),
  );
  ck('"Bedömningar" is out of the primary nav', !nav.includes("/assessment"));
  ck('"Kontakt" is out of the primary nav', !nav.includes("/contact"));
  ck(
    'the Career Center entry reads "Karriärvägar"',
    dictionaries.sv["nav.career_center"] === "Karriärvägar" &&
      dictionaries.en["nav.career_center"] === "Career paths",
    [dictionaries.sv["nav.career_center"], dictionaries.en["nav.career_center"]],
  );

  ck("the header offers /login", headerCode.includes('to="/login"'));
  ck(
    "the header's primary action is the Passport, carrying its intent",
    headerCode.includes('{t("cta.passport")}') &&
      (headerCode.match(/\{ redirect: "\/passport" \} as never/g) ?? []).length === 2,
  );
  ck(
    "the Career Analysis is not a header action",
    !headerCode.includes('to="/security-career-assessment"'),
  );

  // The footer: only working destinations, legal lines not dressed as links.
  ck("the footer does not promote the contact form", !footerCode.includes('"/contact"'));
  ck("the footer does not link /assessment", !footerCode.includes('"/assessment"'));
  ck("the footer leads with the product", footerCode.includes('t("nav.passportPublic")'));
  ck(
    "the legal lines are rendered, and rendered as text",
    footerCode.includes('<span>{t("footer.legal.privacy")}</span>') &&
      footerCode.includes('<span>{t("footer.legal.terms")}</span>'),
  );
  ck(
    "no anchor wraps either legal line",
    !/<Link[^>]*>\s*\{t\("footer\.legal\.(privacy|terms)"\)\}/.test(footerSrc),
  );
  ck(
    "and a privacy/terms route has not appeared while they are still text",
    !existsSync(path.join(root, "src/routes/privacy.tsx")) &&
      !existsSync(path.join(root, "src/routes/terms.tsx")),
  );
  ck("the footer carries the brand principle", footerCode.includes('t("brand.slogan")'));
}

/* T12 --------------------------------------------------------------- */
group("T12 · sv and en say the same thing, with the same structure");
{
  const homeKeys = (lang: Lang) =>
    Object.keys(dictionaries[lang])
      .filter((k) => k.startsWith("home.") || k === "cta.passport" || k === "cta.howItWorks")
      .sort();
  ck(
    "the same keys exist in both languages",
    JSON.stringify(homeKeys("sv")) === JSON.stringify(homeKeys("en")),
    homeKeys("sv").filter((k) => !homeKeys("en").includes(k)),
  );
  // Product names are the same in both. Nothing else may be — an untouched
  // English string is an untranslated one.
  // "CV" is the same word in both languages and is what the rest of the
  // product already calls it in English. Named here rather than weakening
  // the parity rule for everything else.
  const SAME_IN_BOTH = new Set<string>(["home.mock.cv.title"]);
  for (const key of homeKeys("sv")) {
    for (const lang of LANGS) {
      const v = (dictionaries[lang] as Record<string, string>)[key];
      ck(`${lang} "${key}" is non-empty`, typeof v === "string" && v.trim().length > 0);
    }
    const sv = (dictionaries.sv as Record<string, string>)[key];
    const en = (dictionaries.en as Record<string, string>)[key];
    ck(`"${key}" is actually translated`, sv !== en || SAME_IN_BOTH.has(key), key);
  }
  ck(
    "same section ids in both languages",
    JSON.stringify([...svMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1])) ===
      JSON.stringify([...enMain.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1])),
  );
  const hrefs = (m: string) => [...m.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
  ck(
    "same destinations, same order",
    JSON.stringify(hrefs(svMain)) === JSON.stringify(hrefs(enMain)),
  );

  // English names the supporting tool ONE way.
  ck('en copy says "Career Analysis"', /Career Analysis/.test(enCopy));
  for (const drift of [/career test/i, /the assessment/i, /career guidance/i, /skills test/i]) {
    ck(`en copy does not also say "${drift.source}"`, !drift.test(enCopy));
  }
}

/* T13 --------------------------------------------------------------- */
group("T13 · the copy budget");
{
  // Words inside <main>, excluding button labels and small UI labels, and
  // excluding the aria-hidden illustrations. The illustrations are
  // decoration: they are out of the accessibility tree, they carry no claim
  // a sentence does not also make, and counting a mock interface's row
  // labels as prose would measure the wrong thing. What is measured is what
  // a person READS.
  const BUTTON_LABELS = LANGS.flatMap((l) =>
    ["cta.passport", "cta.howItWorks", "home.passport.cta", "home.employers.cta"].map(
      (k) => (dictionaries[l] as Record<string, string>)[k],
    ),
  );
  for (const lang of LANGS) {
    let prose = copyOf[lang];
    for (const label of BUTTON_LABELS) prose = prose.split(label).join(" ");
    ck(`${lang}: ${wc(prose)} words of prose inside main (max 220)`, wc(prose) <= 220, wc(prose));
    // And a ceiling on the WHOLE rendered page, decoration included.
    //
    // The brief's 220 is prose, "excluding buttons and small UI labels" —
    // and the two product mocks are small UI labels by any reading: a row
    // label beside a digit, a role under a name. But they are still words
    // on a screen, and the exemption they enjoy is precisely what let a
    // Swedish mock ship inside the English page. So they are counted, out
    // loud, with a ceiling that is a CEILING rather than a snapshot of
    // today: 268 sv / 299 en against 320, which is room for a satellite or
    // two and not for a second body of copy.
    ck(
      `${lang}: ${wc(seenOf[lang])} words rendered in total, decoration included (ceiling 320)`,
      wc(seenOf[lang]) <= 320,
      wc(seenOf[lang]),
    );
  }

  for (const lang of LANGS) {
    const d = dictionaries[lang] as Record<string, string>;
    ck(
      `${lang}: hero body <= 30 words`,
      wc(d["home.hero.subtitle"]) <= 30,
      wc(d["home.hero.subtitle"]),
    );
    for (const key of ["home.passport.body", "home.employers.subtitle"]) {
      ck(`${lang}: "${key}" <= 30 words`, wc(d[key]) <= 30, wc(d[key]));
    }
    for (const n of [1, 2, 3]) {
      const key = `home.how.step${n}.desc`;
      ck(`${lang}: step ${n} is one sentence`, (d[key].match(/[.!?]/g) ?? []).length === 1, d[key]);
    }
  }

  // The illustrations really are out of the accessibility tree. If one
  // loses its aria-hidden, the budget above silently stops holding — and a
  // fictional person's name starts being read out as content.
  ck(
    "the Passport composition is aria-hidden",
    /function PassportComposition[\s\S]{0,900}aria-hidden="true"/.test(routeCode),
  );
  ck(
    "the employer backdrop is aria-hidden",
    /function EmployerBackdrop[\s\S]{0,300}aria-hidden="true"/.test(routeCode),
  );
  ck(
    "the illustration's satellites are not controls",
    !/<a\b/.test(
      routeCode.slice(
        routeCode.indexOf("function SatelliteColumn"),
        routeCode.indexOf("function PassportCardMock"),
      ),
    ),
  );
  // The mock person is DRAWN and never announced. Asserted on BOTH
  // projections, so the difference between them stays visible right here:
  // it is in what is seen, and it is not in what is read.
  for (const lang of LANGS) {
    ck(`${lang}: the mock holder is drawn`, seenOf[lang].includes("Alex Karlsson"));
    ck(`${lang}: and is not in the accessibility tree`, !copyOf[lang].includes("Alex Karlsson"));
  }
}

/* T14 --------------------------------------------------------------- */
group("T14 · what the page may not claim about a career that moves");
{
  // Built FOR a career that moves. Not recognised, approved or valid
  // anywhere, and never a substitute for a licence, a permit, a background
  // check or an employer's own due diligence.
  ck(
    "sv states portability as what it is",
    svCopy.includes("Byggt för en karriär mellan roller, arbetsgivare och länder."),
  );
  ck(
    "en says the same",
    enCopy.includes("Built for a career that moves between roles, employers and countries."),
  );
  const OVERCLAIMS: readonly RegExp[] = [
    /globalt erkän/i,
    /globally recognis|globally recogniz/i,
    /internationellt godkän/i,
    /internationally approved/i,
    /giltig i alla länder/i,
    /valid in (every|all) countr/i,
    /automatiskt likvärdig/i,
    /automatically equivalent/i,
    /ersätter (licens|tillstånd|bakgrundskontroll)/i,
    /replaces? (a )?(licence|license|work permit|background)/i,
    /arbetstillstånd/i,
    /work permit/i,
    /bakgrundskontroll/i,
    /background screening/i,
  ];
  for (const lang of LANGS) {
    for (const rx of OVERCLAIMS) {
      ck(`${lang}: no "${rx.source}"`, !rx.test(copyOf[lang]));
    }
  }
}

/* T15 --------------------------------------------------------------- */
group("T15 · the English page is English, decoration included");
{
  // ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────
  //
  // Every visible word in the two Passport compositions was inlined in the
  // component: "Din säkerhetsprofil", "Utbildningar", "Certifikat",
  // "Stockholm, Sverige", "Skapa CV från dina uppgifter". The English
  // homepage rendered all of it, in Swedish, beside English prose.
  //
  // Nothing caught it, and the reason is worth writing down: every text
  // assertion in this file ran against `copyText`, which strips aria-hidden
  // subtrees. The illustrations are aria-hidden — correctly, they are
  // decoration — so they were invisible to the guard and perfectly visible
  // to the reader. aria-hidden is not a localisation mechanism and never
  // was. Everything below reads `seenOf`, the WHOLE rendered page.

  // 1. No Swedish-specific character survives into the English page. One
  //    line, and it catches most of the class outright.
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

  // 2. The words that have no diacritic to give them away — "Certifikat",
  //    "CV", "Jobb". For every key that IS translated, the other language's
  //    value must not appear on this page. Symmetric, so a reverse
  //    regression (English leaking into the Swedish page) fails too.
  const homeKeys = Object.keys(dictionaries.sv).filter(
    (k) => k.startsWith("home.") || k === "cta.passport" || k === "cta.howItWorks",
  );
  for (const [lang, other] of [
    ["en", "sv"],
    ["sv", "en"],
  ] as const) {
    const leaked: string[] = [];
    for (const key of homeKeys) {
      const mine = (dictionaries[lang] as Record<string, string>)[key];
      const theirs = (dictionaries[other] as Record<string, string>)[key];
      // Identical values are the same word in both languages, not a leak.
      if (!theirs || theirs === mine || theirs.length < 4) continue;
      if (seenOf[lang].includes(theirs)) leaked.push(`${key}="${theirs}"`);
    }
    ck(`${lang}: no ${other} string is rendered`, leaked.length === 0, leaked.join(" · "));
  }

  // 3. The exact strings that were inlined, named so this failure has a
  //    memory even if the two rules above are ever relaxed.
  const WAS_INLINED = [
    "Din säkerhetsprofil",
    "Redigera profil",
    "Säkerhetsspecialist",
    "Stockholm, Sverige",
    "Erfarenhet",
    "Utbildningar",
    "Certifikat",
    "Meriter",
    "Delad profil",
    "Utveckling",
    "Skapa CV från dina uppgifter",
    "Dela valda uppgifter",
    "Använd din profil i jobbansökningar",
    "Se möjliga nästa steg",
    "Skapa professionellt CV med dina uppgifter",
    "Dela valda uppgifter med arbetsgivare",
    "Använd ditt Security Passport i jobbansökningar",
    "Utforska nästa steg med karriäranalysen",
  ];
  for (const phrase of WAS_INLINED) {
    ck(`en: "${phrase}" is not rendered`, !seenOf.en.includes(phrase));
  }

  // 4. And the Swedish page really does say them, so "fixed" cannot mean
  //    "deleted the illustration".
  for (const phrase of ["Din säkerhetsprofil", "Utbildningar", "Stockholm, Sverige"]) {
    ck(`sv: "${phrase}" is still rendered`, seenOf.sv.includes(phrase));
  }
  for (const phrase of ["Your security profile", "Education", "Stockholm, Sweden"]) {
    ck(`en: "${phrase}" is rendered instead`, seenOf.en.includes(phrase));
  }

  // ── STRUCTURAL: the type refuses a raw string ──────────────────────
  //
  // The rules above are a net. This is the hole being welded shut: a
  // `Satellite` may only be given translation KEYS, so `title: "Delad
  // profil"` is a type error rather than a rendering bug somebody has to
  // notice in a screenshot.
  ck(
    "a Satellite carries keys, not strings",
    /type Satellite = \{[\s\S]*?titleKey: TranslationKey;[\s\S]*?bodyKey: TranslationKey;[\s\S]*?\};/.test(
      routeCode,
    ),
  );
  ck(
    "and has no raw-string variant",
    !/type Satellite = \{[\s\S]*?title\??: string;[\s\S]*?\};/.test(routeCode),
  );

  // No Swedish string literal is left anywhere in the route's own source.
  // The document <title> is exempt: the whole site's SSR head is
  // Swedish-first and is not per-language on any route, which is a
  // site-wide concern rather than this page's.
  const literals = [...routeCode.matchAll(/"([^"\n]*[åäöÅÄÖ][^"\n]*)"/g)]
    .map((m) => m[1])
    .filter((v) => !v.startsWith("CQrityjob —"));
  ck("no Swedish string literal remains in the route", literals.length === 0, literals.join(" · "));
}

/* -------------------------------------------------------------------- */
console.log("");
if (fails.length > 0) {
  console.error(`public-homepage:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("public-homepage:check OK");
