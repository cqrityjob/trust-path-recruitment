# Phase G1 — local database validation scripts

Reusable, disposable-environment SQL for validating
`supabase/migrations/20260719100000_employer_memberships.sql` against a
real Postgres instance without touching Lovable Cloud, an external
Supabase project, or any production/real data. Every identifier and name
used by these scripts is synthetic and fictional — see `01_fixtures.sql`
and `02_membership_fixtures.sql`.

## Requirements

Postgres 16 (matches the target production version). On macOS with
Homebrew:

```
brew install postgresql@16
```

## Running

All commands assume a disposable cluster/data directory you control —
**do not point these at a shared or production instance.**

```bash
PGBIN="/opt/homebrew/opt/postgresql@16/bin"
PGDATA_DISPOSABLE="/path/to/a/scratch/directory/pgdata"

# 1. Create a fresh, disposable cluster (once)
"$PGBIN/initdb" -D "$PGDATA_DISPOSABLE" -U postgres -E UTF8 --locale=C

# 2. Start it (LC_ALL=C works around a known macOS "postmaster became
#    multithreaded during startup" initdb/locale issue; harmless elsewhere)
LC_ALL=C LANG=C "$PGBIN/pg_ctl" -D "$PGDATA_DISPOSABLE" -l /tmp/pg.log \
  -o "-p 55432 -h 127.0.0.1" start

# 3. Create the test database and apply everything in order
"$PGBIN/createdb" -h 127.0.0.1 -p 55432 -U postgres phase_g1_test
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test \
  -v ON_ERROR_STOP=1 -f 00_mock_schema.sql
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test \
  -v ON_ERROR_STOP=1 -f ../../../supabase/migrations/20260719100000_employer_memberships.sql
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test \
  -v ON_ERROR_STOP=1 -f 01_fixtures.sql
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test -v ON_ERROR_STOP=1 -c "
  SET ROLE service_role;
  UPDATE public.employers SET status='suspended' WHERE id='c3333333-3333-3333-3333-333333333333';
  UPDATE public.employers SET status='archived' WHERE id='d4444444-4444-4444-4444-444444444444';
  RESET ROLE;"
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test \
  -v ON_ERROR_STOP=1 -f 02_membership_fixtures.sql

# 4. Run the sequential test suite (tests 2-36; interleaved, human-readable output)
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test -f 03_run_tests.sql

# 5. Concurrency test (test 21) -- two genuinely concurrent sessions.
#    Employer A must have exactly two active owners before running this
#    (true after step 3; re-run 02_membership_fixtures.sql's employer-A
#    owner inserts, or restore via UPDATE, if you've already run test 20
#    from 03_run_tests.sql, which leaves only one active until its own
#    cleanup step restores the second).
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test -f 04_concurrency_session1.sql > /tmp/session1.log 2>&1 &
sleep 0.5
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test -f 04_concurrency_session2.sql > /tmp/session2.log 2>&1 &
wait
cat /tmp/session1.log /tmp/session2.log

# 6. Rollback + reapply drill
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test -v ON_ERROR_STOP=1 -f 05_rollback.sql
# ... verify with pg_policies / pg_proc / information_schema.columns as
# shown in docs/job-intelligence/phase-g1-report.md ...
"$PGBIN/psql" -h 127.0.0.1 -p 55432 -U postgres -d phase_g1_test \
  -v ON_ERROR_STOP=1 -f ../../../supabase/migrations/20260719100000_employer_memberships.sql

# 7. Tear down (fully disposable -- nothing here is meant to persist)
"$PGBIN/pg_ctl" -D "$PGDATA_DISPOSABLE" stop
rm -rf "$PGDATA_DISPOSABLE"
```

## Files

| File | Purpose |
|---|---|
| `00_mock_schema.sql` | Minimal synthetic reconstruction of the pre-existing production objects the Phase G1 migration depends on or `ALTER POLICY`s (auth stand-ins, `profiles`, `user_roles`/`has_role`, `employers`, `jobs`, `job_is_active`, the 10 pre-G1 policies, `audit_logs`). Lets the **actual, unmodified** migration file be applied byte-for-byte. |
| `01_fixtures.sql` | Synthetic `auth.users`, `employers` (4 fictional companies), `jobs` (3 fictional postings) — no real data. |
| `02_membership_fixtures.sql` | `employer_memberships` rows (applied after the migration creates the table) covering every role/status combination the test matrix needs. |
| `03_run_tests.sql` | Sequential runner for the schema/authorization/owner-protection/state-integrity/public-visibility/regression tests. |
| `04_concurrency_session1.sql` / `04_concurrency_session2.sql` | Two scripts meant to be launched as genuinely separate concurrent `psql` processes, racing owner-role changes on the same employer, to validate `update_employer_membership`'s row-locking. |
| `05_rollback.sql` | Copied verbatim from `docs/job-intelligence/phase-g1-report.md`'s "Rollback procedure" — kept in sync with that document, not a second source of truth. |

## What these are not

Not a CI-integrated automated test suite (no assertion framework, no
pass/fail exit codes beyond `psql`'s own `ON_ERROR_STOP`) — output is
inspected manually against the expected results recorded in
`docs/job-intelligence/phase-g1-report.md`. Not a substitute for running
the same validation against a real Lovable Cloud staging environment
before production application — see that report's "Remaining
production-only verification" section.
