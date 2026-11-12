// Security Passport ↔ voluntary self-declarations — the RECIPIENT'S read.
//
// This is the Passport side of the one authorized bridge
// (20270325090000). It is the only file under src/lib/security-passport that
// names the self-declarations, and scripts/self-declarations-check.ts keeps
// it that way.
//
// ── WHY IT IS NOT PART OF THE ANONYMOUS RECIPIENT CALL ──────────────────
//
// An ordinary Passport link is readable by anyone who holds it: the page's
// own call (public-disclosure.functions.ts) has no auth middleware and reads
// through the service role. A self-declaration must never travel that way.
// So this is a SEPARATE call with BOTH conditions:
//
//   * `requireSupabaseAuth`: a signed-in recipient, calling with their own
//     session. An anonymous visitor never reaches the handler;
//   * the link's live share session, read from the recipient's HttpOnly
//     cookie on the server. The page cannot pass a secret, because it does
//     not have one.
//
// The database then decides again, on every request: the recipient's live
// session, the share session, the link, the selection, the statement's
// status, revision and retention, and both authorizations
// (vsd_read_disclosed). Nothing is cached and no decision is remembered.
//
// Every failure -- no cookie, a lapsed session, a link with no statement, a
// refusal, an unexpected payload -- is the same empty list, so the page shows
// the ordinary Passport and nothing is learned from the difference.

import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  toDisclosedStatements,
  type DisclosedStatement,
} from "@/lib/self-declarations/passport-bridge";
import { shareSessionFromCookieHeader } from "./share-transport";

type RpcResult = { data: unknown; error: { message: string } | null };
type CallerClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export const readSharedSelfDeclarations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // The navigation id names WHICH share this tab is on; it is a one-way hash
  // and authorizes nothing (share-transport.ts).
  .validator((data: unknown) =>
    z
      .object({ navigationId: z.string().max(64) })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<readonly DisclosedStatement[]> => {
    setResponseHeader("Cache-Control", "no-store, private, max-age=0");
    setResponseHeader("Pragma", "no-cache");
    const session = shareSessionFromCookieHeader(
      getRequest()?.headers?.get("cookie"),
      data.navigationId,
    );
    if (!session) return [];
    // The recipient's OWN client: the database sees who is asking.
    const client = (context as { supabase: unknown }).supabase as CallerClient;
    const { data: payload, error } = await client.rpc("vsd_read_disclosed", {
      _share_session: session,
    });
    if (error) return [];
    return toDisclosedStatements(payload);
  });
