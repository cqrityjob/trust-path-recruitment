# Dela mitt Security Passport — the personal, public share

One screen: the holder sees the Passport as a recipient will see it, with every
shareable credential already in, and chooses where it goes. Nothing is public
until they have looked and said so.

> **Delivered in two steps (schema-first-release rule).** Step 1 (PR #430) is the
> database: Passport numbers, the protected founder designation, the narrow
> founder rule in the statistics, the separate public share and its tests and
> rollback. Step 2 (this change) is the application that calls it. Step 2 cannot
> merge until step 1 is applied on the hosted project and recorded with evidence.

## What the holder sees

| Where | What |
|---|---|
| `/passport/share` | Heading **Dela mitt Security Passport**. The preview, **Välj alla delbara meriter (n)** (tri-state), **Ändra urval**, the notice, **Dela på LinkedIn**, **Kopiera länk**, **Spara bilden**, **Dela via appar** (only where the browser can hand over a file) and **Fler inställningar** (other channels, language, lifetime, the whole list as text). A private link for one recipient is the quiet alternative tab; it is unchanged. |
| `/s/<publicId>` | The public page a link preview points at. Server-rendered, `noindex`, answers one *unavailable* page for unknown, expired and withdrawn ids. |
| The card | Name, country, **Security Passport #n**, and — for the one founder — a separate line **Grundare av CQrityjob**. A card with no title prints no sentence about the missing title. |

## What each button really does

* **Dela på LinkedIn / other channels** — creates a *public share* (after the
  holder ticks that they have seen the preview and want it public) and opens the
  platform's own share dialog on `/s/<publicId>`. The platform draws a *link
  preview* from the page's Open Graph tags; the holder writes the text and
  publishes. **The image does not travel with a web link** and the screen never
  says it does. LinkedIn OAuth/direct posting is out of scope.
* **Kopiera länk** — the same public link.
* **Spara bilden** — the Passport image to the device. Nothing becomes public and
  no consent is needed.
* **Dela via appar** — `navigator.share` with the prepared file where
  `navigator.canShare({ files })` says it can. Cancelling is a decision: it
  returns, shows no error and downloads nothing.
* **Instagram** — no web path exists for a link or an image; an honest
  instruction, not a button that pretends.
* The destination window is opened **inside the click**, before the share is
  created, and pointed at the platform afterwards. A browser that still refuses
  gets the dialog address as a real link.

Notice, verbatim: *Du delar detta offentligt. Sociala medier kan behålla bilden
även om du senare återkallar länken.* Withdrawal and expiry stop access **at
CQrityjob**; nothing promises that a platform's cache is emptied.

## What is public, and what is not

The public page is built by the database (`sp_get_social_share`) from the
holder's **current** rows for exactly the credentials they approved: title,
taxonomy code, jurisdictions, expiry, assertion, lifecycle and a verifier reduced
to *CQrityjob* or *external*. Never an issuer, an issue date, a protected-object
scope, an employment, a document, a certificate number, a contact detail, a user
id, an e-mail address or a token. The name is the **more restrictive** of what the
holder approved and their privacy setting *now*, so tightening it takes effect on
the next open. The page re-derives standing on every open; a credential that has
lapsed says so.

## The preview image

`og:image` on `/s/<id>` is `/og/share/<id>`: **the holder's own card, drawn on the
server** from the same controlled payload as the page (`sp_get_social_share`).
It shows the Passport number, the name (as the holder's privacy setting allows
*now*), the country and the approved credentials, each with a shield whose
outline tells the evidence level — dashed for self-declared, solid for
documented, doubled with a check for verified; gold belongs to verified alone —
and the words for it. Up to six rows, then "+ n more on the page". The founder
line is plain text under the name, never a shield and never gold.

**No image is uploaded, stored or served from a client.** The route takes nothing
from the request (no query, no body); there is no image column in the schema. An
unselected merit, an issuer, a certificate number, a contact detail, an e-mail
address or an internal id is not in the payload, so it cannot be in the image.

* **Revocation and expiry stop it at CQrityjob.** Unknown, expired and revoked
  ids answer 404, never cacheable (`no-store`); a failed read answers 503 so a
  crawler retries. A platform that already fetched the image may keep its copy,
  which the holder is told before sharing.
* **A name the faces cannot draw** (a script outside Latin) would become boxes on
  a public image, so the route redirects to the branded static image instead.
* **The `?v=` on the address** is the approval time, so a platform that cached an
  earlier card for the same share fetches the current one.

### Why it is a small rasteriser and not satori + resvg-wasm

Production is a Cloudflare Worker (`server: cloudflare` on `www.cqrityjob.com`).
A Worker cannot compile WebAssembly from bytes at run time; the usual pair needs
the bundler to hand the Worker precompiled wasm modules, which cannot be proved
from a source checkout and would fail as a silent 500 on the one request a
crawler makes. `src/lib/security-passport/og-image/raster.ts` is pure TypeScript:
exact-coverage anti-aliasing, a PNG encoder, `@shuding/opentype.js` (outlines) and
`fflate` (deflate), both locked and pure JavaScript. The fonts are the site's own
OFL Manrope 500/700 and Sora 700, converted from woff2 to TrueType and embedded
(`fonts.generated.ts`) because a Worker has no file system for assets and must not
call itself. To regenerate: decode `public/fonts/{sora-700,manrope-500,manrope-700}.woff2`
to TTF (for example with `wawoff2`) and write the three base64 strings.

First request costs about 0.3 s of CPU in Node (parsing three fonts, then the
fill and a level-1 deflate of 2.3 MB); the parsed fonts are kept for the life of
the isolate. **Measure it on the real Worker** in the HTTPS test environment
before publication.

## A personal share is named

There is no anonymity or initials choice in this flow. The create accepts only
`full_name`, and **the server reads the holder's privacy setting first** (failing
closed): if it hides the name, nothing is created and the answer is
`name_not_approved`. The screen says why and links to `/passport/privacy`. It
changes nothing on the holder's behalf — neither the setting nor any earlier
share's approval. It also says that changing the setting applies to earlier
shares that were approved with the name.

## Select all

`selectState` / `withAll` (`src/lib/security-passport/merit-selection.ts`) are the
only logic: *none*, *some* (indeterminate), *all*. A group's box and the global box
add only keys the page passes in, so a rule that makes a merit unchoosable stays
in force. Employment, documents and credentials that have expired are not offered
publicly; the screen says so once.

## Account switch, session loss

The page is keyed by the signed-in user id. A different account (another tab, a
refreshed session) mounts a fresh page — no selection, consent, prepared image,
public link or result carries over — and says so. Session loss is the
authenticated layout's existing redirect to sign-in.

## The live counter

`NETWORK_STATS_QUERY` re-reads `sp_network_stats()` about once a minute while the
page is visible (never in a background tab), on returning to the tab, on
reconnect, and when a Passport write invalidates `["sp-network-stats"]`. A failed
read **throws**: the query keeps the last good figures and a failure is never a
zero. The update time is shown. Production display stays `hidden` until the owner
publishes.

**Number ≠ count ≠ score.** The *number* is a holder's stable `#n`. The *count* is
how many real, completed and declared Passports exist. There is **no individual
"live score"** in the Passport today (it shows each credential's own trust word,
a milestone of verified years of employment, and nothing that ranks people); none
was built.

## Tests

* `bun run passport-public-share:check` — parsing as an allow-list, the link
  preview, select-all, the error map and the shape of the page and server calls.
* `bun run passport-og-image:check` — the preview image: a valid, deterministic
  1200×630 PNG, an unselected merit cannot be drawn, planted private values do
  not reach it, each shield level's own shape, gold only on verified, long lists
  and names, the route's source contract and the server's named-share rule. 11
  negative controls (`negative-controls:passport-og-image`).
* `bun run passport-social-image:check` — the image for every format and
  language, including the number and the founder line, and the flow's source
  contracts (consent gate, popup, cancel, no effect creates a share).
* `bun run e2e:sharing` — the studio in a browser (390/1280), select-all,
  consent, popup blocked, retry key, the 25 limit, withdrawal, Instagram, account
  switch, eleven credentials, the empty Passport.
* `e2e/passport-public-pilot-local.spec.ts` case S — the same against a real
  local database: the share row, the raw HTML a crawler reads, the page for a
  stranger, withdrawal, and that no private link is created. It also fetches
  `/og/share/<id>` and requires the served bytes to equal what the controlled
  model draws from the database payload, that the query selects nothing, that a
  stricter privacy setting, expiry and revocation change or stop it.
* `.github/workflows/og-worker-evidence.yml` — the BUILT Cloudflare bundle in
  workerd, over http and https, against a loopback stand-in: the image on first
  and later requests, the deterministic revoked / expired / read-error fixtures,
  a flipped answer taking effect on the very next request, the whole selection
  behind the link, and pictures at 1440 and 390. The build is given a synthetic
  project for both tiers and `og-build-isolation:check` refuses an output that
  still carries the real key or address; the browser evidence fails on any
  request that leaves the test origin.
* `bun run og-public-test:check` — the manual public test deployment: no
  workflow expression inside a shell, closed-choice inputs validated through the
  environment (run with hostile dummy values), a test build cut off from the real
  project with the built output checked, a stateless stand-in. 11 negative
  controls (`negative-controls:og-public-test`).
* **Not proven by any of this:** LinkedIn's Post Inspector, LinkedIn's real share
  box and a real phone's share sheet. They need an HTTPS test environment with a
  synthetic Passport and a person logged in; see the release note.
