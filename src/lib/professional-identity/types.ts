// The Professional Identity layer — shared vocabulary.
//
// ── WHAT THIS LAYER IS ─────────────────────────────────────────────────
//
// One person, one account, several products. This directory is the seam
// where those products are read TOGETHER — and nothing more than that. It
// owns no facts. Every value that reaches it was written by the product
// that owns it:
//
//   profiles                    account identity (display name, country)
//   security_career_profiles    the CANONICAL self-reported professional
//                               profile (20261007090000)
//   sp_passport_profiles        Passport headline + work country
//   sp_experience_periods       employment history, dated and reviewable
//   sp_claims                   credentials, education, languages, skills —
//                               each carrying its own assertion level
//   cd_report_snapshots         Career Discovery, frozen per run
//   employer_memberships        organisation membership
//
// ── WHY THERE IS NO "PROFILE" TYPE HERE ────────────────────────────────
//
// Because a second profile type is how a second profile store begins. The
// canonical profile already has one (`SecurityCareerProfileV1`), and this
// layer imports it rather than restating it. What this file defines is a
// READ MODEL: a snapshot of "what does this person have, across products",
// assembled for a screen and never written back anywhere.
//
// ── PROVENANCE IS PART OF THE TYPE ─────────────────────────────────────
//
// Every fact that can be shown to somebody else carries where it came from
// and whether anybody verified it. That is not decoration. The single most
// damaging thing this product could do is print a self-reported credential
// with a verified mark next to it, and the way to make that impossible is
// to make "verified" unrepresentable unless the Passport said so.

import type {
  CurrentStatus,
  YearsOfExperience,
} from "@/lib/security-career-profile/types";

/** Where a displayed fact came from. See docs — DATA SEMANTICS. */
export type SourceType =
  /** The person typed it into the canonical Professional Profile. */
  | "self_reported"
  /** A Passport entry that no authorised verifier has decided on. */
  | "passport_declared"
  /** A Passport entry an authorised verifier has verified. The ONLY value
   *  that may ever render a verification mark. */
  | "passport_verified"
  /** Career Discovery output — an assessment insight, never a competency. */
  | "assessment_insight"
  /** Written by the platform, not by the person (counts, states). */
  | "derived";

/** A fact with its provenance attached. */
export interface SourcedValue<T> {
  readonly value: T;
  readonly source: SourceType;
  /** The row this came from, where one exists and naming it is useful. */
  readonly sourceId?: string | null;
  /** When the owning product last changed it. */
  readonly updatedAt?: string | null;
}

/* ------------------------------------------------------------------ */
/* The identity read model                                             */
/* ------------------------------------------------------------------ */

/** Employment, exactly as the Passport records it. Never re-derived here. */
export interface IdentityEmployment {
  readonly id: string;
  readonly employerName: string;
  readonly roleTitle: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
  readonly employmentType: string;
  readonly jurisdictionCode: string;
  /** `self_declared` unless a verifier moved it. Carried, never computed. */
  readonly assertionLevel: string;
}

/** A Passport claim, with the two fields that decide how it may be shown. */
export interface IdentityClaim {
  readonly id: string;
  /** education | training | certification | licence | specialisation |
   *  professional_membership | language | practical_skill */
  readonly claimType: string;
  readonly title: string;
  readonly issuerName: string | null;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  readonly skillLevel: string | null;
  /** `self_declared` | `evidenced` | `verified`. The gate on the tick. */
  readonly assertionLevel: string;
  readonly lifecycleState: string;
}

/** What Career Discovery contributes — insight, never fact. */
export interface IdentityDiscovery {
  readonly hasCompletedReport: boolean;
  readonly snapshotId: string | null;
  readonly generatedAt: string | null;
  /** True only when the report actually NAMES careers, which is what makes
   *  a Career Card possible. See V31ReportView's own note. */
  readonly namesCareers: boolean;
}

/** Counts that drive the home screen. Never anybody else's rows. */
export interface IdentityWorkload {
  readonly applicationCount: number;
  readonly assessmentAssignmentCount: number;
  readonly releasedReportCount: number;
  readonly employerWorkspaceCount: number;
}

/**
 * Everything the personal home and the CV builder read, in one object.
 *
 * Assembled by `identity.functions.ts` from the caller's own RLS-scoped
 * client. There is no variant of this that describes anybody else.
 */
export interface ProfessionalIdentityV1 {
  readonly identityVersion: "professional-identity-v1";

  /** Account identity — `profiles`. */
  readonly displayName: string | null;
  readonly accountCountry: string | null;
  readonly locale: string;

  /** Canonical self-reported profile — `security_career_profiles`. */
  readonly currentStatus: CurrentStatus | null;
  readonly currentProfessionSlug: string | null;
  readonly currentProfessionOther: string | null;
  readonly yearsOfExperience: YearsOfExperience | null;

  /** Passport profile. `headline` is the Passport's own field; the work
   *  country is Passport-owned by design (20261007090000) and is NOT
   *  duplicated into the canonical profile. */
  readonly hasPassport: boolean;
  readonly headline: string | null;
  readonly workCountry: string | null;

  readonly employment: readonly IdentityEmployment[];
  readonly claims: readonly IdentityClaim[];
  readonly discovery: IdentityDiscovery;
  readonly workload: IdentityWorkload;
}

/* ------------------------------------------------------------------ */
/* Claim classification                                                */
/* ------------------------------------------------------------------ */

/**
 * The ONE place a claim becomes "verified" for display purposes.
 *
 * Every surface asks this function rather than comparing strings itself,
 * so there is exactly one definition to audit and exactly one to get
 * wrong. `evidenced` deliberately does NOT qualify: attaching a document
 * is the holder's act, and a holder cannot verify themselves.
 */
export function isVerifiedClaim(claim: {
  readonly assertionLevel: string;
  readonly lifecycleState: string;
}): boolean {
  return claim.assertionLevel === "verified" && claim.lifecycleState === "active";
}

/** Claims the holder has entered but nobody has decided on yet. */
export function isPendingClaim(claim: {
  readonly assertionLevel: string;
  readonly lifecycleState: string;
}): boolean {
  return claim.lifecycleState === "active" && claim.assertionLevel !== "verified";
}

/** Claim types that describe formal education. */
export const EDUCATION_CLAIM_TYPES: readonly string[] = ["education"];
/** Claim types that describe a credential someone else issued. */
export const CREDENTIAL_CLAIM_TYPES: readonly string[] = [
  "certification",
  "licence",
  "training",
  "professional_membership",
];
/** Claim types that describe a capability the holder states. */
export const SKILL_CLAIM_TYPES: readonly string[] = ["practical_skill", "specialisation"];
/** Claim types that describe a language. */
export const LANGUAGE_CLAIM_TYPES: readonly string[] = ["language"];

export function claimsOfType(
  claims: readonly IdentityClaim[],
  types: readonly string[],
): readonly IdentityClaim[] {
  return claims.filter((c) => types.includes(c.claimType) && c.lifecycleState === "active");
}
