// Security Passport — how a share link reaches the recipient, asserted.
//
// Run: bun run passport-share-gateway-transport:check
//
// The entry of a share link used to be an HTML page served by the Supabase
// Edge Function `passport-share`. On the hosted project that page never ran:
// Supabase rewrites HTML from its default domain to
//
//     Content-Type: text/plain
//     Content-Security-Policy: default-src 'none'; sandbox
//     X-Content-Type-Options: nosniff
//
// so a recipient saw the page's source as text (observed on production,
// 2026-09-28). Every local walk had passed, because the local stack does not
// apply that rewrite. scripts/local-hosted-functions-proxy.ts models it, and the checks
// prove that no step of a share depends on Supabase serving a document: the
// entry page is the application's own, and the function answers only with a
// body-less redirect that the rewrite leaves untouched.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildShareEntryPage,
  buildShareSessionCookie,
  buildShareSessionRedirect,
  buildShareUnavailableRedirect,
  hashShareSecret,
  sessionNavigationIdFor,
  shareEntryCsp,
  shareSessionFromCookieHeader,
  shareTokenFromPath,
  SHARE_OPEN_PATH,
} from "../src/lib/security-passport/share-transport";
// The same model the browser walk opens gateway links through, so the
// restriction asserted here and the one a walk meets cannot drift apart.
import { hostedSupabaseResponse, startHostedFunctionsProxy } from "./local-hosted-functions-proxy";

const root = path.resolve(import.meta.dir, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const errors: string[] = [];
let assertions = 0;
function expect(ok: boolean, message: string): void {
  assertions += 1;
  if (!ok) errors.push(message);
}

const edge = read("supabase/functions/passport-share/index.ts");
const server = read("src/server.ts");
const origin = read("src/lib/security-passport/public-origin.ts");
const disclosure = read("src/lib/security-passport/public-disclosure.functions.ts");
const boundary = read("src/lib/security-passport/public-disclosure.server.ts");
const config = read("supabase/config.toml");

/** The source of one top-level function, up to the next top-level item. */
function functionBody(src: string, name: string): string {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return "";
  const ends = ["\nasync function ", "\nfunction ", "\nexport ", "\nconst ", "\n/**"]
    .map((marker) => src.indexOf(marker, at + 1))
    .filter((i) => i > at)
    .sort((a, b) => a - b);
  return src.slice(at, ends[0] ?? src.length);
}

// ── The link ─────────────────────────────────────────────────────────────
expect(
  origin.includes("return `${publicShareOrigin()}${SHARE_ENTRY_PATH}#${token}`;"),
  "new links must carry the durable token in a fragment",
);
expect(
  origin.includes('export const SHARE_ENTRY_PATH = "/p";'),
  "new links must enter on the application's own domain, at /p",
);
expect(
  !/return\s+`[^`]*\/p\/\$\{token\}`/.test(origin),
  "new links must not put the durable token in a Lovable path",
);
expect(
  origin.includes("return `${publicShareGatewayOrigin()}${SHARE_GATEWAY_PATH}#${token}`;") &&
    origin.includes('export const SHARE_GATEWAY_PATH = "/functions/v1/passport-share";'),
  "the gateway form of a link must stay buildable, fragment-carried, to test those links",
);

// ── The entry page, served by the application ────────────────────────────
const entryAt = server.indexOf("pathname === SHARE_ENTRY_PATH");
const openAt = server.indexOf("pathname === SHARE_OPEN_PATH");
const ssrAt = server.indexOf("await getServerEntry()");
expect(
  entryAt > 0 && entryAt < ssrAt,
  "the /p entry must be answered before the SSR handler renders anything",
);
expect(
  openAt > 0 && openAt < ssrAt,
  "the token exchange must be answered before the SSR handler renders anything",
);
expect(
  server.includes('buildShareEntryPage(request.method, randomBytes(16).toString("hex"))'),
  "the /p entry must be built with a fresh nonce on every response",
);

const nonce = "0123456789abcdef0123456789abcdef";
const page = buildShareEntryPage("GET", nonce);
const html = await page.clone().text();
const csp = page.headers.get("content-security-policy") ?? "";
expect(page.status === 200, "GET /p must render the entry page");
expect(
  page.headers.get("content-type") === "text/html; charset=utf-8",
  "the entry page must be served as HTML by the application, which can serve HTML",
);
expect(csp === shareEntryCsp(nonce), "the entry page must carry its own CSP");
expect(csp.includes("default-src 'none'"), "the entry page CSP must deny by default");
expect(
  /script-src 'nonce-[0-9a-f]+'(;|$)/.test(csp) && !/script-src[^;]*'self'/.test(csp),
  "only the page's own nonce'd script may run: not 'self', which admits the host's injected /~flock.js",
);
expect(!csp.includes("unsafe-inline"), "the entry page must never allow inline script by default");
expect(csp.includes("form-action 'self'"), "the entry page may post only to this origin");
expect(csp.includes("base-uri 'none'"), "the entry page must pin its base");
expect(csp.includes("frame-ancestors 'none'"), "the entry page must refuse framing");
expect(!/connect-src/.test(csp), "the entry page may open no connection at all");
const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
expect(
  scripts.length === 1 && scripts[0] === `<script nonce="${nonce}">`,
  "the entry page must carry exactly one script, and it must carry the nonce",
);
expect(html.includes("location.hash.slice(1)"), "the token must be read from the fragment");
const scrubAt = html.indexOf('history.replaceState(null,"",location.pathname)');
const submitAt = html.indexOf("f.submit()");
expect(
  scrubAt > 0 && submitAt > scrubAt,
  "the fragment must be removed before the token leaves the page",
);
expect(
  html.includes("/^[0-9a-f]{64}$/.test(t)") && html.indexOf("/^[0-9a-f]{64}$/.test(t)") < submitAt,
  "only a well-formed token may be sent",
);
expect(
  html.includes(`f.action=${JSON.stringify(SHARE_OPEN_PATH)}`) &&
    html.includes('f.method="POST"') &&
    html.includes('i.name="token"'),
  "the token must travel in a POST body to the exchange, never in a URL",
);
expect(
  !/fetch\(|XMLHttpRequest|location\.(href|assign|replace)\s*[=(]|sendBeacon/.test(html),
  "the entry page must not move the token any other way",
);
expect(
  html.includes('<meta name="referrer" content="no-referrer">'),
  "the entry page must send no Referer",
);
expect(
  page.headers.get("cache-control") === "private, no-store",
  "the entry page must be private and no-store",
);
expect(
  page.headers.get("referrer-policy") === "no-referrer",
  "the entry page must suppress referrers",
);
expect(
  (page.headers.get("x-robots-tag") ?? "").includes("noindex"),
  "the entry page must not be indexed",
);
expect(
  page.headers.get("x-content-type-options") === "nosniff",
  "the entry page must not be sniffed",
);
expect(
  /Delningen är inte tillgänglig/.test(html) && /This share is not available/.test(html),
  "a malformed or missing token must say so, in Swedish and English",
);
const head = buildShareEntryPage("HEAD", nonce);
expect(head.status === 200 && head.body === null, "HEAD /p must answer without a body");
const postedToEntry = buildShareEntryPage("POST", nonce);
expect(
  postedToEntry.status === 405 && postedToEntry.body === null,
  "the /p entry must refuse anything but GET and HEAD",
);
expect(shareTokenFromPath("/p") === null, "/p itself must not read as a legacy path-carried token");
expect(
  shareTokenFromPath(SHARE_OPEN_PATH) === null,
  "the exchange must not read as a legacy path-carried token",
);

// ── The exchange, on the application's server ────────────────────────────
const open = functionBody(server, "openShareRequest");
const posted = functionBody(server, "postedShareSecret");
expect(
  open.includes('postedShareSecret(request, "token")'),
  "the exchange must read the token field",
);
expect(
  posted.includes("contentLength > 2048") &&
    posted.includes("application/x-www-form-urlencoded") &&
    posted.includes('request.method !== "POST"'),
  "the exchange must accept only a small POSTed form",
);
expect(
  open.includes("buildShareSessionRedirect(session") && !open.includes("buildShareCookie("),
  "the browser must receive a separate session, never the durable token as a cookie",
);
expect(open.includes("hashShareSecret(session)"), "only the session's hash may reach storage");
expect(!/console\./.test(open), "the exchange must never log a capability");
const openBoundary = functionBody(boundary, "openShareByToken");
const throttleAt = openBoundary.indexOf("sp_throttle_public_access");
const issueAt = openBoundary.indexOf("sp_share_gateway_issue");
expect(
  throttleAt > 0 && issueAt > throttleAt,
  "a token must pass the shared throttle before it is looked up",
);
const gateAt = openBoundary.indexOf("if (throttle.error || throttle.data === false) return false;");
expect(
  gateAt > throttleAt && gateAt < issueAt,
  "a throttled caller must be refused before the token is looked up, not merely counted",
);
expect(
  openBoundary.includes("_handoff_hash: hashShareSecret(handoff)"),
  "only the handoff hash may reach storage",
);
expect(
  openBoundary.includes("consumeShareHandoff(handoff, sessionHash)"),
  "the issued handoff must be consumed at once into the session",
);

const session = "a".repeat(64);
const nav = sessionNavigationIdFor(session);
const opened = buildShareSessionRedirect(session, true);
expect(opened.status === 303, "an opened share must redirect with 303 after the POST");
expect(
  opened.headers.get("location") === `/p/${nav}`,
  "an opened share must land on the tab's own navigation id, which carries no capability",
);
expect(
  (opened.headers.get("set-cookie") ?? "").startsWith(`sp_session_${nav}=${session};`),
  "an opened share must set the session cookie",
);
expect(
  opened.headers.get("cache-control") === "private, no-store" &&
    opened.headers.get("referrer-policy") === "no-referrer",
  "the exchange's answer must be private, no-store and send no Referer",
);
const refused = buildShareUnavailableRedirect("b".repeat(32));
expect(
  refused.status === 303 &&
    refused.headers.get("set-cookie") === null &&
    refused.headers.get("location") === `/p/${"b".repeat(32)}`,
  "a refused share must land on a navigation id nobody holds a cookie for",
);

// ── The Supabase function: a redirect, never a document ──────────────────
const deno = {
  handler: null as null | ((request: Request) => Response | Promise<Response>),
};
const denoEnv: Record<string, string | undefined> = { PUBLIC_SITE_URL: "https://app.example" };
(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (key: string) => denoEnv[key] },
  serve: (handler: (request: Request) => Response | Promise<Response>) => {
    deno.handler = handler;
  },
};
const edgeModule = path.join(root, "supabase/functions/passport-share/index.ts");
await import(edgeModule);
expect(deno.handler !== null, "the function must register a handler");
if (deno.handler) {
  const gatewayUrl = "https://project.supabase.co/functions/v1/passport-share";
  // Before the owner confirms the site answers /p: no redirect at all. A site
  // published before this change renders its own page at /p, where the host's
  // analytics would report the address, fragment and all.
  for (const unconfirmed of [undefined, "", "0", "true", "yes"]) {
    denoEnv.PASSPORT_SHARE_ENTRY_PUBLISHED = unconfirmed;
    for (const method of ["GET", "HEAD"]) {
      const early = await deno.handler(new Request(gatewayUrl, { method }));
      expect(
        early.status === 503 &&
          early.headers.get("location") === null &&
          early.body === null &&
          early.headers.get("cache-control") === "private, no-store",
        `a link must be refused until the owner confirms the entry is published (${method}, ${JSON.stringify(unconfirmed)})`,
      );
    }
  }
  denoEnv.PASSPORT_SHARE_ENTRY_PUBLISHED = "1";
  const get = await deno.handler(new Request(gatewayUrl));
  expect(get.status === 302, "the function must answer a link with a redirect");
  expect(
    get.headers.get("location") === "https://app.example/p",
    "the function must redirect to the application's /p entry exactly",
  );
  expect(
    !(get.headers.get("location") ?? "").includes("#"),
    "the redirect must set no fragment, so the browser keeps the one it followed",
  );
  expect(get.body === null, "the function's redirect must have no body");
  expect(
    !(get.headers.get("content-type") ?? "").includes("html"),
    "the function must never serve HTML: hosted Supabase shows it as text",
  );
  const hosted = hostedSupabaseResponse(get);
  expect(
    hosted.status === 302 && hosted.headers.get("location") === "https://app.example/p",
    "the redirect must survive hosted Supabase's HTML rewrite unchanged",
  );
  expect(
    get.headers.get("cache-control") === "private, no-store" &&
      get.headers.get("referrer-policy") === "no-referrer",
    "the function's redirect must be private, no-store and send no Referer",
  );
  const headReq = await deno.handler(new Request(gatewayUrl, { method: "HEAD" }));
  expect(headReq.status === 302, "HEAD on the function must redirect too");
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const other = await deno.handler(new Request(gatewayUrl, { method }));
    expect(
      other.status === 405 && other.body === null,
      `the function must refuse ${method}: it no longer exchanges anything`,
    );
  }
}
expect(
  !/text\/html/.test(edge) && !/<script|<html/i.test(edge),
  "the function source must contain no HTML page at all",
);
expect(
  edge.includes('parsed.protocol === "https:" ? parsed.origin : fallback'),
  "a non-https site setting must fall back to the production origin",
);
expect(
  !edge.includes("console.log") && !edge.includes("console.error"),
  "the function must never log",
);
expect(
  config.includes("[functions.passport-share]\nverify_jwt = false"),
  "a link must reach the function without a Supabase JWT",
);

// The model itself: what the hosted platform does to a page, which is why
// none of the above may be one.
const modelled = hostedSupabaseResponse(
  new Response("<!doctype html><p>x</p>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }),
);
expect(
  modelled.headers.get("content-type") === "text/plain" &&
    modelled.headers.get("content-security-policy") === "default-src 'none'; sandbox" &&
    modelled.headers.get("x-content-type-options") === "nosniff",
  "the hosted restriction model must match what production returned",
);

// And over real HTTP, through the proxy the browser walk uses: the function's
// answer passes the restriction untouched, while a page -- what the function
// used to serve -- arrives as the text a recipient saw.
if (deno.handler) {
  const handler = deno.handler;
  const { createServer } = await import("node:http");
  const upstream = createServer(async (req, res) => {
    const answer =
      req.url === "/functions/v1/passport-share"
        ? await handler(new Request(`http://upstream${req.url}`, { method: req.method }))
        : new Response("<!doctype html><title>gateway</title><p>Öppnar…</p>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
    const headers: Record<string, string> = {};
    answer.headers.forEach((value, name) => (headers[name] = value));
    res.writeHead(answer.status, headers);
    res.end(answer.body ? Buffer.from(await answer.arrayBuffer()) : undefined);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (upstream.address() as { port: number }).port;
  const proxy = await startHostedFunctionsProxy(0, `http://127.0.0.1:${upstreamPort}`);
  const proxied = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  try {
    denoEnv.PASSPORT_SHARE_ENTRY_PUBLISHED = undefined;
    const early = await fetch(`${proxied}/functions/v1/passport-share`, { redirect: "manual" });
    expect(
      early.status === 503 &&
        early.headers.get("location") === null &&
        (await early.arrayBuffer()).byteLength === 0,
      "through the hosted restriction, an unconfirmed entry must refuse a link with no body",
    );
    denoEnv.PASSPORT_SHARE_ENTRY_PUBLISHED = "1";
    const link = await fetch(`${proxied}/functions/v1/passport-share`, { redirect: "manual" });
    expect(
      link.status === 302 &&
        link.headers.get("location") === "https://app.example/p" &&
        (await link.arrayBuffer()).byteLength === 0,
      "through the hosted restriction, a gateway link must still redirect to /p, with no body",
    );
    const page = await fetch(`${proxied}/functions/v1/a-page`);
    const text = await page.text();
    expect(
      page.status === 200 &&
        page.headers.get("content-type") === "text/plain" &&
        page.headers.get("content-security-policy") === "default-src 'none'; sandbox" &&
        page.headers.get("x-content-type-options") === "nosniff" &&
        text.startsWith("<!doctype html>"),
      "the proxy must deliver a function's page as hosted Supabase does: as text, sandboxed",
    );
    const other = await fetch(`${proxied}/rest/v1/sp_claims`);
    expect(other.status === 404, "the proxy must forward functions only");
  } finally {
    proxy.close();
    upstream.close();
  }
}

// ── Reads, and the session cookie ────────────────────────────────────────
expect(
  disclosure.includes("shareSessionFromCookieHeader"),
  "recipient reads must prefer the session",
);
expect(
  disclosure.includes("shareTokenFromCookieHeader"),
  "legacy /p/<token> links must remain readable",
);
expect(/^[0-9a-f]{32}$/.test(nav), "session navigation id must be 32 lowercase hex characters");
expect(hashShareSecret(session).length === 64, "stored session hash must be full sha256");
const cookie = buildShareSessionCookie(session, true);
expect(
  cookie.startsWith(`sp_session_${nav}=${session};`),
  "session cookie must be keyed to its navigation id",
);
expect(
  cookie.includes("Path=/_serverFn"),
  "session cookie must not ride analytics or page requests",
);
expect(
  cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Lax"),
  "production session cookie flags must be complete",
);
expect(
  shareSessionFromCookieHeader(cookie, nav) === session,
  "the matching session cookie must resolve",
);
expect(
  shareSessionFromCookieHeader(cookie, "b".repeat(32)) === null,
  "a different tab id must not substitute a session",
);
expect(
  shareSessionFromCookieHeader(`sp_session_${nav}=${"b".repeat(64)}`, nav) === null,
  "a tampered cookie must fail closed",
);

if (errors.length) {
  console.error("passport-share-gateway-transport-check FAILED");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`passport-share-gateway-transport-check: ${assertions} assertions passed`);
