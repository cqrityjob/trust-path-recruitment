// The CV document — facts first, presentation on top.
//
// ── WHY THE FACTUAL DOCUMENT IS BUILT FIRST, ALWAYS ────────────────────
//
// Because the CV has to exist without a language model. The provider may be
// unconfigured, unreachable, slow, or its output may be rejected by the
// validator — and in every one of those cases the person still has a real
// professional history and still wants a document. So the factual CV is the
// product, and the assisted draft is an ENHANCEMENT applied to it.
//
// This is the same shape the rest of the codebase already uses for AI: the
// governed pack works with no AI at all, and the interview can be run
// without it. A feature whose failure mode is "nothing" is a feature nobody
// can rely on.
//
// ── WHERE EVERY WORD ON THE PAGE COMES FROM ────────────────────────────
//
//   employer, role, dates      the source bundle. NEVER the model.
//   credential titles, issuers the source bundle. NEVER the model.
//   the verified mark          `CvFactClaim.verified`, which is
//                              `isVerifiedClaim` and nothing else.
//   WHO verified it            `trust`, built from the Passport decision
//                              record and carried on a channel the model
//                              never sees. See `trust-annotations.ts` for
//                              why it is not a field on the bundle.
//   headline, summary, bullets the model, when a run succeeded — and marked
//                              as such in `aiWritten` so the review screen
//                              can show the person which words are theirs
//                              and which were drafted for them.
//
// A reader of this file should be able to answer "could a model have
// invented this line?" for every field, from the types alone.

import type { CvPresentation } from "./schema";
import type { CvFactClaim, CvFactEmployment, CvSourceBundle } from "./source-bundle";
import { emptyCvTrustAnnotations, type CvTrustAnnotations } from "./trust-annotations";

export const CV_DOCUMENT_VERSION = "cv-document-v1" as const;

/** How the document came to be, carried onto the page and into the export. */
export type CvOrigin =
  /** No model involved. Every word is the person's own. */
  | "factual"
  /** A validated model draft, applied over the same facts. */
  | "ai_assisted";

export interface CvExperienceSection {
  /** The employment itself. Untouched. */
  readonly fact: CvFactEmployment;
  /** Drafted lines, when a run succeeded. Empty otherwise — an employment
   *  with no bullets renders as employer, role and dates, which is a
   *  perfectly ordinary CV entry. */
  readonly bullets: readonly string[];
  readonly bulletsAreAiWritten: boolean;
}

export interface CvDocument {
  readonly documentVersion: typeof CV_DOCUMENT_VERSION;
  readonly origin: CvOrigin;
  readonly locale: "sv" | "en";

  readonly displayName: string;
  readonly country: string | null;

  /** The person's own headline, or the model's tightened version of it. */
  readonly headline: string | null;
  readonly headlineIsAiWritten: boolean;

  /** Absent on a factual document: a summary is prose, and this product
   *  does not write prose on somebody's behalf without saying so. */
  readonly summary: string | null;
  readonly summaryIsAiWritten: boolean;

  readonly experience: readonly CvExperienceSection[];
  readonly education: readonly CvFactClaim[];
  readonly credentials: readonly CvFactClaim[];
  readonly skills: readonly CvFactClaim[];
  readonly languages: readonly CvFactClaim[];

  /** Present only when the person opted in. The renderer labels it as an
   *  assessment insight; it is never listed among skills or credentials. */
  readonly careerInsightSnapshotId: string | null;

  /** One sentence explaining the arrangement, when a model produced one. */
  readonly tailoringRationale: string | null;

  /** Employments the draft left out, named so the review step can offer
   *  them back. Silence about an omission is an edit the person did not
   *  make and was not told about. */
  readonly omittedEmployment: readonly CvFactEmployment[];

  // ── WHO VERIFIED WHAT ───────────────────────────────────────────────
  //
  // Renderer-only. Keyed by the same fact ids the sections above carry, so
  // a component drawing an employment looks up that employment's standing
  // and draws the line the Passport would draw, or draws nothing.
  //
  // Deliberately NOT part of `CvSourceBundle`: the bundle is handed to a
  // language model and this is the one thing on the page that must never
  // be available for a model to rephrase. `trust-annotations.ts` sets out
  // the full argument.
  readonly trust: CvTrustAnnotations;
}

/** The document anybody can have: their own facts, in order, unembellished. */
export function buildFactualCvDocument(
  bundle: CvSourceBundle,
  trust: CvTrustAnnotations = emptyCvTrustAnnotations(),
): CvDocument {
  return {
    trust,
    documentVersion: CV_DOCUMENT_VERSION,
    origin: "factual",
    locale: bundle.locale,
    displayName: bundle.identity.displayName,
    country: bundle.identity.country,
    headline: bundle.identity.headline,
    headlineIsAiWritten: false,
    summary: null,
    summaryIsAiWritten: false,
    experience: bundle.employment.map((fact) => ({
      fact,
      bullets: [],
      bulletsAreAiWritten: false,
    })),
    education: bundle.education,
    credentials: bundle.credentials,
    skills: bundle.skills,
    languages: bundle.languages,
    careerInsightSnapshotId: bundle.careerInsight?.snapshotId ?? null,
    tailoringRationale: null,
    omittedEmployment: [],
  };
}

/**
 * Apply a VALIDATED presentation over the facts.
 *
 * Callers must run `validateCvPresentation` first. This function assumes
 * every id resolves, because a presentation that reached here has already
 * been checked against the bundle it was built from — re-deciding that here
 * would put the rule in two places, and the second copy is the one that
 * drifts.
 *
 * Ordering comes from the presentation (that is what tailoring IS), and
 * anything it left out is reported rather than dropped.
 */
export function applyCvPresentation(
  bundle: CvSourceBundle,
  presentation: CvPresentation,
  trust: CvTrustAnnotations = emptyCvTrustAnnotations(),
): CvDocument {
  const base = buildFactualCvDocument(bundle, trust);
  const byId = new Map(bundle.employment.map((e) => [e.id, e]));

  const ordered: CvExperienceSection[] = [];
  const used = new Set<string>();
  for (const item of presentation.experience) {
    const fact = byId.get(item.sourceId);
    if (!fact) continue; // Unreachable after validation; not worth a throw.
    used.add(fact.id);
    ordered.push({ fact, bullets: item.bullets, bulletsAreAiWritten: true });
  }

  const emphasised = new Set(presentation.emphasisedClaimIds);
  /** Emphasised first, everything else in its original order behind it. A
   *  claim is never REMOVED by emphasis — foregrounding some of somebody's
   *  qualifications must not quietly delete the rest. */
  const reorder = (claims: readonly CvFactClaim[]): readonly CvFactClaim[] => [
    ...claims.filter((c) => emphasised.has(c.id)),
    ...claims.filter((c) => !emphasised.has(c.id)),
  ];

  return {
    ...base,
    origin: "ai_assisted",
    headline: presentation.headline,
    headlineIsAiWritten: true,
    summary: presentation.summary,
    summaryIsAiWritten: true,
    experience: ordered,
    skills: reorder(base.skills),
    languages: reorder(base.languages),
    credentials: reorder(base.credentials),
    tailoringRationale: presentation.tailoringRationale,
    omittedEmployment: bundle.employment.filter((e) => !used.has(e.id)),
  };
}
