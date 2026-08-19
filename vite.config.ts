// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// ── WHY mcpPlugin() IS GONE ────────────────────────────────────────────
//
// The plugin generates src/routes/mcp.ts on every build and mounts the
// CQrityjob MCP server with NO authentication. Its tools expose the authored
// question bank, the dimension model, per-profession target dimension profiles
// (the calibration matrix) and the matching engine itself, to anyone who knows
// the path.
//
// That route is now user-authored and access-gated (see src/routes/mcp.ts).
// The plugin refuses to coexist with a user-authored route -- it fails the
// build with "refusing to overwrite user-authored route" rather than leaving
// the file alone -- so keeping the plugin and owning the route are mutually
// exclusive. Owning the route wins: an unauthenticated MCP endpoint is not
// something the product can ship, and regenerating it on every build would
// silently reopen the door.
//
// To restore generation, delete src/routes/mcp.ts and re-add the plugin --
// and re-open the exposure. Do not do that without an owner decision.

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
