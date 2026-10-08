// Compile-only negative contracts. Never a runtime activation seam.
import type {
  RecruiterAiContext,
  RecruiterAiOutput,
  RecruiterAiRequest,
} from "../src/lib/recruitment/ai/contract";
import { requireRecruiterAiDisabled } from "../src/lib/recruitment/ai/contract";
import type {
  SyntheticExercise,
  SyntheticResult,
} from "../src/lib/recruitment/ai/synthetic-sandbox.server";

function reviewedTypeContracts(
  c: RecruiterAiContext,
  out: RecruiterAiOutput,
  request: RecruiterAiRequest,
  exercise: SyntheticExercise,
  result: SyntheticResult,
): void {
  // @ts-expect-error a candidate is not an employer application reader
  c.role = "candidate";
  // @ts-expect-error context is pinned to the exact output schema contract
  c.pins.schemaVersion = "unknown-schema";
  // @ts-expect-error providers cannot assert human review
  out.reviewState = "reviewed";
  // @ts-expect-error human review cannot be disabled by output
  out.humanReviewRequired = false;
  // @ts-expect-error candidate scoring is not a task
  request.task = "candidate_ranking";
  // @ts-expect-error synthetic harness cannot be declared a production exercise
  exercise.mode = "production";
  // @ts-expect-error no environment or request toggle exists on the hard gate
  requireRecruiterAiDisabled("source_summary", true);
  if (out.task === "criterion_linking") {
    // @ts-expect-error AI cannot decide that a mandatory requirement is met
    out.links[0].relation = "met";
  }
  if (result.status === "proposal") {
    // @ts-expect-error structurally valid source citation is not semantic truth
    result.semanticSupport = "verified_true";
  }
}
void reviewedTypeContracts;
