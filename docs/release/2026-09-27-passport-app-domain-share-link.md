# Security Passport: the share link on the application's own domain

PR 5 of `docs/passport/completion-work-order.md` (revision 3). Application only: no
migration, no data change and no change to the share function.

## What changes

- **The link a holder copies, and its QR code, are on the application's domain:**
  `https://trust-path-recruitment.lovable.app/p#<token>`.
  - Before, links pointed at the Supabase gateway:
    `https://wrygicdfxwjnrugduxnt.supabase.co/functions/v1/passport-share#<token>`.
- **The gateway stays and still does the work.**
  - `GET /p` is answered in `src/server.ts`, before any page is rendered, with a
    redirect to the gateway. The response has no body, is private and no-store,
    and carries `Referrer-Policy: no-referrer`.
  - The browser re-attaches the fragment it followed (RFC 9110 §10.2.2).
  - From there the path is unchanged:
    - the gateway scrubs the fragment and exchanges the token by POST for a
      one-time handoff;
    - the application consumes the handoff into a short, HttpOnly session scoped
      to the server function.
- **Links issued before this change keep working.** They open the gateway directly,
  which is untouched.

## Why the protection is equivalent

The token is a bearer capability, and the work order asks that it never appear in a
request path, a query string, a `Referer` header, or a hosting or analytics log.

- **The token is in the fragment, which browsers never send.** The request the
  application's host sees is `GET /p` and nothing more. That also holds for its edge
  logs and for link-preview crawlers.
- **No document ever exists at the address that holds the token.** The host injects
  an analytics script into HTML pages and reports full page loads. The redirect has
  no body, so nothing is injected and nothing runs. This is the same mechanism the
  legacy `/p/<token>` path already relies on.
- **Referrers are suppressed** on the redirect, as on the gateway. A `Referer` never
  carries a fragment in any case.
- **The redirect sets no fragment of its own.** The server never sees the token, so it
  cannot copy it anywhere.
- **Expiry, revocation, logged-out viewing and what the recipient sees** are decided
  where they were before: in the gateway exchange and the disclosure read. Neither
  changed.

## Verified

- **Real backend:** `e2e/passport-public-pilot-local.spec.ts`, case G, on both
  projects:
  - The link is `<app>/p#<64 hex>`, with no query.
  - `GET /p` answers `302` to the gateway entry exactly, with no body, `private,
no-store`, `no-referrer` and `noindex`.
  - Every request the recipient's browser sends is recorded. The token is in no
    request URL and no `Referer`. It appears in one request body only: the POST to
    the gateway.
  - The recipient sees the selection and nothing more.
  - The same share opened through a link in the old gateway form still works.
  - Revocation ends the view on reload, and the link then opens nothing.
- **Locally:** all 20 runs pass (10 cases × 2 projects).
- **CI:** the same walk runs in `.github/workflows/passport-public-pilot-evidence.yml`.
- **Guards:** `passport-share-gateway-transport-check` asserts:
  - the entry path;
  - the fragment-only link, and that the gateway form still exists;
  - that `/p` is answered before server-side rendering;
  - the redirect: no body, the exact Location, no fragment, no-store, no-referrer;
  - that anything but GET and HEAD is refused.

  `negative-controls:share-gateway-transport` adds three mutations: a redirect with a
  body, a missing referrer policy, and `/p` left to the page router. The guard fails
  on each.

## Release

- **Merging does not change the database.** After merge, the owner publishes the
  application in Lovable.
- **Share from the published application.** A share created on a preview build links
  to the published domain, which only answers `/p` once this is published.
- **Smoke test after publishing:**
  1. Create a share and open the copied link in a private window. It lands on the
     recipient view.
  2. Revoke it and reload. The view is gone.
  3. Open a link created before publishing. It still works.
- **Rolling back** is reverting this PR. Links created in the meantime point at `/p`
  and stop opening until it is republished. Every earlier link keeps working
  throughout.
