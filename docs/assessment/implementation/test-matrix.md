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
| A `BEFORE INSERT` guard on `assessment_assignments` | New legacy assignments are blocked; existing rows are never re-evaluated by it |
| Career Guidance still 16 questions / 16 mappings / 14 dimensions | Career Guidance is untouched (T-020) |
| Slug rules | `security-guard-foundation` is not reused; all three professions carry `market='SE'` |

**Negative-tested.** The guard was verified to fail on (a) a Career Guidance item id inserted into the schema and (b) a Career Guidance import added to a Security Competency module, then verified to pass again once reverted. A guard that cannot fail proves nothing.

### 2. Database + RLS suite — `supabase/tests/scp_a1_domain_model_test.sql`

153 assertions, 20 groups. Wrapped in `BEGIN`/`ROLLBACK` so it leaves no residue.

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
| 14 — publication always starts as draft | 10 | review finding HIGH-1 |
| 15 — assignability fails closed | 6 | review finding HIGH-2 |
| 16 — retired assessments not reactivatable | 9 | review finding HIGH-3 |
| 17 — complete assignability branch coverage | 17 | review finding MED-1 |
| 18 — pilot_stats exception is bounded | 8 | review finding LOW-1 |
| 19 — protections hold against BYPASSRLS | 6 | review finding LOW-2 |
| 20 — scoring visibility per principal | 14 | review finding LOW-4 |

#### Assignability reason coverage (MED-1)

All 16 return branches of `scp_bundle_version_assignability()` are asserted with their exact status **and** exact reason code. A final assertion counts the function's `RETURN QUERY` statements and fails if the total is no longer 16 — so a branch added without coverage breaks the build.

| # | Status | Reason | Fixture reaches it by |
|---|---|---|---|
| 1 | `blocked` | `BUNDLE_NOT_FOUND` | random UUID |
| 2 | `blocked` | `BUNDLE_NOT_PUBLISHED` | draft bundle |
| 3 | `blocked` | `CORE_VERSION_NOT_PUBLISHED` | core version left draft |
| 4 | `blocked` | `MODULE_VERSION_NOT_PUBLISHED` | core published, module draft |
| 5 | `blocked` | `NO_SCORING_VERSION` | bundle created with no `scoring_version_id` |
| 6 | `blocked` | `SCORING_VERSION_NOT_PUBLISHED` | scoring version pinned but draft |
| 7 | `blocked` | `CORE_FORM_EMPTY` | no items in either form |
| 8 | `blocked` | `MODULE_FORM_EMPTY` | core populated, module empty |
| 9 | `blocked` | `FORM_CONTAINS_UNPUBLISHED_ITEMS` | draft item on the module form |
| 10 | `blocked` | `LEGAL_REVIEW_PENDING` | lapsed legal approval — **requires simulating a first-gate bypass** (see note) |
| 11 | `blocked` | `NO_FULLY_ADAPTED_LANGUAGE` | one item has no approved text |
| 12 | `blocked` | `VALIDATION_STATUS_DESIGN` | default validation status |
| 13 | `pilot_only` | `VALIDATION_STATUS_PILOT` | validation status `pilot` |
| 14 | `blocked` | `VALIDATION_STATUS_RETIRED` | validation status `retired` |
| 15 | `assignable` | echoes the validation status | asserted for both `operational-development` and `operational-selection` |
| 16 | `blocked` | `BUNDLE_RETIRED` | `retired_at` set on an otherwise fully valid bundle |

**Note on branch 10.** The publication gate and the immutability guard together make "published item with an unapproved legal review" unreachable through any normal operation — the fixture cannot construct it without briefly disabling the immutability trigger. That is the correct finding, not a workaround: the assignment-time check is pure defence in depth, for a future migration bug or a relaxed gate. The test disables the trigger explicitly and documents why.

Group 6 is a **differential** test: an employer account and a candidate account see zero rows of the item bank and zero scoring keys, while an editor sees more than zero. Both halves are required — a suite where everyone sees zero would pass for the wrong reason.

### 3. Rollback verification — `supabase/tests/scp_a_rollback_test.sql`

26 assertions. The rollback SQL in this file is kept **byte-identical** to the block in `migration-and-rollback.md` — the two had drifted once (A3 was added to the test but not the doc) and are now verified to match.

Executes that rollback verbatim, then proves the database is genuinely back to its pre-PR-A state: every `scp_` table, view, function and trigger gone; `retired_at`, `retired_reason` and `employer_visible` restored; the legacy definition accepting new assignments again.

The assertions that matter most concern history surviving the round trip:

- A synthetic historical **assignment** still exists with score and status unchanged.
- **Career Guidance run history** (LOW-3): two representative `assessment_runs` rows — one per live Career Guidance definition — seeded before the rollback and compared afterwards field by field: run ID, assessment reference, version reference, status, result payload, completion timestamp and locale. PR-A never touches `assessment_runs`, but that was an unasserted claim, and an unasserted claim is exactly how HIGH-2 survived review.

Destructive by design — it runs last, against a disposable database only.

### What CI actually executes

| Job | Steps |
|---|---|
| `verify` | lint (non-blocking) · `tsc --noEmit` · `cie:check` · `kg:check` · `security-competency-separation:check` · **production build** |
| `database` | PostgreSQL 16 service container · full migration replay in order · A1→A2→A3→A4 ordering · A2/A3 applied-evidence checks · 153 domain assertions · 26 rollback assertions |

The `database` job runs `scripts/db-test.sh`, which is the same script used locally (`bun run db:test`) — CI and a developer's machine cannot drift apart.

It fails the build on: any unexpected migration failure, any allowlisted failure that starts passing, a missing or out-of-order `scp` migration, evidence that A2 did not apply, any failed assertion, or an assertion **count** below the expected floor (currently 153 domain, 26 rollback). That last check matters: a suite that silently stops running assertions would otherwise pass.

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

**Known pre-existing replay failures (12).** Ten are duplicate Lovable-generated migrations that re-create objects an earlier migration already created; two require `storage.objects`, which the minimal bootstrap does not stub. All twelve fail identically on `origin/main` without this branch — they are not introduced here. None of the three PR-A migrations is among them.

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
| `bun run db:test` | 153 domain + 26 rollback assertions, exit 0 |
| Negative tests (guard + DB job) | all four confirmed to fail on real violations |
