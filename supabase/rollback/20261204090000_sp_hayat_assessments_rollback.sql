-- Rollback of 20261204090000_sp_hayat_assessments.sql
--
-- A rollback refuses rather than destroys. Once any HAYAT assessment has been
-- recorded, dropping the table would erase the history of what was checked,
-- when and under which rule version -- so this script stops and says so.
-- Prefer a forward fix. To roll back anyway, archive the rows first and delete
-- them deliberately in a separate, reviewed step.
--
-- The application does not need this schema to keep working: with it gone, a
-- credential page shows "no automatic check has been made", and document
-- reading is unaffected (it never touched the database).
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.sp_hayat_assessments') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.sp_hayat_assessments) THEN
    RAISE EXCEPTION 'SP_HAYAT_ROLLBACK_REFUSED: assessments exist; archive them before rolling back';
  END IF;
END $$;
DROP TRIGGER IF EXISTS sp_hayat_invalidate_on_evidence_change ON public.sp_evidence;
DROP TRIGGER IF EXISTS sp_hayat_invalidate_on_claim_change ON public.sp_claims;
DROP FUNCTION IF EXISTS public.sp_hayat_current_assessment(uuid);
DROP FUNCTION IF EXISTS public.sp_hayat_record_assessment(
  uuid,uuid,text,uuid,text,text,text,text,text,text[],jsonb,text,text[],timestamptz,integer);
DROP FUNCTION IF EXISTS public.sp_hayat_invalidate_on_evidence_change();
DROP FUNCTION IF EXISTS public.sp_hayat_invalidate_on_claim_change();
DROP TABLE IF EXISTS public.sp_hayat_assessments;
DROP FUNCTION IF EXISTS public.sp_hayat_assessments_guard();
DROP FUNCTION IF EXISTS public.sp_hayat_claim_fingerprint(uuid);
DROP FUNCTION IF EXISTS public.sp_hayat_fields_fingerprint(public.sp_claims);
COMMIT;
