// What the two access-request refusals are called, and how a screen recognises
// them. Pure: no server import, so the join page, the team panel, the server
// functions and the guard can all read the same two words.
//
// ── WHAT THEY MEAN ─────────────────────────────────────────────────────
//
// A platform administrator suspends or removes a member through
// update_employer_membership. Nothing an organisation's own owner or admin can
// do may undo that.
//
//   ACCESS_REQUEST_MEMBERSHIP_BLOCKED     raised when a person whose membership
//     of that organisation is suspended or removed files an access request.
//     They did nothing wrong by trying; the honest answer is that it is not
//     theirs to ask, and who to ask.
//   ACCESS_REQUEST_REACTIVATION_REFUSED   raised when anybody, a platform
//     administrator included, approves a request from such a person. Approving
//     is not the way back: only update_employer_membership reactivates. The
//     request stays pending and can be denied.
//
// Both are raised by the database (migration 20270202090000). Before it is
// applied neither exists, the insert simply succeeds and the approval behaves as
// it always did, so nothing here depends on the migration. The words are carried
// in the error message by the server functions and recognised below.
//
// This is UX truthfulness, not authorisation. The boundary is the trigger and
// the function.

export const ACCESS_REQUEST_MEMBERSHIP_BLOCKED = "ACCESS_REQUEST_MEMBERSHIP_BLOCKED";
export const ACCESS_REQUEST_REACTIVATION_REFUSED = "ACCESS_REQUEST_REACTIVATION_REFUSED";

export type AccessRequestRefusal = "membershipBlocked" | "reactivationRefused";

function messageOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return "";
}

/** Which of the two refusals an error is, or null when it is neither. */
export function accessRequestRefusalOf(error: unknown): AccessRequestRefusal | null {
  const message = messageOf(error);
  if (message.includes(ACCESS_REQUEST_MEMBERSHIP_BLOCKED)) return "membershipBlocked";
  if (message.includes(ACCESS_REQUEST_REACTIVATION_REFUSED)) return "reactivationRefused";
  return null;
}
