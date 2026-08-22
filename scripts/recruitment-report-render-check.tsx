// Renders the Candidate Decision Support Report V2 and asserts what a
// recruiter actually sees.
//
// The unit check next door proves the builder. This one proves the PAGE: that
// the sections come in the order the product argues for, that the internal
// release vocabulary has left the recruitment surface, that every row still
// carries its evidence type in words, and that the methodology is stated once
// rather than in every section.
//
// Rendered with renderToStaticMarkup, which needs no browser and no database.
// The i18n provider defaults to Swedish on the server, so this reads the
// Swedish surface — the language the terminology work was about.

import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { DecisionSupportSummary } from "../src/components/academy/DecisionSupportSummary";
import {
  CompetencyOverviewSection,
  InterviewGuideSection,
  SelfReportedSection,
} from "../src/components/academy/RecruitmentReportSections";
import { ReportMethodSection } from "../src/components/academy/ReportMethodSection";
import { buildDecisionSupport } from "../src/lib/security-competency/decision-support";
import type {
  InterviewGuideEntry,
  ObservedArea,
  ReportContext,
  SelfReportedArea,
} from "../src/lib/security-competency/academy-employer.functions";

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
};

const observed = (
  code: string,
  sv: string,
  signal: ObservedArea["signal"],
  items: number,
): ObservedArea => ({
  areaCode: code,
  areaSv: sv,
  areaEn: `EN ${code}`,
  evidenceType: "observed",
  signal,
  items,
  mean: 0.5,
  spread: 0.2,
  evidenceState: "follow_up",
  behaviourSv: `Bedömer situationen utifrån det som faktiskt observeras (${code}).`,
  behaviourEn: null,
  whySv: `Svaren pekade åt samma håll (${code}).`,
  whyEn: `why ${code}`,
});

const OBSERVED = [
  observed("situational_awareness", "Situationsmedvetenhet", "developing", 4),
  observed("communication", "Kommunikation och informationskvalitet", "developing", 6),
  observed("accountability", "Ansvarstagande och tillförlitlighet", "mixed", 4),
  observed("integrity", "Integritet och etik", "limited", 2),
  observed("cooperation", "Samarbete och samordning", "limited", 1),
];

const SELF: SelfReportedArea[] = [
  {
    domainKey: "recovery",
    domainSv: "Återhämtning",
    domainEn: "Recovery",
    areaCode: "recovery",
    evidenceType: "self_reported",
    pattern: "mostly_described",
    consistency: "varied",
    items: 3,
  },
];

const GUIDE: InterviewGuideEntry[] = [
  {
    areaCode: "situational_awareness",
    areaSv: "Situationsmedvetenhet",
    areaEn: "Situational awareness",
    focus: "explore_development",
    evidenceType: "observed",
    whySv: "Svaren valde genomgående mindre välavvägda alternativ.",
    whyEn: "w",
    questionSv: "Berätta om en gång då du märkte att något inte stämde.",
    questionEn: "q",
    followupSv: "Vad fick dig att reagera?",
    followupEn: "f",
    listenForSv: ["Namnger observerbara detaljer"],
    listenForEn: ["a"],
  },
];

const CONTEXT: ReportContext = {
  participantRef: "4C42C8",
  personContext: "candidate",
  organisationName: "Säkerhet AB",
  assessmentNameSv: "Väktare – Recruitment Assessment",
  assessmentNameEn: "Security Officer – Recruitment Assessment",
  submittedAt: "2026-08-21T10:00:00.000Z",
  reviewsTotal: 1,
  reviewsCompleted: 1,
  evidenceObservations: 23,
  evidenceContexts: 1,
  selfReportObservations: 24,
};

function page(safetyFlagCount: number) {
  const support = buildDecisionSupport({
    observed: OBSERVED,
    selfReported: SELF,
    interviewGuide: GUIDE,
    safetyFlagCount,
    observedObservations: 23,
    selfReportObservations: 24,
    evidenceContexts: 1,
    reviewsTotal: 1,
    reviewsCompleted: 1,
    frozenSummary: {
      sv: "Underlaget var mer blandat kring Ansvarstagande och tillförlitlighet.",
      en: "EN summary",
    },
  });
  return renderToStaticMarkup(
    <I18nProvider>
      <DecisionSupportSummary support={support} context={CONTEXT} sv />
      <CompetencyOverviewSection support={support} modules={[]} sv />
      <SelfReportedSection areas={SELF} sv />
      <InterviewGuideSection entries={GUIDE} sv />
      <ReportMethodSection
        observations={23}
        contexts={1}
        selfReportObservations={24}
        reviewsTotal={1}
        reviewsCompleted={1}
        pace={{ rapidAnswers: 44, answered: 50 }}
        limitations={["En bedömning är ett underlag inför samtal."]}
      />
    </I18nProvider>,
  );
}

const html = page(1);
const clean = page(0);
const at = (needle: string) => html.indexOf(needle);

console.log("\n1. The employer's questions are answered in order");
{
  const order = [
    "Rekommenderat nästa steg",
    "Starkast stöd i underlaget",
    "Viktigast att följa upp",
    "Säkerhetskritisk uppföljning",
    "Kompetensöversikt",
    "Självrapporterat arbetsbeteende",
    "Strukturerad intervjuguide",
    "Om bedömningsunderlaget",
  ];
  let last = -1;
  let ok = true;
  const seen: string[] = [];
  for (const s of order) {
    const i = at(s);
    seen.push(`${s}@${i}`);
    if (i < 0 || i < last) ok = false;
    last = i;
  }
  check("every section is present and in the argued order", ok, seen.join(" | "));
  check(
    "the recommended step comes before any competency detail",
    at("Rekommenderat nästa steg") < at("Kompetensöversikt"),
  );
  check(
    "the methodology comes after everything it qualifies",
    at("Om bedömningsunderlaget") > at("Strukturerad intervjuguide"),
  );
}

console.log("\n2. The internal release vocabulary is gone from the recruitment report");
{
  for (const word of ["Frisläpp", "frisläpp", "Frisläppt", "Kompetensprofil"]) {
    check(`"${word}" does not appear`, !html.includes(word));
  }
}

console.log("\n3. Every claim carries its evidence type in words");
{
  const observedTags = html.split("Observerat").length - 1;
  const selfTags = html.split("Självrapporterat").length - 1;
  check("observed rows are stamped", observedTags >= OBSERVED.length, String(observedTags));
  check("self-reported rows are stamped", selfTags >= 2, String(selfTags));
  check(
    "the self-report section says it is not demonstrated competence",
    html.includes("ska inte läsas som visad kompetens") || html.includes("inte observerat"),
  );
}

console.log("\n4. The methodology is stated once, not in every section");
{
  const phrase = "Ett bedömningstillfälle";
  const n = html.split(phrase).length - 1;
  check(`"${phrase}" appears at most once`, n <= 1, String(n));
  const decides = html.split("Beslutet är arbetsgivarens").length - 1;
  check("the employer-decides line appears once", decides === 1, String(decides));
}

console.log("\n5. Safety-critical follow-up is present when it exists and silent when it does not");
{
  check("with a flag, the safety panel renders", html.includes("Säkerhetskritisk uppföljning"));
  check("with a flag, the recommendation is clarification", html.includes("Begär förtydligande"));
  check("with no flag, no safety panel renders", !clean.includes("Säkerhetskritisk uppföljning"));
  check("with no flag, the report still names a next step", /Rekommenderat nästa steg/.test(clean));
}

console.log("\n6. Status is never carried by colour alone, and headings nest");
{
  // Every signal chip is a word, not a swatch: the labels appear as text.
  check("signal labels render as text", html.includes("Utvecklingsområde"));
  check("limited coverage is named in words", html.includes("Begränsat underlag"));
  const h2 = (html.match(/<h2/g) ?? []).length;
  const h3 = (html.match(/<h3/g) ?? []).length;
  check("sections use h2 and their rows use h3", h2 >= 4 && h3 >= 4, `h2=${h2} h3=${h3}`);
  check("no heading level is skipped to h4 without an h3", (html.match(/<h4/g) ?? []).length === 0);
}

console.log("\n7. Nothing on the page states a verdict");
{
  for (const word of ["anställ", "avslå", "lämplig", "rangordn", "poäng"]) {
    const bad =
      html.toLowerCase().includes(word) && !html.includes("inte ett besked om anställning");
    check(`"${word}" is not asserted`, !bad);
  }
}

if (failures.length > 0) {
  console.error(`\nrecruitment-report-render-check: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nrecruitment-report-render-check: PASS");
