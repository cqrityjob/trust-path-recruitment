// Security Passport — who is allowed to see which derivation.
//
// ── WHY THIS IS A MODULE AND NOT A BOOLEAN ─────────────────────────────
//
// `deriveProfessionalIdentity(claims, rules, today, { includeSelfDeclared })`
// is one keystroke away from leaking a title nobody checked onto a public
// card. An options object is easy to copy from a private call site into a
// public one, and the diff would look harmless.
//
// So the audiences get names instead. `deriveVerifiedIdentity` has no
// parameter that could admit self-declared evidence — not one the caller can
// set, and not one this file exposes. Choosing the unsafe derivation means
// typing the word `Preview`, in a call that reads as what it is.

import { deriveProfessionalIdentity } from "./derive";
import { effectiveAssertionLevel } from "../provenance";
import type { Claim, IsoDate } from "../types";
import type { DerivedTitle, ProfessionalIdentity, TitleRule } from "./types";

/**
 * What everyone else may see: the Passport Card, the recipient page, the
 * employer's view of an application, the social image, the LinkedIn output.
 *
 * Every title here met its rule's own evidence bar. There is no argument that
 * relaxes it.
 */
export function deriveVerifiedIdentity(
  claims: readonly Claim[],
  rules: readonly TitleRule[],
  evaluationOn: IsoDate,
): ProfessionalIdentity {
  return deriveProfessionalIdentity(withEffectiveAssertion(claims), rules, evaluationOn);
}

/**
 * Claims as the ENGINE may read them.
 *
 * The stored assertion level is not rewritten anywhere; this is a projection
 * for derivation only. A legacy unsupported claim -- a source-confirmation
 * method CQrityjob recorded about itself -- arrives as document_provided and
 * therefore satisfies no rule that asks for verified: it contributes no
 * verified title, no regulated eligibility and no authority recognition.
 * Applied here, at the audience gate, so that every derivation -- public,
 * private preview, CV -- reads the same claim the same way.
 */
export function withEffectiveAssertion(claims: readonly Claim[]): readonly Claim[] {
  return claims.map((c) => {
    const level = effectiveAssertionLevel(c);
    return level === c.assertionLevel ? c : { ...c, assertionLevel: level };
  });
}

/**
 * What the holder may see about themselves, and nobody else.
 *
 * Includes titles that exist only because self-declared evidence was allowed
 * in. Each one carries `selfDeclared: true`, and every surface that renders
 * this must label it — Egenrapporterad / Self-declared — because the whole
 * point of showing it is to tell the holder what verification would get them,
 * not to let them believe they already have it.
 */
export function derivePreviewIdentity(
  claims: readonly Claim[],
  rules: readonly TitleRule[],
  evaluationOn: IsoDate,
): ProfessionalIdentity {
  return deriveProfessionalIdentity(withEffectiveAssertion(claims), rules, evaluationOn, {
    includeSelfDeclared: true,
  });
}

/**
 * Guards a derivation on its way to somebody other than the holder.
 *
 * Belt and braces: `deriveVerifiedIdentity` cannot produce a self-declared
 * title, so in a correct program this filters nothing. It exists because the
 * cost of being wrong is a Passport Card asserting an appointment that was
 * never checked, and one line of defence for that is not enough.
 */
export function withoutSelfDeclared(identity: ProfessionalIdentity): ProfessionalIdentity {
  const clean = (titles: readonly DerivedTitle[]) => titles.filter((t) => !t.selfDeclared);
  return {
    ...identity,
    includesSelfDeclared: false,
    educationCompleted: clean(identity.educationCompleted),
    professionalCompetence: clean(identity.professionalCompetence),
    localEligibility: clean(identity.localEligibility),
    activeTitles: clean(identity.activeTitles),
  };
}
