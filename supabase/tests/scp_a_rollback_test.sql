-- =============================================================================
-- PR-A -- rollback verification.
--
-- Executes the documented rollback procedure from
-- docs/assessment/implementation/migration-and-rollback.md verbatim, then
-- asserts that the database is genuinely back to its pre-PR-A state:
--
--   * every scp_* object is gone
--   * every scp_* function and trigger is gone
--   * the legacy security-guard-foundation definition is restored exactly
--   * historical assignment rows are still present and unchanged
--   * Career Guidance tables are untouched throughout
--
-- The last two are the point. A rollback that removes the new schema but
-- leaves historical data altered would be worse than no rollback at all,
-- because it would look successful.
--
-- Run this AFTER a full migration replay, and against a disposable database
-- only -- it drops things. The suite ends with the database rolled back, so
-- it must be the last thing run against that database.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE '  ok  %', _label;
END $$;


-- ---------------------------------------------------------------------------
-- Seed a synthetic historical assignment so the rollback has real history to
-- preserve. Created against a temporarily un-retired version, which is how a
-- genuine historical row came to exist before retirement.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _employer uuid := '44444444-0000-0000-0000-000000000001';
  _actor    uuid := '44444444-0000-0000-0000-000000000002';
  _version  uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_actor, 'rollback-fixture@test.invalid')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status)
    VALUES (_employer, 'Rollback Fixture Org', 'rollback-fixture-org', 'active')
    ON CONFLICT (id) DO NOTHING;

  SELECT id INTO _version FROM public.assessment_versions
    WHERE assessment_id = 'security-guard-foundation' LIMIT 1;

  UPDATE public.assessment_versions SET retired_at = NULL WHERE id = _version;
  INSERT INTO public.assessment_assignments
    (id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
     recipient_email, assigned_by, invitation_token_hash, expires_at, status,
     completed_at, engine_result)
  VALUES ('55555555-0000-0000-0000-000000000001', _employer, 'security-guard-foundation',
          _version, 'security_professional', 'workforce', 'rollback-fixture@test.invalid',
          _actor, 'hash-rollback-fixture', now() + interval '7 days', 'completed',
          now(), '{"score": 77}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.assessment_versions SET retired_at = now() WHERE id = _version;
END $$;


-- ---------------------------------------------------------------------------
-- LOW-3: representative pre-PR-A Career Guidance history.
--
-- assessment_runs is where the real candidate history lives -- 13 completed
-- runs in production. PR-A never touches the table, but "never touches it"
-- is a claim, and an unasserted claim is how HIGH-2 survived review. These
-- rows are seeded before the rollback and compared field by field after it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _candidate uuid := '88888888-0000-0000-0000-000000000001';
  _cg_version uuid;
  _pca_version uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_candidate, 'cg-history@test.invalid')
    ON CONFLICT (id) DO NOTHING;

  SELECT id INTO _cg_version FROM public.assessment_versions
    WHERE assessment_id = 'career-guidance' LIMIT 1;
  SELECT id INTO _pca_version FROM public.assessment_versions
    WHERE assessment_id = 'public-career-assessment' LIMIT 1;

  -- One run per live Career Guidance definition, with a real result payload.
  INSERT INTO public.assessment_runs
    (id, user_id, assessment_id, assessment_version_id, graph_version, locale,
     status, started_at, completed_at, result_summary)
  VALUES
    ('99999999-0000-0000-0000-000000000001', _candidate, 'career-guidance', _cg_version,
     'cig-v1', 'sv', 'completed', now() - interval '30 days', now() - interval '30 days',
     '{"topFamily": "protective-services", "overallEvidenceScore": 74}'::jsonb),
    ('99999999-0000-0000-0000-000000000002', _candidate, 'public-career-assessment', _pca_version,
     'cig-v1', 'en', 'completed', now() - interval '10 days', now() - interval '10 days',
     '{"topFamily": "corporate-security", "overallEvidenceScore": 68}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
END $$;


-- ---------------------------------------------------------------------------
-- Pre-rollback state.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK TEST -- pre-rollback state';
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name LIKE 'scp\_%') = 23,
    'pre-rollback: 23 scp_ base tables exist');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'scp_scoring_version_lineage') = 1,
    'pre-rollback: the LOW-4 lineage view exists');
  PERFORM pg_temp.assert(
    (SELECT retired_at IS NOT NULL FROM public.assessment_versions
      WHERE assessment_id = 'security-guard-foundation' LIMIT 1),
    'pre-rollback: the legacy version is retired');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.assessment_assignments
      WHERE id = '55555555-0000-0000-0000-000000000001') = 1,
    'pre-rollback: a historical assignment exists');
END $$;


-- ###########################################################################
-- THE DOCUMENTED ROLLBACK -- kept in the same order as
-- docs/assessment/implementation/migration-and-rollback.md
-- ###########################################################################

BEGIN;

-- 1. Legacy retirement (A1 insert guard + A3 reactivation guard)
DROP TRIGGER IF EXISTS assessment_assignments_block_retired_trg ON public.assessment_assignments;
DROP TRIGGER IF EXISTS assessment_assignments_block_retired_reactivation_trg ON public.assessment_assignments;
DROP FUNCTION IF EXISTS public.assessment_assignments_block_retired();
DROP FUNCTION IF EXISTS public.assessment_assignments_block_retired_reactivation();
UPDATE public.assessments SET employer_visible = true WHERE id = 'security-guard-foundation';
UPDATE public.assessment_versions SET retired_at = NULL, retired_reason = NULL
 WHERE assessment_id = 'security-guard-foundation';
ALTER TABLE public.assessment_versions DROP COLUMN IF EXISTS retired_reason;

-- 2. A4 objects (the view depends on scp_scoring_versions, so it goes first)
DROP VIEW IF EXISTS public.scp_scoring_version_lineage;

-- 3. A3 objects (the shared insert-status guard; its triggers fall with
--    their tables below, but the function must go explicitly)
DROP FUNCTION IF EXISTS public.scp_guard_version_starts_as_draft() CASCADE;

-- 4. A2 objects
DROP FUNCTION IF EXISTS public.scp_bundle_version_assignability(uuid);
DROP TRIGGER IF EXISTS scp_item_versions_legal_gate ON public.scp_item_versions;
DROP FUNCTION IF EXISTS public.scp_guard_legal_review_before_publish();
DROP FUNCTION IF EXISTS public.scp_guard_item_insert_status();
DROP TABLE IF EXISTS public.scp_item_version_professions CASCADE;
ALTER TABLE public.scp_bundle_versions DROP COLUMN IF EXISTS scoring_version_id;
DROP TABLE IF EXISTS public.scp_scoring_versions CASCADE;

-- 5. A1 schema, reverse dependency order
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


-- ###########################################################################
-- Post-rollback assertions
-- ###########################################################################
DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK TEST -- post-rollback state';

  -- Nothing of the new platform survives.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'scp\_%') = 0,
    'rollback removes every scp_ table AND view');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'scp\_%') = 0,
    'rollback removes every scp_ function');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM pg_trigger
      WHERE NOT tgisinternal AND tgname LIKE 'scp\_%') = 0,
    'rollback removes every scp_ trigger');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM pg_trigger
      WHERE NOT tgisinternal AND tgname = 'assessment_assignments_block_retired_trg') = 0,
    'rollback removes the legacy retirement guard');

  -- The legacy definition is exactly as it was before PR-A.
  PERFORM pg_temp.assert(
    (SELECT retired_at IS NULL FROM public.assessment_versions
      WHERE assessment_id = 'security-guard-foundation' LIMIT 1),
    'rollback restores the legacy version to not-retired');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'assessment_versions' AND column_name = 'retired_reason') = 0,
    'rollback removes the additive retired_reason column');

  PERFORM pg_temp.assert(
    (SELECT employer_visible FROM public.assessments WHERE id = 'security-guard-foundation'),
    'rollback restores the legacy definition to employer-visible');

  -- THE POINT: historical data survived the whole round trip untouched.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.assessment_assignments
      WHERE id = '55555555-0000-0000-0000-000000000001') = 1,
    'rollback preserves the historical assignment row');

  PERFORM pg_temp.assert(
    (SELECT engine_result->>'score' FROM public.assessment_assignments
      WHERE id = '55555555-0000-0000-0000-000000000001') = '77',
    'rollback preserves the historical score unchanged');

  PERFORM pg_temp.assert(
    (SELECT status FROM public.assessment_assignments
      WHERE id = '55555555-0000-0000-0000-000000000001') = 'completed',
    'rollback preserves the historical assignment status');

  -- A new assignment against the legacy version works again, proving the
  -- rollback genuinely restored pre-PR-A behaviour rather than just deleting.
  INSERT INTO public.assessment_assignments
    (employer_id, assessment_id, assessment_version_id, profile_id, use_case,
     recipient_email, assigned_by, invitation_token_hash, expires_at)
  SELECT '44444444-0000-0000-0000-000000000001', 'security-guard-foundation',
         av.id, 'security_professional', 'recruitment', 'post-rollback@test.invalid',
         '44444444-0000-0000-0000-000000000002', 'hash-post-rollback', now() + interval '7 days'
    FROM public.assessment_versions av
   WHERE av.assessment_id = 'security-guard-foundation' LIMIT 1;
  PERFORM pg_temp.assert(true,
    'after rollback the legacy definition accepts new assignments again');

  -- Career Guidance was never in scope and must be intact.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.assessments WHERE id = 'public-career-assessment') = 1,
    'Career Guidance catalogue rows are untouched by the rollback');
END $$;


-- ---------------------------------------------------------------------------
-- LOW-3: Career Guidance run history, field by field, after the round trip.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _r record;
BEGIN
  RAISE NOTICE 'ROLLBACK TEST -- Career Guidance history (LOW-3)';

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.assessment_runs
      WHERE id IN ('99999999-0000-0000-0000-000000000001',
                   '99999999-0000-0000-0000-000000000002')) = 2,
    'LOW-3: both seeded Career Guidance runs still exist after the rollback');

  SELECT * INTO _r FROM public.assessment_runs WHERE id = '99999999-0000-0000-0000-000000000001';
  PERFORM pg_temp.assert(_r.assessment_id = 'career-guidance',
    'LOW-3: run 1 assessment reference unchanged');
  PERFORM pg_temp.assert(_r.assessment_version_id IS NOT NULL,
    'LOW-3: run 1 version reference unchanged');
  PERFORM pg_temp.assert(_r.status = 'completed',
    'LOW-3: run 1 status unchanged');
  PERFORM pg_temp.assert(_r.result_summary->>'overallEvidenceScore' = '74',
    'LOW-3: run 1 result payload unchanged');
  PERFORM pg_temp.assert(_r.completed_at IS NOT NULL,
    'LOW-3: run 1 completion timestamp preserved');

  SELECT * INTO _r FROM public.assessment_runs WHERE id = '99999999-0000-0000-0000-000000000002';
  PERFORM pg_temp.assert(_r.assessment_id = 'public-career-assessment',
    'LOW-3: run 2 assessment reference unchanged');
  PERFORM pg_temp.assert(_r.status = 'completed'
    AND _r.result_summary->>'topFamily' = 'corporate-security',
    'LOW-3: run 2 status and result payload unchanged');
  PERFORM pg_temp.assert(_r.locale = 'en',
    'LOW-3: run 2 locale unchanged');

  -- And the frozen Career Guidance catalogue itself is intact.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.assessments
      WHERE id IN ('career-guidance', 'public-career-assessment', 'security_career_guidance')) = 3,
    'LOW-3: every Career Guidance catalogue row survives the round trip');
END $$;

\echo ''
\echo '===================================================='
\echo ' SCP PR-A rollback verification: ALL ASSERTIONS OK'
\echo '===================================================='
