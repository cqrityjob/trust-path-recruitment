// Security Passport — the word beside one merit's standing.
//
// A table, not a decision. `WorkspaceMeritStatus` arrives already derived by
// the shared merit labeller (professional-identity/passport-merits.ts); this
// only says which copy key each value takes.
//
// It lives beside the derivation rather than inside the chip that renders it
// so that a caller which needs the WORD without the markup — an aria-label, a
// screen-reader summary, a guard — has one place to get it. Two tables would
// be two vocabularies, which is the thing this whole domain spends its
// comments refusing.

import type { PassportCopyKey } from "./i18n";
import type { WorkspaceMeritStatus } from "./workspace";

export const MERIT_STATUS_KEY: Readonly<Record<WorkspaceMeritStatus, PassportCopyKey>> = {
  // "We could not establish whether anybody is reviewing this." NOT a trust
  // level and not a downgrade: the holder's own statement is as true as it
  // ever was, and what is missing is the review state. The word says exactly
  // that rather than borrowing "Egen uppgift", which would let a pending
  // merit sit among the ordinary ones and read as settled.
  unknown: "ws.merit.status.unknown",
  added_by_you: "ws.merit.status.added_by_you",
  document_provided: "ws.merit.status.document_provided",
  verification_requested: "ws.merit.status.verification_requested",
  clarification_needed: "ws.merit.status.clarification_needed",
  documented: "ws.merit.status.documented",
  verified: "ws.merit.status.verified",
  expired: "ws.merit.status.expired",
};
