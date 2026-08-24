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
// — the hosting layer adds it to the response, so no application change can
// remove or configure it, and it offers no opt-out of its own. On load it posts
// a `page_hit` carrying, in full, `window.location.pathname` and
// `window.location.href`.
//
// A share link was `/p/<token>`, and that token is a BEARER CAPABILITY: anyone
// holding it can read the disclosed Passport. So every view of a shared
// Passport copied a working credential into a general analytics event store.
//
// ── WHY A SERVER REDIRECT, AND NOT URL SCRUBBING ───────────────────────
//
// The script is `defer` and sends from a `setTimeout(…, 300)`, which invites a
// client-side `history.replaceState` before the timer fires. That is a race,
// not a fix. What the script does NOT do is fire on client-side navigation: it
// reports FULL PAGE LOADS only. So if the browser never loads a document at a
// URL containing the token, no script on the page can observe it, whatever it
// reads and whenever it runs.
//
// `/p/<token>` is therefore answered in src/server.ts, ahead of the SSR
// handler, with a 302. A 302 has no body, so nothing is injected into it and
// no script runs.
//
// ── WHY THE REDIRECT TARGET IS PER-SHARE AND NOT A CONSTANT ────────────
//
// The first version of this redirected every share to a single constant path
// and stored the token in one cookie named `sp_share`. That closed the
// analytics leak and introduced a worse bug, which a security review caught and
// a two-share reproduction confirmed:
//
//     open Share A   ->  sp_share = <token A>
//     open Share B   ->  sp_share = <token B>     (same name, overwritten)
//     refresh Tab A  ->  resolves SHARE B
//
// One recipient, two links, and the first tab silently starts showing the other
// holder's Passport. A share is addressed to one reader about one person;
// substituting a different person's record is a trust failure well beyond the
// leak the redirect was fixing.
//
// The fix is to make the TAB self-identifying. The redirect target carries a
// per-share NAVIGATION ID, and the cookie is named after it, so two shares
// produce two differently-named cookies that coexist. The server resolves the
// share named by the URL the tab is actually on, so Tab A resolves A however
// many other shares the same browser has open.
//
// ── WHY THE NAVIGATION ID IS A HASH AND NOT A RANDOM VALUE ─────────────
//
// A fresh random id per visit would isolate tabs equally well, but every reopen
// of the same link would mint another cookie, and browsers cap cookies per
// domain — a recipient who checks a link repeatedly would eventually evict
// their own. Deriving the id from the token instead makes reopening idempotent:
// same link, same id, same cookie.
//
// It is `sha256("sp-nav:" + token)`, NOT `sha256(token)`, and the domain
// separator is load-bearing. `sp_disclosures.token_hash` is exactly
// `encode(digest(token,'sha256'),'hex')`, so an undomained hash would put the
// database's stored lookup key straight into the URL bar and into analytics.
// The prefix guarantees the two values can never collide.
//
// The id is one-way and useless alone: it names WHICH share a tab means, and
// authorises nothing. Reading the Passport still requires the cookie, and the
// cookie still carries the real token to the same throttled boundary as before.
//
// ── WHY THE COOKIE IS SCOPED TO THE SERVER-FUNCTION PATH ───────────────
//
// `HttpOnly` stops scripts READING the cookie; it does nothing to stop the
// browser SENDING it. At `Path=/`, the token rode every same-origin request —
// including `/~api/analytics`, the very endpoint this whole design exists to
// keep it away from.
//
// The only thing that needs the token is the disclosure server function, which
// is POSTed to `/_serverFn/<hash>`. So that is the path the cookie is scoped
// to. A capability should travel only to the boundary that validates it.
//
// ── WHAT THIS DELIBERATELY DOES NOT CLAIM ──────────────────────────────
//
// The token is still in the first HTTP request line, so it remains visible to
// the host's own request/edge logs. That is unavoidable for ANY link-borne
// capability — it is what a link is — and it is a different surface, with
// different access, from the product analytics this closes.

import { createHash } from "node:crypto";

/** Where the disclosure server function lives. The cookie is scoped here and
 *  nowhere else, so no other request carries the token. */
export const SHARE_COOKIE_PATH = "/_serverFn";

/** Cookie name for one share. Suffixed with the navigation id so two open
 *  shares hold two cookies rather than overwriting each other. */
export function shareCookieName(navigationId: string): string {
  return `sp_share_${navigationId}`;
}

/** Long enough to read a Passport and reload it, short enough that a shared
 *  machine does not keep a working capability all day. Reopening renews it. */
export const SHARE_COOKIE_MAX_AGE_SECONDS = 1800;

/** A token is 32 random bytes as hex. */
const TOKEN_RE = /^[0-9a-f]{64}$/;
/** A navigation id is the first 32 hex characters of a domain-separated hash.
 *  Deliberately a different LENGTH from a token, so the two can never be
 *  confused by a path matcher. */
const NAV_RE = /^[0-9a-f]{32}$/;

export function isShareToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

export function isNavigationId(value: string): boolean {
  return NAV_RE.test(value);
}

/**
 * The public, per-share identifier a recipient's address bar may hold.
 *
 * One-way, so it grants nothing on its own; stable, so reopening one link does
 * not mint a second cookie; and domain-separated from `sp_disclosures.
 * token_hash`, which is the undomained sha256 of the same token.
 */
export function navigationIdFor(token: string): string {
  return createHash("sha256").update(`sp-nav:${token}`).digest("hex").slice(0, 32);
}

/**
 * The token in `/p/<token>`, or null for anything else — including a path that
 * already carries a navigation id, which must fall through to the page rather
 * than redirect to itself forever.
 */
export function shareTokenFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) return null;
  const candidate = decodeURIComponent(match[1]);
  return isShareToken(candidate) ? candidate : null;
}

/** Where `/p/<token>` sends the browser. Same route, different param: a
 *  navigation id is 32 hex and a token is 64, so this never re-redirects. */
export function shareViewPath(navigationId: string): string {
  return `/p/${navigationId}`;
}

/**
 * The Set-Cookie carrying one share's token to the server function.
 *
 * `Secure` is conditional because a developer stack is plain http, where a
 * Secure cookie is silently dropped and every share link would appear broken
 * for reasons nothing reports. Production is https and always gets it.
 *
 * `SameSite=Lax` because a recipient arrives by following a link from
 * somewhere else — an email, a message, an application — and `Strict` would
 * withhold the cookie on exactly that navigation.
 */
export function buildShareCookie(token: string, secure: boolean): string {
  const parts = [
    `${shareCookieName(navigationIdFor(token))}=${token}`,
    `Path=${SHARE_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SHARE_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * The token this request carries FOR THE SHARE THE TAB IS ON.
 *
 * Keyed by navigation id, which is why two open shares cannot substitute for
 * one another: the browser sends both cookies, and this reads the one the
 * caller's URL names. A caller can only ever name a share whose cookie it
 * already holds, so accepting the id as input grants nothing.
 */
export function shareTokenFromCookieHeader(
  header: string | null | undefined,
  navigationId: string,
): string | null {
  if (!header || !isNavigationId(navigationId)) return null;
  const wanted = shareCookieName(navigationId);
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== wanted) continue;
    const value = pair.slice(eq + 1).trim();
    if (!isShareToken(value)) return null;
    // Belt and braces: the cookie is named after the hash of the token it
    // holds, so a mismatch means the pair was tampered with or crossed. Refuse
    // rather than resolve a share the id does not actually name.
    return navigationIdFor(value) === navigationId ? value : null;
  }
  return null;
}

/**
 * The 302 that moves the token out of the URL and into a per-share cookie.
 *
 * `Cache-Control: no-store` because this response carries a credential in a
 * header; a shared cache holding it would hand one recipient's capability to
 * the next visitor.
 */
export function buildShareRedirect(token: string, secure: boolean): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: shareViewPath(navigationIdFor(token)),
      "Set-Cookie": buildShareCookie(token, secure),
      "Cache-Control": "no-store",
      // A share link is private correspondence; it was already noindex on the
      // page, and the hop says so too rather than relying on the destination.
      "X-Robots-Tag": "noindex, nofollow",
      // Nothing downstream of this response carries the token onward.
      "Referrer-Policy": "no-referrer",
    },
  });
}
