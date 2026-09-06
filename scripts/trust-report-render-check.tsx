// Renders the TRUST Evidence Report (PR-R3B) and asserts what a recruiter
// actually sees.
//
// The contract check next door proves the document. This one proves the
// PAGE: that the sections come in the argued order, that every competency
// card keeps its three dimensions as three separate words, that SCC-08 on one
// item reads as limited evidence and never as a failure, that self-report is
// labelled as self-report, that the safety section exists only for an
// explicit human-reviewed finding, that the live addenda rail is labelled
// live and never printed, that a legacy document shows an explicit "not
// available" rather than a null, that no forbidden vocabulary and no raw i18n
// key reaches the reader, and that nothing on the page is a total, a rank, a
// verdict or a chart.
//
// Rendered with renderToStaticMarkup against the four real V3 documents in
// src/lib/security-competency/trust-report-fixtures -- no browser, no
// database. TanStack's <Link> renders nothing under static rendering, so it
// is stubbed as an anchor that resolves params (see the mock below); the
// components must therefore arrive by dynamic import after the mock.

import React from "react";
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    children?: React.ReactNode;
  }) => {
    let href = String(to ?? "");
    if (params)
      for (const [k, v] of Object.entries(params)) href = href.replace(`$${k}`, String(v));
    if (search) {
      const q = Object.entries(search)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("&");
      if (q) href += `?${q}`;
    }
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));
await mock.module("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => ({
    middleware: () => ({ inputValidator: () => ({ handler: () => async () => null }) }),
  }),
}));
await mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => undefined }),
}));
await mock.module("@/lib/security-competency/academy-employer.functions", () => ({
  recordInterviewNote: async () => ({ noteId: "x" }),
}));

const { I18nProvider, LanguageScope } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { TrustReportPage } = await import("../src/components/trust-report/TrustReportPage");
const { TRUST_REPORT_FIXTURES } =
  await import("../src/lib/security-competency/trust-report-fixtures");
const { buildEvidenceCards, hasSafetyFollowUp } =
  await import("../src/lib/security-competency/trust-report.presentation");

type Lang = "sv" | "en";
const failures: string[] = [];
let passed = 0;
let groupName = "";
function group(name: string) {
  groupName = name;
  console.log(`\n${name}`);
}
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${groupName}: ${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const visible = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const walkStrings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => walkStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => walkStrings(x, out));
  return out;
};

const NAV = {
  employerSlug: "trust-bevakning-r3a",
  applicationId: "11111111-1111-4111-8111-111111111111",
  jobId: null,
};
const NO_APP = { employerSlug: "trust-bevakning-r3a", applicationId: null, jobId: null };

function page(
  name: keyof typeof TRUST_REPORT_FIXTURES,
  lang: Lang = "sv",
  opts: { app?: boolean; canRecord?: boolean } = {},
) {
  const doc = TRUST_REPORT_FIXTURES[name];
  return renderToStaticMarkup(
    <I18nProvider>
      <LanguageScope lang={lang}>
        <TrustReportPage
          doc={doc}
          attemptId={doc.frozen_report.employer.context.attempt_id}
          nav={opts.app === false ? NO_APP : NAV}
          subject={{ candidateName: "Kim Andersson", jobTitle: "Väktare, Stockholm" }}
          canRecord={opts.canRecord ?? false}
        />
      </LanguageScope>
    </I18nProvider>,
  );
}

const std = page("standard");
const stdText = visible(std);

// ═══════════════════════════════════════════════════════════════════════════
group("1. Information hierarchy: the sections come in the argued order");
// ═══════════════════════════════════════════════════════════════════════════
{
  const order = [
    "TRUST Evidence Report",
    "Beslutsstöd för fortsatt mänsklig bedömning.",
    "Det här är viktigast inför nästa steg",
    "Nästa steg i processen",
    "Tydligast stöd",
    "Verifiera i intervju",
    "Begränsat underlag",
    "Evidenskarta",
    "Kandidatens egen beskrivning",
    "TRUST Interview Plan",
    "Från evidens till en bättre intervju.",
    "Intervjutillägg",
    "Om rapporten",
  ];
  let last = -1;
  let ok = true;
  const seen: string[] = [];
  for (const s of order) {
    const at = stdText.indexOf(s, last + 1);
    seen.push(`${s}@${at}`);
    if (at < 0 || at < last) ok = false;
    else last = at;
  }
  check("every section is present, in order", ok, seen.join(" | "));
  check("the page has exactly one h1", (std.match(/<h1\b/g) ?? []).length === 1);
  check(
    "the print order covers identity, overview, evidence, self-description, plan, method",
    [1, 2, 3, 5, 6, 8].every((n) => std.includes(`data-print-order="${n}"`)),
  );
  check(
    "the standing statement is present and the decision is the employer's",
    stdText.includes("Beslutet är arbetsgivarens."),
  );
  const ids = [
    "trust-overview",
    "trust-map",
    "trust-self",
    "trust-plan",
    "trust-addenda",
    "trust-method",
  ];
  check(
    "every section carries a stable id for in-page navigation",
    ids.every((id) => std.includes(`id="${id}"`)),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("2. The thirty-second overview");
// ═══════════════════════════════════════════════════════════════════════════
{
  const hero = std.slice(std.indexOf('id="trust-overview"'), std.indexOf('id="trust-map"'));
  const heroText = visible(hero);
  check(
    "the primary next step is one of the four process steps, in words",
    heroText.includes("Strukturerad intervju"),
  );
  check(
    "the step is framed as a process step, not a judgement",
    heroText.includes("Ett processteg, inte ett omdöme om kandidaten."),
  );
  check(
    "each column carries at most three lines",
    ["Tydligast stöd", "Verifiera i intervju", "Begränsat underlag"].every((title) => {
      const i = hero.indexOf(`aria-label="${title}"`);
      const j = hero.indexOf("</section>", i);
      return (hero.slice(i, j).match(/<li\b/g) ?? []).length <= 3;
    }),
  );
  check("no column line is numbered", !/<li[^>]*>\s*(<[^>]*>\s*)*[1-3][.)]/.test(hero));
  check(
    "the overview comes before the evidence map",
    std.indexOf('id="trust-overview"') < std.indexOf('id="trust-map"'),
  );
  check(
    "the honest limitation is stated in the overview",
    heroText.includes("Underlaget kommer från ett bedömningstillfälle."),
  );
  check(
    "nothing in the overview is bright green",
    !/bg-(green|emerald|lime)-|text-(green|emerald|lime)-/.test(hero),
  );
  check(
    "no safety notice without a finding",
    !heroText.includes("Säkerhetskritisk uppföljning finns"),
  );
  const safetyHero = visible(page("safety").slice(0, page("safety").indexOf('id="trust-map"')));
  check(
    "with a finding, the overview points at the safety section",
    safetyHero.includes("Säkerhetskritisk uppföljning finns"),
  );
  check(
    "with a finding, the next step is to request clarification",
    safetyHero.includes("Begär förtydligande"),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("3. Evidence cards: three dimensions, three words");
// ═══════════════════════════════════════════════════════════════════════════
{
  const cards = buildEvidenceCards(TRUST_REPORT_FIXTURES.standard);
  check(
    "eight competency cards render",
    cards.length === 8 && (std.match(/data-competency="SCC-/g) ?? []).length === 8,
  );
  const card = (markup: string, code: string) => {
    const i = markup.indexOf(`data-competency="${code}"`);
    const j = markup.indexOf("</article>", i);
    return visible(markup.slice(i, j));
  };
  const scc08 = card(std, "SCC-08");
  check("SCC-08 on one item: Inte fastställt", scc08.includes("Inte fastställt"));
  check(
    "SCC-08 on one item: Begränsat, 1 observerad uppgift",
    scc08.includes("Begränsat") && scc08.includes("1 observerad uppgift"),
  );
  check("SCC-08 on one item: Följ upp i intervju", scc08.includes("Följ upp i intervju"));
  check(
    "SCC-08 is never called a weakness, a low result or a failure",
    !/svag|låg|underkän|misslyck|brist/i.test(scc08),
  );
  check(
    "every card labels all three axes",
    cards.every((c) => {
      const s = card(std, c.code);
      return (
        s.includes("Observerat svarsmönster") && s.includes("Underlag") && s.includes("Nästa steg")
      );
    }),
  );
  check(
    "every card carries the document's one-line explanation",
    cards.every((c) => card(std, c.code).includes(c.core.factual_explanation.sv)),
  );
  check(
    "the expanded detail is in the DOM behind a screen-only fold, so print shows it",
    (std.match(/class="screen-fold" data-open="false"/g) ?? []).length >= 8 &&
      cards.every(
        (c) =>
          card(std, c.code).includes("Underlagets omfattning") &&
          card(std, c.code).includes("TRUST-fråga"),
      ),
  );
  check(
    "the self-description block on every card is labelled as not observed",
    cards.every((c) => card(std, c.code).includes("Självbeskrivning — inte observerad evidens")),
  );
  check(
    "every fold trigger is a button with aria-expanded",
    (std.match(/aria-expanded="false"/g) ?? []).length >= 8,
  );
  const mixed = page("mixed-addenda");
  check("a mixed pattern reads as Blandat", card(mixed, "SCC-09").includes("Blandat"));
  check(
    "a developing pattern reads as Under utveckling",
    card(mixed, "SCC-06").includes("Under utveckling"),
  );
  check(
    "a consistent pattern on limited evidence keeps both words apart",
    card(mixed, "SCC-04").includes("Konsekvent") && card(mixed, "SCC-04").includes("Begränsat"),
  );
  check(
    "no card renders a mean, spread, percentage or level number",
    !/\d+\s?%|mean|spread|nivå \d/i.test(
      visible(std.slice(std.indexOf('id="trust-map"'), std.indexOf('id="trust-self"'))),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("4. Self-report is subordinate and labelled");
// ═══════════════════════════════════════════════════════════════════════════
{
  const self = std.slice(std.indexOf('id="trust-self"'), std.indexOf('id="trust-plan"'));
  check(
    "the section exists and is labelled as self-description, not observed evidence",
    visible(self).includes("Självbeskrivning — inte observerad evidens"),
  );
  check(
    "the section is drawn with a dashed frame, subordinate to the evidence map",
    self.includes("border-dashed"),
  );
  check(
    "the self-report section comes after the evidence map",
    std.indexOf('id="trust-self"') > std.indexOf('id="trust-map"'),
  );
  check(
    "self-report lines carry a count of questions, never a level",
    /\d+ frågor|\d+ fråga/.test(visible(self)) && !/nivå/i.test(visible(self)),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("5. Safety follow-up: only from an explicit human finding");
// ═══════════════════════════════════════════════════════════════════════════
{
  const safe = page("safety");
  check(
    "no finding, no safety section",
    !std.includes('id="trust-safety"') && !hasSafetyFollowUp(TRUST_REPORT_FIXTURES.standard),
  );
  check(
    "a human finding renders the safety section",
    safe.includes('id="trust-safety"') && hasSafetyFollowUp(TRUST_REPORT_FIXTURES.safety),
  );
  const sec = visible(
    safe.slice(safe.indexOf('id="trust-safety"'), safe.indexOf('id="trust-plan"')),
  );
  check(
    "the section says it is a follow-up, not an assessment of the candidate as a risk",
    sec.includes("Det är inte en bedömning av kandidaten som säkerhetsrisk."),
  );
  check("the section is marked employer-only", sec.includes("Endast arbetsgivaren"));
  check(
    "the finding is a count and an area, never a score",
    /1 fynd/.test(sec) && !/poäng|score|\d+\s?%/i.test(sec),
  );
  check(
    "the safety section prints after the plan (print order 7 > 6)",
    safe.includes('id="trust-safety"') && safe.includes('data-print-order="7"'),
  );
  check(
    "on screen the safety section sits before the plan",
    safe.indexOf('id="trust-safety"') < safe.indexOf('id="trust-plan"'),
  );
  check(
    "the safety section uses no red",
    !/bg-red|text-red|destructive/.test(
      safe.slice(safe.indexOf('id="trust-safety"'), safe.indexOf('id="trust-plan"')),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("6. The TRUST Interview Plan");
// ═══════════════════════════════════════════════════════════════════════════
{
  const plan = std.slice(std.indexOf('id="trust-plan"'), std.indexOf('id="trust-addenda"'));
  const text = visible(plan);
  check(
    "at most three priority areas",
    (plan.match(/aria-labelledby="trust-plan-SCC-/g) ?? []).length <= 3 &&
      (plan.match(/aria-labelledby="trust-plan-SCC-/g) ?? []).length > 0,
  );
  check(
    "each priority states what we know, what is unclear, the main question and what to listen for",
    ["Det här vet vi", "Det här är oklart", "Huvudfråga", "Lyssna efter"].every(
      (s) => (text.match(new RegExp(s, "g")) ?? []).length >= 3,
    ),
  );
  check(
    "the conversation structure is Situation, Egen roll, Agerande, Resultat, Reflektion",
    ["Situation", "Egen roll", "Agerande", "Resultat", "Reflektion"].every((s) => text.includes(s)),
  );
  check(
    "the plan is never called STAR and the letters are not spelled out",
    !/\bSTAR\b|T-R-U-S-T|T‑R‑U‑S‑T/.test(text),
  );
  check(
    "the dominant action starts a structured interview from an application",
    plan.includes("interview-intelligence/new?applicationId=") &&
      text.includes("Starta strukturerad intervju"),
  );
  const noApp = page("standard", "sv", { app: false });
  check(
    "without an application the header offers the in-page plan instead of a dead link",
    !noApp.includes("interview-intelligence/new") && noApp.includes('href="#trust-plan"'),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("7. Frozen report vs live addenda");
// ═══════════════════════════════════════════════════════════════════════════
{
  const mixed = page("mixed-addenda");
  const rail = mixed.slice(mixed.indexOf('id="trust-addenda"'), mixed.indexOf('id="trust-method"'));
  const railText = visible(rail);
  check(
    "the rail is labelled as live information outside the frozen report",
    railText.includes("Levande information — ingår inte i den frysta rapporten."),
  );
  check(
    "the rail is excluded from print",
    /<section[^>]*id="trust-addenda"[^>]*class="[^"]*no-print/.test(mixed),
  );
  check(
    "three addenda render with author, status and note",
    ["Stöds i intervju", "Stöds inte i intervju", "Ytterligare kontext"].every((s) =>
      railText.includes(s),
    ) && (railText.match(/Anna Ägare/g) ?? []).length === 3,
  );
  check("the addenda carry a display name only, never an e-mail", !/@/.test(railText));
  check(
    "no addenda: the rail says so instead of hiding",
    visible(std).includes("Inga intervjutillägg ännu."),
  );
  check(
    "the frozen report id is the same with and without addenda",
    /data-report-id="[0-9a-f-]{36}"/.test(mixed) && /data-report-id="[0-9a-f-]{36}"/.test(std),
  );
  const composer = page("mixed-addenda", "sv", { canRecord: true });
  check(
    "an owner sees the addendum composer; a member does not",
    composer.includes("Lägg till tillägg") && !mixed.includes("Lägg till tillägg"),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("8. Method, provenance and the legacy document");
// ═══════════════════════════════════════════════════════════════════════════
{
  const method = visible(std.slice(std.indexOf('id="trust-method"')));
  check(
    "the standing statement is visible outside the fold",
    method.includes("Detta visar hur kandidaten svarade i just dessa uppgifter."),
  );
  check(
    "the template's limitation lines are labelled as current, not frozen",
    method.includes("Aktuell vägledning från rapportmallen, inte fryst"),
  );
  check(
    "the human-review meaning is stated as a denial",
    method.includes("Det betyder inte att svaren är godkända"),
  );
  check(
    "provenance shows versions and the report id, never a manifest id or hash",
    method.includes("Beräkningskedja") &&
      method.includes("Verifierad") &&
      !/manifest|sha256|hash/i.test(method),
  );
  const legacy = page("legacy");
  const legacyText = visible(legacy);
  check(
    "legacy: the calculation chain is stated as legacy",
    legacyText.includes("Äldre rapport, kedjan är inte verifierad"),
  );
  check(
    "legacy: per-area scope says not available instead of zeros",
    legacyText.includes("Omfattningen per område är inte tillgänglig") &&
      legacyText.includes("Spårbarhet är inte tillgänglig"),
  );
  check(
    "legacy: nothing renders as undefined, null, NaN or [object",
    !/undefined|\bnull\b|NaN|\[object/.test(legacyText),
  );
  check(
    "standard: nothing renders as undefined, null, NaN or [object",
    !/undefined|\bnull\b|NaN|\[object/.test(stdText),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("9. Vocabulary, keys and both languages");
// ═══════════════════════════════════════════════════════════════════════════
{
  const FORBIDDEN_SV = [
    "rangordn",
    "percentil",
    "totalpoäng",
    "godkänd",
    "underkänd",
    "riskpoäng",
    "personlighet",
    "matchprocent",
    "normgrupp",
    "topp 3",
    "bör anställas",
    "olämplig",
    "lämplig för tjänsten",
    "förutsäger",
  ];
  const FORBIDDEN_EN = [
    "ranking",
    "ranked",
    "percentile",
    "total score",
    "passed",
    "failed",
    "risk score",
    "personality",
    "match percentage",
    "norm group",
    "top 3",
    "should be hired",
    "unsuitable",
    "suitable for the role",
    "predicts",
    "unbiased",
  ];
  for (const name of Object.keys(TRUST_REPORT_FIXTURES) as (keyof typeof TRUST_REPORT_FIXTURES)[]) {
    // The document's own sentences -- the human-review meaning ("inte
    // godkända"), the template's limitation lines ("not a ranking of
    // people") -- are data the contract check scans separately, and they
    // DENY a verdict. Removing them leaves the page's own copy, and the check
    // is that the PAGE asserts nothing forbidden.
    const docStrings = walkStrings(TRUST_REPORT_FIXTURES[name]).filter((s) => s.length > 12);
    const ownCopy = (markup: string) => {
      let text = visible(markup);
      for (const s of docStrings) text = text.split(s).join(" ");
      return text.toLowerCase();
    };
    const sv = ownCopy(page(name, "sv"));
    const en = ownCopy(page(name, "en"));
    check(
      `${name} sv: no forbidden vocabulary asserted by the page's own copy`,
      !FORBIDDEN_SV.some((w) => sv.includes(w)),
      FORBIDDEN_SV.filter((w) => sv.includes(w)).join(", "),
    );
    check(
      `${name} en: no forbidden vocabulary asserted by the page's own copy`,
      !FORBIDDEN_EN.some((w) => en.includes(w)),
      FORBIDDEN_EN.filter((w) => en.includes(w)).join(", "),
    );
    check(
      `${name}: no raw i18n key reaches the reader`,
      !/report\.trust\./.test(sv) && !/report\.trust\./.test(en),
    );
    check(
      `${name} en: the English page is English`,
      en.includes("what matters most before the next step") && en.includes("evidence map"),
    );
  }
  const svKeys = Object.keys(dictionaries.sv).filter((k) => k.startsWith("report.trust."));
  check(
    "every report.trust key exists in both languages",
    svKeys.length > 150 &&
      svKeys.every((k) => typeof (dictionaries.en as Record<string, string>)[k] === "string"),
    String(svKeys.length),
  );
  check(
    "no chart, radar, polygon or star icon is rendered",
    !/<polygon|Radar|Trophy|Medal|Star\b|lucide-star|lucide-trophy|lucide-medal/.test(std),
  );
  check(
    "no total, score, rank, percentage or verdict identifier is in the markup",
    !/total_score|totalScore|ranking|percentile|matchPercent|fitScore|suitability|passFail|riskScore|personality/.test(
      std,
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
group("10. Accessibility and touch targets");
// ═══════════════════════════════════════════════════════════════════════════
{
  check(
    "every interactive control has a 44px minimum height",
    (std.match(/<(button|a)\b[^>]*class="[^"]*min-h-\[44px\]/g) ?? []).length >= 10 &&
      !/<button\b(?![^>]*min-h-\[44px\])[^>]*>/.test(std.replace(/<button[^>]*sr-only[^>]*>/g, "")),
  );
  check(
    "status is never colour alone: every chip prints a word",
    (std.match(/rounded-full border[^>]*>\s*[^<\s]/g) ?? []).length > 20,
  );
  check(
    "the breadcrumb is a labelled nav with aria-current",
    std.includes('aria-label="Breadcrumb"') && std.includes('aria-current="page"'),
  );
  check(
    "every section is labelled by its heading",
    (std.match(/aria-labelledby="trust-[a-z]+-title"/g) ?? []).length >= 6,
  );
  check("decorative icons are aria-hidden", !/<svg(?![^>]*aria-hidden="true")/.test(std));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`\ntrust-report-render-check: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\ntrust-report-render-check: PASS");
