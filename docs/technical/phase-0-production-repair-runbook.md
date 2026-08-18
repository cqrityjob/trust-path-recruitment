# CQrityjob — Phase 0 production repair runbook

**For owner execution. NOT executed. Zero production writes performed.**

| | |
|---|---|
| Lovable project | `9ec625ef-34a1-4b4b-8cbb-712cae168579` |
| Canonical hosted Supabase | **`zrahptwsnjcdyzfywbeh`** |
| Owner-asserted ledger snapshot | **97 rows** · `cd_sessions` 40 · `cd_report_snapshots` 22 · `jobs` 15 |
| Repair branch | `fix/canonical-baseline-repair` |
| Excluded from every conclusion | `mlvzmiutmyyqeuvjglco` (the 172-row project) |

> **Verification boundary.** This session had **no hosted access**: the Supabase
> CLI here authenticates to an account that can only see project
> `nwmofcfcdbmretkdtngi`, and `zrahptwsnjcdyzfywbeh` is unreachable with the
> credentials present. Every hosted fact below is **owner-asserted**, taken from
> the locked brief. Every step therefore begins with a pre-check that proves the
> assertion against the live database before anything is changed. Where a
> pre-check disagrees, the step **stops**.

**No step in this runbook uses `supabase db push`, `supabase db reset`, or marks
a migration applied whose SQL has not demonstrably run.**

---

## PHASE 0 — preflight (READ ONLY, mandatory)

```sql
-- 0.1 confirm the database
SELECT current_database(), current_setting('server_version');
-- Confirm out of band that this connection is project zrahptwsnjcdyzfywbeh.

-- 0.2 ledger size — expected 97
SELECT count(*) AS ledger_rows FROM supabase_migrations.schema_migrations;

-- 0.3 row counts — expected 40 / 22 / 15
SELECT (SELECT count(*) FROM public.cd_sessions)         AS cd_sessions,
       (SELECT count(*) FROM public.cd_report_snapshots) AS cd_report_snapshots,
       (SELECT count(*) FROM public.jobs)                AS jobs;

-- 0.4 the two identity facts this repair depends on
SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260818090000','20260818090001','20260818162445')
 ORDER BY version;
-- EXPECT: 20260818090000 = sp_phase10_self_review_and_decision_events
--         20260818162445 = (closed-test governance, Lovable-generated name)
--         20260818090001 = NO ROW

-- 0.5 security-gate exposures — all four expected OPEN
SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='assessment_assignments' AND column_name='scp_open') AS scp_open_col,
       EXISTS (SELECT 1 FROM pg_indexes
                WHERE indexname='scp_assignments_one_open_per_subject_idx')            AS open_idx,
       has_function_privilege('authenticated',
         'public.scp_compute_maturity(uuid,uuid,text,timestamptz)','EXECUTE')          AS maturity_exec;

SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('scp_attempts','scp_candidate_responses','scp_competency_evidence',
                     'scp_human_reviews','assessment_assignments')
 ORDER BY tablename, policyname;
-- EXPECT: FOR ALL author policies present on the four scp_ tables;
--         assessment_assignments employer INSERT/UPDATE carrying NULL::text[].

-- 0.6 full ledger, for the class map
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

-- 0.7 fingerprints required for rollback (SAVE THE OUTPUT)
SELECT p.oid::regprocedure AS signature, pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('scp_compute_maturity','scp_employer_assign','scp_submit_attempt',
                     'scp_complete_human_review','scp_release_attempt_report',
                     'cd_v31_complete_session');

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname='public'
 ORDER BY tablename, policyname;

SELECT c.relname, r.rolname,
       has_table_privilege(r.rolname,c.oid,'SELECT') AS s,
       has_table_privilege(r.rolname,c.oid,'INSERT') AS i,
       has_table_privilege(r.rolname,c.oid,'UPDATE') AS u,
       has_table_privilege(r.rolname,c.oid,'DELETE') AS d
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')) r
 WHERE c.relkind='r' ORDER BY c.relname, r.rolname;

SELECT column_name FROM information_schema.columns
 WHERE table_name='assessment_assignments' ORDER BY ordinal_position;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='assessment_assignments';
SELECT tgname FROM pg_trigger WHERE tgrelid='public.assessment_assignments'::regclass AND NOT tgisinternal;
```

**Backup requirement.** A restore point taken immediately before PHASE A, after
0.7 output is saved to a file. Do not proceed without both.

**Confirm no Lovable migration activity is in flight** — no open Lovable session
against project `9ec625ef-34a1-4b4b-8cbb-712cae168579`, and 0.2 still returns 97
immediately before PHASE A. Lovable writes migrations directly to `main` and to
the hosted database; a concurrent write invalidates every pre-check above.

### STOP conditions for PHASE 0

- 0.2 ≠ 97 → the snapshot is stale. Re-derive the class map before continuing.
- 0.4 shows `20260818090001` exists, or `20260818090000` is not Passport Phase 10 → the repository's migration identities are wrong. **Do not merge.**
- 0.5 shows any exposure already closed → PHASE B is partly applied. Re-scope it.

---

## PHASE A — ledger-only reconciliation

**Scope:** migrations whose SQL is provably already applied in production but
which carry no ledger row. **No DDL. No DML. Ledger bookkeeping only.**

> **The 22-item class B list cannot be enumerated in this document.** The
> accepted classification of the 87 differences was produced in a session whose
> artefact is not in this repository, and this session had no hosted access to
> re-derive it. Enumerating 22 specific versions from memory would be
> fabrication. PHASE A is therefore given as a **per-migration procedure** that
> the owner applies to each entry of the accepted list.

### Per-migration procedure — run all four steps before acting on any entry

For each candidate version `V` with canonical file `F`:

**1. PRECHECK — prove the SQL already ran.** Not "probably ran". For each object
`F` creates, prove presence:

```sql
-- tables
SELECT to_regclass('public.<table>') IS NOT NULL;
-- functions, with the exact signature
SELECT to_regprocedure('public.<fn>(<argtypes>)') IS NOT NULL;
-- columns
SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='<t>' AND column_name='<c>');
-- constraints, indexes, policies, triggers
SELECT conname  FROM pg_constraint WHERE conname='<name>';
SELECT indexname FROM pg_indexes   WHERE indexname='<name>';
SELECT policyname FROM pg_policies WHERE policyname='<name>';
SELECT tgname FROM pg_trigger WHERE tgname='<name>' AND NOT tgisinternal;
-- seeded data, where the migration seeds
SELECT count(*) FROM public.<table> WHERE <seed predicate>;
```

**2. PRECHECK — prove the ledger row is absent.**

```sql
SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = 'V';  -- expect 0
```

**3. REASON — record why no DDL may be rerun.** In writing, per entry: which
statements in `F` are not idempotent (unguarded `ADD CONSTRAINT`, `CREATE INDEX`
without `IF NOT EXISTS`, `INSERT` without `ON CONFLICT`, `ALTER TYPE ... ADD
VALUE`). This is the justification for repairing the ledger instead of applying
the file.

**4. ACTION — ledger only.**

```bash
supabase migration repair --status applied V
```

**POSTCHECK.**

```sql
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = 'V';
SELECT count(*) FROM supabase_migrations.schema_migrations;   -- +1 per repair
```
Then re-run step 1 and confirm **nothing changed** — a repair that altered schema
was not a repair.

**ROLLBACK.**

```bash
supabase migration repair --status reverted V
```
Ledger-only, and safe precisely because no DDL ran.

**STOP conditions.** Any object in step 1 missing → the migration is **not**
class B; it is class C (partial) or D (missing) and belongs in PHASE C. A ledger
count that moves by more than the number of repairs → another process is writing;
stop immediately.

---

## PHASE B — security gate (HIGHEST PRIORITY)

**Migration:** `20260821090000_scp_pilot_security_gate.sql`
**Locally proven:** 46 assertions (`scp_pilot_security_gate_test.sql`), green on
a clean replay in this session.

### What it closes

| # | Exposure (owner-asserted OPEN in production) | Closure |
|---|---|---|
| A | `FOR ALL` author policies on `scp_attempts`, `scp_candidate_responses`, `scp_competency_evidence`, `scp_human_reviews` let any editor/reviewer/publisher write candidate evidence through PostgREST | Each policy becomes `FOR SELECT`. Every write path is a `SECURITY DEFINER` function owned by `postgres`. Governed RPC and read paths are preserved. Proven by SG2.1–SG2.10 |
| B | `assessment_assignments` employer INSERT/UPDATE policies use `NULL::text[]` instead of a role restriction — a policy that names no role restricts nothing | Both policies name `owner` and `admin` through the existing `has_employer_role` helper. `SELECT` is untouched. Proven by SG1.1–SG1.7 |
| C | `scp_compute_maturity(uuid,uuid,text,timestamptz)` executable by `authenticated` — a competence judgement about any subject id, callable by any signed-in account | `EXECUTE` revoked from `anon`, `authenticated`, `service_role` and `PUBLIC`, together with the three Phase 8 derivation helpers. Trusted server paths call it as `SECURITY DEFINER` owner. Proven by SG4.1–SG4.6 |
| D | `assessment_assignments.scp_open` absent; duplicate-open protection inactive | Trigger-owned `scp_open` lifecycle flag, partial unique index on `(employer_id, scp_assessment_version_id, recipient_user_id, use_case)`, cancellation/attempt synchronisation, and `SCP_ASSIGNMENT_ALREADY_OPEN`. Proven by SG5.1–SG5.17 |

### PRECHECK

Re-run 0.5. All three booleans must still show the exposure open
(`scp_open_col` false, `open_idx` false, `maturity_exec` true) and the `FOR ALL`
policies must still be present. **If any is already closed, STOP** — the gate is
partly applied and must be re-scoped rather than run.

Then, because D backfills from attempt lineage:

```sql
SELECT count(*) FROM public.scp_attempts WHERE status = 'in_progress';
```
Record the number. A non-zero count is not a blocker — the migration backfills
`scp_open` from exact attempt lineage — but it must be recorded before and
compared after.

### FINGERPRINT

Save 0.7 output. Specifically required for B:

```sql
SELECT pg_get_functiondef('public.scp_compute_maturity(uuid,uuid,text,timestamptz)'::regprocedure);
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
 WHERE tablename IN ('scp_attempts','scp_candidate_responses','scp_competency_evidence',
                     'scp_human_reviews','assessment_assignments');
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='assessment_assignments';
```

### ACTION

Apply the single file `20260821090000_scp_pilot_security_gate.sql`, in one
transaction, explicitly. Not `db push`.

### POSTCHECK

```sql
-- A
SELECT tablename, policyname, cmd FROM pg_policies
 WHERE tablename IN ('scp_attempts','scp_candidate_responses',
                     'scp_competency_evidence','scp_human_reviews')
 ORDER BY tablename;                       -- EXPECT: cmd = 'SELECT' everywhere

-- B
SELECT policyname, roles, with_check FROM pg_policies
 WHERE tablename='assessment_assignments' AND cmd IN ('INSERT','UPDATE');
                                            -- EXPECT: owner/admin, no NULL::text[]
-- C
SELECT has_function_privilege('authenticated',
  'public.scp_compute_maturity(uuid,uuid,text,timestamptz)','EXECUTE');  -- EXPECT false
SELECT has_function_privilege('anon',
  'public.scp_compute_maturity(uuid,uuid,text,timestamptz)','EXECUTE');  -- EXPECT false

-- D
SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='assessment_assignments' AND column_name='scp_open');  -- true
SELECT indexname FROM pg_indexes
 WHERE indexname='scp_assignments_one_open_per_subject_idx';                            -- present
SELECT count(*) FROM public.scp_attempts WHERE status='in_progress';                    -- unchanged
SELECT count(*) FROM public.assessment_assignments WHERE scp_open;                      -- record
```

Then run `supabase/tests/scp_pilot_security_gate_test.sql` against a **restored
replica**, never against production.

### ROLLBACK

Reverse order, from the fingerprints saved above:

```sql
BEGIN;
-- D
DROP INDEX IF EXISTS public.scp_assignments_one_open_per_subject_idx;
DROP TRIGGER IF EXISTS <scp_open triggers> ON public.assessment_assignments;
ALTER TABLE public.assessment_assignments DROP COLUMN IF EXISTS scp_open;
-- C
GRANT EXECUTE ON FUNCTION public.scp_compute_maturity(uuid,uuid,text,timestamptz) TO authenticated;
-- B and A: DROP each new policy and recreate the captured definition verbatim
--          from the 0.7 pg_policies output.
COMMIT;
```

**Rollback restores the exposures.** It is a break-glass path for a failed
apply, not an acceptable resting state. Applying and then rolling back leaves
production exactly as it is today, which is why B is the highest priority.

### STOP conditions

Any postcheck disagrees · any of the 46 assertions fails on the replica · the
`in_progress` count changes · the migration errors at any statement (stop at the
first error, preserve the message and the transaction state, do not retry).

---

## PHASE B2 — grant hardening

**Run only if the PHASE 0 grant fingerprint proves it is required.**

The Lovable-generated migration `20260818194409` carried
`GRANT INSERT, UPDATE, DELETE ON public.scp_followup_prompts TO authenticated`,
which the canonical migration never issues. That establishes the general risk:
**Lovable-created tables can hold broader hosted privileges than a clean replay
reproduces.**

The repository migration `20260822091000_trust_findings_least_privilege.sql`
revokes `anon` on `scp_followup_prompts` and closes `cd_option_loadings`.
`20260822092000_cd_profession_bands_accessor.sql` closes the profession
calibration path.

Whether **more** hardening is required is a function of the real hosted grant
matrix, which is 0.7's last query. Compare that output against the local
canonical matrix in
[`phase-0-grant-surface-audit.md`](./phase-0-grant-surface-audit.md) and harden
only the differences. Do not write a speculative migration.

PRECHECK: the grant diff · ACTION: one narrow migration of `REVOKE` statements ·
POSTCHECK: re-run the matrix, confirm only intended cells changed · ROLLBACK: the
corresponding `GRANT`s · STOP: any application 403 in smoke tests.

---

## PHASE C — schema and trust corrections

**Verify each is genuinely missing before including it.** Do not assume the
candidate list is still accurate.

```sql
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260820120000','20260820130000','20260814090000',
                   '20260721090000','20260729140000','20260729150000',
                   '20260818120000','20260720180001',
                   '20260822090000','20260822091000','20260822092000')
 ORDER BY version;
```

Apply, one file at a time, in this dependency order:

| # | Migration | Depends on | Postcheck | Rollback |
|---|---|---|---|---|
| 1 | `20260720180001_assessment_run_reports_canonical_home` | nothing | `to_regclass('public.assessment_run_reports')` non-null; existing rows unchanged | `CREATE TABLE IF NOT EXISTS` — a no-op where the table exists, so rollback is normally "nothing to undo". **Never** `DROP TABLE` against an environment holding real saved reports |
| 2 | `20260721090000_public_assessment_v2` | #1 | its own objects present | documented in the file |
| 3 | `20260814090000_jobs_archive_lifecycle` | none | 14 assertions on a replica | documented in the file |
| 4 | `20260820120000_scp_employer_report_decisions` | `scp_attempts` | table + `scp_record_employer_decision` present | `DROP TABLE public.scp_employer_report_decisions CASCADE; DROP FUNCTION public.scp_record_employer_decision(...)` |
| 5 | `20260820130000_scp_report_attempt_scoped_evidence` | #4, report payloads | 23 assertions on a replica | documented in the file |
| 6 | `20260822090000_scp_followup_prompts_explicit_grants` | `scp_followup_prompts` | grants present | `REVOKE` the three grants |
| 7 | `20260822091000_trust_findings_least_privilege` | `cd_option_loadings` | `authenticated` cannot read `cd_option_loadings` | `GRANT SELECT ... TO authenticated` + recreate `cd_option_loadings_read` |
| 8 | `20260822092000_cd_profession_bands_accessor` | #7 | 21 assertions on a replica; candidate matching smoke test | remediation block at the foot of the file |
| 9 | `20260818120000_sp_phase11_languages_and_practical_skills` | Passport Phase 10 | 50 assertions on a replica | documented in the file |
| 10 | `20260729140000_retire_legacy_public_career_assessment` | legacy catalogue | new runs refused; historical runs still readable | documented in the file |
| 11 | `20260729150000_normalise_cd_complete_session_contract` | **conditional** | **before applying**, prove on a replica that it does not alter the v3.1 path | documented in the file |

For every entry: PRECHECK the objects are absent → ACTION apply that one file →
POSTCHECK the objects are present and the suite passes on a replica → ROLLBACK is
the file's own documented remediation → STOP at the first error, preserving
evidence.

**#8 carries a code dependency.** The accessor migration and the application
change that calls it must ship together: `v31-public.functions.ts` and
`v31-owner-preview.functions.ts` call `cd_profession_bands_for_matching`.
Applying the migration without the deploy breaks candidate matching; deploying
without the migration breaks it too. **Apply the migration first, then deploy** —
the old view path keeps working until the deploy lands only if step 8's revokes
are held back, so if the two cannot be coordinated, split #8 into
"create accessor" and "revoke direct access" and run the revoke after the deploy.

---

## PHASE D — post-repair verification

```sql
-- ledger
SELECT count(*) FROM supabase_migrations.schema_migrations;
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;

-- schema
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';

-- functions and policies: re-run 0.7 and diff against the pre-repair capture.
-- Every difference must map to an applied migration. Any that does not is an
-- incident.

-- grants
SELECT c.relname, r.rolname,
       has_table_privilege(r.rolname,c.oid,'SELECT') AS s,
       has_table_privilege(r.rolname,c.oid,'INSERT') AS i,
       has_table_privilege(r.rolname,c.oid,'UPDATE') AS u,
       has_table_privilege(r.rolname,c.oid,'DELETE') AS d
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')) r
 WHERE c.relkind='r' ORDER BY c.relname, r.rolname;
```

**Isolation smoke tests, as real accounts, on a restored replica:**

| Check | Expectation |
|---|---|
| Candidate isolation | Candidate A cannot read B's `cd_sessions`, `cd_report_snapshots`, `scp_attempts`, `sp_*` rows |
| Employer isolation | Employer X cannot read employer Y's assignments, participants, reports or decisions |
| Assessment flow | assign → start → submit → human review → release → employer report → participant report, end to end |
| Passport smoke | create claim → request verification → verifier decision → disclosure; evidence document never appears in a disclosure |
| Career Discovery smoke | run 28 questions → 22 scored → snapshot; **matching returns the same professions as before the repair** |
| Jobs smoke | list, publish, archive, apply |
| Calibration boundary | signed-in non-admin gets `permission denied` on `cd_option_loadings` and `cd_profession_profiles` |
| MCP | `/mcp` returns 404 unless `CQRITYJOB_MCP_ENABLED=true` |

**Row-count invariants — must be unchanged by the entire repair:**
`cd_sessions` 40 · `cd_report_snapshots` 22 · `jobs` 15.
Any change means the repair touched data. **Stop and restore.**

---

## Rollback readiness summary

| Phase | Rollback | Restores |
|---|---|---|
| A | `supabase migration repair --status reverted V` | ledger only; no schema ever changed |
| B | reverse SQL from the 0.7 fingerprints | the four exposures (break-glass only) |
| B2 | corresponding `GRANT`s | prior privilege matrix |
| C | each file's own remediation block, applied in reverse order | pre-migration schema |
| any | restore point taken before PHASE A | entire database |

Rollback SQL is written before execution, in this document, and the fingerprints
it depends on are captured in PHASE 0 — **not** improvised after a failure.
