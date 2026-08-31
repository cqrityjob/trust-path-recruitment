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

import type { VerificationMethod } from "./types";

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
