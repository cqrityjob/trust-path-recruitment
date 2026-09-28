-- =============================================================================
-- Applications -- the employer's note is the employer's (JB-02)
-- =============================================================================
--
-- Resolves JB-02 of docs/release/2026-09-28-release-uat-report.md.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- job_applications.employer_note and job_application_status_events.note are
-- written by set_application_status() when an employer moves an application
-- with a note. Both tables grant SELECT on EVERY column to `authenticated`,
-- and the applicant's own read policies (job_applications_owner_select,
-- job_application_status_events_applicant_select) admit the applicant's rows.
-- So the candidate could ask PostgREST for `employer_note` or for the events'
-- `note` on their own application and read what the employer wrote about
-- them. No screen renders it to the candidate, but the product tells the
-- employer the note is internal, and a boundary that only the UI keeps is
-- not a boundary. Verified against the hosted database on 2026-09-28: one
-- live application carried a 129-character employer note its applicant
-- could read through the API.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────
--
-- Column-level privileges, the way 20261014090000 / 20261016090000 keep a
-- reviewer's identity from a Passport holder: table-level SELECT is replaced
-- by a SELECT grant on every column EXCEPT the two notes. That holds for
-- every `authenticated` caller -- candidate and employer member alike --
-- because a column privilege cannot tell them apart. The employer therefore
-- gets the notes back through two SECURITY DEFINER functions that check
-- rec_is_member() (an active member of an ACTIVE organisation) first:
--
--   rec_application_status_events(_application_id)  the timeline, with note
--   rec_application_employer_note(_application_id)  the current note
--
-- Nothing else moves: no row is rewritten, no policy changes, INSERT stays
-- as it was (the candidate's own submission path), set_application_status()
-- keeps writing both columns as SECURITY DEFINER, and the platform admin
-- screens read through the service role, which is untouched.
--
-- Client code that selected `note` from the events table for the employer
-- (recruitment.functions.ts, the application detail) moves to the function
-- in the same change; the candidate-facing read never selected it and now
-- cannot.
-- =============================================================================

-- ── 1. job_applications: everything but employer_note ───────────────────
REVOKE SELECT ON public.job_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, job_id, employer_id, applicant_user_id, status, phone, cover_note,
  cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
  consent_given_at, withdrawn_at, created_at, updated_at, cv_source,
  cv_document_id, cv_document_snapshot
) ON public.job_applications TO authenticated;

COMMENT ON COLUMN public.job_applications.employer_note IS
  'INTERNAL to the employer. Written by set_application_status() with an '
  'employer note; not granted to authenticated. Employer members read it '
  'through rec_application_employer_note(); the applicant never does.';

-- ── 2. job_application_status_events: everything but note ───────────────
REVOKE SELECT ON public.job_application_status_events FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, application_id, job_id, employer_id, actor_user_id, actor_role,
  previous_status, new_status, created_at, notified_at, notify_error,
  notify_attempts
) ON public.job_application_status_events TO authenticated;

COMMENT ON COLUMN public.job_application_status_events.note IS
  'INTERNAL to the employer. The note given with a stage change; not granted '
  'to authenticated. Employer members read it through '
  'rec_application_status_events(); the applicant sees the stage, never the note.';

-- ── 3. The employer''s reads, membership-checked ─────────────────────────
CREATE OR REPLACE FUNCTION public.rec_application_status_events(_application_id uuid)
RETURNS TABLE (
  id uuid,
  actor_role text,
  actor_user_id uuid,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer FROM public.job_applications a WHERE a.id = _application_id;
  IF _employer IS NULL OR NOT public.rec_is_member(_employer) THEN
    RAISE EXCEPTION 'REC_NOT_MEMBER: the caller is not an active member of the organisation that owns this application'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT e.id, e.actor_role, e.actor_user_id, e.previous_status, e.new_status, e.note, e.created_at
      FROM public.job_application_status_events e
     WHERE e.application_id = _application_id
     ORDER BY e.created_at DESC;
END $$;
COMMENT ON FUNCTION public.rec_application_status_events(uuid) IS
  'The stage timeline of one application, WITH the employer''s notes. Active '
  'members of the owning organisation only (rec_is_member); refuses everyone '
  'else, the applicant included.';
REVOKE ALL ON FUNCTION public.rec_application_status_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_application_status_events(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rec_application_employer_note(_application_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _employer uuid; _note text;
BEGIN
  SELECT a.employer_id, a.employer_note INTO _employer, _note
    FROM public.job_applications a WHERE a.id = _application_id;
  IF _employer IS NULL OR NOT public.rec_is_member(_employer) THEN
    RAISE EXCEPTION 'REC_NOT_MEMBER: the caller is not an active member of the organisation that owns this application'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _note;
END $$;
COMMENT ON FUNCTION public.rec_application_employer_note(uuid) IS
  'The employer''s current internal note on one application. Active members '
  'of the owning organisation only; refuses everyone else.';
REVOKE ALL ON FUNCTION public.rec_application_employer_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_application_employer_note(uuid) TO authenticated, service_role;

-- ── 3b. The one invoker-level reader of the whole row ───────────────────
-- rec_submit_application runs as the candidate and replayed an idempotent
-- resubmission with `SELECT * INTO _existing`. A wildcard read now fails for
-- a role without every column, so it reads exactly the three fields the
-- replay answer uses. Body otherwise verbatim from 20261207090000.
CREATE OR REPLACE FUNCTION public.rec_submit_application(_application_id uuid, _job_id uuid, _phone text, _cover_note text, _cv_storage_path text, _cv_original_filename text, _cv_size_bytes bigint, _cv_source text DEFAULT 'upload'::text, _cv_document_id uuid DEFAULT NULL::uuid, _include_passport boolean DEFAULT false, _answers jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Only the three fields the replay answer needs. This function runs as the
  -- caller (SECURITY INVOKER), and since 20261223090000 the caller is not
  -- granted employer_note, so a `SELECT *` here would fail for every
  -- candidate. The candidate's own submission must not read the employer's
  -- note in any case.
  _existing_id uuid;
  _existing_status text;
  _existing_cv_source text;
  _result jsonb;
  _a jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, status, cv_source INTO _existing_id, _existing_status, _existing_cv_source
    FROM public.job_applications
   WHERE id = _application_id AND applicant_user_id = auth.uid();
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', _existing_id,
      'status', _existing_status,
      'cv_source', _existing_cv_source,
      'passport_requested', _include_passport,
      'passport_shared', EXISTS (SELECT 1 FROM public.sp_disclosures d
                                  WHERE d.application_id = _existing_id),
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

-- ── 4. Postflight ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.job_applications', 'employer_note', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: authenticated can still read job_applications.employer_note';
  END IF;
  IF has_column_privilege('authenticated', 'public.job_application_status_events', 'note', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: authenticated can still read job_application_status_events.note';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.job_applications', 'status', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.job_application_status_events', 'new_status', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: a candidate-visible column lost its grant';
  END IF;
  IF has_table_privilege('anon', 'public.job_applications', 'SELECT')
     OR has_table_privilege('anon', 'public.job_application_status_events', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: anon can read an application table';
  END IF;
  IF has_function_privilege('anon', 'public.rec_application_status_events(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'JB02_PROOF failed: anon may execute the employer read';
  END IF;
  RAISE NOTICE 'JB02_PROOF ok: notes are not granted to authenticated; employer reads are membership-checked';
END $$;
