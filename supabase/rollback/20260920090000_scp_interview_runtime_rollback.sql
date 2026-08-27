-- =============================================================================
-- ROLLBACK — Interview Intelligence Phase 2 (runtime + governed knowledge)
--
-- Reverses 20260920090000_scp_interview_runtime.sql and
-- 20260919090000_scp_interview_intelligence_registries.sql, in that order.
--
-- ── WHY THIS IS SAFE ─────────────────────────────────────────────────────
--
-- Both migrations are purely additive. They create 28 new tables, their guards,
-- RPCs and policies, and modify no pre-existing object. Their only references
-- OUT are foreign keys and READ references to:
--
--     the Phase 1 pack domain, scp_role_versions, scp_competency_versions,
--     employers, employer_memberships, jobs, job_applications, auth.users
--
-- ...none of which is altered, and none of which points back.
--
-- The one thing Phase 2 added to a PHASE 1 table is a set of additive,
-- permissive SELECT policies letting an entitled employer READ governed pack
-- content. Those are dropped here by name. Phase 1's own policies are untouched
-- and its authoring model is exactly as it was.
--
-- ── WHAT IS LOST ─────────────────────────────────────────────────────────
--
-- Every interview case and everything derived from it: sources, passages, AI
-- runs, preparation plans, interview sessions, notes, AI proposals, CONFIRMED
-- EVIDENCE, human assessments and finalised reports.
--
-- That is candidate interview material and it is NOT reproducible. Before
-- running this in anger, export:
--
--   \copy (SELECT * FROM public.scp_interview_reports)    TO 'iv_reports.csv'  CSV HEADER
--   \copy (SELECT * FROM public.scp_interview_evidence)   TO 'iv_evidence.csv' CSV HEADER
--   \copy (SELECT * FROM public.scp_interview_assessments) TO 'iv_assess.csv'  CSV HEADER
--   \copy (SELECT * FROM public.scp_interview_case_events) TO 'iv_events.csv'  CSV HEADER
--
-- The governed knowledge layer (research registry, methods, AI tasks, graph) IS
-- reproducible: it is seeded deterministically by the forward migration.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refuse if something outside these two layers now depends on them.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _offender text;
BEGIN
  SELECT string_agg(DISTINCT c.relname, ', ') INTO _offender
    FROM pg_constraint con
    JOIN pg_class c  ON c.oid  = con.conrelid
    JOIN pg_class rc ON rc.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE con.contype = 'f' AND n.nspname = 'public'
     AND (rc.relname IN (
            'scp_interview_ai_config','scp_interview_pack_pilot_grants','scp_interview_cases',
            'scp_interview_case_sources','scp_interview_source_passages','scp_interview_ai_runs',
            'scp_interview_ai_run_retrievals','scp_interview_role_requirements',
            'scp_interview_candidate_facts','scp_interview_prep_plans','scp_interview_prep_items',
            'scp_interview_sessions','scp_interview_session_questions','scp_interview_session_notes',
            'scp_interview_probe_usages','scp_interview_evidence_proposals','scp_interview_evidence',
            'scp_interview_findings','scp_interview_assessments','scp_interview_reports',
            'scp_interview_case_events','scp_research_sources','scp_research_claims',
            'scp_research_implications','scp_interview_methods','scp_interview_method_practices',
            'scp_ai_tasks','scp_intel_edges'))
     AND c.relname NOT IN (
            'scp_interview_ai_config','scp_interview_pack_pilot_grants','scp_interview_cases',
            'scp_interview_case_sources','scp_interview_source_passages','scp_interview_ai_runs',
            'scp_interview_ai_run_retrievals','scp_interview_role_requirements',
            'scp_interview_candidate_facts','scp_interview_prep_plans','scp_interview_prep_items',
            'scp_interview_sessions','scp_interview_session_questions','scp_interview_session_notes',
            'scp_interview_probe_usages','scp_interview_evidence_proposals','scp_interview_evidence',
            'scp_interview_findings','scp_interview_assessments','scp_interview_reports',
            'scp_interview_case_events','scp_research_sources','scp_research_claims',
            'scp_research_implications','scp_interview_methods','scp_interview_method_practices',
            'scp_ai_tasks','scp_intel_edges');

  IF _offender IS NOT NULL THEN
    RAISE EXCEPTION
      'ROLLBACK BLOCKED: % now references the Interview Intelligence Phase 2 layers. Reconcile that dependency first.',
      _offender;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The additive policies Phase 2 put on PHASE 1 tables. Named individually so
--    this cannot accidentally take a Phase 1 policy with it.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS scp_interview_pack_versions_employer_read        ON public.scp_interview_pack_versions;
DROP POLICY IF EXISTS scp_interview_packs_employer_read                ON public.scp_interview_packs;
DROP POLICY IF EXISTS scp_interview_core_questions_employer_read       ON public.scp_interview_core_questions;
DROP POLICY IF EXISTS scp_interview_pack_competencies_employer_read    ON public.scp_interview_pack_competencies;
DROP POLICY IF EXISTS scp_interview_approved_probes_employer_read      ON public.scp_interview_approved_probes;
DROP POLICY IF EXISTS scp_interview_verification_rules_employer_read   ON public.scp_interview_verification_rules;
DROP POLICY IF EXISTS scp_interview_prohibited_areas_employer_read     ON public.scp_interview_prohibited_areas;
DROP POLICY IF EXISTS scp_interview_evidence_dimensions_employer_read  ON public.scp_interview_evidence_dimensions;
DROP POLICY IF EXISTS scp_interview_rating_anchors_employer_read       ON public.scp_interview_rating_anchors;
DROP POLICY IF EXISTS scp_interview_question_competencies_employer_read ON public.scp_interview_question_competencies;

-- ---------------------------------------------------------------------------
-- 3. The runtime, child-first, then the knowledge layer.
-- ---------------------------------------------------------------------------
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
DROP TABLE IF EXISTS public.scp_interview_pack_pilot_grants      CASCADE;
DROP TABLE IF EXISTS public.scp_interview_ai_config              CASCADE;

DROP TABLE IF EXISTS public.scp_intel_edges                      CASCADE;
DROP TABLE IF EXISTS public.scp_ai_tasks                         CASCADE;
DROP TABLE IF EXISTS public.scp_interview_method_practices       CASCADE;
DROP TABLE IF EXISTS public.scp_interview_methods                CASCADE;
DROP TABLE IF EXISTS public.scp_research_implications            CASCADE;
DROP TABLE IF EXISTS public.scp_research_claims                  CASCADE;
DROP TABLE IF EXISTS public.scp_research_sources                 CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Functions.
-- ---------------------------------------------------------------------------
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
DROP FUNCTION IF EXISTS public.scp_iv_ai_run_start(uuid, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.scp_iv_mark_sources_ready(uuid);
DROP FUNCTION IF EXISTS public.scp_iv_confirm_transcript_basis(uuid, text);
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

-- ---------------------------------------------------------------------------
-- 5. Prove it is complete AND that it took nothing else.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname LIKE 'scp\_iv\_%' ESCAPE '\';
  IF _n <> 0 THEN RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % scp_iv_ function(s) survive.', _n; END IF;

  SELECT count(*) INTO _n FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('scp_interview_cases','scp_interview_evidence','scp_interview_reports',
                        'scp_research_sources','scp_ai_tasks','scp_intel_edges');
  IF _n <> 0 THEN RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % Phase 2 table(s) survive.', _n; END IF;

  -- Phase 1 must be entirely intact.
  IF to_regclass('public.scp_interview_pack_versions') IS NULL
     OR to_regclass('public.scp_interview_core_questions') IS NULL
     OR to_regclass('public.scp_interview_rating_anchors') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED: the Phase 1 governed content domain was affected.';
  END IF;

  SELECT count(*) INTO _n FROM public.scp_interview_core_questions q
    JOIN public.scp_interview_pack_versions v ON v.id = q.pack_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'vaktare-se';
  IF _n <> 8 THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED: the Vaktare pack no longer has its eight questions (found %).', _n;
  END IF;

  -- And so must the recruitment model this domain only ever read.
  IF to_regclass('public.job_applications') IS NULL OR to_regclass('public.employers') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED: the recruitment model was affected.';
  END IF;

  RAISE NOTICE 'ROLLBACK COMPLETE: Interview Intelligence Phase 2 is gone; Phase 1 and recruitment are intact.';
END $$;

COMMIT;
