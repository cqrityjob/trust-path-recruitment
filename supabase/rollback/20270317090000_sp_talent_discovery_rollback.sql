-- Rollback of 20270317090000 (sp_talent_discovery).
-- Prefer an application rollback. Refuses while any person has opened the
-- setting (a consent record is evidence of a choice and is not discarded).
-- Run 20270318090000's rollback first.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.sp_talent_profiles) OR EXISTS (SELECT 1 FROM public.sp_talent_consent_events)
     OR EXISTS (SELECT 1 FROM public.sp_talent_blocks) THEN
    RAISE EXCEPTION 'SP_ROLLBACK_REQUIRES_PRESERVED_DATA';
  END IF;
  IF to_regclass('public.rec_talent_contact_requests') IS NOT NULL THEN
    RAISE EXCEPTION 'SP_ROLLBACK_ORDER: roll back 20270318090000 first';
  END IF;
END $$;
DROP TRIGGER IF EXISTS sp_talent_follow_correction ON public.sp_claims;
DROP FUNCTION IF EXISTS public.sp_talent_follow_correction();
DROP FUNCTION IF EXISTS public.sp_talent_unblock_employer(uuid);
DROP FUNCTION IF EXISTS public.sp_talent_pause();
DROP FUNCTION IF EXISTS public.sp_talent_save_settings(integer, text, text, uuid[], uuid[], jsonb);
DROP FUNCTION IF EXISTS public.sp_talent_preview();
DROP FUNCTION IF EXISTS public.sp_talent_get_settings();
DROP FUNCTION IF EXISTS public.sp_talent_card(uuid);
DROP FUNCTION IF EXISTS public.sp_talent_experience(uuid);
DROP FUNCTION IF EXISTS public.sp_talent_merits(uuid);
DROP FUNCTION IF EXISTS public.sp_talent_validity(date, boolean);
DROP FUNCTION IF EXISTS public.sp_talent_entry_level(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.sp_catalogue_requirement_class(text);
DROP TABLE IF EXISTS public.sp_talent_consent_events;
DROP FUNCTION IF EXISTS public.sp_talent_consent_events_guard();
DROP TABLE IF EXISTS public.sp_talent_blocks;
DROP TABLE IF EXISTS public.sp_talent_items;
DROP TABLE IF EXISTS public.sp_talent_profiles;
DO $$ BEGIN
  IF to_regclass('public.sp_talent_profiles') IS NOT NULL OR to_regprocedure('public.sp_talent_card(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'SP_TALENT_ROLLBACK_PROOF failed';
  END IF;
  RAISE NOTICE 'SP_TALENT_ROLLBACK_PROOF ok';
END $$;
COMMIT;
