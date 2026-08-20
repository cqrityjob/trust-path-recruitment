-- #51 — Assigning from the library must still reach the person's profile.
--
-- Acceptance testing found this: the Testbibliotek assign form collects a
-- participant's email and nothing else, so scp_employer_assign received
-- _employee_id = NULL. The employment record therefore stayed unbound, and the
-- released result never appeared under Medarbetare > Person -- the exact
-- "result attaches to the right person automatically" property the spine was
-- built for. It only worked when the caller happened to pass an employee id.
--
-- The fix resolves the employment record ONCE, at assignment time, to establish
-- the durable subject key. This is not a return to email-as-identity: email is
-- a resolution hint used to fill a blank, never the ongoing join, and never a
-- way to move history from one person to another. Afterwards everything reads
-- through subject_id as before.
--
-- Deliberately conservative. The binding happens only when all of these hold:
--
--   * the assignment named no employment record explicitly;
--   * exactly ONE active employment record in THIS employer carries that email
--     -- two matches is ambiguity, and ambiguity must not be guessed at;
--   * that record is not already bound to somebody;
--   * this person does not already hold another employment record here.
--
-- Any of those failing leaves subject_id NULL, which is the honest outcome: an
-- employer can bind it deliberately through scp_bind_employee_subject.

CREATE OR REPLACE FUNCTION public.scp_resolve_employment_for_assignment(
  _employer_id uuid,
  _email       text,
  _subject_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _employee uuid; _matches int;
BEGIN
  IF _email IS NULL OR _subject_id IS NULL THEN RETURN NULL; END IF;

  -- This person may already have an employment record here, bound earlier.
  SELECT e.id INTO _employee FROM public.employees e
   WHERE e.employer_id = _employer_id AND e.subject_id = _subject_id
   LIMIT 1;
  IF _employee IS NOT NULL THEN RETURN _employee; END IF;

  SELECT count(*) INTO _matches
    FROM public.employees e
   WHERE e.employer_id = _employer_id
     AND lower(btrim(e.email)) = lower(btrim(_email))
     AND e.subject_id IS NULL
     AND coalesce(e.employment_status, 'active') = 'active';

  -- Exactly one, or nothing. Two people sharing an address is not a match.
  IF _matches <> 1 THEN RETURN NULL; END IF;

  SELECT e.id INTO _employee
    FROM public.employees e
   WHERE e.employer_id = _employer_id
     AND lower(btrim(e.email)) = lower(btrim(_email))
     AND e.subject_id IS NULL
     AND coalesce(e.employment_status, 'active') = 'active'
   LIMIT 1;

  UPDATE public.employees SET subject_id = _subject_id, updated_at = now()
   WHERE id = _employee AND subject_id IS NULL;

  RETURN _employee;
END; $function$;

COMMENT ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid) IS
  'Resolves which employment record an assignment belongs to, once, at assignment '
  'time, and binds it to the subject. Email is a resolution hint for filling a '
  'blank -- never the durable join, and never a way to rebind existing history.';

REVOKE ALL     ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid) TO authenticated;

-- Assignment consults it when the caller named no employment record.
CREATE OR REPLACE FUNCTION public.scp_employer_assign(
  _employer_id uuid,
  _assessment_version_id uuid,
  _recipient_email text,
  _deadline timestamptz DEFAULT NULL,
  _language text DEFAULT 'sv',
  _use_case text DEFAULT 'workforce',
  _employee_id uuid DEFAULT NULL,
  _purpose_intent text DEFAULT NULL)
RETURNS TABLE(assignment_id uuid, attempt_id uuid, subject_id uuid,
              governance_mode public.scp_governance_mode)
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

  -- A retired programme is closed to new work regardless of governance. This
  -- is separate from the grant question and stays a hard refusal.
  IF _retired IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_PROGRAMME_RETIRED: this programme was retired and can '
      'no longer be assigned.' USING ERRCODE = 'check_violation';
  END IF;

  -- An empty form is not an assessment. Kept ahead of the governance check so
  -- the employer gets the accurate reason rather than a governance message.
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

  -- The line that keeps a pilot from becoming a hiring instrument. A grant can
  -- never return 'recruitment', so this refuses every closed_test and
  -- development grant used in a recruitment context.
  IF _use_case = 'recruitment' AND _mode <> 'recruitment' THEN
    RAISE EXCEPTION
      'SCP_NOT_VALID_FOR_RECRUITMENT: this programme may be run as % only. '
      'Selection decisions require content that is published and '
      'operationally validated — a test grant cannot confer that.', _mode
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Record WHICH grant carried a granted assignment, so revoking it later
  -- still leaves the historical basis legible.
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

  -- The people model (20260819090000): an employee reference belongs to a
  -- workforce assignment only. Checked here rather than left to the CHECK
  -- constraint so the caller gets a specific, actionable message.
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

  -- One human, one professional identity: reuse the subject if this person
  -- already has one, and only mint a new one for a genuinely new participant.
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = _user;
  IF _subject IS NULL THEN
    INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subject;
    INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES (_subject, _user);
  END IF;

  -- #51. Bind the employment relationship to the person the moment we know who
  -- they are, so the result becomes discoverable under Medarbetare > Person
  -- with no manual attachment step and no email-string join later.
  --
  -- Only ever fills a blank. If this employment record already belongs to
  -- somebody else, that is a data problem for a human to resolve, not something
  -- an assignment should silently overwrite -- rebinding would rewrite whose
  -- professional history this is.
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

  -- #51b. The library assign form collects an email and no employment record,
  -- so without this the result would never reach Medarbetare > Person. Resolve
  -- it once, conservatively, and only to fill a blank.
  IF _employee_id IS NULL THEN
    _employee_id := public.scp_resolve_employment_for_assignment(
                      _employer_id, _email, _subject);
  END IF;

  SELECT f.id INTO _form FROM public.scp_forms f
   WHERE f.assessment_version_id = _assessment_version_id
   ORDER BY f.created_at LIMIT 1;

  -- ── The purpose, decided rather than inherited ──────────────────────────
  _purpose_code := public.scp_required_purpose_code(_use_case, _purpose_intent);

  SELECT pv.id INTO _purpose
    FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE pv.purpose_code = _purpose_code
     AND p.is_active
     AND pv.published_at IS NOT NULL
     AND pv.retired_at IS NULL
   ORDER BY pv.version_number DESC
   LIMIT 1;

  -- Fail closed. The message names the purpose that is missing so an operator
  -- can act, and deliberately carries no lawful-basis or privacy-notice text —
  -- that wording is a Product Owner and legal decision, not an error string.
  IF _purpose IS NULL THEN
    RAISE EXCEPTION
      'SCP_PURPOSE_NOT_AVAILABLE: no approved processing purpose "%" is '
      'published for this jurisdiction, so this assignment cannot state why it '
      'would process a person. Nothing was assigned.', _purpose_code
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.assessment_assignments
    (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email,
     recipient_user_id, employee_id, assigned_by, invitation_token_hash,
     expires_at, status, language)
  VALUES
    (_employer_id, _assessment_version_id, 'academy', _use_case, _email,
     _user, _employee_id, auth.uid(),
     encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex'),
     COALESCE(_deadline, now() + interval '30 days'), 'invited',
     CASE WHEN _language = 'en' THEN 'en' ELSE 'sv' END)
  RETURNING id INTO _assignment;

  -- The governance lineage travels with the attempt, not with the definition.
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
$function$;

REVOKE ALL     ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text) TO authenticated;

DO $$
BEGIN
  IF pg_get_functiondef('public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text)'::regprocedure)
       NOT LIKE '%scp_resolve_employment_for_assignment%' THEN
    RAISE EXCEPTION 'SCP_ASSIGN_NO_RESOLUTION: assigning by email will not reach the person profile';
  END IF;
END $$;
