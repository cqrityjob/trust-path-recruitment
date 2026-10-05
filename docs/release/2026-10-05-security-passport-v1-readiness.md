# Security Passport V1 — readiness, publication order and rollback

**Status: V1 live.** #433 is merged (`be8b914`) and published through Lovable;
the live flow was verified on www.cqrityjob.com with the owner's own shares,
LinkedIn fetched the personal image, the phone test passed, and the two
approved production actions (founder designation, statistics display) were
executed on 2026-10-05 and verified read-only afterwards. What remains is
listed in section 7.

## 1. What is being released

| Piece                                                        | Where                        | State                                                                          |
| ------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------ |
| Schema: numbers, founder, count rule, public share           | #430 (merged), #432 (merged) | applied and verified on the hosted project                                     |
| Application: share screen, public page, number, live counter | #431 (merged, `2d21057`)     | on `main`; Lovable at `2d21057`; `/s/<id>` is live on www.cqrityjob.com        |
| Personal preview image, named shares, test-deployment guard  | #433 (merged, `be8b914`)     | on `main`; Lovable at `be8b914`; `/og/share/<id>` is live on www.cqrityjob.com |

#433 carries **no migration**. Nothing in this release needs a migration run.

## 2. Product requirements — verified, needs fixing, not tested

| Requirement                                                                                                                                                       | Verdict                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The name is _Security Passport_, with country/jurisdiction                                                                                                        | **verified**                                                        | Image: brand line, "SECURITY PASSPORT", holder's country via `formatJurisdiction` (`og-image/model.ts`); public page: "rec.jurisdiction" row (`RecipientPassportView.tsx`); on-screen card: credentials grouped under their country labels (`SocialCardSvg.tsx`). `passport-og-image:check` asserts "Sverige"/"Sweden".                                                                                                                              |
| Passport #1 belongs to the owner's verified main account and shows _Mostafa Alshawi – Grundare av CQrityjob_; account id checked server-side; both accounts kept | **verified; production action A executed 2026-10-05 (section 6)** | `sp_designate_founder` refuses any signed-in caller, requires `superadmin` + a completed, declared Passport, refuses a second founder and a retired #1 (SQL tests). Card: name line + separate designation line, never a shield, never gold (hermetic tests 23/23b, `passport-og-image:check`). Identity re-checked read-only before the action; the owner's second account stays a separate admin, excluded by the staff rule, merits kept. |
| Other Passports from #2; unique and stable on reload, edit and concurrent calls                                                                                   | **verified**                                                        | Numbers are a server row assigned once on completion (`sp_assign_passport_number`, per-holder advisory lock, unique index, retire-never-reissue trigger); SQL test file (111 assertions) and `scripts/db-test.sh` two-process races. The page only reads (`sp_my_passport_number`); an edit changes no number.                                                                                                                                       |
| The live counter fetches the current result; a change reaches the Passport and the next generated image                                                           | **verified**                                                        | Counter: `invalidatePassportAndCareer` invalidates `NETWORK_STATS_KEY` on every Passport write; refetch ~60 s while visible and on focus; a failed read keeps the last figures (never a zero). Image: drawn per request from `sp_get_social_share` with `no-store`; a flipped answer takes effect on the very next request (Worker evidence); a withdrawn merit changes the next image and page against a real database (case S, `164d9f5`).         |
| Trainings chosen in one combined picker from the governed catalogue; VU1, VU2, ordningsvakt, skyddsvakt with correct shields and statuses                         | **verified**                                                        | Catalogue codes `VU1`, `VU2`, `OV`, `SV` (+ `OV_TRAINING` …) in `fixtures/credential-types.ts`; one search over every approved definition (`e2e/passport-credential-picker.spec.ts`, `passport-credential-picker:check`); shields per presentation state (`passport-credential-shield` guard); the image never raises a credential above the shared presentation (`passport-og-image:check`, 11 negative controls).                                  |
| Sharing is named and respects the holder's approval; the image shows at most six selected merits and "+ N fler"; the link opens the whole approved content        | **verified**                                                        | Server refuses a hidden name before creating (`name_not_approved`); consent box gates every public action; `MAX_ROWS = 6` with "+ N fler meriter på sidan"; the page behind the link lists all 40 of a 40-merit share (Worker evidence); an unselected merit is absent from preview, share row, page and image (hermetic 26, case S).                                                                                                                |
| Statistics counted only for `passport_page`                                                                                                                       | **verified**                                                        | `mayShowNetworkStats`: the Passport page shows when the owner has set `passport_page` or `public`; the homepage only on `public`. The server answers `{"display":"hidden"}` until the owner changes it. Action B set `passport_page` on 2026-10-05 (section 6). Counting: completed + declared holders, staff excluded, the founder the one narrow exception, per-market figures behind a threshold of five.                                                         |

Nothing in this review needed a code fix beyond the two case-S additions in
`164d9f5` (an unselected merit stays private against a real database; a merit
withdrawn after the share drops off the next page and image).

## 3. The whole sharing flow, end to end

Synthetic people only. Hermetic (`e2e/passport-sharing.spec.ts`, tests 23–35)
and against a real local database (`e2e/passport-public-pilot-local.spec.ts`,
case S) plus the built Worker (`og-worker-evidence`):

| Step                                                       | Proved by                                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a Passport, save credentials from the catalogue     | pilot cases A, A·D·E                                                                                                                                     |
| Choose merits (all in from the start; leave one out)       | hermetic 23/26 (preview loses the shield and its words); case S (share row never pins it, page never carries it)                                         |
| Approve the name                                           | consent box; server rule; hermetic 33/33b                                                                                                                |
| Create the share (LinkedIn opens its own box on `/s/<id>`) | hermetic 24–28; case S (row, no private link)                                                                                                            |
| Open the public page as a stranger                         | case S; Worker evidence (raw HTML, `noindex`, no private identifier)                                                                                     |
| Fetch the personal image                                   | case S (served bytes = controlled model from the database); Worker evidence (valid PNG, first and later requests, 20 in parallel, query selects nothing) |
| Private and unselected data never exposed                  | `passport-og-image:check` (planted e-mail, user id, issuer, certificate number, phone); case S (uid, e-mail domain, employer name absent)                |
| Expiry after the page and image were fetched               | case S: image 404 `no-store`; page unavailable                                                                                                           |
| Revocation after fetch                                     | case S; Worker evidence (next request)                                                                                                                   |
| Privacy tightened after fetch                              | case S (image changes at once, back when loosened)                                                                                                       |
| A merit withdrawn after fetch                              | case S (`164d9f5`)                                                                                                                                       |
| Cache                                                      | `cache-control: no-store` on the image and 404s; `?v=<approval time>` on `og:image` so a platform refetches a changed card                               |

**Our revocation versus a platform's copy.** Revocation and expiry stop the
page and the image _at CQrityjob_ on the next request. A platform that already
fetched the picture may keep its copy; the share screen says so before anything
is made ("Sociala medier kan behålla bilden även om du senare återkallar
länken"). Nothing can recall a copy LinkedIn already holds.

## 4. External validation — verified live on the production domain

The external checks were run on **www.cqrityjob.com after publication**, with
the owner's own Passport and shares, instead of on the temporary Cloudflare
test deployment (which stays available as `og-public-test.yml` for future
work; it was not needed).

| Check                    | Result                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/og/share/<id>` live    | PNG for an active share; plain-text 404 with `cache-control: no-store` and `x-robots-tag: noindex, nofollow` for an unknown or revoked id                                      |
| Image = controlled model | two of the owner's shares fetched live were byte-equal to the local render of the same database model; a merit left out of the selection was absent from page and image        |
| LinkedIn Post Inspector  | fetched the personal image (number, name, country, shields) from `/s/<id>` on the real domain; owner's screenshot                                                              |
| LinkedIn share box       | opened with the personal card; nothing was posted                                                                                                                              |
| Phone                    | share sheet opened with the PNG; cancel saved nothing; QR of the private link opened the Passport (owner confirmed)                                                            |
| Revocation after fetch   | the owner revoked the public share: `/s/<id>` answers "not available" with the branded image and no name, `/og/share/<id>` answers 404, the database rows are `revoked = true` |

**Not measured:** Worker CPU time on Cloudflare's network (only the Cloudflare
dashboard shows it; the owner can read it under Workers → Metrics). Local
workerd figures from CI (not Cloudflare's network): first image request 216 ms
(http) / 253 ms (https), later ones 39–66 ms, twenty in parallel 673–725 ms in
all; workerd resident memory 88 + 186 MB before and 97 + 374 MB after.

## 5. Publication — exactly what, where, dependencies, rollback

**Via Lovable (production):**

1. Owner merged #433 into `main` (`be8b914`); `main` synced to the Lovable
   project (Lovable's latest commit read back as `be8b914`).
2. Owner pressed **Publish** in the Lovable editor. Lovable built with the
   default Cloudflare preset and deployed its Worker; nothing else was
   deployed. **Done 2026-10-05**; `/og/share/<id>` is live.

**Separate Worker flow:** none for production. `og-public-test.yml` is a
manual, temporary TEST deployment on the owner's own Cloudflare account with
invented people; it is not part of publication and is torn down afterwards.

**Configuration dependencies (nothing new):**

- server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (already set by Lovable
  Cloud; the image route reads only these, with the publishable key);
- client: the tracked `.env` (unchanged);
- `VITE_PUBLIC_SITE_URL` optional (falls back to `https://www.cqrityjob.com`);
- fonts embedded in the bundle; no wasm, no new secret, no new service, no
  migration.

**Rollback:**

- Code: `git revert -m 1 <merge commit of #433>` on `main` and Publish again
  (no history rewrite; Lovable keeps its own version history as a second
  path). The share screen then falls back to the branded `og:image`; nothing
  stored is affected because #433 changed no schema.
- Founder designation (action A): a number is never reissued — removing the
  row retires #1 permanently. That is why the identity check gates it; treat
  it as one-way.
- Statistics display (action B): `sp_set_network_stats_display('hidden')`
  takes effect on the next read.

**After publication, live check:** done with the owner's own Passport (see
section 4): merits chosen → name approved → share created → `/s/<id>` logged
out → `/og/share/<id>` byte-equal to the model → Post Inspector on the real
domain → revoked → both answer "not available".

## 6. Production actions A and B — executed 2026-10-05

Both were approved by the owner after the external tests, both were run
through the already authorised operator paths, no migration was applied, and
nothing else about either account changed.

**A — founder designation.** Identity re-checked read-only immediately before
(account id and e-mail local part matched the owner's statement, the account
holds the superadmin role, its Passport is completed and declared, no number
existed, #1 was free and not retired). Then `sp_designate_founder(<owner>)`
returned number 1. Post-check: `sp_passport_numbers` holds exactly one row,
number 1, designation `founder`, held by the owner's main account. The
owner's second account keeps its merits and stays excluded from the count by
the staff rule, as decided. The public share read joins the holder's current
number row, so every share the owner creates from now on carries
"Security Passport #1" and "Grundare av CQrityjob" on the page, in the
`og:image:alt` and on the image; the owner has not yet created a share after
the designation, so that rendering is confirmed in code and by the fixture
tests, not yet by a live image (section 7).

**B — statistics display.** `sp_set_network_stats_display('passport_page',
…)` run as the owner's account. Post-check: `sp_network_stats_policy.display =
'passport_page'`, `changed_by` = the owner's account. A logged-out read of
`sp_network_stats` on the hosted project now returns display `passport_page`,
1 Passport, 9 credentials, no market reaching the threshold. The Passport page
reads exactly this call (once a minute while visible, on focus, and when the
app invalidates it), so the counter shows 1 and is derived, not stored; the
homepage shows nothing, because display is not `public`.

## 7. Remaining

- **Live founder image:** the owner creates one new share and opens `/s/<id>`;
  the page, the `og:image:alt` and `/og/share/<id>` should show
  "Security Passport #1" and "Grundare av CQrityjob". The database and the
  renderer already produce this (fixture `FounderFounderFounderFou`).
- **VU1 duplicate** on the owner's accounts: handled by the owner.
- **Worker CPU time** on Cloudflare: read from the dashboard when wanted.
- The temporary test deployment workflow is unused; nothing to tear down.
