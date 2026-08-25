// Scoring equivalence for the v3.2 question refinement.
//
// v3.2 changes candidate-facing WORDING and nothing else. This script is the
// mechanical proof of "and nothing else": it replays nine fixed response sets
// (scripts/fixtures/career-discovery-v32-personas.ts) through the entire
// v3.1 engine and compares every scoring output against a baseline frozen
// from the pre-refinement tree.
//
// ── WHY THE BASELINE IS A COMMITTED FILE, NOT A RECOMPUTATION ──────────
//
// A test that recomputes both sides from the current tree proves only that
// the engine is deterministic — which guard 9.1 already proves. The claim
// here is stronger and historical: "the values this branch produces are the
// values ORIGIN/MAIN produced." That can only be checked against numbers
// captured before the wording changed, so the baseline is generated once,
// on unmodified main, and committed. Regenerating it is a deliberate act
// (FREEZE_EQUIVALENCE=1) that shows up in review as a changed fixture.
//
// ── WHAT IS COMPARED ───────────────────────────────────────────────────
//
// Everything the mandate names, at full precision rather than as a summary
// hash alone: normalised item values, per-dimension evidence and scores, the
// Career DNA vector, Career Area ranking, profession fitScore/centralZ/
// priorityScore/order, career stage, and the recommendation explanation
// inputs. A single hash would prove equality but not localise a failure; the
// per-field baseline says exactly which number moved.
//
// ── WHAT IS DELIBERATELY EXCLUDED ──────────────────────────────────────
//
// The version tuple. CONTENT_VERSION is EXPECTED to move (v3.1-draft-3 ->
// v3.1-draft-4) — that is the whole point of a content-version bump, and
// including it would make this script fail for the one reason that is
// correct. It is asserted separately, positively, at the end: scoring,
// option-matrix and pattern versions must NOT have moved.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DIMENSION_IDS } from "../src/lib/career-discovery/v31/dimensions";
import { normaliseScale, SCALE_MAX, SCALE_MIN } from "../src/lib/career-discovery/v31/core-items";
import { scoreDimensions } from "../src/lib/career-discovery/v31/scoring";
import { rankCareerAreas } from "../src/lib/career-discovery/v31/career-areas";
import { matchProfessionsDiagnostics } from "../src/lib/career-discovery/v31/professions";
import { explainMatch } from "../src/lib/career-discovery/v31/profession-explanations";
import { computeCareerIntelligence } from "../src/lib/career-discovery/v31";
import { buildSnapshot } from "../src/lib/career-discovery/v31/snapshot";
import {
  CONTENT_VERSION,
  OPTION_MATRIX_VERSION,
  PATTERN_DEFINITION_VERSION,
  SCORING_VERSION,
} from "../src/lib/career-discovery/v31/version";
import {
  answersOf,
  EQUIVALENCE_PERSONAS,
  type EquivalencePersona,
} from "./fixtures/career-discovery-v32-personas";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

const BASELINE_PATH = path.join(
  process.cwd(),
  "scripts/fixtures/career-discovery-v32-equivalence-baseline.json",
);

/** A fixed instant. `generatedAt`/`completedAt` are parameters precisely so
 *  this stays pure — see computeCareerIntelligence's header. */
const AT = "2026-08-25T00:00:00.000Z";
const CALIBRATION = "layer4-recalibrated-2026-08-16";

let checks = 0;
let failures = 0;

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

/** Stable stringify: object keys sorted at every depth, so a hash depends on
 *  values and never on property insertion order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Set) return [...value].map(String).sort();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 32);
}

// -------------------------------------------------------------------------
// The full scoring surface for one persona
// -------------------------------------------------------------------------

function profileOf(p: EquivalencePersona) {
  const answers = answersOf(p);

  // 1. Normalised item values. The first thing wording could plausibly
  //    disturb (a changed scale, a renumbered option) and the first thing to
  //    check, before anything downstream can mask it.
  const normalisedItems = Object.fromEntries(
    answers.map((a) => [a.itemId, a.format === "scale" ? normaliseScale(a.value) : a.optionId]),
  );

  const dims = scoreDimensions(answers);
  const ci = computeCareerIntelligence(answers, AT);
  const areas = rankCareerAreas(dims);
  const diag = matchProfessionsDiagnostics(
    dims,
    FIRST_WAVE_CATALOG,
    p.contextStatus,
    p.currentProfessionCigSlug,
    p.discoveryTags,
    undefined,
    p.experienceBand,
  );

  const snapshot = buildSnapshot({
    answers,
    locale: "sv",
    completedAt: AT,
    professionCatalog: FIRST_WAVE_CATALOG,
    contextStatus: p.contextStatus,
    professionCalibrationVersion: CALIBRATION,
    currentProfessionCigSlug: p.currentProfessionCigSlug,
    discoveryTags: p.discoveryTags,
    experienceBand: p.experienceBand,
  });

  // The version tuple is the one field expected to move — see the header.
  const { versions: _versions, ...snapshotWithoutVersions } = snapshot;

  return {
    scaleRange: [SCALE_MIN, SCALE_MAX],
    normalisedItems,

    // 2. Dimension evidence and the Career DNA vector.
    scoringVersion: dims.scoringVersion,
    answeredItems: dims.answeredItems,
    complete: dims.complete,
    dimensions: Object.fromEntries(
      DIMENSION_IDS.map((d) => {
        const s = dims.dimensions[d];
        return [
          d,
          {
            score: s.score,
            evidenceWeight: s.evidenceWeight,
            dominance: s.dominance,
            coverage: s.coverage,
            confidence: s.confidence,
            sources: s.sources,
            tertiaryOnly: s.tertiaryOnly,
          },
        ];
      }),
    ),

    // 3. Patterns / strengths — the Career DNA layer as consumers read it.
    careerDna: ci.dna,
    patterns: ci.patterns,
    strengths: ci.strengths,
    presentedPattern: ci.presentedPattern,

    // 4. Career Area output.
    careerAreas: {
      grouped: areas.grouped,
      sufficientEvidence: areas.sufficientEvidence,
      ranked: areas.ranked.map((a) => ({
        areaId: a.areaId,
        rank: a.rank,
        score: a.score,
        coverage: a.coverage,
        alignedDimensions: a.alignedDimensions,
      })),
    },

    // 5. Profession fit, priority, ordering and stage — the numbers the
    //    mandate names one by one.
    professionOrder: diag.result.matches.map((m) => m.professionId),
    professionDiagnostics: diag.diagnostics.map((d) => ({
      professionId: d.professionId,
      fitScore: d.fitScore,
      fitTier: d.fitTier,
      centralFitScore: d.centralFitScore,
      supportingFitScore: d.supportingFitScore,
      centralCoverage: d.centralCoverage,
      centralZ: d.centralZ,
      overallCoverage: d.overallCoverage,
      contextPriorityBonus: d.contextPriorityBonus,
      cigPathwayBonus: d.cigPathwayBonus,
      priorityScore: d.priorityScore,
      stageDistance: d.stageDistance,
      stageBeforePivotCheck: d.stageBeforePivotCheck,
      finalStage: d.finalStage,
      priorityChangedByPivot: d.priorityChangedByPivot,
      isCurrentProfession: d.isCurrentProfession,
    })),
    pivotPrimaryAreaId: diag.pivotPrimaryAreaId,
    pivotPrimarySource: diag.pivotPrimarySource,
    buckets: {
      strongestDirections: diag.result.strongestDirections.map((m) => m.professionId),
      alsoWorthExploring: diag.result.alsoWorthExploring.map((m) => m.professionId),
      longerTermPossibilities: diag.result.longerTermPossibilities.map((m) => m.professionId),
      careerPivots: diag.result.careerPivots.map((m) => m.professionId),
      currentProfessionMatch: diag.result.currentProfessionMatch?.professionId ?? null,
    },

    // 6. Recommendation explanation inputs. Wording of the RECOMMENDATION is
    //    profession-catalogue copy, untouched by this mandate — so it must
    //    come out byte-identical too, in both locales.
    //
    //    Stored as a digest rather than in full, alone with the snapshot
    //    below: these two are ~90% of the byte weight and, unlike the
    //    numeric surfaces above, they are DERIVED views of values already
    //    localised field-by-field. Keeping them verbatim would make the
    //    fixture a 750kB file nobody reviews; a digest still fails loudly,
    //    and the field-level surfaces above say which input moved.
    explanationsDigest: hash(
      diag.result.matches.map((m) => ({
        professionId: m.professionId,
        sv: explainMatch(m, "sv"),
        en: explainMatch(m, "en"),
      })),
    ),

    // 7. The whole stored report, minus the version tuple. Digest, per the
    //    note above — plus the candidate story in full, because outputB is
    //    the one part of the snapshot no other surface here covers.
    snapshotDigest: hash(snapshotWithoutVersions),
    candidateStory: snapshot.outputB,
  };
}

const current = Object.fromEntries(EQUIVALENCE_PERSONAS.map((p) => [p.key, profileOf(p)]));

// -------------------------------------------------------------------------
// Freeze / compare
// -------------------------------------------------------------------------

if (process.env.FREEZE_EQUIVALENCE === "1") {
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        _comment:
          "Frozen on unmodified origin/main BEFORE the v3.2 wording refinement. " +
          "Regenerate only with FREEZE_EQUIVALENCE=1 and only when a scoring " +
          "change is genuinely intended — a wording change never is.",
        frozenAgainst: {
          scoringVersion: SCORING_VERSION,
          optionMatrixVersion: OPTION_MATRIX_VERSION,
          patternDefinitionVersion: PATTERN_DEFINITION_VERSION,
        },
        personas: canonical(current),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`FROZEN → ${BASELINE_PATH}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
  frozenAgainst: Record<string, string>;
  personas: Record<string, unknown>;
};

group("1 · Persona coverage");

ok(
  EQUIVALENCE_PERSONAS.length === 9,
  `1.1 nine personas are exercised (got ${EQUIVALENCE_PERSONAS.length})`,
);
ok(
  Object.keys(baseline.personas).sort().join(",") ===
    EQUIVALENCE_PERSONAS.map((p) => p.key)
      .sort()
      .join(","),
  "1.2 the baseline covers exactly the current persona set",
);

group("2 · Field-level equivalence (old wording vs new wording, same responses)");

// Named sub-surfaces, so a failure says WHICH output moved rather than
// "something in a 400kB blob".
const SURFACES = [
  ["normalised item values", "normalisedItems"],
  ["dimension evidence", "dimensions"],
  ["Career DNA", "careerDna"],
  ["Career Patterns", "patterns"],
  ["Career Area output", "careerAreas"],
  ["profession diagnostics (fit / centralZ / priority)", "professionDiagnostics"],
  ["profession ordering", "professionOrder"],
  ["profession buckets", "buckets"],
  ["career stage", "professionDiagnostics"],
  ["recommendation explanation inputs", "explanationsDigest"],
  ["candidate story", "candidateStory"],
  ["stored report snapshot", "snapshotDigest"],
] as const;

for (const p of EQUIVALENCE_PERSONAS) {
  const now = current[p.key] as Record<string, unknown>;
  const was = baseline.personas[p.key] as Record<string, unknown>;
  for (const [label, key] of SURFACES) {
    ok(hash(now[key]) === hash(was[key]), `2.x ${p.label} — ${label} is unchanged`);
  }
  ok(hash(now) === hash(was), `2.z ${p.label} — the complete scoring surface is unchanged`);
}

group("3 · Only the content version may have moved");

ok(SCORING_VERSION === baseline.frozenAgainst.scoringVersion, "3.1 scoring version is unchanged");
ok(
  OPTION_MATRIX_VERSION === baseline.frozenAgainst.optionMatrixVersion,
  "3.2 option matrix version is unchanged",
);
ok(
  PATTERN_DEFINITION_VERSION === baseline.frozenAgainst.patternDefinitionVersion,
  "3.3 pattern definition version is unchanged",
);
ok(
  typeof CONTENT_VERSION === "string" && CONTENT_VERSION.length > 0,
  "3.4 a content version is set",
);

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"}  ${checks - failures}/${checks} equivalence checks`,
);
if (failures > 0) process.exit(1);
