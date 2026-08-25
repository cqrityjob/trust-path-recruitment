# Release sequence — code and schema, in order

## Why this document exists

Independent UAT opened with a production outage of a specific, entirely
preventable kind. The deployed application expected
`20260909092000_jobs_other_profession_selection.sql`; the hosted schema did
not have it. Employers could not save or publish a job at all.

Nothing was wrong with the code and nothing was wrong with the migration. The
two were simply not shipped together — and nothing in the repository could
say so.

That is a class of failure, not an incident, and it follows directly from how
this project deploys:

- **application code** syncs to Lovable the moment it reaches the default
  branch, automatically;
- **migrations** run only when somebody asks for them, through the tracked
  Lovable mechanism.

Any gap between those two facts is an outage waiting for the next change that
touches the database.

## The guard

```bash
bun run release-parity:check
```

Compares the repository against itself. It never connects to a database,
holds no credentials, reads no environment and applies nothing — production
state is not something a CI job should be able to reach.

It answers three questions:

1. **Is every migration classified?** Every canonical migration above the
   evidence baseline must appear in `supabase/release-state.json` with a
   `hostedState`. You cannot add a migration without saying whether it is
   live.
2. **Does application code depend on a migration that is not applied?** Each
   unapplied migration declares the objects it introduces; the guard looks for
   them in `src/`. This is the Fable case, and it is caught by name:
   `src/components/employer/job-form/model.ts` depends on column
   `jobs.profession_other`.
3. **What is the release sequence?** Printed in order, every time.

A branch that adds a migration *and* the code that uses it is the normal
shape of a change, so in the default mode a code dependency is a warning.
Before a deploy:

```bash
bun run release-parity:gate     # same check, --release: any unapplied migration fails
```

## The sequence

1. **Merge the branch.** Code reaches Lovable immediately; assume the app is
   live before the database is.
2. **Run `bun run release-parity:gate`.** It fails while anything is
   unapplied, and prints the exact ordered list.
3. **Resolve every `unverified` entry first.** `unverified` means this
   repository has no evidence either way — it is not a guess in either
   direction. Confirm against the hosted ledger and record the answer.
4. **Apply each migration hosted, in the printed order**, through the tracked
   Lovable mechanism, pointed at the synced repository path. Never re-send on
   a timeout: check the ledger before retrying, or the same migration runs
   twice.
5. **Record what happened.** Set `hostedState` to `applied` in
   `supabase/release-state.json`, and — for a migration applied through the
   Lovable mechanism — record the generated version and the SQL-equivalence
   evidence in `supabase/migrations-policy.json`'s `appliedThroughLovable`, as
   the existing 48 entries do.
6. **Re-run `bun run release-parity:gate`.** It must exit 0. That is the
   release condition.
7. **Diff the hosted grants.** New `public` functions on the hosted project
   are granted `EXECUTE` to `anon` by default, which a local replay cannot
   show. Every new function needs an explicit `REVOKE`; check it landed.

## Ordering rules that already bit this project

- **Migration versions run ahead of the wall clock.** `supabase migration new`
  stamps an honest timestamp that sorts *before* migrations already in the
  hosted ledger. Rename the CLI's output to the next canonical slot, and say
  in the file header that only the filename changed.
- **Never pick a migration file with `ls | grep | head`.** It has selected the
  wrong file twice, once destroying an unrelated migration's contents.
- **A rollback file is required** and belongs in `supabase/rollback/`, named
  after the migration.

## Related checks

| Command | What it protects |
| --- | --- |
| `bun run migrations:check` | Version collisions, parked/never-replay drift, `appliedThroughLovable` integrity |
| `bun run release-parity:check` | Code depending on a migration that is not applied |
| `bun run release-parity:gate` | The same, as a hard pre-deploy gate |
| `bun run db:test` | Full-history replay from empty, plus every SQL suite |
