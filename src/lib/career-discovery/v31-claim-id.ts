// The identity of a claimed anonymous run.
//
// ── WHY A DERIVED ID AND NOT A NEW ROW ─────────────────────────────────
//
// Claiming a finished anonymous run writes a `cd_sessions` row. Nothing
// about that write was idempotent: every call minted a fresh uuid, so a
// double-click, a second tab finishing the same sign-in, a retry after a
// timeout that had actually succeeded, or simply reloading the claim URL
// produced a SECOND session and a SECOND report for one run. The candidate
// answered twenty-eight questions once and ended up with two reports of
// unclear provenance, and nothing in the schema could tell them apart.
//
// The claim token already names the run — uniquely, unguessably, and
// stably across tabs, because it lives in localStorage and travels in the
// return URL. Deriving the session id from it makes the PRIMARY KEY itself
// the idempotency check: the first claim inserts, every later one collides,
// and the collision is the answer rather than an error. No new column, no
// new index, no new table, and no read-then-write race to lose.
//
// ── WHY DERIVED RATHER THAN THE TOKEN ITSELF ───────────────────────────
//
// The token appears in a URL. URLs reach analytics, referrer headers and
// server logs. A session id is not a credential — no policy is keyed on it
// and RLS scopes every read of `cd_sessions` to its owner — but a value that
// is simultaneously a URL parameter and a database key invites exactly the
// assumption that it is one. Hashing costs nothing and keeps the two
// namespaces apart: what leaks into a log cannot be pasted into a query.
//
// The derivation is one-way, so the id cannot be turned back into a token,
// and deterministic, so the same token always names the same session.

/** Domain separation. Prepended so a claim token can never collide with a
 *  digest computed for some other purpose over the same bytes. */
const CLAIM_ID_NAMESPACE = "cqj:career-discovery:v31:claim-session:";

/**
 * The `cd_sessions.id` that this claim token owns.
 *
 * Deterministic: same token, same uuid, forever. Formatted as a v5-shaped
 * uuid (name-based, SHA-1 is what RFC 4122 names — the stronger digest is
 * used here and the version nibble records "name-based", which is what the
 * column's type and every reader care about).
 *
 * Async because `crypto.subtle` is, and it is the one digest available
 * identically in every runtime this module is loaded in.
 */
export async function deriveClaimSessionId(claimToken: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${CLAIM_ID_NAMESPACE}${claimToken}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const id = digest.slice(0, 16);
  // Version 5 (name-based) and the RFC 4122 variant, so the value is a
  // well-formed uuid rather than sixteen bytes that usually parse as one.
  id[6] = (id[6] & 0x0f) | 0x50;
  id[8] = (id[8] & 0x3f) | 0x80;
  const hex = Array.from(id, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
