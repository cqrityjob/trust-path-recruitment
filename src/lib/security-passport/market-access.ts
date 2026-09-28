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
// ── THE HOSTED DATABASE HAS SINCE CAUGHT UP ────────────────────────────
//
// `pilot_state` and `sp_market_access()` are applied, and release parity
// reports zero unapplied migrations. The TYPE-level escape hatch that lived
// below this file was removed with them: the generated types describe these
// objects now, and typing the calls against anything else would hide a renamed
// function or a changed argument from the compiler for no benefit.
//
// What stays is the RUNTIME tolerance, and it stays deliberately. Shipping a
// migration ahead of its application is this repository's normal workflow, not
// the mistake -- the mistake was letting an optional read be load-bearing. The
// next feature will sit in the same gap, and this file is what makes that
// survivable rather than an outage.
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
 *  Mirrors what `sp_market_access()` returns.
 *
 *  `public_pilot` (20261220090000): every signed-in holder may register, with
 *  no individual grant, while the market stays NOT legally cleared. It is not
 *  "production" and must never be presented as one: the market's legal review
 *  is still pending, and the surfaces say so. */
export type MarketAccess = "production" | "pilot" | "public_pilot" | "closed";

/** The access values under which a holder may register something NEW. One
 *  list, so the overview, the market list and the catalogue cannot disagree
 *  about which answers open a market. */
export function isRegistrableAccess(access: MarketAccess): boolean {
  return access === "production" || access === "pilot" || access === "public_pilot";
}

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

/** True when a Supabase error means "this database's sp_market_packs has no
 *  pilot_state column yet" — the 20260915090000 axis unapplied.
 *
 *  Postgres reports an undefined column as 42703; PostgREST reports a column
 *  its schema cache does not know as PGRST204. Nothing else is tolerated: a
 *  permission error or an outage on this read must surface, because a
 *  surface that quietly presented every closed market as "not a pilot" on a
 *  failed read would be guessing about a governed state. */
export function isMissingPilotStateColumn(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42703" || err?.code === "PGRST204";
}

/** True when a Supabase error means "this database has no sp_pilot_members
 *  table yet" — the same unapplied axis, seen from the administration page.
 *
 *  Postgres reports an undefined table as 42P01; PostgREST reports a relation
 *  missing from its schema cache as PGRST205. As above, nothing else is
 *  tolerated. */
export function isMissingPilotMembersTable(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42P01" || err?.code === "PGRST205";
}

/** Resolve the market access decision, degrading safely.
 *
 *  With the pilot layer present this simply passes through what the database
 *  said — `sp_market_access()` is the single decision, and the claim trigger
 *  consults the same function before accepting a write.
 *
 *  Without it, the pre-pilot rule applies verbatim: `is_active` and nothing
 *  else. "pilot" and "public_pilot" are unreachable in that branch, by
 *  construction rather than by care.
 *
 *  And an answer this code does not know is "closed". A database that has
 *  NOT received 20261220090000 never says "public_pilot", so nothing changes
 *  there; a future state this code has never heard of opens nothing until the
 *  code is taught what it means. */
export function resolveMarketAccess(input: MarketAccessInputs): MarketAccess {
  if (input.pilotLayerMissing) {
    return input.packIsActive ? "production" : "closed";
  }
  return input.rpcAccess === "production" ||
    input.rpcAccess === "pilot" ||
    input.rpcAccess === "public_pilot"
    ? input.rpcAccess
    : "closed";
}

/** Product availability of one market, for the overview: `available` when
 *  the pack is public (`is_active`), `internal_pilot` only when `pilot_state`
 *  is EXACTLY 'internal_pilot', `public_pilot` only when it is EXACTLY
 *  'public_pilot', and `closed` for everything else — a closed pack, an
 *  unknown state, a database whose pack has no pilot_state column.
 *
 *  Pure, so the guard can prove the mapping: an inactive pack whose state is
 *  missing, null, 'closed' or anything unrecognised is never presented as a
 *  pilot, because "under review" is a governed claim and the only evidence
 *  for it is the column saying so. The same holds for "open to everyone": a
 *  public pilot is printed only when the column says exactly that. */
export type MarketAvailability = "available" | "internal_pilot" | "public_pilot" | "closed";

export function marketAvailabilityOf(
  packIsActive: boolean,
  pilotState: string | null | undefined,
): MarketAvailability {
  if (packIsActive) return "available";
  if (pilotState === "internal_pilot") return "internal_pilot";
  return pilotState === "public_pilot" ? "public_pilot" : "closed";
}

/** The refusal every write path turns an availability refusal into. */
export const NOT_OPEN_FOR_REGISTRATION = "SP_NOT_OPEN_FOR_REGISTRATION";

/** True when a database refusal means "not open for new registration": the
 *  definition is not in the caller's approved catalogue
 *  (SP_APPROVED_DEFINITION_REQUIRED), its market is not open to them
 *  (SP_MARKET_PACK_NOT_ACTIVE) or the definition itself is not
 *  (SP_CREDENTIAL_NOT_AVAILABLE). Matched on the codes the database raises by
 *  name — never on the prose after them, which 20261220090000 rewrote. A
 *  surface shows its own message for these instead of the generic save error,
 *  and nothing else is reported as one. */
export function isAvailabilityRefusal(message: string | null | undefined): boolean {
  return (
    typeof message === "string" &&
    (message.includes("SP_APPROVED_DEFINITION_REQUIRED") ||
      message.includes("SP_MARKET_PACK_NOT_ACTIVE") ||
      message.includes("SP_CREDENTIAL_NOT_AVAILABLE"))
  );
}
