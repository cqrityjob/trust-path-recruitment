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

`og:image` is the branded CQrityjob Security Passport image, identical for every
share. **No image is uploaded, stored or served from a client.** A client-supplied
picture can say anything — a header, size and weight check cannot tell a Passport
from a forgery — so the schema has no image column at all. A *personalised* image
would have to be drawn on the server from the same controlled payload; that needs
a rasteriser (for example `satori` + `@resvg/resvg-wasm`, a bundle and font
decision on the Cloudflare target) and is **not part of this change**. Until it
exists, the personal part of the preview is its title and description: the name,
the number, the founder line and the approved credentials, with no claim about
standing.

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
* `bun run passport-social-image:check` — the image for every format and
  language, including the number and the founder line, and the flow's source
  contracts (consent gate, popup, cancel, no effect creates a share).
* `bun run e2e:sharing` — the studio in a browser (390/1280), select-all,
  consent, popup blocked, retry key, the 25 limit, withdrawal, Instagram, account
  switch, eleven credentials, the empty Passport.
* `e2e/passport-public-pilot-local.spec.ts` case S — the same against a real
  local database: the share row, the raw HTML a crawler reads, the page for a
  stranger, withdrawal, and that no private link is created.
* **Not proven by any of this:** LinkedIn's Post Inspector, LinkedIn's real share
  box and a real phone's share sheet. They need an HTTPS test environment with a
  synthetic Passport and a person logged in; see the release note.
