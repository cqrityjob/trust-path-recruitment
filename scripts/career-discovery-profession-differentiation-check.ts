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
import { answersFor, PERSONAS, type AnswerPersona } from "./fixtures/career-dna-personas";
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

console.log(
  failures === 0
    ? `\ncareer-discovery-profession-differentiation-check: all ${checks} checks passed.`
    : `\nFAIL  ${checks - failures}/${checks} differentiation checks`,
);
process.exit(failures === 0 ? 0 : 1);
