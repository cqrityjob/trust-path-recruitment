# Security Passport: social sharing, completed

Pull request cqrityjob/trust-path-recruitment#326. Application code, its guard and the
real-backend walk. No migration, no edge-function change, no new dependency, no new
service.

## 1 · What the owner found after #318

1. **The Passport did not follow into the post.** "Dela på sociala medier" → LinkedIn
   opened LinkedIn's feed and nothing else. A line under the list said to attach "the
   image you downloaded", which the holder may never have downloaded.
2. **Only three credentials could be chosen.** The fourth checkbox was disabled with "The
   image holds three credentials."

## 2 · What earlier versions did

Recovered from the history before anything was changed.

| When          | Commit                                           | Social sharing then                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-17    | `d03e9b33` (owner-approved Phase 1/1B prototype) | A fixture card that named the first three _verified_ credentials itself: `MAX_SOCIAL_CREDENTIALS = 3`, "so the card stays a summary rather than a dossier".                                                                                                         |
| 2026-08-17    | `908d6057` (Phase 5)                             | Every channel carried the private share link: device share sent the link only; LinkedIn, Facebook, X, WhatsApp and e-mail were link intents; four image downloads; Instagram as a Story download.                                                                   |
| 2026-08-17    | `97047d6f`, `5e79eb8e`                           | LinkedIn: the personalised link preview evaluated and **not** shipped (`docs/architecture/passport-linkedin-preview-evaluation.md`); instead a walkthrough -- preview the exact card, download it, three plain steps to attach it -- that said attaching is manual. |
| 2026-08-20    | `f4c5628d`                                       | Device share handed over the card **image file** with the link, falling back to the link alone, then to a copy. Instagram wired to the Story image. The LinkedIn profile entry.                                                                                     |
| 2026-09-07    | `1a732ebd`                                       | Sharing became choose → preview → send. The social pieces were left unreachable.                                                                                                                                                                                    |
| 2026-09-15/16 | `1a043ea9`, `d8bd0268`                           | Field consent from the credential page (`CredentialShareActions` stays unreachable); a profile title only with explicit consent.                                                                                                                                    |
| 2026-09-28    | `d32c6da5` (#318)                                | Social sharing restored without a link by default; device share with the image where the browser can share files; platform buttons opened a composer with no image; the selection stopped at three.                                                                 |

Nothing earlier could put an image into a LinkedIn, Facebook, X, WhatsApp or e-mail post
from the web. The image reached a post two ways: the device share sheet with the file,
and the holder attaching a downloaded file. The LinkedIn walkthrough said so; #318's
platform list did not, and did not prepare the file.

## 3 · Why three

- **Origin:** the prototype card chose credentials _for_ the holder, so it named a few:
  a product decision about an automatic card.
- **The block:** #318 exported that number as `SOCIAL_CREDENTIAL_LIMIT` and stopped the
  selection at it, because one image has three columns. A layout limit, not a privacy
  rule: the database accepts up to 200 merits in one share, and what may appear is
  decided by the holder's selection and the server's preview, not by a count.

## 4 · What changes

### More than three: a set of images

- One image draws up to three credentials, in the shared card's three columns
  (`SOCIAL_CREDENTIALS_PER_IMAGE`). That is now a limit of the drawing only.
- A larger selection is a **set of whole images**, three to each, in the order the
  shared presentation lists them (`socialCardPages`). Each image carries the holder, the
  footer, and the link and QR code if the holder chose one, because a platform may show
  any one of them alone. Each says which it is: "SECURITY PASSPORT · 2 / 4".
- The preview shows every image of the set; each has its own "Ladda ner" and, where the
  device can share files, "Dela". "Dela bilderna" hands over the whole set.
- Nothing selected is dropped. A credential that is not valid today is still not drawn,
  and the page says so, as before.

### What each way out does

The PNGs are made ahead of any press from exactly the SVGs on screen, so a press hands
them over while the browser still counts it as the holder's own action, and what is
shared is, pixel for pixel, what the preview shows.

| Button                                                                       | What happens                                                                                                                                      | What the holder is told                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Dela bilden / bilderna** (device share, where the browser can share files) | The PNG files themselves go to the operating system's share sheet; the holder picks LinkedIn, Instagram, Facebook, WhatsApp, Mail …               | "Bilden bifogas. Välj app i menyn …" and afterwards "Bilden finns nu i appen du valde. Slutför inlägget där." |
| **Ladda ner bilden / bilderna**                                              | The exact PNG(s) are downloaded.                                                                                                                  | --                                                                                                            |
| **LinkedIn**                                                                 | The PNG(s) are downloaded, then `linkedin.com/feed/` opens.                                                                                       | "Din Security Passport-bild är klar. Lägg till bilden i ditt inlägg."                                         |
| **Facebook**                                                                 | Downloaded, then `facebook.com` opens.                                                                                                            | The same.                                                                                                     |
| **X**                                                                        | Downloaded, then the post composer opens with the sentence.                                                                                       | The same.                                                                                                     |
| **WhatsApp**                                                                 | Downloaded, then `wa.me` opens with the sentence.                                                                                                 | The same.                                                                                                     |
| **E-post**                                                                   | Downloaded, then the mail program opens with subject and sentence.                                                                                | "… Bifoga bilden i ditt mejl."                                                                                |
| **Instagram**                                                                | The preview switches to the Story format, and the Story PNG(s) are downloaded. Nothing is opened: Instagram has no web page to post a story from. | "… klar i Story-format. Lägg upp den från Instagram-appen."                                                   |

Only the device share says the image is attached, because only there is it.

### The link stays optional

No link and no QR code unless the holder creates one for exactly this selection and
ticks it in. Then it is printed on every image of the set, given to each platform's page
as the address to share, and handed to the device share with the files. It opens exactly
what the images show and ends when revoked.

### A long name stays on the card

Found while walking the set: a name wraps at its spaces, so "Alexandra
Konstantinopoulou-Lindqvist" ran past the card's edge. A holder's name whose widest line
does not fit is now drawn smaller, and one word too wide for its column makes the card
smaller, as a long place or trust word already did.

## 5 · Privacy and security

Unchanged by construction: the set divides the credentials the card already carries.
The images are built from the server's preview of exactly the holder's selection, so
nothing unselected can appear. The same safe model (`SocialCardModel`) and drawing are
used; no issuer, number, date, document, storage path, employer, verifier, method or
authorisation scope reaches any image. Nothing is posted for the holder; no link is
created except by the holder's own press.

## 6 · Verification

- **The real-backend walk** passed 22 of 22 at `689541f0`: every case at 1440 and 390,
  in Swedish and English, behind the stand-ins for hosted Supabase's HTML restriction and
  the host's analytics. The dev server re-bundled nothing. Later commits change only the
  social-image check's types and this note. Case S now walks:
  - **one credential:** one image. On the phone, the share sheet is handed the PNG file
    itself, pixel for pixel the preview, with no link. A browser that cannot share files
    is not offered the sheet;
  - **three:** one image. LinkedIn, X and WhatsApp each receive the previewed PNG as a
    download, open their own page, and show "Din Security Passport-bild är klar. Lägg till
    bilden i ditt inlägg.";
  - **a Passport of fifteen:** nothing is blocked. The 11 credentials valid today are on
    4 images (3, 3, 3 and 2), each marked, with no text under 16 px on 1080 and no stated
    issuer or holder id. Every download and every shared file is its preview, pixel for
    pixel;
  - **no link along the way,** counted in the database. A link made on purpose opens
    exactly the selection, and nothing once revoked.
- **Before and after, on the same data:** on `main` (`f25e05f8`) the same holder is
  stopped at 3 of 15 (12 checkboxes disabled), and LinkedIn opens its feed with no
  download and no message. On this branch 7 are selected, shown as 2 images, and LinkedIn
  downloads both and says to add them.
- **The CI `verify` job's steps, run locally:** 163 of the 164 pass, including both
  type-checks, all Passport guards and the production build. The one red step is the
  repository-wide ESLint, which CI runs with `continue-on-error`: 929 problems here and
  929 on `main`, none in a file this PR changes.
- **`passport-social-image:check`** makes 362 assertions (116 before).
- **Negative controls:** all 50 groups pass: 1,522 planted defects, each one caught.
  `social-image` catches 15 of 15. The nine new ones: a selection cut to three, a set
  crammed onto one image, an image of a set that does not say which it is, an issuer
  printed on the image, a platform button claiming the image went along, a share sheet
  given no files, a download that creates a link, a long name past the card's edge, and a
  long word into the next column. `SOCIAL-NO-LIMIT`, which encoded the old cut, is gone.
- **Stubbed browser suites:** `e2e:surfaces` (a CI suite) passes 22 of 22. `e2e:sharing`
  (not in CI) passes 42 of 44; its case 12 fails on `main` as well, on a stale "Läs mer"
  expectation outside this PR.
- **Not verified here:** a physical phone, and the platforms themselves. No account is
  used from this sandbox, and nothing may be posted.

## 7 · What the web cannot do

- **No platform accepts an image from a web link.** LinkedIn's share URL takes a page
  address; Facebook's sharer takes a page address and reads its preview image from it;
  X's intent takes text, a URL, hashtags and a handle; WhatsApp's click-to-chat takes
  text; `mailto:` takes no attachment; Instagram has no web share at all. Posting an
  image through a platform's API would mean CQrityjob publishing on the holder's behalf,
  which this product does not do.
- **The device share sheet** can take files in Safari on iPhone, iPad and Mac, Chrome on
  Android, and Chrome and Edge on Windows and ChromeOS; not in Firefox on a computer or
  Chrome on Linux, which see the download path. Which apps appear in the sheet, and how
  many images each takes (X: four; an Instagram story: one at a time), is up to the
  device and the installed apps.
- **Several downloads:** a browser may ask once to allow a site to download several
  files.
- **iPhone:** a downloaded image is saved to Files, not Photos. "Dela bilden" is the way
  to put it in a post there.
- Verified here with an instrumented share sheet that records the files it is handed,
  not on a physical phone.

## 8 · Release

Merge and publish. There is nothing to configure and no migration. On the published site,
as the owner:

1. On a phone: Dela → Dela på sociala medier → choose credentials → **Dela bilden** →
   LinkedIn in the menu. The image is in the post.
2. On a computer: the same, then **LinkedIn**. The image is downloaded, LinkedIn opens, and
   the page says to add the image.
3. Choose more than three credentials. The preview shows a set, and every image is shared.
