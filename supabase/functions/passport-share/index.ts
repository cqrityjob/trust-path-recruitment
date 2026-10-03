// Security Passport — the gateway address of share links issued before the
// application-domain entry: `<supabase>/functions/v1/passport-share#<token>`.
//
// ── WHY THIS NO LONGER SERVES A PAGE ───────────────────────────────────
//
// This function used to answer GET with an HTML page that read the fragment
// and exchanged the token. Hosted Supabase does not serve HTML from its default
// domain: it rewrites the response to `Content-Type: text/plain` with
// `Content-Security-Policy: default-src 'none'; sandbox` and
// `X-Content-Type-Options: nosniff`, so a recipient saw the page's source as
// text, nothing ran, and the token stayed in the address bar. The local stack
// does not apply that rewrite, which is why every local walk passed.
//
// So a GET is now a redirect with no body -- there is nothing for the platform
// to rewrite -- to the application's own entry, `/p`, which the browser
// follows with the fragment re-attached (RFC 9110 §10.2.2). The application
// reads, scrubs and exchanges the token there (src/server.ts,
// src/lib/security-passport/share-transport.ts). This function never sees the
// token: a fragment is not sent.
//
// ── WHY IT WAITS FOR THE OWNER ─────────────────────────────────────────
//
// The redirect is safe only where the site answers /p with that entry page,
// whose policy refuses the host's injected analytics script. A site published
// before this change has no such page: it renders its own 404 at /p, the host's
// script runs there and reports the address, token and all. This function can
// be deployed before the site is published, or outlive a rollback of it. So it
// redirects only once the owner has confirmed the entry is live, by setting
// PASSPORT_SHARE_ENTRY_PUBLISHED=1. Until then a link gets a 503 with no body:
// nothing runs, nothing is rewritten, and the token goes nowhere.

function entryPublished(): boolean {
  return Deno.env.get("PASSPORT_SHARE_ENTRY_PUBLISHED") === "1";
}

function siteOrigin(): string {
  const fallback = "https://www.cqrityjob.com";
  try {
    const parsed = new URL(Deno.env.get("PUBLIC_SITE_URL") ?? fallback);
    // A platform-assigned host (the old *.lovable.app address, a preview) is
    // never where a share link may send a stranger, whatever the setting says.
    if (/(^|\.)(lovable\.app|lovableproject\.com|lovableproject-dev\.com)$/i.test(parsed.hostname)) {
      return fallback;
    }
    return parsed.protocol === "https:" ? parsed.origin : fallback;
  } catch {
    return fallback;
  }
}
const ENTRY_URL = `${siteOrigin().replace(/\/+$/, "")}/p`;

const hopHeaders: HeadersInit = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

Deno.serve((request) => {
  if (request.method === "GET" || request.method === "HEAD") {
    if (!entryPublished()) {
      return new Response(null, { status: 503, headers: { ...hopHeaders, "Retry-After": "3600" } });
    }
    return new Response(null, { status: 302, headers: { ...hopHeaders, Location: ENTRY_URL } });
  }
  return new Response(null, { status: 405, headers: { ...hopHeaders, Allow: "GET, HEAD" } });
});
