-- Prefer an application rollback. This DDL rollback refuses to discard
-- compositions a case has pinned or a recruitment has confirmed.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.rec_interview_compositions)
     OR EXISTS (SELECT 1 FROM public.scp_interview_cases WHERE composition_id IS NOT NULL) THEN
    RAISE EXCEPTION 'RI_ROLLBACK_REQUIRES_PRESERVED_DATA';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.rec_ri_case_composition(uuid);
DROP FUNCTION IF EXISTS public.rec_ri_save_composition(uuid, integer, uuid, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.rec_ri_get_composition(uuid);
DROP FUNCTION IF EXISTS recruiter_intelligence.composition_json(uuid);
DROP FUNCTION IF EXISTS public.rec_ri_composition_catalog(uuid, uuid);
DROP TRIGGER IF EXISTS scp_interview_cases_pin_composition ON public.scp_interview_cases;
DROP FUNCTION IF EXISTS public.rec_interview_case_pin_composition();
ALTER TABLE public.scp_interview_cases DROP COLUMN composition_id;
DROP TABLE public.rec_interview_compositions;
DROP FUNCTION IF EXISTS public.rec_interview_composition_guard();
COMMIT;
