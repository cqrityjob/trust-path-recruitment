import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { randomBytes } from "node:crypto";
import {
  buildShareEntryPage,
  buildShareRedirect,
  buildShareSessionRedirect,
  buildShareUnavailableRedirect,
  hashShareSecret,
  isShareToken,
  shareTokenFromPath,
  SHARE_HANDOFF_PATH,
  SHARE_OPEN_PATH,
} from "./lib/security-passport/share-transport";
import { SHARE_ENTRY_PATH } from "./lib/security-passport/public-origin";
import { clientIpHint } from "./lib/http/client-ip";
import { withSecurityHeaders } from "./lib/http/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/**
 * One form field from a small POSTed form, or null. Both share hops accept
 * exactly this and nothing larger: a form the page itself built.
 */
async function postedShareSecret(request: Request, field: string): Promise<string | null> {
  if (request.method !== "POST") return null;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 2048) return null;
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.startsWith("application/x-www-form-urlencoded") &&
    !contentType.startsWith("multipart/form-data")
  )
    return null;
  const value = (await request.formData()).get(field);
  return typeof value === "string" && isShareToken(value) ? value : null;
}

const unavailableShare = () => buildShareUnavailableRedirect(randomBytes(16).toString("hex"));
const isHttps = (request: Request) => new URL(request.url).protocol === "https:";

/** A one-time handoff from a gateway page, consumed into a session. */
async function consumeShareHandoffRequest(request: Request): Promise<Response> {
  const handoff = await postedShareSecret(request, "handoff");
  if (!handoff) return unavailableShare();
  const session = randomBytes(32).toString("hex");
  try {
    const { consumeShareHandoff } =
      await import("./lib/security-passport/public-disclosure.server");
    if (!(await consumeShareHandoff(handoff, hashShareSecret(session)))) return unavailableShare();
  } catch {
    return unavailableShare();
  }
  return buildShareSessionRedirect(session, isHttps(request));
}

/**
 * The `/p` entry page's POST: the token it read from the fragment, exchanged
 * for a separate session. The token arrives in the body and goes no further
 * than the throttled RPCs; it is not logged, not stored, and never set as a
 * cookie -- the browser receives only the session. See share-transport.ts.
 */
async function openShareRequest(request: Request): Promise<Response> {
  const token = await postedShareSecret(request, "token");
  if (!token) return unavailableShare();
  const handoff = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  // The edge-set client address, not a caller-chosen one (lib/http/client-ip.ts).
  const hint = clientIpHint(request.headers);
  try {
    const { openShareByToken } = await import("./lib/security-passport/public-disclosure.server");
    if (!(await openShareByToken(token, handoff, hashShareSecret(session), hint)))
      return unavailableShare();
  } catch {
    return unavailableShare();
  }
  return buildShareSessionRedirect(session, isHttps(request));
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (new URL(request.url).pathname === SHARE_HANDOFF_PATH) {
        return consumeShareHandoffRequest(request);
      }
      // The entry of every new share link, `/p#<token>`. The token is in the
      // fragment and never reaches this server; the page removes it and POSTs
      // it to SHARE_OPEN_PATH. Answered here, ahead of the SSR handler, so the
      // page is exactly this document, under its own CSP. See share-transport.ts.
      if (new URL(request.url).pathname === SHARE_ENTRY_PATH) {
        return buildShareEntryPage(request.method, randomBytes(16).toString("hex"));
      }
      if (new URL(request.url).pathname === SHARE_OPEN_PATH) {
        return openShareRequest(request);
      }
      // A share token must never reach a rendered document. See
      // lib/security-passport/share-transport.ts for why this is here, in
      // front of the SSR handler, rather than anywhere in the page: the host
      // injects an analytics script that reports window.location.href on every
      // full page load, and the only reliable way to keep a bearer capability
      // out of it is for no document to ever exist at that URL.
      //
      // The 302 carries no body, so nothing is injected into it and no script
      // runs. Deliberately before the try's handler call and before any
      // routing, so it cannot be bypassed by a route that happens to match.
      const shareToken = shareTokenFromPath(new URL(request.url).pathname);
      if (shareToken) {
        return buildShareRedirect(shareToken, new URL(request.url).protocol === "https:");
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(
        await normalizeCatastrophicSsrResponse(response),
        new URL(request.url).protocol === "https:",
      );
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
