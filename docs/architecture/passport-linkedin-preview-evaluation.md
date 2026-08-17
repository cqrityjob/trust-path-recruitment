# Security Passport — personalised LinkedIn preview: evaluation and decision

**Latest revision:** 2026-08-17 (second pass, with measurements)
**Decision: generic branded crawler preview + polished manual attach. The personalised automatic preview is NOT shipped, and is not claimed.**

## The preferred experience under evaluation

1. Holder previews the exact public card.
2. Holder confirms visual sharing.
3. LinkedIn receives a unique link.
4. LinkedIn renders the holder's card as the link preview.
5. Clicking opens the live verification page (`/p/<token>`).
6. Only permitted public information appears.

Steps 1, 2, 3, 5 and 6 all ship. Step 4 does not, for the reasons below.

## What was established by measurement, not assumption

**Per-route Open Graph metadata is crawler-readable.** `curl` against the
running server returns the recipient route's `head()` meta in the raw HTML —
`og:title`, `og:description`, `og:type`, `og:image`, `og:image:width/height/alt`,
`twitter:card` — even though the route is `ssr: false`. LinkedIn's crawler does
not execute JavaScript, so this was the first gate and it passes.

**There is real but thin bundle headroom.** The deployed Nitro/Cloudflare
worker is **1.33 MB gzipped** today. Cloudflare's limit is 3 MB gzipped on the
free plan, 10 MB paid. A Satori + `resvg-wasm` pipeline adds roughly
0.9–1.3 MB gzipped (the wasm binary dominates and compresses poorly) plus an
embedded font subset. That lands around 2.4–2.6 MB — under the free-tier limit,
but consuming almost all remaining headroom for the entire application, on a
plan this session cannot confirm. Worker *startup* CPU time is a second,
separate limit that wasm instantiation is known to press against.

## Why the personalised preview is still not shipped

**1. It cannot be verified here, and an unverified claim is the thing to avoid.**
The only authority on what LinkedIn renders is LinkedIn's own crawler. Proving
it requires Post Inspector, which requires signing into a LinkedIn account —
an action this session must not take. Shipping the pipeline and *describing* it
as working would be exactly the overstatement the brief forbids.

**2. A cached personalised image outlives the share, by construction.**
Crawlers fetch and cache `og:image` and cannot be told to forget it. Making the
image generic is not a workaround for that — it is the resolution. A generic
image is safe to cache forever because it is true forever, and because it is
byte-identical for every share, possessing it does not even reveal that a
particular share exists. A personalised one would be a durable public artifact
that survives revocation, which is precisely the failure `/p/<token>` exists to
prevent.

**3. Making it per-share safely requires reshaping the token.**
An opaque per-share image URL must not embed the share token, or the cached
image URL becomes a permanent copy of the secret that opens the live page.
Doing it properly means splitting the token into a public id and a secret,
which changes `sp_create_disclosure`, invalidates existing shares, and widens
the public surface — a change that needs owner sign-off on the revocation
stance, not a unilateral engineering decision inside this branch.

## What ships instead

**A real branded crawler preview.** Previously there was no `og:image` at all,
so a shared link rendered as bare text. `public/og-security-passport.png` is now
a 1200×630 card in the Passport's own visual language — deep navy, engraved
guilloche, the gold rule, and the four credential marks — carrying the product
name, a bilingual line, and "open the link for current status". It contains no
holder name, credential, milestone or jurisdiction.

It is generated from source (`buildGenericOgSvg` in `social-export.ts`) by
`scripts/generate-og-image.mjs`, so the committed asset is provably the same
drawing vocabulary as every other Passport surface rather than a separately
maintained file that drifts.

**The personalised card, attached deliberately.** The sharing centre still
previews the holder's exact 1200×630 card, downloads it as PNG in one action,
copies the live link, and gives three plain steps to attach it. The UI states
in Swedish and English that the automatic preview is the generic branded card,
that attaching the personal image is manual, and that platforms may retain
images already published or cached after a link is withdrawn.

## Follow-up checklist, if the owner wants the personalised preview

- [ ] Decide the revocation/caching stance explicitly — this is a product
      decision about durable public artifacts, not an implementation detail.
- [ ] Split the disclosure token into `public_id` + `secret` so an image URL
      can be opaque without carrying the secret.
- [ ] Render at share creation (the client already produces the exact PNG) and
      store it under the public id; delete or replace with the generic image on
      revocation and expiry.
- [ ] Emit the per-share `og:image` from `head()`, which needs only the public
      id from the route param — no data access, no SSR of the page body.
- [ ] Confirm the Cloudflare plan and measure the worker after any wasm is
      added, if on-demand rendering is preferred over render-at-creation.
- [ ] Verify with LinkedIn Post Inspector against a staging deploy before any
      claim of automatic personalised previews is made.
