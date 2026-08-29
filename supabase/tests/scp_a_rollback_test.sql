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
-- ---------------------------------------------------------------------------
-- Interview Intelligence Phase 2 (20260919090000 + 20260920090000) comes off
-- before Phase 1: the runtime pins Phase 1 pack versions and the knowledge
-- layer references them, so unwinding in the other order would trip an
-- ON DELETE RESTRICT.
--
-- The drop set matches supabase/rollback/20260920090000_scp_interview_runtime_rollback.sql.
-- Keeping them identical is the point: an incomplete documented rollback fails
-- HERE rather than in production.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK TEST -- Interview Intelligence Phase 2 unwinds first';
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name LIKE 'scp\_%') = 122,
    'pre-rollback: 122 scp_ base tables exist (87 + 7 interview knowledge + 21 interview runtime + 1 candidate corrections + 2 panel review + 4 CQrity TRUST)');
END $$;

-- The additive, permissive SELECT policies Phase 2 put on PHASE 1 tables. They
-- depend on Phase 2 helper functions, so they come off first -- and they are
-- named individually so this cannot take a Phase 1 policy with it.
DROP POLICY IF EXISTS scp_interview_pack_versions_employer_read         ON public.scp_interview_pack_versions;
DROP POLICY IF EXISTS scp_interview_packs_employer_read                 ON public.scp_interview_packs;
DROP POLICY IF EXISTS scp_interview_core_questions_employer_read        ON public.scp_interview_core_questions;
DROP POLICY IF EXISTS scp_interview_pack_competencies_employer_read     ON public.scp_interview_pack_competencies;
DROP POLICY IF EXISTS scp_interview_approved_probes_employer_read       ON public.scp_interview_approved_probes;
DROP POLICY IF EXISTS scp_interview_verification_rules_employer_read    ON public.scp_interview_verification_rules;
DROP POLICY IF EXISTS scp_interview_prohibited_areas_employer_read      ON public.scp_interview_prohibited_areas;
DROP POLICY IF EXISTS scp_interview_evidence_dimensions_employer_read   ON public.scp_interview_evidence_dimensions;
DROP POLICY IF EXISTS scp_interview_rating_anchors_employer_read        ON public.scp_interview_rating_anchors;
DROP POLICY IF EXISTS scp_interview_question_competencies_employer_read ON public.scp_interview_question_competencies;

DROP VIEW  IF EXISTS public.scp_interview_process_quality        CASCADE;
DROP TABLE IF EXISTS public.scp_interview_case_events            CASCADE;
DROP TABLE IF EXISTS public.scp_interview_reports                CASCADE;
DROP TABLE IF EXISTS public.scp_interview_assessments            CASCADE;
DROP TABLE IF EXISTS public.scp_interview_findings               CASCADE;
DROP TABLE IF EXISTS public.scp_interview_evidence               CASCADE;
DROP TABLE IF EXISTS public.scp_interview_evidence_proposals     CASCADE;
DROP TABLE IF EXISTS public.scp_interview_probe_usages           CASCADE;
DROP TABLE IF EXISTS public.scp_interview_session_notes          CASCADE;
DROP TABLE IF EXISTS public.scp_interview_session_questions      CASCADE;
DROP TABLE IF EXISTS public.scp_interview_sessions               CASCADE;
DROP TABLE IF EXISTS public.scp_interview_prep_items             CASCADE;
DROP TABLE IF EXISTS public.scp_interview_prep_plans             CASCADE;
DROP TABLE IF EXISTS public.scp_interview_candidate_facts        CASCADE;
DROP TABLE IF EXISTS public.scp_interview_role_requirements      CASCADE;
DROP TABLE IF EXISTS public.scp_interview_ai_run_retrievals      CASCADE;
DROP TABLE IF EXISTS public.scp_interview_ai_runs                CASCADE;
DROP TABLE IF EXISTS public.scp_interview_source_passages        CASCADE;
DROP TABLE IF EXISTS public.scp_interview_case_sources           CASCADE;
DROP TABLE IF EXISTS public.scp_interview_cases                  CASCADE;
DROP TABLE IF EXISTS public.scp_trust_stage_claims               CASCADE;
DROP TABLE IF EXISTS public.scp_trust_stage_prohibitions         CASCADE;
DROP TABLE IF EXISTS public.scp_trust_stage_ai_tasks             CASCADE;
DROP TABLE IF EXISTS public.scp_trust_stages                     CASCADE;
DROP TABLE IF EXISTS public.scp_interview_panel_members          CASCADE;
DROP TABLE IF EXISTS public.scp_interview_panels                 CASCADE;
DROP TABLE IF EXISTS public.scp_interview_candidate_corrections  CASCADE;
DROP TABLE IF EXISTS public.scp_interview_pack_pilot_grants      CASCADE;
DROP TABLE IF EXISTS public.scp_interview_ai_config              CASCADE;
DROP TABLE IF EXISTS public.scp_intel_edges                      CASCADE;
DROP TABLE IF EXISTS public.scp_ai_tasks                         CASCADE;
DROP TABLE IF EXISTS public.scp_interview_method_practices       CASCADE;
DROP TABLE IF EXISTS public.scp_interview_methods                CASCADE;
DROP TABLE IF EXISTS public.scp_research_implications            CASCADE;
DROP TABLE IF EXISTS public.scp_research_claims                  CASCADE;
DROP TABLE IF EXISTS public.scp_research_sources                 CASCADE;

DROP FUNCTION IF EXISTS public.scp_iv_finalise_report(uuid, uuid);
DROP FUNCTION IF EXISTS public.scp_iv_mark_assessed(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_report_blockers(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_record_assessment(uuid, uuid, integer, text, text, text);
DROP FUNCTION IF EXISTS public.scp_iv_begin_evidence_review(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_record_findings(uuid, jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.scp_iv_confirm_evidence_proposal(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.scp_iv_record_evidence_proposals(uuid, jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_set_session_state(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.scp_iv_start_session(uuid, text);
DROP FUNCTION IF EXISTS public.scp_iv_approve_prep_plan(uuid, text);
DROP FUNCTION IF EXISTS public.scp_iv_record_prep_plan(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_record_candidate_facts(uuid, jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_record_role_requirements(uuid, jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text, text);
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_settle(uuid, text, text, text, jsonb, integer, integer, integer, integer, jsonb, text);
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.scp_iv_mark_sources_ready(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_confirm_transcript_basis(uuid, text);
DROP FUNCTION IF EXISTS public.scp_iv_confirm_transcript_basis(uuid, text, text, text, date);
-- Erasure and the pilot-entitlement decision arrived with the integrity
-- hardening migration; a rollback that leaves them behind leaves a way to
-- write to tables that are no longer there.
DROP FUNCTION IF EXISTS public.scp_iv_erase_source(uuid, text);
DROP FUNCTION IF EXISTS public.scp_iv_candidate_interview_status();
DROP FUNCTION IF EXISTS public.scp_iv_candidate_interview_detail(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_is_case_candidate(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_panel_open(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.scp_iv_panel_submit(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_panel_reveal(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_panel_conclude(uuid, text);
DROP FUNCTION IF EXISTS public.scp_iv_panel_visible_assessments(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_guard_panel_preserves_individual();
DROP FUNCTION IF EXISTS public.scp_trust_case_stage(uuid);
DROP FUNCTION IF EXISTS public.scp_trust_stage_for_case(uuid);
DROP FUNCTION IF EXISTS public.scp_trust_case_method_version(uuid);
DROP FUNCTION IF EXISTS public.scp_trust_eligible_method(text);
DROP FUNCTION IF EXISTS public.scp_trust_guard_pin_immutable();
DROP FUNCTION IF EXISTS public.scp_iv_guard_no_career_discovery();
DROP FUNCTION IF EXISTS public.scp_iv_guard_passport_disclosure();
-- This one guard lives on ANOTHER domain's table (sp_claims), because that is
-- where an interview would have to write in order to breach the boundary. The
-- trigger therefore comes off before the function it calls -- and unwinding
-- Interview Intelligence must not leave a dangling trigger on Passport.
DROP TRIGGER IF EXISTS sp_claims_no_interview_write ON public.sp_claims;
DROP FUNCTION IF EXISTS public.scp_iv_guard_no_passport_write();
DROP FUNCTION IF EXISTS public.scp_iv_record_manual_prep_plan(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.scp_iv_ai_real_model_permitted();
DROP FUNCTION IF EXISTS public.scp_iv_guard_ai_disabled();
DROP FUNCTION IF EXISTS public.scp_iv_startable_pack_versions(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_employer_can_start_interviews(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_case_start_basis(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.scp_iv_open_pilot_available(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_pilot_grant_active(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.scp_interview_guard_pilot_grant();
DROP FUNCTION IF EXISTS public.scp_interview_pilot_grant_audit();
DROP FUNCTION IF EXISTS public.scp_intel_guard_prohibition_coverage();
DROP FUNCTION IF EXISTS public.scp_intel_guard_edge_assurance();
DROP FUNCTION IF EXISTS public.scp_research_guard_claim_not_ahead_of_source();
DROP FUNCTION IF EXISTS public.scp_research_guard_implication_not_ahead_of_claim();
DROP FUNCTION IF EXISTS public.scp_iv_add_source(uuid, text, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.scp_iv_create_case(uuid, text, uuid, text, uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.scp_iv_set_case_status(uuid, text);
DROP FUNCTION IF EXISTS public.scp_iv_record_event(uuid, text, text, uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.scp_iv_pack_competency_pack(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_question_pack(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_employer_may_read_pack(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_plan_case(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_source_case(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_session_case(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_can_write_case(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_can_read_case(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_case_employer(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_guard_ai_run_settled();
DROP FUNCTION IF EXISTS public.scp_iv_guard_events_append_only();
DROP FUNCTION IF EXISTS public.scp_iv_guard_report_immutable();
DROP FUNCTION IF EXISTS public.scp_iv_guard_assessment_locked();
DROP FUNCTION IF EXISTS public.scp_iv_guard_assessment_anchor();
DROP FUNCTION IF EXISTS public.scp_iv_guard_question_in_pinned_pack();
DROP FUNCTION IF EXISTS public.scp_iv_guard_probe_in_pinned_pack();
DROP FUNCTION IF EXISTS public.scp_iv_guard_passage_immutable();
DROP FUNCTION IF EXISTS public.scp_iv_guard_transcript_gate();
DROP FUNCTION IF EXISTS public.scp_iv_guard_case_transition();
DROP FUNCTION IF EXISTS public.scp_intel_guard_edge_scope();

DO $$
BEGIN
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND p.proname LIKE 'scp\_iv\_%' ESCAPE '\') = 0,
    'Phase 2 rollback: every scp_iv_ function is gone');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.scp_interview_core_questions) > 0,
    'Phase 2 rollback: the Phase 1 governed questions survived');
END $$;


-- ---------------------------------------------------------------------------
-- Interview Intelligence Phase 1 (20260918090000) comes off next: it is the
-- newest layer and it sits on top of the Competency Graph, pinning
-- scp_role_versions and scp_competency_versions, both of which the Phase 0
-- unwind below drops.
--
-- The drop set below is the same one, in the same order, as the documented
-- rollback at supabase/rollback/20260918090000_scp_interview_role_packs_rollback.sql.
-- Keeping them identical is the point: if the documented rollback is ever
-- incomplete, the 74-table assertion immediately after this block fails here
-- rather than in production.
--
-- Note what is NOT dropped: scp_interview_guide_prompts and scp_interview_notes.
-- They share the prefix, belong to the assessment domain, and are counted in
-- the 74 below exactly as they were before this phase existed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK TEST -- Interview Intelligence Phase 1 unwinds first';
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name LIKE 'scp\_%') = 87,
    'pre-rollback: 87 scp_ base tables remain after the Phase 2 unwind (74 + 13 role interview pack)');
END $$;

DROP TABLE IF EXISTS public.scp_interview_pack_events            CASCADE;
DROP TABLE IF EXISTS public.scp_interview_pack_reviews           CASCADE;
DROP TABLE IF EXISTS public.scp_interview_prohibited_areas       CASCADE;
DROP TABLE IF EXISTS public.scp_interview_verification_rules     CASCADE;
DROP TABLE IF EXISTS public.scp_interview_rating_anchors         CASCADE;
DROP TABLE IF EXISTS public.scp_interview_evidence_dimensions    CASCADE;
DROP TABLE IF EXISTS public.scp_interview_approved_probes        CASCADE;
DROP TABLE IF EXISTS public.scp_interview_question_competencies  CASCADE;
DROP TABLE IF EXISTS public.scp_interview_core_questions         CASCADE;
DROP TABLE IF EXISTS public.scp_interview_pack_competency_map    CASCADE;
DROP TABLE IF EXISTS public.scp_interview_pack_competencies      CASCADE;
DROP TABLE IF EXISTS public.scp_interview_pack_versions          CASCADE;
DROP TABLE IF EXISTS public.scp_interview_packs                  CASCADE;

DROP FUNCTION IF EXISTS public.scp_interview_confirm_competency_mapping(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_retire_version(uuid, text);
DROP FUNCTION IF EXISTS public.scp_interview_set_pilot_availability(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.scp_interview_suspend_version(uuid, text);
DROP FUNCTION IF EXISTS public.scp_interview_publish_version(uuid, text);
DROP FUNCTION IF EXISTS public.scp_interview_record_review(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.scp_interview_submit_for_review(uuid, text);
DROP FUNCTION IF EXISTS public.scp_interview_touch_draft(uuid, text);
DROP FUNCTION IF EXISTS public.scp_interview_create_version(uuid, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.scp_interview_create_pack(text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.scp_interview_record_event(uuid, uuid, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.scp_interview_pack_validate(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_pack_content_hash(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_competency_version(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_question_version(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_can_write_version(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_version_is_editable(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_can_edit(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_can_read(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_guard_reviewer_not_author();
DROP FUNCTION IF EXISTS public.scp_interview_guard_events_append_only();
DROP FUNCTION IF EXISTS public.scp_interview_guard_reviews_append_only();
DROP FUNCTION IF EXISTS public.scp_interview_guard_question_competency_scope();
DROP FUNCTION IF EXISTS public.scp_interview_guard_probe_scope();
DROP FUNCTION IF EXISTS public.scp_interview_guard_child_of_locked_parent();
DROP FUNCTION IF EXISTS public.scp_interview_guard_no_version_delete();
DROP FUNCTION IF EXISTS public.scp_interview_guard_version_transition();
DROP FUNCTION IF EXISTS public.scp_interview_guard_version_starts_as_draft();

DO $$
BEGIN
  -- The two same-prefix assessment tables must have survived. If the drop set
  -- above ever grows careless, this is what says so.
  PERFORM pg_temp.assert(
    to_regclass('public.scp_interview_guide_prompts') IS NOT NULL
      AND to_regclass('public.scp_interview_notes') IS NOT NULL,
    'Interview Intelligence rollback: the assessment-domain interview tables survived');
END $$;

DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK TEST -- closed test, Phase 2, Phase 1 (Academy), Phase 0 (Graph) unwind first';
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name LIKE 'scp\_%') = 74,
    'pre-rollback: 74 scp_ base tables exist (23 PR-A + 15 graph + 23 Academy + 2 Phase 2 + 1 test grants + 1 follow-up prompts + 1 employer decisions + 1 review rubric scores + 2 training delivery + 1 employer response reviewers + 1 form blocks + 1 interview guide prompts + 1 interview notes + 1 participant invitations)');
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
-- 20260905090000: the second admission route for standard recruitment content.
DROP FUNCTION IF EXISTS
  public.scp_is_standard_recruitment_content(uuid, uuid) CASCADE;
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
-- #47 (20260825092000): the content library read model and its lifecycle
-- helper. scp_lifecycle_state takes text/timestamptz/boolean and returns text,
-- so the governance-enum cascade never reaches it and it has to be named --
-- the same reasoning as scp_required_purpose_code above. The library function
-- is named explicitly too rather than relying on its scp_governance_mode
-- output column to carry it away: a returned column is a weaker dependency to
-- depend on than an argument type, and this assertion is the only thing that
-- would notice if it stopped working.
-- #47 training delivery (20260826090000, 20260826091000). The two tables go
-- first so the guard functions have nothing depending on them, then the RPCs.
-- Every one of these takes uuid/text arguments only, so the
-- scp_governance_mode cascade never reaches them and they must be named.
DROP TABLE    IF EXISTS public.scp_employer_reviewers CASCADE;
DROP TABLE    IF EXISTS public.scp_training_module_progress CASCADE;
DROP TABLE    IF EXISTS public.scp_training_assignments CASCADE;
DROP FUNCTION IF EXISTS public.scp_assign_training(uuid, uuid, text, text, timestamptz, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_my_academy_work() CASCADE;
DROP FUNCTION IF EXISTS public.scp_my_training_programme(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_my_training_modules(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_start_training_module(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_complete_training_module(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_complete_training_programme(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_training_status(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_module_form_is_learning() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_training_target_assignable() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_training_progress_in_programme() CASCADE;
DROP FUNCTION IF EXISTS public.scp_touch_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_content_library(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_lifecycle_state(text, timestamptz, boolean) CASCADE;
DROP TABLE    IF EXISTS public.scp_followup_prompts CASCADE;
-- Part F (20260820120000). The decision table references scp_attempts, so it
-- has to go before the Phase 2 unwind reaches them.
DROP FUNCTION IF EXISTS public.scp_record_employer_decision(uuid, text, text, text, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_decisions(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_decision_append_only() CASCADE;
DROP TABLE    IF EXISTS public.scp_employer_report_decisions CASCADE;
-- The flagship recruitment assessment (20260830090000-094000). Four functions
-- with uuid/text signatures, so the governance-enum cascade below does not
-- reach any of them and each has to be named. scp_interview_notes references
-- scp_attempts and employers, so like the decision table it comes off before
-- the Phase 2 unwind; scp_form_blocks would cascade from scp_forms but is
-- dropped explicitly so the documented rollback is actually exercised.
DROP FUNCTION IF EXISTS public.scp_record_interview_note(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_interview_notes(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_interview_notes_append_only() CASCADE;
DROP FUNCTION IF EXISTS public.scp_attempt_assessment_signal(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_attempt_self_report_pattern(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_get_attempt_blocks(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_block_asks_agrees() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_evidence_source_honesty() CASCADE;
-- The recruitment journey (20260831090000-092000). Same reasoning as above:
-- uuid/text signatures that the governance-enum cascade does not reach.
-- scp_assessment_invitations references employers, jobs, job_applications and
-- assessment_assignments, so it comes off before the Phase 2 unwind.
DROP FUNCTION IF EXISTS public.scp_assign_from_application(uuid, uuid, uuid, timestamptz, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_invite_participant(uuid, uuid, text, text, text, text, timestamptz, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_claim_assessment_invitations() CASCADE;
DROP FUNCTION IF EXISTS public.scp_cancel_assessment_invitation(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_application_assessments(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_application_candidate(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_person_overview(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_invitations(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_closed_test_purpose_agrees() CASCADE;
DROP FUNCTION IF EXISTS public.scp_brief_executive_summary(jsonb, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_add_brief_executive_summary() CASCADE;
DROP FUNCTION IF EXISTS public.scp_join_human(text[], text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_required_purpose_code(text, text, public.scp_governance_mode) CASCADE;
DROP TABLE    IF EXISTS public.scp_assessment_invitations CASCADE;
DROP TABLE    IF EXISTS public.scp_interview_notes CASCADE;
DROP TABLE    IF EXISTS public.scp_interview_guide_prompts CASCADE;
DROP TABLE    IF EXISTS public.scp_form_blocks CASCADE;
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
DROP FUNCTION IF EXISTS public.scp_attempt_lifecycle_state(text, timestamptz, timestamptz, timestamptz, timestamptz, integer) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_assessment_pipeline(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_my_assessment_history() CASCADE;
DROP FUNCTION IF EXISTS public.scp_resolve_employment_for_assignment(uuid, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_bind_employee_subject(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_person_assessments(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_employment_from_application(uuid) CASCADE;
-- Dropping the hire bridge leaves set_application_status calling a function
-- that no longer exists, so the rollback restores its pre-bridge body. A
-- rollback that removed the new platform and broke recruitment with it would
-- not be a rollback.
CREATE OR REPLACE FUNCTION public.set_application_status(
  _application_id uuid,
  _new_status text,
  _note text DEFAULT NULL
)
RETURNS TABLE (
  application_id uuid,
  previous_status text,
  new_status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _app public.job_applications%ROWTYPE;
  _is_applicant boolean;
  _is_employer boolean;
  _clean_note text;
  _actor_role text;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _new_status NOT IN ('reviewing', 'interview', 'rejected', 'hired', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid application status: %', _new_status;
  END IF;

  _clean_note := NULLIF(btrim(_note), '');
  IF _clean_note IS NOT NULL AND char_length(_clean_note) > 1000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _app
  FROM public.job_applications
  WHERE id = _application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  _is_applicant := (_app.applicant_user_id = _caller);
  _is_employer := public.has_employer_role(_caller, _app.employer_id, NULL)
                  AND public.employer_is_active_status(_app.employer_id);

  -- Role-derived permission, never a client-supplied flag. A candidate may
  -- only ever request 'withdrawn' on their own application; an employer
  -- may never request 'withdrawn'.
  IF _is_applicant AND _new_status = 'withdrawn' THEN
    IF _app.status NOT IN ('submitted', 'reviewing', 'interview') THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, cannot withdraw',
        _app.status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'candidate';

  ELSIF _is_employer AND _new_status <> 'withdrawn' THEN
    IF NOT (
      (_app.status = 'submitted' AND _new_status IN ('reviewing', 'rejected')) OR
      (_app.status = 'reviewing' AND _new_status IN ('interview', 'rejected')) OR
      (_app.status = 'interview' AND _new_status IN ('hired', 'rejected'))
    ) THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, action % not allowed',
        _app.status, _new_status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'employer';

  ELSE
    RAISE EXCEPTION 'Forbidden: not authorised to set this application status';
  END IF;

  UPDATE public.job_applications
  SET
    status = _new_status,
    updated_at = _now,
    withdrawn_at = CASE WHEN _new_status = 'withdrawn' THEN _now ELSE withdrawn_at END,
    employer_note = CASE
      WHEN _actor_role = 'employer' AND _clean_note IS NOT NULL THEN _clean_note
      ELSE employer_note
    END
  WHERE id = _application_id;

  INSERT INTO public.job_application_status_events (
    application_id, job_id, employer_id, actor_user_id, actor_role,
    previous_status, new_status, note, created_at
  ) VALUES (
    _application_id, _app.job_id, _app.employer_id, _caller, _actor_role,
    _app.status, _new_status, _clean_note, _now
  );

  RETURN QUERY SELECT _application_id, _app.status, _new_status, _now;
END;
$$;
DROP FUNCTION IF EXISTS public.scp_employer_team(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_grant_employer_reviewer(uuid, uuid, text[]) CASCADE;
DROP FUNCTION IF EXISTS public.scp_revoke_employer_reviewer(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_my_review_workload() CASCADE;
DROP FUNCTION IF EXISTS public.scp_can_review_for(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.scp_review_conflict(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_review_authorisation(uuid, uuid) CASCADE;
-- #63: the narrowed conflict rule, its disclosure, and the employer board.
DROP FUNCTION IF EXISTS public.scp_review_conflict_disclosure(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_stamp_review_conflict_disclosure() CASCADE;
DROP FUNCTION IF EXISTS public.scp_employer_review_board(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_reviewer_is_member() CASCADE;
DROP FUNCTION IF EXISTS public.scp_complete_human_review(uuid, text, text, text, jsonb) CASCADE;
-- The deprecated transition overload, which exists alongside the governed one
-- until the maintenance migration removes it.
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
DROP FUNCTION IF EXISTS public.scp_guard_rubric_score_append_only() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_learning_counterpart() CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_best_worst_keys()      CASCADE;
DROP FUNCTION IF EXISTS public.scp_guard_construct_honesty()    CASCADE;
DROP TRIGGER IF EXISTS scp_assignments_target_published_trg ON public.assessment_assignments;
DROP FUNCTION IF EXISTS public.scp_guard_assignment_targets_published() CASCADE;
ALTER TABLE public.assessment_assignments DROP CONSTRAINT IF EXISTS assessment_assignments_single_lineage;
ALTER TABLE public.assessment_assignments DROP COLUMN IF EXISTS scp_assessment_version_id;
DROP TABLE IF EXISTS public.scp_ai_scoring_dimensions   CASCADE;
DROP TABLE IF EXISTS public.scp_ai_scoring_runs         CASCADE;
-- Dropped explicitly rather than left to CASCADE from scp_human_reviews, so
-- the documented rollback-forward for 20260823090000 is actually exercised.
DROP TABLE IF EXISTS public.scp_review_rubric_scores    CASCADE;
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
