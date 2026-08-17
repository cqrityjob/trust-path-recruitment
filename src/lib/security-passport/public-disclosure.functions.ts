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

/** A token is 32 random bytes rendered as hex. Anything else is rejected
 *  before it reaches the database — cheap, and it keeps malformed input out
 *  of the throttle table as well. */
const TOKEN_RE = /^[0-9a-f]{64}$/;

export const getPublicDisclosure = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().max(200) }).parse(data))
  .handler(async ({ data }): Promise<RecipientPayload> => {
    if (!TOKEN_RE.test(data.token)) return { status: "unavailable" };

    const request = getRequest();
    const forwarded = request?.headers?.get("x-forwarded-for") ?? "";
    // First hop only; the rest of an X-Forwarded-For chain is caller-supplied.
    const hint = forwarded.split(",")[0]?.trim() || "unknown";

    const { readDisclosureByToken } = await import("./public-disclosure.server");
    return readDisclosureByToken(data.token, hint);
  });
