import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildShareEntryRedirect,
  buildShareSessionCookie,
  hashShareSecret,
  sessionNavigationIdFor,
  shareSessionFromCookieHeader,
  shareTokenFromPath,
} from "../src/lib/security-passport/share-transport";

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
const config = read("supabase/config.toml");

expect(
  origin.includes("return `${publicShareOrigin()}${SHARE_ENTRY_PATH}#${token}`;"),
  "new links must carry the durable token in a fragment",
);
expect(
  origin.includes('export const SHARE_ENTRY_PATH = "/p";'),
  "new links must enter on the application's own domain, at /p",
);
expect(
  origin.includes("return `${publicShareGatewayOrigin()}${SHARE_GATEWAY_PATH}#${token}`;") &&
    origin.includes('export const SHARE_GATEWAY_PATH = "/functions/v1/passport-share";'),
  "the gateway form of a link must stay buildable, fragment-carried",
);
expect(
  !/return\s+`[^`]*\/p\/\$\{token\}`/.test(origin),
  "new links must not put the durable token in a Lovable path",
);
// The application-domain entry: answered before any page, with no body.
const entryAt = server.indexOf("pathname === SHARE_ENTRY_PATH");
expect(
  entryAt > 0 && entryAt < server.indexOf("await getServerEntry()"),
  "the /p entry must be answered before the SSR handler renders anything",
);
expect(
  server.includes("buildShareEntryRedirect(") &&
    server.includes("`${publicShareGatewayOrigin()}${SHARE_GATEWAY_PATH}`"),
  "the /p entry must forward to the gateway's own entry, with no fragment of its own",
);
const gatewayEntry = "https://gateway.example/functions/v1/passport-share";
const forward = buildShareEntryRedirect("GET", gatewayEntry);
expect(forward.status === 302, "GET /p must redirect");
expect(forward.body === null, "the /p redirect must have no body: nothing to inject a script into");
expect(
  forward.headers.get("location") === gatewayEntry,
  "the /p redirect must go to the gateway entry exactly",
);
expect(
  !(forward.headers.get("location") ?? "").includes("#"),
  "the /p redirect must not set a fragment, so the browser keeps the one it followed",
);
expect(
  forward.headers.get("cache-control") === "private, no-store",
  "the /p redirect must be private and no-store",
);
expect(
  forward.headers.get("referrer-policy") === "no-referrer",
  "the /p redirect must suppress referrers",
);
expect(
  (forward.headers.get("x-robots-tag") ?? "").includes("noindex"),
  "the /p redirect must not be indexed",
);
const posted = buildShareEntryRedirect("POST", gatewayEntry);
expect(
  posted.status === 405 && posted.headers.get("location") === null && posted.body === null,
  "the /p entry must refuse anything but GET and HEAD",
);
expect(shareTokenFromPath("/p") === null, "/p itself must not read as a legacy path-carried token");
expect(
  edge.includes("history.replaceState(null,''"),
  "the fragment must be scrubbed before the exchange",
);
expect(
  edge.includes("location.hash.slice(1)"),
  "the gateway must read the capability from the fragment",
);
expect(
  edge.includes("sp_share_gateway_issue"),
  "the edge must issue a server-validated one-time handoff",
);
expect(
  edge.includes("_handoff_hash: await sha256(handoff)"),
  "only the handoff hash may reach storage",
);
expect(
  !edge.includes("console.log") && !edge.includes("console.error"),
  "the edge must never log a capability",
);
expect(
  edge.includes("contentLength > 1024"),
  "the public edge must bound request bodies before parsing",
);
expect(
  edge.includes('"Cache-Control": "private, no-store"'),
  "gateway responses must be private and no-store",
);
expect(
  edge.includes('"Referrer-Policy": "no-referrer"'),
  "gateway responses must suppress referrers",
);
expect(edge.includes("frame-ancestors 'none'"), "the entry page must refuse framing");
expect(
  edge.includes("form-action ${SITE_ORIGIN}"),
  "the entry page must restrict form submission to Lovable",
);
expect(
  !edge.includes("script-src 'unsafe-inline'"),
  "the entry page must use a per-response script nonce",
);
expect(
  config.includes("[functions.passport-share]\nverify_jwt = false"),
  "fragment entry must use custom bearer validation, not Supabase JWT verification",
);
expect(
  server.includes("sp_share_gateway_consume") || server.includes("consumeShareHandoff"),
  "Lovable must consume the one-time handoff server-side",
);
expect(
  server.includes("buildShareSessionCookie"),
  "Lovable must set a short-lived HttpOnly session cookie",
);
expect(
  server.includes("contentLength > 2048"),
  "Lovable must bound handoff request bodies before parsing",
);
expect(
  disclosure.includes("shareSessionFromCookieHeader"),
  "recipient reads must prefer the gateway session",
);
expect(
  disclosure.includes("shareTokenFromCookieHeader"),
  "legacy links must remain readable during transition",
);

const session = "a".repeat(64);
const nav = sessionNavigationIdFor(session);
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
