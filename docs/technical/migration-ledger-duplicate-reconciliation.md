# Migration ledger — content-duplicate reconciliation

**Date:** 2026-08-28
**Baseline:** `main` `889eaad`
**Scope:** ledger bookkeeping, one terminal reconciliation migration and one
new CI guard. No historical migration is edited. No hosted SQL is executed.

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

## Was main replayable? Yes. Was the history clean? No.

| Question | Answer | How established |
|---|---|---|
| Are the two files the same change? | Yes | sha256 of both; `diff` shows only the final newline |
| Does the newest pair break schema replay? | **No** | `db-test.sh` run against `889eaad`: **EXIT=0**, "migration replay matches the documented baseline", every suite green |
| Why not? | The migration is written idempotently throughout | `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, `CREATE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, `ENABLE ROW LEVEL SECURITY` |
| Could double application duplicate rows? | No | the file contains **zero** `INSERT` / `UPDATE` / `DELETE` statements |

That proved the final schema could be produced. It did not prove the historical
execution was semantically clean. The wider review found 18 active pairs; 12
canonical bodies write append-only `scp_content_events`. A prior local replay
measured 105 event rows representing 90 distinct semantic events. A replay that
quietly manufactures 15 extra governance events is not an acceptable baseline,
even when the final schema and all tests otherwise pass.

## What was actually wrong

The duplicate was recorded **nowhere**. `migrations-policy.json` has machinery
for exactly this — `parked`, `neverReplay`, `approvedDuplicateVersions`,
`appliedThroughLovable` — and none of it mentioned the pair.

That matters because the harmlessness was a **property of this particular
migration**, not of the situation. The next Lovable re-issue may not be
idempotent, or may carry data statements, and nothing in CI would have said so.

## What the guard found

`scripts/migration-duplicate-check.ts` hashes every active migration's SQL with
comments and whitespace stripped. The 18 fully reviewed historical pairs are a
closed legacy allowlist. Every new pair fails CI.

Run against `889eaad` it found **18 pairs**, not one. The pattern has been
running since 2026-07-18 and covers the Career Discovery, Security Competency,
Academy, employer-settings and jobs domains. Most were already visible in
`db-test.sh`'s `KNOWN_FAILURES` as "relation … already exists" allowlist
entries — but as *symptoms*, filed one error string at a time, never as the
underlying fact that two files contain the same change.

All 18 are now mapped in `migrations-policy.json` under
`appliedThroughLovable`, using the exact hosted version and name read from the
canonical Lovable/Supabase project's migration ledger.

## Hosted evidence — correct production project

Read-only verification ran against owner-locked Lovable project
`9ec625ef-34a1-4b4b-8cbb-712cae168579`, backed by Supabase ref
`zrahptwsnjcdyzfywbeh`. The separately connected Supabase project
`mlvzmiutmyyqeuvjglco` is not the canonical product database and was excluded.

The canonical project reported:

* 180 rows in `supabase_migrations.schema_migrations` (latest hosted version
  `20260906100000`);
* all 18 generated UUID/name records present under their actual hosted version;
* 88 rows in `public.scp_content_events`;
* 88 distinct semantic event rows when identity and timestamp are excluded;
* **0 hosted duplicate governance events**.

No hosted mutation or cleanup is required.

## Why the 18 generated copies remain temporarily

The first cleanup attempt removed the 18 generated copies and CI correctly
stopped it: some early generated migrations depend on the generated copy's
earlier filename order. Removing only the identical pairs changes historical
execution order and makes `20260805054801_4f577347-…` run before the Learning
Mode content it validates.

Retiring the whole early generated chain atomically is a separate, larger
reconstruction. The narrow safe repair therefore keeps the 18 legacy files,
maps every hosted UUID/version, and adds
`20260924090000_migration_ledger_seed_event_reconciliation.sql`. That terminal
migration removes only repeated seed events for the exact 12 known migration
keys and adds a partial unique index covering the same closed set. It changes no
runtime event and deletes nothing on the hosted database, where every key
already occurs once.

## What changes for a reviewer

The legacy allowlist is closed at 18. A new active content-identical pair fails
CI. From this point forward the rule is: keep the canonical file, record the
hosted UUID/version as `appliedThroughLovable`, and do not accept a generated
copy into the active migration path.

## Scope discipline

This branch deliberately contains only:

* `scripts/migration-duplicate-check.ts` — the new guard
* `supabase/migrations-policy.json` — 18 canonical-to-hosted mappings and the
  historical review inventory
* `package.json` / CI — the guard registration
* this document
* `20260924090000_migration_ledger_seed_event_reconciliation.sql`

It carries **no** Interview Intelligence work. Baseline repair and product work
belong on separate branches, and this is the baseline half.
