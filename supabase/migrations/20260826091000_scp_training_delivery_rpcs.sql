-- #47 — The training delivery journey, server-side.
--
-- Seven functions. Every one is SECURITY DEFINER with a pinned search_path and
-- re-verifies its own authorisation, because the employer id and the assignment
-- id both arrive from a route and are claims, not facts. No client write
-- policy exists on either training table; these are the only doors.
--
-- ── WHAT IS REUSED RATHER THAN REBUILT ──────────────────────────────────
--
-- There is no second question engine here. A module names a learning-mode form
-- and delivery runs entirely on the existing spine: scp_start_learning_attempt's
-- resume-or-create pattern, scp_get_attempt_items (which already returns the
-- participant's saved answers, so resume is free), scp_save_response and
-- scp_get_learning_feedback. The Learning/Assessment firewall triggers are
-- untouched and still forbid learning feedback on an assessment item.
--
-- ── THE PURPOSE ─────────────────────────────────────────────────────────
--
-- Locked decision: the closed-test development journey processes people under
-- `competence_development`, resolved through scp_required_purpose_code('workforce')
-- so training and assessment cannot drift apart on the one question that has a
-- legal answer. training_follow_up and compliance_support stay inactive and are
-- never selected here; assignment fails closed if no approved purpose version
-- exists, rather than substituting a different one.
--
-- ── ADDITIVE-ONLY ───────────────────────────────────────────────────────
--
-- Seven new functions. No existing function is dropped or altered:
-- scp_complete_learning_module, scp_my_academy_assignments and the whole
-- assessment path keep working exactly as they do today.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Assign
-- ═══════════════════════════════════════════════════════════════════════════

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

COMMENT ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid) IS
  'Assign one governed programme VERSION to one person. Owner/admin only, '
  'purpose-bearing, version-pinned, and refused for draft, retired or '
  'cross-tenant content by scp_guard_training_target_assignable.';

REVOKE ALL     ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The combined Academy read model (D5)
--
-- UNION ALL, not an extension of scp_my_academy_assignments. That function
-- selects FROM scp_attempts and joins assessment_assignments for its title, so
-- a training assignment could only appear there by minting a phantom attempt --
-- an attempt that answers nothing, for a module that may have no knowledge
-- check at all. The discriminator is explicit instead.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_my_academy_work()
RETURNS TABLE(
  work_kind      text,
  work_id        uuid,
  title_sv       text,
  title_en       text,
  employer_name  text,
  status         text,
  progress_done  integer,
  progress_total integer,
  assigned_at    timestamptz,
  deadline       timestamptz,
  released_at    timestamptz,
  purpose_sv     text,
  purpose_en     text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Assessment work: one attempt each.
  RETURN QUERY
  SELECT
    'assessment'::text, a.id, d.name_sv, d.name_en, e.name, a.status,
    COALESCE((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = a.id), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = a.form_id), 0),
    a.started_at, asg.expires_at, a.released_at, p.notice_sv, p.notice_en
  FROM public.scp_attempts a
  JOIN public.scp_subject_identities si
    ON si.subject_id = a.subject_id AND si.user_id = auth.uid()
  LEFT JOIN public.assessment_assignments asg ON asg.id = a.assignment_id
  LEFT JOIN public.employers e ON e.id = a.issuer_organization_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = a.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  LEFT JOIN LATERAL (
    SELECT pp.name_sv AS notice_sv, pp.name_en AS notice_en
      FROM public.scp_purpose_versions pvv
      JOIN public.scp_processing_purposes pp ON pp.code = pvv.purpose_code
     WHERE pvv.id = a.purpose_version_id) p ON true
  WHERE a.mode = 'assessment';

  -- Training work: one assignment each, progress counted in modules.
  RETURN QUERY
  SELECT
    'training'::text, ta.id, pv.name_sv, pv.name_en, e.name, ta.status,
    COALESCE((SELECT count(*)::int FROM public.scp_training_module_progress mp
               WHERE mp.assignment_id = ta.id AND mp.status = 'completed'), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_training_module_progress mp
               WHERE mp.assignment_id = ta.id), 0),
    ta.assigned_at, ta.due_at, NULL::timestamptz, p.notice_sv, p.notice_en
  FROM public.scp_training_assignments ta
  JOIN public.scp_subject_identities si
    ON si.subject_id = ta.subject_id AND si.user_id = auth.uid()
  JOIN public.scp_program_versions pv ON pv.id = ta.program_version_id
  LEFT JOIN public.employers e ON e.id = ta.employer_id
  LEFT JOIN LATERAL (
    SELECT pp.name_sv AS notice_sv, pp.name_en AS notice_en
      FROM public.scp_purpose_versions pvv
      JOIN public.scp_processing_purposes pp ON pp.code = pvv.purpose_code
     WHERE pvv.id = ta.purpose_version_id) p ON true
  WHERE ta.status <> 'cancelled';
END; $function$;

COMMENT ON FUNCTION public.scp_my_academy_work() IS
  'Everything assigned to the signed-in participant, assessments and training '
  'alike, discriminated by work_kind. Training never requires a phantom attempt.';

REVOKE ALL     ON FUNCTION public.scp_my_academy_work() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_academy_work() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. One programme, as the participant sees it
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_my_training_programme(_assignment_id uuid)
RETURNS TABLE(
  assignment_id uuid, program_version_id uuid, version_number integer,
  name_sv text, name_en text, purpose_sv text, purpose_en text,
  does_not_measure_sv text[], does_not_measure_en text[],
  employer_name text, language text, status text,
  assigned_at timestamptz, due_at timestamptz,
  started_at timestamptz, completed_at timestamptz,
  modules_total integer, modules_completed integer, estimated_minutes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ta.id, pv.id, pv.version_number, pv.name_sv, pv.name_en,
    pv.purpose_sv, pv.purpose_en, pv.does_not_measure_sv, pv.does_not_measure_en,
    e.name, ta.language, ta.status, ta.assigned_at, ta.due_at,
    ta.started_at, ta.completed_at,
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id),
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id AND mp.status = 'completed'),
    (SELECT sum(mv.estimated_minutes)::int FROM public.scp_module_versions mv
      WHERE mv.program_version_id = ta.program_version_id)
  FROM public.scp_training_assignments ta
  JOIN public.scp_subject_identities si
    ON si.subject_id = ta.subject_id AND si.user_id = auth.uid()
  JOIN public.scp_program_versions pv ON pv.id = ta.program_version_id
  LEFT JOIN public.employers e ON e.id = ta.employer_id
  WHERE ta.id = _assignment_id AND ta.status <> 'cancelled';
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_my_training_programme(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_training_programme(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_my_training_modules(_assignment_id uuid)
RETURNS TABLE(
  module_version_id uuid, display_order integer,
  name_sv text, name_en text, summary_sv text, summary_en text,
  estimated_minutes integer, has_activity boolean,
  status text, attempt_id uuid, started_at timestamptz, completed_at timestamptz,
  answered integer, total_items integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Ownership is asserted by the join to the caller's own subject identity;
  -- a stranger's assignment id simply returns nothing.
  RETURN QUERY
  SELECT
    mv.id, mv.display_order, mv.name_sv, mv.name_en, mv.summary_sv, mv.summary_en,
    mv.estimated_minutes, (mv.learning_form_id IS NOT NULL),
    mp.status, mp.attempt_id, mp.started_at, mp.completed_at,
    COALESCE((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = mp.attempt_id), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = mv.learning_form_id), 0)
  FROM public.scp_training_assignments ta
  JOIN public.scp_subject_identities si
    ON si.subject_id = ta.subject_id AND si.user_id = auth.uid()
  JOIN public.scp_training_module_progress mp ON mp.assignment_id = ta.id
  JOIN public.scp_module_versions mv ON mv.id = mp.module_version_id
  WHERE ta.id = _assignment_id AND ta.status <> 'cancelled'
  ORDER BY mv.display_order;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_my_training_modules(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_training_modules(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Start (or resume) a module
--
-- Resume is the same call. A module with an open learning attempt returns that
-- attempt rather than creating a second one, exactly as
-- scp_start_learning_attempt does, so leaving and returning is not a special
-- case anyone has to remember to implement.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_start_training_module(
  _assignment_id uuid, _module_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _ta public.scp_training_assignments%ROWTYPE;
        _form uuid; _attempt uuid; _mode text;
BEGIN
  SELECT ta.* INTO _ta
    FROM public.scp_training_assignments ta
    JOIN public.scp_subject_identities si
      ON si.subject_id = ta.subject_id AND si.user_id = auth.uid()
   WHERE ta.id = _assignment_id;

  IF _ta.id IS NULL THEN
    RAISE EXCEPTION 'SCP_TRAINING_NOT_YOURS: no training assignment of yours '
      'with that id.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _ta.status = 'cancelled' THEN
    RAISE EXCEPTION 'SCP_TRAINING_CANCELLED: that assignment was withdrawn.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT mv.learning_form_id INTO _form
    FROM public.scp_module_versions mv
   WHERE mv.id = _module_version_id AND mv.program_version_id = _ta.program_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_TRAINING_MODULE_NOT_IN_PROGRAMME: that module is not '
      'part of the assigned programme version.' USING ERRCODE = 'check_violation';
  END IF;

  IF _ta.status = 'assigned' THEN
    UPDATE public.scp_training_assignments
       SET status = 'in_progress', started_at = COALESCE(started_at, now())
     WHERE id = _assignment_id;
  END IF;

  IF _form IS NOT NULL THEN
    -- Same firewall check the standalone learning starter applies.
    SELECT DISTINCT iv.mode INTO _mode
      FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE fi.form_id = _form;
    IF _mode IS DISTINCT FROM 'learning' THEN
      RAISE EXCEPTION 'SCP_NOT_A_LEARNING_FORM: Learning Mode may only run on '
        'learning-mode items.' USING ERRCODE = 'check_violation';
    END IF;

    SELECT mp.attempt_id INTO _attempt
      FROM public.scp_training_module_progress mp
     WHERE mp.assignment_id = _assignment_id AND mp.module_version_id = _module_version_id;

    IF _attempt IS NULL THEN
      SELECT a.id INTO _attempt FROM public.scp_attempts a
       WHERE a.subject_id = _ta.subject_id AND a.form_id = _form
         AND a.mode = 'learning' AND a.status = 'in_progress'
       ORDER BY a.started_at DESC LIMIT 1;
    END IF;

    IF _attempt IS NULL THEN
      INSERT INTO public.scp_attempts
        (subject_id, issuer_organization_id, mode, form_id, purpose_version_id,
         jurisdiction_id, scoring_model_version, status)
      VALUES
        (_ta.subject_id, _ta.employer_id, 'learning', _form, _ta.purpose_version_id,
         (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
         'learning-v1', 'in_progress')
      RETURNING id INTO _attempt;
    END IF;
  END IF;

  UPDATE public.scp_training_module_progress
     SET status = CASE WHEN status = 'completed' THEN status ELSE 'in_progress' END,
         started_at = COALESCE(started_at, now()),
         attempt_id = COALESCE(_attempt, attempt_id)
   WHERE assignment_id = _assignment_id AND module_version_id = _module_version_id;

  RETURN _attempt;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_start_training_module(uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_start_training_module(uuid,uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Complete a module
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_complete_training_module(
  _assignment_id uuid, _module_version_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _mp public.scp_training_module_progress%ROWTYPE;
        _form uuid; _answered int; _total int;
BEGIN
  SELECT mp.* INTO _mp
    FROM public.scp_training_module_progress mp
    JOIN public.scp_training_assignments ta ON ta.id = mp.assignment_id
    JOIN public.scp_subject_identities si
      ON si.subject_id = ta.subject_id AND si.user_id = auth.uid()
   WHERE mp.assignment_id = _assignment_id
     AND mp.module_version_id = _module_version_id
     AND ta.status <> 'cancelled';

  IF _mp.id IS NULL THEN
    RAISE EXCEPTION 'SCP_TRAINING_NOT_YOURS: no training module of yours with '
      'that id.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _mp.status = 'completed' THEN RETURN true; END IF;

  SELECT mv.learning_form_id INTO _form
    FROM public.scp_module_versions mv WHERE mv.id = _module_version_id;

  -- A module with an activity is complete when the activity is answered. This
  -- is a completeness gate, not a score: nothing here reads whether the answer
  -- was preferred, and no maturity follows from it.
  IF _form IS NOT NULL THEN
    SELECT count(*)::int INTO _total FROM public.scp_form_items fi WHERE fi.form_id = _form;
    SELECT count(*)::int INTO _answered FROM public.scp_candidate_responses r
     WHERE r.attempt_id = _mp.attempt_id;
    IF _mp.attempt_id IS NULL OR _answered < _total THEN
      RAISE EXCEPTION
        'SCP_TRAINING_MODULE_INCOMPLETE: % of % activities answered.',
        COALESCE(_answered, 0), _total USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.scp_attempts
       SET status = 'scored', submitted_at = COALESCE(submitted_at, now()),
           scored_at = COALESCE(scored_at, now())
     WHERE id = _mp.attempt_id AND status = 'in_progress';
  END IF;

  UPDATE public.scp_training_module_progress
     SET status = 'completed', completed_at = now()
   WHERE id = _mp.id;

  RETURN true;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_complete_training_module(uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_complete_training_module(uuid,uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Complete the programme, and record it as development activity
--
-- The evidence row is written through the existing governed evidence
-- architecture, with source_type training_completion -- whose
-- counts_toward_maturity is false, so none of this reaches
-- scp_compute_maturity. contribution and confidence are recorded as 0: the row
-- asserts that a person did the work, and asserts nothing whatsoever about
-- measured competence.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_complete_training_programme(_assignment_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _ta public.scp_training_assignments%ROWTYPE;
        _outstanding int; _r record; _n int := 0; _global boolean;
BEGIN
  SELECT ta.* INTO _ta
    FROM public.scp_training_assignments ta
    JOIN public.scp_subject_identities si
      ON si.subject_id = ta.subject_id AND si.user_id = auth.uid()
   WHERE ta.id = _assignment_id;

  IF _ta.id IS NULL THEN
    RAISE EXCEPTION 'SCP_TRAINING_NOT_YOURS: no training assignment of yours '
      'with that id.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _ta.status = 'completed' THEN RETURN 0; END IF;
  IF _ta.status = 'cancelled' THEN
    RAISE EXCEPTION 'SCP_TRAINING_CANCELLED: that assignment was withdrawn.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)::int INTO _outstanding
    FROM public.scp_training_module_progress mp
   WHERE mp.assignment_id = _assignment_id AND mp.status <> 'completed';
  IF _outstanding > 0 THEN
    RAISE EXCEPTION 'SCP_TRAINING_MODULES_OUTSTANDING: % module(s) still to '
      'complete.', _outstanding USING ERRCODE = 'check_violation';
  END IF;

  -- Employer-authored content is never participant-visible development history
  -- on the shared graph in the same way global content is.
  SELECT (p.owner_employer_id IS NULL) INTO _global
    FROM public.scp_program_versions pv
    JOIN public.scp_programs p ON p.id = pv.program_id
   WHERE pv.id = _ta.program_version_id;

  FOR _r IN
    SELECT DISTINCT mbm.behaviour_version_id AS behaviour,
           mp.module_version_id AS module_version,
           COALESCE(mp.attempt_id, _assignment_id) AS ref
      FROM public.scp_training_module_progress mp
      JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id = mp.module_version_id
     WHERE mp.assignment_id = _assignment_id
  LOOP
    INSERT INTO public.scp_competency_evidence (
      subject_id, behaviour_version_id, source_type, source_ref,
      provenance_type, created_by_service, issuer_organization_id,
      purpose_version_id, jurisdiction_id, context_type, context_ref,
      contribution, confidence, disclosure_class, observed_at)
    VALUES (
      _ta.subject_id, _r.behaviour, 'training_completion', _r.ref,
      'deterministic', 'scp_complete_training_programme', _ta.employer_id,
      _ta.purpose_version_id,
      (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
      'module', _r.module_version,
      0.000, 0.000,
      CASE WHEN _global THEN 'participant_visible' ELSE 'internal_employer' END,
      now());
    _n := _n + 1;
  END LOOP;

  UPDATE public.scp_training_assignments
     SET status = 'completed', completed_at = now()
   WHERE id = _assignment_id;

  RETURN _n;
END; $function$;

COMMENT ON FUNCTION public.scp_complete_training_programme(uuid) IS
  'Marks the assignment complete and records development activity as '
  'training_completion evidence. That source type has '
  'counts_toward_maturity = false, so completing training leaves measured '
  'maturity exactly unchanged -- asserted in scp_content_library_test.sql.';

REVOKE ALL     ON FUNCTION public.scp_complete_training_programme(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_complete_training_programme(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. What the employer may see
--
-- Status and progress. Never an answer: the module activity is formative and
-- the responses belong to the participant. Identity stays pseudonymous behind
-- identity_resolvable, exactly as scp_employer_participants already does.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_training_status(_employer_id uuid)
RETURNS TABLE(
  assignment_id uuid, subject_id uuid,
  programme_name_sv text, programme_name_en text, version_number integer,
  status text, modules_total integer, modules_completed integer,
  assigned_at timestamptz, due_at timestamptz,
  started_at timestamptz, completed_at timestamptz,
  language text, identity_resolvable boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ta.id, ta.subject_id, pv.name_sv, pv.name_en, pv.version_number, ta.status,
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id),
    (SELECT count(*)::int FROM public.scp_training_module_progress mp
      WHERE mp.assignment_id = ta.id AND mp.status = 'completed'),
    ta.assigned_at, ta.due_at, ta.started_at, ta.completed_at, ta.language,
    EXISTS (SELECT 1 FROM public.scp_subject_identities si
             WHERE si.subject_id = ta.subject_id)
  FROM public.scp_training_assignments ta
  JOIN public.scp_program_versions pv ON pv.id = ta.program_version_id
  WHERE ta.employer_id = _employer_id
  ORDER BY ta.assigned_at DESC;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_employer_training_status(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_training_status(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _fn text; _def text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'scp_assign_training','scp_my_academy_work','scp_my_training_programme',
    'scp_my_training_modules','scp_start_training_module',
    'scp_complete_training_module','scp_complete_training_programme',
    'scp_employer_training_status'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn) THEN
      RAISE EXCEPTION 'SCP_TRAINING_RPC_MISSING: %', _fn;
    END IF;
    -- Hosted default privileges grant EXECUTE to anon on new public functions,
    -- so every one of these carries an explicit REVOKE. Assert it took.
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = _fn
                  AND has_function_privilege('anon', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'SCP_TRAINING_ANON_EXECUTE: % is anon-callable', _fn;
    END IF;
  END LOOP;

  -- The purpose is resolved, never hard-coded to an inactive code.
  _def := pg_get_functiondef('public.scp_assign_training(uuid,uuid,text,text,timestamptz,text,uuid)'::regprocedure);
  IF _def NOT LIKE '%scp_required_purpose_code%' THEN
    RAISE EXCEPTION 'SCP_TRAINING_PURPOSE_HARDCODED: assignment does not resolve its purpose';
  END IF;
  IF _def LIKE '%training_follow_up%' OR _def LIKE '%compliance_support%' THEN
    RAISE EXCEPTION 'SCP_TRAINING_INACTIVE_PURPOSE: assignment references a purpose that is not approved';
  END IF;

  -- Completion writes through the governed evidence table with the excluded
  -- source type, and never touches the maturity path.
  _def := pg_get_functiondef('public.scp_complete_training_programme(uuid)'::regprocedure);
  IF _def NOT LIKE '%training_completion%' THEN
    RAISE EXCEPTION 'SCP_TRAINING_EVIDENCE_SOURCE: completion does not write training_completion evidence';
  END IF;
  IF _def LIKE '%scp_compute_maturity%' THEN
    RAISE EXCEPTION 'SCP_TRAINING_TOUCHES_MATURITY: completion must not compute maturity';
  END IF;

  -- The combined read model is a union, not a phantom attempt.
  _def := pg_get_functiondef('public.scp_my_academy_work()'::regprocedure);
  IF _def NOT LIKE '%scp_training_assignments%' OR _def NOT LIKE '%scp_attempts%' THEN
    RAISE EXCEPTION 'SCP_ACADEMY_NOT_COMBINED: scp_my_academy_work does not return both kinds';
  END IF;
END $$;
