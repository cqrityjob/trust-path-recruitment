// HAYAT — the issuer policy registry.
//
// ── IT IS EMPTY, AND THAT IS THE TRUE STATE OF THE WORLD ───────────────
//
// An entry here says: "this organisation's signing key is THIS key, it may
// issue THESE credentials, and its status is published THERE." Each of those
// is a fact somebody has to establish with the issuer -- a key obtained over a
// channel we trust, a scope the issuer confirmed, terms that permit the check.
//
// No issuer has been onboarded. ASIS issues its badges through Credly, and
// CQrityjob has neither confirmed API access nor confirmed terms with Credly;
// a public badge URL proves nothing about who holds the badge. So
// PRODUCTION_ISSUER_POLICIES is empty, every real credential resolves to
// "cannot be verified automatically", and that is the honest answer rather
// than a gap to be papered over.
//
// The verifier is complete and tested against synthetic issuers whose keys
// exist only in the test suite. The production function never accepts a
// registry from a caller: it reads this constant and nothing else. Adding an
// issuer is therefore a reviewed code change, by design -- a trust anchor
// should not be something a request, a row or an environment variable can add.

import type { JWK } from "jose";

export type SigningAlgorithm = "EdDSA" | "ES256" | "RS256";

export interface IssuerPolicy {
  /** The credential's `issuer.id` / JWT `iss`, exactly. */
  readonly issuerId: string;
  readonly name: string;
  /** Pinned public keys, by `kid`. Keys are never fetched. */
  readonly keys: readonly (JWK & { readonly kid: string })[];
  readonly algorithms: readonly SigningAlgorithm[];
  /**
   * Catalogue definition code -> the achievement ids this issuer uses for it.
   * The issuer's SCOPE: a genuine credential of a type not listed here is
   * refused, however good its signature.
   */
  readonly achievements: Readonly<Record<string, readonly string[]>>;
  /** Hosts a credentialStatus URL may point at. Exact match only. */
  readonly statusHosts: readonly string[];
  /**
   * `required`: a credential without a usable status source is not verified.
   * `not_offered_accepted`: the issuer publishes no status; a documented
   * decision accepts that, and every positive result says so.
   */
  readonly revocation: "required" | "not_offered_accepted";
  /** How old a positive check may be before it must be repeated. */
  readonly maxEvidenceAgeDays: number;
  /** A one-line record of who approved this entry and on what basis. */
  readonly approval: string;
}

export const PRODUCTION_ISSUER_POLICIES: readonly IssuerPolicy[] = [];
