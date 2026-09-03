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

import type { CurrentStatus, YearsOfExperience } from "@/lib/security-career-profile/types";

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
  // ── WHO CONFIRMED IT, AND HOW ──────────────────────────────────────
  //
  // Resolved by the Passport's own `printableProvenance`, which refuses to
  // answer for anything not currently `verified`. Never `employerName`: the
  // company a period NAMES and the company that CONFIRMED it are different
  // facts, and borrowing the first for the second is an attestation nobody
  // made. Null on every self-declared period, which is most of them.
  readonly verifierName: string | null;
  /** Decides whether the CV may say "Confirmed by Company X" or must say
   *  "Document reviewed by CQrityjob". An employment can reach `verified`
   *  by either route and they are not the same sentence. */
  readonly verificationMethod: string | null;
  readonly verifiedOn: string | null;
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
  /** The organisation that DECIDED. `issuerName` above is candidate-entered
   *  and says who awarded the credential; this says who checked it, and the
   *  two are never interchangeable on any surface. */
  readonly verifierName: string | null;
  readonly verificationMethod: string | null;
  readonly verifiedOn: string | null;
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
  /** The attempt whose released report this person should be taken to, when
   *  exactly one is safely identifiable. Null means "the area, not a
   *  document" -- see next-best-action.ts. Never anybody else's attempt: it
   *  comes from `scp_my_assessment_history`, which answers for the caller. */
  readonly releasedReportAttemptId: string | null;
  /** The assessment attempt that is waiting on this person, when exactly one
   *  can be named: the open assessment with the earliest deadline, then the
   *  stable id. Null routes to the assessments area rather than to a run
   *  this seam guessed at. Same rule as `releasedReportAttemptId`. */
  readonly assessmentAssignmentAttemptId: string | null;
}

/* ------------------------------------------------------------------ */
/* What could not be read                                              */
/* ------------------------------------------------------------------ */

/**
 * A group of facts, named by the read that produces it.
 *
 * ── WHY THE READ MODEL CARRIES ITS OWN FAILURES ────────────────────────
 *
 * Every read in this seam has a safe empty fallback, and that is right for
 * ABSENCE — a person with no Passport genuinely has no claims. It is wrong
 * for FAILURE. A failed `sp_claims` read and a holder with nothing verified
 * produce the same empty array, and the screen printed the same "0
 * verifierade" for both. That tells a holder with four verified credentials
 * that they have none, which is the single most damaging sentence this
 * product could put on a person's own home page.
 *
 * So a failed read is recorded rather than smoothed away. The surfaces then
 * have something to render instead of a number, and the rules below have
 * something to decline to decide on. The empty fallbacks stay: a group that
 * failed still yields an empty array, so one broken read never throws the
 * whole object away and the sections that DID load still render.
 */
export type IdentityFactGroup =
  /** `profiles` — display name, country, locale. */
  | "account"
  /** `security_career_profiles` — the canonical self-reported profile. */
  | "profile"
  /** `sp_passport_profiles` — headline and work location. */
  | "passport"
  /** `sp_claims` — credentials, education, languages, skills. */
  | "claims"
  /** `sp_experience_periods` — employment history. */
  | "employment"
  /** `cd_report_snapshots` — Career Discovery. */
  | "discovery"
  /** `job_applications` — this person's own applications. */
  | "applications"
  /** `scp_my_academy_assignments` / `scp_my_assessment_history`. */
  | "assessments"
  /** `employer_memberships`. */
  | "memberships"
  /** `sp_verification_requests` / `sp_verification_decisions` -- WHO
   *  verified each claim and period. Its own group because a failed
   *  provenance read is not "nothing is verified": every verified fact the
   *  person owns would render with no attribution, and the surfaces must be
   *  able to tell that apart from an honestly unverified profile. */
  | "provenance";

/** True when the named group's read did not answer. */
export function isUnavailable(
  identity: Pick<ProfessionalIdentityV1, "unavailable">,
  group: IdentityFactGroup,
): boolean {
  return identity.unavailable.includes(group);
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

  /** The profession's published title, resolved once on the server against
   *  the SAME catalogue the picker offers (`cig_professions`). A slug is an
   *  identifier, not a word in anybody's language, and `vaktare` printed as
   *  a person's professional identity is the product failing to know what it
   *  already stores. Null when the slug names no published row — which is a
   *  content problem, and `professionLabel` says so by refusing to guess. */
  readonly currentProfessionTitleSv: string | null;
  readonly currentProfessionTitleEn: string | null;

  /** Passport profile. `headline` is the Passport's own field; the work
   *  country is Passport-owned by design (20261007090000) and is NOT
   *  duplicated into the canonical profile. */
  readonly hasPassport: boolean;
  readonly headline: string | null;
  readonly workCountry: string | null;
  /** The emirate/region inside `workCountry`, where the holder stated one.
   *  Carried because a Dubai holder is not "a UAE holder": SIRA's writ does
   *  not run in Abu Dhabi, and flattening the two makes the UAE-wide claim
   *  the market pack exists to refuse. Rendered with `formatWorkLocation`,
   *  never as a bare code. */
  readonly workSubJurisdiction: string | null;

  readonly employment: readonly IdentityEmployment[];
  readonly claims: readonly IdentityClaim[];
  readonly discovery: IdentityDiscovery;
  readonly workload: IdentityWorkload;

  /** The reads that did not answer. Empty on a healthy load. See
   *  `IdentityFactGroup` for why a failure is carried rather than smoothed
   *  into a zero. */
  readonly unavailable: readonly IdentityFactGroup[];
}

/* ------------------------------------------------------------------ */
/* Profession label                                                    */
/* ------------------------------------------------------------------ */

/**
 * The ONE place a profession becomes a word.
 *
 * ── WHY A FUNCTION AND NOT A `??` CHAIN ────────────────────────────────
 *
 * It was `currentProfessionOther ?? currentProfessionSlug`, written out on
 * the personal home and again on the profile page. Both printed the raw
 * slug — `vaktare` — as the person's professional identity whenever the
 * profession came from the catalogue rather than from free text, which is
 * the ordinary case: the picker WRITES the slug.
 *
 * The fix is not a second dictionary. `cig_professions` already holds the
 * Swedish and English titles and is already the picker's source, so the
 * seam resolves the title there once and every surface reads it here.
 *
 * ── WHY A SLUG IS NEVER THE FALLBACK ───────────────────────────────────
 *
 * A slug that resolves to no published row means the catalogue and the
 * stored profile disagree. Printing the slug turns that into a sentence
 * about the person; returning null lets the surface say "not filled in
 * yet", which is at least not a claim about who they are.
 */
export function professionLabel(
  identity: Pick<
    ProfessionalIdentityV1,
    "currentProfessionOther" | "currentProfessionTitleSv" | "currentProfessionTitleEn"
  >,
  lang: "sv" | "en",
): string | null {
  const title =
    lang === "en" ? identity.currentProfessionTitleEn : identity.currentProfessionTitleSv;
  const other = identity.currentProfessionOther?.trim();
  // The catalogue title first: a person who picked "Väktare" and also typed
  // something into the free-text box has a canonical answer, and it wins.
  return title?.trim() || other || null;
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
