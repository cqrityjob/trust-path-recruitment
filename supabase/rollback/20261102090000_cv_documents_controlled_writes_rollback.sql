-- Rollback for 20261102090000_cv_documents_controlled_writes.sql
--
-- ── WHAT ROLLING THIS BACK MEANS ───────────────────────────────────────
--
-- Phase 1 is ADDITIVE: it grants nothing away, so rolling it back takes no
-- privilege back either. What it removes is the controlled write path and
-- the hardened submission boundary.
--
-- That second one matters and is stated here rather than buried, because a
-- rollback file is read by somebody under pressure at the point where they
-- are least likely to reason it out: after this runs,
-- sp_submit_application_with_cv_source no longer verifies a CV's facts
-- against the holder's live records, and no longer removes a contact value
-- the candidate switched off. Both protections came in with this migration
-- and both leave with it.
--
-- So it exists for exactly one situation: phase 1 is applied, something about
-- the new write path is wrong, and the deployed application -- which in phase
-- 1 still writes cv_documents directly -- has to keep working while it is
-- fixed. It does keep working, because phase 1 never took that away. That is
-- the property that makes this rollback safe to run on its own, and it is the
-- same property that makes phase 1 safe to apply on its own.
--
-- It must NOT be run once phase 3 (20261103090000_cv_documents_lockdown.sql)
-- has been applied: the lockdown revokes the direct writes, so removing the
-- controlled functions underneath it would leave no way to write a CV at all.
-- Roll back the lockdown first.
--
-- ── WHAT IT PRESERVES ──────────────────────────────────────────────────
--
-- Every CV. No cv_documents row is touched: the columns, the grants, the
-- policies and the data are exactly as they were. What goes is the operations
-- ledger (bookkeeping about calls, not data about people), the twelve
-- functions, and the tightened submission behaviour.
--
-- ── WHAT IT CANNOT PUT BACK ────────────────────────────────────────────
--
-- Application snapshots already written as `application-cv-snapshot-v2`. They
-- stay v2, and that is correct: they are historical artefacts of what was
-- sent, and the sanitised copy is the one the employer received. The restored
-- v1 submission function writes v1 again for new submissions, and readers
-- accept both.
--
-- Idempotent: safe to replay, and safe to run against a database where
-- 20261102090000 was never applied.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Restore the pre-20261018090000... no: the ORIGINAL submission function
-- ═════════════════════════════════════════════════════════════════════════
--
-- Byte-for-byte the body 20261018090000 shipped, so that rolling this back
-- leaves exactly the function that migration defined -- no sanitiser, no
-- lifecycle re-check, and the v1 snapshot shape.

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

    SELECT * INTO _cv
      FROM public.cv_documents
     WHERE id = _cv_document_id
       AND owner_user_id = auth.uid();

    IF _cv.id IS NULL THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
    END IF;

    _bundle := coalesce(_cv.source_bundle, '{}'::jsonb);

    IF coalesce(btrim(_bundle #>> '{identity,displayName}'), '') = ''
       OR (jsonb_array_length(coalesce(_bundle -> 'employment', '[]'::jsonb)) = 0
           AND jsonb_array_length(coalesce(_bundle -> 'education', '[]'::jsonb)) = 0)
    THEN
      RAISE EXCEPTION 'CV_DOCUMENT_NOT_READY' USING ERRCODE = 'check_violation';
    END IF;

    _snapshot := jsonb_build_object(
      'snapshot_version', 'application-cv-snapshot-v1',
      'cv_document_id', _cv.id,
      'cv_updated_at', _cv.updated_at,
      'title', _cv.title,
      'locale', _cv.locale,
      'purpose', _cv.purpose,
      'origin', _cv.origin,
      'document_version', _cv.document_version,
      'bundle_version', _cv.bundle_version,
      'source_bundle', _bundle - 'targetJobText',
      'presentation', coalesce(_cv.presentation, '{}'::jsonb) - 'tailoringRationale');
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
    'cv_source', _cv_source,
    'passport_requested', _include_passport,
    'passport_shared', _shared,
    'passport_eligible', _eligible);
END; $$;

REVOKE ALL     ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sp_submit_application_with_cv_source(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Drop the write path
-- ═════════════════════════════════════════════════════════════════════════
--
-- Dropped in dependency order: the four entry points first, then the helpers
-- they call. `cv_refresh_from_profile` is a wrapper around `cv_save` and must
-- go before it.

DROP FUNCTION IF EXISTS public.cv_refresh_from_profile(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.cv_delete(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.cv_save(uuid, timestamptz, text, text, text, text, boolean, uuid[], jsonb, jsonb, boolean, text, text);
DROP FUNCTION IF EXISTS public.cv_create(uuid, text, text, text, text, boolean, uuid[], jsonb, jsonb, text, text);
DROP FUNCTION IF EXISTS public.cv_application_snapshot(public.cv_documents, timestamptz);
DROP FUNCTION IF EXISTS public.cv_merge_bundle(jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.cv_facts_unverified(jsonb);
DROP FUNCTION IF EXISTS public.cv_bundle_ids(jsonb);
DROP FUNCTION IF EXISTS public.cv_normalise_presentation(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.cv_normalise_contact(jsonb);
DROP FUNCTION IF EXISTS public.cv_bundle_is_ready(jsonb);
DROP FUNCTION IF EXISTS public.cv_source_bundle(uuid[], text, boolean, text);

-- Bookkeeping about calls, not data about people. Nothing in it is
-- recoverable from anywhere else and nothing depends on it once the create
-- function is gone; the only consequence is that a retry after this point
-- creates a second CV, which is the behaviour being rolled back to.
DROP TABLE IF EXISTS public.cv_document_operations;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. The grants are untouched
-- ═════════════════════════════════════════════════════════════════════════
--
-- Phase 1 revoked nothing, so there is nothing to restore. Restated only so
-- that a reader comparing this file with the migration can see the symmetry
-- and stop looking for the missing half.
--
-- If `authenticated` has lost its direct write privileges, phase 3 is
-- applied and THAT is what needs rolling back first --
-- supabase/rollback/20261103090000_cv_documents_lockdown_rollback.sql.

COMMENT ON TABLE public.cv_documents IS
  'PRIVATE, owner-only CV documents. Presentation over facts that live in '
  'security_career_profiles, sp_experience_periods, sp_claims and profiles '
  '-- never a second home for any of them. Snapshots the facts it was built '
  'from so a saved CV does not silently change when the profile does. No '
  'sharing mechanism exists: a CV carries employment history and credentials '
  'and needs its own access model, not the Career Card''s.';
