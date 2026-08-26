// Security Passport — how the read model survives a database that has not
// caught up with the code.
//
// ── THE OUTAGE THIS FILE EXISTS TO PREVENT ─────────────────────────────
//
// The application redeploys the moment `main` moves. A migration is applied
// when somebody asks for it. Those are two different events, and between them
// the code can be talking to a schema that has never heard of what it needs.
//
// That is exactly what happened: the market read model began calling
// `sp_market_access()` and selecting `pilot_state` while the migration that
// creates them was still — correctly and deliberately — unapplied. PostgREST
// answered every call with an error, the error propagated, and the Passport
// went dark. Not the pilot part of it. All of it: the credential controls, the
// work-country panel, and on the overview the entire page, which sat on a
// loading line for holders whose records were completely intact.
//
// `release-parity-check --release` had already named this failure, in those
// words, from a previous outage. It is a release gate, and a release gate does
// not run at merge time.
//
// ── THE RULE ───────────────────────────────────────────────────────────
//
// A missing pilot layer is not an error to report. It is a fact to read: this
// database has no market in internal pilot. Answering that question honestly
// costs nothing and restores every pre-pilot behaviour exactly.
//
// ── AND IT FAILS CLOSED ────────────────────────────────────────────────
//
// The direction matters more than the tolerance. Without the pilot layer no
// holder gains pilot access — a market that should be shut can never be opened
// by the ABSENCE of schema. The degraded answer is strictly narrower than the
// full one, never wider.

/** What a holder may do with one market, from the read model's point of view.
 *  Mirrors what `sp_market_access()` returns. */
export type MarketAccess = "production" | "pilot" | "closed";

export interface MarketAccessInputs {
  /** `sp_market_packs.is_active` — public, legally cleared. Unchanged by the
   *  pilot work and the only signal available when the pilot layer is absent. */
  readonly packIsActive: boolean;
  /** What `sp_market_access()` answered, when it could be asked. */
  readonly rpcAccess: string | null;
  /** True when the database has no pilot layer — see `isMissingPilotLayer`. */
  readonly pilotLayerMissing: boolean;
}

/** True when a Supabase error means "this database has no pilot layer yet".
 *
 *  PostgREST reports an unknown RPC as PGRST202; Postgres reports an undefined
 *  function as 42883. Both reach the client, depending on whether the schema
 *  cache or the database answered first.
 *
 *  Matched on CODE, never on message text: the message is localised and the
 *  codes are not, and a guard that matched on English would stop working on a
 *  Swedish-locale database — which is most of them here.
 *
 *  Deliberately narrow. Any other failure — a permission error, a genuine
 *  outage — must still throw. Reporting those to a holder as "no pilot
 *  markets" would be a quiet lie about their own entitlement, and the holder
 *  would have no way to tell the difference. */
export function isMissingPilotLayer(err: { code?: string } | null | undefined): boolean {
  return err?.code === "PGRST202" || err?.code === "42883";
}

/** Resolve the market access decision, degrading safely.
 *
 *  With the pilot layer present this simply passes through what the database
 *  said — `sp_market_access()` is the single decision, and the claim trigger
 *  consults the same function before accepting a write.
 *
 *  Without it, the pre-pilot rule applies verbatim: `is_active` and nothing
 *  else. "pilot" is unreachable in that branch, by construction rather than by
 *  care. */
export function resolveMarketAccess(input: MarketAccessInputs): MarketAccess {
  if (input.pilotLayerMissing) {
    return input.packIsActive ? "production" : "closed";
  }
  return input.rpcAccess === "production" || input.rpcAccess === "pilot"
    ? input.rpcAccess
    : "closed";
}
