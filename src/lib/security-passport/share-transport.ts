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
// ── HOW A LINK ENTERS NOW ──────────────────────────────────────────────
//
// New links are `/p#<token>` on this application's domain (public-origin.ts).
// The browser requests `GET /p` and nothing else; the page it receives
// (buildShareEntryPage, below) removes the fragment at once and POSTs the token
// to SHARE_OPEN_PATH, where src/server.ts exchanges it -- throttled, through
// the reviewed gateway RPCs -- for a separate 30-minute session. The durable
// token is never in an HTTP request URL, never in a cookie and never in a
// Referer.
//
// ── LEGACY LINKS ───────────────────────────────────────────────────────
//
// Two older shapes still reach this boundary:
//
//   * `/p/<token>`, handled by the redirect below. It still protects those
//     links from page analytics, but their first request can remain visible
//     to the host's edge logs. Do not use it to build a new link.
//   * `<supabase>/functions/v1/passport-share#<token>`, the gateway links. The
//     function now answers with a body-less redirect to `/p`, which the browser
//     follows with the fragment re-attached. Only once that function version is
//     deployed; the version it replaces served an HTML page that hosted
//     Supabase shows as plain text.

import { createHash } from "node:crypto";

/** Where the disclosure server function lives. The cookie is scoped here and
 *  nowhere else, so no other request carries the token. */
export const SHARE_COOKIE_PATH = "/_serverFn";
export const SHARE_HANDOFF_PATH = "/p/handoff";
/** Where the `/p` entry page POSTs the token it read from the fragment. */
export const SHARE_OPEN_PATH = "/p/open";

/** Cookie name for one share. Suffixed with the navigation id so two open
 *  shares hold two cookies rather than overwriting each other. */
export function shareCookieName(navigationId: string): string {
  return `sp_share_${navigationId}`;
}

export function shareSessionCookieName(navigationId: string): string {
  return `sp_session_${navigationId}`;
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

export function sessionNavigationIdFor(session: string): string {
  return createHash("sha256").update(`sp-session-nav:${session}`).digest("hex").slice(0, 32);
}

export function hashShareSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
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

export function buildShareSessionCookie(session: string, secure: boolean): string {
  const navigationId = sessionNavigationIdFor(session);
  const parts = [
    `${shareSessionCookieName(navigationId)}=${session}`,
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

export function shareSessionFromCookieHeader(
  header: string | null | undefined,
  navigationId: string,
): string | null {
  if (!header || !isNavigationId(navigationId)) return null;
  const wanted = shareSessionCookieName(navigationId);
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1 || pair.slice(0, eq).trim() !== wanted) continue;
    const value = pair.slice(eq + 1).trim();
    if (!isShareToken(value)) return null;
    return sessionNavigationIdFor(value) === navigationId ? value : null;
  }
  return null;
}

/**
 * The privacy headers of every hop between a share link and the recipient's
 * view. The legacy `/p/<token>` redirect and the `/p` entry below both answer
 * with exactly these, from this one definition, so the two cannot drift.
 */
const SHARE_HOP_HEADERS = {
  "Cache-Control": "private, no-store",
  // A share link is private correspondence; it was already noindex on the
  // page, and the hop says so too rather than relying on the destination.
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  // Nothing downstream of these responses carries the token onward.
  "Referrer-Policy": "no-referrer",
} as const;

/**
 * The 302 that moves the token out of the URL and into a per-share cookie.
 *
 * `Cache-Control: private, no-store` because this response carries a
 * credential in a header. `no-store` already forbids storing it; `private`
 * additionally names the response as belonging to one user, which is what a
 * shared cache reads first. Belt and braces on the one hop that hands over a
 * capability -- a shared cache holding it would give one recipient's Passport
 * to the next visitor.
 *
 * `noarchive` joins `noindex, nofollow` because the first two govern indexing
 * and link-following; they do not stop a crawler that already fetched the URL
 * from offering a cached copy. A share link is private correspondence, and a
 * cached copy of a redirect that sets a capability is the same leak by a
 * slower route.
 */
export function buildShareRedirect(token: string, secure: boolean): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: shareViewPath(navigationIdFor(token)),
      "Set-Cookie": buildShareCookie(token, secure),
      ...SHARE_HOP_HEADERS,
    },
  });
}

/**
 * The CSP of the `/p` entry page: its own nonce'd script and style, a form
 * that may only post to this origin, and nothing else -- no connection, no
 * image, no frame, no other script.
 *
 * `script-src` names the nonce and NOT `'self'`. The script the host injects
 * into every HTML response is same-origin (`/~flock.js`, see the top of this
 * file), so `'self'` would let it run on the one page whose address holds the
 * token. Without the nonce it cannot run at all, and `default-src 'none'`
 * leaves it nowhere to report to even if it could.
 */
export function shareEntryCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * The document at `/p`. It does three things, in this order, and renders two
 * sentences while it does them:
 *
 *   1. reads the token from the fragment;
 *   2. removes the fragment from the address bar and the history entry, before
 *      anything else can run -- this executes while the page is still being
 *      parsed, ahead of any deferred script;
 *   3. POSTs the token to SHARE_OPEN_PATH in a form, so it travels in a
 *      request BODY: never a path, a query string or a Referer.
 *
 * Bilingual because the recipient's language is not known until the share is
 * read; the recipient page itself is in the language the holder chose.
 */
function shareEntryDocument(nonce: string): string {
  const script = [
    "(function(){",
    'var sv=document.getElementById("sv"),en=document.getElementById("en");',
    "var t=location.hash.slice(1);",
    'history.replaceState(null,"",location.pathname);',
    "if(!/^[0-9a-f]{64}$/.test(t)){",
    'sv.textContent="Delningen är inte tillgänglig.";',
    'en.textContent="This share is not available.";',
    "return;}",
    'var f=document.createElement("form");f.method="POST";',
    `f.action=${JSON.stringify(SHARE_OPEN_PATH)};`,
    'var i=document.createElement("input");i.type="hidden";i.name="token";i.value=t;',
    "f.appendChild(i);document.body.appendChild(f);f.submit();",
    "})();",
  ].join("");
  return [
    "<!doctype html>",
    '<html lang="sv"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow, noarchive">',
    '<meta name="referrer" content="no-referrer">',
    "<title>Security Passport</title>",
    `<style nonce="${nonce}">`,
    "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f8fa;color:#0e1a2b;",
    'font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    "main{max-width:32rem;padding:24px;text-align:center}p{margin:.25rem 0}.en{color:#4f607a}",
    "</style></head><body><main>",
    '<p id="sv">Öppnar den delade Security Passport…</p>',
    '<p id="en" class="en" lang="en">Opening the shared Security Passport…</p>',
    "<noscript><p>Aktivera JavaScript för att öppna delningen.</p>",
    '<p class="en" lang="en">Enable JavaScript to open this share.</p></noscript>',
    `</main><script nonce="${nonce}">${script}</script></body></html>`,
  ].join("");
}

/**
 * The answer to `GET /p`, the entry of every new share link (`/p#<token>`).
 *
 * ── WHY THIS DOCUMENT IS SERVED HERE, AND NOT BY THE GATEWAY ───────────
 *
 * The entry used to be a Supabase Edge Function page. Hosted Supabase does not
 * serve HTML from its default domain: it rewrites such a response to
 * `Content-Type: text/plain` with `Content-Security-Policy: default-src
 * 'none'; sandbox` and `X-Content-Type-Options: nosniff`, so a recipient saw
 * the page's source as text and nothing ran. The local stack does not apply
 * that rewrite, which is why every local walk passed while production failed.
 * The application's own host serves HTML, so the entry lives here.
 *
 * What made the gateway page safe is kept, and each property is asserted in
 * scripts/passport-share-gateway-transport-check.ts:
 *
 *   * the token is only ever in the fragment, which no request carries;
 *   * the fragment is removed before any other script could run, and the CSP
 *     above means no other script CAN run on this page -- the host's
 *     injected analytics included;
 *   * the token leaves the browser once, in a POST body, to the throttled
 *     exchange behind SHARE_OPEN_PATH, which turns it into a separate
 *     30-minute session and never echoes it;
 *   * the response is private, no-store, noindex and sends no Referer.
 */
export function buildShareEntryPage(method: string, nonce: string): Response {
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...SHARE_HOP_HEADERS, Allow: "GET, HEAD" },
    });
  }
  return new Response(method === "HEAD" ? null : shareEntryDocument(nonce), {
    status: 200,
    headers: {
      ...SHARE_HOP_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": shareEntryCsp(nonce),
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    },
  });
}

/**
 * Where a share lands when it cannot be opened: a navigation id nobody holds a
 * cookie for, so the recipient page renders the same "not available" state a
 * revoked, expired, guessed or throttled link does. Deliberately
 * indistinguishable, as everywhere else on this boundary.
 */
export function buildShareUnavailableRedirect(unavailableId: string): Response {
  return new Response(null, {
    status: 303,
    headers: { ...SHARE_HOP_HEADERS, Location: shareViewPath(unavailableId) },
  });
}

/** The one-way end of an exchange: the session cookie, and the tab's own view. */
export function buildShareSessionRedirect(session: string, secure: boolean): Response {
  return new Response(null, {
    status: 303,
    headers: {
      ...SHARE_HOP_HEADERS,
      Location: shareViewPath(sessionNavigationIdFor(session)),
      "Set-Cookie": buildShareSessionCookie(session, secure),
    },
  });
}
