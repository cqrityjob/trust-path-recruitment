import type { BaselineQuestion } from "./content/baseline-v1";
import type { AnswerMap } from "./maturity";
import type { Gap, SecurityDomainId } from "./types";

export type PotentialGap = {
  questionId: string;
  domain: SecurityDomainId;
  answer: "no" | "partly";
  /** Suggested impact. The user decides the recorded impact. */
  suggestedImpact: "high" | "medium" | "low";
  level: 2 | 3 | 4;
};

/**
 * A baseline answer of "no" or "partly" is a potential gap. It is derived,
 * never written: the user records it as a gap (and later an action) when
 * they decide to. A question already recorded as a gap for this baseline is
 * not listed again.
 */
export function potentialGapsFromBaseline(
  questions: BaselineQuestion[],
  answers: AnswerMap,
  recorded: Pick<Gap, "baseline_id" | "baseline_question_id">[],
  baselineId: string | null,
): PotentialGap[] {
  const taken = new Set(
    recorded
      .filter((gap) => gap.baseline_id === baselineId && gap.baseline_question_id)
      .map((gap) => gap.baseline_question_id as string),
  );
  return questions.flatMap((question) => {
    const answer = answers[question.id];
    if ((answer !== "no" && answer !== "partly") || taken.has(question.id)) return [];
    return [
      {
        questionId: question.id,
        domain: question.domain,
        answer,
        level: question.level,
        // A missing basic (level 2) control hurts more than a missing
        // optimisation; "partly" is one step milder than "no".
        suggestedImpact:
          question.level === 2
            ? answer === "no"
              ? "high"
              : "medium"
            : question.level === 3
              ? answer === "no"
                ? "medium"
                : "low"
              : "low",
      },
    ];
  });
}

export const OPEN_GAP_STATUSES = ["open", "in_progress"] as const;
export function gapIsOpen(gap: Pick<Gap, "status">) {
  return (OPEN_GAP_STATUSES as readonly string[]).includes(gap.status);
}
/** A gap is "addressed" when it is resolved or accepted, or when an action
 * that is not cancelled refers to it. */
export function gapHasAction(
  gap: Pick<Gap, "id">,
  actions: { gap_id: string | null; status: string }[],
) {
  return actions.some((action) => action.gap_id === gap.id && action.status !== "cancelled");
}
