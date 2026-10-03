// The rules behind a platform administrator's member controls, and nothing else.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
//
// `adminUpdateEmployerMembershipStatus` and `…Role` were written in Phase G1 and
// referenced by no route and no component. An administrator could read an
// organisation's members and could not do anything about them, so "a colleague
// has left, remove their access" -- the first thing an employer asks for -- had
// no answer in the product, and could not be tried in a browser either.
//
// The controls now live on the platform-admin organisation page
// (src/components/admin/AdminEmployerMembers.tsx). This file holds the part of
// them that is a RULE rather than a layout, so that it can be run by a guard
// (scripts/employer-access-lifecycle-check.ts) instead of read.
//
// ── WHAT IS DECIDED HERE, AND WHAT IS NOT ───────────────────────────────
//
// Which buttons are OFFERED, and whether a change would take away the last
// owner. Both are advisory. The authority is `update_employer_membership()`
// (20260719100000, section 9): it is a SECURITY INVOKER function that checks
// is_platform_admin() itself, takes the row locks, and refuses a change that
// would leave an organisation with no active owner. A stale page can therefore
// offer a button the database then refuses, and what it says when that happens
// is `membershipRpcFailure` below -- a closed set of codes, never the
// database's own wording.

import { AdminMutationError } from "@/lib/admin/admin-error";

export type MembershipRole = "owner" | "admin" | "member";
export type MembershipStatus = "invited" | "active" | "suspended" | "removed";

/** The three things done to a membership's STATUS. Changing a role is a
 *  separate control, because it is a different decision with different
 *  consequences. */
export type MembershipStatusAction = "suspend" | "remove" | "reactivate";

export const MEMBERSHIP_ROLES: readonly MembershipRole[] = ["owner", "admin", "member"];

/** The status each action leads to. The names are the database's. */
export const MEMBERSHIP_TARGET_STATUS: Record<MembershipStatusAction, MembershipStatus> = {
  suspend: "suspended",
  remove: "removed",
  reactivate: "active",
};

/** Which status actions make sense from a status. Advisory, like the page's
 *  moderation buttons: the RPC accepts any status to any other, so this list is
 *  the product's judgement of what is sensible, not a database rule.
 *
 *    active     can be paused or ended
 *    suspended  can be restored or ended
 *    removed    can be restored (a mistake is undone here, not by a new invite)
 *    invited    has not accepted: the only sensible action is to withdraw it
 */
export function availableStatusActions(status: string): MembershipStatusAction[] {
  switch (status) {
    case "active":
      return ["suspend", "remove"];
    case "suspended":
      return ["reactivate", "remove"];
    case "removed":
      return ["reactivate"];
    case "invited":
      return ["remove"];
    default:
      return [];
  }
}

/** A removed membership has no access to change the level of, so the role
 *  control is not offered for it. */
export function canChangeRole(status: string): boolean {
  return status === "active" || status === "suspended" || status === "invited";
}

type MemberRef = { id: string; role: string; status: string };

/** Whether this membership is the organisation's only ACTIVE owner. */
export function isOnlyActiveOwner(members: readonly MemberRef[], membershipId: string): boolean {
  const target = members.find((m) => m.id === membershipId);
  if (!target || target.role !== "owner" || target.status !== "active") return false;
  return !members.some((m) => m.id !== membershipId && m.role === "owner" && m.status === "active");
}

/** Whether a change would leave the organisation with no active owner -- the
 *  same condition `update_employer_membership()` refuses, evaluated on the
 *  rows the page already holds:
 *
 *      the row is an active owner now, the result is not an active owner, and
 *      no OTHER active owner exists.
 *
 *  A change that leaves the row an active owner (a no-op, say) never trips it. */
export function wouldLeaveNoActiveOwner(
  members: readonly MemberRef[],
  membershipId: string,
  change: { role?: MembershipRole; status?: MembershipStatus },
): boolean {
  const target = members.find((m) => m.id === membershipId);
  if (!target || target.role !== "owner" || target.status !== "active") return false;
  const finalRole = change.role ?? target.role;
  const finalStatus = change.status ?? target.status;
  if (finalRole === "owner" && finalStatus === "active") return false;
  return isOnlyActiveOwner(members, membershipId);
}

/** The codes `membershipRpcFailure` can produce. All three resolve through
 *  CODE_MAP in src/lib/admin/admin-error.ts; the last is deliberately NOT in
 *  that map, so an unrecognised failure shows as "could not be completed" with
 *  a code to quote. */
export const MEMBERSHIP_ERROR_CODES = [
  "ADMIN_MEMBERSHIP_FINAL_OWNER",
  "ADMIN_MEMBERSHIP_NOT_FOUND",
  "ADMIN_MEMBERSHIP_FORBIDDEN",
  "ADMIN_MEMBERSHIP_UPDATE_FAILED",
] as const;

/** Turn what `update_employer_membership()` raised into one of those codes.
 *
 *  The function raises plain English, not identifiers, and a migration is not
 *  allowed here, so the recognition is by phrase. The three phrases are pinned
 *  against the migration's text by the guard -- if the wording in the database
 *  ever changes, the guard fails rather than the final-owner refusal quietly
 *  turning into "could not be completed".
 *
 *  Anything else is logged and replaced: an unexpected database error is a
 *  constraint name or a row fragment, and the person reading the page is not
 *  the person who can use it. */
export function membershipRpcFailure(
  error: { message?: string | null; code?: string | null } | null | undefined,
): AdminMutationError {
  const message = error?.message ?? "";
  if (/only active owner/i.test(message)) {
    return new AdminMutationError("ADMIN_MEMBERSHIP_FINAL_OWNER");
  }
  if (/membership not found/i.test(message)) {
    return new AdminMutationError("ADMIN_MEMBERSHIP_NOT_FOUND");
  }
  if (/forbidden|not authenticated/i.test(message)) {
    return new AdminMutationError("ADMIN_MEMBERSHIP_FORBIDDEN");
  }
  console.error("[membership] unexpected database error", {
    sqlstate: error?.code ?? null,
    message: error?.message ?? null,
  });
  return new AdminMutationError("ADMIN_MEMBERSHIP_UPDATE_FAILED");
}
