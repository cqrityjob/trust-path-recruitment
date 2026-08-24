/**
 * Security Passport — a share token must never reach a rendered document, and
 * two open shares must never resolve to each other.
 *
 * ── DEFECT 1: THE TOKEN WAS IN THE URL ─────────────────────────────────
 *
 * The published site is served with a platform analytics script injected into
 * the HTML by the HOST, not by this repository:
 *
 *     <script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script>
 *
 * On every full page load it posts a `page_hit` carrying `window.location.href`
 * and `window.location.pathname`. Share links were `/p/<token>`, and that token
 * is a bearer capability — so every view of a shared Passport copied a working
 * credential into a general analytics store.
 *
 * ── DEFECT 2: THE FIRST FIX SUBSTITUTED SHARES ─────────────────────────
 *
 * The first version redirected every share to one constant path and stored the
 * token in a single cookie named `sp_share`. Reproduced against a running
 * stack, in one cookie jar:
 *
 *     open Share A   ->  sp_share = <token A>
 *     open Share B   ->  sp_share = <token B>   (same name, overwritten)
 *     refresh Tab A  ->  resolves SHARE B
 *
 * One recipient, two links, and the first tab silently showed the other
 * holder's Passport. So the redirect target now carries a per-share NAVIGATION
 * ID and the cookie is named after it: two shares, two cookies, no collision,
 * and the tab's own URL says which share it means.
 *
 * ── DEFECT 3: THE COOKIE RODE EVERY REQUEST ────────────────────────────
 *
 * `HttpOnly` stops scripts READING a cookie; it does nothing to stop the
 * browser SENDING it. At `Path=/` the token was attached to every same-origin
 * request — including `/~api/analytics`, the exact endpoint the redirect exists
 * to keep it away from. It is now scoped to `/_serverFn`, the only boundary
 * that validates it.
 *
 * Run: bun run passport-share-transport:check
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHARE_COOKIE_PATH,
  buildShareCookie,
  buildShareRedirect,
  isNavigationId,
  isShareToken,
  navigationIdFor,
  shareCookieName,
  shareTokenFromCookieHeader,
  shareTokenFromPath,
  shareViewPath,
} from "../src/lib/security-passport/share-transport";

const ROOT = join(import.meta.dir, "..");

let checks = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  checks += 1;
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

const A = "a".repeat(64);
const B = "b".repeat(64);
const NAV_A = navigationIdFor(A);
const NAV_B = navigationIdFor(B);

console.log("passport-share-transport-check\n");

console.log("GROUP 1 -- a token in the path is recognised, and nothing else is");

assert(shareTokenFromPath(`/p/${A}`) === A, "a 64-hex token is extracted from /p/<token>");
assert(shareTokenFromPath(`/p/${A}/`) === A, "a trailing slash does not hide it");
// The redirect TARGET must never redirect again, or the recipient loops
// forever instead of reading a Passport. A navigation id is 32 hex and a token
// is 64, so the two can never be confused by the path matcher.
assert(
  shareTokenFromPath(shareViewPath(NAV_A)) === null,
  "the redirect target is not itself treated as a token",
);
assert(!isShareToken(NAV_A), "a navigation id can never be mistaken for a token");
for (const path of [
  "/p",
  "/p/",
  "/passport",
  "/p/short",
  `/p/${A}/extra`,
  `/p/${"A".repeat(64)}`,
]) {
  assert(shareTokenFromPath(path) === null, `no token is invented for ${path}`);
}

console.log("\nGROUP 2 -- the navigation id is public, one-way, and NOT the database's key");

assert(isNavigationId(NAV_A), "a navigation id is 32 hex characters");
assert(NAV_A !== NAV_B, "different shares get different ids");
assert(
  navigationIdFor(A) === NAV_A,
  "the same share always gets the same id, so reopening is idempotent",
);
// THE load-bearing one. sp_disclosures.token_hash is
// encode(digest(token,'sha256'),'hex'); an undomained hash would put the
// database's stored lookup key straight into the URL bar and into analytics.
const undomained = createHash("sha256").update(A).digest("hex");
assert(
  !undomained.startsWith(NAV_A) && undomained.slice(0, 32) !== NAV_A,
  "the id is domain-separated from sp_disclosures.token_hash",
);
assert(!NAV_A.includes(A.slice(0, 16)), "the id contains no fragment of the token");

console.log("\nGROUP 3 -- the cookie travels ONLY to the boundary that validates it");

const cookie = buildShareCookie(A, true);
// HttpOnly keeps scripts out. The PATH is what keeps the browser from sending
// it to /~api/analytics, assets and every other same-origin request.
assert(/HttpOnly/.test(cookie), "the cookie is HttpOnly, so no page script can read it");
assert(
  new RegExp(`Path=${SHARE_COOKIE_PATH}(;|$)`).test(cookie),
  `the cookie is scoped to ${SHARE_COOKIE_PATH} and rides no other request`,
);
// Widened deliberately: the constant is a literal type, and comparing it
// directly would be a compile-time tautology rather than a runtime guard.
assert((SHARE_COOKIE_PATH as string) !== "/", "the cookie is NOT scoped to the whole origin");
assert(
  /SameSite=Lax/.test(cookie),
  "SameSite=Lax, so following the link from an email still works",
);
assert(/Max-Age=\d+/.test(cookie), "the cookie expires on its own");
assert(/Secure/.test(cookie), "https gets Secure");
// A developer stack is plain http, where a Secure cookie is silently dropped
// and every share link would look broken for reasons nothing reports.
assert(!/Secure/.test(buildShareCookie(A, false)), "plain http omits Secure so dev still works");
assert(
  cookie.startsWith(`${shareCookieName(NAV_A)}=`),
  "the cookie is NAMED after the share, not a shared global",
);

console.log("\nGROUP 4 -- two open shares cannot substitute for one another");

// The exact reproduction that condemned the single-cookie design: one browser,
// both cookies present, in the order the second one would have overwritten the
// first.
const bothCookies = `${shareCookieName(NAV_A)}=${A}; ${shareCookieName(NAV_B)}=${B}`;
assert(
  shareTokenFromCookieHeader(bothCookies, NAV_A) === A,
  "with both shares open, tab A resolves share A",
);
assert(
  shareTokenFromCookieHeader(bothCookies, NAV_B) === B,
  "with both shares open, tab B resolves share B",
);
assert(
  shareCookieName(NAV_A) !== shareCookieName(NAV_B),
  "the two cookies have different names, so neither overwrites the other",
);
// A tab may only name a share whose cookie it already holds.
assert(
  shareTokenFromCookieHeader(`${shareCookieName(NAV_A)}=${A}`, NAV_B) === null,
  "naming a share you hold no cookie for resolves nothing",
);
// Defence in depth: the cookie is named after the hash of the token it holds,
// so a crossed or tampered pair is refused rather than resolved.
assert(
  shareTokenFromCookieHeader(`${shareCookieName(NAV_A)}=${B}`, NAV_A) === null,
  "a cookie whose token does not match its own name is refused",
);

console.log("\nGROUP 5 -- the redirect carries the token OUT of the URL");

const redirect = buildShareRedirect(A, true);
assert(redirect.status === 302, "the response is a redirect");
assert(
  redirect.headers.get("location") === shareViewPath(NAV_A),
  "it points at the share's navigation id",
);
assert(
  !(redirect.headers.get("location") ?? "").includes(A),
  "the Location header carries no token",
);
// A 302 has no body, so there is nothing for the host to inject a script into.
assert(redirect.body === null, "the redirect has no body, so no script can run on it");
assert(
  redirect.headers.get("cache-control") === "no-store",
  "no shared cache may keep a response that sets a capability",
);
assert(
  (redirect.headers.get("referrer-policy") ?? "").includes("no-referrer"),
  "nothing downstream carries the token onward as a referrer",
);
assert(
  (redirect.headers.get("x-robots-tag") ?? "").includes("noindex"),
  "the hop is noindex, like the page it leads to",
);

console.log("\nGROUP 6 -- malformed, missing and crossed inputs all fail the same way");

assert(shareTokenFromCookieHeader(null, NAV_A) === null, "no cookie header yields no token");
assert(shareTokenFromCookieHeader("", NAV_A) === null, "an empty cookie header yields no token");
assert(
  shareTokenFromCookieHeader(`${shareCookieName(NAV_A)}=not-a-token`, NAV_A) === null,
  "a malformed cookie value is refused before it reaches the database",
);
assert(
  shareTokenFromCookieHeader(`other=1; ${shareCookieName(NAV_A)}=${A}; another=2`, NAV_A) === A,
  "the right cookie is found among unrelated ones",
);
assert(
  shareTokenFromCookieHeader(`sp_share_${NAV_A}x=${A}`, NAV_A) === null,
  "a similarly named cookie is not mistaken for ours",
);
for (const bad of ["", "nope", NAV_A.slice(0, 8), A]) {
  assert(
    shareTokenFromCookieHeader(bothCookies, bad) === null,
    `a malformed navigation id (${bad.slice(0, 10) || "empty"}) resolves nothing`,
  );
}

console.log("\nGROUP 7 -- the wiring cannot be quietly undone");

{
  const server = readFileSync(join(ROOT, "src/server.ts"), "utf8");
  assert(
    server.includes("shareTokenFromPath") && server.includes("buildShareRedirect"),
    "src/server.ts intercepts share tokens ahead of the SSR handler",
  );

  const page = readFileSync(join(ROOT, "src/routes/p.$token.tsx"), "utf8");
  // The param is now a navigation id, so it IS read — but it must be passed as
  // one, never used as a token.
  assert(
    page.includes("token: navigationId"),
    "the recipient page treats its param as a navigation id, not a token",
  );
  assert(
    page.includes("getPublicDisclosureFromCookie"),
    "the recipient page reads its token from the cookie",
  );
  assert(
    !/readDisclosureByToken|getPublicDisclosure\b/.test(page),
    "the page never reaches the token boundary directly",
  );

  const fns = readFileSync(
    join(ROOT, "src/lib/security-passport/public-disclosure.functions.ts"),
    "utf8",
  );
  assert(
    fns.includes("navigationId"),
    "the cookie-backed server function is told which share the tab means",
  );
  // The throttle and the single indistinguishable failure payload are the
  // properties the transport change must not have moved.
  assert(
    fns.includes("readDisclosureByToken"),
    "it still reads through the same throttled server boundary",
  );
  assert(
    (fns.match(/status: "unavailable"/g) ?? []).length >= 2,
    "an absent, malformed or crossed cookie fails into the same payload as a bad token",
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`passport-share-transport-check FAILED (${failures.length} of ${checks}).`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`passport-share-transport-check: ${checks} assertions passed.`);
