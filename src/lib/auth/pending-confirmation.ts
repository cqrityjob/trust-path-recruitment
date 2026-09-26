// The registration that is waiting on an inbox.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// After "Skapa konto" the panel replaced the form with "Kontrollera din
// e-post" -- and kept that fact in React state only. Refresh the page, or
// come back to the laptop after opening the link on a phone, and the form
// was back as if nothing had happened: no address, no resend, no way to
// continue, and the natural next move (submit again) answers "User already
// registered".
//
// ── WHAT IS STORED, AND WHAT IS NOT ────────────────────────────────────
//
// The address, the validated return path, whether an organisation was named,
// and when. Nothing secret: no password, no token, no session. It lets the
// SAME BROWSER pick the pending state up again; it can neither sign anybody
// in nor say whether the address has been confirmed -- that answer comes only
// from a real sign-in attempt with the person's own credentials.
//
// localStorage rather than sessionStorage on purpose: the case this exists
// for is a person who closed the tab, or reloaded, and needs the same panel
// back. It expires after a day, and it is cleared the moment the account is
// used or the person chooses another address.

import { safeReturnPath } from "./safe-redirect";

const KEY = "cqj:auth:pending-confirmation:v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export type PendingConfirmation = {
  readonly email: string;
  readonly returnTo: string;
  readonly forOrganisation: boolean;
  readonly at: number;
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function rememberPendingConfirmation(
  p: Omit<PendingConfirmation, "at">,
  fallback: string,
): PendingConfirmation {
  const record: PendingConfirmation = {
    email: p.email.trim(),
    returnTo: safeReturnPath(p.returnTo, fallback),
    forOrganisation: Boolean(p.forOrganisation),
    at: Date.now(),
  };
  try {
    storage()?.setItem(KEY, JSON.stringify(record));
  } catch {
    // Storage disabled: the in-memory state still carries the panel for this
    // tab, and a failure to remember must never block the registration.
  }
  return record;
}

/** The pending registration this browser recorded, if it is still fresh.
 *  Re-validated on the way out -- storage is not a trust boundary. */
export function readPendingConfirmation(fallback: string): PendingConfirmation | null {
  const raw = (() => {
    try {
      return storage()?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  })();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingConfirmation>;
    if (typeof parsed.email !== "string" || !parsed.email.includes("@")) return null;
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) {
      clearPendingConfirmation();
      return null;
    }
    return {
      email: parsed.email,
      returnTo: safeReturnPath(
        typeof parsed.returnTo === "string" ? parsed.returnTo : null,
        fallback,
      ),
      forOrganisation: Boolean(parsed.forOrganisation),
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function clearPendingConfirmation(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
