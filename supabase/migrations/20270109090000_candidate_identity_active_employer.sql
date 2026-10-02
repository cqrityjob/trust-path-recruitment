-- =============================================================================
-- P1-B (2/5) -- candidate identity, interview notes and candidate
-- notifications require an ACTIVE organisation
-- =============================================================================
--
-- THE DEFECT (2026-10-02 full re-audit, P1-B, reproduced on production inside
-- a rolled-back transaction):
--
--   With the organisation suspended, a member still received, through
--   jase_notification_payload, the candidate's e-mail address for a pending
--   status notification (rows=1) and could record the delivery through
--   jase_record_notification, while the same member's read of
--   job_applications returned 0 rows. scp_resolve_participant_identity
--   resolved a participant to their e-mail address for the suspended
--   organisation's owner (rows=1). The interview-evidence notes an
--   organisation keeps against a released brief were readable and writable on
--   membership alone.
--
-- THE RULE: has_active_employer_role (20270108090000) -- an active membership
-- of an organisation whose status is 'active'. This migration applies it to:
--
--     scp_resolve_participant_identity   owner/admin resolves a participant's
--                                        contact address
--     jase_notification_payload          a candidate's address for a status
--                                        e-mail
--     jase_record_notification           records that delivery
--     scp_interview_notes                interview-evidence notes (read)
--     scp_record_interview_note          interview-evidence notes (write)
--     scp_interview_notes_employer_read  the same notes, read directly
--
--   A caller who fails the rule gets the answer a non-member already gets:
--   no rows from the reads, the existing JASE_NOT_AUTHORISED /
--   SCP_NOT_AUTHORISED_TO_RECORD_INTERVIEW refusals from the writes.
--
-- Each body is the hosted body verbatim except its gate (marked
-- "20270109090000" in place).
--
-- NOT CHANGED: payloads, columns, grants; the rec_* recruitment functions,
-- which already gate on rec_is_member (membership AND an active
-- organisation); scp_application_candidate / _assessments and
-- sp_application_disclosure (20270105090000); any row.
--
-- Depends on 20270108090000 (has_active_employer_role).
-- Rollback: supabase/rollback/20270109090000_candidate_identity_active_employer_rollback.sql
-- Suite:    supabase/tests/candidate_identity_active_employer_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
DECLARE _s text;
BEGIN
  FOREACH _s IN ARRAY ARRAY[
    'public.scp_resolve_participant_identity(uuid,uuid)',
    'public.jase_notification_payload(uuid)',
    'public.jase_record_notification(uuid,boolean,text)',
    'public.scp_interview_notes(uuid)',
    'public.scp_record_interview_note(uuid,text,text,text)',
    'public.has_active_employer_role(uuid,uuid,text[])'] LOOP
    IF to_regprocedure(_s) IS NULL THEN
      RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_PRECONDITION: % is missing', _s;
    END IF;
  END LOOP;
END $$;

-- ── 1. The gates (each body is the hosted body; only the gate changes) ───
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
  -- 20270109090000: an active member of an ACTIVE organisation
  IF _role IS NULL OR NOT public.has_active_employer_role(auth.uid(), _employer_id) THEN RETURN; END IF;

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

  -- 20270109090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer) THEN RETURN; END IF;

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

  -- 20270109090000: an active member of an ACTIVE organisation
  IF NOT public.has_active_employer_role(auth.uid(), _employer) THEN
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
     WHERE a.id = _attempt_id
       -- 20270109090000: an active member of an ACTIVE organisation
       AND public.has_active_employer_role(auth.uid(), a.issuer_organization_id))
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

  IF _role IS NULL OR _role NOT IN ('owner','admin')
     -- 20270109090000: an active member of an ACTIVE organisation
     OR NOT public.has_active_employer_role(auth.uid(), _employer, ARRAY['owner','admin']) THEN
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

-- ── 2. Row-level security on the same data ──────────────────────────────
ALTER POLICY scp_interview_notes_employer_read ON public.scp_interview_notes
  USING (public.has_active_employer_role(auth.uid(), employer_id));

-- ── 3. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _s text; _p text;
BEGIN
  FOREACH _s IN ARRAY ARRAY['public.scp_resolve_participant_identity(uuid,uuid)', 'public.jase_notification_payload(uuid)', 'public.jase_record_notification(uuid,boolean,text)', 'public.scp_interview_notes(uuid)', 'public.scp_record_interview_note(uuid,text,text,text)'] LOOP
    IF position('has_active_employer_role' IN (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_PROOF: % does not use has_active_employer_role', _s;
    END IF;
    IF (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure) ~ 'has_employer_role\(auth\.uid\(\)'
       AND _s NOT IN ('') THEN
      RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_PROOF: % still gates its caller on has_employer_role alone', _s;
    END IF;
    IF has_function_privilege('anon', _s, 'EXECUTE') THEN
      RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_PROOF: anon may execute %', _s;
    END IF;
  END LOOP;
  FOREACH _p IN ARRAY ARRAY['scp_interview_notes.scp_interview_notes_employer_read'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = split_part(_p, '.', 1)
                      AND policyname = split_part(_p, '.', 2)
                      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%has_active_employer_role%'
                      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%has_employer_role(%'
                      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%employer_memberships%') THEN
      RAISE EXCEPTION 'CANDIDATE_IDENTITY_ACTIVE_PROOF: policy % does not use has_active_employer_role alone', _p;
    END IF;
  END LOOP;
  RAISE NOTICE 'CANDIDATE_IDENTITY_ACTIVE_PROOF ok: 5 functions and 1 policy require an active organisation';
END $$;
