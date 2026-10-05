// A loopback stand-in for PostgREST that answers ONLY `sp_get_social_share`,
// with synthetic payloads, so the Worker-runtime evidence job never touches a
// real project. State per id can be flipped at run time (`POST /__state`) to
// prove that revocation, expiry and a failed read take effect on the very next
// request, and every RPC is counted (`GET /__calls`).
//
// Run: bun run scripts/og-worker-stub.ts <port>

import { payloadFor } from "./og-worker-fixture";

type State = "active" | "revoked" | "expired" | "error";
const states = new Map<string, State>();
const calls: string[] = [];

const port = Number(process.argv[2] ?? 54399);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/__state" && req.method === "POST") {
      const { id, state } = (await req.json()) as { id: string; state: State };
      states.set(id, state);
      return new Response("ok");
    }
    if (url.pathname === "/__calls") return Response.json(calls);
    if (url.pathname === "/__reset" && req.method === "POST") {
      states.clear();
      calls.length = 0;
      return new Response("ok");
    }
    if (url.pathname === "/rest/v1/rpc/sp_get_social_share" && req.method === "POST") {
      const { _public_id: id } = (await req.json()) as { _public_id: string };
      calls.push(id);
      const state = states.get(id) ?? "active";
      if (state === "error") return new Response("boom", { status: 500 });
      if (state === "revoked" || state === "expired") {
        return Response.json({ status: "unavailable" });
      }
      return Response.json(payloadFor(id) ?? { status: "unavailable" });
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`og-worker-stub listening on 127.0.0.1:${port}`);
