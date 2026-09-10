// What the interviewed person must be able to understand, and whether the
// product can actually tell them.
//
// ── WHAT THE AUDIT FOUND ────────────────────────────────────────────────
//
// There is NO external interview notice in this product. No invitation email,
// no edge function, no token link: a candidate learns that an interview
// concerns them from their own signed-in page, /my-career/interviews/$caseId,
// reading `scp_iv_candidate_interview_detail`. That page IS the notice, and it
// is the only one.
//
// That matters for two reasons. It means "block the external notice when
// retention is not configured" has no target to block -- there is nothing that
// leaves the product. And it means the honesty of the notice is entirely a
// property of what that one page says, including when it says nothing.
//
// ── THE DEFECT ──────────────────────────────────────────────────────────
//
// `retain_until` is set by exactly one writer: scp_iv_confirm_transcript_basis,
// which requires it before a transcript may be processed. Every case WITHOUT a
// transcript therefore has `retain_until = NULL` -- and the page rendered that
// as nothing at all. No line, no heading, no gap.
//
// Silence is not a neutral answer to "how long will you keep this". A reader
// who is told which sources are in use, who confirms them, what the AI does
// and does not do, and how to correct a mistake, and who is told nothing
// whatsoever about retention, will reasonably conclude that retention was not
// part of what the page covers -- rather than that the employer has not
// decided. The absence looked like completeness.
//
// So every element of the notice is enumerated here, each one carries whether
// it can actually be stated, and the surfaces render the `notConfigured` state
// as a sentence rather than as a blank.
//
// ── WHAT THIS FILE REFUSES TO DO ────────────────────────────────────────
//
// It asserts no legal basis, names no article, and claims no compliance. It
// does not use the word consent, and the elements below are not framed as
// permissions the reader grants -- they are things the reader is entitled to
// KNOW. Whether any of this satisfies a legal obligation is a question for
// legal review, and this file is deliberately not an answer to it.
//
// It also invents no retention period. A case with none configured says so.

import type { SourceRead } from "./context";

/* ------------------------------------------------------------------ */
/* The elements                                                        */
/* ------------------------------------------------------------------ */

/**
 * What the interviewed person must be able to understand before taking part.
 *
 * An ordered, closed set, so the two surfaces render the same eleven things in
 * the same order and a guard can assert that none of them has quietly stopped
 * being said. Adding one here fails the build in both places until both have
 * copy for it.
 */
export const NOTICE_ELEMENTS = [
  /** Which organisation initiated this interview. */
  "whoInitiated",
  /** Which role or application it concerns, when that is safely available. */
  "whichRole",
  /** Why the information is being collected. */
  "purpose",
  /** Which KINDS of information may be recorded. Kinds, never contents. */
  "whatIsRecorded",
  /** That AI may help structure or propose material. */
  "aiProposes",
  /** That a human must review and confirm the evidence. */
  "humanConfirms",
  /** That AI does not make the employment decision. */
  "aiDoesNotDecide",
  /** Who can reach the material. */
  "whoCanAccess",
  /** Whether a candidate-safe summary may later be shared with them. */
  "summaryMayBeShared",
  /** The configured retention information -- or that there is none. */
  "retention",
  /** Where questions and correction requests go. */
  "contact",
] as const;

export type NoticeElement = (typeof NOTICE_ELEMENTS)[number];

/**
 * Whether one element can be stated, and if not, why not.
 *
 * The three members are three different sentences and none of them is a blank
 * space. `notConfigured` is the one the defect was hiding: it is a statement
 * about the EMPLOYER's setup, it is true, and a reader is much better served
 * by it than by a page that simply does not mention retention.
 */
export type ElementState =
  /** The product can say this, and does. */
  | "stated"
  /** The employer has not configured it. A fact about the setup, said plainly,
   *  never a promise invented to fill the gap. */
  | "notConfigured"
  /** A read did not land, so it is not known whether it is configured. Kept
   *  apart from `notConfigured` for the reason every read outcome in this
   *  codebase is kept apart from an absence: they are different claims. */
  | "unknown";

/* ------------------------------------------------------------------ */
/* The input                                                           */
/* ------------------------------------------------------------------ */

/**
 * Everything the projection needs, as plain data.
 *
 * Deliberately small, and deliberately not the case row: both surfaces read
 * from their OWN governed contract -- the candidate through
 * scp_iv_candidate_interview_detail, the employer through the case read -- and
 * meet here. Neither passes the other's data, and neither can widen what the
 * other sees by doing so.
 */
export interface NoticeInput {
  /** The organisation that initiated the interview. */
  readonly employerName: string | null;
  /** The advertised role, when the case is linked to an application and the
   *  role was actually read. Null is a real answer and renders as one. */
  readonly roleTitle: string | null;
  /** Whether the role is unavailable because a READ did not land, as opposed
   *  to there being none. `absent` means standalone. */
  readonly roleRead: SourceRead;
  /** Which kinds of material are attached. Kinds only -- `cv`, `transcript`,
   *  `passport_disclosure` -- never labels or contents. */
  readonly sourceKinds: readonly string[];
  /** A recording or transcript is being processed. */
  readonly transcriptInUse: boolean;
  /** The configured retention date, or null when none is configured. */
  readonly retainUntil: string | null;
  /** Whether the retention field was actually READ. A failed read must not
   *  render as "the employer has not configured retention". */
  readonly retentionRead: SourceRead;
  /** Whether the product has a governed route for questions and corrections.
   *  It does -- reportInterviewFactualError -- and this is here so the
   *  projection states a contact path only where one exists. */
  readonly correctionPathAvailable: boolean;
}

/* ------------------------------------------------------------------ */
/* The projection                                                      */
/* ------------------------------------------------------------------ */

export type NoticeStates = Readonly<Record<NoticeElement, ElementState>>;

/**
 * Which elements this case can actually state.
 *
 * Total over the element set, so a new element cannot be added without
 * deciding what makes it statable. Nothing here is a judgement about the
 * candidate, and nothing here is stored.
 */
export function projectCandidateNotice(input: NoticeInput): NoticeStates {
  return {
    // Read from the case's own employer. Unknown only when the read that
    // produced this input did not carry it.
    whoInitiated: input.employerName ? "stated" : "unknown",

    // THREE ANSWERS, NOT TWO. A standalone interview genuinely has no
    // advertised role and says so; a role whose read was refused or failed is
    // not known, and must not be reported as absent.
    whichRole: input.roleTitle
      ? "stated"
      : input.roleRead === "absent"
        ? "notConfigured"
        : input.roleRead === "ok"
          ? "notConfigured"
          : "unknown",

    // These four are properties of the METHOD, not of the case. They are true
    // of every interview this product runs -- the pinned pack, the human
    // confirmation gate, the prohibition on an automated employment decision --
    // so they are always statable, and a case that failed to say them would be
    // a bug rather than a configuration.
    purpose: "stated",
    aiProposes: "stated",
    humanConfirms: "stated",
    aiDoesNotDecide: "stated",

    // The KINDS in use. An empty list is a complete answer -- nothing is
    // attached yet -- and the copy says that rather than omitting the section.
    whatIsRecorded: "stated",

    // Who can reach the material is a property of the product's access model
    // (the employer's own members, under RLS, plus the person themselves), not
    // of this case's configuration.
    whoCanAccess: "stated",

    // Whether a candidate-safe summary MAY later be shared. Stated as a
    // possibility and never as a promise: nothing in this product releases one
    // automatically, and the page says the employer decides.
    summaryMayBeShared: "stated",

    // ── THE ONE THIS FILE EXISTS FOR ─────────────────────────────────
    //
    // Configured, not configured, or not known -- and the middle one used to
    // render as an empty region. It is `notConfigured` only when the read
    // actually landed; a read that did not is `unknown`, because "the employer
    // has not set a retention date" is a claim about somebody's setup and a
    // failed read is in no position to make it.
    retention:
      input.retentionRead === "refused" || input.retentionRead === "failed"
        ? "unknown"
        : input.retainUntil
          ? "stated"
          : "notConfigured",

    contact: input.correctionPathAvailable ? "stated" : "notConfigured",
  };
}

/**
 * Whether the notice is complete enough to stand as the whole of what somebody
 * is told before taking part.
 *
 * ── WHAT THIS IS FOR, GIVEN THERE IS NO EXTERNAL NOTICE ────────────────
 *
 * The brief asks for any external notice to be blocked when it would make a
 * false promise. The audit found none to block. What remains, and is worth
 * more, is telling the EMPLOYER: this is what the person can see about their
 * interview, and here is the part of it you have not decided. A recruiter who
 * believes the product has told the candidate about retention, when it has
 * told them there is no retention date, is the person this answer is for.
 *
 * `unknown` counts as incomplete for the same reason `notConfigured` does: in
 * neither case has the reader been told.
 */
export function noticeIsComplete(states: NoticeStates): boolean {
  return NOTICE_ELEMENTS.every((e) => states[e] === "stated");
}

/** The elements that are not stated, in the canonical order, for a surface
 *  that has to name them. */
export function noticeGaps(states: NoticeStates): readonly NoticeElement[] {
  return NOTICE_ELEMENTS.filter((e) => states[e] !== "stated");
}
