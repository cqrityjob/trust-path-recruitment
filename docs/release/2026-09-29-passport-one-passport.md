# Security Passport: ONE holder, ONE Passport, ONE shareable image

Corrective product completion after owner UAT of 2026-09-28's social sharing. Application
code, copy, guards, negative controls, browser scenarios and visual evidence. No
migration, no edge-function change, no new dependency, no new service, no change to the
credential catalogue, the trust model, verification rules, RLS or disclosure permissions.

## 1 · Root cause

The 2026-09-28 completion (#326) drew the social image in three fixed columns and, to stop
cutting a holder's selection at three, turned a larger selection into a **set** of images
("SECURITY PASSPORT · 1 / 2", "4 credentials shown on 2 images"). That treated the
drawing's column count as a product rule. The product rule is the reverse: the holder has
ONE Security Passport, and the layout adapts to the credentials.

## 2 · Architecture

```
selected credentials (server preview, RecipientCredential)
        │  buildSelectedSocialCard        — the safe subset: no issuer, date, number …
        ▼
SocialCardModel (one model, every selected current credential, no page)
        │  groupPassportCredentials       — presentation only, from controlled scope
        ▼
PassportGroup[]  (global | jurisdiction:<CODE> | not_stated, first-appearance order)
        │
        ├─ SocialCardSvg   — the ONE image: square · Story · LinkedIn/OG · compact
        │     preview (SocialFrame) = download = device-share file = platform file
        └─ PassportGroupedShields / PassportGroupList — the same groups in HTML
              (homepage example; the accessible list beside the preview)
```

`src/lib/security-passport/passport-groups.ts` is the canonical grouping.
`SocialCardSvg` is the canonical renderer; every format is a different geometry of the
same model, never a different selection.

## 3 · Grouping rules

A credential's group is `resolveCredentialScope` over the same three controlled facts every
shield already resolves its flag from:

| Fact                                                          | Group                              |
| ------------------------------------------------------------- | ---------------------------------- |
| the definition declares `global_professional` (`scope_code`)  | `global` — globe, "Global"         |
| stored sub-jurisdiction, else jurisdiction (e.g. `AE-DU`, `SE`) | `jurisdiction:<CODE>` — flag, label |
| neither stated                                                | `not_stated` — last, "Area not stated" |

Nothing is inferred from a name; Dubai is not flattened into the UAE; Northern Ireland
stays apart from Great Britain; the catalogue is untouched. Trust stays on each shield.

## 4 · How the ONE image adapts

Six density tiers are tried in order (spacious → roomy → medium → dense → compact →
micro), the first that fits with every group on one row wins; failing that, the first that
fits at all. A tier changes shield size, type size, name lines and shields per row, never
which credentials are drawn. No critical text goes below **14 px per 1080 px** of width
(`READABILITY_FLOOR`); a Passport that would need smaller text is drawn complete and
reports `data-passport-fits="false"` with the overflow, and the share page says the format
is crowded.

| Credentials                    | Square 1080²                    | LinkedIn/OG 1200×630         | Story 1080×1920 |
| ------------------------------ | ------------------------------- | ---------------------------- | --------------- |
| 1–3                            | spacious, one heading per scope | spacious/medium, two columns | spacious        |
| 4 (one jurisdiction)           | roomy: four across              | compact                      | roomy           |
| 6 (two groups)                 | medium: two bands of three      | medium                       | spacious        |
| 8 (three groups)               | compact: bands share a row      | micro                        | spacious        |
| 11 (three groups, with link)   | micro: 4 · 5 · 2                | micro                        | dense           |

Landscape formats put the identity, the footer and any QR code in a left column so the
credentials get the full height. In portrait a QR code sits beside the identity band.

**Measured bound:** fifteen credentials across six scopes fit the Story; the square misses
by a few dozen pixels and the landscape formats by more at the floor. No limit was added:
the drawing holds all fifteen and says it is crowded. Moving the bound is the owner's call
(a lower floor, a smaller identity band, or advising square/Story).

## 5 · Surfaces

- **/passport/share, social choice:** one preview, one PNG, one file to the share sheet,
  one file per platform, with an accessible group list beside the preview
  (`PassportGroupList`). Copy no longer says "one image holds three".
- **Homepage:** the example is six fictional self-declared credentials in three groups,
  drawn by `PassportGroupedShields` — one person → one Passport → grouped credentials.
- **/passport wallet card, recipient card, employer application panel, My Career summary:**
  inspected, unchanged. They already show ONE Passport: the four-slot shield row is the
  owner-approved fixed identity object with every credential listed beneath it, and no
  surface pages or cuts a selection. Grouping those HTML cards the same way is a follow-up
  the owner can ask for; it was left out of this corrective PR to keep it focused.
- **India landing example:** unchanged (three credentials, one shield row); dev-only
  prototypes (`/dev/security-passport`, `CardStudio`, `buildPassportCard`'s three-credential
  fixture card) remain dev-only and are not the source of any production component.

## 6 · Social sharing

Preserved: generated PNG, preview = export, Web Share with files and `navigator.canShare`,
truthful LinkedIn/Facebook/X/WhatsApp/e-mail fallbacks, Instagram Story handling, download,
optional public link OFF by default, QR OFF by default, no automatic posting.
Changed: the device share receives ONE file; every platform prepares ONE file; the file is
`cqrityjob-passport-<format>.png`, never `-1-of-2`.

## 7 · Privacy and accessibility

The image is still built only from `SocialCardModel`, which cannot carry an issuer, date,
number, document, path, employer, verifier, method, note or authorisation scope; the guard
plants those values and asserts none is drawn. No link is created except by the holder's
press. The SVG carries `<title>` and `<desc>` naming the holder, every group and every
credential with its trust word; the share page repeats them as a visible list; the homepage
shields carry full accessible names.

## 8 · Tests

- `scripts/passport-social-image-check.tsx` (rewritten, 1038 assertions): the sixteen
  required proofs — 4/6/8/11/15 on ONE image in every format and language, each
  credential exactly once, controlled grouping, wrong-jurisdiction impossibility,
  international group, per-shield trust words, private fields, one file, one share, no
  implicit link, readability floor, canvas, holder dominance, no shield collision.
- `scripts/negative-controls/social-image-controls.ts` (21 planted defects, all caught):
  three-credential cut, "1 / 2" pages, three per image, fourth dropped, duplicate, wrong
  jurisdiction, flattened groups, guessed global, raised to verified, word per group,
  issuer on image, below-floor text, lowered floor, share ≠ preview, sheet handed a set,
  platform "images", "-1-of-2" file, implicit link, QR without link, no snapshot line, no
  words beside the preview.
- `e2e/passport-sharing.spec.ts`: scenario 23 (four credentials, three groups: one image,
  one download, one file to the sheet, LinkedIn one file, every format) and scenario 24
  (eleven credentials in both languages, every format fits). Case S of the real-backend
  walk (`passport-public-pilot-local.spec.ts`) now expects ONE image for the fifteen-credential
  holder.
- `passport-fixture-check`, `passport-card-surface-check`, `passport-persona-journey-check`
  moved from the three-credential / constellation expectations to the grouped model.

## 9 · Evidence

`docs/passport/one-passport-evidence/` — scenarios A–E in square, OG and Story, the
homepage at 1440 and 390, and the share page from the browser scenarios.
