// The employer landing page (/employers) — asserted against the RENDERED
// markup and the dictionaries, in both languages.
//
// ── WHY THIS GUARD EXISTS ──────────────────────────────────────────────
//
// /employers used to be four abstract benefit tiles and a contact form, and
// nothing in CI said anything about what it claimed. It now describes two
// ways of working — the platform, used by the employer, and recruitment
// services — and names TRUST and BESKT, where an over-claim would be the
// most expensive on the public site. So the page gets a guard of its own
// (rewritten for the owner-approved page, 2026-09-30):
//
//   E1  one h1, the approved copy, and a sane heading hierarchy
//   E2  the actions, through the ONE door, with /employer as a validated
//       return path — no role granted by intent — plus the working contact
//       path, and the sections the header's "För arbetsgivare" menu opens
//   E3  the release flag still fails closed: rendered with the portal off,
//       there is no entrance on this page at all
//   E4  the platform journey is ANNONSERA → TA EMOT OCH HANTERA → BEDÖM →
//       INTERVJUA → BESLUTA, ending in a documented HUMAN decision, then
//       development
//   E5  the benefit comes before the method: a fair structured assessment
//       before TRUST and BESKT, a structured interview before Interview
//       Intelligence — and BESKT's boundary and availability are stated
//       where it is read
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
    // The journey, assessment, interview and the two ways of working.
    ck(
      `${lang}: four h2 — journey, assessment, interview, recruitment services`,
      JSON.stringify(headings(main[lang], "h2")) ===
        JSON.stringify([
          d(lang)["employers.path.title"],
          d(lang)["employers.assessment.title"],
          d(lang)["employers.interview.title"],
          d(lang)["employers.services.title"],
        ]),
      headings(main[lang], "h2"),
    );
    // Five steps, the continuation, TRUST, BESKT, Interview Intelligence,
    // and the two ways of working.
    ck(
      `${lang}: eleven h3 — five steps, the continuation, three methods, two ways of working`,
      headings(main[lang], "h3").length === 11,
      headings(main[lang], "h3").length,
    );
  }
  // Owner review, 2026-09-30: both ways of working, said at once.
  ck(
    "sv h1 is the approved sentence",
    d("sv")["employers.title"] === "Rekrytera säkerhetspersonal – själva eller med vår hjälp",
    d("sv")["employers.title"],
  );
  ck(
    "en h1 is the approved sentence",
    d("en")["employers.title"] === "Recruit security professionals – yourselves or with our help",
    d("en")["employers.title"],
  );
  ck(
    "sv lead says what the platform does and that CQrityjob can help all the way",
    /annonserar ni, tar emot ansökningar, bedömer kandidater och genomför strukturerade intervjuer/.test(
      d("sv")["employers.lead"],
    ) && /hjälper vi er med rekryteringen/.test(d("sv")["employers.lead"]),
    d("sv")["employers.lead"],
  );
  ck(
    'sv: "ta emot ansökningar", never "samla ansökningar"',
    !Object.entries(d("sv")).some(
      ([k, v]) =>
        (k.startsWith("employers.") || k.startsWith("home.")) && /samla ansökningar/i.test(v),
    ),
  );
  for (const lang of LANGS) {
    ck(`${lang}: the h1 is rendered`, headings(main[lang], "h1")[0] === d(lang)["employers.title"]);
    ck(`${lang}: the lead is rendered`, text[lang].includes(d(lang)["employers.lead"]));
  }
  // Retired copy is gone from the MARKUP and the dictionary, not hidden.
  const RETIRED = [
    "employers.offer.recruit.title",
    "employers.offer.assess.title",
    "employers.offer.develop.title",
    "employers.offer.verify.title",
    "employers.cta.createAccount",
    "employers.examples.title",
    "employers.example.ordinary.title",
    "employers.example.protective.title",
    "employers.crossLink.lead",
  ];
  for (const lang of LANGS) {
    for (const key of RETIRED) {
      ck(`${lang}: the retired key "${key}" is deleted`, !(key in dictionaries[lang]));
    }
  }
}

/* E2 ---------------------------------------------------------------- */
group("E2 · the actions, through the ONE door, and a contact path that works");
{
  const hrefs = hrefsOf(main.sv);
  ck(
    "exactly these destinations, in this order: register · how it works · sign in · register (way A) · contact (way B)",
    JSON.stringify(hrefs) ===
      JSON.stringify([
        "/signup?redirect=%2Femployer",
        "#how-it-works",
        "/login?redirect=%2Femployer",
        "/signup?redirect=%2Femployer",
        "/contact",
      ]),
    hrefs,
  );
  ck("the secondary action's target exists", main.sv.includes('id="how-it-works"'));
  // The header's "För arbetsgivare" menu opens these sections.
  for (const id of ["how-it-works", "bedomning", "intervju", "rekrytering", "interim"]) {
    ck(`the section #${id} exists`, main.sv.includes(`id="${id}"`));
  }
  ck(
    '"Logga in" is a plain link, not a third button',
    /data-employer-login/.test(main.sv) && !/<PrimaryLink[^>]*to="\/login"/.test(pageCode),
  );
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
  // The contact path SENDS — it is no longer the dead form this guard once
  // kept off the page — and says it is closed when mail is not configured.
  const contact = code(read("src/routes/contact.tsx"));
  ck(
    "the contact page submits through the server and has an honest closed state",
    contact.includes("sendRecruitmentEnquiry") &&
      contact.includes("getRecruitmentEnquiryAvailability") &&
      contact.includes("data-contact-closed"),
  );
}

/* E3 ---------------------------------------------------------------- */
group("E3 · the release flag still fails closed");
{
  ck(
    "the page reads the flag once, at render",
    pageCode.includes("const portalOpen = employerPortalEnabled();"),
  );
  const before = process.env.VITE_EMPLOYER_PORTAL_ENABLED;
  process.env.VITE_EMPLOYER_PORTAL_ENABLED = "false";
  const closedHtml = mainOf(
    renderToStaticMarkup(
      <I18nProvider initialLang="sv">
        <Page />
      </I18nProvider>,
    ),
  );
  if (before === undefined) delete process.env.VITE_EMPLOYER_PORTAL_ENABLED;
  else process.env.VITE_EMPLOYER_PORTAL_ENABLED = before;
  const closedHrefs = hrefsOf(closedHtml);
  ck(
    "rendered with the portal off, there is no entrance at all",
    !closedHrefs.some((h) => h.startsWith("/signup") || h.startsWith("/login")),
    closedHrefs,
  );
  ck(
    "and the page still explains the platform and offers its same-page anchor",
    closedHrefs.includes("#how-it-works") && closedHtml.includes('id="how-it-works"'),
    closedHrefs,
  );
  const flag = read("src/lib/job-intelligence/feature-flag.ts");
  ck("an unset variable is not enabled", flag.includes('String(raw).toLowerCase() === "true"'));
  ck("and the flag is release control, not a boundary", flag.includes("NOT a security boundary"));
}

/* E4 ---------------------------------------------------------------- */
group("E4 · the platform journey, ending in a documented human decision");
{
  const LOCKED = {
    sv: ["Annonsera", "Ta emot och hantera", "Bedöm", "Intervjua", "Besluta"],
    en: ["Advertise", "Receive and manage", "Assess", "Interview", "Decide"],
  } as const;
  for (const lang of LANGS) {
    const steps = headings(main[lang], "h3").slice(0, 5);
    for (let i = 1; i <= 5; i++) {
      ck(
        `${lang}: step ${i} is "${LOCKED[lang][i - 1]}"`,
        steps[i - 1] === LOCKED[lang][i - 1] &&
          d(lang)[`employers.path.step${i}.title`] === LOCKED[lang][i - 1],
        steps[i - 1],
      );
      ck(
        `${lang}: step ${i} has a body`,
        text[lang].includes(d(lang)[`employers.path.step${i}.body`]),
      );
    }
  }
  ck("it is an ordered list", main.sv.includes("<ol"));
  ck(
    "the ordered list holds exactly five steps",
    (main.sv.match(/<ol[\s\S]*?<\/ol>/)?.[0].match(/<li\b/g) ?? []).length === 5,
    (main.sv.match(/<ol[\s\S]*?<\/ol>/)?.[0].match(/<li\b/g) ?? []).length,
  );
  // The continuation: present, outside the list, and not numbered.
  for (const lang of LANGS) {
    ck(
      `${lang}: the continuation is rendered outside the five`,
      text[lang].includes(d(lang)["employers.path.continuation"]) &&
        text[lang].includes(d(lang)["employers.path.step6.title"]) &&
        text[lang].includes(d(lang)["employers.path.step6.body"]),
    );
    ck(
      `${lang}: and it is not numbered as a sixth step`,
      !(main[lang].match(/<ol[\s\S]*?<\/ol>/)?.[0] ?? "").includes(
        d(lang)["employers.path.step6.title"],
      ),
    );
  }
  // Step 5 is the one the page exists to make unmistakable: the EMPLOYER
  // decides, and the decision is documented.
  ck(
    "sv step 5 says the employer makes and documents the decision",
    /Ni fattar och dokumenterar beslutet/.test(d("sv")["employers.path.step5.body"]),
    `${d("sv")["employers.path.step5.title"]} — ${d("sv")["employers.path.step5.body"]}`,
  );
  ck(
    "en step 5 says the same",
    /You make and document the decision/.test(d("en")["employers.path.step5.body"]),
    `${d("en")["employers.path.step5.title"]} — ${d("en")["employers.path.step5.body"]}`,
  );
}

/* E5 ---------------------------------------------------------------- */
group("E5 · the benefit before the method, and the BESKT boundary");
{
  for (const lang of LANGS) {
    const t = text[lang];
    const at = (key: string) => t.indexOf(d(lang)[key]);
    ck(
      `${lang}: the structured assessment is explained before TRUST and BESKT`,
      at("employers.assessment.body") !== -1 &&
        at("employers.assessment.body") < at("employers.assessment.trust.body") &&
        at("employers.assessment.trust.body") < at("employers.assessment.beskt.body"),
    );
    ck(
      `${lang}: the structured interview is explained before Interview Intelligence`,
      at("employers.interview.body") !== -1 &&
        at("employers.interview.body") < at("employers.interview.tool.body"),
    );
    ck(
      `${lang}: the BESKT boundary is rendered`,
      t.includes(d(lang)["employers.assessment.beskt.body"]),
    );
    ck(
      `${lang}: the BESKT availability state is rendered`,
      t.includes(d(lang)["employers.assessment.beskt.availability"]),
    );
    ck(`${lang}: the decision disclaimer is rendered`, t.includes(d(lang)["employers.disclaimer"]));
    ck(
      `${lang}: the two ways of working are both offered`,
      t.includes(d(lang)["employers.services.self.title"]) &&
        t.includes(d(lang)["employers.services.help.title"]),
    );
  }
  // ── WHAT THE BESKT SENTENCES MUST ACTUALLY SAY ────────────────────
  //
  // Not a paraphrase. A method, with no result, no score and no ranking,
  // and explicitly NOT säkerhetsprövning — which is the employer's own
  // legal duty and something CQrityjob has no authority over.
  const besktSv = d("sv")["employers.assessment.beskt.body"];
  const besktEn = d("en")["employers.assessment.beskt.body"];
  ck(
    "sv: BESKT is a method, gives no result/score/ranking, and is not säkerhetsprövning",
    /metodstöd/i.test(besktSv) &&
      /inget resultat/i.test(besktSv) &&
      /ingen poäng/i.test(besktSv) &&
      /ingen rangordning/i.test(besktSv) &&
      /ersätter inte säkerhetsprövning/i.test(besktSv),
    besktSv,
  );
  ck(
    "en: the same four claims",
    /method support/i.test(besktEn) &&
      /no result/i.test(besktEn) &&
      /no score/i.test(besktEn) &&
      /no ranking/i.test(besktEn) &&
      /does not replace security vetting/i.test(besktEn),
    besktEn,
  );
  // ── AND IT IS NOT PRESENTED AS AVAILABLE ──────────────────────────
  //
  // Release gate C (a published BESKT method) is not met in production, and
  // BESKT is assignable only under an owner-issued, time-boxed pilot grant.
  ck(
    "sv: availability is stated as under development and approval-gated",
    /under utveckling/i.test(d("sv")["employers.assessment.beskt.availability"]) &&
      /godkännande/i.test(d("sv")["employers.assessment.beskt.availability"]),
    d("sv")["employers.assessment.beskt.availability"],
  );
  ck(
    "en: the same",
    /under development/i.test(d("en")["employers.assessment.beskt.availability"]) &&
      /approval/i.test(d("en")["employers.assessment.beskt.availability"]),
    d("en")["employers.assessment.beskt.availability"],
  );
  // ── TRUST IS NOT OVERSOLD ─────────────────────────────────────────
  ck(
    "sv: TRUST is research-informed and NOT scientifically validated as a whole",
    /inte vetenskapligt validerad/i.test(d("sv")["employers.assessment.trust.body"]),
    d("sv")["employers.assessment.trust.body"],
  );
  ck(
    "en: the same",
    /not scientifically validated/i.test(d("en")["employers.assessment.trust.body"]),
    d("en")["employers.assessment.trust.body"],
  );
  for (const lang of LANGS) {
    ck(
      `${lang}: no claim that anything predicts performance or is free of bias`,
      !/förutsäger|predicts?|bias-?free|fri från (bias|partiskhet)|validerad metod|validated method/i.test(
        text[lang],
      ),
    );
  }
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
  const PROPER_NAMES = new Set([
    "employers.assessment.eyebrow",
    "employers.assessment.trust.title",
    "employers.assessment.beskt.title",
    "employers.interview.tool.title",
    "employers.services.executive.title",
  ]);
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
    // Method and product names are names, and read the same in both.
    if (!PROPER_NAMES.has(key)) {
      ck(`"${key}" is actually translated`, d("sv")[key] !== d("en")[key], key);
    } else {
      ck(`"${key}" is the same name in both languages`, d("sv")[key] === d("en")[key], key);
    }
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
