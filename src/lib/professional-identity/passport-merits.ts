// Merits, counted and labelled — ONE derivation for the Passport and for
// the personal career home.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
//
// The home used to print a single figure: "0 verifierade". One number,
// covering four genuinely different states, and it produced the exact
// contradiction the brief names — a home page saying nothing is verified
// beside an activity feed saying a Passport entry had just been verified.
// The two were not reading different data; they were reading the same data
// through two derivations, one of which could not see the difference
// between "you have nothing", "you have things nobody has looked at" and
// "we could not read this".
//
// So there is one derivation, here, and every surface asks it:
//
//   ADDED               the holder recorded it. True as a statement by its
//                       holder, and that is all it is.
//   DOCUMENT PROVIDED   a document is attached and nobody has assessed it.
//                       "Evidence exists" and "evidence was checked" are
//                       the two states this product most needs apart.
//   UNDER VERIFICATION  a review is OPEN. A status, never a task.
//   VERIFIED            an authorised verifier decided, and the decision
//                       record says who, what and when.
//
// ── THE COUNTS ARE NOT A LADDER OF ONE NUMBER ──────────────────────────
//
// `addedCount` is the TOTAL — every merit the holder has recorded. The
// other three are subsets of it, and they overlap by design: a merit can
// have a document attached AND an open review. Nothing here computes a
// percentage, a completeness score or a trust score, and nothing sums the
// four into a single figure, because there is no honest single figure: a
// person is not verified. Individual merits are, one at a time, by somebody
// named, on a date.
//
// ── UNKNOWN IS NOT ZERO ────────────────────────────────────────────────
//
// `known` is false when the reads behind the counts did not answer, and
// then every count is a floor rather than a fact. A confident zero about
// somebody's professional standing is the most damaging false statement
// this product can make about them, so the surfaces render "could not be
// read" rather than a number.

import { describeTrust } from "@/lib/security-passport/trust-presentation";
import { isUnavailable, type IdentityClaim, type ProfessionalIdentityV1 } from "./types";
import type { VerificationAttention } from "./verification-attention";

export const PASSPORT_MERITS_VERSION = "passport-merits-v1" as const;

/**
 * What a surface may say about ONE merit.
 *
 * Six values, all of them stated in words. Nothing here is carried by
 * colour: a status the reader cannot see is a status the product did not
 * communicate.
 */
export type MeritLabel =
  /** The holder typed it in. No verifier has seen it. */
  | "added_by_you"
  /** A document is attached. Nobody has assessed it. */
  | "document_provided"
  /** A review is open with the correct verifier. Nothing to do. */
  | "verification_requested"
  /** The reviewer asked the holder for something and is waiting. */
  | "clarification_needed"
  /** An authorised verifier decided. The only label that may name an
   *  organisation, and it always names one thing that was confirmed. */
  | "verified"
  /** Verified once, and the credential's own validity has since lapsed. */
  | "expired";

export interface MeritCounts {
  /** Every merit the holder has recorded. The TOTAL, not a rung. */
  readonly addedCount: number;
  /** Of those, how many carry a document nobody has assessed. */
  readonly documentProvidedCount: number;
  /** Of those, how many have an OPEN review. Null when the verification
   *  read did not answer — never 0, which would say nobody is looking. */
  readonly pendingCount: number | null;
  /** Of those, how many an authorised verifier has verified. */
  readonly verifiedCount: number;
  /** Of those, how many were verified and have since lapsed. Counted apart
   *  from `verifiedCount` because a lapsed credential is not a current one
   *  and must never be presented as if it were. */
  readonly expiredCount: number;
  /** Entries the holder began and never finished. Not part of `addedCount`:
   *  a draft is not a recorded merit, which is why the Passport keeps it out
   *  of its own lists. */
  readonly draftCount: number;
  /** Merits whose review is waiting on the HOLDER. The one number a surface
   *  may present as something to do. */
  readonly clarificationCount: number;
  /**
   * The reads behind these numbers answered.
   *
   * False means every count is a floor, not a fact, and a caller must not
   * render any of them as a total.
   */
  readonly known: boolean;
}

const UNKNOWN: MeritCounts = {
  addedCount: 0,
  documentProvidedCount: 0,
  pendingCount: null,
  verifiedCount: 0,
  expiredCount: 0,
  draftCount: 0,
  clarificationCount: 0,
  known: false,
};

/** Has this credential's own validity run out? Display-only, and computed
 *  from the stored date rather than inferred from anything else. A merit
 *  with no `validUntil` never expires. */
export function hasLapsed(validUntil: string | null, now: Date): boolean {
  if (!validUntil) return false;
  const end = Date.parse(validUntil);
  if (Number.isNaN(end)) return false;
  return end < now.getTime();
}

/**
 * Label ONE merit.
 *
 * The order of the branches is the product decision: what the verifier is
 * currently asking of the holder outranks what the holder attached, and a
 * lapsed validity outranks the verification that produced it — because the
 * question a reader is asking is "is this good now", and the honest answer
 * for a lapsed credential is no.
 */
export function labelMerit(
  merit: {
    readonly assertionLevel: string;
    readonly lifecycleState?: string | null;
    readonly validUntil?: string | null;
    readonly verifierName?: string | null;
  },
  state: { readonly openReview: boolean; readonly clarificationOpen: boolean },
  now: Date,
): MeritLabel {
  if (state.clarificationOpen) return "clarification_needed";
  const trust = describeTrust({
    assertionLevel: merit.assertionLevel,
    lifecycleState: merit.lifecycleState ?? null,
    verifierName: merit.verifierName ?? null,
  });
  if (trust.status === "verified") {
    return hasLapsed(merit.validUntil ?? null, now) ? "expired" : "verified";
  }
  if (state.openReview) return "verification_requested";
  return trust.status === "document_provided" ? "document_provided" : "added_by_you";
}

/** One merit, ready to render. Employment and claims are labelled by the
 *  same function so the two can never drift apart in what they claim. */
export interface LabelledMerit {
  readonly id: string;
  readonly kind: "claim" | "experience";
  readonly title: string;
  readonly label: MeritLabel;
  /** The DECIDER, when the label is `verified`. Never the issuer. */
  readonly verifierName: string | null;
  readonly verifiedOn: string | null;
  readonly validUntil: string | null;
}

/** The subjects with an open review, and those waiting on the holder. */
function reviewState(attention: VerificationAttention | null) {
  const known = Boolean(attention) && !attention!.unavailable;
  return {
    known,
    open: new Set(known ? attention!.waiting.map((w) => w.subjectId) : []),
    clarification: new Set(known ? attention!.actionRequired.map((w) => w.subjectId) : []),
  };
}

/**
 * Count every merit, once, from facts already in hand.
 *
 * Pure and query-free by design: every caller already holds a
 * `ProfessionalIdentityV1`, and adding a Passport round trip to render a
 * count would be a second source of truth as well as a slower page.
 */
export function countMerits(
  identity: ProfessionalIdentityV1,
  attention: VerificationAttention | null,
  now: Date,
): MeritCounts {
  // The counts need the entries AND who decided on them. If any of the
  // three reads failed, the honest answer for the whole summary is
  // "unknown" rather than a mixture of real and floor numbers that reads as
  // a total.
  const known =
    !isUnavailable(identity, "provenance") &&
    !isUnavailable(identity, "claims") &&
    !isUnavailable(identity, "employment");
  if (!known) return UNKNOWN;

  const review = reviewState(attention);
  const labels: MeritLabel[] = [];

  for (const c of identity.claims) {
    labels.push(
      labelMerit(
        c,
        { openReview: review.open.has(c.id), clarificationOpen: review.clarification.has(c.id) },
        now,
      ),
    );
  }
  for (const e of identity.employment) {
    labels.push(
      labelMerit(
        // Employment periods arrive already filtered to active, so no
        // lifecycle is passed: `undefined` is not a state to judge.
        { assertionLevel: e.assertionLevel, verifierName: e.verifierName, validUntil: null },
        { openReview: review.open.has(e.id), clarificationOpen: review.clarification.has(e.id) },
        now,
      ),
    );
  }

  const of = (label: MeritLabel) => labels.filter((l) => l === label).length;

  return {
    addedCount: labels.length,
    documentProvidedCount: of("document_provided"),
    // Null rather than 0 when the review read did not answer: "nobody is
    // reviewing anything of yours" and "we could not check" are different
    // sentences, and only one of them is true.
    pendingCount: review.known ? of("verification_requested") : null,
    verifiedCount: of("verified"),
    expiredCount: of("expired"),
    draftCount: identity.workload.draftClaimCount,
    clarificationCount: of("clarification_needed"),
    known: true,
  };
}

/**
 * How many merits are ready to be sent to a verifier.
 *
 * ── WHY THE LADDER ASKS THIS FILE AND NOT ITS OWN LOOP ─────────────────
 *
 * Because it had its own loop, over CLAIMS only, and the Passport summary
 * counted claims AND employment. A holder with eight credentials and one
 * employment period read "9 registrerade meriter" beside a recommendation
 * saying "du har 8 registrerade meriter som ännu inte är verifierade" — two
 * numbers for one fact, on one screen, produced by two derivations. There
 * is now one, and both callers use it.
 *
 * Ready means: recorded, not verified, not lapsed, and nobody is already
 * looking at it. An entry under review is a STATUS, not something to
 * submit.
 */
export function countReadyForVerification(
  identity: ProfessionalIdentityV1,
  underReviewSubjectIds: readonly string[],
  now: Date,
): number {
  const open = new Set(underReviewSubjectIds);
  const ready = (id: string, merit: Parameters<typeof labelMerit>[0]) => {
    const label = labelMerit(merit, { openReview: open.has(id), clarificationOpen: false }, now);
    return label === "added_by_you" || label === "document_provided";
  };
  let n = 0;
  for (const c of identity.claims) if (ready(c.id, c)) n += 1;
  for (const e of identity.employment) {
    if (
      ready(e.id, {
        assertionLevel: e.assertionLevel,
        verifierName: e.verifierName,
        validUntil: null,
      })
    )
      n += 1;
  }
  return n;
}

/** Every recorded merit with its label, newest-looking first: what needs
 *  the holder, then what is open, then the rest. For a surface that lists
 *  them; the home only counts. */
export function labelMerits(
  identity: ProfessionalIdentityV1,
  attention: VerificationAttention | null,
  now: Date,
): readonly LabelledMerit[] {
  const review = reviewState(attention);
  const fromClaim = (c: IdentityClaim): LabelledMerit => ({
    id: c.id,
    kind: "claim",
    title: c.title,
    label: labelMerit(
      c,
      { openReview: review.open.has(c.id), clarificationOpen: review.clarification.has(c.id) },
      now,
    ),
    verifierName: c.verifierName,
    verifiedOn: c.verifiedOn,
    validUntil: c.validUntil,
  });
  return identity.claims.map(fromClaim);
}
