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
