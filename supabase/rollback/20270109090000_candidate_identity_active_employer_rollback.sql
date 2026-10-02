-- Rollback for 20270109090000_candidate_identity_active_employer.
--
-- Restores the five functions and the scp_interview_notes read policy exactly
-- as hosted before (md5(prosrc) pinned below). This REOPENS that part of P1-B
-- of the 2026-10-02 re-audit: a member of a SUSPENDED (or pending)
-- organisation can again resolve a participant's e-mail address, receive a
-- candidate's address for a status notification, and read and write
-- interview-evidence notes. has_active_employer_role (20270108090000) is left
-- in place. No row is touched.

CREATE OR REPLACE FUNCTION public.scp_resolve_participant_identity(_employer_id uuid, _subject_id uuid)
 RETURNS TABLE(subject_id uuid, display_email text, released boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _role text;
  _in_scope boolean;
  _purpose_ok boolean;
  _released boolean;
BEGIN
  -- 1. Active organisation membership.
  SELECT m.role INTO _role
    FROM public.employer_memberships m
   WHERE m.user_id = auth.uid()
     AND m.employer_id = _employer_id
     AND m.status = 'active';
  IF _role IS NULL THEN RETURN; END IF;

  -- 2. Role and permission. A plain member may see aggregated competence
  --    through the read models but may not resolve a person.
  IF _role NOT IN ('owner', 'admin') THEN RETURN; END IF;

  -- 3. The subject must be in THIS organisation's scope, established by an
  --    attempt this employer actually commissioned. This is what stops the
  --    function enumerating subjects outside the authorised scope: a subject
  --    with no attempt for this employer simply returns nothing.
  SELECT EXISTS (
    SELECT 1 FROM public.scp_attempts a
     WHERE a.subject_id = _subject_id
       AND a.issuer_organization_id = _employer_id)
    INTO _in_scope;
  IF NOT _in_scope THEN RETURN; END IF;

  -- 4. Permitted processing purpose. Only an active purpose qualifies, so a
  --    reserved future purpose cannot silently authorise identity resolution.
  SELECT EXISTS (
    SELECT 1 FROM public.scp_attempts a
      JOIN public.scp_purpose_versions pv ON pv.id = a.purpose_version_id
      JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
     WHERE a.subject_id = _subject_id
       AND a.issuer_organization_id = _employer_id
       AND p.is_active)
    INTO _purpose_ok;
  IF NOT _purpose_ok THEN RETURN; END IF;

  -- 5. Disclosure and report-release state. Identity is resolvable only once a
  --    result has actually been released to the employer.
  SELECT EXISTS (
    SELECT 1 FROM public.scp_attempts a
     WHERE a.subject_id = _subject_id
       AND a.issuer_organization_id = _employer_id
       AND a.released_at IS NOT NULL)
    INTO _released;
  IF NOT _released THEN RETURN; END IF;

  -- 6. Minimum fields only. No name, no phone, no free text -- the contact
  --    address the employer already holds, and nothing more.
  RETURN QUERY
  SELECT i.subject_id, u.email::text, true
    FROM public.scp_subject_identities i
    JOIN auth.users u ON u.id = i.user_id
   WHERE i.subject_id = _subject_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.jase_notification_payload(_event_id uuid)
 RETURNS TABLE(event_id uuid, new_status text, recipient_email text, employer_name text, job_title text, language text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_application_status_events e
    JOIN public.job_applications a ON a.id = e.application_id
   WHERE e.id = _event_id;
  IF _employer IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employer_memberships m
     WHERE m.user_id = auth.uid() AND m.employer_id = _employer AND m.status = 'active'
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id,
         e.new_status,
         u.email::text,
         emp.name,
         coalesce(j.title_sv, j.title_en),
         -- The candidate's own language preference, not the employer's. A
         -- rejection is not the moment to make somebody read a second language.
         coalesce(nullif(p.locale, ''), 'sv')
    FROM public.job_application_status_events e
    JOIN public.job_applications a  ON a.id = e.application_id
    JOIN public.employers        emp ON emp.id = a.employer_id
    LEFT JOIN public.jobs        j   ON j.id = a.job_id
    JOIN auth.users              u   ON u.id = a.applicant_user_id
    LEFT JOIN public.profiles    p   ON p.id = a.applicant_user_id
   WHERE e.id = _event_id
     AND e.notified_at IS NULL
     AND e.actor_role = 'employer'
     AND e.new_status IN ('interview', 'rejected', 'hired')
     AND u.email IS NOT NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION public.jase_record_notification(_event_id uuid, _ok boolean, _error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid;
BEGIN
  SELECT a.employer_id INTO _employer
    FROM public.job_application_status_events e
    JOIN public.job_applications a ON a.id = e.application_id
   WHERE e.id = _event_id;

  IF _employer IS NULL THEN
    RAISE EXCEPTION 'JASE_EVENT_NOT_FOUND: no such status event.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employer_memberships m
     WHERE m.user_id = auth.uid() AND m.employer_id = _employer AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'JASE_NOT_AUTHORISED: not an active member of this organisation.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: an event already delivered stays delivered. Without this, a
  -- retry that raced a success would overwrite the timestamp with an error.
  UPDATE public.job_application_status_events
     SET notified_at     = CASE WHEN _ok THEN now() ELSE NULL END,
         notify_error    = CASE WHEN _ok THEN NULL ELSE left(coalesce(_error, 'UNKNOWN'), 200) END,
         notify_attempts = notify_attempts + 1
   WHERE id = _event_id
     AND notified_at IS NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_interview_notes(_attempt_id uuid)
 RETURNS TABLE(id uuid, area_code text, outcome text, note text, recorded_by_email text, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_attempts a
      JOIN public.employer_memberships m
        ON m.employer_id = a.issuer_organization_id
     WHERE a.id = _attempt_id AND m.user_id = auth.uid() AND m.status = 'active')
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.id, n.area_code, n.outcome, n.note,
         u.email::text, n.recorded_at
    FROM public.scp_interview_notes n
    LEFT JOIN auth.users u ON u.id = n.recorded_by
   WHERE n.attempt_id = _attempt_id
   ORDER BY n.recorded_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scp_record_interview_note(_attempt_id uuid, _area_code text, _outcome text, _note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _role text; _id uuid; _employer uuid;
BEGIN
  SELECT m.role, a.issuer_organization_id INTO _role, _employer
    FROM public.scp_attempts a
    JOIN public.employer_memberships m
      ON m.employer_id = a.issuer_organization_id
   WHERE a.id = _attempt_id AND m.user_id = auth.uid() AND m.status = 'active';

  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RECORD_INTERVIEW: recording '
      'interview evidence requires owner or admin in the commissioning '
      'organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.scp_report_snapshots s
                  WHERE s.attempt_id = _attempt_id AND s.audience = 'employer') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_BEFORE_REPORT: interview evidence is '
      'recorded against a released brief, and this attempt has none.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_interview_notes
    (attempt_id, employer_id, area_code, outcome, note, recorded_by)
  VALUES (_attempt_id, _employer, _area_code, _outcome,
          nullif(btrim(coalesce(_note,'')), ''), auth.uid())
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$
;

ALTER POLICY scp_interview_notes_employer_read ON public.scp_interview_notes
  USING (EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = scp_interview_notes.employer_id
                    AND m.user_id = auth.uid() AND m.status = 'active'));

DO $$
DECLARE _m text;
BEGIN
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_resolve_participant_identity(uuid,uuid)'::regprocedure));
  IF _m <> 'c7696ca0a3bc9e29c00a7397ed129541' THEN
    RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_ROLLBACK: scp_resolve_participant_identity is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.jase_notification_payload(uuid)'::regprocedure));
  IF _m <> '2b7a81eeedab69969e95f30fa3fb64db' THEN
    RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_ROLLBACK: jase_notification_payload is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.jase_record_notification(uuid,boolean,text)'::regprocedure));
  IF _m <> '925a22e15230fa1be538e2427470726e' THEN
    RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_ROLLBACK: jase_record_notification is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_interview_notes(uuid)'::regprocedure));
  IF _m <> 'fe6cd372b58702596357df37e25e42d9' THEN
    RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_ROLLBACK: scp_interview_notes is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_record_interview_note(uuid,text,text,text)'::regprocedure));
  IF _m <> 'e79b1575d407907275ea3e573abff91f' THEN
    RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_ROLLBACK: scp_record_interview_note is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'CANDIDATE_IDENTITY_ACTIVE_ROLLBACK ok: hosted pre-fix bodies in place';
END $$;
