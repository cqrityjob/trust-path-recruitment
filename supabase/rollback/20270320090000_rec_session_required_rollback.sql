-- Rollback of 20270320090000 (rec_session_required).
-- The slot stores no data, so this never refuses: it drops the restrictive
-- session policies, restores every function to the body it had before the
-- slot (pg_get_functiondef of the replayed 20270319090000 schema, verbatim),
-- and drops rec_session_active().
BEGIN;
DROP POLICY IF EXISTS rec_session_required ON public.job_applications;
DROP POLICY IF EXISTS rec_session_required ON public.job_application_answers;
DROP POLICY IF EXISTS rec_session_required ON public.job_application_status_events;
DROP POLICY IF EXISTS rec_session_required ON public.rec_candidate_replies;
DROP POLICY IF EXISTS rec_session_required ON public.rec_requirement_profiles;
DROP POLICY IF EXISTS rec_session_required ON public.rec_requirement_review_heads;
DROP POLICY IF EXISTS rec_session_required ON public.recruitment_application_meta;
DROP POLICY IF EXISTS rec_session_required ON public.recruitment_comments;
DROP POLICY IF EXISTS rec_session_required ON public.recruitment_erasure_jobs;
DROP POLICY IF EXISTS rec_session_required ON public.recruitment_interview_bookings;
DROP POLICY IF EXISTS rec_session_required ON public.recruitment_messages;
DROP POLICY IF EXISTS rec_session_required ON public.recruitment_settings;

CREATE OR REPLACE FUNCTION public.rec_is_member(_employer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, NULL)
     AND public.employer_is_active_status(_employer_id);
$function$;

CREATE OR REPLACE FUNCTION public.rec_application_employer_note(_application_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.rec_application_status_events(_application_id uuid)
 RETURNS TABLE(id uuid, actor_role text, actor_user_id uuid, previous_status text, new_status text, note text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.set_application_status(_application_id uuid, _new_status text, _note text DEFAULT NULL::text)
 RETURNS TABLE(application_id uuid, previous_status text, new_status text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _app public.job_applications%ROWTYPE;
  _is_applicant boolean;
  _is_employer boolean;
  _clean_note text;
  _actor_role text;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _new_status NOT IN ('reviewing', 'interview', 'rejected', 'hired', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid application status: %', _new_status;
  END IF;

  _clean_note := NULLIF(btrim(_note), '');
  IF _clean_note IS NOT NULL AND char_length(_clean_note) > 1000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _app
  FROM public.job_applications
  WHERE id = _application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  _is_applicant := (_app.applicant_user_id = _caller);
  _is_employer := public.has_employer_role(_caller, _app.employer_id, NULL)
                  AND public.employer_is_active_status(_app.employer_id);

  -- Role-derived permission, never a client-supplied flag. A candidate may
  -- only ever request 'withdrawn' on their own application; an employer
  -- may never request 'withdrawn'.
  IF _is_applicant AND _new_status = 'withdrawn' THEN
    IF _app.status NOT IN ('submitted', 'reviewing', 'interview') THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, cannot withdraw',
        _app.status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'candidate';

  ELSIF _is_employer AND _new_status <> 'withdrawn' THEN
    IF NOT (
      (_app.status = 'submitted' AND _new_status IN ('reviewing', 'rejected')) OR
      (_app.status = 'reviewing' AND _new_status IN ('interview', 'rejected')) OR
      (_app.status = 'interview' AND _new_status IN ('hired', 'rejected'))
    ) THEN
      RAISE EXCEPTION 'Invalid transition: application status is %, action % not allowed',
        _app.status, _new_status
        USING ERRCODE = 'check_violation';
    END IF;
    _actor_role := 'employer';

  ELSE
    RAISE EXCEPTION 'Forbidden: not authorised to set this application status';
  END IF;

  UPDATE public.job_applications
  SET
    status = _new_status,
    updated_at = _now,
    withdrawn_at = CASE WHEN _new_status = 'withdrawn' THEN _now ELSE withdrawn_at END,
    employer_note = CASE
      WHEN _actor_role = 'employer' AND _clean_note IS NOT NULL THEN _clean_note
      ELSE employer_note
    END
  WHERE id = _application_id;

  INSERT INTO public.job_application_status_events (
    application_id, job_id, employer_id, actor_user_id, actor_role,
    previous_status, new_status, note, created_at
  ) VALUES (
    _application_id, _app.job_id, _app.employer_id, _caller, _actor_role,
    _app.status, _new_status, _clean_note, _now
  );

  -- The same person joins the workforce, in the same transaction. If this
  -- cannot be done the hire does not silently half-happen: the whole act
  -- rolls back and the employer is told why.
  IF _new_status = 'hired' THEN
    PERFORM public.scp_employment_from_application(_application_id);
  END IF;

  RETURN QUERY SELECT _application_id, _app.status, _new_status, _now;
END;
$function$;

CREATE OR REPLACE FUNCTION public.scp_application_candidate(_application_id uuid)
 RETURNS TABLE(application_id uuid, employer_id uuid, job_id uuid, job_slug text, job_title_sv text, job_title_en text, application_status text, applied_at timestamp with time zone, updated_at timestamp with time zone, cover_note text, phone text, has_cv boolean, display_name text, subject_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_applications a WHERE a.id = _application_id;
  IF _employer IS NULL THEN RETURN; END IF;

  -- Membership of THIS organisation, checked before anything is read. An
  -- application id is guessable; membership is not. Returning nothing rather
  -- than raising keeps a non-member unable to tell "not yours" from "not
  -- there", which is the same answer scp_application_assessments gives.
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _employer AND m.user_id = auth.uid()
                    AND m.status = 'active')
     -- 20270105090000: and the organisation itself is active, as the
     -- job_applications RLS policy and the rec_* read paths require.
     OR NOT coalesce(public.employer_is_active_status(_employer), false) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    a.id, a.employer_id, a.job_id,
    j.slug, j.title_sv, coalesce(j.title_en, j.title_sv),
    a.status,
    a.created_at, a.updated_at,
    a.cover_note, a.phone, (a.cv_storage_path IS NOT NULL),
    p.display_name,
    si.subject_id
  FROM public.job_applications a
  LEFT JOIN public.jobs j ON j.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.applicant_user_id
  LEFT JOIN public.scp_subject_identities si ON si.user_id = a.applicant_user_id
  WHERE a.id = _application_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rec_save_vacancy_structure(_job_id uuid, _requirements jsonb, _questions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _employer uuid;
  _req jsonb;
  _q jsonb;
  _keymap jsonb := '{}'::jsonb;
  _new_id uuid;
  _pos integer := 0;
  _req_key text;
BEGIN
  SELECT employer_id INTO _employer FROM public.jobs WHERE id = _job_id;
  IF _employer IS NULL
     OR auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer, NULL)
     OR NOT public.employer_members_can_edit(_employer) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF jsonb_typeof(coalesce(_requirements, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(coalesce(_questions, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(_requirements, '[]'::jsonb)) > 30
     OR jsonb_array_length(coalesce(_questions, '[]'::jsonb)) > 15 THEN
    RAISE EXCEPTION 'VACANCY_STRUCTURE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.job_applications WHERE job_id = _job_id) THEN
    RAISE EXCEPTION 'VACANCY_STRUCTURE_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.recruitment_questions WHERE job_id = _job_id;
  DELETE FROM public.recruitment_requirements WHERE job_id = _job_id;

  FOR _req IN SELECT * FROM jsonb_array_elements(coalesce(_requirements, '[]'::jsonb)) LOOP
    INSERT INTO public.recruitment_requirements (job_id, employer_id, kind, label_sv, label_en, position)
    VALUES (_job_id, _employer, _req->>'kind',
            nullif(btrim(_req->>'label_sv'), ''), nullif(btrim(_req->>'label_en'), ''), _pos)
    RETURNING id INTO _new_id;
    IF nullif(_req->>'key', '') IS NOT NULL THEN
      _keymap := _keymap || jsonb_build_object(_req->>'key', _new_id);
    END IF;
    _pos := _pos + 1;
  END LOOP;

  _pos := 0;
  FOR _q IN SELECT * FROM jsonb_array_elements(coalesce(_questions, '[]'::jsonb)) LOOP
    _req_key := nullif(_q->>'requirement_key', '');
    IF _req_key IS NOT NULL AND NOT (_keymap ? _req_key) THEN
      RAISE EXCEPTION 'VACANCY_STRUCTURE_INVALID' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.recruitment_questions (
      job_id, employer_id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required, position)
    VALUES (_job_id, _employer,
            CASE WHEN _req_key IS NULL THEN NULL ELSE (_keymap->>_req_key)::uuid END,
            nullif(btrim(_q->>'prompt_sv'), ''), nullif(btrim(_q->>'prompt_en'), ''),
            _q->>'answer_kind', coalesce((_q->>'is_required')::boolean, false), _pos);
    _pos := _pos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'requirements', (SELECT count(*) FROM public.recruitment_requirements WHERE job_id = _job_id),
    'questions', (SELECT count(*) FROM public.recruitment_questions WHERE job_id = _job_id));
END; $function$;

CREATE OR REPLACE FUNCTION public.rec_ri_case_composition(_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE k public.scp_interview_cases%ROWTYPE;
BEGIN
  SELECT * INTO k FROM public.scp_interview_cases WHERE id = _case_id;
  IF NOT FOUND OR NOT public.scp_iv_can_read_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF k.composition_id IS NULL THEN
    RETURN jsonb_build_object('caseId', k.id, 'compositionId', NULL, 'version', 0, 'selection', '[]'::jsonb,
                              'currentVersion', (recruiter_intelligence.composition_json(k.job_id)->>'version')::integer);
  END IF;
  RETURN (SELECT jsonb_build_object('caseId', k.id, 'compositionId', c.id, 'version', c.version,
                                    'packVersionId', c.pack_version_id, 'selection', c.selection,
                                    'confirmedAt', c.confirmed_at,
                                    'currentVersion', (recruiter_intelligence.composition_json(k.job_id)->>'version')::integer)
            FROM public.rec_interview_compositions c WHERE c.id = k.composition_id);
END $function$;

CREATE OR REPLACE FUNCTION public.rec_my_application_context()
 RETURNS TABLE(application_id uuid, job_id uuid, job_slug text, title_sv text, title_en text, employer_name text, job_open boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id,
         a.job_id,
         j.slug,
         j.title_sv,
         j.title_en,
         e.name,
         coalesce(public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at), false)
           AND coalesce(public.employer_is_active_status(j.employer_id), false)
    FROM public.job_applications a
    JOIN public.jobs j ON j.id = a.job_id
    LEFT JOIN public.employers e ON e.id = j.employer_id
   WHERE auth.uid() IS NOT NULL
     AND a.applicant_user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.rec_respond_to_booking(_booking_id uuid, _response text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _b public.recruitment_interview_bookings%ROWTYPE;
BEGIN
  IF _response NOT IN ('confirmed', 'declined') THEN
    RAISE EXCEPTION 'BOOKING_RESPONSE_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  SELECT b.* INTO _b
    FROM public.recruitment_interview_bookings b
    JOIN public.job_applications a ON a.id = b.application_id
   WHERE b.id = _booking_id AND a.applicant_user_id = auth.uid() AND b.invited_at IS NOT NULL
   FOR UPDATE OF b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (_b.status = 'invited' OR (_b.status = 'confirmed' AND _response = 'declined')) THEN
    RAISE EXCEPTION 'BOOKING_NOT_EDITABLE' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.recruitment_interview_bookings
     SET status = _response, candidate_response_at = now(), version = version + 1, updated_at = now()
   WHERE id = _b.id;
  RETURN _response;
END; $function$;

CREATE OR REPLACE FUNCTION public.rec_candidate_reply_to_message(_message_id uuid, _body text, _language text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m public.recruitment_messages%ROWTYPE; a public.job_applications%ROWTYPE;
        r public.rec_requirement_supplement_requests%ROWTYPE; rid uuid; at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO m FROM public.recruitment_messages WHERE id = _message_id;
  IF FOUND THEN SELECT * INTO a FROM public.job_applications WHERE id = m.application_id; END IF;
  -- Not found, not yours and not sent read the same: the candidate learns
  -- nothing about other people's mail, nor about a draft on their own file.
  IF m.id IS NULL OR a.id IS NULL OR a.applicant_user_id IS DISTINCT FROM auth.uid() OR m.status <> 'sent' THEN
    RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF m.kind <> 'supplement_request' THEN
    RAISE EXCEPTION 'REPLY_NOT_ALLOWED' USING ERRCODE = 'check_violation';
  END IF;
  IF a.withdrawn_at IS NOT NULL OR a.status NOT IN ('submitted', 'reviewing', 'interview') THEN
    RAISE EXCEPTION 'APPLICATION_NOT_OPEN' USING ERRCODE = 'check_violation';
  END IF;
  IF nullif(btrim(_body), '') IS NULL OR char_length(_body) > 4000
     OR (_language IS NOT NULL AND _language NOT IN ('sv', 'en')) THEN
    RAISE EXCEPTION 'REPLY_BODY_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO r FROM public.rec_requirement_supplement_requests
   WHERE message_id = m.id ORDER BY requested_at DESC LIMIT 1;
  IF r.id IS NOT NULL AND r.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'SUPPLEMENT_ALREADY_RESOLVED' USING ERRCODE = 'check_violation';
  END IF;
  at := now();
  INSERT INTO public.rec_candidate_replies (application_id, employer_id, message_id, request_id, body, language, created_by, created_at)
  VALUES (a.id, a.employer_id, m.id, r.id, btrim(_body), _language, auth.uid(), at)
  RETURNING id INTO rid;
  RETURN jsonb_build_object('replyId', rid, 'messageId', m.id, 'requestId', r.id,
                            'applicationId', a.id, 'createdAt', at);
END $function$;

ALTER POLICY job_application_answers_member_read ON public.job_application_answers USING (public.rec_is_member(employer_id));
ALTER POLICY rec_candidate_replies_member_read ON public.rec_candidate_replies USING (public.rec_is_member(employer_id));
ALTER POLICY rec_requirement_profiles_read ON public.rec_requirement_profiles USING (public.rec_is_member(employer_id));
ALTER POLICY rec_requirement_heads_read ON public.rec_requirement_review_heads USING (public.rec_is_member(employer_id));
ALTER POLICY recruitment_application_meta_member_read ON public.recruitment_application_meta USING (public.rec_is_member(employer_id));
ALTER POLICY recruitment_comments_member_read ON public.recruitment_comments USING (public.rec_is_member(employer_id));
ALTER POLICY recruitment_erasure_jobs_read ON public.recruitment_erasure_jobs USING (public.rec_is_member(employer_id));
ALTER POLICY recruitment_bookings_member_read ON public.recruitment_interview_bookings USING (public.rec_is_member(employer_id));
ALTER POLICY recruitment_messages_member_read ON public.recruitment_messages USING (public.rec_is_member(employer_id));
ALTER POLICY recruitment_settings_member_read ON public.recruitment_settings USING (public.rec_is_member(employer_id));
DROP FUNCTION IF EXISTS recruiter_intelligence.rec_member_without_session(uuid);
DROP FUNCTION IF EXISTS public.rec_session_active();

COMMIT;
