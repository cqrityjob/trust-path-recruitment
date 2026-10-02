# Final-audit P1 fixes: hosted verification

**Status: APPLIED and verified on production** (`wrygicdfxwjnrugduxnt`, 2026-10-02).

The 2026-10-02 final hostile-user audit found six P1 issues and no P0. Each
one was fixed in its own PR, in the owner's order L, H, G, K, J, I. Every PR
was merged with CI fully green and applied by the official integration in
version order. Each fix was then verified read-only through the Supabase
management connector.

| Finding | Migration | PR | Merge |
|---|---|---|---|
| P1-L assignment created already completed, with an invented result | `20270118090000_assessment_assignment_insert_columns` | #377 | `dac3e59` |
| P1-H Passport entry edited while under review | `20270119090000_sp_entry_frozen_under_review` | #378 | `ecc06d6` |
| P1-G access-request approval grants owner or rewrites a live role | `20270120090000_access_request_no_role_escalation` | #379 | `09398bb` |
| P1-K vetting material erased outside the security function | `20270121090000_scp_iv_erase_vetting_boundary` | #380 | `0a51b5d` |
| P1-J BESKT position reopened after the others became readable | `20270122090000_bcp_conduct_reopen_after_exposure` | #381 | `2b42035` |
| P1-I approved organisation changes its identity and stays approved | `20270123090000_employer_identity_rereview` | #382 | `ed62d48` |

#379 also carried a fix to the test harness. In the Swedish rollback clone,
`scripts/db-test.sh` now erases fixture holders before the accounts that
verified their claims. Erasing a verifier first nulls `verified_by_user_id`
on a surviving claim, and the 20270115090000 stamp guard refuses that. Row
order inside a single DELETE is not defined, so the order is now explicit.
No guard was disabled.

## Ledger

`supabase_migrations.schema_migrations` has 357 rows (read 2026-10-02 22:38 UTC).
The md5 of `version:name`, joined by newline, is
`f4f87e56322142f2ac03b5eda5c1cfae`, equal to `supabase/hosted-ledger.json`.
The first 351 rows, through `20270117090000_security_work_programme`, still
have their previous digest, `d51e277eb053ef50833765ebb9f751b0`. Exactly six
rows are new, one per fix. Nothing is pending, so `deploy-plan:check` has
nothing to apply.

## Method

Every changed function body was compared as `md5(prosrc)` with a local replay
of the merged migration files on `main`. Every behavioural probe ran inside a
`DO` block that ended in `RAISE EXCEPTION 'PROBE_ROLLED_BACK …'`, so all of it
rolled back. Probes impersonated real principals through
`request.jwt.claims` and `SET LOCAL ROLE authenticated`, and they reported
only counts, states and error codes. No personal data was read out, and
nothing was written.

## Per fix

| Fix | Deployed object | Probe result |
|---|---|---|
| P1-L | `authenticated` holds no table-level INSERT on `assessment_assignments`. `engine_result` and `status` are not insertable; `recipient_email` is. `anon` holds no INSERT. | Creating a row with `status='completed'` and an `engine_result` is refused with `42501`. |
| P1-H | Both freeze triggers are enabled. The helper md5 is `926a3a79…` and the trigger function md5 is `1cce4b8a…`, both equal to the merged file. `anon` cannot execute the helper. | With a request set to pending, the holder moving `started_on` by 3650 days is refused with `23514 SP_ENTRY_UNDER_REVIEW`. |
| P1-G | `approve_access_request` md5 is `91ce1c85…`, equal to the merged file. | An admin approving their own request is refused with `42501`, both as owner ("only a platform admin can grant the owner role") and as member ("you cannot approve your own access request"). The role is unchanged. |
| P1-K | `scp_iv_erase_source` md5 is `ef55350f…`, equal to the merged file. `anon` cannot execute it. | Production has no vetting cases, so a restricted case was simulated inside the transaction. An owner or admin erasing a source is refused with `SCP_IV_NOT_CASE_MEMBER`, and the source stays active. `bcp_case_access_ok` was checked as unchanged afterwards. |
| P1-J | `bcp_conduct_reopen_position` md5 is `771e4871…`, equal to the merged file. `anon` cannot execute it. | A synthetic two-assessor session was seeded under replica. With both positions locked, the reopen is refused with `BCP_CONDUCT_POSITIONS_ALREADY_SEEN`. In the control, with the other position still open, the call passes the guard. |
| P1-I | `employers_validate_before_write` md5 is `55de38b7…`, equal to the merged file. | Tested as a non-admin owner of an active organisation. A description edit keeps it active. A rename that only changes case or spacing keeps it active. A changed organisation number returns it to `pending`, and its active-organisation capability is gone. An owner who is also a platform admin keeps it active, by design. |

## Result

P0 = 0, P1 = 0. The P2/P3 backlog from the final audit is unchanged and
out of scope.
