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
