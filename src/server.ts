import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { randomBytes } from "node:crypto";
import {
  buildShareRedirect,
  buildShareSessionCookie,
  hashShareSecret,
  isShareToken,
  sessionNavigationIdFor,
  shareTokenFromPath,
  SHARE_HANDOFF_PATH,
  shareViewPath,
} from "./lib/security-passport/share-transport";

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

async function consumeShareHandoffRequest(request: Request): Promise<Response> {
  const unavailableId = randomBytes(16).toString("hex");
  const unavailable = () =>
    new Response(null, {
      status: 303,
      headers: {
        Location: shareViewPath(unavailableId),
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Referrer-Policy": "no-referrer",
      },
    });
  if (request.method !== "POST") return unavailable();
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 2048) return unavailable();
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.startsWith("application/x-www-form-urlencoded") &&
    !contentType.startsWith("multipart/form-data")
  )
    return unavailable();
  const form = await request.formData();
  const handoff = form.get("handoff");
  if (typeof handoff !== "string" || !isShareToken(handoff)) return unavailable();

  const session = randomBytes(32).toString("hex");
  try {
    const { consumeShareHandoff } =
      await import("./lib/security-passport/public-disclosure.server");
    if (!(await consumeShareHandoff(handoff, hashShareSecret(session)))) return unavailable();
  } catch {
    return unavailable();
  }
  const navigationId = sessionNavigationIdFor(session);
  return new Response(null, {
    status: 303,
    headers: {
      Location: shareViewPath(navigationId),
      "Set-Cookie": buildShareSessionCookie(session, new URL(request.url).protocol === "https:"),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
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
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
