# Assessment Blueprint Engine — Migration Strategy

**Companion to:** [DB Schema](./blueprint-engine-db-schema.md) · [Risk Assessment](./blueprint-engine-risk-assessment.md)

> **Corrected per Architecture Quality Review** (findings C1, C2, C3
> reflected in the step ordering below; full finding list and
> disposition in
> [Architecture Review §11](./blueprint-engine-architecture-review.md#11-architecture-quality-review--corrections-applied)).

Goal: activate the Blueprint Engine without breaking any existing
functionality — public assessment, job marketplace, employer
portal (G1-G3), and H3.x moderation all continue operating unchanged
throughout and after this migration.

## 1. Ordered steps

### Step 0 — Data-integrity audit (pre-migration, read-only)

Before treating the `cig_*` graph as authoritative input to the
Blueprint Engine, run a one-time audit of the dangling profession-slug
references found during this review's own repo audit (relationship/
requirement-table rows referencing profession slugs — e.g.
`sakerhetschef`, `polis`, `brandman` — that are not present as seeded
`cig_professions` rows). Output: a list of references to either (a)
resolve by authoring the missing profession rows, or (b) confirm are
inert/unused and safe to ignore. This is read-only investigation, not
a schema change, and can happen before or in parallel with Step 1.

### Step 1 — Author the Security Supervisor profession record (content, not schema)

The launch catalogue requires Security Officer (already seeded as
`vaktare`) **and** Security Supervisor, which does not exist in
`cig_professions` today. Per the resolution in
[Architecture Review §4](./blueprint-engine-architecture-review.md#4-unresolved-product-owner-decisions)
and [DDD §3](./blueprint-engine-ddd.md#3-why-not-a-linear-hierarchy):
author and publish a new `cig_professions` row for Security Supervisor
through the graph's normal content pipeline (bilingual title/summary,
`graph_version`-stamped, linked into `cig_profession_family_rel` and
its own baseline `cig_profession_competency_req` rows like every other
profession). This is content authoring, using the existing seed-data
convention — no new table or column required.

### Step 2 — Additive schema migration

Apply the migration described in
[DB Schema §1-§6](./blueprint-engine-db-schema.md), **in the corrected
order the document now uses** (lookup tables → libraries →
associations → Blueprints/Scoring/Requirement Profiles → the C1
catalog bridge → the extended existing tables) — fixes I2, whose
original section order forward-referenced tables not yet defined.
This includes: the new `assessment_purposes`/`assessment_levels`
lookup tables (fixes I1, replacing the original CHECK-constrained
`purpose`/`assessment_level` columns); `is_assessable` flags on
`cig_professions`/`cig_work_environments`; all new Blueprint Engine
tables, with `ON DELETE RESTRICT` (not `CASCADE`) on every FK from an
association table to a `*_versions` table (fixes C3); the
`blueprint_versions.assessment_version_id` bridge column and its FK to
the pre-existing `assessment_versions` table (fixes C1); three new
nullable FK columns plus the new `blueprint_run_stage` column on
`assessment_runs` (fixes C2 — no existing `status` value is added or
altered); two new JSONB columns + reserved `ai_narrative` column on
`assessment_run_reports`. Every change in this step remains additive —
`ALTER TABLE ... ADD COLUMN` with nullable/defaulted columns, or
wholly new tables/lookup rows. No existing column is altered or
dropped, no existing row's data changes, and — corrected — no existing
`CHECK` constraint (on `purpose`, `assessment_level`, or
`assessment_runs.status`) is touched at all, since those concerns are
now handled by new lookup tables and a new additive column instead.

**Rollback for this step**: `DROP` the new tables (no data loss
possible — they start empty) and the new nullable columns
(`ALTER TABLE ... DROP COLUMN`, safe since nothing has written to them
yet at this point in the sequence).

### Step 3 — RLS and RPCs

Apply the RPCs from [Backend §2](./blueprint-engine-backend.md#2-rpc-inventory)
(including the C1 catalog-mirroring logic inside `create_blueprint_draft()`/
`publish_blueprint_version()`, and the I3 exactly-one-published-Scoring-
Profile-Version enforcement inside `publish_scoring_profile_version()`)
and the RLS policies from
[DB Schema §9](./blueprint-engine-db-schema.md#9-rls-model), which now
explicitly denies `DELETE` to `authenticated` on every table in this
migration (fixes C3) in addition to `INSERT`/`UPDATE`. Verified
independently before Step 4: no RLS policy anywhere in this step
grants `authenticated` a direct `INSERT`/`UPDATE`/`DELETE` on a
Blueprint Engine table — matching the audited convention already used
for `employers`/`jobs`/`job_applications`.

**Rollback for this step**: `DROP FUNCTION`/`DROP POLICY` — reversible
independent of Step 2's tables existing or not.

### Step 4 — Flip the launch-catalogue flags

Set `is_assessable = true` on exactly the 2×2 launch set (`vaktare` /
Security Supervisor × General Security / Datacenter environment rows)
— confirmed via Step 0 that these environment rows already exist in
`cig_work_environments`'s seeded set (`operational-security`/general
and a datacenter-equivalent row; exact slug mapping confirmed during
content authoring in Step 5, not assumed here).

**Rollback**: flip back to `false` — no data loss, purely a visibility
flag.

### Step 5 — Author minimum launch content

Create and publish: enough `modules`/`module_versions` to cover the
Competencies already seeded for the 2×2 set via
`cig_profession_competency_req`/`environment_competency_requirements`;
enough `questions`/`question_versions` per module to produce a
credible assessment (informed by, but not copied verbatim from, the
public 16-question assessment's *pattern*, not its content — the two
remain editorially separate per
[DDD §6](./blueprint-engine-ddd.md#6-public-16-question-assessment--convergence-path));
one `scoring_profile_version` per launch Blueprint Version, since
`cig_assessment_signals`/`cig_profession_assessment_signals` are
confirmed empty and cannot be "activated" — this is first-time
authoring, not reuse. Publish all of it via the Step 3 RPCs.

**Rollback**: archive the versions (never delete — matches the
`archived` status convention); no data-loss risk since nothing has
been consumed by an Assessment Run until Step 6.

### Step 6 — Ship the admin Builder + Recruitment journey

Frontend routes from
[Frontend §1-§3](./blueprint-engine-frontend.md). Feature-flagged the
same way `VITE_JOBS_ENABLED`/`VITE_EMPLOYER_PORTAL_ENABLED` gate
existing features — a new `VITE_BLUEPRINT_ENGINE_ENABLED` flag,
defaulting to `false`, so the entire feature ships dark until
explicitly turned on, exactly matching the existing rollout pattern
for G1/G2/G3 and H3.4.

**Rollback**: flip the feature flag back to `false` — instant, no data
implication, since Steps 2-5 are purely additive and inert without the
UI.

## 2. What is never touched by this migration

- Public 16-question assessment: routes, `assessment-content.ts`,
  `matching-engine.ts`, `scoreOne()`'s existing 14-`DimensionId` call
  sites — zero changes.
- Job marketplace tables/RPCs (`jobs`, `job_applications`,
  `reject_job()`, etc.) — zero changes.
- Employer/membership tables/RPCs (`employers`, `employer_memberships`,
  `update_employer_membership()`) — zero changes beyond being *read*
  by the new `requirement_profiles.employer_id` FK and
  `has_employer_role()` checks, which is a read-only dependency, not a
  modification.
- Any existing `cig_*` row's existing columns/data (only additive
  columns and net-new rows are introduced).

## 3. Verification per step

- After Step 2: run existing `tsc`/`cie:check`/`kg:check` (per this
  repo's established verification convention) to confirm the
  additive migration doesn't break existing generated types or engine
  isolation.
- After Step 3: a policy-listing query (`\dp` / `pg_policies`) per new
  table, confirming zero `authenticated`-grantable
  `INSERT`/`UPDATE`/`DELETE` policies — same method used to verify the
  G1/H3.3 RLS model; additionally attempt a direct `DELETE` against a
  published version row referenced by a test run and confirm it fails
  (fixes C3).
- After Step 4-5: a manual smoke test — resolve a Blueprint Version's
  full question set via `start_assessment_run()` for the 2×2 launch
  set and confirm a complete, scoreable run end-to-end, before any UI
  exists to drive it (RPC-level test, following the
  `tests/database/phase-*` convention already used for G1/H3.4).
- After Step 6: confirm the public assessment, job marketplace, and
  employer dashboard all continue to function unchanged with the flag
  off, and that the new journey is reachable only with the flag on.

## 4. MVP vs. later boundary (migration)

**This migration set delivers:** Steps 0-6 above, fully.

**Deferred to later, separately-scoped migrations:** employer
self-service Requirement Profile creation (RLS/RPC change only, no
schema change needed — see [Backend §2](./blueprint-engine-backend.md#2-rpc-inventory));
public-assessment convergence (§6 of DDD — wrapping it as its own
Blueprint); full organisation hierarchy tables; any billing/credits
schema; any AI-narrative pipeline (column already reserved, no
migration needed when it happens).

## 5. Product Owner decisions reflected in this plan

Per [Architecture Review §8](./blueprint-engine-architecture-review.md#8-product-owner-decisions):
this migration keeps the production 1–5 rating scale, keeps
Requirement Profile creation platform-admin-only, enforces exactly one
`published` Scoring Profile Version per Blueprint Version, and uses
lookup tables (not CHECK lists) for `purpose`/`assessment_level`. It
does **not** build public-assessment convergence (deferred until the
Recruitment journey is validated). **Still genuinely unresolved and
not assumed by this migration**: GDPR/retention duration for recurring
assessments — this migration introduces no Annual Review journey and
therefore accumulates no recurring-assessment history under that open
question.
