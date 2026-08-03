-- Phase 2e — the remaining Assessment Center operations: library, assignment,
-- participants, results, review queue, Learning Mode, reassessment, progress.
--
-- ADDITIVE ONLY.
--
-- ── ONE DECISION WORTH STATING UP FRONT ───────────────────────────────────
--
-- The product brief asks that an employer be able to "open and complete human
-- reviews". The security model says an employer may never adjudicate its own
-- candidate's evidence, and scp_complete_human_review enforces that.
--
-- Those are not reconciled by weakening the check. They are reconciled by being
-- precise about who a reviewer is: the Reviews area lives inside Assessment
-- Center and is fully functional, but completing a review requires the
-- content-review capability. An employer who is also a CQrityjob reviewer can
-- work the queue; a plain employer sees only that N responses are awaiting
-- review, with no response text, no rubric and no subject.
--
-- scp_employer_review_pressure() exists precisely so the employer gets a
-- truthful answer to "is anything waiting on you?" without being handed the
-- material that would let them pre-empt the decision.

-- =========================================================================
-- SECTION 1 — Learning Mode gets its writer
-- =========================================================================
--
-- 'training_completion' was reserved with no writer since Phase 0. Learning
-- Mode IS that writer, so it is enabled here -- deliberately, which is exactly
-- what scp_guard_evidence_source_has_writer() was built to require.

UPDATE public.scp_evidence_source_types
   SET has_active_writer = true
 WHERE code = 'training_completion';

-- =========================================================================
-- SECTION 2 — The employer library
-- =========================================================================
--
-- A SECURITY DEFINER projection rather than a view: an employer has no read
-- policy on scp_assessment_versions, and it should not gain one just to render
-- a catalogue. This returns catalogue metadata only -- never a form, never an
-- item, never a key.
--
-- It deliberately returns UNPUBLISHED programmes too, marked as such, because
-- "Security Guard, under development, not yet validated" is a true and useful
-- thing for an employer to see. What it must never do is let one be assigned,
-- and assignment is gated separately in Section 3.

CREATE OR REPLACE FUNCTION public.scp_employer_library(_employer_id uuid)
RETURNS TABLE (
  assessment_version_id uuid,
  definition_slug   text,
  name_sv           text,
  name_en           text,
  content_status    text,
  validation_status text,
  is_test_fixture   boolean,
  assignable        boolean,
  item_count        integer,
  target_minutes_min integer,
  target_minutes_max integer,
  programme_purpose_sv text,
  programme_purpose_en text,
  does_not_measure_sv  text[],
  does_not_measure_en  text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    av.id, d.slug, d.name_sv, d.name_en,
    av.content_status, av.validation_status, d.is_test_fixture,
    -- The single source of truth for "can this be assigned". A programme is
    -- assignable only when published AND not retired AND it actually has a
    -- form with items. The third condition matters: a published shell with no
    -- items would otherwise offer an employer a run that delivers nothing.
    (av.content_status = 'published'
     AND av.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)),
    COALESCE((SELECT count(*)::int FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
               WHERE f.assessment_version_id = av.id), 0),
    (SELECT min(f.target_minutes_min) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    (SELECT max(f.target_minutes_max) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    pv.purpose_sv, pv.purpose_en, pv.does_not_measure_sv, pv.does_not_measure_en
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  JOIN public.scp_assessment_families fam ON fam.id = d.family_id
  LEFT JOIN LATERAL (
    SELECT p.purpose_sv, p.purpose_en, p.does_not_measure_sv, p.does_not_measure_en
      FROM public.scp_program_versions p
     ORDER BY p.created_at LIMIT 1
  ) pv ON true
  WHERE fam.product_type = 'development_programme'
    AND av.retired_at IS NULL
  ORDER BY (av.content_status = 'published') DESC, d.name_sv;
END; $$;

COMMENT ON FUNCTION public.scp_employer_library(uuid) IS
  'Catalogue metadata for the employer Assessment Library. Returns unpublished '
  'programmes too, flagged assignable=false, because "under development, not '
  'yet validated" is honest and useful. Never returns a form, an item, an '
  'option, a key or a rubric.';

REVOKE ALL     ON FUNCTION public.scp_employer_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_library(uuid) TO authenticated;

-- =========================================================================
-- SECTION 3 — Assignment
-- =========================================================================
--
-- Creating an assignment needs auth.users (to find the recipient) and
-- scp_subjects/scp_subject_identities (to attach a pseudonymous key). None of
-- those are employer-readable, and none of them become so: the employer hands
-- in an email address and receives an attempt id, and at no point can it
-- enumerate anything.

CREATE OR REPLACE FUNCTION public.scp_employer_assign(
  _employer_id uuid,
  _assessment_version_id uuid,
  _recipient_email text,
  _deadline timestamptz DEFAULT NULL,
  _language text DEFAULT 'sv'
)
RETURNS TABLE (assignment_id uuid, attempt_id uuid, subject_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  _role text; _user uuid; _subject uuid; _form uuid; _purpose uuid;
  _assignment uuid; _attempt uuid; _assignable boolean; _email text;
BEGIN
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_ASSIGN: assigning requires owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Only a genuinely assignable version. This is what keeps the real Security
  -- Guard programme unassignable while it is in draft, and it is checked HERE
  -- rather than trusted from the UI.
  SELECT (av.content_status = 'published' AND av.retired_at IS NULL
          AND EXISTS (SELECT 1 FROM public.scp_forms f
                        JOIN public.scp_form_items fi ON fi.form_id = f.id
                       WHERE f.assessment_version_id = av.id))
    INTO _assignable
    FROM public.scp_assessment_versions av WHERE av.id = _assessment_version_id;

  IF NOT coalesce(_assignable, false) THEN
    RAISE EXCEPTION
      'SCP_PROGRAMME_NOT_ASSIGNABLE: this programme is not published, or has no '
      'items. Publication is a reviewed step, not a toggle.'
      USING ERRCODE = 'check_violation';
  END IF;

  _email := lower(btrim(_recipient_email));
  SELECT id INTO _user FROM auth.users WHERE lower(email) = _email;
  IF _user IS NULL THEN
    RAISE EXCEPTION
      'SCP_RECIPIENT_HAS_NO_ACCOUNT: % has no CQrityjob account yet. A '
      'development assessment is attached to a person, not to an address.', _email
      USING ERRCODE = 'check_violation';
  END IF;

  -- One pseudonymous subject per person, forever. Reusing it is what makes
  -- evidence accumulate across assignments and across employers.
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
     recipient_user_id, assigned_by, invitation_token_hash, expires_at, status, language)
  VALUES
    (_employer_id, _assessment_version_id, 'academy', 'workforce', _email,
     _user, auth.uid(), encode(gen_random_bytes(24), 'hex'),
     COALESCE(_deadline, now() + interval '30 days'), 'invited',
     CASE WHEN _language = 'en' THEN 'en' ELSE 'sv' END)
  RETURNING id INTO _assignment;

  INSERT INTO public.scp_attempts
    (subject_id, issuer_organization_id, assignment_id, mode, form_id,
     assessment_version_id, purpose_version_id, jurisdiction_id,
     scoring_model_version, status)
  VALUES
    (_subject, _employer_id, _assignment, 'assessment', _form,
     _assessment_version_id, _purpose,
     (SELECT id FROM public.scp_jurisdictions WHERE code = 'SE'),
     'det-v1', 'in_progress')
  RETURNING id INTO _attempt;

  RETURN QUERY SELECT _assignment, _attempt, _subject;
END; $$;

COMMENT ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text) IS
  'Assigns a published programme to one person. Re-checks assignability in the '
  'database rather than trusting the caller, so a draft programme cannot be '
  'assigned by a crafted request. Reuses the person''s existing pseudonymous '
  'subject so evidence accumulates across assignments and employers.';

REVOKE ALL     ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_assign(uuid, uuid, text, timestamptz, text) TO authenticated;

-- =========================================================================
-- SECTION 4 — Participants and results
-- =========================================================================
--
-- Both return a PSEUDONYMOUS subject reference. Turning one into a person is
-- still scp_resolve_participant_identity(), unchanged from Phase 2a.

CREATE OR REPLACE FUNCTION public.scp_employer_participants(_employer_id uuid)
RETURNS TABLE (
  subject_id uuid,
  attempt_id uuid,
  assignment_id uuid,
  programme_name_sv text,
  programme_name_en text,
  attempt_status text,
  answered integer,
  total_items integer,
  reviews_outstanding integer,
  deadline timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  scored_at timestamptz,
  released_at timestamptz,
  identity_resolvable boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.subject_id, a.id, a.assignment_id, d.name_sv, d.name_en, a.status,
    COALESCE((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = a.id), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = a.form_id), 0),
    -- A count, never the responses themselves.
    COALESCE((SELECT count(*)::int FROM public.scp_human_reviews hr
                JOIN public.scp_candidate_responses r ON r.id = hr.response_id
               WHERE r.attempt_id = a.id AND hr.review_status = 'pending'), 0),
    asg.expires_at, a.started_at, a.submitted_at, a.scored_at, a.released_at,
    (a.released_at IS NOT NULL)
  FROM public.scp_attempts a
  LEFT JOIN public.assessment_assignments asg ON asg.id = a.assignment_id
  LEFT JOIN public.scp_assessment_versions av ON av.id = a.assessment_version_id
  LEFT JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  WHERE a.issuer_organization_id = _employer_id
    AND a.mode = 'assessment'
  ORDER BY a.started_at DESC;
END; $$;

COMMENT ON FUNCTION public.scp_employer_participants(uuid) IS
  'Progress and status for every attempt this employer commissioned. Carries a '
  'pseudonymous subject reference, answer COUNTS and review COUNTS -- never a '
  'response, never a name. identity_resolvable tells the UI whether '
  'scp_resolve_participant_identity would succeed, without calling it.';

REVOKE ALL     ON FUNCTION public.scp_employer_participants(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_participants(uuid) TO authenticated;

-- How much is waiting on CQrityjob, expressed as a number and nothing else.
CREATE OR REPLACE FUNCTION public.scp_employer_review_pressure(_employer_id uuid)
RETURNS TABLE (awaiting_review integer, attempts_blocked integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT count(*)::int,
         count(DISTINCT r.attempt_id)::int
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_attempts a ON a.id = r.attempt_id
   WHERE a.issuer_organization_id = _employer_id AND hr.review_status = 'pending';
END; $$;

COMMENT ON FUNCTION public.scp_employer_review_pressure(uuid) IS
  'Two integers: how many responses await review, and how many attempts they '
  'block. Deliberately nothing else -- an employer is entitled to know that '
  'something is waiting, not to see the material under review.';

REVOKE ALL     ON FUNCTION public.scp_employer_review_pressure(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_review_pressure(uuid) TO authenticated;

-- =========================================================================
-- SECTION 5 — Development recommendations
-- =========================================================================
--
-- A gap becomes a suggested module through the graph: evidence sits on a
-- behaviour, modules map to behaviours, so a competency that is short of
-- evidence names the modules that address the same behaviours. No new taxonomy
-- and no scoring rule -- it is a join.

CREATE OR REPLACE FUNCTION public.scp_development_recommendations(_subject_id uuid)
RETURNS TABLE (
  module_version_id uuid,
  module_name_sv text,
  module_name_en text,
  summary_sv text,
  summary_en text,
  estimated_minutes integer,
  addresses_competency_sv text,
  addresses_competency_en text,
  maturity_level text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Readable by the participant themselves, or by a member of an organisation
  -- that has a RELEASED result for them. Same gate as the report.
  IF NOT EXISTS (
        SELECT 1 FROM public.scp_subject_identities si
         WHERE si.subject_id = _subject_id AND si.user_id = auth.uid())
     AND NOT EXISTS (
        SELECT 1 FROM public.scp_attempts a
          JOIN public.employer_memberships m
            ON m.employer_id = a.issuer_organization_id
           AND m.user_id = auth.uid() AND m.status = 'active'
         WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL)
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT ON (mv.id)
    mv.id, mv.name_sv, mv.name_en, mv.summary_sv, mv.summary_en,
    mv.estimated_minutes, cv.name_sv, cv.name_en,
    public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
  FROM public.scp_competency_evidence e
  JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
  JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
  JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
  JOIN public.scp_module_behaviour_map mbm ON mbm.behaviour_version_id = bv.id
  JOIN public.scp_module_versions mv ON mv.id = mbm.module_version_id
  WHERE e.subject_id = _subject_id
    AND e.superseded_by IS NULL
    -- Only where the evidence does NOT yet support a settled level. A person
    -- is not offered training for something they have already demonstrated.
    AND public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
        IN ('no_evidence','limited_evidence','developing_evidence')
  ORDER BY mv.id, mv.display_order;
END; $$;

COMMENT ON FUNCTION public.scp_development_recommendations(uuid) IS
  'Modules that address the behaviours behind a competency whose evidence is '
  'not yet settled. A join over the graph, not a second scoring rule. Visible '
  'to the participant, and to an employer that holds a released result.';

REVOKE ALL     ON FUNCTION public.scp_development_recommendations(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_development_recommendations(uuid) TO authenticated;

-- =========================================================================
-- SECTION 6 — Learning Mode
-- =========================================================================
--
-- Learning runs on SEPARATE learning-mode item versions. The disjointness is
-- already guaranteed three ways by Phase 1A; what is added here is the
-- delivery, the feedback reveal and the completion writer.
--
-- Feedback is a SEPARATE call, made after an answer exists. That is the whole
-- reason it is not folded into delivery: if the feedback travelled with the
-- item, the preferred answer would be in the payload before the learner
-- answered, and the module would teach nothing.

CREATE OR REPLACE FUNCTION public.scp_start_learning_attempt(_form_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _subject uuid; _attempt uuid; _mode text; _purpose uuid;
BEGIN
  SELECT si.subject_id INTO _subject
    FROM public.scp_subject_identities si WHERE si.user_id = auth.uid();
  IF _subject IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_SUBJECT: you have no competence profile yet.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The form must be a LEARNING form. A learning attempt on an assessment form
  -- would hand a learner the live bank.
  SELECT DISTINCT iv.mode INTO _mode
    FROM public.scp_form_items fi
    JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
   WHERE fi.form_id = _form_id;
  IF _mode IS DISTINCT FROM 'learning' THEN
    RAISE EXCEPTION
      'SCP_NOT_A_LEARNING_FORM: Learning Mode may only run on learning-mode '
      'items.' USING ERRCODE = 'check_violation';
  END IF;

  -- Learning is repeatable by design, so an open attempt is resumed rather
  -- than duplicated, and a completed one does not block a fresh run.
  SELECT a.id INTO _attempt FROM public.scp_attempts a
   WHERE a.subject_id = _subject AND a.form_id = _form_id
     AND a.mode = 'learning' AND a.status = 'in_progress'
   ORDER BY a.started_at DESC LIMIT 1;
  IF _attempt IS NOT NULL THEN RETURN _attempt; END IF;

  SELECT pv.id INTO _purpose FROM public.scp_purpose_versions pv
    JOIN public.scp_processing_purposes p ON p.code = pv.purpose_code
   WHERE p.is_active AND pv.published_at IS NOT NULL
   ORDER BY pv.published_at DESC LIMIT 1;

  INSERT INTO public.scp_attempts
    (subject_id, mode, form_id, purpose_version_id, jurisdiction_id,
     scoring_model_version, status)
  VALUES
    (_subject, 'learning', _form_id, _purpose,
     (SELECT id FROM public.scp_jurisdictions WHERE code='SE'), 'learning-v1', 'in_progress')
  RETURNING id INTO _attempt;

  RETURN _attempt;
END; $$;

COMMENT ON FUNCTION public.scp_start_learning_attempt(uuid) IS
  'Starts or resumes a Learning Mode run. Refuses any form whose items are not '
  'learning-mode, and is repeatable by design -- a completed run never blocks '
  'a fresh one.';

REVOKE ALL     ON FUNCTION public.scp_start_learning_attempt(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_start_learning_attempt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_get_learning_feedback(
  _attempt_id uuid,
  _item_version_id uuid,
  _language text DEFAULT 'sv-SE'
)
RETURNS TABLE (
  option_id uuid,
  label text,
  is_preferred boolean,
  feedback text,
  error_type text,
  chosen boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _mode text; _chosen uuid;
BEGIN
  -- Three conditions, all required: the attempt is the caller's, it is a
  -- LEARNING attempt, and the learner has already answered this item.
  SELECT a.mode INTO _mode
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id AND si.user_id = auth.uid();
  IF _mode IS DISTINCT FROM 'learning' THEN RETURN; END IF;

  SELECT r.selected_option_id INTO _chosen
    FROM public.scp_candidate_responses r
   WHERE r.attempt_id = _attempt_id AND r.item_version_id = _item_version_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- And the item must itself be a learning item. Belt and braces: without this,
  -- a learning attempt that somehow referenced an assessment item would reveal
  -- the live key.
  IF NOT EXISTS (SELECT 1 FROM public.scp_item_versions iv
                  WHERE iv.id = _item_version_id AND iv.mode = 'learning') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.id, ot.label, o.is_preferred,
         CASE WHEN _language = 'en-GB' THEN o.learning_feedback_en
              ELSE o.learning_feedback_sv END,
         o.distractor_error_type,
         (o.id = _chosen)
    FROM public.scp_item_options o
    JOIN public.scp_item_option_texts ot
      ON ot.item_option_id = o.id AND ot.language = _language
   WHERE o.item_version_id = _item_version_id
   ORDER BY o.display_order;
END; $$;

COMMENT ON FUNCTION public.scp_get_learning_feedback(uuid, uuid, text) IS
  'Reveals the preferred response and why the weaker alternatives are weaker -- '
  'AFTER the learner has answered, on a learning attempt, for a learning item. '
  'All three are required. Kept separate from delivery so the answer is never '
  'in the payload before the question has been attempted.';

REVOKE ALL     ON FUNCTION public.scp_get_learning_feedback(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_learning_feedback(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_complete_learning_module(_attempt_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE _a public.scp_attempts%ROWTYPE; _r record; _n int := 0;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id AND si.user_id = auth.uid() AND a.mode = 'learning';
  IF _a.id IS NULL THEN
    RAISE EXCEPTION 'SCP_LEARNING_ATTEMPT_NOT_YOURS: no learning run of yours '
      'with that id.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.status <> 'in_progress' THEN
    RAISE EXCEPTION 'SCP_LEARNING_ALREADY_COMPLETE: this run is "%".', _a.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Training completion is evidence, but WEAK evidence, and it is recorded as
  -- such. contribution 0.250 and confidence 0.500 mean a learner cannot train
  -- their way to a maturity level: the sufficiency gate still needs a second
  -- source type, and the quality gate still needs demonstrated performance.
  FOR _r IN
    SELECT DISTINCT iv.primary_behaviour_id AS behaviour
      FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
     WHERE fi.form_id = _a.form_id AND iv.primary_behaviour_id IS NOT NULL
  LOOP
    INSERT INTO public.scp_competency_evidence (
      subject_id, behaviour_version_id, source_type, source_ref,
      provenance_type, created_by_service, purpose_version_id, jurisdiction_id,
      context_type, context_ref, contribution, confidence,
      disclosure_class, observed_at)
    VALUES (
      _a.subject_id, _r.behaviour, 'training_completion', _attempt_id,
      'deterministic', 'scp_complete_learning_module', _a.purpose_version_id,
      _a.jurisdiction_id, 'module', _a.form_id, 0.250, 0.500,
      'participant_visible', now());
    _n := _n + 1;
  END LOOP;

  UPDATE public.scp_attempts
     SET status = 'scored', submitted_at = now(), scored_at = now()
   WHERE id = _attempt_id;

  RETURN _n;
END; $$;

COMMENT ON FUNCTION public.scp_complete_learning_module(uuid) IS
  'Records a completed Learning Mode run as training_completion evidence at '
  'deliberately low weight (0.250/0.500). A learner cannot train their way to '
  'a maturity level: the sufficiency gate still needs a second source type and '
  'the quality gate still needs demonstrated performance.';

REVOKE ALL     ON FUNCTION public.scp_complete_learning_module(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_complete_learning_module(uuid) TO authenticated;

-- =========================================================================
-- SECTION 7 — Reassessment and progress
-- =========================================================================

CREATE OR REPLACE FUNCTION public.scp_schedule_reassessment(
  _employer_id uuid,
  _subject_id uuid,
  _deadline timestamptz DEFAULT NULL
)
RETURNS TABLE (assignment_id uuid, attempt_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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

  RETURN QUERY
  SELECT r.assignment_id, r.attempt_id
    FROM public.scp_employer_assign(
      _employer_id, _prior.assessment_version_id, _email,
      COALESCE(_deadline, now() + interval '90 days')) r;
END; $$;

COMMENT ON FUNCTION public.scp_schedule_reassessment(uuid, uuid, timestamptz) IS
  'Schedules a repeat of the same programme for someone with an earlier '
  'released result. Requiring the prior result is both what makes the '
  'comparison meaningful and what stops this becoming a way to assign to an '
  'arbitrary subject.';

REVOKE ALL     ON FUNCTION public.scp_schedule_reassessment(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_schedule_reassessment(uuid, uuid, timestamptz) TO authenticated;

-- Progress is read from the immutable SNAPSHOTS, never recomputed. Recomputing
-- would make history move every time evidence changed, which is the opposite
-- of what a growth view is for.
CREATE OR REPLACE FUNCTION public.scp_subject_progress(_subject_id uuid)
RETURNS TABLE (
  released_at timestamptz,
  attempt_id uuid,
  competency_code text,
  competency_name_sv text,
  competency_name_en text,
  maturity_level text,
  observations integer,
  safety_flag_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM public.scp_subject_identities si
         WHERE si.subject_id = _subject_id AND si.user_id = auth.uid())
     AND NOT EXISTS (
        SELECT 1 FROM public.scp_attempts a
          JOIN public.employer_memberships m
            ON m.employer_id = a.issuer_organization_id
           AND m.user_id = auth.uid() AND m.status = 'active'
         WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL)
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.released_at, s.attempt_id,
         x->>'competency_code', x->>'competency_name_sv', x->>'competency_name_en',
         x->>'maturity_level', (x->>'observations')::int,
         jsonb_array_length(s.safety_flags)
    FROM public.scp_report_snapshots s,
         jsonb_array_elements(s.payload) x
   WHERE s.subject_id = _subject_id
   ORDER BY s.released_at, x->>'competency_code';
END; $$;

COMMENT ON FUNCTION public.scp_subject_progress(uuid) IS
  'Maturity level per competency at each release, read from the immutable '
  'snapshots rather than recomputed. Recomputation would make history move '
  'whenever evidence changed, which is the opposite of what a growth view is '
  'for.';

REVOKE ALL     ON FUNCTION public.scp_subject_progress(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_subject_progress(uuid) TO authenticated;

-- =========================================================================
-- SECTION 8 — The participant's own assignments
-- =========================================================================

CREATE OR REPLACE FUNCTION public.scp_my_academy_assignments()
RETURNS TABLE (
  attempt_id uuid,
  mode text,
  programme_name_sv text,
  programme_name_en text,
  employer_name text,
  attempt_status text,
  answered integer,
  total_items integer,
  deadline timestamptz,
  released_at timestamptz,
  purpose_sv text,
  purpose_en text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.mode, d.name_sv, d.name_en, e.name, a.status,
    COALESCE((SELECT count(*)::int FROM public.scp_candidate_responses r
               WHERE r.attempt_id = a.id), 0),
    COALESCE((SELECT count(*)::int FROM public.scp_form_items fi
               WHERE fi.form_id = a.form_id), 0),
    asg.expires_at, a.released_at,
    p.notice_sv, p.notice_en
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
     WHERE pvv.id = a.purpose_version_id
  ) p ON true
  ORDER BY a.started_at DESC;
END; $$;

COMMENT ON FUNCTION public.scp_my_academy_assignments() IS
  'Everything the signed-in person has been asked to do, and every learning run '
  'they have started, with the processing purpose named. Scoped by '
  'scp_subject_identities, so it cannot return anybody else''s work.';

REVOKE ALL     ON FUNCTION public.scp_my_academy_assignments() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_my_academy_assignments() TO authenticated;

-- =========================================================================
-- SECTION 9 — Prove the boundary
-- =========================================================================

DO $$
DECLARE _n int; _sig text;
BEGIN
  SELECT count(*) INTO _n
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.content_status = 'published' AND NOT d.is_test_fixture;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2E_REAL_CONTENT_PUBLISHED: %', _n;
  END IF;

  -- The employer library cannot return protected content: assert on the
  -- function's own return type, not on its body.
  _sig := pg_get_function_result(
    (SELECT oid FROM pg_proc WHERE proname = 'scp_employer_library' LIMIT 1));
  IF _sig ILIKE '%score%' OR _sig ILIKE '%rationale%' OR _sig ILIKE '%rubric%'
     OR _sig ILIKE '%anchor%' OR _sig ILIKE '%prompt%' OR _sig ILIKE '%key%' THEN
    RAISE EXCEPTION 'SCP_P2E_LIBRARY_LEAKS: %', _sig;
  END IF;

  -- Neither can the participant-facing assignment list.
  _sig := pg_get_function_result(
    (SELECT oid FROM pg_proc WHERE proname = 'scp_my_academy_assignments' LIMIT 1));
  IF _sig ILIKE '%score%' OR _sig ILIKE '%rationale%' OR _sig ILIKE '%key%' THEN
    RAISE EXCEPTION 'SCP_P2E_MYASSIGNMENTS_LEAKS: %', _sig;
  END IF;

  IF EXISTS (SELECT 1 FROM public.scp_ai_providers
              WHERE is_enabled AND code <> 'null_provider') THEN
    RAISE EXCEPTION 'SCP_P2E_AI_ENABLED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2e-operations', 'created',
  'Phase 2e: library, assignment, participants, review pressure, development recommendations, Learning Mode delivery and completion, reassessment, progress and the participant assignment list. Learning Mode enables the training_completion writer deliberately, and records it at low weight so nobody can train their way to a maturity level.',
  jsonb_build_object(
    'migration', '20260809090000_scp_phase2e_employer_learning_progress',
    'rpcs_added', 11,
    'training_completion_writer_enabled', true,
    'real_content_published', false));
