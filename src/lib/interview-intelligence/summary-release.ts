// Sharing the interview summary with the person it is about — the sequence,
// as data.
//
// ── WHAT THIS FILE IS ───────────────────────────────────────────────────
//
// A PURE projection, in the same sense as `assessment-release.ts` beside it:
// no I/O, no clock, no React. It answers the three questions a screen has to
// get right before and after an irreversible disclosure:
//
//   1. May this be shared at all, and why not?   `summaryGate`
//   2. What did the release actually do?         `summaryReadback`
//   3. Which version is the person reading?      carried on both
//
// ── WHY THE SEQUENCE HAS FOUR STEPS AND NOT ONE ─────────────────────────
//
// The brief is specific, and each step exists because collapsing it would
// remove somebody's chance to say no:
//
//   REVIEW      the confirmed evidence and the requirement assessments, which
//               the report screen already shows before anything is locked
//   FINALISE    the employer's own report, immutably
//   PREVIEW     exactly what the candidate would receive -- the document
//               itself, produced by the same database function the release
//               calls, not a description of it
//   RELEASE     a separate, explicit act
//
// Finalising does not release. The database enforces the direction (a release
// before a final report raises SCP_IV_SUMMARY_BEFORE_REPORT) and the absence
// of the reverse (scp_iv_finalise_report does not call the release, and the
// migration asserts that at apply time). This file makes the same shape
// visible on the screen, so a recruiter cannot reach the second act without
// passing through the first.

/* ------------------------------------------------------------------ */
/* 1. May it be shared                                                 */
/* ------------------------------------------------------------------ */

/**
 * Whether the candidate summary may be shared, with the reason attached.
 *
 * Every member carries what the screen needs to say a true sentence about it.
 * "The button is not there" is a question the screen should already have
 * answered, and the two answers that would otherwise go unsaid are the two
 * that matter: the report is not final yet, and this reader is not the one who
 * may share.
 */
export type SummaryGate =
  /** Already shared, and the person can read it. Terminal for this version. */
  | { readonly kind: "released"; readonly versionNumber: number; readonly releasedAt: string }
  /** A final report exists, nothing is shared, and this reader may share it. */
  | { readonly kind: "ready" }
  /** A final report exists and this reader is not an owner or admin. A
   *  statement about the READER: a colleague can. */
  | { readonly kind: "notPermitted" }
  /** The employer's own report is not final. The database refuses with
   *  SCP_IV_SUMMARY_BEFORE_REPORT, and the screen says so before the click:
   *  a summary of an interview whose report is still being written is a
   *  summary of a decision nobody has made. */
  | { readonly kind: "reportNotFinal" };

export function summaryGate(input: {
  readonly reportIsFinal: boolean;
  readonly canRelease: boolean;
  readonly released: { readonly versionNumber: number; readonly releasedAt: string } | null;
}): SummaryGate {
  // Released first, and on the READ-BACK row rather than on any local flag:
  // the row is what the candidate can actually see.
  if (input.released) {
    return {
      kind: "released",
      versionNumber: input.released.versionNumber,
      releasedAt: input.released.releasedAt,
    };
  }
  if (!input.reportIsFinal) return { kind: "reportNotFinal" };
  return input.canRelease ? { kind: "ready" } : { kind: "notPermitted" };
}

/* ------------------------------------------------------------------ */
/* 2. What the release did                                             */
/* ------------------------------------------------------------------ */

/**
 * The outcome of a release, AFTER the released row has been read back.
 *
 * The same rule `assessment-release.ts` establishes for the assessment brief,
 * and for the same reason: a mutation resolving is not evidence that the
 * person can now see anything. Success is "the call returned AND the released
 * row says so", and the case where those disagree has its own member and its
 * own sentence -- one that does not invite a second irreversible act.
 */
export type SummaryOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "releasing" }
  /** Written AND read back. */
  | { readonly kind: "confirmed"; readonly versionNumber: number; readonly releasedAt: string }
  /** Written, and the read back did not show it. Not a failure. */
  | { readonly kind: "writtenNotConfirmed" }
  /** SCP_IV_SUMMARY_BEFORE_REPORT — the report is not final. */
  | { readonly kind: "reportNotFinal" }
  /** SCP_IV_SUMMARY_RELEASE_ROLE — the database re-decided and said no. */
  | { readonly kind: "refused" }
  /** Anything else. Nothing is claimed about whether the write landed. */
  | { readonly kind: "failed" };

/** The error messages the database actually raises, mapped once.
 *
 *  Matched as substrings because these arrive as `Error.message` from a
 *  PostgREST envelope rather than as a code. Data rather than a chain of
 *  `if`s, so the whole mapping is readable at once -- and anything this
 *  product has never seen falls to `failed`, which claims nothing, rather
 *  than into whichever branch happened to be last. */
const SUMMARY_ERROR: readonly (readonly [string, SummaryOutcome])[] = [
  ["SCP_IV_SUMMARY_BEFORE_REPORT", { kind: "reportNotFinal" }],
  ["SCP_IV_SUMMARY_RELEASE_ROLE", { kind: "refused" }],
  ["SCP_IV_SUMMARY_PREVIEW_ROLE", { kind: "refused" }],
];

export function summaryErrorOutcome(message: string | null | undefined): SummaryOutcome {
  if (!message) return { kind: "failed" };
  for (const [needle, outcome] of SUMMARY_ERROR) {
    if (message.includes(needle)) return outcome;
  }
  return { kind: "failed" };
}

/**
 * The outcome of a release whose call SUCCEEDED, decided by the row read back.
 *
 * `released` is the row the verification read returned, or null when that read
 * failed or produced nothing. Both are `writtenNotConfirmed`: the distinction
 * between them is real but not one a recruiter can act on differently, and
 * inventing two sentences for it would be inventing certainty about which
 * happened.
 */
export function summaryReadback(
  released: { readonly versionNumber: number; readonly releasedAt: string } | null | undefined,
): SummaryOutcome {
  if (released) {
    return {
      kind: "confirmed",
      versionNumber: released.versionNumber,
      releasedAt: released.releasedAt,
    };
  }
  return { kind: "writtenNotConfirmed" };
}

/** Whether the release control may be activated at all.
 *
 *  A `released` gate does NOT enable it. Re-sharing an unchanged summary is
 *  idempotent in the database and would be harmless -- but a live button
 *  beside "shared on 3 March" invites a recruiter to wonder whether the first
 *  one worked, which is the doubt the read-back exists to remove. A corrected
 *  summary is released by changing the evidence and returning here, and the
 *  gate then reports `released` with the OLD version until it is. */
export function summaryControlEnabled(gate: SummaryGate, outcome: SummaryOutcome): boolean {
  if (gate.kind !== "ready") return false;
  return outcome.kind === "idle" || outcome.kind === "failed";
}

/* ------------------------------------------------------------------ */
/* 3. The four steps, as a thing a screen can render                   */
/* ------------------------------------------------------------------ */

/**
 * The sequence, named. Rendered as a strip so a recruiter can see where they
 * are and what is left, and so that "preview" cannot be mistaken for "share".
 *
 * `review` is not tracked as a state because it has no completion event: the
 * report screen shows the confirmed evidence and the assessments above this,
 * and a recruiter has read them or has not. Claiming to know which would be
 * the product asserting something it cannot observe.
 */
export const SUMMARY_STEPS = ["review", "finalise", "preview", "release"] as const;
export type SummaryStep = (typeof SUMMARY_STEPS)[number];

export type StepState = "done" | "current" | "todo" | "blocked";

/** Which step a case is on.
 *
 *  `preview` is never `done`: previewing leaves no trace, deliberately -- a
 *  "preview" that recorded having happened would be one step from being a
 *  consent the product collected without asking. It is `current` from
 *  finalisation until release, and the release control sits inside it. */
export function summarySteps(gate: SummaryGate): Readonly<Record<SummaryStep, StepState>> {
  switch (gate.kind) {
    case "reportNotFinal":
      return { review: "current", finalise: "todo", preview: "blocked", release: "blocked" };
    case "notPermitted":
      return { review: "done", finalise: "done", preview: "current", release: "blocked" };
    case "ready":
      return { review: "done", finalise: "done", preview: "current", release: "todo" };
    case "released":
      return { review: "done", finalise: "done", preview: "done", release: "done" };
  }
}
