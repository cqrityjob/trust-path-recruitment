-- =============================================================================
-- ROLLBACK — Interview Intelligence Phase 1: the Role Interview Pack domain
--
-- Reverses 20260918090000_scp_interview_role_packs.sql completely.
--
-- ── WHY THIS IS SAFE ─────────────────────────────────────────────────────
--
-- The forward migration is purely additive. It creates thirteen scp_interview_*
-- tables, their guards, their RPCs and their policies, and modifies no
-- pre-existing object. Its only references to the existing schema are READ
-- references and foreign keys POINTING OUT of the new domain:
--
--     scp_roles, scp_role_versions, scp_competency_versions,
--     scp_behaviour_versions, auth.users
--
-- ...none of which is altered, and none of which points back. In particular
-- scp_interview_guide_prompts, scp_interview_notes, scp_report_snapshots and
-- every recruitment, Passport and Career Discovery object are untouched by the
-- forward migration and are therefore untouched by this rollback.
--
-- Dropping the scp_interview_* objects restores the database to exactly its
-- prior state. The assertion at the foot of this file fails loudly if anything
-- outside the domain has since grown a dependency on it.
--
-- ── WHAT IS LOST ─────────────────────────────────────────────────────────
--
-- Every authored role interview pack, including the Väktare v1 pilot import and
-- its governance history. No candidate data is involved -- the domain holds
-- none by construction -- so this destroys authored content only. The Väktare
-- content is reproducible: the forward migration seeds it deterministically
-- from the source document, so re-applying restores it byte for byte, with the
-- same content hash.
--
-- Any pack authored in the admin UI after the migration is NOT reproducible.
-- Before running this in anger, export:
--
--   \copy (SELECT * FROM public.scp_interview_pack_versions) TO 'ii_versions.csv' CSV HEADER
--   \copy (SELECT * FROM public.scp_interview_core_questions) TO 'ii_questions.csv' CSV HEADER
--   \copy (SELECT * FROM public.scp_interview_pack_events)   TO 'ii_events.csv'    CSV HEADER
--
-- ── ORDER ────────────────────────────────────────────────────────────────
--
-- Tables go child-first because every FK inside the domain is ON DELETE
-- RESTRICT. Triggers and policies fall with their tables; the functions are
-- dropped afterwards, once nothing can still reference them.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refuse to run if something outside the domain now depends on it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _offender text;
BEGIN
  SELECT string_agg(DISTINCT c.relname, ', ') INTO _offender
    FROM pg_constraint con
    JOIN pg_class c  ON c.oid  = con.conrelid
    JOIN pg_class rc ON rc.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE con.contype = 'f'
     AND n.nspname = 'public'
     AND rc.relname LIKE 'scp\_interview\_%' ESCAPE '\'
     AND rc.relname NOT IN ('scp_interview_guide_prompts', 'scp_interview_notes')
     AND c.relname NOT LIKE 'scp\_interview\_%' ESCAPE '\';

  IF _offender IS NOT NULL THEN
    RAISE EXCEPTION
      'ROLLBACK BLOCKED: % now references the Role Interview Pack domain. This rollback was written when nothing outside the domain did. Reconcile that dependency first.',
      _offender;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The tables, child-first.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. The RPCs.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.scp_interview_confirm_competency_mapping(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_retire_version(uuid, text);
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

-- ---------------------------------------------------------------------------
-- 4. The authority and resolution helpers.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.scp_interview_competency_version(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_question_version(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_can_write_version(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_version_is_editable(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_can_edit(uuid);
DROP FUNCTION IF EXISTS public.scp_interview_can_read(uuid);

-- ---------------------------------------------------------------------------
-- 5. The guards. Dropped last: their triggers went with the tables.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.scp_interview_guard_reviewer_not_author();
DROP FUNCTION IF EXISTS public.scp_interview_guard_events_append_only();
DROP FUNCTION IF EXISTS public.scp_interview_guard_reviews_append_only();
DROP FUNCTION IF EXISTS public.scp_interview_guard_question_competency_scope();
DROP FUNCTION IF EXISTS public.scp_interview_guard_probe_scope();
DROP FUNCTION IF EXISTS public.scp_interview_guard_child_of_locked_parent();
DROP FUNCTION IF EXISTS public.scp_interview_guard_no_version_delete();
DROP FUNCTION IF EXISTS public.scp_interview_guard_version_transition();
DROP FUNCTION IF EXISTS public.scp_interview_guard_version_starts_as_draft();

-- ---------------------------------------------------------------------------
-- 6. Prove the rollback is complete AND that it took nothing else with it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name LIKE 'scp\_interview\_%' ESCAPE '\'
     AND table_name NOT IN ('scp_interview_guide_prompts', 'scp_interview_notes');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % interview-pack table(s) survive.', _n;
  END IF;

  -- scp_interview_notes(uuid) is EXCLUDED: it is the assessment domain's own
  -- read function, it shares the prefix by coincidence, and it was never ours
  -- to drop. Counting it would make this rollback refuse to complete.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname LIKE 'scp\_interview\_%' ESCAPE '\'
     AND p.proname <> 'scp_interview_notes';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % interview-pack function(s) survive.', _n;
  END IF;

  -- The coexistence contract, verified from the other direction: the two
  -- pre-existing tables that share the prefix must still be here.
  IF to_regclass('public.scp_interview_guide_prompts') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED: scp_interview_guide_prompts was dropped. It is assessment-support content and was never part of this domain.';
  END IF;
  IF to_regclass('public.scp_interview_notes') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED: scp_interview_notes was dropped. It belongs to the assessment domain.';
  END IF;
  IF to_regproc('public.scp_interview_notes') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED: scp_interview_notes() was dropped. It is the assessment domain''s read function.';
  END IF;

  -- And the graph this domain pointed at is intact.
  IF to_regclass('public.scp_role_versions') IS NULL
     OR to_regclass('public.scp_competency_versions') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED: the competency graph was affected. This rollback must only drop scp_interview_* objects it created.';
  END IF;

  RAISE NOTICE 'ROLLBACK COMPLETE: the Role Interview Pack domain is gone and nothing else was touched.';
END $$;

COMMIT;
