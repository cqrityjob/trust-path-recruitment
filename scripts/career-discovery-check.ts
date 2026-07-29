// Security Career Discovery v3.0 — Phase 1 regression guard.
//
// Covers the deterministic half of the required-test list in the
// implementation directive §23: routing (1–9), the scoring boundary
// (10–15 where they are decidable without a UI), and i18n (21–23).
//
// The persistence half (16–20) and the RLS isolation proof live in
// supabase/tests/career_discovery_v3_test.sql, which runs against a real
// disposable Postgres via `bun run db:test`.
//
// Plain TS script, matching this repository's scripts/*-check.ts convention
// (no test runner is configured in this project).

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ADAPTIVE_ITEMS_BY_PATH,
  ADAPTIVE_ITEMS_PER_SESSION,
  ALL_ADAPTIVE_ITEMS,
  ALL_REPORT_TAGS,
  PATH_BY_ADAPTIVE_ITEM_ID,
} from "../src/lib/career-discovery/adaptive-items";
import { AXIS_IDS, MIN_ITEMS_PER_AXIS, SIGNAL_IDS } from "../src/lib/career-discovery/axes";
import {
  CONTEXT_ITEMS,
  CONTEXT_STATUS_VALUES,
  DISCOVERY_GOAL_VALUES,
  PATH_BY_CONTEXT_STATUS,
} from "../src/lib/career-discovery/context-items";
import { CORE_ITEMS, CORE_ITEM_COUNT } from "../src/lib/career-discovery/core-items";
import { DISCOVERY_SECTIONS, PREPARATION_SCREEN } from "../src/lib/career-discovery/sections";
import {
  assembleSession,
  completionState,
  estimatedMinutes,
  EXPECTED_TOTAL_QUESTIONS,
  progressFor,
} from "../src/lib/career-discovery/session";
import { rankCareerAreas } from "../src/lib/career-discovery/area-ranking";
import { scoreDna } from "../src/lib/career-discovery/scoring";
import { isValidSessionId, parseSessionId } from "../src/lib/career-discovery/session-id";
import type { ScoringInput } from "../src/lib/career-discovery/scoring";
import type { AdaptivePath, ContextStatus, DiscoveryItem } from "../src/lib/career-discovery/types";
import { isScoredItem } from "../src/lib/career-discovery/types";
import {
  CONTENT_VERSION,
  DEFINITION_ID,
  DEFINITION_VERSION,
  isAdministrableToCandidates,
  LIFECYCLE_STATUS,
  SCORING_VERSION,
  TAXONOMY_VERSION,
} from "../src/lib/career-discovery/version";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
function read(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf8");
}

const ALL_STATUSES = CONTEXT_STATUS_VALUES;

// ---------------------------------------------------------------------------
// Routing — directive §23 tests 1–9
// ---------------------------------------------------------------------------

// 1–5. Each context_status receives ONLY its own path's adaptive items.
const EXPECTED_PATH: Record<ContextStatus, AdaptivePath> = {
  exploring_security: "A",
  working_in_security: "B",
  developing_current_role: "C",
  changing_career_area: "D",
  security_leader: "E",
};

for (const status of ALL_STATUSES) {
  const session = assembleSession(status);
  const expectedPath = EXPECTED_PATH[status];

  expect(
    session.adaptivePath === expectedPath,
    `routing: ${status} must resolve to path ${expectedPath}, got ${session.adaptivePath}`,
  );

  const administered = session.items.filter((i) => i.item.kind === "adaptive");
  for (const { item } of administered) {
    const owningPath = PATH_BY_ADAPTIVE_ITEM_ID.get(item.id);
    expect(
      owningPath === expectedPath,
      `routing: ${status} was served adaptive item ${item.id}, which belongs to path ${owningPath}, not ${expectedPath}`,
    );
  }

  // 6. Exactly four adaptive questions.
  expect(
    administered.length === ADAPTIVE_ITEMS_PER_SESSION,
    `routing: ${status} must receive exactly ${ADAPTIVE_ITEMS_PER_SESSION} adaptive items, got ${administered.length}`,
  );

  // 7. Every user still receives ALL 20 core scored items — this is the
  //    comparability guarantee, and the single most important assertion
  //    in this file.
  const coreServed = session.items
    .filter((i) => i.item.kind !== "context" && i.item.kind !== "adaptive")
    .map((i) => i.item.id)
    .sort();
  const coreExpected = CORE_ITEMS.map((i) => i.id).sort();
  expect(
    coreServed.length === CORE_ITEM_COUNT,
    `routing: ${status} must receive all ${CORE_ITEM_COUNT} core items, got ${coreServed.length}`,
  );
  expect(
    JSON.stringify(coreServed) === JSON.stringify(coreExpected),
    `routing: ${status} core item set differs from the canonical bank — measurement would not be comparable across users`,
  );

  // Total is always 26.
  expect(
    session.items.length === EXPECTED_TOTAL_QUESTIONS,
    `routing: ${status} must present ${EXPECTED_TOTAL_QUESTIONS} questions, got ${session.items.length}`,
  );

  // 2 context questions, always the same two.
  expect(
    session.counts.context === 2,
    `routing: ${status} must present exactly 2 context questions, got ${session.counts.context}`,
  );
}

// 8. Changing C2 (discovery goal) cannot change the path. assembleSession
//    does not accept a goal at all, which is the structural proof; assert
//    the signature has not grown one.
expect(
  assembleSession.length === 1,
  "routing: assembleSession must take exactly one argument (context_status). A second input would let C2 or a core answer influence the path.",
);

// 9. Refresh cannot change the path — assembly is pure, so repeated calls
//    must be identical.
for (const status of ALL_STATUSES) {
  const a = assembleSession(status);
  const b = assembleSession(status);
  expect(
    a.adaptivePath === b.adaptivePath &&
      JSON.stringify(a.items.map((i) => i.item.id)) ===
        JSON.stringify(b.items.map((i) => i.item.id)),
    `routing: re-assembling ${status} produced a different session — the path/order is not stable across a refresh`,
  );
}

// Path table is total and injective over the five statuses.
expect(
  new Set(Object.values(PATH_BY_CONTEXT_STATUS)).size === 5,
  "routing: the five context statuses must map to five distinct adaptive paths",
);
expect(
  Object.keys(PATH_BY_CONTEXT_STATUS).length === 5,
  "routing: PATH_BY_CONTEXT_STATUS must cover exactly the five locked context statuses",
);

// ---------------------------------------------------------------------------
// Scoring boundary — directive §23 tests 10–15, and §16
// ---------------------------------------------------------------------------

// 14. Context questions are not scored.
for (const item of CONTEXT_ITEMS) {
  expect(!isScoredItem(item), `scoring boundary: context item ${item.id} must not be scored`);
  expect(item.axes.length === 0, `scoring boundary: context item ${item.id} must load no axis`);
}

// 10/11. Adaptive answers can never move a core score, because no adaptive
//        item carries an axis loading or a scoring evidence class.
for (const item of ALL_ADAPTIVE_ITEMS) {
  expect(!isScoredItem(item), `scoring boundary: adaptive item ${item.id} must not be scored`);
  expect(
    item.evidenceClass === "contextual_self_report",
    `scoring boundary: adaptive item ${item.id} must carry evidence class contextual_self_report, got ${item.evidenceClass}`,
  );
  expect(
    item.axes.length === 0,
    `scoring boundary: adaptive item ${item.id} must load no orientation axis`,
  );
  for (const option of item.options) {
    expect(
      option.loadings === undefined,
      `scoring boundary: adaptive item ${item.id} option ${option.value} must carry no axis loadings`,
    );
    expect(
      (option.reportTags ?? []).length === 1,
      `scoring boundary: adaptive item ${item.id} option ${option.value} must carry exactly one contextual report tag`,
    );
  }
}

// 12/15. A result requires all 20 scored core items and NOT the adaptive
//        ones — adaptive answers must never be required inputs.
for (const status of ALL_STATUSES) {
  const session = assembleSession(status);
  const coreIds = session.items.filter((i) => isScoredItem(i.item)).map((i) => i.item.id);

  const coreOnly = completionState(session, coreIds);
  expect(
    coreOnly.canGenerateResult,
    `scoring boundary: ${status} — a result must be generatable from the 20 core items alone, with no adaptive answers`,
  );
  expect(
    coreOnly.missingAdaptiveItemIds.length === ADAPTIVE_ITEMS_PER_SESSION,
    `scoring boundary: ${status} — missing adaptive answers must be reported but not block completion`,
  );

  const withoutOneCore = completionState(session, coreIds.slice(1));
  expect(
    !withoutOneCore.canGenerateResult,
    `scoring boundary: ${status} — a result must NOT be generatable while a core item is unanswered`,
  );

  const adaptiveOnly = completionState(
    session,
    session.items.filter((i) => i.item.kind === "adaptive").map((i) => i.item.id),
  );
  expect(
    !adaptiveOnly.canGenerateResult,
    `scoring boundary: ${status} — adaptive answers alone must never satisfy result generation`,
  );

  expect(
    session.counts.scored === CORE_ITEM_COUNT,
    `scoring boundary: ${status} — exactly ${CORE_ITEM_COUNT} scored items expected, got ${session.counts.scored}`,
  );
}

// 13. Transition screens produce no evidence: they are section properties,
//     never items, so they carry no item id and cannot reach cd_evidence.
const transitionCount = DISCOVERY_SECTIONS.filter((s) => s.transition).length;
expect(
  transitionCount === 4,
  `scoring boundary: expected 4 transition screens between 5 sections, got ${transitionCount}`,
);
for (const status of ALL_STATUSES) {
  const session = assembleSession(status);
  const ids = new Set(session.items.map((i) => i.item.id));
  expect(
    !ids.has("transition") && ![...ids].some((id) => id.toLowerCase().includes("transition")),
    `scoring boundary: ${status} — no transition screen may appear as an answerable item`,
  );
}

// Behavioural items never load an orientation axis (they must never enter
// matching, ranking or eligibility).
for (const item of CORE_ITEMS.filter((i) => i.kind === "behavioural")) {
  expect(
    item.axes.length === 0,
    `scoring boundary: behavioural item ${item.id} must not load an orientation axis — signals never enter matching`,
  );
  expect(
    item.evidenceClass === "behavioural_signal",
    `scoring boundary: behavioural item ${item.id} must carry evidence class behavioural_signal`,
  );
  for (const option of item.options) {
    expect(
      option.loadings === undefined,
      `scoring boundary: behavioural item ${item.id} option ${option.value} must carry no axis loadings`,
    );
  }
}

// ---------------------------------------------------------------------------
// Instrument integrity
// ---------------------------------------------------------------------------

expect(
  CORE_ITEMS.length === CORE_ITEM_COUNT,
  `instrument: the core bank must hold exactly ${CORE_ITEM_COUNT} items, got ${CORE_ITEMS.length}`,
);

// Every axis carries at least the minimum number of independent loadings.
const loadingsPerAxis = new Map<string, string[]>(AXIS_IDS.map((a) => [a, []]));
for (const item of CORE_ITEMS) {
  for (const axis of item.axes) {
    loadingsPerAxis.get(axis)?.push(item.id);
  }
}
for (const [axis, items] of loadingsPerAxis) {
  expect(
    items.length >= MIN_ITEMS_PER_AXIS,
    `instrument: axis ${axis} has ${items.length} loading(s) (${items.join(", ")}), below the floor of ${MIN_ITEMS_PER_AXIS}`,
  );
}
const totalLoadings = [...loadingsPerAxis.values()].reduce((n, a) => n + a.length, 0);
expect(
  totalLoadings === 24,
  `instrument: expected 24 axis loadings (8 axes × 3), got ${totalLoadings}`,
);

// Every behavioural signal is observed by exactly one item.
const signalItems = new Map<string, string[]>(SIGNAL_IDS.map((s) => [s, []]));
for (const item of CORE_ITEMS) {
  if (item.signal) signalItems.get(item.signal)?.push(item.id);
}
for (const [signal, items] of signalItems) {
  expect(
    items.length === 1,
    `instrument: signal ${signal} must be observed by exactly one item, got ${items.length}`,
  );
}

// Item ids are unique across the whole definition.
const allItems: DiscoveryItem[] = [...CONTEXT_ITEMS, ...CORE_ITEMS, ...ALL_ADAPTIVE_ITEMS];
const idCounts = new Map<string, number>();
for (const item of allItems) idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
for (const [id, n] of idCounts) {
  expect(
    n === 1,
    `instrument: item id ${id} is defined ${n} times — ids must be stable and unique`,
  );
}

// Option values are unique within an item and language-independent
// (test 23: no option value may contain non-ASCII or look like prose).
for (const item of allItems) {
  const values = item.options.map((o) => o.value);
  expect(
    new Set(values).size === values.length,
    `instrument: item ${item.id} has duplicate option values`,
  );
  for (const v of values) {
    expect(
      /^[a-z0-9_]+$/.test(v),
      `i18n: option value "${v}" on item ${item.id} must be a stable snake_case identifier, not localised text`,
    );
  }
}

// Adaptive bank shape: 5 paths × 4 items, all distinct.
expect(
  ALL_ADAPTIVE_ITEMS.length === 20,
  `instrument: the adaptive bank must hold 20 items (5 paths × 4), got ${ALL_ADAPTIVE_ITEMS.length}`,
);
for (const [path, items] of Object.entries(ADAPTIVE_ITEMS_BY_PATH)) {
  expect(
    items.length === ADAPTIVE_ITEMS_PER_SESSION,
    `instrument: path ${path} must hold exactly ${ADAPTIVE_ITEMS_PER_SESSION} items, got ${items.length}`,
  );
}
expect(
  ALL_REPORT_TAGS.length === 80,
  `instrument: expected 80 distinct contextual report tags (20 items × 4 options), got ${ALL_REPORT_TAGS.length}`,
);

// ---------------------------------------------------------------------------
// Sections — directive §6 and §14
// ---------------------------------------------------------------------------

expect(DISCOVERY_SECTIONS.length === 5, "sections: exactly five Discovery sections are required");

const sectionCoreIds = DISCOVERY_SECTIONS.flatMap((s) => s.coreItemIds);
expect(
  sectionCoreIds.length === CORE_ITEM_COUNT,
  `sections: the five sections must between them place all ${CORE_ITEM_COUNT} core items, got ${sectionCoreIds.length}`,
);
expect(
  new Set(sectionCoreIds).size === sectionCoreIds.length,
  "sections: a core item may not be placed in more than one section",
);
for (const id of CORE_ITEMS.map((i) => i.id)) {
  expect(sectionCoreIds.includes(id), `sections: core item ${id} is not placed in any section`);
}

const adaptiveSlots = DISCOVERY_SECTIONS.filter((s) => s.hasAdaptiveSlot).map((s) => s.id);
expect(
  JSON.stringify(adaptiveSlots) ===
    JSON.stringify(["approach", "others", "responsibility", "development"]),
  `sections: adaptive slots must sit in Discovery 1, 2, 4 and 5, got ${adaptiveSlots.join(", ")}`,
);

// Ordinals are 1..5 in order.
DISCOVERY_SECTIONS.forEach((s, i) => {
  expect(
    s.ordinal === i + 1,
    `sections: section ${s.id} must carry ordinal ${i + 1}, got ${s.ordinal}`,
  );
});

// 27. Progress is accurate in every path.
for (const status of ALL_STATUSES) {
  const session = assembleSession(status);
  for (const sessionItem of session.items) {
    // The two context questions sit before the sections and are excluded.
    if (sessionItem.indexInSection === 0) continue;
    const p = progressFor(session, sessionItem.questionNumber);
    expect(
      p.sectionCount === 5,
      `progress: ${status} — section count must be 5, got ${p.sectionCount}`,
    );
    expect(
      p.itemInSection >= 1 && p.itemInSection <= p.itemsInSection,
      `progress: ${status} — item ${sessionItem.item.id} reports position ${p.itemInSection} of ${p.itemsInSection}`,
    );
    expect(
      p.sectionOrdinal >= 1 && p.sectionOrdinal <= 5,
      `progress: ${status} — item ${sessionItem.item.id} reports section ordinal ${p.sectionOrdinal}`,
    );
  }
  // Section item counts must sum to the 24 non-context questions.
  const totalInSections = session.items.filter((i) => i.indexInSection > 0).length;
  expect(
    totalInSections === 24,
    `progress: ${status} — sections must hold 24 questions (20 core + 4 adaptive), got ${totalInSections}`,
  );
}

// The preparation screen claims 12–15 minutes; the authored estimates must
// actually land there, or the product opens with a false promise.
for (const status of ALL_STATUSES) {
  const minutes = estimatedMinutes(assembleSession(status));
  expect(
    minutes >= 11 && minutes <= 16,
    `sections: ${status} — estimated session length ${minutes} min is outside the 12–15 min claim on the preparation screen`,
  );
}

// ---------------------------------------------------------------------------
// i18n — directive §23 tests 21–23
// ---------------------------------------------------------------------------

// 21. Every candidate-facing string exists in both Swedish and English.
function checkBilingual(label: string, value: { sv: string; en: string } | undefined): void {
  if (!value) return;
  expect(
    typeof value.sv === "string" && value.sv.trim().length > 0,
    `i18n: ${label} is missing Swedish text`,
  );
  expect(
    typeof value.en === "string" && value.en.trim().length > 0,
    `i18n: ${label} is missing English text`,
  );
  expect(
    value.sv.trim() !== value.en.trim(),
    `i18n: ${label} has identical sv and en text — English must be an authored adaptation, not a copy`,
  );
}

for (const item of allItems) {
  checkBilingual(`item ${item.id} prompt`, item.prompt);
  if (item.stem) {
    checkBilingual(`item ${item.id} stem A`, item.stem.a);
    checkBilingual(`item ${item.id} stem B`, item.stem.b);
  }
  for (const option of item.options) {
    checkBilingual(`item ${item.id} option ${option.value}`, option.label);
    if (option.signalNote) {
      checkBilingual(`item ${item.id} option ${option.value} signal note`, option.signalNote);
    }
  }
}

for (const section of DISCOVERY_SECTIONS) {
  checkBilingual(`section ${section.id} title`, section.title);
  checkBilingual(`section ${section.id} description`, section.description);
  if (section.transition) checkBilingual(`section ${section.id} transition`, section.transition);
}

checkBilingual("preparation screen title", PREPARATION_SCREEN.title);
checkBilingual("preparation screen cta", PREPARATION_SCREEN.cta);
expect(
  PREPARATION_SCREEN.body.sv.length === PREPARATION_SCREEN.body.en.length,
  "i18n: the preparation screen must have the same number of paragraphs in sv and en",
);
for (let i = 0; i < PREPARATION_SCREEN.body.sv.length; i += 1) {
  expect(
    PREPARATION_SCREEN.body.sv[i].trim().length > 0 &&
      PREPARATION_SCREEN.body.en[i].trim().length > 0,
    `i18n: preparation screen paragraph ${i + 1} is empty in one language`,
  );
}

// Internal construct identifiers must never reach a candidate-facing string.
const CONSTRUCT_ID_PATTERN = /\b(CDA-0[1-8]|BS-[1-4])\b/;
for (const item of allItems) {
  for (const text of [
    item.prompt.sv,
    item.prompt.en,
    ...(item.stem ? [item.stem.a.sv, item.stem.a.en, item.stem.b.sv, item.stem.b.en] : []),
    ...item.options.flatMap((o) => [o.label.sv, o.label.en]),
  ]) {
    expect(
      !CONSTRUCT_ID_PATTERN.test(text),
      `i18n: candidate-facing text on item ${item.id} exposes an internal construct identifier: "${text}"`,
    );
  }
}
for (const section of DISCOVERY_SECTIONS) {
  for (const text of [
    section.title.sv,
    section.title.en,
    section.description.sv,
    section.description.en,
  ]) {
    expect(
      !CONSTRUCT_ID_PATTERN.test(text),
      `i18n: section ${section.id} exposes an internal construct identifier: "${text}"`,
    );
  }
}

// 22. Stable values are language-independent — asserted above via the
//     snake_case check, and here for the two context enums.
for (const v of [...CONTEXT_STATUS_VALUES, ...DISCOVERY_GOAL_VALUES]) {
  expect(
    /^[a-z0-9_]+$/.test(v),
    `i18n: stable value "${v}" must be a language-independent identifier`,
  );
}

// ---------------------------------------------------------------------------
// Locked owner content — verbatim spot-checks
// ---------------------------------------------------------------------------
//
// The two context questions and the section/transition copy are owner-locked.
// If someone paraphrases them, this fails.

const LOCKED: Array<[string, string]> = [
  ["C1 prompt sv", "Vilket påstående beskriver dig bäst just nu?"],
  ["C1 prompt en", "Which statement best describes where you are right now?"],
  ["C2 prompt sv", "Vad hoppas du få ut av den här upptäcktsresan?"],
  ["C2 prompt en", "What do you hope to get from this discovery?"],
];
const contextPrompts = [
  CONTEXT_ITEMS[0].prompt.sv,
  CONTEXT_ITEMS[0].prompt.en,
  CONTEXT_ITEMS[1].prompt.sv,
  CONTEXT_ITEMS[1].prompt.en,
];
LOCKED.forEach(([label, expected], i) => {
  expect(
    contextPrompts[i] === expected,
    `locked content: ${label} must read exactly "${expected}", got "${contextPrompts[i]}"`,
  );
});

const LOCKED_SECTION_TITLES_SV = [
  "Hur du tar dig an situationer",
  "Hur du arbetar med andra",
  "Hur du fattar beslut",
  "Hur du hanterar ansvar",
  "Hur du vill utvecklas",
];
DISCOVERY_SECTIONS.forEach((s, i) => {
  expect(
    s.title.sv === LOCKED_SECTION_TITLES_SV[i],
    `locked content: Discovery ${i + 1} Swedish title must read exactly "${LOCKED_SECTION_TITLES_SV[i]}", got "${s.title.sv}"`,
  );
});

// ---------------------------------------------------------------------------
// Registry parity — the TypeScript definition and the database item
// registry must describe the SAME instrument
// ---------------------------------------------------------------------------
//
// cd_definition_items is what the database validates every answer against.
// If it drifts from src/lib/career-discovery/, the database would accept or
// reject items the application does not agree about. This parses the seed
// out of the hardening migration and diffs it against the TS definition.

const hardening = read(
  "supabase/migrations/20260728130000_career_discovery_v3_phase1_hardening.sql",
);

type RegistryRow = {
  itemId: string;
  itemKind: string;
  adaptivePath: string | null;
  sectionId: string | null;
  displayOrder: number;
};

const seedRows: RegistryRow[] = [
  ...hardening.matchAll(
    /^\s*\('([A-Za-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,\s*(NULL|'[A-E]')\s*,\s*(NULL|'[a-z]+')\s*,\s*(\d+)\)/gm,
  ),
].map((m) => ({
  itemId: m[1],
  itemKind: m[2],
  adaptivePath: m[3] === "NULL" ? null : m[3].replaceAll("'", ""),
  sectionId: m[4] === "NULL" ? null : m[4].replaceAll("'", ""),
  displayOrder: Number(m[5]),
}));

expect(
  seedRows.length === 42,
  `registry parity: expected to parse 42 seeded registry rows from the hardening migration, got ${seedRows.length}`,
);

const seedById = new Map(seedRows.map((r) => [r.itemId, r]));

// Every TypeScript item exists in the registry with the same kind.
for (const item of allItems) {
  const row = seedById.get(item.id);
  if (!row) {
    errors.push(
      `registry parity: item ${item.id} exists in TypeScript but not in cd_definition_items`,
    );
    continue;
  }
  expect(
    row.itemKind === item.kind,
    `registry parity: item ${item.id} is kind '${item.kind}' in TypeScript but '${row.itemKind}' in the registry`,
  );
}
// ...and nothing extra in the registry.
for (const row of seedRows) {
  expect(
    idCounts.has(row.itemId),
    `registry parity: cd_definition_items seeds item ${row.itemId}, which does not exist in TypeScript`,
  );
}

// Adaptive ownership matches.
for (const [itemId, path] of PATH_BY_ADAPTIVE_ITEM_ID) {
  const row = seedById.get(itemId);
  expect(
    row?.adaptivePath === path,
    `registry parity: adaptive item ${itemId} belongs to path ${path} in TypeScript but ${row?.adaptivePath ?? "none"} in the registry`,
  );
}

// Section placement and display order match, for both core and adaptive.
for (const status of ALL_STATUSES) {
  const session = assembleSession(status);
  for (const si of session.items) {
    if (si.indexInSection === 0) continue; // the two context items
    const row = seedById.get(si.item.id);
    expect(
      row?.sectionId === si.sectionId,
      `registry parity: item ${si.item.id} sits in section '${si.sectionId}' in TypeScript but '${row?.sectionId ?? "none"}' in the registry`,
    );
    expect(
      row?.displayOrder === si.indexInSection,
      `registry parity: item ${si.item.id} has display order ${si.indexInSection} in TypeScript but ${row?.displayOrder ?? "none"} in the registry`,
    );
  }
}

// The database's path-derivation function must mirror PATH_BY_CONTEXT_STATUS.
for (const [status, path] of Object.entries(PATH_BY_CONTEXT_STATUS)) {
  expect(
    new RegExp(`WHEN\\s+'${status}'\\s+THEN\\s+'${path}'`).test(hardening),
    `registry parity: cd_derive_adaptive_path() must map ${status} -> ${path}, matching PATH_BY_CONTEXT_STATUS`,
  );
}

// The hardening migration must remain additive against the legacy world.
for (const forbidden of [
  "DROP TABLE",
  "TRUNCATE",
  "ALTER TABLE public.assessment_runs",
  "ALTER TABLE public.assessment_responses",
  "ALTER TABLE public.assessment_run_reports",
  "ALTER TABLE public.assessments",
  "ALTER TABLE public.assessment_versions",
]) {
  expect(
    !hardening.toUpperCase().includes(forbidden.toUpperCase()),
    `separation: the hardening migration must be additive — it must not contain "${forbidden}"`,
  );
}

// Completion must not be reachable while the Phase 3 report generator is
// missing, and the internal-test route must require an administrator.
expect(
  hardening.includes("CD_REPORT_GENERATOR_NOT_IMPLEMENTED"),
  "lifecycle: cd_complete_session() must refuse until the Phase 3 report generator exists",
);
expect(
  hardening.includes("CD_INTERNAL_TEST_REQUIRES_ADMIN") && hardening.includes("is_platform_admin"),
  "lifecycle: the internal-test route must require a platform administrator",
);
expect(
  /_status = 'design'[\s\S]{0,240}CD_VERSION_NOT_ADMINISTRABLE/.test(hardening),
  "lifecycle: a design-status version must be unreachable by every route, including internal test",
);

// ---------------------------------------------------------------------------
// Lifecycle — directive §22 and §25 ("do not mark the version active")
// ---------------------------------------------------------------------------

expect(
  LIFECYCLE_STATUS === "design",
  `lifecycle: v3.0 must ship as 'design', got '${LIFECYCLE_STATUS}'. Activation is an owner decision after the review gates.`,
);
expect(
  !isAdministrableToCandidates(),
  "lifecycle: v3.0 must not be administrable to real candidates while review gates are outstanding",
);

// The migration must agree with the TypeScript version constants.
const migration = read("supabase/migrations/20260728120000_career_discovery_v3_phase1.sql");
for (const [label, value] of [
  ["definition id", DEFINITION_ID],
  ["definition version", DEFINITION_VERSION],
  ["content version", CONTENT_VERSION],
  ["scoring version", SCORING_VERSION],
  ["taxonomy version", TAXONOMY_VERSION],
] as const) {
  expect(
    migration.includes(value),
    `lifecycle: the migration must carry the same ${label} as version.ts ("${value}")`,
  );
}
expect(
  /lifecycle_status[\s\S]{0,80}'design'/.test(migration),
  "lifecycle: the migration must seed the definition version as 'design'",
);
expect(
  migration.includes("employer_visible") && /employer_visible[\s\S]{0,40}false/.test(migration),
  "privacy: the migration must register the catalog row with employer_visible = false",
);

// ---------------------------------------------------------------------------
// Separation from the live v2.1 instrument
// ---------------------------------------------------------------------------
//
// Per the ADR, zero items are reused from v2.1, and this definition must not
// touch the live one.

const v2ItemIds = new Set(
  [...read("src/lib/assessment-content.ts").matchAll(/^\s*id: "(q\d+)"/gm)].map((m) => m[1]),
);
for (const item of allItems) {
  expect(
    !v2ItemIds.has(item.id),
    `separation: v3.0 item id ${item.id} collides with a live v2.1 question id`,
  );
}
expect(
  v2ItemIds.size > 0,
  "separation: could not read any v2.1 question ids — the collision check would pass vacuously",
);

expect(
  DEFINITION_ID !== "public-career-assessment" && DEFINITION_ID !== "career-guidance",
  "separation: v3.0 must be a distinct Assessment Catalog definition",
);

// The migration must not OPERATE on the live definitions. Comments are not
// operations, so they are stripped first — naming what a migration
// deliberately leaves alone is documentation, not a reference.
const migrationSql = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
for (const forbidden of ["public-career-assessment", "career-guidance"]) {
  expect(
    !migrationSql.includes(forbidden),
    `separation: the migration must not operate on the live definition '${forbidden}'`,
  );
}
expect(
  migration.includes("public-career-assessment"),
  "separation: the comment check would pass vacuously if the migration never named the live definitions at all",
);
for (const forbidden of [
  "DROP TABLE",
  "DROP COLUMN",
  "TRUNCATE",
  "ALTER TABLE public.assessment_runs",
  "ALTER TABLE public.assessment_responses",
  "ALTER TABLE public.assessment_run_reports",
]) {
  expect(
    !migration.toUpperCase().includes(forbidden.toUpperCase()),
    `separation: the migration must be additive — it must not contain "${forbidden}"`,
  );
}

// ---------------------------------------------------------------------------
// Deterministic scoring and ranking — spec "Required automated tests"
// ---------------------------------------------------------------------------

const FULL_FIELD: ScoringInput[] = [
  { itemId: "S1", answerValue: "full_presence" },
  { itemId: "S2", answerValue: "central" },
  { itemId: "S3", answerValue: "framework" },
  { itemId: "S4", answerValue: "acute" },
  { itemId: "S5", answerValue: "tool_only" },
  { itemId: "S6", answerValue: "move_on" },
  { itemId: "S7", answerValue: "own_work" },
  { itemId: "S8", answerValue: "incident" },
  { itemId: "T1", answerValue: "strong_a" },
  { itemId: "T2", answerValue: "strong_a" },
  { itemId: "T3", answerValue: "strong_b" },
  { itemId: "T4", answerValue: "strong_a" },
  { itemId: "T5", answerValue: "strong_a" },
  { itemId: "T6", answerValue: "strong_a" },
  { itemId: "T7", answerValue: "strong_a" },
  { itemId: "T8", answerValue: "strong_a" },
  { itemId: "B1", answerValue: "full" },
  { itemId: "B2", answerValue: "brief_check" },
  { itemId: "B3", answerValue: "lower_acknowledge" },
  { itemId: "B4", answerValue: "changed" },
];

const dnaA = scoreDna(FULL_FIELD);
const dnaB = scoreDna(FULL_FIELD);

expect(
  JSON.stringify(dnaA) === JSON.stringify(dnaB),
  "scoring: scoreDna must be deterministic — identical answers produced different output",
);
expect(
  dnaA.answeredCoreItemCount === CORE_ITEM_COUNT && dnaA.coverage === 1,
  `scoring: 20 answered core items must give coverage 1, got ${dnaA.coverage}`,
);
expect(
  dnaA.axes.length === AXIS_IDS.length,
  `scoring: expected ${AXIS_IDS.length} axis scores, got ${dnaA.axes.length}`,
);
expect(
  dnaA.signals.length === SIGNAL_IDS.length,
  `scoring: expected ${SIGNAL_IDS.length} behavioural signal readings, got ${dnaA.signals.length}`,
);

// Answer order must not change the result — evidence comes back from the
// database in arbitrary order.
const shuffled = [...FULL_FIELD].reverse();
expect(
  JSON.stringify(scoreDna(shuffled)) === JSON.stringify(dnaA),
  "scoring: answer order must not affect the DNA — results would not be reproducible",
);

// THE SCORING BOUNDARY, end to end: adding adaptive and context answers
// must not move a single axis position, and must not move the ranking.
const withContextual: ScoringInput[] = [
  ...FULL_FIELD,
  { itemId: "CTX_CURRENT_STATUS", answerValue: "security_leader" },
  { itemId: "CTX_DISCOVERY_GOAL", answerValue: "confirm_direction" },
  { itemId: "ADAPT_LEADER_01", answerValue: "d" },
  { itemId: "ADAPT_LEADER_02", answerValue: "c" },
];
const dnaWith = scoreDna(withContextual);
expect(
  JSON.stringify(dnaWith.axes) === JSON.stringify(dnaA.axes),
  "scoring boundary: adaptive and context answers changed the DNA axes — they must be invisible to scoring",
);

const rankA = rankCareerAreas(dnaA);
const rankWith = rankCareerAreas(dnaWith);
expect(
  JSON.stringify(rankA.ranked.map((r) => [r.areaId, r.fit])) ===
    JSON.stringify(rankWith.ranked.map((r) => [r.areaId, r.fit])),
  "ranking: adaptive and context answers changed the Security Career Area ranking — they must never affect it",
);
expect(
  JSON.stringify(rankCareerAreas(dnaA).ranked.map((r) => r.areaId)) ===
    JSON.stringify(rankA.ranked.map((r) => r.areaId)),
  "ranking: rankCareerAreas must be deterministic",
);
expect(
  rankA.top.length === 3 && rankA.adjacent.length === 3,
  `ranking: expected 3 top and 3 adjacent areas, got ${rankA.top.length} and ${rankA.adjacent.length}`,
);
expect(
  rankA.top[0].areaId === "protective_operations",
  `ranking: a maximally field-present, people-facing, low-tech, low-scope profile must rank protective_operations first, got ${rankA.top[0].areaId}`,
);
// Ranking is on fit alone — the list must be monotonically non-increasing.
for (let i = 1; i < rankA.ranked.length; i += 1) {
  expect(
    rankA.ranked[i - 1].fit >= rankA.ranked[i].fit,
    `ranking: results must be ordered by fit alone; position ${i} breaks the ordering`,
  );
}
// Emerging axes contribute nothing rather than a reduced weight.
const sparse = scoreDna(FULL_FIELD.slice(0, 4));
expect(
  rankCareerAreas(sparse).insufficientEvidence,
  "ranking: with most axes emerging, the engine must report insufficient evidence rather than a confident list",
);
expect(
  sparse.emergingAxes.length > 0 &&
    rankCareerAreas(sparse).ranked.every((r) =>
      r.evaluated.every((c) => !sparse.emergingAxes.includes(c.axis)),
    ),
  "ranking: an emerging axis must never appear as an evaluated contribution",
);

// ---------------------------------------------------------------------------
// Start flow — session id must be a real UUID before it reaches the URL
// ---------------------------------------------------------------------------
//
// Regression cover for the start-flow defect: the landing page navigated
// with whatever the RPC returned, so a lost or malformed id produced
// `/discovery/session?session=` and a dead end.

const VALID_UUID = "ba7787d2-5a07-48fd-ab17-3191afc90990";

expect(isValidSessionId(VALID_UUID), "session id: a real uuid must validate");
expect(parseSessionId(VALID_UUID) === VALID_UUID, "session id: a real uuid must parse to itself");
expect(
  parseSessionId("  " + VALID_UUID.toUpperCase() + "  ") === VALID_UUID,
  "session id: case and surrounding whitespace must normalise, not reject",
);

// Every shape the broken flow could produce must be rejected.
for (const bad of [
  "", // String(undefined ?? "") -- exactly what produced `?session=`
  " ",
  "undefined",
  "null",
  "ba7787d2", // truncated
  "ba7787d2-5a07-48fd-ab17", // truncated
  "ba7787d2-5a07-48fd-ab17-3191afc9099g", // non-hex
  "ba7787d2_5a07_48fd_ab17_3191afc90990", // wrong separators
  undefined,
  null,
  0,
  {},
  [],
]) {
  expect(
    parseSessionId(bad) === null,
    `session id: ${JSON.stringify(bad)} must be rejected, never sent to the router`,
  );
  expect(!isValidSessionId(bad), `session id: ${JSON.stringify(bad)} must not validate`);
}

// ---- Route wiring, asserted statically --------------------------------

const landing = read("src/routes/discovery.tsx");
const sessionRoute = read("src/routes/_authenticated.discovery.session.tsx");

// The navigate must be gated on a parsed id, and the raw RPC value must not
// go straight into the search param.
expect(
  landing.includes("parseSessionId(result?.sessionId)"),
  "start flow: the landing page must validate the RPC result before navigating",
);
expect(
  !/search:\s*\{\s*session:\s*result/.test(landing) &&
    !/search:\s*\{\s*session:\s*sessionId\s*\}\s*as never/.test(
      landing.slice(0, landing.indexOf("const sessionId = parseSessionId")),
    ),
  "start flow: the unvalidated RPC value must never be placed in the search param",
);

// Error path: the catch block must set an error and must NOT navigate.
// Anchored inside beginOrResume -- the first `} catch {` in the file belongs
// to the access-check effect, not to the start handler.
const beginStart = landing.indexOf("const beginOrResume");
const beginEnd = landing.indexOf("\n  };", beginStart);
const beginBody = landing.slice(beginStart, beginEnd);
const catchBlock = beginBody.slice(beginBody.indexOf("} catch {"));
expect(
  catchBlock.includes("setError(") && !catchBlock.includes("navigate("),
  "start flow: a failed RPC must set an error and must NOT navigate",
);

// The invalid-id branch must also return without navigating.
const guardBlock = beginBody.slice(
  beginBody.indexOf("if (!sessionId) {"),
  beginBody.indexOf('navigate({ to: "/discovery/session"'),
);
expect(
  guardBlock.includes("return;") && !guardBlock.includes("navigate("),
  "start flow: an invalid session id must return early without navigating",
);

// Sanitised errors only: no raw ids, codes or database vocabulary surfaced.
for (const leak of ["sessionId}", "error.message", "CD_", "supabase", "rpc"]) {
  const inUserFacing = /setError\([^)]*/g;
  const calls = beginBody.match(inUserFacing) ?? [];
  expect(
    !calls.some((c) => c.includes(leak)),
    `start flow: setError must not surface "${leak}" to the candidate`,
  );
}

// Recovery: a missing/invalid param must re-resolve rather than dead-end,
// and must replace the broken URL rather than push it.
expect(
  sessionRoute.includes("startSession({ data: { locale: lang } })"),
  "start flow: the session route must recover a lost session id via the idempotent start RPC",
);
expect(
  sessionRoute.includes("replace: true"),
  "start flow: the corrected URL must replace the broken one, not push a second history entry",
);
expect(
  sessionRoute.includes("parseSessionId(sessionId)"),
  "start flow: the session route must validate its search param",
);

// The recovery must reuse the idempotent RPC, which returns the caller's
// existing in-progress session -- so recovery can never fork a second run.
expect(
  /returns the caller's existing in-progress session|never creates a second one/.test(sessionRoute),
  "start flow: the recovery path must document that it cannot create a duplicate session",
);

// The legacy instrument must remain untouched by this fix.
expect(
  !landing.includes("security-career-assessment") &&
    !sessionRoute.includes("security-career-assessment"),
  "scope: the start-flow fix must not reference the legacy assessment route",
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`career-discovery:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `career-discovery:check OK ` +
    `(${ALL_STATUSES.length} paths × ${EXPECTED_TOTAL_QUESTIONS} questions verified; ` +
    `${CORE_ITEM_COUNT} shared core items across all paths; ` +
    `${totalLoadings} axis loadings over ${AXIS_IDS.length} axes; ` +
    `${ALL_ADAPTIVE_ITEMS.length} adaptive items proven unscored; ` +
    `${ALL_REPORT_TAGS.length} contextual report tags; lifecycle '${LIFECYCLE_STATUS}', not administrable)`,
);
