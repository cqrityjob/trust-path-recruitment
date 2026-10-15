// Which words name a notice in the inbox. A decision notice says what the
// decision SUPPORTS, never more: the database already names it by the
// provenance model (sp_decision_trust), and this refuses anything stronger
// the model does not allow -- an employer confirmation is only ever of an
// employment, and no notice says an issuer confirmed anything (review
// 2026-10-15, RF8, and Astra's recheck). Pure; checked by
// scripts/talent-discovery-check.ts.

/** What a decision notice may say the decision supports. */
export function noticeDecisionBasis(n: {
  verificationMethod?: string | null;
  subjectType?: string | null;
}): "document_reviewed" | "employer_confirmed" | "unstated" {
  if (n.verificationMethod === "document_review") return "document_reviewed";
  if (n.verificationMethod === "employer_confirmation" && n.subjectType === "experience")
    return "employer_confirmed";
  return "unstated";
}

export function noticeLabelKey(n: {
  kind: string;
  verificationMethod?: string | null;
  subjectType?: string | null;
}): string {
  if (n.kind === "passport_decision_approved") {
    switch (noticeDecisionBasis(n)) {
      case "document_reviewed":
        return "notices.kind.passport_decision_approved";
      case "employer_confirmed":
        return "notices.kind.passport_decision_employer_confirmed";
      default:
        return "notices.kind.passport_decision_approved_other";
    }
  }
  return `notices.kind.${n.kind}`;
}
