// Security Passport — effective lifecycle, derived at read time.
//
// ── WHY EXPIRY IS DERIVED AND NOT STORED ───────────────────────────────
//
// A stored `lifecycle_state = 'expired'` would need something to write it
// on the day the licence lapses: a scheduled job, or a login-time sweep.
// Both fail quietly. A job that stops running leaves a lapsed licence
// reading VERIFIED · ACTIVE, which is the single most damaging thing this
// product could display, and nothing about the row would look wrong.
//
// A date comparison at read time cannot fail that way. `valid_until` is a
// fact recorded by the verifier; whether it has passed is arithmetic.
//
// This is also exactly why the two axes are separate. An expired licence
// stays `assertion_level = 'verified'` — somebody really did check it — and
// only its LIFECYCLE moves. Collapsing the two would force a choice between
// deleting the verification and displaying a lapsed credential as current.

import type { IsoDate, LifecycleState } from "./types";

/** How far ahead a holder is warned. Long enough to renew a Väktare
 *  authorisation without rushing, short enough not to nag for a year. */
export const EXPIRY_WARNING_DAYS = 60;

export interface Validity {
  /** What the row says. */
  readonly storedState: LifecycleState;
  /** What is actually true today. Differs from `storedState` only when a
   *  stored-active entry has a `validUntil` in the past. */
  readonly effectiveState: LifecycleState;
  readonly validUntil: IsoDate | null;
  readonly hasExpired: boolean;
  /** True while the entry is still valid but inside the warning window. */
  readonly expiresSoon: boolean;
  readonly daysRemaining: number | null;
}

function toEpochDay(date: IsoDate): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

export function validityOf(
  storedState: LifecycleState,
  validUntil: IsoDate | null,
  evaluationOn: IsoDate,
): Validity {
  const base: Validity = {
    storedState,
    effectiveState: storedState,
    validUntil,
    hasExpired: false,
    expiresSoon: false,
    daysRemaining: null,
  };

  // Revoked, disputed and superseded are decisions, not dates. A date can
  // never override one of them — a revoked credential does not become
  // merely "expired" by waiting.
  if (storedState !== "active" || !validUntil) return base;

  const daysRemaining = toEpochDay(validUntil) - toEpochDay(evaluationOn);

  if (daysRemaining < 0) {
    return { ...base, effectiveState: "expired", hasExpired: true, daysRemaining };
  }

  return { ...base, expiresSoon: daysRemaining <= EXPIRY_WARNING_DAYS, daysRemaining };
}

/** Whether a renewal is worth offering: a verification that has lapsed or is
 *  about to. Offered on nothing else — a self-declared entry has no
 *  verification to renew, and asking for one would be theatre. */
export function mayRenew(assertionLevel: string, validity: Validity): boolean {
  return assertionLevel === "verified" && (validity.hasExpired || validity.expiresSoon);
}
