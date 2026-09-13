// The employer landing page (/employers) — asserted against the RENDERED
// markup and the dictionaries, in both languages.
//
// ── WHY THIS GUARD EXISTS ──────────────────────────────────────────────
//
// /employers used to be four abstract benefit tiles and a contact form, and
// nothing in CI said anything about what it claimed. It now describes the
// whole connected recruitment process and names BESKT, which is a governed
// method under an owner-issued pilot grant — the single place on the public
// site where an over-claim would be most expensive. So the page gets a
// guard of its own:
//
//   E1  one h1, the approved copy, and a sane heading hierarchy
//   E2  the three actions, through the ONE door, with /employer as a
//       validated return path — and no role granted by intent
//   E3  the release flag still fails closed: with the portal off there is
//       no entrance on this page at all
//   E4  the connected path is six ordered steps, ending in a documented
//       HUMAN decision and then development
//   E5  two recruitment examples, one of them BESKT — with its boundary
//       and its availability stated where the example is read
//   E6  NO FORBIDDEN CLAIM: no score, ranking, pass/fail, suitability,
//       credibility, deception, personality or protected-trait inference,
//       no AI decision, no BESKT-replaces-vetting claim, and no offer of
//       candidate-owned Career Discovery data
//   E7  sv and en carry the same keys, structure and destinations, and the
//       English page is English
//
// Run: bun run employer-landing:check

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same two mocks, and the same reasons, as scripts/public-homepage-check.tsx:
// the router so `Route.component` is the REAL component and `Link` becomes an
// anchor whose href carries `to` and `search`, and SiteLayout because
// SiteHeader pulls in server-function machinery and three React Query
// subscriptions that this page is not about.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    hash,
    children,
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
  useLocation: () => ({ pathname: "/employers", search: "", hash: "" }),
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
const { Route } = await import("../src/routes/employers");

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

const pageCode = code(read("src/routes/employers.tsx"));

type Lang = "sv" | "en";
const LANGS: readonly Lang[] = ["sv", "en"];
const d = (lang: Lang) => dictionaries[lang] as Record<string, string>;

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

function mainOf(markup: string): string {
  const open = markup.indexOf("<main");
  const start = markup.indexOf(">", open) + 1;
  return markup.slice(start, markup.lastIndexOf("</main>"));
}
const entities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const textOf = (markup: string) =>
  entities(markup.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
const headings = (markup: string, tag: "h1" | "h2" | "h3") =>
  [...markup.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) =>
    entities(m[1].replace(/<[^>]*>/g, ""))
      .replace(/\s+/g, " ")
      .trim(),
  );
const hrefsOf = (markup: string) =>
  [...markup.matchAll(/href="([^"]*)"/g)].map((m) => entities(m[1]));

const main: Record<Lang, string> = { sv: mainOf(html.sv), en: mainOf(html.en) };
const text: Record<Lang, string> = { sv: textOf(main.sv), en: textOf(main.en) };

console.log("employer-landing-check");

/* E1 ---------------------------------------------------------------- */
group("E1 · one h1, the approved copy, and a sane hierarchy");
{
  for (const lang of LANGS) {
    ck(
      `${lang}: exactly one h1`,
      headings(main[lang], "h1").length === 1,
      headings(main[lang], "h1"),
    );
    ck(
      `${lang}: two h2 — the connected path and the two examples`,
      headings(main[lang], "h2").length === 2,
      headings(main[lang], "h2"),
    );
    ck(
      `${lang}: eight h3 — six path steps and two examples`,
      headings(main[lang], "h3").length === 8,
      headings(main[lang], "h3").length,
    );
  }
  ck(
    "sv h1 is the approved sentence",
    d("sv")["employers.title"] === "Hela rekryteringen av säkerhetspersonal i en plattform",
    d("sv")["employers.title"],
  );
  ck(
    "en h1 is the approved sentence",
    d("en")["employers.title"] === "The complete security recruitment process in one platform",
    d("en")["employers.title"],
  );
  ck(
    "sv lead is the approved sentence",
    d("sv")["employers.lead"] ===
      "Publicera säkerhetsjobb, hantera ansökningar och använd strukturerade bedömningar och intervjumodeller för både vanliga säkerhetsroller och säkerhetsskyddskänsliga befattningar.",
    d("sv")["employers.lead"],
  );
  ck(
    "en lead is the approved sentence",
    d("en")["employers.lead"] ===
      "Publish security jobs, manage applications and use structured assessments and interview models for both ordinary security roles and security-protection-sensitive positions.",
    d("en")["employers.lead"],
  );
  for (const lang of LANGS) {
    ck(`${lang}: the h1 is rendered`, headings(main[lang], "h1")[0] === d(lang)["employers.title"]);
    ck(`${lang}: the lead is rendered`, text[lang].includes(d(lang)["employers.lead"]));
  }
  // The four abstract benefit tiles are gone from the MARKUP, not hidden.
  const RETIRED = [
    "employers.offer.recruit.title",
    "employers.offer.assess.title",
    "employers.offer.develop.title",
    "employers.offer.verify.title",
    "employers.cta.createAccount",
  ];
  for (const lang of LANGS) {
    for (const key of RETIRED) {
      ck(`${lang}: the retired key "${key}" is deleted`, !(key in dictionaries[lang]));
    }
  }
}

/* E2 ---------------------------------------------------------------- */
group("E2 · the three actions, through the ONE door");
{
  const hrefs = hrefsOf(main.sv);
  ck(
    "register goes to /signup with the /employer return path",
    hrefs.includes("/signup?redirect=%2Femployer"),
    hrefs,
  );
  ck("the secondary action is a same-page anchor", hrefs.includes("#how-it-works"));
  ck("its target exists", main.sv.includes('id="how-it-works"'));
  ck(
    "the existing customer reaches /login with the same return path",
    hrefs.includes("/login?redirect=%2Femployer"),
    hrefs,
  );
  ck("and there is no fourth destination", hrefs.length === 3, hrefs);
  ck(
    "safeReturnPath accepts the employer landing",
    safeReturnPath("/employer", "/my-career") === "/employer",
  );
  ck("the employer landing is not an auth surface", !AUTH_SURFACES.includes("/employer"));
  ck(
    "the employer landing is a real route",
    existsSync(path.join(root, "src/routes/_authenticated.employer.index.tsx")),
  );
  // No compatibility redirect, and no second auth implementation.
  for (const retired of ["/employer/login", "/employer/register", "/candidate/login", "/auth"]) {
    ck(`the page does not send anybody through ${retired}`, !pageCode.includes(`"${retired}"`));
  }
  // ── INTENT IS NEVER A ROLE ────────────────────────────────────────
  for (const banned of ["user_metadata", "employer_memberships", "is_platform_admin", "supabase"]) {
    ck(`the page never touches "${banned}"`, !pageCode.includes(banned));
  }
  // The dead contact form is not on this page.
  ck("no invitation into the contact form", !pageCode.includes('"/contact"'));
}

/* E3 ---------------------------------------------------------------- */
group("E3 · the release flag still fails closed");
{
  ck(
    "the page reads the flag once, at render",
    pageCode.includes("const portalOpen = employerPortalEnabled();"),
  );
  const gated = pageCode.indexOf("portalOpen ? (");
  const fallback = pageCode.indexOf(") : (");
  ck("the entrances are behind it", gated !== -1 && fallback > gated);
  const closed = pageCode.slice(fallback, pageCode.indexOf(")}", fallback));
  ck(
    "with the portal off there is no entrance at all",
    !closed.includes('to="/signup"') && !closed.includes('to="/login"'),
    closed.slice(0, 120),
  );
  const flag = read("src/lib/job-intelligence/feature-flag.ts");
  ck("an unset variable is not enabled", flag.includes('String(raw).toLowerCase() === "true"'));
  ck("and the flag is release control, not a boundary", flag.includes("NOT a security boundary"));
}

/* E4 ---------------------------------------------------------------- */
group("E4 · the connected path, ending in a documented human decision");
{
  for (const lang of LANGS) {
    const steps = headings(main[lang], "h3")
      .slice(0, 6)
      .map((h) => h.replace(/^\d+\.\s*/, ""));
    for (let i = 1; i <= 6; i++) {
      ck(
        `${lang}: step ${i} is "${d(lang)[`employers.path.step${i}.title`]}"`,
        steps[i - 1] === d(lang)[`employers.path.step${i}.title`],
        steps[i - 1],
      );
      ck(
        `${lang}: step ${i} has a body`,
        text[lang].includes(d(lang)[`employers.path.step${i}.body`]),
      );
    }
  }
  ck("it is an ordered list", main.sv.includes("<ol"));
  // Step 5 is the one the page exists to make unmistakable.
  ck(
    "sv step 5 says a person decides and the decision is documented",
    /[Mm]änniskor fattar beslutet/.test(d("sv")["employers.path.step5.body"]) &&
      /dokumenteras/.test(d("sv")["employers.path.step5.body"]),
    d("sv")["employers.path.step5.body"],
  );
  ck(
    "en step 5 says the same",
    /[Pp]eople make the decision/.test(d("en")["employers.path.step5.body"]) &&
      /recorded/.test(d("en")["employers.path.step5.body"]),
    d("en")["employers.path.step5.body"],
  );
}

/* E5 ---------------------------------------------------------------- */
group("E5 · two recruitment examples, and the BESKT boundary");
{
  for (const lang of LANGS) {
    const examples = headings(main[lang], "h3").slice(6);
    ck(
      `${lang}: two examples`,
      examples.length === 2 &&
        examples[0] === d(lang)["employers.example.ordinary.title"] &&
        examples[1] === d(lang)["employers.example.protective.title"],
      examples,
    );
    ck(
      `${lang}: the BESKT note is rendered`,
      text[lang].includes(d(lang)["employers.example.protective.note"]),
    );
    ck(
      `${lang}: the BESKT availability state is rendered`,
      text[lang].includes(d(lang)["employers.example.protective.availability"]),
    );
    ck(
      `${lang}: the decision disclaimer is rendered`,
      text[lang].includes(d(lang)["employers.disclaimer"]),
    );
  }
  // ── WHAT THE BESKT SENTENCES MUST ACTUALLY SAY ────────────────────
  //
  // Not a paraphrase. A method, with no result, no score and no ranking,
  // and explicitly NOT säkerhetsprövning — which is the employer's own
  // legal duty and something CQrityjob has no authority over.
  ck(
    "sv: BESKT is a method, gives no result/score/ranking, and is not säkerhetsprövning",
    /metodstöd/i.test(d("sv")["employers.example.protective.note"]) &&
      /inget resultat/i.test(d("sv")["employers.example.protective.note"]) &&
      /ingen poäng/i.test(d("sv")["employers.example.protective.note"]) &&
      /ingen rangordning/i.test(d("sv")["employers.example.protective.note"]) &&
      /ersätter inte säkerhetsprövning/i.test(d("sv")["employers.example.protective.note"]),
    d("sv")["employers.example.protective.note"],
  );
  ck(
    "en: the same four claims",
    /method support/i.test(d("en")["employers.example.protective.note"]) &&
      /no result/i.test(d("en")["employers.example.protective.note"]) &&
      /no score/i.test(d("en")["employers.example.protective.note"]) &&
      /no ranking/i.test(d("en")["employers.example.protective.note"]) &&
      /does not replace security vetting/i.test(d("en")["employers.example.protective.note"]),
    d("en")["employers.example.protective.note"],
  );
  // ── AND IT IS NOT PRESENTED AS AVAILABLE ──────────────────────────
  //
  // BESKT publishes under `release_scope = synthetic_internal_only` and is
  // assignable only under an owner-issued, time-boxed pilot grant: with no
  // grant, nothing is assignable anywhere, production included. A public
  // page that offered it as a feature would be describing a product state
  // that does not exist.
  ck(
    "sv: availability is stated as under development and approval-gated",
    /under utveckling/i.test(d("sv")["employers.example.protective.availability"]) &&
      /godkännande/i.test(d("sv")["employers.example.protective.availability"]),
    d("sv")["employers.example.protective.availability"],
  );
  ck(
    "en: the same",
    /under development/i.test(d("en")["employers.example.protective.availability"]) &&
      /approval/i.test(d("en")["employers.example.protective.availability"]),
    d("en")["employers.example.protective.availability"],
  );
  // There is no action into BESKT from a public page.
  ck("no BESKT destination is offered", !hrefsOf(main.sv).some((h) => /beskt/i.test(h)));
}

/* E6 ---------------------------------------------------------------- */
group("E6 · no forbidden claim");
{
  const FORBIDDEN: readonly { rule: string; patterns: readonly RegExp[] }[] = [
    {
      rule: "assessment output is decision support — no score, ranking or pass/fail",
      // NEGATION-AWARE. The BESKT note says "ingen rangordning" / "no
      // ranking" — the exact disclaimer the brief requires — so a pattern
      // that banned the bare substring would ban the sentence that makes
      // the page safe. Every pattern here requires the AFFIRMATIVE form.
      patterns: [
        /(?<!ingen )rangordn|rankar|poängsätt/i,
        /(?<!no )\branking\b|\bpass\/fail\b|\bscores? candidates\b/i,
        /(total|sammanlagd|övergripande)\s*(poäng|betyg|score)/i,
        /overall (score|rating|grade)/i,
        /godkänd\/underkänd/i,
      ],
    },
    {
      rule: "CQrityjob and AI decide nothing — a human decides and documents",
      patterns: [
        /(vi|ai|plattformen|cqrityjob) (avgör|bedömer|väljer) (om )?(kandidaten|du) (är )?lämplig/i,
        /(we|ai|the platform|cqrityjob) (decides?|determines?) (if |whether )?(the candidate|you) (is |are )?suitable/i,
        /automatiskt (urval|avslag|beslut)/i,
        /automatic (screening|rejection|decision)/i,
        /ai (fattar|tar) beslut|ai (makes|takes) the decision/i,
        /\bhittar rätt kandidat\b|\bfinds the right candidate\b/i,
      ],
    },
    {
      rule: "no credibility, deception, personality or protected-trait inference",
      patterns: [
        /trovärdighet|credibility|deception|lie detect|sanningshalt/i,
        /personlighetstest|personality test|personality profile|personlighetsprofil/i,
        /\blämplighetsbedömning\b|\bsuitability (score|assessment|rating)\b/i,
        /kön|etnicitet|religion|ethnicity|gender|health status/i,
      ],
    },
    {
      rule: "BESKT never replaces statutory security vetting",
      patterns: [
        /beskt[^.]{0,60}(ersätter|istället för) säkerhetsprövning/i,
        /beskt[^.]{0,60}(replaces|instead of) (the )?security vetting/i,
        /\bsäkerhetsprövning\b(?![^.]*inte)(?=[^.]*\bbeskt\b)/i,
      ],
    },
    {
      rule: "Career Discovery data is candidate-owned and is never offered to an employer",
      patterns: [/career discovery/i, /karriäranalys/i, /karriärinriktning.{0,20}kandidat/i],
    },
    {
      rule: "no guarantee of an outcome",
      patterns: [
        /garanterar (jobb|anställning|rätt kandidat)/i,
        /guarantees? (a )?(job|hire|the right candidate)/i,
        /\bautomatisk matchning\b|\bautomatic (job )?match\b/i,
      ],
    },
  ];
  for (const lang of LANGS) {
    for (const { rule, patterns } of FORBIDDEN) {
      for (const rx of patterns) {
        ck(`${lang} · ${rule} — no "${rx.source}"`, !rx.test(text[lang]));
      }
    }
  }
  // And the sentence that must be there.
  ck(
    "sv: neither CQrityjob nor AI determines suitability, and the employer decides",
    /[Vv]arken CQrityjob eller AI avgör/.test(d("sv")["employers.disclaimer"]) &&
      /fattar och dokumenterar/.test(d("sv")["employers.disclaimer"]),
    d("sv")["employers.disclaimer"],
  );
  ck(
    "en: the same",
    /Neither CQrityjob nor AI determines/.test(d("en")["employers.disclaimer"]) &&
      /makes and documents/.test(d("en")["employers.disclaimer"]),
    d("en")["employers.disclaimer"],
  );
}

/* E7 ---------------------------------------------------------------- */
group("E7 · sv and en say the same thing, and the English page is English");
{
  const keys = (lang: Lang) =>
    Object.keys(dictionaries[lang])
      .filter((k) => k.startsWith("employers."))
      .sort();
  ck(
    "the same keys exist in both languages",
    JSON.stringify(keys("sv")) === JSON.stringify(keys("en")),
    keys("sv").filter((k) => !keys("en").includes(k)),
  );
  for (const key of keys("sv")) {
    for (const lang of LANGS) {
      ck(
        `${lang} "${key}" is non-empty`,
        typeof d(lang)[key] === "string" && d(lang)[key].trim().length > 0,
      );
    }
    ck(`"${key}" is actually translated`, d("sv")[key] !== d("en")[key], key);
  }
  ck(
    "same destinations, same order",
    JSON.stringify(hrefsOf(main.sv)) === JSON.stringify(hrefsOf(main.en)),
    JSON.stringify(hrefsOf(main.sv)),
  );
  ck(
    "same section ids",
    JSON.stringify([...main.sv.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1])) ===
      JSON.stringify([...main.en.matchAll(/<section[^>]*\bid="([a-z-]+)"/g)].map((m) => m[1])),
  );
  const diacritics = text.en.match(/[åäöÅÄÖ]/g) ?? [];
  ck(
    "no å/ä/ö anywhere on the English page",
    diacritics.length === 0,
    diacritics.length === 0
      ? ""
      : text.en
          .match(/\S*[åäöÅÄÖ]\S*/g)
          ?.slice(0, 6)
          .join(", "),
  );
  const literals = [...pageCode.matchAll(/"([^"\n]*[åäöÅÄÖ][^"\n]*)"/g)].map((m) => m[1]);
  ck("no Swedish string literal remains in the route", literals.length === 0, literals.join(" · "));
}

/* -------------------------------------------------------------------- */
console.log("");
if (fails.length > 0) {
  console.error(`employer-landing:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("employer-landing:check OK");
