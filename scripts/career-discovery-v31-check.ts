// Security Career Discovery v3.1 — domain model regression guard.
//
// Deterministic checks over the v3.1 domain model: the instrument, the
// option matrix, the coverage invariants, pattern separation and
// reachability, scoring behaviour, and the frozen persona fixtures that make
// any unversioned change to scoring fail CI.
//
// TS↔DB parity of the option matrix is checked here, in §11, by re-parsing
// the migration — so it runs offline, before the migration is ever applied.
// The schema guards and the set-level matrix invariants run against a real
// disposable Postgres in supabase/tests/career_discovery_v31_schema_test.sql
// and in the migration's own self-verification block.
//
// Plain TS script, matching this repository's scripts/*-check.ts convention
// (no test runner is configured in this project).

import { createHash } from "node:crypto";

import {
  CID15_BANNED_TERMS,
  DIMENSION_IDS,
  DIMENSIONS,
  MATCHABLE_DIMENSION_IDS,
  PATTERN_SCORED_DIMENSION_IDS,
  type DimensionId,
} from "../src/lib/career-discovery/v31/dimensions";
import {
  CORE_ITEMS,
  CORE_ITEM_BY_ID,
  SCALE_ITEMS,
  SINGLE_CHOICE_ITEMS,
} from "../src/lib/career-discovery/v31/core-items";
import {
  ALL_OPTIONS,
  FLAT_LOADINGS,
  OPTION_SETS,
  OPTION_SET_BY_QUESTION,
  ROLE_WEIGHTS,
} from "../src/lib/career-discovery/v31/option-matrix";
import {
  MAX_EVIDENCE_WEIGHT,
  scoreDimensions,
  type Answer,
} from "../src/lib/career-discovery/v31/scoring";
import {
  PATTERNS,
  PATTERN_CONFIG,
  PATTERN_IDS,
  resolvePatterns,
} from "../src/lib/career-discovery/v31/patterns";
import { computeCareerIntelligence } from "../src/lib/career-discovery/v31";
import {
  CAREER_AREAS,
  CAREER_AREA_IDS,
  rankCareerAreas,
} from "../src/lib/career-discovery/v31/career-areas";
import {
  buildPatternStory,
  STORY_HEADINGS,
  STORY_PATTERN_IDS,
  STORY_QUESTIONS,
  STORY_TEMPLATE_VERSION,
} from "../src/lib/career-discovery/v31/story";
import {
  buildSnapshot,
  buildValidatedSnapshot,
  REPORT_SCHEMA_VERSION,
  SnapshotValidationError,
  validateSnapshot,
} from "../src/lib/career-discovery/v31/snapshot";
import type { ResolvedPatternId } from "../src/lib/career-discovery/v31/patterns";
import type { Locale } from "../src/lib/career-discovery/v31/version";
import {
  CONTENT_VERSION,
  OPTION_MATRIX_VERSION,
  PATTERN_DEFINITION_VERSION,
  SCORING_VERSION,
} from "../src/lib/career-discovery/v31/version";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  checks += 1;
  if (a !== e) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        expected ${e}\n        actual   ${a}`);
  }
}

function group(name: string): void {
  console.log(`\n${name}`);
}

// =========================================================================
group("1 · The instrument");
// =========================================================================

eq(CORE_ITEMS.length, 22, "1.1 exactly 22 core items");
eq(SCALE_ITEMS.length, 14, "1.2 exactly 14 scale items");
eq(SINGLE_CHOICE_ITEMS.length, 8, "1.3 exactly 8 single-choice items");
eq(
  SINGLE_CHOICE_ITEMS.map((i) => i.id),
  ["CQ02", "CQ03", "CQ06", "CQ09", "CQ12", "CQ15", "CQ17", "CQ20"],
  "1.4 the single-choice items are the eight the owner approved options for",
);
ok(
  CORE_ITEMS.every((i) => i.stem.sv.length > 0 && i.stem.en.length > 0),
  "1.5 every stem is present in both languages",
);
ok(
  new Set(CORE_ITEMS.map((i) => i.order)).size === 22,
  "1.6 display order is unique across the instrument",
);
ok(
  CORE_ITEMS.every((i) => i.primary !== i.secondary),
  "1.7 no item declares the same dimension as primary and secondary",
);
ok(
  CORE_ITEMS.every((i) => DIMENSION_IDS.includes(i.primary) && DIMENSION_IDS.includes(i.secondary)),
  "1.8 every declared dimension exists",
);

// =========================================================================
group("2 · The option matrix");
// =========================================================================

eq(OPTION_SETS.length, 8, "2.1 an option set for each single-choice item");
eq(ALL_OPTIONS.length, 32, "2.2 exactly 32 options");
ok(
  OPTION_SETS.every((s) => s.options.length === 4),
  "2.3 every option set has exactly four options",
);
ok(
  ALL_OPTIONS.every((o) => o.text.sv.length > 0 && o.text.en.length > 0),
  "2.4 every option is present in both languages",
);
ok(
  ALL_OPTIONS.every((o) => /^CQ\d{2}_[A-D]$/.test(o.id)),
  "2.5 option ids follow the stable CQnn_X form",
);
ok(
  OPTION_SETS.every((s) => s.options.every((o) => o.id.startsWith(`${s.questionId}_`))),
  "2.6 every option belongs to its own question",
);

// Owner decision A-2: every loading carries a written rationale.
ok(
  FLAT_LOADINGS.every((l) => l.rationale.trim().length >= 20),
  "2.7 owner decision A-2: every loading has a written rationale",
);
ok(
  FLAT_LOADINGS.every((l) => l.roleWeight === ROLE_WEIGHTS[l.role]),
  "2.8 every loading carries its role's approved weight",
);
ok(
  FLAT_LOADINGS.every((l) => l.value >= 0 && l.value <= 1),
  "2.9 every normalised value is within [0,1]",
);

// The declared primary and secondary from the locked workbook must survive.
for (const item of SINGLE_CHOICE_ITEMS) {
  const set = OPTION_SET_BY_QUESTION[item.id];
  const roles = new Map<DimensionId, string>();
  for (const l of set.options[0].loadings) roles.set(l.dimension, l.role);
  ok(
    roles.get(item.primary) === "primary" && roles.get(item.secondary) === "secondary",
    `2.10 ${item.id} preserves the locked primary ${item.primary} and secondary ${item.secondary}`,
  );
}

// Delivery A §4 check 2: every option loads every dimension in its span.
for (const set of OPTION_SETS) {
  const span = new Set(set.options[0].loadings.map((l) => l.dimension));
  ok(
    set.options.every(
      (o) => o.loadings.length === span.size && o.loadings.every((l) => span.has(l.dimension)),
    ),
    `2.11 ${set.questionId}: every option loads every dimension in the span`,
  );
}

// Delivery A §4 check 1: no dead options. An option that is the top signal
// for nothing is one candidates experience as the wrong answer.
for (const set of OPTION_SETS) {
  const span = set.options[0].loadings.map((l) => l.dimension);
  const anchors = new Set<string>();
  for (const d of span) {
    let best = set.options[0];
    let bestValue = -1;
    for (const o of set.options) {
      const v = o.loadings.find((l) => l.dimension === d)!.value;
      if (v > bestValue) {
        bestValue = v;
        best = o;
      }
    }
    anchors.add(best.id);
  }
  ok(
    anchors.size === 4,
    `2.12 ${set.questionId}: every option is the top signal for at least one dimension`,
  );
}

// =========================================================================
group("3 · Dimension coverage (owner decision 6: dominance cap 0.60)");
// =========================================================================

// The full-run coverage table, asserted against exact expected values. Any
// drift in a scale mapping or an option loading changes these numbers, so
// this is what protects the model from a silent typo.
const EXPECTED_WEIGHTS: Record<DimensionId, number> = {
  CID01: 1.55,
  // 1.3 -> 1.6: Owner Approval Gate item 2, CQ06/CQ09 CID02 loadings
  // promoted tertiary (0.15) to secondary (0.3), +0.15 each.
  CID02: 1.6,
  CID03: 1.6,
  CID04: 1.55,
  CID05: 1.7,
  // 1.35 -> 1.65: CQ22 (Final Autonomous Matching Engine Completion Mandate)
  // adds CID06 as its secondary, +0.3.
  CID06: 1.65,
  CID07: 1.3,
  CID08: 1.3,
  CID09: 1.3,
  CID10: 1.45,
  // 1.9 -> 2.2: CQ21 (Final Autonomous Matching Engine Completion Mandate)
  // adds CID11 as its secondary, +0.3.
  CID11: 2.2,
  CID12: 1.45,
  CID13: 1.6,
  CID14: 1.3,
  CID15: 1.4,
  CID16: 1.7,
  // New: CQ21 + CQ22 both carry CID17 as primary (0.7 each) — a single
  // 0.7-weight source cannot clear the 0.60 dominance cap on its own, see
  // core-items.ts's header comment.
  CID17: 1.4,
};

for (const d of DIMENSION_IDS) {
  eq(
    Math.round(MAX_EVIDENCE_WEIGHT[d] * 100) / 100,
    EXPECTED_WEIGHTS[d],
    `3.1 ${d} carries the expected evidence weight`,
  );
}

// Dominance is a property of the definition, so it is computed from the
// weights rather than from any particular candidate's answers.
const maxSingleWeight: Record<string, number> = {};
for (const item of CORE_ITEMS) {
  if (item.format === "scale") {
    maxSingleWeight[item.primary] = Math.max(
      maxSingleWeight[item.primary] ?? 0,
      ROLE_WEIGHTS.primary,
    );
    maxSingleWeight[item.secondary] = Math.max(
      maxSingleWeight[item.secondary] ?? 0,
      ROLE_WEIGHTS.secondary,
    );
  } else {
    for (const l of OPTION_SET_BY_QUESTION[item.id].options[0].loadings) {
      maxSingleWeight[l.dimension] = Math.max(
        maxSingleWeight[l.dimension] ?? 0,
        ROLE_WEIGHTS[l.role],
      );
    }
  }
}

let worstDominance = 0;
for (const d of DIMENSION_IDS) {
  const dom = maxSingleWeight[d] / MAX_EVIDENCE_WEIGHT[d];
  worstDominance = Math.max(worstDominance, dom);
  ok(dom <= 0.6 + 1e-9, `3.2 ${d} dominance ${(dom * 100).toFixed(1)}% is within the 0.60 cap`);
}
console.log(`       worst dominance ${(worstDominance * 100).toFixed(1)}%`);

// Every dimension must actually be reachable.
ok(
  DIMENSION_IDS.every((d) => MAX_EVIDENCE_WEIGHT[d] > 0),
  "3.3 every one of the 17 dimensions has evidence in a complete run",
);

// =========================================================================
group("4 · CID15 (owner decision A-4)");
// =========================================================================

eq(DIMENSIONS.CID15.matchingWeight, 0, "4.1 CID15 carries profession-matching weight 0");
ok(!MATCHABLE_DIMENSION_IDS.includes("CID15"), "4.2 CID15 is excluded from matchable dimensions");
ok(!PATTERN_SCORED_DIMENSION_IDS.includes("CID15"), "4.3 CID15 is excluded from pattern scoring");
// 15 -> 16: CID17 joins profession matching (Final Autonomous Matching
// Engine Completion Mandate). CID15 remains the sole exclusion (A-4).
eq(MATCHABLE_DIMENSION_IDS.length, 16, "4.4 sixteen dimensions drive profession matching");
ok(
  PATTERN_IDS.every(
    (p) => !PATTERNS[p].central.includes("CID15") && !PATTERNS[p].supporting.includes("CID15"),
  ),
  "4.5 no pattern uses CID15 in its definition",
);
// CID15 must be framed as decision style, never as ability.
const cid15Text =
  `${DIMENSIONS.CID15.name.sv} ${DIMENSIONS.CID15.name.en} ${DIMENSIONS.CID15.definition.sv} ${DIMENSIONS.CID15.definition.en}`.toLowerCase();
ok(
  !CID15_BANNED_TERMS.some((t) => cid15Text.includes(t.toLowerCase())),
  "4.6 CID15 is described as decision style, never as ability, integrity or suitability",
);

// =========================================================================
group("5 · Pattern definitions");
// =========================================================================

eq(PATTERN_IDS.length, 10, "5.1 exactly ten patterns");
ok(
  PATTERN_IDS.every((p) => PATTERNS[p].central.length === 3 && PATTERNS[p].supporting.length === 3),
  "5.2 every pattern has three central and three supporting dimensions",
);
ok(
  PATTERN_IDS.every((p) => {
    const c = new Set(PATTERNS[p].central);
    return PATTERNS[p].supporting.every((d) => !c.has(d));
  }),
  "5.3 central and supporting sets are disjoint",
);
ok(
  new Set(PATTERN_IDS.map((p) => [...PATTERNS[p].central].sort().join(","))).size === 10,
  "5.4 no two patterns share an identical central set",
);
ok(
  PATTERN_IDS.every((p) => PATTERNS[p].central.includes(PATTERNS[p].superpowerDimension)),
  "5.5 every superpower is one of the pattern's own central dimensions",
);
ok(
  PATTERN_IDS.every((p) => !PATTERNS[p].central.includes(PATTERNS[p].growthEdgeDimension)),
  "5.6 no growth edge is already a central dimension — an edge you hold is not an edge",
);
ok(
  PATTERN_IDS.every((p) => PATTERNS[p].name.sv.length > 0 && PATTERNS[p].name.en.length > 0),
  "5.7 every pattern is named in both languages",
);
// Every scoring dimension must be used, and every one must be central
// somewhere: a dimension no pattern is ever about is a gap in the model.
for (const d of PATTERN_SCORED_DIMENSION_IDS) {
  ok(
    PATTERN_IDS.some((p) => PATTERNS[p].central.includes(d)),
    `5.8 ${d} is central to at least one pattern`,
  );
}

// Pairwise separation. The CP03/CP06 pair is the regression this check
// exists for: they were 0.933 in the first draft.
function vec(p: (typeof PATTERN_IDS)[number]): number[] {
  const def = PATTERNS[p];
  return PATTERN_SCORED_DIMENSION_IDS.map((d) =>
    def.central.includes(d) ? 1 : def.supporting.includes(d) ? 0.5 : 0,
  );
}
function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, x, i) => s + x * b[i], 0);
  const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return dot / (na * nb);
}
let worstPair = { a: "", b: "", sim: 0 };
for (let i = 0; i < PATTERN_IDS.length; i += 1) {
  for (let j = i + 1; j < PATTERN_IDS.length; j += 1) {
    const sim = cosine(vec(PATTERN_IDS[i]), vec(PATTERN_IDS[j]));
    if (sim > worstPair.sim) worstPair = { a: PATTERN_IDS[i], b: PATTERN_IDS[j], sim };
  }
}
ok(
  worstPair.sim <= 0.8,
  `5.9 no two patterns exceed 0.80 similarity (worst ${worstPair.a}-${worstPair.b} ${worstPair.sim.toFixed(3)})`,
);
ok(
  cosine(vec("CP03"), vec("CP06")) <= 0.6,
  "5.10 CP03 and CP06 stay separated — the duplicate-pattern regression",
);
console.log(`       worst pair ${worstPair.a}-${worstPair.b} ${worstPair.sim.toFixed(3)}`);

// =========================================================================
group("6 · Scoring behaviour");
// =========================================================================

function completeAnswers(pick: (item: (typeof CORE_ITEMS)[number]) => Answer): Answer[] {
  return CORE_ITEMS.map(pick);
}
const midAnswers = completeAnswers((i) =>
  i.format === "scale"
    ? { itemId: i.id, format: "scale", value: 5 }
    : { itemId: i.id, format: "single_choice", optionId: `${i.id}_A` },
);

const mid = scoreDimensions(midAnswers);
ok(mid.complete, "6.1 answering all 20 items yields a complete result");
ok(
  DIMENSION_IDS.every((d) => mid.dimensions[d].score !== null),
  "6.2 a complete run observes every dimension",
);
ok(
  DIMENSION_IDS.every((d) => Math.abs(mid.dimensions[d].coverage - 1) < 1e-9),
  "6.3 a complete run reports full coverage on every dimension",
);

// The v2.1 defect: unanswered must not become 0.5.
const partial = scoreDimensions([{ itemId: "CQ01", format: "scale", value: 8 }]);
ok(partial.dimensions.CID04.score === null, "6.4 an unobserved dimension scores null, never 0.5");
eq(partial.dimensions.CID04.confidence, "none", "6.5 an unobserved dimension has confidence none");
ok(!partial.complete, "6.6 a partial run is reported as incomplete");
ok(partial.dimensions.CID01.score !== null, "6.7 an observed dimension still scores");

// Answered-low is distinguishable from unanswered.
const low = scoreDimensions([{ itemId: "CQ01", format: "scale", value: 1 }]);
eq(low.dimensions.CID01.score, 0, "6.8 a genuine low answer scores 0, which is not null");
ok(low.dimensions.CID01.confidence !== "none", "6.9 a genuine low answer has real confidence");

// Extremes.
const allHigh = completeAnswers((i) =>
  i.format === "scale"
    ? { itemId: i.id, format: "scale", value: 10 }
    : { itemId: i.id, format: "single_choice", optionId: `${i.id}_A` },
);
const high = scoreDimensions(allHigh);
ok(
  DIMENSION_IDS.every((d) => (high.dimensions[d].score ?? 0) <= 1),
  "6.10 no dimension can exceed 1.0",
);

// Owner decision A-2: the with/without tertiary comparison is a parameter.
const noTertiary = scoreDimensions(midAnswers, { includeTertiary: false });
ok(
  noTertiary.dimensions.CID02.evidenceWeight < mid.dimensions.CID02.evidenceWeight,
  "6.11 excluding tertiary contributions measurably reduces CID02 evidence",
);
ok(
  DIMENSION_IDS.every((d) => noTertiary.dimensions[d].score !== null),
  "6.12 every dimension still scores without tertiary evidence",
);

// Invalid input must throw rather than silently score.
let threw = 0;
for (const bad of [
  () => scoreDimensions([{ itemId: "NOPE", format: "scale", value: 5 }]),
  () => scoreDimensions([{ itemId: "CQ01", format: "scale", value: 11 }]),
  () => scoreDimensions([{ itemId: "CQ01", format: "scale", value: 0 }]),
  () => scoreDimensions([{ itemId: "CQ02", format: "single_choice", optionId: "CQ09_A" }]),
  () => scoreDimensions([{ itemId: "CQ01", format: "single_choice", optionId: "CQ01_A" }]),
]) {
  try {
    bad();
  } catch {
    threw += 1;
  }
}
eq(threw, 5, "6.13 malformed answers throw rather than scoring silently");

// =========================================================================
group("7 · Pattern resolution");
// =========================================================================

// Every pattern must be reachable as leading pattern, or it is dead content.
function archetype(patternId: (typeof PATTERN_IDS)[number]): Answer[] {
  const def = PATTERNS[patternId];
  return CORE_ITEMS.map((item) => {
    if (item.format === "scale") {
      const hitsCentral = def.central.includes(item.primary);
      const hitsSupport = def.supporting.includes(item.primary);
      return {
        itemId: item.id,
        format: "scale" as const,
        value: hitsCentral ? 10 : hitsSupport ? 7 : 2,
      };
    }
    // Choose the option scoring highest on this pattern's central dimensions.
    const set = OPTION_SET_BY_QUESTION[item.id];
    let best = set.options[0];
    let bestScore = -Infinity;
    for (const o of set.options) {
      const s = o.loadings.reduce(
        (acc, l) =>
          acc +
          (def.central.includes(l.dimension) ? l.value * 2 : 0) +
          (def.supporting.includes(l.dimension) ? l.value : 0) -
          (!def.central.includes(l.dimension) && !def.supporting.includes(l.dimension)
            ? l.value * 0.5
            : 0),
        0,
      );
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    return { itemId: item.id, format: "single_choice" as const, optionId: best.id };
  });
}

for (const p of PATTERN_IDS) {
  const r = resolvePatterns(scoreDimensions(archetype(p)));
  ok(r.leading === p, `7.1 ${p} is reachable as leading pattern (got ${r.leading ?? "CP00"})`);
}

// Balanced profiles must resolve to CP00 rather than picking arbitrarily.
const flat = scoreDimensions(
  completeAnswers((i) =>
    i.format === "scale"
      ? { itemId: i.id, format: "scale", value: 5 }
      : { itemId: i.id, format: "single_choice", optionId: `${i.id}_A` },
  ),
);
const flatResult = resolvePatterns(flat);
ok(
  flatResult.balanced || flatResult.leading !== null,
  "7.2 a midpoint profile resolves deterministically",
);

const allTens = resolvePatterns(scoreDimensions(allHigh));
ok(allTens.balanced, "7.3 answering high to everything yields CP00, not every pattern at once");
eq(allTens.leaningToward.length, 3, "7.4 CP00 still names three directions to explore");

// Thresholds live in config, not in code.
eq(PATTERN_CONFIG.minLead, 55, "7.5 minLead is versioned configuration");
eq(PATTERN_CONFIG.minSpread, 6, "7.6 minSpread is versioned configuration");
ok(PATTERN_CONFIG.supportingMax === 2, "7.7 at most two supporting patterns");

// Supporting patterns never exceed the cap.
for (const p of PATTERN_IDS) {
  const r = resolvePatterns(scoreDimensions(archetype(p)));
  ok(r.supporting.length <= 2, `7.8 ${p} yields at most two supporting patterns`);
  ok(!r.supporting.includes(r.leading!), `7.9 ${p} is not its own supporting pattern`);
}

// =========================================================================
group("8 · The separation invariant (Delivery B T7)");
// =========================================================================

// Patterns explain a ranking; they are never an input to one. There is no
// profession engine yet, so what is asserted here is the structural
// precondition: the contract exposes patterns and dimensions separately, and
// nothing in the pattern layer is reachable from the matchable dimension set.
const ci = computeCareerIntelligence(archetype("CP01"), "2026-07-30T00:00:00.000Z");
ok(
  MATCHABLE_DIMENSION_IDS.every((d) => ci.dna.dimensions[d] !== undefined),
  "8.1 profession matching reads dimensions directly from the DNA layer",
);
ok(
  !JSON.stringify(ci.dna).includes("CP0") && !JSON.stringify(ci.dna).includes("CP1"),
  "8.2 the DNA layer contains no pattern reference — matching cannot see patterns",
);
eq(ci.roadmap.available, false, "8.3 the roadmap layer is declared but not implemented");
ok(
  ci.roadmap.startingPattern !== null,
  "8.4 the roadmap layer already carries its starting pattern",
);
ok(
  ci.strengths.growthEdgeDimension !== null,
  "8.5 the growth edge resolves to a dimension id, not prose",
);

// =========================================================================
group("9 · Determinism and version pinning");
// =========================================================================

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

const runA = computeCareerIntelligence(archetype("CP05"), "2026-07-30T00:00:00.000Z");
const runB = computeCareerIntelligence(archetype("CP05"), "2026-07-30T00:00:00.000Z");
eq(hash(runA), hash(runB), "9.1 identical inputs produce byte-identical output");

// Answer order must not change the result: evidence arrives in whatever
// order the candidate navigated, and floating-point addition is not
// associative.
const shuffled = [...archetype("CP05")].reverse();
eq(
  hash(computeCareerIntelligence(shuffled, "2026-07-30T00:00:00.000Z")),
  hash(runA),
  "9.2 answer order does not affect the result",
);

// Frozen fixtures. These hashes pin the ENTIRE model: dimensions, items,
// option loadings, scoring, patterns and the contract shape. Any change to
// any of them alters a hash, and the only correct response is to bump the
// version strings below and re-freeze deliberately.
const FROZEN: Record<string, string> = {
  // Re-frozen for CONTENT_VERSION/SCORING_VERSION/PATTERN_DEFINITION_VERSION
  // v3.1-draft-3 (Final Autonomous Matching Engine Completion Mandate: CID17
  // + CQ21/CQ22, CP06's central set swapped CID09 -> CID17).
  CP01: "a4bd2d5eca8df52f",
  CP05: "a03c8fa82f6ee383",
  CP10: "38257685f6e4d28d",
  balanced: "1df068a88a4af70a",
};

const fixtureHashes: Record<string, string> = {
  CP01: hash(computeCareerIntelligence(archetype("CP01"), "2026-07-30T00:00:00.000Z")),
  CP05: hash(runA),
  CP10: hash(computeCareerIntelligence(archetype("CP10"), "2026-07-30T00:00:00.000Z")),
  balanced: hash(computeCareerIntelligence(allHigh, "2026-07-30T00:00:00.000Z")),
};

if (process.env.FREEZE_FIXTURES === "1") {
  console.log("\n  FREEZE_FIXTURES=1 — copy these into FROZEN:");
  for (const [k, v] of Object.entries(fixtureHashes)) console.log(`    ${k}: "${v}",`);
} else {
  for (const [k, expected] of Object.entries(FROZEN)) {
    ok(
      fixtureHashes[k] === expected,
      `9.3 persona ${k} is unchanged (expected ${expected}, got ${fixtureHashes[k]})\n` +
        "        A changed hash means scoring, dimensions, items, options or patterns moved.\n" +
        "        If that was intended, bump the version strings and re-freeze with FREEZE_FIXTURES=1.",
    );
  }
}

// The version strings the fixtures are pinned to.
eq(CONTENT_VERSION, "v3.1-draft-3", "9.4 content version is pinned");
eq(SCORING_VERSION, "v3.1-draft-3", "9.5 scoring version is pinned");
eq(OPTION_MATRIX_VERSION, "v3.1-draft-2", "9.6 option matrix version is pinned");
eq(PATTERN_DEFINITION_VERSION, "v3.1-draft-3", "9.7 pattern definition version is pinned");
eq(STORY_TEMPLATE_VERSION, "v3.1-draft-2", "9.7b story template version is pinned");
// The story template version must move INDEPENDENTLY of the scoring and
// pattern contracts. If it ever equals them again, either a content change
// went unversioned or a scoring version was bumped for a content-only edit.
ok(
  STORY_TEMPLATE_VERSION !== SCORING_VERSION &&
    STORY_TEMPLATE_VERSION !== PATTERN_DEFINITION_VERSION,
  "9.7c the story template version is tracked separately from scoring and patterns",
);
ok(
  Object.values(runA.versions).every((v) => typeof v === "string" && v.length > 0),
  "9.8 every output carries its full version tuple",
);

// =========================================================================
group("10 · Purity");
// =========================================================================

// The domain model must not reach for a clock, a random source, the network
// or the database. Those make output irreproducible and a stored report
// unverifiable.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const v31Dir = path.join(process.cwd(), "src/lib/career-discovery/v31");
const forbidden = [
  { pattern: /\bDate\.now\(\)/, why: "reads the clock" },
  { pattern: /new Date\(\)/, why: "reads the clock" },
  { pattern: /Math\.random/, why: "is non-deterministic" },
  { pattern: /\bfetch\(/, why: "performs I/O" },
  { pattern: /from ["']@supabase/, why: "imports a database client" },
  { pattern: /from ["']react/, why: "imports UI" },
  { pattern: /createServerFn/, why: "is a server boundary, not domain logic" },
];

for (const file of readdirSync(v31Dir).filter((f) => f.endsWith(".ts"))) {
  const src = readFileSync(path.join(v31Dir, file), "utf8")
    // Strip comments so prose about the clock does not trip the check.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const f of forbidden) {
    ok(!f.pattern.test(src), `10.1 ${file} ${f.why}`);
  }
}

// =========================================================================
group("11 · TypeScript ↔ database parity");
// =========================================================================

// The option matrix exists twice: as option-matrix.ts and as seeded rows in
// public.cd_option_loadings. Two sources always drift eventually unless
// something compares them, so this parses the migration back out and checks
// it tuple for tuple against the TypeScript.
//
// It runs offline, in the same script as everything else, rather than
// needing a live database — which means it also runs on a developer's
// machine before the migration is ever applied.

// The original instrument migration -- item registry, definition version
// and lifecycle status all still live here and are unaffected by the
// option-matrix version bump below, so this stays the source for those.
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260730100000_career_discovery_v3_1_instrument.sql",
);
const migration = readFileSync(migrationPath, "utf8");

// Option loadings specifically are read from whichever migration seeds the
// CURRENT OPTION_MATRIX_VERSION, a separate file from the one above.
// 20260730100000_career_discovery_v3_1_instrument.sql seeded v3.1-draft-1
// and is left untouched forever (any report snapshot frozen under that
// version must stay reproducible against those exact rows).
// 20260816105618_cd_v31_option_matrix_v2_cid02_leadership.sql seeds
// v3.1-draft-2 (Owner Approval Gate item 2, CID02 coverage fix) as a
// complete, freshly-generated 164-row set -- not a diff against the first
// migration -- so this only ever needs to point at ONE file: the one
// matching OPTION_MATRIX_VERSION right now.
const optionMatrixMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260816105618_cd_v31_option_matrix_v2_cid02_leadership.sql",
);
const optionMatrixMigration = readFileSync(optionMatrixMigrationPath, "utf8");

const valuesBlock = optionMatrixMigration.slice(
  optionMatrixMigration.indexOf(
    "(scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)\nVALUES",
  ),
  optionMatrixMigration.indexOf("ON CONFLICT (scoring_version, question_id, option_id, dimension_id)"),
);

// Each tuple: ('ver','Q','OPT','CID','role',w,v,\n   'rationale')
const tupleRe =
  /\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*([\d.]+),\s*([\d.]+),\s*'((?:[^']|'')*)'\s*\)/g;

interface ParsedRow {
  scoringVersion: string;
  questionId: string;
  optionId: string;
  dimensionId: string;
  role: string;
  roleWeight: number;
  value: number;
  rationale: string;
}

const parsed: ParsedRow[] = [];
for (const m of valuesBlock.matchAll(tupleRe)) {
  parsed.push({
    scoringVersion: m[1],
    questionId: m[2],
    optionId: m[3],
    dimensionId: m[4],
    role: m[5],
    roleWeight: Number(m[6]),
    value: Number(m[7]),
    rationale: m[8].replace(/''/g, "'"),
  });
}

eq(
  parsed.length,
  FLAT_LOADINGS.length,
  "11.1 the migration seeds exactly as many loadings as the matrix defines",
);
eq(parsed.length, 164, "11.2 the seed is 164 rows");
ok(
  parsed.every((r) => r.scoringVersion === OPTION_MATRIX_VERSION),
  "11.3 every seeded row carries the current option matrix version",
);

const key = (r: { questionId: string; optionId: string; dimensionId: string }) =>
  `${r.questionId}|${r.optionId}|${r.dimensionId}`;
const dbByKey = new Map(parsed.map((r) => [key(r), r]));

let mismatches = 0;
for (const ts of FLAT_LOADINGS) {
  const db = dbByKey.get(key(ts));
  if (!db) {
    mismatches += 1;
    console.error(`  FAIL  11.4 ${key(ts)} exists in TypeScript but not in the migration`);
    continue;
  }
  if (
    db.role !== ts.role ||
    Math.abs(db.roleWeight - ts.roleWeight) > 1e-9 ||
    Math.abs(db.value - ts.value) > 1e-9 ||
    db.rationale !== ts.rationale
  ) {
    mismatches += 1;
    console.error(`  FAIL  11.4 ${key(ts)} differs between TypeScript and the migration`);
  }
}
ok(mismatches === 0, "11.4 every loading is identical in TypeScript and in the migration");

const tsKeys = new Set(FLAT_LOADINGS.map(key));
ok(
  parsed.every((r) => tsKeys.has(key(r))),
  "11.5 the migration seeds no loading the matrix does not define",
);

// The registry seeded by the migration must match the items in code.
const registryBlock = migration.slice(
  migration.indexOf("CROSS JOIN (VALUES"),
  migration.indexOf(") AS v(item_id, item_kind, section_id, display_order)"),
);
const registryIds = [...registryBlock.matchAll(/'(CQ\d{2})','(scale|single_choice)'/g)];
eq(registryIds.length, 20, "11.6 the migration registers exactly 20 items");
for (const [, id, kind] of registryIds) {
  eq(
    CORE_ITEM_BY_ID[id]?.format,
    kind,
    `11.7 ${id} has the same format in the registry and in code`,
  );
}

// The definition version is unchanged since the original migration -- see
// version.ts's DEFINITION_VERSION comment -- so it still checks there.
ok(
  migration.includes(`'2026-scd-v3.1.0'`),
  "11.8 the migration carries the same definition version",
);

// content_version/scoring_version moved to draft-3 in a LATER, separate
// migration (same reason OPTION_MATRIX_VERSION above points at its own
// "current" file rather than the original): CQ21/CQ22 registration, the
// version bump, and the recalibrated profession catalogue.
const contentV2MigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260816150000_cd_v31_content_v2_compliance_dimension.sql",
);
const contentV2Migration = readFileSync(contentV2MigrationPath, "utf8");

for (const v of [
  { value: CONTENT_VERSION, label: "content version" },
  { value: SCORING_VERSION, label: "scoring version" },
]) {
  ok(
    contentV2Migration.includes(`'${v.value}'`),
    `11.8b the content-v2 migration carries the same ${v.label}`,
  );
}

// CQ21 + CQ22 are registered against the existing definition_version_id in
// the content-v2 migration, not the original instrument migration.
const newItemsBlock = contentV2Migration.slice(
  contentV2Migration.indexOf("CROSS JOIN (VALUES"),
  contentV2Migration.indexOf(") AS v(item_id, item_kind, section_id, display_order)"),
);
const newItemIds = [...newItemsBlock.matchAll(/'(CQ\d{2})','(scale|single_choice)'/g)];
eq(newItemIds.length, 2, "11.6b the content-v2 migration registers exactly 2 new items");
for (const [, id, kind] of newItemIds) {
  eq(
    CORE_ITEM_BY_ID[id]?.format,
    kind,
    `11.7b ${id} has the same format in the content-v2 registry and in code`,
  );
}

// The recalibrated profession catalogue: 14 professions x 17 dimensions.
const recalCount = [
  ...contentV2Migration.matchAll(/\('SP\d+', 'layer4-recalibrated-2026-08-16'/g),
].length;
eq(recalCount, 238, "11.10 the migration seeds 238 recalibrated profession-profile rows");

// v3.1 must be registered as internal_test: not reachable by real candidates.
ok(
  migration.includes("'internal_test'") && !migration.includes("'active'"),
  "11.9 v3.1 is registered as internal_test and never as active",
);

// =========================================================================
group("12 · Career Areas");
// =========================================================================

eq(CAREER_AREA_IDS.length, 10, "12.1 exactly ten Career Areas");
ok(
  CAREER_AREA_IDS.every((a) => Object.keys(CAREER_AREAS[a].targets).length === 17),
  "12.2 every area carries a target for all seventeen dimensions",
);
ok(
  CAREER_AREA_IDS.every(
    (a) => CAREER_AREAS[a].name.sv && CAREER_AREAS[a].name.en && CAREER_AREAS[a].description.sv,
  ),
  "12.3 every area is named and described in both languages",
);

const areasForCp01 = rankCareerAreas(scoreDimensions(archetype("CP01")));
eq(areasForCp01.ranked.length, 10, "12.4 a complete run ranks all ten areas");
ok(areasForCp01.sufficientEvidence, "12.5 a complete run has sufficient evidence to rank");
// Owner Approval Gate item 1: ranking order is no longer driven by the raw
// absolute score (see career-areas.ts's AREA_RANK_METHOD doc comment for
// why that was a real, owner-confirmed defect -- SCA01 Guarding
// structurally outranking demanding areas for any candidate, regardless of
// fit, because its target bands are easier to clear). Areas are still
// returned in a real, deterministic order (by rank), but that order and
// the absolute score's own order can now legitimately diverge -- that
// divergence IS the fix, not a bug, so this no longer asserts score is
// monotonic across the array.
ok(
  areasForCp01.ranked.every((a, i) => a.rank === i + 1),
  "12.6 areas are returned in rank order (1..10, sequential)",
);
ok(
  areasForCp01.ranked.every((a) => a.score >= 0 && a.score <= 100),
  "12.7 every area score is within 0..100",
);

// Thin evidence must refuse to rank rather than rank on almost nothing.
const thin = rankCareerAreas(scoreDimensions([{ itemId: "CQ01", format: "scale", value: 8 }]));
ok(!thin.sufficientEvidence, "12.8 a nearly-empty run refuses to rank areas");
eq(thin.ranked.length, 0, "12.9 an unrankable run returns no areas rather than a guess");

// Exceeding a target must never be penalised (matching rule PMR001).
// Built from a synthetic maximal profile rather than from answers: no real
// answer set puts every dimension at 1.0, because single-choice options
// trade dimensions off against each other by design.
const maximal = scoreDimensions(archetype("CP01"));
const maxProfile = {
  ...maximal,
  dimensions: Object.fromEntries(
    DIMENSION_IDS.map((d) => [d, { ...maximal.dimensions[d], score: 1 }]),
  ),
} as typeof maximal;
const allTopAreas = rankCareerAreas(maxProfile);
ok(
  allTopAreas.ranked.every((a) => a.score === 100),
  "12.10 exceeding every target scores full fit — extra strengths are not penalised",
);

// And the converse: a profile at the floor must not score full fit, or the
// metric is measuring nothing.
const minProfile = {
  ...maximal,
  dimensions: Object.fromEntries(
    DIMENSION_IDS.map((d) => [d, { ...maximal.dimensions[d], score: 0 }]),
  ),
} as typeof maximal;
ok(
  rankCareerAreas(minProfile).ranked.every((a) => a.score < 50),
  "12.10b a profile at the floor scores poorly — the metric discriminates",
);

// CID15 must not influence area ranking.
ok(
  !JSON.stringify(areasForCp01.ranked).includes("CID15"),
  "12.11 CID15 never appears in area evidence (owner decision A-4)",
);

// =========================================================================
group("12b · Career Area \"why\" evidence leads with the area's own defining traits (real-world defect fix)");
// =========================================================================

// Real defect, found live: SCA01 (Guarding & Operational Protection)
// targets CID04 (Technical) at only 4/10 -- a low, incidental target. A
// candidate who cleared CID04 by a wide margin (high actual score against
// a low bar) could see "Technical orientation" cited as the #1 reason for
// a guarding-area rank, while CID01 (Operational, the area's actual
// defining trait at 8/10) barely showed up, because the old sort ordered
// purely by the candidate's own margin. Built directly as a DimensionResult
// fixture (not scored answers) for precise control over which dimension
// has the wider margin.
function makeDimsFixture(scores: Partial<Record<DimensionId, number>>) {
  return {
    scoringVersion: "fixture",
    dimensions: Object.fromEntries(
      DIMENSION_IDS.map((id) => {
        const value = id in scores ? scores[id]! : 0.5;
        return [
          id,
          {
            dimension: id,
            score: value,
            evidenceWeight: 1.5,
            dominance: 0.3,
            coverage: 1,
            confidence: "high" as const,
            sources: ["fixture"],
            tertiaryOnly: false,
          },
        ];
      }),
    ),
    answeredItems: [],
    complete: true,
  } as ReturnType<typeof scoreDimensions>;
}

// CID01 target 8 (0.8) -- cleared by a SMALL margin (0.82). CID04 target 4
// (0.4) -- cleared by a LARGE margin (0.95). Everything else at the SCA01
// target exactly (no margin, not "aligned").
const sca01Fixture = makeDimsFixture({
  CID01: 0.82,
  CID04: 0.95,
  CID06: 0.8,
  CID16: 0.8,
});
const sca01Result = rankCareerAreas(sca01Fixture).ranked.find((a) => a.areaId === "SCA01")!;
ok(
  sca01Result.alignedDimensions[0] === "CID01" ||
    sca01Result.alignedDimensions[0] === "CID06" ||
    sca01Result.alignedDimensions[0] === "CID16",
  `12b.1 SCA01's top "why" evidence is one of its own highest-target (defining) dimensions, not CID04 (got ${sca01Result.alignedDimensions[0]}) -- the area's own weighting leads, margin only breaks ties`,
);
const cid04Idx = sca01Result.alignedDimensions.indexOf("CID04" as DimensionId);
const cid01Idx = sca01Result.alignedDimensions.indexOf("CID01" as DimensionId);
ok(
  // Either CID04 doesn't even make the top-4 cut (crowded out by
  // higher-target dimensions — the strongest possible confirmation) or, if
  // it does appear, it ranks strictly behind CID01.
  cid04Idx === -1 || (cid01Idx !== -1 && cid04Idx > cid01Idx),
  `12b.2 CID04 (low target, wide margin) never outranks CID01 (high target) in the same area's evidence, even though CID04's margin is wider (aligned: ${sca01Result.alignedDimensions.join(", ")})`,
);

// =========================================================================
group("12c · \"Bred profil\" (CP00) narrative respects career context (real-world defect fix)");
// =========================================================================

// Real defect, found live: CP00 told every candidate, verbatim, to "retake
// the assessment once you've tried something" -- including a candidate who
// had just reported being a Säkerhetschef with 8+ years' experience.
// Breadth is a genuinely valid Career DNA result at every stage; what it
// MEANS should differ.
// (Declared locally rather than reusing the later `LOCALES` const, which
// this group runs before in file order.)
const CP00_TEST_LOCALES: Locale[] = ["sv", "en"];
for (const loc of CP00_TEST_LOCALES) {
  const exploring = buildPatternStory("CP00", loc, "exploring");
  const senior = buildPatternStory("CP00", loc, "senior");
  const developing = buildPatternStory("CP00", loc, "developing");
  const noStage = buildPatternStory("CP00", loc);

  ok(
    exploring.answers.whereItLeads === noStage.answers.whereItLeads,
    `12c.1 (${loc}) omitting narrativeStage behaves exactly like "exploring" -- backward compatible`,
  );
  ok(
    senior.answers.whereItLeads !== exploring.answers.whereItLeads &&
      senior.answers.growthEdge !== exploring.answers.growthEdge &&
      senior.answers.whyTheseCareers !== exploring.answers.whyTheseCareers,
    `12c.2 (${loc}) the senior variant genuinely differs from the exploring/default variant`,
  );
  ok(
    developing.answers.whereItLeads !== exploring.answers.whereItLeads &&
      developing.answers.whereItLeads !== senior.answers.whereItLeads,
    `12c.3 (${loc}) the developing variant is its own distinct text, not a copy of either neighbour`,
  );
  const retakeLanguage = loc === "sv" ? "gör om testet" : "retake the assessment";
  ok(
    !senior.answers.whereItLeads.toLowerCase().includes(retakeLanguage) &&
      !senior.answers.growthEdge.toLowerCase().includes(retakeLanguage),
    `12c.4 (${loc}) the senior variant never tells an experienced candidate to "retake the assessment"`,
  );
  ok(
    exploring.answers.howYouWork === senior.answers.howYouWork &&
      exploring.answers.givesEnergy === senior.answers.givesEnergy &&
      exploring.answers.takesEnergy === senior.answers.takesEnergy &&
      exploring.answers.superpower === senior.answers.superpower,
    `12c.5 (${loc}) the four working-style answers (how you work / gives energy / takes energy / superpower) stay pattern-only, unaffected by career stage`,
  );
}

// Non-CP00 patterns must be completely unaffected by narrativeStage -- it
// is a CP00-only narrative concern, never a general story mechanism.
ok(
  buildPatternStory("CP01", "sv", "senior").answers.whereItLeads ===
    buildPatternStory("CP01", "sv").answers.whereItLeads,
  "12c.6 a non-CP00 pattern (CP01) renders identically regardless of narrativeStage",
);

// =========================================================================
group("13 · Output B content rules");
// =========================================================================

const ALL_STORY_PATTERNS: ResolvedPatternId[] = ["CP00", ...PATTERN_IDS];
const LOCALES: Locale[] = ["sv", "en"];

eq(STORY_PATTERN_IDS.length, 11, "13.1 every pattern plus CP00 has a story");

for (const p of ALL_STORY_PATTERNS) {
  for (const loc of LOCALES) {
    const s = buildPatternStory(p, loc);
    ok(
      STORY_QUESTIONS.every((q) => s.answers[q] && s.answers[q].trim().length > 40),
      `13.2 ${p}/${loc} answers all seven questions with real content`,
    );
    ok(
      s.name.length > 0 && s.shareSummary.length > 0,
      `13.3 ${p}/${loc} has a name and a share line`,
    );
  }
}

// No numerals anywhere in candidate-facing story text (owner decision B-5).
for (const p of ALL_STORY_PATTERNS) {
  for (const loc of LOCALES) {
    const s = buildPatternStory(p, loc);
    const text = [...Object.values(s.answers), s.name, s.shareSummary].join(" ");
    ok(!/\d/.test(text), `13.4 ${p}/${loc} contains no numeral`);
    ok(!/\bCID\d{2}\b/i.test(text), `13.5 ${p}/${loc} names no dimension`);
    ok(!/\bCP\d{2}\b/i.test(text), `13.6 ${p}/${loc} exposes no pattern id`);
  }
}

// Deficit and eligibility language is banned outright: no hedge makes
// "du saknar" or "qualified" acceptable.
const BANNED_ABSOLUTE = [
  "du saknar",
  "du har svårt för",
  "du kan inte",
  "du har alltid",
  "you lack",
  "you struggle with",
  "you cannot",
  "you're not good at",
  "svaghet",
  "weakness",
  "shortcoming",
  "needs improvement",
  "kvalificerad",
  "qualified",
  "behörig",
  "eligible",
  "lämplig för",
  "suitable for",
  "personlighetstyp",
  "personality type",
  "integritet",
  "integrity",
];
for (const p of ALL_STORY_PATTERNS) {
  for (const loc of LOCALES) {
    const s = buildPatternStory(p, loc);
    const text = [...Object.values(s.answers), s.name, s.shareSummary].join(" ").toLowerCase();
    const hit = BANNED_ABSOLUTE.find((b) => text.includes(b));
    ok(hit === undefined, `13.7 ${p}/${loc} uses no banned phrase (found "${hit}")`);
  }
}

// Bare assertions about the person are banned, but only when they escape a
// hedge. "when you're the one who's there" is a situational clause, not a
// personality claim, so the check is scoped to the SENTENCE: an assertion is
// a violation only if its own sentence carries no hedge.
const ASSERTIONS = [/\bdu är\b/, /\bdu blir\b/, /\byou are\b/, /\byou always\b/];
const HEDGES = [
  /dina svar (tyder|visar|pekar)/,
  /du verkar/,
  /verkar /,
  /brukar/,
  /du tappar ofta/,
  /det brukar betyda/,
  /your answers (suggest|show|point)/,
  /you seem/,
  /you may find/,
  /tend to/,
  /it usually means/,
  /people tend/,
];
for (const p of ALL_STORY_PATTERNS) {
  for (const loc of LOCALES) {
    const story = buildPatternStory(p, loc);
    const unhedged: string[] = [];
    for (const [q, text] of Object.entries(story.answers)) {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        const lower = sentence.toLowerCase();
        if (!ASSERTIONS.some((a) => a.test(lower))) continue;
        if (HEDGES.some((h) => h.test(lower))) continue;
        // An assertion inside a conditional or relative clause describes a
        // SITUATION ("when you're the one who's there"), not the person.
        // Questions 2 and 3 are lists of conditions by design.
        if (/\b(när|when|om|if|där|where)\b[^.]*\b(du är|you are)\b/.test(lower)) continue;
        unhedged.push(`${q}: ${sentence.slice(0, 60)}`);
      }
    }
    ok(
      unhedged.length === 0,
      `13.7b ${p}/${loc} makes no unhedged claim about the person (${unhedged[0] ?? ""})`,
    );
  }
}

// The energy frame: question 3 must describe conditions, and questions 1 and
// 3 must hedge rather than assert.
for (const p of ALL_STORY_PATTERNS) {
  for (const loc of LOCALES) {
    const s = buildPatternStory(p, loc);
    const hedges =
      loc === "sv"
        ? ["dina svar tyder", "du verkar", "du tappar ofta", "brukar", "dina svar visar"]
        : ["your answers suggest", "you seem", "you may find", "tend to", "your answers show"];
    ok(
      hedges.some((h) => s.answers.howYouWork.toLowerCase().includes(h)),
      `13.8 ${p}/${loc} question 1 hedges rather than asserts`,
    );
    ok(
      hedges.some((h) => s.answers.takesEnergy.toLowerCase().includes(h)),
      `13.9 ${p}/${loc} question 3 uses the energy frame`,
    );
  }
}

ok(
  Object.keys(STORY_HEADINGS.sv).length === 7 && Object.keys(STORY_HEADINGS.en).length === 7,
  "13.10 seven headings exist in both languages",
);

// =========================================================================
group("14 · Snapshot");
// =========================================================================

const SNAP_AT = "2026-07-30T12:00:00.000Z";
const snap = buildValidatedSnapshot({
  answers: archetype("CP01"),
  locale: "sv",
  completedAt: SNAP_AT,
});

eq(validateSnapshot(snap).length, 0, "14.1 a well-formed snapshot passes validation");
eq(snap.completedAt, SNAP_AT, "14.2 the completion timestamp is supplied, not generated");
eq(
  snap.versions.reportSchemaVersion,
  REPORT_SCHEMA_VERSION,
  "14.3 the report schema version is stored",
);
ok(
  Object.values(snap.versions).filter((v) => v !== null).length === 8,
  "14.4 eight version identifiers are stored (profession calibration stays null)",
);
eq(
  snap.versions.professionCalibrationVersion,
  null,
  "14.5 no calibration version while none is approved",
);
eq(snap.professions.available, false, "14.6 Layer 4 is present and explicitly unavailable");
eq(snap.professions.matches.length, 0, "14.7 no profession match is stored");
eq(snap.outputA.dimensions.length, 17, "14.8 all seventeen dimensions are stored");
ok(
  snap.outputA.dimensions.every((d) => d.sources.length > 0 || d.score === null),
  "14.9 every scored dimension stores its evidence sources",
);
ok(
  snap.outputA.dimensions.find((d) => d.id === "CID15")!.usedForMatching === false,
  "14.10 CID15 is stored as not used for matching",
);
ok(snap.outputA.areas.length === 10, "14.11 ranked areas are stored");
ok(
  snap.outputB.leading.answers.howYouWork.length > 0,
  "14.12 Output B is rendered, not referenced",
);

// Self-containment: the stored payload must carry rendered text, not ids
// that would need a live lookup table later.
ok(
  snap.outputA.dimensions.every((d) => d.name.length > 0),
  "14.13 dimensions store their rendered name, not just an id",
);
ok(
  snap.outputA.areas.every((a) => a.name.length > 0 && a.description.length > 0),
  "14.14 areas store rendered name and description",
);
ok(
  snap.outputA.areas.every((a) => a.alignedWith.every((n) => !/^CID\d{2}$/.test(n))),
  "14.15 area evidence stores dimension names, not ids",
);

// Balanced profiles must store CP00 with a full story.
const balancedSnap = buildValidatedSnapshot({
  answers: allHigh,
  locale: "en",
  completedAt: SNAP_AT,
});
eq(
  balancedSnap.outputA.leadingPattern,
  null,
  "14.16 an undifferentiated profile stores no leading pattern",
);
eq(balancedSnap.outputB.presentedPattern, "CP00", "14.17 CP00 is presented instead");
ok(
  STORY_QUESTIONS.every((q) => balancedSnap.outputB.leading.answers[q].length > 40),
  "14.18 CP00 receives the same seven-answer story as any pattern",
);
eq(validateSnapshot(balancedSnap).length, 0, "14.19 a CP00 snapshot is valid");
eq(balancedSnap.outputA.leaningToward.length, 3, "14.20 CP00 stores three directions to explore");

// Validation must reject, not repair.
const incomplete = buildSnapshot({
  answers: [{ itemId: "CQ01", format: "scale", value: 5 }],
  locale: "sv",
  completedAt: SNAP_AT,
});
ok(
  validateSnapshot(incomplete).some((f) => f.code === "CD_INCOMPLETE_EVIDENCE"),
  "14.21 an incomplete run is refused rather than scored",
);
let threwOnInvalid = false;
try {
  buildValidatedSnapshot({
    answers: [{ itemId: "CQ01", format: "scale", value: 5 }],
    locale: "sv",
    completedAt: SNAP_AT,
  });
} catch (e) {
  threwOnInvalid = e instanceof SnapshotValidationError;
}
ok(threwOnInvalid, "14.22 buildValidatedSnapshot throws rather than storing invalid data");

// Tampered snapshots must fail validation.
const tampered = JSON.parse(JSON.stringify(snap)) as ReturnType<typeof buildSnapshot>;
(tampered.outputA as { leadingPattern: string | null }).leadingPattern = "CP08";
ok(
  validateSnapshot(tampered).some((f) => f.code === "CD_PATTERN_MISMATCH"),
  "14.23 Output A and Output B disagreeing on the pattern is caught",
);

const tampered2 = JSON.parse(JSON.stringify(snap)) as ReturnType<typeof buildSnapshot>;
(tampered2.outputB.leading.answers as Record<string, string>).superpower =
  "You are strong in 3 areas.";
const t2 = validateSnapshot(tampered2);
ok(
  t2.some((f) => f.code === "CD_STORY_CONTAINS_NUMERAL"),
  "14.24 a numeral introduced into story text is caught",
);

// Determinism, at the snapshot level.
eq(
  hash(buildSnapshot({ answers: archetype("CP01"), locale: "sv", completedAt: SNAP_AT })),
  hash(snap),
  "14.25 the same inputs produce a byte-identical snapshot",
);
ok(
  hash(buildSnapshot({ answers: archetype("CP01"), locale: "en", completedAt: SNAP_AT })) !==
    hash(snap),
  "14.26 locale genuinely changes the stored content",
);

// =========================================================================
group("14b · Anonymous current-profession snapshot — Owner Security Manager scenario (real-world defect fix)");
// =========================================================================

// Real defect, found live: the anonymous, client-computed report (no
// professionCatalog, no account) never resolved a title for the candidate's
// self-reported current profession -- ReportSnapshot.currentProfession
// requires BOTH a slug and a resolved title (see v31/snapshot.ts), so "YOU
// ARE HERE" could never render for an anonymous candidate no matter which
// profession they picked. Root cause: CareerContextStep never captured the
// title text it already had in hand from the picker's own fetched list.
// Proves the underlying contract buildValidatedSnapshot/PublicAssessmentFlow
// rely on: supplying currentProfessionCigSlug + currentProfessionTitle +
// experienceBand -- exactly what the fixed client path now does -- produces
// a frozen snapshot with currentProfession correctly populated, with NO
// professionCatalog present (the real anonymous-path condition).
const anonymousCurrentProfessionSnap = buildValidatedSnapshot({
  answers: archetype("CP08"), // CP08: Strategic Security Leader pattern -- the persona this scenario represents
  locale: "sv",
  completedAt: SNAP_AT,
  currentProfessionCigSlug: "sakerhetschef",
  currentProfessionTitle: { sv: "Säkerhetschef", en: "Head of Security" },
  experienceBand: "8_plus_y",
  // No professionCatalog -- exactly the anonymous client-computed path's
  // real condition (RLS grants cd_professions to `authenticated` only).
});
ok(
  anonymousCurrentProfessionSnap.currentProfession !== null &&
    anonymousCurrentProfessionSnap.currentProfession.cigSlug === "sakerhetschef" &&
    anonymousCurrentProfessionSnap.currentProfession.titleSv === "Säkerhetschef" &&
    anonymousCurrentProfessionSnap.currentProfession.titleEn === "Head of Security",
  "14b.1 currentProfession is populated (slug + both locale titles) with NO professionCatalog present -- YOU ARE HERE does not depend on approved_for_ranking",
);
ok(
  anonymousCurrentProfessionSnap.professions.available === false,
  "14b.2 professions.available stays false (nothing approved) -- currentProfession and profession-catalog availability are genuinely independent",
);
eq(
  validateSnapshot(anonymousCurrentProfessionSnap).length,
  0,
  "14b.3 a snapshot with currentProfession but no approved catalog is still fully valid",
);

// A slug alone, with no resolved title, must NOT populate currentProfession
// -- half-known data is not "known" (mirrors item 2's "unknown stays
// unknown" discipline applied to this new field).
const slugOnlySnap = buildValidatedSnapshot({
  answers: archetype("CP08"),
  locale: "sv",
  completedAt: SNAP_AT,
  currentProfessionCigSlug: "sakerhetschef",
  // currentProfessionTitle intentionally omitted.
});
eq(
  slugOnlySnap.currentProfession,
  null,
  "14b.4 a slug with no resolved title never fabricates a YOU ARE HERE -- both are required together",
);

// Determinism: identical inputs, including the new fields, produce a
// byte-identical snapshot.
eq(
  hash(
    buildValidatedSnapshot({
      answers: archetype("CP08"),
      locale: "sv",
      completedAt: SNAP_AT,
      currentProfessionCigSlug: "sakerhetschef",
      currentProfessionTitle: { sv: "Säkerhetschef", en: "Head of Security" },
      experienceBand: "8_plus_y",
    }),
  ),
  hash(anonymousCurrentProfessionSnap),
  "14b.5 the same inputs, including current profession + experience, produce a byte-identical snapshot",
);

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-v31-check: all ${checks} checks passed.`);
