import type { Claim } from "./types";
import type { CredentialVerificationEvent } from "./international";
import { currentCredentialVerification } from "./international";
import { describeTrust } from "./trust-presentation";
import { validityOf } from "./validity";

/** Product wording over the existing decision model. Never promotes a claim. */
export function credentialProductStatus(
  claim: Claim,
  events: readonly CredentialVerificationEvent[],
  today: string,
  review?: string,
) {
  const current = currentCredentialVerification(claim, events, today);
  const lifecycle = validityOf(current.lifecycleState, current.validUntil, today).effectiveState;
  const trust = describeTrust({ ...current, lifecycleState: lifecycle, subjectKind: "credential" });
  const latest = events
    .filter((e) => e.claimId === claim.id)
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
  const status =
    lifecycle !== "active"
      ? lifecycle
      : review === "clarification_requested"
        ? "clarification"
        : review === "pending"
          ? "review"
          : latest?.result === "rejected"
            ? "rejected"
            : trust.status === "verified"
              ? "reviewed"
              : trust.status === "document_provided"
                ? "evidence"
                : "registered";
  const labels: Record<string, { sv: string; en: string }> = {
    registered: { sv: "Registrerat av innehavaren", en: "Registered by holder" },
    evidence: { sv: "Underlag inlämnat", en: "Evidence submitted" },
    review: { sv: "Under granskning", en: "Under review" },
    reviewed: { sv: "Dokument granskat", en: "Document reviewed" },
    clarification: { sv: "Komplettering behövs", en: "More information needed" },
    rejected: { sv: "Granskning avslagen", en: "Review rejected" },
    expired: { sv: "Utgånget", en: "Expired" },
    revoked: { sv: "Återkallat", en: "Revoked" },
    draft: { sv: "Utkast", en: "Draft" },
    superseded: { sv: "Ersatt", en: "Replaced" },
    disputed: { sv: "Bestritt", en: "Disputed" },
  };
  return {
    claim: current,
    lifecycle,
    trust,
    status,
    label: labels[status] ?? labels.registered,
    checked: lifecycle === "active" && trust.status === "verified" && status === "reviewed",
  };
}
