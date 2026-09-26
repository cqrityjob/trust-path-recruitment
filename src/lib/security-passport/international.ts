import type { Claim } from "./types";

export const CREDENTIAL_CLASSES = {
  certification: { sv: "Certifiering", en: "Certification" },
  professional_licence: { sv: "Yrkeslicens", en: "Professional licence" },
  regulated_authorisation: { sv: "Reglerad behörighet", en: "Regulated authorisation" },
  permit: { sv: "Tillstånd", en: "Permit" },
  mandatory_training: {
    sv: "Obligatoriskt yrkesutbildningsbevis",
    en: "Mandatory training credential",
  },
  occupational_card: { sv: "Yrkeslegitimation", en: "Occupational card" },
  other_professional_credential: { sv: "Annan merit", en: "Other professional credential" },
  // 20261214090000: a country's NSQF-type qualification (India's MEPSC
  // qualifications). Mirrors public.sp_credential_classes -- scripts/
  // india-entry-check.ts refuses a class the database has and this lacks.
  vocational_qualification: { sv: "Yrkeskvalifikation", en: "Vocational qualification" },
} as const;
export type CredentialClass = keyof typeof CREDENTIAL_CLASSES;

/** The reader-facing name of a credential class. A class the database knows
 *  and this build does not (a migration ahead of the code) is shown as the
 *  generic class rather than taking the whole Passport down: the credential,
 *  its trust level and its dates still render. */
export function credentialClassLabel(value: string, lang: "sv" | "en"): string {
  const known = CREDENTIAL_CLASSES[value as CredentialClass];
  return (known ?? CREDENTIAL_CLASSES.other_professional_credential)[lang];
}
export interface CredentialDetails {
  claim_id: string;
  credential_class: CredentialClass;
  original_language: string | null;
  issuing_country_code: string | null;
  issuing_jurisdiction_code: string | null;
  validity_jurisdiction_code: string | null;
  no_expiry: boolean | null;
}
export interface CredentialJurisdiction {
  code: string;
  jurisdiction_type: "national" | "regional" | "supranational" | "global";
  country_code: string | null;
  subdivision_code: string | null;
  name_sv: string;
  name_en: string;
}
export interface CredentialIssuer {
  id: string;
  kind: "authority" | "certification_body";
  name: string;
  officialUrl: string | null;
  verificationUrl: string | null;
  /** Registry membership describes the issuer, never verification of a holder. */
  trustSource: "governed_catalogue";
}
export function credentialClass(claim: Claim, detail?: CredentialDetails): CredentialClass {
  if (detail) return detail.credential_class;
  if (claim.claimType === "licence") return "regulated_authorisation";
  if (claim.claimType === "training") return "mandatory_training";
  if (claim.claimType === "certification") return "certification";
  return "other_professional_credential";
}
export function credentialDate(value: string | null, lang: "sv" | "en"): string {
  if (!value) return lang === "sv" ? "Inte angivet" : "Not stated";
  return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

/** Future adapters produce proposals, not credential mutations. */
export interface EvidenceExtractionProposal {
  evidenceId: string;
  sourceFingerprint: string;
  originalSource: string;
  processVersion: string;
  modelVersion: string | null;
  confidence: number;
  fields: Readonly<Record<string, string | null>>;
  humanReviewState: "pending";
}
export interface CredentialStandardAdapter {
  namespace: string;
  version: string;
  /** Parsing must not imply signature verification, issuer trust or acceptance. */
  parseUntrusted(input: Uint8Array): Promise<EvidenceExtractionProposal>;
}

export interface CredentialVerificationEvent {
  claimId: string;
  result: string;
  decidedAt: string;
  validUntil: string | null;
}
/** A verified claim needs a current authoritative approval. This read model
 * cannot raise trust; an elapsed/superseded review loses its current badge. */
export function currentCredentialVerification(
  claim: Claim,
  events: readonly CredentialVerificationEvent[],
  today: string,
): Claim {
  if (claim.assertionLevel !== "verified") return claim;
  const event = events
    .filter((e) => e.claimId === claim.id)
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
  if (event?.result === "approved" && (!event.validUntil || event.validUntil.slice(0, 10) >= today))
    return claim;
  return {
    ...claim,
    assertionLevel: "document_provided",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
  };
}
