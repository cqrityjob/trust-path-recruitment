-- Restores the prior submission definition without changing any application or CV.
BEGIN;
CREATE OR REPLACE FUNCTION public.sp_submit_application_with_cv_source(
  _application_id        uuid,
  _job_id                uuid,
  _phone                 text,
  _cover_note            text,
  _cv_storage_path       text,
  _cv_original_filename  text,
  _cv_size_bytes         bigint,
  _cv_source             text DEFAULT 'upload',
  _cv_document_id        uuid DEFAULT NULL,
  _include_passport      boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _status    text;
  _shared    boolean := false;
  _eligible  boolean := false;
  _cv        public.cv_documents%ROWTYPE;
  _snapshot  jsonb   := NULL;
  _bundle    jsonb;
  _now       timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _cv_source NOT IN ('upload', 'cqrityjob_cv') THEN
    RAISE EXCEPTION 'CV_SOURCE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  IF _cv_source = 'cqrityjob_cv' THEN
    IF _cv_document_id IS NULL THEN
      RAISE EXCEPTION 'CV_DOCUMENT_REQUIRED' USING ERRCODE = 'check_violation';
    END IF;

    -- INVOKER + owner-only RLS. The `owner_user_id` predicate is defence in
    -- depth and says the intent out loud; RLS is the boundary.
    SELECT * INTO _cv
      FROM public.cv_documents
     WHERE id = _cv_document_id
       AND owner_user_id = auth.uid();

    IF _cv.id IS NULL THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
    END IF;

    _bundle := coalesce(_cv.source_bundle, '{}'::jsonb);

    -- The same readiness rule the apply dialog shows in advance
    -- (isCvUsableForApplication, src/lib/professional-identity/cv/
    -- application-source.ts). Stated in two places because the interface has
    -- to explain it BEFORE submission and the database has to be the one that
    -- enforces it -- and this copy is the boundary.
    IF NOT public.cv_bundle_is_ready(_bundle) THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_READY' USING ERRCODE = 'check_violation';
    END IF;

    -- ── TRUE OF THE HOLDER TODAY, NOT MERELY SAVED ONCE ──────────────
    --
    -- Every fact on the document is compared, field for field, against the
    -- caller's own active records. This is the control that makes phase 1
    -- safe to deploy while direct writes to cv_documents are still granted:
    -- a fabricated bundle can be written and cannot be sent.
    IF public.cv_facts_unverified(_bundle) > 0 THEN
      RAISE EXCEPTION 'CV_DOCUMENT_STALE_FACTS' USING ERRCODE = 'check_violation';
    END IF;

    _snapshot := public.cv_application_snapshot(_cv, _now);
  END IF;

  INSERT INTO public.job_applications (
    id, job_id, applicant_user_id, phone, cover_note,
    cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
    cv_source, cv_document_id, cv_document_snapshot,
    consent_given_at)
  VALUES (
    _application_id, _job_id, auth.uid(), _phone, _cover_note,
    CASE WHEN _cv_source = 'upload' THEN _cv_storage_path END,
    CASE WHEN _cv_source = 'upload' THEN _cv_original_filename END,
    CASE WHEN _cv_source = 'upload' AND _cv_storage_path IS NOT NULL
         THEN 'application/pdf' END,
    CASE WHEN _cv_source = 'upload' THEN _cv_size_bytes END,
    _cv_source,
    CASE WHEN _cv_source = 'cqrityjob_cv' THEN _cv_document_id END,
    _snapshot,
    _now)
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
    'cv_source', _cv_source,
    'passport_requested', _include_passport,
    'passport_shared', _shared,
    'passport_eligible', _eligible);
END; $$;
DROP FUNCTION public.cv_owned_application_snapshot(uuid);
COMMIT;
