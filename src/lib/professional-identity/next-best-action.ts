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
// ── THE PRIORITY LADDER (v4 — the personal career home) ────────────────
//
// The Security Passport is the candidate's long-term evidence layer;
// assessments, reports and applications are temporary processes around it.
// The ladder says so:
//
//   P0  a required candidate action, deadline first, then the employer's
//       assessment, then an interview, then a reviewer's open question
//   P1  a newly released candidate result
//   P2  the career analysis has not been completed
//   P3  the Security Passport holds no merits
//   P4  the Passport holds incomplete draft merits
//   P5  merits are ready to be sent to the correct verifier
//   P6  relevant jobs exist for somebody who is looking
//   P7  otherwise: maintain the Passport, or keep developing
//
// `ActionPriority` is that number. The first rule that matches supplies the
// primary action, which is what `primary[0]` means to every surface.
//
// ── WHERE THE PROFILE WENT ─────────────────────────────────────────────
//
// "Fill in your profile" is not on this ladder. It is real work and it is
// still offered — in Career Tools, and as a lower-ranked action — but a
// person whose profession field is blank and whose eight credentials are
// unverified should be asked to get their credentials verified. Merits are
// the thing this product exists to establish; a profile field is how a
// merit gets described. So the profile action sits at P7 with the other
// standing suggestions rather than ahead of the Passport.
//
// ── A DEADLINE IS THE ONLY TIME-CRITICAL THING ─────────────────────────
//
// P0 is authored so a required action that carries a DATE is emitted before
// one that does not. A required action without a deadline is still required
// and still outranks P1-P7 — dropping it below "you have not taken the
// career analysis" would be the ladder forgetting that somebody is waiting.
//
// ── WHAT THIS MUST NOT BECOME ──────────────────────────────────────────
//
// Not a nag list. At most three actions are returned and the screen shows
// ONE as the thing that matters now. There is no streak, no countdown, no
// red badge for an action nobody asked for, and no action that exists only
// to raise a number this product tracks. A person who wants to read their
// report and leave must be able to.
//
// ── A STATUS IS NOT A TASK ─────────────────────────────────────────────
//
// "9 items awaiting review" asks nothing of the holder. It must never
// become "Submit for verification (9)": `underReviewSubjectIds` is what
// lets the ladder tell an open review from an unsubmitted entry, and
// `classifyAction` is what lets a surface say which of the three kinds of
// thing it is showing. A passive state can never be the primary action,
// because no rule on this ladder emits one.

import { computeCvReadiness } from "./cv/readiness";
import { computeProfileCompleteness, type CompletenessSection } from "./completeness";
import { SECTION_DESTINATIONS, isSectionReachable } from "./profile-destinations";
import { countReadyForVerification } from "./passport-merits";
import { isUnavailable, type ProfessionalIdentityV1 } from "./types";

// v4: the ladder was re-authored against the personal-career-home brief —
// the career analysis and the Passport moved above the profile, drafts
// became their own rung, and job recommendations became a rung rather than
// a standing suggestion. Same reason completeness.ts carries a version:
// "the recommendation changed" and "the rules changed" are different facts
// and a screenshot has to be explainable later.
export const NEXT_BEST_ACTION_VERSION = "next-best-action-v4" as const;

/** How many primary actions the home screen may show. */
export const MAX_PRIMARY_ACTIONS = 3;

export type ActionKind =
  | "complete_assessment_assignment"
  /** An employer has offered, or is holding, an interview with this person.
   *  P0: it has a date attached. */
  | "prepare_interview"
  /** A verifier asked this person for something and is waiting on the
   *  answer. P0: the review is on hold until they act. */
  | "respond_to_clarification"
  | "read_released_report"
  /** A verifier decided, not in the holder's favour, and the entry is still
   *  unresolved. P1: news that carries a choice. */
  | "review_verification_outcome"
  | "complete_profile_basics"
  | "start_passport"
  /** The Passport holds entries the holder began and never finished. P4.
   *  Distinct from `submit_passport_verification` because an unfinished
   *  draft cannot be submitted to anybody — the next step is the form, not
   *  a verifier. */
  | "resume_draft_merits"
  | "submit_passport_verification"
  | "take_career_discovery"
  | "create_career_card"
  | "create_cv"
  /** They already have one. Distinct from `create_cv` because telling
   *  somebody to create a thing they have is the kind of small inaccuracy
   *  that makes a home page feel like it is not looking at your account. */
  | "open_cv"
  | "explore_jobs";

/** P0 … P7, as authored in the ladder above. */
export type ActionPriority = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * What kind of thing a surface is showing.
 *
 * The brief's three classes, plus one for the product's own suggestions:
 * "take the career analysis" is not something anybody requires of this
 * person and must not wear the same label as a reviewer's open question.
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

/**
 * A stable identifier for WHY this action is on screen.
 *
 * Analytics records this and nothing else about the state: it names the
 * rung and the kind, and carries no count, no employer, no credential and
 * no assessment content. See next-action-analytics.ts.
 */
export type NextActionStateKey = `p${ActionPriority}:${ActionKind}`;

export function stateKeyOf(action: Pick<NextBestAction, "priority" | "kind">): NextActionStateKey {
  return `p${action.priority}:${action.kind}`;
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
  /** The rung plus the kind, for analytics and for tests. */
  readonly stateKey: NextActionStateKey;
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
   * Whether the career analysis would actually admit THIS person.
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
   * News that carries a choice, so it sits at P1 after a released result.
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

  /**
   * How many jobs the existing family filter actually returned for this
   * person. P6 exists only when there is something to show: "relevant jobs
   * are available" is a claim, and a claim with an empty list behind it is
   * the promise of personalised matching this product does not make.
   *
   * Undefined means the jobs read has not answered, which withholds P6.
   */
  readonly recommendedJobCount?: number;

  /**
   * Whether the assessment assignment that produced
   * `assessmentAssignmentAttemptId` carries a deadline. P0 is authored
   * deadline-first, and this is the only place the ladder can learn it:
   * the identity seam counts open assignments, it does not carry dates.
   */
  readonly assessmentDeadline?: string | null;
}

/**
 * The sections a recommendation may be ABOUT.
 *
 * Deliberately not "every missing section". Education, skills and languages
 * are enrichment: a profile without them still drives a CV, a Career Card
 * and a job match, and promoting them to the top of somebody's home page
 * would turn this surface into the run to 100% that the file header, the
 * completeness module and the product principle all refuse. Career
 * direction is excluded because the career analysis is its own rung — P2 —
 * and offering it here too would put one errand on the page twice under two
 * names.
 */
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
 * There is no "job seeking" column anywhere in this product, and inventing
 * one in the database to answer a home-page question would be the wrong
 * order of operations. So it is DERIVED, from two facts the person already
 * gave: the situation they chose for themselves, and whether they have
 * actually applied for anything.
 *
 * `working_in_industry` alone is deliberately not enough. Somebody settled
 * in a job did not ask for job recommendations, and putting three vacancies
 * at the top of their home page is the product assuming something about
 * their employment it was never told. An application changes that: a person
 * who has applied for a job is looking for a job.
 *
 * Exported so the assumption is testable and reviewable in one place rather
 * than being a condition buried in the ladder.
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
  /** The clock. A merit whose validity has lapsed is not a verified merit,
   *  and "has it lapsed" is a question about a moment — passed in so the
   *  answer is testable rather than whatever the machine says today. */
  now: Date = new Date(),
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
      stateKey: `p${priority}:${kind}`,
    });

  const { workload, discovery } = identity;

  // A read that did not answer decides nothing. Every empty array in this
  // model can mean "nothing yet" or "we could not tell", and only the first
  // of those is grounds for asking somebody to do something — recommending
  // "open your Security Passport" to a holder whose Passport merely failed
  // to load is the read failure escalated into an instruction.
  const known = (group: Parameters<typeof isUnavailable>[1]) => !isUnavailable(identity, group);

  /* ---- P0 · a required candidate action, deadline first --------------- */

  // An employer asked for this. Straight to the run when the seam could
  // name one; otherwise the area that lists them. Authored FIRST inside P0
  // because it is the only required action in this product that carries a
  // date.
  const hasDeadlinedAssignment =
    known("assessments") &&
    workload.assessmentAssignmentCount > 0 &&
    Boolean(signals.assessmentDeadline);
  if (hasDeadlinedAssignment) {
    add(
      "complete_assessment_assignment",
      0,
      workload.assessmentAssignmentAttemptId
        ? `/academy/${workload.assessmentAssignmentAttemptId}`
        : "/academy",
      workload.assessmentAssignmentCount,
    );
  }

  // The same assignment WITHOUT a date. Still required, still P0, and still
  // ahead of everything below it: an employer's hiring process waiting on
  // this person is the plainest case of "somebody else is blocked". The only
  // thing that outranks it is the same errand carrying a deadline.
  if (known("assessments") && workload.assessmentAssignmentCount > 0 && !hasDeadlinedAssignment) {
    add(
      "complete_assessment_assignment",
      0,
      workload.assessmentAssignmentAttemptId
        ? `/academy/${workload.assessmentAssignmentAttemptId}`
        : "/academy",
      workload.assessmentAssignmentCount,
    );
  }

  // An interview is being held for this person. It links to the interview
  // INFORMATION, not to the interview: there is nothing for a candidate to
  // do in the employer's workspace, and a link that leads to a permission
  // error is worse than no link.
  if (signals.interviewCount && signals.interviewCount > 0) {
    add(
      "prepare_interview",
      0,
      signals.interviewCaseId
        ? `/my-career/interviews/${signals.interviewCaseId}`
        : "/my-career/applications",
      signals.interviewCount,
    );
  }

  // A verifier has asked this person a question and is waiting. Last inside
  // P0, and that ordering is a product decision rather than an accident: an
  // employer's process has a third party's timetable attached to it, a
  // review does not.
  //
  // Not gated on `known(...)`: the count does not come from the identity
  // read model at all, and its own caller passes nothing when the
  // verification read failed rather than passing a zero.
  if (signals.clarificationCount && signals.clarificationCount > 0) {
    add("respond_to_clarification", 0, "/passport", signals.clarificationCount);
  }

  /* ---- P1 · a newly released candidate result ------------------------- */

  // A report has been released TO this person. Not showing it would be
  // withholding something already decided to be theirs.
  //
  // The report itself when the seam could name one — the same
  // lifecycle-plus-snapshot condition the assessment history applies before
  // IT offers the link, so this can never open a document that surface
  // would refuse to. Otherwise the assessments area, which lists every
  // released report with its own link.
  //
  // NOTE ON "UNREAD": this product records no read receipt for a released
  // report, so the ladder says "released", never "unread". See
  // docs/../delivery notes — asserting unread would be a claim about the
  // person that no stored fact supports.
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

  // A verifier decided against an entry and the holder has a choice to make
  // about it. After the report because a report is the larger thing to have
  // been handed.
  if (signals.verificationOutcomeCount && signals.verificationOutcomeCount > 0) {
    add("review_verification_outcome", 1, "/passport", signals.verificationOutcomeCount);
  }

  /* ---- P2 · the career analysis has not been completed ---------------- */

  // Withheld when the gate has ANSWERED no. See `careerDiscoveryOpen`: this
  // is the difference between a suggestion and a dead end.
  if (
    known("discovery") &&
    !discovery.hasCompletedReport &&
    signals.careerDiscoveryOpen !== false
  ) {
    add("take_career_discovery", 2, "/security-career-assessment");
  }

  /* ---- P3 · the Passport holds no merits ------------------------------ */
  /* ---- P4 · the Passport holds incomplete drafts ---------------------- */
  /* ---- P5 · merits are ready to be sent to a verifier ------------------ */

  // Ready means "recorded, not verified, not lapsed, and nobody is already
  // looking at it". Counted by `countReadyForVerification`, which the
  // Passport summary also uses — two derivations of one number is how the
  // page came to state two different totals for the same merits.
  const pending = countReadyForVerification(identity, signals.underReviewSubjectIds ?? [], now);
  const drafts = known("claims") ? workload.draftClaimCount : 0;

  // Every branch below is a statement about what the Passport holds, so it
  // needs the reads that produce those counts. `provenance` is in the list
  // because without it "verified" cannot be told from "recorded", and a
  // recommendation to verify eight merits beside a Passport panel saying
  // the merits could not be read is the page contradicting itself.
  const meritsKnown =
    known("passport") && known("claims") && known("employment") && known("provenance");

  if (!meritsKnown) {
    // Nothing below can be decided honestly: "you have no Passport" and
    // "your merits did not load" are the same empty object here.
  } else if (!identity.hasPassport) {
    add("start_passport", 3, "/passport");
  } else if (identity.claims.length === 0 && identity.employment.length === 0 && drafts === 0) {
    // A Passport that was opened and never filled in. Same rung as not
    // having one: there is nothing in it either way.
    add("start_passport", 3, "/passport");
  } else if (drafts > 0) {
    add("resume_draft_merits", 4, "/passport", drafts);
  } else if (pending > 0 && !signals.verificationStateUnavailable) {
    // Only when there is something to submit. A holder with nothing pending
    // is not behind on anything, and telling them otherwise is the dark
    // pattern this list exists without. And only when the review state is
    // known: with it unreadable, "submit these" may be asking for what is
    // already in hand.
    add("submit_passport_verification", 5, "/passport", pending);
  }

  /* ---- P6 · relevant jobs, for somebody who is looking ---------------- */

  // Only when the jobs read ANSWERED with rows. "Relevant jobs are
  // available" with nothing behind it is the personalised-matching promise
  // this product does not make.
  if ((signals.recommendedJobCount ?? 0) > 0 && isJobSeeking(identity)) {
    add("explore_jobs", 6, "/jobs", signals.recommendedJobCount ?? null);
  }

  /* ---- P7 · keep the Passport current, keep developing ---------------- */

  // The first missing section this person can actually reach and answer,
  // with its destination taken from the section rather than a constant.
  // `missingSections` is already applicability-filtered by completeness.ts,
  // so a question this person is never asked cannot appear here; the
  // reachability check is the second, independent gate.
  const completeness = computeProfileCompleteness(identity);
  if (known("account") && known("profile") && known("passport") && known("employment")) {
    const actionable = completeness.missingSections.find(
      (section) =>
        PROFILE_ACTION_SECTIONS.includes(section) && isSectionReachable(section, identity, signals),
    );
    if (actionable) {
      add("complete_profile_basics", 7, SECTION_DESTINATIONS[actionable].href, null, actionable);
    }
  }

  // The card exists only when the report NAMES careers — the same condition
  // the report view itself applies. Offering it otherwise is a door onto an
  // empty room.
  if (known("discovery") && discovery.hasCompletedReport && discovery.namesCareers) {
    add("create_career_card", 7, "/my-career/career-card");
  }

  // Only offered when the facts are actually there. A CV invitation to
  // somebody with no history is an invitation to an error message.
  //
  // And once they HAVE one, the invitation changes rather than repeating
  // itself: "create your CV" on the home page of somebody who created one
  // last week is the product not looking at their account.
  if (computeCvReadiness(identity).state === "ready") {
    const saved = signals.savedCvCount ?? 0;
    if (saved > 0) add("open_cv", 7, "/my-career/cv", saved);
    else add("create_cv", 7, "/my-career/cv");
  }

  // The standing invitation to look at jobs, for somebody who has applied
  // for nothing. Distinct from P6: that one says relevant roles EXIST, this
  // one only says the door is there.
  if (
    known("applications") &&
    workload.applicationCount === 0 &&
    !actions.some((a) => a.kind === "explore_jobs")
  ) {
    add("explore_jobs", 7, "/jobs");
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
