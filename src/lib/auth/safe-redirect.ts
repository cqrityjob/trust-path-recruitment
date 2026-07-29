// Phase H3.1 — return-URL (redirect/next) allow-list.
//
// Used by every route that accepts a post-auth redirect destination
// (/candidate/login, /candidate/register, /employer/login,
// /employer/register, and the /auth compatibility route). Never trust a
// browser-supplied redirect value beyond what this function allows through
// — this is the concrete mitigation for open-redirect and
// external-navigation abuse, per docs/auth/candidate-employer-portal-spec-v1.md §11.

export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.length > 500) return fallback;
  // Must start with a single "/" — rejects protocol-relative ("//evil.com"),
  // absolute URLs ("https://..."), and anything not path-shaped.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Rejects "javascript:", "https://", embedded scheme markers anywhere in
  // the string (defence in depth beyond the leading-character check above).
  if (raw.includes("://")) return fallback;
  // Never redirect back into /auth itself — loop prevention.
  if (raw === "/auth" || raw.startsWith("/auth?") || raw.startsWith("/auth/")) return fallback;
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
