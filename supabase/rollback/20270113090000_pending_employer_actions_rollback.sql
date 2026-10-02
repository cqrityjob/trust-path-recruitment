-- Rollback for 20270113090000_pending_employer_actions.
--
-- Restores the seven functions exactly as hosted before (md5(prosrc) pinned
-- below). This REOPENS P1-D of the 2026-10-02 re-audit: a PENDING (not yet
-- approved) or suspended organisation can again assign assessments and
-- training, invite participants, schedule reassessments and bind people, and
-- its invitations bind when claimed. has_active_employer_role
-- (20270108090000) is left in place. No row is touched.

CREATE OR REPLACE FUNCTION public.scp_employer_assign(_employer_id uuid, _assessment_version_id uuid, _recipient_email text, _deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, _language text DEFAULT 'sv'::text, _use_case text DEFAULT 'workforce'::text, _employee_id uuid DEFAULT NULL::uuid, _purpose_intent text DEFAULT NULL::text, _application_id uuid DEFAULT NULL::uuid, _job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(assignment_id uuid, attempt_id uuid, subject_id uuid, governance_mode scp_governance_mode)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _role text; _user uuid; _subject uuid; _form uuid; _purpose uuid;
  _assignment uuid; _attempt uuid; _email text;
  _definition uuid; _content_status text; _validation_status text;
  _is_fixture boolean; _retired timestamptz; _has_items boolean;
  _mode public.scp_governance_mode; _grant uuid; _purpose_code text;
  _app_employer uuid; _app_job uuid; _app_user uuid; _app_status text;
  _existing record;
BEGIN
  IF _use_case NOT IN ('workforce', 'recruitment') THEN
    RAISE EXCEPTION 'SCP_UNKNOWN_USE_CASE: % is not a valid assignment context.', _use_case
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: assigning requires owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT av.definition_id, av.content_status, av.validation_status, av.retired_at,
         d.is_test_fixture,
         EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)
    INTO _definition, _content_status, _validation_status, _retired,
         _is_fixture, _has_items
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _assessment_version_id;

  IF _definition IS NULL THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_NOT_FOUND: no such assessment version.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF _retired IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_RETIRED: this programme was retired and can '
      'no longer be assigned.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT _has_items THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_HAS_NO_ITEMS: this programme has no '
      'questions and cannot be assigned.' USING ERRCODE = 'check_violation';
  END IF;

  _mode := public.scp_grant_permits_assignment(
             _employer_id, _definition, _content_status, _validation_status,
             _is_fixture);

  IF _mode IS NULL THEN
    RAISE EXCEPTION
      'SCP_NO_GOVERNANCE_BASIS: this organisation has no basis to run this '
      'programme. It is not yet operationally validated, and no closed-test '
      'grant covers it. Publication and validation are reviewed steps, and a '
      'pilot needs an explicit, time-bounded grant.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The line that keeps a pilot from becoming a hiring instrument. It now
  -- distinguishes two cases that used to share one refusal:
  --
  --   development -> refused. A development grant says nothing about running
  --                  the assessment in a recruitment journey.
  --   closed_test -> permitted, and routed to closed_test_recruitment below.
  --                  The candidate is recorded as a candidate, which is what
  --                  they are, and the result is stamped closed_test on every
  --                  report — it can never present itself as selection support.
  --
  -- Operational recruitment is untouched: it still requires mode
  -- 'recruitment', which scp_grant_permits_assignment returns only for
  -- published, operationally-validated content, AND an approved
  -- selection_support purpose, which does not exist.
  IF _use_case = 'recruitment' AND _mode NOT IN ('recruitment', 'closed_test') THEN
    RAISE EXCEPTION
      'SCP_NOT_VALID_FOR_RECRUITMENT: this programme may be run as % only. A '
      'recruitment context needs either operationally validated content or an '
      'explicit closed-test grant — a development basis confers neither.', _mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _mode <> 'recruitment' THEN
    SELECT g.id INTO _grant
      FROM public.scp_test_grants g
     WHERE g.employer_id = _employer_id
       AND g.purpose = _mode
       AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at > now())
       AND (g.definition_id IS NULL OR g.definition_id = _definition)
     ORDER BY (g.definition_id IS NOT NULL) DESC, g.granted_at DESC
     LIMIT 1;
  END IF;

  _email := lower(btrim(_recipient_email));
  SELECT id INTO _user FROM auth.users WHERE lower(email) = _email;
  IF _user IS NULL THEN
    RAISE EXCEPTION
      'SCP_RECIPIENT_HAS_NO_ACCOUNT: % has no CQrityjob account yet. An '
      'assessment is attached to a person, not to an address.', _email
      USING ERRCODE = 'check_violation';
  END IF;

  IF _employee_id IS NOT NULL THEN
    IF _use_case <> 'workforce' THEN
      RAISE EXCEPTION 'SCP_PERSON_CONTEXT_MISMATCH: an employee record belongs '
        'to a development assignment, not a recruitment one.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.employees e
                    WHERE e.id = _employee_id AND e.employer_id = _employer_id) THEN
      RAISE EXCEPTION 'SCP_EMPLOYEE_NOT_FOUND: that employee does not belong to '
        'this organisation.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- ── The application this assignment came from ──────────────────────────
  --
  -- Mirror image of the employee rule above: an application is a recruitment
  -- object, so it belongs to a recruitment assignment and nothing else. The
  -- checks are ownership checks, not conveniences — a caller could otherwise
  -- attach one employer's assignment to another employer's application and
  -- make a result appear under a candidate who never sat it.
  IF _application_id IS NOT NULL THEN
    IF _use_case <> 'recruitment' THEN
      RAISE EXCEPTION 'SCP_PERSON_CONTEXT_MISMATCH: a job application belongs '
        'to a recruitment assignment, not a development one.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT a.employer_id, a.job_id, a.applicant_user_id, a.status
      INTO _app_employer, _app_job, _app_user, _app_status
      FROM public.job_applications a WHERE a.id = _application_id;

    IF _app_employer IS NULL THEN
      RAISE EXCEPTION 'SCP_APPLICATION_NOT_FOUND: no such job application.'
        USING ERRCODE = 'no_data_found';
    END IF;
    IF _app_employer <> _employer_id THEN
      RAISE EXCEPTION 'SCP_APPLICATION_NOT_YOURS: that application belongs to '
        'another organisation.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _job_id IS NOT NULL AND _job_id <> _app_job THEN
      RAISE EXCEPTION 'SCP_APPLICATION_JOB_MISMATCH: that application is not '
        'for that job.' USING ERRCODE = 'check_violation';
    END IF;
    -- The applicant and the recipient must be the same human. Without this an
    -- assessment could be attached to somebody else's application, which is the
    -- worst kind of wrong result: plausible, attributed, and about the wrong
    -- person.
    IF _app_user <> _user THEN
      RAISE EXCEPTION 'SCP_APPLICATION_APPLICANT_MISMATCH: that application was '
        'made by a different person than the one being assessed.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- AS-01 (20261225090000): a test is for a candidate still in the process.
    -- An application that has been decided on (rejected, hired) or withdrawn,
    -- or whose recruitment has been completed or cancelled, takes no new
    -- test. The same rule the recruitment workspace applies to every other
    -- candidate action (UNRESOLVED_STATUSES: submitted, reviewing, interview),
    -- enforced here so that hiding a button is never the only guard. What was
    -- already sent stays as it is.
    IF _app_status NOT IN ('submitted', 'reviewing', 'interview') THEN
      RAISE EXCEPTION 'SCP_APPLICATION_NOT_OPEN: the application is % and takes no new assessment.', _app_status
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.recruitment_settings s
                WHERE s.job_id = _app_job AND s.completion_state <> 'open') THEN
      RAISE EXCEPTION 'SCP_RECRUITMENT_COMPLETED: the recruitment is completed or cancelled and takes no new assessment.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Serialise all assignment entry points for this application, after the
    -- caller, tenant and applicant checks. Held until the outer transaction ends.
    PERFORM 1 FROM public.job_applications a
     WHERE a.id = _application_id FOR UPDATE;
    _job_id := _app_job;
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j
        WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_JOB_NOT_YOURS: that job belongs to another '
      'organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES (_subject, _user);
  END IF;

  IF _employee_id IS NOT NULL THEN
    UPDATE public.employees e
       SET subject_id = _subject, updated_at = now()
     WHERE e.id = _employee_id
       AND e.employer_id = _employer_id
       AND e.subject_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.employees e2
                        WHERE e2.employer_id = _employer_id
                          AND e2.subject_id = _subject
                          AND e2.id <> e.id);
  END IF;

  -- Only for a workforce assignment. A recruitment candidate is not staff, and
  -- resolving them onto an employment record would reintroduce, by a side
  -- door, exactly the confusion this migration exists to remove.
  IF _employee_id IS NULL AND _use_case = 'workforce' THEN
    _employee_id := public.scp_resolve_employment_for_assignment(
                      _employer_id, _email, _subject);
  END IF;

  SELECT f.id INTO _form FROM public.scp_forms f
   WHERE f.assessment_version_id = _assessment_version_id
   ORDER BY f.created_at LIMIT 1;

  -- ── The purpose, decided rather than inherited ──────────────────────────
  _purpose_code := public.scp_required_purpose_code(_use_case, _purpose_intent, _mode);

  SELECT pv.id INTO _purpose
    FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE pv.purpose_code = _purpose_code
     AND p.is_active
     AND pv.published_at IS NOT NULL
     AND pv.retired_at IS NULL
   ORDER BY pv.version_number DESC
   LIMIT 1;

  IF _purpose IS NULL THEN
    RAISE EXCEPTION
      'SCP_PURPOSE_NOT_AVAILABLE: no approved processing purpose "%" is '
      'published for this jurisdiction, so this assignment cannot state why it '
      'would process a person. Nothing was assigned.', _purpose_code
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Same application + test DEFINITION, matching the UI's slug rule even if
  -- a newer version was published. Reuse completed work as well as open work;
  -- only an explicitly abandoned attempt permits a new assignment.
  -- All existing permission, governance and purpose gates above still run.
  IF _application_id IS NOT NULL THEN
    SELECT aa.id AS assignment_id, atp.id AS attempt_id, atp.subject_id,
           atp.governance_mode, aa.recipient_user_id, atp.issuer_organization_id
      INTO _existing
        FROM public.assessment_assignments aa
        JOIN public.scp_attempts atp ON atp.assignment_id = aa.id
        JOIN public.scp_assessment_versions av ON av.id = aa.scp_assessment_version_id
       WHERE aa.application_id = _application_id
         AND aa.employer_id = _employer_id
         AND av.definition_id = _definition
         AND atp.status <> 'abandoned'
       ORDER BY atp.started_at, atp.id
       LIMIT 1;
    IF FOUND THEN
      IF _existing.recipient_user_id IS DISTINCT FROM _user
         OR _existing.subject_id IS DISTINCT FROM _subject
         OR _existing.issuer_organization_id IS DISTINCT FROM _employer_id THEN
        RAISE EXCEPTION 'SCP_APPLICATION_ASSIGNMENT_CONTEXT_MISMATCH: existing work does not belong to this applicant and organisation'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN QUERY SELECT _existing.assignment_id, _existing.attempt_id,
                          _existing.subject_id, _existing.governance_mode;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.assessment_assignments
    (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email,
     recipient_user_id, employee_id, application_id, job_id, assigned_by,
     invitation_token_hash, expires_at, status, language)
  VALUES
    (_employer_id, _assessment_version_id, 'academy', _use_case, _email,
     _user, _employee_id, _application_id, _job_id, auth.uid(),
     encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex'),
     COALESCE(_deadline, now() + interval '30 days'), 'invited',
     CASE WHEN _language = 'en' THEN 'en' ELSE 'sv' END)
  RETURNING id INTO _assignment;

  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, assignment_id, mode, form_id,
     assessment_version_id, purpose_version_id, jurisdiction_id,
     scoring_model_version, status,
     governance_mode, validation_status_at_assignment,
     content_status_at_assignment, test_grant_id)
  VALUES
    (_subject, _employer_id, _assignment, 'assessment', _form,
     _assessment_version_id, _purpose,
     (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
     'det-v1', 'in_progress',
     _mode, _validation_status, _content_status, _grant)
  RETURNING id INTO _attempt;

  RETURN QUERY SELECT _assignment, _attempt, _subject, _mode;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scp_invite_participant(_employer_id uuid, _assessment_version_id uuid, _email text, _use_case text DEFAULT 'recruitment'::text, _invited_name text DEFAULT NULL::text, _language text DEFAULT 'sv'::text, _deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, _application_id uuid DEFAULT NULL::uuid, _job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(outcome text, invitation_id uuid, assignment_id uuid, attempt_id uuid, subject_id uuid, governance_mode scp_governance_mode)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _role text; _norm text; _user uuid; _inv uuid;
  _app_employer uuid; _app_job uuid;
  _definition uuid; _cs text; _vs text; _fx boolean; _retired timestamptz;
  _mode public.scp_governance_mode;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: inviting a participant '
      'requires owner or admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _norm := lower(btrim(coalesce(_email, '')));
  IF position('@' in _norm) < 2 THEN
    RAISE EXCEPTION 'SCP_INVALID_RECIPIENT: "%" is not an address an invitation '
      'can be sent to.', _email USING ERRCODE = 'check_violation';
  END IF;

  -- Resolve the account FIRST. When the person already exists the governed
  -- assign path is the right answer and this function simply delegates — one
  -- code path for permission, purpose and lineage, not two.
  SELECT id INTO _user FROM auth.users WHERE lower(email) = _norm;

  IF _user IS NOT NULL THEN
    RETURN QUERY
    SELECT 'assigned'::text, NULL::uuid, r.assignment_id, r.attempt_id,
           r.subject_id, r.governance_mode
      FROM public.scp_employer_assign(
             _employer_id, _assessment_version_id, _norm, _deadline,
             _language, _use_case, NULL, NULL, _application_id, _job_id) r;
    RETURN;
  END IF;

  -- ── No account. Everything below establishes that the invitation would be
  --    legitimate IF it were claimed today, so an employer learns about a
  --    governance problem now rather than after the candidate signs up.
  SELECT av.definition_id, av.content_status, av.validation_status,
         av.retired_at, d.is_test_fixture
    INTO _definition, _cs, _vs, _retired, _fx
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _assessment_version_id;

  IF _definition IS NULL THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_NOT_FOUND: no such assessment version.'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF _retired IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_RETIRED: this programme was retired and can '
      'no longer be assigned.' USING ERRCODE = 'check_violation';
  END IF;

  _mode := public.scp_grant_permits_assignment(_employer_id, _definition, _cs, _vs, _fx);
  IF _mode IS NULL THEN
    RAISE EXCEPTION
      'SCP_NO_GOVERNANCE_BASIS: this organisation has no basis to run this '
      'programme, so it cannot invite anybody to it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _use_case = 'recruitment' AND _mode NOT IN ('recruitment','closed_test') THEN
    RAISE EXCEPTION
      'SCP_NOT_VALID_FOR_RECRUITMENT: this programme may be run as % only.', _mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _application_id IS NOT NULL THEN
    SELECT a.employer_id, a.job_id INTO _app_employer, _app_job
      FROM public.job_applications a WHERE a.id = _application_id;
    IF _app_employer IS NULL THEN
      RAISE EXCEPTION 'SCP_APPLICATION_NOT_FOUND: no such job application.'
        USING ERRCODE = 'no_data_found';
    END IF;
    IF _app_employer <> _employer_id THEN
      RAISE EXCEPTION 'SCP_APPLICATION_NOT_YOURS: that application belongs to '
        'another organisation.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    _job_id := _app_job;
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_JOB_NOT_YOURS: that job belongs to another '
      'organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.scp_assessment_invitations
    (employer_id, assessment_version_id, email, invited_name, use_case,
     application_id, job_id, language, deadline, invited_by,
     expires_at)
  VALUES
    (_employer_id, _assessment_version_id, _norm, nullif(btrim(coalesce(_invited_name,'')),''),
     _use_case, _application_id, _job_id,
     CASE WHEN _language = 'en' THEN 'en' ELSE 'sv' END, _deadline, auth.uid(),
     COALESCE(_deadline, now() + interval '30 days'))
  ON CONFLICT (employer_id, email, assessment_version_id) WHERE status = 'pending'
  DO UPDATE SET invited_name = COALESCE(EXCLUDED.invited_name, public.scp_assessment_invitations.invited_name),
                expires_at = EXCLUDED.expires_at
  RETURNING id INTO _inv;

  RETURN QUERY SELECT 'invited'::text, _inv, NULL::uuid, NULL::uuid, NULL::uuid, _mode;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scp_assign_training(_employer_id uuid, _program_version_id uuid, _recipient_email text, _language text DEFAULT 'sv'::text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _message text DEFAULT NULL::text, _source_decision_id uuid DEFAULT NULL::uuid, _employee_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(assignment_id uuid, subject_id uuid, modules_seeded integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _role text; _email text; _user uuid; _subject uuid;
  _purpose_code text; _purpose uuid; _assignment uuid; _n int;
BEGIN
  -- Assigning is an owner/admin act. Reading the list is not -- the same
  -- boundary 20260821090000 drew for the legacy assignment path.
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: assigning training requires '
      'owner or admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _language NOT IN ('sv','en') THEN
    RAISE EXCEPTION 'SCP_UNSUPPORTED_LANGUAGE: %', _language USING ERRCODE = 'check_violation';
  END IF;

  -- The employment record, checked against the caller's own organisation
  -- before anything is written. Same message and same code as the assessment
  -- path, so one wrong id reads the same way whichever thing is assigned.
  IF _employee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e
                      WHERE e.id = _employee_id AND e.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_EMPLOYEE_NOT_FOUND: that employee does not belong to '
      'this organisation.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Why this organisation may process this person. Shared with the assessment
  -- path so the two cannot answer the legal question differently.
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

  -- One human, one professional identity -- reuse the subject if there is one.
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES (_subject, _user);
  END IF;

  -- Bind the employment relationship to the person the moment we know who they
  -- are, so the assignment is discoverable on the employee's own page with no
  -- manual attachment step and no email-string join later.
  --
  -- Copied from scp_employer_assign, including its conservatism: it ONLY ever
  -- fills a blank. If this employment record already belongs to somebody else,
  -- that is a data problem for a human to resolve -- rebinding would rewrite
  -- whose professional history this is. Nor will it create a second employment
  -- record for one subject inside one organisation.
  IF _employee_id IS NOT NULL THEN
    UPDATE public.employees e
       SET subject_id = _subject, updated_at = now()
     WHERE e.id = _employee_id
       AND e.employer_id = _employer_id
       AND e.subject_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.employees e2
                        WHERE e2.employer_id = _employer_id
                          AND e2.subject_id = _subject
                          AND e2.id <> e.id);
  END IF;

  -- Published / not retired / correct tenant are enforced by
  -- scp_guard_training_target_assignable on this INSERT.
  INSERT INTO public.scp_training_assignments
    (employer_id, program_version_id, subject_id, assigned_by, language,
     purpose_version_id, employer_message, due_at, source_decision_id)
  VALUES
    (_employer_id, _program_version_id, _subject, auth.uid(), _language,
     _purpose, nullif(btrim(coalesce(_message,'')), ''), _due_at, _source_decision_id)
  RETURNING id INTO _assignment;

  -- Seed progress up front so "not started" is a fact with a row behind it and
  -- the participant surface never has to invent a module list.
  INSERT INTO public.scp_training_module_progress (assignment_id, module_version_id)
  SELECT _assignment, mv.id
    FROM public.scp_module_versions mv
   WHERE mv.program_version_id = _program_version_id;
  GET DIAGNOSTICS _n = ROW_COUNT;

  RETURN QUERY SELECT _assignment, _subject, _n;
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_schedule_reassessment(_employer_id uuid, _subject_id uuid, _deadline timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(assignment_id uuid, attempt_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _role text; _prior public.scp_attempts%ROWTYPE; _email text;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: scheduling a reassessment '
      'requires owner or admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT a.* INTO _prior FROM public.scp_attempts a
   WHERE a.subject_id = _subject_id AND a.issuer_organization_id = _employer_id
     AND a.mode = 'assessment' AND a.released_at IS NOT NULL
   ORDER BY a.released_at DESC LIMIT 1;
  IF _prior.id IS NULL THEN
    RAISE EXCEPTION
      'SCP_NO_PRIOR_RESULT: a reassessment needs an earlier released result to '
      'measure against.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT u.email INTO _email FROM public.scp_subject_identities si
    JOIN auth.users u ON u.id = si.user_id WHERE si.subject_id = _subject_id;

  RETURN QUERY
  SELECT r.assignment_id, r.attempt_id
    FROM public.scp_employer_assign(
      _employer_id, _prior.assessment_version_id, _email,
      COALESCE(_deadline, now() + interval '90 days'),
      'sv', 'workforce', NULL, 'reassessment', NULL, NULL) r;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scp_bind_employee_subject(_employee_id uuid, _user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employer uuid; _existing uuid; _subject uuid; _clash uuid;
BEGIN
  SELECT e.employer_id, e.subject_id INTO _employer, _existing
    FROM public.employees e WHERE e.id = _employee_id;
  IF _employer IS NULL THEN
    RAISE EXCEPTION 'SCP_EMPLOYEE_NOT_FOUND: no such employment relationship.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer
                    AND m.status = 'active' AND m.role IN ('owner','admin')) THEN
    RAISE EXCEPTION
      'SCP_NOT_AUTHORISED_TO_BIND: linking a person to an employment record '
      'requires owner or admin in that organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- One human, one professional identity: reuse the subject if there is one.
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user_id;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id)
    VALUES (_subject, _user_id);
  END IF;

  IF _existing IS NOT NULL AND _existing <> _subject THEN
    RAISE EXCEPTION
      'SCP_EMPLOYEE_ALREADY_BOUND: this employment record already belongs to a '
      'different person. Rebinding would rewrite whose history this is.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT e2.id INTO _clash FROM public.employees e2
   WHERE e2.employer_id = _employer AND e2.subject_id = _subject
     AND e2.id <> _employee_id;
  IF _clash IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_DUPLICATE_EMPLOYMENT: this person already has an employment record '
      'in this organisation. Two records for one human is the duplicate '
      'identity this model exists to prevent.'
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.employees SET subject_id = _subject, updated_at = now()
   WHERE id = _employee_id;

  RETURN _subject;
END; $function$
;

CREATE OR REPLACE FUNCTION public.scp_assign_from_application(_employer_id uuid, _application_id uuid, _assessment_version_id uuid, _deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, _language text DEFAULT 'sv'::text)
 RETURNS TABLE(assignment_id uuid, attempt_id uuid, subject_id uuid, governance_mode scp_governance_mode)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _app_employer uuid; _applicant uuid; _email text;
BEGIN
  SELECT a.employer_id, a.applicant_user_id
    INTO _app_employer, _applicant
    FROM public.job_applications a WHERE a.id = _application_id;

  IF _app_employer IS NULL THEN
    RAISE EXCEPTION 'SCP_APPLICATION_NOT_FOUND: no such job application.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Checked here as well, before anything is resolved. scp_employer_assign
  -- checks it again; this one exists so that a caller who is not a member of
  -- the owning organisation cannot use this function to learn an applicant's
  -- address by observing which error comes back.
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.employer_id = _app_employer AND m.user_id = auth.uid()
                    AND m.status = 'active' AND m.role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: assigning requires owner or '
      'admin in the organisation that owns this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _app_employer <> _employer_id THEN
    RAISE EXCEPTION 'SCP_APPLICATION_NOT_YOURS: that application belongs to '
      'another organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT lower(btrim(u.email)) INTO _email
    FROM auth.users u WHERE u.id = _applicant;
  IF _email IS NULL THEN
    RAISE EXCEPTION 'SCP_APPLICANT_HAS_NO_ADDRESS: this application has no '
      'reachable applicant account.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT r.assignment_id, r.attempt_id, r.subject_id, r.governance_mode
    FROM public.scp_employer_assign(
           _employer_id, _assessment_version_id, _email, _deadline, _language,
           'recruitment', NULL, NULL, _application_id, NULL) r;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scp_claim_assessment_invitations()
 RETURNS TABLE(invitation_id uuid, assignment_id uuid, attempt_id uuid, employer_id uuid, outcome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _user uuid; _email text; _confirmed timestamptz; _subject uuid;
  _inv record;
  _definition uuid; _cs text; _vs text; _fx boolean; _retired timestamptz;
  _mode public.scp_governance_mode; _grant uuid; _purpose_code text;
  _purpose uuid; _form uuid; _assignment uuid; _attempt uuid;
BEGIN
  _user := auth.uid();
  IF _user IS NULL THEN RETURN; END IF;

  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO _email, _confirmed
    FROM auth.users u WHERE u.id = _user;

  -- The whole safety of this path. Without a confirmed address, signing up as
  -- somebody else's email would take delivery of their assessment and the job
  -- context attached to it. Returning nothing is correct and silent: the person
  -- has simply not proved the address yet.
  IF _email IS NULL OR _confirmed IS NULL THEN RETURN; END IF;

  -- One professional identity per human, reused if it exists.
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id)
    VALUES (_subject, _user);
  END IF;

  FOR _inv IN
    SELECT * FROM public.scp_assessment_invitations i
     WHERE i.email = _email AND i.status = 'pending'
     ORDER BY i.invited_at
     FOR UPDATE
  LOOP
    IF _inv.expires_at <= now() THEN
      UPDATE public.scp_assessment_invitations
         SET status = 'expired', closed_reason = 'invitation_expired'
       WHERE id = _inv.id;
      RETURN QUERY SELECT _inv.id, NULL::uuid, NULL::uuid, _inv.employer_id, 'expired'::text;
      CONTINUE;
    END IF;

    SELECT av.definition_id, av.content_status, av.validation_status,
           av.retired_at, d.is_test_fixture
      INTO _definition, _cs, _vs, _retired, _fx
      FROM public.scp_assessment_versions av
      JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
     WHERE av.id = _inv.assessment_version_id;

    _mode := CASE WHEN _retired IS NOT NULL THEN NULL
                  ELSE public.scp_grant_permits_assignment(
                         _inv.employer_id, _definition, _cs, _vs, _fx) END;

    -- Re-evaluated, not replayed. A revoked or expired grant closes the
    -- invitation instead of producing an attempt.
    IF _mode IS NULL
       OR (_inv.use_case = 'recruitment' AND _mode NOT IN ('recruitment','closed_test'))
    THEN
      UPDATE public.scp_assessment_invitations
         SET status = 'expired',
             closed_reason = CASE WHEN _retired IS NOT NULL THEN 'programme_retired'
                                  ELSE 'governance_basis_withdrawn' END
       WHERE id = _inv.id;
      RETURN QUERY SELECT _inv.id, NULL::uuid, NULL::uuid, _inv.employer_id, 'expired'::text;
      CONTINUE;
    END IF;

    _purpose_code := public.scp_required_purpose_code(_inv.use_case, NULL, _mode);
    SELECT pv.id INTO _purpose
      FROM public.scp_purpose_versions pv
      JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
     WHERE pv.purpose_code = _purpose_code
       AND p.is_active AND pv.published_at IS NOT NULL AND pv.retired_at IS NULL
     ORDER BY pv.version_number DESC LIMIT 1;

    IF _purpose IS NULL THEN
      UPDATE public.scp_assessment_invitations
         SET status = 'expired', closed_reason = 'purpose_not_available'
       WHERE id = _inv.id;
      RETURN QUERY SELECT _inv.id, NULL::uuid, NULL::uuid, _inv.employer_id, 'expired'::text;
      CONTINUE;
    END IF;

    _grant := NULL;
    IF _mode <> 'recruitment' THEN
      SELECT g.id INTO _grant FROM public.scp_test_grants g
       WHERE g.employer_id = _inv.employer_id AND g.purpose = _mode
         AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR g.expires_at > now())
         AND (g.definition_id IS NULL OR g.definition_id = _definition)
       ORDER BY (g.definition_id IS NOT NULL) DESC, g.granted_at DESC LIMIT 1;
    END IF;

    SELECT f.id INTO _form FROM public.scp_forms f
     WHERE f.assessment_version_id = _inv.assessment_version_id
     ORDER BY f.created_at LIMIT 1;

    INSERT INTO public.assessment_assignments
      (employer_id, scp_assessment_version_id, profile_id, use_case,
       recipient_email, recipient_user_id, application_id, job_id, assigned_by,
       invitation_token_hash, expires_at, status, language)
    VALUES
      (_inv.employer_id, _inv.assessment_version_id, 'academy', _inv.use_case,
       _email, _user, _inv.application_id, _inv.job_id, _inv.invited_by,
       encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex'),
       COALESCE(_inv.deadline, now() + interval '30 days'), 'invited',
       _inv.language)
    RETURNING id INTO _assignment;

    INSERT INTO public.scp_attempts
      (subject_id, issuer_organization_id, assignment_id, mode, form_id,
       assessment_version_id, purpose_version_id, jurisdiction_id,
       scoring_model_version, status, governance_mode,
       validation_status_at_assignment, content_status_at_assignment, test_grant_id)
    VALUES
      (_subject, _inv.employer_id, _assignment, 'assessment', _form,
       _inv.assessment_version_id, _purpose,
       (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
       'det-v1', 'in_progress', _mode, _vs, _cs, _grant)
    RETURNING id INTO _attempt;

    UPDATE public.scp_assessment_invitations
       SET status = 'bound', bound_subject_id = _subject,
           bound_assignment_id = _assignment, bound_at = now()
     WHERE id = _inv.id;

    RETURN QUERY SELECT _inv.id, _assignment, _attempt, _inv.employer_id, 'bound'::text;
  END LOOP;
END;
$function$
;

DO $$
DECLARE _m text;
BEGIN
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_employer_assign(uuid,uuid,text,timestamp with time zone,text,text,uuid,text,uuid,uuid)'::regprocedure));
  IF _m <> '0f4e39961655ab00fc9e1aef10e83842' THEN
    RAISE EXCEPTION 'PENDING_EMPLOYER_ACTIONS_ROLLBACK: scp_employer_assign is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_invite_participant(uuid,uuid,text,text,text,text,timestamp with time zone,uuid,uuid)'::regprocedure));
  IF _m <> '2ef37b017663e6dfe21f96c241c0fd36' THEN
    RAISE EXCEPTION 'PENDING_EMPLOYER_ACTIONS_ROLLBACK: scp_invite_participant is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_assign_training(uuid,uuid,text,text,timestamp with time zone,text,uuid,uuid)'::regprocedure));
  IF _m <> '087c001bcf0d7bf51cd6b4768a1b54d0' THEN
    RAISE EXCEPTION 'PENDING_EMPLOYER_ACTIONS_ROLLBACK: scp_assign_training is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_schedule_reassessment(uuid,uuid,timestamp with time zone)'::regprocedure));
  IF _m <> 'b558af06ddcf04d0cd4706ff1d489753' THEN
    RAISE EXCEPTION 'PENDING_EMPLOYER_ACTIONS_ROLLBACK: scp_schedule_reassessment is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_bind_employee_subject(uuid,uuid)'::regprocedure));
  IF _m <> '8b9e4c466d173fd9c04ccfd5aef367cc' THEN
    RAISE EXCEPTION 'PENDING_EMPLOYER_ACTIONS_ROLLBACK: scp_bind_employee_subject is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_assign_from_application(uuid,uuid,uuid,timestamp with time zone,text)'::regprocedure));
  IF _m <> '4e36f750c25c8c0f0ae31ab3b7ed2651' THEN
    RAISE EXCEPTION 'PENDING_EMPLOYER_ACTIONS_ROLLBACK: scp_assign_from_application is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_claim_assessment_invitations()'::regprocedure));
  IF _m <> 'b1faf569c94277718eab80007d1d5e05' THEN
    RAISE EXCEPTION 'PENDING_EMPLOYER_ACTIONS_ROLLBACK: scp_claim_assessment_invitations is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'PENDING_EMPLOYER_ACTIONS_ROLLBACK ok: hosted pre-fix bodies in place';
END $$;
