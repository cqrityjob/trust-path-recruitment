# PR #257 controlled hosted application

All five reviewed migrations were applied successfully on 2026-09-16 to **CQrityjob Production**, `wrygicdfxwjnrugduxnt`, through authenticated Supabase connector operations carrying that explicit project ID. Source: pinned PR head `01efb0731359de2a8939c37ded817f008459366d`. Every SQL payload was read directly from that Git commit and SHA-256 checked. Each migration was verified before the next was applied.

The excluded stale CLI project received **zero calls**. No Supabase CLI command was used in this application run. No additional migration, rollback, reset, reseed, manual Auth/Storage change, data deletion, merge or Lovable publication occurred.

| Canonical version | Hosted version | Migration | Result |
|---|---|---|---|
| 20261118100000 | 20260916155430 | sp_international_passport_foundation | Applied, verified |
| 20261119090000 | 20260916155456 | sp_international_credential_wallet | Applied, verified |
| 20261120090000 | 20260916155521 | sp_credential_selective_sharing_v2 | Applied, verified |
| 20261121090000 | 20260916155551 | sp_closed_credential_catalogue | Applied, verified |
| 20261122090000 | 20260916155620 | cv_owned_application_snapshot | Applied, verified |

The hosted ledger grew from 283 to 288 entries. All prior version/name pairs are unchanged. Each mapping appears once. Sorted version/name MD5: before `6e7b26cd3c434345d1b9f29ffb637630`; after `50f01cb436da2a3e1d8ae601c86fa3e0`.

## Verification

The committed `docs/passport/phase-2-evidence/post-apply-verification.sql` ran read-only. All nine new tables have RLS; 66 columns, 57 validated constraints and 17 indexes were captured. Per-migration checks cover policies, triggers, grants, exact function bodies, definer status and pinned search paths. Legacy v1 sharing bodies are preserved under their new private names. The CV submission function remains an invoker; its private helpers remain private.

Candidates have no catalogue, issuer, scope or jurisdiction DML. Claim guards require an approved definition and immutable governed metadata; inactive/deprecated definitions are excluded. The existing verifier self-refusal, trust-field trigger and decision-write restrictions remain intact. Passport evidence Storage remains private. ASIS CPP, PSP and PCI retain their existing definition rows and issuer ID with unchanged content digests.

No production behavioural write tests were run. These hosted conclusions use read-only stored code, grants, RLS, policies, constraints and exact-body comparisons to the already-tested pinned migrations. A supplemental text probe initially searched for the wrong variable name; the corrected probe passed against the unchanged verifier body. Both results and the explanation are retained in `verification.json`.

| Data | Before | After |
|---|---:|---:|
| Profiles | 13 | 13 |
| CV documents | 3 | 3 |
| Passport profiles | 3 | 3 |
| Claims | 42 | 42 |
| Evidence | 10 | 10 |
| Verification requests | 9 | 9 |
| Verification decisions | 9 | 9 |

All **38** original table counts and row-content digests match. The comparison excludes only the reviewed new `allows_no_expiry` column from credential-type rows. **Deletions: zero.** No raw personal rows were exported.

Security/performance advisor findings are retained with remediation links in `verification.json`. No ERROR names a new object. Relevant findings concern the intentionally closed extraction table, intentionally authenticated definer RPCs, four unindexed reference foreign keys and seven unused indexes on empty new tables. Existing project findings were not changed.

## Release remains blocked

**Recommendation: FIX REQUIRED. Do not merge or deploy.**

The connector records generated timestamps. The five canonical numeric versions are absent from production history, and the generated versions have no local marker files. Consequently the existing deploy-plan guard detects five would-reapply migrations and five remote-only identities. JSON mappings document equivalence but do not change Supabase's version-based deployment selection. The release-frontier guard also retains its five explicit expected-pending entries.

Only evidence and ledger files are changed here. No guard, application code, migration SQL or hosted history was rewritten. Safe numeric history alignment and any necessary release bookkeeping require a separately scoped follow-up; the five schema migrations must never be executed again on production. GitHub CI for the evidence commit is reported in the task's final response.
