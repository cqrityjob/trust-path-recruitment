// Session-id validation for the Security Career Discovery start flow.
//
// `cd_begin_internal_test_session` returns a uuid. Every hop between that
// RPC and the session route must be able to say "this is a real session id"
// without guessing, so the check lives in one place and is unit-tested.
//
// Why this exists: the start flow previously navigated with whatever the
// RPC returned, unvalidated. When the value did not survive the trip — see
// the auth-gate defect in the PR description — the route was entered with
// an empty `session` search param and rendered a dead end.

/** RFC 4122 shape, any version. Deliberately not a full version check: the
 *  database is the authority on what it minted; this only rejects values
 *  that cannot possibly be a session id (empty, "undefined", truncated). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Normalise a search-param value to a usable session id, or null.
 *  Accepts the exact string the router hands back, including the "" that
 *  `String(undefined ?? "")` produces when the param is absent. */
export function parseSessionId(value: unknown): string | null {
  if (!isValidSessionId(value)) return null;
  return (value as string).trim().toLowerCase();
}
