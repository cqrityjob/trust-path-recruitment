-- Phase 2k — a best/worst item must be answerable one choice at a time.
--
-- ADDITIVE ONLY (CREATE OR REPLACE of one guard and one function body).
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- scp_guard_response_matches_format refuses any sjt_best_worst response row
-- that does not carry BOTH best_option_id and worst_option_id:
--
--     IF NEW.best_option_id IS NULL OR NEW.worst_option_id IS NULL THEN
--       RAISE 'SCP_RESPONSE_SHAPE: a best/worst item requires both choices.'
--
-- A person answers a best/worst item by making two separate choices. The UI
-- saves after each one, because losing a participant's answer to a closed tab
-- is unacceptable. So the FIRST save always arrived with one side null, was
-- refused, and the run died on an error screen.
--
-- The item was therefore unanswerable through the product. Every closed-format
-- item after it was unreachable.
--
-- ── WHY THE SUITE MISSED IT ────────────────────────────────────────────
--
-- The journey test calls scp_save_response with best AND worst in one call,
-- because writing it that way is the obvious thing to do from SQL. It proved
-- the row shape, never the sequence a human produces. Both previous staging
-- defects had the same shape: the fixture did in one step what a person does
-- in several.
--
-- ── THE FIX: THE INVARIANT MOVES, IT DOES NOT DISAPPEAR ────────────────
--
-- "Evidence must be complete" is a real rule and stays. What was wrong was
-- WHERE it was enforced: at every keystroke rather than at the boundary where
-- an answer becomes evidence.
--
--   * While the attempt is in_progress, a best/worst row may hold one side.
--   * scp_submit_attempt refuses to submit while any best/worst answer is
--     half-finished, so nothing incomplete can ever become evidence.
--
-- A partially answered item is now exactly what it is -- a participant
-- mid-thought -- rather than a constraint violation.

CREATE OR REPLACE FUNCTION public.scp_guard_response_matches_format()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE _fmt text; _status text;
BEGIN
  SELECT item_format INTO _fmt FROM public.scp_item_versions WHERE id = NEW.item_version_id;
  SELECT status INTO _status FROM public.scp_attempts WHERE id = NEW.attempt_id;

  IF _fmt = 'constructed_response' THEN
    IF NEW.response_text IS NULL OR length(btrim(NEW.response_text)) = 0 THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: a constructed response requires text.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.selected_option_id IS NOT NULL OR NEW.best_option_id IS NOT NULL THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: a constructed response carries no option.'
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF _fmt = 'sjt_best_worst' THEN
    -- At least one side must be present: a row with neither carries nothing.
    IF NEW.best_option_id IS NULL AND NEW.worst_option_id IS NULL THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: a best/worst answer must name at least one option.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Both sides are required once the run is no longer open. Completeness is
    -- enforced at submission (see scp_submit_attempt), which is the boundary
    -- where an answer becomes evidence -- not while somebody is still choosing.
    IF _status IS DISTINCT FROM 'in_progress'
       AND (NEW.best_option_id IS NULL OR NEW.worst_option_id IS NULL) THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: a best/worst item requires both choices.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The same option cannot be both.
    IF NEW.best_option_id IS NOT NULL AND NEW.best_option_id = NEW.worst_option_id THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: the best and worst option cannot be the same.'
        USING ERRCODE = 'check_violation';
    END IF;

  ELSE
    IF NEW.selected_option_id IS NULL THEN
      RAISE EXCEPTION 'SCP_RESPONSE_SHAPE: item format "%" requires a selected option.', _fmt
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

COMMENT ON FUNCTION public.scp_guard_response_matches_format() IS
  'Response shape per item format. A best/worst answer may hold ONE side while '
  'the attempt is in_progress, because a person makes the two choices '
  'separately and losing the first to a closed tab is unacceptable. '
  'Completeness is enforced at submission, where an answer becomes evidence.';

-- Submission is now the completeness boundary.
CREATE OR REPLACE FUNCTION public.scp_submit_attempt(_attempt_id uuid)
RETURNS TABLE (evidence_written int, reviews_opened int, attempt_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _r record; _ev int := 0; _rv int := 0;
  _contribution numeric(4,3); _max numeric; _incomplete int;
BEGIN
  SELECT a.* INTO _a
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id AND si.user_id = auth.uid();

  IF _a.id IS NULL THEN
    RAISE EXCEPTION 'SCP_ATTEMPT_NOT_YOURS: no attempt of yours with that id.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.status <> 'in_progress' THEN
    RAISE EXCEPTION 'SCP_ATTEMPT_ALREADY_SUBMITTED: this attempt is "%".', _a.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The completeness gate that moved here from the row guard.
  SELECT count(*) INTO _incomplete
    FROM public.scp_candidate_responses r
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE r.attempt_id = _attempt_id
     AND iv.item_format = 'sjt_best_worst'
     AND (r.best_option_id IS NULL OR r.worst_option_id IS NULL);
  IF _incomplete > 0 THEN
    RAISE EXCEPTION
      'SCP_INCOMPLETE_BEST_WORST: % best/worst answer(s) name only one option. '
      'Choose both before submitting.', _incomplete
      USING ERRCODE = 'check_violation';
  END IF;

  FOR _r IN
    SELECT r.id AS response_id, r.selected_option_id, r.best_option_id,
           r.worst_option_id, r.response_text,
           iv.id AS item_version_id, iv.item_format, iv.primary_behaviour_id,
           iv.is_safety_critical, iv.requires_human_review
      FROM public.scp_candidate_responses r
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE r.attempt_id = _attempt_id
  LOOP
    IF _r.primary_behaviour_id IS NULL THEN
      RAISE EXCEPTION
        'SCP_ITEM_WITHOUT_BEHAVIOUR: item % has no primary behaviour, so its '
        'response cannot become evidence.', _r.item_version_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF _r.item_format = 'constructed_response' OR _r.requires_human_review THEN
      INSERT INTO public.scp_human_reviews (response_id, trigger_reason, review_status)
      VALUES (_r.response_id,
              CASE WHEN _r.is_safety_critical THEN 'safety_critical_detected'
                   ELSE 'no_provider_available' END,
              'pending');
      _rv := _rv + 1;
      CONTINUE;
    END IF;

    SELECT max(o.score_value) INTO _max
      FROM public.scp_item_options o WHERE o.item_version_id = _r.item_version_id;

    IF _r.item_format = 'sjt_best_worst' THEN
      SELECT (COALESCE((SELECT CASE WHEN o.is_best_key  THEN 1 ELSE 0 END
                          FROM public.scp_item_options o WHERE o.id = _r.best_option_id), 0)
            + COALESCE((SELECT CASE WHEN o.is_worst_key THEN 1 ELSE 0 END
                          FROM public.scp_item_options o WHERE o.id = _r.worst_option_id), 0))
             / 2.0
        INTO _contribution;
    ELSE
      SELECT COALESCE(
               (SELECT o.score_value FROM public.scp_item_options o
                 WHERE o.id = _r.selected_option_id), 0)
             / NULLIF(_max, 0)
        INTO _contribution;
    END IF;

    INSERT INTO public.scp_competency_evidence (
      subject_id, behaviour_version_id, source_type, source_ref,
      provenance_type, provenance_ref, scoring_model_version, created_by_service,
      issuer_organization_id, jurisdiction_id, purpose_version_id,
      role_version_id, context_type, context_ref,
      contribution, confidence, is_safety_critical, disclosure_class, observed_at)
    VALUES (
      _a.subject_id, _r.primary_behaviour_id, 'assessment_response', _r.response_id,
      'deterministic', _r.response_id, COALESCE(_a.scoring_model_version,'det-v1'),
      'scp_submit_attempt',
      _a.issuer_organization_id, _a.jurisdiction_id, _a.purpose_version_id,
      _a.role_version_id, 'assessment_form', _a.form_id,
      round(COALESCE(_contribution,0), 3), 1.000,
      _r.is_safety_critical, 'internal_employer', now());
    _ev := _ev + 1;
  END LOOP;

  UPDATE public.scp_attempts
     SET submitted_at = now(),
         status       = CASE WHEN _rv > 0 THEN 'submitted' ELSE 'scored' END,
         scored_at    = CASE WHEN _rv > 0 THEN NULL ELSE now() END
   WHERE id = _attempt_id;

  RETURN QUERY SELECT _ev, _rv,
    (SELECT a.status FROM public.scp_attempts a WHERE a.id = _attempt_id);
END; $$;

REVOKE ALL     ON FUNCTION public.scp_submit_attempt(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_submit_attempt(uuid) TO authenticated;

DO $$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc
   WHERE proname = 'scp_submit_attempt' LIMIT 1;
  IF _def NOT ILIKE '%SCP_INCOMPLETE_BEST_WORST%' THEN
    RAISE EXCEPTION 'SCP_P2K_COMPLETENESS_GATE_MISSING: submission would accept '
      'a half-finished best/worst answer.';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2k-bestworst', 'updated',
  'Phase 2k: a best/worst item could not be answered through the product at all — the row guard demanded both choices, but a person makes them one at a time and the first save was always refused, killing the run. The completeness invariant moved from every keystroke to submission, where an answer actually becomes evidence.',
  jsonb_build_object(
    'migration', '20260812090000_scp_phase2k_partial_bestworst_while_open',
    'partial_allowed_while', 'in_progress',
    'completeness_enforced_at', 'scp_submit_attempt'));
