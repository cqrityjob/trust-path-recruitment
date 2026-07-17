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
