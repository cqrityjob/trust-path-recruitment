// Security Passport — the recipient page's only server call.
//
// Anonymous by design: there is no auth middleware here, because a recipient
// is a stranger holding a link. Everything that protects the holder happens
// behind this call — the throttle, the token check, and the server-assembled
// package payload.
//
// The token is read from the request body, never placed in a URL this
// function constructs and never logged.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { RecipientPayload } from "./packages";
import { shareTokenFromCookieHeader } from "./share-transport";

/** A token is 32 random bytes rendered as hex. Anything else is rejected
 *  before it reaches the database — cheap, and it keeps malformed input out
 *  of the throttle table as well. */
const TOKEN_RE = /^[0-9a-f]{64}$/;

export const getPublicDisclosure = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().max(200) }).parse(data))
  .handler(async ({ data }): Promise<RecipientPayload> => {
    if (!TOKEN_RE.test(data.token)) return { status: "unavailable" };
    return readForToken(data.token);
  });

/**
 * The recipient page's call, with the token taken from the request COOKIE
 * rather than from anything the page knows.
 *
 * The page cannot pass a token any more, because the page's URL no longer
 * contains one: `/p/<token>` is turned into a 302 to `/p/view` plus an
 * HttpOnly cookie before any document exists, so the host's injected analytics
 * script never sees a bearer capability. See share-transport.ts.
 *
 * The token still reaches `readDisclosureByToken` on every render, so the
 * throttle, the revocation and expiry checks, the scope boundary and the single
 * indistinguishable `unavailable` payload are all unchanged — this only
 * changes where the token was carried, never what it authorises.
 *
 * No validator: there is no input. A caller cannot substitute a token here,
 * which is the point.
 */
export const getPublicDisclosureFromCookie = createServerFn({ method: "POST" }).handler(
  async (): Promise<RecipientPayload> => {
    const token = shareTokenFromCookieHeader(getRequest()?.headers?.get("cookie"));
    // Absent, malformed or expired cookie renders exactly as a revoked token, a
    // guessed token and a throttled request do. A recipient whose cookie has
    // lapsed re-opens their link and gets a fresh one.
    if (!token) return { status: "unavailable" };
    return readForToken(token);
  },
);

async function readForToken(token: string): Promise<RecipientPayload> {
  const request = getRequest();
  const forwarded = request?.headers?.get("x-forwarded-for") ?? "";
  // First hop only; the rest of an X-Forwarded-For chain is caller-supplied.
  const hint = forwarded.split(",")[0]?.trim() || "unknown";

  const { readDisclosureByToken } = await import("./public-disclosure.server");
  return readDisclosureByToken(token, hint);
}
