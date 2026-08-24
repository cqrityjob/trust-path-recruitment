/**
 * Security Passport — a share token must never reach a rendered document.
 *
 * ── THE DEFECT THIS DEFENDS ────────────────────────────────────────────
 *
 * The published site is served with a platform analytics script injected into
 * the HTML by the HOST, not by this repository:
 *
 *     <script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script>
 *
 * On every full page load it posts a `page_hit` carrying `window.location.href`
 * and `window.location.pathname`. Share links were `/p/<token>`, and that token
 * is a bearer capability — so every view of a shared Passport copied a working
 * credential into a general analytics store, where anyone who could read
 * analytics could replay it.
 *
 * The fix is transport-only: src/server.ts answers `/p/<token>` with a 302 to a
 * constant `/p/view` and puts the token in an HttpOnly cookie, before any
 * document exists. A 302 has no body, so nothing is injected into it and no
 * script runs. What analytics can observe is therefore a constant that grants
 * nothing.
 *
 * These assertions hold that shape. They are deliberately about the SHAPE of
 * the transport rather than about analytics, because the script is outside this
 * repository and cannot be asserted against — the invariant that survives is
 * "no document is ever served at a URL containing a token".
 *
 * Run: bun run passport-share-transport:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHARE_COOKIE_NAME,
  SHARE_VIEW_PARAM,
  SHARE_VIEW_PATH,
  buildShareCookie,
  buildShareRedirect,
  isShareToken,
  shareTokenFromCookieHeader,
  shareTokenFromPath,
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

const TOKEN = "a".repeat(64);
const OTHER = "b".repeat(64);

console.log("passport-share-transport-check\n");

console.log("GROUP 1 -- a token in the path is recognised, and nothing else is");

assert(shareTokenFromPath(`/p/${TOKEN}`) === TOKEN, "a 64-hex token is extracted from /p/<token>");
assert(shareTokenFromPath(`/p/${TOKEN}/`) === TOKEN, "a trailing slash does not hide it");
// The constant the redirect points AT must never itself redirect, or the
// recipient loops forever instead of reading a Passport.
assert(shareTokenFromPath(SHARE_VIEW_PATH) === null, "the view path is not treated as a token");
assert(!isShareToken(SHARE_VIEW_PARAM), "the view sentinel can never collide with a real token");
for (const path of [
  "/p",
  "/p/",
  "/passport",
  "/p/short",
  `/p/${TOKEN}/extra`,
  `/p/${"A".repeat(64)}`,
]) {
  assert(shareTokenFromPath(path) === null, `no token is invented for ${path}`);
}

console.log("\nGROUP 2 -- the cookie is unreadable by page scripts and unshared by caches");

const cookie = buildShareCookie(TOKEN, true);
// HttpOnly is the property that keeps the token away from ANY script on the
// page, including one the host injects. It is the whole point.
assert(/HttpOnly/.test(cookie), "the cookie is HttpOnly, so no page script can read it");
assert(
  /SameSite=Lax/.test(cookie),
  "SameSite=Lax, so following the link from an email still works",
);
assert(/Path=\/p/.test(cookie), "the cookie is scoped to /p and rides no other request");
assert(/Max-Age=\d+/.test(cookie), "the cookie expires on its own");
assert(/Secure/.test(cookie), "https gets Secure");
// A developer stack is plain http, where a Secure cookie is silently dropped
// and every share link would look broken for reasons nothing reports.
assert(
  !/Secure/.test(buildShareCookie(TOKEN, false)),
  "plain http omits Secure so dev still works",
);

console.log("\nGROUP 3 -- the redirect carries the token OUT of the URL");

const redirect = buildShareRedirect(TOKEN, true);
assert(redirect.status === 302, "the response is a redirect");
assert(
  redirect.headers.get("location") === SHARE_VIEW_PATH,
  "it points at the constant view path, identical for every share",
);
assert(
  !(redirect.headers.get("location") ?? "").includes(TOKEN),
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

console.log("\nGROUP 4 -- the cookie is the ONLY way the page learns a token");

assert(
  shareTokenFromCookieHeader(`${SHARE_COOKIE_NAME}=${TOKEN}`) === TOKEN,
  "the token is read back from the cookie header",
);
assert(
  shareTokenFromCookieHeader(`other=1; ${SHARE_COOKIE_NAME}=${TOKEN}; another=2`) === TOKEN,
  "and found among other cookies",
);
assert(shareTokenFromCookieHeader(null) === null, "no cookie header yields no token");
assert(shareTokenFromCookieHeader("") === null, "an empty cookie header yields no token");
assert(
  shareTokenFromCookieHeader(`${SHARE_COOKIE_NAME}=not-a-token`) === null,
  "a malformed cookie value is refused before it reaches the database",
);
assert(
  shareTokenFromCookieHeader(`sp_share_other=${TOKEN}`) === null,
  "a similarly named cookie is not mistaken for ours",
);
assert(
  shareTokenFromCookieHeader(`${SHARE_COOKIE_NAME}=${OTHER}`) === OTHER,
  "a second share replaces the first rather than merging",
);

console.log("\nGROUP 5 -- the wiring cannot be quietly undone");

{
  const server = readFileSync(join(ROOT, "src/server.ts"), "utf8");
  assert(
    server.includes("shareTokenFromPath") && server.includes("buildShareRedirect"),
    "src/server.ts intercepts share tokens ahead of the SSR handler",
  );

  const page = readFileSync(join(ROOT, "src/routes/p.$token.tsx"), "utf8");
  // Reading the param again would restore the leak the moment anything served
  // a document at the token URL, which is exactly the state this replaced.
  assert(!page.includes("useParams"), "the recipient page never reads the token from the URL");
  assert(
    page.includes("getPublicDisclosureFromCookie"),
    "the recipient page reads its token from the cookie instead",
  );

  const fns = readFileSync(
    join(ROOT, "src/lib/security-passport/public-disclosure.functions.ts"),
    "utf8",
  );
  // No validator, so there is no input a caller could substitute a token into.
  assert(
    /getPublicDisclosureFromCookie[\s\S]*?\.handler\(/.test(fns) &&
      !/getPublicDisclosureFromCookie[\s\S]{0,200}\.validator\(/.test(fns),
    "the cookie-backed server function accepts no caller-supplied token",
  );
  // The throttle and the single indistinguishable failure payload are the
  // properties the transport change must not have moved.
  assert(
    fns.includes("readDisclosureByToken"),
    "it still reads through the same throttled server boundary",
  );
  assert(
    (fns.match(/status: "unavailable"/g) ?? []).length >= 2,
    "an absent or malformed cookie fails into the same payload as a bad token",
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`passport-share-transport-check FAILED (${failures.length} of ${checks}).`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`passport-share-transport-check: ${checks} assertions passed.`);
