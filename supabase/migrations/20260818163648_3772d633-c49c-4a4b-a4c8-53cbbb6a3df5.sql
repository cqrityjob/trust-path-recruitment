-- An assignment names WHY it is processing a person, and fails closed when it cannot.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- scp_employer_assign chose the processing purpose like this:
--
--   SELECT pv.id INTO _purpose FROM scp_purpose_versions pv
--     JOIN scp_processing_purposes p ON p.code = pv.purpose_code
--    WHERE p.is_active AND pv.published_at IS NOT NULL
--    ORDER BY pv.published_at DESC LIMIT 1;
--
-- It never reads _use_case. It takes whichever active purpose was published
-- most recently, ACROSS ALL PURPOSES. Today exactly one purpose version exists
-- (competence_development), so the wrong answer is currently invisible; the
-- moment a second purpose is published, every assignment silently inherits it.
-- A recruitment assignment would have been stamped "competence development",
-- and later a development assignment would be stamped "selection support" —
-- in both directions the record says something the employer never chose.
--
-- Under GDPR the purpose is not a label added afterwards. It is the thing that
-- makes the processing lawful at all, and it must be decided before the data
-- is collected, not inherited from whatever migration ran last.
--
-- Three related faults are fixed with it:
--
--   * The old query never excluded RETIRED versions, so a withdrawn purpose
--     could be selected.
--   * scp_schedule_reassessment calls scp_employer_assign with four arguments,
--     so _use_case took its default 'workforce'. The `reassessment` purpose
--     was therefore never recorded on any attempt, and a reassessment was
--     indistinguishable from a first development assessment in its lineage.
--   * scp_guard_governance_lineage_immutable protected governance_mode and
--     validation_status_at_assignment but NOT purpose_version_id, so the
--     purpose could be rewritten on a live attempt after the participant had
--     already answered under it.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ────────────────────────
--
-- It does not activate or publish `selection_support` or `reassessment`.
-- Publishing a purpose version means asserting a lawful basis, a privacy
-- notice version, a controller/processor allocation and a retention position.
-- Those are Product Owner and legal decisions, not something a migration may
-- invent, and writing plausible-looking legal text here would be worse than
-- leaving the path closed.
--
-- So recruitment and reassessment now fail CLOSED with a stable, product-safe
-- refusal until an approved purpose version exists. That is the intended
-- behaviour, not a gap: a path that cannot name its lawful basis must not run.
--
-- ── WHY "newest version OF THE REQUIRED CODE" IS NOT THE OLD BUG ────────
--
-- The old query ranked across every purpose code and took one. The new query
-- resolves the required code FIRST, then selects the current version of that
-- code alone. Choosing the newest published, non-retired version of one purpose
-- is versioning; choosing the newest purpose of any kind was a fallback. There
-- is no fallback here: if the required code has no approved version, nothing is
-- assigned.
--
-- Forward-only. Remediation: restore the three function bodies from
-- 20260819100000 (assign), 20260819100000 (reassessment) and 20260818090000
-- (guard). No data is written or altered by this migration.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The mapping, in one place
-- ═══════════════════════════════════════════════════════════════════════════
--
-- use_case is the PERSON CONTEXT (is this a candidate or an employee) and is
-- constrained by assessment_assignments.use_case to 'recruitment'|'workforce'.
-- A reassessment is not a third person context — it is still an employee — so
-- it travels as an explicit purpose INTENT rather than by widening use_case.
-- Conflating the two would have made "reassessment" a kind of person.

CREATE OR REPLACE FUNCTION public.scp_required_purpose_code(
  _use_case text,
  _purpose_intent text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF _purpose_intent IS NOT NULL THEN
    IF _purpose_intent = 'reassessment' THEN
      RETURN 'reassessment';
    END IF;
    RAISE EXCEPTION
      'SCP_UNKNOWN_PURPOSE_MAPPING: "%" is not a purpose this product knows how '
      'to justify.', _purpose_intent USING ERRCODE = 'check_violation';
  END IF;

  IF _use_case = 'workforce'   THEN RETURN 'competence_development'; END IF;
  IF _use_case = 'recruitment' THEN RETURN 'selection_support';      END IF;

  RAISE EXCEPTION
    'SCP_UNKNOWN_PURPOSE_MAPPING: "%" is not a purpose this product knows how '
    'to justify.', _use_case USING ERRCODE = 'check_violation';
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_required_purpose_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_required_purpose_code(text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Assignment resolves its own purpose, or refuses
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid);

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

REVOKE ALL ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A reassessment says so
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- Reassessment is only meaningful against a prior COMPLETED attempt this
  -- employer commissioned. That constraint is also what keeps this from
  -- becoming a way to assign to an arbitrary subject.
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

  -- The person context is unchanged — this is still an employee — but the
  -- PURPOSE is not. Passing the intent explicitly is what stopped a
  -- reassessment being recorded as a first development assessment.
  RETURN QUERY
  SELECT r.assignment_id, r.attempt_id
    FROM public.scp_employer_assign(
      _employer_id, _prior.assessment_version_id, _email,
      COALESCE(_deadline, now() + interval '90 days'),
      'sv', 'workforce', NULL, 'reassessment') r;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The purpose is frozen once the attempt exists
-- ═══════════════════════════════════════════════════════════════════════════
--
-- test_grant_id is deliberately NOT guarded: its FK is ON DELETE SET NULL, so
-- guarding it would turn a legitimate grant deletion into a constraint error.
-- purpose_version_id is ON DELETE RESTRICT, so it can never be nulled behind
-- the guard's back.

CREATE OR REPLACE FUNCTION public.scp_guard_governance_lineage_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.governance_mode IS NOT NULL
     AND NEW.governance_mode IS DISTINCT FROM OLD.governance_mode THEN
    RAISE EXCEPTION
      'SCP_GOVERNANCE_LINEAGE_IMMUTABLE: an attempt''s governance basis cannot '
      'be rewritten (% -> %).', OLD.governance_mode, NEW.governance_mode
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.validation_status_at_assignment IS NOT NULL
     AND NEW.validation_status_at_assignment IS DISTINCT FROM OLD.validation_status_at_assignment THEN
    RAISE EXCEPTION
      'SCP_GOVERNANCE_LINEAGE_IMMUTABLE: the validation status recorded at '
      'assignment cannot be rewritten.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Added: the participant answered under one stated purpose. Changing it
  -- afterwards would relabel processing that has already happened.
  IF OLD.purpose_version_id IS NOT NULL
     AND NEW.purpose_version_id IS DISTINCT FROM OLD.purpose_version_id THEN
    RAISE EXCEPTION
      'SCP_GOVERNANCE_LINEAGE_IMMUTABLE: the processing purpose recorded at '
      'assignment cannot be rewritten.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.content_status_at_assignment IS NOT NULL
     AND NEW.content_status_at_assignment IS DISTINCT FROM OLD.content_status_at_assignment THEN
    RAISE EXCEPTION
      'SCP_GOVERNANCE_LINEAGE_IMMUTABLE: the content status recorded at '
      'assignment cannot be rewritten.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Prove the seeded state, not a fixture-built one
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _code text;
BEGIN
  -- The mapping is total over the supported use cases.
  IF public.scp_required_purpose_code('workforce') <> 'competence_development' THEN
    RAISE EXCEPTION 'SCP_PURPOSE_MAPPING_BROKEN: workforce must map to competence_development.';
  END IF;
  IF public.scp_required_purpose_code('recruitment') <> 'selection_support' THEN
    RAISE EXCEPTION 'SCP_PURPOSE_MAPPING_BROKEN: recruitment must map to selection_support.';
  END IF;
  IF public.scp_required_purpose_code('workforce', 'reassessment') <> 'reassessment' THEN
    RAISE EXCEPTION 'SCP_PURPOSE_MAPPING_BROKEN: the reassessment intent must map to reassessment.';
  END IF;

  -- An unmapped context refuses rather than guessing.
  BEGIN
    _code := public.scp_required_purpose_code('something_else');
    RAISE EXCEPTION 'SCP_PURPOSE_MAPPING_BROKEN: an unknown use case must not resolve.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- The development purpose this pilot actually relies on is present.
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_purpose_versions pv
      JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
     WHERE pv.purpose_code = 'competence_development'
       AND p.is_active AND pv.published_at IS NOT NULL AND pv.retired_at IS NULL)
  THEN
    RAISE EXCEPTION 'SCP_PURPOSE_MISSING: competence_development has no approved version.';
  END IF;

  RAISE NOTICE 'purpose governance: mapping total, development purpose present, '
               'recruitment and reassessment intentionally closed';
END $$;