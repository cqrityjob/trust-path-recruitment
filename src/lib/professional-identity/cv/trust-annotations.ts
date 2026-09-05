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

import { describeTrust, type TrustPresentation } from "@/lib/security-passport/trust-presentation";
import { isUnavailable, type ProfessionalIdentityV1 } from "../types";

export const CV_TRUST_ANNOTATIONS_VERSION = "cv-trust-annotations-v1" as const;

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
export function emptyCvTrustAnnotations(unavailable = false): CvTrustAnnotations {
  return {
    annotationsVersion: CV_TRUST_ANNOTATIONS_VERSION,
    employment: {},
    claims: {},
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
export function buildCvTrustAnnotations(identity: ProfessionalIdentityV1): CvTrustAnnotations {
  const unavailable = isUnavailable(identity, "provenance");
  if (unavailable) return emptyCvTrustAnnotations(true);

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
      lifecycleState: c.lifecycleState,
      verifierName: c.verifierName,
      verificationMethod: c.verificationMethod,
      verifiedOn: c.verifiedOn,
    });
  }

  return {
    annotationsVersion: CV_TRUST_ANNOTATIONS_VERSION,
    employment,
    claims,
    unavailable: false,
  };
}
