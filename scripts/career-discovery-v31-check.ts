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

eq(CORE_ITEMS.length, 20, "1.1 exactly 20 core items");
eq(SCALE_ITEMS.length, 12, "1.2 exactly 12 scale items");
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
  new Set(CORE_ITEMS.map((i) => i.order)).size === 20,
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
  CID02: 1.3,
  CID03: 1.6,
  CID04: 1.55,
  CID05: 1.7,
  CID06: 1.35,
  CID07: 1.3,
  CID08: 1.3,
  CID09: 1.3,
  CID10: 1.45,
  CID11: 1.9,
  CID12: 1.45,
  CID13: 1.6,
  CID14: 1.3,
  CID15: 1.4,
  CID16: 1.7,
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
  "3.3 every one of the 16 dimensions has evidence in a complete run",
);

// =========================================================================
group("4 · CID15 (owner decision A-4)");
// =========================================================================

eq(DIMENSIONS.CID15.matchingWeight, 0, "4.1 CID15 carries profession-matching weight 0");
ok(!MATCHABLE_DIMENSION_IDS.includes("CID15"), "4.2 CID15 is excluded from matchable dimensions");
ok(!PATTERN_SCORED_DIMENSION_IDS.includes("CID15"), "4.3 CID15 is excluded from pattern scoring");
eq(MATCHABLE_DIMENSION_IDS.length, 15, "4.4 fifteen dimensions drive profession matching");
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
  CP01: "7325d7871c5b56fb",
  CP05: "d0a74d6ee434f8cb",
  CP10: "7aa2b96f7da12b0c",
  balanced: "80b3e8e048b78b7f",
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
eq(CONTENT_VERSION, "v3.1-draft-1", "9.4 content version is pinned");
eq(SCORING_VERSION, "v3.1-draft-1", "9.5 scoring version is pinned");
eq(OPTION_MATRIX_VERSION, "v3.1-draft-1", "9.6 option matrix version is pinned");
eq(PATTERN_DEFINITION_VERSION, "v3.1-draft-1", "9.7 pattern definition version is pinned");
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

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260730100000_career_discovery_v3_1_instrument.sql",
);
const migration = readFileSync(migrationPath, "utf8");

const valuesBlock = migration.slice(
  migration.indexOf(
    "(scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)\nVALUES",
  ),
  migration.indexOf("ON CONFLICT (scoring_version, question_id, option_id, dimension_id)"),
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

// The version strings must agree between code and migration.
for (const v of [
  { value: "2026-scd-v3.1.0", label: "definition version" },
  { value: CONTENT_VERSION, label: "content version" },
  { value: SCORING_VERSION, label: "scoring version" },
]) {
  ok(migration.includes(`'${v.value}'`), `11.8 the migration carries the same ${v.label}`);
}

// v3.1 must be registered as internal_test: not reachable by real candidates.
ok(
  migration.includes("'internal_test'") && !migration.includes("'active'"),
  "11.9 v3.1 is registered as internal_test and never as active",
);

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-v31-check: all ${checks} checks passed.`);
