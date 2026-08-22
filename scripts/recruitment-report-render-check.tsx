// Renders the Candidate Decision Support Report V2 and asserts what a
// recruiter actually sees.
//
// The unit check next door proves the builder. This one proves the PAGE: that
// the sections come in the order the product argues for, that the internal
// release vocabulary and competence development's vocabulary have both left the
// recruitment surface, that every row still carries its evidence type in words,
// that no panel announces an absence, and that the methodology is stated once
// rather than in every section.
//
// Rendered with renderToStaticMarkup against the real released brief in
// scripts/fixtures — no browser, no database, and no hand-tuned fixture that
// could flatter the layout. The i18n provider defaults to Swedish on the
// server, so this reads the Swedish surface.

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
import {
  candidateInput,
  CONTEXT,
  INTERVIEW_GUIDE,
  OBSERVED,
  PACE,
  SELF_REPORTED,
} from "./fixtures/released-candidate-brief";

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
};

function page(safetyFlagCount: number) {
  const support = buildDecisionSupport(candidateInput({ safetyFlagCount }));
  return renderToStaticMarkup(
    <I18nProvider>
      <DecisionSupportSummary support={support} context={CONTEXT} sv />
      <CompetencyOverviewSection support={support} modules={[]} sv />
      <SelfReportedSection areas={SELF_REPORTED} sv />
      <InterviewGuideSection entries={INTERVIEW_GUIDE} sv />
      <ReportMethodSection
        observations={23}
        contexts={1}
        selfReportObservations={24}
        reviewsTotal={1}
        reviewsCompleted={1}
        pace={PACE}
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
    "Säkerhetskritisk uppföljning",
    "Viktigast att följa upp",
    "Stabilaste signalerna i underlaget",
    "Begränsat underlag",
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

console.log("\n2. Vocabulary that belongs to another product is not on this page");
{
  // The internal release step.
  for (const word of ["Frisläpp", "frisläpp", "Frisläppt", "Kompetensprofil"]) {
    check(`"${word}" does not appear`, !html.includes(word));
  }
  // Competence development's reading of a signal, on a candidate nobody has met.
  check('"Utvecklingsområde" does not appear', !html.includes("Utvecklingsområde"));
  check('"För lite underlag" does not appear', !html.includes("För lite underlag"));
  check("the recruitment signal is used instead", html.includes("Behöver följas upp"));
}

console.log("\n3. No panel announces an absence");
{
  // This candidate has no observed strength. The panel must become the
  // steadiest signal that honestly exists, not a box saying there is none.
  check(
    "the empty-strength box is gone",
    !html.includes("Inget område nådde sammanhållet observerat underlag"),
  );
  check("the steadiest-signal panel took its place", html.includes("Stabilaste signalerna"));
  // Labelled as self-report on the face of the panel, not only in its lede:
  // every row inside carries the stamp, and none of them carries the observed
  // one, so nothing in this box can be read as demonstrated competence.
  const steadiest = html.slice(at("Stabilaste signalerna"), at("Kompetensöversikt"));
  check("the panel tells the reader to verify it in interview", steadiest.includes("intervju"));
  check("every row in it is stamped self-reported", steadiest.includes("Självrapporterat"));
  check("no row in it is stamped observed", !steadiest.includes(">Observerat<"));
  check("no follow-up empty state is rendered", !html.includes("Inget område utmärker sig"));
  check(
    "no uncertainty empty state is rendered",
    !html.includes("Inget område är särskilt osäkert"),
  );
}

console.log("\n4. The summary is short, and the panels are weighted");
{
  // Everything before the competency overview is the first screen.
  const firstScreen = html.slice(0, at("Kompetensöversikt"));
  const text = firstScreen
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  check(
    "the first screen is under 350 words",
    text.split(" ").length < 350,
    String(text.split(" ").length),
  );
  check(
    "safety spans the full row and the others do not",
    (html.match(/md:col-span-2/g) ?? []).length === 1,
  );
  check(
    "the thin-coverage line is a line, not a fourth panel of equal weight",
    html.includes("kompetensområden berördes för lite för att tolkas"),
  );
  check(
    "follow-up shows at most three areas",
    (firstScreen.match(/Följ upp:/g) ?? []).length <= 4,
    String((firstScreen.match(/Följ upp:/g) ?? []).length),
  );
}

console.log("\n5. Every claim carries its evidence type in words");
{
  const observedTags = html.split("Observerat").length - 1;
  const selfTags = html.split("Självrapporterat").length - 1;
  check("observed rows are stamped", observedTags >= OBSERVED.length, String(observedTags));
  check("self-reported rows are stamped", selfTags >= 4, String(selfTags));
  check(
    "the self-report section says it is not demonstrated competence",
    html.includes("ska inte läsas som visad kompetens") || html.includes("inte observerat"),
  );
}

console.log("\n6. The methodology is stated once, not in every section");
{
  for (const phrase of [
    "Ett bedömningstillfälle",
    "Beslutet är arbetsgivarens",
    "Underlagets bredd är därför begränsad",
  ]) {
    const n = html.split(phrase).length - 1;
    check(`"${phrase}" appears at most once`, n <= 1, String(n));
  }
  // Scoped to the competency overview: "Underlagets bredd" is a legitimate
  // heading in the methodology section, and used to be the closing line of
  // every single card above it.
  const cards = html.slice(at("Kompetensöversikt"), at("Självrapporterat arbetsbeteende"));
  check("the competency cards carry no breadth caveat of their own", !cards.includes("bredd"));
  check("the methodology still carries it, once", html.split("Underlagets bredd").length - 1 === 1);
}

console.log("\n7. Safety-critical follow-up is visible, actionable and never alarmist");
{
  check("with a flag, the safety panel renders", html.includes("Säkerhetskritisk uppföljning"));
  check("it explains the concern in plain language", html.includes("har lästs av en granskare"));
  check(
    "it names the action to take",
    html.includes("Gå igenom kandidatens resonemang i intervjun"),
  );
  check("with a flag, the recommendation is clarification", html.includes("Begär förtydligande"));
  check("with no flag, no safety panel renders", !clean.includes("Säkerhetskritisk uppföljning"));
  check("with no flag, the report still names a next step", /Rekommenderat nästa steg/.test(clean));
  for (const alarm of ["VARNING", "Varning", "allvarlig risk", "olämplig"]) {
    check(`the page does not say "${alarm}"`, !html.includes(alarm));
  }
}

console.log("\n8. The competency card is four short labelled lines");
{
  for (const term of ["Sammanfattning:", "Underlag:", "Varför det är relevant:", "Följ upp:"]) {
    check(`the card carries "${term}"`, html.includes(term));
  }
  check(
    "the evidence line states the task count",
    html.includes("observerade uppgifter i den här bedömningen"),
  );
}

console.log("\n9. Status is never carried by colour alone, and headings nest");
{
  check("signal labels render as text", html.includes("Behöver följas upp"));
  check("limited coverage is named in words", html.includes("Begränsat underlag"));
  const h2 = (html.match(/<h2/g) ?? []).length;
  const h3 = (html.match(/<h3/g) ?? []).length;
  check("sections use h2 and their rows use h3", h2 >= 4 && h3 >= 4, `h2=${h2} h3=${h3}`);
  check("no heading level is skipped to h4 without an h3", (html.match(/<h4/g) ?? []).length === 0);
}

console.log("\n10. Nothing on the page states a verdict");
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
