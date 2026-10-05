// The stand-in database for the PUBLIC test deployment of the preview image.
//
// A Cloudflare Worker that answers ONLY `sp_get_social_share`, for the
// synthetic, invented people in og-worker-fixture.ts, so the built application
// can be reached on a real public https address (LinkedIn's Post Inspector, a
// phone) without any real project, person or merit behind it.
//
// ── STATELESS, ON PURPOSE ──────────────────────────────────────────────
//
// It keeps nothing. Cloudflare runs a Worker in many isolates and restarts
// them freely, so anything remembered in memory would differ from one request
// to the next and vanish on a restart; a "revoke this share" button backed by
// such memory would give evidence that could not be trusted. Instead, each id
// always answers the same way: one is always active, one always answers as a
// revoked share, one as an expired share, one always fails to read. They prove
// how the application answers each kind of database answer. Production's real
// revocation and expiry are proved against a real database (the SQL tests and
// the pilot spec's case S), not here.
//
// There is no admin path and no secret: nothing to authenticate, nothing to
// change.

import { fixtureAnswer, rpcResponse } from "./og-worker-fixture";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/rest/v1/rpc/sp_get_social_share" && req.method === "POST") {
      const { _public_id: id } = (await req.json()) as { _public_id: string };
      return rpcResponse(fixtureAnswer(typeof id === "string" ? id : ""));
    }
    return new Response("Not found", { status: 404 });
  },
};
