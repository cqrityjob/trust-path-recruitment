// An approval as the holder and the reviewer read it: the case DECISION and
// what the verification SUPPORTS, said apart (Astra's recheck, 2026-10-15).
//
//   decision  always "Approved" -- the request was decided in the holder's
//             favour. It says nothing about who confirmed the fact.
//   basis     what the decision supports, by the existing provenance model
//             (methodLabelKey, which applies effectiveTrust's rules): an
//             employer confirmation only for an employment period decided by
//             the employer; an issuer confirmation, an employer confirmation
//             of a credential and a legacy source method CQrityjob recorded
//             are named as what they are -- never as a source confirmation.
//   note      the one sentence a reader needs beside it: a document review is
//             not the issuer's confirmation; an unsupported source method is
//             history that cannot be shown as a direct confirmation.
//
// Pure; checked by scripts/talent-discovery-check.ts against the shared
// provenance cases (supabase/tests/provenance_cases.json).
import type { PassportCopyKey } from "./i18n";
import { effectiveTrust, type ProvenanceSubjectKind } from "./provenance";
import { methodLabelKey, unsupportedSourceNoticeKey } from "./trust-presentation";

export interface ApprovalPresentation {
  readonly decision: "ver.status.approved";
  readonly basis: PassportCopyKey | null;
  readonly note: PassportCopyKey | null;
}

export function approvalPresentation(input: {
  readonly method: string | null | undefined;
  readonly organisation: string | null | undefined;
  readonly subjectKind: ProvenanceSubjectKind | undefined;
}): ApprovalPresentation {
  const entry = {
    assertionLevel: "verified",
    verificationMethod: input.method ?? null,
    verifierName: input.organisation ?? null,
    subjectKind: input.subjectKind,
  };
  const unsupported = unsupportedSourceNoticeKey(entry);
  return {
    decision: "ver.status.approved",
    basis: methodLabelKey(input.method, input.organisation, input.subjectKind),
    note:
      unsupported ??
      (effectiveTrust(entry) === "documented" && input.method === "document_review"
        ? "ver.current.reviewNotIssuer"
        : null),
  };
}
