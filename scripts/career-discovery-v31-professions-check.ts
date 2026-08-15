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

function band(dimensionId: DimensionId, bandLow: number, bandHigh: number, weight: number) {
  return { dimensionId, bandLow, bandHigh, weight };
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
    band("CID01", 0.7, 1.0, 0.25),
    band("CID02", 0.3, 0.7, 0.25),
    band("CID03", 0.4, 0.8, 0.25),
    band("CID04", 0.1, 0.5, 0.25),
    band("CID05", 0.2, 0.6, 0.25),
    band("CID06", 0.7, 1.0, 0.25),
    band("CID07", 0.6, 1.0, 0.25),
    band("CID08", 0.55, 0.9, 0.6),
    band("CID09", 0.6, 0.9, 0.8),
    band("CID10", 0.3, 0.7, 0.25),
    band("CID11", 0.5, 0.9, 0.25),
    band("CID12", 0.6, 0.9, 0.7),
    band("CID13", 0.6, 1.0, 0.25),
    band("CID14", 0.5, 0.9, 0.25),
    band("CID15", 0.2, 0.8, 0),
    band("CID16", 0.6, 0.95, 0.85),
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
    band("CID01", 0.6, 1.0, 0.25),
    band("CID02", 0.2, 0.6, 0.25),
    band("CID03", 0.3, 0.7, 0.25),
    band("CID04", 0.2, 0.6, 0.25),
    band("CID05", 0.1, 0.5, 0.25),
    band("CID06", 0.65, 0.95, 0.9),
    band("CID07", 0.5, 0.9, 0.25),
    band("CID08", 0.5, 0.9, 0.25),
    band("CID09", 0.5, 0.9, 0.25),
    band("CID10", 0.2, 0.6, 0.25),
    band("CID11", 0.6, 0.9, 0.8),
    band("CID12", 0.6, 0.9, 0.7),
    band("CID13", 0.5, 0.9, 0.25),
    band("CID14", 0.4, 0.8, 0.25),
    band("CID15", 0.2, 0.8, 0),
    band("CID16", 0.55, 0.9, 0.6),
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
    band("CID01", 0.3, 0.7, 0.25),
    band("CID02", 0.55, 0.9, 0.7),
    band("CID03", 0.6, 1.0, 0.25),
    band("CID04", 0.4, 0.8, 0.25),
    band("CID05", 0.7, 1.0, 0.25),
    band("CID06", 0.7, 1.0, 0.25),
    band("CID07", 0.6, 0.9, 0.85),
    band("CID08", 0.4, 0.8, 0.25),
    band("CID09", 0.5, 0.9, 0.25),
    band("CID10", 0.3, 0.7, 0.25),
    band("CID11", 0.6, 0.9, 0.8),
    band("CID12", 0.6, 1.0, 0.25),
    band("CID13", 0.6, 0.9, 0.7),
    band("CID14", 0.6, 1.0, 0.25),
    band("CID15", 0.2, 0.8, 0),
    band("CID16", 0.6, 1.0, 0.25),
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
    band("CID01", 0.3, 0.7, 0.25),
    band("CID02", 0.65, 0.95, 0.95),
    band("CID03", 0.6, 1.0, 0.25),
    band("CID04", 0.4, 0.8, 0.25),
    band("CID05", 0.6, 0.95, 0.9),
    band("CID06", 0.7, 1.0, 0.25),
    band("CID07", 0.6, 0.9, 0.7),
    band("CID08", 0.4, 0.8, 0.25),
    band("CID09", 0.5, 0.9, 0.25),
    band("CID10", 0.3, 0.7, 0.25),
    band("CID11", 0.7, 1.0, 0.25),
    band("CID12", 0.6, 1.0, 0.25),
    band("CID13", 0.6, 0.9, 0.6),
    band("CID14", 0.6, 1.0, 0.25),
    band("CID15", 0.2, 0.8, 0),
    band("CID16", 0.6, 1.0, 0.25),
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
const developingSkyddsvakt = developing.matches.find((m) => m.professionId === "SP003");

ok(
  developingHeadOfSecurity?.stage === "possible_next_step",
  "6.1 Head of Security is 'possible next step' (one stage up) for developing_current_role, not 'longer term'",
);
ok(
  developingSkyddsvakt?.stage === "explore_now",
  "6.2 an entry-stage profession stays 'explore now' even for a more advanced baseline",
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
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-v31-professions-check: all ${checks} checks passed.`);
