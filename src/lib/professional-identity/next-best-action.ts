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
// It is also the input side of the same rule the rest of this codebase
// already follows — `career-journey/readiness.ts` states it directly: the
// product has to be able to answer "why does it say that".
//
// ── THE PRIORITY LADDER ────────────────────────────────────────────────
//
// The locked order, from the personal-home brief, is:
//
//   1 time-critical security or account action
//   2 an assessment, interview or completion with a deadline
//   3 a verification that needs the candidate's own answer
//   4 a NEW report, or a NEW verification outcome
//   5 something started and unfinished
//   6 a missing foundation — Career Discovery, the profile
//   7 jobs, CV, Career Card
//   8 calm: nothing needs attention
//
// Bands 2-4 are all "somebody else is waiting on, or has decided about,
// this person", and they share priority 1 here; their ORDER is the
// authoring order below, which is what makes "an interview beats a new
// report" and "a reviewer's question beats a new report" product decisions
// that a test can read rather than a sort's accident. Band 1 has no signal
// in the product today and is deliberately not invented.
//
//   priority 1  BLOCKING / INVITED / RELEASED   bands 2, 3 and 4
//   priority 2  UNFINISHED HIGH VALUE           band 5
//   priority 3  TRUST                           band 6 (the Passport)
//   priority 4  CAREER DEVELOPMENT              band 6 (Career Discovery)
//   priority 5  OPTIONAL                        band 7
//
// ── WHAT THIS MUST NOT BECOME ──────────────────────────────────────────
//
// Not a nag list. At most three actions are returned and the screen shows
// ONE as the thing that matters now, with the rest reachable underneath at
// obviously lower weight. There is no streak, no countdown, no red badge
// for an action nobody asked for, and no action that exists only to raise a
// number this product tracks. A person who wants to read their report and
// leave must be able to.
//
// ── A STATUS IS NOT A TASK ─────────────────────────────────────────────
//
// "9 items awaiting review" asks nothing of the holder. It used to become
// "Submit for verification (9)" here, because the ladder counted every
// claim that was not yet verified and could not see that a review was
// already open on each of them. The `underReviewSubjectIds` signal is what
// lets it tell the two apart, and `classifyAction` is what lets a surface
// say which of the three kinds of thing it is showing.

import { computeCvReadiness } from "./cv/readiness";
import { computeProfileCompleteness, type CompletenessSection } from "./completeness";
import { SECTION_DESTINATIONS, isSectionReachable } from "./profile-destinations";
import { isPendingClaim, isUnavailable, type ProfessionalIdentityV1 } from "./types";

// v3: an interview and a verification outcome joined the blocking band, a
// reviewer's question moved ahead of a new report, a claim already under
// review stopped counting as something to submit, and every kind carries a
// classification. Same reason completeness.ts carries a version -- "the
// recommendation changed" and "the rules changed" are different facts and a
// screenshot has to be explainable later.
export const NEXT_BEST_ACTION_VERSION = "next-best-action-v3" as const;

/** How many primary actions the home screen may show. */
export const MAX_PRIMARY_ACTIONS = 3;

export type ActionKind =
  | "complete_assessment_assignment"
  /** An employer has offered, or is holding, an interview with this person.
   *  Band 2 of the locked order: it has a date attached. */
  | "prepare_interview"
  /** A verifier asked this person for something and is waiting on the
   *  answer. Band 3: the review is on hold until they act. */
  | "respond_to_clarification"
  | "read_released_report"
  /** A verifier decided, not in the holder's favour, and the entry is still
   *  unresolved. Band 4: news that carries a choice. */
  | "review_verification_outcome"
  | "complete_profile_basics"
  | "start_passport"
  | "submit_passport_verification"
  | "take_career_discovery"
  | "create_career_card"
  | "create_cv"
  /** They already have one. Distinct from `create_cv` because telling
   *  somebody to create a thing they have is the kind of small inaccuracy
   *  that makes a home page feel like it is not looking at your account. */
  | "open_cv"
  | "explore_jobs";

export type ActionPriority = 1 | 2 | 3 | 4 | 5;

/**
 * What kind of thing a surface is showing.
 *
 * The brief's three classes, plus one for the product's own suggestions:
 * "take Career Discovery" is not something anybody requires of this person
 * and must not wear the same label as a reviewer's open question.
 */
export type StatusClassification =
  /** Somebody, or a deadline, is waiting on this person. */
  | "action_required"
  /** Something was decided or released to them. Worth seeing; asks nothing. */
  | "new_for_you"
  /** Something is happening elsewhere. Explicitly nothing to do. */
  | "in_progress_no_action"
  /** The product's own suggestion. Never a demand. */
  | "suggestion";

/** The ONE place an action kind becomes a classification. `Record` so a
 *  new kind cannot ship unclassified. */
export const ACTION_CLASSIFICATION: Readonly<Record<ActionKind, StatusClassification>> = {
  complete_assessment_assignment: "action_required",
  prepare_interview: "action_required",
  respond_to_clarification: "action_required",
  read_released_report: "new_for_you",
  review_verification_outcome: "new_for_you",
  complete_profile_basics: "suggestion",
  start_passport: "suggestion",
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

export interface NextBestAction {
  readonly kind: ActionKind;
  readonly priority: ActionPriority;
  /** In-app destination. Always a path this build actually routes, and for
   *  a profile action always one carrying the intent that opens the right
   *  editor -- see profile-destinations.ts. */
  readonly href: string;
  /** A count the copy may interpolate ("1 credential waiting"). Null when
   *  the action is not about a quantity — never 0, which reads as "nothing
   *  to do" next to an action asking somebody to do something. */
  readonly count: number | null;
  /** Which part of the profile this action resolves, when it is a profile
   *  action. It is what lets the copy say "Add your current profession"
   *  rather than "Fill in your profile", and it is the thing whose presence
   *  retires the action. Null for every action that is not about a profile
   *  section. */
  readonly section: CompletenessSection | null;
  /** How a surface should label it. Derived from the kind, carried so a
   *  renderer never has to import the table. */
  readonly classification: StatusClassification;
}

export interface NextBestActions {
  readonly version: typeof NEXT_BEST_ACTION_VERSION;
  /** At most MAX_PRIMARY_ACTIONS, most important first. */
  readonly primary: readonly NextBestAction[];
  /** Everything that qualified, for tests and for a "see all" surface.
   *  Never rendered as a list of demands. */
  readonly all: readonly NextBestAction[];
}

/**
 * Signals that live outside the identity read model.
 *
 * `savedCvCount` is deliberately NOT folded into `ProfessionalIdentityV1`.
 * The identity seam is read by the personal home in EVERY release, while
 * `cv_documents` only exists once its migration is applied -- putting the
 * count in the seam would make the whole identity layer depend on a table
 * that may not be there yet, which is the exact failure the schema-first
 * release contract exists to prevent. So it arrives as an optional extra
 * signal, and everything behaves exactly as before when it is absent.
 *
 * The same reasoning covers every signal below: each is a state of some
 * other product's rows rather than a fact about the person, each is derived
 * by a module the candidate surfaces already run, and `undefined` always
 * means "nobody asked" -- which withholds the action rather than inventing
 * one.
 */
export interface NextBestActionSignals {
  /** How many CVs this person has saved. Undefined means "not known here",
   *  which is what a release without CV persistence honestly reports. */
  readonly savedCvCount?: number;

  /**
   * Whether Career Discovery would actually admit THIS person.
   *
   * `hasCompletedReport === false` answers "have they done it", which is a
   * fact about the person. Whether they MAY do it is a fact about the
   * platform, and the two are independent: the content is `active` while
   * only platform admins and `cd_internal_testers` rows may run it. That
   * gate is a governance decision and this file does not touch it. What
   * this file must not do is offer a door the product will refuse to open.
   *
   * `false` withholds the action. `true` and `undefined` both allow it —
   * undefined means "nobody asked", which is the state of every caller that
   * does not gate.
   */
  readonly careerDiscoveryOpen?: boolean;

  /**
   * How many verification requests are waiting on THIS person to answer.
   * Derived by `deriveVerificationAttention` (`actionRequired.length`).
   */
  readonly clarificationCount?: number;

  /**
   * How many verification requests were decided against the holder and are
   * still unresolved. `deriveVerificationAttention`'s `outcomes.length`.
   * News that carries a choice, so it sits in the blocking band after a
   * released report.
   */
  readonly verificationOutcomeCount?: number;

  /**
   * The entries (claim or period ids) with an OPEN review. A claim that is
   * already being looked at is not something to submit, and without this
   * the ladder told a holder with nine entries under review to submit nine
   * entries. `deriveVerificationAttention`'s `waiting[].subjectId`.
   */
  readonly underReviewSubjectIds?: readonly string[];

  /**
   * The verification read did not answer. Then "which claims are already
   * under review" is unknowable, and the honest ladder withholds the
   * submission suggestion rather than asking for something that may
   * already be in hand. A read that did not answer decides nothing.
   */
  readonly verificationStateUnavailable?: boolean;

  /**
   * The interview an employer is holding for this person, when one exists:
   * offered or in progress. Concluded interviews are not passed — the
   * employer's process continuing asks nothing of the candidate.
   */
  readonly interviewCaseId?: string | null;
  /** How many such interviews. Zero or undefined withholds the action. */
  readonly interviewCount?: number;
}

/**
 * The sections a recommendation may be ABOUT.
 *
 * Deliberately not "every missing section". Education, skills and languages
 * are enrichment: a profile without them still drives a CV, a Career Card
 * and a job match, and promoting them to the top of somebody's home page
 * would turn this surface into the run to 100% that the file header, the
 * completeness module and the product principle all refuse. Career
 * direction is excluded because Career Discovery is its own action further
 * down the ladder — offering it here too would put one errand on the page
 * twice under two names.
 */
const PROFILE_ACTION_SECTIONS: readonly CompletenessSection[] = [
  "situation",
  "identity",
  "profession",
  "employment",
  "location",
];

/**
 * Evaluate every rule, then take the top few.
 *
 * Rules are written in ladder order and each is a single condition, so the
 * whole policy can be read top to bottom. Ties inside a priority band are
 * broken by the order they appear here — which is deliberate and tested,
 * because "whichever the sort happened to put first" is not a product
 * decision anybody made.
 */
export function computeNextBestActions(
  identity: ProfessionalIdentityV1,
  signals: NextBestActionSignals = {},
): NextBestActions {
  const actions: NextBestAction[] = [];
  const add = (
    kind: ActionKind,
    priority: ActionPriority,
    href: string,
    count: number | null = null,
    section: CompletenessSection | null = null,
  ) =>
    actions.push({
      kind,
      priority,
      href,
      count,
      section,
      classification: ACTION_CLASSIFICATION[kind],
    });

  const { workload, discovery, claims } = identity;

  // A read that did not answer decides nothing. Every empty array in this
  // model can mean "nothing yet" or "we could not tell", and only the first
  // of those is grounds for asking somebody to do something — recommending
  // "open your Security Passport" to a holder whose Passport merely failed
  // to load is the read failure escalated into an instruction.
  const known = (group: Parameters<typeof isUnavailable>[1]) => !isUnavailable(identity, group);

  /* ---- 1 · Blocking, invited, released --------------------------------- */

  // Band 2 · An employer asked for this, and it has a deadline. Somebody
  // else is waiting, so it is first. Straight to the run when the seam
  // could name one; otherwise the area that lists them.
  if (known("assessments") && workload.assessmentAssignmentCount > 0) {
    add(
      "complete_assessment_assignment",
      1,
      workload.assessmentAssignmentAttemptId
        ? `/academy/${workload.assessmentAssignmentAttemptId}`
        : "/academy",
      workload.assessmentAssignmentCount,
    );
  }

  // Band 2 · An interview is being held for this person. It links to the
  // interview INFORMATION, not to the interview: there is nothing for a
  // candidate to do in the employer's workspace, and a link that leads to a
  // permission error is worse than no link.
  if (signals.interviewCount && signals.interviewCount > 0) {
    add(
      "prepare_interview",
      1,
      signals.interviewCaseId
        ? `/my-career/interviews/${signals.interviewCaseId}`
        : "/my-career/applications",
      signals.interviewCount,
    );
  }

  // Band 3 · A verifier has asked this person a question and is waiting.
  // Authored AHEAD of the released report: a review on hold until they
  // answer outranks something that will still be there tomorrow.
  //
  // Not gated on `known(...)`: the count does not come from the identity
  // read model at all, and its own caller passes nothing when the
  // verification read failed rather than passing a zero.
  if (signals.clarificationCount && signals.clarificationCount > 0) {
    add("respond_to_clarification", 1, "/passport", signals.clarificationCount);
  }

  // Band 4 · A report has been released TO this person. Not showing it
  // would be withholding something already decided to be theirs.
  //
  // The report itself when the seam could name one — the same
  // lifecycle-plus-snapshot condition the assessment history applies before
  // IT offers the link, so this can never open a document that surface
  // would refuse to. Otherwise the assessments area, which lists every
  // released report with its own link. Never a self-link, and never a
  // report id this product invented.
  if (known("assessments") && workload.releasedReportCount > 0) {
    add(
      "read_released_report",
      1,
      workload.releasedReportAttemptId
        ? `/academy/report/${workload.releasedReportAttemptId}`
        : "/academy",
      workload.releasedReportCount,
    );
  }

  // Band 4 · A verifier decided against an entry and the holder has a
  // choice to make about it. After the report because a report is the
  // larger thing to have been handed.
  if (signals.verificationOutcomeCount && signals.verificationOutcomeCount > 0) {
    add("review_verification_outcome", 1, "/passport", signals.verificationOutcomeCount);
  }

  /* ---- 2 · Unfinished, high value ------------------------------------ */

  // The first missing section this person can actually reach and answer,
  // with its destination taken from the section rather than a constant.
  // `missingSections` is already applicability-filtered by completeness.ts,
  // so a question this person is never asked cannot appear here; the
  // reachability check is the second, independent gate.
  //
  // The three reads behind these sections are `profiles`,
  // `sp_passport_profiles` and `security_career_profiles`, so a failure in
  // any of them makes "missing" unknowable rather than true.
  const completeness = computeProfileCompleteness(identity);
  if (known("account") && known("profile") && known("passport") && known("employment")) {
    const actionable = completeness.missingSections.find(
      (section) =>
        PROFILE_ACTION_SECTIONS.includes(section) && isSectionReachable(section, identity, signals),
    );
    if (actionable) {
      add("complete_profile_basics", 2, SECTION_DESTINATIONS[actionable].href, null, actionable);
    }
  }

  /* ---- 3 · Trust ----------------------------------------------------- */

  // Pending means "not verified AND not already being looked at". An entry
  // with an open review is a status, not a task — see the file header.
  const underReview = new Set(signals.underReviewSubjectIds ?? []);
  const pending = claims.filter((c) => isPendingClaim(c) && !underReview.has(c.id)).length;
  if (!known("passport") || !known("claims")) {
    // Neither branch below can be decided honestly: "you have no Passport"
    // and "your claims did not load" are the same empty object here.
  } else if (!identity.hasPassport) {
    add("start_passport", 3, "/passport");
  } else if (pending > 0 && !signals.verificationStateUnavailable) {
    // Only when there is something to submit. A holder with nothing pending
    // is not behind on anything, and telling them otherwise is the dark
    // pattern this list exists without. And only when the review state is
    // known: with it unreadable, "submit these" may be asking for what is
    // already in hand.
    add("submit_passport_verification", 3, "/passport", pending);
  }

  /* ---- 4 · Career development ---------------------------------------- */

  // Withheld when the gate has ANSWERED no. See `careerDiscoveryOpen`: this
  // is the difference between a suggestion and a dead end.
  if (
    known("discovery") &&
    !discovery.hasCompletedReport &&
    signals.careerDiscoveryOpen !== false
  ) {
    add("take_career_discovery", 4, "/security-career-assessment");
  }

  /* ---- 5 · Optional -------------------------------------------------- */

  // The card exists only when the report NAMES careers — the same condition
  // the report view itself applies. Offering it otherwise is a door onto an
  // empty room.
  if (known("discovery") && discovery.hasCompletedReport && discovery.namesCareers) {
    add("create_career_card", 5, "/my-career/career-card");
  }

  // Only offered when the facts are actually there. A CV invitation to
  // somebody with no history is an invitation to an error message.
  //
  // And once they HAVE one, the invitation changes rather than repeating
  // itself: "create your CV" on the home page of somebody who created one
  // last week is the product not looking at their account.
  if (computeCvReadiness(identity).state === "ready") {
    const saved = signals.savedCvCount ?? 0;
    if (saved > 0) add("open_cv", 5, "/my-career/cv", saved);
    else add("create_cv", 5, "/my-career/cv");
  }

  if (known("applications") && workload.applicationCount === 0) {
    add("explore_jobs", 5, "/jobs");
  }

  // Stable sort: Array.prototype.sort is specified as stable, so equal
  // priorities keep the authoring order above.
  const ordered = [...actions].sort((a, b) => a.priority - b.priority);

  return {
    version: NEXT_BEST_ACTION_VERSION,
    primary: ordered.slice(0, MAX_PRIMARY_ACTIONS),
    all: ordered,
  };
}
