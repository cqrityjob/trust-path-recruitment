# Job board migrations: hosted verification (2026-10-03)

Read-only. No production write was made by the author of this record, and no write probe was run.
No candidate data was read: the queries below return counts, names, hashes and policy definitions.

## What happened

PR #387 merged to `main` at 15:42 UTC as `b18e5e5` (merge commit; every mandatory CI job green on the head
`082752c`). The official Supabase integration applied three migrations, in version order:

| Version | Name | Local file |
|---|---|---|
| `20270130090000` | `jobs_not_editable_in_place` | `supabase/migrations/20270130090000_jobs_not_editable_in_place.sql` |
| `20270131090000` | `jobs_publish_window_and_url_scheme` | `supabase/migrations/20270131090000_jobs_publish_window_and_url_scheme.sql` |
| `20270201090000` | `job_cvs_no_client_writes` | `supabase/migrations/20270201090000_job_cvs_no_client_writes.sql` |

## Read 1 (the Claude session that owns production, 15:43-15:47 UTC)

Ledger: 363 rows, last version `20270201090000`, the three new versions exactly as above.
`md5(jobs_validate_before_write)` = `bc292d28d31dd973c81f1cffc145b5bf`, not SECURITY DEFINER, no EXECUTE for
`anon` or `authenticated`. `job-application-cvs` has exactly one policy, `job_cvs_employer_select`. No ERROR,
FATAL or PANIC in `postgres_logs` from 15:40. No new advisor finding for `jobs`, `job_cvs` or the CV bucket (the
existing `security_definer_view` ERROR on `scp_scoring_version_lineage` predates this change).

## Read 2 (independent, 15:45-15:46 UTC, project `wrygicdfxwjnrugduxnt`)

```sql
SELECT count(*), max(version),
       md5(string_agg(version || ':' || name, E'\n' ORDER BY version)),
       md5(string_agg(version || ':' || name, E'\n' ORDER BY version) FILTER (WHERE version <= '20270126090000'))
FROM supabase_migrations.schema_migrations;
```

Result: 363 rows, last `20270201090000`, digest of all rows `fbfc766e1fd85a3d19fc82b8f4fbc8c7`, digest of the first
360 `dcb7e4bcb694e2afece115a18a595383` (unchanged since #388). The digest of all 363 rows is also what
`supabase/hosted-ledger.json` now hashes to, so the file equals the hosted ledger.

`jobs_validate_before_write`: md5 `bc292d28d31dd973c81f1cffc145b5bf`; the body contains all of `Job is not in an
employer-editable state`, `expires_at must be in the future to publish a job` and `application_url must be an http or
https address`; `prosecdef = false`; `has_function_privilege` for `anon` and `authenticated` is false.

Stored job rows whose `application_url` the new address rule leaves alone: **0** (count only).

`storage.objects`:

- Policies that name `job-application-cvs`: exactly one, `job_cvs_employer_select` / SELECT / `{authenticated}`.
- Every other non-SELECT policy is scoped to another bucket: `sp_evidence_holder_delete|insert|update`
  (`passport-evidence`) and `sw_document_insert` (`sw-documents`). `sp_evidence_session_read` (ALL,
  `bucket_id <> 'passport-evidence'`) is **RESTRICTIVE**, so it can only narrow. No policy admits a client write to
  the CV bucket without naming it.

## Not done

No rolled-back probe as a real principal was run (the sandbox has no production credentials; the connector
reads only). Behaviour is proven on the identical bodies by the SQL suites and negative controls in
`scripts/db-test.sh`; the production probes are section 4 (steps 7, 8, 11, 15 and 16) of `2026-10-03-production-test-request.md`.

## Recorded in

`supabase/release-state.json` (`hostedState: applied`), `supabase/hosted-ledger.json` (363 rows) and
`scripts/release-frontier-check.ts` (`expectedPending` is empty).
