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
