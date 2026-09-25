// The receipt recovery, as an endpoint a scheduler can call.
//
// ── CLOSED BY DEFAULT ──────────────────────────────────────────────────
//
// It exists only when RECRUITMENT_SWEEP_TOKEN is set in the SERVER
// environment, and answers only a POST that presents that token as a bearer.
// Anything else is a 404: a closed endpoint should not confirm that it
// exists. The token is not a VITE_ variable, on purpose: VITE_ values are
// inlined into the client bundle and would publish the very secret they
// gate. The same value is what .github/workflows/recruitment-receipts-sweep.yml
// presents, from a repository secret.
//
// What it does is exactly what the product does by itself when an employer
// opens their recruitment overview, and what the database allows the server
// to do: hand over the receipts whose e-mail is due (never started, aged
// out, unknown inside the provider's window, rate-limited), one attempt
// each, bounded, one sweep at a time. It generates nothing retroactively and
// it sends nothing that is not registered. The answer is a count, never an
// address.

import { createFileRoute } from "@tanstack/react-router";

function notFound(): Response {
  return new Response("Not found", { status: 404 });
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
  const expected = process.env.RECRUITMENT_SWEEP_TOKEN;
  if (!expected || expected.length < 16) return false; // closed unless configured, and never with a trivial token
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  return presented.length > 0 && tokenMatches(presented, expected);
}

export const Route = createFileRoute("/api/recruitment/receipts-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorised(request)) return notFound();
        let limit = 20;
        let employerId: string | null = null;
        try {
          const body = (await request.json()) as { limit?: unknown; employerId?: unknown } | null;
          if (typeof body?.limit === "number" && Number.isFinite(body.limit)) {
            limit = Math.max(1, Math.min(200, Math.floor(body.limit)));
          }
          if (typeof body?.employerId === "string" && /^[0-9a-f-]{36}$/i.test(body.employerId)) {
            employerId = body.employerId;
          }
        } catch {
          // No body, or not JSON: the defaults.
        }
        const { sweepReceipts } = await import("@/lib/recruitment/receipt.server");
        try {
          const summary = await sweepReceipts({ limit, employerId });
          return Response.json({ ok: true, at: new Date().toISOString(), ...summary });
        } catch (e) {
          console.error("[recruitment] receipt sweep failed", e);
          return Response.json({ ok: false, code: "RECRUITMENT_ACTION_FAILED" }, { status: 500 });
        }
      },
      ANY: () => notFound(),
    },
  },
});
