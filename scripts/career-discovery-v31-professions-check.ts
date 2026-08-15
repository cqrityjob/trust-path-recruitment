// Security Career Discovery v3.1 — Layer 4 profession matching regression
// guard.
//
// Proves the properties owner decision C-1's worked examples (Build Mandate
// §8) actually require of ./professions.ts:
//
//   - determinism: same dims + catalog + context -> byte-identical result.
//   - an empty catalog (every real candidate today, since nothing is yet
//     approved for ranking) yields `available: false`.
//   - stage gating dominates fit: even a candidate who fits a senior
//     profession's calibration band perfectly is shown it as "longer term",
//     never "explore now", if their C1-derived baseline is entry.
//   - the exact worked examples: Student -> Police "explore now", Student ->
//     Head of Security (the senior-tier stand-in for "Security Manager" in
//     the first-wave catalogue) "longer-term" only; Väktare -> Skyddsvakt
//     "explore now", -> Security Coordinator "possible next step", -> Head
//     of Security "longer-term"; a candidate already developing in their
//     current role -> Head of Security "possible next step" (one stage up,
//     not two); a career-changer already working in security is NOT reset
//     to an entry baseline.
//   - no percentage or raw fitScore ever appears on a ProfessionMatch.
//   - CID15 never contributes to a profession's fit (owner decision A-4).
//
// Plain TS script, matching this repository's scripts/*-check.ts convention.

import { DIMENSION_IDS, type DimensionId } from "../src/lib/career-discovery/v31/dimensions";
import {
  matchProfessions,
  matchProfessionsDiagnostics,
  PROFESSION_MIN_COVERAGE,
  type ProfessionCatalogEntry,
} from "../src/lib/career-discovery/v31/professions";
import type { Confidence, DimensionResult } from "../src/lib/career-discovery/v31/scoring";

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

// =========================================================================
// Fixtures — real bands as authored in
// supabase/migrations/20260814180000_cd_layer4_first_wave_professions.sql,
// trimmed to the four professions the worked examples actually exercise.
// =========================================================================

function band(
  dimensionId: DimensionId,
  centrality: "central" | "supporting" | "neutral",
  bandLow: number,
  bandHigh: number,
  weight: number,
) {
  return { dimensionId, centrality, bandLow, bandHigh, weight };
}

// SP005 Polis (Police Officer) — entry, entry_role.
const POLIS: ProfessionCatalogEntry = {
  professionId: "SP005",
  cigProfessionSlug: "polis",
  careerAreaId: "SCA02",
  titleSv: "Polis",
  titleEn: "Police Officer",
  careerStage: "entry",
  entryRole: true,
  regulated: true,
  transitionDifficulty: 5,
  inclusionRationaleSv: "test",
  inclusionRationaleEn: "test",
  limitationNoteSv: null,
  limitationNoteEn: null,
  bands: [
    band("CID01", "supporting", 0.7, 1.0, 0.25),
    band("CID02", "supporting", 0.3, 0.7, 0.25),
    band("CID03", "supporting", 0.4, 0.8, 0.25),
    band("CID04", "supporting", 0.1, 0.5, 0.25),
    band("CID05", "supporting", 0.2, 0.6, 0.25),
    band("CID06", "supporting", 0.7, 1.0, 0.25),
    band("CID07", "supporting", 0.6, 1.0, 0.25),
    band("CID08", "central", 0.55, 0.9, 0.6),
    band("CID09", "central", 0.6, 0.9, 0.8),
    band("CID10", "supporting", 0.3, 0.7, 0.25),
    band("CID11", "supporting", 0.5, 0.9, 0.25),
    band("CID12", "central", 0.6, 0.9, 0.7),
    band("CID13", "supporting", 0.6, 1.0, 0.25),
    band("CID14", "supporting", 0.5, 0.9, 0.25),
    band("CID15", "neutral", 0.2, 0.8, 0),
    band("CID16", "central", 0.6, 0.95, 0.85),
  ],
};

// SP003 Skyddsvakt (Protective Security Guard) — entry, entry_role.
const SKYDDSVAKT: ProfessionCatalogEntry = {
  professionId: "SP003",
  cigProfessionSlug: "skyddsvakt",
  careerAreaId: "SCA01",
  titleSv: "Skyddsvakt",
  titleEn: "Protective Security Guard",
  careerStage: "entry",
  entryRole: true,
  regulated: true,
  transitionDifficulty: 2,
  inclusionRationaleSv: "test",
  inclusionRationaleEn: "test",
  limitationNoteSv: null,
  limitationNoteEn: null,
  bands: [
    // CID01 central / CID11 supporting per the Master Completion Mandate
    // calibration pass (see v31-layer4-implementation-state.md): Skyddsvakt
    // is hands-on field-presence work and needs an operational-orientation
    // signal to stay distinct from a purely analytical profile.
    band("CID01", "central", 0.55, 0.9, 0.7),
    band("CID02", "supporting", 0.2, 0.6, 0.25),
    band("CID03", "supporting", 0.3, 0.7, 0.25),
    band("CID04", "supporting", 0.2, 0.6, 0.25),
    band("CID05", "supporting", 0.1, 0.5, 0.25),
    band("CID06", "central", 0.65, 0.95, 0.9),
    band("CID07", "supporting", 0.5, 0.9, 0.25),
    band("CID08", "supporting", 0.5, 0.9, 0.25),
    band("CID09", "supporting", 0.5, 0.9, 0.25),
    band("CID10", "supporting", 0.2, 0.6, 0.25),
    band("CID11", "supporting", 0.5, 0.9, 0.25),
    band("CID12", "central", 0.6, 0.9, 0.7),
    band("CID13", "supporting", 0.5, 0.9, 0.25),
    band("CID14", "supporting", 0.4, 0.8, 0.25),
    band("CID15", "neutral", 0.2, 0.8, 0),
    band("CID16", "central", 0.55, 0.9, 0.6),
  ],
};

// SP006 Säkerhetssamordnare (Security Coordinator) — developing.
const SECURITY_COORDINATOR: ProfessionCatalogEntry = {
  professionId: "SP006",
  cigProfessionSlug: "sakerhetssamordnare",
  careerAreaId: "SCA04",
  titleSv: "Säkerhetssamordnare",
  titleEn: "Security Coordinator",
  careerStage: "developing",
  entryRole: false,
  regulated: false,
  transitionDifficulty: 3,
  inclusionRationaleSv: "test",
  inclusionRationaleEn: "test",
  limitationNoteSv: null,
  limitationNoteEn: null,
  bands: [
    band("CID01", "supporting", 0.3, 0.7, 0.25),
    band("CID02", "central", 0.55, 0.9, 0.7),
    band("CID03", "supporting", 0.6, 1.0, 0.25),
    band("CID04", "supporting", 0.4, 0.8, 0.25),
    band("CID05", "supporting", 0.7, 1.0, 0.25),
    band("CID06", "supporting", 0.7, 1.0, 0.25),
    band("CID07", "central", 0.6, 0.9, 0.85),
    band("CID08", "supporting", 0.4, 0.8, 0.25),
    band("CID09", "supporting", 0.5, 0.9, 0.25),
    band("CID10", "supporting", 0.3, 0.7, 0.25),
    band("CID11", "central", 0.6, 0.9, 0.8),
    band("CID12", "supporting", 0.6, 1.0, 0.25),
    band("CID13", "central", 0.6, 0.9, 0.7),
    band("CID14", "supporting", 0.6, 1.0, 0.25),
    band("CID15", "neutral", 0.2, 0.8, 0),
    band("CID16", "supporting", 0.6, 1.0, 0.25),
  ],
};

// SP007 Säkerhetschef (Head of Security) — senior. Stands in for "Security
// Manager" in the mandate's worked examples: this first-wave catalogue has
// one senior tier per family, not a three-rung Coordinator/Manager/Head
// ladder — see the final report's known-limitations section.
const HEAD_OF_SECURITY: ProfessionCatalogEntry = {
  professionId: "SP007",
  cigProfessionSlug: "sakerhetschef",
  careerAreaId: "SCA04",
  titleSv: "Säkerhetschef",
  titleEn: "Head of Security",
  careerStage: "senior",
  entryRole: false,
  regulated: false,
  transitionDifficulty: 6,
  inclusionRationaleSv: "test",
  inclusionRationaleEn: "test",
  limitationNoteSv: "test",
  limitationNoteEn: "test",
  bands: [
    band("CID01", "supporting", 0.3, 0.7, 0.25),
    band("CID02", "central", 0.65, 0.95, 0.95),
    band("CID03", "supporting", 0.6, 1.0, 0.25),
    band("CID04", "supporting", 0.4, 0.8, 0.25),
    band("CID05", "central", 0.6, 0.95, 0.9),
    band("CID06", "supporting", 0.7, 1.0, 0.25),
    band("CID07", "central", 0.6, 0.9, 0.7),
    band("CID08", "supporting", 0.4, 0.8, 0.25),
    band("CID09", "supporting", 0.5, 0.9, 0.25),
    band("CID10", "supporting", 0.3, 0.7, 0.25),
    band("CID11", "supporting", 0.7, 1.0, 0.25),
    band("CID12", "supporting", 0.6, 1.0, 0.25),
    band("CID13", "central", 0.6, 0.9, 0.6),
    band("CID14", "supporting", 0.6, 1.0, 0.25),
    band("CID15", "neutral", 0.2, 0.8, 0),
    band("CID16", "supporting", 0.6, 1.0, 0.25),
  ],
};

const CATALOG: readonly ProfessionCatalogEntry[] = [
  POLIS,
  SKYDDSVAKT,
  SECURITY_COORDINATOR,
  HEAD_OF_SECURITY,
];

// =========================================================================
// Synthetic candidates
// =========================================================================

function makeDims(score: number, overrides: Partial<Record<DimensionId, number>> = {}): DimensionResult {
  const dimensions = Object.fromEntries(
    DIMENSION_IDS.map((id) => {
      const value = overrides[id] ?? score;
      return [
        id,
        {
          dimension: id,
          score: value,
          evidenceWeight: 1.5,
          dominance: 0.3,
          coverage: 1,
          confidence: "high" as Confidence,
          sources: ["fixture"],
          tertiaryOnly: false,
        },
      ];
    }),
  ) as DimensionResult["dimensions"];

  return {
    scoringVersion: "fixture",
    dimensions,
    answeredItems: ["fixture"],
    complete: true,
  };
}

// A candidate who scores near-perfectly on every dimension — used to prove
// stage gating, not fit, is what keeps a novice off senior recommendations.
const HIGH_FLIER = makeDims(0.95);

// A candidate whose profile matches Police's central dimensions well and is
// otherwise middling — a more realistic "student" persona.
const STUDENT_PROFILE = makeDims(0.5, {
  CID08: 0.85,
  CID09: 0.85,
  CID12: 0.85,
  CID16: 0.85,
  CID06: 0.85,
});

// A candidate who fits nothing at all — every score at the floor.
const POOR_FIT = makeDims(0.05);

// =========================================================================
group("1 · Empty catalogue — the real production state today");
// =========================================================================

const empty = matchProfessions(HIGH_FLIER, [], "exploring_security");
ok(empty.available === false, "1.1 available is false with an empty catalogue");
ok(empty.matches.length === 0, "1.2 no matches with an empty catalogue");
ok(empty.strongestDirections.length === 0, "1.3 no strongest directions with an empty catalogue");

// =========================================================================
group("2 · Determinism");
// =========================================================================

const r1 = matchProfessions(STUDENT_PROFILE, CATALOG, "exploring_security");
const r2 = matchProfessions(STUDENT_PROFILE, CATALOG, "exploring_security");
ok(JSON.stringify(r1) === JSON.stringify(r2), "2.1 identical inputs produce an identical result");

// =========================================================================
group("3 · Student (exploring_security) — worked example");
// =========================================================================

const student = matchProfessions(STUDENT_PROFILE, CATALOG, "exploring_security");
const studentPolis = student.matches.find((m) => m.professionId === "SP005");
const studentHeadOfSecurity = student.matches.find((m) => m.professionId === "SP007");

ok(studentPolis !== undefined, "3.1 Police clears matching for the student persona");
ok(studentPolis?.stage === "explore_now", "3.2 Police is 'explore now' for a student");
ok(
  student.strongestDirections.some((m) => m.professionId === "SP005"),
  "3.3 Police appears in strongest directions for a student",
);

// =========================================================================
group("4 · Stage gating dominates fit, not the other way around");
// =========================================================================

const highFlierResult = matchProfessions(HIGH_FLIER, CATALOG, "exploring_security");
const highFlierHeadOfSecurity = highFlierResult.matches.find((m) => m.professionId === "SP007");

ok(
  highFlierHeadOfSecurity !== undefined,
  "4.1 a near-perfect-fit novice still clears Head of Security's matching bands",
);
ok(
  highFlierHeadOfSecurity?.fitTier === "strong",
  "4.2 that candidate's fit is genuinely 'strong', not just borderline",
);
ok(
  highFlierHeadOfSecurity?.stage === "longer_term",
  "4.3 yet it is 'longer term', never 'explore now' or 'possible next step', for an entry-baseline candidate",
);
ok(
  !highFlierResult.strongestDirections.some((m) => m.professionId === "SP007"),
  "4.4 Head of Security never appears in 'strongest directions' for a novice regardless of fit",
);

// =========================================================================
group("5 · Väktare-equivalent (working_in_security) — worked example");
// =========================================================================

const vaktare = matchProfessions(HIGH_FLIER, CATALOG, "working_in_security");
const vaktareSkyddsvakt = vaktare.matches.find((m) => m.professionId === "SP003");
const vaktareCoordinator = vaktare.matches.find((m) => m.professionId === "SP006");
const vaktareHeadOfSecurity = vaktare.matches.find((m) => m.professionId === "SP007");

ok(vaktareSkyddsvakt?.stage === "explore_now", "5.1 Skyddsvakt is 'explore now' for working_in_security");
ok(
  vaktareCoordinator?.stage === "possible_next_step",
  "5.2 Security Coordinator is 'possible next step' for working_in_security",
);
ok(
  vaktareHeadOfSecurity?.stage === "longer_term",
  "5.3 Head of Security is 'longer term' for working_in_security",
);

// =========================================================================
group("6 · Developing-in-current-role — worked example");
// =========================================================================

const developing = matchProfessions(HIGH_FLIER, CATALOG, "developing_current_role");
const developingHeadOfSecurity = developing.matches.find((m) => m.professionId === "SP007");

ok(
  developingHeadOfSecurity?.stage === "possible_next_step",
  "6.1 Head of Security is 'possible next step' (one stage up) for developing_current_role, not 'longer term'",
);

// HIGH_FLIER scores uniformly on every dimension, so it has no real
// "direction" for the career-pivot classifier to compare against — using it
// to assert a specific stage for an entry-tier, different-area profession
// would just be asserting an arbitrary sortScore tie-break, not a real
// property. The dedicated COORDINATOR_DIRECTION persona below (real affinity
// with Säkerhetssamordnare's own central dimensions, nothing else boosted)
// exercises the actual invariant instead — see group 6b.

// =========================================================================
group("6b · Career pivot (Execution Mandate §12-13) — worked example");
// =========================================================================

// A candidate whose evidence points at Säkerhetssamordnare's OWN central
// dimensions (CID02, CID07, CID11, CID13) and nothing else in particular —
// the "experienced Security Coordinator" persona from the mandate's worked
// example. They also happen to clear Skyddsvakt's central bands (CID06,
// CID11, CID12, CID16) because CID11 overlaps and the rest sit just above
// band floor — real affinity, not engineered to fail it.
const COORDINATOR_DIRECTION = makeDims(0.5, {
  CID02: 0.8,
  CID07: 0.85,
  CID11: 0.85,
  CID13: 0.8,
  CID06: 0.8,
  CID12: 0.75,
  CID16: 0.7,
});

// Item 2: career_pivot only ever computes when current profession is a
// REAL, self-reported fact — never inferred from Career DNA. This persona's
// current role is explicitly reported as Säkerhetssamordnare (their own
// CIG slug), exactly what the mandate's worked example describes.
const coordinatorDirection = matchProfessions(
  COORDINATOR_DIRECTION,
  CATALOG,
  "developing_current_role",
  "sakerhetssamordnare",
);
const cdCoordinator = coordinatorDirection.matches.find((m) => m.professionId === "SP006");
const cdSkyddsvakt = coordinatorDirection.matches.find((m) => m.professionId === "SP003");

// Item 8: the candidate's OWN current profession (Säkerhetssamordnare) is
// never presented as a new discovery -- pulled out of `matches` entirely
// and surfaced separately as currentProfessionMatch, still 'explore_now'
// internally (distance 0 never triggers pivot classification).
ok(
  cdCoordinator === undefined,
  "6b.1a Säkerhetssamordnare (the candidate's own current profession) is excluded from `matches` -- never a 'discovery'",
);
ok(
  coordinatorDirection.currentProfessionMatch?.professionId === "SP006" &&
    coordinatorDirection.currentProfessionMatch.stage === "explore_now",
  "6b.1b Säkerhetssamordnare is instead exposed as currentProfessionMatch, stage 'explore_now'",
);
ok(
  cdSkyddsvakt !== undefined,
  "6b.2 Skyddsvakt still clears matching (real central-dimension affinity, not excluded)",
);
ok(
  cdSkyddsvakt?.stage === "career_pivot",
  "6b.3 Skyddsvakt (SCA01, entry, behind the candidate's SCA04 direction) is 'career pivot', not 'explore now' — real affinity shown honestly as an alternative direction, not the next step",
);
ok(
  coordinatorDirection.careerPivots.some((m) => m.professionId === "SP003"),
  "6b.4 Skyddsvakt appears in the careerPivots bucket",
);
ok(
  !coordinatorDirection.strongestDirections.some((m) => m.professionId === "SP003") &&
    !coordinatorDirection.alsoWorthExploring.some((m) => m.professionId === "SP003"),
  "6b.5 Skyddsvakt does not also leak into strongestDirections or alsoWorthExploring",
);

// =========================================================================
group("6c · Unknown current profession never triggers career_pivot (Mandate item 2)");
// =========================================================================

// Same HIGH_FLIER dims and developing_current_role baseline as group 6 —
// WITHOUT a self-reported current profession. The mandate is explicit:
// Career DNA tells us how a candidate prefers to work, never what job they
// currently hold, so inferring a "primary direction" from their
// best-fitting match (the previous version of this engine) was itself the
// violation. Unknown must stay unknown: every match here keeps its plain
// stage-distance classification, and career_pivot must never appear.
const noCurrentProfession = matchProfessions(HIGH_FLIER, CATALOG, "developing_current_role");
ok(
  noCurrentProfession.careerPivots.length === 0,
  "6c.1 with no reported current profession, career_pivot never appears for anyone -- not inferred from Career DNA",
);
ok(
  noCurrentProfession.matches.find((m) => m.professionId === "SP003")?.stage === "explore_now",
  "6c.2 Skyddsvakt keeps its plain stage-distance classification (explore_now, distance -1 -> 0 collapses to explore_now) rather than being guessed into a pivot",
);
ok(
  noCurrentProfession.matches.find((m) => m.professionId === "SP005")?.stage === "explore_now",
  "6c.3 Polis likewise keeps its plain stage-distance classification, not a guessed pivot",
);

// The SAME dims, but the candidate has self-reported their real current
// profession as Skyddsvakt itself. Now pivot classification runs for real:
// Skyddsvakt (where they actually are) stays explore_now, while Polis (a
// genuinely different area, not directly CIG-reachable from Skyddsvakt in
// this fixture) becomes career_pivot.
const withCurrentProfession = matchProfessions(
  HIGH_FLIER,
  CATALOG,
  "developing_current_role",
  "skyddsvakt",
);
const withCurrentProfessionSkyddsvakt = withCurrentProfession.matches.find(
  (m) => m.professionId === "SP003",
);
const withCurrentProfessionPolis = withCurrentProfession.matches.find(
  (m) => m.professionId === "SP005",
);
const withCurrentProfessionCoordinator = withCurrentProfession.matches.find(
  (m) => m.professionId === "SP006",
);

// Item 8: Skyddsvakt is the candidate's own current profession here, so it
// must be excluded from `matches` entirely rather than merely landing in
// stage 'explore_now' -- presenting your own current job as a "next step"
// discovery would violate item 8 even though the pivot math is correct.
ok(
  withCurrentProfessionSkyddsvakt === undefined,
  "6c.4a with current profession = Skyddsvakt (SCA01), Skyddsvakt itself is excluded from `matches` -- never a 'discovery' of the job the candidate already has",
);
ok(
  withCurrentProfession.currentProfessionMatch?.professionId === "SP003" &&
    withCurrentProfession.currentProfessionMatch.stage === "explore_now",
  "6c.4b Skyddsvakt is instead exposed as currentProfessionMatch, stage 'explore now' (not a pivot away from where the candidate actually is)",
);
// Owner Security Manager scenario fix: baseline now derives from Skyddsvakt's
// OWN catalogued career level (entry, rank 0) rather than C1's coarser
// "developing_current_role" answer (which would have wrongly inflated the
// baseline to rank 1 for someone who is concretely, self-reportedly at
// entry level). Polis (also entry, rank 0) is therefore a same-level lateral
// direction -- distance 0, "explore now" -- not a pivot; the OLD C1-only
// baseline wrongly placed it one rank behind. Säkerhetssamordnare
// (developing, rank 1) is now a genuine step UP -- distance +1, "possible
// next step" -- not already-current; the OLD baseline wrongly treated it as
// already at the candidate's level.
ok(
  withCurrentProfessionPolis?.stage === "explore_now",
  "6c.5 Polis (SCA02, entry, SAME rank as the candidate's real entry-level current profession) is explore_now, not a pivot -- entry-level baseline now derives from the known current profession, not C1's coarser guess",
);
ok(
  withCurrentProfessionCoordinator?.stage === "possible_next_step",
  "6c.6 Säkerhetssamordnare (SCA04, developing, one rank above the candidate's real entry-level current profession) is a genuine possible_next_step, not already-current",
);

// =========================================================================
group("6d · CIG-documented transitions are never pivots, even across areas (Mandate item 7)");
// =========================================================================

// Same current profession (Skyddsvakt) and dims, but this time a real CIG
// transition edge is supplied from Skyddsvakt to Polis. A documented next
// step must stay a next step, even though Polis sits in a different career
// area -- area comparison is the fallback, not the primary signal.
const withCigEdge = matchProfessions(
  HIGH_FLIER,
  CATALOG,
  "developing_current_role",
  "skyddsvakt",
  [],
  new Set(["polis"]),
);
const withCigEdgePolis = withCigEdge.matches.find((m) => m.professionId === "SP005");
ok(
  withCigEdgePolis?.stage === "explore_now",
  "6d.1 Polis is NOT a pivot when a real CIG transition edge documents it as reachable from the candidate's current profession, even across career areas",
);
ok(
  !withCigEdge.careerPivots.some((m) => m.professionId === "SP005"),
  "6d.2 Polis does not appear in careerPivots when CIG-documented",
);

// =========================================================================
group("7 · Career changer is not reset to an entry baseline");
// =========================================================================

const changer = matchProfessions(HIGH_FLIER, CATALOG, "changing_career_area");
const changerCoordinator = changer.matches.find((m) => m.professionId === "SP006");
const changerHeadOfSecurity = changer.matches.find((m) => m.professionId === "SP007");

ok(
  changerCoordinator?.stage === "explore_now",
  "7.1 a developing-stage profession is 'explore now' for a career changer, not gated as if they were a novice",
);
ok(
  changerHeadOfSecurity?.stage === "possible_next_step",
  "7.2 a senior-stage profession is 'possible next step', not 'longer term', for a career changer",
);

// =========================================================================
group("8 · Poor fit is excluded outright, at every stage");
// =========================================================================

const poorFit = matchProfessions(POOR_FIT, CATALOG, "exploring_security");
ok(poorFit.matches.length === 0, "8.1 a candidate who fits nothing gets zero matches, not a padded list");
ok(poorFit.available === false, "8.2 available is false when nothing clears the fit floor");

// =========================================================================
group("8b · Discovery Path tags refine Recommendation Priority, never Affinity (Mandate item 1)");
// =========================================================================

const withoutTags = matchProfessions(HIGH_FLIER, CATALOG, "exploring_security");
const withoutTagsCoordinator = withoutTags.matches.find((m) => m.professionId === "SP006");
ok(
  withoutTagsCoordinator?.contextCorroborated === false,
  "8b.1 with no discovery tags, contextCorroborated is false",
);

const withTags = matchProfessions(HIGH_FLIER, CATALOG, "exploring_security", null, [
  "leadership_path",
]);
const withTagsCoordinator = withTags.matches.find((m) => m.professionId === "SP006");
const withTagsSkyddsvakt = withTags.matches.find((m) => m.professionId === "SP003");
ok(
  withTagsCoordinator?.contextCorroborated === true,
  "8b.2 'leadership_path' corroborates Säkerhetssamordnare (SCA04)",
);
ok(
  withTagsSkyddsvakt?.contextCorroborated === false,
  "8b.3 'leadership_path' does NOT corroborate Skyddsvakt (SCA01) -- corroboration is area-specific",
);
ok(
  withTagsCoordinator?.fitTier === withoutTagsCoordinator?.fitTier &&
    withTagsCoordinator?.stage === withoutTagsCoordinator?.stage,
  "8b.4 discovery tags never change fitTier or stage -- Profession Affinity and stage-distance classification are untouched",
);

// Item 1's actual correction: context MUST genuinely move Recommendation
// Priority, not just add an explanation sentence. Verify the raw numbers
// via the diagnostics function: priorityScore must differ from fitScore by
// exactly CONTEXT_PRIORITY_BONUS when corroborated, and Affinity itself
// (fitScore) must be byte-identical whether or not the tag was supplied --
// proving context refines priority on top of an unchanged Affinity, never
// inside it.
const diagWithoutTags = matchProfessionsDiagnostics(HIGH_FLIER, CATALOG, "exploring_security");
const diagWithTags = matchProfessionsDiagnostics(HIGH_FLIER, CATALOG, "exploring_security", null, [
  "leadership_path",
]);
const affinityWithoutTags = diagWithoutTags.diagnostics.find((d) => d.professionId === "SP006");
const affinityWithTags = diagWithTags.diagnostics.find((d) => d.professionId === "SP006");

ok(
  affinityWithoutTags !== undefined &&
    affinityWithTags !== undefined &&
    affinityWithoutTags.fitScore === affinityWithTags.fitScore,
  "8b.5 Profession Affinity (fitScore) is byte-identical with or without the corroborating tag",
);
ok(
  affinityWithTags?.contextPriorityBonus === 6 && affinityWithoutTags?.contextPriorityBonus === 0,
  "8b.6 contextPriorityBonus is 0 without the tag and the documented bonus with it",
);
ok(
  affinityWithTags !== undefined &&
    affinityWithoutTags !== undefined &&
    affinityWithTags.priorityScore === affinityWithTags.fitScore + affinityWithTags.contextPriorityBonus &&
    affinityWithTags.priorityScore > affinityWithoutTags.priorityScore,
  "8b.7 priorityScore = fitScore + contextPriorityBonus, and is strictly higher with the corroborating tag -- Recommendation Priority genuinely moved",
);

// =========================================================================
group("9 · No percentages or raw scores ever reach a ProfessionMatch");
// =========================================================================

for (const m of student.matches) {
  const keys = Object.keys(m);
  ok(!keys.includes("fitScore"), `9.1 ${m.professionId} does not expose fitScore`);
  ok(!keys.includes("score"), `9.2 ${m.professionId} does not expose a raw score`);
  ok(m.fitTier === "strong" || m.fitTier === "moderate", `9.3 ${m.professionId} carries only a qualitative fitTier`);
  ok(
    typeof m.cigProfessionSlug === "string" && m.cigProfessionSlug.length > 0,
    `9.4 ${m.professionId} carries its CIG slug through for live content lookup`,
  );
}

// =========================================================================
group("10 · CID15 never contributes to fit (owner decision A-4)");
// =========================================================================

// A candidate who scores 0 on every dimension EXCEPT CID15, where they score
// 1 — if CID15 mattered to matching, this would inflate fit. It must not.
const cid15Only = makeDims(0, { CID15: 1 });
const cid15Result = matchProfessions(cid15Only, CATALOG, "exploring_security");
ok(
  cid15Result.matches.length === 0,
  "10.1 a candidate who only scores on CID15 matches nothing — CID15 cannot rescue a fit score",
);

// =========================================================================
group("11 · Coverage gating");
// =========================================================================

// A candidate with no evidence at all on Police's dimensions (all null) must
// not be scored against it, honestly reflecting PROFESSION_MIN_COVERAGE.
const noEvidenceDims: DimensionResult = {
  scoringVersion: "fixture",
  dimensions: Object.fromEntries(
    DIMENSION_IDS.map((id) => [
      id,
      {
        dimension: id,
        score: null,
        evidenceWeight: 0,
        dominance: null,
        coverage: 0,
        confidence: "none" as Confidence,
        sources: [],
        tertiaryOnly: false,
      },
    ]),
  ) as DimensionResult["dimensions"],
  answeredItems: [],
  complete: false,
};
const noEvidenceResult = matchProfessions(noEvidenceDims, CATALOG, "exploring_security");
ok(
  noEvidenceResult.matches.length === 0,
  `11.1 zero evidence yields zero matches (coverage floor is ${PROFESSION_MIN_COVERAGE})`,
);

// =========================================================================
// =========================================================================
group("12 · Owner Security Manager scenario — stage baseline derives from known current profession + experience, not C1 alone");
// =========================================================================

// Real defect, found live: a real Säkerhetschef (Head of Security) who
// answered C1 with the generic, honestly-true "I already work in security"
// (working_in_security) and only later, in the separate post-assessment
// step, named their actual current profession (sakerhetschef) and 8+ years
// of experience was STILL being scored against C1's entry baseline --
// working_in_security maps to rank 0. Every entry-level profession then
// computed distance 0 ("explore now", the most prominent tier) while their
// OWN senior role computed distance +2 ("longer-term"). Fixed by
// resolveStageBaseline: prefer the known current profession's own
// catalogued career_stage, refined upward (never downward) by self-reported
// experience, falling back to C1 only when no concrete profession is known.
//
// A realistic MIXED profile: genuine leadership/strategic affinity (Head of
// Security's own central dimensions) PLUS genuine operational affinity
// (Skyddsvakt's central dimensions) -- exactly the "real DNA evidence must
// not be hidden, only reinterpreted" case §5 requires.
const SECURITY_MANAGER_DIRECTION = makeDims(0.5, {
  CID02: 0.85, // leadership orientation -- central for Head of Security
  CID05: 0.8, // strategic orientation -- central for Head of Security
  CID07: 0.85, // communication -- central for both Head of Security and Coordinator
  CID13: 0.8, // collaboration -- central for both Head of Security and Coordinator
  CID01: 0.75, // operational orientation -- central for Skyddsvakt
  CID06: 0.8, // risk awareness -- central for Skyddsvakt
  CID12: 0.7, // independent decision-making -- central for Skyddsvakt
  CID16: 0.75, // composure under pressure -- central for Skyddsvakt
});

// --- A: working_in_security + Security Manager (sakerhetschef) + 8+ years ---
const scenarioA = matchProfessionsDiagnostics(
  SECURITY_MANAGER_DIRECTION,
  CATALOG,
  "working_in_security",
  "sakerhetschef",
  [],
  new Set(),
  "8_plus_y",
);
const scenarioA_noContext = matchProfessionsDiagnostics(
  SECURITY_MANAGER_DIRECTION,
  CATALOG,
  "working_in_security",
);
// Proof: Profession Affinity (fitScore) is IDENTICAL whether or not current
// profession/experience is supplied -- context/current-role/experience can
// only ever change stage/priority interpretation, never Career DNA or
// Affinity itself.
const affinityWithContext = new Map(scenarioA.diagnostics.map((d) => [d.professionId, d.fitScore]));
const affinityWithoutContext = new Map(
  scenarioA_noContext.diagnostics.map((d) => [d.professionId, d.fitScore]),
);
ok(
  [...affinityWithContext.entries()].every(([id, score]) => affinityWithoutContext.get(id) === score),
  "A.1 Profession Affinity (fitScore) is byte-identical with vs without current profession + experience -- Career DNA and Affinity are untouched",
);
const aSkyddsvakt = scenarioA.result.matches.find((m) => m.professionId === "SP003");
const aCoordinator = scenarioA.result.matches.find((m) => m.professionId === "SP006");
ok(
  scenarioA.result.currentProfessionMatch?.professionId === "SP007",
  "A.2 Säkerhetschef (the candidate's own current profession) is exposed as currentProfessionMatch",
);
ok(
  !scenarioA.result.matches.some((m) => m.professionId === "SP007"),
  "A.3 Säkerhetschef never appears in `matches` -- never presented as a new discovery (item 8)",
);
ok(
  aSkyddsvakt?.stage === "career_pivot",
  "A.4 Skyddsvakt (entry, different area, genuine operational DNA affinity) is a career_pivot -- real affinity shown honestly, but NOT the natural primary next direction from a senior Security Manager",
);
ok(
  aCoordinator?.stage === "explore_now",
  "A.5 Säkerhetssamordnare (developing, same area SCA04, one rank below the resolved senior baseline) is explore_now -- a same-track role already within reach, not hidden",
);

// --- B: security_leader + Security Manager (sakerhetschef) + 8+ years ---
// C1 alone already maps security_leader -> senior (rank 2), so this proves
// the fix does not change already-correct behaviour when C1 happens to
// agree with the known profession -- same result as A.
const scenarioB = matchProfessionsDiagnostics(
  SECURITY_MANAGER_DIRECTION,
  CATALOG,
  "security_leader",
  "sakerhetschef",
  [],
  new Set(),
  "8_plus_y",
);
const bSkyddsvakt = scenarioB.result.matches.find((m) => m.professionId === "SP003");
ok(
  bSkyddsvakt?.stage === "career_pivot" &&
    scenarioB.result.currentProfessionMatch?.professionId === "SP007",
  "B.1 security_leader + Säkerhetschef + 8+ years yields the same, already-correct result as A (Skyddsvakt career_pivot, Säkerhetschef excluded from matches)",
);

// --- C: working_in_security + entry-level current profession + 1-3 years ---
// Väktare itself is not in this trimmed fixture catalogue (see the file
// header) -- Skyddsvakt (also SCA01, entry, real regulated frontline guard
// role) stands in as an honest entry-level current profession.
const scenarioC = matchProfessions(
  SECURITY_MANAGER_DIRECTION,
  CATALOG,
  "working_in_security",
  "skyddsvakt",
  [],
  new Set(),
  "1_3y",
);
const cCoordinator = scenarioC.matches.find((m) => m.professionId === "SP006");
const cHeadOfSecurity = scenarioC.matches.find((m) => m.professionId === "SP007");
ok(
  scenarioC.currentProfessionMatch?.professionId === "SP003",
  "C.1 Skyddsvakt (the candidate's own current profession) is exposed as currentProfessionMatch, not a new discovery",
);
ok(
  cCoordinator?.stage === "possible_next_step",
  "C.2 an entry-level current profession + 1-3 years still resolves an entry baseline (unchanged from before the fix) -- Säkerhetssamordnare is a genuine possible_next_step, not falsely promoted to explore_now",
);
ok(
  cHeadOfSecurity?.stage === "longer_term",
  "C.3 Säkerhetschef stays longer_term for a genuinely entry-level candidate -- experience alone (1-3 years) never inflates an entry profession's own rank",
);

// --- D: developing_current_role + Security Coordinator + 8+ years ---
// The candidate's OWN profession (Säkerhetssamordnare) is "developing"
// (rank 1), but 8+ years of real tenure refines the baseline UP to senior
// (rank 2) -- exactly §4's "experience MAY refine stage when combined with
// a known current profession."
const scenarioD = matchProfessions(
  SECURITY_MANAGER_DIRECTION,
  CATALOG,
  "developing_current_role",
  "sakerhetssamordnare",
  [],
  new Set(),
  "8_plus_y",
);
const dHeadOfSecurity = scenarioD.matches.find((m) => m.professionId === "SP007");
const dSkyddsvakt = scenarioD.matches.find((m) => m.professionId === "SP003");
ok(
  scenarioD.currentProfessionMatch?.professionId === "SP006",
  "D.1 Säkerhetssamordnare (the candidate's own current profession) is exposed as currentProfessionMatch",
);
ok(
  dHeadOfSecurity?.stage === "explore_now",
  "D.2 8+ years in a developing-level role refines the baseline to senior, so Säkerhetschef (same area SCA04) is explore_now, not merely possible_next_step -- experience has real, material effect on pathway interpretation",
);
ok(
  dSkyddsvakt?.stage === "career_pivot",
  "D.3 Skyddsvakt (different area, genuine operational affinity) is still honestly a career_pivot, not hidden and not promoted to a primary direction",
);

// --- E: current profession unknown ---
// Item 2, reconfirmed under this exact fix: with no current profession
// reported, baseline falls back to C1 alone, byte-identical to behaviour
// before this fix existed -- experience is deliberately never used
// standalone (§4: only "when combined with known current profession").
const scenarioE_withExperience = matchProfessions(
  SECURITY_MANAGER_DIRECTION,
  CATALOG,
  "working_in_security",
  null,
  [],
  new Set(),
  "8_plus_y",
);
const scenarioE_withoutExperience = matchProfessions(
  SECURITY_MANAGER_DIRECTION,
  CATALOG,
  "working_in_security",
);
ok(
  scenarioE_withExperience.currentProfessionMatch === null,
  "E.1 current profession unknown -> currentProfessionMatch stays null, no fabricated YOU ARE HERE",
);
ok(
  scenarioE_withExperience.careerPivots.length === 0,
  "E.2 current profession unknown -> career_pivot never computed at all, even with experience supplied (item 2: unknown stays unknown)",
);
ok(
  JSON.stringify(scenarioE_withExperience.matches) ===
    JSON.stringify(scenarioE_withoutExperience.matches),
  "E.3 experience band alone, with no known current profession, changes NOTHING -- byte-identical result with vs without it (§4: refines only when combined with a known profession)",
);

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-v31-professions-check: all ${checks} checks passed.`);
