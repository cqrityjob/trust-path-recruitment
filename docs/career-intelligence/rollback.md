# Sprint 09C Rollback

All Sprint 09C changes are **additive**. No existing Sprint 08 / 09B tables, columns, policies, or code paths were modified. Rollback is therefore clean and does not risk user data.

## Phase D — Career Intelligence Engine v1

Phase D is **code-only**. No database migrations, no schema changes, no
RLS changes. Rollback is a file-level revert:

1. Remove the engine directory:
   ```
   rm -rf src/lib/career-intelligence-engine
   rm scripts/cie-check.ts
   rm docs/career-intelligence/engine-v1.md
   ```
2. Remove the `cie:check` script from `package.json`.
3. The legacy assessment engine (`src/lib/career-assessment/*`) and the
   existing result page are **unchanged** — no downstream restoration
   needed.

If a downstream feature has begun consuming
`computeCareerIntelligenceMatches`, revert those call sites to the
legacy `computeMatches` from `@/lib/career-assessment` first. There is
no environment variable, feature flag, or DB toggle to reset.

## Activation state

- `GRAPH_ACTIVATION_STATE` in `src/lib/knowledge-graph/graph-meta.ts` is `'legacy'` until Phase E.
- Until activation, no user-facing UI reads from `cig_*` tables — the legacy TS seed continues to serve.
- Rolling back before Phase E therefore requires **no UI changes**.

## Rollback: after Phase A + hardening

```sql
-- Remove hardening constraints (safe: no data yet)
ALTER TABLE public.cig_profession_formal_requirements DROP CONSTRAINT IF EXISTS cig_pfr_country_iso;
ALTER TABLE public.cig_formal_requirements            DROP CONSTRAINT IF EXISTS cig_fr_country_iso;
ALTER TABLE public.cig_professions                    DROP CONSTRAINT IF EXISTS cig_professions_country_iso;
ALTER TABLE public.cig_career_transitions             DROP CONSTRAINT IF EXISTS cig_transitions_no_self_loop;

-- Remove hardening columns
DROP INDEX IF EXISTS public.cig_professions_ssyk_idx;
ALTER TABLE public.cig_professions             DROP COLUMN IF EXISTS ssyk_code;
ALTER TABLE public.cig_professions             DROP COLUMN IF EXISTS esco_uri;
ALTER TABLE public.cig_assessment_dimensions   DROP COLUMN IF EXISTS category;

-- Drop CIG relationship tables (order matters; children before parents)
DROP TABLE IF EXISTS public.cig_profession_source_references CASCADE;
DROP TABLE IF EXISTS public.cig_profession_experience_req CASCADE;
DROP TABLE IF EXISTS public.cig_profession_certification_rel CASCADE;
DROP TABLE IF EXISTS public.cig_profession_education_pathways CASCADE;
DROP TABLE IF EXISTS public.cig_profession_formal_requirements CASCADE;
DROP TABLE IF EXISTS public.cig_profession_assessment_signals CASCADE;
DROP TABLE IF EXISTS public.cig_profession_work_preferences CASCADE;
DROP TABLE IF EXISTS public.cig_profession_knowledge_req CASCADE;
DROP TABLE IF EXISTS public.cig_profession_skill_req CASCADE;
DROP TABLE IF EXISTS public.cig_profession_competency_req CASCADE;
DROP TABLE IF EXISTS public.cig_profession_work_environment_rel CASCADE;
DROP TABLE IF EXISTS public.cig_profession_employer_type_rel CASCADE;
DROP TABLE IF EXISTS public.cig_profession_sector_rel CASCADE;
DROP TABLE IF EXISTS public.cig_profession_family_rel CASCADE;

-- Drop CIG entity tables
DROP TABLE IF EXISTS public.cig_career_transitions CASCADE;
DROP TABLE IF EXISTS public.cig_source_references CASCADE;
DROP TABLE IF EXISTS public.cig_assessment_signals CASCADE;
DROP TABLE IF EXISTS public.cig_experience_types CASCADE;
DROP TABLE IF EXISTS public.cig_certifications CASCADE;
DROP TABLE IF EXISTS public.cig_education_pathways CASCADE;
DROP TABLE IF EXISTS public.cig_formal_requirements CASCADE;
DROP TABLE IF EXISTS public.cig_assessment_dimensions CASCADE;
DROP TABLE IF EXISTS public.cig_work_preferences CASCADE;
DROP TABLE IF EXISTS public.cig_knowledge_areas CASCADE;
DROP TABLE IF EXISTS public.cig_skills CASCADE;
DROP TABLE IF EXISTS public.cig_competencies CASCADE;
DROP TABLE IF EXISTS public.cig_work_environments CASCADE;
DROP TABLE IF EXISTS public.cig_employer_types CASCADE;
DROP TABLE IF EXISTS public.cig_sectors CASCADE;
DROP TABLE IF EXISTS public.cig_profession_specialisations CASCADE;
DROP TABLE IF EXISTS public.cig_profession_aliases CASCADE;
DROP TABLE IF EXISTS public.cig_professions CASCADE;
DROP TABLE IF EXISTS public.cig_profession_families CASCADE;

-- Drop enums
DROP TYPE IF EXISTS public.cig_relationship_criticality;
DROP TYPE IF EXISTS public.cig_alias_kind;
DROP TYPE IF EXISTS public.cig_source_type;
DROP TYPE IF EXISTS public.cig_link_status;
DROP TYPE IF EXISTS public.cig_quality_level;
DROP TYPE IF EXISTS public.cig_content_status;
```

### Code

- Delete `src/lib/knowledge-graph/read-v2.functions.ts`.
- Delete `src/integrations/supabase/public-server.ts`.
- In `src/lib/knowledge-graph/graph-meta.ts`, remove `GRAPH_VERSION_NEXT` and `GRAPH_ACTIVATION_STATE`.
- Delete `docs/career-intelligence/normalisation-manifest.md`.
- Delete this file.

### Verification

```bash
bunx tsgo --noEmit
bun run kg:check
```

Both must exit 0.

## Rollback: after Phase C (data seeded but UI still legacy)

Same as above — activation is still `'legacy'`, so dropping CIG tables does not affect the UI. If Phase D UI refactors have landed, revert those commits first, then run the drop block above.

### Data-only rollback (keep schema, drop Phase C seed)

Removes every row inserted under graph version `cig-2026.07-09C.1`. Schema, hardening constraints, and columns are untouched.

```sql
BEGIN;
DELETE FROM public.cig_profession_source_references     WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_knowledge_req         WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_sector_rel            WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_work_environment_rel  WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_employer_type_rel     WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_certification_rel     WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_education_pathways    WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_competency_req        WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_formal_requirements   WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_family_rel            WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_career_transitions               WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_specialisations       WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_aliases               WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_professions                      WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_source_references                WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_formal_requirements              WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_certifications                   WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_education_pathways               WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_experience_types                 WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_knowledge_areas                  WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_skills                           WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_competencies                     WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_work_preferences                 WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_work_environments                WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_employer_types                   WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_sectors                          WHERE graph_version = 'cig-2026.07-09C.1';
DELETE FROM public.cig_profession_families              WHERE graph_version = 'cig-2026.07-09C.1';
COMMIT;
```

## Rollback: after Phase E activation

1. Set `GRAPH_ACTIVATION_STATE = 'legacy'` in `graph-meta.ts` and redeploy — UI immediately reverts to the TS seed.
2. Then, at leisure, drop CIG tables as above.

No user-owned data lives in the `cig_*` tables (they are catalogue-only), so no data migration is ever required to roll back.

## Rollback: Phase D.1 (engine-driven result page)

Phase D.1 replaced the legacy assessment result composition with the
`EngineResultView` powered by `computeCareerIntelligenceMatches`. No database
or schema changes were introduced.

To roll back to the legacy result UI:

1. In `src/routes/security-career-assessment.tsx`, restore the previous
   `Results` function (git history contains the full block importing from
   `@/components/assessment/result`, `@/lib/career-assessment`, and
   `SaveToJourneyCard`). Re-add the removed imports at the top of the file.
2. Optionally remove the new file `src/components/assessment/result/engine-view.tsx`.
3. Keep `src/lib/career-intelligence-engine/**` untouched — the engine remains
   available for other consumers (MCP tool, tests).

No migrations to reverse. No data loss risk.