# Security Passport — personalised LinkedIn preview: evaluation and decision

**Date:** 2026-08-17 · **Time box:** 4 active engineering hours · **Outcome: polished fallback shipped; preferred path documented as viable follow-up with named gates.**

## The preferred experience under evaluation

1. Holder previews the exact public card.
2. Holder confirms visual sharing.
3. LinkedIn receives a unique link.
4. LinkedIn renders the card as the link preview.
5. Clicking opens the live verification page (`/p/<token>`).
6. Only permitted public information appears.

## What was established empirically

**Per-route Open Graph metadata is crawler-readable today.** `curl` against the
built TanStack Start output shows the `head()` meta of `p.$token.tsx` —
`og:title`, `og:description`, `twitter:card` — present in the raw server HTML
even though the route is `ssr: false`. LinkedIn's crawler does not execute
JavaScript, so this was the first hard gate, and it passes. A follow-up could
therefore emit a per-share `og:image` URL from `head()` without enabling SSR
for the page body.

## The remaining gates, and why they fail inside this time box

**Gate: a unique, publicly fetchable PNG per share.** LinkedIn requires a
raster `og:image` (SVG is not accepted) at an unauthenticated URL. Two
implementation routes exist inside the current Lovable + Cloudflare Workers
architecture:

1. **Render at share creation, store, serve.** The client already renders the
   exact card as a PNG (`buildSocialSvg` → `svgToPngBlob`), so generation is
   solved. Storage is not: serving it publicly needs a public bucket or a
   token-keyed public read policy — a migration on the hosted project, which
   this session must not apply.
2. **Render on demand in a server route** (Satori + `resvg-wasm`). Bundle
   arithmetic: `resvg-wasm` ≈ 1.3 MB wasm + Satori ≈ 500 KB + at least one
   embedded font ≈ 300 KB. That fits a paid Workers plan (10 MB) but is not
   verifiable against Lovable's actual deploy limits from this environment,
   and wasm initialisation inside TanStack Start server routes on that
   platform is untested here.

**Gate: acceptable end-to-end verification.** The only authority on what
LinkedIn actually renders is LinkedIn's crawler (Post Inspector) hitting a
public URL. This session does not deploy to production (explicitly out of
scope), so the preferred path could not have been verified even if built —
it would have shipped as a guess, which the brief forbids ("do not claim a
visual result from source inspection alone").

**Standing design tension, to be resolved deliberately, not by default.** The
reviewed sharing architecture rejects per-holder images at public
crawler-reachable URLs because a cached image survives revocation
(`p.$token.tsx`, `LiveShareActions.tsx` carry the reasoning). The preferred
experience is still achievable within that constraint — image URL derived
from the share token's hash, `410` after revocation, plus the retention
warning — but platforms cache what they fetch, so the follow-up must treat
the retention wording as a *disclosure requirement*, not a mitigation.

## Decision

Ship the fallback now, as a first-class experience in the sharing centre:

1. Preview of the exact public card at LinkedIn's 1200×630.
2. One-click download of that image.
3. Copy / open the live share link.
4. Plain numbered instructions to attach the image to the LinkedIn post.
5. Swedish and English wording that platforms may retain previously published
   or cached images after the link is withdrawn.

The fallback never claims the image attaches automatically, and the link's
generic branded preview is stated as what LinkedIn will show.

## Follow-up checklist for the preferred path (outside this branch)

- [ ] Decide the revocation/caching stance explicitly with the owner.
- [ ] Migration: public-read, token-hash-keyed storage prefix for share
      images, written at `sp_create_disclosure` time; deleted on revocation.
- [ ] `head()` on `p.$token.tsx` emits per-share `og:image` (metadata only —
      the page body stays client-rendered behind the throttle).
- [ ] Verify with LinkedIn Post Inspector against a staging deploy.
- [ ] Confirm Worker bundle/deploy limits with Lovable if the on-demand
      rendering route is preferred instead.
