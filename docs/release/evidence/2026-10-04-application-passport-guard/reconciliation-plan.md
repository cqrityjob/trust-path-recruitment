# F09 history reconciliation — prepared, not executed

The migration itself was applied once to project `wrygicdfxwjnrugduxnt` from reviewed commit `d09da624359e9fddf181e86594b81da88e323549`. This plan concerns only its migration-history identities. Running `reconcile-history.sql` requires separate owner approval; this preparation performed no hosted writes.

## Exact proposed change

Insert exactly one row into `supabase_migrations.schema_migrations`:

| version | name | statements |
| --- | --- | --- |
| `20270215090000` | `application_passport_verified_content_guard` | SQL `NULL` |

Preserve the complete original `20261004164027` row, including its SQL, and every other original row. No migration SQL is re-executed. No application data or schema is changed.

The transaction locks the history table and fails closed unless all 374 verified version/name identities match digest `3bfd11b0037b10a31029b89cd8bc5179`, the canonical identity is absent, the original name and single SQL body match the reviewed SHA-256, and the installed function body/configuration/privileges and trigger match the reviewed guard. It requires exactly one insert, 375 resulting rows, NULL alias statements, unchanged complete original rows and unchanged guard definitions before commit. A retry after success fails the original baseline check; it never silently skips or overwrites a row.

## Local verification

`reconcile-history-local-test.json` records the SQL checksum and results. A transaction fixture used the 374 verified version/name pairs, the exact reviewed SQL for the original F09 row, and NULL statements for other synthetic rows. It does **not** reproduce or claim a production complete-row/body digest. Only the outer transaction COMMIT was replaced by ROLLBACK in the local runs; the reconciliation guards, constants, insertion and postconditions were unchanged.

The positive run inserted one NULL-statements alias, preserved original rows and guard definitions, and rolled everything back. Seven negative cases were refused: identity drift, origin-body drift, function configuration drift, function-body drift, changed EXECUTE permission, disabled trigger, and an already-present canonical alias. Final local checks confirmed that the synthetic history table was absent and the reviewed function body restored.

## Repository convention and CI after approval

Existing examples are `docs/release/2026-09-16-pr257-local-history-reconciliation.md` and the comment-only marker `supabase/migrations/20260927124146_client_table_privilege_hardening.sql`. The original hosted identity remains an inert local marker; the unchanged canonical SQL remains in its dependency-safe replay position.

The prepared marker is `supabase/migrations/20261004164027_application_passport_verified_content_guard.sql`. It contains comments only and currently states that alias approval is outstanding. After an approved reconciliation is executed and independently read back:

1. Refresh `supabase/hosted-ledger.json` from a new read-only snapshot of all 375 rows; do not invent the alias in a pre-approval snapshot.
2. Record actual alias verification in `hostedLedgerOverrides` and release evidence, preserving both identities and the reviewed canonical SQL checksum. Update the marker's approval sentence to the observed result.
3. Keep the marker registered in the established `hostedIdentities`/`hostedLedgerMarkers` checks. Parent owns release-state and frontier edits.
4. Run migration safety, release frontier, release parity, deploy-plan check and deploy-plan gate, plus their negative controls. An empty deployment plan follows from both identities actually existing; no assertion or gate is disabled.
5. Replay all 375 local files on a fresh disposable database: the hosted marker executes nothing and the canonical guard executes once. The mandatory CI rollback test exercises the real rollback and restores the test schema.

Until the alias exists in the actual hosted ledger, deploy-plan must continue to block canonical reapplication. The marker alone cannot make deployment safe.
