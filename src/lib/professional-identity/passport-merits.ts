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
// ── WHAT IS SHARED, AND WHAT IS NOT ────────────────────────────────────
//
// SHARED: the DEFINITION. `isCurrentMerit` / `isUnfinishedMerit` /
// `isArchivedMerit` live in the Passport's own types module, and both this
// file and `PassportOverview` apply them. So the two surfaces cannot
// disagree about what the word "merit" means, which is what produced the
// original contradiction.
//
// NOT SHARED: the READ. `getMyPassport` selects every lifecycle row,
// because the Passport lists history and has to render an expired or
// superseded entry with its own trust wording. The identity seam
// (identity.functions.ts) selects `lifecycle_state = 'active'` only, and
// deliberately: its `claims` array also feeds the CV, and an archived
// credential must never reach a document somebody sends an employer.
//
// The counter below therefore takes PLAIN ROWS and applies the policy to
// whatever it is given: fed the Passport's rows it reports archived ones in
// `archivedCount`; fed the seam's rows it reports 0 there, because the seam
// filtered them out upstream. `addedCount`, `verifiedCount`, `pendingCount`
// and `expiredCount` are identical from either input for the rows both can
// see, and that is the guarantee — not that the two queries are the same
// query.
//
// Since PR #196 the Passport workspace DOES render counts, from this
// function, over its own rows. That is precisely why it calls this rather
// than counting for itself: two derivations of "how many merits do you
// have" is the defect above, and there is still only one. The one figure a
// surface must not borrow from another is `archivedCount`, which means
// "none among the rows I was given" on the seam and "none exist" nowhere.
//
// ── UNKNOWN IS NOT ZERO ────────────────────────────────────────────────
//
// `known` is false when the reads behind the counts did not answer, and
// then every count is a floor rather than a fact.

import { describeTrust, publicTrustLevel } from "@/lib/security-passport/trust-presentation";
import type { ProvenanceSubjectKind } from "@/lib/security-passport/provenance";
import { isArchivedMerit, isCurrentMerit, isUnfinishedMerit } from "@/lib/security-passport/types";
import { isUnavailable, type IdentityClaim, type ProfessionalIdentityV1 } from "./types";
import type { VerificationAttention } from "./verification-attention";

export const PASSPORT_MERITS_VERSION = "passport-merits-v2" as const;

export type MeritLabel =
  | "added_by_you"
  | "document_provided"
  | "verification_requested"
  | "clarification_needed"
  /** An authorised CQrityjob verifier read the evidence and decided. NOT
   *  the same as the source confirming it, and since PR #189 the product
   *  says so outwardly: this is the Passport's "Dokumenterad". */
  | "documented"
  | "verified"
  | "expired";

export interface MeritCounts {
  /** Every CURRENT merit the holder has recorded. The TOTAL, not a rung. */
  readonly addedCount: number;
  /**
   * The BOTTOM RUNG on its own: recorded by the holder, no document
   * attached, nobody reviewing it.
   *
   * Separate from `addedCount` because the two answer different questions
   * and a surface that shows both must not use one for the other. A page
   * that printed `addedCount` beside `documentedCount` and `verifiedCount`
   * would show four figures of which the first silently contains the other
   * three — and a holder counting them would find more merits on the page
   * than they own.
   */
  readonly selfReportedCount: number;
  readonly documentProvidedCount: number;
  /** Reviewed by CQrityjob and standing as documented. Counted APART from
   *  `verifiedCount`, never inside it: a document review is a decision, and
   *  it is not the source confirming the fact. */
  readonly documentedCount: number;
  /** Null when the verification read did not answer — never 0. */
  readonly pendingCount: number | null;
  readonly verifiedCount: number;
  /** Verified once, validity lapsed. Apart from `verifiedCount`. */
  readonly expiredCount: number;
  /** Begun and not finished. Not part of `addedCount`. */
  readonly draftCount: number;
  /** Rows that are no longer the current entry: expired, revoked,
   *  superseded or disputed BY LIFECYCLE.
   *
   *  Only a surface that READS every lifecycle can know this. The identity
   *  seam selects active rows only, so the career home always reports 0
   *  here — truthfully: it means "none among the rows I was given", not
   *  "none exist". A surface that shows this number must label it
   *  "archived", never "recorded". */
  readonly archivedCount: number;
  readonly clarificationCount: number;
  readonly known: boolean;
}

const UNKNOWN: MeritCounts = {
  addedCount: 0,
  selfReportedCount: 0,
  documentProvidedCount: 0,
  documentedCount: 0,
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
    readonly verificationMethod?: string | null;
    readonly subjectKind?: ProvenanceSubjectKind;
  },
  state: { readonly openReview: boolean; readonly clarificationOpen: boolean },
  now: Date,
): MeritLabel {
  if (state.clarificationOpen) return "clarification_needed";
  // ── THE WHOLE PROVENANCE, OR THE ANSWER IS WRONG ────────────────────
  //
  // `describeTrust` decides on the METHOD and the SUBJECT as much as on the
  // level: an employer confirming an employment period is a source
  // confirmation, and the same word recorded against a credential, or an
  // issuer confirmation with no issuer identity behind it, is not. Omitting
  // either field here does not weaken the answer, it INVERTS it -- the call
  // falls through to the unattributed branch and a CQrityjob document review
  // comes back looking like a source confirmation. So both are passed, and
  // `subjectKind` is stated rather than defaulted.
  const trust = describeTrust({
    assertionLevel: merit.assertionLevel,
    lifecycleState: merit.lifecycleState ?? null,
    verifierName: merit.verifierName ?? null,
    verificationMethod: merit.verificationMethod ?? null,
    subjectKind: merit.subjectKind ?? "credential",
  });
  // ── THE OUTWARD LEVEL, NEVER `status` ───────────────────────────────
  //
  // `status === "verified"` means an authorised verifier decided, which is
  // true of a CQrityjob document review as well. What a count under the word
  // "Verifierade" may hold is the level the reader is shown, and that is
  // `publicTrustLevel` -- the same function the CV, the Career Card and the
  // Passport pill ask. A decided merit that is not source-confirmed is
  // documented, and it is counted as documented.
  const level = publicTrustLevel(trust);
  const lapsed = hasLapsed(merit.validUntil ?? null, now);
  if (level === "source_verified") return lapsed ? "expired" : "verified";
  if (level === "documented") return lapsed ? "expired" : "documented";
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
  /** HOW it was decided. Without it a document review and a source
   *  confirmation are the same row to this module. */
  readonly verificationMethod?: string | null;
  /** WHAT was decided about. An employer confirmation source-confirms an
   *  employment period and nothing else; the default is a credential, so a
   *  caller that forgets fails closed. */
  readonly subjectKind?: ProvenanceSubjectKind;
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
    selfReportedCount: of("added_by_you"),
    documentProvidedCount: of("document_provided"),
    documentedCount: of("documented"),
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
      verificationMethod: c.verificationMethod,
      // A CREDENTIAL. No method reaches source-confirmed on one today.
      subjectKind: "credential" as const,
    })),
    ...identity.employment.map((e) => ({
      id: e.id,
      assertionLevel: e.assertionLevel,
      lifecycleState: null,
      validUntil: null,
      verifierName: e.verifierName,
      verificationMethod: e.verificationMethod,
      // An EMPLOYMENT PERIOD: the one subject an employer confirmation may
      // source-confirm, and the reason this field is stated everywhere.
      subjectKind: "employment" as const,
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
    // `documented` is deliberately absent: CQrityjob has already decided on
    // that merit, and offering "send it for verification" again would be the
    // ladder promoting an action from a decision that already happened.
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
