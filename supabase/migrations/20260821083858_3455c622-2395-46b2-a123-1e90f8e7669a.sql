-- A recruitment candidate stops having to be recorded as an employee.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- Running the flagship recruitment assessment end to end required
-- _use_case = 'workforce', because scp_employer_assign refuses a recruitment
-- context unless the governance mode is genuinely 'recruitment' — and it never
-- is for draft content. The consequence reached the report: person_context
-- resolved to 'employee' and the purpose to competence_development, so a
-- candidate applying for a job was recorded as somebody's staff being
-- developed. Nothing false was written to `employees` — no employment row is
-- ever created by an assignment — but the ASSIGNMENT said something untrue
-- about why a person was being processed, and under GDPR the purpose is not a
-- label added afterwards.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────
--
-- It does not publish selection_support. It does not weaken
-- scp_grant_permits_assignment. It does not mark draft content operational. It
-- does not create an employment relationship. Every one of those was
-- explicitly ruled out, and each remains exactly as it was — asserted at the
-- bottom of this file rather than promised in a comment.
--
-- ── WHAT IT ADDS ────────────────────────────────────────────────────────
--
-- One processing purpose, `closed_test_recruitment`, meaning precisely:
--
--     Recruitment-context product testing under an explicit, time-bounded
--     closed-test grant. NOT valid for an operational selection decision.
--
-- It is a real purpose with a real lawful basis, because the processing is
-- real: a named organisation asks a named candidate to sit an assessment so
-- the organisation can evaluate the product in the journey it was designed
-- for. Calling that "competence development" was the untruth. Calling it
-- "selection support" would be a bigger one, because selection support is the
-- basis for actually deciding about somebody and this content has not earned
-- it.
--
-- ── THE GUARD, MADE MORE PRECISE RATHER THAN WEAKER ─────────────────────
--
-- Before:  use_case = 'recruitment' requires mode = 'recruitment'.
-- After:   use_case = 'recruitment' requires mode IN ('recruitment','closed_test'),
--          and the two branches land on DIFFERENT purposes:
--
--     mode = 'recruitment'   -> selection_support        (unpublished; still refuses)
--     mode = 'closed_test'   -> closed_test_recruitment  (published; permitted)
--     mode = 'development'   -> refused, as before
--
-- Operational selection is therefore exactly as closed as it was yesterday: it
-- still needs published, operationally-validated content AND an approved
-- selection_support purpose, and neither exists. What opened is the honest
-- middle case that previously had nowhere to go.
--
-- Two new refusals make sure the middle case cannot drift into the top one:
--
--   * a closed_test_recruitment purpose may never be stamped on an attempt
--     whose governance mode is 'recruitment' — enforced by trigger, so no
--     future caller can produce the combination;
--   * scp_required_purpose_code refuses to answer for a recruitment use case
--     without being told which mode is asking, so a caller cannot obtain the
--     permissive purpose by omission.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- Additive. One purpose row, one purpose version, one 3-argument overload, one
-- trigger, and scp_employer_assign replaced with the same body plus the
-- branch. The 2-argument scp_required_purpose_code keeps its exact signature
-- and behaviour so existing callers and the purpose-governance suite are
-- unaffected.
--
-- Remediation: restore scp_employer_assign from 20260829097000, drop the
-- overload and the trigger, retire the purpose version. No data is rewritten.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The purpose
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_processing_purposes (code, name_sv, name_en, is_active)
VALUES ('closed_test_recruitment',
        'Rekryteringstest (sluten testning)',
        'Recruitment-context product testing (closed test)',
        true)
ON CONFLICT (code) DO UPDATE
  SET name_sv = EXCLUDED.name_sv,
      name_en = EXCLUDED.name_en,
      is_active = true;

COMMENT ON TABLE public.scp_processing_purposes IS
  'Why a person is being processed. closed_test_recruitment is deliberately '
  'distinct from selection_support: it covers evaluating the product inside a '
  'recruitment journey under an explicit closed-test grant, and confers no '
  'basis for an operational selection decision. selection_support remains '
  'unpublished and is the only purpose that would.';

-- The lawful basis is written out because somebody has to be able to read it
-- and disagree. Legitimate interest, balanced by three things that are true of
-- a closed test and not of operational selection: the organisation holds an
-- explicit time-bounded grant, the result is stamped as coming from
-- unvalidated content on every report, and no decision may rest on it.
INSERT INTO public.scp_purpose_versions
  (purpose_code, version_number, privacy_notice_version, lawful_basis_reference,
   jurisdiction_id, published_at)
SELECT 'closed_test_recruitment', 1,
       'pn-2026-08-closed-test-recruitment-v1',
       'GDPR Art.6(1)(f) — legitimate interest in evaluating a recruitment '
       'assessment inside its intended journey, under a time-bounded closed-test '
       'grant. Explicitly NOT a basis for an operational selection decision: '
       'the result is marked as closed-test on every report and may not, on its '
       'own, inform an employment decision.',
       j.id, now()
  FROM public.scp_jurisdictions j WHERE j.code = 'SE'
ON CONFLICT (purpose_code, version_number, jurisdiction_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The mapping learns about governance mode
--
-- The 2-argument form is untouched and still answers 'selection_support' for a
-- recruitment use case: that is the OPERATIONAL answer and it stays the
-- default, so anything that has not been taught about closed testing keeps
-- asking for the purpose that is correctly unavailable.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_required_purpose_code(
  _use_case text,
  _purpose_intent text,
  _governance_mode public.scp_governance_mode)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Intent wins, and only reassessment is a known one. Unchanged.
  IF _purpose_intent IS NOT NULL THEN
    IF _purpose_intent = 'reassessment' THEN
      RETURN 'reassessment';
    END IF;
    RAISE EXCEPTION
      'SCP_UNKNOWN_PURPOSE_MAPPING: "%" is not a purpose this product knows how '
      'to justify.', _purpose_intent USING ERRCODE = 'check_violation';
  END IF;

  IF _use_case = 'workforce' THEN RETURN 'competence_development'; END IF;

  IF _use_case = 'recruitment' THEN
    -- Answering without being told which mode is asking would hand back the
    -- permissive purpose to a caller that never established it was in a closed
    -- test. Refuse instead.
    IF _governance_mode IS NULL THEN
      RAISE EXCEPTION
        'SCP_PURPOSE_NEEDS_GOVERNANCE_MODE: a recruitment assignment cannot '
        'name its processing purpose without stating the governance basis it '
        'runs under.' USING ERRCODE = 'check_violation';
    END IF;
    IF _governance_mode = 'closed_test' THEN RETURN 'closed_test_recruitment'; END IF;
    RETURN 'selection_support';
  END IF;

  RAISE EXCEPTION
    'SCP_UNKNOWN_PURPOSE_MAPPING: "%" is not a purpose this product knows how '
    'to justify.', _use_case USING ERRCODE = 'check_violation';
END;
$function$;

COMMENT ON FUNCTION public.scp_required_purpose_code(text, text, public.scp_governance_mode) IS
  'Which processing purpose an assignment must name. A recruitment use case '
  'answers closed_test_recruitment ONLY when the governance mode is genuinely '
  'closed_test, and selection_support otherwise — which remains unpublished, so '
  'operational selection still fails closed. Refuses to answer for a '
  'recruitment use case when no mode is supplied.';

REVOKE ALL ON FUNCTION public.scp_required_purpose_code(text, text, public.scp_governance_mode) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_required_purpose_code(text, text, public.scp_governance_mode) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The combination that must never exist
--
-- A trigger rather than a CHECK, because the honest statement spans two
-- columns and one of them is a lookup. If a future caller ever stamps
-- closed_test_recruitment on an attempt claiming operational recruitment
-- governance, that attempt would be a closed test wearing an operational
-- report's clothes. It aborts instead.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_guard_closed_test_purpose_agrees()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _code text;
BEGIN
  IF NEW.purpose_version_id IS NULL THEN RETURN NEW; END IF;

  SELECT pv.purpose_code INTO _code
    FROM public.scp_purpose_versions pv WHERE pv.id = NEW.purpose_version_id;

  IF _code = 'closed_test_recruitment' AND NEW.governance_mode <> 'closed_test' THEN
    RAISE EXCEPTION
      'SCP_CLOSED_TEST_PURPOSE_MISMATCH: the closed-test recruitment purpose '
      'may only be recorded on an attempt running as a closed test. This one '
      'claims "%". A closed test must never be able to present itself as '
      'operational selection.', NEW.governance_mode
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_attempts_closed_test_purpose_agrees ON public.scp_attempts;
CREATE TRIGGER scp_attempts_closed_test_purpose_agrees
  BEFORE INSERT OR UPDATE ON public.scp_attempts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_closed_test_purpose_agrees();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Assignment, with the branch and with recruitment context
--
-- Body from 20260829097000. Three substantive changes and nothing else:
--
--   1. The recruitment refusal admits closed_test, and says something
--      different for each remaining case rather than one message for both.
--   2. The purpose is resolved through the 3-argument mapping, so the mode
--      that was actually established decides which purpose is asked for.
--   3. _job_id and _application_id are accepted, verified against THIS
--      employer, and recorded — so a result stays attached to the application
--      it came from instead of being findable only by the participant's email.
--
-- Every authorisation check, every other refusal and the whole employment
-- resolution path are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.scp_employer_assign(
  _employer_id uuid,
  _assessment_version_id uuid,
  _recipient_email text,
  _deadline timestamptz DEFAULT NULL,
  _language text DEFAULT 'sv',
  _use_case text DEFAULT 'workforce',
  _employee_id uuid DEFAULT NULL,
  _purpose_intent text DEFAULT NULL,
  _application_id uuid DEFAULT NULL,
  _job_id uuid DEFAULT NULL)
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
  _app_employer uuid; _app_job uuid; _app_user uuid;
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
$function$;

COMMENT ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text, uuid, uuid) IS
  'The only governed way to start an attempt. Refuses content no grant covers, '
  'refuses a recruitment context on a development basis, and resolves its own '
  'processing purpose from the governance mode that was actually established — '
  'closed_test_recruitment for a closed test, selection_support for operational '
  'selection, which remains unpublished and therefore still fails closed. A '
  'recruitment assignment never resolves an employment record.';

REVOKE ALL     ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text, uuid, uuid) TO authenticated;

-- scp_schedule_reassessment calls the eight-argument signature the DROP above
-- removed, so it has to be repointed. Body copied verbatim from 20260820090000
-- — same signature, same authorisation check, same prior-result rule, same
-- workforce person context — with only the two new trailing NULLs added to the
-- delegated call. A reassessment is exactly what it was.
CREATE OR REPLACE FUNCTION public.scp_schedule_reassessment(
  _employer_id uuid, _subject_id uuid, _deadline timestamptz DEFAULT NULL)
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
$function$;

REVOKE ALL     ON FUNCTION public.scp_schedule_reassessment(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_schedule_reassessment(uuid, uuid, timestamptz) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The row-level guard learns the same distinction
--
-- 20260819100000 put the recruitment rule in TWO places on purpose: the RPC is
-- the front door, and this trigger is what makes the rule true for a direct
-- INSERT, a future code path, or a bug in a caller. Two places is only a
-- strength while they agree, so the trigger gets the same, more precise rule
-- rather than the RPC quietly diverging from it.
--
-- Body from 20260819100000. One condition changes: unpublished content may
-- carry a recruitment assignment when — and only when — the grant that permits
-- it is a closed test. A development basis is still refused, and published
-- content is still untouched by this branch entirely.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_guard_assignment_targets_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _status text; _retired timestamptz; _validation text;
  _definition uuid; _is_fixture boolean; _mode public.scp_governance_mode;
BEGIN
  IF NEW.scp_assessment_version_id IS NULL THEN RETURN NEW; END IF;

  SELECT av.content_status, av.retired_at, av.validation_status,
         av.definition_id, d.is_test_fixture
    INTO _status, _retired, _validation, _definition, _is_fixture
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = NEW.scp_assessment_version_id;

  IF _retired IS NOT NULL AND _retired <= now() THEN
    RAISE EXCEPTION
      'SCP_ASSIGNMENT_RETIRED: assessment version % was retired at % and can no '
      'longer receive new assignments.', NEW.scp_assessment_version_id, _retired
      USING ERRCODE = 'check_violation';
  END IF;

  IF _status IS DISTINCT FROM 'published' THEN
    _mode := public.scp_grant_permits_assignment(
               NEW.employer_id, _definition, _status, _validation, _is_fixture);

    IF _mode IS NULL THEN
      RAISE EXCEPTION
        'SCP_ASSIGNMENT_NOT_PUBLISHED: assessment version % is "%" and this '
        'organisation holds no grant covering it. Publication is a reviewed, '
        'owner-approved step, and a pilot needs an explicit grant.',
        NEW.scp_assessment_version_id, coalesce(_status, 'missing')
        USING ERRCODE = 'check_violation';
    END IF;

    -- A closed test may run in a recruitment context; a development grant may
    -- not. Selection decisions still require published, operationally
    -- validated content — which this branch, by definition, is not.
    IF NEW.use_case = 'recruitment' AND _mode <> 'closed_test' THEN
      RAISE EXCEPTION
        'SCP_NOT_VALID_FOR_RECRUITMENT: assessment version % may be run as % '
        'only. A recruitment context needs either operationally validated '
        'content or an explicit closed-test grant.',
        NEW.scp_assessment_version_id, _mode
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.scp_guard_assignment_targets_published() IS
  'Row-level guard on assessment_assignments. Published content passes as '
  'before; unpublished content passes only when scp_grant_permits_assignment '
  'covers it, and carries a recruitment context only under a closed-test grant; '
  'retired content never passes. Same rule as scp_employer_assign, enforced '
  'independently of it.';