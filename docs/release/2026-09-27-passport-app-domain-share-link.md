# Security Passport: a share link that renders, and social sharing restored

Pull request cqrityjob/trust-path-recruitment#318. Application code, the `passport-share`
edge function, and the evidence tooling. No migration: the exchange reuses the
reviewed gateway RPCs from `20261104090000_passport_share_gateway.sql`.

## 1 · The recipient link

### What was broken

In production, `https://<project>.supabase.co/functions/v1/passport-share#<token>`
answered with the gateway page's source shown as text. Hosted Supabase does not serve
HTML from its default domain. It rewrites such a response to:

- `Content-Type: text/plain`
- `Content-Security-Policy: default-src 'none'; sandbox`
- `X-Content-Type-Options: nosniff`

So nothing on the page ran, and the token stayed in the address bar. The local
Supabase stack does not apply that rewrite, which is why every local walk passed.
The earlier version of this PR redirected `/p` to that same function, so it did not
fix the production failure.

The failure is now reproduced locally: main's function, served through
`scripts/local-hosted-functions-proxy.ts`, returns exactly those headers and shows
its source as text.

### What changes

- **The entry is the application's own page.** New links are
  `https://trust-path-recruitment.lovable.app/p#<token>`.
  - `GET /p` is answered in `src/server.ts`, ahead of server-side rendering, with a
    small bilingual document.
  - Its script removes the fragment from the address bar and the history entry,
    then POSTs the token to `/p/open`.
- **`POST /p/open` exchanges the token on the application server.**
  - It applies the existing throttle, then issues a one-time handoff through
    `sp_share_gateway_issue`, storing only its SHA-256.
  - It consumes the handoff into a separate 30-minute session with
    `sp_share_gateway_consume`.
  - It answers `303` to `/p/<navigation id>` with the session cookie
    (`HttpOnly; SameSite=Lax; Secure; Path=/_serverFn`).
  - An unknown, expired, revoked, application-scoped or throttled token lands on
    the same "not available" page as any other.
- **The `passport-share` function no longer serves a page.** `GET` and `HEAD` answer
  a body-less `302` to `<site>/p`, and the browser keeps the fragment when it
  follows it (RFC 9110 §10.2.2). A redirect with no body has nothing for hosted
  Supabase to rewrite. Every other method gets `405`.
- **The function redirects only after the owner confirms the site answers `/p`.**
  Until the secret `PASSPORT_SHARE_ENTRY_PUBLISHED=1` is set, `GET` and `HEAD` get a
  body-less `503`.
  - Without this, the order of release would matter. The site published today has no
    `/p` page: it renders its own 404 there, and the host's analytics script runs on
    that page and reports the address, token included.
  - The function can go live before the site is published, and Lovable may deploy it
    straight from the merged code. It can also outlive a rollback of the site.

### What is preserved

- **The token is never in a request path, a query string or a `Referer`.** It lives
  in the fragment, which no request carries, and leaves the browser once, in the
  body of a same-origin POST.
- **The host's analytics cannot see it.** The published host injects
  `<script defer src="/~flock.js">` into every HTML page.
  - The entry page's policy is
    `default-src 'none'; script-src 'nonce-…'; style-src 'nonce-…'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`.
    It deliberately does not allow `'self'`, so the injected script cannot run
    there and has nowhere to connect.
  - The fragment is removed while the page is still being parsed, before any
    deferred script could read it.
- **The entry page is private.** It is sent `private, no-store`, `no-referrer`,
  `noindex, nofollow, noarchive` and `nosniff`.
- **The access rules are the same RPCs as before:** throttling, selective disclosure,
  expiry, revocation, private documents and the session protections.

**One exposure changes, stated plainly.** The durable token now reaches the
application server, in a POST body. Before, only the Supabase function received it.
The server passes it to the throttled RPCs and nowhere else: it is not logged, not
stored and never set as a cookie. The browser receives only the separate session.

### Link shapes, and what each one does

| Link                                                                                 | Status                                                                                                                            |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `https://trust-path-recruitment.lovable.app/p#<token>` (new)                         | Works once the application is published.                                                                                          |
| `https://<project>.supabase.co/functions/v1/passport-share#<token>` (issued earlier) | **Broken in production today.** It works once the new function is deployed and the owner sets `PASSPORT_SHARE_ENTRY_PUBLISHED=1`. |
| `https://…/p/<token>` (the oldest shape)                                             | Still redirected by the application. The token is in its first request path, so it can appear in the host's edge logs.            |

**Limitation for existing links.** A gateway link issued before this change shows raw
HTML until the new `passport-share` function is deployed. It then gets a blank `503`
until the owner sets the secret. After that, the local walk shows it opening the
share through the hosted restriction. What hosted Supabase does with a body-less
redirect in production has **not** been verified from here: the sandbox cannot reach
the project. The deployed check below covers it.

**Any holder can re-issue a link** from "Dina delningar" and choose whether the old
one keeps working.

## 2 · Social sharing, restored

### Recovered, not rebuilt

Nothing had been deleted. The live route stopped using these pieces when the page
became choose → preview → send (`1a732ebd`, 2026-09-07):

- the card preview `SocialFrame` (`908d6057`, `97047d6f`);
- the image pipeline: `social.ts` → `social-export.ts` → `svgToPngBlob`, with the four
  `SHARE_FORMATS`;
- the platform list and intents: `share-channels.ts`, and `SharePanel` (`f4c5628d`);
- the Story image for Instagram and the device share with the image attached;
- the LinkedIn profile entry, `LinkedInProfileSection` (`f4c5628d`).

`SecureShareQr` (`ba8ac068`) stayed reachable throughout.

`CredentialShareActions` (a per-credential link plus "Add to LinkedIn") stays
unreachable. `1a043ea9` removed it from the credential page on purpose, so that
every link goes through the Share page's field choices. Reconnecting it would bypass
that. Its LinkedIn profile entry is available again in the social choice.

### How the page works now

`/passport/share` opens with two choices:

- **"Dela via länk" / "Share via link"** is the link flow, unchanged: selection,
  recipient preview, expiry, copy, QR code, revocation and re-issue.
- **"Dela på sociala medier" / "Share on social media"**:
  1. Choose the credentials the image shows: current credentials only, at most
     three.
  2. Preview the image in any of the four formats.
  3. Download it, or use the device share sheet.
  4. Open LinkedIn, Facebook, X, WhatsApp or e-mail to post it yourself.
     "Instagram" switches the preview to the Story image and downloads that.

  Nothing is posted on the holder's behalf.

### What changed about the image, and why

- **The preview is the download.** They used to be two drawings that disagreed. Now
  `SocialCardSvg` is drawn once. `SocialFrame` shows that SVG, and the download
  rasterises the same string.
- **It uses the shared card's vocabulary.** That means the ground, the brand, and for
  each credential the `ShieldMark`, its abbreviation, flag and written scope, and its
  trust word from the shared labeller.
- **The words are truthful.** A CQrityjob document review reads "Dokumenterad", the
  holder's own entry "Egenrapporterad", and only a source confirmation could read
  "Källbekräftad". Under today's rules no credential can reach source-confirmed, so
  none is ever shown as verified.
- **Some things are never on the image:** an expired credential, an issuer, a date, a
  number, a document, an employer or a scope restriction.
- **No link and no QR code by default.** Instead the image says it is a snapshot.
- **Adding a link is explicit.** Under "Fler alternativ" the holder can create a link
  for exactly what the image shows. It is not drawn until they tick "Visa länken och
  QR-koden i bilden och i inlägget". The preview then shows it before any download,
  and that link is revocable like every other.

## Verified

WALK_RESULTS

- **Guards:** all 40 `passport-*:check` scripts pass, as do the app and scripts type
  checks and ESLint.
  - `passport-share-gateway-transport-check` (78 assertions) runs the real function
    and the hosted-restriction proxy over HTTP.
  - `passport-trust-source-check` gains checks that the image draws a reviewed
    credential as documented, never verified, and never draws a non-current one.
- **Negative controls:** `negative-controls:share-gateway-transport` catches all 10
  mutations, including a function that serves HTML again and an entry page that
  admits `'self'` scripts.
- **CI** (`.github/workflows/passport-public-pilot-evidence.yml`):
  - runs the walk behind both stand-ins for the hosted platform;
  - its verifier refuses a report where cases G or S did not run that way.

## Release

1. **Merge, then publish the application in Lovable.** New links start working once
   the published site answers `/p`.
2. **Check the entry on the published site.**
   `curl -sI https://trust-path-recruitment.lovable.app/p` must show the entry page's
   `Content-Security-Policy` with `script-src 'nonce-…'` and without `'self'`. If the
   host strips or rewrites that header, stop here and report it.
3. **Deploy the `passport-share` function**, unless Lovable already deployed it from
   the merged code. Either way it refuses every link until step 4.
   - `verify_jwt = false` comes from `supabase/config.toml`.
   - `PUBLIC_SITE_URL` must be the published https origin, or unset for the
     production fallback.
4. **Set the function secret `PASSPORT_SHARE_ENTRY_PUBLISHED=1`.** This is the owner's
   confirmation that step 2 passed. From then on, gateway links issued earlier open
   the share.
5. **Deployed checks** (a private window, from the published site):
   1. Create a share, copy the link and open it. The recipient view renders with no
      raw HTML, and the address bar ends in `/p/<32 hex>` with no `#`.
   2. Scan the QR code on a phone: the same view opens.
   3. In the browser's network panel, no request URL, `Referer` or analytics body
      contains the token. The only request carrying it is `POST /p/open`.
   4. An earlier gateway link opens the same view.
   5. Revoke the share and reload: "not available". Open the link again: "not
      available".
   6. In "Dela på sociala medier", select one credential and download the image. It
      matches the preview and contains no link.
6. **Rollback:** first remove `PASSPORT_SHARE_ENTRY_PUBLISHED`, so the function stops
   sending anyone to `/p`. Then revert this PR, republish, and redeploy the previous
   function. Gateway links then show raw HTML again, as they do today.

**The share in the reported screenshot has its token visible** (`5eca5dbb…`).
Revoke that share in "Dina delningar", and re-issue it if it is still needed.
