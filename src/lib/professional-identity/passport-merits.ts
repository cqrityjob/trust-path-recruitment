// Merits, counted and labelled — ONE derivation for the Passport and for
// the personal career home.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
//
// The home used to print a single figure, "0 verifierade", covering four
// genuinely different states, beside an activity feed saying a merit had
// just been verified. Two derivations of one fact. There is now one, and
// every surface asks it:
//
//   ADDED               the holder recorded it.
//   DOCUMENT PROVIDED   a document is attached and nobody has assessed it.
//   UNDER VERIFICATION  a review is OPEN. A status, never a task.
//   VERIFIED            an authorised verifier decided, and the record
//                       says who, what and when.
//   EXPIRED             verified once; its own validity has since lapsed.
//
// ── ONE LIFECYCLE POLICY, TWO SURFACES ─────────────────────────────────
//
// What counts as a CURRENT merit is decided by `isCurrentMerit` in the
// Passport's own types module, and both this file and the Passport
// overview apply it. The core counter below takes plain rows, so the
// Passport (which reads every lifecycle) and the home (which reads the
// identity seam) count the same rows under the same label. Archived rows
// are counted apart and never inside "Registrerade meriter".
//
// ── UNKNOWN IS NOT ZERO ────────────────────────────────────────────────
//
// `known` is false when the reads behind the counts did not answer, and
// then every count is a floor rather than a fact.

import { describeTrust } from "@/lib/security-passport/trust-presentation";
import { isArchivedMerit, isCurrentMerit, isUnfinishedMerit } from "@/lib/security-passport/types";
import { isUnavailable, type IdentityClaim, type ProfessionalIdentityV1 } from "./types";
import type { VerificationAttention } from "./verification-attention";

export const PASSPORT_MERITS_VERSION = "passport-merits-v2" as const;

export type MeritLabel =
  | "added_by_you"
  | "document_provided"
  | "verification_requested"
  | "clarification_needed"
  | "verified"
  | "expired";

export interface MeritCounts {
  /** Every CURRENT merit the holder has recorded. The TOTAL, not a rung. */
  readonly addedCount: number;
  readonly documentProvidedCount: number;
  /** Null when the verification read did not answer — never 0. */
  readonly pendingCount: number | null;
  readonly verifiedCount: number;
  /** Verified once, validity lapsed. Apart from `verifiedCount`. */
  readonly expiredCount: number;
  /** Begun and not finished. Not part of `addedCount`. */
  readonly draftCount: number;
  /** Rows that are no longer the current entry: expired, revoked,
   *  superseded or disputed BY LIFECYCLE. Only a surface that reads every
   *  lifecycle can know this; the identity seam reads current rows only
   *  and reports 0 here, and the label a surface prints for it must say
   *  "archived", never "recorded". */
  readonly archivedCount: number;
  readonly clarificationCount: number;
  readonly known: boolean;
}

const UNKNOWN: MeritCounts = {
  addedCount: 0,
  documentProvidedCount: 0,
  pendingCount: null,
  verifiedCount: 0,
  expiredCount: 0,
  draftCount: 0,
  archivedCount: 0,
  clarificationCount: 0,
  known: false,
};

export function hasLapsed(validUntil: string | null, now: Date): boolean {
  if (!validUntil) return false;
  const end = Date.parse(validUntil);
  if (Number.isNaN(end)) return false;
  return end < now.getTime();
}

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

/* ------------------------------------------------------------------ */
/* The core: plain rows in, counts out                                 */
/* ------------------------------------------------------------------ */

/** One merit row as EITHER surface holds it. The Passport passes its own
 *  Claim/period objects; the seam passes IdentityClaim/IdentityEmployment.
 *  Only these fields are read. */
export interface MeritRow {
  readonly id: string;
  readonly assertionLevel: string;
  /** Absent for employment periods on the seam, which arrive pre-filtered to
   *  active. Present on every Passport row. */
  readonly lifecycleState?: string | null;
  readonly validUntil?: string | null;
  readonly verifierName?: string | null;
}

export interface ReviewState {
  readonly known: boolean;
  readonly open: ReadonlySet<string>;
  readonly clarification: ReadonlySet<string>;
}

export function reviewStateOf(attention: VerificationAttention | null): ReviewState {
  const known = Boolean(attention) && !attention!.unavailable;
  return {
    known,
    open: new Set(known ? attention!.waiting.map((w) => w.subjectId) : []),
    clarification: new Set(known ? attention!.actionRequired.map((w) => w.subjectId) : []),
  };
}

/**
 * Count merit rows under the ONE lifecycle policy.
 *
 * Rows whose lifecycle is unfinished are counted as drafts; archived rows
 * are counted as archived; only CURRENT rows reach the five labels. A row
 * with no lifecycle at all (a seam employment period) is treated as
 * current, because the seam filtered it that way before it arrived.
 */
export function countMeritRows(
  rows: readonly MeritRow[],
  review: ReviewState,
  now: Date,
  draftCountOverride?: number,
): MeritCounts {
  const labels: MeritLabel[] = [];
  let drafts = 0;
  let archived = 0;
  for (const r of rows) {
    const lc = r.lifecycleState ?? "active";
    if (isUnfinishedMerit(lc)) {
      drafts += 1;
      continue;
    }
    if (isArchivedMerit(lc)) {
      archived += 1;
      continue;
    }
    if (!isCurrentMerit(lc)) continue;
    labels.push(
      labelMerit(
        r,
        { openReview: review.open.has(r.id), clarificationOpen: review.clarification.has(r.id) },
        now,
      ),
    );
  }
  const of = (label: MeritLabel) => labels.filter((l) => l === label).length;
  return {
    addedCount: labels.length,
    documentProvidedCount: of("document_provided"),
    pendingCount: review.known ? of("verification_requested") : null,
    verifiedCount: of("verified"),
    expiredCount: of("expired"),
    draftCount: draftCountOverride ?? drafts,
    archivedCount: archived,
    clarificationCount: of("clarification_needed"),
    known: true,
  };
}

/** The seam's rows, as MeritRow. Employment periods carry no `validUntil`. */
export function identityMeritRows(identity: ProfessionalIdentityV1): readonly MeritRow[] {
  return [
    ...identity.claims.map((c) => ({
      id: c.id,
      assertionLevel: c.assertionLevel,
      lifecycleState: c.lifecycleState,
      validUntil: c.validUntil,
      verifierName: c.verifierName,
    })),
    ...identity.employment.map((e) => ({
      id: e.id,
      assertionLevel: e.assertionLevel,
      lifecycleState: null,
      validUntil: null,
      verifierName: e.verifierName,
    })),
  ];
}

/** Count what the seam holds. Unknown when any read behind it failed. */
export function countMerits(
  identity: ProfessionalIdentityV1,
  attention: VerificationAttention | null,
  now: Date,
): MeritCounts {
  const known =
    !isUnavailable(identity, "provenance") &&
    !isUnavailable(identity, "claims") &&
    !isUnavailable(identity, "employment");
  if (!known) return UNKNOWN;
  return countMeritRows(
    identityMeritRows(identity),
    reviewStateOf(attention),
    now,
    // The seam carries drafts as a count, not as rows.
    identity.workload.draftClaimCount,
  );
}

/**
 * How many merits are ready to be sent to a verifier. Recorded, current,
 * not verified, not lapsed, and nobody is already looking at it. The
 * ladder and the Passport summary both call this; two derivations of one
 * number is how the page came to state two totals for the same merits.
 */
export function countReadyForVerification(
  identity: ProfessionalIdentityV1,
  underReviewSubjectIds: readonly string[],
  now: Date,
): number {
  const open = new Set(underReviewSubjectIds);
  let n = 0;
  for (const r of identityMeritRows(identity)) {
    if (!isCurrentMerit(r.lifecycleState ?? "active")) continue;
    const label = labelMerit(r, { openReview: open.has(r.id), clarificationOpen: false }, now);
    if (label === "added_by_you" || label === "document_provided") n += 1;
  }
  return n;
}

/** One merit, labelled, for a surface that lists them. */
export interface LabelledMerit {
  readonly id: string;
  readonly kind: "claim" | "experience";
  readonly title: string;
  readonly label: MeritLabel;
  readonly verifierName: string | null;
  readonly verifiedOn: string | null;
  readonly validUntil: string | null;
}

export function labelMerits(
  identity: ProfessionalIdentityV1,
  attention: VerificationAttention | null,
  now: Date,
): readonly LabelledMerit[] {
  const review = reviewStateOf(attention);
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
  return identity.claims.filter((c) => isCurrentMerit(c.lifecycleState)).map(fromClaim);
}

/** The title of a current merit the seam holds, by subject. Null when the
 *  subject is not among the current rows — which, for an approval, means
 *  the merit has since been archived. */
export function currentMeritTitle(
  identity: ProfessionalIdentityV1,
  subject: { readonly kind: "claim" | "experience"; readonly id: string },
): string | null {
  if (subject.kind === "claim") {
    return identity.claims.find((c) => c.id === subject.id)?.title ?? null;
  }
  const e = identity.employment.find((p) => p.id === subject.id);
  return e ? `${e.roleTitle} · ${e.employerName}` : null;
}
