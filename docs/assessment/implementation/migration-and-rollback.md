# Migration and rollback — PR-A

**Migrations:**
1. `20260727120000_scp_a1_security_competency_platform_domain.sql` — domain model + legacy retirement
2. `20260727130000_scp_a2_scoring_versions_and_publication_gates.sql` — owner decisions A–D

A2 is a second migration rather than an edit to A1 deliberately: A1 had been pushed, and a migration that has been pushed is one that might have been applied. A file whose content no longer matches what ran is unrecoverable, so additive-forward is the default even when the risk looks like zero.

## What it does

Additive only. A1 creates 21 `scp_*` tables, 8 functions, 16 triggers, RLS on every new table, and seeds the twelve constructs, 48 facets, 3 families and 3 professions. Then retires the legacy `security-guard-foundation` definition.

A2 adds `scp_scoring_versions` and `scp_item_version_professions` (23 tables total), three guard functions, and replaces `scp_bundle_versions.scoring_version` (text) with `scoring_version_id` (FK). That column replacement targets a table A1 created in this same unmerged PR which has never held a row; the migration **aborts with `SCP_A2_ABORT`** rather than proceed if that is ever untrue.

## What it touches outside its own schema

Exactly three things, all additive or reversible:

| Change | Object | Reversible |
|---|---|---|
| `ADD COLUMN IF NOT EXISTS retired_reason TEXT` | `assessment_versions` | Yes — `DROP COLUMN` |
| `UPDATE ... SET retired_at, retired_reason` | `assessment_versions` where `assessment_id='security-guard-foundation'` (1 row) | Yes — set both back to NULL |
| `UPDATE ... SET employer_visible=false` | `assessments` where `id='security-guard-foundation'` (1 row) | Yes — set back to true |
| `CREATE TRIGGER assessment_assignments_block_retired_trg` | `assessment_assignments` (BEFORE INSERT) | Yes — `DROP TRIGGER` |

**No existing column is altered or dropped. No existing RLS policy, grant or function is modified. No historical row's content is changed.** The trigger is INSERT-only, so no existing assignment is ever evaluated by it.

## Pre-migration checklist

1. Confirm `origin/main` is the base and no unapplied migrations are pending.
2. Confirm the current row count for `security-guard-foundation` assignments (expected: 3, of which 1 completed) so the post-migration count can be compared.
3. Snapshot `assessment_versions` for that definition (`id`, `retired_at`).

## Post-migration verification

```sql
-- Must be 23
select count(*) from information_schema.tables
 where table_schema='public' and table_name like 'scp\_%';

-- Must be 12 / 48 / 3 / 3 / 1
select count(*) from scp_competencies;
select count(*) from scp_competency_facets;
select count(*) from scp_assessment_families;
select count(*) from scp_professions;
select count(*) from scp_scoring_versions;

-- Owner decision A: bundles pin a scoring version by FK, not by a label
select count(*) from information_schema.columns
 where table_name='scp_bundle_versions' and column_name='scoring_version_id';

-- Legacy retired but NOT mutated: count and scores unchanged
select count(*) from assessment_assignments where assessment_id='security-guard-foundation';
select retired_at is not null from assessment_versions where assessment_id='security-guard-foundation';
```

Then run the full suite (see [test matrix](./test-matrix.md)).

## Rollback

Nothing pre-existing is altered, so rollback cannot lose pre-existing data.

```sql
BEGIN;

-- 1. Legacy retirement (restores the pre-migration state exactly)
DROP TRIGGER IF EXISTS assessment_assignments_block_retired_trg ON public.assessment_assignments;
DROP FUNCTION IF EXISTS public.assessment_assignments_block_retired();
UPDATE public.assessments SET employer_visible = true WHERE id = 'security-guard-foundation';
UPDATE public.assessment_versions SET retired_at = NULL, retired_reason = NULL
 WHERE assessment_id = 'security-guard-foundation';
ALTER TABLE public.assessment_versions DROP COLUMN IF EXISTS retired_reason;

-- 2. A2 objects
DROP FUNCTION IF EXISTS public.scp_bundle_version_assignability(uuid);
DROP TRIGGER IF EXISTS scp_item_versions_legal_gate ON public.scp_item_versions;
DROP TRIGGER IF EXISTS scp_item_versions_insert_status ON public.scp_item_versions;
DROP FUNCTION IF EXISTS public.scp_guard_legal_review_before_publish();
DROP FUNCTION IF EXISTS public.scp_guard_item_insert_status();
DROP TABLE IF EXISTS public.scp_item_version_professions CASCADE;
ALTER TABLE public.scp_bundle_versions DROP COLUMN IF EXISTS scoring_version_id;
DROP TABLE IF EXISTS public.scp_scoring_versions CASCADE;

-- 3. A1 schema, reverse dependency order
DROP TABLE IF EXISTS public.scp_publication_approvals CASCADE;
DROP TABLE IF EXISTS public.scp_content_events CASCADE;
DROP TABLE IF EXISTS public.scp_role_weight_profile_weights CASCADE;
DROP TABLE IF EXISTS public.scp_bundle_versions CASCADE;
DROP TABLE IF EXISTS public.scp_bundles CASCADE;
DROP TABLE IF EXISTS public.scp_role_weight_profiles CASCADE;
DROP TABLE IF EXISTS public.scp_form_items CASCADE;
DROP TABLE IF EXISTS public.scp_forms CASCADE;
DROP TABLE IF EXISTS public.scp_item_option_texts CASCADE;
DROP TABLE IF EXISTS public.scp_item_options CASCADE;
DROP TABLE IF EXISTS public.scp_item_texts CASCADE;
DROP TABLE IF EXISTS public.scp_item_versions CASCADE;
DROP TABLE IF EXISTS public.scp_items CASCADE;
DROP TABLE IF EXISTS public.scp_assessment_versions CASCADE;
DROP TABLE IF EXISTS public.scp_assessment_definitions CASCADE;
DROP TABLE IF EXISTS public.scp_competency_facets CASCADE;
DROP TABLE IF EXISTS public.scp_competency_versions CASCADE;
DROP TABLE IF EXISTS public.scp_competencies CASCADE;
DROP TABLE IF EXISTS public.scp_professions CASCADE;
DROP TABLE IF EXISTS public.scp_assessment_families CASCADE;
DROP TABLE IF EXISTS public.scp_content_roles CASCADE;

DROP FUNCTION IF EXISTS public.scp_guard_bundle_composition();
DROP FUNCTION IF EXISTS public.scp_guard_family_product_separation();
DROP FUNCTION IF EXISTS public.scp_guard_definition_identity();
DROP FUNCTION IF EXISTS public.scp_guard_family_identity();
DROP FUNCTION IF EXISTS public.scp_guard_child_of_published();
DROP FUNCTION IF EXISTS public.scp_guard_published_immutable();
DROP FUNCTION IF EXISTS public.scp_can_author(uuid);
DROP FUNCTION IF EXISTS public.scp_has_content_role(uuid, text);

COMMIT;
```

## Partial rollback

Rolling back **only** the legacy retirement (step 1) while keeping the new schema is safe and supported — the two halves have no dependency on each other. Use this if the retirement needs to be deferred for a commercial reason while the platform work continues.
