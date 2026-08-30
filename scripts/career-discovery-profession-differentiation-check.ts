// Answer-level profession differentiation — regression.
//
// ── WHAT THIS EXISTS TO PREVENT ────────────────────────────────────────
//
// Every other Layer 4 guard starts from a hand-written dimension vector.
// That proves the MATCHER behaves, and proves nothing about the instrument
// above it. This file starts from raw answers — the 22 core items and the
// 4 Discovery Path items a candidate actually submits — and asserts the
// property the product is sold on: that materially different answers
// produce materially different professions, through the real chain.
//
//   answers -> evidence -> dimensions -> affinity -> gates
//           -> priority -> stage -> candidate-facing top 3
//
// It also pins the four defects the Profession Recommendation Validation
// audit found in that chain, each of which passed every pre-existing guard:
//
//   D1  Recommendation Priority ordered on `fitScore`, a floor-only
//       closeness percentage that saturates near 100 once neutral-baseline-z
//       gating is in force. Delivered order differed from affinity order in
//       8 of 8 personas, on differences as small as 0.2 points.
//   D2  The context/CIG priority bonus was +6 on that same saturated 0-100
//       scale, where the entire strong-tier spread is 0.7-3.9 points — so a
//       single unscored Discovery Path answer could move the headline
//       recommendation.
//   D3  The always-present ranking never ran through career-pivot stage
//       classification, so `ranked[].stage` and `matches[].stage` disagreed
//       about the same profession in the same result.
//   D5  `centralZ` is built on a CLIPPED shortfall, so every candidate who
//       clears a profession's floors receives that profession's maximum
//       possible z. Ranking on it degenerates into "how many central bands
//       did the calibration author write".
//
// ── WHAT IS DELIBERATELY *NOT* ASSERTED ────────────────────────────────
//
// No check here names a required rank-1 profession for a persona. The
// mandate is explicit that the worked examples are illustrations of
// differentiation and not expected outputs, and a test asserting
// "beginner operational => Väktare #1" would install exactly the
// `if beginner then X` rule the engine must never contain. The assertions
// are structural instead: the top 3 must fall inside the CAREER AREAS the
// persona's evidence points at, and different personas must not converge.

import { DIMENSION_IDS } from "../src/lib/career-discovery/v31/dimensions";
import { scoreDimensions } from "../src/lib/career-discovery/v31/scoring";
import {
  CIG_PATHWAY_PRIORITY_BONUS_Z,
  CONTEXT_PRIORITY_BONUS_Z,
  matchProfessions,
  matchProfessionsDiagnostics,
} from "../src/lib/career-discovery/v31/professions";
import { reportTagsFor } from "../src/lib/career-discovery/v31/personal-layer";
import type { ContextStatus } from "../src/lib/career-discovery/types";
import type { ExperienceBand } from "../src/lib/career-discovery/career-context";
import {
  ACQUIESCENT_PERSONA,
  answersFor,
  PERSONAS,
  type AnswerPersona,
} from "./fixtures/career-dna-personas";
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

const AREA_OF = new Map(FIRST_WAVE_CATALOG.map((p) => [p.professionId, p.careerAreaId]));

function tagsOf(p: AnswerPersona): string[] {
  return Object.entries(p.discovery).flatMap(([id, v]) => reportTagsFor(id, v));
}

function runPersona(
  p: AnswerPersona,
  over: {
    tags?: readonly string[];
    contextStatus?: ContextStatus;
    experienceBand?: ExperienceBand | null;
  } = {},
) {
  const dims = scoreDimensions(answersFor(p));
  return matchProfessionsDiagnostics(
    dims,
    FIRST_WAVE_CATALOG,
    over.contextStatus ?? p.contextStatus,
    p.currentProfessionCigSlug ?? null,
    over.tags ?? tagsOf(p),
    new Set<string>(),
    over.experienceBand !== undefined ? over.experienceBand : (p.experienceBand ?? null),
  );
}

const top3Ids = (p: AnswerPersona, over = {}) =>
  runPersona(p, over).result.ranked.map((r) => r.match.professionId);

// =========================================================================
group("1 · Every persona's whole answer vector scores and produces a top 3");

for (const p of PERSONAS) {
  const dims = scoreDimensions(answersFor(p));
  ok(dims.complete, `1.1 ${p.id} ${p.label} — all 22 core items answered and scored`);
  const r = runPersona(p).result;
  ok(r.ranked.length === 3, `1.2 ${p.id} — a three-entry recommendation always exists`);
  ok(
    r.ranked.every((e, i) => e.rank === i + 1),
    `1.3 ${p.id} — rank is stated and matches presentation order`,
  );
}

// =========================================================================
group("2 · Determinism — the same answers give the same ranking, every time");

for (const p of PERSONAS) {
  const a = top3Ids(p);
  const b = top3Ids(p);
  ok(a.join() === b.join(), `2.1 ${p.id} — identical answers, identical ranking`);
}

// =========================================================================
group("3 · CRITICAL DIFFERENTIATION — beginner context held constant");
//
// P1, P2 and P3 share `exploring_security` and differ ONLY in Career DNA
// and Discovery Path evidence. If their recommendations converge, the
// engine is not ready — that is the mandate's own pass/fail line.

const P = Object.fromEntries(PERSONAS.map((x) => [x.id, x])) as Record<string, AnswerPersona>;
const beginners = ["P1", "P2", "P3", "P4"] as const;
const beginnerTops = Object.fromEntries(beginners.map((id) => [id, top3Ids(P[id])])) as Record<
  string,
  string[]
>;

for (const a of beginners) {
  for (const b of beginners) {
    if (a >= b) continue;
    const overlap = beginnerTops[a].filter((x) => beginnerTops[b].includes(x));
    ok(
      beginnerTops[a][0] !== beginnerTops[b][0],
      `3.1 ${a} and ${b} — same beginner context, different #1 recommendation`,
    );
    ok(
      overlap.length <= 1,
      `3.2 ${a} and ${b} — top 3 share at most one profession (overlap: ${overlap.join(",") || "none"})`,
    );
  }
}

// The clusters each persona's evidence points at. Areas, never professions:
// which SCA a recommendation belongs to is a claim the evidence supports;
// which specific profession leads inside it is the engine's to decide.
const EXPECTED_AREAS: Readonly<Record<string, readonly string[]>> = {
  // Operational / public-order / protective guarding.
  P1: ["SCA01", "SCA02"],
  // Security technology and cyber — the technical directions.
  P2: ["SCA03", "SCA09"],
  // Investigation, financial-crime analysis, risk analysis.
  P3: ["SCA05", "SCA06", "SCA07"],
  // Coordination and leadership, with front-line service roles adjacent.
  P4: ["SCA01", "SCA02", "SCA04"],
  P5: ["SCA01", "SCA02"],
  P6: ["SCA03", "SCA05", "SCA06", "SCA09"],
  P7: ["SCA02", "SCA04", "SCA05"],
  P8: ["SCA05", "SCA06", "SCA07"],
};

for (const p of PERSONAS) {
  const areas = top3Ids(p).map((id) => AREA_OF.get(id)!);
  ok(
    areas.every((a) => EXPECTED_AREAS[p.id].includes(a)),
    `3.3 ${p.id} ${p.label} — every recommendation sits in an evidence-supported career area (got ${areas.join(",")})`,
  );
}

// =========================================================================
group("4 · Sensitivity — technology evidence moves technical affinity, both ways");
//
// Hold P1 (Beginner Operational) fixed and vary ONLY the three items that
// carry CID04: CQ08 (scale primary), CQ02 (choice primary), CQ15 (tertiary).

function withTech(level: "low" | "high"): AnswerPersona {
  return level === "low"
    ? {
        ...P.P1,
        scales: { ...P.P1.scales, CQ08: 2 },
        choices: { ...P.P1.choices, CQ02: "D", CQ15: "A" },
      }
    : {
        ...P.P1,
        scales: { ...P.P1.scales, CQ08: 10 },
        choices: { ...P.P1.choices, CQ02: "A", CQ15: "D" },
      };
}

const techLow = runPersona(withTech("low"));
const techHigh = runPersona(withTech("high"));
const techLowAgain = runPersona(withTech("low"));

const technicianLow = techLow.diagnostics.find((d) => d.professionId === "SP014");
const technicianHigh = techHigh.diagnostics.find((d) => d.professionId === "SP014");
const technicianBack = techLowAgain.diagnostics.find((d) => d.professionId === "SP014");

ok(
  technicianLow === undefined && technicianHigh !== undefined,
  "4.1 raising technology evidence brings Security Technician into scoring range",
);
ok(
  technicianBack === undefined,
  "4.2 reversing the same answers removes it again — the effect is symmetric, not a ratchet",
);
ok(
  techLow.result.ranked.map((r) => r.match.professionId).join() ===
    techLowAgain.result.ranked.map((r) => r.match.professionId).join(),
  "4.3 reversing restores the original recommendation exactly",
);

// No single item may promote a profession the candidate has poor affinity
// with. One maxed answer is evidence; it is not a recommendation.
const oneAnswer = runPersona({ ...P.P1, scales: { ...P.P1.scales, CQ08: 10 } });
ok(
  oneAnswer.result.ranked[0]?.match.professionId !== "SP014",
  "4.4 a single maxed technology item does NOT jump Security Technician to #1",
);

// =========================================================================
group("5 · Career stage — affinity is stable, only interpretation moves");
//
// The SAME Career DNA answers under four career stages. Profession
// Affinity must be byte-identical: stage is interpretation, never input.

const STAGES: readonly [ContextStatus, ExperienceBand | null][] = [
  ["exploring_security", null],
  ["working_in_security", "1_3y"],
  ["developing_current_role", "4_7y"],
  ["security_leader", "8_plus_y"],
];

const stageRuns = STAGES.map(([contextStatus, experienceBand]) =>
  runPersona(P.P1, { contextStatus, experienceBand }),
);

const affinityFingerprint = (d: ReturnType<typeof runPersona>) =>
  [...d.diagnostics]
    .sort((a, b) => a.professionId.localeCompare(b.professionId))
    .map((r) => `${r.professionId}:${r.fitScore}:${r.centralZ}:${r.centralFitScore}`)
    .join("|");

for (let i = 1; i < stageRuns.length; i += 1) {
  ok(
    affinityFingerprint(stageRuns[i]) === affinityFingerprint(stageRuns[0]),
    `5.1 ${STAGES[i][0]} — Profession Affinity is byte-identical to the exploring baseline`,
  );
}

// What MUST move is stage interpretation: an entry-level profession is
// "explore now" for a beginner and no longer a forward step for a leader.
const beginnerStages = new Set(stageRuns[0].result.matches.map((m) => m.stage));
ok(beginnerStages.has("explore_now"), "5.2 a beginner sees entry professions as 'explore now'");
ok(
  stageRuns[0].result.matches.some((m) => m.stage !== "explore_now"),
  "5.3 a beginner does NOT see every profession as immediately realistic",
);

// =========================================================================
group("6 · D3 — ranked and matches never disagree about a profession's stage");

for (const p of PERSONAS) {
  const r = runPersona(p).result;
  const finalById = new Map(r.matches.map((m) => [m.professionId, m.stage]));
  const disagreements = r.ranked.filter((e) => {
    const final = finalById.get(e.match.professionId);
    return final !== undefined && final !== e.match.stage;
  });
  ok(
    disagreements.length === 0,
    `6.1 ${p.id} — the recommendation and the tier list agree on every stage`,
  );
}

// =========================================================================
group("7 · D1/D5 — order runs on the discriminating metric, not the saturated one");

for (const p of PERSONAS) {
  const d = runPersona(p);
  const strong = d.diagnostics.filter((r) => r.fitTier === "strong" && r.priorityScore !== null);
  if (strong.length < 2) continue;
  // Delivered order must be exactly descending Recommendation Priority
  // within a tier. If it is not, something other than affinity is steering.
  const delivered = d.result.matches
    .filter((m) => m.fitTier === "strong")
    .map((m) => strong.find((s) => s.professionId === m.professionId)?.priorityScore)
    .filter((x): x is number => x !== undefined && x !== null);
  ok(
    delivered.every((v, i) => i === 0 || delivered[i - 1] >= v),
    `7.1 ${p.id} — the strong tier is ordered by Recommendation Priority, descending`,
  );
}

// The saturation that makes fitScore unusable as an ordering key, pinned so
// a future recalibration that fixes it is noticed rather than assumed.
const saturationSeen = PERSONAS.some((p) => {
  const d = runPersona(p);
  return d.diagnostics.filter((r) => r.centralFitScore === 100).length >= 2;
});
ok(
  saturationSeen,
  "7.2 fitScore saturation is still present (>=2 professions at centralFit 100 for some persona) — the reason order must not run on it",
);

// =========================================================================
group("8 · D2 — context may reorder near-peers, never overwhelm affinity");

const BONUS_CEILING = CONTEXT_PRIORITY_BONUS_Z + CIG_PATHWAY_PRIORITY_BONUS_Z;

for (const p of PERSONAS) {
  const withTags = runPersona(p);
  const withoutTags = runPersona(p, { tags: [] });

  // Affinity itself must be untouched by contextual self-report.
  ok(
    affinityFingerprint(withTags) === affinityFingerprint(withoutTags),
    `8.1 ${p.id} — Discovery Path answers do not change Profession Affinity at all`,
  );

  // Anything context DID move must have been within the bonus ceiling of
  // the profession it displaced. This is the real "cannot overwhelm" claim:
  // not "context never reorders" (it is supposed to), but "context can only
  // reorder professions that were already close".
  const before = withoutTags.result.matches.map((m) => m.professionId);
  const after = withTags.result.matches.map((m) => m.professionId);
  const zById = new Map(
    withoutTags.diagnostics.map((r) => [r.professionId, r.priorityScore] as const),
  );
  let overwhelmed = false;
  for (let i = 0; i < after.length; i += 1) {
    const movedUpBy = before.indexOf(after[i]) - i;
    if (movedUpBy <= 0) continue;
    for (let j = i + 1; j < after.length; j += 1) {
      const za = zById.get(after[i]);
      const zb = zById.get(after[j]);
      if (za === null || za === undefined || zb === null || zb === undefined) continue;
      if (before.indexOf(after[j]) < before.indexOf(after[i]) && zb - za > BONUS_CEILING) {
        overwhelmed = true;
      }
    }
  }
  ok(!overwhelmed, `8.2 ${p.id} — context never moved a profession past a clearly stronger one`);
}

// The specific flip the audit demonstrated: identical Career DNA, one
// Discovery Path tag changed, headline recommendation moved. It must not.
const techNoTags = top3Ids(P.P2, { tags: [] });
const techSca03 = top3Ids(P.P2, { tags: ["technical_development"] });
const techSca09 = top3Ids(P.P2, { tags: ["advanced_analysis"] });
ok(
  techNoTags[0] === techSca03[0] && techNoTags[0] === techSca09[0],
  "8.3 swapping a single Discovery Path tag does not change the #1 recommendation",
);

// =========================================================================
group("9 · Generic security traits cannot make every profession a match");

for (const p of PERSONAS) {
  const d = runPersona(p);
  ok(
    d.diagnostics.length < FIRST_WAVE_CATALOG.length,
    `9.1 ${p.id} — some professions are excluded outright (${d.diagnostics.length}/${FIRST_WAVE_CATALOG.length} scored)`,
  );
}

// A candidate strong on transferable WORK STYLE only, and unremarkable on
// every career-direction dimension, must not match broadly: style evidence
// is real, and structurally incapable of choosing a direction.
const styleOnly: AnswerPersona = {
  ...P.P1,
  id: "STYLE",
  label: "Style-only (generic security traits)",
  scales: {
    CQ01: 5,
    CQ04: 5,
    CQ05: 5,
    CQ07: 9,
    CQ08: 5,
    CQ10: 5,
    CQ11: 9,
    CQ13: 5,
    CQ14: 5,
    CQ16: 9,
    CQ18: 9,
    CQ19: 9,
    CQ21: 5,
    CQ22: 5,
  },
  choices: { ...P.P1.choices, CQ02: "C", CQ09: "C", CQ15: "B", CQ17: "B", CQ20: "C" },
};
const styleResult = runPersona(styleOnly);
ok(
  styleResult.diagnostics.filter((d) => d.fitTier === "strong").length <=
    FIRST_WAVE_CATALOG.length / 2,
  "9.2 a style-only profile does not clear 'strong' on most of the catalogue",
);

// =========================================================================
group("10 · The recommendation never contradicts the catalogue it came from");

for (const p of PERSONAS) {
  const r = matchProfessions(
    scoreDimensions(answersFor(p)),
    FIRST_WAVE_CATALOG,
    p.contextStatus,
    p.currentProfessionCigSlug ?? null,
    tagsOf(p),
    new Set<string>(),
    p.experienceBand ?? null,
  );
  ok(
    r.ranked.every((e) => FIRST_WAVE_CATALOG.some((c) => c.professionId === e.match.professionId)),
    `10.1 ${p.id} — every recommended profession exists in the approved catalogue`,
  );
  ok(
    p.currentProfessionCigSlug === undefined ||
      r.ranked.every((e) => e.match.cigProfessionSlug !== p.currentProfessionCigSlug),
    `10.2 ${p.id} — the candidate's own current profession is never recommended to them`,
  );
  ok(
    r.ranked.every((e) => !JSON.stringify(e.match).includes("fitScore")),
    `10.3 ${p.id} — no score or percentage reaches a candidate-facing match`,
  );
}

// =========================================================================
group("11 · DIAGNOSTIC — the acquiescent responder (high on nearly everything)");
//
// The known-weakest corner of the ranking statistic, pinned deliberately.
//
// centralExpressionZ reads the candidate's scores but not the band floors,
// so a respondent who agrees with every scale item pushes every central
// dimension high at once and their z against each profession collapses
// toward that profession's own structural leverage, Sw/sqrt(Sw^2/12), which
// grows with central band count. This section does NOT assert that the
// effect is absent -- it is not, and claiming otherwise would be false. It
// asserts the two things that ARE true and that matter, and pins the rest as
// documented current behaviour so a future recalibration is noticed rather
// than silently absorbed.
//
// See the FIT_TIER_STRONG_Z doc comment in professions.ts: the tier
// threshold this section exercises is a PROVISIONAL pilot value and is to be
// recalibrated on real pilot distributions, never tuned against this fixture.

const acqDims = scoreDimensions(answersFor(ACQUIESCENT_PERSONA));
const acq = matchProfessionsDiagnostics(
  acqDims,
  FIRST_WAVE_CATALOG,
  ACQUIESCENT_PERSONA.contextStatus,
  null,
  [],
  new Set<string>(),
  null,
);
const acqRows = [...acq.diagnostics]
  .filter((r) => r.priorityScore !== null)
  .sort((a, b) => b.priorityScore! - a.priorityScore!);

/** Sw / sqrt(Sw^2/12) over a profession's central bands: the candidate-
 *  independent leverage constant, a pure property of the calibration. If the
 *  delivered order ever equals THIS order, the ranking has stopped reading
 *  the candidate at all. */
function structuralLeverage(professionId: string): number {
  const bands = FIRST_WAVE_CATALOG.find((c) => c.professionId === professionId)!.bands.filter(
    (b) => b.centrality === "central" && b.weight > 0,
  );
  const sumW = bands.reduce((s, b) => s + b.weight, 0);
  const sumW2 = bands.reduce((s, b) => s + b.weight * b.weight, 0);
  return sumW / Math.sqrt(sumW2 / 12);
}
function centralBandCount(professionId: string): number {
  return FIRST_WAVE_CATALOG.find((c) => c.professionId === professionId)!.bands.filter(
    (b) => b.centrality === "central" && b.weight > 0,
  ).length;
}

// Documented output. Printed every run so the Top 10 is visible in CI logs
// rather than only in a doc that can drift from the code.
console.log("      Top 10 for the acquiescent profile (z · tier · central bands · leverage):");
acqRows.slice(0, 10).forEach((r, i) => {
  console.log(
    `        ${String(i + 1).padStart(2)}. ${r.professionId} ${r.titleEn.padEnd(32)}` +
      ` z=${r.priorityScore!.toFixed(3)} ${r.fitTier.padEnd(8)}` +
      ` n=${centralBandCount(r.professionId)} lev=${structuralLeverage(r.professionId).toFixed(2)}`,
  );
});

// -- 11.1 The profile is mechanically detectable ------------------------
// The most useful property: this response style does not have to be inferred
// from the ranking, it is visible in the dimension vector itself. Real
// personas disperse; this one does not, by a wide margin.
const acqScores = DIMENSION_IDS.map((d) => acqDims.dimensions[d].score).filter(
  (x): x is number => x !== null,
);
const acqMean = acqScores.reduce((a, b) => a + b, 0) / acqScores.length;
const acqSd = Math.sqrt(acqScores.reduce((a, b) => a + (b - acqMean) ** 2, 0) / acqScores.length);
const realSds = PERSONAS.map((p) => {
  const d = scoreDimensions(answersFor(p));
  const v = DIMENSION_IDS.map((x) => d.dimensions[x].score).filter((x): x is number => x !== null);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
});
ok(
  acqMean >= 0.8 && acqSd <= 0.1,
  `11.1 the acquiescent profile is mechanically detectable (mean ${acqMean.toFixed(3)} >= 0.80, sd ${acqSd.toFixed(3)} <= 0.10)`,
);
ok(
  acqSd < Math.min(...realSds) / 2,
  `11.2 its dispersion is less than half the least-dispersed real persona (${acqSd.toFixed(3)} vs ${Math.min(...realSds).toFixed(3)})`,
);

// -- 11.3 Rank 1 is NOT decided by band structure alone -----------------
// The claim under test, stated precisely: if band structure alone decided
// the winner, every profession with leverage >= the winner's would have to
// rank at or above it. At least one does not, so the candidate's own scores
// are still what separate the leaders.
const acqTop = acqRows[0];
const equalOrGreaterLeverage = acqRows.filter(
  (r) => structuralLeverage(r.professionId) >= structuralLeverage(acqTop.professionId) - 1e-9,
);
ok(
  equalOrGreaterLeverage.length > 1 &&
    equalOrGreaterLeverage.some((r) => r.priorityScore! < acqTop.priorityScore! - 1e-9),
  `11.3 rank 1 (${acqTop.professionId}) is not decided by band structure alone -- ` +
    `${equalOrGreaterLeverage.length - 1} profession(s) share or exceed its leverage and rank below it`,
);
ok(
  acqRows.map((r) => r.professionId).join() !==
    [...acqRows]
      .sort((a, b) => structuralLeverage(b.professionId) - structuralLeverage(a.professionId))
      .map((r) => r.professionId)
      .join(),
  "11.4 the delivered order is not the pure structural-leverage order -- the ranking still reads the candidate",
);

// -- 11.5 / 11.6 Known degradation, pinned not hidden --------------------
// Both of these assert behaviour that is UNDESIRABLE and currently true.
// They exist so that a future threshold recalibration or catalogue change
// that alters them fails here and gets looked at, rather than passing
// unnoticed. Neither is a target to optimise against in this branch.
const acqStrong = acqRows.filter((r) => r.fitTier === "strong").length;
ok(
  acqStrong === FIRST_WAVE_CATALOG.length,
  `11.5 KNOWN LIMITATION pinned: an acquiescent profile currently clears "strong" on all ` +
    `${acqStrong}/${FIRST_WAVE_CATALOG.length} professions at the provisional FIT_TIER_STRONG_Z. ` +
    `Recalibrate on real pilot distributions, not against this fixture.`,
);
const topSix = acqRows.slice(0, 6).map((r) => centralBandCount(r.professionId));
ok(
  topSix.every((n) => n === 3),
  "11.6 KNOWN LIMITATION pinned: band count still stratifies this profile -- the six " +
    "three-band professions occupy the top six places. Ordering WITHIN that group is " +
    "candidate-driven (11.3), but the grouping is structural.",
);

console.log(
  failures === 0
    ? `\ncareer-discovery-profession-differentiation-check: all ${checks} checks passed.`
    : `\nFAIL  ${checks - failures}/${checks} differentiation checks`,
);
process.exit(failures === 0 ? 0 : 1);
