// Regression cover for the Candidate Decision Support Report V2.
//
// ── WHY A SCRIPT AND NOT A DATABASE SUITE ─────────────────────────────
//
// The governance this product depends on is proved in SQL and stays there:
// tests/database asserts the lifecycle, response immutability, the human-review
// gate, tenant isolation and the report-audience boundary against a real
// Postgres. Nothing here duplicates any of it.
//
// What this file covers is the layer added on top — the prioritisation and the
// recommended PROCESS step — which is pure TypeScript over a frozen brief and
// therefore provable without a database. The two most important assertions are
// negative: the layer must not be able to express an employment decision, and
// it must not be able to turn thin evidence into a finding about a person.

import { dictionaries } from "../src/i18n/dictionaries";
import {
  buildDecisionSupport,
  enrichDecisionSupport,
  narrativeIsAcceptable,
  recommendNextStep,
  type DecisionSupportInput,
} from "../src/lib/security-competency/decision-support";
import type {
  InterviewGuideEntry,
  ObservedArea,
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

// ── Fixtures ───────────────────────────────────────────────────────────
//
// Shaped on the real released attempt behind the Väktare recruitment
// assessment: three areas with a usable signal, five the run barely touched,
// eight self-report domains, one safety-critical finding.

const observed = (code: string, signal: ObservedArea["signal"], items: number): ObservedArea => ({
  areaCode: code,
  areaSv: `SV ${code}`,
  areaEn: `EN ${code}`,
  evidenceType: "observed",
  signal,
  items,
  mean: 0.5,
  spread: 0.2,
  evidenceState: "follow_up",
  behaviourSv: `beteende ${code}`,
  behaviourEn: `behaviour ${code}`,
  whySv: `varför ${code}`,
  whyEn: `why ${code}`,
});

const selfReported = (
  key: string,
  pattern: SelfReportedArea["pattern"],
  consistency: SelfReportedArea["consistency"],
): SelfReportedArea => ({
  domainKey: key,
  domainSv: `SV ${key}`,
  domainEn: `EN ${key}`,
  areaCode: key,
  evidenceType: "self_reported",
  pattern,
  consistency,
  items: 3,
});

const guide = (code: string, focus: InterviewGuideEntry["focus"]): InterviewGuideEntry => ({
  areaCode: code,
  areaSv: `SV ${code}`,
  areaEn: `EN ${code}`,
  focus,
  evidenceType: "observed",
  whySv: "w",
  whyEn: "w",
  questionSv: `fråga ${code}`,
  questionEn: `question ${code}`,
  followupSv: "f",
  followupEn: "f",
  listenForSv: ["a"],
  listenForEn: ["a"],
});

const base = (over: Partial<DecisionSupportInput> = {}): DecisionSupportInput => ({
  observed: [
    observed("situational_awareness", "developing", 4),
    observed("communication", "developing", 6),
    observed("accountability", "mixed", 4),
    observed("integrity", "limited", 2),
    observed("pressure", "limited", 2),
    observed("service", "limited", 2),
    observed("cooperation", "limited", 1),
    observed("judgement", "limited", 2),
  ],
  selfReported: [
    selfReported("recovery", "mostly_described", "varied"),
    selfReported("escalation", "mostly_described", "varied"),
    selfReported("scanning", "consistently_described", "consistent"),
    selfReported("rules", "rarely_described", "consistent"),
  ],
  interviewGuide: [
    guide("situational_awareness", "explore_development"),
    guide("communication", "explore_development"),
    guide("accountability", "explore_development"),
  ],
  safetyFlagCount: 0,
  observedObservations: 23,
  selfReportObservations: 24,
  evidenceContexts: 1,
  reviewsTotal: 1,
  reviewsCompleted: 1,
  frozenSummary: { sv: "SV situational_awareness sammanfattning", en: "EN summary" },
  ...over,
});

console.log("\n1. The recommended step is always a PROCESS step");
{
  const steps = new Set<string>();
  for (const input of [
    base(),
    base({ safetyFlagCount: 1 }),
    base({ observed: [], observedObservations: 0 }),
    base({ observed: [observed("a", "strong", 6), observed("b", "consistent", 6)] }),
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

  // The ASSERTIVE copy — everything the report states in its own voice. The
  // two disclaimer keys are excluded here and checked separately below,
  // because a sentence whose whole job is to say "this is not an employment
  // decision" has to be allowed to use the word.
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

  // And the disclaimers must actually disclaim. A caveat that has drifted into
  // saying nothing is worse than no caveat, because it still occupies the slot.
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

  // Comparison between candidates is absent from the vocabulary too.
  for (const lang of ["sv", "en"] as const) {
    const dict = dictionaries[lang] as Record<string, string>;
    const compare = Object.keys(dict)
      .filter((k) => k.startsWith("decision."))
      .filter((k) =>
        /jämförelse mellan personer|jämför.*andra kandidat|compared with other candidate|against other candidates/i.test(
          dict[k],
        ),
      )
      // "not a comparison between people" is a denial, and denials are fine.
      .filter((k) => !DISCLAIMERS.includes(k));
    check(
      `${lang}: no line offers a comparison between candidates`,
      compare.length === 0,
      compare.join(", "),
    );
  }
}

console.log("\n3. Thin evidence is coverage, never a weakness");
{
  const thin = base({ safetyFlagCount: 0 });
  const r = recommendNextStep(thin);
  check(
    "five limited areas against three exercised recommends more assessment",
    r.step === "additional_assessment",
    r.step,
  );
  const support = buildDecisionSupport(thin);
  check(
    "limited areas are uncertainties, not follow-up",
    support.uncertainties.length === 5 && support.priorityFollowUp.length === 3,
    `${support.uncertainties.length}/${support.priorityFollowUp.length}`,
  );
  check(
    "no limited area appears among the strongest signals",
    support.strongestSupported.every((a) => a.signal !== "limited"),
  );
}

console.log("\n4. Safety-critical follow-up survives a strong assessment");
{
  const strong = base({
    observed: [
      observed("a", "strong", 8),
      observed("b", "strong", 8),
      observed("c", "consistent", 6),
    ],
    safetyFlagCount: 1,
  });
  const support = buildDecisionSupport(strong);
  check("the safety block is present", support.safetyCriticalFollowUp?.count === 1);
  check(
    "the recommendation is clarification, not an interview waved through",
    support.recommendedNextStep === "request_clarification",
    support.recommendedNextStep,
  );
  const clean = buildDecisionSupport(base({ safetyFlagCount: 0 }));
  check("a clean report renders no safety block at all", clean.safetyCriticalFollowUp === null);
}

console.log("\n5. Observed and self-reported never merge");
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
}

console.log("\n6. The summary is built from structured evidence only");
{
  const input = base();
  const support = buildDecisionSupport(input);
  check(
    "the narrative is the frozen one, not a new composition",
    support.narrative?.sv === input.frozenSummary?.sv,
  );
  const noSummary = buildDecisionSupport(base({ frozenSummary: null }));
  check("a brief-less narrative is null rather than invented", noSummary.narrative === null);
  check(
    "every area named in a bucket came from the input",
    support.strongestSupported
      .concat(support.uncertainties)
      .every((a) => input.observed.some((o) => o.areaCode === a.areaCode)),
  );
}

console.log("\n7. The report is complete without AI");
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
    throwing.source === "deterministic" && throwing.narrative?.sv === input.frozenSummary?.sv,
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

  const good = await enrichDecisionSupport(det, input, async () => ({
    sv: "SV situational_awareness: svaren pekade åt samma håll.",
    en: "EN communication: the answers pointed the same way.",
  }));
  check("an acceptable narrative is used, and only the narrative changes", good.source === "ai");
  check(
    "an accepted narrative cannot change the step or the buckets",
    good.recommendedNextStep === det.recommendedNextStep &&
      good.strongestSupported === det.strongestSupported &&
      good.uncertainties === det.uncertainties,
  );
  check("an empty narrative is not acceptable", !narrativeIsAcceptable("   ", input));
}

console.log("\n8. The same evidence always produces the same brief");
{
  const a = JSON.stringify(buildDecisionSupport(base()));
  const b = JSON.stringify(buildDecisionSupport(base()));
  check("two builds of one input are identical", a === b);
}

console.log("\n9. Swedish and English are both complete");
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const keys = Object.keys(sv).filter(
    (k) => k.startsWith("decision.") || k.startsWith("lifecycle.recruitment."),
  );
  check("the new vocabulary exists", keys.length > 30, String(keys.length));
  const missing = keys.filter((k) => !en[k] || !en[k].trim());
  check("every new key has English", missing.length === 0, missing.join(", "));
  const blank = keys.filter((k) => !sv[k].trim());
  check("every new key has Swedish", blank.length === 0, blank.join(", "));
  const same = keys.filter((k) => sv[k] === en[k]);
  check("no new key is the same string in both languages", same.length === 0, same.join(", "));
}

console.log("\n10. Recruitment and workforce keep different words");
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

console.log("\n11. The release step still says what it does before it is taken");
{
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const explain = d["academy.participants.releaseExplain"] ?? "";
    check(`${lang}: the share control explains the participant copy`, /kopia|copy/i.test(explain));
    check(`${lang}: the share control explains it is irreversible`, /ångra|undone/i.test(explain));
  }
}

if (failures.length > 0) {
  console.error(`\nrecruitment-decision-support-check: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nrecruitment-decision-support-check: PASS");
