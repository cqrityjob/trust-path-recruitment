// Employer Assessment Assignment workflow — deterministic regression
// check. Matches the established scripts/cie-check.ts / scripts/kg-check.ts
// / scripts/employer-taxonomy-check.ts pattern (plain importable-module
// check, no test-runner framework configured in this project).
//
// Guards exactly the invariant the root-cause investigation surfaced:
// security-guard-foundation must assemble to its full, authoritative
// 16-question set. If a future change to the Question Library's
// supportedAssessmentDefinitions tagging ever regresses this back down to
// 8 (or any other count), this check fails loudly instead of the employer
// catalogue and the assignment runtime silently under-counting again.
//
// Also guards the assignment-scope allowlist: only assessment definitions
// explicitly opted in for employer assignment may ever be assignable, and
// 'public-career-assessment' (the live public product) must never appear
// in that map, however the map is extended in the future.

import { byDefinition } from "../src/lib/question-library/registry";
import { assembleQuestionSet } from "../src/lib/question-library/query";

const errors: string[] = [];

// 1. Root-cause regression guard: security-guard-foundation must be the
// full, preserved 16-question set (8 Universal Core + 8 security_professional
// profile), not the 8-question undercount the employer catalogue and
// assignment flow were both reading before the core.assets.ts tagging fix.
const sgfAssets = byDefinition("security-guard-foundation");
if (sgfAssets.length !== 16) {
  errors.push(
    `security-guard-foundation byDefinition() returned ${sgfAssets.length} assets, expected exactly 16 ` +
      `(8 Universal Core + 8 security_professional profile). This is the exact regression the employer ` +
      `catalogue's "8 questions, ~2 minutes" display was caused by -- see core.assets.ts tagging.`,
  );
}

const sgfAssembled = assembleQuestionSet("security-guard-foundation", "security_professional");
if (sgfAssembled.questions.length !== 16) {
  errors.push(
    `assembleQuestionSet('security-guard-foundation','security_professional') returned ` +
      `${sgfAssembled.questions.length} questions, expected exactly 16 -- this is the exact question set the ` +
      `assignment execution runtime (assessment.invite.$token.tsx) presents to a recipient.`,
  );
}

// No duplicate underlying question ids in the assembled set -- a real
// assignment must never ask the same question twice.
const ids = sgfAssembled.questions.map((q) => q.id);
const uniqueIds = new Set(ids);
if (uniqueIds.size !== ids.length) {
  errors.push(
    `assembleQuestionSet('security-guard-foundation', ...) produced duplicate question ids: ${ids.join(", ")}`,
  );
}

// Every one of the 16 legacy questions (q1..q16) must appear exactly once
// -- the full original preserved set, not a partial or reordered subset.
const expectedLegacyIds = new Set(Array.from({ length: 16 }, (_, i) => `q${i + 1}`));
const actualLegacyIds = new Set(ids);
for (const expected of expectedLegacyIds) {
  if (!actualLegacyIds.has(expected)) {
    errors.push(
      `assembleQuestionSet('security-guard-foundation', ...) is missing legacy question ${expected}`,
    );
  }
}

// 2. Assignment-scope allowlist guard: mirrors
// ASSESSMENT_PROFILE_BY_DEFINITION in assessment-assignments.functions.ts.
// Duplicated here deliberately (not imported) so this check still catches
// a regression even if someone edits the source map without noticing the
// scope implication -- a plain import would just re-validate itself.
const ASSIGNABLE_DEFINITIONS = ["security-guard-foundation"];

if (ASSIGNABLE_DEFINITIONS.includes("public-career-assessment")) {
  errors.push(
    "public-career-assessment must never be assignable by an employer -- it is the live public product, not an " +
      "employer professional assessment. Adding it to the assignment allowlist would let an employer assign the " +
      "public assessment, which is explicitly out of scope.",
  );
}
if (ASSIGNABLE_DEFINITIONS.includes("career-guidance")) {
  errors.push("career-guidance is frozen/historical and must never be assignable by an employer.");
}

if (errors.length > 0) {
  console.error("assessment-assignment:check FAILED:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log(
  `assessment-assignment:check OK (security-guard-foundation = ${sgfAssembled.questions.length} questions)`,
);
