// Security Passport — the public recipient boundary.
//
// ── WHY THIS IS THE ONE PLACE THE SERVICE ROLE IS ALLOWED ──────────────
//
// Everywhere else in this domain, RLS is the boundary and the service-role
// client is banned outright (scripts/passport-separation-check.ts enforces
// it, and names this file as the single exception). The reason it is the
// exception here is structural, not convenient:
//
//   * the recipient is ANONYMOUS. There is no session, so there is no
//     `auth.uid()` for RLS to key on. RLS cannot express "whoever holds
//     this token" — a token is not an identity.
//   * so the authorisation is the token itself, and it is checked inside
//     `sp_get_disclosure`, a SECURITY DEFINER function that returns a
//     payload it assembles from the package contract. The service role
//     cannot make it return more. There is no table read here, no `select
//     *`, and no way to reach Passport data other than through that one
//     function with a correct token.
//
// The alternative — Phase 3's direct `GRANT EXECUTE ... TO anon` — put the
// only public endpoint in the product somewhere the application could
// neither see nor throttle. Moving it here removes anon's database
// execution entirely and puts a real rate limit in front of it.
//
// This file must never gain a second query. If something else needs the
// service role, it needs a different justification and a different file.

import type { RecipientPayload } from "./packages";

/** Attempts allowed per client per window. A recipient opens one link, maybe
 *  reloads it; anything past this is enumeration, not use. */
const THROTTLE_LIMIT = 30;
const THROTTLE_WINDOW_SECONDS = 300;

/** Hashes a client hint into throttle-bucket state.
 *
 *  The raw address never reaches the database. The date is folded in so a
 *  hash cannot be correlated across days, and the throttle rows are deleted
 *  after a day anyway — this is ephemeral abuse-control state, not a log of
 *  who read what. */
async function clientHash(hint: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`sp-public:${day}:${hint}`).digest("hex").slice(0, 32);
}

export async function readDisclosureByToken(
  token: string,
  clientHint: string,
): Promise<RecipientPayload> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const hash = await clientHash(clientHint);

  const throttle = await supabaseAdmin.rpc(
    "sp_throttle_public_access" as never,
    {
      _client_hash: hash,
      _limit: THROTTLE_LIMIT,
      _window_seconds: THROTTLE_WINDOW_SECONDS,
    } as never,
  );

  // A throttled caller gets the SAME response as a revoked, expired or
  // never-existed token. Distinguishing them would tell an attacker that
  // their guesses are landing, which is precisely what a rate limit is
  // supposed to stop them learning.
  if (throttle.error || throttle.data === false) {
    return { status: "unavailable" };
  }

  const { data, error } = await supabaseAdmin.rpc(
    "sp_get_disclosure" as never,
    {
      _token: token,
    } as never,
  );

  if (error || !data) return { status: "unavailable" };
  return data as unknown as RecipientPayload;
}
