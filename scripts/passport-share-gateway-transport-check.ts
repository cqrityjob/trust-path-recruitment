import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildShareSessionCookie,
  hashShareSecret,
  sessionNavigationIdFor,
  shareSessionFromCookieHeader,
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
  origin.includes("/functions/v1/passport-share#${token}"),
  "new links must carry the durable token in a fragment",
);
expect(
  !/return\s+`[^`]*\/p\/\$\{token\}`/.test(origin),
  "new links must not put the durable token in a Lovable path",
);
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
