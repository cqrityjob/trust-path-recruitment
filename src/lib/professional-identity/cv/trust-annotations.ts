// Verification provenance for a CV — on a channel the model cannot reach.
//
// ── THE PROBLEM THIS FILE SOLVES ───────────────────────────────────────
//
// The CV needs to be able to print
//
//     Bevakning AB · Security Officer · Jan 2024 – Dec 2025
//     Employment confirmed by Bevakning AB
//
// and the obvious way to do that is to add `verifierName` to
// `CvSourceBundle` next to `employerName`, where the renderer already reads
// everything else it prints.
//
// That would be a serious mistake, and it is worth being precise about why.
//
// `generation.ts` passes the ENTIRE bundle to the provider as
// `governedContext: { facts: bundle }`. Every field in the bundle is text in
// front of a language model that has been asked to write a summary and some
// bullets. Put a verifier organisation in there and the model can write
//
//     "A verified security professional, confirmed by Bevakning AB and
//      certified by BYA."
//
// — a sentence composed of two real names and one act that never happened,
// in free prose, on a document sent to employers. The validator screens
// generated text for verification language and would probably catch that
// one; "probably" is not the standard for a trust claim, and a control that
// depends on a phrase list catching every rephrasing is a control that has
// already lost. The bundle's own header states the principle: the guarantee
// is carried by what the model CANNOT SEE, not by what it is asked not to
// say.
//
// ── SO PROVENANCE TAKES A DIFFERENT ROUTE ──────────────────────────────
//
//   identity ──> CvSourceBundle ──> provider prompt ──> presentation
//        │              (facts the model may rephrase)         │
//        │                                                     ▼
//        └────────> CvTrustAnnotations ──────────────────> CvDocument
//                   (renderer-only; never serialised into governedContext)
//
// Two objects, built from the same identity read, joined only at the point
// where a React component or a print stylesheet turns them into pixels. The
// model receives the first and never the second. There is no field in
// `cvPresentationOutput` that could carry a verifier even if a model tried,
// and no string here ever passes through a prompt.
//
// `scripts/professional-identity-check.ts` asserts both halves: that no
// verifier field exists anywhere in a built bundle, and that the annotations
// survive into the document. If somebody later "tidies" these two together,
// that check fails and says why.
//
// ── AND IT IS NEVER STORED ─────────────────────────────────────────────
//
// `cv_documents.presentation` holds bullets and ids, never facts. Annotations
// are rebuilt from the live identity every time a saved CV is opened, which
// is what makes a revoked verification disappear from a CV somebody saved in
// March without anything having to go back and edit it.
//
// ── AND EXPIRY TRAVELS ON THE SAME CHANNEL, FOR THE SAME REASON ────────
//
// A lapsed authorisation is the one thing a CV must never present as
// current. It used to, here, and the mechanism is worth recording because
// nothing about the code looked wrong:
//
// `validity.ts` states the Passport's rule — expiry is DERIVED at read time
// and never stored, because anything that writes `lifecycle_state =
// 'expired'` on the day a licence lapses is a job that can stop running and
// leave a dead licence reading VERIFIED · ACTIVE. Every other surface
// applies `validityOf` accordingly: the Passport Card, the recipient page,
// the social card, the attention list, the entry page.
//
// The CV did not. It read `lifecycleState` straight off `sp_claims`, where
// a lapsed credential is still `active` and still `verified` — because
// somebody really did verify it, once — and so a Väktare authorisation that
// expired last spring was printed with a gold check, an attribution line
// naming the verifier, and no expiry date anywhere on the page. On the one
// document that goes to employers.
//
// The fix is not a rule of the CV's own. It is the Passport's own function,
// applied at the one point where this file decides what may be said:
// `describeTrust` is given the EFFECTIVE lifecycle, so a lapsed credential
// arrives as expired and `describeTrust`'s existing "only `active` is
// current trust" branch does the rest.
//
// `validity` below carries the dates so the renderer can go further than
// silence and SAY it lapsed. Silence would technically satisfy "never
// present an expired authorisation as valid" while leaving the reader to
// assume the credential is simply unverified, which is a different and also
// untrue statement.
//
// It sits here, next to the trust it belongs with, and not on the bundle —
// so it is renderer-only, and no model ever receives a validity date to
// write "currently certified" around.

import { describeTrust, type TrustPresentation } from "@/lib/security-passport/trust-presentation";
import { todayIso } from "@/lib/security-passport/dates";
import { validityOf } from "@/lib/security-passport/validity";
import type { IsoDate, LifecycleState } from "@/lib/security-passport/types";
import { isUnavailable, type ProfessionalIdentityV1 } from "../types";

export const CV_TRUST_ANNOTATIONS_VERSION = "cv-trust-annotations-v1" as const;

/**
 * How current one credential is, as of the day the page was built.
 *
 * `validUntil` is the LIVE date, not the one frozen into the saved bundle.
 * A saved CV freezes career content — the title, the issuer, the dates the
 * person reviewed and accepted — and this is not career content: it is the
 * Passport's current answer about whether the credential still stands. A
 * renewal must therefore show through immediately, exactly as a revocation
 * does, and for the same reason. The frozen copy would otherwise print a
 * date that has passed next to a mark saying the credential is current, and
 * the two would be arguing with each other on one line.
 */
export interface CvCredentialValidity {
  readonly validUntil: string | null;
  readonly hasExpired: boolean;
  /** Still valid, but inside the Passport's own warning window. Rendered as
   *  a date rather than an alarm: a CV is not a reminder service, and an
   *  employer reading "valid until next month" has what they need. */
  readonly expiresSoon: boolean;
}

export interface CvTrustAnnotations {
  readonly annotationsVersion: typeof CV_TRUST_ANNOTATIONS_VERSION;
  // Plain records rather than Maps: `CvDocument` is returned by a server
  // function and crosses the serialisation boundary, which a Map does not
  // survive. The compiler enforces this, and it is worth stating because
  // the natural shape for a lookup keyed by id is a Map.
  /** Keyed by employment id — the same ids the bundle carries. */
  readonly employment: Readonly<Record<string, TrustPresentation>>;
  /** Keyed by claim id, covering education, credentials, skills and
   *  languages alike; the renderer looks up whatever it is about to draw. */
  readonly claims: Readonly<Record<string, TrustPresentation>>;
  /** Keyed by claim id, for every claim that carries a validity date. A
   *  claim with no expiry has no entry, which is the ordinary case: a degree
   *  does not lapse. */
  readonly validity: Readonly<Record<string, CvCredentialValidity>>;
  /** The day the annotations were derived. Carried so the export can be
   *  honest about being a dated snapshot rather than a live document. */
  readonly evaluatedOn: string;
  /**
   * The provenance read did not answer.
   *
   * The renderer must then draw NO trust decoration at all — not a negative
   * one. "This candidate has no verified credentials" and "we could not
   * read whether this candidate has verified credentials" are different
   * statements, and only the second one is true here. Omitting is the safe
   * failure for an exported document, because a CV that silently loses a
   * trust line is merely plainer, while one that gains a false negative has
   * misrepresented its owner to an employer.
   */
  readonly unavailable: boolean;
}

/** No provenance for anything. The correct starting point for any caller
 *  that has facts but has not established their trust standing. */
export function emptyCvTrustAnnotations(
  unavailable = false,
  evaluatedOn: string = todayIso(),
): CvTrustAnnotations {
  return {
    annotationsVersion: CV_TRUST_ANNOTATIONS_VERSION,
    employment: {},
    claims: {},
    validity: {},
    evaluatedOn,
    unavailable,
  };
}

/**
 * Build the annotations for one person, from the identity read they already
 * have. No query of its own — §24 and §25 of the brief, and the reason the
 * provenance reads were put in `identity.functions.ts` rather than here.
 *
 * Every entry goes through `describeTrust`, so a CV cannot reach a different
 * conclusion from My Career or the Career Card about the same fact.
 */
export function buildCvTrustAnnotations(
  identity: ProfessionalIdentityV1,
  /** Pinned by the guard scripts so an expiry assertion does not depend on
   *  the day the suite happens to run. Production passes nothing. */
  evaluationOn: string = todayIso(),
): CvTrustAnnotations {
  const unavailable = isUnavailable(identity, "provenance");
  // The validity of a credential is arithmetic on a date the claims read
  // already returned, so it survives a failed PROVENANCE read: "we could not
  // establish who verified this" and "this lapsed in March" are independent
  // statements, and suppressing the second because the first is unknown
  // would hide the more important one.
  const validity = buildValidity(identity, evaluationOn);
  if (unavailable) {
    return { ...emptyCvTrustAnnotations(true, evaluationOn), validity };
  }

  const employment: Record<string, TrustPresentation> = {};
  for (const e of identity.employment) {
    employment[e.id] = describeTrust({
      assertionLevel: e.assertionLevel,
      verifierName: e.verifierName,
      verificationMethod: e.verificationMethod,
      verifiedOn: e.verifiedOn,
      subjectKind: "employment",
    });
  }

  const claims: Record<string, TrustPresentation> = {};
  for (const c of identity.claims) {
    claims[c.id] = describeTrust({
      assertionLevel: c.assertionLevel,
      // THE EFFECTIVE LIFECYCLE, never the stored one. See the file header:
      // `sp_claims` leaves a lapsed credential `active` on purpose, and
      // passing that through is what printed an expired authorisation on a
      // CV as verified and current.
      lifecycleState: effectiveLifecycle(c, evaluationOn),
      verifierName: c.verifierName,
      verificationMethod: c.verificationMethod,
      verifiedOn: c.verifiedOn,
    });
  }

  return {
    annotationsVersion: CV_TRUST_ANNOTATIONS_VERSION,
    employment,
    claims,
    validity,
    evaluatedOn: evaluationOn,
    unavailable: false,
  };
}

/** The Passport's own derivation, not a second one. */
function effectiveLifecycle(
  claim: { readonly lifecycleState: string; readonly validUntil: string | null },
  evaluationOn: string,
): LifecycleState {
  return validityOf(
    claim.lifecycleState as LifecycleState,
    claim.validUntil as IsoDate | null,
    evaluationOn as IsoDate,
  ).effectiveState;
}

function buildValidity(
  identity: ProfessionalIdentityV1,
  evaluationOn: string,
): Record<string, CvCredentialValidity> {
  const out: Record<string, CvCredentialValidity> = {};
  for (const c of identity.claims) {
    if (!c.validUntil) continue;
    const v = validityOf(
      c.lifecycleState as LifecycleState,
      c.validUntil as IsoDate,
      evaluationOn as IsoDate,
    );
    out[c.id] = {
      validUntil: v.validUntil,
      hasExpired: v.hasExpired,
      expiresSoon: v.expiresSoon,
    };
  }
  return out;
}
