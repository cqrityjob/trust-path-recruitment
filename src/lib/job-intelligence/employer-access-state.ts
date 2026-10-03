// What the employer area decides about a visitor BEFORE it shows them anything.
//
// Two decisions, both pure so that a guard can run them across their whole state
// space instead of reading the component that calls them
// (scripts/employer-access-lifecycle-check.ts):
//
//   decideEmployerGate   may the workspace under /employer/$employerSlug render
//                        yet -- and if not, wait or go to the review page?
//   accessEndedKind      does this person hold only a removed or suspended
//                        membership, so that "Kom igång som arbetsgivare" would
//                        be the wrong thing to show them?
//
// Neither is a security boundary. Both run in the browser, and anyone can skip
// them. The boundary is row-level security and the membership checks inside every
// server function, none of which changed. These exist so that a person who has
// no access is told so, rather than walked into a room that refuses everything.

type WorkspaceRef = { employerSlug: string; employerStatus: string };

export type EmployerGateDecision = "wait" | "redirect" | "open";

/** Whether the workspace subtree may render.
 *
 *  `wait`      the answer has not arrived. Rendering the children now is what
 *              this function exists to prevent: for an organisation that is under
 *              review every child page fires calls that row-level security
 *              refuses, and the person sees a flash of errors before the redirect
 *              to the review page catches up.
 *  `redirect`  the caller belongs to this organisation and it is not active.
 *  `open`      anything else. That includes a slug the caller has no membership
 *              for (the child page renders the access-denied surface, and
 *              redirecting here would tell a stranger which slugs exist), a read
 *              that FAILED (the children hold the same query and say so
 *              themselves), and a deployment where the portal is switched off
 *              (the children render the coming-soon page and nothing is fetched).
 */
export function decideEmployerGate(input: {
  portalEnabled: boolean;
  /** react-query's `status` for the workspace list. */
  loaded: "pending" | "success" | "error";
  workspaces: readonly WorkspaceRef[] | undefined;
  slug: string;
}): EmployerGateDecision {
  if (!input.portalEnabled) return "open";
  if (input.loaded === "pending") return "wait";
  if (input.loaded === "error") return "open";
  const workspace = (input.workspaces ?? []).find((w) => w.employerSlug === input.slug);
  return workspace !== undefined && workspace.employerStatus !== "active" ? "redirect" : "open";
}

export type AccessEndedKind = "removed" | "suspended";

/** Whether the caller's ONLY standing with any organisation is a removed or
 *  suspended membership.
 *
 *  Called with the caller's own membership rows (listMyEmployerMemberships,
 *  which employer_memberships_self_select returns in every status), and only
 *  after the workspace list has come back empty -- an active membership of
 *  anything means there is a workspace to open and nothing to explain.
 *
 *  `removed` wins over `suspended` when somebody holds both: the more final
 *  statement is the one that is safe to make. */
export function accessEndedKind(
  memberships: readonly { status: string }[] | undefined,
): AccessEndedKind | null {
  if (!memberships || memberships.some((m) => m.status === "active")) return null;
  if (memberships.some((m) => m.status === "removed")) return "removed";
  if (memberships.some((m) => m.status === "suspended")) return "suspended";
  return null;
}
