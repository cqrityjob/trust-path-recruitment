// WHO verified a subject, how, and when — resolved in exactly one place.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
//
// This logic was written once, correctly, inside `getMyPassport`. Then the
// career outputs needed the same answer: a CV that prints "Confirmed by
// Bevakning AB" is making the same attestation the Passport makes, and it
// must be making it for the same reason and under the same conditions.
//
// The alternative — a second read model resolving provenance its own way —
// is how two surfaces come to disagree about the same fact. One of them
// gates attribution on the current assertion level and the other forgets
// to; one filters out rejections and the other does not; and the product
// says "Confirmed by Company X" on a CV about an employment the Passport
// has already stopped claiming. So the resolution lives here, both callers
// import it, and there is no second interpretation to drift.
//
// ── THE TWO RULES THAT MATTER ──────────────────────────────────────────
//
//   1. ONLY AN APPROVAL ATTRIBUTES. A rejection has a decider too, and
//      naming them beside the entry would read as an endorsement of it.
//
//   2. ATTRIBUTION FOLLOWS THE CURRENT ASSERTION LEVEL, NOT THE EXISTENCE
//      OF A PAST APPROVAL. A verification that was later revoked, corrected
//      or superseded is real history and stays in the decision log — but
//      printing "Confirmed by Bevakning AB" beside an entry that is no
//      longer verified restates a withdrawn conclusion as a present fact.
//
// Rule 2 is what makes revocation propagate to every output for free: the
// outputs never store trust, they re-derive it from the live assertion
// level on each read, and the moment that level moves off `verified` the
// attribution disappears everywhere at once.

import type { AssertionLevel, VerificationMethod } from "./types";

/** The organisation `sp_verifier_decide` records for every `cqrityjob_review`
 *  decision. A string constant rather than a role check because it is what the
 *  DECISION ROW says, and the decision row is what every surface reads. */
export const CQRITYJOB_DECIDER_ORGANISATION = "CQrityjob";

/** The methods that assert a SOURCE -- the employer or the issuer -- confirmed
 *  the fact. Anything CQrityjob can record about a document it read, a call it
 *  made or an email it received is `document_review`. */
export const SOURCE_CONFIRMATION_METHODS: readonly string[] = [
  "employer_confirmation",
  "issuer_confirmation",
];

/**
 * A decision whose METHOD claims a source confirmed the fact, while the
 * recorded DECIDER is CQrityjob.
 *
 * ── WHY THIS SHAPE IS UNSUPPORTED ──────────────────────────────────────
 *
 * Before migration 20261030090000, a CQrityjob reviewer answering a
 * `cqrityjob_review` request could record `issuer_confirmation` or
 * `employer_confirmation`. No issuer or employer took part in that decision:
 * there was no issuer request kind, no issuer membership, no source receipt,
 * and the employer path writes the EMPLOYER's name as decider, never
 * CQrityjob's. So a row of this shape is a CQrityjob review that was labelled
 * as something stronger. The database now refuses to write another; the rows
 * that exist are history and stay as written.
 *
 * Every surface that turns a method into words asks this first, so the label
 * such a row wears is decided once. "Confirmed by the issuer CQrityjob" is the
 * sentence this exists to make unprintable.
 */
export function isLegacyUnsupportedProvenance(
  method: string | null | undefined,
  organisation: string | null | undefined,
): boolean {
  if (!method || !organisation) return false;
  return (
    SOURCE_CONFIRMATION_METHODS.includes(method) &&
    organisation.trim().toLowerCase() === CQRITYJOB_DECIDER_ORGANISATION.toLowerCase()
  );
}

/** Anything that carries a stored assertion level and, when verified, the
 *  decider and method behind it. Claims, periods, card credentials and the
 *  recipient payload all fit; the provenance fields are optional so a caller
 *  holding only the level still gets an answer (the stored level). */
export interface ProvenanceBearing {
  readonly assertionLevel: string;
  readonly verifierName?: string | null;
  readonly verificationMethod?: string | null;
}

export function isLegacyUnsupportedEntry(entry: ProvenanceBearing): boolean {
  return isLegacyUnsupportedProvenance(entry.verificationMethod, entry.verifierName);
}

/**
 * The assertion level an entry EFFECTIVELY has for every derivation and
 * every reader: titles, eligibility, tenure, counts, chips, symbols.
 *
 * ── ONE RULE, APPLIED ONCE ─────────────────────────────────────────────
 *
 * The stored level is history and stays as written. A legacy unsupported
 * row -- a source-confirmation method that CQrityjob recorded about itself
 * -- is treated as `document_provided`: CQrityjob looked at something, and
 * that is the one thing the row can support. It therefore falls below every
 * rule that asks for `verified`, exactly as the owner decision requires:
 * no verified title, no regulated eligibility, no present-tense VERIFIED.
 *
 * Every predicate that used to compare `assertionLevel === "verified"`
 * directly now asks this instead. That is the whole mechanism: there is no
 * second list of surfaces to keep in step.
 */
export function effectiveAssertionLevel(entry: ProvenanceBearing): AssertionLevel {
  switch (effectiveTrust(entry)) {
    case "source_confirmed":
      return "verified";
    case "documented":
    case "document_provided":
      return "document_provided";
    default:
      return "self_declared";
  }
}

/**
 * The OUTWARD trust level of an entry -- what the product may say about it.
 *
 *   self_declared     the holder supplied and attested it
 *   document_provided the holder attached a file nobody has assessed (outwardly
 *                     still the holder's own statement; the holder's own
 *                     surfaces name the file so they can see it arrived)
 *   documented        CQrityjob reviewed evidence the holder supplied --
 *                     `document_review`, and any legacy row whose source
 *                     method CQrityjob recorded about itself
 *   source_confirmed  the employer, or (when structurally supported) the
 *                     issuer, directly confirmed the fact
 *
 * The stored assertion level says an authorised verifier DECIDED. This says
 * what that decision PROVES, and it is the only thing a chip, a symbol, a
 * title rule, a tenure tier, a count or a label is allowed to read. Owner
 * decision: a CQrityjob document review means documented -- it is not source
 * confirmation and establishes no regulated title, licence, eligibility or
 * authority recognition on its own.
 *
 * Fail closed: a verified entry whose method is unknown or absent is
 * documented. Nothing becomes source-confirmed by omission.
 */
export type EffectiveTrust =
  | "self_declared"
  | "document_provided"
  | "documented"
  | "source_confirmed";

export function effectiveTrust(entry: ProvenanceBearing): EffectiveTrust {
  if (entry.assertionLevel === "self_declared") return "self_declared";
  if (entry.assertionLevel === "document_provided") return "document_provided";
  if (entry.assertionLevel !== "verified") return "self_declared";
  const method = entry.verificationMethod ?? null;
  const organisation = entry.verifierName ?? null;
  if (!method || method === "document_review") return "documented";
  if (isLegacyUnsupportedProvenance(method, organisation)) return "documented";
  if (SOURCE_CONFIRMATION_METHODS.includes(method) && organisation) return "source_confirmed";
  return "documented";
}

/** True for a CQrityjob review that stands: documented, and not a legacy row. */
export function isDocumentedByReview(entry: ProvenanceBearing): boolean {
  return effectiveTrust(entry) === "documented" && !isLegacyUnsupportedEntry(entry);
}

/** The columns a provenance read is allowed to ask for.
 *
 *  Named constants rather than inline strings because the thing that must
 *  never appear in them — `decision_note` — is easiest to add by copying a
 *  select list from a reviewer-facing query. Since migration 20261014090000
 *  asking for it as a holder is REFUSED rather than merely ignored, but a
 *  refusal is a broken page, and the point is not to write it in the first
 *  place. Every holder-facing provenance read uses these two names. */
export const PROVENANCE_REQUEST_COLUMNS = "id, claim_id, period_id" as const;
export const PROVENANCE_DECISION_COLUMNS =
  "request_id, decision, decider_organisation, verification_method, decided_at" as const;

/** Who verified one subject, how, and when. */
export interface SubjectProvenance {
  /** The organisation that made the DECISION. Never the issuer, and never
   *  the employer a period merely names. */
  readonly organisation: string | null;
  readonly method: VerificationMethod | null;
  readonly decidedOn: string | null;
}

/** Keyed by claim id or period id. Absent means exactly what it says:
 *  nobody has verified this subject. */
export type ProvenanceMap = ReadonlyMap<string, SubjectProvenance>;

export const EMPTY_PROVENANCE: ProvenanceMap = new Map();

export interface ProvenanceRequestRow {
  readonly id: string;
  readonly claim_id: string | null;
  readonly period_id: string | null;
}

export interface ProvenanceDecisionRow {
  readonly request_id: string;
  readonly decision: string;
  readonly decider_organisation: string | null;
  readonly verification_method: string | null;
  readonly decided_at: string;
}

/**
 * Fold requests and decisions into subject -> who decided it.
 *
 * Pure. Which subject a decision was about lives on the REQUEST; who decided
 * it, how and when lives on the DECISION, so the two are joined here by
 * request id.
 *
 * Decisions must arrive OLDEST FIRST (`.order("decided_at")`), so that a
 * later decision on the same subject overwrites an earlier one and the map
 * ends holding the current answer rather than the first one ever made.
 */
export function buildProvenanceMap(
  requests: readonly ProvenanceRequestRow[],
  decisions: readonly ProvenanceDecisionRow[],
): ProvenanceMap {
  const subjectOf = new Map<string, string>();
  for (const r of requests) {
    const subject = r.claim_id ?? r.period_id;
    if (subject) subjectOf.set(r.id, subject);
  }

  const provenance = new Map<string, SubjectProvenance>();
  for (const d of decisions) {
    // Rule 1. Only an approval attributes.
    if (d.decision !== "approved") continue;
    const subject = subjectOf.get(d.request_id);
    if (!subject) continue;
    provenance.set(subject, {
      organisation: d.decider_organisation,
      method: (d.verification_method as VerificationMethod | null) ?? null,
      decidedOn: d.decided_at.slice(0, 10),
    });
  }
  return provenance;
}

/**
 * The provenance that may be PRINTED for a subject, or null.
 *
 * Rule 2 lives here, in one expression, so that no caller can accidentally
 * read the map directly and skip it.
 */
export function printableProvenance(
  subjectId: string,
  assertionLevel: string,
  provenance: ProvenanceMap,
): SubjectProvenance | null {
  if (assertionLevel !== "verified") return null;
  return provenance.get(subjectId) ?? null;
}
