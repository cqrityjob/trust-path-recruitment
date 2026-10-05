# Security Passport V1 — readiness, publication order and rollback

**Status: prepared, nothing merged or published.** Merge of #433, the two
production actions (founder designation, statistics display) and publication
each wait for the owner's explicit go-ahead. Read-only checks only.

## 1. What is being released

| Piece                                           | Where                 | State                                      |
| ----------------------------------------------- | --------------------- | ------------------------------------------ |
| Schema: numbers, founder, count rule, public share | #430 (merged), #432 (merged) | applied and verified on the hosted project |
| Application: share screen, public page, number, live counter | #431 (merged, `2d21057`) | on `main`; Lovable at `2d21057`; `/s/<id>` is live on www.cqrityjob.com |
| Personal preview image, named shares, test-deployment guard | #433 — see the PR for the final head | CI green on `fbaba5f`; `164d9f5` adds two case-S checks; this document is the last commit |

#433 carries **no migration**. Nothing in this release needs a migration run.

## 2. Product requirements — verified, needs fixing, not tested

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| The name is *Security Passport*, with country/jurisdiction | **verified** | Image: brand line, "SECURITY PASSPORT", holder's country via `formatJurisdiction` (`og-image/model.ts`); public page: "rec.jurisdiction" row (`RecipientPassportView.tsx`); on-screen card: credentials grouped under their country labels (`SocialCardSvg.tsx`). `passport-og-image:check` asserts "Sverige"/"Sweden". |
| Passport #1 belongs to the verified `sandleradam` account and shows *Mostafa Alshawi – Grundare av CQrityjob*; account id checked server-side; both accounts kept | **verified in code and tests; production action prepared, not run** | `sp_designate_founder` refuses any signed-in caller, requires `superadmin` + a completed, declared Passport, refuses a second founder and a retired #1 (SQL tests). Card: name line + separate designation line, never a shield, never gold (hermetic tests 23/23b, `passport-og-image:check`). The approval request names the account by internal id and role, re-verified read-only; `mostafa` stays a separate admin, excluded by the staff rule. |
| Other Passports from #2; unique and stable on reload, edit and concurrent calls | **verified** | Numbers are a server row assigned once on completion (`sp_assign_passport_number`, per-holder advisory lock, unique index, retire-never-reissue trigger); SQL test file (111 assertions) and `scripts/db-test.sh` two-process races. The page only reads (`sp_my_passport_number`); an edit changes no number. |
| The live counter fetches the current result; a change reaches the Passport and the next generated image | **verified** | Counter: `invalidatePassportAndCareer` invalidates `NETWORK_STATS_KEY` on every Passport write; refetch ~60 s while visible and on focus; a failed read keeps the last figures (never a zero). Image: drawn per request from `sp_get_social_share` with `no-store`; a flipped answer takes effect on the very next request (Worker evidence); a withdrawn merit changes the next image and page against a real database (case S, `164d9f5`). |
| Trainings chosen in one combined picker from the governed catalogue; VU1, VU2, ordningsvakt, skyddsvakt with correct shields and statuses | **verified** | Catalogue codes `VU1`, `VU2`, `OV`, `SV` (+ `OV_TRAINING` …) in `fixtures/credential-types.ts`; one search over every approved definition (`e2e/passport-credential-picker.spec.ts`, `passport-credential-picker:check`); shields per presentation state (`passport-credential-shield` guard); the image never raises a credential above the shared presentation (`passport-og-image:check`, 11 negative controls). |
| Sharing is named and respects the holder's approval; the image shows at most six selected merits and "+ N fler"; the link opens the whole approved content | **verified** | Server refuses a hidden name before creating (`name_not_approved`); consent box gates every public action; `MAX_ROWS = 6` with "+ N fler meriter på sidan"; the page behind the link lists all 40 of a 40-merit share (Worker evidence); an unselected merit is absent from preview, share row, page and image (hermetic 26, case S). |
| Statistics counted only for `passport_page` | **verified** | `mayShowNetworkStats`: the Passport page shows when the owner has set `passport_page` or `public`; the homepage only on `public`. The server answers `{"display":"hidden"}` until the owner changes it. Action B proposes `passport_page` only. Counting: completed + declared holders, staff excluded, the founder the one narrow exception, per-market figures behind a threshold of five. |

Nothing in this review needed a code fix beyond the two case-S additions in
`164d9f5` (an unselected merit stays private against a real database; a merit
withdrawn after the share drops off the next page and image).

## 3. The whole sharing flow, end to end

Synthetic people only. Hermetic (`e2e/passport-sharing.spec.ts`, tests 23–35)
and against a real local database (`e2e/passport-public-pilot-local.spec.ts`,
case S) plus the built Worker (`og-worker-evidence`):

| Step | Proved by |
| --- | --- |
| Create a Passport, save credentials from the catalogue | pilot cases A, A·D·E |
| Choose merits (all in from the start; leave one out) | hermetic 23/26 (preview loses the shield and its words); case S (share row never pins it, page never carries it) |
| Approve the name | consent box; server rule; hermetic 33/33b |
| Create the share (LinkedIn opens its own box on `/s/<id>`) | hermetic 24–28; case S (row, no private link) |
| Open the public page as a stranger | case S; Worker evidence (raw HTML, `noindex`, no private identifier) |
| Fetch the personal image | case S (served bytes = controlled model from the database); Worker evidence (valid PNG, first and later requests, 20 in parallel, query selects nothing) |
| Private and unselected data never exposed | `passport-og-image:check` (planted e-mail, user id, issuer, certificate number, phone); case S (uid, e-mail domain, employer name absent) |
| Expiry after the page and image were fetched | case S: image 404 `no-store`; page unavailable |
| Revocation after fetch | case S; Worker evidence (next request) |
| Privacy tightened after fetch | case S (image changes at once, back when loosened) |
| A merit withdrawn after fetch | case S (`164d9f5`) |
| Cache | `cache-control: no-store` on the image and 404s; `?v=<approval time>` on `og:image` so a platform refetches a changed card |

**Our revocation versus a platform's copy.** Revocation and expiry stop the
page and the image *at CQrityjob* on the next request. A platform that already
fetched the picture may keep its copy; the share screen says so before anything
is made ("Sociala medier kan behålla bilden även om du senare återkallar
länken"). Nothing can recall a copy LinkedIn already holds.

## 4. External validation — NOT VERIFIED

Not run: this environment cannot reach LinkedIn, Cloudflare or Lovable, and a
phone is physical. See `2026-10-05-external-tests-request.md` for the exact
steps. What the owner needs to do:

1. **A public https test address**: add `CLOUDFLARE_API_TOKEN` (Workers
   Scripts: Edit, one account) and `CLOUDFLARE_ACCOUNT_ID` as repository
   secrets, run the `og-public-test` workflow with `deploy`, read the addresses
   from its summary. Synthetic people only; `teardown` afterwards.
2. **LinkedIn Post Inspector** on `<app>/s/AbCdEfGhIjKlMnOpQrStUvWx`: expect
   her card (number, name, country, three shields) as the image; then the
   founder and forty-merit addresses; then the always-revoked and
   always-expired addresses (generic image, "not available").
3. **LinkedIn's real share box**: open
   `https://www.linkedin.com/sharing/share-offsite/?url=<app>/s/AbCdEfGhIjKlMnOpQrStUvWx`
   signed in. Do not post.
4. **A real phone** (an emulator is not evidence): signed in as a synthetic
   holder, "Dela mitt Security Passport" → consent → "Dela via appar": the
   sheet shows and hands over a PNG; cancel: no file saved. Scan the QR of a
   private link (`/p#…`) and open it.
5. **First-request time and Worker CPU time** on the test Worker: time
   `<app>/og/share/AbCdEfGhIjKlMnOpQrStUvWx` cold and warm; read CPU time in
   the Cloudflare dashboard (Workers → the test Worker → Metrics) — the only
   place it is measured.

**Local runtime verification (not Cloudflare's network):** in workerd on the
CI runner, the first image request took 216 ms (http) / 253 ms (https), later
ones 39–66 ms, twenty in parallel 673–725 ms in all; workerd's resident memory
(the whole runtime, two processes) 88 + 186 MB before and 97 + 374 MB after.
CPU time is not measured there.

## 5. Publication — exactly what, where, dependencies, rollback

**Via Lovable (production):**

1. Owner merges #433 into `main` (GitHub). `main` syncs to the Lovable project
   (verified read-only today: Lovable's latest commit is `2d21057`, the #431
   merge, and `/s/<id>` is live on www.cqrityjob.com; `/og/share/<id>` answers
   404 there until #433 is published).
2. Owner presses **Publish** in the Lovable editor. Lovable builds with the
   default Cloudflare preset and deploys its Worker; nothing else is deployed.

**Separate Worker flow:** none for production. `og-public-test.yml` is a
manual, temporary TEST deployment on the owner's own Cloudflare account with
invented people; it is not part of publication and is torn down afterwards.

**Configuration dependencies (nothing new):**

* server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (already set by Lovable
  Cloud; the image route reads only these, with the publishable key);
* client: the tracked `.env` (unchanged);
* `VITE_PUBLIC_SITE_URL` optional (falls back to `https://www.cqrityjob.com`);
* fonts embedded in the bundle; no wasm, no new secret, no new service, no
  migration.

**Rollback:**

* Code: `git revert -m 1 <merge commit of #433>` on `main` and Publish again
  (no history rewrite; Lovable keeps its own version history as a second
  path). The share screen then falls back to the branded `og:image`; nothing
  stored is affected because #433 changed no schema.
* Founder designation (action A): a number is never reissued — removing the
  row retires #1 permanently. That is why the identity check gates it; treat
  it as one-way.
* Statistics display (action B): `sp_set_network_stats_display('hidden')`
  takes effect on the next read.

**After publication, live check before V1 is declared done** (owner, or me
with a synthetic holder the owner creates): create a Passport → choose merits
→ approve the name → create a share → open `/s/<id>` logged out → fetch
`/og/share/<id>` (a PNG of that card) → Post Inspector on the real domain →
revoke → both answer "not available".
