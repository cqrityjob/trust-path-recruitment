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
const passthrough =
  (tag: string) =>
  ({
    children,
    asChild,
    ...rest
  }: {
    children?: React.ReactNode;
    asChild?: boolean;
    [k: string]: unknown;
  }) =>
    asChild ? (children as React.ReactElement) : React.createElement(tag, rest, children);
await mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: passthrough("div"),
  DropdownMenuTrigger: passthrough("div"),
  DropdownMenuContent: passthrough("div"),
  DropdownMenuItem: passthrough("div"),
  DropdownMenuSeparator: passthrough("hr"),
}));
await mock.module("@/lib/security-competency/academy-employer.functions", () => ({
  recordInterviewNote: async () => ({ noteId: "x" }),
}));

const { I18nProvider, LanguageScope } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { TrustReportPage } = await import("../src/components/trust-report/TrustReportPage");
const { TRUST_REPORT_FIXTURES } =
  await import("../src/lib/security-competency/trust-report-fixtures");
const { repairPlurals } = await import("../src/lib/security-competency/trust-report.types");
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
    "Tydligast observerat stöd",
    "Verifiera i intervju",
    "Begränsat underlag",
    "Kompetensområden och underlag",
    "Kandidatens egen beskrivning",
    "TRUST Interview Plan",
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
    "the masthead carries the product identity and the report subtitle",
    std.includes("tr-masthead") &&
      stdText.includes("rityjob") &&
      stdText.includes("Från evidens till en bättre intervju."),
  );
  check(
    "the identity card is a white executive card: name, role, employer, released, human-reviewed, the standing sentence",
    std.includes("tr-identity-card") &&
      [
        "Kim Andersson",
        "Väktare, Stockholm",
        "Trust Bevakning R3A AB",
        "Mänskligt granskat",
        "Beslutsstöd för fortsatt mänsklig bedömning.",
      ].every((x) => stdText.includes(x)),
  );
  check(
    "the actions are one primary, one secondary and a More menu (plan, share, back)",
    stdText.includes("Starta strukturerad intervju") &&
      stdText.includes("Skriv ut / PDF") &&
      stdText.includes("Mer") &&
      stdText.includes("Dela internt") &&
      stdText.includes("Tillbaka till kandidatlistan"),
  );
  check(
    "the printed document is ordered as two parts: report then evidence appendix",
    [1, 2, 3, 4, 5, 7, 8, 9, 10, 11].every((n) => std.includes(`data-print-order="${n}"`)),
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
    "with a finding, the next step is to follow up before the next step",
    safetyHero.includes("Följ upp innan nästa steg"),
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
        s.includes("Mönster i observerade svar") &&
        s.includes("Underlag") &&
        s.includes("Nästa steg")
      );
    }),
  );
  check(
    "every card carries the document's one-line explanation",
    cards.every((c) => card(std, c.code).includes(repairPlurals(c.core.factual_explanation.sv))),
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
    "the section is drawn with a dashed frame and a soft surface, subordinate in evidential status",
    self.includes("border-dashed") && self.includes("bg-secondary/40"),
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
    /1 uppföljningspunkt/.test(sec) && !/poäng|score|\d+\s?%/i.test(sec),
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
    "each priority states what is known, what needs clarifying, the main question and what to listen for",
    ["Det här behöver klargöras", "Huvudfråga", "Lyssna efter"].every(
      (s) => (text.match(new RegExp(s, "g")) ?? []).length >= 3,
    ) && (text.match(/Det här uppger kandidaten|Det här finns i underlaget/g) ?? []).length >= 3,
  );
  check(
    "a priority built on the candidate's own account is not headlined as evidence",
    (() => {
      const doc = TRUST_REPORT_FIXTURES.standard;
      const selfFirst =
        doc.frozen_report.employer.trust_plan.priorities[0].target.evidence_type ===
        "self_reported";
      const firstBlock = plan.slice(plan.indexOf("trust-plan-"), plan.indexOf("Huvudfråga"));
      return selfFirst
        ? visible(firstBlock).includes("Det här uppger kandidaten")
        : visible(firstBlock).includes("Det här finns i underlaget");
    })(),
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
    railText.includes("Levande information") &&
      railText.includes("Ingår inte i den frysta rapporten."),
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
  const method = visible(
    std.slice(std.indexOf('id="trust-method"'), std.indexOf('id="trust-provenance"')),
  );
  check(
    "the standing statement is visible outside the fold",
    method.includes("Detta visar hur kandidaten svarade i just dessa uppgifter."),
  );
  check(
    "the template's limitation lines are labelled as current, not frozen",
    method.includes("Aktuell vägledning från rapportmallen — inte fryst"),
  );
  check(
    "the human-review meaning is stated as a denial",
    method.includes("Det betyder inte att svaren är godkända"),
  );
  check(
    "the reader's method section carries no version identifier",
    !/trust-evidence-core|det-v1|ras-v1|des-v2|rab-v1|attempt-v1/.test(method),
  );
  const prov = visible(std.slice(std.indexOf('id="trust-provenance"')));
  check(
    "technical traceability is its own compact section: versions, the report id, the chain",
    prov.includes("Teknisk spårbarhet") &&
      prov.includes("trust-evidence-core/v1") &&
      prov.includes("Verifierad") &&
      /[0-9a-f]{8}-[0-9a-f]{4}/.test(prov),
  );
  check("provenance names no manifest id and no hash", !/manifest|sha256|hash/i.test(prov));
  const legacy = page("legacy");
  const legacyText = visible(legacy);
  check(
    "legacy: the calculation chain is stated as legacy",
    legacyText.includes("Äldre rapport — beräkningskedjan kan inte verifieras"),
  );
  check(
    "legacy: per-area scope says not available instead of zeros",
    legacyText.includes("Omfattningen per område kan inte visas") &&
      legacyText.includes("Spårbarhet kan inte visas"),
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
      en.includes("what matters most before the next step") &&
        en.includes("competency areas and evidence"),
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
    (std.match(/<(button|a)\b[^>]*class="[^"]*(min-h-\[44px\]|\bh-11\b)/g) ?? []).length >= 10 &&
      !/<button\b(?![^>]*(min-h-\[44px\]|\bh-11\b))[^>]*>/.test(
        std.replace(/<button[^>]*sr-only[^>]*>/g, ""),
      ),
  );
  check(
    "status is never colour alone: every chip prints a word",
    (std.match(/rounded-md border[^"]*"[^>]*>(<span[^>]*><\/span>)?[^<\s]/g) ?? []).length > 20,
  );
  check(
    "the breadcrumb is a labelled nav with aria-current",
    std.includes('aria-label="Breadcrumb"') && std.includes('aria-current="page"'),
  );
  check(
    "every section is labelled by its heading",
    (std.match(/aria-labelledby="trust-[a-z]+-title"/g) ?? []).length >= 6,
  );
  check(
    "the three axes use three registers: a chip for the pattern, text for the evidence, an action label for the next step",
    /Mönster i observerade svar/.test(stdText) &&
      (std.match(/lucide-arrow-right/g) ?? []).length >= 3,
  );
  check("decorative icons are aria-hidden", !/<svg(?![^>]*aria-hidden="true")/.test(std));
}

// ═══════════════════════════════════════════════════════════════════════════
group("11. Professional language and the printed document");
// ═══════════════════════════════════════════════════════════════════════════
{
  for (const name of Object.keys(TRUST_REPORT_FIXTURES) as (keyof typeof TRUST_REPORT_FIXTURES)[]) {
    const sv = visible(page(name, "sv"));
    const en = visible(page(name, "en"));
    check(
      `${name}: no unresolved plural placeholder reaches the reader`,
      !/\w\([a-z]{1,3}\)/.test(sv) && !/\w\([a-z]{1,3}\)/.test(en),
      (sv.match(/\w\([a-z]{1,3}\)/g) ?? []).join(", "),
    );
    check(
      `${name}: no count is introduced by a bare adjective or category`,
      !/(^|\s)(granskade|Granskade|Besvarade|Sammanhang)\s+\d/.test(sv) &&
        !/(^|\s)(reviewed|Reviewed|Answered|Contexts)\s+\d/.test(en),
    );
  }
  check(
    "the report is completed, not released to a system",
    stdText.includes("Rapport färdigställd") && !stdText.includes("Frisläppt"),
  );
  check(
    "human review is stated as a completed review and denies approval in its own words",
    stdText.includes("Mänsklig granskning slutförd") &&
      visible(
        std.slice(std.indexOf('id="trust-method"'), std.indexOf('id="trust-provenance"')),
      ).includes("Det betyder inte att svaren är godkända"),
  );
  check(
    "evidence sufficiency says what it is sufficient FOR",
    stdText.includes("Tillräckligt underlag för tolkning"),
  );
  check(
    "the closed pilot is named as a pilot",
    stdText.includes("Stängd pilot") || stdText.includes("Pilotversion"),
  );
  const safe = visible(page("safety"));
  check(
    "safety-related follow-up never reads as a finding about the person",
    safe.includes("Säkerhetsrelaterad uppföljningspunkt") && !/\bfynd\b/i.test(safe),
  );
  check(
    "safety says what was identified and what it is not",
    safe.includes(
      "Ett svar inom ett säkerhetskritiskt område har identifierats för uppföljning i intervju.",
    ) && safe.includes("Det är inte en bedömning av kandidaten som säkerhetsrisk."),
  );
  check(
    "the printed document is in two parts, with the appendix behind the report",
    std.includes("tr-part-1") &&
      std.includes("tr-part-2") &&
      stdText.includes("Del 1 — Arbetsgivarrapport") &&
      stdText.includes("Del 2 — Underlagsbilaga"),
  );
  check(
    "part 1 carries the eight areas at a glance as one table",
    std.includes("tr-summary") &&
      (std.slice(std.indexOf("tr-summary")).match(/<tr>/g) ?? []).length >= 9,
  );
  check(
    "the summary states all three dimensions per area and no fourth thing",
    (() => {
      const tbl = visible(std.slice(std.indexOf("tr-summary"), std.indexOf('id="trust-map"')));
      return (
        tbl.includes("Mönster i observerade svar") &&
        tbl.includes("Kompetensområde") &&
        !/%|poäng/.test(tbl)
      );
    })(),
  );
  check("the live rail is ordered out of the printed document", /data-print-order="20"/.test(std));
}

// ═══════════════════════════════════════════════════════════════════════════
group("12. The legacy plural repair, and only the legacy plural repair");
// ═══════════════════════════════════════════════════════════════════════════
{
  // The four fixtures are real documents released BEFORE 20261030090000, so
  // they still carry the generator's old placeholder in their frozen text.
  // That is what makes them the regression: the repair has to fix exactly
  // this and leave everything else alone.
  const legacyPresent = Object.values(TRUST_REPORT_FIXTURES).some((d) =>
    JSON.stringify(d).includes("uppgift(er)"),
  );
  check("the fixtures really are documents released before the generator was fixed", legacyPresent);
  check(
    "one observed task: the Swedish reads 1 uppgift, the English 1 task",
    repairPlurals("Endast 1 uppgift(er) i den här bedömningen berörde området.") ===
      "Endast 1 uppgift i den här bedömningen berörde området." &&
      repairPlurals("Only 1 task(s) in this assessment touched this area.") ===
        "Only 1 task in this assessment touched this area.",
  );
  check(
    "more than one: the Swedish reads 2 uppgifter, the English 2 tasks",
    repairPlurals("Endast 2 uppgift(er) i den här bedömningen berörde området.") ===
      "Endast 2 uppgifter i den här bedömningen berörde området." &&
      repairPlurals("Only 2 task(s) in this assessment touched this area.") ===
        "Only 2 tasks in this assessment touched this area.",
  );
  check(
    "a sentence the current generator wrote passes through untouched",
    [
      "Endast 1 uppgift i den här bedömningen berörde området.",
      "Svaren höll en jämn och hög nivå över 4 uppgifter i den här bedömningen.",
      "Only 1 task in this assessment touched this area.",
      "Answers were consistently strong across 4 tasks in this assessment.",
    ].every((x) => repairPlurals(x) === x),
  );
  check(
    "the repair is idempotent",
    repairPlurals(repairPlurals("Endast 2 uppgift(er) berörde området.")) ===
      repairPlurals("Endast 2 uppgift(er) berörde området."),
  );
  check(
    "no other frozen prose is rewritten",
    [
      "Kandidaten (som är ny i rollen) beskriver ett eget exempel.",
      "Har en egen checklista (kort) i huvudet.",
      "Svaren skilde sig åt mellan jämförbara uppgifter (3 uppgifter, spännvidd 0.75).",
      "Rapporten omfattar 12 kompetensområden.",
    ].every((x) => repairPlurals(x) === x),
  );
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`\ntrust-report-render-check: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\ntrust-report-render-check: PASS");
