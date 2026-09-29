-- Roll back 20261223090000_application_notes_employer_only (the EXPAND half).
--
-- Drops the two employer read functions and restores rec_submit_application
-- exactly as 20261207090000 wrote it. No privilege changes here, because
-- this half changed none: the CONTRACT half (20261226090000) owns the column
-- grants and has its own rollback, which must run FIRST when both are
-- applied (its postflight refuses otherwise: the notes would be granted to
-- nobody but the functions this file drops). Roll the application back first
-- or together: the employer workspace, the admin detail and the candidate
-- timeline at the dependent commit read through these functions.
DROP FUNCTION IF EXISTS public.rec_application_employer_note(uuid);
DROP FUNCTION IF EXISTS public.rec_application_status_events(uuid);

-- rec_submit_application, VERBATIM as 20261207090000 wrote it.
CREATE OR REPLACE FUNCTION public.rec_submit_application(_application_id uuid, _job_id uuid, _phone text, _cover_note text, _cv_storage_path text, _cv_original_filename text, _cv_size_bytes bigint, _cv_source text DEFAULT 'upload'::text, _cv_document_id uuid DEFAULT NULL::uuid, _include_passport boolean DEFAULT false, _answers jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _existing public.job_applications%ROWTYPE;
  _result jsonb;
  _a jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _existing FROM public.job_applications
   WHERE id = _application_id AND applicant_user_id = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', _existing.id,
      'status', _existing.status,
      'cv_source', _existing.cv_source,
      'passport_requested', _include_passport,
      'passport_shared', EXISTS (SELECT 1 FROM public.sp_disclosures d
                                  WHERE d.application_id = _existing.id),
      'replayed', true);
  END IF;

  IF jsonb_typeof(coalesce(_answers, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(_answers, '[]'::jsonb)) > 15 THEN
    RAISE EXCEPTION 'APPLICATION_ANSWERS_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  _result := public.sp_submit_application_with_cv_source(
    _application_id, _job_id, _phone, _cover_note, _cv_storage_path,
    _cv_original_filename, _cv_size_bytes, _cv_source, _cv_document_id, _include_passport);

  FOR _a IN SELECT * FROM jsonb_array_elements(coalesce(_answers, '[]'::jsonb)) LOOP
    INSERT INTO public.job_application_answers (application_id, question_id, answer_text, answer_bool)
    VALUES (_application_id, (_a->>'question_id')::uuid,
            left(_a->>'answer_text', 2000),
            CASE WHEN _a ? 'answer_bool' AND jsonb_typeof(_a->'answer_bool') = 'boolean'
                 THEN (_a->>'answer_bool')::boolean END);
  END LOOP;

  -- Every required question answered, checked here rather than left to a
  -- trigger: this function is the new application's only way in, and it must
  -- hold the rule on its own while 20261208090000's COMMIT-time backstop is
  -- not applied. Raising rolls back the application row with its answers.
  IF EXISTS (
    SELECT 1
      FROM public.recruitment_questions q
     WHERE q.job_id = _job_id
       AND q.is_required
       AND NOT EXISTS (
         SELECT 1 FROM public.job_application_answers a
          WHERE a.application_id = _application_id AND a.question_id = q.id
            AND ((q.answer_kind = 'yes_no' AND a.answer_bool IS NOT NULL)
              OR (q.answer_kind = 'text' AND nullif(btrim(a.answer_text), '') IS NOT NULL))
       )
  ) THEN
    RAISE EXCEPTION 'APPLICATION_ANSWERS_MISSING' USING ERRCODE = 'check_violation';
  END IF;

  RETURN _result || jsonb_build_object('replayed', false);
END; $function$;
REVOKE ALL ON FUNCTION public.rec_submit_application(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_submit_application(uuid, uuid, text, text, text, text, bigint, text, uuid, boolean, jsonb) TO authenticated;
