# Abu Dhabi as a public pilot — what is prepared, and what the owner decides

Status: **prepared, not applied.** Nothing in this note has been run against production. Merging the
PR is the decision to open; nobody else takes it.

PR 3 of 3 in the global-registration delivery, independent of the other two (the United States
schema and the application). Data only.

## 1 · What the owner asked, and what was found

> "Prepare the opening of AE-AZ as public_pilot. Check the seven definitions' sources and catalogue
> approvals. Update the tests that require Abu Dhabi closed. Do not mark the legal review complete."

| Checked | Found |
|---|---|
| The seven definitions | Authored by `20260914092000` from the Ministry of Interior's private-security framework. **Their own migration states that nobody has pinned the exact page**, and names that reading as the first item of the pack's legal review. Names are English in both languages; no reference pattern, no typical validity, no Arabic name — all deliberately unknown. |
| The registered source | `ae_moi_private_security` (`https://www.moi.gov.ae/en/default.aspx`), registered **unread**: no `checked_on`, no fingerprint, `review_needed`. The weekly monitor does not parse it. This session could not read it either (outbound access to that host is blocked), so it stays unread. |
| Catalogue approval | Each definition carries `authority_id = AE_MOI_PSBD` (active), so the approved catalogue admits it on the governed-issuer branch once the market and the emirate are open. **No organisation-role rows and no definition-review rows existed**, unlike Dubai's thirty. The disclosure payload reads a credential's issuer from the organisation roles only, so a shared Abu Dhabi credential would have carried no issuer. |
| The emirate | `sp_sub_jurisdictions.AE-AZ` was **inactive**. The catalogue view and the claim rules both require an active region, so moving the pack to `public_pilot` alone would have opened it on paper only. |
| Legal review | `pending` on the pack and on every definition. **Unchanged** by this PR, and the migration's postflight refuses to commit if it moved. |

## 2 · What the migration does

`supabase/migrations/20270220090000_sp_open_abu_dhabi_public_pilot.sql` — one transaction, preflight,
change, postflight.

| Change | Rows |
|---|---|
| `sp_sub_jurisdictions.is_active` | `AE-AZ`: false → true |
| `sp_market_packs.pilot_state` | `AE-AZ`: closed → public_pilot |
| `sp_credential_types.pilot_state` | the 7 `AE_AZ_PSBD_LICENCE_*`: closed → public_pilot |
| `sp_credential_organisation_roles` | + 14 rows: `regulator` and `issuer` for each of the 7, pointing at `AE_MOI_PSBD`. `source_url` is the authority's registered URL; `checked_on` is **2026-09-14, the date the pack migration attributed the authority** — it restates that attribution and records no page reading, because none has happened. No `verification_authority` row (unknown, left absent). |

Unchanged and fingerprinted: `is_active` (false on the pack and all 7), `legal_review_state`
(pending), every claim, professional title, pilot grant, regulatory source and authority, every
other pack's pilot state, every other emirate (listed, inactive), every other organisation role, and
every field of the 7 definitions except `pilot_state`. No definition-review row is created, and the
postflight refuses if one appears.

After it: 4 packs and 51 definitions in public pilot (44 + 7); the approved catalogue offers 77
definitions to a signed-in holder (70 + 7); `sp_market_access(NULL, 'AE-AZ')` is still `closed`.

## 3 · What a holder gets

- Any signed-in holder, whatever their work country and with no grant, may register one of the seven
  licences: scope required (the company it is tied to), expiry required, the Ministry as governed
  issuer. It saves as self-declared, under Abu Dhabi — never Dubai, never the whole UAE.
- The three public-pilot statements the surfaces already print for the UK and Dubai apply unchanged:
  open to every registered user; the legal review is pending; registering is not permission to work.
- Sharing carries the issuer; review by a reviewer without a grant works; a reviewer's decision is
  the only thing that changes trust.

## 4 · Proof

- New suite `supabase/tests/security_passport_open_abu_dhabi_test.sql` (31 assertions): the opened
  state, an ordinary account saving two licences, the rules (scope, emirate, issuer, expiry, direct
  insert, activation over pending review, signed-out session), sharing with the issuer line, review,
  and that nothing else moved.
- Ten existing suites updated from "Abu Dhabi stays closed" to the explicit public-pilot decision,
  preserving every ownership, territory and trust assertion: `open_uk_dubai`, `public_pilot_availability`,
  `catalogue_completeness` (Abu Dhabi stays **out** of the pinned 70: it has no review row), `india_national_qualifications`,
  `pilot_scope`, `market_pilot`, `pilot_catalogue_visibility`, `jurisdiction_catalogue`, `three_market_foundation`
  (two active emirates), `global_certification`. The two assertions that run with no signed-in user keep
  refusing Abu Dhabi, exactly as they refuse Dubai: a public pilot is admitted to a signed-in holder only.
- `scripts/db-test.sh`: the suite runs in both rounds; the rollback stands down first (before the UK
  and Dubai rollback, whose postflight requires Abu Dhabi closed), must refuse a second run, the suite
  must fail without the migration, and the migration reapplies on top of the UK and Dubai. The two
  global rollback chains stand it down first as well.
- Scripts and local specs that counted 70 / 44 / "7 closed" now count 77 / 44 + 7 / 0 closed
  (`passport-catalogue-coverage-matrix.ts`, `passport-live-local-journey-check.mjs`,
  `e2e/passport-live-catalogue.spec.ts`, `e2e/passport-catalogue-integration-local.spec.ts`).
  `docs/passport/catalogue-coverage-matrix.md` is generated from a migrated local database and is
  **not** regenerated here; regenerate it after the apply.

## 5 · Rollback

`supabase/rollback/20270220090000_sp_open_abu_dhabi_public_pilot_rollback.sql` returns the pack and
the seven to `closed`, the emirate to inactive, and removes the fourteen roles. It touches no claim and
no grant. It **refuses while any Abu Dhabi claim exists**, because removing the issuer roles would take
the issuer line off every recipient view of those claims; the operator may opt in with
`SET LOCAL sp.rollback_may_strip_abu_dhabi_issuer = 'yes'`, and the claims are kept either way. It must
run before the rollback of `20261221090000`.

## 6 · Release bookkeeping and order

- `supabase/release-state.json`: frontier entry, `pending`, `introduces: []`.
- `scripts/release-frontier-check.ts`: `expectedPending` lists the file.
- Version `20270220090000` assumes the United States schema (`20270219090000`, after #436's `20270218090000`) merges first. If this
  merges first, renumber it to the next slot after the current frontier, as `release-sequence.md` says.
- After the integration applies it, verify read-only as the `verify` field says, then regenerate the
  coverage matrix.

## 7 · Not done, stated plainly

- The source page was not read and the licence categories were not confirmed against it. That is the
  legal review's first item and it stays open. The public-pilot statements say so to every holder.
- No definition-review (validity) text exists for the seven, so the picker shows no validity line for
  them; validity is read from the licence. Adding it needs the page read first.
- The application copy that enumerates "the United Kingdom and Dubai" as the pilot markets is adjusted
  in the application PR to describe pilot markets without listing them.
