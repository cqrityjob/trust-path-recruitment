# Migration ledger — content-duplicate reconciliation

**Date:** 2026-08-27
**Baseline:** `main` `889eaad`
**Scope:** ledger bookkeeping and one new CI guard. **No migration is added,
edited, moved or deleted.**

---

## What prompted this

While verifying the baseline for Interview Intelligence Phase 2, the newest
commit on `main` ("Applied admin deletion SQL") turned out to add

```
supabase/migrations/20260827112444_58fc45db-729a-4d5b-a545-7c0e40d74175.sql
```

which is **byte-identical**, apart from a trailing newline, to the canonical

```
supabase/migrations/20260917090000_superadmin_permanent_account_deletion.sql
```

The duplicate sorts **earlier**, so on a clean replay Lovable's copy runs first
and the canonical file re-applies the same DDL.

## Is main reproducible? Yes — verified, not assumed

| Question | Answer | How established |
|---|---|---|
| Are the two files the same change? | Yes | sha256 of both; `diff` shows only the final newline |
| Does the duplicate break a clean replay? | **No** | `db-test.sh` run against `889eaad`: **EXIT=0**, "migration replay matches the documented baseline", every suite green |
| Why not? | The migration is written idempotently throughout | `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, `CREATE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, `ENABLE ROW LEVEL SECURITY` |
| Could double application duplicate rows? | No | the file contains **zero** `INSERT` / `UPDATE` / `DELETE` statements |

So feature work was **not** blocked, and none was stopped.

## What was actually wrong

The duplicate was recorded **nowhere**. `migrations-policy.json` has machinery
for exactly this — `parked`, `neverReplay`, `approvedDuplicateVersions`,
`appliedThroughLovable` — and none of it mentioned the pair.

That matters because the harmlessness was a **property of this particular
migration**, not of the situation. The next Lovable re-issue may not be
idempotent, or may carry data statements, and nothing in CI would have said so.

## What the guard found

`scripts/migration-duplicate-check.ts` hashes every migration's SQL with
comments and whitespace stripped, and fails on any identical pair that is not
explicitly recorded.

Run against `889eaad` it found **18 pairs**, not one. The pattern has been
running since 2026-07-18 and covers the Career Discovery, Security Competency,
Academy, employer-settings and jobs domains. Most were already visible in
`db-test.sh`'s `KNOWN_FAILURES` as "relation … already exists" allowlist
entries — but as *symptoms*, filed one error string at a time, never as the
underlying fact that two files contain the same change.

All 18 are now recorded in `migrations-policy.json` under `contentDuplicates`,
each naming the canonical file, the generated duplicate, which sorts first, and
why the copy is kept rather than deleted.

## Why the duplicates are kept, not deleted

The generated file is the **evidence of what the hosted database actually
applied**. Deleting it would erase that record. This mirrors the existing
decision for `20260824082256_ef3fa7cb-…`, which is *parked* rather than removed
for the same reason.

## What changes for a reviewer

Recording a pair is **not** a statement that double application is safe. It is a
statement that **somebody looked**. A new duplicate now fails CI and has to be
approved as a diff, which is what the rest of `migrations-policy.json` already
is.

## Scope discipline

This branch deliberately contains only:

* `scripts/migration-duplicate-check.ts` — the new guard
* `supabase/migrations-policy.json` — the 18 recorded pairs and their comment
* `package.json` / CI — the guard registration
* this document

It carries **no** Interview Intelligence work. Baseline repair and product work
belong on separate branches, and this is the baseline half.
