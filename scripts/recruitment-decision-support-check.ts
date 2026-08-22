// Regression cover for the Candidate Decision Support Report V2.
//
// ── WHY A SCRIPT AND NOT A DATABASE SUITE ─────────────────────────────
//
// The governance this product depends on is proved in SQL and stays there:
// tests/database asserts the lifecycle, response immutability, the human-review
// gate, tenant isolation and the report-audience boundary against a real
// Postgres. Nothing here duplicates any of it.
//
// What this file covers is the layer added on top — the prioritisation, the
// prose and the recommended PROCESS step — which is pure TypeScript over a
// frozen brief and therefore provable without a database.
//
// Three assertions matter more than the rest, and all three are negative: the
// layer must not be able to express an employment decision, it must not be able
// to turn thin evidence into a finding about a person, and the summary must not
// be allowed to grow back into the catalogue it replaced.

import { dictionaries } from "../src/i18n/dictionaries";
import {
  buildDecisionSupport,
  composeNarrative,
  enrichDecisionSupport,
  narrativeIsAcceptable,
  recommendNextStep,
  selectSummaryFacts,
  wordCount,
  NARRATIVE_WORD_LIMIT,
  type DecisionSupportInput,
} from "../src/lib/security-competency/decision-support";
import type { ObservedArea } from "../src/lib/security-competency/academy-employer.functions";
import { candidateInput, OBSERVED, SELF_REPORTED } from "./fixtures/released-candidate-brief";

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
};

/** The real released run, and variations on it. Everything below is a change to
 *  the actual candidate's evidence rather than a hand-built shape, so a rule
 *  that only holds for a tidy fixture fails here. */
const base = candidateInput;

const observedOnly = (signal: ObservedArea["signal"], n: number): ObservedArea[] =>
  Array.from({ length: n }, (_, i) => ({ ...OBSERVED[0], areaCode: `a${i}`, signal }));

const sentences = (text: string) => text.split(/(?<=\.)\s+/).filter(Boolean).length;

console.log("\n1. The recommended step is always a PROCESS step");
{
  const steps = new Set<string>();
  for (const input of [
    base(),
    base({ safetyFlagCount: 0 }),
    base({ observed: [], observedObservations: 0, safetyFlagCount: 0 }),
    base({ observed: observedOnly("strong", 3), safetyFlagCount: 0 }),
  ]) {
    steps.add(recommendNextStep(input).step);
  }
  const allowed = new Set([
    "structured_interview",
    "additional_assessment",
    "request_clarification",
    "gather_more_evidence",
  ]);
  check(
    "every produced step is in the allowed process-step set",
    [...steps].every((s) => allowed.has(s)),
    [...steps].join(", "),
  );
  check("all four are reachable from real-shaped evidence", steps.size === 4, String(steps.size));
}

console.log("\n2. The layer can assert no verdict, and denies one explicitly");
{
  const banned = [
    "hire",
    "reject",
    "suitab",
    "unsuitab",
    "rank",
    "percentile",
    "overall_score",
    "total_score",
    "pass_fail",
    "anställ",
    "avslå",
    "lämplig",
    "rangordn",
    "poäng",
    "betyg",
  ];

  // The ASSERTIVE copy — everything the report states in its own voice. The two
  // disclaimer keys are excluded here and checked separately below, because a
  // sentence whose whole job is to say "this is not an employment decision" has
  // to be allowed to use the word.
  const DISCLAIMERS = ["decision.stepIsProcessOnly", "decision.method.decisionBody"];
  for (const lang of ["sv", "en"] as const) {
    const dict = dictionaries[lang] as Record<string, string>;
    const keys = Object.keys(dict).filter(
      (k) =>
        (k.startsWith("decision.") || k.startsWith("lifecycle.recruitment.")) &&
        !DISCLAIMERS.includes(k),
    );
    const bad = keys.filter((k) => banned.some((w) => dict[k].toLowerCase().includes(w)));
    check(
      `${lang}: no asserted line carries a verdict or ranking word`,
      bad.length === 0,
      bad.join(", "),
    );
  }

  for (const lang of ["sv", "en"] as const) {
    const dict = dictionaries[lang] as Record<string, string>;
    for (const k of DISCLAIMERS) {
      const v = (dict[k] ?? "").toLowerCase();
      const denies =
        lang === "sv"
          ? v.includes("inte ett besked") || v.includes("inte ett omdöme")
          : v.includes("not an employment decision") || v.includes("not a verdict");
      check(`${lang}: ${k} denies an employment decision in words`, denies, v.slice(0, 60));
    }
  }

  // And the narrative the layer actually composes, for the real candidate.
  const n = buildDecisionSupport(base()).narrative!;
  for (const lang of ["sv", "en"] as const) {
    const text = (lang === "sv" ? n.sv : n.en).toLowerCase();
    check(`${lang}: the composed summary states no verdict`, !banned.some((w) => text.includes(w)));
  }
}

console.log("\n3. The summary is a brief, not a catalogue");
{
  const input = base();
  const support = buildDecisionSupport(input);
  const sv = support.narrative!.sv;
  const en = support.narrative!.en;

  check("a summary is produced", Boolean(sv && en));
  check(
    `sv is within the ${NARRATIVE_WORD_LIMIT}-word ceiling`,
    wordCount(sv) <= NARRATIVE_WORD_LIMIT,
    String(wordCount(sv)),
  );
  check(
    `en is within the ${NARRATIVE_WORD_LIMIT}-word ceiling`,
    wordCount(en) <= NARRATIVE_WORD_LIMIT,
    String(wordCount(en)),
  );
  check(
    "sv is long enough to be a brief rather than a label",
    wordCount(sv) >= 50,
    String(wordCount(sv)),
  );
  check(
    "sv is three to five sentences",
    sentences(sv) >= 3 && sentences(sv) <= 5,
    String(sentences(sv)),
  );
  check(
    "en is three to five sentences",
    sentences(en) >= 3 && sentences(en) <= 5,
    String(sentences(en)),
  );

  // The point of the selection layer: thin areas are COUNTED, never listed.
  const thin = input.observed.filter((o) => o.signal === "limited");
  const named = thin.filter((o) => sv.includes(o.areaSv));
  check(
    "no thin-evidence competency is named in the summary",
    named.length === 0,
    named.map((o) => o.areaSv).join(", "),
  );

  const allNamed = input.observed.filter((o) => sv.includes(o.areaSv)).length;
  check(
    "at most three competencies are named at all",
    allNamed <= 3,
    `${allNamed} of ${input.observed.length}`,
  );

  check("the summary is not the frozen catalogue paragraph", sv !== input.frozenSummary?.sv);
  // What was wrong with the frozen paragraph was never its length: it is the
  // naming of every competency in every bucket, which is what makes it a
  // catalogue rather than a brief.
  const frozenNames = input.observed.filter((o) =>
    input.frozenSummary!.sv.includes(o.areaSv),
  ).length;
  check(
    "the frozen catalogue named nearly every competency",
    frozenNames >= 7,
    `${frozenNames} of ${input.observed.length}`,
  );
  check(
    "the composed summary names at most three",
    allNamed <= 3 && allNamed < frozenNames,
    `${allNamed} vs ${frozenNames}`,
  );
  check(
    "at most five facts reach the prose",
    support.facts.length <= 5,
    String(support.facts.length),
  );
}

console.log("\n4. The selection layer reads the evidence in priority order");
{
  const facts = selectSummaryFacts(base()).map((f) => f.kind);
  check("safety is the first fact", facts[0] === "safety", facts.join(" > "));
  check(
    "observed signals precede self-report",
    facts.indexOf("follow_up") < facts.indexOf("self_report_consistent"),
    facts.join(" > "),
  );
  check(
    "the process step is dropped rather than a fact of evidence",
    !facts.includes("next_step"),
    facts.join(" > "),
  );

  // With less to say, the step earns its place back.
  const quiet = selectSummaryFacts(
    base({ safetyFlagCount: 0, selfReported: [], observed: OBSERVED.slice(0, 3) }),
  ).map((f) => f.kind);
  check("a shorter run still names the next step", quiet.includes("next_step"), quiet.join(" > "));
  check(
    "nothing at all still produces a sentence",
    composeNarrative(
      selectSummaryFacts(
        base({ observed: [], selfReported: [], safetyFlagCount: 0, observedObservations: 0 }),
      ),
    ) !== null,
  );
}

console.log("\n5. No empty panel is ever rendered as a finding");
{
  const provisional = buildDecisionSupport(base());
  check(
    "with no observed strength, the panel becomes the steadiest signal",
    provisional.stability?.kind === "provisional",
    String(provisional.stability?.kind),
  );
  check(
    "and what it shows is self-report, labelled",
    (provisional.stability?.selfReported.length ?? 0) > 0 &&
      provisional.stability!.selfReported.every((s) => s.evidenceType === "self_reported"),
  );
  check("no observed area is promoted into it", provisional.stability?.observed.length === 0);

  const supported = buildDecisionSupport(base({ observed: observedOnly("strong", 2) }));
  check(
    "a real strength shows as one",
    supported.stability?.kind === "supported" && supported.stability.observed.length === 2,
  );

  const nothing = buildDecisionSupport(
    base({ observed: observedOnly("developing", 2), selfReported: [] }),
  );
  check("with neither, the panel is absent entirely", nothing.stability === null);

  const clean = buildDecisionSupport(base({ safetyFlagCount: 0 }));
  check("a clean report renders no safety panel", clean.safetyCriticalFollowUp === null);
}

console.log("\n6. Thin evidence is coverage, never a weakness");
{
  const r = recommendNextStep(base({ safetyFlagCount: 0 }));
  check(
    "five limited areas against three exercised recommends more assessment",
    r.step === "additional_assessment",
    r.step,
  );
  const support = buildDecisionSupport(base());
  check(
    "limited areas are uncertainties, not follow-up",
    support.uncertainties.length === 5 && support.priorityFollowUp.length === 3,
    `${support.uncertainties.length}/${support.priorityFollowUp.length}`,
  );
  check(
    "no limited area appears among the strongest signals",
    support.strongestSupported.every((a) => a.signal !== "limited"),
  );
  const sv = support.narrative!.sv;
  check(
    "the summary says thin coverage is about the assessment, not the candidate",
    sv.includes("inget om kandidaten"),
  );
}

console.log("\n7. Safety-critical follow-up survives a strong assessment");
{
  const strong = buildDecisionSupport(base({ observed: observedOnly("strong", 3) }));
  check("the safety block is present", strong.safetyCriticalFollowUp?.count === 1);
  check(
    "the recommendation is clarification, not an interview waved through",
    strong.recommendedNextStep === "request_clarification",
    strong.recommendedNextStep,
  );
  check("safety is still the first fact selected", strong.facts[0]?.kind === "safety");
  // ...and deliberately not a sentence: the recommendation's reason and the
  // emphasised panel both own it above the paragraph, and a third telling is
  // how a reader learns the paragraph repeats what they just read.
  check(
    "the narrative does not repeat what the safety panel owns",
    !strong.narrative!.sv.includes("säkerhetskritisk"),
  );
  check(
    "but the structured field a surface renders it from is still there",
    strong.safetyCriticalFollowUp !== null,
  );
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    check(
      `${lang}: the safety panel names the action to take`,
      /intervju|interview/i.test(d["decision.panel.safetyAction"] ?? ""),
    );
  }
}

console.log("\n8. Observed and self-reported never merge");
{
  const support = buildDecisionSupport(base());
  const observedCodes = new Set(
    [
      ...support.strongestSupported,
      ...support.uncertainties,
      ...support.priorityFollowUp.map((f) => f.area),
    ].map((a) => a.areaCode),
  );
  check(
    "no self-report domain leaks into an observed bucket",
    support.selfReportedPatterns.every((s) => !observedCodes.has(s.domainKey)),
  );
  check(
    "every observed bucket entry is stamped observed",
    [...support.strongestSupported, ...support.uncertainties].every(
      (a) => a.evidenceType === "observed",
    ),
  );
  check(
    "every self-report entry is stamped self_reported",
    support.selfReportedPatterns.every((s) => s.evidenceType === "self_reported"),
  );
  check(
    "the summary says self-report is not observed",
    /inte observerade/.test(support.narrative!.sv),
  );
}

console.log("\n9. The report is complete without AI");
{
  const input = base();
  const det = buildDecisionSupport(input);

  const noProvider = await enrichDecisionSupport(det, input);
  check("no provider configured returns the deterministic result", noProvider === det);

  const throwing = await enrichDecisionSupport(det, input, async () => {
    throw new Error("provider down");
  });
  check(
    "a provider outage returns the deterministic result",
    throwing.source === "deterministic" && throwing.narrative?.sv === det.narrative?.sv,
  );

  const inventing = await enrichDecisionSupport(det, input, async () => ({
    sv: "Kandidaten passar utmärkt och bör anställas.",
    en: "The candidate should be hired.",
  }));
  check(
    "a narrative expressing an employment decision is rejected",
    inventing.source === "deterministic",
  );

  const hallucinating = await enrichDecisionSupport(det, input, async () => ({
    sv: "Ett område som inte finns i underlaget.",
    en: "An area that is not in the evidence.",
  }));
  check(
    "a narrative naming no area from the evidence is rejected",
    hallucinating.source === "deterministic",
  );

  const rambling = await enrichDecisionSupport(det, input, async () => ({
    sv: `Situationsmedvetenhet ${"ord ".repeat(200)}`,
    en: `Situational awareness ${"word ".repeat(200)}`,
  }));
  check("a narrative over the word ceiling is rejected", rambling.source === "deterministic");

  const good = await enrichDecisionSupport(det, input, async () => ({
    sv: "Situationsmedvetenhet behöver följas upp i intervju.",
    en: "Situational awareness needs following up in interview.",
  }));
  check("an acceptable narrative is used", good.source === "ai");
  check(
    "an accepted narrative cannot change the step or the buckets",
    good.recommendedNextStep === det.recommendedNextStep &&
      good.strongestSupported === det.strongestSupported &&
      good.uncertainties === det.uncertainties &&
      good.stability === det.stability,
  );
  check("an empty narrative is not acceptable", !narrativeIsAcceptable("   ", input));
}

console.log("\n10. The same evidence always produces the same brief");
{
  const a = JSON.stringify(buildDecisionSupport(base()));
  const b = JSON.stringify(buildDecisionSupport(base()));
  check("two builds of one input are identical", a === b);
}

console.log("\n11. Recruitment does not borrow competence development's words");
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const decisionKeys = Object.keys(sv).filter((k) => k.startsWith("decision."));

  const dev = decisionKeys.filter((k) => /utvecklingsområde/i.test(sv[k]));
  check('no recruitment line says "Utvecklingsområde"', dev.length === 0, dev.join(", "));
  check(
    "the developing signal reads as a follow-up",
    sv["decision.signal.followUp"] === "Behöver följas upp",
    sv["decision.signal.followUp"],
  );
  check(
    "and the workforce word is untouched",
    sv["brief.signal.developing"] === "Utvecklingsområde",
    sv["brief.signal.developing"],
  );
  check(
    'thin coverage is named "Begränsat underlag", not "För lite underlag"',
    sv["decision.signal.limited"] === "Begränsat underlag" &&
      !/för lite underlag/i.test(sv["decision.panel.uncertain"]),
  );
  void en;
}

console.log("\n12. Swedish and English are both complete");
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const keys = Object.keys(sv).filter(
    (k) => k.startsWith("decision.") || k.startsWith("lifecycle.recruitment."),
  );
  check("the new vocabulary exists", keys.length > 40, String(keys.length));
  const missing = keys.filter((k) => !en[k] || !en[k].trim());
  check("every new key has English", missing.length === 0, missing.join(", "));
  const blank = keys.filter((k) => !sv[k].trim());
  check("every new key has Swedish", blank.length === 0, blank.join(", "));
  const same = keys.filter((k) => sv[k] === en[k]);
  check("no new key is the same string in both languages", same.length === 0, same.join(", "));
}

console.log("\n13. Recruitment and workforce keep different words");
{
  const sv = dictionaries.sv as Record<string, string>;
  const pairs: [string, string][] = [
    ["lifecycle.employer.result_available", "lifecycle.recruitment.result_available"],
    ["lifecycle.employer.ready_to_release", "lifecycle.recruitment.ready_to_release"],
    ["lifecycle.employer.invited", "lifecycle.recruitment.invited"],
  ];
  for (const [w, r] of pairs) {
    check(`${r} differs from ${w}`, sv[w] !== sv[r], `${sv[w]} / ${sv[r]}`);
  }
  check(
    "the workforce report title is not the recruitment one",
    sv["academy.results.title"] !== sv["decision.reportTitle"],
  );
}

console.log("\n14. The release step still says what it does before it is taken");
{
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const explain = d["academy.participants.releaseExplain"] ?? "";
    check(`${lang}: the share control explains the participant copy`, /kopia|copy/i.test(explain));
    check(`${lang}: the share control explains it is irreversible`, /ångra|undone/i.test(explain));
  }
}

void SELF_REPORTED;
void ({} as DecisionSupportInput);

if (failures.length > 0) {
  console.error(`\nrecruitment-decision-support-check: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nrecruitment-decision-support-check: PASS");
