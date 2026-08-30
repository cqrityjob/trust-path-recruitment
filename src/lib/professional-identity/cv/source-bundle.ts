// The factual source bundle — what the CV is allowed to be built from.
//
// ── THE SINGLE MOST IMPORTANT PROPERTY OF THIS FILE ────────────────────
//
// The model never sees the database. It sees this object, and this object
// contains only facts the person themselves supplied to a product that owns
// them, each with an id.
//
// That is not a politeness. It is what makes fabrication structurally
// impossible for the fields that matter: an employer name, a job title and
// a set of dates are NOT fields the model writes. They are carried here,
// they are rendered from here, and the model's entire contribution is
// presentation text attached to an id that must already exist in this
// bundle. A model asked to invent an employer has nowhere to put one.
//
// ── WHAT IS DELIBERATELY LEFT OUT ──────────────────────────────────────
//
//   * Anything about anybody else. The bundle is built from the caller's
//     own RLS-scoped reads and holds one person.
//   * Assessment RESULTS as competencies. Career Discovery appears as an
//     explicitly labelled insight and never as a skill, a qualification or
//     a level. Converting "you would enjoy investigative work" into "skilled
//     investigator" is the exact failure the trust contract forbids.
//   * Verification the Passport did not grant. A claim is carried with its
//     assertion level; `verified` is set by `isVerifiedClaim` and by nothing
//     else, and the renderer is the only thing that may draw a mark.
//   * Protected personal data. Nothing here carries date of birth, health,
//     family situation or any other protected characteristic, because
//     nothing upstream stores one on these rows.
//
// ── WHY EVERY FACT HAS AN ID ───────────────────────────────────────────
//
// So the validator can check the model's output against it. An id that is
// not in this bundle is a fabricated citation, and `validation.ts` rejects
// the whole run for one.

import {
  CREDENTIAL_CLAIM_TYPES,
  EDUCATION_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  SKILL_CLAIM_TYPES,
  claimsOfType,
  isVerifiedClaim,
  type ProfessionalIdentityV1,
} from "../types";

export const CV_SOURCE_BUNDLE_VERSION = "cv-source-bundle-v1" as const;

export interface CvFactIdentity {
  readonly displayName: string;
  /** The Passport headline where one exists. Never invented, and never the
   *  profession slug dressed up as a headline. */
  readonly headline: string | null;
  readonly country: string | null;
  readonly currentProfession: string | null;
  readonly yearsOfExperience: string | null;
}

export interface CvFactEmployment {
  readonly id: string;
  readonly employerName: string;
  readonly roleTitle: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
  readonly employmentType: string;
  /** Carried so the renderer can be honest about it. Never used to decide
   *  whether the employment may appear — a self-declared employment is a
   *  true statement by its holder and belongs on their own CV. */
  readonly assertionLevel: string;
}

export interface CvFactClaim {
  readonly id: string;
  readonly claimType: string;
  readonly title: string;
  readonly issuerName: string | null;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  readonly level: string | null;
  /** TRUE only when an authorised verifier decided so. The one field that
   *  may put a verification mark on a page. */
  readonly verified: boolean;
}

export interface CvFactInsight {
  readonly snapshotId: string;
  readonly generatedAt: string;
}

/**
 * The complete factual input to CV generation.
 *
 * Serialisable, comparable, and safe to log: it is the person's own data and
 * nothing else, and every downstream check is expressed against it.
 */
export interface CvSourceBundle {
  readonly bundleVersion: typeof CV_SOURCE_BUNDLE_VERSION;
  readonly locale: "sv" | "en";
  readonly identity: CvFactIdentity;
  readonly employment: readonly CvFactEmployment[];
  readonly education: readonly CvFactClaim[];
  readonly credentials: readonly CvFactClaim[];
  readonly skills: readonly CvFactClaim[];
  readonly languages: readonly CvFactClaim[];
  /** Present only when the person chose to include it. Labelled as an
   *  assessment insight everywhere it is rendered. */
  readonly careerInsight: CvFactInsight | null;
  /** Free text the person pasted. UNTRUSTED — screened for injection and
   *  passed to the provider as data, never as instructions. */
  readonly targetJobText: string | null;
}

function toFactClaim(claim: {
  id: string;
  claimType: string;
  title: string;
  issuerName: string | null;
  issuedOn: string | null;
  validUntil: string | null;
  skillLevel: string | null;
  assertionLevel: string;
  lifecycleState: string;
}): CvFactClaim {
  return {
    id: claim.id,
    claimType: claim.claimType,
    title: claim.title,
    issuerName: claim.issuerName,
    issuedOn: claim.issuedOn,
    validUntil: claim.validUntil,
    level: claim.skillLevel,
    verified: isVerifiedClaim(claim),
  };
}

/** Most recent first. A CV that starts with 2014 has buried its own point. */
function newestFirst<T extends { startedOn: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.startedOn.localeCompare(a.startedOn));
}

export interface BuildCvSourceBundleInput {
  readonly identity: ProfessionalIdentityV1;
  readonly locale: "sv" | "en";
  /** The person ticked "include my Career Discovery insight". Default off:
   *  an assessment insight on a CV is a choice, not a default. */
  readonly includeCareerInsight: boolean;
  readonly targetJobText: string | null;
}

/**
 * Build the bundle. Pure — no client, no auth, no I/O.
 *
 * Withdrawn and superseded rows never arrive here: `listMyEntries` filters
 * them out upstream, which is the correct place, because "what is currently
 * in my Passport" is the Passport's question to answer.
 */
export function buildCvSourceBundle(input: BuildCvSourceBundleInput): CvSourceBundle {
  const { identity, locale, includeCareerInsight } = input;

  const target = input.targetJobText?.trim();

  return {
    bundleVersion: CV_SOURCE_BUNDLE_VERSION,
    locale,
    identity: {
      displayName: identity.displayName ?? "",
      headline: identity.headline,
      country: identity.workCountry ?? identity.accountCountry,
      currentProfession: identity.currentProfessionSlug ?? identity.currentProfessionOther,
      yearsOfExperience: identity.yearsOfExperience,
    },
    employment: newestFirst(identity.employment).map((e) => ({
      id: e.id,
      employerName: e.employerName,
      roleTitle: e.roleTitle,
      startedOn: e.startedOn,
      endedOn: e.endedOn,
      employmentType: e.employmentType,
      assertionLevel: e.assertionLevel,
    })),
    education: claimsOfType(identity.claims, EDUCATION_CLAIM_TYPES).map(toFactClaim),
    credentials: claimsOfType(identity.claims, CREDENTIAL_CLAIM_TYPES).map(toFactClaim),
    skills: claimsOfType(identity.claims, SKILL_CLAIM_TYPES).map(toFactClaim),
    languages: claimsOfType(identity.claims, LANGUAGE_CLAIM_TYPES).map(toFactClaim),
    careerInsight:
      includeCareerInsight &&
      identity.discovery.hasCompletedReport &&
      identity.discovery.snapshotId
        ? {
            snapshotId: identity.discovery.snapshotId,
            generatedAt: identity.discovery.generatedAt ?? "",
          }
        : null,
    targetJobText: target && target.length > 0 ? target : null,
  };
}

/** Every id the model may cite, as one set. The validator's allowlist. */
export function citableIds(bundle: CvSourceBundle): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const e of bundle.employment) ids.add(e.id);
  for (const group of [
    bundle.education,
    bundle.credentials,
    bundle.skills,
    bundle.languages,
  ]) {
    for (const c of group) ids.add(c.id);
  }
  return ids;
}
