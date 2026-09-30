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
//   CQRITYJOB_MCP_TOKEN=<secret>   — required too (at least 16 characters);
//                                    a matching bearer token must be sent
//
// The same gate (src/lib/mcp/access.ts) guards the side routes the SDK also
// mounts — /.mcp/list-tools, /.mcp/invoke-tool/$tool and the
// /.well-known/oauth-protected-resource document — which used to answer
// anonymously even while this route was closed.
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

import { mcpAccessDenied } from "../lib/mcp/access";
import mcp from "../lib/mcp/index";

const mcpHandler = createTanStackMcpHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: (ctx) => {
        const denied = mcpAccessDenied(ctx.request);
        if (denied) return denied;
        return (mcpHandler as (c: typeof ctx) => Response | Promise<Response>)(ctx);
      },
    },
  },
});
