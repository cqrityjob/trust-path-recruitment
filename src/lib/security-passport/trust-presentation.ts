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
import type { VerificationMethod } from "./types";

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
export type TrustSourceType = VerificationMethod | "unattributed";

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

  // ── A LAPSED OR WITHDRAWN FACT IS NOT A VERIFIED FACT ────────────────
  //
  // `expired` and `revoked` are not merely history. A credential that has
  // expired is not currently a verified credential, whatever was decided
  // about it in 2024, and a revoked one is a conclusion actively withdrawn.
  // The assertion level alone does not always move when the lifecycle does,
  // so the lifecycle is asked first and the mark is refused on both.
  const lapsed =
    lifecycleState != null && lifecycleState !== "active" && lifecycleState !== "draft";
  if (lapsed) return none("self_reported");

  if (assertionLevel !== "verified") {
    return none(assertionLevel === "document_provided" ? "document_provided" : "self_reported");
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
  const key: PassportCopyKey =
    trust.method === "employer_confirmation"
      ? "employment.attribution.employer_confirmation"
      : verifierAttributionKey(trust.method);
  return `${passportT(key, lang)} ${trust.organisation}`;
}
