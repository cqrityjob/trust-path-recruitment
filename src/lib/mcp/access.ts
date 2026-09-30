// One access gate for EVERY route that mounts the CQrityjob MCP server.
//
// ── WHY ONE GATE ───────────────────────────────────────────────────────
//
// `@lovable.dev/mcp-js` mounts the same tool set at several addresses: the
// MCP endpoint `/mcp`, the side routes `/.mcp/list-tools` and
// `/.mcp/invoke-tool/$tool`, and the discovery document
// `/.well-known/oauth-protected-resource`. Gating only `/mcp` left the side
// routes answering anonymously with the whole tool set — the question bank,
// per-profession target profiles and the matching engine. Every one of those
// routes now calls `mcpAccessDenied` first.
//
// ── CLOSED UNLESS DELIBERATELY OPENED ──────────────────────────────────
//
// The server answers 404 (indistinguishable from "no such route") unless
// BOTH are true:
//
//   * CQRITYJOB_MCP_ENABLED === "true", and
//   * the request carries `Authorization: Bearer <CQRITYJOB_MCP_TOKEN>`,
//     where the configured token is at least 16 characters.
//
// There is no "enabled without a token" mode any more: forgetting the token
// used to open the tools to the internet. Both settings are server-side
// variables; a VITE_ variable would be inlined into the browser bundle.

const MIN_TOKEN_LENGTH = 16;

/** Constant-time comparison for equal-length strings. */
function tokenMatches(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function mcpAccessAllowed(request: Request): boolean {
  if (process.env.CQRITYJOB_MCP_ENABLED !== "true") return false;
  const expected = process.env.CQRITYJOB_MCP_TOKEN ?? "";
  if (expected.length < MIN_TOKEN_LENGTH) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return presented.length > 0 && tokenMatches(presented, expected);
}

/** A 404 when the caller may not reach the MCP server, otherwise null. */
export function mcpAccessDenied(request: Request): Response | null {
  return mcpAccessAllowed(request) ? null : new Response("Not found", { status: 404 });
}
