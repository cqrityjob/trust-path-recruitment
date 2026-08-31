// Preserving the post-login destination across an OAuth redirect.
//
// ── THE DEFECT ─────────────────────────────────────────────────────────
//
// PortalAuthForm resolves the intended destination from `?redirect=` and
// navigates there via goToDestination(). That works for email/password, where
// the page never unloads.
//
// OAuth is different: the browser leaves the app entirely, hits the provider,
// and comes back on a fresh document. The auth form is no longer mounted, so
// goToDestination() never runs, and nothing else read a stored destination. The
// candidate landed on whatever `redirect_uri` pointed at — the bare origin —
// regardless of where they were trying to go.
//
// This is the same defect class as the empty-`?session=` dead end: a return
// path lost across an auth hop. That one lost a query string; this one loses
// the whole path.
//
// ── THE FIX, IN TWO INDEPENDENT LAYERS ─────────────────────────────────
//
// 1. `redirect_uri` carries the destination, so a broker that honours it
//    returns the candidate straight to the right route. Primary mechanism.
//
// 2. The destination is ALSO stashed in sessionStorage before leaving, and
//    consumed on return. This covers a broker that normalises `redirect_uri`
//    back to the origin — which is exactly the failure that was observed, so
//    layer 1 alone would be trusting the thing that broke.
//
// Both layers validate through safeReturnPath, so neither can be turned into
// an open redirect by a crafted `?redirect=` value.
//
// sessionStorage, not localStorage: the value is meaningless after the tab
// closes and must not outlive the attempt.

import { safeReturnPath } from "./safe-redirect";

const KEY = "cqj:auth:oauth-return:v1";

/** Records where to land after OAuth. Validated before storing, so a hostile
 *  `?redirect=` can never be persisted, let alone navigated to. */
export function rememberOAuthReturn(rawPath: string, fallback: string): string {
  const safe = safeReturnPath(rawPath, fallback);
  try {
    window.sessionStorage.setItem(KEY, safe);
  } catch {
    // Private-browsing or storage-disabled. Layer 1 still applies, and a
    // failure to remember must never block a sign-in attempt.
  }
  return safe;
}

/**
 * Reads and CLEARS the stored destination.
 *
 * Clearing on read is deliberate: a stale return path surviving a later,
 * unrelated visit would silently teleport the candidate mid-session.
 * Re-validated on the way out — storage is not a trust boundary.
 */
export function consumeOAuthReturn(): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const safe = safeReturnPath(raw, "");
    return safe === "" ? null : safe;
  } catch {
    return null;
  }
}

/** Discards any pending destination without navigating. Used when an attempt
 *  fails, so the next attempt cannot inherit it. */
export function clearOAuthReturn(): void {
  try {
    window.sessionStorage.removeItem(KEY);
    window.sessionStorage.removeItem(ORG_KEY);
  } catch {
    /* nothing to clear */
  }
}

// ── THE ORGANISATION INTENT, ACROSS THE SAME HOP ───────────────────────
//
// Registering with email and password carries the company name into auth
// user metadata through signUp's `options.data`. Google has no equivalent:
// `signInWithOAuth` takes no metadata, the browser leaves the application,
// and the account that comes back knows only what the provider said. So
// somebody who ticked "I am creating this account for an organisation",
// typed their company name and then chose Google lost the name entirely
// and was handed the manual onboarding form to type it again.
//
// The destination already survives this hop, by exactly this mechanism.
// The two strings ride alongside it, under their own key, and are applied
// to the person's own metadata on return.
//
// sessionStorage for the same reason as the return path: the value is
// meaningless once the tab closes and must not outlive the attempt.

const ORG_KEY = "cqj:auth:oauth-org-intent:v1";

export type PendingOrganisationIntent = {
  readonly companyName: string;
  readonly companyCountry: string;
};

/** Records the organisation intent before leaving for the provider. Both
 *  values are required, mirroring the server's own predicate: a name with
 *  no country cannot be provisioned, so storing it would only produce a
 *  guaranteed failure later. */
export function rememberOrganisationIntent(intent: PendingOrganisationIntent): void {
  const companyName = intent.companyName.trim();
  const companyCountry = intent.companyCountry.trim();
  if (!companyName || !companyCountry) return;
  try {
    window.sessionStorage.setItem(ORG_KEY, JSON.stringify({ companyName, companyCountry }));
  } catch {
    // Private browsing, or storage disabled. The person still gets a working
    // account and the onboarding form; losing a convenience must never block
    // a sign-in attempt.
  }
}

/**
 * Reads and CLEARS the stored organisation intent.
 *
 * Cleared on read for the same reason as the destination: a value left
 * behind by an abandoned attempt must not attach itself to an unrelated
 * sign-in later in the same tab.
 *
 * Length limits mirror `create_my_employer_company`'s own validation, so a
 * value that could only be rejected by the database is discarded here
 * rather than written to metadata first.
 */
export function consumeOrganisationIntent(): PendingOrganisationIntent | null {
  try {
    const raw = window.sessionStorage.getItem(ORG_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(ORG_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { companyName, companyCountry } = parsed as Record<string, unknown>;
    if (typeof companyName !== "string" || typeof companyCountry !== "string") return null;
    const name = companyName.trim();
    const country = companyCountry.trim();
    if (!name || name.length > 200) return null;
    if (!country || country.length > 100) return null;
    return { companyName: name, companyCountry: country };
  } catch {
    return null;
  }
}

/**
 * Absolute URL to hand the OAuth provider.
 *
 * Built from the CURRENT origin, never from configuration, so preview and
 * production each return to themselves with no environment-specific value to
 * keep in sync. The path is the validated internal destination.
 */
export function oauthRedirectUri(safePath: string): string {
  return `${window.location.origin}${safePath}`;
}

/**
 * A sanitised, user-facing message for a failed OAuth attempt.
 *
 * Raw provider, Supabase and Lovable errors are never surfaced: they leak
 * infrastructure detail and read as a crash rather than something the
 * candidate can act on. The real error still reaches the console for
 * debugging, which is where it belongs.
 */
export function oauthErrorMessage(lang: "sv" | "en"): string {
  return lang === "sv"
    ? "Inloggningen med Google kunde inte slutföras. Försök igen, eller logga in med e-post och lösenord."
    : "Google sign-in could not be completed. Please try again, or sign in with your email and password.";
}
