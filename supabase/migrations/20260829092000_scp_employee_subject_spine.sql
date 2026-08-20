-- #51 — The employment relationship points at the person, not at their email.
--
-- ── THE PROBLEM ─────────────────────────────────────────────────────────
--
-- `employees` carries first_name, last_name and email, and its only foreign
-- keys are employer_id and created_by. Nothing connects an employment
-- relationship to the professional identity that actually accumulates history.
--
-- Assessment identity already resolves correctly and independently:
-- scp_employer_assign takes a recipient email, looks up auth.users, and finds
-- or creates the scp_subject through scp_subject_identities. Evidence, attempts
-- and reports all hang off that subject. So the person's history is coherent --
-- it simply cannot be reached from the employment record except by comparing
-- an email string that a human typed into an assignment form.
--
-- That makes a person page built on `employees` unreliable by construction: an
-- employee who changes their address, or whose employer typed a work address
-- while their account uses a private one, silently has no history.
--
-- ── THE MODEL ───────────────────────────────────────────────────────────
--
--   employees.subject_id  ->  scp_subjects
--                             scp_subject_identities  ->  auth.users
--
-- The subject is the professional identity and the source of truth. user_id is
-- deliberately NOT duplicated onto employees: it would be a second join key
-- that can disagree with the first, and scp_subject_identities already answers
-- "which accounts are this person".
--
-- subject_id stays NULLABLE, because an employer may add an employee months
-- before that person ever creates a CQrityjob login. Binding happens later,
-- through a governed act, and never by silent email equality between two
-- already-established professional subjects.
--
-- ── DISCLOSURE IS STILL PER EMPLOYER ────────────────────────────────────
--
-- Linking the human must not widen what an employer can see. Subject identity
-- links the person; employer context controls disclosure. The read model added
-- here therefore filters on subject AND issuer_organization_id, so employer A
-- seeing a shared subject learns nothing about employer B's assessments.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.scp_subjects(id);

CREATE INDEX IF NOT EXISTS employees_subject_idx
  ON public.employees (subject_id) WHERE subject_id IS NOT NULL;

-- One employment relationship per person per employer. Two rows for the same
-- human in the same organisation is the duplicate-identity defect this exists
-- to prevent.
CREATE UNIQUE INDEX IF NOT EXISTS employees_employer_subject_uq
  ON public.employees (employer_id, subject_id) WHERE subject_id IS NOT NULL;

COMMENT ON COLUMN public.employees.subject_id IS
  'The professional identity this employment relationship belongs to. NULL until '
  'the person is known to the platform. The subject is the durable person key; '
  'email is contact data, not identity.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Binding an employment relationship to a person
--
-- Conservative on purpose. Email equality alone must not merge two established
-- professional subjects, so this refuses rather than guesses whenever the
-- employment record is already bound to somebody else.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_bind_employee_subject(
  _employee_id uuid,
  _user_id     uuid
)
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
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_bind_employee_subject(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_bind_employee_subject(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- One person's assessment history, as one employer is entitled to see it
--
-- Resolves through subject -- never through an email string -- and then filters
-- by issuer_organization_id, so a shared professional identity does not become
-- a channel between two employers. Returns lifecycle state, not raw responses.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_person_assessments(
  _employer_id uuid,
  _employee_id uuid
)
RETURNS TABLE(
  attempt_id        uuid,
  assessment_slug   text,
  assessment_name_sv text,
  assessment_name_en text,
  purpose_code      text,
  use_case          text,
  governance_mode   public.scp_governance_mode,
  lifecycle_state   text,
  assigned_at       timestamptz,
  started_at        timestamptz,
  submitted_at      timestamptz,
  scored_at         timestamptz,
  released_at       timestamptz,
  reviews_total     integer,
  reviews_open      integer,
  employer_snapshot_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _subject uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  SELECT e.subject_id INTO _subject
    FROM public.employees e
   WHERE e.id = _employee_id AND e.employer_id = _employer_id;

  IF _subject IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT at.id,
         d.slug, d.name_sv, d.name_en,
         pv.purpose_code,
         coalesce(aa.use_case, 'workforce'),
         at.governance_mode,
         -- One vocabulary, derived in one place, so the person page, the Tests
         -- pipeline and the dashboard cannot label the same attempt differently.
         CASE
           WHEN at.released_at IS NOT NULL THEN 'result_available'
           WHEN at.scored_at   IS NOT NULL THEN 'ready_to_release'
           WHEN at.submitted_at IS NOT NULL THEN 'under_review'
           WHEN at.started_at   IS NOT NULL THEN 'in_progress'
           ELSE 'invited'
         END,
         aa.invited_at, at.started_at, at.submitted_at, at.scored_at, at.released_at,
         (SELECT count(*)::int FROM public.scp_human_reviews hr
            JOIN public.scp_candidate_responses r ON r.id = hr.response_id
           WHERE r.attempt_id = at.id),
         (SELECT count(*)::int FROM public.scp_human_reviews hr
            JOIN public.scp_candidate_responses r ON r.id = hr.response_id
           WHERE r.attempt_id = at.id AND hr.review_status = 'pending'),
         (SELECT rs.id FROM public.scp_report_snapshots rs
           WHERE rs.attempt_id = at.id AND rs.audience = 'employer' LIMIT 1)
    FROM public.scp_attempts at
    LEFT JOIN public.assessment_assignments aa ON aa.id = at.assignment_id
    LEFT JOIN public.scp_assessment_versions av ON av.id = at.assessment_version_id
    LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
    LEFT JOIN public.scp_purpose_versions pv ON pv.id = at.purpose_version_id
   WHERE at.subject_id = _subject
     -- Subject links the human; employer context controls disclosure.
     AND at.issuer_organization_id = _employer_id
   ORDER BY coalesce(at.released_at, at.submitted_at, at.started_at, aa.invited_at) DESC NULLS LAST;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_person_assessments(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_person_assessments(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='employees' AND column_name='subject_id') THEN
    RAISE EXCEPTION 'SCP_SPINE_MISSING: employees.subject_id did not install';
  END IF;
  IF pg_get_functiondef('public.scp_employer_person_assessments(uuid,uuid)'::regprocedure)
       NOT LIKE '%issuer_organization_id = _employer_id%' THEN
    RAISE EXCEPTION 'SCP_PERSON_HISTORY_UNSCOPED: person history is not filtered by employer';
  END IF;
  IF has_function_privilege('anon','public.scp_employer_person_assessments(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'SCP_PERSON_HISTORY_ANON: person history is callable by anon';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Assignment binds the relationship to the person
--
-- Body carried forward from 20260820090000. One addition: when an assignment
-- names an employment record, that record is bound to the subject we just
-- resolved. It only ever fills a blank, and never when another employment
-- record in the same organisation already belongs to that person.
--
-- This is what makes the result discoverable under Medarbetare > Person
-- automatically -- the "no manual attachment step" property.
-- ═══════════════════════════════════════════════════════════════════════════

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
       NOT LIKE '%SET subject_id = _subject%' THEN
    RAISE EXCEPTION 'SCP_ASSIGN_NO_BIND: assignment no longer binds the employment record to the person';
  END IF;
END $$;
