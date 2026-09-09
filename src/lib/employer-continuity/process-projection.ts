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
  readonly state: AssessmentState;
  /** How many candidate responses are waiting on a human reviewer, summed
   *  across this application's attempts. Zero whenever the read did not
   *  succeed — and `state` says so, so the number is never read alone. */
  readonly responsesAwaitingReview: number;
  /** The attempt the state above describes: the furthest-along one. Null when
   *  there is none, or when the read did not succeed. */
  readonly leadAttemptId: string | null;
}

/**
 * Which of the five stages one attempt is at.
 *
 * Order matters and is the existing order: a released brief outranks a scored
 * attempt, which outranks outstanding reviews, which outranks progress. It is
 * exported because the panel and the chip render from it too — one derivation,
 * three surfaces, no possibility of three answers.
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

const ASSESSMENT_RANK: Record<ReturnType<typeof assessmentStageOf>, number> = {
  invited: 0,
  in_progress: 1,
  under_review: 2,
  brief_ready: 3,
  brief_released: 4,
};

export function projectAssessmentTrack(
  read: TrackRead,
  assessments: readonly ApplicationAssessment[],
): AssessmentTrack {
  if (read !== "ready") {
    return {
      read,
      state: read === "loading" ? "loading" : read === "refused" ? "refused" : "unavailable",
      responsesAwaitingReview: 0,
      leadAttemptId: null,
    };
  }
  if (assessments.length === 0) {
    return { read, state: "none", responsesAwaitingReview: 0, leadAttemptId: null };
  }
  // The furthest-along attempt speaks for the application, exactly as the list
  // chip already chose it. A candidate with two assessments is rare, and the
  // panel below the strip still shows every one of them.
  const lead = assessments.reduce((best, a) =>
    ASSESSMENT_RANK[assessmentStageOf(a)] > ASSESSMENT_RANK[assessmentStageOf(best)] ? a : best,
  );
  return {
    read,
    state: assessmentStageOf(lead),
    // Summed across attempts, because the work is per response and a reviewer
    // owes all of it. `state` is the lead attempt's; this is the application's.
    responsesAwaitingReview: assessments.reduce((n, a) => n + a.reviewsOutstanding, 0),
    leadAttemptId: lead.attemptId,
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

/** How far along a case is, for picking the one that speaks for the
 *  application. Cancelled ranks below everything live, so a cancelled case
 *  never hides an active one. */
const INTERVIEW_RANK: Record<InterviewState, number> = {
  loading: -1,
  unavailable: -1,
  refused: -1,
  none: -1,
  unknown: 0,
  cancelled: 0,
  preparing: 1,
  readyToInterview: 2,
  interviewing: 3,
  evidenceReview: 4,
  reportMaterialReady: 5,
  reportFinalised: 6,
};

export interface InterviewTrack {
  readonly read: TrackRead;
  readonly state: InterviewState;
  /** AI-proposed evidence nobody has looked at yet, across this application's
   *  cases. Process work, never anything about the candidate. */
  readonly proposalsAwaitingReview: number;
  readonly leadCaseId: string | null;
  /** The lead case's status EXACTLY as the runtime holds it.
   *
   *  Carried so the surface can render the runtime's own word for it -- the
   *  same word the case chip and the interview list use -- instead of a second
   *  vocabulary for one state. `state` above drives the logic; this drives the
   *  label. Null whenever the read did not succeed or there is no case. */
  readonly leadStatus: string | null;
  /** How many cases this application has. Shown only so a second interview is
   *  not invisible; it is not a status. */
  readonly caseCount: number;
}

export function projectInterviewTrack(
  read: TrackRead,
  cases: readonly ApplicationInterviewCase[],
): InterviewTrack {
  if (read !== "ready") {
    return {
      read,
      state: read === "loading" ? "loading" : read === "refused" ? "refused" : "unavailable",
      proposalsAwaitingReview: 0,
      leadCaseId: null,
      leadStatus: null,
      caseCount: 0,
    };
  }
  if (cases.length === 0) {
    return {
      read,
      state: "none",
      proposalsAwaitingReview: 0,
      leadCaseId: null,
      leadStatus: null,
      caseCount: 0,
    };
  }
  const lead = cases.reduce((best, c) =>
    INTERVIEW_RANK[interviewStateOf(c.status)] > INTERVIEW_RANK[interviewStateOf(best.status)]
      ? c
      : best,
  );
  return {
    read,
    state: interviewStateOf(lead.status),
    proposalsAwaitingReview: cases.reduce((n, c) => n + c.proposalsAwaitingReview, 0),
    leadCaseId: lead.id,
    leadStatus: lead.status,
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
  | "finalised";

export interface ReportTrack {
  readonly read: TrackRead;
  readonly availability: ReportAvailability;
  /** The case whose finalised report may be opened. Null unless one exists. */
  readonly finalisedCaseId: string | null;
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
    };
  }
  // A finalised report is a row in scp_interview_reports, not a case status.
  const finalised = cases.find((c) => c.reportFinalised) ?? null;
  if (finalised) return { read, availability: "finalised", finalisedCaseId: finalised.id };
  // Material, and only material. `assessed` is the runtime saying a human has
  // finished assessing; it is not a report and is never counted as one.
  const material = cases.some((c) => c.status === "assessed");
  return {
    read,
    availability: material ? "materialReady" : "none",
    finalisedCaseId: null,
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

  // ── 2. Evidence a human has not looked at ──────────────────────────
  // First because it is the only work in the product where a machine has
  // proposed something and no person has yet agreed or disagreed.
  if (interview.proposalsAwaitingReview > 0 && interview.leadCaseId) {
    return {
      kind: "reviewInterviewEvidence",
      waitingOn: "employer",
      destination: { kind: "interviewCase", caseId: interview.leadCaseId },
      unavailableTrack: null,
    };
  }

  // ── 3. Candidate responses waiting on a reviewer ───────────────────
  // Capability-checked against the review board, not against a role label:
  // an owner who sat the assessment themselves may not review it, and the
  // honest answer there is that a colleague must.
  if (assessment.state === "under_review" && assessment.responsesAwaitingReview > 0) {
    return cap.canReviewAssessment && assessment.leadAttemptId
      ? {
          kind: "reviewAssessmentResponses",
          waitingOn: "employer",
          destination: { kind: "assessmentReview", attemptId: assessment.leadAttemptId },
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
  // pending owes work, and a different case having finished does not excuse it.
  if (interview.state === "reportMaterialReady" && interview.leadCaseId) {
    return {
      kind: "reviewReportMaterial",
      waitingOn: "employer",
      destination: { kind: "interviewReport", caseId: interview.leadCaseId },
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
  if (interview.leadCaseId) {
    if (interview.state === "readyToInterview") {
      return {
        kind: "startInterview",
        waitingOn: "employer",
        destination: { kind: "interviewCase", caseId: interview.leadCaseId },
        unavailableTrack: null,
      };
    }
    if (interview.state === "interviewing") {
      return {
        kind: "continueInterview",
        waitingOn: "employer",
        destination: { kind: "interviewCase", caseId: interview.leadCaseId },
        unavailableTrack: null,
      };
    }
    if (interview.state === "evidenceReview") {
      return {
        kind: "assessInterviewEvidence",
        waitingOn: "employer",
        destination: { kind: "interviewCase", caseId: interview.leadCaseId },
        unavailableTrack: null,
      };
    }
  }

  // ── 6. An interview that has been created but not prepared ─────────
  if (interview.state === "preparing" && interview.leadCaseId) {
    return {
      kind: "prepareInterview",
      waitingOn: "employer",
      destination: { kind: "interviewCase", caseId: interview.leadCaseId },
      unavailableTrack: null,
    };
  }

  // ── 7. A scored assessment whose brief nobody has shared ───────────
  if (assessment.state === "brief_ready") {
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
  // must not be given a button that implies otherwise.
  if (assessment.state === "invited" || assessment.state === "in_progress") {
    return {
      kind: "awaitCandidateAssessment",
      waitingOn: "candidate",
      destination: NO_DESTINATION,
      unavailableTrack: null,
    };
  }

  // ── 9. A finished report, and nothing outstanding ──────────────────
  if (report.availability === "finalised" && report.finalisedCaseId) {
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
  if (assessment.state === "none" && interview.state === "none") {
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
