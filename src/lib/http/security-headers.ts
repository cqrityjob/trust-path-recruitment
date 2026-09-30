// Baseline security headers for every application response (SSR pages,
// server functions and server routes), applied in src/server.ts.
//
// ── DELIBERATELY CONSERVATIVE ──────────────────────────────────────────
//
// These are the headers that cannot break the app, Supabase Auth or the
// Lovable editor:
//
//   * X-Content-Type-Options: nosniff
//   * Referrer-Policy: strict-origin-when-cross-origin — no path or query
//     (tokens, ids) leaks to other sites
//   * Permissions-Policy — the app uses none of camera, microphone,
//     geolocation or payment
//   * Strict-Transport-Security — HTTPS only; no includeSubDomains/preload,
//     which would be a commitment for every subdomain of the custom domain
//   * CSP `frame-ancestors` ONLY — stops other sites framing admin/employer
//     pages (clickjacking) while still allowing the Lovable editor preview.
//     It restricts nothing else; a full script/style CSP needs a report-only
//     rollout first because the host injects its own scripts.
//
// A header a route already set (the `/p` share entry has its own strict CSP)
// is never overwritten.

const FRAME_ANCESTORS =
  "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com";

const BASELINE: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"],
  ["Content-Security-Policy", FRAME_ANCESTORS],
];

export function withSecurityHeaders(response: Response, https: boolean): Response {
  // A 101 (protocol switch) or an opaque response cannot be rebuilt.
  if (response.status === 101 || response.type === "opaqueredirect") return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of BASELINE) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (https && !headers.has("Strict-Transport-Security")) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
