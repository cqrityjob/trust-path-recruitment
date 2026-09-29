# Security Passport — ONE Passport, visual evidence

Owner decision, 2026-09-29: **one holder = one Security Passport = one shareable
Passport image.** Every credential the holder selects is on the one image, grouped by
where it applies. There is no "SECURITY PASSPORT · 1 / 2" and no count at which a
second image begins.

Every image here is the **actual production drawing** (`SocialCardSvg`), rendered by
`scripts/passport-one-passport-evidence.tsx` from real catalogue codes with a fictional
holder, and rasterised with the pre-installed Chromium at the format's true pixel size.
The same component draws the share-page preview, the download, the device-share file and
every platform hand-over, so these are the images a holder gets.

`render-index.txt` lists every rendered variant (both languages, with and without a
link) with the density tier the drawing chose, whether the whole Passport fit at the
readability floor, the number of groups and the number of shields.

## The owner's scenarios

| Scenario                                             | Files                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A · four credentials, one jurisdiction (Sweden)      | `A-4-one-jurisdiction-{square,og,story}-sv.png`                                                     |
| B · six credentials, two groups                      | `B-6-two-groups-{square,og,story}-sv.png`, `B-6-two-groups-square-en-link.png` (link and QR)        |
| C · Swedish + international professional             | `C-sweden-and-international-square-en.png` (VU1 · VU2 · OV and CPP · PSP · PCI)                     |
| D · eight credentials, three groups                  | `D-8-three-groups-{square,og,story}-sv.png` (Sweden, international, Dubai)                          |
| E · the densest realistic holder, eleven credentials | `E-11-densest-{square,og,story}-sv.png`, `E-11-densest-{square,og}-en-link.png` (eleven, with link) |
| one credential                                       | `one-credential-square-sv.png` (the spacious presentation is unchanged)                             |
| three credentials, three scopes                      | `three-mixed-{square,og}-sv.png` (Dubai, Sweden, international — one shield each)                   |

Every scenario is ONE image in every format. Square is 1080×1080, LinkedIn/OG 1200×630,
Story 1080×1920.

## The homepage

`homepage-{sv,en}-desktop-1440-example.png` and `homepage-{sv,en}-mobile-390-example.png`:
the public example, six fictional self-declared credentials in three groups, drawn by the
same grouping and the same shields (`PassportGroupedShields`).
`homepage-en-desktop-1440-passport-section.png` is the whole section.

## The share page

Captured by `e2e/passport-sharing.spec.ts` (scenarios 23 and 24, stubbed backend) with
`PASSPORT_SHOTS` set: `after-social-one-passport-4-sv-{1440,375}.png` (four credentials
in three groups, desktop and phone) and `after-social-one-passport-11-*-{1440,375}.png`
(eleven credentials: square and OG in Swedish at 1440 px, Story in English at 1440 px,
square in English at 375 px). Every page carries one preview, the grouped list beside it,
and "Ladda ner bilden" / "Dela bilden" in the singular.

## What was checked by eye, per dense image

- no clipping, no overlap, no text outside the card, no shield collision;
- no critical text below 14 px per 1080 of width (asserted by the guard as well);
- the holder's name stays the largest text;
- one heading per country/area, every shield under its own heading;
- every shield keeps its own trust word ("Egenrapporterad" / "Dokumenterad");
- the Story sits nearer the middle, where a platform's own chrome does not cover it.

## The measured bound

Fifteen credentials across six scopes (`F-15-stress`, in `render-index.txt`) fit the Story
and miss the square by a few dozen pixels at the 14 px floor; the short landscape formats
miss by more. The drawing still holds all fifteen and reports the overflow
(`data-passport-fits="false"`, `data-passport-overflow`), and the share page says the
format is crowded rather than cutting or shrinking. No seeded holder reaches that; the
densest (eleven, three groups) fits every format with a link and QR code. Moving that bound
is the owner's decision.
