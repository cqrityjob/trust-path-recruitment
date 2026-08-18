-- Employer Assessment Center — assignment runs under governance.
--
-- 20260818090000 built the closed-test governance model: scp_test_grants,
-- scp_has_test_grant(), scp_grant_permits_assignment(), and four lineage
-- columns on scp_attempts. It did NOT wire the assignment path to any of it.
--
-- scp_employer_assign() still gated on `content_status = 'published'`, so:
--
--   * the real Security Guard programme (sg-operational-baseline, 18 items,
--     content_status 'draft', validation_status 'design') was unassignable by
--     ANY organisation, grant or no grant — the only assignable content in the
--     database was a 4-item and a 2-item test fixture;
--   * scp_grant_permits_assignment() was unreachable from the product, so the
--     governance mode was never decided and the four lineage columns on
--     scp_attempts were never written. Every attempt carried NULL governance.
--
-- This migration connects them. It adds no new policy: the rules were already
-- written and reviewed in 20260818090000, and this makes them load-bearing.
--
-- ── WHAT CHANGES FOR THE EMPLOYER ───────────────────────────────────────
--
--   * A programme is assignable if scp_grant_permits_assignment() returns a
--     mode. Published + operationally validated content needs no grant. Draft
--     or piloting content needs an explicit closed_test grant. Fixtures need a
--     development grant, exactly as before.
--
--   * The returned mode is STAMPED on the attempt. A closed-test attempt
--     records that it was a closed test, on the day, along with the content and
--     validation status it was taken under. A later publication cannot make an
--     old pilot report look validated in hindsight.
--
--   * `recruitment` is never conferred by a grant — that is enforced inside
--     scp_grant_permits_assignment and by a CHECK on scp_test_grants. This
--     function additionally refuses to CREATE a recruitment-context assignment
--     unless the mode actually came back 'recruitment', so a closed-test pilot
--     can never be used as a hiring instrument.
--
-- ── SIGNATURE CHANGE ────────────────────────────────────────────────────
--
-- Two parameters are added, both defaulted, so every existing caller keeps
-- working unchanged:
--
--   _use_case    'workforce' (unchanged default) or 'recruitment'
--   _employee_id links the workforce assignment to the employee record
--
-- The old 5-argument signature is dropped explicitly rather than left as an
-- overload: two functions differing only in defaults make the call ambiguous,
-- and leaving the ungoverned one callable would defeat the whole migration.
--
-- Reversible: restore the previous function body from 20260812090000 and drop
-- the new arguments. No data is altered.

DROP FUNCTION IF EXISTS public.scp_employer_assign(uuid, uuid, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.scp_employer_assign(
  _employer_id           uuid,
  _assessment_version_id uuid,
  _recipient_email       text,
  _deadline              timestamptz DEFAULT NULL,
  _language              text DEFAULT 'sv',
  _use_case              text DEFAULT 'workforce',
  _employee_id           uuid DEFAULT NULL
)
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
  _mode public.scp_governance_mode; _grant uuid;
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

  SELECT pv.id INTO _purpose FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE p.is_active AND pv.published_at IS NOT NULL
   ORDER BY pv.published_at DESC LIMIT 1;
  IF _purpose IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_ACTIVE_PURPOSE: no active, published processing '
      'purpose exists, so nothing may be assigned.' USING ERRCODE = 'check_violation';
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
END; $function$;

COMMENT ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid) IS
  'Assign an assessment under an explicit governance basis. Refuses anything '
  'scp_grant_permits_assignment() will not carry, and refuses a recruitment '
  'context unless the basis is genuinely recruitment — a closed-test grant can '
  'never be used as a hiring instrument. Stamps the mode, the content and '
  'validation status of the day, and the grant id onto the attempt.';

REVOKE ALL ON FUNCTION
  public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.scp_employer_assign(uuid, uuid, text, timestamptz, text, text, uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1b — fixture access is still a development basis
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 20260818090000 said, of scp_fixture_access: "Its rows are mirrored in as
-- development grants so there is one place to ask the question, and the Phase
-- 2m behaviour and its tests continue to hold unaltered."
--
-- The mirror was a ONE-TIME backfill. Rows inserted into scp_fixture_access
-- afterwards never became grants, so once the assignment path started asking
-- scp_grant_permits_assignment() (Section 1 above), granting an organisation
-- fixture access stopped working — the promise held only for organisations
-- that already had it on the day of that migration.
--
-- Rather than add a sync trigger or re-run the backfill, the function now asks
-- BOTH sources for the development case. scp_fixture_access remains the
-- Phase 2m surface, scp_test_grants remains the governance surface, and there
-- is still one function to ask. Nothing else about the rules changes: the
-- closed_test and recruitment branches are untouched.

CREATE OR REPLACE FUNCTION public.scp_grant_permits_assignment(
  _employer_id       uuid,
  _definition_id     uuid,
  _content_status    text,
  _validation_status text,
  _is_test_fixture   boolean
)
RETURNS public.scp_governance_mode
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Published, validated, non-fixture content needs no grant at all. This is
  -- the normal operational path and the only one that reaches recruitment.
  IF _content_status = 'published'
     AND NOT coalesce(_is_test_fixture, false)
     AND _validation_status IN ('operational-development', 'operational-selection') THEN
    RETURN 'recruitment';
  END IF;

  -- A fixture is internal development content, whatever its content_status.
  -- Either surface may carry it: an explicit development grant, or the
  -- Phase 2m fixture-access row that predates grants.
  IF coalesce(_is_test_fixture, false) THEN
    IF public.scp_has_test_grant(_employer_id, 'development', _definition_id)
       OR EXISTS (SELECT 1 FROM public.scp_fixture_access fa
                   WHERE fa.employer_id = _employer_id) THEN
      RETURN 'development';
    END IF;
    RETURN NULL;
  END IF;

  -- Real content that is not yet validated. A closed_test grant admits it, and
  -- what comes back is 'closed_test' -- never 'recruitment'. Everything
  -- downstream stamps that value, so the pilot basis travels with the data.
  IF _content_status IN ('draft', 'approved', 'published')
     AND _validation_status IN ('design', 'pilot')
     AND public.scp_has_test_grant(_employer_id, 'closed_test', _definition_id) THEN
    RETURN 'closed_test';
  END IF;

  -- Published-but-still-piloting content, with no grant, is not assignable.
  RETURN NULL;
END; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — the row-level guard asks the same question
-- ═══════════════════════════════════════════════════════════════════════════
--
-- scp_guard_assignment_targets_published() is the last line of defence on
-- assessment_assignments: it refuses any row pointing at content that is not
-- published, no matter which code path wrote it. It predates closed-test
-- governance and therefore refused pilots too — which is why wiring only the
-- RPC above was not enough.
--
-- It is NOT relaxed here. It is taught the same question the RPC now asks, so
-- there is exactly ONE definition of "may this organisation run this content",
-- enforced in two places:
--
--   * published content: unchanged, allowed, no grant needed
--   * unpublished content: allowed ONLY when a grant covers it AND the
--     assignment is not a recruitment one
--   * retired content: refused, as before, regardless of any grant
--
-- The recruitment condition is checked here as well as in the RPC on purpose.
-- The RPC is the front door; this trigger is what makes the rule true for a
-- direct INSERT, a future code path, or a bug in a caller.

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

  -- Retirement is absolute and is checked first: a grant never reopens
  -- content that has been withdrawn.
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

    IF NEW.use_case = 'recruitment' THEN
      RAISE EXCEPTION
        'SCP_NOT_VALID_FOR_RECRUITMENT: assessment version % may be run as % '
        'only. Selection decisions require published, operationally validated '
        'content.', NEW.scp_assessment_version_id, _mode
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END; $function$;

COMMENT ON FUNCTION public.scp_guard_assignment_targets_published() IS
  'Row-level guard on assessment_assignments. Published content passes as '
  'before; unpublished content passes only when scp_grant_permits_assignment '
  'covers it and the assignment is not for recruitment; retired content never '
  'passes. Same rule as scp_employer_assign, enforced independently of it.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  -- The old ungoverned signature must be gone, not merely shadowed.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_employer_assign';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SCP_ASSIGN_GOVERNANCE: expected exactly one '
      'scp_employer_assign, found % — an ungoverned overload is still callable', _n;
  END IF;

  IF pg_get_functiondef('public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid)'::regprocedure)
       NOT LIKE '%scp_grant_permits_assignment%' THEN
    RAISE EXCEPTION 'SCP_ASSIGN_GOVERNANCE: the assign path does not consult '
      'the governance function';
  END IF;

  IF pg_get_functiondef('public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid)'::regprocedure)
       NOT LIKE '%SCP_NOT_VALID_FOR_RECRUITMENT%' THEN
    RAISE EXCEPTION 'SCP_ASSIGN_GOVERNANCE: the recruitment refusal is missing';
  END IF;

  -- The row-level guard must ask the governance question too, or the RPC is
  -- the only thing standing between a direct INSERT and an ungoverned pilot.
  IF pg_get_functiondef('public.scp_guard_assignment_targets_published()'::regprocedure)
       NOT LIKE '%scp_grant_permits_assignment%' THEN
    RAISE EXCEPTION 'SCP_ASSIGN_GOVERNANCE: the row-level guard does not '
      'consult the governance function';
  END IF;

  IF pg_get_functiondef('public.scp_guard_assignment_targets_published()'::regprocedure)
       NOT LIKE '%SCP_NOT_VALID_FOR_RECRUITMENT%' THEN
    RAISE EXCEPTION 'SCP_ASSIGN_GOVERNANCE: the row-level guard would admit a '
      'granted assignment into a recruitment context';
  END IF;

  -- The trigger must still be attached: replacing the function would be
  -- pointless if the trigger had been dropped along the way.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE NOT tgisinternal
                    AND tgname = 'scp_assignments_target_published_trg') THEN
    RAISE EXCEPTION 'SCP_ASSIGN_GOVERNANCE: the publication guard trigger is gone';
  END IF;
END $$;