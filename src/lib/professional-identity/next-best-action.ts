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
import { computeProfileCompleteness } from "./completeness";
import { isPendingClaim, type ProfessionalIdentityV1 } from "./types";

export const NEXT_BEST_ACTION_VERSION = "next-best-action-v1" as const;

/** How many primary actions the home screen may show. */
export const MAX_PRIMARY_ACTIONS = 3;

export type ActionKind =
  | "complete_assessment_assignment"
  | "read_released_report"
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
  /** In-app destination. Always a path this build actually routes. */
  readonly href: string;
  /** A count the copy may interpolate ("1 credential waiting"). Null when
   *  the action is not about a quantity — never 0, which reads as "nothing
   *  to do" next to an action asking somebody to do something. */
  readonly count: number | null;
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
}

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
  ) => actions.push({ kind, priority, href, count });

  const { workload, discovery, claims } = identity;

  /* ---- 1 · Blocking and invited -------------------------------------- */

  // An employer asked for this. It is the only thing on this list where
  // somebody else is waiting, so it is the only thing that can be first.
  if (workload.assessmentAssignmentCount > 0) {
    add(
      "complete_assessment_assignment",
      1,
      "/academy",
      workload.assessmentAssignmentCount,
    );
  }

  // A report has been released TO this person. Not showing it would be
  // withholding something already decided to be theirs.
  if (workload.releasedReportCount > 0) {
    add("read_released_report", 1, "/my-career", workload.releasedReportCount);
  }

  /* ---- 2 · Unfinished, high value ------------------------------------ */

  // The profile fields the rest of the product reads. Gated on the two
  // heavyweight sections rather than on the score, because a person can sit
  // at a respectable percentage with neither of them answered.
  const completeness = computeProfileCompleteness(identity);
  const missingCore =
    completeness.missingSections.includes("identity") ||
    completeness.missingSections.includes("profession");
  if (missingCore) {
    add("complete_profile_basics", 2, "/my-career/profile");
  }

  /* ---- 3 · Trust ----------------------------------------------------- */

  const pending = claims.filter(isPendingClaim).length;
  if (!identity.hasPassport) {
    add("start_passport", 3, "/passport");
  } else if (pending > 0) {
    // Only when there is something to submit. A holder with nothing pending
    // is not behind on anything, and telling them otherwise is the dark
    // pattern this list exists without.
    add("submit_passport_verification", 3, "/passport", pending);
  }

  /* ---- 4 · Career development ---------------------------------------- */

  if (!discovery.hasCompletedReport) {
    add("take_career_discovery", 4, "/security-career-assessment");
  }

  /* ---- 5 · Optional -------------------------------------------------- */

  // The card exists only when the report NAMES careers — the same condition
  // the report view itself applies. Offering it otherwise is a door onto an
  // empty room.
  if (discovery.hasCompletedReport && discovery.namesCareers) {
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

  if (workload.applicationCount === 0) {
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
