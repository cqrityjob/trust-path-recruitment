-- Prefer an application rollback while retaining additive P1 data.
-- This DDL rollback deliberately refuses to discard adopted/reviewed profiles.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.rec_requirement_profiles) OR EXISTS(SELECT 1 FROM public.rec_requirement_review_heads) THEN
    RAISE EXCEPTION 'RI_ROLLBACK_REQUIRES_PRESERVED_DATA';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.rec_ri_transfer_requirements(uuid,uuid,integer,text,uuid,uuid[]);
DROP FUNCTION IF EXISTS public.rec_ri_manual_reference(uuid,text);
DROP FUNCTION IF EXISTS public.rec_ri_overview_counts(uuid);
DROP FUNCTION IF EXISTS public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid);
DROP FUNCTION IF EXISTS public.rec_ri_save_review(uuid,uuid,integer,text,uuid,jsonb,boolean,text,uuid,integer);
-- Only the unreleased local draft ever had this shorter signature.
DROP FUNCTION IF EXISTS public.rec_ri_save_review(uuid,uuid,integer,text,uuid,jsonb,boolean,text,uuid);
DROP FUNCTION IF EXISTS public.rec_ri_get_review(uuid);
DROP FUNCTION IF EXISTS public.rec_ri_confirm_profile(uuid,integer,uuid,date,jsonb);
DROP FUNCTION IF EXISTS public.rec_ri_get_profile(uuid);
DROP TRIGGER IF EXISTS rec_requirement_identity_used ON public.recruitment_requirements;
DROP TRIGGER IF EXISTS rec_question_identity_used ON public.recruitment_questions;
DROP SCHEMA recruiter_intelligence CASCADE;
DROP TABLE public.rec_requirement_review_events,public.rec_requirement_decisions,public.rec_requirement_review_heads;
DROP TABLE public.rec_requirement_profiles;
COMMIT;
