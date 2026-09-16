# Legacy regression migration evidence

This directory extends the historical evidence in `../closed-catalogue-evidence`.
Those earlier failing results are preserved, not overwritten or represented as passing.

## Scope and safety

The approved closed credential catalogue remains the product contract. All
fixtures are synthetic. Tests use PostgreSQL at `127.0.0.1:55439` or the task's
Supabase API/database at `127.0.0.1:55421` / `127.0.0.1:55422`. The existing local
staging `.env.local` and unrelated local stacks are unchanged. Hosted changes,
hosted cleanup and production deletions: **NONE**.

`database-failure-inventory.json` records each of the original 38 failing
suites. `browser-failure-inventory.json` preserves each of the original 206
failed cases and maps it to the corrected contract. `browser-skip-inventory.json`
classifies all 316 original skips; local integration cases are run separately
because an unconfigured default browser command must not write to a backend.
No skipped case is counted as passing without a separate execution.

## Product defects found by the regressions

- A legacy claim correction could change the governed credential definition by
  inserting a successor. The closed-catalogue trigger now refuses that change.
- Changing credential/market selection retained personal dates and identifiers.
  The form now clears those instance fields with the selection.
- Overview used an oversized legacy card and duplicate credential preview.
  It now mounts the canonical compact card once and has labelled state sections.
- Profile, employment evidence and interview application links had undersized
  touch targets. The affected controls now have 44px targets.
- Real authenticated saved-CV submission called revoked private helpers. The
  new `cv_owned_application_snapshot` checks `auth.uid()`, ownership, readiness
  and live facts, then returns the privacy-filtered snapshot. Application
  insertion stays SECURITY INVOKER; private helpers remain ungranted. Nineteen
  SQL assertions run both before and after its rollback/reapply.
- An emailed assignment could be claimed while the pre-claim work-list request
  was still in flight. React Query reused that stale request for `refetch` and
  the invitation remained invisible. Overview and Academy now cancel the exact
  in-flight work query before refetching. The delayed-response regression proves
  both routes on all three browser projects (18 focused repeated cases).
- CPU-throttled initial hydration could complete the client-only route load
  between TanStack Router `Transitioner`'s render and commit, causing a React
  update-before-mount error. The client entry awaits that existing initial load
  before mounting React. It does not perform an extra load, suppress console
  errors, or change authentication. The existing 200% zoom case now throttles
  CPU to exercise this race on all three browser projects.

The two multi-page Career Center tours need a total budget that covers every
navigation and viewport. They now have a 90-second total budget, with a stricter
20-second limit for each navigation. No guide, layout, zoom or accessibility
assertion was removed.

## Migration order

The first four pending migrations are unchanged in ordering:

1. `20261118100000_sp_international_passport_foundation.sql`
2. `20261119090000_sp_international_credential_wallet.sql`
3. `20261120090000_sp_credential_selective_sharing_v2.sql`
4. `20261121090000_sp_closed_credential_catalogue.sql`
5. `20261122090000_cv_owned_application_snapshot.sql`

The fifth was CLI-created as `20260916060931` and placed after its dependencies
in the repository's canonical future-dated sequence. All five remain **pending
hosted approval**. No migration performs personal-data cleanup. The CV rollback
restores the previous function and drops only its new wrapper; it changes zero
CV or application rows.

## Reproduction

Prerequisites: task-local Supabase running at the exact ports above, all canonical
migrations applied locally, and the existing interview-journey and governed
BESKT preparation fixtures seeded. The local Vite server uses those local
credentials with `VITE_JOBS_ENABLED=true`, `VITE_EMPLOYER_PORTAL_ENABLED=true`
and `VITE_PASSPORT_LOCAL_INTEGRATION=1`. These process-only flags do not edit
repository or hosted environment bindings.

The private CLI status environment file is `/private/tmp/passport-phase2-status.env`.
It contains credentials and **must not be committed or included in evidence**.
The three checked-in runners validate/fix their loopback binding, create fresh
synthetic per-project records, run desktop/375/390 projects, and exit nonzero
on a failed suite:

```sh
node scripts/passport-regression-application.mjs
node scripts/passport-regression-beskt.mjs
node scripts/passport-regression-e4.mjs
```

For interview context/continuity, run local fixture files in this order:

1. `scripts/fixtures/interview-journey-fixture.sql`
2. `scripts/fixtures/interview-regression-prerequisites.sql`
3. `scripts/fixtures/interview-context-bridge-fixture.sql`
4. `scripts/fixtures/employer-process-continuity-fixture.sql`

The prerequisite prints fresh `ready` and `reported` case IDs. Supply them as
`E2E_READY_CASE` and `E2E_REPORTED_CASE`; do not reuse the historical developer-only
IDs embedded as compatibility defaults. Its assessment fixtures explicitly model
one released employer snapshot and one unreleased attempt. Release/consent/RLS
are separately exercised by the complete SQL, report and live API suites.

Use `E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3118 E2E_SUPABASE_REF=127`
for these live browser files, and explicit PostgreSQL loopback variables for
`interview-evidence-reliability.spec.ts`. Set `CONTINUITY_EVIDENCE_DIR` outside
the repository. Career Discovery uses `E2E_CD_LOCAL=1` with the same base URL.
The Passport live browser uses the HTTPS loopback proxy and real local share
Edge Function described in the earlier Phase 2 evidence.

The fixture-only complete browser run uses `http://127.0.0.1:3119`, with
`HUB_SHOTS`, `CV_SHOTS`, `PASSPORT_LEGACY_SHOTS` outside the repository. Its
explicitly gated local cases are reconciled against the separate live runs,
not silently excluded from the aggregate.

Full database verification uses `scripts/db-test.sh` on a disposable database.
It proves the final schema first, then walks historical releases in dependency
order. The later CV wrapper is rolled back before the historical four-entry-point
CV assertions, preserving those exact security allowlist checks.

## Release gate

`schema-first-release:check` requires dependent migrations to be proven applied
before application code can become merge-eligible, because merging main triggers
an application deployment. These five migrations are pending and hosted writes
are not authorised. Evidence must continue to report that gate truthfully;
marking migrations applied without hosted evidence or weakening the guard is
not part of this work.
