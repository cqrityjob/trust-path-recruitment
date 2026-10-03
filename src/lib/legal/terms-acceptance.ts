import { ACCEPTED_TERMS_VERSION, TERMS_FINAL } from "./status";

// ── WHO STILL HAS TO ACCEPT THE TERMS ───────────────────────────────────
//
// Email signup records acceptance in the signup itself (UnifiedAuthPanel).
// Google cannot carry metadata through the provider round trip, and Google
// from the SIGN-IN page creates an account for a person nobody asked about
// the terms. Both are closed here:
//
//   * Google from the signup page, box ticked: the acceptance is remembered
//     in this tab for the round trip and written to the account on return.
//   * Any account created through a provider that has no recorded
//     acceptance, and any account whose recorded version is not the current
//     one (a draft accepted before the final text, or older terms), is
//     asked by TermsAcceptanceGate before it can use the product.
//
//   * An email account created before the terms existed carries no version.
//     It is asked once the terms are FINAL (owner decision 2026-10-03);
//     asking it to accept a draft would record nothing worth keeping.

const KEY = "cq.termsAccepted";
const MAX_AGE_MS = 30 * 60 * 1000;

type MinimalUser = {
  readonly app_metadata?: { readonly provider?: unknown } | null;
  readonly user_metadata?: { readonly terms_version?: unknown } | null;
};

export function needsTermsAcceptance(
  user: MinimalUser | null | undefined,
  current: { readonly version: string; readonly final: boolean } = {
    version: ACCEPTED_TERMS_VERSION,
    final: TERMS_FINAL,
  },
): boolean {
  if (!user) return false;
  const accepted = user.user_metadata?.terms_version;
  if (typeof accepted === "string" && accepted.length > 0) {
    return accepted !== current.version;
  }
  const provider = user.app_metadata?.provider;
  if (typeof provider === "string" && provider !== "email") return true;
  // An account from before the terms: asked once they are final.
  return current.final && typeof provider === "string";
}

/** The metadata an acceptance writes. */
export function acceptanceMetadata(at: Date = new Date()): {
  terms_version: string;
  terms_accepted_at: string;
} {
  return { terms_version: ACCEPTED_TERMS_VERSION, terms_accepted_at: at.toISOString() };
}

/** Before leaving for Google from the signup page with the box ticked. */
export function rememberTermsAcceptance(): void {
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ version: ACCEPTED_TERMS_VERSION, at: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable: the gate asks after the round trip instead.
  }
}

/** On return: the remembered acceptance, once, if it is this version and
 *  recent; null otherwise. */
export function consumeRememberedAcceptance(): Date | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { version?: unknown; at?: unknown };
    if (v.version !== ACCEPTED_TERMS_VERSION || typeof v.at !== "string") return null;
    const at = new Date(v.at);
    if (Number.isNaN(at.getTime()) || Date.now() - at.getTime() > MAX_AGE_MS) return null;
    return at;
  } catch {
    return null;
  }
}
