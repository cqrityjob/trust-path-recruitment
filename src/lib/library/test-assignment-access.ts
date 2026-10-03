// Who may send a candidate test, and -- when the answer is no -- WHY.
//
// ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────
//
// getTestAssignmentAccess answered a boolean from the caller's membership alone:
// an active owner or administrator. The database asks one thing more.
// scp_assign_from_application checks has_active_employer_role(), which also
// requires the ORGANISATION to be active (20270108090000, 20270113090000). So an
// owner whose organisation had gone back to review after an identity change
// (20270123090000) was shown the send form, pressed the button, and was told
// "you need to be an owner or an administrator" -- which they are. The reason
// was real and was withheld.
//
// This module keeps the three reasons apart. It is still not the boundary: the
// RPC is, and it refuses on its own whatever this says. What changes is only
// what the person is told.
//
// Unknown organisation status counts as "allowed", not as "not active": the
// previous behaviour (role alone) is the safe fallback when the status could not
// be read, and the RPC refuses an organisation that is not active whether or not
// this function noticed.

export type TestAssignmentRefusal =
  | "not_owner_admin"
  | "organisation_under_review"
  | "organisation_not_active";

export type TestAssignmentAccess =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: TestAssignmentRefusal };

/** `role` is the caller's ACTIVE membership role in the organisation, or null
 *  when they hold none. `organisationStatus` is employers.status, or null when
 *  it could not be read. */
export function evaluateTestAssignmentAccess(input: {
  role: string | null | undefined;
  organisationStatus: string | null | undefined;
}): TestAssignmentAccess {
  if (input.role !== "owner" && input.role !== "admin") {
    return { allowed: false, reason: "not_owner_admin" };
  }
  const status = input.organisationStatus;
  if (status === null || status === undefined || status === "active") return { allowed: true };
  // `draft` and `pending` are "being reviewed"; rejected, suspended and
  // archived are not a review in progress and must not be called one.
  if (status === "pending" || status === "draft") {
    return { allowed: false, reason: "organisation_under_review" };
  }
  return { allowed: false, reason: "organisation_not_active" };
}
