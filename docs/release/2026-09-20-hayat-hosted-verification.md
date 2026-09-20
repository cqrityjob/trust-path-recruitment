# HAYAT hosted verification — 2026-09-20

Owner approved merging #275 and #276 and verifying production before completing #277.
Schema PR #276 merged as `39574bd83d03087f7f669cae91a2c0aef8714747`.
Reading PR #275 merged as `fb3bc3d818bdf16cca26d1cc6f3fff2e4ac106be`.

## Target and method

All observations below are read-only Supabase management SQL on the repository's
canonical production project `wrygicdfxwjnrugduxnt`. The table was absent before
merge and present afterwards, with ledger version `20261204090000`, name
`sp_hayat_assessments`. The GitHub integration applied the migration; no manual
DDL, migration replay, candidate write or assessment creation was performed.
The complete 306-row hosted ledger was refreshed in `supabase/hosted-ledger.json`.

## Exact code and permissions

The MD5 of each hosted `pg_proc.prosrc` matches the exact dollar-quoted body in
the merged migration. These are equivalence checks, not cryptographic signatures.

| Function | Body MD5 | Security definer | EXECUTE grants among API roles |
| --- | --- | --- | --- |
| sp_hayat_fields_fingerprint | d506201849d307d13b1103afb1c508a7 | no | authenticated, service_role |
| sp_hayat_claim_fingerprint | 9f70616e13d8e6d358435f68a098bbcd | no | authenticated |
| sp_hayat_record_assessment | eff5ae4f54d40d644972db2e06d49edf | yes | service_role only |
| sp_hayat_assessments_guard | 68c46c2f18e2ebe63dcf09f6cdae021b | no | none |
| sp_hayat_invalidate_on_claim_change | a162ebfb3294bc28eb8501b0c4f75a00 | yes | none |
| sp_hayat_invalidate_on_evidence_change | 0735b887dffe47a676648b3e08a27ecf | yes | none |
| sp_hayat_current_assessment | e678ee915ab3f4c2a351b7bb777af883 | no | authenticated |

All seven functions have an empty pinned `search_path`; anon can execute none.

## Table boundary

- RLS enabled. The sole SELECT policy is for authenticated holders where
  `holder_user_id = (SELECT auth.uid())`.
- Authenticated has SELECT, but no INSERT, UPDATE, DELETE or TRUNCATE.
- Anon has no SELECT. Service role has no direct INSERT.
- All three expected triggers exist on the expected tables/events: claim UPDATE,
  evidence UPDATE and assessment BEFORE DELETE OR UPDATE.
- All three indexes match, including the unique current-assessment index on
  `claim_id WHERE invalidated_at IS NULL`.
- All 19 constraints match the migration: claim/user/evidence foreign keys,
  primary key, fingerprints, source binding, bounded text, result and invalidation
  domains, JSON object checks and refusal to persist temporary outages.
- Assessment row count at verification: **0**.

## Scope of proof and next release

This proves the deployed schema and privileges match the reviewed migration.
The schema PR's isolated CI passed replay, RLS, behavioural assertions and
rollback/reapply before release. Production checks did not insert synthetic data.
The reading release has no dependency on this schema. PR #277 may now run its
full CI with the real hosted evidence recorded, then release the dependent app.

Credly stays disabled. This evidence does not establish permission to call Credly,
a successful live issuer check, or deployment of the #277 frontend. HAYAT results
remain private and do not promote `sp_claims.assertion_level` or enter shares.

Rollback: revert the dependent application first. Keep the additive schema by
default; the reviewed SQL rollback refuses to remove nonempty assessment history.
