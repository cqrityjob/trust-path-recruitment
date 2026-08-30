// CV readiness — can we build a CV that is worth reading?
//
// ── WHY THIS IS NOT PROFILE COMPLETENESS ───────────────────────────────
//
// Completeness answers "how much have you filled in". Readiness answers a
// different, harder question: "is there enough TRUE MATERIAL here for a
// document that represents you to an employer". They disagree in both
// directions and must, so they are separate functions with separate tests.
//
// A profile at 55% with a headline, a profession and two employments makes
// a perfectly good CV. A profile at 80% whose points came from languages,
// skills and a completed assessment, with no employment history at all,
// does not — and the honest answer there is to say what is missing, not to
// generate a document padded out with assessment results.
//
// ── WHAT AI IS NOT ALLOWED TO COMPENSATE FOR ───────────────────────────
//
// Nothing here weakens when a language model is available. A model can
// write a better sentence about an employment the person actually had; it
// cannot supply the employment. Making readiness depend on the provider
// would mean a person with an empty profile gets a full CV on the day the
// credential is configured, and every line of it would be invented.
//
// So readiness is computed from facts only, the check runs before any
// provider is contacted, and `needs_information` is a refusal to generate
// rather than a warning next to a generated document.

import {
  claimsOfType,
  EDUCATION_CLAIM_TYPES,
  type ProfessionalIdentityV1,
} from "../types";

export const CV_READINESS_VERSION = "cv-readiness-v1" as const;

/** The facts a CV cannot be built without. */
export type CvRequiredField =
  /** A name to put at the top. */
  | "displayName"
  /** A one-line statement of what this person does — the headline, or a
   *  stated current profession that can stand in for one. */
  | "professionalIdentity"
  /** Somewhere to work: an account country or a Passport work country. */
  | "location"
  /** Real professional history: employment periods, or (for someone
   *  entering the industry) education. See `professionalHistory` below. */
  | "professionalHistory";

export type CvReadinessState = "ready" | "needs_information";

export interface CvReadiness {
  readonly state: CvReadinessState;
  readonly version: typeof CV_READINESS_VERSION;
  readonly missingFields: readonly CvRequiredField[];
  /** Everything present, for the review step's own "here is what we will
   *  use" list. Ordered as the CV orders it. */
  readonly satisfiedFields: readonly CvRequiredField[];
}

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Does this person have professional history to write about?
 *
 * Employment periods are the ordinary answer. Education is accepted as the
 * alternative deliberately: somebody entering the security industry from a
 * relevant programme has a real, checkable history and a legitimate reason
 * to want a CV, and refusing them one would make the feature available
 * only to people who least need it.
 *
 * What is NOT accepted, in either branch: a Career Discovery result, a
 * skill claim, or a language. Those are true statements about a person and
 * none of them is a professional history — a CV built out of them would be
 * a CV about an assessment.
 */
function hasProfessionalHistory(identity: ProfessionalIdentityV1): boolean {
  if (identity.employment.length > 0) return true;
  return claimsOfType(identity.claims, EDUCATION_CLAIM_TYPES).length > 0;
}

export function computeCvReadiness(identity: ProfessionalIdentityV1): CvReadiness {
  const satisfied: CvRequiredField[] = [];
  const missing: CvRequiredField[] = [];

  const push = (field: CvRequiredField, ok: boolean) =>
    (ok ? satisfied : missing).push(field);

  push("displayName", filled(identity.displayName));
  push(
    "professionalIdentity",
    filled(identity.headline) ||
      filled(identity.currentProfessionSlug) ||
      filled(identity.currentProfessionOther),
  );
  push("location", filled(identity.workCountry) || filled(identity.accountCountry));
  push("professionalHistory", hasProfessionalHistory(identity));

  return {
    state: missing.length === 0 ? "ready" : "needs_information",
    version: CV_READINESS_VERSION,
    missingFields: missing,
    satisfiedFields: satisfied,
  };
}
