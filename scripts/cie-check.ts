// Career Intelligence Engine v1 — deterministic test harness.
//
// Runs pure-function checks against the CIE v1 engine using the existing
// assessment personas. No test framework, no CIG round-trip — this
// executes in the sandbox with `bun run scripts/cie-check.ts` and exits
// non-zero on failure.
//
// Covered:
//   - Determinism: identical answers -> byte-identical envelope + hash.
//   - Career profile: archetype ordering matches expectations per persona.
//   - Current Fit vs Potential: student persona shows Potential > CurrentFit
//     for at least one appropriate family.
//   - Evidence Score monotonicity: adding an extra answered question does
//     not decrease Evidence Score for the same base profile.
//   - Regression: expected top family from `test-personas.ts` appears in
//     the CIE v1 family ranking top-3 (relaxed to top-3 because the
//     diversity guard can promote runner-up families).
//   - Regulated profession disclaimer: regulated matches carry the
//     `regulated_notice` explanation.

import { testPersonas } from "@/lib/career-assessment/test-personas";
import { computeEngineResultV1, hashInputs } from "@/lib/career-intelligence-engine";
import type { EngineResultV1 } from "@/lib/career-intelligence-engine";

const NOW = "2026-07-17T00:00:00.000Z";
const fixedClock = () => NOW;

let failed = 0;

function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("  FAIL:", msg);
  }
}

function run() {
  console.log(`CIE v1 harness — ${testPersonas.length} personas`);

  for (const persona of testPersonas) {
    const a: EngineResultV1 = computeEngineResultV1({
      answers: persona.answers,
      options: { topN: 3, now: fixedClock },
    });
    const b: EngineResultV1 = computeEngineResultV1({
      answers: persona.answers,
      options: { topN: 3, now: fixedClock },
    });

    console.log(`\n[${persona.id}] ${persona.name.en}`);
    console.log(
      `  matches: ${a.matches.map((m) => `${m.professionKey}(cf=${m.currentFit},pot=${m.potential})`).join(", ")}`,
    );
    console.log(
      `  topFamily: ${a.familyRanking[0]?.familyKey} (cf=${a.familyRanking[0]?.currentFit})`,
    );

    // Determinism.
    assert(
      JSON.stringify(a) === JSON.stringify(b),
      `${persona.id}: envelope not deterministic`,
    );
    assert(
      a.inputsHash === b.inputsHash,
      `${persona.id}: inputsHash unstable`,
    );
    assert(
      a.inputsHash === hashInputs(persona.answers),
      `${persona.id}: hashInputs mismatch`,
    );

    // At least one match.
    assert(a.matches.length > 0, `${persona.id}: no matches produced`);

    // Canonical-identity uniqueness — no profession appears twice in the
    // same report (Phase 2 final pass, section A). Deduplication is based
    // on canonical identity, NOT on translated display title: two genuinely
    // distinct canonical professions may legitimately share the same
    // translated title (see fixture test below).
    const canonicalIds = a.matches.map(
      (m) => m.cigSlug || m.legacySlug || m.professionKey,
    );
    const uniqueCanonical = new Set(canonicalIds);
    assert(
      uniqueCanonical.size === canonicalIds.length,
      `${persona.id}: duplicate canonical profession in matches — ${canonicalIds.join(", ")}`,
    );
    const uniqueKeys = new Set(a.matches.map((m) => m.professionKey));
    assert(
      uniqueKeys.size === a.matches.length,
      `${persona.id}: duplicate professionKey in matches`,
    );
    // NOTE: intentionally no uniqueness check on titleSv/titleEn. Distinct
    // canonical professions can share a translated title; the UI is
    // responsible for adding distinguishing context (family, level,
    // specialization). Removing this rule fixes the false-positive regression
    // that was flagging legitimate title collisions as dedup failures.

    // Expected-family regression (relaxed to top-3 families).
    const topFamilies = a.familyRanking.slice(0, 3).map((f) => f.familyKey);
    const matchesExpectation = persona.expectedTopFamilies.some((f) =>
      topFamilies.includes(f),
    );
    assert(
      matchesExpectation,
      `${persona.id}: none of expectedTopFamilies ${persona.expectedTopFamilies.join("/")} appear in top-3 ${topFamilies.join("/")}`,
    );

    // Regulated matches carry a regulated_notice explanation.
    for (const m of a.matches) {
      if (m.regulated) {
        const hasNotice = m.reason.some((r) => r.kind === "regulated_notice");
        assert(
          hasNotice,
          `${persona.id}: regulated match ${m.professionKey} missing regulated_notice`,
        );
      }
    }
  }

  // Student persona: Potential > CurrentFit for at least one match.
  const student = testPersonas.find((p) => p.id === "E_student_exploring")!;
  const studentResult = computeEngineResultV1({
    answers: student.answers,
    options: { topN: 3, now: fixedClock },
  });
  const hasUpside = studentResult.matches.some((m) => m.potential > m.currentFit);
  assert(
    hasUpside,
    "student persona: no match shows Potential > Current Fit (development upside missing)",
  );

  // Evidence Score monotonicity — adding an answer should not decrease evidence.
  const base = testPersonas.find((p) => p.id === "I_incomplete")!;
  const baseResult = computeEngineResultV1({
    answers: base.answers,
    options: { topN: 3, now: fixedClock },
  });
  const augmented = { ...base.answers, q5: 4 };
  const augResult = computeEngineResultV1({
    answers: augmented,
    options: { topN: 3, now: fixedClock },
  });
  assert(
    augResult.overallEvidenceScore >= baseResult.overallEvidenceScore,
    `evidence monotonicity failed: base=${baseResult.overallEvidenceScore} augmented=${augResult.overallEvidenceScore}`,
  );

  // Fixture: two DISTINCT canonical professions that happen to share the
  // same translated title must both remain in the ranked comparison and be
  // distinguishable by family/legacySlug. We synthesize this by injecting
  // two hand-built target vectors sharing titleSv/titleEn but with different
  // legacySlug/cigSlug/familyKey, and confirm the engine keeps both.
  {
    const { buildTargetVectorsFromLegacy } = require("@/lib/career-intelligence-engine/target-vector") as typeof import("@/lib/career-intelligence-engine/target-vector");
    const baseTargets = buildTargetVectorsFromLegacy();
    // Pick two targets from different families so the injected enrichment
    // collision cannot accidentally collapse them.
    const t1 = baseTargets.find((t) => t.familyKey);
    const t2 = baseTargets.find(
      (t) => t.familyKey && t.familyKey !== t1?.familyKey,
    );
    if (t1 && t2) {
      const sharedTitle = { titleSv: "Delad titel", titleEn: "Shared title" };
      const enrichmentByLegacySlug: Record<string, any> = {
        [t1.legacySlug]: {
          disclaimer: null,
          formalRequirements: [],
          relatedProfessions: [],
          transitions: [],
          educationPathways: [],
          certifications: [],
          sources: [],
          sourceCoverage: 0,
          ...sharedTitle,
        },
        [t2.legacySlug]: {
          disclaimer: null,
          formalRequirements: [],
          relatedProfessions: [],
          transitions: [],
          educationPathways: [],
          certifications: [],
          sources: [],
          sourceCoverage: 0,
          ...sharedTitle,
        },
      };
      const anyPersona = testPersonas[0];
      const shared = computeEngineResultV1({
        answers: anyPersona.answers,
        targets: [t1, t2],
        enrichmentByLegacySlug,
        options: { topN: 3, now: fixedClock },
      });
      assert(
        shared.matches.length === 2,
        `shared-title fixture: expected 2 matches, got ${shared.matches.length}`,
      );
      const canonicals = new Set(
        shared.matches.map((m) => m.cigSlug || m.legacySlug || m.professionKey),
      );
      assert(
        canonicals.size === 2,
        `shared-title fixture: canonical identities not both preserved (${[...canonicals].join(", ")})`,
      );
      assert(
        shared.matches.every((m) => m.titleSv === sharedTitle.titleSv),
        `shared-title fixture: shared titleSv not preserved on both matches`,
      );
    }
  }

  console.log("\n----");
  if (failed === 0) {
    console.log("CIE v1 harness: PASS");
    process.exit(0);
  } else {
    console.log(`CIE v1 harness: FAILED (${failed} assertion(s))`);
    process.exit(1);
  }
}

run();
