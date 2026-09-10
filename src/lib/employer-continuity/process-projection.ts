// The employer process projection — a READ of four lifecycles, never a fifth.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────
//
// A recruiter looking at one application is looking at four separate,
// independently governed processes at once:
//
//   1. the application lifecycle          job_applications.status
//   2. assessment participation + review  the attempt behind the assignment
//   3. the interview lifecycle            scp_interview_cases.status
//   4. report finalisation                scp_interview_reports.status = final
//
// Each is authoritative about itself, each has its own writers, and the whole
// product depends on them NOT being merged. What was missing was not a fifth
// status. It was a way to answer, in one place, "what is true right now and
// what is the one thing to do about it" without inventing anything.
//
// So this module is a PROJECTION and nothing else:
//
//   * it is pure — no I/O, no clock, no randomness, no React
//   * it writes nothing and returns nothing that is stored
//   * every value it produces is a rearrangement of a canonical field it was
//     handed; it adds no truth of its own
//   * it never derives one track from another
//
// The last point is the load-bearing one. An assessment being finished says
// NOTHING about the application's stage, and this file contains no path by
// which it could: `application` is copied through untouched, and no branch
// below reads the assessment or interview inputs when producing it. The
// process is a contextual spine, not a funnel — a candidate may be
// interviewed without a test, tested without an interview, or neither.
//
// ── WHY THE STATES ARE NAMED SEPARATELY FROM THE DATABASE'S ─────────────
//
// These are PRESENTATION states. `assessed` and `reported` are the runtime's
// words and stay the runtime's words; `reportMaterialReady` and
// `reportFinalised` are what those two mean to a person, and naming them
// apart is what stops a screen counting one as the other. The mapping is
// total and explicit — a status this file has never heard of resolves to
// `unknown` and is reported as such, rather than falling into whichever
// branch happened to be last.

import type { ApplicationAssessment } from "@/lib/security-competency/academy-employer.functions";
import type {
  ApplicationInterviewCase,
  CaseStatus,
} from "@/lib/interview-intelligence/runtime.functions";

/* ------------------------------------------------------------------ */
/* How a read went                                                     */
/* ------------------------------------------------------------------ */

/**
 * The state of one READ, kept apart from the state of the thing read.
 *
 * "No assessment exists" and "we could not find out whether one exists" are
 * different sentences, and collapsing them is the single most common way a
 * product tells a user something false. Every track below carries this, and
 * every presentation state has a distinct member for each unhappy answer, so
 * a failure cannot be rendered as a zero by accident: there is no code path
 * that turns `failed` into `none`.
 */
export type TrackRead = "loading" | "ready" | "failed" | "refused";

/* ------------------------------------------------------------------ */
/* Track 1 — the application                                           */
/* ------------------------------------------------------------------ */

/** The human-controlled recruitment stage, passed through UNCHANGED.
 *
 *  It is here so the strip can show it beside the others, and for no other
 *  reason: nothing in this module reads it to decide anything, and nothing in
 *  this module can change it. */
export interface ApplicationTrack {
  readonly read: TrackRead;
  /** `job_applications.status`, verbatim. Null while unread. */
  readonly status: string | null;
}

/* ------------------------------------------------------------------ */
/* Choosing ONE record out of several                                  */
/* ------------------------------------------------------------------ */
//
// ── THE DEFECT THIS SECTION EXISTS BECAUSE OF ───────────────────────────
//
// An application can carry several interview cases and several assessment
// attempts, and the strip has one row and one action for each track. The first
// version answered both questions with a single "lead" record, chosen as the
// FURTHEST ALONG -- and then summed the outstanding work across every record
// and pointed the action at that lead.
//
// Both halves were wrong, and they were wrong in the direction that hides
// work:
//
//   * A case at `reported` outranked a case at `assessed`, so an application
//     with one finished report and one report-underlag awaiting review
//     announced "the report has been finalised and can be opened" and offered
//     no path to the work a human still owed. The ladder's own priority rule
//     said the opposite; the ranking overruled it before the ladder ran.
//   * `proposalsAwaitingReview` was summed over every case while the action
//     opened the lead case, so "3 pieces of material to review" could send a
//     recruiter to a case with none of them.
//   * The same two faults on the assessment side: a released brief outranked
//     an attempt still awaiting review, and the review action opened the
//     released attempt rather than the one with responses outstanding.
//
// ── THE FIX: TWO KINDS OF SELECTION, NEVER ONE ──────────────────────────
//
//   PRESENTATION  which record the status ROW names. One row, several records,
//                 so something must be chosen -- and what it must never do is
//                 let a terminal record speak for an application that still
//                 owes work. Ordered by ATTENTION, not by progress.
//
//   ACTION        which record a given action opens. Chosen by the predicate
//                 for THAT action and nothing else: the case with pending
//                 proposals, the attempt with responses outstanding, the case
//                 holding report material, the attempt whose brief is ready to
//                 share. Never a general "lead".
//
// The tracks below therefore carry a presentation record AND one field per
// action, and the ladder reads only the action fields. A destination can no
// longer be the record that merely happened to rank highest.

/**
 * THE TIE-BREAK, written once.
 *
 * Every selection here picks from a SET, and a set has no order.
 * `listInterviewCasesForApplication` happens to return newest-first today;
 * nothing may depend on that, because a projection whose answer changes with
 * the order it was handed is not deterministic and cannot be reasoned about.
 *
 * So: the record that has WAITED LONGEST wins, and where two have waited
 * exactly as long the lower id wins. The first half is the useful rule — the
 * oldest outstanding work is the work to do first. The second exists only to
 * make the order TOTAL, so one set always gives one answer whatever sequence
 * it arrives in. The guard asserts that property by shuffling the input.
 */
function oldestOf<T>(
  rows: readonly T[],
  idOf: (row: T) => string,
  waitingSinceOf: (row: T) => string,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (best === null) {
      best = row;
      continue;
    }
    const a = waitingSinceOf(row);
    const b = waitingSinceOf(best);
    if (a < b || (a === b && idOf(row) < idOf(best))) best = row;
  }
  return best;
}

/**
 * The record the status row names: the one needing the most attention, and
 * among equals the one that has waited longest.
 *
 * Rank first and time second, in that order, because "which of these needs a
 * person" is a stronger claim than "which of these is older".
 */
function mostAttention<T>(
  rows: readonly T[],
  rankOf: (row: T) => number,
  idOf: (row: T) => string,
  waitingSinceOf: (row: T) => string,
): T | null {
  let best: T | null = null;
  let bestRank = -Infinity;
  for (const row of rows) {
    const rank = rankOf(row);
    if (best === null || rank > bestRank) {
      best = row;
      bestRank = rank;
      continue;
    }
    if (rank < bestRank) continue;
    const a = waitingSinceOf(row);
    const b = waitingSinceOf(best);
    if (a < b || (a === b && idOf(row) < idOf(best))) best = row;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Track 2 — assessment participation and review                       */
/* ------------------------------------------------------------------ */

/**
 * What the employer sees of the assessment track.
 *
 * The five "ready" members are exactly the five the existing panel already
 * derived from the attempt (`stageOf`), lifted here so that the panel, the
 * list chip and the projection cannot drift apart. The three unhappy members
 * are new, and they are the point: the panel previously rendered a failed
 * read as "no assessment has been sent".
 */
export type AssessmentState =
  | "loading"
  | "unavailable"
  | "refused"
  | "none"
  | "invited"
  | "in_progress"
  | "under_review"
  | "brief_ready"
  | "brief_released";

export interface AssessmentTrack {
  readonly read: TrackRead;
  /** THE ROW'S state, and only the row's. Never a destination, and never the
   *  thing the ladder branches on: see the selection section above. */
  readonly state: AssessmentState;
  /** How many candidate responses are waiting on a human reviewer, summed
   *  across this application's attempts. Zero whenever the read did not
   *  succeed — and `state` says so, so the number is never read alone.
   *
   *  It is a SUM, so the attempt it opens must be chosen by the same
   *  predicate that produced it. `reviewAttemptId` below is that attempt; the
   *  presentation attempt is not, and using it was the defect. */
  readonly responsesAwaitingReview: number;
  /** The attempt the ROW describes. Presentation only — deliberately not named
   *  `lead`, because a general lead is exactly what must never be used as a
   *  destination. Null when there is none, or when the read did not succeed. */
  readonly presentationAttemptId: string | null;

  // ── ACTION TARGETS ──────────────────────────────────────────────────
  //
  // One field per action the ladder can propose, each selected by that
  // action's OWN predicate and the shared tie-break. Null means "no attempt
  // is in that state", which is also how the ladder knows not to propose it.

  /** Responses are waiting on a human reviewer here. */
  readonly reviewAttemptId: string | null;
  /** Scored, and the candidate brief has not been shared yet. */
  readonly releaseAttemptId: string | null;
  /** Assigned or under way: the candidate owes the next move here. */
  readonly awaitingCandidateAttemptId: string | null;
  /** A released brief exists here. Terminal, and carried so the row can say
   *  so even while it names an attempt that still owes work. */
  readonly releasedAttemptId: string | null;
  /** How many attempts this application has. Shown only so a second attempt
   *  is not invisible behind a row that can name one; it is not a status. */
  readonly attemptCount: number;
}

/**
 * Which of the five stages one attempt is at.
 *
 * The order inside this function is about ONE attempt and is unchanged: a
 * released brief is further along than a scored one, which is further along
 * than one with reviews outstanding. It is exported because the panel and the
 * chip render from it too — one derivation, three surfaces, no possibility of
 * three answers.
 *
 * Do not confuse it with ASSESSMENT_ATTENTION below, which is about choosing
 * BETWEEN attempts and runs in very nearly the opposite direction.
 */
export function assessmentStageOf(
  a: ApplicationAssessment,
): Exclude<AssessmentState, "loading" | "unavailable" | "refused" | "none"> {
  if (a.reportAvailable) return "brief_released";
  if (a.attemptStatus === "scored") return "brief_ready";
  if (a.reviewsOutstanding > 0) return "under_review";
  if (a.answered > 0) return "in_progress";
  return "invited";
}

/** Which attempt the ROW should name, when there are several.
 *
 *  ORDERED BY ATTENTION, which is close to the reverse of progress: an attempt
 *  awaiting review outranks one that is merely scored, which outranks one the
 *  candidate is still sitting, and a RELEASED brief — the only terminal state
 *  here — ranks below all of them. That inversion is the point. Ranked by
 *  progress, one released attempt spoke for an application that still owed a
 *  reviewer ten responses, and the row read "Slutförd".
 *
 *  The released attempt is not lost: `releasedAttemptId` carries it, and the
 *  panel below the strip lists every attempt with its own stage. */
const ASSESSMENT_ATTENTION: Record<ReturnType<typeof assessmentStageOf>, number> = {
  under_review: 4,
  brief_ready: 3,
  in_progress: 2,
  invited: 1,
  brief_released: 0,
};

const EMPTY_ASSESSMENT = {
  responsesAwaitingReview: 0,
  presentationAttemptId: null,
  reviewAttemptId: null,
  releaseAttemptId: null,
  awaitingCandidateAttemptId: null,
  releasedAttemptId: null,
  attemptCount: 0,
} as const;

export function projectAssessmentTrack(
  read: TrackRead,
  assessments: readonly ApplicationAssessment[],
): AssessmentTrack {
  if (read !== "ready") {
    return {
      read,
      state: read === "loading" ? "loading" : read === "refused" ? "refused" : "unavailable",
      ...EMPTY_ASSESSMENT,
    };
  }
  if (assessments.length === 0) {
    return { read, state: "none", ...EMPTY_ASSESSMENT };
  }

  const id = (a: ApplicationAssessment) => a.attemptId;
  // How long this attempt has been waiting. `invitedAt` is when the clock
  // started for the candidate and for everybody after them, and it is the one
  // timestamp every attempt has.
  const since = (a: ApplicationAssessment) => a.invitedAt;
  const inStage = (...stages: ReturnType<typeof assessmentStageOf>[]) =>
    assessments.filter((a) => stages.includes(assessmentStageOf(a)));

  // Each action's target, by that action's OWN predicate.
  //
  // `reviewAttemptId` is deliberately not "the attempt in the under_review
  // STAGE": the stage function ranks a scored or released attempt above
  // outstanding reviews, so an attempt can hold responses a human owes and not
  // be in that stage. The sum below counts `reviewsOutstanding` on every
  // attempt, so the attempt this opens is chosen by the same field.
  const review = oldestOf(
    assessments.filter((a) => a.reviewsOutstanding > 0),
    id,
    since,
  );
  const release = oldestOf(inStage("brief_ready"), id, since);
  const awaitingCandidate = oldestOf(inStage("invited", "in_progress"), id, since);
  const released = oldestOf(inStage("brief_released"), id, since);

  // And the row's attempt, by attention.
  const presentation = mostAttention(
    assessments,
    (a) => ASSESSMENT_ATTENTION[assessmentStageOf(a)],
    id,
    since,
  );

  return {
    read,
    state: presentation ? assessmentStageOf(presentation) : "none",
    // Summed across attempts, because the work is per response and a reviewer
    // owes all of it. The attempt it opens is `reviewAttemptId`, chosen by the
    // same predicate — never the presentation attempt.
    responsesAwaitingReview: assessments.reduce((n, a) => n + a.reviewsOutstanding, 0),
    presentationAttemptId: presentation ? id(presentation) : null,
    reviewAttemptId: review ? id(review) : null,
    releaseAttemptId: release ? id(release) : null,
    awaitingCandidateAttemptId: awaitingCandidate ? id(awaitingCandidate) : null,
    releasedAttemptId: released ? id(released) : null,
    attemptCount: assessments.length,
  };
}

/* ------------------------------------------------------------------ */
/* Track 3 — the interview                                             */
/* ------------------------------------------------------------------ */

/**
 * What the employer sees of the interview track.
 *
 * `reportMaterialReady` is `assessed`: a human has finished assessing and the
 * material for a report exists. It is NOT a report. `reportFinalised` is
 * `reported`, and only that.
 */
export type InterviewState =
  | "loading"
  | "unavailable"
  | "refused"
  | "none"
  | "preparing"
  | "readyToInterview"
  | "interviewing"
  | "evidenceReview"
  | "reportMaterialReady"
  | "reportFinalised"
  | "cancelled"
  | "unknown";

/** Total, explicit, and asserted exhaustive by the E1 guard against CASE_FLOW.
 *  A status that is not listed becomes `unknown` and is reported as an
 *  unrecognised state — never silently folded into a neighbouring one. */
const INTERVIEW_STATE_OF: Record<CaseStatus, InterviewState> = {
  draft: "preparing",
  sources_ready: "preparing",
  prep_generated: "preparing",
  prep_approved: "readyToInterview",
  interview_in_progress: "interviewing",
  interview_complete: "evidenceReview",
  evidence_review: "evidenceReview",
  assessed: "reportMaterialReady",
  reported: "reportFinalised",
  cancelled: "cancelled",
};

export function interviewStateOf(status: string): InterviewState {
  return INTERVIEW_STATE_OF[status as CaseStatus] ?? "unknown";
}

/** Which case the ROW should name, when there are several.
 *
 *  ORDERED BY ATTENTION, not by progress. This ordering used to run the other
 *  way — `reportFinalised` was the top rank — and that single line produced
 *  the defect this section exists for: an application with one finished report
 *  and one case at `assessed` announced that the report was finalised and
 *  could be opened, and offered no route at all to the report material a human
 *  still owed a review. The ladder's own rule put that work above a finished
 *  report; the ranking had already overruled it.
 *
 *  So a case that owes a person something outranks one that is done:
 *
 *    reportMaterialReady  a human owes it a review and a decision to finalise
 *    evidenceReview       a human owes it confirmation and assessment
 *    interviewing         a conversation is open
 *    readyToInterview     prepared, waiting to be held
 *    preparing            created, not yet ready
 *    unknown              a status this build does not recognise. Above the
 *                         terminal ones ON PURPOSE: an unrecognised state is
 *                         not known to be finished, and ranking it below a
 *                         finalised report is how a newly added status would
 *                         become invisible.
 *    reportFinalised      terminal, and still fully reported by the report
 *                         track and by `finalisedCaseId`
 *    cancelled            terminal and inert
 *
 *  Nothing is lost by the inversion. The report row reads every case, so a
 *  finalised report is still announced while the interview row names the case
 *  that owes work; `caseCount` says how many cases there are; and the section
 *  below the strip lists every one of them with its own chip. */
const INTERVIEW_ATTENTION: Record<InterviewState, number> = {
  loading: -1,
  unavailable: -1,
  refused: -1,
  none: -1,
  cancelled: 0,
  reportFinalised: 1,
  unknown: 2,
  preparing: 3,
  readyToInterview: 4,
  interviewing: 5,
  evidenceReview: 6,
  reportMaterialReady: 7,
};

export interface InterviewTrack {
  readonly read: TrackRead;
  /** THE ROW'S state, and only the row's. Never a destination, and never the
   *  thing the ladder branches on: see the selection section above. */
  readonly state: InterviewState;
  /** AI-proposed evidence nobody has looked at yet, across this application's
   *  cases. Process work, never anything about the candidate.
   *
   *  It is a SUM, so the case it opens must be chosen by the same predicate
   *  that produced it. `proposalsCaseId` below is that case; the presentation
   *  case is not, and using it was the defect. */
  readonly proposalsAwaitingReview: number;
  /** The case the ROW describes. Presentation only — deliberately not named
   *  `lead`, because a general lead is exactly what must never be used as a
   *  destination. */
  readonly presentationCaseId: string | null;
  /** The presentation case's status EXACTLY as the runtime holds it.
   *
   *  Carried so the surface can render the runtime's own word for it — the
   *  same word the case chip and the interview list use — instead of a second
   *  vocabulary for one state. `state` above drives nothing but the row; this
   *  drives its label. Null whenever the read did not succeed or there is no
   *  case. */
  readonly presentationStatus: string | null;

  // ── ACTION TARGETS ──────────────────────────────────────────────────
  //
  // One field per action the ladder can propose, each selected by that
  // action's OWN predicate and the shared tie-break. Null means "no case is
  // in that state", which is also how the ladder knows not to propose it.

  /** AI-proposed evidence is waiting for a human here. */
  readonly proposalsCaseId: string | null;
  /** Report material exists here and awaits review before finalisation. */
  readonly reportMaterialCaseId: string | null;
  /** The interview has been held; its material needs confirming and assessing. */
  readonly evidenceReviewCaseId: string | null;
  /** A conversation is open here. */
  readonly interviewingCaseId: string | null;
  /** Prepared and waiting to be held. */
  readonly readyToInterviewCaseId: string | null;
  /** Created, not yet prepared. */
  readonly preparingCaseId: string | null;
  /** How many cases this application has. Shown only so a second interview is
   *  not invisible behind a row that can name one; it is not a status. */
  readonly caseCount: number;
}

const EMPTY_INTERVIEW = {
  proposalsAwaitingReview: 0,
  presentationCaseId: null,
  presentationStatus: null,
  proposalsCaseId: null,
  reportMaterialCaseId: null,
  evidenceReviewCaseId: null,
  interviewingCaseId: null,
  readyToInterviewCaseId: null,
  preparingCaseId: null,
  caseCount: 0,
} as const;

export function projectInterviewTrack(
  read: TrackRead,
  cases: readonly ApplicationInterviewCase[],
): InterviewTrack {
  if (read !== "ready") {
    return {
      read,
      state: read === "loading" ? "loading" : read === "refused" ? "refused" : "unavailable",
      ...EMPTY_INTERVIEW,
    };
  }
  if (cases.length === 0) {
    return { read, state: "none", ...EMPTY_INTERVIEW };
  }

  const id = (c: ApplicationInterviewCase) => c.id;
  // How long this case has been sitting in the state it is in. `updatedAt` is
  // the runtime's own last-touched stamp, so the case nobody has moved for
  // longest is the one that has waited longest.
  const since = (c: ApplicationInterviewCase) => c.updatedAt;
  const inState = (state: InterviewState) =>
    cases.filter((c) => interviewStateOf(c.status) === state);

  // Each action's target, by that action's OWN predicate.
  //
  // `proposalsCaseId` is chosen by the very field the sum below counts, so the
  // number the strip shows and the case its action opens can never be about
  // different cases. It is deliberately independent of the case's STATE: a
  // case can hold pending proposals in more than one status, and the work is
  // owed wherever it sits.
  const proposals = oldestOf(
    cases.filter((c) => c.proposalsAwaitingReview > 0),
    id,
    since,
  );
  const reportMaterial = oldestOf(inState("reportMaterialReady"), id, since);
  const evidenceReview = oldestOf(inState("evidenceReview"), id, since);
  const interviewing = oldestOf(inState("interviewing"), id, since);
  const readyToInterview = oldestOf(inState("readyToInterview"), id, since);
  const preparing = oldestOf(inState("preparing"), id, since);

  // And the row's case, by attention.
  const presentation = mostAttention(
    cases,
    (c) => INTERVIEW_ATTENTION[interviewStateOf(c.status)],
    id,
    since,
  );

  return {
    read,
    state: presentation ? interviewStateOf(presentation.status) : "none",
    proposalsAwaitingReview: cases.reduce((n, c) => n + c.proposalsAwaitingReview, 0),
    presentationCaseId: presentation ? id(presentation) : null,
    presentationStatus: presentation ? presentation.status : null,
    proposalsCaseId: proposals ? id(proposals) : null,
    reportMaterialCaseId: reportMaterial ? id(reportMaterial) : null,
    evidenceReviewCaseId: evidenceReview ? id(evidenceReview) : null,
    interviewingCaseId: interviewing ? id(interviewing) : null,
    readyToInterviewCaseId: readyToInterview ? id(readyToInterview) : null,
    preparingCaseId: preparing ? id(preparing) : null,
    caseCount: cases.length,
  };
}

/* ------------------------------------------------------------------ */
/* Track 4 — report finalisation                                       */
/* ------------------------------------------------------------------ */

/**
 * Whether a report exists, and if so which kind.
 *
 * The distinction this type exists to hold: `materialReady` means a human has
 * assessed and the underlag is waiting to be reviewed and locked. Nothing has
 * been finalised, nothing is immutable, and nothing may be counted as a
 * finished report. `finalised` means `scp_interview_reports.status = 'final'`
 * — a frozen snapshot with its own content hash.
 *
 * It is derived from `reportFinalised`, which the server reads from the
 * reports table, and never from the case status alone.
 */
export type ReportAvailability =
  | "loading"
  | "unavailable"
  | "refused"
  | "none"
  | "materialReady"
  | "finalised"
  /**
   * BOTH, in different cases — one report has been finalised AND another case
   * holds material a human still owes a review.
   *
   * A member of its own rather than a choice between the two, because both
   * facts are true and dropping either one misleads. Reporting only
   * `finalised` said the reporting work was over when it was not; reporting
   * only `materialReady` would deny a document that exists, is immutable and
   * may already have informed a decision.
   */
  | "materialAndFinalised";

export interface ReportTrack {
  readonly read: TrackRead;
  readonly availability: ReportAvailability;
  /** The case whose finalised report may be opened. Null unless one exists.
   *  Chosen with the shared tie-break, so several finalised reports resolve to
   *  one answer whatever order they arrived in. */
  readonly finalisedCaseId: string | null;
  /** The case whose report material awaits review. Null unless one exists.
   *  Carried separately from `finalisedCaseId` precisely so one cannot stand
   *  in for the other. */
  readonly materialCaseId: string | null;
}

export function projectReportTrack(
  read: TrackRead,
  cases: readonly ApplicationInterviewCase[],
): ReportTrack {
  if (read !== "ready") {
    return {
      read,
      availability: read === "loading" ? "loading" : read === "refused" ? "refused" : "unavailable",
      finalisedCaseId: null,
      materialCaseId: null,
    };
  }

  const id = (c: ApplicationInterviewCase) => c.id;
  const since = (c: ApplicationInterviewCase) => c.updatedAt;

  // A finalised report is a ROW in scp_interview_reports, not a case status: a
  // case can read `reported` and have no final report, and that is not a
  // report. Both of these read the whole list -- this track never had a "lead"
  // and must not acquire one.
  const finalised = oldestOf(
    cases.filter((c) => c.reportFinalised),
    id,
    since,
  );
  // Material, and only material. `assessed` is the runtime saying a human has
  // finished assessing; it is not a report and is never counted as one.
  const material = oldestOf(
    cases.filter((c) => interviewStateOf(c.status) === "reportMaterialReady"),
    id,
    since,
  );

  // Both, one, or neither -- said as it is. The first branch is the mixed case
  // the review found: a finished report in one case and unreviewed material in
  // another, which the earlier `find` collapsed into "finalised" and hid.
  const availability: ReportAvailability =
    material && finalised
      ? "materialAndFinalised"
      : material
        ? "materialReady"
        : finalised
          ? "finalised"
          : "none";

  return {
    read,
    availability,
    finalisedCaseId: finalised ? id(finalised) : null,
    materialCaseId: material ? id(material) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Linkage                                                             */
/* ------------------------------------------------------------------ */

/**
 * Whether a process belongs to a recruitment application.
 *
 * The ONLY admissible evidence is a persisted identifier the server read from
 * the process's own row — `scp_interview_cases.application_id`, or the
 * assignment's `application_id`. This function takes that id and nothing else,
 * which is the enforcement: there is no parameter here through which a name,
 * an email address, a role title or a chosen interview guide could reach the
 * answer, so no caller can accidentally link by one.
 */
export type ProcessLinkage = "recruitmentLinked" | "standalone";

export function processLinkage(applicationId: string | null | undefined): ProcessLinkage {
  return applicationId ? "recruitmentLinked" : "standalone";
}

/* ------------------------------------------------------------------ */
/* The one next action                                                 */
/* ------------------------------------------------------------------ */

/**
 * What the employer should do next — operationally.
 *
 * Every member is a piece of PROCESS work: provide something, review
 * something, wait for somebody, open something that exists. There is
 * deliberately no member that expresses an opinion about the candidate: no
 * hire, no reject, no shortlist, no rank, no score, no suitability. Adding one
 * would make this a decision engine, which E1 must not contain and the guard
 * refuses.
 *
 * `waitingOn` says who owns the next move, so a screen can tell "you have
 * work" from "we are waiting" without inventing a call to action for the
 * second one.
 */
export type NextActionKind =
  | "loading"
  /** One or more tracks could not be read. No action is proposed, because any
   *  action proposed from a partial picture might be the wrong one. */
  | "unavailable"
  | "reviewInterviewEvidence"
  | "reviewAssessmentResponses"
  | "reviewReportMaterial"
  | "startInterview"
  | "continueInterview"
  | "assessInterviewEvidence"
  | "prepareInterview"
  | "shareAssessmentBrief"
  | "awaitCandidateAssessment"
  | "awaitColleague"
  | "openFinalisedReport"
  /** Nothing has been started, and nothing is required to be. Deliberately a
   *  STATEMENT and not a call to action: assessment and interview are both
   *  optional, and picking one of them as "the next step" would turn a
   *  contextual spine into a funnel the product does not have. */
  | "nothingStarted"
  | "nothingOutstanding";

/** Who the next move belongs to. */
export type WaitingOn = "employer" | "candidate" | "colleague" | "nobody" | "unknown";

/** Where the action goes, as a canonical typed destination the route tree
 *  already contains. Expressed as a discriminated union rather than a string
 *  so a destination that stops existing is a type error, not a 404.
 *
 *  Every member below is REACHABLE: some branch of `deriveNextAction` produces
 *  it. An `interviewNew` member used to sit here, left behind when the
 *  "plan an interview" action was removed for the funnel rule -- a destination
 *  nothing could produce, and a branch in the strip that could never run. A
 *  dead member of this union is not harmless: it reads as a route the
 *  projection can send somebody to, and it cannot. */
export type ActionDestination =
  | { readonly kind: "none" }
  | { readonly kind: "assessmentReview"; readonly attemptId: string }
  | { readonly kind: "assessmentParticipants" }
  | { readonly kind: "interviewCase"; readonly caseId: string }
  | { readonly kind: "interviewReport"; readonly caseId: string };

export interface NextAction {
  readonly kind: NextActionKind;
  readonly waitingOn: WaitingOn;
  readonly destination: ActionDestination;
  /** Which track could not be read, when `kind` is "unavailable". */
  readonly unavailableTrack: "assessment" | "interview" | "both" | null;
}

/**
 * The capabilities this reader actually holds, each one checked against the
 * contract that governs its own action rather than inferred from a role label.
 *
 * They are inputs, not decisions: this module does not know how they were
 * obtained and cannot widen them. UI hiding is not enforcement — every
 * destination re-decides on arrival, and every write re-decides in the
 * database.
 *
 * ── ONLY THE CAPABILITIES THIS MODULE ACTUALLY READS ────────────────────
 *
 * There were four. `canAssignAssessment` and `canPlanInterview` were declared
 * here, computed by the caller and passed in on every render, and never read
 * by a single branch below — left over from an earlier draft in which the
 * projection proposed "send an assessment" and "plan an interview" as next
 * steps. Those two actions were removed because they made the spine a funnel:
 * neither process is required, and naming one of them as THE next step invents
 * a sequence the product does not have.
 *
 * A capability that nothing reads is worse than no capability at all. It reads
 * as a permission check that is happening, invites the next reader to trust it,
 * and would go on looking like enforcement long after it had stopped being
 * consulted. The two controls those fields described still exist — the assign
 * button inside the assessment panel, the start link inside the interview
 * section — each gated by its own capability at its own call site, which is
 * where a control's permission belongs.
 */
export interface ContinuityCapabilities {
  /** A reviewer seat with no conflict for THIS attempt, from the same
   *  scp_employer_review_board the review workspace reads. */
  readonly canReviewAssessment: boolean;
  /** Sharing a scored brief: scp_employer_assessment_pipeline computes
   *  can_release as scored AND not yet released AND owner/admin, so for a
   *  brief_ready attempt this is exactly the owner/admin half. */
  readonly canShareAssessmentBrief: boolean;
}

export interface ProcessProjection {
  readonly application: ApplicationTrack;
  readonly assessment: AssessmentTrack;
  readonly interview: InterviewTrack;
  readonly report: ReportTrack;
  readonly nextAction: NextAction;
  /** True when a human — this one or a colleague — owes this process work. */
  readonly needsHumanAttention: boolean;
}

const NO_DESTINATION: ActionDestination = { kind: "none" };

/**
 * The whole projection, in one deterministic pass.
 *
 * The ladder inside `deriveNextAction` is ordered by what the employer OWES,
 * then by what is under way, then by who is being waited for. It stops at the
 * first match, which is what makes the answer single and stable: the same four
 * tracks always produce the same action, and no branch consults the
 * application's own status to reach it.
 */
export function projectProcess(input: {
  readonly application: ApplicationTrack;
  readonly assessment: AssessmentTrack;
  readonly interview: InterviewTrack;
  readonly report: ReportTrack;
  readonly capabilities: ContinuityCapabilities;
}): ProcessProjection {
  const nextAction = deriveNextAction(
    input.assessment,
    input.interview,
    input.report,
    input.capabilities,
  );
  return {
    // Copied through untouched. This is the line that proves the application
    // lifecycle is not derived from the others: there is no expression here,
    // only the input the caller was already holding.
    application: input.application,
    assessment: input.assessment,
    interview: input.interview,
    report: input.report,
    nextAction,
    needsHumanAttention:
      nextAction.waitingOn === "employer" || nextAction.waitingOn === "colleague",
  };
}

function deriveNextAction(
  assessment: AssessmentTrack,
  interview: InterviewTrack,
  report: ReportTrack,
  cap: ContinuityCapabilities,
): NextAction {
  // ── 0. Still reading ───────────────────────────────────────────────
  // A spinner is not a state of the process. Proposing an action from a
  // half-loaded page is how a recruiter is told to do something that was
  // already done.
  if (assessment.read === "loading" || interview.read === "loading") {
    return {
      kind: "loading",
      waitingOn: "unknown",
      destination: NO_DESTINATION,
      unavailableTrack: null,
    };
  }

  // ── 1. A track we could not read ───────────────────────────────────
  // Named, not hidden, and NOT rendered as an empty process. The tracks
  // themselves still show whatever did load; it is only the single overall
  // action that is withheld, because it could be the wrong one.
  const aBad = assessment.read === "failed" || assessment.read === "refused";
  const iBad = interview.read === "failed" || interview.read === "refused";
  if (aBad || iBad) {
    return {
      kind: "unavailable",
      waitingOn: "unknown",
      destination: NO_DESTINATION,
      unavailableTrack: aBad && iBad ? "both" : aBad ? "assessment" : "interview",
    };
  }

  // ── EVERY BRANCH BELOW READS AN ACTION TARGET ──────────────────────
  //
  // Not `interview.state`, not `assessment.state`, and never a general lead.
  // Those describe the ROW; a row describes one record and an application can
  // hold several, so branching on them let the record that merely ranked
  // highest decide both whether work existed and where the recruiter was sent.
  //
  // Each `…CaseId` / `…AttemptId` below is null exactly when no record is in
  // that state, so `!== null` is both "is there work of this kind" and "which
  // record has it", answered by the same predicate. Nothing else can drift
  // between the two.

  // ── 2. Evidence a human has not looked at ──────────────────────────
  // First because it is the only work in the product where a machine has
  // proposed something and no person has yet agreed or disagreed. The case
  // opened is the one holding the proposals -- selected by the very field the
  // count sums, so the number and the destination cannot be about different
  // cases.
  if (interview.proposalsCaseId) {
    return {
      kind: "reviewInterviewEvidence",
      waitingOn: "employer",
      destination: { kind: "interviewCase", caseId: interview.proposalsCaseId },
      unavailableTrack: null,
    };
  }

  // ── 3. Candidate responses waiting on a reviewer ───────────────────
  // Capability-checked against the review board, not against a role label:
  // an owner who sat the assessment themselves may not review it, and the
  // honest answer there is that a colleague must.
  //
  // The condition is the ATTEMPT, not the row's stage. It used to read
  // `assessment.state === "under_review"`, so a released brief on another
  // attempt -- which outranked the one under review -- made this branch
  // invisible and the outstanding responses with it.
  if (assessment.reviewAttemptId) {
    return cap.canReviewAssessment
      ? {
          kind: "reviewAssessmentResponses",
          waitingOn: "employer",
          destination: { kind: "assessmentReview", attemptId: assessment.reviewAttemptId },
          unavailableTrack: null,
        }
      : {
          kind: "awaitColleague",
          waitingOn: "colleague",
          destination: NO_DESTINATION,
          unavailableTrack: null,
        };
  }

  // ── 4. Report material waiting to be reviewed and locked ───────────
  // Deliberately ABOVE "open the finalised report": a case that has material
  // pending owes work, and a DIFFERENT case having finished does not excuse
  // it. That sentence was already here and was already the intent; what made
  // it false was the row's ranking putting the finalised case first, so this
  // branch never ran. It now reads the case that actually holds material.
  if (interview.reportMaterialCaseId) {
    return {
      kind: "reviewReportMaterial",
      waitingOn: "employer",
      destination: { kind: "interviewReport", caseId: interview.reportMaterialCaseId },
      unavailableTrack: null,
    };
  }

  // ── 5. An interview that exists and is not finished ────────────────
  //
  // Three states, three actions, because they are three different pieces of
  // work: an interview that has not happened yet is not one that is under way,
  // and neither is one whose evidence is waiting to be assessed. Collapsing
  // them told a recruiter their interview was "påbörjad" on the day it was
  // approved -- and disagreed with the chip beside it.
  //
  // In the order a person meets them: evidence to assess, then a conversation
  // to continue, then one to hold.
  if (interview.evidenceReviewCaseId) {
    return {
      kind: "assessInterviewEvidence",
      waitingOn: "employer",
      destination: { kind: "interviewCase", caseId: interview.evidenceReviewCaseId },
      unavailableTrack: null,
    };
  }
  if (interview.interviewingCaseId) {
    return {
      kind: "continueInterview",
      waitingOn: "employer",
      destination: { kind: "interviewCase", caseId: interview.interviewingCaseId },
      unavailableTrack: null,
    };
  }
  if (interview.readyToInterviewCaseId) {
    return {
      kind: "startInterview",
      waitingOn: "employer",
      destination: { kind: "interviewCase", caseId: interview.readyToInterviewCaseId },
      unavailableTrack: null,
    };
  }

  // ── 6. An interview that has been created but not prepared ─────────
  if (interview.preparingCaseId) {
    return {
      kind: "prepareInterview",
      waitingOn: "employer",
      destination: { kind: "interviewCase", caseId: interview.preparingCaseId },
      unavailableTrack: null,
    };
  }

  // ── 7. A scored assessment whose brief nobody has shared ───────────
  // The attempt again, not the row: a released brief elsewhere used to outrank
  // a scored one and hide this.
  if (assessment.releaseAttemptId) {
    return cap.canShareAssessmentBrief
      ? {
          kind: "shareAssessmentBrief",
          waitingOn: "employer",
          destination: { kind: "assessmentParticipants" },
          unavailableTrack: null,
        }
      : {
          kind: "awaitColleague",
          waitingOn: "colleague",
          destination: NO_DESTINATION,
          unavailableTrack: null,
        };
  }

  // ── 8. Waiting on the candidate ────────────────────────────────────
  // A statement, not a call to action. The employer has nothing to do here and
  // must not be given a button that implies otherwise. Same correction: an
  // attempt the candidate is still sitting is no longer hidden by a released
  // brief on another attempt.
  if (assessment.awaitingCandidateAttemptId) {
    return {
      kind: "awaitCandidateAssessment",
      waitingOn: "candidate",
      destination: NO_DESTINATION,
      unavailableTrack: null,
    };
  }

  // ── 9. A finished report, and nothing outstanding ──────────────────
  //
  // Reached only once every branch above has declined, which is what makes
  // "and nothing outstanding" true rather than hopeful. Keyed on the ID rather
  // than on the availability enum: `materialAndFinalised` is also a finalised
  // report, and a branch that tested the enum would have to be remembered
  // every time a member is added.
  if (report.finalisedCaseId) {
    return {
      kind: "openFinalisedReport",
      waitingOn: "nobody",
      destination: { kind: "interviewReport", caseId: report.finalisedCaseId },
      unavailableTrack: null,
    };
  }

  // ── 10. Nothing has been started ───────────────────────
  //
  // THE FUNNEL RULE, stated as an absence.
  //
  // An employer may interview without testing, test without interviewing, or
  // do neither and decide on the application alone. So when neither process
  // exists there is no "next step", and naming one would invent a sequence the
  // product does not have. What the strip says instead is that nothing is
  // pending and that both are optional; the two controls that START them are
  // where they have always been, inside their own modules, each already gated
  // by its own capability.
  if (assessment.attemptCount === 0 && interview.caseCount === 0) {
    return {
      kind: "nothingStarted",
      waitingOn: "nobody",
      destination: NO_DESTINATION,
      unavailableTrack: null,
    };
  }

  // ── 11. Nothing outstanding ────────────────────────────
  //
  // Reached when one track has finished and the other never began -- a
  // released assessment brief with no interview, say. Nothing is pending on
  // the spine, and the decision that remains belongs to the application
  // lifecycle, which has its own controls further down the page.
  return {
    kind: "nothingOutstanding",
    waitingOn: "nobody",
    destination: NO_DESTINATION,
    unavailableTrack: null,
  };
}
