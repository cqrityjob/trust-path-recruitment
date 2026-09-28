// Hosted Supabase's HTML restriction, in front of the local stack's functions.
//
// On its default domain, hosted Supabase does not serve an HTML page from an
// Edge Function. Observed on the owner project's
// /functions/v1/passport-share (2026-09-28): the gateway page arrived as
//
//     Content-Type: text/plain
//     Content-Security-Policy: default-src 'none'; sandbox
//     X-Content-Type-Options: nosniff
//
// so the browser showed its source as text and ran none of it. The local
// stack serves the same response as text/html. That is how a gateway page
// passed every local walk and failed for every real recipient.
//
// This proxy applies that rewrite to /functions/v1/ and forwards everything
// else about the response untouched. A walk that opens a gateway link through
// it meets what a recipient meets:
//
//   bun run scripts/local-hosted-functions-proxy.ts 54331 http://127.0.0.1:54321
//
// It listens on loopback and forwards to loopback only. It models the one
// restriction that was observed. It is not a copy of the hosted platform and
// proves nothing else about it; the deployed check is still the owner's.

import http from "node:http";

/** What hosted Supabase sends instead, for a function response that is HTML. */
export const HOSTED_HTML_RESTRICTION = {
  "content-type": "text/plain",
  "content-security-policy": "default-src 'none'; sandbox",
  "x-content-type-options": "nosniff",
} as const;

export function isRestrictedByHostedSupabase(contentType: string | null | undefined): boolean {
  return (contentType ?? "").trim().toLowerCase().startsWith("text/html");
}

/** A function response as hosted Supabase delivers it to a browser. */
export function hostedSupabaseResponse(response: Response): Response {
  if (!isRestrictedByHostedSupabase(response.headers.get("content-type"))) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(HOSTED_HTML_RESTRICTION)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** Starts the proxy; resolves once it is listening. */
export function startHostedFunctionsProxy(listen: number, upstream: string): Promise<http.Server> {
  const target = new URL(upstream);
  if (target.protocol !== "http:" || !LOOPBACK_HOSTS.has(target.hostname)) {
    throw new Error(
      `local-hosted-functions-proxy: upstream must be loopback http, not ${upstream}`,
    );
  }
  const server = http.createServer((req, res) => {
    if (!(req.url ?? "").startsWith("/functions/v1/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end('{"message":"only /functions/v1/ is proxied"}');
      return;
    }
    const forward = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: target.host },
      },
      (answer) => {
        const headers = { ...answer.headers };
        if (isRestrictedByHostedSupabase(headers["content-type"])) {
          Object.assign(headers, HOSTED_HTML_RESTRICTION);
        }
        res.writeHead(answer.statusCode ?? 502, headers);
        answer.pipe(res);
      },
    );
    forward.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`local-hosted-functions-proxy: ${e.message}`);
    });
    req.pipe(forward);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listen, "127.0.0.1", () => resolve(server));
  });
}

if (import.meta.main) {
  const [listen, upstream] = process.argv.slice(2);
  if (!Number(listen) || !upstream) {
    console.error("usage: bun run scripts/local-hosted-functions-proxy.ts <listen> <upstream>");
    process.exit(2);
  }
  await startHostedFunctionsProxy(Number(listen), upstream);
  console.log(
    `local-hosted-functions-proxy: http://127.0.0.1:${listen}/functions/v1/ -> ${upstream}, HTML restricted as hosted`,
  );
}
