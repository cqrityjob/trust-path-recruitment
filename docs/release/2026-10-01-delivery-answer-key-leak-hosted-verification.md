# Delivery answer-key leak: hosted verification

**Status: APPLIED and verified read-only on production `wrygicdfxwjnrugduxnt`.**
Merging PR #351 to `main` as `6748588` (head `8013907`, CI fully green)
triggered the official Supabase GitHub integration, which applied
`20261229090000_scp_delivery_answer_key_leak.sql`. This verification wrote
nothing to the hosted database. Every statement was a read. The behavioural
probe ran inside a transaction that ended in `RAISE`, so it was rolled back.

Change and contract: `docs/release/2026-10-01-delivery-answer-key-leak.md`.

## Ledger

| Check | Result |
|---|---|
| `supabase_migrations.schema_migrations` | 332 rows; highest is `20261229090000 / scp_delivery_answer_key_leak`, 10 statements |
| Previous 331 identities | preserved |
| md5 of `version:name` joined by newline, all 332 rows | `4a70a523c9b47f66eab454da9803267f`, equal on the connector read and in `supabase/hosted-ledger.json` |

## Objects

| Object | Hosted state |
|---|---|
| `md5(prosrc)` of `scp_get_attempt_items(uuid,text)` | `10957712bd615f097e709fcdb16c1ca6`, equal to a strict local replay of the merged file. Before the merge it was `013f3860c373ea13c50288b3935ca310`, the body the rollback restores. |
| Key-like field built in the delivery body | none (`option_key`, `answer_key`, `is_best_key`, `is_worst_key`, `score_value`, `is_preferred`, `scoring_rationale`, `learning_feedback`) |
| ACL of `scp_get_attempt_items` | `authenticated` may execute; anon may not |
| `md5(prosrc)` of `scp_seed_unanswered_legacy_attempts()` | `58efb852ca011a78b98ad4128bd47998`, equal to the merged file |
| ACL of `scp_seed_unanswered_legacy_attempts()` | owner only; no PUBLIC, anon or authenticated |
| `scp_attempts_option_seed_immutable` | enabled (`O`) |

## Data

| Measure | Value |
|---|---|
| In-progress attempts with no seed and no answer on a randomised unordered form | **0** |
| The legacy attempt on `security-officer-recruitment-form-a` | now carries a seed. It has no linked sign-in identity, so nobody is served it until one is linked. |
| Seedless attempts with saved answers | 30, left seedless (AC14: nobody is reordered mid-run) |
| Stored responses | 682, unchanged |

## Behaviour (rolled-back probe)

The probe ran as the real participant of the most recent seeded in-progress
attempt, using `SET LOCAL ROLE authenticated` and the participant's real JWT
`sub`, and called `scp_get_attempt_items(attempt, 'sv-SE')`:

| Measure | Result |
|---|---|
| Items served | 37 |
| Options served | 118 |
| Options with any key other than `option_id` and `label` | **0** |
| Distinct keys across every option | `label`, `option_id` |

The transaction ended in `RAISE`, so it was rolled back and no row was written.

## Bookkeeping in this change

- `supabase/release-state.json`: the entry is now `applied`, with this evidence.
- `supabase/hosted-ledger.json`: refreshed to all 332 rows.
- `scripts/release-frontier-check.ts`: `expectedPending` is empty again.
