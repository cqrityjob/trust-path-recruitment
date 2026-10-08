/** Matches the existing SQL report basis, not a candidate outcome. */
export function isOutstandingFinding(state: string): boolean {
  return state === "open" || state === "needs_verification" || state === "unresolved_difference";
}
