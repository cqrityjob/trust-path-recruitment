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
import { DIMENSION_IDS, DIMENSIONS, type DimensionId } from "../src/lib/career-discovery/v31/dimensions";
import {
  buildCareerCardData,
} from "../src/lib/career-discovery/v31/career-card";
import { CAREER_AREAS, rankCareerAreas } from "../src/lib/career-discovery/v31/career-areas";
import { explainMatch } from "../src/lib/career-discovery/v31/profession-explanations";
import { matchProfessions, type ProfessionMatch } from "../src/lib/career-discovery/v31/professions";
import type { Confidence, DimensionResult } from "../src/lib/career-discovery/v31/scoring";
import { GOLDEN_PERSONAS } from "../src/lib/career-discovery/v31/golden-persona-fixtures";
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

// The 9 personas are NOT re-authored here. Execution Mandate note (this
// session): the script and the admin owner-preview route
// (_authenticated.admin.career-discovery-preview.tsx) used to each keep
// their own hand-authored persona list, which could silently drift into
// describing different personas under the same name. Both now import the
// single shared GOLDEN_PERSONAS array — see its own file header.
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

for (const persona of GOLDEN_PERSONAS) {
  group(persona.name.en);
  const dims = makeDims(persona.dims);
  const result = matchProfessions(
    dims,
    FIRST_WAVE_CATALOG,
    persona.contextStatus,
    persona.currentProfessionCigSlug ?? null,
    [],
    undefined,
    persona.experienceBand ?? null,
  );
  const areas = rankCareerAreas(dims);

  report.push(`## ${persona.name.en}\n`);
  report.push(
    `Context: \`${persona.contextStatus}\`${persona.experienceBand ? ` · experience: \`${persona.experienceBand}\`` : ""}${persona.currentProfessionCigSlug ? ` · current profession: \`${persona.currentProfessionCigSlug}\`` : ""}\n`,
  );

  if (areas.sufficientEvidence) {
    report.push(
      `### Career Areas (broad orientation, top 3)\n${areas.ranked
        .slice(0, 3)
        .map(
          (a) =>
            `  ${a.rank}. **${CAREER_AREAS[a.areaId].name.en}** (${a.areaId}) — aligned: ${a.alignedDimensions.map((d) => DIMENSIONS[d].name.en).join(", ") || "—"}`,
        )
        .join("\n")}${areas.grouped ? "\n  (top areas are closely grouped, not a strict order)" : ""}\n`,
    );
  }

  if (!result.available) {
    report.push("No professions cleared matching (insufficient coverage or fit) — shown honestly as unavailable, not padded.\n");
  } else {
    report.push(`### Strongest directions to explore\n${result.strongestDirections.map((m) => describeMatch(m, dims)).join("\n")}\n`);
    report.push(`### Also worth exploring\n${result.alsoWorthExploring.map((m) => describeMatch(m, dims)).join("\n") || "  (none)"}\n`);
    report.push(`### Longer-term possibilities\n${result.longerTermPossibilities.map((m) => describeMatch(m, dims)).join("\n") || "  (none)"}\n`);
    report.push(`### Career pivot — real affinity, different direction\n${result.careerPivots.map((m) => describeMatch(m, dims)).join("\n") || "  (none)"}\n`);
  }

  // No hard-coded "must include profession X" assertions beyond what the
  // persona's design intends to prove — see each group's checks below.
  if (persona.name.en === "Student / no experience" || persona.name.en === "New to security") {
    const seniorAsExploreNow = result.matches.some((m) => m.stage === "explore_now" && FIRST_WAVE_CATALOG.find((c) => c.professionId === m.professionId)?.careerStage === "senior");
    ok(!seniorAsExploreNow, `${persona.name.en}: no senior-stage profession is ever "explore now" for a novice baseline`);
  }

  if (persona.name.en === "Väktare (1-3 years)" || persona.name.en === "Experienced Väktare (8+ years)") {
    const skyddsvakt = result.matches.find((m) => m.professionId === "SP003");
    const coordinator = result.matches.find((m) => m.professionId === "SP006");
    const headOfSecurity = result.matches.find((m) => m.professionId === "SP007");
    ok(skyddsvakt?.stage === "explore_now", `${persona.name.en}: Skyddsvakt is explore_now`);
    ok(coordinator === undefined || coordinator.stage === "possible_next_step", `${persona.name.en}: Säkerhetssamordnare, if matched, is possible_next_step`);
    ok(headOfSecurity === undefined || headOfSecurity.stage === "longer_term", `${persona.name.en}: Säkerhetschef, if matched, is longer_term`);
    ok(
      persona.currentProfessionCigSlug === "vaktare",
      `${persona.name.en}: persona fixture reports a real current profession (item 2 requires this for pivot classification to run at all)`,
    );
    ok(
      skyddsvakt?.stage !== "career_pivot",
      `${persona.name.en}: Skyddsvakt (same career area, SCA01) is never a career_pivot -- an adjacent, same-track move`,
    );
    // Owner Approval Gate item 3: SCA01 Guarding must still legitimately
    // rank #1 for a genuinely operational Väktare profile -- the Career
    // Area bias fix must not overcorrect into hiding a real fit.
    ok(
      areas.ranked[0]?.areaId === "SCA01",
      `${persona.name.en}: SCA01 Guarding & Operational Protection is genuinely the top Career Area`,
    );
  }

  if (persona.name.en === "Väktare (1-3 years)") {
    ok(persona.experienceBand === "1_3y", "Väktare (1-3 years): experience band is set correctly");
  }

  if (persona.name.en === "Experienced Väktare (8+ years)") {
    ok(persona.experienceBand === "8_plus_y", "Experienced Väktare (8+ years): experience band is set correctly");
    // Owner Approval Gate item 3.B: 8+ years genuinely changes the realistic
    // pathway vs the 1-3y persona -- Personskyddsvakt (a "developing"-stage
    // profession) should read as an immediate direction, not a stretch
    // possible_next_step, once real seniority is on record.
    const personskyddsvakt = result.matches.find((m) => m.professionId === "SP004");
    ok(
      personskyddsvakt?.stage === "explore_now",
      "Experienced Väktare (8+ years): Personskyddsvakt (developing-stage) is explore_now, not a stretch possible_next_step",
    );
  }

  if (persona.name.en === "Säkerhetschef / Head of Security (8+ years)") {
    // Owner Approval Gate item 1 (mandatory acceptance case) + item 3.C.
    // This is the exact profile shape that exposed the Career Area
    // structural bias: strong leadership/strategic/communication evidence,
    // genuinely low operational evidence. SCA04 must rank ahead of SCA01 --
    // not because SCA01 is suppressed, but because the bias that let SCA01
    // win on target-band easiness alone is fixed (see AREA_RANK_METHOD).
    const sca01Rank = areas.ranked.find((a) => a.areaId === "SCA01")?.rank ?? 99;
    const sca04Rank = areas.ranked.find((a) => a.areaId === "SCA04")?.rank ?? 99;
    ok(
      areas.ranked[0]?.areaId === "SCA04",
      "Säkerhetschef 8+: SCA04 Security Leadership & Coordination is the top Career Area",
    );
    ok(
      sca04Rank < sca01Rank,
      `Säkerhetschef 8+: SCA04 (rank ${sca04Rank}) outranks SCA01 (rank ${sca01Rank}) -- the structural bias fix holds for a real senior-leadership profile`,
    );
    // Item 3.C, mandatory: frontline roles never appear as explore_now
    // (natural progression) for a senior security leader -- either absent
    // entirely (DNA genuinely does not support them, the honest outcome
    // here) or, if present at all, only as career_pivot.
    const frontlineIds = ["SP001", "SP002", "SP003", "SP004", "SP005"];
    const frontlineMatches = result.matches.filter((m) => frontlineIds.includes(m.professionId));
    ok(
      frontlineMatches.every((m) => m.stage === "career_pivot"),
      "Säkerhetschef 8+: every frontline profession that clears matching at all is career_pivot, never explore_now/possible_next_step/longer_term",
    );
    ok(
      !result.strongestDirections.some((m) => frontlineIds.includes(m.professionId)) &&
        !result.alsoWorthExploring.some((m) => frontlineIds.includes(m.professionId)),
      "Säkerhetschef 8+: no frontline profession appears in strongestDirections or alsoWorthExploring",
    );
  }

  if (persona.name.en === "Experienced Säkerhetssamordnare") {
    const headOfSecurity = result.matches.find((m) => m.professionId === "SP007");
    const skyddsvakt = result.matches.find((m) => m.professionId === "SP003");
    ok(headOfSecurity?.stage === "possible_next_step", "Experienced Coordinator: Säkerhetschef is possible_next_step, not longer_term");
    // Item 22: strategic/leadership progression (Säkerhetschef, SCA04)
    // dominates as a next step; genuine frontline affinity (Skyddsvakt,
    // SCA01 -- a different career area from the candidate's real current
    // profession, Säkerhetssamordnare) is honestly shown as career_pivot,
    // not hidden and not presented as the primary recommendation.
    ok(
      persona.currentProfessionCigSlug === "sakerhetssamordnare",
      "Experienced Coordinator: persona fixture reports a real current profession",
    );
    ok(
      skyddsvakt?.stage === "career_pivot",
      "Experienced Coordinator: Skyddsvakt (different career area from the real current profession) is shown honestly as career_pivot, not as a leading recommendation",
    );
    ok(
      !result.strongestDirections.some((m) => m.professionId === "SP003") &&
        !result.alsoWorthExploring.some((m) => m.professionId === "SP003"),
      "Experienced Coordinator: Skyddsvakt does not also leak into strongestDirections or alsoWorthExploring",
    );
  }

  if (persona.name.en === "Career changer (already working in security)") {
    const developingTierExploreNow = result.matches.some(
      (m) =>
        m.stage === "explore_now" &&
        FIRST_WAVE_CATALOG.find((c) => c.professionId === m.professionId)?.careerStage === "developing",
    );
    ok(developingTierExploreNow, "Career changer: a developing-stage profession is explore_now — not reset to an entry baseline");
  }

  if (persona.name.en === "Technical profile") {
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

  if (persona.name.en === "Investigation / analysis profile") {
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

  if (persona.name.en === "Broad profile") {
    ok(
      result.strongestDirections.length >= 2 && result.strongestDirections.length <= 3,
      `Broad profile: strongest directions is a genuine short list (${result.strongestDirections.length}), not "everything fits"`,
    );
    const distinctStages = new Set(result.matches.map((m) => m.stage));
    ok(distinctStages.size >= 2, "Broad profile: recommendations differentiate across career stages, not one undifferentiated blob");
    // Item 24, explicit: "Broad must mean several directions remain
    // plausible. Not: almost every profession is strong." The original form
    // of this check only required ONE profession in the catalogue to fail
    // -- which a since-fixed fixture satisfied at 13 of 14 matched, exactly
    // the "everything fits" outcome the mandate calls out by name as wrong,
    // while still passing. A genuine "broad, capable, no dominant specialty"
    // profile should clear well under half the catalogue -- most of it
    // (the true specialty professions: technical, investigative, analytical,
    // strategic) must genuinely miss on their own defining dimensions.
    ok(
      result.matches.length <= Math.ceil(FIRST_WAVE_CATALOG.length / 2),
      `Broad profile: matches stay well under half the catalogue (${result.matches.length} of ${FIRST_WAVE_CATALOG.length} matched) -- real differentiation, not universal fit`,
    );
  }

  if (persona.name.en === "Sparse / ambiguous profile") {
    ok(result.available === false, "Sparse profile: honestly unavailable rather than fabricating matches from thin evidence");
    ok(result.matches.length === 0, "Sparse profile: zero matches, not a padded low-confidence list");
  }

  // Universal invariants, every persona.
  for (const m of result.matches) {
    ok(!("fitScore" in m), `${persona.name.en}/${m.professionId}: no raw fitScore on the match`);
    ok(
      FIRST_WAVE_CATALOG.some((c) => c.professionId === m.professionId),
      `${persona.name.en}/${m.professionId}: every recommended profession is a real, catalogued one — never fabricated`,
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
