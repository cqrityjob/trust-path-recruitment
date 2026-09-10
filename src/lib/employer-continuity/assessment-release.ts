// Releasing one assessment result to one candidate — the decision, as data.
//
// ── WHAT THIS FILE IS ───────────────────────────────────────────────────
//
// A PURE projection, in the same sense as `process-projection.ts` beside it:
// no I/O, no clock, no React, nothing stored. It is handed rows the employer
// pipeline already returned and answers three questions a screen has to get
// right before a recruiter presses an irreversible button:
//
//   1. WHICH attempt is this action about?      `focusAttempt`
//   2. Why is that attempt releasable, or not?  `releaseGate`
//   3. What did the release actually do?        `releaseOutcome`
//
// Each is a total function over an explicit input, so every state a screen can
// reach is a value this file names — including the ones that are nobody's
// happy path: a link naming an attempt this employer cannot see, a write that
// succeeded while the read back failed, a second click on a one-way door.
//
// ── WHY IT IS NOT IN THE ROUTE ──────────────────────────────────────────
//
// The release call already lived in the route, and so did every judgement
// around it: whether the row was ready, what the button should say, what a
// failure meant. None of it could be exercised without a browser and a
// database, so none of it was. The three defects E2 exists to correct were all
// in that untested layer, and two of them (a destination that named a set
// rather than a record; a success message printed on the strength of a write
// nobody read back) are exactly the kind that a browser test notices last.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
//
// It does not authorise anything. `canRelease` arrives already computed by
// scp_employer_assessment_pipeline, and scp_release_attempt_report re-decides
// owner/admin, scored-ness and prior release on the write regardless of what
// any value here says. Hiding a button is not a permission check, and this
// file is one of the places it would be most tempting to pretend otherwise.
//
// It also produces no score, no ranking, no pass/fail and no recommendation.
// The gate below reports the RELEASE LIFECYCLE of an attempt and nothing about
// the person who sat it.

import type { PipelineRow } from "@/lib/security-competency/assessment-lifecycle.functions";

/* ------------------------------------------------------------------ */
/* 1. Which attempt                                                    */
/* ------------------------------------------------------------------ */

/**
 * The result of asking a list to open ON one record.
 *
 * The three members are three genuinely different sentences, and the reason
 * this is a union rather than `PipelineRow | null` is the third one. A link
 * that names an attempt the reader cannot see is not "no attempt requested":
 * it is a request that could not be honoured, and a list that answers it by
 * quietly showing everything has lost the recruiter the one record they came
 * for while looking as though nothing happened.
 */
export type FocusOutcome =
  /** No `?attempt` in the URL. The list is a list. */
  | { readonly kind: "noneRequested" }
  /** The named attempt is in the rows this employer can see. */
  | { readonly kind: "focused"; readonly attemptId: string }
  /** It was named and it is not there: a stale link, a withdrawn assignment,
   *  another organisation's attempt, or a read that came back short. The list
   *  says so and keeps the rows it does have. */
  | { readonly kind: "notInReach"; readonly attemptId: string };

/**
 * Resolve the requested attempt against the rows actually in hand.
 *
 * `rows` must be the FULL reachable set for this employer, not the filtered
 * view: an attempt is in reach if the pipeline returned it, and a chip the
 * recruiter left selected is not a statement about what exists. Passing the
 * filtered list here would turn "your filter hides it" into "we cannot find
 * it", which is a different and false sentence.
 */
export function focusAttempt(
  requested: string | null | undefined,
  rows: readonly PipelineRow[],
): FocusOutcome {
  if (!requested) return { kind: "noneRequested" };
  return rows.some((r) => r.attemptId === requested)
    ? { kind: "focused", attemptId: requested }
    : { kind: "notInReach", attemptId: requested };
}

/**
 * The rows to render, given a filter and a focused attempt.
 *
 * The focused attempt is ALWAYS present and ALWAYS first, whatever the filter
 * says. Arriving from "share this result" and landing on a list that does not
 * contain it — because the chip in the URL says `ready_to_release` and the
 * colleague who was faster has already shared it — is the dead end this whole
 * unit exists to remove. The filter still governs everything else, and the
 * screen says which record it opened on and why it is above the filter.
 *
 * Ordering is otherwise left exactly as the caller had it: this inserts one
 * row at the front and removes its duplicate, and re-sorts nothing.
 */
export function orderWithFocus(
  filtered: readonly PipelineRow[],
  all: readonly PipelineRow[],
  focus: FocusOutcome,
): readonly PipelineRow[] {
  if (focus.kind !== "focused") return filtered;
  const target = all.find((r) => r.attemptId === focus.attemptId);
  if (!target) return filtered;
  return [target, ...filtered.filter((r) => r.attemptId !== focus.attemptId)];
}

/* ------------------------------------------------------------------ */
/* 2. Why it is, or is not, releasable                                 */
/* ------------------------------------------------------------------ */

/**
 * The release lifecycle of ONE attempt, with the reason attached.
 *
 * Every member carries what the screen needs to say a true sentence about it,
 * because "the button is not there" is a question the card should already have
 * answered. The two numbers on `reviewsOutstanding` are the pipeline's own
 * counts; nothing here recomputes them and nothing here judges the answers
 * they refer to.
 */
export type ReleaseGate =
  /** Already shared. Terminal, and the date is the release's own. */
  | { readonly kind: "released"; readonly releasedAt: string }
  /** Scored, unshared, and this reader may share it. */
  | { readonly kind: "ready" }
  /** Scored and unshared, but this reader is not an owner or admin. A
   *  statement about the READER, not about the attempt: a colleague can. */
  | { readonly kind: "notPermitted" }
  /** A human still owes responses on this attempt. Releasing over an
   *  unreviewed response is what scp_release_attempt_report refuses with
   *  SCP_RELEASE_BEFORE_SCORED, and the card says it before the click. */
  | { readonly kind: "reviewsOutstanding"; readonly open: number; readonly total: number }
  /** Not scored, and no review is outstanding either: the run itself is not
   *  finished. Nothing to share and nobody to chase but the candidate. */
  | { readonly kind: "notScored" };

export function releaseGate(row: PipelineRow): ReleaseGate {
  // Released first, and on `releasedAt` rather than on the lifecycle label:
  // the timestamp is what the release itself wrote, and it is the field the
  // read-back below compares against. One field, one truth, both places.
  if (row.releasedAt) return { kind: "released", releasedAt: row.releasedAt };
  if (row.reviewsOpen > 0)
    return { kind: "reviewsOutstanding", open: row.reviewsOpen, total: row.reviewsTotal };
  if (!row.scoredAt) return { kind: "notScored" };
  return row.canRelease ? { kind: "ready" } : { kind: "notPermitted" };
}

/* ------------------------------------------------------------------ */
/* 3. What the release actually did                                    */
/* ------------------------------------------------------------------ */

/**
 * The outcome of a release, AFTER the row has been read back.
 *
 * ── THE DEFECT THIS TYPE EXISTS BECAUSE OF ──────────────────────────────
 *
 * The route used to treat the resolution of the mutation as the end of the
 * story: the promise settled, the queries were invalidated, and the card
 * re-rendered from whatever came back — including from a refetch that failed,
 * in which case it re-rendered from the STALE row and went on offering to
 * share a result that had just been shared. Nobody was told that the thing
 * they had asked for had happened.
 *
 * So success is no longer "the call returned". It is "the call returned AND
 * the row now says it is released", and the case where those two disagree has
 * its own member and its own sentence. That member is not a failure — the
 * write is done, sharing is one-way, and telling somebody to try again would
 * be worse than saying nothing. It is "we did it and cannot show you yet".
 */
export type ReleaseOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "releasing" }
  /** Written AND read back: the row carries a release time. */
  | { readonly kind: "confirmed"; readonly releasedAt: string }
  /** Written, and the read back did not (yet) show it. Irreversible work that
   *  succeeded; the screen says exactly that and offers to look again. */
  | { readonly kind: "writtenNotConfirmed" }
  /** SCP_ALREADY_RELEASED — the success case arriving late. A second tab, a
   *  second admin, a reply that got lost on the way back. */
  | { readonly kind: "alreadyReleased" }
  /** SCP_RELEASE_BEFORE_SCORED — a human still owes a review. */
  | { readonly kind: "blocked" }
  /** SCP_NOT_AUTHORISED_TO_RELEASE — the database re-decided and said no. */
  | { readonly kind: "refused" }
  /** Anything else. Nothing is claimed about whether the write landed. */
  | { readonly kind: "failed" };

/** The error codes scp_release_attempt_report actually raises, mapped once.
 *
 *  Data rather than a chain of `if`s so the whole mapping is readable at once,
 *  and so a code this product has never seen falls to `failed` — which claims
 *  nothing — instead of into whichever branch happened to be last. */
const RELEASE_ERROR: Record<string, ReleaseOutcome> = {
  SCP_ALREADY_RELEASED: { kind: "alreadyReleased" },
  SCP_RELEASE_BEFORE_SCORED: { kind: "blocked" },
  SCP_NOT_AUTHORISED_TO_RELEASE: { kind: "refused" },
};

export function releaseErrorOutcome(code: string | null | undefined): ReleaseOutcome {
  if (!code) return { kind: "failed" };
  return RELEASE_ERROR[code] ?? { kind: "failed" };
}

/**
 * The outcome of a release whose call SUCCEEDED, decided by the row read back.
 *
 * `row` is the attempt as the pipeline reports it after the refetch, or null
 * when the refetch itself failed or the row has gone. Both of those are
 * `writtenNotConfirmed`: the distinction between "the read failed" and "the
 * row says it is still unreleased" is real, but it is not a distinction a
 * recruiter can act on differently, and inventing two sentences for it would
 * be inventing certainty about which one happened.
 */
export function releaseReadback(row: PipelineRow | null | undefined): ReleaseOutcome {
  if (row?.releasedAt) return { kind: "confirmed", releasedAt: row.releasedAt };
  return { kind: "writtenNotConfirmed" };
}

/** Whether the release control may be activated at all, given where the
 *  release currently stands. Single-flight is enforced separately with a ref
 *  in the route — this is the declarative half, and the two agreeing is what
 *  the guard checks. */
export function releaseControlEnabled(gate: ReleaseGate, outcome: ReleaseOutcome): boolean {
  if (gate.kind !== "ready") return false;
  return outcome.kind === "idle" || outcome.kind === "failed";
}

/* ------------------------------------------------------------------ */
/* 4. What the candidate will and will not receive                     */
/* ------------------------------------------------------------------ */

/**
 * The audience boundary, as a list rather than a paragraph.
 *
 * ── WHY THIS IS A CLOSED SET AND NOT PROSE ──────────────────────────────
 *
 * The sentence under an irreversible button is the last thing a recruiter
 * reads before deciding, and "the candidate will see a summary" is not enough
 * to decide with. Both halves are enumerated, and both halves are enumerated
 * HERE, as identifiers, so that a guard can assert the two properties that
 * actually matter:
 *
 *   * nothing on the SHARED side names something the participant document
 *     does not contain — no total, no ranking, no verdict, no comparison;
 *   * every internal thing this product holds about an attempt appears on the
 *     WITHHELD side, so a reader is not left to infer an omission.
 *
 * These are the two audiences of scp_release_attempt_report as
 * 20260904134520 projects them: the participant document is a SUBSET of the
 * employer's, minus every severity and every internal number, plus a governed
 * reflection prompt that is published content rather than a fact about
 * anybody. The lists below restate that boundary in the recruiter's words;
 * they do not decide it, and they cannot widen it.
 */
export const CANDIDATE_RECEIVES = [
  "whatWasAssessed",
  "plainLanguageResult",
  "strengthsWithEvidence",
  "developmentAreas",
  "limitations",
  "releaseDateAndVersion",
] as const;

export const CANDIDATE_DOES_NOT_RECEIVE = [
  "reviewerNotes",
  "reviewerConflicts",
  "employerRatings",
  "internalReasoning",
  "otherCandidates",
  "scoringKeys",
  "auditMetadata",
  "hiringRecommendation",
  "totalScoreOrRanking",
] as const;

export type CandidateReceives = (typeof CANDIDATE_RECEIVES)[number];
export type CandidateDoesNotReceive = (typeof CANDIDATE_DOES_NOT_RECEIVE)[number];
