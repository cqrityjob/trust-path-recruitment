/**
 * Guard: every application response carries the baseline security headers
 * (src/lib/http/security-headers.ts, applied in src/server.ts), and the
 * helper never overwrites a header a route set itself (the /p share entry's
 * strict CSP) nor adds a script-restricting CSP that would break the host.
 *
 * Run: bun run security-headers:check
 */

import { readFileSync } from "node:fs";
import { withSecurityHeaders } from "../src/lib/http/security-headers";

const failures: string[] = [];
const expect = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg);
};

const server = readFileSync("src/server.ts", "utf8");
expect(
  /return withSecurityHeaders\(\s*await normalizeCatastrophicSsrResponse\(response\)/.test(server),
  "src/server.ts must wrap the SSR handler's response in withSecurityHeaders()",
);

const page = withSecurityHeaders(
  new Response("<p>x</p>", { headers: { "content-type": "text/html" } }),
  true,
);
expect(page.headers.get("x-content-type-options") === "nosniff", "nosniff missing");
expect(
  page.headers.get("referrer-policy") === "strict-origin-when-cross-origin",
  "Referrer-Policy missing",
);
expect(
  /camera=\(\)/.test(page.headers.get("permissions-policy") ?? ""),
  "Permissions-Policy missing",
);
expect(
  (page.headers.get("strict-transport-security") ?? "").startsWith("max-age="),
  "HSTS missing on an https response",
);
const csp = page.headers.get("content-security-policy") ?? "";
expect(
  csp === "frame-ancestors 'self' https://lovable.dev",
  "frame-ancestors CSP must be exactly 'self' plus the Lovable editor",
);
// The E4 evidence scan refuses hosted Lovable backend hostnames in traces,
// and every response header lands in one.
expect(
  !/\.lovable(project|)\.(app|dev)/i.test(csp),
  "the CSP must not name a hosted Lovable backend hostname (the evidence scanners refuse it)",
);
expect(
  !/script-src|default-src|style-src/.test(csp),
  "the baseline CSP must stay frame-ancestors only until a report-only rollout proves a fuller policy",
);

const plain = withSecurityHeaders(new Response("x"), false);
expect(!plain.headers.has("strict-transport-security"), "HSTS must not be sent over plain http");

const own = withSecurityHeaders(
  new Response(null, {
    status: 302,
    headers: { location: "/x", "content-security-policy": "default-src 'none'" },
  }),
  true,
);
expect(
  own.headers.get("content-security-policy") === "default-src 'none'" &&
    own.headers.get("location") === "/x" &&
    own.status === 302,
  "a route's own headers and status must be preserved",
);

const cookies = new Headers();
cookies.append("set-cookie", "a=1");
cookies.append("set-cookie", "b=2");
expect(
  withSecurityHeaders(new Response("x", { headers: cookies }), true).headers.getSetCookie()
    .length === 2,
  "every Set-Cookie header must survive",
);

if (failures.length) {
  console.error(`FAIL: ${failures.length} security-header violation(s)`);
  for (const f of failures) console.error(`  !!  ${f}`);
  process.exit(1);
}
console.log("OK: baseline security headers are applied without overriding route headers.");
