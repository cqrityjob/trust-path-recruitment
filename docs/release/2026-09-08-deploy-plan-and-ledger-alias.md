# The deploy plan, and the ledger alias that is missing from it

**Status: prepared, NOT executed. It needs owner approval and a production
write to `supabase_migrations.schema_migrations`.**

## What was believed

`20261101090000_sp_selected_merit_sharing.sql` was applied to owner production
`wrygicdfxwjnrugduxnt` on 2026-09-08 through Lovable's tracked mechanism, under
the generated identity `20260908043205` /
`b315714c-89df-4610-9dd0-7b55207229a7`. The repository recorded that: an
`appliedThroughLovable` mapping with `doNotReExecute: true`, the generated
duplicate removed from the active path, `hostedState: applied` with evidence.

The belief was that this prevented a second execution.

## What is actually true

`doNotReExecute` is a field **this repository's own guards read**. The thing
that deploys migrations — the Supabase GitHub integration, i.e.
`supabase db push` — has never heard of it. It decides from one comparison:
local files in `supabase/migrations` against versions in
`supabase_migrations.schema_migrations`.

Measured on 2026-09-08 with Supabase CLI 2.111.0 against a disposable Postgres
seeded with a faithful copy of the production ledger (266 rows, read read-only
through the management API and committed as `supabase/hosted-ledger.json`):

| repository state | ledger state | `supabase db push --dry-run` |
| --- | --- | --- |
| as it stands | production | **`LegacyDbPushMissingLocalError`** — five remote versions have no local file; nothing is applied and nothing is reached |
| + local files for those five | production | **"Would push: `20261101090000_sp_selected_merit_sharing.sql`"** — a second execution of an applied migration |
| + local files for those five | + alias `20261101090000` | **"Local database is up to date."** |
| as it stands | + alias `20261101090000` | **`LegacyDbPushMissingLocalError`** — the alias alone is not enough |

Two things follow, and neither was visible before:

1. **There is no executable protection.** The only reason the migration is not
   being re-run today is that the deploy refuses to run at all.
2. **The refusal is not specific to this migration.** Five ledger rows have no
   local file, four of them from the 2026-09-07 reconciliation. Every migration
   deploy is blocked, for everything, until that is resolved.

Both halves are needed, and they are independent: the alias stops the re-run,
the local files stop the refusal.

## The owner action

Two steps. **Neither has been run.**

### Step 1 — the ledger alias (production write)

Record that canonical identity `20261101090000` is already applied, exactly as
migration `20260907071826` did for `20261028090000`, `20261030090000` and
`20261031090000`.

```sql
-- through the tracked Lovable mechanism, pointed at the synced repository path
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261101090000', 'sp_selected_merit_sharing')
ON CONFLICT (version) DO NOTHING;
```

`ON CONFLICT DO NOTHING` so a retry after a lost response is a no-op. It writes
one row to the migration ledger and touches no application table, no policy, no
grant and no data.

**Preconditions** — all four must hold before it runs:

```sql
-- 1 the generated identity is present, i.e. the SQL really did run
SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version = '20260908043205';                         -- expect 1 row, b315714c-…

-- 2 the canonical alias is absent, i.e. this has not already been done
SELECT count(*) FROM supabase_migrations.schema_migrations
 WHERE version = '20261101090000';                          -- expect 0

-- 3 the objects the migration creates exist, i.e. the alias is true
SELECT to_regclass('public.sp_disclosure_items') IS NOT NULL AS items,
       count(*) FILTER (WHERE p.proname = 'sp_create_selected_disclosure') AS create_fn,
       count(*) FILTER (WHERE p.proname = 'sp_replace_selected_disclosure') AS replace_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public';                                -- expect t, 1, 1

-- 4 nothing else has changed the ledger since the snapshot was read
SELECT count(*) FROM supabase_migrations.schema_migrations; -- expect 266
```

**Postconditions:**

```sql
SELECT count(*) FROM supabase_migrations.schema_migrations
 WHERE version = '20261101090000';                          -- expect 1
SELECT count(*) FROM supabase_migrations.schema_migrations; -- expect 267
```

Then re-read the ledger read-only, replace `versions[]` in
`supabase/hosted-ledger.json`, and re-run `bun run deploy-plan:check`. It fails
until the baseline entry is removed, which is how the record stays honest.

**Rollback:**

```sql
DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '20261101090000' AND name = 'sp_selected_merit_sharing';
```

Deleting the row returns the ledger to exactly its current state. It removes no
schema and no data; the applied SQL is untouched either way.

**What it does NOT do:** it does not run any migration, does not alter the
applied SQL, and does not change the generated row `20260908043205`, which
stays as the record of what actually executed.

### Step 2 — local files for the five remote-only identities (repository)

`db push` refuses while any ledger row has no local file. The five are:

```
20260904190901  scp_trust_evidence_report_r1_provenance
20260907064303  f8efc1c3-def4-4147-9db1-45a68b1f6a69
20260907064513  19c76abb-f1fd-40e5-aa50-b008b7de38bf
20260907064849  0bb96516-c1eb-4178-8e9e-60bde13071dd
20260908043205  b315714c-89df-4610-9dd0-7b55207229a7
```

Four are the 2026-09-07 reconciliation's removed duplicates; the fifth is this
release's. They were removed for a real reason — leaving executable duplicates
in the active path makes a clean replay run the same SQL twice — and that
reason is about **executable content**, not about the filename.

A file at those identities containing only comments satisfies `db push` and
executes nothing on replay. That is the shape to restore, and the sandbox above
confirms it is sufficient.

**This is deliberately NOT done in PR #198.** Four of the five belong to another
reconciliation, `migrations:check` currently requires their absence, and
reversing that decision inside a Passport-sharing change would be scope the
reviewer of that change cannot judge. It needs its own PR, with the guard's rule
made precise — absent **or** containing no executable statement — rather than
loosened.

## The standing protection

`bun run deploy-plan:check` computes the plan on every CI run from the committed
ledger snapshot. It fails on any divergence that is not in its reviewed
baseline, and `bun run deploy-plan:gate` fails while the plan is not empty. That
is the release condition; it is not met today, and the report says so rather
than a JSON field claiming otherwise.
