# CQrityjob backend transition — controlled release plan

**Status:** preparation only · no hosted write authorised · 2026-08-28

## Locked identities

| Role | Project | State |
|---|---|---|
| Lovable application | `9ec625ef-34a1-4b4b-8cbb-712cae168579` | Existing application |
| Current live backend | `zrahptwsnjcdyzfywbeh` | Lovable Cloud; remains live during transition |
| Candidate production backend | `vcgwvtmzftmulmoxmufv` | Owner-controlled Supabase; empty and healthy in Frankfurt |
| Permanently excluded | `mlvzmiutmyyqeuvjglco` | Never a deployment target or source of production truth |

The machine-readable source is `supabase/deployment-targets.json`. CI runs
`scripts/backend-target-lock-check.ts` and fails if these roles are mixed, if
application configuration moves early, or if a hosted Supabase write command
appears while release mode is `transition_preparation`.

## Desired steady state

1. Claude works in one feature branch and adds canonical migrations.
2. Pull-request CI performs clean full-history replay, RLS/security suites,
   rollback and deterministic application checks.
3. GitHub CI builds a disposable Postgres database from the committed
   migrations. This is the preview database on the current Supabase Free plan.
4. Owner merges a green PR.
5. Supabase deploys only the missing canonical migrations to the locked owner
   production project.
6. Lovable receives the code from `main`; publish occurs only after the schema
   and smoke checks are green.

GitHub is the canonical schema writer. Lovable remains the application builder,
preview and publishing surface; it must not independently generate a second
active migration for a change already represented canonically.

This sequencing follows Supabase's current deployment guidance: the GitHub
integration can deploy the production branch on all plans, while Supabase
Branching/preview environments require Pro. The repository therefore uses its
existing disposable-Postgres CI on the current Free plan instead of adding a
paid dependency.

## Staged transition

### Stage 0 — preparation (this change)

- Record all three database identities and the Lovable project identity.
- Keep `.env`, `supabase/config.toml` and `migrations-policy.json` on the
  current live Lovable backend.
- Keep `writeTargetRef = null` and automatic production deployment disabled.
- Add no credential, deployment workflow, migration or hosted connection.
- Reserve `CQ_SCHEMA_WRITE_TARGET_REF` as the only repository-runner variable
  that may declare a future schema write target. The application's existing
  `SUPABASE_PROJECT_ID` remains the current live read/runtime identity.

### Stage 1 — GitHub authorisation (no production deployment)

After this preparation change is merged, authorise the candidate Supabase
project for `cqrityjob/trust-path-recruitment` in **Project Settings →
Integrations → GitHub** with:

- working directory: `.`
- production branch: `main`
- deploy to production: **disabled**

Do not enable Supabase Branching. Preview branches require a paid Supabase plan
and are unnecessary here: the existing GitHub workflow already creates a clean,
disposable Postgres database and replays `supabase/migrations/` on every PR.
Authorising the integration is not permission to deploy.

### Stage 2 — repository proof and controlled bootstrap decision

Synchronise PR #126 with the preparation commit and require the existing GitHub
checks to pass. Required evidence:

- every canonical migration applies in filename order;
- clean replay, RLS/security and rollback checks are green;
- generated schema matches the repository types and expected object inventory;
- RLS and SQL security checks remain green;
- candidates, employers and platform roles pass the intended negative matrix;
- no AI provider or transcription credential exists.

The new Supabase project remains empty throughout this stage. A separate,
owner-approved bootstrap change will temporarily authorise deployment of the
already verified canonical history to that project. The project is treated as
a non-live candidate/UAT environment until application cutover is approved.

### Stage 3 — source export and data classification

Export the current Lovable Cloud database, Auth identities, Storage objects,
Edge Functions/configuration and secrets inventory. Classify each dataset as:

- production data to migrate;
- test/pilot fixture to recreate from canonical seeds; or
- obsolete data to retain only in the rollback export.

No data import occurs before repository replay proof. Auth and Storage are separate
workstreams; a successful SQL schema replay is not proof that users or files
have moved.

### Stage 4 — owner-approved production bootstrap

A separate PR changes `releaseMode` to `bootstrap_authorised` and sets
`writeTargetRef` to `vcgwvtmzftmulmoxmufv`. That PR must include the exact
bootstrap command/workflow, migration-list precheck, backup/export evidence and
rollback procedure. Only the owner may approve it.

Apply the full canonical history once to the empty owner project, verify the
remote migration list and schema fingerprints, then import approved data.

### Stage 5 — application cutover

Only after end-to-end UAT:

- update application public Supabase URL/project id/publishable key;
- configure Auth redirect URLs/providers, Edge Function secrets and Storage;
- point Lovable at the owner project using the supported connection flow;
- verify candidate, employer, Admin, Career Discovery, assessments, Passport
  and Interview Intelligence;
- publish, while retaining the Lovable Cloud export and rollback window.

### Stage 6 — normal automatic releases

A final PR records `cutover_complete`, makes the owner Supabase project the
canonical production backend, and enables automatic production deployment on
merge to `main`. The merge itself is the owner approval; no SQL is copied
through chat and no Lovable-generated duplicate is accepted.

## Stop conditions

Stop immediately if:

- any tool resolves production to `mlvzmiutmyyqeuvjglco`;
- application config and deployment target name different project refs;
- the candidate project differs from the repository clean replay after bootstrap;
- the candidate project is not empty before bootstrap;
- GitHub integration has Deploy to production enabled during Stages 1–3;
- a schema migration is generated independently by Lovable during transition;
- Auth, Storage or real user data cannot be reconciled without loss;
- PR #126 is merged before repository proof and release sequencing are green.

## Current owner action

None. Do not connect GitHub or Lovable and do not run SQL until the preparation
PR is merged and the exact Stage 1 click sequence is returned for owner action.

## Official references

- <https://supabase.com/docs/guides/deployment>
- <https://supabase.com/docs/guides/deployment/branching/github-integration>
- <https://supabase.com/docs/guides/deployment/managing-environments>
