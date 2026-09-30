// Ownership taken from @lovable.dev/mcp-js's generator (the "AUTO-GENERATED"
// banner is deliberately absent so the plugin leaves this file alone).
// The generated version answered anonymously; this one goes through the same
// access gate as /mcp (src/lib/mcp/access.ts) and is closed by default.

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackOAuthProtectedResourceMetadataHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import { mcpAccessDenied } from "../../lib/mcp/access";
import mcp from "../../lib/mcp/index";

const handler = createTanStackOAuthProtectedResourceMetadataHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
});

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: (ctx) => {
        const denied = mcpAccessDenied(ctx.request);
        if (denied) return denied;
        return (handler as (c: typeof ctx) => Response | Promise<Response>)(ctx);
      },
    },
  },
});
