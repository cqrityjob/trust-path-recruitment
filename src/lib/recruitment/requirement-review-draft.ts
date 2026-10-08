import type { RequirementReview, RequirementDecision } from "./requirement-intelligence";

/** The submitted snapshot is the original for a structured CV. Its presence
 * must never dispatch a Storage signer or silently fall back to a file. */
export async function openSubmittedCvSource(
  source: "upload" | "cqrityjob_cv",
  actions: { openFile: () => Promise<void>; openSnapshot: () => Promise<void> },
) {
  await (source === "cqrityjob_cv" ? actions.openSnapshot() : actions.openFile());
}

export const decisionsFromReview = (review: RequirementReview): RequirementDecision[] =>
  review.criteria.map((c) => ({
    requirementId: c.requirementId,
    state: c.state,
    sourceKind: c.source?.kind ?? null,
    sourceReference: c.source?.reference ?? null,
    sourceVersion: c.source?.version ?? null,
    sourceLabel: c.source?.label ?? null,
    validUntil: c.validUntil,
    note: c.note ?? "",
    neutralQuestion: c.neutralQuestion ?? null,
  }));
