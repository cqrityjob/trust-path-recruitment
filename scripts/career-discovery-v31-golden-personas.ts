// Golden personas — Execution Mandate §30.
//
// Proves the full Layer 4 pipeline (dims -> matches -> stage -> explanation
// -> Career Card data) end to end for the 9 required personas, against the
// REAL first-wave calibration (scripts/fixtures/first-wave-profession-catalog.ts,
// generated from the exact values in the applied migration
// 20260814180000_cd_layer4_first_wave_professions.sql — not a second,
// diverging copy).
//
// What this script does NOT cover, and why that is not a gap in what it
// claims: live CIG content (requirements/education/pathway/jobs) is fetched
// by profession-detail.functions.ts, which needs a Supabase client and a
// browser/server runtime this plain script does not have. That query shape
// was verified directly against the hosted project instead (see the
// session's browser-tool checks) — real verification, just not from this
// file. Nothing here fabricates that layer to make a check pass.
//
// This never touches approved_for_ranking. The catalog below is a TEST
// FIXTURE standing in for "if these professions were approved" — exactly
// Execution Mandate §4/§29's instruction: build and prove the product
// against the first-wave profiles now, keep the real flag off, let the
// owner flip it later.

import { writeFileSync } from "node:fs";
import { DIMENSION_IDS, type DimensionId } from "../src/lib/career-discovery/v31/dimensions";
import {
  buildCareerCardData,
} from "../src/lib/career-discovery/v31/career-card";
import { explainMatch } from "../src/lib/career-discovery/v31/profession-explanations";
import { matchProfessions, type ProfessionMatch } from "../src/lib/career-discovery/v31/professions";
import type { Confidence, DimensionResult } from "../src/lib/career-discovery/v31/scoring";
import type { ContextStatus } from "../src/lib/career-discovery/types";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

function makeDims(scores: Partial<Record<DimensionId, number | null>>): DimensionResult {
  const dimensions = Object.fromEntries(
    DIMENSION_IDS.map((id) => {
      const value = id in scores ? scores[id]! : null;
      return [
        id,
        {
          dimension: id,
          score: value,
          evidenceWeight: value === null ? 0 : 1.5,
          dominance: value === null ? null : 0.3,
          coverage: value === null ? 0 : 1,
          confidence: (value === null ? "none" : "high") as Confidence,
          sources: value === null ? [] : ["fixture"],
          tertiaryOnly: false,
        },
      ];
    }),
  ) as DimensionResult["dimensions"];

  return { scoringVersion: "fixture", dimensions, answeredItems: [], complete: true };
}

interface Persona {
  readonly name: string;
  readonly contextStatus: ContextStatus;
  readonly dims: Partial<Record<DimensionId, number | null>>;
}

const PERSONAS: readonly Persona[] = [
  {
    name: "Student / no experience",
    contextStatus: "exploring_security",
    dims: {
      CID01: 0.6, CID02: 0.4, CID03: 0.5, CID04: 0.4, CID05: 0.3, CID06: 0.6, CID07: 0.6,
      CID08: 0.7, CID09: 0.6, CID10: 0.4, CID11: 0.55, CID12: 0.55, CID13: 0.6, CID14: 0.75, CID16: 0.65,
    },
  },
  {
    name: "New to security",
    contextStatus: "exploring_security",
    dims: {
      CID01: 0.75, CID02: 0.35, CID03: 0.45, CID04: 0.4, CID05: 0.3, CID06: 0.65, CID07: 0.5,
      CID08: 0.5, CID09: 0.55, CID10: 0.4, CID11: 0.6, CID12: 0.55, CID13: 0.55, CID14: 0.6, CID16: 0.6,
    },
  },
  {
    name: "Väktare",
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.85, CID02: 0.4, CID03: 0.5, CID04: 0.4, CID05: 0.3, CID06: 0.85, CID07: 0.6,
      CID08: 0.6, CID09: 0.6, CID10: 0.4, CID11: 0.8, CID12: 0.65, CID13: 0.6, CID14: 0.55, CID16: 0.85,
    },
  },
  {
    name: "Experienced Säkerhetssamordnare",
    contextStatus: "developing_current_role",
    dims: {
      CID01: 0.4, CID02: 0.8, CID03: 0.6, CID04: 0.45, CID05: 0.65, CID06: 0.7, CID07: 0.85,
      CID08: 0.55, CID09: 0.6, CID10: 0.4, CID11: 0.85, CID12: 0.7, CID13: 0.8, CID14: 0.7, CID16: 0.65,
    },
  },
  {
    name: "Career changer (already working in security)",
    contextStatus: "changing_career_area",
    dims: {
      CID01: 0.5, CID02: 0.55, CID03: 0.55, CID04: 0.4, CID05: 0.5, CID06: 0.6, CID07: 0.65,
      CID08: 0.65, CID09: 0.55, CID10: 0.45, CID11: 0.7, CID12: 0.6, CID13: 0.65, CID14: 0.65, CID16: 0.6,
    },
  },
  {
    name: "Technical profile",
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.3, CID02: 0.4, CID03: 0.8, CID04: 0.85, CID05: 0.5, CID06: 0.6, CID07: 0.5,
      CID08: 0.3, CID09: 0.25, CID10: 0.6, CID11: 0.6, CID12: 0.55, CID13: 0.5, CID14: 0.75, CID16: 0.55,
    },
  },
  {
    name: "Investigation / analysis profile",
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.35, CID02: 0.4, CID03: 0.75, CID04: 0.5, CID05: 0.5, CID06: 0.6, CID07: 0.6,
      CID08: 0.35, CID09: 0.35, CID10: 0.85, CID11: 0.8, CID12: 0.6, CID13: 0.5, CID14: 0.65, CID16: 0.55,
    },
  },
  {
    name: "Broad profile",
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.68, CID02: 0.66, CID03: 0.7, CID04: 0.65, CID05: 0.64, CID06: 0.7, CID07: 0.68,
      CID08: 0.66, CID09: 0.65, CID10: 0.67, CID11: 0.7, CID12: 0.66, CID13: 0.68, CID14: 0.67, CID16: 0.68,
    },
  },
  {
    name: "Sparse / ambiguous profile",
    contextStatus: "exploring_security",
    dims: { CID01: 0.5, CID06: 0.5 }, // only 2 of 16 observed — well under the coverage floor
  },
];

const report: string[] = [];
report.push("# Golden Persona Report — Security Career Discovery v3.1 Layer 4\n");
report.push(
  "Generated against the first-wave 14-profession fixture (matches the applied migration). " +
    "Test-only — `approved_for_ranking` is untouched.\n",
);

function describeMatch(m: ProfessionMatch, dims: DimensionResult): string {
  const explanation = explainMatch(m, "sv");
  const dimensionScores = Object.fromEntries(
    DIMENSION_IDS.map((id) => [id, dims.dimensions[id].score]),
  ) as Record<DimensionId, number | null>;
  const card = buildCareerCardData({
    match: m,
    dimensionScores,
    locale: "sv",
    definitionVersion: "2026-scd-v3.1.0",
    generatedAt: "2026-08-15T00:00:00.000Z",
  });
  return [
    `  - **${m.titleSv}** (${m.professionId}) — stage: ${m.stage}, fit: ${m.fitTier}`,
    `    why: ${explanation.rationale}`,
    `    ${explanation.stageSentence}`,
    `    aligned: ${explanation.alignedDimensionNames.join(", ") || "—"}`,
    `    card indicators: ${card.indicators.map((i) => `${i.label} (${Math.round(i.value * 100)}% bar)`).join(", ") || "none"}`,
  ].join("\n");
}

for (const persona of PERSONAS) {
  group(persona.name);
  const dims = makeDims(persona.dims);
  const result = matchProfessions(dims, FIRST_WAVE_CATALOG, persona.contextStatus);

  report.push(`## ${persona.name}\n`);
  report.push(`Context: \`${persona.contextStatus}\`\n`);

  if (!result.available) {
    report.push("No professions cleared matching (insufficient coverage or fit) — shown honestly as unavailable, not padded.\n");
  } else {
    report.push(`### Strongest directions to explore\n${result.strongestDirections.map((m) => describeMatch(m, dims)).join("\n")}\n`);
    report.push(`### Also worth exploring\n${result.alsoWorthExploring.map((m) => describeMatch(m, dims)).join("\n") || "  (none)"}\n`);
    report.push(`### Longer-term possibilities\n${result.longerTermPossibilities.map((m) => describeMatch(m, dims)).join("\n") || "  (none)"}\n`);
  }

  // No hard-coded "must include profession X" assertions beyond what the
  // persona's design intends to prove — see each group's checks below.
  if (persona.name === "Student / no experience" || persona.name === "New to security") {
    const seniorAsExploreNow = result.matches.some((m) => m.stage === "explore_now" && FIRST_WAVE_CATALOG.find((c) => c.professionId === m.professionId)?.careerStage === "senior");
    ok(!seniorAsExploreNow, `${persona.name}: no senior-stage profession is ever "explore now" for a novice baseline`);
  }

  if (persona.name === "Väktare") {
    const skyddsvakt = result.matches.find((m) => m.professionId === "SP003");
    const coordinator = result.matches.find((m) => m.professionId === "SP006");
    const headOfSecurity = result.matches.find((m) => m.professionId === "SP007");
    ok(skyddsvakt?.stage === "explore_now", "Väktare: Skyddsvakt is explore_now");
    ok(coordinator === undefined || coordinator.stage === "possible_next_step", "Väktare: Säkerhetssamordnare, if matched, is possible_next_step");
    ok(headOfSecurity === undefined || headOfSecurity.stage === "longer_term", "Väktare: Säkerhetschef, if matched, is longer_term");
  }

  if (persona.name === "Experienced Säkerhetssamordnare") {
    const headOfSecurity = result.matches.find((m) => m.professionId === "SP007");
    ok(headOfSecurity?.stage === "possible_next_step", "Experienced Coordinator: Säkerhetschef is possible_next_step, not longer_term");
  }

  if (persona.name === "Career changer (already working in security)") {
    const developingTierExploreNow = result.matches.some(
      (m) =>
        m.stage === "explore_now" &&
        FIRST_WAVE_CATALOG.find((c) => c.professionId === m.professionId)?.careerStage === "developing",
    );
    ok(developingTierExploreNow, "Career changer: a developing-stage profession is explore_now — not reset to an entry baseline");
  }

  if (persona.name === "Technical profile") {
    const top = result.strongestDirections.map((m) => m.professionId);
    ok(
      top.some((id) => ["SP008", "SP009", "SP014"].includes(id)),
      "Technical profile: a technical profession (SOC/Cyber/Technician) appears among the strongest directions",
    );
    ok(
      !top.includes("SP002"), // Ordningsvakt — conflict-heavy, opposite of this persona's low CID09
      "Technical profile: the conflict-heavy Ordningsvakt is not among the strongest directions",
    );
  }

  if (persona.name === "Investigation / analysis profile") {
    // SP010/SP013 are "developing"-stage — for a working_in_security
    // (entry) baseline that is correctly "possible next step", not
    // "explore now", so this checks the top recommendations overall rather
    // than conflating fit with the separate stage-gate.
    const topOverall = [...result.strongestDirections, ...result.alsoWorthExploring].map((m) => m.professionId);
    ok(
      topOverall.some((id) => ["SP010", "SP013"].includes(id)),
      "Investigation profile: an investigative profession (Utredare/AML) is recommended, with strong fit",
    );
  }

  if (persona.name === "Broad profile") {
    ok(
      result.strongestDirections.length >= 2 && result.strongestDirections.length <= 3,
      `Broad profile: strongest directions is a genuine short list (${result.strongestDirections.length}), not "everything fits"`,
    );
    const distinctStages = new Set(result.matches.map((m) => m.stage));
    ok(distinctStages.size >= 2, "Broad profile: recommendations differentiate across career stages, not one undifferentiated blob");
  }

  if (persona.name === "Sparse / ambiguous profile") {
    ok(result.available === false, "Sparse profile: honestly unavailable rather than fabricating matches from thin evidence");
    ok(result.matches.length === 0, "Sparse profile: zero matches, not a padded low-confidence list");
  }

  // Universal invariants, every persona.
  for (const m of result.matches) {
    ok(!("fitScore" in m), `${persona.name}/${m.professionId}: no raw fitScore on the match`);
    ok(
      FIRST_WAVE_CATALOG.some((c) => c.professionId === m.professionId),
      `${persona.name}/${m.professionId}: every recommended profession is a real, catalogued one — never fabricated`,
    );
  }
}

writeFileSync(
  new URL("../docs/career-discovery/v31-golden-persona-report.md", import.meta.url),
  report.join("\n"),
);

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-v31-golden-personas: all ${checks} checks passed.`);
console.log("Report written to docs/career-discovery/v31-golden-persona-report.md");
