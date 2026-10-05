// A loopback stand-in for PostgREST that answers ONLY `sp_get_social_share`,
// with the synthetic fixtures, so the Worker-runtime evidence job never
// touches a real project.
//
// This is ONE Bun process on the CI runner, so unlike the public stand-in
// Worker it may keep state reliably: a share's state can be flipped at run
// time (`POST /__state`) to prove that a change in the database's answer takes
// effect on the application's very next request, and every RPC is counted
// (`GET /__calls`) to prove nothing is served from memory. The deterministic
// fixtures (always-revoked, always-expired, always-failing ids) are answered
// here too, exactly as the public stand-in answers them.
//
// Run: bun run scripts/og-worker-stub.ts <port>

import { fixtureAnswer, rpcResponse, type FixtureAnswer } from "./og-worker-fixture";

type State = "active" | "revoked" | "expired" | "error";
const states = new Map<string, State>();
const calls: string[] = [];

const port = Number(process.argv[2] ?? 54399);

function answerFor(id: string): FixtureAnswer {
  const flipped = states.get(id);
  if (flipped === "error") return { kind: "error" };
  if (flipped === "revoked" || flipped === "expired") return { kind: "unavailable" };
  return fixtureAnswer(id);
}

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
      return rpcResponse(answerFor(id));
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`og-worker-stub listening on 127.0.0.1:${port}`);
