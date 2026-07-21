// Question Library / Competency Library — deterministic consistency harness.
//
// Runs in the sandbox with `bun run scripts/question-library-check.ts` and
// exits non-zero on failure. Covered:
//   - Every QuestionAsset's competency slugs resolve in the Competency
//     Library registry, and every asset's declared `dimensions` are a subset
//     of the union of its competencies' declared dimensions
//     (Competency Library `validate.ts`).
//   - `assembleQuestionSet('public-career-assessment', profileId)` produces
//     exactly 16 unique question ids for each of the 3 profiles.
//   - The `security-guard-foundation` shared assets (sgf-*) still resolve to
//     the original q3/q5/q7/q9/q10/q14/q15/q16 content/mapping objects
//     byte-for-byte (no accidental copy/drift).

import { questions as legacyQuestions } from "@/lib/assessment-content";
import { questionMappingById } from "@/lib/career-assessment/question-mappings";
import { ALL_ASSETS } from "@/lib/question-library/registry";
import { assembleQuestionSet } from "@/lib/question-library/query";
import type { AssessmentProfileId } from "@/lib/question-library/types";
import { validateAssetCompetencies } from "@/lib/competency-library/validate";
import { questionLibraryPersonas } from "@/lib/question-library/test-personas";
import { computeEngineResultV1 } from "@/lib/career-intelligence-engine";

let failed = 0;

function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("  FAIL:", msg);
  }
}

function run() {
  console.log(`Question Library harness — ${ALL_ASSETS.length} assets`);

  // Competency consistency.
  const issues = validateAssetCompetencies(
    ALL_ASSETS.map((a) => ({ id: a.id, competencies: a.competencies, dimensions: a.dimensions })),
  );
  for (const issue of issues) {
    failed += 1;
    console.error(`  FAIL: [${issue.assetId}] ${issue.message}`);
  }
  assert(issues.length === 0, `${issues.length} competency-consistency issue(s) found`);

  // Assembly: exactly 16 unique questions per profile.
  const profiles: AssessmentProfileId[] = [
    "student_or_new",
    "security_professional",
    "career_changer",
  ];
  for (const profileId of profiles) {
    const { questions, mappings } = assembleQuestionSet("public-career-assessment", profileId);
    assert(questions.length === 16, `${profileId}: expected 16 questions, got ${questions.length}`);
    assert(mappings.length === 16, `${profileId}: expected 16 mappings, got ${mappings.length}`);
    const uniqueIds = new Set(questions.map((q) => q.id));
    assert(
      uniqueIds.size === 16,
      `${profileId}: expected 16 unique question ids, got ${uniqueIds.size}`,
    );
    const mappedIds = new Set(mappings.map((m) => m.questionId));
    assert(
      questions.every((q) => mappedIds.has(q.id)),
      `${profileId}: every assembled question must have a matching mapping`,
    );
    console.log(
      `  [${profileId}] ${questions.length} questions: ${questions.map((q) => q.id).join(", ")}`,
    );
  }

  // security-guard-foundation shared assets resolve to the exact legacy objects.
  const sgfSourceIds = ["q3", "q5", "q7", "q9", "q10", "q14", "q15", "q16"];
  for (const id of sgfSourceIds) {
    const legacyQ = legacyQuestions.find((q) => q.id === id);
    const legacyM = questionMappingById[id];
    const asset = ALL_ASSETS.find(
      (a) => a.content.id === id && a.tags.includes("profile:security_professional"),
    );
    assert(
      !!asset,
      `security-guard-foundation: no shared asset found referencing legacy question ${id}`,
    );
    if (asset) {
      assert(
        asset.content === legacyQ,
        `security-guard-foundation: asset for ${id} does not reference the exact legacy Question object`,
      );
      assert(
        asset.mapping === legacyM,
        `security-guard-foundation: asset for ${id} does not reference the exact legacy QuestionMapping object`,
      );
    }
  }

  // Regression personas for the two new profiles (student_or_new, career_changer).
  console.log(`\nQuestion Library personas — ${questionLibraryPersonas.length} personas`);
  for (const persona of questionLibraryPersonas) {
    const { questions: assembledQuestions, mappings } = assembleQuestionSet(
      "public-career-assessment",
      persona.profileId,
    );
    const questionSet = {
      questions: assembledQuestions,
      mappingById: Object.fromEntries(mappings.map((m) => [m.questionId, m])),
    };
    const result = computeEngineResultV1({
      answers: persona.answers,
      questionSet,
      options: { topN: 5 },
    });
    assert(result.matches.length > 0, `${persona.id}: no matches produced`);
    const hasUpside = result.matches.some((m) => m.potential > m.currentFit);
    if (persona.expectPotentialAboveCurrentFit) {
      assert(
        hasUpside,
        `${persona.id}: expected at least one match with Potential > Current Fit (development upside), found none`,
      );
    }
    console.log(
      `  [${persona.id}] top: ${result.matches[0]?.professionKey} (cf=${result.matches[0]?.currentFit}, pot=${result.matches[0]?.potential}) hasUpside=${hasUpside}`,
    );
  }

  console.log("\n----");
  if (failed === 0) {
    console.log("Question Library harness: PASS");
    process.exit(0);
  } else {
    console.log(`Question Library harness: FAILED (${failed} assertion(s))`);
    process.exit(1);
  }
}

run();
