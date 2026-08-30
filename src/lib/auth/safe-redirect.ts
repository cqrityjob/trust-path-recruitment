// Return-URL (redirect/next) allow-list.
//
// Used by every route that accepts a post-auth redirect destination: the
// unified entrance (/login, /signup), the four compatibility redirects that
// preceded it (/candidate/login, /candidate/register, /employer/login,
// /employer/register) and /auth. Never trust a browser-supplied redirect
// value beyond what this function allows through — this is the concrete
// mitigation for open-redirect and external-navigation abuse, per
// docs/auth/candidate-employer-portal-spec-v1.md §11.

/** Every path that renders or redirects to an authentication surface.
 *  Returning to one after signing in is a loop, never a destination. */
export const AUTH_SURFACES: readonly string[] = [
  "/login",
  "/signup",
  "/auth",
  "/candidate/login",
  "/candidate/register",
  "/employer/login",
  "/employer/register",
  "/admin/login",
  "/reset-password",
];

export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.length > 500) return fallback;
  // Must start with a single "/" — rejects protocol-relative ("//evil.com"),
  // absolute URLs ("https://..."), and anything not path-shaped.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Browsers normalise a backslash to a forward slash in the authority
  // position, so "/\\evil.test" and "/\evil.test" navigate OFF-SITE exactly
  // like "//evil.test". The leading-"//" check above does not see them.
  // Found by scripts/public-assessment-auth-check.ts, not by review.
  if (raw.startsWith("/\\") || raw.startsWith("\\")) return fallback;
  if (raw.includes("\\")) return fallback;
  // Rejects "javascript:", "https://", embedded scheme markers anywhere in
  // the string (defence in depth beyond the leading-character check above).
  if (raw.includes("://")) return fallback;
  // Never redirect back into an auth surface — loop prevention.
  //
  // The list grew when the four portal doors collapsed into one. It is
  // written as a prefix sweep rather than four equality checks because the
  // dangerous forms are the ones with a query string on them: a
  // "/login?redirect=/login?redirect=..." chain is what actually produces
  // the loop, and an equality check does not see it.
  //
  // /candidate/* and /employer/register are themselves redirects ONTO
  // /login now, so returning to one of them is a two-hop loop rather than a
  // one-hop one. Same defect, so the same refusal.
  for (const surface of AUTH_SURFACES) {
    if (raw === surface || raw.startsWith(`${surface}?`) || raw.startsWith(`${surface}/`)) {
      return fallback;
    }
  }
  return raw;
}

/** Split a validated return path into the parts TanStack Router needs.
 *
 *  `navigate({ to })` does not parse a query string out of `to` — passing
 *  "/a/b?x=1" navigates to a literal path containing "?", silently losing
 *  the params. Career Discovery carries its session uuid in the query
 *  string, so the return target must be split before navigating.
 *
 *  Always run the raw value through safeReturnPath FIRST; this function
 *  assumes an already-validated internal path and does not re-check origin. */
export function splitReturnPath(safePath: string): {
  to: string;
  search: Record<string, string>;
} {
  const hashIndex = safePath.indexOf("#");
  const withoutHash = hashIndex === -1 ? safePath : safePath.slice(0, hashIndex);
  const q = withoutHash.indexOf("?");
  if (q === -1) return { to: withoutHash, search: {} };

  const to = withoutHash.slice(0, q);
  const search: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(withoutHash.slice(q + 1))) {
    search[k] = v;
  }
  return { to, search };
}
