// Security Passport — what KIND of reach a credential has.
//
// Pure domain: no Supabase, no React, no server. The same predicate has to be
// readable by the write path, by the classifier and by a guard script, and a
// module that reached the database could not be imported by all three.
//
// ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────
//
// `credentials.ts` owns what a credential FORM asks for. `classification.ts`
// owns which bucket a stored claim lands in. Both need one answer to "is this
// an international professional certification", and if either had owned it the
// other would have imported a form module to classify, or a classifier to
// validate. Neither is a dependency worth having, so the answer lives on its
// own.
//
// ── SCOPE IS READ, NEVER DERIVED ───────────────────────────────────────
//
// Every function here reads `scopeCode` — the value `sp_credential_types`
// declares — and nothing else. There is deliberately no function taking a
// jurisdiction, a title, an abbreviation, an issuer name or a document, because
// each of those was a candidate answer at some point and each of them is wrong:
//
//   a null jurisdiction    is also every language, practical skill and
//                          free-text training row in the product
//   an issuer's country    ASIS is incorporated somewhere; a CPP is not from
//                          there
//   "international"        holder-supplied text
//   an abbreviation        "CPP" is a job title, an acronym and whatever
//                          anybody types
//
// An undeclared scope is therefore NOT global. It is undeclared, which is what
// every legacy row honestly is, and `isGlobalCertification` returns false for
// it — the one direction this module is allowed to fail in.

/** The stable scope code for an international professional certification.
 *
 *  A string constant rather than an inline literal so a typo is a compile
 *  error at exactly one site, and so `scripts/passport-global-certification-check.ts`
 *  can pin it against the SQL seed. */
export const GLOBAL_PROFESSIONAL_SCOPE = "global_professional" as const;

/** The scope code for a credential that belongs to one jurisdiction. */
export const NATIONAL_REGULATED_SCOPE = "national_regulated" as const;

/** The scope-bearing part of a credential definition.
 *
 *  Structural on purpose: `CredentialType`, a taxonomy row read by the server
 *  and a classifier input all satisfy it without conversion. */
export interface ScopedCredentialDefinition {
  readonly scopeCode: string | null;
}

/**
 * True when this DEFINITION declares itself an international professional
 * certification.
 *
 * Note what it does not take: a claim, a jurisdiction, a country or a title.
 * The definition decides, which is the whole governance property — a holder
 * cannot make their claim international by leaving a field blank, and a client
 * cannot make it international by sending a flag.
 */
export function isGlobalCertification(
  definition: ScopedCredentialDefinition | null | undefined,
): boolean {
  return definition?.scopeCode === GLOBAL_PROFESSIONAL_SCOPE;
}

/** True when the definition belongs to a named jurisdiction.
 *
 *  Deliberately NOT `!isGlobalCertification(...)`: an undeclared scope is
 *  neither, and collapsing the three states into two is how "we have not said"
 *  becomes "it is national". */
export function isNationalCredential(
  definition: ScopedCredentialDefinition | null | undefined,
): boolean {
  return definition?.scopeCode === NATIONAL_REGULATED_SCOPE;
}

/**
 * What a global certification's stored jurisdiction columns must be.
 *
 * Exported as a pair rather than written inline at the two call sites that
 * need it, so the write path and the tests assert one object instead of two
 * conventions. Both columns, always, and always null: a correction from a
 * Dubai cadre card to a CPP has to CLEAR the emirate, which an omitted column
 * would not do.
 */
export const GLOBAL_CERTIFICATION_TERRITORY = {
  jurisdiction_code: null,
  sub_jurisdiction_code: null,
} as const;
