# Interview configuration contract (`20270207090000`): hosted verification (2026-10-04)

Read-only. No production write was made by the author of this record and no committed probe was run. The role probes ran inside
`BEGIN ... ROLLBACK` as a synthetic user id that belongs to no person, membership or role, and as the owner (a platform
administrator). Counts, names, hashes and privilege flags only; no candidate data was read.

## What happened

PR #406 (Astra's contract release) merged to `main` as `e022ec52` (head `b4dc4e0e`, every mandatory CI job green) after this
author's independent pre-merge review (migration safe on the live state, no consuming path loses access) and after the production
session reported the scoped application (#405) published and verified in the running app (the owner opened an interview case
05:58-05:59 UTC; two `POST /rest/v1/rpc/scp_iv_case_capabilities` 200 in the API edge log; no direct read of the configuration
table from the client). The official Supabase integration applied:

| Version | Name |
|---|---|
| `20270207090000` | `interview_ai_config_contract` |

This author did not observe the publication or the edge-log lines; they are the production session's report.

## After (read ~06:17-06:25 UTC, project `wrygicdfxwjnrugduxnt`)

- **Ledger:** 369 rows, last version `20270207090000`, name `interview_ai_config_contract`. md5 of `version:name` joined by newline
  over all rows `01357df572629d745e667d2fedb20ba1`; over the first 368 rows `c086806d9fb5f0c92609678f037b73ba` (unchanged since
  `20270206090000`). `supabase/hosted-ledger.json` hashes to the same values.
- **Policies on `scp_interview_ai_config`:** exactly two. `scp_interview_ai_config_read`: `SELECT`, `{authenticated}`, qual
  `is_platform_admin(auth.uid())` (was `true`). `scp_interview_ai_config_admin`: `UPDATE`, `is_platform_admin(auth.uid())`,
  unchanged and still without a table grant behind it. No other client `SELECT` or `ALL` policy.
- **Grants, unchanged by design:** `authenticated` `SELECT` only; `service_role` full (the trusted write path); no `anon`, no `PUBLIC`;
  no column ACLs. `anon` has no column `SELECT`, `authenticated` no column `UPDATE`/`INSERT` and no `DELETE`. RLS enabled, not forced,
  owner `postgres`.
- **Catalogue reads:** 39 `USING (true)` client reads remain (40 before) and the five shared `sp_` catalogue policies are preserved.
- **Everything that reads the table is unchanged:** `is_platform_admin` `c3a3128c…`, `scp_iv_ai_real_model_permitted` `4a69f0f9…`,
  `scp_iv_guard_ai_disabled` `83d87468…`, `scp_iv_guard_transcript_gate` `0add346f…`, `scp_private.case_capabilities` `bebbd9f7…`,
  `scp_iv_case_capabilities` `3022f413…`; all `SECURITY DEFINER` owned by `postgres` except the invoker wrapper, so the new read rule
  does not touch them.
- **Equal to the tested state:** the policies, the privilege flags and the column ACLs equal the same migration applied to a strict
  local replay of `main` (369 migrations).
- **Rolled-back probes:** a signed-in user with no role reads **0 rows** (also through the `updated_by` column), no error; `anon` is
  refused (`permission denied`); the platform administrator reads the 1 row; an authorised case reader gets the two flags through
  `scp_iv_case_capabilities` (both `false`: AI and transcripts are off) without any direct read; an unrelated signed-in user gets
  `INTERVIEW_CASE_NOT_FOUND` (42501).
- **A real non-admin reader on the scoped path:** a real organisation member who is not a platform administrator and holds a
  live scoped reviewer grant reads a case it did not create and gets the two flags (both `false`) through
  `scp_iv_case_capabilities` while reading **0 rows** of `scp_interview_ai_config` directly (the test organisation has only its
  owner as member, so this was read in another organisation; counts and booleans only, rolled back; see
  `evidence/2026-10-04-access-probes/`, probe 4). The three people who created interview cases are all platform administrators.
- **Row untouched:** the configuration row is unchanged (`updated_at` 2026-08-28), 1 row.

## Not done, and why

- **Live write attempts as `authenticated`** (UPDATE, INSERT, DELETE, as a non-admin and as the platform administrator) were tried
  three times and the connector timed out after 60 s each time, even with a statement timeout set, so they did not complete. Afterwards
  there was no lingering session, no lock, no synthetic row and no change to the configuration row. The denial rests on the
  catalogue privilege flags above (a table without the privilege refuses before any policy is evaluated),
  `interview_ai_config_contract_test` ICF5-ICF7 and CI.
- No positive production journey as a signed-in non-admin in a browser; the application no longer reads this table, so there is no
  application screen to open.

## Recorded in

`supabase/release-state.json` (`hostedState: applied`), `supabase/hosted-ledger.json` (369 rows) and
`scripts/release-frontier-check.ts` (`expectedPending` is empty).
