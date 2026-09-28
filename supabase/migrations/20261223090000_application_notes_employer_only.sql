-- =============================================================================
-- Applications -- the employer's note is the employer's (JB-02), EXPAND half
-- =============================================================================
--
-- Resolves JB-02 of docs/release/2026-09-28-release-uat-report.md together
-- with 20261226090000_application_notes_column_privileges (the CONTRACT half).
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
-- ── THE FIX, IN TWO HALVES ──────────────────────────────────────────────
--
-- The boundary will be column-level privileges, the way 20261014090000 /
-- 20261016090000 keep a reviewer's identity from a Passport holder: table-
-- level SELECT replaced by a SELECT grant on every column EXCEPT the two
-- notes. That holds for every `authenticated` caller -- candidate, employer
-- member and platform admin alike -- because a column privilege cannot tell
-- them apart. So the readers who may see the notes need a door of their own
-- BEFORE the column goes: that door is this migration, the EXPAND half.
--
--   rec_application_status_events(_application_id)  the timeline, with note
--   rec_application_employer_note(_application_id)  the current note
--
-- Both are SECURITY DEFINER, refuse everyone but an active member of the
-- owning organisation (rec_is_member) or a platform admin (is_platform_admin,
-- the admin application screens read with the admin's own session), and
-- refuse an unknown application the same way (no existence oracle).
--
-- This half changes NO privilege: applying it alone changes nothing for
-- anyone. The application then moves its three note reads (employer
-- workspace, admin detail, candidate timeline) onto these functions and off
-- the column; only after that application is live does the CONTRACT half
-- revoke the two columns from `authenticated`. That order is the point:
-- revoking first would break the timeline reads the application still makes.
-- =============================================================================

-- ── 1. The employer''s and the admin''s reads, membership-checked ────────
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
  IF _employer IS NULL
     OR NOT (public.rec_is_member(_employer) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'REC_NOT_MEMBER: the caller is not an active member of the organisation that owns this application, nor a platform admin'
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
  'members of the owning organisation (rec_is_member) and platform admins; '
  'refuses everyone else, the applicant included.';
REVOKE ALL ON FUNCTION public.rec_application_status_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_application_status_events(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rec_application_employer_note(_application_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _employer uuid; _note text;
BEGIN
  SELECT a.employer_id, a.employer_note INTO _employer, _note
    FROM public.job_applications a WHERE a.id = _application_id;
  IF _employer IS NULL
     OR NOT (public.rec_is_member(_employer) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'REC_NOT_MEMBER: the caller is not an active member of the organisation that owns this application, nor a platform admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN _note;
END $$;
COMMENT ON FUNCTION public.rec_application_employer_note(uuid) IS
  'The employer''s current internal note on one application. Active members '
  'of the owning organisation and platform admins; refuses everyone else.';
REVOKE ALL ON FUNCTION public.rec_application_employer_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_application_employer_note(uuid) TO authenticated, service_role;

-- ── 2. The one invoker-level reader of the whole row ────────────────────
-- rec_submit_application runs as the candidate and replayed an idempotent
-- resubmission with `SELECT * INTO _existing`. Once the CONTRACT half
-- (20261226090000) narrows the candidate's column grant, a wildcard read
-- fails for a role without every column, so it reads exactly the three
-- fields the replay answer uses -- prepared here, in the EXPAND half, so
-- the contract can land without touching this function. Body otherwise
-- verbatim from 20261207090000.
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

-- ── 3. Postflight ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.rec_application_status_events(uuid)') IS NULL
     OR to_regprocedure('public.rec_application_employer_note(uuid)') IS NULL THEN
    RAISE EXCEPTION 'JB02_EXPAND_PROOF failed: an employer read function is missing';
  END IF;
  IF has_function_privilege('anon', 'public.rec_application_status_events(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rec_application_employer_note(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'JB02_EXPAND_PROOF failed: anon may execute an employer read';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rec_application_status_events(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'JB02_EXPAND_PROOF failed: authenticated cannot execute the timeline read';
  END IF;
  -- No privilege moved in this half: the candidate-visible columns AND the
  -- two notes are granted exactly as before (the CONTRACT half revokes them).
  IF NOT has_column_privilege('authenticated', 'public.job_applications', 'status', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_EXPAND_PROOF failed: a candidate-visible column lost its grant';
  END IF;
  RAISE NOTICE 'JB02_EXPAND_PROOF ok: employer reads exist, membership-or-admin checked; no privilege changed';
END $$;
