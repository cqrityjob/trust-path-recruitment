-- CLI-created 20260916060931; placed after the pending Passport catalogue.
-- Repairs authenticated saved-CV submissions without granting private helpers
-- or bypassing job-application RLS. No personal data is changed or deleted.
BEGIN;
CREATE FUNCTION public.cv_owned_application_snapshot(_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _cv public.cv_documents%ROWTYPE; _bundle jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'CV_NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _cv FROM public.cv_documents
    WHERE id = _document_id AND owner_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CV_DOCUMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  _bundle := coalesce(_cv.source_bundle, '{}'::jsonb);
  IF NOT public.cv_bundle_is_ready(_bundle) THEN
    RAISE EXCEPTION 'CV_DOCUMENT_NOT_READY' USING ERRCODE = '23514';
  END IF;
  IF public.cv_facts_unverified(_bundle) > 0 THEN
    RAISE EXCEPTION 'CV_DOCUMENT_STALE_FACTS' USING ERRCODE = '23514';
  END IF;
  RETURN public.cv_application_snapshot(_cv, now());
END;
$$;
REVOKE ALL ON FUNCTION public.cv_owned_application_snapshot(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cv_owned_application_snapshot(uuid) TO authenticated;
COMMENT ON FUNCTION public.cv_owned_application_snapshot(uuid) IS
  'Read-only owner-checked CV readiness, current-fact validation and privacy-filtered application snapshot. Internal helpers remain private; application insertion remains SECURITY INVOKER.';

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

    -- The narrowly scoped definer reads only the authenticated holder's CV.
    -- Application INSERT below remains invoker and retains every RLS check.
    _snapshot := public.cv_owned_application_snapshot(_cv_document_id);
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
COMMIT;
