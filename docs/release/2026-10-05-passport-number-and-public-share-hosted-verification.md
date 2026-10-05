# Hosted verification — Passport number, founder rule and public share (20270217090000), and the participant report boundary (20270216090000)

Read-only, 2026-10-05 07:27 UTC, owner production `wrygicdfxwjnrugduxnt`, through the Supabase management connector. **Nothing was written.** No founder is designated, no exclusion was added, no statistics were published, no share exists.

## What happened

* PR #429 merged; the official Supabase GitHub integration applied `20270216090000_participant_report_api_boundary`.
* PR #430 merged to `main` as `f1faa5e` (head `0c81edf`, every CI job green); the integration applied `20270217090000_sp_passport_number_and_social_share`.
* Hosted ledger: **377 rows**, `md5` of `version:name` joined by newline `8dcb3bba55a422ab257ecc722b016f95`. The first **375** rows equal the committed snapshot (`755d51cb6eb43f68f1e621478a1d0b81`). 377 local migration files, 377 ledger rows: the deploy plan is empty.

## 20270217090000 — Passport number, founder rule, public share

| Check | Result |
|---|---|
| Tables `sp_passport_numbers`, `sp_passport_numbers_retired`, `sp_social_shares`, `sp_social_share_items` | exist; RLS enabled on `sp_passport_numbers` and `sp_social_shares` |
| `sp_social_shares` columns matching `image\|png` | **0** — no client image can be stored |
| Trigger `sp_passport_number_on_complete_trg` | present |
| Anonymous `EXECUTE` on `sp_` functions | **exactly two**: `sp_get_social_share`, `sp_network_stats` |
| Anon on `sp_create_social_share`, `sp_designate_founder`, `sp_assign_passport_number` | no |
| Authenticated on `sp_designate_founder`, `sp_assign_passport_number` | no |
| Anon `SELECT` on `sp_social_shares`; authenticated `INSERT` on `sp_passport_numbers`, `sp_social_shares` | no, no, no |
| `md5(prosrc)` `sp_network_stats` | `09b8d671485b5658983c04de1cc874ec` — equals the strict local replay of the merged file |
| `md5(prosrc)` `sp_get_social_share` | `eba1089f6f6d2115884d9a02ed7e2c12` — equals |
| `md5(prosrc)` `sp_create_social_share` | `461da436c9ebb9572f1a99b6a0529bf8` — equals |
| Rows | 0 Passport numbers, 0 retired numbers, 0 public shares |
| `sp_network_stats()` and policy | `{"display":"hidden"}`; policy `display = 'hidden'` |

Numbers will appear only when a holder completes onboarding, or when the owner approves the founder designation (separate approval, identity re-check first).

## 20270216090000 — participant report API boundary (#429)

`md5(pg_get_functiondef)` hosted = strict local replay:

| Function | MD5 |
|---|---|
| `scp_participant_report(uuid)` | `d8570974a6f3c51d41a94c1650b83551` (was `28cc6baf…` at preflight) |
| `scp_subject_progress(uuid)` | `266561fc1f320eeb2e0c1938d81ca20a` (was `2132ff68…`) |
| `scp_development_recommendations(uuid)` | `9de0ff0089e91a1a428b3ad1ff872cef` (was `a736c866…`) |
| `scp_participant_report_for_issuer(uuid)` | `3d38aa3d7056718bd6ecd86c72e627df` (unchanged, as designed) |
| `cd_record_funnel_event(text,jsonb,uuid)` | `1b57baa44ef5c8e33bab7aca981a518c` (body unchanged) |

ACLs: `cd_record_funnel_event` executable by `service_role` only (anon false, authenticated false); the three report functions by `authenticated` and not `anon`; `cd_submit_test_feedback` unchanged (anon and authenticated true). `scp_report_snapshots` policies `…_own` (`c74adf17…`) and `…_employer` (`96fefe65…`) equal the local replay. No report content was read.

## Bookkeeping in this change

`supabase/release-state.json` marks both entries `applied` with the evidence above; `supabase/hosted-ledger.json` is refreshed to 377 rows; `scripts/release-frontier-check.ts` `expectedPending` is empty. `release-parity`, `release-frontier`, `deploy-plan`, `deploy-plan-negative` and `schema-first-release` pass: the application PR that depends on these functions (#431) becomes merge-eligible once this lands.

## Still not done, still needing approval

Founder designation; any exclusion; publishing the statistics (`sp_set_network_stats_display`); merging #431; the external checks (LinkedIn Post Inspector, LinkedIn's real share box, a real phone's share sheet).
