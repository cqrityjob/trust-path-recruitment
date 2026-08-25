// The occupational recommendation — regression.
//
// ── WHAT THIS EXISTS TO PREVENT ────────────────────────────────────────
//
// Career Discovery is an orientation product. Every threshold in
// v31/professions.ts is, correctly, an EXCLUSION — a profession the
// candidate has no differentiated affinity with is dropped rather than
// shown weakly. Applied to a genuinely balanced profile the exclusions can
// all fire at once, and a candidate who answered twenty-eight questions
// reached the end with no occupation named at all and a note saying
// profession matching was "not included in this version". That is the
// defect this file guards against coming back.
//
// The engine now separates ORDER from ELIGIBILITY: the gated tiers are
// untouched and still decide what may be presented as a fit, while
// `matchProfessions().ranked` always answers "of the calibrated
// professions, which are closest to these answers, in what order".
//
// ── WHAT IS ASSERTED, AND WHY EACH ASSERTION IS THE RIGHT ONE ──────────
//
//  1. Every persona gets a recommendation. Not "usually" — a report with no
//     direction is the defect.
//  2. Rank is 1, 2, 3, stated and consistent with array order, so a
//     consumer cannot render a different claim from the one computed.
//  3. It is deterministic: the same answers produce the same ranking, run
//     twice, in the same order.
//  4. Materially different personas do NOT all receive the same top
//     profession. This is the assertion that would fail if the ranking
//     degenerated into "everybody gets Väktare" — the failure mode a
//     recommendation that always exists is most at risk of.
//  5. Each recommendation carries a reason and the Career DNA traits behind
//     it, in both locales, from the authored catalogue copy.
//  6. Confidence never overclaims: an entry that did NOT clear the gates is
//     "indicative" and never borrows the fit vocabulary.
//  7. The candidate's own current profession is never recommended to them.
//
// Fixtures are the SAME golden personas the rest of Layer 4 is proven
// against (src/lib/career-discovery/v31/golden-persona-fixtures.ts) and the
// same real first-wave calibration — not a second, diverging set authored
// to make this file pass.

import {
  DIMENSION_IDS,
  type DimensionId,
} from "../src/lib/career-discovery/v31/dimensions";
import { explainMatch } from "../src/lib/career-discovery/v31/profession-explanations";
import { matchProfessions } from "../src/lib/career-discovery/v31/professions";
import type { Confidence, DimensionResult } from "../src/lib/career-discovery/v31/scoring";
import {
  GOLDEN_PERSONAS,
  type GoldenPersona,
} from "../src/lib/career-discovery/v31/golden-persona-fixtures";
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

function makeDims(scores: Partial<Record<DimensionId, number>>): DimensionResult {
  const dimensions = Object.fromEntries(
    DIMENSION_IDS.map((id) => {
      const value = id in scores ? (scores[id] as number) : null;
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

function run(p: GoldenPersona) {
  return matchProfessions(
    makeDims(p.dims),
    FIRST_WAVE_CATALOG,
    p.contextStatus,
    p.currentProfessionCigSlug ?? null,
    [],
    undefined,
    p.experienceBand ?? null,
  );
}

const byId = new Map(GOLDEN_PERSONAS.map((p) => [p.id, p] as const));

/** Whether this fixture models a run that actually finished.
 *
 *  A real completed journey answers all twenty-two Career DNA items, so
 *  every matchable dimension carries evidence. The "sparse" fixture
 *  deliberately does not — it exists to prove the engine degrades honestly,
 *  not to set the bar for what a finished report must contain. */
function completeEvidence(p: GoldenPersona): boolean {
  return Object.keys(p.dims).length >= 8;
}

/** The six persona CLASSES the mandate names, mapped onto the existing
 *  golden fixtures. Named here rather than re-authored so this file cannot
 *  drift from the fixtures every other Layer 4 guard uses. */
const CLASSES = [
  ["A · operational / frontline", "operational-guarding"],
  ["B · technical security", "technical"],
  ["C · analytical / investigation", "investigation"],
  ["D · management / leadership", "sakerhetschef-senior"],
  ["E · risk / resilience", "risk-crisis"],
  ["F · newcomer / exploratory", "new-to-security"],
] as const;

// =========================================================================
group("1 · Every completed run produces a recommendation");
// =========================================================================
//
// Including the balanced and the sparse profiles, which are exactly the
// ones that used to produce nothing. "Bred profil" is a legitimate Career
// DNA result; it is not a legitimate reason to name no profession.

for (const p of GOLDEN_PERSONAS) {
  const r = run(p);
  ok(r.ranked.length > 0, `1.1 ${p.id}: a recommendation exists`);
  ok(r.ranked.length === Math.min(3, FIRST_WAVE_CATALOG.length), `1.2 ${p.id}: three ranked professions`);
  ok(
    r.ranked.every((x, i) => x.rank === i + 1),
    `1.3 ${p.id}: rank is 1, 2, 3 and agrees with the order`,
  );
  ok(
    new Set(r.ranked.map((x) => x.match.professionId)).size === r.ranked.length,
    `1.4 ${p.id}: no profession is recommended twice`,
  );
}

const balanced = ["broad-profile", "broad-profile-senior", "sparse"];
for (const id of balanced) {
  const p = byId.get(id);
  ok(p !== undefined, `1.5 ${id}: fixture exists`);
  if (!p) continue;
  const r = run(p);
  ok(r.ranked.length === 3, `1.6 ${id}: a balanced/sparse profile still gets a top 3`);
  ok(
    r.ranked[0].match.titleSv.trim().length > 0,
    `1.7 ${id}: rank 1 names an actual profession`,
  );
}

// =========================================================================
group("2 · Deterministic");
// =========================================================================

for (const p of GOLDEN_PERSONAS) {
  const a = run(p);
  const b = run(p);
  ok(
    JSON.stringify(a.ranked) === JSON.stringify(b.ranked),
    `2.1 ${p.id}: identical answers produce an identical ranking`,
  );
}

// =========================================================================
group("3 · Different personas, different recommendations");
// =========================================================================
//
// The failure mode a ranking that always exists is most exposed to is
// collapse: everybody ends up with the same profession because the ordering
// is dominated by whichever profile is easiest to be near. These are the
// assertions that would catch it.

const tops = new Map<string, string>();
for (const [label, id] of CLASSES) {
  const p = byId.get(id);
  ok(p !== undefined, `3.0 ${label}: fixture "${id}" exists`);
  if (!p) continue;
  const r = run(p);
  tops.set(label, r.ranked[0]?.match.professionId ?? "");
  console.log(
    `  ${label.padEnd(32)} -> ${r.ranked.map((x) => x.match.professionId).join(", ")}`,
  );
}

ok(
  new Set(tops.values()).size >= 4,
  `3.1 the six persona classes produce at least four distinct top professions (got ${new Set(tops.values()).size})`,
);
ok(
  tops.get("A · operational / frontline") !== tops.get("B · technical security"),
  "3.2 an operational profile and a technical profile are not recommended the same profession",
);
ok(
  tops.get("D · management / leadership") !== tops.get("A · operational / frontline"),
  "3.3 a leadership profile and a frontline profile are not recommended the same profession",
);
ok(
  tops.get("C · analytical / investigation") !== tops.get("A · operational / frontline"),
  "3.4 an analytical profile and a frontline profile are not recommended the same profession",
);

// The whole persona set, not just the six classes: if the ranking had
// degenerated, this is where it would show as a single value.
const allTops = new Set(GOLDEN_PERSONAS.map((p) => run(p).ranked[0]?.match.professionId));
ok(allTops.size >= 5, `3.5 the full persona set spans at least five top professions (got ${allTops.size})`);

// =========================================================================
group("4 · Every recommendation is explained, in both locales");
// =========================================================================

for (const p of GOLDEN_PERSONAS) {
  const r = run(p);
  for (const entry of r.ranked) {
    for (const locale of ["sv", "en"] as const) {
      const e = explainMatch(entry.match, locale);
      ok(
        e.rationale.trim().length > 0,
        `4.1 ${p.id}/${entry.match.professionId}/${locale}: has a reason`,
      );
      // Two to three traits is the promise, and it is asked only of a run
      // that actually produced evidence to name. The "sparse" fixture
      // deliberately observes two dimensions — a shape a COMPLETED
      // twenty-eight-question journey cannot produce, since every candidate
      // answers all twenty-two core items — and there the honest output is
      // fewer traits and an "indicative" label, not invented ones.
      if (completeEvidence(p)) {
        ok(
          e.alignedDimensionNames.length >= 2,
          `4.2 ${p.id}/${entry.match.professionId}/${locale}: names at least two contributing Career DNA traits`,
        );
      } else {
        ok(
          entry.confidence === "indicative",
          `4.2b ${p.id}/${entry.match.professionId}/${locale}: a thin-evidence run is only ever "indicative"`,
        );
      }
      ok(
        !/\bCID\d\d\b/.test(e.alignedDimensionNames.join(" ")),
        `4.3 ${p.id}/${entry.match.professionId}/${locale}: traits are names, never dimension ids`,
      );
    }
    ok(
      (entry.match.titleSv ?? "").length > 0 && (entry.match.titleEn ?? "").length > 0,
      `4.4 ${p.id}/${entry.match.professionId}: titled in both locales`,
    );
  }
}

// =========================================================================
group("5 · Confidence never overclaims");
// =========================================================================
//
// An entry that cleared the gates keeps the fit tier it earned. One that did
// not is "indicative" — an ordering, never a fit claim. The renderer's
// vocabulary depends on this being true.

for (const p of GOLDEN_PERSONAS) {
  const r = run(p);
  const gated = new Set(r.matches.map((m) => m.professionId));
  const current = r.currentProfessionMatch?.professionId;
  for (const entry of r.ranked) {
    const cleared = gated.has(entry.match.professionId) || entry.match.professionId === current;
    if (!cleared) {
      ok(
        entry.confidence === "indicative",
        `5.1 ${p.id}/${entry.match.professionId}: an ungated entry is only ever "indicative"`,
      );
    } else {
      ok(
        entry.confidence === entry.match.fitTier,
        `5.2 ${p.id}/${entry.match.professionId}: a gated entry keeps its earned fit tier`,
      );
    }
  }
}

// =========================================================================
group("6 · A candidate is never recommended the job they already have");
// =========================================================================

for (const p of GOLDEN_PERSONAS) {
  if (!p.currentProfessionCigSlug) continue;
  const r = run(p);
  ok(
    r.ranked.every((x) => x.match.cigProfessionSlug !== p.currentProfessionCigSlug),
    `6.1 ${p.id}: own current profession is absent from the recommendation`,
  );
}

// =========================================================================
group("7 · An empty catalogue still fails honestly");
// =========================================================================
//
// No approved professions is a real state and a different one from "nothing
// cleared". It must produce no recommendation rather than an invented one.

const empty = matchProfessions(makeDims(GOLDEN_PERSONAS[0].dims), [], "working_in_security");
ok(empty.ranked.length === 0, "7.1 an empty catalogue produces no recommendation");
ok(empty.available === false, "7.2 an empty catalogue is still reported unavailable");

console.log(
  failures === 0
    ? `\ncareer-discovery-recommendation-check: all ${checks} checks passed.`
    : `\nFAIL  ${checks - failures}/${checks} recommendation checks`,
);
process.exit(failures === 0 ? 0 : 1);
