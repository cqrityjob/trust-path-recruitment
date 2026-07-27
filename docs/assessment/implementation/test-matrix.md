# Test matrix — Security Competency Platform

## PR-A coverage

Two suites. Both must pass before merge.

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

53 assertions, 9 groups. Wrapped in `BEGIN`/`ROLLBACK` so it leaves no residue.

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

Group 6 is a **differential** test: an employer account and a candidate account see zero rows of the item bank and zero scoring keys, while an editor sees more than zero. Both halves are required — a suite where everyone sees zero would pass for the wrong reason.

### Harness

Postgres 16, disposable, TCP on 127.0.0.1 (the unix socket path exceeds the 103-byte limit under the scratchpad directory; `LC_ALL=C` is required or the postmaster refuses to start).

```bash
initdb -D "$PGDATA" -U postgres --auth=trust
pg_ctl -D "$PGDATA" -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=" start
createdb -h 127.0.0.1 -p 55432 -U postgres scptest
psql -h 127.0.0.1 -p 55432 -U postgres -d scptest -f 00_bootstrap.sql   # anon/authenticated/service_role, auth.users, auth.uid()
for f in supabase/migrations/*.sql; do psql ... -f "$f"; done
psql -v ON_ERROR_STOP=1 ... -f supabase/tests/scp_a1_domain_model_test.sql
```

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
| `bun run build` | pass |
| `supabase/tests/scp_a1_domain_model_test.sql` | 53/53 assertions, exit 0 |
