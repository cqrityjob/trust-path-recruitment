# P0 response option ownership: hosted verification

**Status: APPLIED and verified read-only on production `wrygicdfxwjnrugduxnt`.**
Merging PR #348 to `main` as `2bbc64a` (head `c1ad36e`, CI fully green)
triggered the official Supabase GitHub integration, which applied
`20261228090000_scp_response_option_ownership.sql`. This verification wrote
nothing to the hosted database. Every statement was a read. The one behavioural
probe ran inside a transaction that ended in `RAISE`, so it was rolled back.

Change and contract: `docs/release/2026-10-01-p0-response-option-ownership.md`.

## Ledger

| Check | Result |
|---|---|
| `supabase_migrations.schema_migrations` | 331 rows; highest is `20261228090000 / scp_response_option_ownership`, 8 statements |
| Previous 330 identities | preserved |
| md5 of `version:name` joined by newline, all 331 rows | `c44c467492c802edabbe6a5621ca5391`, equal on the connector read and in `supabase/hosted-ledger.json` |

## Objects

| Object | Hosted state |
|---|---|
| `scp_item_options_item_version_option_key` (UNIQUE `(item_version_id, id)`) | present |
| `scp_candidate_responses_selected_option_on_item_fkey` | present, **validated** |
| `scp_candidate_responses_best_option_on_item_fkey` | present, **validated** |
| `scp_candidate_responses_worst_option_on_item_fkey` | present, **validated** |
| `scp_save_response(uuid,uuid,uuid,uuid,uuid,text)` | carries `SCP_OPTION_NOT_ON_ITEM` |
| `md5(prosrc)` of `scp_save_response` | `84c4fe1e8a4176972f3b19edff4c76c3`, equal to the body in the merged file. Before the merge it was `bc723ef05f2bf91527f0dc6d1049ee07`, the body the rollback restores. |
| ACL of `scp_save_response` | unchanged: `postgres`, `authenticated`; anon none |
| `scp_candidate_responses` | RLS on; no INSERT/UPDATE/ALL policy for any role |

## Data

| Measure | Value |
|---|---|
| Stored responses | 682, unchanged |
| Responses naming an option of another item | 0 |

## Behaviour (rolled-back probe)

The probe ran as the real participant of an in-progress assessment attempt, on
a `sjt_best_response` item of that attempt's form, using `SET LOCAL ROLE
authenticated` and the participant's real JWT `sub`:

| Saved option | Result |
|---|---|
| Another item's top-scoring option (`score_value = 3`) | refused: `23514 SCP_OPTION_NOT_ON_ITEM` |
| A fabricated option id | refused: `23514 SCP_OPTION_NOT_ON_ITEM` (same error, no oracle) |
| The item's own option | accepted |

The transaction ended in `RAISE`, so it was rolled back and no row was written.

## Bookkeeping in this change

- `supabase/release-state.json`: the entry is now `applied`, with this evidence.
- `supabase/hosted-ledger.json`: refreshed to all 331 rows.
- `scripts/release-frontier-check.ts`: `expectedPending` is empty again.
