-- Created with supabase migration new; only the filename was moved forward
-- to the next canonical slot because this repository's ledger leads the clock.
-- Retry-safe assignment from an application, including direct calls to the
-- shared scp_employer_assign RPC. No data rewrite and no new public endpoint.
DO $pre$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid =
      'public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)'::regprocedure)
      IS DISTINCT FROM '8cb97b6f12fe24df731095b760670a60' THEN
    RAISE EXCEPTION 'SCP_ASSIGN_IDEMPOTENCY_PRECONDITION: unexpected assignment body';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.assessment_assignments aa
    JOIN public.scp_attempts a ON a.assignment_id = aa.id
    JOIN public.scp_assessment_versions av ON av.id = aa.scp_assessment_version_id
    WHERE aa.application_id IS NOT NULL AND a.status <> 'abandoned'
    GROUP BY aa.application_id, av.definition_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SCP_ASSIGN_IDEMPOTENCY_PRECONDITION: duplicate active test attempts require review';
  END IF;
END $pre$;

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
  _app_employer uuid; _app_job uuid; _app_user uuid;
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

    SELECT a.employer_id, a.job_id, a.applicant_user_id
      INTO _app_employer, _app_job, _app_user
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

REVOKE ALL ON FUNCTION public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid) TO authenticated;
