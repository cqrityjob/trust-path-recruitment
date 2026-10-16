-- =============================================================================
-- 20270320090000 -- Recruitment: private recruitment data needs a live Auth
-- session, on the Passport's principle.
--
-- Canonical forward slot, the next one after 20270319090000 (PR #475, the
-- candidate-view performance slot this builds on). Schema-first: no
-- application code in the same PR. Install after 20270319090000.
--
-- Owner decision 2026-10-16: after a confirmed sign-out or a revoked session,
-- the next call with the old access token is refused. A signed JWT stays
-- cryptographically valid until exp, so PostgREST alone cannot see a sign-out;
-- the database checks the session itself, as sp_passport_session_active()
-- (20261119090000) does for the Passport. Recruitment does NOT require the
-- person to have a Passport: the check reads auth.sessions only.
--
-- rec_session_active(): true when the request carries no Auth JWT (SQL and
-- service operations) or a non-`authenticated` role; otherwise only when the
-- token's session_id is a live auth.sessions row OF THE SAME USER
-- (s.user_id = auth.uid(), not_after unset or in the future). No cache: every
-- call reads auth.sessions afresh.
--
-- Where it is enforced (the map is docs/release/2026-10-16-recruitment-session-required.md):
--   1. rec_is_member() -- the membership rule behind every employer-side
--      rec_* read and write (and so behind rec_can_manage). Roles and
--      organisation rules are unchanged. The ten member RLS policies that
--      called it per row move to recruiter_intelligence.rec_member_without_session
--      (the same rule without the session); their tables carry (3).
--   2. RPCs that decide without rec_is_member: the platform-admin branch of
--      rec_application_employer_note / rec_application_status_events,
--      set_application_status, scp_application_candidate,
--      rec_save_vacancy_structure, rec_ri_case_composition, and the
--      candidate's own rec_my_application_context, rec_respond_to_booking,
--      rec_candidate_reply_to_message. Each body is the current one
--      (pg_get_functiondef of the replayed schema) plus the guard.
--   3. A RESTRICTIVE policy on every private recruitment table a client can
--      read or write through PostgREST, so a direct table request is refused
--      too. It is written `(SELECT public.rec_session_active())`: an InitPlan,
--      evaluated once per statement, never per row.
-- The talent-search RPCs already require the session (sp_assert_passport_session).
--
-- Not per candidate row: rec_ri_candidate_view calls rec_is_member once per
-- read (20270319090000), so the session is read once per read.
--
-- Rollback: supabase/rollback/20270320090000_rec_session_required_rollback.sql
-- Suite:    supabase/tests/rec_session_required_test.sql
-- =============================================================================
BEGIN;

CREATE FUNCTION public.rec_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE
   -- SQL/service operations carry no Auth JWT; their own checks still apply.
   WHEN coalesce(auth.jwt(), '{}'::jsonb) = '{}'::jsonb THEN true
   WHEN auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' THEN true
   ELSE EXISTS (SELECT 1 FROM auth.sessions s
     WHERE s.id::text = auth.jwt()->>'session_id' AND s.user_id = auth.uid()
       AND (s.not_after IS NULL OR s.not_after > now()))
 END
$$;
REVOKE ALL ON FUNCTION public.rec_session_active() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rec_session_active() TO authenticated;
COMMENT ON FUNCTION public.rec_session_active() IS
  'Recruitment (20270320090000): the caller''s Auth session is live and belongs to the caller. '
  'True for requests without an Auth JWT or with a non-authenticated role. No cache.';

-- The membership rule WITHOUT the session, for the ten member RLS policies
-- below only. Every one of their tables also carries the rec_session_required
-- restrictive policy (end of file), which checks the session once per
-- statement; calling the session-checking rec_is_member() from a per-row
-- policy would check it once per ROW. Kept out of the PostgREST-exposed
-- `public` schema, so it is not itself a session-free RPC.
CREATE FUNCTION recruiter_intelligence.rec_member_without_session(_employer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, NULL)
     AND public.employer_is_active_status(_employer_id);
$$;
REVOKE ALL ON FUNCTION recruiter_intelligence.rec_member_without_session(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION recruiter_intelligence.rec_member_without_session(uuid) TO authenticated;
COMMENT ON FUNCTION recruiter_intelligence.rec_member_without_session(uuid) IS
  'Only for member RLS policies on tables that also carry the rec_session_required restrictive policy (20270320090000).';

ALTER POLICY job_application_answers_member_read ON public.job_application_answers USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY rec_candidate_replies_member_read ON public.rec_candidate_replies USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY rec_requirement_profiles_read ON public.rec_requirement_profiles USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY rec_requirement_heads_read ON public.rec_requirement_review_heads USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY recruitment_application_meta_member_read ON public.recruitment_application_meta USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY recruitment_comments_member_read ON public.recruitment_comments USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY recruitment_erasure_jobs_read ON public.recruitment_erasure_jobs USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY recruitment_bookings_member_read ON public.recruitment_interview_bookings USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY recruitment_messages_member_read ON public.recruitment_messages USING (recruiter_intelligence.rec_member_without_session(employer_id));
ALTER POLICY recruitment_settings_member_read ON public.recruitment_settings USING (recruiter_intelligence.rec_member_without_session(employer_id));

CREATE OR REPLACE FUNCTION public.rec_is_member(_employer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
     -- 20270320090000: the caller's live Auth session, bound to this user.
     AND public.rec_session_active()
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RETURN; END IF;
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
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
     AND public.rec_session_active()  -- 20270320090000
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
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
  -- 20270320090000: private recruitment data needs this caller's live Auth session.
  IF NOT public.rec_session_active() THEN RAISE EXCEPTION 'REC_SESSION_REVOKED' USING ERRCODE = '42501'; END IF;
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

-- Direct table access through PostgREST: once per statement, never per row.
CREATE POLICY rec_session_required ON public.job_applications AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.job_application_answers AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.job_application_status_events AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.rec_candidate_replies AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.rec_requirement_profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.rec_requirement_review_heads AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.recruitment_application_meta AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.recruitment_comments AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.recruitment_erasure_jobs AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.recruitment_interview_bookings AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.recruitment_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));
CREATE POLICY rec_session_required ON public.recruitment_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.rec_session_active())) WITH CHECK ((SELECT public.rec_session_active()));

COMMIT;
