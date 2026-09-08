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
//   * CONTACT DETAILS. An email address and a telephone number are on the
//     finished page and are deliberately not here, so they are never part of
//     a provider request. They reach the document on the renderer channel
//     alongside the trust annotations -- see `document.ts` -- for the same
//     reason that provenance does: text a model never receives is text a
//     model cannot weave into a sentence.
//   * Anything the person did not select. `includedIds` is applied while the
//     bundle is built, so a fact left off is absent from the model's input,
//     from the validator's allowlist, from the rendered page and from the
//     print export. The copy an employer receives is built in SQL from the
//     SQL-built bundle, which applies the same allowlist at the boundary --
//     see 20261102090000. `selection.ts` explains why hiding it in the
//     renderer would not have been the same thing.
//
// ── WHY EVERY FACT HAS AN ID ───────────────────────────────────────────
//
// So the validator can check the model's output against it. An id that is
// not in this bundle is a fabricated citation, and `validation.ts` rejects
// the whole run for one.

import { keepOnly, type CvIncludedIds } from "./selection";
import {
  CREDENTIAL_CLAIM_TYPES,
  EDUCATION_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  SKILL_CLAIM_TYPES,
  claimsOfType,
  professionLabel,
  type ProfessionalIdentityV1,
} from "../types";

export const CV_SOURCE_BUNDLE_VERSION = "cv-source-bundle-v1" as const;

export interface CvFactIdentity {
  readonly displayName: string;
  /** The Passport headline where one exists. Never invented, and never the
   *  profession slug dressed up as a headline. */
  readonly headline: string | null;
  readonly country: string | null;
  /** The emirate/region inside `country`, where the holder stated one and
   *  the country came from their Passport work location.
   *
   *  Carried because "AE" and "Dubai, United Arab Emirates" are different
   *  statements about where somebody may work, and printing the first when
   *  the holder said the second makes a UAE-wide claim the market pack
   *  exists to refuse. Rendered through `formatWorkLocation`, never as a
   *  bare code. */
  readonly countrySubdivision: string | null;
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
  // NO `verified` FIELD, deliberately.
  //
  // There was one, and a saved CV was found still printing "Verified" after
  // the credential behind it had been revoked: a frozen display decision with
  // no date on it, copied into a bundle and then into an employer's snapshot.
  // The renderer now derives trust live through the Passport's own
  // describeTrust/validityOf on every open, so the flag had no reader left --
  // and `cv_source_bundle` in SQL does not write one either, which is what
  // makes the two builders produce the same shape.
}

export interface CvFactInsight {
  readonly snapshotId: string;
  readonly generatedAt: string;
}

/**
 * The complete factual input to CV generation.
 *
 * Serialisable and comparable, and every downstream check is expressed
 * against it.
 *
 * ── IT IS NOT SAFE TO LOG, AND THIS COMMENT USED TO SAY IT WAS ─────────
 *
 * The original sentence read "safe to log: it is the person's own data and
 * nothing else". The second half is true and the first does not follow from
 * it. This object is one named individual's employment history, their
 * credentials with issuers and dates, and the primary keys of the Passport
 * rows behind them. "Their own data" is a statement about WHOSE it is, not
 * about where it may be written.
 *
 * A comment like that is not inert. It is the sentence somebody reads at
 * three in the morning while adding a `console.error(err, bundle)` to debug a
 * failing save, and it tells them the thing they were about to do is fine.
 *
 * Nothing in this feature logs a bundle, a contact detail or a pasted job
 * advert. The two `console.error` calls in cv-store.functions.ts carry a
 * PostgREST error object and no payload, and `cv-pilot:check` asserts that no
 * log statement in the CV directory takes a bundle, a presentation or a
 * contact.
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
  /**
   * The facts the person asked to put ON this CV.
   *
   * `undefined` keeps everything, which is the picker's starting state. An
   * EMPTY ARRAY keeps nothing, and readiness then refuses the result.
   *
   * ── THIS IS THE PREVIEW'S COPY OF A RULE, NOT THE RULE ───────────────
   *
   * The bundle that gets STORED is built in SQL by `cv_source_bundle`, which
   * intersects the same array with rows the caller owns. This one exists so
   * the person can see what they will get before they ask for it, and so the
   * model receives no fact the finished document will not carry.
   *
   * `selection.ts` explains why it is an allowlist and not an exclusion list,
   * and 20261102090000 explains why a filter that lived only here was worth
   * nothing at all.
   */
  readonly includedIds?: CvIncludedIds;
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
  const included = input.includedIds;

  const target = input.targetJobText?.trim();

  return {
    bundleVersion: CV_SOURCE_BUNDLE_VERSION,
    locale,
    identity: {
      displayName: identity.displayName ?? "",
      headline: identity.headline,
      country: identity.workCountry ?? identity.accountCountry,
      // Only when the country IS the Passport work country. A sub-jurisdiction
      // is a statement about where the holder works; pairing it with the
      // account country it does not belong to would invent a location.
      countrySubdivision: identity.workCountry ? identity.workSubJurisdiction : null,
      // ── THE PUBLISHED TITLE, NEVER THE SLUG ──────────────────────────
      //
      // This used to be `currentProfessionSlug ?? currentProfessionOther`,
      // and it produced a defect that reached production.
      //
      // `cv_source_bundle` -- the SQL function that actually WRITES the saved
      // bundle -- resolves the slug to the published catalogue title for the
      // document's locale. This builder produced the raw slug. So for anybody
      // with a profession chosen from the catalogue the two disagreed
      // permanently: the stored CV said "Väktare" and this said "vaktare".
      //
      // `diffCvSourceBundles` compares `currentProfession` inside its identity
      // signature, so a CV created seconds ago immediately reported "your
      // profile has changed since this CV was saved" -- against a profile
      // nobody had touched. Confirming the update re-derived the bundle in
      // SQL, wrote the same title back, and the banner returned on the very
      // next read. It could not be cleared by any action a person could take.
      //
      // The same value also feeds `factualStoredPresentation`, which falls
      // back to it for the CV's headline. A person with no Passport headline
      // had a database slug printed on the document they send to employers.
      //
      // `professionLabel` is the rule every other surface already applies,
      // and it matches the SQL exactly: the published title for this locale,
      // else the free-text answer, else null. One rule, stated once.
      currentProfession: professionLabel(identity, locale),
      yearsOfExperience: identity.yearsOfExperience,
    },
    employment: keepOnly(
      newestFirst(identity.employment).map((e) => ({
        id: e.id,
        employerName: e.employerName,
        roleTitle: e.roleTitle,
        startedOn: e.startedOn,
        endedOn: e.endedOn,
        employmentType: e.employmentType,
        assertionLevel: e.assertionLevel,
      })),
      included,
    ),
    education: keepOnly(
      claimsOfType(identity.claims, EDUCATION_CLAIM_TYPES).map(toFactClaim),
      included,
    ),
    credentials: keepOnly(
      claimsOfType(identity.claims, CREDENTIAL_CLAIM_TYPES).map(toFactClaim),
      included,
    ),
    skills: keepOnly(claimsOfType(identity.claims, SKILL_CLAIM_TYPES).map(toFactClaim), included),
    languages: keepOnly(
      claimsOfType(identity.claims, LANGUAGE_CLAIM_TYPES).map(toFactClaim),
      included,
    ),
    careerInsight:
      includeCareerInsight && identity.discovery.hasCompletedReport && identity.discovery.snapshotId
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
  for (const group of [bundle.education, bundle.credentials, bundle.skills, bundle.languages]) {
    for (const c of group) ids.add(c.id);
  }
  return ids;
}
