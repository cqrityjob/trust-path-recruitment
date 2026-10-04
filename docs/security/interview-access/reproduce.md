# Reproduce the access proof

Use a throwaway local PostgreSQL 16/17 instance with superuser access, `psql`,
Bun, Docker and the repository dependencies installed. These fixtures are
synthetic. Never run them on a hosted project. The HTTP tests enforce a loopback
API URL, but that is not permission to point a local proxy at a real database.

## SQL / full regression

Set PGHOST=127.0.0.1, PGPORT, PGUSER and the disposable server's PGPASSWORD.
`TEST_DB=interview_access_proof bash scripts/db-test.sh` creates its own database,
strictly replays the complete migration history, runs both new suites and the
existing interview/transcript, assessment, RLS and rollback suites. It destroys
and recreates that named database. Linux/GNU tools are the CI reference.

The new suites are `supabase/tests/interview_access_expand_test.sql` and
`interview_ai_config_contract_test.sql`. Both use a transaction and roll back
all fixtures. The historical full-domain rollback now explicitly unwinds
contract, then expand before asserting every interview runtime function is gone.
Do not remove that assertion to accommodate a new function.

On native macOS the existing Passport function-extraction test uses GNU BRE
`\?`; BSD sed captures more SQL than intended. This was reproduced on unchanged
main d2c02b8. Use GNU sed on PATH (and host-visible temporary paths), or Linux.
No repository security assertion has been disabled for this environment issue.

## Real HTTP and actual application reader

Create a DIFFERENT empty local database; do not reuse a database on which the
full suite has run domain rollbacks. Apply `supabase/tests/00_bootstrap.sql`, then
all migration files in filename order through `20270206090000`, using
`psql -v ON_ERROR_STOP=1` for each. Stop on the first failure.

Apply `supabase/tests/fixtures/interview_access_http_auth.sql` to that disposable
database only. It adapts the test bootstrap auth helpers to PostgREST's JSON JWT
claim setting. Then seed once and save the manifest:

```bash
set -euo pipefail
export PGDATABASE=interview_access_http_proof
export INTERVIEW_ACCESS_FIXTURE=/tmp/interview-access-fixture.json
psql -X -v ON_ERROR_STOP=1 -qAt \
  -f supabase/tests/fixtures/interview_access_http.sql \
  | tail -n 1 > "$INTERVIEW_ACCESS_FIXTURE"
```

Run `public.ecr.aws/supabase/postgrest:v16.2` on that same local database,
with public as its exposed schema, anon as its anonymous role, and this
synthetic-only JWT secret:
`synthetic-interview-access-jwt-secret-at-least-32-chars`.
Bind the API to `127.0.0.1:59133`. The local test database login must be able to
SET ROLE anon/authenticated; requests in the proof use those roles, not a
service-role JWT. No GoTrue login or hosted gateway is simulated by this test.

```bash
export INTERVIEW_ACCESS_API_URL=http://127.0.0.1:59133
INTERVIEW_ACCESS_STAGE=expand node scripts/interview-access-http-test.mjs
bun scripts/interview-case-capabilities-http-check.ts
psql -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20270207090000_interview_ai_config_contract.sql
INTERVIEW_ACCESS_STAGE=contract node scripts/interview-access-http-test.mjs
bun scripts/interview-case-capabilities-http-check.ts
bun scripts/interview-case-capabilities-check.ts
```

Expected: 224 HTTP assertions in each stage, 8 real application-reader actor
checks in each stage, and 30 deterministic reader assertions. The HTTP matrix
checks raw reads, published scenarios, denied config writes, valid/missing/cross-
company case RPCs, direct item-bank denial and the candidate's actual assigned-
attempt item route, including the absence of option keys, scores and rationale.
The database suites additionally test employer-linked scenario versions,
revocation, vetting restrictions, missing singleton, all three write verbs and
negative controls that restore the previous exposure / remove the case guard.

Relevant application checks: `interview-runtime-contract:check`,
`interview-ai-provider:check`, `interview-recruiter-workflow:check`,
`interview-finalisation-capability:check`, `interview-method-tenant-read:check`,
`interview-start:check`, `sql-security:check`, `migrations:check`,
`bunx tsc --noEmit` and `bun run build`.

This proves the database and actual application reader with synthetic principals.
It is not evidence of a production rollout, a GoTrue sign-in journey or a full
browser-driven recruiter interview. Publish verification and an independent
read-only production inspection remain release gates owned by Claude/Astra.
