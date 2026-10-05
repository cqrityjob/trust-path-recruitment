// The stand-in database for the PUBLIC test deployment of the preview image.
//
// A Cloudflare Worker that answers ONLY `sp_get_social_share` for synthetic,
// invented people, so the built application can be reached on a real public
// https address (LinkedIn's Post Inspector, a phone) without any real project,
// person or merit behind it. A share's state can be flipped at run time with the
// admin token, to test that revocation, expiry and a failed read stop the page
// and the image on the very next request.
//
//   POST /__state  {"id","state"}   state: active | revoked | expired | error
//   GET  /__calls                   how many reads the app has made
//
// The state lives in this isolate's memory: a restart returns every share to
// "active". That is acceptable for a short manual test and is said in the
// instructions. The admin token is a deployment secret (OG_TEST_ADMIN_TOKEN).

import { payloadFor } from "./og-worker-fixture";

interface Env {
  readonly OG_TEST_ADMIN_TOKEN?: string;
}

type State = "active" | "revoked" | "expired" | "error";
const states = new Map<string, State>();
let reads = 0;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/__")) {
      const token = req.headers.get("authorization") ?? "";
      const expected = env.OG_TEST_ADMIN_TOKEN ?? "";
      if (expected.length < 16 || token !== `Bearer ${expected}`) {
        return new Response("Not found", { status: 404 });
      }
      if (url.pathname === "/__state" && req.method === "POST") {
        const { id, state } = (await req.json()) as { id: string; state: State };
        states.set(id, state);
        return new Response("ok");
      }
      if (url.pathname === "/__calls") return Response.json({ reads });
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/rest/v1/rpc/sp_get_social_share" && req.method === "POST") {
      reads += 1;
      const { _public_id: id } = (await req.json()) as { _public_id: string };
      const state = states.get(id) ?? "active";
      if (state === "error") return new Response("boom", { status: 500 });
      if (state === "revoked" || state === "expired") {
        return Response.json({ status: "unavailable" });
      }
      return Response.json(payloadFor(id) ?? { status: "unavailable" });
    }
    return new Response("Not found", { status: 404 });
  },
};
