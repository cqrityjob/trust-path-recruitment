// The ONE interpretation of "what is this fact's trust standing".
//
// ── WHY THERE IS EXACTLY ONE OF THESE ──────────────────────────────────
//
// Three surfaces now say something about verification: My Career summarises
// it, the CV prints it under an employment, and the Career Card compresses
// it into a line somebody screenshots and sends to a stranger. Written
// independently, those three become three wording engines, and three
// wording engines eventually disagree — the Passport saying "Confirmed by
// Bevakning AB", the CV saying "Verified by CQrityjob", the card saying
// nothing at all, about one employment, on one afternoon.
//
// So they do not each decide. They each call `describeTrust`, which takes
// structured provenance and returns display metadata, and the difference
// between "an employer confirmed this employment" and "CQrityjob read a
// document" is made here once or is not made at all.
//
// ── WHAT THIS FILE IS NOT ──────────────────────────────────────────────
//
// It is not a new trust level. `TrustStatus` is a PRESENTATION grouping
// over facts the Passport already recorded — it adds no rung to the ladder,
// it stores nothing, and it cannot promote anything. Every value it returns
// is a function of `assertionLevel`, `lifecycleState` and the decision
// record, and if all three say "nobody verified this" there is no argument
// available here that says otherwise.
//
// It is also not a place to put wording. The sentences live in the Passport
// copy tables and are chosen by `verifierAttributionKey`, which already
// encodes "the label follows the METHOD, not the object". This composes.
//
// ── UNKNOWN IS A VALUE ─────────────────────────────────────────────────
//
// PR 4's rule, carried into the outputs: a provenance read that FAILED must
// not render as "not verified". `status: "unknown"` exists so a caller that
// could not load the decision record has something true to say, and so that
// the CV can omit its trust decoration entirely rather than print a
// negative state it did not establish.

import { passportT, type PassportCopyKey, type PassportLang } from "./i18n";
import { verifierAttributionKey } from "./format";
import {
  effectiveAssertionLevel,
  isLegacyUnsupportedEntry,
  isLegacyUnsupportedProvenance,
  type ProvenanceBearing,
} from "./provenance";
import {
  credentialPresentation,
  presentationWordKey,
  type CredentialPresentationState,
  type OpenReviewStatus,
} from "./design/credential-symbols";
import type { LifecycleState, VerificationMethod } from "./types";

export { effectiveAssertionLevel, isLegacyUnsupportedEntry, type ProvenanceBearing };

/**
 * How much the product may claim about a fact, as a presentation grouping.
 *
 * Ordered weakest to strongest for the reader's benefit only. Nothing
 * compares these to decide a promotion.
 */
export type TrustStatus =
  /** The person stated it. True as a statement by its holder, and that is
   *  all it is. No mark, no attribution. */
  | "self_reported"
  /** A document was attached and nobody has assessed it. Explicitly NOT a
   *  verification: "evidence exists" and "evidence was checked" are the two
   *  states this product most needs to keep apart. */
  | "document_provided"
  /** An authorised verifier decided, and the decision record says who. */
  | "verified"
  /** The trust standing could not be READ. Not a claim about the fact. */
  | "unknown";

/**
 * WHICH act produced the trust, when there was one.
 *
 * Mirrors `VerificationMethod` exactly and deliberately: this type exists so
 * consumers can branch on the act without importing decision internals, and
 * the day a registry method is added to the Passport it is added here and
 * every surface starts distinguishing it at once. Nothing here is inferred —
 * the value is the recorded `verification_method` or null.
 */
export type TrustSourceType =
  | VerificationMethod
  | "unattributed"
  /** A source-confirmation method that CQrityjob recorded about itself,
   *  before 20261029090000 made that unwritable. Verified -- an authorised
   *  verifier really decided -- but by CQrityjob reading something, not by
   *  the employer or the issuer, so it wears no source attribution. */
  | "legacy_unsupported";

export interface TrustPresentation {
  readonly status: TrustStatus;
  /** Null unless `status` is `verified`. */
  readonly sourceType: TrustSourceType | null;
  /** The DECIDER. Never the issuer, never the employer a period names. */
  readonly organisation: string | null;
  readonly method: VerificationMethod | null;
  /** The decision date, ISO day, when one is recorded. */
  readonly date: string | null;
  /** The full reader-facing line, or null when there is nothing true to
   *  say. Null is a real answer and callers must render nothing for it. */
  readonly labelSv: string | null;
  readonly labelEn: string | null;
  /** A short standalone word for the state, for compact surfaces and for
   *  screen readers. Always present — this is what makes the indicator
   *  legible without colour. */
  readonly shortSv: string;
  readonly shortEn: string;
}

export interface DescribeTrustInput {
  /** `self_declared` | `document_provided` | `verified`. */
  readonly assertionLevel: string;
  /** `active` | `expired` | `revoked` | … Absent for employment periods,
   *  which the read model already filters to active. */
  readonly lifecycleState?: string | null;
  /** The DECIDER organisation from the decision record, already gated by
   *  `printableProvenance`. Never an issuer string. */
  readonly verifierName?: string | null;
  readonly verificationMethod?: VerificationMethod | string | null;
  readonly verifiedOn?: string | null;
  /** True when the provenance read did not answer. Overrides everything:
   *  a fact whose trust could not be read has an unknown standing, not a
   *  negative one. */
  readonly provenanceUnavailable?: boolean;
}

const SHORT: Record<TrustStatus, { sv: string; en: string }> = {
  self_reported: { sv: "Egen uppgift", en: "Self-reported" },
  document_provided: { sv: "Dokument inlämnat", en: "Document provided" },
  verified: { sv: "Verifierad", en: "Verified" },
  unknown: { sv: "Kunde inte läsas", en: "Could not be loaded" },
};

function line(
  key: PassportCopyKey,
  organisation: string | null,
  lang: PassportLang,
): string | null {
  if (!organisation) return null;
  return `${passportT(key, lang)} ${organisation}`;
}

/**
 * Interpret one fact's structured provenance into display metadata.
 *
 * Pure, deterministic and total. Given the same four stored values it
 * returns the same presentation on every surface, which is precisely the
 * property that makes "no surface may contradict another" checkable rather
 * than aspirational.
 */
export function describeTrust(input: DescribeTrustInput): TrustPresentation {
  const {
    assertionLevel,
    lifecycleState,
    verifierName = null,
    verificationMethod = null,
    verifiedOn = null,
    provenanceUnavailable = false,
  } = input;

  const none = (status: TrustStatus): TrustPresentation => ({
    status,
    sourceType: null,
    organisation: null,
    method: null,
    date: null,
    labelSv: null,
    labelEn: null,
    shortSv: SHORT[status].sv,
    shortEn: SHORT[status].en,
  });

  if (provenanceUnavailable) return none("unknown");

  // ── ONLY `active` IS CURRENT TRUST ───────────────────────────────────
  //
  // `expired` and `revoked` are not merely history. A credential that has
  // expired is not currently a verified credential, whatever was decided
  // about it in 2024, and a revoked one is a conclusion actively withdrawn.
  // `disputed` is contested, `superseded` replaced, `withdrawn` taken back,
  // and `draft` was never submitted. The assertion level does not move when
  // the lifecycle does -- deliberately, since the verification really did
  // happen -- so the lifecycle is asked first and the mark is refused on
  // everything except `active`.
  //
  // An entry that passes NO lifecycle at all is unaffected: employment
  // periods arrive already filtered to active by the read model, and
  // `undefined` is not a state to judge.
  const lapsed = lifecycleState != null && lifecycleState !== "active";
  if (lapsed) return none("self_reported");

  if (assertionLevel !== "verified") {
    return none(assertionLevel === "document_provided" ? "document_provided" : "self_reported");
  }

  // ── A SOURCE METHOD CQRITYJOB RECORDED ABOUT ITSELF ──────────────────
  //
  // Three hosted rows predate the rule that a method must belong to the
  // deciding party. They stay as written; what they may SAY is decided here,
  // once, and it is the neutral sentence: a review was recorded, and a direct
  // source confirmation cannot be shown. `method` is null on purpose --
  // `isEmployerConfirmed` and every "confirmed by" branch downstream key on
  // it, and none of them may fire for a confirmation nobody gave.
  if (isLegacyUnsupportedProvenance(verificationMethod, verifierName)) {
    return {
      status: "verified",
      sourceType: "legacy_unsupported",
      organisation: verifierName,
      method: null,
      date: verifiedOn,
      labelSv: passportT("trust.legacy.unsupported", "sv"),
      labelEn: passportT("trust.legacy.unsupported", "en"),
      // The short word is the LEVEL word, not "Verified": a compact surface
      // or a screen reader gets the same answer the pill gives.
      shortSv: passportT("trust.level.documented", "sv"),
      shortEn: passportT("trust.level.documented", "en"),
    };
  }

  // Verified, but the decision record does not name a decider. That happens
  // only for rows predating the PR 5 rule that an approval must state one.
  // The status stays `verified` -- an authorised verifier really did decide
  // -- and the attribution line is simply absent, because there is nobody
  // this product may name.
  const method = (verificationMethod as VerificationMethod | null) ?? null;
  const key = verifierAttributionKey(method);

  return {
    status: "verified",
    sourceType: method ?? "unattributed",
    organisation: verifierName,
    method,
    date: verifiedOn,
    labelSv: line(key, verifierName, "sv"),
    labelEn: line(key, verifierName, "en"),
    shortSv: SHORT.verified.sv,
    shortEn: SHORT.verified.en,
  };
}

/** The line in one language, or null. Convenience for renderers. */
export function trustLabel(trust: TrustPresentation, lang: PassportLang): string | null {
  return lang === "sv" ? trust.labelSv : trust.labelEn;
}

/** The short state word in one language. Always present. */
export function trustShortLabel(trust: TrustPresentation, lang: PassportLang): string {
  return lang === "sv" ? trust.shortSv : trust.shortEn;
}

/**
 * True when this fact was confirmed by an EMPLOYER specifically.
 *
 * The distinction §9 of the brief turns on: an employment may reach
 * `verified` through document review, and calling that "confirmed by
 * Company X" would attribute to the employer an act CQrityjob performed.
 */
export function isEmployerConfirmed(trust: TrustPresentation): boolean {
  return trust.status === "verified" && trust.method === "employer_confirmation";
}

/**
 * The attribution line for an EMPLOYMENT, in employment's own words.
 *
 * ── WHY A SECOND REGISTER AND NOT A SECOND ENGINE ──────────────────────
 *
 * "Confirmed by Bevakning AB" under a credential is unambiguous. The same
 * five words under an employment on a CV are not: beside a company name in
 * an experience section they read as easily as "this company confirmed
 * something about this person" — or, worse, as the company endorsing them.
 * "Employment confirmed by Bevakning AB" says which fact was confirmed.
 *
 * So the WORDS differ by context while the DECISION does not. This function
 * branches on exactly the same recorded `method` as `verifierAttributionKey`
 * and reaches exactly the same conclusion about what happened; it only says
 * it in the register the surrounding section needs. There is still one place
 * where a method becomes a sentence, which is the property that matters —
 * two registers of one engine, never two engines.
 *
 * Anything that is not an employer confirmation falls back to the shared
 * attribution key, so an employment CQrityjob verified by reading a contract
 * says "Document reviewed by CQrityjob" and does not borrow the employer's
 * voice for an act the employer did not perform.
 */
export function employmentTrustLine(trust: TrustPresentation, lang: PassportLang): string | null {
  if (trust.status !== "verified" || !trust.organisation) return null;
  // The legacy sentence is already complete and already names the decider.
  if (trust.sourceType === "legacy_unsupported") return trustLabel(trust, lang);
  const key: PassportCopyKey =
    trust.method === "employer_confirmation"
      ? "employment.attribution.employer_confirmation"
      : verifierAttributionKey(trust.method);
  return `${passportT(key, lang)} ${trust.organisation}`;
}

/**
 * The copy key for a recorded verification METHOD, as a reader should see it.
 *
 * The single replacement for the per-surface `METHOD_KEY` tables that used
 * to sit in the recipient page, the credential page and the holder's panel.
 * Four copies of one mapping were four places to forget the legacy rule; this
 * is the one place it is applied. Null for a method this build has no words
 * for -- registry and authority verification arrive as new methods -- so a
 * caller prints the stored code or "not stated" rather than a guess.
 */
export function methodLabelKey(
  method: string | null | undefined,
  organisation: string | null | undefined,
): PassportCopyKey | null {
  if (!method) return null;
  // A short VALUE for the method cell. The explanatory sentence
  // (trust.legacy.unsupported) is rendered beside it, once, by the surface.
  if (isLegacyUnsupportedProvenance(method, organisation)) return "trust.legacy.method";
  switch (method) {
    case "document_review":
      return "ver.method.document_review";
    case "employer_confirmation":
      return "ver.method.employer_confirmation";
    case "issuer_confirmation":
      return "ver.method.issuer_confirmation";
    default:
      return null;
  }
}

/**
 * The three words a reader outside the product is given, derived from what
 * the record actually supports.
 *
 * ── NOT A FOURTH TRUST STATE ───────────────────────────────────────────
 *
 * A presentation grouping over the stored axes, exactly like `TrustStatus`.
 * It stores nothing and promotes nothing:
 *
 *   self_declared    the holder said so, or attached a file nobody assessed
 *   documented       an authorised CQrityjob verifier decided, having read
 *                    evidence -- INCLUDING a legacy row whose stored method
 *                    claims more than a CQrityjob decision can support
 *   source_verified  the employer confirmed employment they were party to,
 *                    or (in a later release) the issuer confirmed
 *
 * Null when the standing could not be read: `unknown` is not a level.
 */
export type PublicTrustLevel = "self_declared" | "documented" | "source_verified";

export function publicTrustLevel(trust: TrustPresentation): PublicTrustLevel | null {
  switch (trust.status) {
    case "unknown":
      return null;
    case "self_reported":
    case "document_provided":
      return "self_declared";
    case "verified":
      return trust.sourceType === "employer_confirmation" ||
        trust.sourceType === "issuer_confirmation"
        ? "source_verified"
        : "documented";
  }
}

/** The copy key for a public trust level. Three words, and a fourth for a
 *  standing that could not be read. */
export function trustLevelWordKey(level: PublicTrustLevel | null): PassportCopyKey {
  switch (level) {
    case "self_declared":
      return "trust.level.self_declared";
    case "documented":
      return "trust.level.documented";
    case "source_verified":
      return "trust.level.source_verified";
    default:
      return "trust.level.unknown";
  }
}

/**
 * Whether a trust presentation may wear the present-tense VERIFIED
 * decoration -- the gold check, the filled pill, the count.
 *
 * `status === "verified"` says an authorised verifier decided. That stays
 * true for a legacy unsupported row, because it did. What such a row may not
 * do is PRESENT as verified: its effective level is documented. Every
 * consumer that used to test the status directly asks this instead.
 */
export function presentsAsVerified(trust: TrustPresentation): boolean {
  return trust.status === "verified" && trust.sourceType !== "legacy_unsupported";
}

/**
 * The credential symbol state for an entry, from its EFFECTIVE level.
 *
 * The one replacement for `credentialPresentation(entry.assertionLevel, …)`
 * at every call site. A legacy unsupported entry arrives at the symbol
 * system as document_provided and takes the documented mark -- the state
 * that already exists for "CQrityjob has something to look at, and no source
 * has confirmed it" -- never the approved mark.
 */
export function credentialPresentationOf(
  entry: ProvenanceBearing,
  effectiveLifecycle: LifecycleState,
  openReview: OpenReviewStatus = null,
): CredentialPresentationState {
  return credentialPresentation(effectiveAssertionLevel(entry), effectiveLifecycle, openReview);
}

/**
 * The status WORD beside a credential symbol, for an entry.
 *
 * Ordinarily the symbol vocabulary's own word for the state. For a legacy
 * unsupported entry that has taken the documented state, the level word
 * "Dokumenterad / Documented" rather than "document provided": CQrityjob did
 * review it, and saying otherwise would be a different untruth.
 */
export function presentationWordKeyOf(
  entry: ProvenanceBearing,
  state: CredentialPresentationState,
): PassportCopyKey {
  if (state === "documented" && isLegacyUnsupportedEntry(entry)) return "trust.level.documented";
  return presentationWordKey(state);
}

/** The three field labels a provenance block carries: who, how, when. */
export interface ProvenanceLabelKeys {
  readonly by: PassportCopyKey;
  readonly method: PassportCopyKey;
  readonly at: PassportCopyKey;
}

/**
 * Field labels that do not themselves claim what the record cannot support.
 *
 * "Verified by / Method / Verified" is right for a verification. For a
 * legacy unsupported row the labels are "Reviewed by / Review method /
 * Reviewed": a label is a claim too, and a reader takes "Verified by
 * CQrityjob" at face value however carefully the value beside it is worded.
 */
export function provenanceLabelKeys(entry: ProvenanceBearing): ProvenanceLabelKeys {
  if (isLegacyUnsupportedEntry(entry)) {
    return { by: "trust.reviewedBy", method: "trust.reviewMethod", at: "trust.reviewedAt" };
  }
  return { by: "rec.verifiedBy", method: "rec.method", at: "rec.verifiedAt" };
}

/**
 * Whether a subject's decision history holds an approval of the legacy
 * unsupported shape. Drives the reviewer's re-review warning; decides
 * nothing and edits nothing.
 */
export function hasLegacyUnsupportedApproval(
  decisions: readonly {
    readonly decision: string;
    readonly method: string | null;
    readonly organisation: string | null;
  }[],
): boolean {
  return decisions.some(
    (d) => d.decision === "approved" && isLegacyUnsupportedProvenance(d.method, d.organisation),
  );
}

/**
 * Is this entry CURRENTLY verified — as opposed to having been verified once?
 *
 * ── THE DISTINCTION THIS EXISTS TO KEEP ────────────────────────────────
 *
 * `assertion_level = verified` records that a verification HAPPENED. It is
 * history, it is true forever, and revoking a credential does not un-happen
 * it — which is exactly why the two fields are separate and why the fix for
 * a revoked credential is never to rewrite the assertion level.
 *
 * `lifecycle_state` says whether that conclusion STILL STANDS. Only `active`
 * does. A revoked credential's verification is withdrawn; a disputed one is
 * contested; an expired one has lapsed; a superseded or withdrawn one has
 * been replaced or taken back. None of them may wear the present-tense word
 * "Verified", be counted in a current total, or carry a trust decoration.
 *
 * ── WHY IT LIVES HERE ──────────────────────────────────────────────────
 *
 * Three surfaces were each deciding this for themselves, and two of them
 * decided it by asking about the assertion level alone. The Passport summary
 * therefore counted a revoked credential as verified while My Career, using
 * `isVerifiedClaim`, correctly counted zero — one fact, two answers, on two
 * cards of the same page.
 *
 * This is not a new rule. It is the rule `isVerifiedClaim`, `useCardContent`
 * (`isCurrent`), `market-profiles.ts` and `linkedin-profile.ts` were each
 * already applying, written once so the surfaces that were NOT applying it
 * can share the definition rather than grow a fourth copy of it.
 *
 * Implemented through `describeTrust` deliberately: the predicate and the
 * rendered attribution can then never disagree about the same entry.
 */
export function isCurrentlyVerified(
  entry: ProvenanceBearing & { readonly lifecycleState?: string | null },
): boolean {
  return (
    describeTrust({
      // The EFFECTIVE level: a legacy unsupported entry is not currently
      // verified, whatever its stored level records about the past.
      assertionLevel: effectiveAssertionLevel(entry),
      lifecycleState: entry.lifecycleState,
    }).status === "verified"
  );
}
