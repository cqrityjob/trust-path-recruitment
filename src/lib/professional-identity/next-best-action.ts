// Next best action — what should this person do next, decided by rules.
//
// ── WHY THERE IS NO MODEL HERE ─────────────────────────────────────────
//
// Because this is navigation, and navigation has to be explainable and
// identical on every load. A language model choosing which button appears
// on somebody's home page would produce a different home page each visit,
// for reasons nobody could reconstruct, in exchange for nothing: the inputs
// are eight integers and four booleans, and the right answer for each
// combination is a product decision, not an inference.
//
// It is also the input side of the same rule the rest of this codebase
// already follows — `career-journey/readiness.ts` states it directly: the
// product has to be able to answer "why does it say that".
//
// ── THE PRIORITY LADDER ────────────────────────────────────────────────
//
//   1 BLOCKING / INVITED     somebody else is waiting on this person, or
//                            has released something to them. An employer's
//                            assessment invitation outranks everything the
//                            product might want for its own reasons.
//   2 UNFINISHED HIGH VALUE  they started something that does not work
//                            until it is finished.
//   3 TRUST                  verification: what turns a statement into
//                            evidence.
//   4 CAREER DEVELOPMENT     Career Discovery and what follows from it.
//   5 OPTIONAL               presentation and polish.
//
// ── WHAT THIS MUST NOT BECOME ──────────────────────────────────────────
//
// Not a nag list. At most three actions are returned and the screen shows
// them as suggestions with an obvious way past them. There is no streak, no
// countdown, no red badge for an action nobody asked for, and no action
// that exists only to raise a number this product tracks. A person who
// wants to read their report and leave must be able to.

import { computeCvReadiness } from "./cv/readiness";
import { computeProfileCompleteness, type CompletenessSection } from "./completeness";
import { SECTION_DESTINATIONS, isSectionReachable } from "./profile-destinations";
import { isPendingClaim, isUnavailable, type ProfessionalIdentityV1 } from "./types";

// v2: actions carry the profile SECTION they resolve, their destination is
// taken from that section rather than from a constant, an unreachable
// section can no longer be recommended, and a waiting reviewer entered the
// blocking band. Same reason completeness.ts carries a version -- "the
// recommendation changed" and "the rules changed" are different facts and a
// screenshot has to be explainable later.
export const NEXT_BEST_ACTION_VERSION = "next-best-action-v2" as const;

/** How many primary actions the home screen may show. */
export const MAX_PRIMARY_ACTIONS = 3;

export type ActionKind =
  | "complete_assessment_assignment"
  | "read_released_report"
  /** A verifier asked this person for something and is waiting on the
   *  answer. See the rule for why it sits in the blocking band. */
  | "respond_to_clarification"
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
 * Evaluate every rule, then take the top few.
 *
 * Rules are written in ladder order and each is a single condition, so the
 * whole policy can be read top to bottom. Ties inside a priority band are
 * broken by the order they appear here — which is deliberate and tested,
 * because "whichever the sort happened to put first" is not a product
 * decision anybody made.
 */
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
 */
export interface NextBestActionSignals {
  /** How many CVs this person has saved. Undefined means "not known here",
   *  which is what a release without CV persistence honestly reports. */
  readonly savedCvCount?: number;

  /**
   * Whether Career Discovery would actually admit THIS person.
   *
   * ── WHY THE LADDER HAS TO BE TOLD ──────────────────────────────────
   *
   * `hasCompletedReport === false` answers "have they done it", which is a
   * fact about the person. Whether they MAY do it is a fact about the
   * platform, and the two are independent: the content is `active` while
   * only platform admins and `cd_internal_testers` rows may run it, because
   * the recommendation layer on top of it is mid-build. That gate is a
   * governance decision and this file does not touch it.
   *
   * What this file must not do is offer a door the product will refuse to
   * open. The dashboard already asks the SAME two gates the assessment
   * route asks and passes the answer down; without it the ladder happily
   * recommended "Take Career Discovery" to somebody who would land on "the
   * assessment isn't open yet".
   *
   * `false` withholds the action. `true` and `undefined` both allow it —
   * undefined means "nobody asked", which is the state of every caller that
   * does not gate, and silently hiding a legitimate action because a query
   * has not answered yet would be its own defect. The dashboard resolves the
   * gate before it renders, so the undefined case is the honest default and
   * not a loophole.
   */
  readonly careerDiscoveryOpen?: boolean;

  /**
   * How many verification requests are waiting on THIS person to answer.
   *
   * ── WHY IT ARRIVES AS A SIGNAL ─────────────────────────────────────
   *
   * Same reason as `savedCvCount`: the identity seam reads what a person
   * HAS, and a clarification is a state of a request rather than a fact
   * about them. It is derived by `deriveVerificationAttention`, which the
   * candidate surfaces already compute, so this costs no extra read.
   *
   * ── WHY IT BELONGS ON THE LADDER AT ALL ────────────────────────────
   *
   * The attention panel presents it, and that was not enough. With a
   * reviewer waiting on an answer, the recommendation at the top of the page
   * still read "Skapa ditt CV" -- the product's own wants placed above
   * somebody else's open question about this person's record. Band 1 is
   * defined as "somebody else is waiting on this person"; a clarification is
   * the plainest case of it in the product, and it was the one case the
   * ladder could not see.
   *
   * Undefined means "nobody asked", which is every caller that does not
   * derive attention. It withholds the action rather than inventing one.
   */
  readonly clarificationCount?: number;
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
 *
 * What is left is the set without which something downstream genuinely does
 * not work, in the order it is asked.
 */
const PROFILE_ACTION_SECTIONS: readonly CompletenessSection[] = [
  "situation",
  "identity",
  "profession",
  "employment",
  "location",
];

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
  ) => actions.push({ kind, priority, href, count, section });

  const { workload, discovery, claims } = identity;

  // A read that did not answer decides nothing. Every empty array in this
  // model can mean "nothing yet" or "we could not tell", and only the first
  // of those is grounds for asking somebody to do something — recommending
  // "open your Security Passport" to a holder whose Passport merely failed
  // to load is the read failure escalated into an instruction.
  const known = (group: Parameters<typeof isUnavailable>[1]) => !isUnavailable(identity, group);

  /* ---- 1 · Blocking and invited -------------------------------------- */

  // An employer asked for this. It is the only thing on this list where
  // somebody else is waiting, so it is the only thing that can be first.
  if (known("assessments") && workload.assessmentAssignmentCount > 0) {
    add("complete_assessment_assignment", 1, "/academy", workload.assessmentAssignmentCount);
  }

  // A report has been released TO this person. Not showing it would be
  // withholding something already decided to be theirs.
  //
  // ── WHERE IT GOES ──────────────────────────────────────────────────
  //
  // It used to go to `/my-career`, which is the page the card is ON. A
  // primary action that navigates to itself is not a small imprecision: it
  // is the one suggestion on this list where somebody else has already
  // decided the person may read something, and it spent that click on
  // nothing.
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

  // A verifier has asked this person a question and is waiting. It is the
  // same shape as the employer invitation above -- somebody else is blocked
  // on them -- and it is authored after it because an employer's deadline
  // outranks a review that will wait.
  //
  // Not gated on `known(...)`: the count does not come from the identity
  // read model at all, and its own caller passes nothing when the
  // verification read failed rather than passing a zero.
  if (signals.clarificationCount && signals.clarificationCount > 0) {
    add("respond_to_clarification", 1, "/passport", signals.clarificationCount);
  }

  /* ---- 2 · Unfinished, high value ------------------------------------ */

  // ── THE PROFILE ACTION, AND THE GUARD THAT MAKES IT COMPLETABLE ────
  //
  // This rule used to ask one question — "is `identity` or `profession`
  // missing" — and answer it with one fixed destination, /my-career/profile.
  // For a career-changer both halves were wrong at once. `identity` needs a
  // Passport headline, which that page does not edit; `profession` is not
  // asked of somebody outside the industry at all, and selecting that
  // situation CLEARS it. The action could therefore never be satisfied from
  // the place it sent people, so it returned unchanged after every save.
  //
  // Now it picks the first missing section this person can actually reach
  // and go and answer, and takes its destination from the section rather
  // than from a constant. If nothing is both missing and reachable, no
  // profile action is offered and the ladder moves on — a person with no
  // Passport is told to open one (priority 3, below), which is the true
  // next step and one they can complete.
  //
  // `missingSections` is already applicability-filtered by completeness.ts,
  // so a question this person is never asked cannot appear here. The
  // reachability check is the second, independent gate: it answers "is the
  // editor open to them today", which applicability does not.
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

  const pending = claims.filter(isPendingClaim).length;
  if (!known("passport") || !known("claims")) {
    // Neither branch below can be decided honestly: "you have no Passport"
    // and "your claims did not load" are the same empty object here.
  } else if (!identity.hasPassport) {
    add("start_passport", 3, "/passport");
  } else if (pending > 0) {
    // Only when there is something to submit. A holder with nothing pending
    // is not behind on anything, and telling them otherwise is the dark
    // pattern this list exists without.
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
