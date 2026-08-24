// Security Passport — how a share token reaches the recipient page.
//
// ── THE PROBLEM THIS EXISTS TO SOLVE ───────────────────────────────────
//
// The published site is served with a platform analytics script injected into
// the HTML by the host, not by this application:
//
//     <script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script>
//
// It is absent from the build output and from @lovable.dev/vite-tanstack-config
// — it is added to the response by the hosting layer, so no application change
// can remove or configure it. On load it posts a `page_hit` event carrying, in
// full:
//
//     { "user-agent", locale, location, referrer,
//       pathname: window.location.pathname,
//       href:     window.location.href }
//
// A share link was `/p/<token>`, and that token is a BEARER CAPABILITY: anyone
// holding it can read the disclosed Passport. So every view of a shared
// Passport copied a working credential into a general analytics event store —
// a different retention and access domain from the Passport tables, where
// anyone who can read analytics could replay it.
//
// ── WHY THE FIX IS A SERVER REDIRECT AND NOT URL SCRUBBING ─────────────
//
// The script is `defer` and sends `page_hit` from a `setTimeout(…, 300)`. That
// invites a client-side `history.replaceState` before the timer fires, and that
// is a race, not a fix: it depends on winning a 300ms window in someone else's
// code, on every browser, forever. Scrubbing after the fact is worse still —
// by then the value has already been read.
//
// The script also never fires on client-side navigation. It only reports a
// FULL PAGE LOAD. That is the property this design uses: if the browser never
// loads a document at a URL containing the token, no script on the page can
// observe it, whatever it reads and whenever it runs.
//
// So the token is taken out of the rendered URL entirely, by the server, before
// any HTML exists:
//
//   1. `/p/<token>` is intercepted in src/server.ts, ahead of the SSR handler.
//   2. The server replies 302 to `/p/view` and sets the token in an HttpOnly
//      cookie. A 302 has no body, so nothing is injected into it and no script
//      runs.
//   3. The browser loads `/p/view`. That is the only document that exists, and
//      the only URL analytics can see. It is a constant: identical for every
//      share, for every holder, and it grants nothing on its own.
//
// The cookie is HttpOnly, so page scripts cannot read it either.
//
// ── WHAT THIS DELIBERATELY DOES NOT CLAIM ──────────────────────────────
//
// The token is still in the first HTTP request line, so it is still visible to
// the host's own request/edge logs. That is unavoidable for ANY link-borne
// capability — it is what a link is — and it is a different surface from
// general page analytics, with different access. This module closes the
// analytics path, which is the one that was putting live credentials in front
// of product dashboards. It does not pretend to close request logging.
//
// ── WHY THE COOKIE CARRIES THE TOKEN ITSELF ────────────────────────────
//
// Not an opaque session id, because a session id would need a table to resolve
// — a migration, and a second source of truth about who may read what. The
// token in the cookie means the recipient page re-validates the REAL token on
// every render, through the same throttled server boundary as before, so
// revocation, expiry, rate limiting and the indistinguishable-failure property
// all keep working exactly as they did. Nothing about the trust model moves;
// only the transport does.

/** The path the recipient's browser actually loads. A constant, so the value
 *  analytics records is the same for every share in the product. */
export const SHARE_VIEW_PATH = "/p/view";

/** The `$token` param value at SHARE_VIEW_PATH. Cannot collide with a real
 *  token: tokens are 64 hex characters. */
export const SHARE_VIEW_PARAM = "view";

/** HttpOnly, so no page script — injected or otherwise — can read it. */
export const SHARE_COOKIE_NAME = "sp_share";

/** Long enough to read a Passport and reload it, short enough that a shared
 *  machine does not keep a working capability for the rest of the day. Every
 *  fresh open of the link renews it. */
export const SHARE_COOKIE_MAX_AGE_SECONDS = 1800;

/** A token is 32 random bytes as hex. The same shape the server boundary
 *  already enforces; checked here too so a malformed path is refused before it
 *  becomes a redirect or a cookie. */
const TOKEN_RE = /^[0-9a-f]{64}$/;

export function isShareToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

/**
 * The token in `/p/<token>`, or null for anything else — including
 * SHARE_VIEW_PATH itself, which must fall through to the page rather than
 * redirect to itself forever.
 */
export function shareTokenFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) return null;
  const candidate = decodeURIComponent(match[1]);
  return isShareToken(candidate) ? candidate : null;
}

/**
 * The Set-Cookie value carrying a token to the recipient page.
 *
 * `Secure` is conditional because a developer stack is plain http, where a
 * Secure cookie is silently dropped and every share link would appear broken.
 * Production is https, so production always gets it.
 *
 * `SameSite=Lax` because the recipient arrives by following a link from
 * somewhere else — an email, a message, a job application — and `Strict` would
 * withhold the cookie on exactly that navigation.
 *
 * `Path=/` and NOT `Path=/p`, which was the first attempt and was wrong. The
 * recipient page reads its payload through a server function, and server
 * functions are POSTed to `/_serverFn/<hash>` — a path outside `/p`. A cookie
 * scoped to `/p` is therefore not sent with the very request that needs it, so
 * every share rendered as "This link is not available" while the redirect and
 * the cookie both looked correct. Caught by opening a real share link end to
 * end; nothing else would have found it.
 */
export function buildShareCookie(token: string, secure: boolean): string {
  const parts = [
    `${SHARE_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SHARE_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** The token a request carries, or null. Tolerates the whole Cookie header,
 *  including other cookies and inconsistent spacing. */
export function shareTokenFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== SHARE_COOKIE_NAME) continue;
    const value = pair.slice(eq + 1).trim();
    return isShareToken(value) ? value : null;
  }
  return null;
}

/**
 * The 302 that moves the token out of the URL and into the cookie.
 *
 * `Cache-Control: no-store` because this response carries a credential in a
 * header; a shared cache holding it would hand one recipient's capability to
 * the next visitor.
 */
export function buildShareRedirect(token: string, secure: boolean): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: SHARE_VIEW_PATH,
      "Set-Cookie": buildShareCookie(token, secure),
      "Cache-Control": "no-store",
      // A share link is private correspondence; it was already noindex on the
      // page, and the redirect says so too rather than relying on the hop.
      "X-Robots-Tag": "noindex, nofollow",
      // Nothing downstream of this response should carry the token onward.
      "Referrer-Policy": "no-referrer",
    },
  });
}
