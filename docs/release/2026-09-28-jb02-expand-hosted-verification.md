# Hosted verification — 20261223090000 (JB-02 EXPAND), with the two Passport rows the ledger already held

**Read-only.** Supabase management connector on owner production `wrygicdfxwjnrugduxnt`, 2026-09-28 20:15–20:17 UTC, after PR #323 merged to `main` as `10efc1b` and the official Supabase GitHub integration applied it. No hosted write, no behavioural probe.

## 20261223090000 / application_notes_employer_only (JB-02, EXPAND half)

| Check | Result |
|---|---|
| Ledger row | `20261223090000` / `application_notes_employer_only`, 12 statements, the 325th and highest row |
| Ledger snapshot | `hosted-ledger.json` refreshed to all 325 rows; digest of `version:name` `f33d02081052b202cb70b43708ba5616` on the connector read and on the file |
| `rec_application_status_events(uuid)` | exists; SECURITY DEFINER; `md5(prosrc)` `5b4581066812f949938e0ddf129741e9` = local replay of the merged file |
| `rec_application_employer_note(uuid)` | exists; `md5(prosrc)` `d018031ed27b9279ad900742c9fd2bb7` = local replay |
| Grants on both | `authenticated:EXECUTE, service_role:EXECUTE`; no `anon`, no `PUBLIC` |
| `rec_submit_application(...)` | `md5(prosrc)` `7f3e4c1f04a85c35412e5910290ac60b` = local replay; reads named fields, not `SELECT *` |
| Privileges | unchanged by design: `employer_note` and `note` still granted to `authenticated`; `status` granted |
| Rows | 14 `job_applications`, 24 `job_application_status_events` |

Next per the release order in `release-state.json`: #329 (the application reads through the functions) merges; then #330 (CONTRACT: the two columns leave the `authenticated` grant).

## 20261220090000 and 20261221090000 (Passport PR 2 and PR 4)

Recorded here because the refreshed ledger already held them and `deploy-plan:check` refuses a snapshot with a pending entry the ledger has. The functional follow-up stays with the Passport Completion work; this is the read-only bookkeeping only.

| Check | Result |
|---|---|
| Ledger rows | `20261220090000` / `sp_public_pilot_availability` (23 statements), `20261221090000` / `sp_open_uk_dubai_public_pilot` (9), rows 323 and 324 |
| CHECK constraints | `sp_market_pack_pilot_state_known`, `sp_credential_type_pilot_state_known` admit `closed`, `internal_pilot`, `public_pilot` |
| Bodies | `md5(prosrc)` `sp_claims_credential_rules` `ce96c030…`, `sp_market_access` `5dd4fdfa…`, `sp_verifier_queue` `9fea89e6…` (names `sub_jurisdiction`); `md5(pg_get_viewdef)` `sp_approved_credential_catalogue` `ca2fd12d…`; `sp_credential_types_read` qual `df295d09…` — all equal to the local replay |
| Market packs | SE active / grandfathered / closed; GB, GB-NI, AE-DU inactive / pending / `public_pilot`; AE-AZ inactive / pending / closed |
| Definitions | GB 13, GB-NI 1, AE-DU 30 `public_pilot` (44 in total), inactive, pending; AE-AZ 7 closed |
| Counts at read time | `sp_pilot_members` 9, `sp_claims` 51, `sp_professional_titles` 90 (no before-merge count was taken by this session; 20261221's own postflight fingerprints refuse on any difference) |
