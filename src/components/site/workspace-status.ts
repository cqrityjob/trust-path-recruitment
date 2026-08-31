// How an organisation's status is described in the chrome.
//
// A pure module beside the component that uses it, matching
// candidate-app-nav.ts: the decision can then be proven exhaustively in a
// guard without standing up a router, and the account menu keeps exporting
// only components.
//
// ── WHY THE CHROME SAYS ANYTHING AT ALL ────────────────────────────────
//
// The account menu used to list every organisation the database returned,
// identically, with no status — so an organisation still awaiting approval
// looked exactly like an approved one and led to a workspace that bounced
// the person straight back out. The comment above it claimed the opposite,
// that a pending organisation was hidden entirely; that would have been
// worse. An independent pilot audit found a registrant with no route to
// their own organisation from anywhere in the interface, who reached it
// only by typing /employer.
//
// So the organisation is listed, and it says where it stands.
//
// PRESENTATION ONLY. This decides a label and which of two links to render.
// It grants nothing and withholds nothing: /employer/$employerSlug
// re-verifies membership server-side exactly as it does when the URL is
// typed, and roughly thirty RLS policies require employer_is_active_status()
// regardless of what any menu shows.

/** The two chips the chrome can put on an organisation, or null when it is
 *  open for business and needs no explanation. */
export type WorkspaceStatusLabelKey = "account.context.underReview" | "account.context.unavailable";

/**
 * Two words, not six: this is a menu entry, not the status page.
 *
 * `pending` and `draft` are a registration that has not been decided yet.
 * Everything else that is not `active` — `rejected`, `suspended`,
 * `archived` — is an organisation that is not open, and saying WHICH is the
 * status page's job, where there is room to say it truthfully. Calling a
 * rejected registration "under review" would be a lie told by a chip.
 *
 * Nothing here invents a state the database does not hold.
 */
export function workspaceStatusLabelKey(status: string): WorkspaceStatusLabelKey | null {
  if (status === "active") return null;
  if (status === "pending" || status === "draft") return "account.context.underReview";
  return "account.context.unavailable";
}

/** Where a workspace entry in the chrome should lead. An organisation that
 *  is not active goes to the status page rather than to a workspace the
 *  database will refuse. */
export function workspaceIsOpenable(status: string): boolean {
  return workspaceStatusLabelKey(status) === null;
}
