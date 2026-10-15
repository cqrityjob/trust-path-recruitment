// Which words name a notice in the inbox. A decision notice follows its
// verification method: only a CQrityjob document review may be called one
// (review 2026-10-15, RF8). Pure; checked by scripts/talent-discovery-check.ts.
export function noticeLabelKey(n: { kind: string; verificationMethod?: string | null }): string {
  if (n.kind === "passport_decision_approved") {
    if (n.verificationMethod === "document_review")
      return "notices.kind.passport_decision_approved";
    if (n.verificationMethod === "employer_confirmation")
      return "notices.kind.passport_decision_employer_confirmed";
    return "notices.kind.passport_decision_approved_other";
  }
  return `notices.kind.${n.kind}`;
}

/** The words for an approval in an entry's current state and case history.
 * Every approval reads "Approved" (the status word of the request list and
 * the review queue), qualified by how it was verified: only a CQrityjob
 * document review is called one (RF8, the same rule as the inbox and mail). */
export function approvalLabelKey(
  method: string | null | undefined,
):
  | "ver.approved.document_review"
  | "ver.approved.employer_confirmation"
  | "ver.approved.issuer_confirmation"
  | "ver.status.approved" {
  if (method === "document_review") return "ver.approved.document_review";
  if (method === "employer_confirmation") return "ver.approved.employer_confirmation";
  if (method === "issuer_confirmation") return "ver.approved.issuer_confirmation";
  return "ver.status.approved";
}
