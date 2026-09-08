// Security Passport — ONE sharing policy, for every surface that has an
// opinion about what may leave.
//
// ── WHY THIS IS A MODULE AND NOT A CONDITION ───────────────────────────
//
// Four places decide whether a merit may be shared: the screen that offers
// it, the preview RPC, the create RPC and the payload the recipient reads.
// Written independently they drift, and every drift is a defect with a
// direction: a screen laxer than the create offers merits the create refuses,
// and a screen stricter than the create hides merits the holder is entitled
// to send.
//
// So the rule is written once here, and the guard asserts this file's text
// against the migration's. The database remains the boundary — this is the
// same rule restated so the browser can offer the right list, never a second
// authority.
//
// ── THE RULE ───────────────────────────────────────────────────────────
//
// LIFECYCLE GATES. ASSERTION LEVEL DOES NOT.
//
//   active                             shareable
//   draft                              never — unfinished private work
//   expired · revoked · superseded
//     · disputed                       never — history, not a current merit
//
// A self-declared entry, a document nobody has assessed and a CQrityjob-
// reviewed credential are all shareable, and each travels with the standing
// it actually has. That is the product decision: share what you have, and say
// what backs each item. Requiring `verified` would have meant a holder with a
// real work history could share nothing at all until somebody reviewed it —
// and, worse, it would have made "present on the page" silently mean
// "verified", so a recipient never had to read a label to draw a conclusion.
//
// ── AND THE REVIEW STATE FAILS CLOSED ──────────────────────────────────
//
// A merit can have a review case open on it: waiting on a reviewer, or
// waiting on the holder's answer. That says nothing about whether it may be
// shared — its stored standing is what it is, and that is what the recipient
// reads — but it is something the HOLDER must be told before they send it,
// because the standing may be about to move.
//
// And the review read can FAIL. When it does, the honest answer is not "no
// case is open"; it is "we could not tell". `caveatFor` returns `unknown` for
// every merit whose label depends on that read, and the screen says so. The
// merit stays selectable — the recipient sees its stored standing either way,
// and refusing to let anybody share anything because a queue table was
// briefly unreadable would be a worse failure — but nothing on the screen
// presents an unresolved case as a settled one.

import { isArchivedMerit, isCurrentMerit, isUnfinishedMerit } from "./types";
import type { ReviewReadState, WorkspaceMeritStatus } from "./workspace";

/** Why a merit is, or is not, on the sharing list. */
export type ShareEligibility =
  | "shareable"
  /** Begun and not finished. */
  | "unfinished"
  /** Expired, revoked, superseded or disputed. */
  | "archived";

export function shareEligibility(row: { readonly lifecycleState: string }): ShareEligibility {
  if (isCurrentMerit(row.lifecycleState)) return "shareable";
  if (isUnfinishedMerit(row.lifecycleState)) return "unfinished";
  if (isArchivedMerit(row.lifecycleState)) return "archived";
  // A lifecycle nobody has taught this function about is not a current merit.
  // Failing closed on an unknown state is the only safe direction.
  return "archived";
}

/**
 * The rule, as a predicate. Deliberately reads the RAW row rather than a
 * derived label: the labels are a presentation grouping, and several of them
 * (`verification_requested`, `clarification_needed`) say nothing at all about
 * whether the underlying merit is current.
 */
export function isShareableMerit(row: { readonly lifecycleState: string }): boolean {
  return shareEligibility(row) === "shareable";
}

/**
 * What the holder must be told about a merit's review state before they send
 * it. Never a reason to withhold it; always a reason to say something.
 */
export type ShareReviewCaveat =
  /** Nothing is open, and we could read the queue to know that. */
  | "none"
  /** A reviewer is waiting on this holder. */
  | "needs_answer"
  /** A case is open with somebody else. */
  | "in_review"
  /** The review read did not answer. We do not know, and we say so. */
  | "unknown";

export function caveatFor(
  label: WorkspaceMeritStatus,
  reviewState: ReviewReadState,
): ShareReviewCaveat {
  // FAIL CLOSED, and before anything else: with no answer from the queue,
  // every review-derived word is a guess. `buildPassportWorkspace` already
  // collapses those labels to `unknown`; this makes the rule explicit so a
  // caller cannot reach a settled word by reading `rawLabel` instead.
  if (reviewState !== "available") return "unknown";
  switch (label) {
    case "unknown":
      return "unknown";
    case "clarification_needed":
      return "needs_answer";
    case "verification_requested":
      return "in_review";
    default:
      return "none";
  }
}

/** True when the holder should see a caveat beside this merit at all.
 *
 *  A type predicate rather than a boolean, so a renderer that has narrowed on
 *  it cannot be handed `none` by a copy table that has no word for it. */
export function hasCaveat(caveat: ShareReviewCaveat): caveat is Exclude<ShareReviewCaveat, "none"> {
  return caveat !== "none";
}
