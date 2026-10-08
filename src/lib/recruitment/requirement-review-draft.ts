import type { RequirementReview, RequirementDecision } from "./requirement-intelligence";

/** The submitted snapshot is the original for a structured CV. Its presence
 * must never dispatch a Storage signer or silently fall back to a file. */
export async function openApplicationOriginalCv(
  original: { hasUploadedCv: boolean; submittedSource: "upload" | "cqrityjob_cv" | null },
  actions: { openFile: () => Promise<void>; openSnapshot: () => Promise<void> },
) {
  // This candidate read model's hasCv flag means an uploaded path. Its
  // structured-CV query is deliberately disabled on the uploaded branch.
  if (original.hasUploadedCv) return actions.openFile();
  if (original.submittedSource === "cqrityjob_cv") return actions.openSnapshot();
  throw new Error("ORIGINAL_CV_UNAVAILABLE");
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
