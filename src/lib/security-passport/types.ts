// Security Passport — the type-level spine of the Phase 1 prototype.
//
// ── THE TWO-AXIS MODEL ─────────────────────────────────────────────────
//
// `assertionLevel` and `lifecycleState` are SEPARATE unions and are never
// combined into one status enum. That is the single most load-bearing
// decision in Product Architecture v1.1 §12, and the reason is concrete:
// the most common real state of a Väktare's authorisation is a VERIFIED
// licence that has EXPIRED. A single enum forces a choice between dropping
// the verification (losing history) and continuing to display VERIFIED
// (a lie). Two axes represent it exactly.
//
// ── WHAT THE HOLDER MAY SET ────────────────────────────────────────────
//
// Neither axis. In the eventual production system both columns are pinned
// by RLS `WITH CHECK` and moved only by SECURITY DEFINER RPCs. In this
// prototype the equivalent guarantee is structural: nothing in the
// component tree accepts a setter for either field, the fixtures are
// `readonly` throughout, and scripts/passport-separation-check.ts fails the
// build if a mutation of either field appears in Passport code.
//
// Phase 1 is FIXTURE-ONLY. No `sp_*` table exists. These types describe the
// shape a future server response would take so the prototype exercises the
// eventual contract, and nothing here authorises that schema.

import type { ProfessionalIdentity } from "./identity/types";

/** What kind of backing a claim has. Never a quality or suitability rating. */
export type AssertionLevel = "self_declared" | "document_provided" | "verified";

/** Where a claim sits in its life. Orthogonal to how well it is backed. */
export type LifecycleState = "draft" | "active" | "expired" | "revoked" | "superseded" | "disputed";

export const ASSERTION_LEVELS: readonly AssertionLevel[] = [
  "self_declared",
  "document_provided",
  "verified",
] as const;

export const LIFECYCLE_STATES: readonly LifecycleState[] = [
  "draft",
  "active",
  "expired",
  "revoked",
  "superseded",
  "disputed",
] as const;

/** Ordering used ONLY to answer "is this at least document-provided?".
 *  Deliberately not exposed as a score, printed, or summed. */
const ASSERTION_RANK: Readonly<Record<AssertionLevel, number>> = {
  self_declared: 0,
  document_provided: 1,
  verified: 2,
};

export function assertionAtLeast(level: AssertionLevel, floor: AssertionLevel): boolean {
  return ASSERTION_RANK[level] >= ASSERTION_RANK[floor];
}

/** A period counts toward experience only while it is `active`. `disputed`,
 *  `revoked` and `superseded` are excluded the moment they are set — see
 *  experience.ts, where this is applied rather than assumed. */
export function countsTowardExperience(state: LifecycleState): boolean {
  return state === "active";
}

export type ClaimType =
  | "training"
  | "certification"
  | "licence"
  | "specialisation"
  | "education"
  | "professional_membership";

export type EmploymentType = "full_time" | "part_time" | "hourly" | "temporary";

/** How much of the role was security work. `partial` requires an explicit
 *  fraction — the calculation never guesses one. */
export type SecurityRelevance = "primary" | "partial" | "none";

/** ISO 3166-1 alpha-2. Sweden-first, but never hard-coded into the model:
 *  a Swedish credential must not imply eligibility elsewhere (v1.1 §16). */
export type JurisdictionCode = string;

/** ISO date, `YYYY-MM-DD`. Kept as a string so fixture data reads the way a
 *  server response would, and so no timezone can shift a start date. */
export type IsoDate = string;

export interface ExperiencePeriod {
  readonly id: string;
  readonly employerName: string;
  readonly roleTitle: string;
  /** CIG profession slug, e.g. `vaktare`. Null when the role has no mapping. */
  readonly professionSlug: string | null;
  readonly jurisdictionCode: JurisdictionCode;
  readonly employmentType: EmploymentType;
  /** 0..1. Reported alongside elapsed time, never substituted for it. */
  readonly fteFraction: number;
  readonly securityRelevance: SecurityRelevance;
  /** 0..1. Required when `securityRelevance === "partial"`. */
  readonly securityFraction: number;
  readonly startedOn: IsoDate;
  /** Null means "current". */
  readonly endedOn: IsoDate | null;
  readonly assertionLevel: AssertionLevel;
  readonly lifecycleState: LifecycleState;
  /** Who confirmed it, when verified. Never settable by the holder. */
  readonly verifierName: string | null;
}

export interface Claim {
  readonly id: string;
  readonly claimType: ClaimType;
  /** Supported-credential taxonomy code (VU1, VU2, OV, SV) or null for a
   *  free-text claim. Decides which credential symbol the claim carries;
   *  a null code takes the neutral document mark. Written only through the
   *  taxonomy-checked credential path — never invented in the UI. */
  readonly credentialCode: string | null;
  /** Phase 11. Controlled language or practical-capability code. Mutually
   *  exclusive with `credentialCode` — a language never wears a credential
   *  symbol, and the database refuses an entry that carries both. */
  readonly skillCode: string | null;
  /** A value from the scale the skill type declares. Never free text, and
   *  never rendered as a bare code: the reader sees the scale's own words. */
  readonly skillLevel: string | null;
  readonly titleSv: string;
  readonly titleEn: string;
  /** Proper noun; not translated. */
  readonly issuerName: string;
  /** Required in practice for anything carrying legal meaning. */
  readonly jurisdictionCode: JurisdictionCode | null;
  /** Emirate, devolved region or other sub-national area, where the regulator
   *  is not national. Null everywhere the country IS the jurisdiction. A
   *  Dubai credential without it would read as valid across the UAE. */
  readonly subJurisdictionCode: string | null;
  /** What a scoped authorisation is limited to — employer, principal or
   *  protected object. A skyddsvakt approval shown without its scope reads as
   *  a general national licence, so this travels with the claim into every
   *  derived title and every disclosure. */
  readonly authorisationScope: string | null;
  readonly issuedOn: IsoDate | null;
  readonly validFrom: IsoDate | null;
  readonly validUntil: IsoDate | null;
  readonly assertionLevel: AssertionLevel;
  readonly lifecycleState: LifecycleState;
  readonly verifierName: string | null;
  /** Mandatory context that travels with the claim into every disclosure.
   *  Cannot be toggled off by the holder (v1.1 §7.3). */
  readonly limitationSv: string | null;
  readonly limitationEn: string | null;
  readonly versionNo: number;
  readonly supersedesClaimId: string | null;
}

/** Everything one fixture persona holds. Shaped like a future server payload. */
export interface PassportHolder {
  readonly id: string;
  readonly displayName: string;
  readonly professionSlug: string | null;
  /** What this person may currently be called, derived from their claims by
   *  src/lib/security-passport/identity/.
   *
   *  There is deliberately no stored `professionTitleSv` beside it. There used
   *  to be, and the server set it to the literal "Väktare" for every holder
   *  who had ever signed in — whether they held VU1, held nothing, or held a
   *  current ordningsvaktsförordnande. Six surfaces printed it. Removing the
   *  field rather than fixing the string is what makes that unrepeatable: a
   *  component cannot render a title nobody derived if there is none to read. */
  readonly identity: ProfessionalIdentity;
  readonly jurisdictionCode: JurisdictionCode;
  readonly periods: readonly ExperiencePeriod[];
  readonly claims: readonly Claim[];
  /** Whether this fictional person also has a Career Discovery result.
   *  Used ONLY by the mocked candidate home to show two adjacent product
   *  entries. No Career Discovery data is stored, read or embedded. */
  readonly hasCareerDiscoveryResult: boolean;
}
