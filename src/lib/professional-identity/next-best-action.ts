// Next best action — what should this person do next, decided by rules.
//
// ── WHY THERE IS NO MODEL HERE ─────────────────────────────────────────
//
// Because this is navigation, and navigation has to be explainable and
// identical on every load. A language model choosing which button appears
// on somebody's home page would produce a different home page each visit,
// for reasons nobody could reconstruct, in exchange for nothing: the inputs
// are a handful of integers and booleans, and the right answer for each
// combination is a product decision, not an inference.
//
// ── THE PRIORITY LADDER (v5) ───────────────────────────────────────────
//
// The Security Passport is the candidate's long-term evidence layer;
// tests, results, training and applications are processes around it.
//
//   P0  a required candidate action, deadline first: a test with a deadline,
//       training with a deadline, then a test without one, an interview, a
//       reviewer's open question
//   P1  a verification decision that did not go the holder's way
//   P2  the career analysis has not been completed
//   P3  the Security Passport holds no merits
//   P4  the Passport holds unfinished draft merits
//   P5  merits are ready to be sent to the correct verifier
//   P6  relevant jobs exist for somebody who is looking
//   P7  standing suggestions: training without a deadline, the profile,
//       the Career Card, the CV, browsing jobs
//
// ── WHY A RELEASED RESULT IS NOT ON THE LADDER (v5) ────────────────────
//
// v4 promoted every released result to the top and called it "new". There
// is no read receipt anywhere in this product, so the action could never
// retire: a result released in March was still the page's one recommended
// step in September, permanently outranking the Passport, the career
// analysis and every job. Until a durable read state exists, a released
// result is a ROW under Tester och resultat, dated, with its employer and
// process — reachable, never a demand, never "unread".
//
// ── EVERY ACTION LANDS ON ITS OBJECT ───────────────────────────────────
//
// An action names a merit, a review, a test or a form, and its href opens
// THAT — never a home page the person then has to search. Where the seam
// can name the subject, the href carries its id; where several qualify, it
// carries the list that shows them.
//
// ── A STATUS IS NOT A TASK ─────────────────────────────────────────────
//
// "9 items awaiting review" and "3 tests waiting for the employer" ask
// nothing of the person. No rule here emits a passive kind, so a passive
// state can never be the primary action — structurally, not by convention.

import { computeCvReadiness } from "./cv/readiness";
import { computeProfileCompleteness, type CompletenessSection } from "./completeness";
import { SECTION_DESTINATIONS, isSectionReachable } from "./profile-destinations";
import { countReadyForVerification } from "./passport-merits";
import { isUnavailable, type ProfessionalIdentityV1 } from "./types";

export const NEXT_BEST_ACTION_VERSION = "next-best-action-v5" as const;

/** How many primary actions the home screen may show. */
export const MAX_PRIMARY_ACTIONS = 3;

export type ActionKind =
  | "complete_assessment_assignment"
  /** Employer-assigned training or development with a deadline. P0. Without
   *  a deadline it is a standing suggestion at P7 — assigned work, but not
   *  work anybody is blocked on. */
  | "complete_training_assignment"
  | "prepare_interview"
  | "respond_to_clarification"
  | "review_verification_outcome"
  | "complete_profile_basics"
  | "start_passport"
  | "resume_draft_merits"
  | "submit_passport_verification"
  | "take_career_discovery"
  | "create_career_card"
  | "create_cv"
  | "open_cv"
  | "explore_jobs";

/** P0 … P7, as authored in the ladder above. */
export type ActionPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type StatusClassification =
  | "action_required"
  | "new_for_you"
  | "in_progress_no_action"
  | "suggestion";

/** The ONE place an action kind becomes a classification. */
export const ACTION_CLASSIFICATION: Readonly<Record<ActionKind, StatusClassification>> = {
  complete_assessment_assignment: "action_required",
  complete_training_assignment: "action_required",
  prepare_interview: "action_required",
  respond_to_clarification: "action_required",
  review_verification_outcome: "new_for_you",
  complete_profile_basics: "suggestion",
  start_passport: "suggestion",
  resume_draft_merits: "suggestion",
  submit_passport_verification: "suggestion",
  take_career_discovery: "suggestion",
  create_career_card: "suggestion",
  create_cv: "suggestion",
  open_cv: "suggestion",
  explore_jobs: "suggestion",
};

export function classifyAction(kind: ActionKind): StatusClassification {
  return ACTION_CLASSIFICATION[kind];
}

export type NextActionStateKey = `p${ActionPriority}:${ActionKind}`;

export function stateKeyOf(action: Pick<NextBestAction, "priority" | "kind">): NextActionStateKey {
  return `p${action.priority}:${action.kind}`;
}

export interface NextBestAction {
  readonly kind: ActionKind;
  readonly priority: ActionPriority;
  /** In-app destination: the OBJECT the action is about. */
  readonly href: string;
  /** A fragment on that destination, when the object is a section of a
   *  page rather than a page. Carried apart from `href` so a router link can
   *  take it as `hash`. */
  readonly hash: string | null;
  /** Search params on the destination, when the object is reached by
   *  intent (`?draft=…`). */
  readonly search: Readonly<Record<string, string>> | null;
  readonly count: number | null;
  readonly section: CompletenessSection | null;
  readonly classification: StatusClassification;
  readonly stateKey: NextActionStateKey;
  /**
   * What must become true for this action to disappear. Stated, so a
   * surface can prove it and a reviewer can read it: an action with no
   * retiring condition is a loop.
   */
  readonly retiresWhen: string;
}

export interface NextBestActions {
  readonly version: typeof NEXT_BEST_ACTION_VERSION;
  readonly primary: readonly NextBestAction[];
  readonly all: readonly NextBestAction[];
}

/** A verification subject the ladder can point at. */
export interface ActionSubject {
  readonly kind: "claim" | "experience";
  readonly id: string;
}

export interface NextBestActionSignals {
  readonly savedCvCount?: number;
  readonly careerDiscoveryOpen?: boolean;

  /** Verification requests waiting on THIS person to answer, with the one
   *  subject to open when exactly one is waiting. */
  readonly clarificationCount?: number;
  readonly clarificationSubject?: ActionSubject | null;
  /** Decided against the holder and still unresolved. */
  readonly verificationOutcomeCount?: number;
  readonly verificationOutcomeSubject?: ActionSubject | null;
  readonly underReviewSubjectIds?: readonly string[];
  readonly verificationStateUnavailable?: boolean;

  readonly interviewCaseId?: string | null;
  readonly interviewCount?: number;

  /** Jobs the existing family filter returned. Undefined: not answered. */
  readonly recommendedJobCount?: number;
  /** The jobs came from a FILTER, not the general list. P6 is only ever
   *  about filtered jobs — "relevant jobs exist" is a claim, and three
   *  arbitrary vacancies do not support it. */
  readonly recommendedJobsFiltered?: boolean;

  /**
   * Open tests, from the CANONICAL academy work read — the same read
   * /academy renders. Preferred over the identity seam's count whenever it
   * answered: it is the source, it sees an invitation the moment it is
   * claimed, and it does not need the identity read to have succeeded. The
   * seam's count is the fallback for a caller that has no work read.
   */
  readonly openTestCount?: number;
  readonly openTestAttemptId?: string | null;
  /** The deadline of the test named above. */
  readonly assessmentDeadline?: string | null;

  /** Employer-assigned training or development, from the canonical
   *  academy work read. */
  readonly trainingCount?: number;
  readonly trainingAssignmentId?: string | null;
  readonly trainingDeadline?: string | null;
}

const PROFILE_ACTION_SECTIONS: readonly CompletenessSection[] = [
  "situation",
  "identity",
  "profession",
  "employment",
  "location",
];

/**
 * Is this person looking for work?
 *
 * No "job seeking" column exists, and inventing one in the database to answer
 * a home-page question would be the wrong order of operations. Derived from
 * two facts the person already gave: the situation they chose, and whether
 * they have actually applied for anything. `working_in_industry` alone is
 * deliberately not enough. One exported predicate, so the assumption is a
 * one-line product decision rather than a condition buried in the ladder.
 */
export function isJobSeeking(identity: ProfessionalIdentityV1): boolean {
  const seekingStatuses: readonly (typeof identity.currentStatus)[] = [
    "new_to_industry",
    "student",
    "career_change",
    "changing_role",
  ];
  if (seekingStatuses.includes(identity.currentStatus)) return true;
  return !isUnavailable(identity, "applications") && identity.workload.applicationCount > 0;
}

/** Where a verification subject is opened. The entry page is where a holder
 *  answers a reviewer, reads a decision and submits again. */
export function subjectHref(subject: ActionSubject): string {
  return `/passport/entry/${subject.kind}/${subject.id}`;
}

export function computeNextBestActions(
  identity: ProfessionalIdentityV1,
  signals: NextBestActionSignals = {},
  now: Date = new Date(),
): NextBestActions {
  const actions: NextBestAction[] = [];
  const add = (
    kind: ActionKind,
    priority: ActionPriority,
    href: string,
    retiresWhen: string,
    extra: {
      count?: number | null;
      section?: CompletenessSection | null;
      hash?: string | null;
      search?: Readonly<Record<string, string>> | null;
    } = {},
  ) =>
    actions.push({
      kind,
      priority,
      href,
      hash: extra.hash ?? null,
      search: extra.search ?? null,
      count: extra.count ?? null,
      section: extra.section ?? null,
      classification: ACTION_CLASSIFICATION[kind],
      stateKey: `p${priority}:${kind}`,
      retiresWhen,
    });

  const { workload, discovery } = identity;
  const known = (group: Parameters<typeof isUnavailable>[1]) => !isUnavailable(identity, group);

  /* ---- P0 · a required candidate action, deadline first --------------- */

  const openTests =
    signals.openTestCount !== undefined
      ? signals.openTestCount
      : known("assessments")
        ? workload.assessmentAssignmentCount
        : 0;
  const openTestId =
    signals.openTestCount !== undefined
      ? (signals.openTestAttemptId ?? null)
      : workload.assessmentAssignmentAttemptId;
  const assessmentHref = openTestId ? `/academy/${openTestId}` : "/academy";
  const hasOpenAssessment = openTests > 0;
  const deadlinedAssessment = hasOpenAssessment && Boolean(signals.assessmentDeadline);

  const trainingHref = signals.trainingAssignmentId
    ? `/academy/training/${signals.trainingAssignmentId}`
    : "/academy";
  const hasTraining = (signals.trainingCount ?? 0) > 0;
  const deadlinedTraining = hasTraining && Boolean(signals.trainingDeadline);

  if (deadlinedAssessment) {
    add("complete_assessment_assignment", 0, assessmentHref, "the attempt is submitted", {
      count: openTests,
    });
  }
  if (deadlinedTraining) {
    add("complete_training_assignment", 0, trainingHref, "every module is completed", {
      count: signals.trainingCount ?? null,
    });
  }
  if (hasOpenAssessment && !deadlinedAssessment) {
    add("complete_assessment_assignment", 0, assessmentHref, "the attempt is submitted", {
      count: openTests,
    });
  }
  if (signals.interviewCount && signals.interviewCount > 0) {
    add(
      "prepare_interview",
      0,
      signals.interviewCaseId
        ? `/my-career/interviews/${signals.interviewCaseId}`
        : "/my-career/applications",
      "the interview is concluded",
      { count: signals.interviewCount },
    );
  }
  if (signals.clarificationCount && signals.clarificationCount > 0) {
    // ONE open question opens that entry. Several open the Passport, which
    // lists them; the person is not sent to guess which merit.
    const one = signals.clarificationCount === 1 ? (signals.clarificationSubject ?? null) : null;
    add(
      "respond_to_clarification",
      0,
      one ? subjectHref(one) : "/passport",
      "the holder has answered and the request leaves clarification_requested",
      { count: signals.clarificationCount, hash: one ? null : "attention" },
    );
  }

  /* ---- P1 · a decision that did not go the holder's way --------------- */

  if (signals.verificationOutcomeCount && signals.verificationOutcomeCount > 0) {
    const one =
      signals.verificationOutcomeCount === 1 ? (signals.verificationOutcomeSubject ?? null) : null;
    add(
      "review_verification_outcome",
      1,
      one ? subjectHref(one) : "/passport",
      "the entry is corrected or resubmitted, retiring the rejected request",
      { count: signals.verificationOutcomeCount, hash: one ? null : "attention" },
    );
  }

  /* ---- P2 · the career analysis has not been completed ---------------- */

  if (
    known("discovery") &&
    !discovery.hasCompletedReport &&
    signals.careerDiscoveryOpen !== false
  ) {
    add("take_career_discovery", 2, "/security-career-assessment", "a report snapshot exists");
  }

  /* ---- P3 · P4 · P5 · the Passport --------------------------------------- */

  const pending = countReadyForVerification(identity, signals.underReviewSubjectIds ?? [], now);
  const drafts = known("claims") ? workload.draftClaimCount : 0;
  const meritsKnown =
    known("passport") && known("claims") && known("employment") && known("provenance");

  if (!meritsKnown) {
    // Nothing below can be decided honestly.
  } else if (!identity.hasPassport) {
    add("start_passport", 3, "/passport", "a Passport profile row exists");
  } else if (identity.claims.length === 0 && identity.employment.length === 0 && drafts === 0) {
    add("start_passport", 3, "/passport", "at least one merit is recorded");
  } else if (drafts > 0) {
    // The exact form, resumed. The Passport home would list the draft, but
    // "finish the merit" that lands on a list is the person re-finding it.
    const draftId = workload.draftClaimIds[0] ?? null;
    add(
      "resume_draft_merits",
      4,
      "/passport/credentials/new",
      "no claim is in lifecycle_state draft",
      { count: drafts, search: draftId ? { draft: draftId } : null },
    );
  } else if (pending > 0 && !signals.verificationStateUnavailable) {
    add(
      "submit_passport_verification",
      5,
      "/passport",
      "every recorded merit is verified, lapsed or under review",
      { count: pending, hash: "merits" },
    );
  }

  /* ---- P6 · relevant jobs, for somebody who is looking ---------------- */

  if (
    signals.recommendedJobsFiltered === true &&
    (signals.recommendedJobCount ?? 0) > 0 &&
    isJobSeeking(identity)
  ) {
    add("explore_jobs", 6, "/jobs", "the person applies, or the filter returns nothing", {
      count: signals.recommendedJobCount ?? null,
    });
  }

  /* ---- P7 · standing suggestions ---------------------------------------- */

  if (hasTraining && !deadlinedTraining) {
    add("complete_training_assignment", 7, trainingHref, "every module is completed", {
      count: signals.trainingCount ?? null,
    });
  }

  const completeness = computeProfileCompleteness(identity);
  if (known("account") && known("profile") && known("passport") && known("employment")) {
    const actionable = completeness.missingSections.find(
      (section) =>
        PROFILE_ACTION_SECTIONS.includes(section) && isSectionReachable(section, identity, signals),
    );
    if (actionable) {
      add(
        "complete_profile_basics",
        7,
        SECTION_DESTINATIONS[actionable].href,
        "the section is answered",
        { section: actionable },
      );
    }
  }

  if (known("discovery") && discovery.hasCompletedReport && discovery.namesCareers) {
    add("create_career_card", 7, "/my-career/career-card", "never — a standing destination");
  }

  if (computeCvReadiness(identity).state === "ready") {
    const saved = signals.savedCvCount ?? 0;
    if (saved > 0)
      add("open_cv", 7, "/my-career/cv", "never — a standing destination", { count: saved });
    else add("create_cv", 7, "/my-career/cv", "a CV is saved");
  }

  if (
    known("applications") &&
    workload.applicationCount === 0 &&
    !actions.some((a) => a.kind === "explore_jobs")
  ) {
    add("explore_jobs", 7, "/jobs", "the person applies for something");
  }

  const ordered = [...actions].sort((a, b) => a.priority - b.priority);
  return {
    version: NEXT_BEST_ACTION_VERSION,
    primary: ordered.slice(0, MAX_PRIMARY_ACTIONS),
    all: ordered,
  };
}
