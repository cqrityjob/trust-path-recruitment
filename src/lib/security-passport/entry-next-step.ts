// Security Passport — the ONE next step for an entry, in the order a holder
// meets them. Pure: scripts/passport-entry-next-step-check.tsx tests every row.
//
//   registered, nothing uploaded              -> upload documentation
//   documentation uploaded, never reviewed    -> request a review   (not "share")
//   review in progress                        -> nothing to do; we will tell you
//   more information requested                -> read and reply (text or document)
//   could not be approved                     -> read the decision
//   review revoked                            -> read why
//   expired / expiring                        -> renew: correct the date, upload, ask again
//   document-reviewed and current             -> done: share or choose visibility
//
// "Share" is offered only once the entry is reviewed, and then next to
// visibility -- never as the only way forward after an upload.

import type { ReviewState } from "./review-thread.functions";
import type { PassportCopyKey } from "./i18n";

export type EntryNextStep =
  | "add_evidence"
  | "request_review"
  | "waiting"
  | "clarification"
  | "rejected"
  | "revoked"
  | "renew"
  | "done"
  | "employer_or_review";

export interface EntryNextStepInput {
  readonly kind: "claim" | "experience";
  readonly assertionLevel: string;
  readonly hasActiveEvidence: boolean;
  /** The database's current review state when known (20270316090000), or the
   *  state derived from the request list before it is installed. */
  readonly reviewState: ReviewState;
  readonly hasExpired: boolean;
  readonly expiresSoon: boolean;
}

export function entryNextStep(e: EntryNextStepInput): EntryNextStep {
  switch (e.reviewState) {
    case "clarification_requested":
      return "clarification";
    case "pending":
      return "waiting";
    case "revoked":
      return "revoked";
    default:
      break;
  }
  if (e.hasExpired || (e.expiresSoon && e.assertionLevel === "verified")) return "renew";
  if (e.reviewState === "rejected") return "rejected";
  if (e.assertionLevel === "verified" || e.reviewState === "approved") return "done";
  if (!e.hasActiveEvidence) return e.kind === "experience" ? "employer_or_review" : "add_evidence";
  return "request_review";
}

/** Where the step's control leads on the entry page. */
export function entryNextStepAnchor(step: EntryNextStep): "evidence" | "verification" | null {
  switch (step) {
    case "add_evidence":
    case "renew":
      return "evidence";
    case "request_review":
    case "clarification":
    case "rejected":
    case "revoked":
    case "employer_or_review":
      return "verification";
    default:
      return null;
  }
}

/** The words of each step, shared by the entry page's panel and the Passport
 *  overview so the two can never name one step differently (workshop
 *  2026-10-15, package A). */
export const NEXT_STEP_COPY: Record<
  EntryNextStep,
  {
    readonly title: PassportCopyKey;
    readonly body: PassportCopyKey;
    readonly action?: PassportCopyKey;
  }
> = {
  add_evidence: {
    title: "next.addEvidence.title",
    body: "next.addEvidence.body",
    action: "next.addEvidence.action",
  },
  request_review: {
    title: "next.requestReview.title",
    body: "next.requestReview.body",
    action: "next.requestReview.action",
  },
  waiting: { title: "next.waiting.title", body: "next.waiting.body" },
  clarification: {
    title: "next.clarification.title",
    body: "next.clarification.body",
    action: "next.clarification.action",
  },
  rejected: {
    title: "next.rejected.title",
    body: "next.rejected.body",
    action: "next.rejected.action",
  },
  revoked: {
    title: "next.revoked.title",
    body: "next.revoked.body",
    action: "next.revoked.action",
  },
  renew: { title: "next.renew.title", body: "next.renew.body", action: "next.renew.action" },
  done: { title: "next.done.title", body: "next.done.body" },
  employer_or_review: {
    title: "next.employer.title",
    body: "next.employer.body",
    action: "next.employer.action",
  },
};

/** The review state the Passport overview can know for one credential: an
 *  open request from the holder's request list, otherwise the latest recorded
 *  decision. `null` open-requests (unreadable) never invents one. */
export function overviewReviewState(
  open: string | undefined,
  latestDecision: string | undefined,
): ReviewState {
  if (open === "clarification_requested" || open === "pending") return open;
  if (
    latestDecision === "approved" ||
    latestDecision === "rejected" ||
    latestDecision === "revoked"
  )
    return latestDecision;
  return "none";
}

/** Which credential's step the overview offers when there are several, most
 *  pressing first:
 *    1. a reviewer is waiting on the holder (clarification);
 *    2. a decision to read (rejected, revoked);
 *    3. a document is there but nobody was asked to review it;
 *    4. nothing is uploaded yet;
 *    5. a reviewed credential that has run out or is about to (renew) -- the
 *       overview's "Needs attention" list names it with its date as well;
 *    6. an employment that an employer or a review can confirm;
 *    7. reviews in progress -- the reviewer acts, the holder waits;
 *    8. everything reviewed: choose sharing and visibility.
 *  Each credential's own step is `entryNextStep` -- the same function its
 *  page uses -- so the overview and the credential's page always agree. */
export const OVERVIEW_STEP_PRIORITY: readonly EntryNextStep[] = [
  "clarification",
  "rejected",
  "revoked",
  "request_review",
  "add_evidence",
  "renew",
  "employer_or_review",
  "waiting",
  "done",
];

export function overviewNextStep<T extends { readonly step: EntryNextStep }>(
  entries: readonly T[],
): { readonly step: EntryNextStep | "first"; readonly entry: T | null; readonly count: number } {
  if (entries.length === 0) return { step: "first", entry: null, count: 0 };
  for (const step of OVERVIEW_STEP_PRIORITY) {
    const matching = entries.filter((e) => e.step === step);
    if (matching.length > 0) return { step, entry: matching[0], count: matching.length };
  }
  return { step: "done", entry: null, count: 0 };
}

/** Before the slot is installed the state is derived from the holder's own
 *  request list, newest first: the open one wins, then the latest decided. */
export function reviewStateFromRequests(
  requests: readonly { status: string; submittedAt: string; decidedAt: string | null }[],
  decisions: readonly { decision: string; decidedAt: string }[],
): ReviewState {
  const open = requests.find(
    (r) => r.status === "pending" || r.status === "clarification_requested",
  );
  if (open) return open.status as ReviewState;
  const latest = [...decisions].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
  if (latest) return latest.decision as ReviewState;
  return requests.some((r) => r.status === "withdrawn") ? "withdrawn" : "none";
}
