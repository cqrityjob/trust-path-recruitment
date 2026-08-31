// "What has actually been verified about me", counted once.
//
// My Career shows this as a line in the career journey. The Career Card
// compresses it into a badge somebody screenshots. Both need the same three
// numbers, and if they counted separately they would eventually differ — a
// card claiming two confirmed employments beside a home page claiming one is
// the sort of contradiction §30 of the brief exists to forbid, and it is
// produced by exactly this kind of small duplicated loop.
//
// ── NOTHING HERE DECIDES ANYTHING ──────────────────────────────────────
//
// Every count is a filter over `describeTrust`, which is a function of the
// Passport's stored assertion level, lifecycle state and decision record.
// This file cannot promote a fact, cannot infer a verification from evidence
// existing, and cannot count a candidate's own text as anything. Delete it
// and the trust model is unchanged; it is arithmetic over an answer that was
// already given.
//
// ── AND UNKNOWN IS NOT ZERO ────────────────────────────────────────────
//
// `known` is false when the provenance read did not answer. The surfaces
// must then say "could not be loaded" rather than "0 verified" — the PR 4
// rule, which matters most precisely here, because a confident zero about
// somebody's professional standing is the most damaging false statement this
// product can make about them.

import { describeTrust, isEmployerConfirmed } from "@/lib/security-passport/trust-presentation";
import {
  isPendingClaim,
  isUnavailable,
  isVerifiedClaim,
  type ProfessionalIdentityV1,
} from "./types";

export interface TrustSummary {
  /** Credentials, education, languages and skills an authorised verifier
   *  has verified and that are currently active. */
  readonly verifiedClaims: number;
  /** Employments an EMPLOYER confirmed. Deliberately narrower than "verified
   *  employments": one CQrityjob verified by reading a contract is verified,
   *  but saying an employer confirmed it would attribute the act to the wrong
   *  party. `employerConfirmedEmployment <= verifiedEmployment` always. */
  readonly employerConfirmedEmployment: number;
  /** Employments verified by ANY method, employer confirmation included. */
  readonly verifiedEmployment: number;
  /** Claims submitted for verification and not yet decided. */
  readonly pendingClaims: number;
  /**
   * The underlying reads answered.
   *
   * False means every count above is a floor, not a fact, and a caller must
   * not render any of them as a total. There is no partial credit here: a
   * surface either says a number or says it could not load one.
   */
  readonly known: boolean;
}

const UNKNOWN: TrustSummary = {
  verifiedClaims: 0,
  employerConfirmedEmployment: 0,
  verifiedEmployment: 0,
  pendingClaims: 0,
  known: false,
};

/**
 * Count what is currently verified, from an identity read already in hand.
 *
 * Pure and query-free by design (§24, §25): every caller already holds a
 * `ProfessionalIdentityV1`, and adding a Passport round trip to render a
 * badge would be a second source of truth as well as a slower page.
 */
export function summariseTrust(identity: ProfessionalIdentityV1): TrustSummary {
  // The employment counts need both the periods AND who decided on them.
  // The claim counts need the claims and the same decisions. If any of the
  // three reads failed, the honest answer for the whole summary is "unknown"
  // rather than a mixture of real and floor numbers that reads as a total.
  const known =
    !isUnavailable(identity, "provenance") &&
    !isUnavailable(identity, "claims") &&
    !isUnavailable(identity, "employment");
  if (!known) return UNKNOWN;

  let employerConfirmedEmployment = 0;
  let verifiedEmployment = 0;
  for (const e of identity.employment) {
    const trust = describeTrust({
      assertionLevel: e.assertionLevel,
      verifierName: e.verifierName,
      verificationMethod: e.verificationMethod,
      verifiedOn: e.verifiedOn,
    });
    if (trust.status !== "verified") continue;
    verifiedEmployment += 1;
    if (isEmployerConfirmed(trust)) employerConfirmedEmployment += 1;
  }

  return {
    // `isVerifiedClaim` rather than a second reading of the assertion level:
    // it is the Passport's own definition and the Passport surfaces use it.
    verifiedClaims: identity.claims.filter(isVerifiedClaim).length,
    employerConfirmedEmployment,
    verifiedEmployment,
    pendingClaims: identity.claims.filter(isPendingClaim).length,
    known: true,
  };
}

/** True when there is any verified standing at all worth surfacing. */
export function hasAnyVerifiedStanding(summary: TrustSummary): boolean {
  return summary.known && (summary.verifiedClaims > 0 || summary.verifiedEmployment > 0);
}
