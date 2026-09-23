-- Rollback of 20261206090000_scp_training_assignment_person_context.
--
-- Restores the 7-argument `scp_assign_training` exactly as
-- 20260826091000_scp_training_delivery_rpcs left it. After it, an assignment
-- can no longer be told which employment record it is about, and an employee
-- whose record carries no subject will again not see the programme assigned to
-- them. Run it ONLY in an isolated test database (scripts/db-test.sh cycles it
-- to prove it restores the previous state exactly), never against production.
--
-- It touches no data: assignments already created keep their subject, and
-- employment records already bound stay bound. A bind is not undone, because
-- the binding is a fact about who the person is and was correct when it was
-- made.
DO $guard$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'scp_assign_training'
           AND pg_get_function_arguments(p.oid) LIKE '%_employee_id uuid%') THEN
    RAISE EXCEPTION
      'SCP_ASSIGN_TRAINING_ROLLBACK: the database is not in the state 20261206090000 leaves.';
  END IF;
END $guard$;

DROP FUNCTION public.scp_assign_training(uuid, uuid, text, text, timestamptz, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.scp_assign_training(
  _employer_id        uuid,
  _program_version_id uuid,
  _recipient_email    text,
  _language           text DEFAULT 'sv',
  _due_at             timestamptz DEFAULT NULL,
  _message            text DEFAULT NULL,
  _source_decision_id uuid DEFAULT NULL)
RETURNS TABLE(assignment_id uuid, subject_id uuid, modules_seeded integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _role text; _email text; _user uuid; _subject uuid;
  _purpose_code text; _purpose uuid; _assignment uuid; _n int;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: assigning training requires '
      'owner or admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _language NOT IN ('sv','en') THEN
    RAISE EXCEPTION 'SCP_UNSUPPORTED_LANGUAGE: %', _language USING ERRCODE = 'check_violation';
  END IF;

  _purpose_code := public.scp_required_purpose_code('workforce');

  SELECT pv.id INTO _purpose
    FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE pv.purpose_code = _purpose_code
     AND p.is_active AND pv.published_at IS NOT NULL AND pv.retired_at IS NULL
   ORDER BY pv.version_number DESC LIMIT 1;

  IF _purpose IS NULL THEN
    RAISE EXCEPTION
      'SCP_PURPOSE_NOT_AVAILABLE: no approved processing purpose "%" is '
      'published, so this assignment cannot state why it would process a '
      'person. Nothing was assigned.', _purpose_code
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _email := lower(btrim(_recipient_email));
  SELECT id INTO _user FROM auth.users WHERE lower(email) = _email;
  IF _user IS NULL THEN
    RAISE EXCEPTION
      'SCP_RECIPIENT_HAS_NO_ACCOUNT: % has no CQrityjob account yet. Training '
      'is attached to a person, not to an address.', _email
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES (_subject, _user);
  END IF;

  INSERT INTO public.scp_training_assignments
    (employer_id, program_version_id, subject_id, assigned_by, language,
     purpose_version_id, employer_message, due_at, source_decision_id)
  VALUES
    (_employer_id, _program_version_id, _subject, auth.uid(), _language,
     _purpose, nullif(btrim(coalesce(_message,'')), ''), _due_at, _source_decision_id)
  RETURNING id INTO _assignment;

  INSERT INTO public.scp_training_module_progress (assignment_id, module_version_id)
  SELECT _assignment, mv.id
    FROM public.scp_module_versions mv
   WHERE mv.program_version_id = _program_version_id;
  GET DIAGNOSTICS _n = ROW_COUNT;

  RETURN QUERY SELECT _assignment, _subject, _n;
END; $function$;

COMMENT ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid) IS
  'Assign one governed programme VERSION to one person. Owner/admin only, '
  'purpose-bearing, version-pinned, and refused for draft, retired or '
  'cross-tenant content by scp_guard_training_target_assignable.';

REVOKE ALL     ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid) TO authenticated;
