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

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { dictionaries } from "../src/i18n/dictionaries";
import { DecisionSupportSummary } from "../src/components/academy/DecisionSupportSummary";
import {
  CompetencyOverviewSection,
  InterviewGuideSection,
  InterviewQuestions,
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
      <InterviewQuestions entries={INTERVIEW_GUIDE} sv />
      <CompetencyOverviewSection
        support={support}
        modules={[]}
        interviewGuide={INTERVIEW_GUIDE}
        sv
      />
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
    "Följ upp i intervju",
    "Stabilaste signalerna i underlaget",
    "Begränsat underlag",
    // The questions moved up to the first screen; the reasoning behind them
    // stayed with the detail below.
    "Frågor till intervjun",
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
  // The budget moved from 350 to 420, and the extra words are the five
  // interview questions that came UP from four scrolls down. That is a
  // deliberate trade: word count is a proxy for reading effort, and a first
  // screen a recruiter can act on beats a shorter one they have to leave.
  //
  // It is still a budget. Everything else on this screen is a scan target --
  // three strongest areas, three follow-ups, six provenance fields -- so if
  // this ever fails again it means prose came back, which is the thing the
  // customer actually complained about.
  check(
    "the first screen is under 420 words",
    text.split(" ").length < 420,
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

console.log("\n10. The methodology says only what is still true of this report");
{
  const method = html.slice(at("Om bedömningsunderlaget"));
  // The V1 paragraph this section used to borrow described the maturity list:
  // nothing can reach "Visat", every row lands on "Behöver följdfråga", the
  // follow-ups are below. V2 renders no such list, and the page above shows
  // signal labels the paragraph said were unreachable.
  for (const stale of ["Starkt visat", "Behöver följdfråga", "Följdfrågorna nedan"]) {
    check(`the methodology no longer says "${stale}"`, !method.includes(stale), "");
  }
  check("no maturity label appears anywhere on the page", !html.includes("Visat"));
  check(
    "it still says one occasion is one source",
    method.includes("Ett bedömningstillfälle är en enda informationskälla"),
  );
  check(
    "it still says strong evidence here is not durable competence",
    method.includes("inget belägg för varaktig kompetens"),
  );
  check(
    "it still says limited evidence is not a missing ability",
    method.includes("inget belägg för att förmågan saknas"),
  );
  check("it still says self-report is not observed", method.includes("inte observerat"));
  check(
    "and it does not contradict the signals above it",
    html.includes("Starkt underlag") || html.includes("Behöver följas upp"),
  );
}

console.log("\n11. The competency lede matches the cards under it");
{
  const cards = html.slice(at("Kompetensöversikt"), at("Självrapporterat arbetsbeteende"));
  // The lede promises a question WHERE THE GUIDE SELECTED ONE. Every area that
  // has an observed guide entry must therefore carry one, and every area that
  // does not must carry none.
  const withObservedEntry = new Set(
    INTERVIEW_GUIDE.filter((g) => g.evidenceType === "observed").map((g) => g.areaCode),
  );
  const promised = OBSERVED.filter((a) => withObservedEntry.has(a.areaCode));
  const unpromised = OBSERVED.filter((a) => !withObservedEntry.has(a.areaCode));

  check(
    "the fixture exercises both branches",
    promised.length > 0 && unpromised.length > 0,
    `${promised.length} with / ${unpromised.length} without`,
  );

  const cardOf = (name: string) => {
    const i = cards.indexOf(name);
    if (i < 0) return "";
    const rest = cards.slice(i + name.length);
    const next = OBSERVED.map((o) => rest.indexOf(o.areaSv)).filter((n) => n > 0);
    return next.length ? rest.slice(0, Math.min(...next)) : rest;
  };

  for (const a of promised) {
    check(`"${a.areaSv}" carries its question`, cardOf(a.areaSv).includes("Följ upp:"), a.signal);
  }
  for (const a of unpromised) {
    check(
      `"${a.areaSv}" has no invented question`,
      !cardOf(a.areaSv).includes("Följ upp:"),
      a.signal,
    );
  }

  // The fix is not "show the follow-up bucket's questions": a limited area now
  // carries one too, which is the whole point.
  const limitedWithEntry = promised.filter((a) => a.signal === "limited");
  check("a limited-evidence area now carries its authored question", limitedWithEntry.length > 0);
  for (const a of limitedWithEntry) {
    const entry = INTERVIEW_GUIDE.find(
      (g) => g.areaCode === a.areaCode && g.evidenceType === "observed",
    )!;
    check(
      `"${a.areaSv}" shows the guide's own wording`,
      cardOf(a.areaSv).includes(entry.questionSv.slice(0, 40)),
    );
  }

  // Evidence types do not cross. One fixture area code carries both an observed
  // line and a self-reported guide entry; the card must show neither that
  // question nor any other.
  check(
    "a self-reported question never lands on an observed card",
    !cards.includes("SJÄLVRAPPORTERAD FRÅGA"),
  );
  check(
    "no question on a card was invented",
    (cards.match(/Följ upp:/g) ?? []).length === promised.length,
    `${(cards.match(/Följ upp:/g) ?? []).length} vs ${promised.length}`,
  );
}

console.log("\n12. Nothing on the page states a verdict");
{
  for (const word of ["anställ", "avslå", "lämplig", "rangordn", "poäng"]) {
    const bad =
      html.toLowerCase().includes(word) && !html.includes("inte ett besked om anställning");
    check(`"${word}" is not asserted`, !bad);
  }
}

console.log("\n13. The methodology fold is screen-only, so print keeps everything");
{
  // A customer said the brief was far too long, and these six paragraphs were
  // most of it. They are now folded -- but ReportMethodSection's own header
  // records why they must never be behind a toggle: a published report has to
  // carry its limitations, and it has to print them.
  //
  // The reconciliation is that the fold is CSS inside `@media screen`, so the
  // content stays in the DOM and print never sees the rule. That only holds
  // while the markup keeps rendering it, which is what this asserts: the
  // server-rendered HTML -- exactly what a printed page is made from --
  // contains every limitation with the section closed.
  check(
    "the fold renders closed by default",
    html.includes('data-open="false"'),
    "no collapsed .screen-fold found",
  );
  check(
    "limitations are still in the DOM while closed",
    html.includes("En bedömning är ett underlag inför samtal."),
  );
  for (const key of ["oneOccasionBody", "selfReportBody", "thinEvidenceBody"]) {
    check(
      `method text "${key}" survives the fold`,
      html.includes(dictionaries.sv[`decision.method.${key}`]),
    );
  }
  check(
    "the employer-decides sentence is NOT inside the fold",
    html.indexOf(dictionaries.sv["decision.method.decisionBody"]) <
      html.indexOf('data-open="false"'),
    "it must stay visible with the section closed",
  );
}

console.log("\n14. The brief opens as an executive summary, not a document");
{
  const support = buildDecisionSupport(candidateInput({ safetyFlagCount: 0 }));
  const prose = support.narrative?.sv ?? "";
  const sentences = prose.split(/(?<=\.)\s+/).filter(Boolean).length;

  // A customer read this and could not say what the candidate was like. It was
  // five sentences, two of which she had already read one card above.
  check("the summary is at most three sentences", sentences <= 3, `${sentences}`);
  check("the summary is under 450 characters", prose.length < 450, `${prose.length}`);
  check(
    "the recommended step is not repeated in prose",
    !/Rekommendationen är att/.test(prose),
    "it is the headline of the card directly above",
  );
  check(
    "instrument breadth is not in the summary",
    !/bedömningens bredd/.test(prose),
    "that is methodology; it is stated below as Begränsat underlag",
  );
  // Removing sentences must not remove FACTS.
  check("the thin-coverage fact still exists on the object", support.uncertainties.length > 0);
  check("the recommended step still exists on the object", Boolean(support.recommendedNextStep));

  // The questions a recruiter takes into the room, on the first screen.
  const questions = renderToStaticMarkup(
    <I18nProvider>
      <InterviewQuestions entries={INTERVIEW_GUIDE} sv />
    </I18nProvider>,
  );
  const rendered = INTERVIEW_GUIDE.filter((g) => questions.includes(g.questionSv));
  check(
    "between three and five questions are shown",
    rendered.length >= 3 && rendered.length <= 5,
    `${rendered.length}`,
  );
  check(
    "every question shown is an authored one",
    rendered.length > 0 && rendered.every((g) => INTERVIEW_GUIDE.includes(g)),
  );
  check(
    "the guide's full reasoning is NOT on the first screen",
    !questions.includes(INTERVIEW_GUIDE[0].whySv),
    "why/listen-for belong with the detail",
  );
}

console.log("\n15. Safety is stated either way, and never manufactured");
{
  const clean = renderToStaticMarkup(
    <I18nProvider>
      <DecisionSupportSummary
        support={buildDecisionSupport(candidateInput({ safetyFlagCount: 0 }))}
        context={CONTEXT}
        sv
      />
    </I18nProvider>,
  );
  const flagged = renderToStaticMarkup(
    <I18nProvider>
      <DecisionSupportSummary
        support={buildDecisionSupport(candidateInput({ safetyFlagCount: 2 }))}
        context={CONTEXT}
        sv
      />
    </I18nProvider>,
  );
  check(
    "a clean brief says so in one calm line",
    clean.includes(dictionaries.sv["decision.panel.safetyNone"]),
  );
  check(
    "the calm line is not a warning panel",
    !clean.includes(dictionaries.sv["decision.panel.safetyAction"]),
  );
  check(
    "a flagged brief shows the real panel instead",
    flagged.includes(dictionaries.sv["decision.panel.safetyAction"]),
  );
  check(
    "and does not also claim there were none",
    !flagged.includes(dictionaries.sv["decision.panel.safetyNone"]),
  );
}

console.log("\n16. No workforce development actions in the recruitment brief");
{
  const route = readFileSync(
    new URL(
      "../src/routes/_authenticated.employer.$employerSlug.assessments.results.$attemptId.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  // One render site left, and it is the workforce report.
  const sites = (route.match(/<EmployerDecisionPanel/g) ?? []).length;
  check("the decision panel renders exactly once", sites === 1, `${sites} sites`);
  for (const key of ["actionDevelopment", "actionSafety"] as const) {
    check(
      `"${dictionaries.sv[`academy.decision.${key}`]}" is not offered on a candidate`,
      !html.includes(dictionaries.sv[`academy.decision.${key}`]),
    );
  }
}

if (failures.length > 0) {
  console.error(`\nrecruitment-report-render-check: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nrecruitment-report-render-check: PASS");
