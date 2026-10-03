# Employer new-application e-mail schema: hosted verification (2026-10-03)

Read-only. No production write was made by the author of this record and no write probe was run. Counts, names, hashes
and privilege flags only; no candidate data and no e-mail address was read.

## What happened

PR #392 merged to `main` as `d2c02b8` (head `aa8e7a5`, every mandatory CI job green). The official Supabase integration
applied, after the three report-access migrations already recorded in
`2026-10-03-report-access-hosted-verification.md`:

| Version | Name |
|---|---|
| `20270205090000` | `employer_new_application_notices` |

The migration is additive and nothing calls it yet: the application half (#393) is published after this record, and the
`transactional-email` edge function must carry the `employer_new_application` kind before that (release order, step 4).

## After (read ~19:52-19:55 UTC, project `wrygicdfxwjnrugduxnt`; the production session read the same independently)

- **Ledger:** 367 rows, last version `20270205090000`, name `employer_new_application_notices`. md5 of `version:name`
  joined by newline over all rows `77e07c074bb73aac9ac11a569b5ca214`; over the first 366 rows
  `ae6f49cb25fa072932ae6aaf8d2b4ddc` (unchanged since #396). `supabase/hosted-ledger.json` hashes to the same values.
- **Function bodies:** all six `md5(prosrc)` equal the strict local replay of the 367 migrations and the values pinned in
  `release-state.json`: `rec_claim_employer_notices` `0fa89f23…`, `rec_employer_notice_backoff` `59288292…`,
  `rec_employer_notice_recipients` `17528f0b…`, `rec_enqueue_employer_new_application_notices` `72f34824…`,
  `rec_purge_employer_notices` `537e3391…`, `rec_settle_employer_notice` `7a3d0254…`. `SECURITY DEFINER` on all but the
  backoff helper, as designed.
- **Function privileges:** `anon` and `authenticated` have no EXECUTE on any of the six. `service_role` has EXECUTE on
  five; the backoff helper is granted to nobody and is reached only from inside the other functions.
- **Outbox `recruitment_employer_notices`:** `relrowsecurity` and `relforcerowsecurity` both true, 0 policies, 0
  triggers. `anon` and `authenticated` hold no table privilege. `service_role` holds `SELECT` only (`INSERT`, `UPDATE`
  and `DELETE` false). 0 rows.
- **Postgres logs:** no ERROR, FATAL or PANIC since 19:45 UTC (read by the production session).
- **Advisors (security):** the only new finding is the INFO `rls_enabled_no_policy` on `recruitment_employer_notices`,
  which is intended (RLS enabled and forced with no policy is how the outbox is closed to every client). The anon
  executable-SECURITY-DEFINER count is unchanged (6, none new) and none of the new functions is in the
  authenticated-executable class (352, unchanged).

## Not done

No rolled-back probe as a real principal was run (the connector reads only). Behaviour is proven on the identical bodies
by `employer_new_application_notices_test` EN1-EN9 and the planted controls and two-session races in
`scripts/db-test.sh`. The end-to-end proof is test T6 in `2026-10-03-production-test-request.md`, which stays paused
until the application half is published: one application, exactly one e-mail to the approved test recipient, no
duplicate on a second attempt.

## Recorded in

`supabase/release-state.json` (`hostedState: applied`), `supabase/hosted-ledger.json` (367 rows) and
`scripts/release-frontier-check.ts` (`expectedPending` is empty).
