# Phase 0C — canonical baseline repair

**Status:** repository repair prepared and locally proven · **NO PRODUCTION WRITE PERFORMED**
**Branch:** `fix/canonical-baseline-repair`, based on `origin/main` at `7ae642a`
**Prepared:** 18 August 2026

---

## 0. What this session could and could not verify

This matters more than anything else in the document, so it is first.

### Could not be verified: hosted production state

**No hosted production access exists in this environment.** The Supabase CLI is
authenticated to an account whose only visible project is `nwmofcfcdbmretkdtngi`
("Baynet", INACTIVE). Neither `mlvzmiutmyyqeuvjglco` — the project reference the
[Phase 0 report](./phase-0-migration-ledger-reconciliation.md) inspected — nor
`zrahptwsnjcdyzfywbeh` from `supabase/config.toml` is reachable. `.env` carries a
publishable (anon) key and no service-role key or database password.

Therefore the following **could not be produced in this run** and are marked
UNVERIFIED throughout:

- a refreshed hosted ledger count (Step 1)
- current hosted `pg_get_functiondef` / `pg_policies` fingerprints (Step 5)
- current hosted state of the four security-gate exposures (Step 6)
- whether the five candidate migrations are genuinely still missing (Step 5, 12)

Every statement about hosted production below is **inherited from the Phase 0
report and labelled as such**. It is not re-confirmed. The production runbook in
§10 is written so that its first phase *establishes* hosted truth rather than
assuming it.

### The Phase 0C brief's premises did not match the repository evidence

The brief describes a Phase 0B baseline of "ledger 95 → 97" with classes
A=56 / B=22 / D=8 / E=1. No artefact with those numbers exists in this
repository, on any branch. The only ledger reconciliation committed here is
[Phase 0](./phase-0-migration-ledger-reconciliation.md)
(`b26905d`, `origin/fix/migration-ledger-reconciliation`), which reports a
**hosted ledger of 172 versions** and a repository converging on **173**.

The two accounts cannot both describe the same database. Rather than pick one,
this repair was driven by **evidence reproducible in this session** — the
repository, and an empty PostgreSQL database — and every hosted-dependent step
was converted into a pre-check the owner runs.

The A/B/D/E classification is therefore **not reproduced here**. Reproducing it
would mean restating numbers no artefact supports.

---

## 1. What was verified, and how

| Claim | Method | Result |
|---|---|---|
| Repository has one duplicate migration version | `basename \| cut -d_ -f1 \| uniq -d` | **Confirmed** — `20260818090000` only |
| Nine Lovable UUID re-issues duplicate canonical files | comment-stripped SHA-256 per pair | **Confirmed identical** — all 9 |
| Two *more* re-issues landed after the Phase 0 baseline | `git diff 9ca37ef..origin/main` | **Confirmed** — `20260818194409`, `20260818194544` |
| Clean replay of current `origin/main` fails | full replay, empty database | **Confirmed** — 2 migrations fail |
| Career Discovery v3.1 serves 28 questions, 22 scored | load-time assertion in `personal-layer.ts` | **Confirmed** — owner decision C is correct |
| `/mcp` is anonymous and exposes calibration data | read `src/routes/mcp.ts`, `src/lib/mcp/tools/*` | **Confirmed** |
| `cd_option_loadings` / `cd_profession_profiles` readable by any authenticated account | migration `20260730090000` | **Confirmed** |
| Career Discovery presents a consent control that is not persisted | grep of routes, i18n, components | **NOT confirmed — no consent UI exists** |
| Blueprint Engine is dead weight | dependency analysis | **Partly false** — one live table depends on it |

### The baseline failure, reproduced

Replaying current `origin/main` from an empty database fails at exactly two
migrations:

```
XX  20260819090000_employer_people_model.sql FAILED (not allowlisted)
    ERROR: constraint "assessment_assignments_person_context_agrees"
           for relation "assessment_assignments" already exists

XX  20260819100000_scp_governed_assignment.sql FAILED (not allowlisted)
    ERROR: SCP_ASSIGN_GOVERNANCE: expected exactly one scp_employer_assign,
           found 2 — an ungoverned overload is still callable
```

Both are caused by the Lovable re-issues running earlier in filename order than
the canonical files they duplicate. This independently confirms the Phase 0
report's central claim.

---

## 2. The eleventh duplicate, and why a blind deletion was wrong

Ten of the eleven re-issues are byte-identical to their canonical counterpart
once SQL comments are stripped (Lovable's generator drops comments, which is why
a raw hash comparison shows every pair as different).

**One is not.** `20260818194409_d794b35e-…` differs from
`20260820100000_scp_report_audience_payloads.sql` by three statements that exist
only in the generated copy:

```sql
GRANT SELECT                 ON public.scp_followup_prompts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scp_followup_prompts TO authenticated;
GRANT ALL                    ON public.scp_followup_prompts TO service_role;
```

The canonical migration creates `scp_followup_prompts` with RLS and two policies
but **issues no GRANT at all**. On a clean replay the table therefore ends up
with no privileges for `authenticated`, and its author-write policy governs a
privilege nobody holds — the policy is unreachable, not restrictive. Hosted
production, which ran the generated copy, has the grants.

Deleting the re-issue without restating those grants would have silently changed
the intended schema and widened the gap between replay and production. They are
restated in `20260822090000_scp_followup_prompts_explicit_grants.sql`.

**This is the single most important finding of the repair**: the deduplication
Phase 0 proposed was correct for 10 of 11 files and would have lost real state
on the 11th.

---

## 3. The Passport Phase 10 version collision

`20260818090000` is claimed by two repository files:

| File | Hosted ledger version (per Phase 0, UNVERIFIED here) |
|---|---|
| `20260818090000_scp_closed_test_governance.sql` | `20260818090000` |
| `20260818090000_sp_phase10_self_review_and_decision_events.sql` | **`20260818090001`** |

### Method chosen

**Rename the Passport file to `20260818090001`.** SQL content is byte-identical;
only the filename changes.

### Why this is the safe resolution and not a new divergence

The brief cautions against renaming to `20260818090001` if doing so *creates* a
hosted divergence. Per the Phase 0 evidence it does the opposite: hosted already
records Passport Phase 10 at `20260818090001`, so the rename makes the repository
**match** hosted truth. The alternative — renaming `scp_closed_test_governance`
— would definitely diverge, because hosted records that one at `20260818090000`.

It preserves all five required properties:

| Requirement | How |
|---|---|
| Hosted historical truth | Repository version now equals the recorded hosted version |
| Clean local replay | Ordering is unchanged; Phase 10 still follows closed-test governance |
| Unique future identifiers | The repository now has zero duplicate versions |
| Passport functionality | No SQL changed; Phase 10 + Phase 11 suites pass (54 + 50 assertions) |
| SCP closed-test governance | Untouched; 23 purpose-governance + 46 security-gate assertions pass |

### The one precondition, and how it is enforced

This rests entirely on the unverified hosted fact. It is therefore recorded in
`supabase/migrations-policy.json` under `hostedLedgerOverrides` **with the exact
query that proves it**, and Phase A of the runbook runs that query before
anything else:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260818090000','20260818090001');
```

If that returns anything other than `20260818090000 = scp_closed_test_governance`
and `20260818090001 = sp_phase10_self_review_and_decision_events`, **stop** — the
rename is wrong and the repair must be redesigned.

---

## 4. PR #40 verdict

**Do not merge as-is. Supersede it with this branch.**

| Phase 0 / PR #40 proposal | Verdict |
|---|---|
| Delete 9 UUID duplicates | **Correct, but incomplete** — two more landed afterwards, and one of the eleven carries a real delta |
| Rename Passport Phase 10 to `20260818090001` | **Correct** — adopted unchanged |
| Add duplicate-version guard | **Correct in intent, insufficient in form** — a check that only rejects duplicates does not stop a parked or never-replay migration from being executed |
| Retain the `20260813090000` / `20260814054617` pair | **Correct** — adopted, recorded as an approved duplicate |
| Extend purpose-governance suite | **Correct** — already merged to main and passing (23 assertions) |
| "Removing the nine requires no hosted repair" | **Unverified here.** Inherited, not re-confirmed |
| `supabase db push --include-all` for Phase 11 | **Rejected for the runbook.** No step in §10 contains `db push` |

PR #40's factual core held up under independent replay. Its scope did not: it
predates two migrations, one genuine content delta, the Blueprint dependency, and
the trust findings.

---

## 5. Canonical active migration set

| Metric | Before | After |
|---|---|---|
| Files in `supabase/migrations/` | 184 | **175** |
| Duplicate numeric versions | 1 (`20260818090000`) | **0** |
| Lovable re-issue duplicates | 11 | **0** |
| Parked (outside the active path) | 0 | **1** |
| Clean replay from empty database | **FAILS** (2 migrations) | **PASSES** |

**Removed** (11 re-issues, superseded by their canonical counterparts):
`20260818162445`, `20260818162604`, `20260818162658`, `20260818162902`,
`20260818163030`, `20260818163151`, `20260818163313`, `20260818163436`,
`20260818163648`, `20260818194409`, `20260818194544`.

**Renamed:** `20260818090000_sp_phase10_…` → `20260818090001_sp_phase10_…`.

**Parked:** `20260720180000_h4_1_assessment_blueprint_engine_phase1.sql` →
`supabase/archive/parked-migrations/`.

**Added:**

| Migration | Purpose |
|---|---|
| `20260720180001_assessment_run_reports_canonical_home.sql` | Rescues the one live table the parked Blueprint file was the sole creator of |
| `20260822090000_scp_followup_prompts_explicit_grants.sql` | Restores the privilege state the 11th duplicate carried |
| `20260822091000_trust_findings_least_privilege.sql` | Closes the `cd_option_loadings` exposure; records the one that cannot be closed yet |

---

## 6. Blueprint Engine parking — and the assumption it broke

Owner decision F states the product does not depend on the Blueprint Engine's
26 tables and 33 functions. **That is true for 25 of the 26 tables and every
function. It is false for one table.**

`public.assessment_run_reports` — the saved career report table that
`save_career_report()` (`20260718190227`) and `20260721090000_public_assessment_v2`
both depend on — has **no `CREATE TABLE` anywhere in the repository except inside
the Blueprint migration's Section 8a**, a defensive `CREATE TABLE IF NOT EXISTS`
reconstruction. The Blueprint migration's own header says so.

Parking the file unchanged would have removed the only creator of a live product
table, and clean replay would have failed at `20260721090000`. Section 8a is
therefore extracted verbatim in effect into
`20260720180001_assessment_run_reports_canonical_home.sql`, which sits exactly
where the Blueprint migration used to and is a no-op wherever the table already
exists.

`assessment_run_answers` was checked the same way: created by Blueprint, and
referenced by nothing in `supabase/` or `src/`. It stays parked.

### How it is parked

Moved to `supabase/archive/parked-migrations/`. The Supabase CLI only executes
files in `supabase/migrations/`, so `db push` cannot reach it — this is a
structural exclusion, not a comment. The file is preserved intact; nothing is
deleted. `migrations-policy.json` records the decision and the check script fails
the build if it ever reappears in the active path.

---

## 7. Replay-protection mechanism

**One manifest + one check script, wired into CI and the replay itself.**

- `supabase/migrations-policy.json` — the decisions: parked files, never-replay
  files, approved duplicate versions, hosted ledger overrides. Each entry carries
  a reason and a pointer to where it was decided.
- `scripts/migration-safety-check.ts` — the enforcement. Run via
  `bun run migrations:check`, and executed by `scripts/db-test.sh` *before* it
  creates a database, so a policy violation fails ahead of any replay.

It answers five questions and deliberately nothing more:

1. Does any numeric version appear twice in the active path?
2. Is a parked migration back in the active path?
3. Do all parked / never-replay files still exist where policy says?
4. Has a never-replay file been edited since it was content-pinned?
5. Does every active file have a well-formed 14-digit version prefix?

### Why never-replay is a content pin rather than a removal

`20260730110000_career_discovery_v3_1_completion.sql` (owner decision I) must
never be re-executed, but it **cannot be removed from the active path**: later
migrations correct it in sequence, and a linear replay needs it to run before
they do. It is already in the hosted ledger, so `supabase db push` will not
re-run it — the residual risk is a hand-written `psql -f` or a manual repair.

So the protections are: it is pinned by SHA-256 (an edit fails CI, because
editing an already-applied migration changes what replay produces without
changing production — which is precisely how the two silently diverge), it is
recorded as `manualExecution: "forbidden"`, and the runbook never invokes it.

---

## 8. Trust findings

### 8.1 `/mcp` — proprietary content exposed anonymously · **FIXED (repository only)**

`src/routes/mcp.ts` mounted the CQrityjob MCP server with no authentication.
Five tools were reachable by anyone who knew the path, including
`list_assessment_questions` (the authored question bank), `get_profession`
(per-profession **target dimension profiles** — the calibration matrix) and
`compute_career_matches` (the matching engine, returning a 0–100 indicator).

That is the same proprietary calibration material the database keeps away from
ordinary accounts, published through a different door.

**Fix:** the route is closed unless explicitly opened server-side.
`CQRITYJOB_MCP_ENABLED=true` is required; `CQRITYJOB_MCP_TOKEN`, when set, also
requires a matching bearer token. Both are server environment variables, never
`VITE_` (which would inline the secret into the client bundle). A closed endpoint
returns **404**, not 403, so it does not confirm its own existence. Ownership of
the generated file was taken by removing the plugin's banner line, which is that
plugin's own documented mechanism.

### 8.2 Career Discovery calibration data readable by any account · **PARTLY FIXED**

`20260730090000` granted `SELECT` to `authenticated` with `USING (true)` on both
`cd_option_loadings` and `cd_profession_profiles`.

| Table | Action | Why |
|---|---|---|
| `cd_option_loadings` | **Closed.** Policy dropped, `authenticated` and `anon` revoked, `service_role` retained | Verified to have **no application reader**: the engine scores from `src/lib/career-discovery/v31/option-matrix.ts`; the table is a mirror compared by a guard script running as `service_role` |
| `cd_profession_profiles` | **NOT closed. Recorded as a known exposure in a table comment** | The product reads it through `cd_profession_profiles_current`, declared `WITH (security_invoker = true)`. A security_invoker view resolves permissions as the **calling** user, so revoking the base grant would break profession matching for every signed-in candidate |

Closing the second requires either flipping that view to definer semantics or
narrowing its row policy to the current active band — both change a Career
Discovery object the owner has frozen. **Prepared, unapplied SQL** for whichever
the owner chooses:

```sql
-- OPTION A — definer semantics on the view (smallest change; the view already
-- exposes only the current band, so it leaks nothing the product does not).
ALTER VIEW public.cd_profession_profiles_current SET (security_invoker = false);
REVOKE SELECT ON public.cd_profession_profiles FROM authenticated;

-- OPTION B — keep security_invoker, narrow the base policy to the current band.
DROP POLICY IF EXISTS cd_profession_profiles_read ON public.cd_profession_profiles;
CREATE POLICY cd_profession_profiles_current_only ON public.cd_profession_profiles
  FOR SELECT TO authenticated
  USING (id IN (SELECT id FROM public.cd_profession_profiles_current));
```

Option A is recommended: one line, and it makes the view the only door.
Option B keeps invoker semantics but leaves the current calibration readable.
**Neither is applied.** This is an owner decision on a frozen product.

### 8.3 Career Discovery consent persistence · **NOT IMPLEMENTED — premise does not hold**

The brief authorises implementing the persistence gap **if** the product already
presents a consent or acknowledgement whose technical record is simply not
written.

**It does not.** `cd_sessions.consent jsonb NOT NULL DEFAULT '{}'` exists and
nothing writes it — but there is no consent control anywhere in the Career
Discovery experience to persist. Searched: every `discovery` and
`security-career-assessment` route, `src/i18n/dictionaries.ts`, and
`src/components/`. The only consent copy in the product belongs to job
applications (`jobs.apply.field.consent`) and employer onboarding.

So this is not a persistence bug. It is a **missing consent step**, and building
one means authoring the consent text, the purpose description and the lawful
basis — which the brief explicitly forbids inventing. **Left unimplemented and
escalated as an owner + legal decision.**

---

## 9. Security gate — what could and could not be verified

`20260821090000_scp_pilot_security_gate.sql` is present in the repository and its
46 assertions pass against a clean replay. Its four exposures:

| # | Exposure | Repository state | Hosted state |
|---|---|---|---|
| A | `FOR ALL` author policies on `scp_attempts`, `scp_candidate_responses`, `scp_competency_evidence`, `scp_human_reviews` | Closed — policies are `FOR SELECT`; writes go through `SECURITY DEFINER` functions. Proven by SG2.1–SG2.10 | **UNVERIFIED** |
| B | `assessment_assignments` employer INSERT/UPDATE accepted any active membership | Closed — narrowed to owner/admin. SG1.1–SG1.7 | **UNVERIFIED** |
| C | `authenticated` holds EXECUTE on `scp_compute_maturity` | Closed — revoked from `anon`, `authenticated`, `service_role`, `PUBLIC`. SG4.1–SG4.6 | Phase 0 reported it **already not executable** by `anon`/`authenticated` — inherited, not re-confirmed |
| D | Missing `assessment_assignments.scp_open`; broken duplicate-open protection | Closed — trigger-owned flag + partial unique index. SG5.1–SG5.17 | Phase 0 reported `scp_assignments_one_open_per_subject_idx` **already present** — inherited |

**The two inherited observations suggest this migration may already be applied to
hosted production.** If so it is not a missing migration at all, and Phase B of
the runbook will find that in its pre-check and stop. That is the correct outcome
and is why the pre-check exists. Negative tests and rollback SQL for each are in
the migration and its suite; reproducing them as "current hosted fingerprint"
without database access would be fabrication.

---

## 10. Production runbook — for owner approval, not for execution

**Not executed. No step contains `supabase db push`.** Every action is a single
named migration applied explicitly, with a stop condition.

### PHASE 0 — establish hosted truth (READ ONLY, mandatory first)

This phase exists because Phase 0C could not run it. Nothing else may proceed
until its output is recorded.

```sql
-- 0.1 ledger size and tail
SELECT count(*) FROM supabase_migrations.schema_migrations;
SELECT version, name FROM supabase_migrations.schema_migrations
 ORDER BY version DESC LIMIT 20;

-- 0.2 the collision (decides whether §3's rename is correct)
SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260818090000','20260818090001');

-- 0.3 are the five "missing" migrations actually missing?
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260821090000','20260820120000','20260820130000',
                   '20260814090000','20260721090000','20260818120000');

-- 0.4 did the eleven re-issues ever get recorded?
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260818162445','20260818162604','20260818162658',
                   '20260818162902','20260818163030','20260818163151',
                   '20260818163313','20260818163436','20260818163648',
                   '20260818194409','20260818194544');

-- 0.5 security-gate objects (decides whether PHASE B is needed at all)
SELECT to_regclass('public.scp_test_grants') IS NOT NULL          AS test_grants,
       EXISTS (SELECT 1 FROM pg_indexes
                WHERE indexname='scp_assignments_one_open_per_subject_idx') AS open_idx,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name='assessment_assignments'
                  AND column_name='scp_open')                     AS scp_open_col,
       has_function_privilege('authenticated',
         'public.scp_compute_maturity(uuid,uuid,text,timestamptz)','EXECUTE') AS maturity_exec;

-- 0.6 fingerprints needed for rollback of anything replaced later
SELECT p.oid::regprocedure AS sig, md5(pg_get_functiondef(p.oid)) AS def_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
       ('scp_employer_assign','scp_release_attempt_report','scp_submit_attempt',
        'scp_complete_human_review','cd_v31_complete_session');
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE tablename IN ('assessment_assignments','scp_attempts','scp_candidate_responses',
                     'scp_competency_evidence','scp_human_reviews',
                     'cd_option_loadings','cd_profession_profiles');
```

**Stop conditions.** 0.2 disagrees with §3 → do not merge; redesign the rename.
0.4 returns any row → those versions were applied; deletion becomes a ledger
reconciliation, not a file removal. 0.5 shows the gate objects present → PHASE B
is already done; skip it.

### PHASE A — ledger-only repair

Applicable **only** to versions 0.4 proves are recorded hosted but absent from the
repaired repository. On the Phase 0 evidence this set is **empty**, and the
expected outcome of Phase A is therefore "nothing to do".

- **Pre-check:** 0.4 output, plus a fresh restore point.
- **Action:** for each such version, `supabase migration repair --status applied <version>` — **ledger only, never DDL**.
- **Post-check:** re-run 0.1 and 0.4; the count changes by exactly the number repaired.
- **Rollback:** `supabase migration repair --status reverted <version>`.
- **Stop:** any version whose SQL is *not* provably already applied. Never mark a migration applied whose objects do not exist — that creates a false history.

### PHASE B — security

`20260821090000_scp_pilot_security_gate`

- **Pre-check:** 0.5. If `test_grants`, `open_idx` and `scp_open_col` are all true and `maturity_exec` is false, the gate is already applied — **stop, nothing to do**.
- **Action:** apply that single migration file explicitly.
- **Post-check:** re-run 0.5; run the 46 security-gate assertions against a replica.
- **Rollback:** `supabase/tests/scp_a_rollback_test.sql` documents the unwind. The narrowed legacy write policies are deliberately **not** reopened.
- **Stop:** any assertion fails, or any in-flight attempt is `in_progress` at apply time.

### PHASE C — schema and product corrections

Only for migrations 0.3 proves are genuinely missing, in this dependency order:

1. `20260721090000_public_assessment_v2` — depends on `assessment_run_reports` existing (see §6)
2. `20260814090000_jobs_archive_lifecycle` — independent; 14 assertions
3. `20260820120000_scp_employer_report_decisions` — depends on `scp_attempts`
4. `20260820130000_scp_report_attempt_scoped_evidence` — depends on #3 and on the report payloads migration
5. `20260818120000_sp_phase11_languages_and_practical_skills` — the one difference Phase 0 identified; 50 assertions
6. `20260729140000_retire_legacy_public_career_assessment` — owner decision G, approved in intent
7. `20260729150000_normalise_cd_complete_session_contract` — owner decision H, **conditional**: confirm against a replica that it does not touch the v3.1 path before applying

Each: pre-check the objects it creates are absent → apply the single file →
re-run that migration's suite against a replica → rollback is the migration's own
documented remediation → stop on the first error, preserving evidence.

### Never, in any phase

`supabase db push` · `supabase db reset` · marking a migration applied whose SQL
has not run · deleting ledger rows · re-executing `20260730110000` · applying the
parked Blueprint migration.

---

## 11. Owner decisions still required

| # | Decision | Blocks |
|---|---|---|
| 1 | Confirm hosted ledger truth by running PHASE 0 | Everything below |
| 2 | `cd_profession_profiles` — Option A or Option B (§8.2) | Closing the last calibration exposure |
| 3 | Career Discovery consent step — author it, or accept its absence, with legal input (§8.3) | External pilot |
| 4 | `selection_support` and `reassessment` purpose governance, lawful basis, DPIA | Recruitment; reassessment |
| 5 | Whether `20260821090000` is already applied hosted (§9) | PHASE B |
| 6 | Merge approval for `fix/canonical-baseline-repair` | All production repair |

---

READY FOR OWNER APPROVAL — NO PRODUCTION WRITES PERFORMED
