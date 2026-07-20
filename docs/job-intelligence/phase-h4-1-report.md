# H4.1 — Assessment Blueprint Engine, Phase 1: Secure Database + Backend Foundation

**Status: Phase 1 acceptance criteria PASSED. Ready for Phase 2 (content authoring) planning.**

Implements the seven approved architecture documents under
`docs/architecture/blueprint-engine-*.md` (corrected per the
Architecture Quality Review). Schema, RLS, `SECURITY DEFINER` RPCs, and
database tests only — no UI, no frontend routes, no real launch
content, no feature activation, matching the locked Phase 1 scope.

## 1. Implementation summary

One migration
(`supabase/migrations/20260720180000_h4_1_assessment_blueprint_engine_phase1.sql`)
adds the full Assessment Blueprint Engine data model: data-driven
Purpose/Level lookup tables, versioned Question/Module/Blueprint/
Scoring-Profile/Requirement-Profile libraries with explicit many-to-many
association entities, a bridge into the pre-existing
`assessments`/`assessment_versions` catalog, and 33 `SECURITY DEFINER`
RPCs covering every content-authoring and assessment-run-lifecycle
transition. Two genuine repository blockers were found during
implementation (not anticipated by the approved architecture) and
resolved with the smallest safe, fully additive fix — see §9.

## 2. Migrations created

- `supabase/migrations/20260720180000_h4_1_assessment_blueprint_engine_phase1.sql`
  (single file, ~1,850 lines, organized into 10 clearly-banner-commented
  sections matching the corrected DB Schema document's structure).

No other migration file was created or modified.

## 3. Tables and columns created or extended

**New tables (26):** `assessment_purposes`, `assessment_levels`,
`evidence_signals`, `questions`, `question_versions`, `modules`,
`module_versions`, `question_version_evidence_signals`,
`question_version_module_versions`, `module_version_competencies`,
`environment_competency_requirements`, `blueprints`,
`blueprint_versions`, `blueprint_version_module_versions`,
`blueprint_version_question_overrides`, `scoring_profile_versions`,
`scoring_profile_version_weights`, `requirement_profiles`,
`requirement_profile_versions`, `requirement_profile_version_weights`,
`assessment_run_answers` (necessary addition, §9), `question_content_events`,
`module_content_events`, `blueprint_content_events`,
`scoring_profile_content_events`, `requirement_profile_events`, and a
conditionally-created `assessment_run_reports` (§9).

**Extended existing tables (additive only, zero existing columns
altered/dropped):**
- `cig_professions`, `cig_work_environments` — new `is_assessable boolean default false` column each (no rows flagged `true` by this migration).
- `assessment_runs` — new nullable `blueprint_version_id`, `scoring_profile_version_id`, `requirement_profile_version_id`, `blueprint_run_stage` columns, plus a new `BEFORE UPDATE` guard trigger (§9).
- `assessment_run_reports` — new nullable `standard_result`, `requirement_match`, `ai_narrative` columns.
- `blueprints` — new `assessment_id text` bridge column (added in the same migration section as the schema that needs it, §9).
- `blueprint_versions` — new `assessment_version_id uuid` bridge column.

No pre-existing column, `CHECK` constraint, or row's data was altered
anywhere in this migration.

## 4. RPCs created

33 `SECURITY DEFINER` functions, all with explicit `SET search_path = public`,
server-derived actor identity (`auth.uid()`), hardcoded transition
allow-lists, and least-privilege `EXECUTE` grants (`REVOKE ALL FROM
PUBLIC, anon; GRANT EXECUTE TO authenticated`):

- **Questions:** `create_question_draft`, `publish_question_version`, `archive_question_version`
- **Modules:** `create_module_draft`, `publish_module_version`, `archive_module_version`
- **Associations:** `create_evidence_signal`, `attach_evidence_signal_to_question_version`, `detach_evidence_signal_from_question_version`, `attach_question_to_module_version`, `detach_question_from_module_version`, `attach_competency_to_module_version`, `detach_competency_from_module_version`
- **Blueprints:** `create_blueprint_draft`, `attach_module_to_blueprint_version`, `detach_module_from_blueprint_version`, `set_blueprint_version_question_override`, `publish_blueprint_version`, `archive_blueprint_version`
- **Scoring Profiles:** `create_scoring_profile_draft`, `set_scoring_profile_weight`, `publish_scoring_profile_version`, `archive_scoring_profile_version`
- **Requirement Profiles:** `create_requirement_profile_draft`, `set_requirement_profile_weight`, `publish_requirement_profile_version`
- **Assessment Run lifecycle:** `start_assessment_run`, `record_assessment_answer`, `finalize_assessment_answers`, `compute_standard_result`, `compute_requirement_match`, `complete_assessment_run`, `abandon_assessment_run`

## 5. RLS and grant model

Every new table: `ENABLE ROW LEVEL SECURITY` + exactly one `SELECT`
policy (25 policies total, one per table) + **no `INSERT`/`UPDATE`/`DELETE`
grant to `authenticated` at all** — confirmed by direct query
(`information_schema.role_table_grants`): every one of the 18 core
Blueprint Engine tables shows `grants = 'SELECT'` only for
`authenticated`. This makes "no direct authenticated write on
protected tables" structural rather than merely RLS-policy-based —
`SECURITY DEFINER` RPCs write as the function owner, which needs no
grant to `authenticated` at all.

- Published content readable by any `authenticated` user; draft
  content restricted to `is_platform_admin()`.
- Requirement Profiles (fixes I6): published versions readable by the
  owning employer's active members (`has_employer_role()`) or
  platform admins; **draft versions admin-only regardless of
  organisation membership**.
- Association/audit tables: admin-only `SELECT` (no non-admin consumer
  exists in Phase 1).
- `assessment_run_answers`: participant reads their own answers only
  (via run ownership), or platform admin.
- Existing `assessment_runs`/`assessment_run_reports` policies are
  **unchanged** — new columns inherit existing row-level visibility.

## 6. Tests created and results

`tests/database/phase-h4-1-blueprint-engine/` (`00_bootstrap.sql`,
`01_fixtures.sql`, `02_run_tests.sql`, 20 numbered test groups, ~65
individual assertions), run against a fresh disposable Postgres 16
cluster with the **complete real migration history** applied first
(bootstrap → every file in `supabase/migrations/` in chronological
order, skipping the 7 confirmed duplicate/Lovable-consolidated-snapshot
files, through this migration) — matching every prior phase's
verification method exactly, not a hand-reconstructed schema subset.

**Result: all 20 test groups passed**, including every explicitly
required proof point:

- **Catalogue bridge (C1):** publishing a Blueprint creates a mirrored `assessments` row (`kind='professional'`); publishing a Blueprint Version creates a mirrored `assessment_versions` row and sets `blueprint_versions.assessment_version_id`; `start_assessment_run()` successfully satisfies the pre-existing `NOT NULL` `assessment_id`/`assessment_version_id` columns; no parallel catalogue exists.
- **Status and stages (C2):** `assessment_runs.status` only ever took `in_progress`/`completed`/`abandoned` across the entire test run (verified against the live `CHECK` constraint, not assumed); `blueprint_run_stage` progressed through its own values without ever requiring the `status` `CHECK` constraint to change; illegal finalize attempts (0-of-2, 1-of-2 answered) correctly failed.
- **RLS and organisation isolation:** an employer B member reading employer A's published Requirement Profile Version got 0 rows; employer A's own member got 1; a non-admin employer owner could not create a Requirement Profile; an unrelated candidate could not start a run carrying another organisation's Requirement Profile Version.
- **Version immutability:** a published question version could not be re-published; a direct `DELETE` on a published, association-referenced `question_versions` row failed (`permission denied` — no grant exists at all); direct `INSERT`/`UPDATE`/`DELETE` on `blueprints`/`blueprint_versions` as `authenticated` all failed identically.
- **Scoring integrity:** a second Scoring Profile Version could not be published while one was already published for the same Blueprint Version (I3); `compute_standard_result()` produced a deterministic result from pinned inputs; **`standard_result` was byte-identical before and after `compute_requirement_match()` ran** (`standard_result_unchanged_by_b = t`), and a static source-code check confirmed `compute_requirement_match()`'s body contains no statement writing `standard_result` (`body_never_writes_standard_result = t`); no automatic decision field exists anywhere in either output.
- **Reproducibility:** after publishing a second, different Blueprint Version, the first (already-completed) run's `blueprint_version_id` was unchanged (`still_pinned_to_original = t`).
- **The headline finding of this phase (§9):** a signed-in participant's direct raw `UPDATE` attempting to rewrite their own run's `blueprint_run_stage` and `status` — which `assessment_runs`' pre-existing broad "own row" `UPDATE` grant would otherwise permit — was correctly blocked by the new guard trigger on both attempts.

## 7. Regression-check results

- **Existing H3.4 job-rejection-guard test suite** (`tests/database/phase-h3-4-job-reject/`), replayed against the identical full migration history including this new migration: same 5 expected failures as its original baseline run (NULL/empty/whitespace note rejections, non-admin rejection attempt, direct-bypass-blocked), 0 unexpected errors — **no regression**.
- **`bunx tsc --noEmit`**: 0 errors.
- **`bun run cie:check`**: `CIE v1 harness: PASS`.
- **`bun run kg:check`**: `kg:check OK`.
- Public assessment tables/RPCs, job marketplace, and employer portal code paths: zero files touched (confirmed by `git status`/`git diff --stat` — see §11).

## 8. Security review findings

No findings requiring further action; two findings were identified
and fixed during implementation itself (see §9) rather than left open.
Verified directly, not merely asserted:

- Zero `INSERT`/`UPDATE`/`DELETE` grants to `authenticated` on any of
  the 18 core Blueprint Engine tables.
- 25 RLS policies total, one `SELECT` policy per new table, RLS
  enabled on every one.
- All 33 RPCs are `SECURITY DEFINER` with an explicit
  `search_path=public` (confirmed by direct `pg_proc` query, not
  assumed).
- Cross-organisation Requirement Profile access is blocked both at
  read time (RLS) and at `start_assessment_run()` call time (explicit
  RPC-level check) — defense in depth, not a single control point.
- `compute_requirement_match()`'s inability to write `standard_result`
  is verified by a test that inspects the function's actual source
  (`pg_proc.prosrc`), not merely by code review.

## 9. Deviations from the architecture, with justification

Three items were discovered during implementation that the seven
approved documents did not anticipate. All three are additive,
narrowly-scoped fixes consistent with the architecture's own stated
guardrails (process stays hardcoded, no direct authenticated writes on
protected tables) — none required reopening any architectural decision.

**Deviation 1 — `assessment_run_reports` has no `CREATE TABLE` anywhere
in this repository's migration history.** Verified by exhaustive grep
across every `supabase/migrations/*.sql` file: only one file
references the table at all (`20260718190227_...sql`,
`save_career_report()`, which reads/writes it successfully against the
live project), and it contains no `CREATE TABLE`. **Fix:** a
`CREATE TABLE IF NOT EXISTS` reconstruction, with exact columns/types
inferred from `save_career_report()`'s own `INSERT` column list
(`run_id, user_id, completion_id, report_version, engine_version,
graph_version, profile_version, locale, inputs_hash, report`). Its
baseline `GRANT`/RLS policies are laid down **only** if no policy
already exists for the table (`SELECT 1 FROM pg_policies WHERE
tablename = 'assessment_run_reports'`) — a no-op everywhere the table
already exists (i.e. anywhere `save_career_report()` already works),
touching nothing live; only makes local disposable-Postgres testing
possible.

**Deviation 2 — `assessment_runs` already grants `authenticated` broad
"own row" `SELECT/INSERT/UPDATE/DELETE`, with no column-level
restriction** (`20260717052749_...sql`). Without a fix, this migration's
own new columns (`blueprint_version_id`, `scoring_profile_version_id`,
`requirement_profile_version_id`, `blueprint_run_stage`) would have
been directly writable by any signed-in participant, bypassing every
RPC in this migration — the exact class of gap the H3.3
(`employers.status`) and H3.4 (`jobs.status=rejected`) fixes closed for
their respective domains. **Fix:** the identical transaction-local-
marker + `BEFORE UPDATE` trigger pattern (`assessment_runs_blueprint_guard()`
+ `app.blueprint_run_transition_in_progress`), scoped so it **only**
fires when a Blueprint-Engine-owned column changes, or `status` changes
on a row that already has a `blueprint_version_id` — every existing
column, and the public assessment's own completion path
(`save_career_report()`), are provably unaffected (regression-tested,
§7). Empirically confirmed closed by test T11 (§6).

**Deviation 3 — the architecture's Backend document described an
answer-recording and question/module/scoring/requirement-weight
authoring pipeline without ever defining literal tables or RPCs for
it.** `assessment_run_answers` (a per-question-version answer-storage
table) and eleven small attach/detach/set RPCs
(`attach_evidence_signal_to_question_version`,
`attach_question_to_module_version`,
`attach_competency_to_module_version`,
`set_scoring_profile_weight`, `set_requirement_profile_weight`, and
their `detach`/inverse counterparts, plus `create_evidence_signal`)
were added as the minimum necessary population mechanism for the
many-to-many association tables the architecture *does* define —
these tables are otherwise completely unreachable once direct client
writes are (correctly) forbidden. All are admin-only, `draft`-state-
gated, and follow the identical RPC shape as everything else in this
migration; none introduce new UI-only or later-phase functionality.

No other deviation was made. `purpose`/`assessment_level` as lookup
tables (I1), the exactly-one-published-Scoring-Profile-Version
constraint (I3), the `ON DELETE RESTRICT` posture (C3), and the (A)/(B)
separation are all implemented exactly as corrected in the approved
architecture documents.

## 10. Rollback instructions

Every object in this migration is additive; rollback is a straight
`DROP` of everything it introduced, in reverse dependency order, with
zero risk to pre-existing data (nothing pre-existing was altered):

1. `DROP TRIGGER assessment_runs_blueprint_guard_trg ON public.assessment_runs; DROP FUNCTION public.assessment_runs_blueprint_guard();`
2. `DROP FUNCTION` every RPC listed in §4 (33 functions).
3. `ALTER TABLE public.assessment_runs DROP COLUMN blueprint_version_id, DROP COLUMN scoring_profile_version_id, DROP COLUMN requirement_profile_version_id, DROP COLUMN blueprint_run_stage;`
4. `ALTER TABLE public.assessment_run_reports DROP COLUMN standard_result, DROP COLUMN requirement_match, DROP COLUMN ai_narrative;` (drop the whole table instead, only if it did not already exist before this migration — check `pg_policies` first, per the header note in the migration itself).
5. `DROP TABLE` the 25 new tables from §3, in reverse creation order (audit tables → assessment_run_answers → requirement_profile_* → scoring_profile_* → blueprint_* → association tables → library tables → lookup tables).
6. `ALTER TABLE public.cig_professions DROP COLUMN is_assessable; ALTER TABLE public.cig_work_environments DROP COLUMN is_assessable;`

No data migration or backfill occurred in this migration, so no
rollback step can lose pre-existing data.

## 11. Exact git status

```
?? docs/architecture/blueprint-engine-architecture-review.md
?? docs/architecture/blueprint-engine-backend.md
?? docs/architecture/blueprint-engine-db-schema.md
?? docs/architecture/blueprint-engine-ddd.md
?? docs/architecture/blueprint-engine-frontend.md
?? docs/architecture/blueprint-engine-migration-strategy.md
?? docs/architecture/blueprint-engine-risk-assessment.md
?? supabase/migrations/20260720180000_h4_1_assessment_blueprint_engine_phase1.sql
?? tests/database/phase-h4-1-blueprint-engine/
```

(The seven `docs/architecture/*` files predate this phase — approved
and written in the prior architecture-review round. This phase adds
exactly two new items: the migration and the test directory.) `git
diff --stat` against tracked files is empty — no existing file was
modified. No UI, frontend route, real launch content, generated type,
or configuration file was added or changed.

## 12. Phase 1 acceptance criteria — PASSED

- [x] All approved Phase 1 schema entities exist (26 tables).
- [x] All required RLS policies are active (25 policies, RLS enabled on every new table).
- [x] All state-changing writes use approved RPCs (zero write grants to `authenticated` on any protected table).
- [x] All RPCs have explicit secure `search_path` and least-privilege grants (verified by direct query, T20).
- [x] No direct authenticated writes exist on protected tables (verified by test, T17/T18).
- [x] The Blueprint-to-existing-assessment-catalogue bridge works (verified by test, T3/T7).
- [x] A complete disposable test Assessment Run executed end to end: Blueprint published → Assessment Run started → answers stored → Standard Competency Result computed → Requirement Match computed → report stored → Assessment Run completed (T7–T14).
- [x] The Standard Result and Organisation Match remain structurally separate (T14/T15, verified by test not just review).
- [x] Historical version references cannot be changed or deleted (T16–T18).
- [x] Existing public-assessment functionality remains untouched (T7 regression replay, tsc/cie:check/kg:check all pass, zero existing files modified).
- [x] All new and existing relevant tests pass.
- [x] No UI or real launch content was added.

**Phase 1 is complete. Phase 2 (content authoring: Security Supervisor
profession record, 2×2 launch catalogue content) is not started, per
instruction.**
