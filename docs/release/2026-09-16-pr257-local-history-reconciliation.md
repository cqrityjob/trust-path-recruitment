# PR #257 local release-history reconciliation

Status: **hosted and local verification passed; ready for CI on the reconciliation commit**. After the initial local-only attempt was blocked, the owner explicitly authorized exactly five canonical migration-history aliases. One atomic connector transaction inserted those five version/name-only rows with NULL statements. No migration SQL, application DDL/DML, deletion, Supabase CLI command, rollback, reset, merge or publication was performed.

Starting PR head: `575cc7cbc5210beb8a817bda4807de2d9dafc2ab`.

## Accepted precedents

- [PR #256](https://github.com/cqrityjob/trust-path-recruitment/pull/256), merged as `6fc986af315ff30de4909efb1a076afd39bbd069`: remove verified-applied migrations from `expectedPending`, retain evidence, and keep the guards and their negative controls intact. Its two production ledger rows already had the canonical versions, so it did not need aliases.
- [PR #198](https://github.com/cqrityjob/trust-path-recruitment/pull/198): generated-version applications required **both** comment-only local markers **and** canonical alias rows in the actual production ledger. See `docs/release/2026-09-08-deploy-plan-and-ledger-alias.md`. Mappings in JSON alone did not stop re-execution.
- Existing direct Management API applications use `hostedLedgerOverrides` in `supabase/migrations-policy.json`, explicitly avoiding the inaccurate `appliedThroughLovable` provenance. This reconciliation uses that existing field and shape.

## Permitted local repairs

1. `scripts/release-frontier-check.ts`: remove the five stale pending expectations; add the five generated identities to its established `hostedLedgerMarkers` list. All comparison and comment-only validation logic remains unchanged.
2. `supabase/migrations-policy.json`: record each mapping exactly once in the existing `hostedLedgerOverrides` registry, with source checksum, direct connector provenance and evidence references.
3. `supabase/hosted-ledger.json`: remove the prior ad hoc `canonicalToHostedMappings` field after moving its five records to the established registry. The snapshot was then refreshed from production: all original 288 entries remain unchanged, with exactly five verified canonical alias additions (293 total).
4. Add the five marker files below using the repository's exact two-line comment-only format. No executable SQL is present.

| Canonical version | Hosted version | New marker in `supabase/migrations/`                      |
| ----------------- | -------------- | --------------------------------------------------------- |
| 20261118100000    | 20260916155430 | `20260916155430_sp_international_passport_foundation.sql` |
| 20261119090000    | 20260916155456 | `20260916155456_sp_international_credential_wallet.sql`   |
| 20261120090000    | 20260916155521 | `20260916155521_sp_credential_selective_sharing_v2.sql`   |
| 20261121090000    | 20260916155551 | `20260916155551_sp_closed_credential_catalogue.sql`       |
| 20261122090000    | 20260916155620 | `20260916155620_cv_owned_application_snapshot.sql`        |

All five canonical migration files retain their pinned SHA-256 checksums. Zero Passport/CV migrations are marked pending. Active filenames now total 293, including the five new non-executable markers; no executable duplicate or version collision exists.

## Authorized hosted alias reconciliation

The initial local-only attempt correctly stopped with a non-empty deploy plan. The owner then authorized the missing production history rows. Following PR #198, the write inserted only `(version, name)` using `ON CONFLICT (version) DO NOTHING`. It ran in one transaction, with a ledger lock, exact 288-row full-content digest, hosted name/SHA-256 checks and canonical-absence checks before insertion. Any mismatch raises an exception. Exactly five inserts and 293 total rows were required before commit. No retry was performed.

Before digest: `50f01cb436da2a3e1d8ae601c86fa3e0`. After digest: `0f3837262ef76802e763ddcf935ba7fd` (MD5 of ordered comma-joined version:name pairs). Every original complete ledger row retains its content fingerprint. All five canonical aliases and all five generated applications occur exactly once; alias statements are NULL.

Schema catalog fingerprints and all 47 recorded table counts/content digests remain unchanged, including the 38 original baselines and nine new Passport tables. Profile/CV/Passport counts remain 13/3/3; claims 42, evidence 10, verification requests/decisions 9/9. Deletions and application/schema writes: zero. The stale CLI project received zero calls.

The committed phase-2 read-only post-apply script and final catalogue, CV and security probes passed. An additional historical foundation-only assertion initially reported its expected six policies no longer matched: migration two deliberately added the seventh restrictive session policy. The exact policy list and unchanged schema fingerprints confirm this expected evolution. The historical checks remain unchanged; final-state checks passed. Details are retained in the adjacent verification JSON.

## Local release validation

All 148 deterministic checks passed. Release-frontier, deploy-plan, deployment gate, ledger snapshot equality, migration safety/order and duplicate checks passed: the pending set and deploy plan are empty. The complete disposable-local database runner replayed all 293 unique filenames and passed rollback/reapply, including Passport and CV; the canonical SQL executes once and the five markers execute nothing. All 1,064 mutations across 30 negative-control suites and all ten marker controls were detected with files restored. Both typechecks, changed-file lint and the production build passed.

Guards remain intact; the production snapshot, mappings and comment-only markers now represent the actual completed application and aliases. No executable migration file changed. The adjacent JSON records all deterministic results, exact hosted before/after fingerprints, the transaction and log hashes. Its commitScope lists the exact ten reconciliation files. This supersedes the earlier release block recorded in the historical hosted-application evidence. GitHub CI must complete on the pushed reconciliation commit before merge is recommended; no merge or publication is performed by this task.
