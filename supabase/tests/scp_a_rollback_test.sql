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
  --
  -- The public-career-assessment row represents a run created BEFORE the
  -- Career Discovery cutover retired that definition. The retirement trigger
  -- blocks new runs and cannot distinguish "seeding history" from "starting
  -- one now", so it is disabled for this seed only. Nothing downstream is
  -- weakened: every preservation assertion still runs, and the trigger's own
  -- behaviour is asserted separately in the Career Discovery suite.
  ALTER TABLE public.assessment_runs DISABLE TRIGGER assessment_runs_block_retired_definition_trg;

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

  ALTER TABLE public.assessment_runs ENABLE TRIGGER assessment_runs_block_retired_definition_trg;
END $$;


-- ---------------------------------------------------------------------------
-- Phase 0 rolls back FIRST.
--
-- Layers unwind in reverse order. The Competency Graph (20260802090000) was
-- added on top of PR-A, so it must come off before PR-A's own documented
-- procedure runs -- which is left byte-for-byte unchanged below.
--
-- Everything here is additive-only in the forward direction, so the rollback is
-- a plain DROP of objects nothing else references. The evidence ledger is
-- dropped with it: at Phase 0 there is no evidence to preserve, and once there
-- is, this rollback stops being available -- which is stated in the Phase 0
-- migration's own header.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK TEST -- closed test, Phase 2, Phase 1 (Academy), Phase 0 (Graph) unwind first';
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name LIKE 'scp\_%') = 66,
    'pre-rollback: 66 scp_ base tables exist (23 PR-A + 15 graph + 23 Academy + 2 Phase 2 + 1 test grants + 1 follow-up prompts + 1 employer decisions)');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_competency_evidence) = 0,
    'pre-rollback: the evidence ledger is empty, so Phase 0 is safely reversible');
END $$;

-- Closed-test governance (20260818090000) comes off before everything else:
-- it is the newest layer, and it sits ON TOP of Phase 2 — scp_attempts carries
-- four columns it added, and scp_test_grants references scp_assessment_
-- definitions from PR-A.
--
-- This step was missing until the whole suite could run far enough to reveal
-- it: the public-flow suite aborted earlier in the run, so this file never
-- executed and scp_test_grants survived a rollback that claims to remove every
-- scp_ object. The four scp_attempts columns and the lineage trigger are NOT
-- dropped individually — scp_attempts itself is dropped in the Phase 2 unwind
-- below, and they go with it.
--
-- The grant rows are dropped, not preserved. A governance grant is permission
-- to run content that no longer exists after this rollback; keeping it would
-- leave an organisation holding a pilot grant against nothing.
DROP FUNCTION IF EXISTS
  public.scp_grant_permits_assignment(uuid, uuid, text, text, boolean) CASCADE;
DROP FUNCTION IF EXISTS
  public.scp_has_test_grant(uuid, public.scp_governance_mode, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_governance_lineage_immutable() CASCADE;
-- The purpose mapping (20260820090000) has to be named explicitly. Most SCP
-- functions disappear with `DROP TYPE scp_governance_mode CASCADE` below,
-- because that enum appears in their signature or return type. This one takes
-- text and returns text, so nothing cascades to it and it would otherwise
-- survive a rollback that claims to remove every scp_ object.
DROP FUNCTION IF EXISTS public.scp_required_purpose_code(text, text) CASCADE;
-- Phase 8 (20260820100000). Same reasoning: the state projection returns text
-- and takes no governance type, so it survives the enum cascade and has to be
-- named. The follow-up prompt catalogue is report content and goes with it.
DROP FUNCTION IF EXISTS public.scp_display_evidence_state(uuid, uuid, text) CASCADE;
-- 20260820130000: the attempt-scoped pair. Same reasoning again -- uuid/text
-- signatures, so the governance-enum cascade does not reach them.
DROP FUNCTION IF EXISTS public.scp_attempt_maturity(uuid, uuid, text, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.scp_attempt_evidence_state(uuid, uuid, text) CASCADE;
DROP TABLE    IF EXISTS public.scp_followup_prompts CASCADE;
-- Part F (20260820120000). The decision table references scp_attempts, so it
-- has to go before the Phase 2 unwind reaches them.
DROP FUNCTION IF EXISTS public.scp_record_employer_decision(uuid, text, text, text, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_decisions(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_decision_append_only() CASCADE;
DROP TABLE    IF EXISTS public.scp_employer_report_decisions CASCADE;
-- Phase 8.5A (20260821090000). The SCP duplicate protection lives ON the
-- pre-existing assessment_assignments table, so it cannot ride out on a
-- DROP TABLE the way the rest of the domain does. The three trigger functions
-- return `trigger`, so the governance-enum cascade below does not reach them
-- either: they have to be named. CASCADE takes their triggers with them, and
-- dropping the column takes the partial unique index.
--
-- The rest of the phase needs no unwind. The read-only policies it installed
-- sit on scp_ tables that are dropped outright below. The narrowed legacy
-- write policies (assignments_employer_insert / _update, owner+admin instead
-- of any member) are deliberately NOT reopened: rolling the SCP platform back
-- is not a reason to hand an ordinary member write access to the legacy
-- assignment table again, and the legacy product never relied on it.
DROP FUNCTION IF EXISTS public.scp_guard_one_open_assignment() CASCADE;
DROP FUNCTION IF EXISTS public.scp_mark_assignment_open() CASCADE;
DROP FUNCTION IF EXISTS public.scp_clear_assignment_open() CASCADE;
DROP FUNCTION IF EXISTS public.scp_sync_assignment_terminal_status() CASCADE;
ALTER TABLE public.assessment_assignments DROP COLUMN IF EXISTS scp_open;
DROP TABLE    IF EXISTS public.scp_test_grants CASCADE;
DROP TYPE     IF EXISTS public.scp_governance_mode CASCADE;

-- Phase 2 comes off next: its read models depend on Phase 1 columns.
-- The participant read model (20260819090000) is a read model over
-- assessment_assignments, which is pre-existing and stays; only the view goes.
DROP VIEW IF EXISTS public.scp_rm_employer_participants CASCADE;
DROP VIEW IF EXISTS public.scp_rm_employer_assignments CASCADE;
DROP VIEW IF EXISTS public.scp_rm_review_queue CASCADE;
DROP FUNCTION IF EXISTS public.scp_resolve_participant_identity(uuid, uuid) CASCADE;
-- Phase 2b: delivery, scoring, review and release. Snapshots go with them --
-- they are a Phase 2 artefact, and the evidence they project from survives in
-- the ledger, which is the whole reason snapshots are safe to drop.
DROP TABLE    IF EXISTS public.scp_report_snapshots CASCADE;
DROP TABLE    IF EXISTS public.scp_fixture_access CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_snapshot_immutable() CASCADE;
DROP FUNCTION IF EXISTS public.scp_get_attempt_items(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_submit_attempt(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_complete_human_review(uuid, text, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_release_attempt_report(uuid) CASCADE;
-- Phase 2e: the remaining Assessment Center operations.
DROP FUNCTION IF EXISTS public.scp_employer_library(uuid) CASCADE;
-- Both signatures: the ungoverned 5-argument original and the governed
-- 7-argument replacement from 20260819100000. A replay that stopped before
-- that migration still has the old one.
DROP FUNCTION IF EXISTS public.scp_employer_assign(uuid, uuid, text, timestamptz, text) CASCADE;
DROP FUNCTION IF EXISTS
  public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_participants(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_review_pressure(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_development_recommendations(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_start_learning_attempt(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_get_learning_feedback(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_complete_learning_module(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_schedule_reassessment(uuid, uuid, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.scp_subject_progress(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_my_academy_assignments() CASCADE;
-- Phase 2h corrections.
DROP FUNCTION IF EXISTS public.scp_guard_no_learning_feedback_on_assessment() CASCADE;
ALTER TABLE public.scp_assessment_versions DROP COLUMN IF EXISTS program_version_id;
-- Phase 2c: the published test fixture.
--
-- Publication makes content immutable BY DESIGN, so a teardown cannot simply
-- delete it -- it has to unpublish first. That friction is the guard working,
-- not an obstacle to route around, and it is exactly what a real retirement
-- would encounter. The triggers come off explicitly and go straight back on.
ALTER TABLE public.scp_item_versions       DISABLE TRIGGER USER;
ALTER TABLE public.scp_assessment_versions DISABLE TRIGGER USER;

UPDATE public.scp_item_versions SET content_status = 'draft'
 WHERE id IN (
   SELECT fi.item_version_id FROM public.scp_form_items fi
     JOIN public.scp_forms f  ON f.id = fi.form_id
     JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
     JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    WHERE d.is_test_fixture);

UPDATE public.scp_assessment_versions SET content_status = 'draft'
 WHERE definition_id IN (
   SELECT id FROM public.scp_assessment_definitions WHERE is_test_fixture);

ALTER TABLE public.scp_item_versions       ENABLE TRIGGER USER;
ALTER TABLE public.scp_assessment_versions ENABLE TRIGGER USER;

DELETE FROM public.scp_report_versions WHERE report_key LIKE 'fixture-%';

-- Phase 2f: the Learning Mode fixture, its programme and its module.
ALTER TABLE public.scp_program_versions DISABLE TRIGGER USER;
ALTER TABLE public.scp_module_versions  DISABLE TRIGGER USER;
UPDATE public.scp_module_versions  SET content_status = 'draft'
 WHERE program_version_id IN (
   SELECT pv.id FROM public.scp_program_versions pv
     JOIN public.scp_programs p ON p.id = pv.program_id
    WHERE p.slug LIKE 'fixture-%');
UPDATE public.scp_program_versions SET content_status = 'draft'
 WHERE program_id IN (SELECT id FROM public.scp_programs WHERE slug LIKE 'fixture-%');
ALTER TABLE public.scp_program_versions ENABLE TRIGGER USER;
ALTER TABLE public.scp_module_versions  ENABLE TRIGGER USER;

ALTER TABLE public.scp_assessment_definitions DROP COLUMN IF EXISTS is_test_fixture;

-- Phase 1 (Academy) comes off next: it sits on top of Phase 0.
DROP TABLE IF EXISTS public.scp_review_requirements     CASCADE;
DELETE FROM public.scp_item_option_texts iot USING public.scp_item_options o,
       public.scp_item_versions iv
 WHERE iot.item_option_id = o.id AND o.item_version_id = iv.id AND iv.mode IS NOT NULL;
DELETE FROM public.scp_item_texts t USING public.scp_item_versions iv
 WHERE t.item_version_id = iv.id AND iv.mode IS NOT NULL;
DELETE FROM public.scp_item_options o USING public.scp_item_versions iv
 WHERE o.item_version_id = iv.id AND iv.mode IS NOT NULL;
DROP FUNCTION IF EXISTS public.scp_guard_learning_counterpart() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_best_worst_keys()      CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_construct_honesty()    CASCADE;
DROP TRIGGER IF EXISTS scp_assignments_target_published_trg ON public.assessment_assignments;
DROP FUNCTION IF EXISTS public.scp_guard_assignment_targets_published() CASCADE;
ALTER TABLE public.assessment_assignments DROP CONSTRAINT IF EXISTS assessment_assignments_single_lineage;
ALTER TABLE public.assessment_assignments DROP COLUMN IF EXISTS scp_assessment_version_id;
DROP TABLE IF EXISTS public.scp_ai_scoring_dimensions   CASCADE;
DROP TABLE IF EXISTS public.scp_ai_scoring_runs         CASCADE;
DROP TABLE IF EXISTS public.scp_human_reviews           CASCADE;
DROP TABLE IF EXISTS public.scp_prompt_versions         CASCADE;
DROP TABLE IF EXISTS public.scp_ai_providers            CASCADE;
DROP TABLE IF EXISTS public.scp_report_versions         CASCADE;
DROP TABLE IF EXISTS public.scp_integrity_flags         CASCADE;
DROP TABLE IF EXISTS public.scp_item_exposure           CASCADE;
DROP TABLE IF EXISTS public.scp_candidate_responses     CASCADE;
DROP TABLE IF EXISTS public.scp_attempts                CASCADE;
DROP TABLE IF EXISTS public.scp_anchor_responses        CASCADE;
DROP TABLE IF EXISTS public.scp_rubric_levels           CASCADE;
DROP TABLE IF EXISTS public.scp_rubric_dimensions       CASCADE;
DROP TABLE IF EXISTS public.scp_rubric_versions         CASCADE;
DROP TABLE IF EXISTS public.scp_rubrics                 CASCADE;
DROP TABLE IF EXISTS public.scp_scenario_versions       CASCADE;
DROP TABLE IF EXISTS public.scp_scenarios               CASCADE;
DROP TABLE IF EXISTS public.scp_module_behaviour_map    CASCADE;
DROP TABLE IF EXISTS public.scp_module_versions         CASCADE;
DROP TABLE IF EXISTS public.scp_modules                 CASCADE;
DROP TABLE IF EXISTS public.scp_program_versions        CASCADE;
DROP TABLE IF EXISTS public.scp_programs                CASCADE;
-- The Academy's own assessment definition, before Phase 0 removes its family.
DELETE FROM public.scp_form_items;
DELETE FROM public.scp_forms f USING public.scp_assessment_versions av,
       public.scp_assessment_definitions d
 WHERE f.assessment_version_id = av.id AND av.definition_id = d.id
   AND d.purpose = 'development_programme';
DELETE FROM public.scp_assessment_versions av USING public.scp_assessment_definitions d
 WHERE av.definition_id = d.id AND d.purpose = 'development_programme';
DELETE FROM public.scp_assessment_definitions WHERE purpose = 'development_programme';
DELETE FROM public.scp_item_versions WHERE mode IS NOT NULL;
DELETE FROM public.scp_items WHERE slug LIKE 'sg-b-%' OR slug LIKE 'sg-learn-%';
DROP FUNCTION IF EXISTS public.scp_guard_item_behaviour_agrees()  CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_item_mode_disjoint()     CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_form_single_mode()       CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_programme_states_limits() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_rubric_complete()        CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_attempt_mode_matches_form() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_response_matches_format() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_single_enabled_provider() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_scoring_run_append_only() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_scoring_run_consistent()  CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_review_immutable_once_done() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_report_states_limits()   CASCADE;
ALTER TABLE public.scp_item_versions DROP COLUMN IF EXISTS primary_behaviour_id;
ALTER TABLE public.scp_item_versions DROP COLUMN IF EXISTS mode;

DROP VIEW  IF EXISTS public.scp_rm_competency_profile;
DROP FUNCTION IF EXISTS public.scp_compute_maturity(uuid, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.scp_guard_evidence_append_only() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_behaviour_has_competency() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_evidence_source_has_writer() CASCADE;
DROP TABLE IF EXISTS public.scp_competency_evidence       CASCADE;
DROP TABLE IF EXISTS public.scp_role_competency_map       CASCADE;
DROP TABLE IF EXISTS public.scp_behaviour_competency_map  CASCADE;
DROP TABLE IF EXISTS public.scp_behaviour_versions        CASCADE;
DROP TABLE IF EXISTS public.scp_observable_behaviours     CASCADE;
DROP TABLE IF EXISTS public.scp_role_versions             CASCADE;
DROP TABLE IF EXISTS public.scp_roles                     CASCADE;
DROP TABLE IF EXISTS public.scp_maturity_thresholds       CASCADE;
DROP TABLE IF EXISTS public.scp_contract_versions         CASCADE;
DROP TABLE IF EXISTS public.scp_purpose_versions          CASCADE;
DROP TABLE IF EXISTS public.scp_processing_purposes       CASCADE;
DROP TABLE IF EXISTS public.scp_evidence_source_types     CASCADE;
DROP TABLE IF EXISTS public.scp_jurisdictions             CASCADE;
DROP TABLE IF EXISTS public.scp_subject_identities        CASCADE;
DROP TABLE IF EXISTS public.scp_subjects                  CASCADE;
DELETE FROM public.scp_assessment_families WHERE slug = 'security-competence-academy';

DO $$
BEGIN
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name LIKE 'scp\_%') = 23,
    'Phase 0 rollback: back to PR-A''s 23 scp_ base tables');
  -- Named explicitly, because a count alone told us only that SOMETHING was
  -- left over — it took a manual query to find out what.
  PERFORM pg_temp.assert(
    to_regclass('public.scp_test_grants') IS NULL,
    'closed-test rollback: the grant table is gone');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM pg_type WHERE typname = 'scp_governance_mode') = 0,
    'closed-test rollback: the governance_mode type is gone');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('scp_has_test_grant','scp_grant_permits_assignment',
                          'scp_guard_governance_lineage_immutable')) = 0,
    'closed-test rollback: the grant functions and lineage guard are gone');
  -- The widened vocabularies are deliberately LEFT in place: they are supersets,
  -- so no existing row becomes invalid, and narrowing them again would be the
  -- only genuinely destructive step in this rollback.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_assessment_families
      WHERE product_type = 'development_programme') = 0,
    'Phase 0 rollback: the Academy family is gone');
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

  -- Phase 8.5A added one column to a legacy table. A rollback that left it
  -- behind would leave the legacy path carrying an SCP lifecycle flag that
  -- nothing maintains.
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'assessment_assignments' AND column_name = 'scp_open') = 0,
    'rollback removes the additive scp_open column from the legacy table');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM pg_indexes
      WHERE indexname = 'scp_assignments_one_open_per_subject_idx') = 0,
    'rollback removes the SCP duplicate-protection index');

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
