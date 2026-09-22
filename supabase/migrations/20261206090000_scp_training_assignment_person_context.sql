-- Assigning a development programme keeps the person it was about.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- An employer standing on an employee's page and choosing "assign a
-- development programme" left the person behind at the door. The only
-- assignment entry point, `scp_assign_training`, takes a recipient ADDRESS and
-- nothing else, so the employment record it was started from is not part of
-- the act. Two consequences, and the second is the serious one:
--
--   * The employer re-finds the person by typing their address into a form
--     they have just navigated away from.
--   * The resulting assignment is attached to a SUBJECT, and an employment
--     record that is not yet bound to that subject cannot show it. Three of
--     five employment records in production carry no subject at all, so for
--     most employees the assignment they just made is invisible on the page
--     they made it from -- with no error, because nothing failed.
--
-- The assessment path solved exactly this in 20260829092000:
-- `scp_employer_assign` takes `_employee_id`, verifies it belongs to the
-- caller's organisation, and binds the employment record to the subject the
-- moment it learns who the person is. Training was simply never given the same
-- parameter. This migration gives it one, with the same rules, the same
-- refusals and the same conservatism.
--
-- ── WHY DROP AND RE-CREATE ──────────────────────────────────────────────
--
-- PostgreSQL cannot add a parameter with CREATE OR REPLACE. Creating an
-- 8-argument overload beside the 7-argument function would leave two
-- `scp_assign_training`s resolvable by named arguments, which is precisely the
-- ambiguity this repository has already been bitten by elsewhere. So the old
-- signature goes and the new one takes its place; `_employee_id` is last and
-- defaulted, so every existing call -- positional or named -- keeps working
-- and keeps meaning what it meant.
--
-- ── WHAT DOES NOT CHANGE ────────────────────────────────────────────────
--
-- The owner/admin gate, the purpose resolution, the version pinning, the
-- assignable-target guard, the module seeding and every error code are copied
-- through unaltered. `_employee_id` adds two things and nothing else: a
-- tenancy check on the employment record, and a bind that only ever fills a
-- blank.
--
-- It does NOT make training evidence of competence. Nothing here touches
-- scp_competency_evidence, maturity or any validation status: a completed
-- programme remains a completed programme.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Replace the entry point
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.scp_assign_training(uuid, uuid, text, text, timestamptz, text, uuid);

CREATE OR REPLACE FUNCTION public.scp_assign_training(
  _employer_id        uuid,
  _program_version_id uuid,
  _recipient_email    text,
  _language           text DEFAULT 'sv',
  _due_at             timestamptz DEFAULT NULL,
  _message            text DEFAULT NULL,
  _source_decision_id uuid DEFAULT NULL,
  -- NEW. The employment record this development activity is about, when it is
  -- about one. NULL keeps the previous behaviour exactly: an assignment to a
  -- person the organisation knows only by address.
  _employee_id        uuid DEFAULT NULL)
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
END; $function$;

COMMENT ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid,uuid) IS
  'Assign one governed programme VERSION to one person. Owner/admin only, '
  'purpose-bearing, version-pinned, and refused for draft, retired or '
  'cross-tenant content by scp_guard_training_target_assignable. _employee_id '
  'names the employment record the development activity is about: it is '
  'checked against the caller''s organisation and bound to the resolved '
  'subject only when that record carries none, never rebound.';

-- A function created here would be EXECUTE-able by anon under the hosted
-- default privileges, whatever the previous signature's grants were. Stated,
-- not assumed.
REVOKE ALL     ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid,uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Prove it at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_assign_training';
  IF _n <> 1 THEN
    RAISE EXCEPTION
      'SCP_ASSIGN_TRAINING_OVERLOADED: % definitions exist; a named-argument '
      'call would be ambiguous.', _n;
  END IF;

  IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'scp_assign_training'
           AND pg_get_function_arguments(p.oid) LIKE '%_employee_id uuid DEFAULT NULL%') THEN
    RAISE EXCEPTION
      'SCP_ASSIGN_TRAINING_SIGNATURE: _employee_id is absent or not defaulted, '
      'so existing callers would break.';
  END IF;

  IF has_function_privilege('anon',
       'public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'SCP_ASSIGN_TRAINING_ANON: anon can execute the assignment writer.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'SCP_ASSIGN_TRAINING_GRANT: authenticated lost EXECUTE on the assignment writer.';
  END IF;

  RAISE NOTICE 'SCP_ASSIGN_TRAINING: one definition, _employee_id defaulted, anon revoked.';
END $$;
