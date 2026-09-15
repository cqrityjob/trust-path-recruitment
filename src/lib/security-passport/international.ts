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
  other_professional_credential: { sv: "Annat yrkesbevis", en: "Other professional credential" },
} as const;
export type CredentialClass = keyof typeof CREDENTIAL_CLASSES;
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
