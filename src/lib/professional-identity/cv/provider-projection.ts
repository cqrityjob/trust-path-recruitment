// What a language model is given, and what it is deliberately not.
//
// ── THE BUNDLE IS NOT THE PROMPT ───────────────────────────────────────
//
// `generateCvPresentation` used to pass the whole source bundle straight
// through as `governedContext: { facts: bundle }`. The bundle is the right
// object for the DOCUMENT — it is the person's own facts, with ids the
// validator and the renderer both need — and it is the wrong object to hand
// to a third party, because those same ids are stable identifiers for one
// human being:
//
//   identity.displayName        their name
//   employment[].id             the primary key of a row in
//                               sp_experience_periods
//   claims[].id                 the primary key of a row in sp_claims
//   careerInsight.snapshotId    which assessment run they took
//
// None of it is needed to phrase three bullet points about a job. All of it
// would sit in whatever the provider logs, and any two requests carrying the
// same uuid are joinable to the same person forever.
//
// ── SO THE PROMPT GETS A PROJECTION ────────────────────────────────────
//
// A separate object, built by taking only what the writing task needs:
//
//   KEPT     employer names, role titles, dates, credential titles, issuers,
//            levels, the headline, the profession, the years-of-experience
//            band. This is the material the bullets are ABOUT, and removing
//            it would not be minimisation, it would be asking a model to
//            invent.
//   DROPPED  the name, every uuid, the snapshot id, and anything else the
//            projection does not name explicitly. There is no passthrough
//            here: a field added to `CvSourceBundle` tomorrow does not reach
//            a provider by default, which is the only construction under
//            which "we did not think about that field" is safe.
//   REPLACED ids become ORDINAL KEYS — `e1`, `e2`, `c1` — assigned in
//            document order. They are meaningful inside one request and
//            meaningless outside it, which is exactly the property a
//            correlation key must not have.
//
// The country is kept: it is a market, not a person, and the document's own
// language and conventions depend on it. The years-of-experience BAND is
// kept for the same reason and is not a date of birth by any route.
//
// ── AND THE ANSWER IS REMAPPED, NOT TRUSTED ────────────────────────────
//
// The model cites `e1`. `resolveCitations` turns that back into the real
// employment id — and refuses anything it does not recognise, rather than
// dropping it. Dropping would make minimisation a laundering step in which
// an invented citation quietly disappears instead of rejecting the run, and
// `validation.ts` is explicit that a fabricated citation must reject the
// whole answer.

import type { CvPresentation } from "./schema";
import type { CvFactClaim, CvFactEmployment, CvSourceBundle } from "./source-bundle";

export const CV_PROVIDER_PROJECTION_VERSION = "cv-provider-facts-v1" as const;

/** One employment, as the model sees it. No id, no assertion level. */
interface ProviderEmployment {
  readonly id: string;
  readonly employerName: string;
  readonly roleTitle: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

/** One credential, education, skill or language, as the model sees it. */
interface ProviderClaim {
  readonly id: string;
  readonly title: string;
  readonly issuerName: string | null;
  readonly issuedOn: string | null;
  readonly level: string | null;
}

/**
 * The facts a provider receives.
 *
 * Every field is here because a sentence about this person's work needs it.
 * If a future reader cannot say which sentence needs a field they are adding,
 * that is the answer.
 */
export interface CvProviderFacts {
  readonly factsVersion: typeof CV_PROVIDER_PROJECTION_VERSION;
  readonly locale: "sv" | "en";
  /** No name. A headline and a profession describe the work; a name
   *  identifies the worker, and the model is not writing to them. */
  readonly headline: string | null;
  readonly profession: string | null;
  readonly country: string | null;
  readonly yearsOfExperience: string | null;
  readonly employment: readonly ProviderEmployment[];
  readonly education: readonly ProviderClaim[];
  readonly credentials: readonly ProviderClaim[];
  readonly skills: readonly ProviderClaim[];
  readonly languages: readonly ProviderClaim[];
  /**
   * WHETHER the person opted to include a career-direction result. Never
   * which one.
   *
   * A boolean, because the only thing the instruction needs it for is to know
   * that a labelled note will appear on the document. The snapshot id would
   * identify an assessment run and answers no question the model is asking.
   */
  readonly careerInsight: boolean;
}

export interface CvProviderProjection {
  readonly facts: CvProviderFacts;
  /** Ordinal key -> the real id it stands for. The only way back. */
  readonly realIdByKey: ReadonlyMap<string, string>;
}

function claimRow(claim: CvFactClaim, key: string): ProviderClaim {
  return {
    id: key,
    title: claim.title,
    issuerName: claim.issuerName,
    issuedOn: claim.issuedOn,
    level: claim.level,
  };
}

function employmentRow(fact: CvFactEmployment, key: string): ProviderEmployment {
  return {
    id: key,
    employerName: fact.employerName,
    roleTitle: fact.roleTitle,
    startedOn: fact.startedOn,
    endedOn: fact.endedOn,
  };
}

/**
 * Project one bundle for one provider request.
 *
 * Pure. The keys are assigned in document order, so `e1` is the first
 * employment the CV would show — which also makes a captured request
 * readable by a person auditing it, without being readable as a person.
 */
export function projectForProvider(bundle: CvSourceBundle): CvProviderProjection {
  const realIdByKey = new Map<string, string>();

  const employment = bundle.employment.map((fact, i) => {
    const key = `e${i + 1}`;
    realIdByKey.set(key, fact.id);
    return employmentRow(fact, key);
  });

  // One counter across all four claim sections, so a key is unique in the
  // request rather than only within its own list.
  let claimIndex = 0;
  const project = (claims: readonly CvFactClaim[]): ProviderClaim[] =>
    claims.map((claim) => {
      claimIndex += 1;
      const key = `c${claimIndex}`;
      realIdByKey.set(key, claim.id);
      return claimRow(claim, key);
    });

  return {
    facts: {
      factsVersion: CV_PROVIDER_PROJECTION_VERSION,
      locale: bundle.locale,
      headline: bundle.identity.headline,
      profession: bundle.identity.currentProfession,
      country: bundle.identity.country,
      yearsOfExperience: bundle.identity.yearsOfExperience,
      employment,
      education: project(bundle.education),
      credentials: project(bundle.credentials),
      skills: project(bundle.skills),
      languages: project(bundle.languages),
      careerInsight: bundle.careerInsight !== null,
    },
    realIdByKey,
  };
}

/** A citation the model made up. Named so the caller can reject the run
 *  rather than silently dropping the line it appeared on. */
export class UnknownCitationError extends Error {
  constructor(readonly key: string) {
    super(`unknown citation: ${key}`);
    this.name = "UnknownCitationError";
  }
}

/**
 * Turn the model's ordinal keys back into real ids.
 *
 * Throws on anything it does not recognise. That is deliberate and it is the
 * whole reason this is a function rather than a `.map()` with a `?? skip`:
 * an ordinal key that was never offered is a fabricated citation, and
 * `validation.ts` states that a fabricated citation rejects the RUN. Quietly
 * dropping it would turn the projection into a place where invention goes to
 * disappear.
 */
export function resolveCitations(
  presentation: CvPresentation,
  realIdByKey: ReadonlyMap<string, string>,
): CvPresentation {
  const real = (key: string): string => {
    const id = realIdByKey.get(key);
    if (id === undefined) throw new UnknownCitationError(key);
    return id;
  };

  return {
    ...presentation,
    experience: presentation.experience.map((item) => ({
      ...item,
      sourceId: real(item.sourceId),
    })),
    emphasisedClaimIds: presentation.emphasisedClaimIds.map(real),
  };
}
