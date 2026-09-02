// Who may lock a candidate interview report.
//
// ── THE DEFECT THIS EXISTS BECAUSE OF ───────────────────────────────────
//
// A pilot walkthrough reached the report screen. It said "Inget hindrar
// rapporten" and rendered an active "Slutför rapporten" button. The user
// clicked it. The database refused:
//
//   SCP_IV_FINALISE_ROLE: finalising a candidate interview report requires
//   an employer owner or admin.
//
// The governance rule worked. The screen had told the user something untrue
// about themselves, and the only way to find out was to try.
//
// That is worse than an ordinary bug. The interviewer had done everything the
// product asked of them, was shown a button that said the work was theirs to
// conclude, and got a refusal phrased as if they had done something wrong. The
// right answer was available on the page the whole time.
//
// ── WHAT IS AND IS NOT A SECURITY BOUNDARY ──────────────────────────────
//
// This module is UX TRUTHFULNESS, not authorisation. The boundary is
// scp_iv_finalise_report, which is SECURITY DEFINER, checks
// has_employer_role(auth.uid(), employer_id, ARRAY['owner','admin']) before it
// does anything, and is unchanged by this work. A member who crafts the call
// directly is still refused, and there is a regression test that proves it.
//
// So nothing here may ever be described as "the permission check". Hiding a
// button is a courtesy to an honest user; it stops nobody.
//
// ── WHY IT MIRRORS THE BACKEND RATHER THAN APPROXIMATING IT ─────────────
//
// The two must agree, and the only way to be sure is to use the same inputs.
//
//   has_employer_role   an ACTIVE membership row for this employer, whose
//                       `role` is one of owner/admin
//   this module         the same membership row, read by
//                       listMyEmployerWorkspaces, which filters
//                       `.eq("status", "active")` and returns that same
//                       `employer_memberships.role`
//
// Same table, same active-status condition, same role column, same two values.
//
// What it deliberately does NOT infer permission from:
//
//   * being able to see the page — every interviewer can, and should
//   * having created the case — authorship is not authority
//   * having done the assessments — the person who did the work is often
//     precisely the person who may not sign it off, which is the point of
//     separating the two
//
// ── WHY A NAMED FUNCTION AND NOT AN INLINE COMPARISON ───────────────────
//
// The codebase inlines `role === "owner" || role === "admin"` in a dozen
// places, and for a page-level "can this person edit" that is fine. This one
// is different: it is the UI half of a rule the database also states, and the
// two have already drifted once. A named function is what a guard can point
// at, and what a reader can search for when they change the backend rule.

import type { MyEmployerWorkspace } from "@/lib/job-intelligence/membership.functions";

/** The caller's role in one employer.
 *
 *  Taken from the workspace type rather than redeclared, so a role added to
 *  the membership model cannot leave this file quietly comparing against a
 *  stale union. */
export type EmployerRole = MyEmployerWorkspace["role"];

/** The roles scp_iv_finalise_report accepts, as data.
 *
 *  Listed rather than expressed as a condition so that widening it is a
 *  visible edit to a line that names the database function it mirrors —
 *  not a boolean somebody loosened in passing. */
export const REPORT_FINALISE_ROLES: readonly EmployerRole[] = ["owner", "admin"];

/**
 * Whether this person may lock the immutable candidate interview report.
 *
 * `role` is the caller's role in THIS employer, from their own active
 * membership. `null`/`undefined` — no workspace resolved yet, or no active
 * membership — answers false: a screen that has not yet established who
 * somebody is must not offer them an irreversible action.
 *
 * Not a security check. See the header.
 */
export function canFinaliseInterviewReport(role: EmployerRole | null | undefined): boolean {
  if (!role) return false;
  return REPORT_FINALISE_ROLES.includes(role);
}
