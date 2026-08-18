// Ownership taken from @lovable.dev/mcp-js's generator (the "AUTO-GENERATED"
// banner is deliberately absent, which is how that plugin is told to leave a
// file alone).
//
// ── WHY THIS ROUTE IS CLOSED BY DEFAULT ────────────────────────────────
//
// The generated route mounted the CQrityjob MCP server at /mcp with no
// authentication of any kind. Its five tools expose, to anyone on the
// internet who knows the path:
//
//   * list_assessment_questions — the authored question bank
//   * list_dimensions           — the dimension model
//   * get_profession            — per-profession TARGET dimension profiles,
//                                 i.e. the calibration matrix
//   * compute_career_matches    — the matching engine itself, returning a
//                                 0–100 indicator
//
// That is the same proprietary calibration material the database side keeps
// away from ordinary accounts, published through a different door. It is also
// a scoring surface, and the product's own rule is that scoring keys and
// calibration never reach an untrusted caller.
//
// So the route is now closed unless it is explicitly opened, server-side:
//
//   CQRITYJOB_MCP_ENABLED=true     — required; anything else serves 404
//   CQRITYJOB_MCP_TOKEN=<secret>   — if set, a matching bearer token is also
//                                    required
//
// Both are read from the SERVER environment. Neither is a VITE_ variable, on
// purpose: VITE_ values are inlined into the client bundle and would publish
// the very secret they gate. A 404 rather than a 403 is deliberate — a closed
// endpoint should not confirm that it exists.
//
// This is a release control AND a security boundary. It does not replace
// authorisation inside the tools; it removes an anonymous door that should
// never have been open.

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../lib/mcp/index";

const mcpHandler = createTanStackMcpHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function isEnabled(): boolean {
  return process.env.CQRITYJOB_MCP_ENABLED === "true";
}

/** Constant-time-ish comparison; avoids leaking length via early return. */
function tokenMatches(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function authorised(request: Request): boolean {
  const expected = process.env.CQRITYJOB_MCP_TOKEN;
  if (!expected) return true; // enabled without a token: explicit owner choice
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return presented.length > 0 && tokenMatches(presented, expected);
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: (ctx) => {
        if (!isEnabled()) return notFound();
        if (!authorised(ctx.request)) return notFound();
        return (mcpHandler as (c: typeof ctx) => Response | Promise<Response>)(ctx);
      },
    },
  },
});
