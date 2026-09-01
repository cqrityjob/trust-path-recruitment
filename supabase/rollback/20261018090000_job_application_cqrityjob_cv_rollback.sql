-- Rollback for 20261018090000_job_application_cqrityjob_cv.sql.
--
-- ── ORDER MATTERS, AND SO DOES WHAT IS *NOT* DROPPED ────────────────────
--
-- 1. Restore sp_submit_application_with_passport to its own implementation
--    FIRST, so submission never passes through a function that is about to
--    stop existing.
-- 2. Drop sp_submit_application_with_cv_source.
-- 3. Drop the constraints, then the columns.
--
-- Step 3 DESTROYS every cv_document_snapshot: the copy of what a candidate
-- submitted to an employer. That is not recoverable from cv_documents,
-- because the saved CV may have been edited or deleted since. Run this only
-- against a database where no application has been submitted with a
-- CQrityjob CV, or having exported those rows first:
--
--   SELECT id, cv_document_id, cv_document_snapshot
--     FROM public.job_applications WHERE cv_source = 'cqrityjob_cv';
--
-- Applications whose CV is an uploaded file are unaffected in every step:
-- their file, path, filename, size and mime type are not touched here.

-- 1 ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sp_submit_application_with_passport(
  _application_id        uuid,
  _job_id                uuid,
  _phone                 text,
  _cover_note            text,
  _cv_storage_path       text,
  _cv_original_filename  text,
  _cv_size_bytes         bigint,
  _include_passport      boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _status   text;
  _shared   boolean := false;
  _eligible boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.job_applications (
    id, job_id, applicant_user_id, phone, cover_note,
    cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
    consent_given_at)
  VALUES (
    _application_id, _job_id, auth.uid(), _phone, _cover_note,
    _cv_storage_path, _cv_original_filename, 'application/pdf', _cv_size_bytes,
    now())
  RETURNING status INTO _status;

  IF _include_passport THEN
    SELECT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                    WHERE holder_user_id = auth.uid())
       AND (EXISTS (SELECT 1 FROM public.sp_claims c
                     WHERE c.holder_user_id = auth.uid()
                       AND c.assertion_level = 'verified'
                       AND c.lifecycle_state = 'active')
         OR EXISTS (SELECT 1 FROM public.sp_experience_periods e
                     WHERE e.holder_user_id = auth.uid()
                       AND e.assertion_level = 'verified'
                       AND e.lifecycle_state = 'active'))
      INTO _eligible;

    IF _eligible THEN
      PERFORM public.sp_share_passport_with_application(
        _application_id, 'employer_review', 30, NULL, NULL);
      _shared := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', _application_id,
    'status', _status,
    'passport_requested', _include_passport,
    'passport_shared', _shared,
    'passport_eligible', _eligible);
END; $$;

-- 2 ─────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sp_submit_application_with_cv_source(
  uuid, uuid, text, text, text, text, bigint, text, uuid, boolean);

-- 3 ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_cv_source_shape_check;
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_cv_source_check;
ALTER TABLE public.job_applications
  DROP CONSTRAINT IF EXISTS job_applications_cv_document_id_fkey;

ALTER TABLE public.job_applications
  DROP COLUMN IF EXISTS cv_document_snapshot,
  DROP COLUMN IF EXISTS cv_document_id,
  DROP COLUMN IF EXISTS cv_source;
