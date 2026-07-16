import { questions } from "@/lib/assessment-content";
import { allDimensionIds } from "./dimensions";
import { computeMatches, computeUserVector } from "./matching-engine";
import { professionProfileById, professionProfiles } from "./profession-profiles";
import { questionMappingById } from "./question-mappings";
import { testPersonas } from "./test-personas";
import type { DimensionId, ProfessionMatchGate } from "./types";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export function runValidation(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Every question has a mapping and every option is mapped.
  for (const q of questions) {
    const m = questionMappingById[q.id];
    if (!m) {
      issues.push({ code: "MISSING_MAPPING", message: `Question ${q.id} has no dimension mapping`, severity: "error" });
      continue;
    }
    if (q.type === "rating" && (!m.rating || m.rating.length === 0)) {
      issues.push({ code: "RATING_NO_WEIGHTS", message: `Rating question ${q.id} has no rating weights`, severity: "error" });
    }
    if ((q.type === "single" || q.type === "multi") && q.options) {
      for (const opt of q.options) {
        const om = m.options?.find((o) => o.optionId === opt.id);
        if (!om) issues.push({ code: "OPTION_UNMAPPED", message: `Question ${q.id}: option '${opt.id}' has no mapping`, severity: "error" });
        else if (om.weights.length === 0)
          issues.push({ code: "OPTION_NO_WEIGHTS", message: `Question ${q.id}: option '${opt.id}' has empty weights`, severity: "warning" });
      }
    }
  }

  // 2. Profile sanity.
  for (const p of professionProfiles) {
    if (!p.distinguishing || p.distinguishing.length === 0)
      issues.push({
        code: "NO_DISTINGUISHING",
        message: `Profile ${p.professionId} has no distinguishing dimensions`,
        severity: "warning",
      });
    // Gate consistency for management roles.
    if (/manager|consultant/i.test(p.professionId) && p.gate !== "leadership_strategic" && p.gate !== "none") {
      issues.push({
        code: "MANAGEMENT_GATE",
        message: `Management-like profile ${p.professionId} should typically use gate 'leadership_strategic'`,
        severity: "warning",
      });
    }
    for (const [dim, spec] of Object.entries(p.targets)) {
      if (!spec) continue;
      if (spec.target < 0 || spec.target > 100)
        issues.push({ code: "TARGET_RANGE", message: `${p.professionId}: dim ${dim} target ${spec.target} out of 0..100`, severity: "error" });
      if (![1, 2, 3].includes(spec.importance))
        issues.push({ code: "IMPORTANCE_RANGE", message: `${p.professionId}: dim ${dim} importance not 1..3`, severity: "error" });
    }
  }

  // 3. Every dimension is exercised by at least one question.
  const exercised = new Set<string>();
  for (const m of Object.values(questionMappingById)) {
    m.options?.forEach((o) => o.weights.forEach((w) => exercised.add(w.dimension)));
    m.rating?.forEach((r) => exercised.add(r.dimension));
  }
  for (const d of allDimensionIds)
    if (!exercised.has(d))
      issues.push({ code: "DIM_UNUSED", message: `Dimension ${d} is not exercised by any question`, severity: "warning" });

  // 4. Gates must reference known dimensions and profiles must include the
  // dimensions their gate reads.
  const gateDeps: Record<ProfessionMatchGate, DimensionId[]> = {
    leadership_strategic: ["leadership_orientation", "strategic_orientation"],
    technical: ["technical_orientation"],
    investigative_analytical: ["investigation_orientation", "analytical_orientation"],
    operational: ["operational_orientation"],
    none: [],
  };
  for (const p of professionProfiles) {
    for (const d of gateDeps[p.gate]) {
      if (!allDimensionIds.includes(d)) {
        issues.push({
          code: "GATE_UNKNOWN_DIM",
          message: `${p.professionId}: gate references unknown dimension '${d}'`,
          severity: "error",
        });
      }
    }
  }

  // 5. Unobserved dimensions must not default to 50 in a vector when no answer
  // was provided (observed=false regardless of normalized display value).
  const emptyVector = computeUserVector({});
  for (const v of emptyVector) {
    if (v.observed) {
      issues.push({
        code: "EMPTY_ANSWER_OBSERVED",
        message: `Empty answer set marks '${v.dimension}' as observed`,
        severity: "error",
      });
    }
  }
  // With an empty answer set no profession should have raw evidence for its
  // important dims.
  const emptyMatches = computeMatches({});
  for (const m of emptyMatches.matches) {
    if (m.contributingImportantCount > 0) {
      issues.push({
        code: "EMPTY_IMPORTANT_EVIDENCE",
        message: `${m.professionId}: reports evidence for empty answers`,
        severity: "error",
      });
    }
    if (m.confidence === "stronger") {
      issues.push({
        code: "EMPTY_STRONG_CONFIDENCE",
        message: `${m.professionId}: reports 'stronger' confidence for empty answers`,
        severity: "error",
      });
    }
  }

  // 6. Persona uniqueness and expectation sanity.
  const seenIds = new Set<string>();
  for (const persona of testPersonas) {
    if (seenIds.has(persona.id)) {
      issues.push({
        code: "PERSONA_DUPLICATE",
        message: `Duplicate persona id '${persona.id}'`,
        severity: "error",
      });
    }
    seenIds.add(persona.id);
    for (const disallowed of persona.disallowedTop ?? []) {
      if (!professionProfileById[disallowed]) {
        issues.push({
          code: "PERSONA_UNKNOWN_PROFESSION",
          message: `${persona.id}: disallowedTop references unknown profession '${disallowed}'`,
          severity: "error",
        });
      }
    }
  }

  return issues;
}

export interface PersonaTestOutcome {
  personaId: string;
  top5: { professionId: string; family: string; displayedMatch: number; confidence: string }[];
  passed: boolean;
  reasons: string[];
}

export function runPersonaTests(): { outcomes: PersonaTestOutcome[]; diversityPassed: boolean } {
  const outcomes: PersonaTestOutcome[] = testPersonas.map((persona) => {
    const result = computeMatches(persona.answers);
    const top5 = result.matches.slice(0, 5).map((m) => ({
      professionId: m.professionId,
      family: m.family,
      displayedMatch: m.displayedMatch,
      confidence: m.confidence,
    }));
    const reasons: string[] = [];
    const topFamily = top5[0]?.family;
    const topId = top5[0]?.professionId;
    if (!persona.expectedTopFamilies.includes(topFamily))
      reasons.push(`Top family '${topFamily}' not in expected ${persona.expectedTopFamilies.join("|")}`);
    if (persona.disallowedTop?.includes(topId))
      reasons.push(`Disallowed profession '${topId}' ranked #1`);
    return { personaId: persona.id, top5, passed: reasons.length === 0, reasons };
  });

  const distinctTops = new Set(outcomes.map((o) => o.top5[0]?.professionId));
  const diversityPassed = distinctTops.size >= 5;
  return { outcomes, diversityPassed };
}

// Dev-only console report (idempotent-ish; runs once per import).
let reported = false;
export function reportOnce() {
  if (reported) return;
  reported = true;
  const issues = runValidation();
  const { outcomes, diversityPassed } = runPersonaTests();
  // eslint-disable-next-line no-console
  console.groupCollapsed("[career-assessment] validation & persona tests");
  if (issues.length) console.warn("Validation issues", issues);
  else console.log("Validation: 0 errors");
  console.log("Distinct #1 professions across personas:", new Set(outcomes.map((o) => o.top5[0]?.professionId)).size);
  console.log("Diversity check:", diversityPassed ? "PASS" : "FAIL");
  for (const o of outcomes) {
    // eslint-disable-next-line no-console
    console.log(
      `${o.personaId} ${o.passed ? "OK" : "FAIL"}`,
      o.top5,
      o.reasons.length ? { reasons: o.reasons } : "",
    );
  }
  console.groupEnd();
  return { issues, outcomes, diversityPassed };
}

export { professionProfileById };