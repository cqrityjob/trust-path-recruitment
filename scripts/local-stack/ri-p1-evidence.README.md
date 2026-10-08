# Recruiter Intelligence P1 evidence runner

Run against a **disposable PostgreSQL instance on loopback**, with installed
`psql`, Node, Bun, Chromium for Playwright and either executable
`POSTGREST_BIN` or Docker. Docker defaults to `postgrest/postgrest:v14.15`,
the version used by the real local Supabase stack. An explicit
`RI_P1_POSTGREST_IMAGE` override is for a separate version comparison;
measured PostgreSQL/PostgREST versions are recorded in public version logs
and the manifest rather than inferred from the requested tag. The runner replays every migration strictly, then
uses `supabase/tests/recruiter_intelligence_p1_test.sql` with
`RI_P1_KEEP_FIXTURE=1` as the only authority for the 100-case baseline.
It does not depend on `db-test.sh`'s destructive historical rollback chain.

For the schema-first CI job, append **`--api-only`**. This runs the same target
guard, strict migration replay, actual SQL oracle and 23 HTTP assertions,
including concurrent assignment/review CAS and precise PT409/HTTP409 refusals
for stale profiles, source bindings, selected originals, assignments and
PEACE handoff. Each request is bounded at eight seconds so a domain retry
loop fails the proof. Then it exits 0 if those pass. It
creates/resets only its seed/API databases and starts only its API gateway
and PostgREST. It never starts the application or browser. Manifest stages
`runtime` and `browser` are `intentionally_not_run`, never passed. It requires
Node, Bun, psql and PostgREST/Docker; no application install or Chromium is
needed by this mode. The application CI job must use full mode without this
flag to prove the five browser cases.

```sh
RI_P1_DISPOSABLE_POSTGRES=1 PGHOST=127.0.0.1 PGPORT=5432 \
  PGUSER=postgres PGPASSWORD=local-synthetic-only \
  RI_P1_REPORT_DIR=/tmp/cqrity-ri-p1-evidence \
  bash scripts/local-stack/run-ri-p1-evidence.sh
```

Use a fresh report-directory path per run; an existing nonempty path is
refused so an old screenshot cannot be attributed to a failed new run.
`--reset` explicitly drops only the three fixed P1 databases, and only when
each existing database contains the P1 ownership marker. Save needed old
data/reports first. With `--api-only`, reset touches only the two seed/API names,
even if a previous browser database exists.
The default refuses existing names. The trap stops only
processes/containers started by this invocation and leaves databases,
stopped containers and evidence intact. It does not run a retention worker,
cron, SMTP, a candidate message or an AI provider.

The fixed database names are `ri_p1_seed_ci_test`, `ri_p1_browser_ci_test`
and `ri_p1_api_ci_test`. API mutations run in a separate clone of the seeded
database, so its V2 profile and source mutations cannot alter the browser's
100/40/25/35/27/73 oracle. The synthetic namespace is employer
`ee100000-1111-4000-8000-000000000001`, slug `ri-p1-synthetic`, owner
`ri-p1-owner@synthetic.invalid` and A001–A100. Its local password is fixture
data, usable only by the substitute gateway. No hosted Auth user is created.

Override the five distinct ports with `RI_P1_API_REST_PORT`,
`RI_P1_API_GATEWAY_PORT`, `RI_P1_UI_REST_PORT`, `RI_P1_UI_GATEWAY_PORT`, and
`RI_P1_APP_PORT`. Defaults are 54391–54394 and 3139. The authenticator password
is a cluster role property: use a separate disposable cluster, or explicitly
set `RI_P1_AUTHENTICATOR_PASSWORD` to the value already used by other local
stacks. The baseline auth harness is adapted only to one exact P1 database
name per invocation; its original database allowlist stays unchanged.

Database SQL, PostgREST, RLS, RPCs, application server functions and browser
routes are real. **Auth and Storage use the local gateway substitute**; this
does not prove GoTrue expiry, refresh revocation, real Storage removal or
signed URLs. Separate deployment tests must prove those and the published
runtime. Mobile coverage is Chromium 375×812 touch/mobile emulation, not a
physical phone. Existing roll questions and competencies are not rewritten.
The reused local harness includes its existing service-role catalogue-read
grant. API denial tests exercise authenticated/anonymous application roles;
they do not establish hosted service-role read exposure.

Success requires exit 0 from full replay, the SQL oracle, the independent
HTTP suite and all five browser cases. Those cases verify global order and
counts before pagination in four language/viewport contexts, filter resets,
reload/back, explicit human review, two-tab and assignment CAS, direct API
anonymous refusal, and chosen-source PEACE handoff with no duplicate or
auto-confirmed evidence, cached A→B→A profile-target isolation and access to
the received population after all applications have been explicitly closed
and archived through the existing human lifecycle RPCs. The browser consumes
its pristine fixture: repeat
with a fresh run or explicit reset, not against its mutated end state.

`manifest.json` binds the result, checkout SHA, source-input digest and SHA256
of selected logs and images. Each stage is labelled passed, stopped/failed or
not run; a partial run cannot claim successful browser verification. CI
should upload only the manifest-listed files. `private/` and
Playwright `test-results/` are diagnostic material and may contain local
bearer tokens; do not publish them. A nonzero result is a stop condition,
including missing snapshot, failed replay, API refusal or browser mismatch.
The runner never writes `.env.local` and never claims a published version.
