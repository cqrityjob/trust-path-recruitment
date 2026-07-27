# Test matrix — Security Competency Platform

## PR-A coverage

Three suites. All must pass before merge.

### 1. Static separation guard — `bun run security-competency-separation:check`

Runs in CI. Proves Career Guidance content is not reused.

| Check | Proves |
|---|---|
| Import isolation across `src/lib/security-competency/**` | No Security Competency module can reach a Career Guidance question, mapping, dimension or scoring module — the strongest static guarantee that no object is shared by reference |
| 48 Career Guidance identifiers absent from the schema | Item IDs are not reused (directive §5) |
| 12 SCC codes vs 14 dimensions and 19 competency slugs | Constructs are disjoint in both directions |
| No `scp_` FK into `cig_competencies`, `assessment_responses`, `assessment_run_*` or `assessments` | No database-level content dependency |
| No `DELETE`/`DROP`/`UPDATE` against legacy assessment tables | Legacy is retired, not mutated |
| `BEFORE INSERT` only on `assessment_assignments` | Historical rows are never re-evaluated |
| Career Guidance still 16 questions / 16 mappings / 14 dimensions | Career Guidance is untouched (T-020) |
| Slug rules | `security-guard-foundation` is not reused; all three professions carry `market='SE'` |

**Negative-tested.** The guard was verified to fail on (a) a Career Guidance item id inserted into the schema and (b) a Career Guidance import added to a Security Competency module, then verified to pass again once reverted. A guard that cannot fail proves nothing.

### 2. Database + RLS suite — `supabase/tests/scp_a1_domain_model_test.sql`

83 assertions, 13 groups. Wrapped in `BEGIN`/`ROLLBACK` so it leaves no residue.

| Group | Assertions | Maps to |
|---|---|---|
| 1 — product separation | 5 | AC-1, AC-3 |
| 2 — legacy retirement | 7 | AC-4, AC-5, AC-6; T-002, T-003 |
| 3 — published immutability | 10 | AC-8, AC-9; T-004 |
| 4 — bundle composition | 4 | AC-7, AC-10 |
| 5 — item construct and review gates | 4 | spec 7.2, 10.3, Bilaga A |
| 6 — RLS on item bank and scoring keys | 8 | AC-12, AC-13 |
| 7 — separation of duties and audit | 6 | AC-16, AC-20; T-013 |
| 8 — validation status | 3 | AC-15, AC-18 |
| 9 — construct catalogue completeness | 6 | spec 5, 6 |
| 10 — versioned scoring | 7 | owner decision A |
| 11 — legal review gate | 6 | owner decision C; spec 10.3 |
| 12 — assignability gate | 9 | owner decision B; AC-15 |
| 13 — explicit item reuse | 6 | owner decision D |

Group 6 is a **differential** test: an employer account and a candidate account see zero rows of the item bank and zero scoring keys, while an editor sees more than zero. Both halves are required — a suite where everyone sees zero would pass for the wrong reason.

### 3. Rollback verification — `supabase/tests/scp_a_rollback_test.sql`

15 assertions. Executes the documented rollback verbatim, then proves the database is genuinely back to its pre-PR-A state: every `scp_` table, function and trigger gone; `retired_at`, `retired_reason` and `employer_visible` restored; the legacy definition accepting new assignments again.

The assertions that matter most are the last three: a synthetic historical assignment, seeded before the rollback, still exists afterwards with its score and status **unchanged**. A rollback that removed the schema but altered history would be worse than none, because it would look successful.

Destructive by design — it runs last, against a disposable database only.

### What CI actually executes

| Job | Steps |
|---|---|
| `verify` | lint (non-blocking) · `tsc --noEmit` · `cie:check` · `kg:check` · `security-competency-separation:check` · **production build** |
| `database` | PostgreSQL 16 service container · full migration replay in order · A1→A2 ordering · 83 domain assertions · 15 rollback assertions |

The `database` job runs `scripts/db-test.sh`, which is the same script used locally (`bun run db:test`) — CI and a developer's machine cannot drift apart.

It fails the build on: any unexpected migration failure, any allowlisted failure that starts passing, a missing or out-of-order `scp` migration, evidence that A2 did not apply, any failed assertion, or an assertion **count** below the expected floor. That last check matters: a suite that silently stops running assertions would otherwise pass.

The job holds no secrets and touches no real database. `scripts/db-test.sh` refuses to run if `PGHOST` looks like a managed host (`*.supabase.co`, `*.rds.amazonaws.com`, `*.neon.tech`).

**Negative-tested.** Verified to fail on (a) an unexpected migration failure and (b) a deliberately inverted assertion — and, after a fix, to *name* the failing assertion in the log rather than reporting a bare exit code.

### Harness

One script, `scripts/db-test.sh`, used by both CI and local runs. It bootstraps `supabase/tests/00_bootstrap.sql` (the `anon`/`authenticated`/`service_role` roles, a minimal `auth.users`, and an `auth.uid()` that resolves from a transaction-local setting so RLS evaluates exactly as it would against a real JWT), then replays, asserts and rolls back.

```bash
# CI: against the postgres:16 service container (PGHOST=127.0.0.1 PGPORT=5432)
bun run db:test

# Locally against any disposable instance
PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres bun run db:test
```

`service_role` is created `BYPASSRLS` to match Supabase — which is precisely why the immutability guards are triggers rather than RLS policies. A trigger still fires for a BYPASSRLS caller; a policy does not.

**Known pre-existing replay failures (12).** Ten are duplicate Lovable-generated migrations that re-create objects an earlier migration already created; two require `storage.objects`, which the minimal bootstrap does not stub. All twelve fail identically on `origin/main` without this branch — they are not introduced here. The PR-A migration is not among them.

## Planned coverage for later PRs

| PR | Suite | Key cases |
|---|---|---|
| B | permission tests | T-013 (editor cannot self-publish), publish requires an independent approval row, T-012 (unapproved adaptation cannot publish), no direct-publish bypass |
| C | E2E sv/en | T-010 resume, T-011 network failure retry, T-005 idempotent submit, accessibility, mobile + desktop |
| D | golden fixtures | Reproducibility (same payload + version → same score), T-006 client manipulation ignored, T-018 content-hash mismatch stops scoring, no client-side key |
| E | snapshot + language guards | T-009 prohibited language blocked, T-014 report without validation status fails the build, T-015 insufficient coverage → limited interpretation |
| F | privacy | T-017 export carries no personal identifiers and is logged |

## Full-repo verification run for this PR

| Command | Result |
|---|---|
| `bunx tsc --noEmit` | pass |
| `bun run security-competency-separation:check` | pass |
| `bun run cie:check` | pass — Career Guidance regression unaffected |
| `bun run kg:check` | pass |
| `bun run question-library:check` | pass |
| `bun run invitation-email-guard:check` | pass |
| `bun run assessment-assignment:check` | pass |
| `bun run build` | pass (now also a CI step) |
| `bun run db:test` | 83 domain + 15 rollback assertions, exit 0 |
| Negative tests (guard + DB job) | all four confirmed to fail on real violations |
