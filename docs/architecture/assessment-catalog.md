# The Assessment Catalog

**Status: implemented.** This document names and describes a pattern that already existed in the schema (`assessments` × `assessment_versions`, live since Sprint 08) and formalizes it as the platform's single registry of Assessment Definitions — public or organisational, present or future.

## What it is

There is **one** catalog, not a special "public" table and a special "employer" table:

- `public.assessments` — one row per **Assessment Definition**. `id` (text PK), `name_sv`/`name_en`, `kind` (`career_guidance` | `professional`).
- `public.assessment_versions` — one row per **Assessment Version** of a definition. `assessment_id → assessments(id)`, `model_version`, `disclaimer_version`, `published_at`, `retired_at`, `notes`.

Both tables are pure lookup/versioning rows — no code change, no RLS change, no CHECK-constraint change is ever required to register a new definition. Every existing RLS policy on `assessment_runs` / `assessment_run_reports` is scoped by `user_id` / `is_platform_admin()`, never by `assessment_id`, so a brand-new definition's runs are automatically covered by the existing policies the moment a candidate starts one.

## Registered definitions (as of this refactor)

| `assessments.id` | kind | Purpose |
|---|---|---|
| `career-guidance` | `career_guidance` | **Frozen, historical.** The original public-facing identity the 16-question assessment ran under before this refactor. Never touched again — every historical `assessment_runs`/`assessment_run_reports` row referencing it stays exactly as it was. |
| `public-career-assessment` | `career_guidance` | The new, adaptive Public Career Assessment. 8 Universal Core + 8 profile questions, assembled at run time from the Question Library (see `docs/job-intelligence/public-career-assessment-v1-spec.md`). Live at `/security-career-assessment`. |
| `security-guard-foundation` | `professional` | The preserved 16-question content (byte-for-byte identical text, mappings and scoring to the original `career-guidance` v2.1 release), registered as the first of what will be many Assessment Catalog definitions for organisations. |

Migrations: `supabase/migrations/20260721110000_assessment_catalog_public_career_assessment.sql` and `20260721110100_assessment_catalog_security_guard_foundation.sql` — both pure additive `INSERT`s, `ON CONFLICT DO NOTHING`, zero `ALTER TABLE`.

## Adding the next definition

Every future organisational Assessment Definition (Datacenter Security, SOC Analyst, Public Order Guard variant, AML, Investigator, etc.) follows the exact same two-`INSERT` pattern:

1. `INSERT INTO assessments (id, name_sv, name_en, kind) VALUES (...)`.
2. `INSERT INTO assessment_versions (assessment_id, model_version, disclaimer_version, notes) VALUES (...)`.
3. Author its question set in the Question Library (`src/lib/question-library/`, see below) — reusing existing Competency Library entries and Question Assets wherever the content genuinely overlaps with an existing definition (this is precisely what `security-guard-foundation`'s 8 shared `security_professional` assets already demonstrate).

No schema change, no RLS change, no scoring-engine change. The richer `blueprints`/`blueprint_versions` catalog (Purpose × Role × Environment × Level, from the H4.1 migration) remains available for a future, deliberately deferred convergence, but is not required for a new definition to exist and run today.

## What never changes when a new definition is added

- `assessments.kind`'s two existing values already cover every product shape in scope (`career_guidance` for individual-facing products, `professional` for organisational ones).
- No existing `assessments`/`assessment_versions` row is ever updated or deleted.
- `assessment_runs.assessment_id` / `assessment_version_id` are `NOT NULL` FKs already satisfied by any new, valid catalog row — no migration needed for new runs to start flowing.

## Related platform layers

- **Question Library** (`src/lib/question-library/`) — see its own assets reference a `supportedAssessmentDefinitions` list of catalog `assessment_id` values, the mechanism by which one question can be a member of more than one Assessment Definition.
- **Competency Library** (`docs/architecture/competency-library.md`) — the layer beneath the Question Library.
- **Career Intelligence Service** (`src/lib/career-intelligence-engine/`) — callable by any Assessment Definition, not owned by any one of them (see `ComputeInput.assessmentDefinitionId` in `career-intelligence-engine/index.ts`).
