// TRUST Evidence Report — PR-R0 safety contract guard (client side).
//
// Run: bun run trust-evidence-report:check
//
// ── WHAT THIS GUARDS, AND WHAT THE DATABASE SUITE GUARDS ─────────────────
//
// supabase/tests/scp_trust_evidence_report_r0_test.sql proves what the
// database DOES: what submission writes, what review writes, who can release,
// what each audience can read, what a released snapshot contains and that it
// never changes. Nothing here duplicates that.
//
// This file guards the layer above the database and the contracts that only
// exist as source:
//
//   A  the forbidden-claim vocabulary cannot enter the report layer -- the
//      snapshot types, the rds-v1 builder, the recruitment/participant report
//      copy in both languages, the released-brief fixture, or the future V3
//      contract;
//   B  the recommended next step is one of four PROCESS steps, for every
//      shape of evidence, and no step is a verdict;
//   C  no radar / spider chart, closed competence polygon or percentage
//      competence profile is rendered on any report surface;
//   D  self-report is never promoted into an observed bucket by the builder,
//      and the words for it stay descriptive;
//   E  SCC-08 on one item reads as "Begränsat underlag" / "Limited evidence"
//      and the copy for a limited area never calls it a weakness;
//   F  a report with no human safety finding renders no safety panel;
//   G  the direct client reads of the snapshot table are exactly the two that
//      exist today, and neither selects derivation_input -- any new direct
//      read fails here and belongs to PR-R2;
//   H  the future V3 report and computation-manifest contracts still name
//      every field the product owner locked, and none they forbade.
//
// Deterministic, offline, no database. Every assertion prints its letter so a
// failure names the promise it broke.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  buildDecisionSupport,
  recommendNextStep,
  type DecisionSupportInput,
} from "../src/lib/security-competency/decision-support";
import type { ObservedArea } from "../src/lib/security-competency/academy-employer.functions";
import { candidateInput, OBSERVED } from "./fixtures/released-candidate-brief";
import {
  TRUST_MANIFEST_AREA_FIELDS,
  TRUST_MANIFEST_EVIDENCE_FIELDS,
  TRUST_MANIFEST_REQUIRED_FIELDS,
  TRUST_PROCESS_STEPS,
  TRUST_V3_EXAMPLE,
  type TrustComputationManifest,
  type TrustEvidenceArea,
  type TrustEvidenceReportV3,
  type TrustManifestAreaComputation,
  type TrustManifestEvidenceRow,
} from "./fixtures/trust-evidence-report-v3-contract";

const ROOT = process.cwd();
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

// ── The vocabulary the report layer may never assert ───────────────────────
//
// Two lists. KEY tokens are matched as identifiers (a field or type member
// named like this is a promise about what it means). PROSE phrases are
// matched as substrings of user-facing copy in the language they belong to.
// Negations -- "not an employment decision", "not a weakness" -- are what the
// product is SUPPOSED to say and are excluded by key below.

const FORBIDDEN_KEYS = [
  "total_score",
  "totalScore",
  "overall_score",
  "overallScore",
  "percentile",
  "ranking",
  "candidate_rank",
  "candidateRank",
  "benchmark",
  "match_percent",
  "matchPercent",
  "job_fit",
  "jobFit",
  "fit_score",
  "fitScore",
  "suitability",
  "pass_fail",
  "passFail",
  "hire",
  "reject",
  "recommended_hire",
  "recommendedHire",
  "risk_score",
  "riskScore",
  "safety_risk_score",
  "potential_score",
  "potentialScore",
  "personality",
  "weighted_index",
  "weightedIndex",
  "candidate_index",
  "candidateIndex",
  "radar",
  "spider",
  "polygon",
  "traffic_light",
  "trafficLight",
  "bias_free",
  "biasFree",
  "predicted_performance",
  "predictedPerformance",
] as const;

const FORBIDDEN_PROSE_SV = [
  "bör anställas",
  "rekommenderar anställning",
  "rekommenderas för anställning",
  "bör inte anställas",
  "avslå kandidaten",
  "olämplig",
  "lämplig för tjänsten",
  "rangordn",
  "percentil",
  "totalpoäng",
  "sammanlagd poäng",
  "slutpoäng",
  "viktad poäng",
  "godkänd",
  "underkänd",
  "riskpoäng",
  "riskprofil",
  "personlighet",
  "matchprocent",
  "jobbmatch",
  "normgrupp",
  "topp 3",
  "topp 5",
  "spindeldiagram",
  "radardiagram",
  "svag kompetens",
  "svagt område",
  "låg poäng",
  "förutsäger",
  "fri från bias",
  "utan bias",
] as const;

const FORBIDDEN_PROSE_EN = [
  "should be hired",
  "recommend hiring",
  "recommended for hire",
  "should not be hired",
  "reject the candidate",
  "unsuitable",
  "suitable for the role",
  "ranked",
  "ranking",
  "percentile",
  "total score",
  "overall score",
  "final score",
  "weighted score",
  "passed",
  "failed",
  "pass/fail",
  "risk score",
  "risk profile",
  "personality",
  "match percentage",
  "job fit",
  "fit score",
  "norm group",
  "top 3",
  "top 5",
  "top candidate",
  "radar chart",
  "spider chart",
  "weak competency",
  "weak area",
  "low score",
  "predicts",
  "bias-free",
  "unbiased",
] as const;

/** Copy keys whose whole job is to DENY a verdict, and which therefore have
 *  to be allowed to name the thing they deny. Each is asserted below to be a
 *  denial in words. */
const DENIAL_KEYS = new Set([
  "decision.stepIsProcessOnly",
  "decision.method.decisionBody",
  "decision.method.thinEvidence",
  "decision.panel.uncertainBody",
  "academy.report.cannotSupportBody",
  "academy.report.employerDecides",
  "academy.report.humanDecides",
  "academy.report.notInability",
  "decision.method.oneOccasionBody",
]);

/** Every dictionary key on a report surface: the recruitment report, the
 *  workforce report, the participant's own report, the brief, the safety
 *  panel and the lifecycle words a recruiter reads around them. */
const REPORT_PREFIXES = [
  "decision.",
  "brief.",
  "academy.results.",
  "academy.report.",
  "academy.state.",
  "academy.coverage.",
  "academy.safety",
  "report.",
  "lifecycle.recruitment.",
  "lifecycle.next.",
];

const walkStrings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => walkStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => walkStrings(x, out));
  return out;
};
const walkKeys = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => walkKeys(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      walkKeys(x, out);
    }
  return out;
};

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nA. The forbidden vocabulary cannot enter the report layer");
// ═══════════════════════════════════════════════════════════════════════════
{
  // A1. The snapshot types and the rds-v1 builder: no forbidden identifier.
  const typeSources = [
    "src/lib/security-competency/academy-employer.functions.ts",
    "src/lib/security-competency/decision-support.ts",
    "scripts/fixtures/released-candidate-brief.ts",
    "scripts/fixtures/trust-evidence-report-v3-contract.ts",
  ];
  for (const file of typeSources) {
    const code = stripComments(read(file));
    const hits = FORBIDDEN_KEYS.filter((k) =>
      new RegExp(`(^|[^A-Za-z0-9_])${k}\\s*[:?=]`, "m").test(code),
    );
    check(`A1 ${file} declares no forbidden field`, hits.length === 0, hits.join(", "));
  }

  // A2. The builder's own denial list still refuses an AI narrative that
  //     asserts a verdict (this is the seam an AI provider would enter by).
  const ds = read("src/lib/security-competency/decision-support.ts");
  for (const w of [
    "hire",
    "reject",
    "suitab",
    "rank",
    "percentile",
    "anställ",
    "lämplig",
    "poäng",
  ]) {
    check(`A2 rds-v1 rejects an AI narrative containing "${w}"`, ds.includes(`"${w}"`));
  }

  // A3. Report copy, both languages, every report prefix, denials excluded.
  const keys = Object.keys(sv).filter(
    (k) => REPORT_PREFIXES.some((p) => k.startsWith(p)) && !DENIAL_KEYS.has(k),
  );
  check(
    "A3 the report surfaces have a substantial vocabulary to scan",
    keys.length > 200,
    String(keys.length),
  );
  const badSv = keys.filter((k) =>
    FORBIDDEN_PROSE_SV.some((w) => (sv[k] ?? "").toLowerCase().includes(w)),
  );
  const badEn = keys.filter((k) =>
    FORBIDDEN_PROSE_EN.some((w) => (en[k] ?? "").toLowerCase().includes(w)),
  );
  check(
    "A3 sv: no asserted report line states a verdict, rank, score, match, risk or personality claim",
    badSv.length === 0,
    badSv.join(", "),
  );
  check(
    "A3 en: no asserted report line states a verdict, rank, score, match, risk or personality claim",
    badEn.length === 0,
    badEn.join(", "),
  );

  // A4. The denials really deny.
  for (const k of DENIAL_KEYS) {
    const s = (sv[k] ?? "").toLowerCase();
    const e = (en[k] ?? "").toLowerCase();
    check(`A4 ${k} exists in both languages`, s.length > 0 && e.length > 0);
    check(
      `A4 ${k} is a denial or a limitation, not a claim`,
      /inte|aldrig|ingen|inget|endast|bara|ett bedömningstillfälle/.test(s) &&
        /not|never|no |only|one assessment occasion|cannot/.test(e),
    );
  }

  // A5. The frozen candidate fixture and the V3 example, walked as data.
  const fixtureStrings = walkStrings(candidateInput()).map((s) => s.toLowerCase());
  check(
    "A5 the released-brief fixture carries no forbidden phrase",
    !fixtureStrings.some(
      (s) =>
        FORBIDDEN_PROSE_SV.some((w) => s.includes(w)) ||
        FORBIDDEN_PROSE_EN.some((w) => s.includes(w)),
    ),
  );
  const v3Keys = walkKeys(TRUST_V3_EXAMPLE);
  const badV3 = v3Keys.filter((k) => (FORBIDDEN_KEYS as readonly string[]).includes(k));
  check("A5 the V3 example carries no forbidden key", badV3.length === 0, badV3.join(", "));
  const v3Strings = walkStrings(TRUST_V3_EXAMPLE).map((s) => s.toLowerCase());
  check(
    "A5 the V3 example carries no forbidden phrase in either language",
    !v3Strings.some(
      (s) =>
        FORBIDDEN_PROSE_SV.some((w) => s.includes(w)) ||
        FORBIDDEN_PROSE_EN.some((w) => s.includes(w)),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nB. The next step is a process step, for every shape of evidence");
// ═══════════════════════════════════════════════════════════════════════════
{
  const allowed = new Set<string>(TRUST_PROCESS_STEPS);
  const observedOnly = (signal: ObservedArea["signal"], n: number): ObservedArea[] =>
    Array.from({ length: n }, (_, i) => ({ ...OBSERVED[0], areaCode: `a${i}`, signal }));
  const shapes: DecisionSupportInput[] = [
    candidateInput(),
    candidateInput({ safetyFlagCount: 0 }),
    candidateInput({ safetyFlagCount: 3 }),
    candidateInput({ observed: [], observedObservations: 0, safetyFlagCount: 0 }),
    candidateInput({ observed: observedOnly("strong", 8), safetyFlagCount: 0 }),
    candidateInput({ observed: observedOnly("developing", 8), safetyFlagCount: 0 }),
    candidateInput({ observed: observedOnly("limited", 8), safetyFlagCount: 0 }),
    candidateInput({ observed: observedOnly("mixed", 8), safetyFlagCount: 0 }),
    candidateInput({
      observed: [...observedOnly("strong", 1), ...observedOnly("limited", 7)],
      safetyFlagCount: 0,
    }),
    candidateInput({ selfReported: [], safetyFlagCount: 0 }),
  ];
  const steps = new Set(shapes.map((s) => recommendNextStep(s).step));
  check(
    "B1 every produced step is one of the four allowed process steps",
    [...steps].every((s) => allowed.has(s)),
    [...steps].join(", "),
  );
  check("B2 all four allowed steps are reachable", steps.size === 4, String(steps.size));
  check(
    "B3 the shipped step union is exactly the locked process-step set",
    /export type RecommendedNextStep =\s*\|\s*"structured_interview"\s*\|\s*"additional_assessment"\s*\|\s*"request_clarification"\s*\|\s*"gather_more_evidence";/.test(
      read("src/lib/security-competency/decision-support.ts"),
    ),
  );
  check(
    "B4 the V3 contract locks the same four steps and no fifth",
    TRUST_PROCESS_STEPS.length === 4 &&
      [
        "structured_interview",
        "additional_assessment",
        "request_clarification",
        "gather_more_evidence",
      ].every((s) => allowed.has(s)),
  );
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const stepCopy = Object.keys(d)
      .filter((k) => k.startsWith("decision.step."))
      .map((k) => d[k].toLowerCase());
    check(`B5 ${lang}: exactly four step labels`, stepCopy.length === 4, String(stepCopy.length));
    check(
      `B5 ${lang}: no step label reads as hire, reject, shortlist, screen-out or rank`,
      !stepCopy.some((s) =>
        /anställ|avslå|gallr|sålla|rangordn|hire|reject|shortlist|screen|rank/.test(s),
      ),
      stepCopy.join(" | "),
    );
  }
  // Strong evidence everywhere still yields an interview, never a hire.
  const strong = recommendNextStep(
    candidateInput({ observed: observedOnly("strong", 8), safetyFlagCount: 0 }),
  );
  check(
    "B6 uniformly strong evidence recommends a structured interview, not a decision",
    strong.step === "structured_interview",
    strong.step,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nC. No radar, no polygon, no percentage profile on any report surface");
// ═══════════════════════════════════════════════════════════════════════════
{
  const surfaces = [
    ...walk(join(ROOT, "src/components/academy")),
    ...walk(join(ROOT, "src/lib/security-competency")),
    ...walk(join(ROOT, "src/routes")).filter((p) =>
      /_authenticated\.academy\.|assessments\.results/.test(p),
    ),
  ];
  check("C0 report surfaces were found", surfaces.length >= 20, String(surfaces.length));
  const RADAR =
    /\b(Radar|RadarChart|PolarGrid|PolarAngleAxis|PolarRadiusAxis|RadialBar|spiderChart|SpiderChart)\b|<polygon\b|competence-polygon|percent(age)?Profile/;
  const offenders: string[] = [];
  for (const file of surfaces) {
    const code = stripComments(readFileSync(file, "utf8"));
    if (RADAR.test(code)) offenders.push(relative(ROOT, file));
  }
  check(
    "C1 no report surface renders a radar/spider chart, polar axis or competence polygon",
    offenders.length === 0,
    offenders.join(", "),
  );
  const chartUsers = surfaces.filter((f) =>
    /components\/ui\/chart|from "recharts"/.test(readFileSync(f, "utf8")),
  );
  check(
    "C2 no report surface imports the chart primitive at all",
    chartUsers.length === 0,
    chartUsers.map((f) => relative(ROOT, f)).join(", "),
  );
  // A percentage on an area would be a profile; the type says mean is never rendered.
  const renderers = surfaces.filter((f) => /\.tsx$/.test(f));
  const meanRender = renderers.filter((f) =>
    /\{[^}]*\.(mean|spread)\b[^}]*\}/.test(stripComments(readFileSync(f, "utf8"))),
  );
  check(
    "C3 no component renders an area's mean or spread as a number",
    meanRender.length === 0,
    meanRender.map((f) => relative(ROOT, f)).join(", "),
  );
  const pctRender = renderers.filter((f) =>
    /toFixed\(\d\)\s*\+?\s*["'`]%|\{[^}]*\*\s*100[^}]*\}%/.test(
      stripComments(readFileSync(f, "utf8")),
    ),
  );
  check(
    "C4 no report component formats a competency as a percentage",
    pctRender.length === 0,
    pctRender.map((f) => relative(ROOT, f)).join(", "),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nD. Self-report is never promoted into observed evidence");
// ═══════════════════════════════════════════════════════════════════════════
{
  const support = buildDecisionSupport(candidateInput());
  const observedCodes = new Set(
    [
      ...support.strongestSupported,
      ...support.uncertainties,
      ...support.priorityFollowUp.map((f) => f.area),
    ].map((a) => a.areaCode),
  );
  check(
    "D1 no self-report domain appears in an observed bucket",
    support.selfReportedPatterns.every((s) => !observedCodes.has(s.domainKey)),
  );
  check(
    "D2 every self-report entry is stamped self_reported",
    support.selfReportedPatterns.every((s) => s.evidenceType === "self_reported"),
  );
  check(
    "D3 every observed entry is stamped observed",
    [...support.strongestSupported, ...support.uncertainties].every(
      (a) => a.evidenceType === "observed",
    ),
  );
  // The words stay descriptive: described / varied, never shown / strong / weak.
  const patternKeys = Object.keys(sv).filter(
    (k) => k.startsWith("brief.pattern.") || k.startsWith("brief.consistency."),
  );
  check(
    "D4 the self-report vocabulary exists",
    patternKeys.length === 6,
    String(patternKeys.length),
  );
  const badPattern = patternKeys.filter((k) =>
    /visat|styrka|svag|shown|strength|weak|score|poäng/i.test(sv[k] + " " + en[k]),
  );
  check(
    "D5 self-report labels never say shown, strength, weak or score",
    badPattern.length === 0,
    badPattern.join(", "),
  );
  check(
    "D6 the evidence-type tags are the two the product has and no third",
    sv["brief.evidenceType.observed"] === "Observerat" &&
      sv["brief.evidenceType.self_reported"] === "Självrapporterat" &&
      Object.keys(sv).filter((k) => k.startsWith("brief.evidenceType.")).length === 2,
  );
  // The V3 contract keeps the separation structural.
  const v3: TrustEvidenceReportV3 = TRUST_V3_EXAMPLE;
  check(
    "D7 the V3 contract holds self-report in its own array with an interpretation label",
    Array.isArray(v3.self_reported_patterns) &&
      v3.self_reported_patterns.every(
        (p) =>
          p.interpretation === "descriptive_only" || p.interpretation === "methodologically_open",
      ),
  );
  check(
    "D8 no V3 area carries self_report as an observed source under an observed state",
    v3.areas.every(
      (a) => !(a.evidence_state.startsWith("observed_") && a.source_types.includes("self_report")),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nE. SCC-08 on one item is limited evidence, never a weakness");
// ═══════════════════════════════════════════════════════════════════════════
{
  check(
    'E1 sv: a limited area is labelled "Begränsat underlag" on the recruitment report',
    sv["decision.signal.limited"] === "Begränsat underlag",
  );
  check("E1 sv: and on the brief", sv["brief.signal.limited"] === "Begränsat underlag");
  check(
    "E1 en: the label says limited evidence",
    /limited evidence/i.test(en["decision.signal.limited"] ?? "") &&
      /limited evidence/i.test(en["brief.signal.limited"] ?? ""),
  );
  const limitedCopy = Object.keys(sv).filter(
    (k) =>
      /limited|uncertain|thinEvidence/i.test(k) && REPORT_PREFIXES.some((p) => k.startsWith(p)),
  );
  check(
    "E2 there is limited-evidence copy to check",
    limitedCopy.length >= 6,
    String(limitedCopy.length),
  );
  const badLimited = limitedCopy.filter((k) => {
    const s = (sv[k] ?? "").toLowerCase();
    const e = (en[k] ?? "").toLowerCase();
    const svBad =
      /svag|risk|låg|brist|underkän/.test(s) &&
      !/inte en svaghet|inte .*svag|ingen svaghet|inget om kandidaten/.test(s);
    const enBad =
      /weak|risk|low|deficien|fail/.test(e) &&
      !/not a weakness|nothing about the candidate|not .*weak/.test(e);
    return svBad || enBad;
  });
  check(
    "E3 no limited-evidence line calls the area weak, low, a risk, a deficiency or a failure",
    badLimited.length === 0,
    badLimited.join(", "),
  );
  // One limited SCC-08 area among otherwise strong areas: it is an uncertainty, not a follow-up finding.
  const scc08: ObservedArea = {
    ...OBSERVED[0],
    areaCode: "SCC-08",
    areaSv: "Samarbete och samordning",
    areaEn: "Teamwork & Collaboration",
    signal: "limited",
    items: 1,
    evidenceState: "follow_up",
  };
  const strongRest: ObservedArea[] = Array.from({ length: 7 }, (_, i) => ({
    ...OBSERVED[0],
    areaCode: `SCC-0${i + 1}`,
    signal: "strong",
  }));
  const support = buildDecisionSupport(
    candidateInput({ observed: [...strongRest, scc08], safetyFlagCount: 0 }),
  );
  check(
    "E4 SCC-08 lands among the uncertainties",
    support.uncertainties.some((a) => a.areaCode === "SCC-08"),
  );
  check(
    "E4 and never among the priority follow-ups (which are about answers, not coverage)",
    !support.priorityFollowUp.some((f) => f.area.areaCode === "SCC-08"),
  );
  check(
    "E4 and never among the strongest signals",
    !support.strongestSupported.some((a) => a.areaCode === "SCC-08"),
  );
  check(
    "E5 the recommended step with one limited area and seven strong ones is a structured interview",
    support.recommendedNextStep === "structured_interview",
    support.recommendedNextStep,
  );
  check(
    "E6 the limited line is framed as being about the assessment, not the person",
    /inget om kandidaten/.test(sv["decision.panel.uncertainBody"] ?? ""),
  );
  const v3area: TrustEvidenceArea = TRUST_V3_EXAMPLE.areas.find(
    (a) => a.competency_code === "SCC-08",
  )!;
  check(
    "E7 the V3 example states SCC-08 as observed_limited on one item with a first-priority follow-up",
    v3area?.evidence_state === "observed_limited" &&
      v3area.observed_item_count === 1 &&
      v3area.follow_up_priority === "first" &&
      v3area.methodological_flags.includes("single_item"),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nF. No human finding, no safety panel; a finding is never a number");
// ═══════════════════════════════════════════════════════════════════════════
{
  const clean = buildDecisionSupport(candidateInput({ safetyFlagCount: 0 }));
  check("F1 with no human finding the safety panel is null", clean.safetyCriticalFollowUp === null);
  const flagged = buildDecisionSupport(candidateInput({ safetyFlagCount: 1 }));
  check(
    "F2 with one finding the panel carries a count and no score",
    flagged.safetyCriticalFollowUp?.count === 1 &&
      !("score" in (flagged.safetyCriticalFollowUp ?? {})),
  );
  check(
    "F3 the finding changes the step to clarification and nothing in the observed buckets",
    flagged.recommendedNextStep === "request_clarification" &&
      JSON.stringify(flagged.strongestSupported) === JSON.stringify(clean.strongestSupported) &&
      JSON.stringify(flagged.uncertainties) === JSON.stringify(clean.uncertainties),
  );
  const input = candidateInput();
  check(
    "F4 the builder's input carries a COUNT of findings, never a severity or a score",
    typeof input.safetyFlagCount === "number" &&
      !("safetySeverity" in input) &&
      !("riskScore" in input),
  );
  check(
    "F5 the safety copy names an action (interview) and no risk figure",
    /intervju/i.test(sv["decision.panel.safetyAction"] ?? "") &&
      !/risk(poäng|nivå)|score/i.test(
        (sv["decision.panel.safetyBodyOne"] ?? "") + (en["decision.panel.safetyBodyOne"] ?? ""),
      ),
  );
  check(
    "F6 the V3 contract carries safety as a boolean fact of human review, not a score",
    typeof TRUST_V3_EXAMPLE.human_review.safety_findings_present === "boolean" &&
      !("safety_score" in TRUST_V3_EXAMPLE.human_review),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(
  "\nG. No client reads a report snapshot directly; both consumers use the audience contract",
);
// ═══════════════════════════════════════════════════════════════════════════
{
  const srcFiles = walk(join(ROOT, "src"));
  const readers = srcFiles
    .filter((f) =>
      /\.from\(\s*["']scp_report_snapshots["']/.test(stripComments(readFileSync(f, "utf8"))),
    )
    .map((f) => relative(ROOT, f))
    .sort();
  // PR-R0 pinned exactly two direct readers here; PR-R2A migrated both to the
  // audience entry points and 20261025090000 revoked the table read, so a
  // direct read that reappears would not merely be a style problem -- it
  // would return "permission denied" in production.
  check(
    "G1 no src file reads scp_report_snapshots directly (PR-R2A: the audience RPCs are the only path)",
    readers.length === 0,
    readers.join(", "),
  );
  const academy = stripComments(read("src/lib/security-competency/academy-employer.functions.ts"));
  check(
    "G2 getAcademyReport reads the participant document through scp_participant_report and the employer one through scp_employer_report",
    /\.rpc\("scp_participant_report",\s*\{\s*_attempt_id:/.test(academy) &&
      /\.rpc\("scp_employer_report",\s*\{\s*_attempt_id:/.test(academy),
  );
  check(
    "G2b and names neither derivation_input nor the snapshot table anywhere",
    !/derivation_input/.test(academy) && !/scp_report_snapshots/.test(academy),
  );
  check(
    "G2c the client brief types carry no mean and no spread, and the mapper reads none",
    !/\bmean\??:\s*number/.test(academy) &&
      !/\bspread\??:\s*number/.test(academy) &&
      !/\b[or]\.(mean|spread)\b/.test(academy),
  );
  const bridge = stripComments(read("src/lib/interview-intelligence/context.functions.ts"));
  check(
    "G3 the interview bridge reads the released brief through scp_employer_report",
    /\.rpc\("scp_employer_report",\s*\{\s*_attempt_id:/.test(bridge) &&
      !/scp_report_snapshots/.test(bridge),
  );
  check("G3b and never asks for the participant document", !/scp_participant_report/.test(bridge));
  check(
    "G3c and still carries only area/signal/behaviour and the guide follow-ups -- no question, no listen-for, no payload, no context",
    /followupSv:\s*String\(g\.followup_sv/.test(bridge) &&
      !/questionSv:/.test(bridge) &&
      !/listenFor/.test(bridge) &&
      !/snap\.payload|snap\.context|\.payload\b/.test(bridge),
  );
  const types = read("src/integrations/supabase/types.ts");
  const rpcShape = (name: string) => {
    const m = types.match(new RegExp(`      ${name}: \\{\\n([\\s\\S]*?)\\n      \\}\\n`));
    return m ? m[1] : "";
  };
  const par = rpcShape("scp_participant_report");
  const emp = rpcShape("scp_employer_report");
  check(
    "G7 both audience RPCs are typed, and neither type names derivation_input, threshold_version, scoring_model_version or issuer_organization_id",
    par.length > 0 &&
      emp.length > 0 &&
      [par, emp].every(
        (t) =>
          /payload: Json/.test(t) &&
          /brief: Json/.test(t) &&
          /safety_flags: Json/.test(t) &&
          /limitations_sv: string\[\]/.test(t) &&
          !/derivation_input|threshold_version|scoring_model_version|issuer_organization_id|evidence_state_version|evidence_scope_version/.test(
            t,
          ),
      ),
  );
  const ledgerReaders = srcFiles.filter((f) =>
    /\.from\(\s*["'](scp_competency_evidence|scp_human_reviews|scp_review_rubric_scores|scp_report_versions|scp_interview_notes|scp_employer_report_decisions)["']/.test(
      stripComments(readFileSync(f, "utf8")),
    ),
  );
  check(
    "G4 no client code reads the evidence ledger, reviews, rubric levels, templates, interview notes or decisions directly",
    ledgerReaders.length === 0,
    ledgerReaders.map((f) => relative(ROOT, f)).join(", "),
  );
  const attemptReaders = srcFiles
    .filter((f) => /\.from\(\s*["']scp_attempts["']/.test(stripComments(readFileSync(f, "utf8"))))
    .map((f) => relative(ROOT, f));
  check(
    "G5 the one direct scp_attempts read is the participant's own delivery path",
    JSON.stringify(attemptReaders) ===
      JSON.stringify(["src/lib/security-competency/academy-delivery.functions.ts"]),
    attemptReaders.join(", "),
  );
  // The client must never send a contribution (review-contribution:check owns
  // the full rule; this pins the report layer's half).
  const reportLayer = [
    "src/lib/security-competency/decision-support.ts",
    "src/routes/_authenticated.employer.$employerSlug.assessments.results.$attemptId.tsx",
    "src/routes/_authenticated.academy.report.$attemptId.tsx",
  ].map((f) => stripComments(read(f)));
  // J. A failed read must not masquerade as an unreleased report. This is the
  // defect that hid a production outage: 16 released reports were withheld by
  // the audience RPC and every affected candidate was shown the ordinary
  // "not available yet" state, while their own history offered them the
  // report. The server function now throws, and both report routes render a
  // failure as a failure.
  check(
    "J1 getAcademyReport throws on an RPC failure instead of returning null",
    /if \(error\) throw fail\(/.test(academy) && !/if \(error \|\| !row\)/.test(academy),
  );
  check(
    "J2 and reserves null for the one case that means it: no released report",
    /if \(!row\) return null;/.test(academy),
  );
  {
    const routes = [
      "src/routes/_authenticated.academy.report.$attemptId.tsx",
      "src/routes/_authenticated.employer.$employerSlug.assessments.results.$attemptId.tsx",
    ].map((f) => stripComments(read(f)));
    check(
      "J3 both report routes distinguish a failed read from an unreleased report",
      routes.every(
        (c) => /report\.isError/.test(c) && /logAcademyError\(/.test(c) && /!report\.data/.test(c),
      ),
    );
    check(
      "J4 and neither shows a raw database message to the reader",
      routes.every((c) => !/report\.error\.message|error\.details|String\(report\.error\)/.test(c)),
    );
  }

  check(
    "G6 the report layer never computes or submits a contribution, maturity or score of its own",
    !reportLayer.some((c) =>
      /\bcontribution\s*[:=]|scp_compute_maturity|scp_attempt_maturity|score_value/.test(c),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nH. The future contracts name every locked field and no forbidden one");
// ═══════════════════════════════════════════════════════════════════════════
{
  const v3 = TRUST_V3_EXAMPLE;
  const top = [
    "schema_version",
    "report_id",
    "released_at",
    "audience",
    "context",
    "coverage",
    "areas",
    "self_reported_patterns",
    "trust_followups",
    "limitations",
    "human_review",
  ];
  check(
    "H1 the V3 report carries every top-level field the owner locked",
    top.every((k) => k in v3),
    top.filter((k) => !(k in v3)).join(", "),
  );
  const areaFields = [
    "competency_code",
    "competency_version",
    "evidence_state",
    "observed_item_count",
    "planned_item_count",
    "context_count",
    "source_types",
    "coverage_status",
    "review_status",
    "methodological_flags",
    "factual_explanation",
    "follow_up_priority",
  ];
  check(
    "H2 every V3 area carries the twelve locked fields",
    v3.areas.every((a) => areaFields.every((k) => k in a)),
  );
  const numericAreaKeys = v3.areas.flatMap((a) =>
    Object.entries(a)
      .filter(([, v]) => typeof v === "number")
      .map(([k]) => k),
  );
  check(
    "H3 the only numbers on a V3 area are counts",
    numericAreaKeys.every((k) => /_count$/.test(k)),
    numericAreaKeys.join(", "),
  );
  check(
    "H4 the V3 report has no top-level score, total, rank or verdict",
    !["score", "total", "rank", "verdict", "decision", "recommendation"].some((k) => k in v3),
  );
  check("H5 the V3 schema version is named", v3.schema_version === "trust-evidence-report/v3");

  // The manifest contract: assert the TYPE still names every field, by
  // constructing a value that must satisfy it.
  const evidenceRow: TrustManifestEvidenceRow = {
    evidence_id: "e",
    response_id: "r",
    item_id: "i",
    item_version: "1",
    option_key_version: "1",
    rubric_version: null,
    competency_code: "SCC-08",
    competency_mapping_version: "1",
    source_type: "assessment_response",
    classification: "observed",
    provenance_type: "deterministic",
    contribution: 1,
    confidence: 1,
    included: true,
    exclusion_reason: null,
  };
  const area: TrustManifestAreaComputation = {
    competency_code: "SCC-08",
    item_count: 1,
    weighted_sum: 1,
    denominator: 1,
    spread: 0,
    classification_rule: "ras-v1",
    final_area_signal: "limited",
  };
  const manifest: TrustComputationManifest = {
    report_version_id: "v",
    snapshot_id: "s",
    attempt_id: "a",
    calculated_at: "t",
    calculation_schema_version: "1",
    scoring_model_version: "det-v1",
    signal_model_version: "ras-v1",
    threshold_version: "v1",
    evidence_state_version: "des-v2",
    evidence_scope_version: "attempt-v1",
    report_template_version: "tpl",
    trust_question_version: "igp-v1",
    rubric_versions: [],
    competency_mapping_version: "1",
    included_evidence: [evidenceRow],
    excluded_evidence: [],
    areas: [area],
    canonical_sha256: "0".repeat(64),
  };
  check(
    "H6 the manifest type names every required field",
    TRUST_MANIFEST_REQUIRED_FIELDS.every((k) => k in manifest),
    TRUST_MANIFEST_REQUIRED_FIELDS.filter((k) => !(k in manifest)).join(", "),
  );
  check(
    "H7 the manifest evidence row names item, option-key and rubric versions, contribution, confidence, classification and exclusion reason",
    TRUST_MANIFEST_EVIDENCE_FIELDS.every((k) => k in evidenceRow),
  );
  check(
    "H8 the manifest area names item count, weighted sum, denominator, spread, rule and final signal",
    TRUST_MANIFEST_AREA_FIELDS.every((k) => k in area),
  );
  check(
    "H9 the manifest is where the numbers live, and the audience document only references it by id and hash",
    "canonical_sha256" in v3.computation_manifest_ref &&
      !("included_evidence" in v3) &&
      !("weighted_sum" in v3),
  );

  // PR-R0 must not have created any of it.
  const migrations = readdirSync(join(ROOT, "supabase/migrations"));
  const manifestMigration = migrations.filter((f) => /manifest/i.test(f) || /computation/i.test(f));
  check(
    "H10 no migration creates the computation manifest yet",
    manifestMigration.length === 0,
    manifestMigration.join(", "),
  );
  const anyMigrationMentions = migrations.filter((f) =>
    /scp_report_computation_manifests/.test(
      readFileSync(join(ROOT, "supabase/migrations", f), "utf8"),
    ),
  );
  check(
    "H11 no migration names scp_report_computation_manifests",
    anyMigrationMentions.length === 0,
    anyMigrationMentions.join(", "),
  );
  const srcMentions = walk(join(ROOT, "src")).filter((f) =>
    /trust-evidence-report-v3-contract|TrustEvidenceReportV3/.test(readFileSync(f, "utf8")),
  );
  check(
    "H12 nothing in src/ imports or renders the V3 contract",
    srcMentions.length === 0,
    srcMentions.map((f) => relative(ROOT, f)).join(", "),
  );

  // The characterisation document lists every reproducibility row.
  const doc = read("docs/assessment/architecture/trust-evidence-report-r0-characterisation.md");
  const rows = [
    "calculated_at",
    "calculation_schema_version",
    "scoring model version",
    "signal model version",
    "threshold version",
    "rubric version",
    "competency mapping version",
    "report template version",
    "TRUST question version",
    "included evidence rows",
    "excluded evidence rows",
    "per-item contribution",
    "per-item confidence",
    "observed/self-report classification",
    "denominator",
    "canonical hash",
  ];
  const missingRows = rows.filter((r) => !doc.toLowerCase().includes(r.toLowerCase()));
  check(
    "H13 the reproducibility gap table names all sixteen rows",
    missingRows.length === 0,
    missingRows.join(", "),
  );
  check(
    "H13 and classifies each as frozen / partially frozen / not frozen",
    /CURRENTLY FROZEN/.test(doc) && /PARTIALLY FROZEN/.test(doc) && /NOT FROZEN/.test(doc),
  );
}

console.log("");
if (failures.length > 0) {
  console.error(
    `trust-evidence-report:check: FAIL (${failures.length} of ${failures.length + passed})`,
  );
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`trust-evidence-report:check: PASS (${passed} assertions)`);
