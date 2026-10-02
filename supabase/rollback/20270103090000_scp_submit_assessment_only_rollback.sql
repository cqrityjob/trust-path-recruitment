-- Rollback for 20270103090000_scp_submit_assessment_only.
--
-- Restores scp_submit_attempt exactly as hosted before (md5(prosrc)
-- 624e9f119ef21feee2a5858e9d87a633). This REOPENS P1-1 of the 2026-10-02
-- audit: a Learning Mode run can again be submitted and scored as assessment
-- evidence. No stored row is touched. CREATE OR REPLACE keeps the comment.

CREATE OR REPLACE FUNCTION public.scp_submit_attempt(_attempt_id uuid)
 RETURNS TABLE(evidence_written integer, reviews_opened integer, attempt_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _r record; _ev int := 0; _rv int := 0;
  _contribution numeric(4,3); _max numeric;
  _incomplete int; _unanswered int; _total int;
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

  -- Gate 1: every item on the form must have an answer.
  SELECT count(*) INTO _total
    FROM public.scp_form_items fi WHERE fi.form_id = _a.form_id;
  SELECT count(*) INTO _unanswered
    FROM public.scp_form_items fi
   WHERE fi.form_id = _a.form_id
     AND NOT EXISTS (SELECT 1 FROM public.scp_candidate_responses r
                      WHERE r.attempt_id = _attempt_id
                        AND r.item_version_id = fi.item_version_id);
  IF _unanswered > 0 THEN
    RAISE EXCEPTION
      'SCP_INCOMPLETE_ATTEMPT: % of % items have no answer. An assessment '
      'result must not be produced from a partial run -- in particular, a '
      'missing answer must never remove a human-review requirement.',
      _unanswered, _total
      USING ERRCODE = 'check_violation';
  END IF;

  -- Gate 2: every best/worst answer names both options (Phase 2k).
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
           iv.is_safety_critical, iv.requires_human_review,
           iv.evidence_source_type
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

    -- `OR _r.is_safety_critical` is the whole fix from 20260819120000. A
    -- safety-critical observation carries a severity, severity is a human
    -- judgement, and this path has no human in it -- so this path must never
    -- produce one.
    IF _r.item_format = 'constructed_response'
       OR _r.requires_human_review
       OR _r.is_safety_critical THEN
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
      _a.subject_id, _r.primary_behaviour_id,
      -- The one substantive change. What the item declared it can prove.
      _r.evidence_source_type, _r.response_id,
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
    (SELECT status FROM public.scp_attempts WHERE id = _attempt_id);
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_submit_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_submit_attempt(uuid) TO authenticated;

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_submit_attempt(uuid)'::regprocedure))
     <> '624e9f119ef21feee2a5858e9d87a633' THEN
    RAISE EXCEPTION 'SCP_SUBMIT_ASSESSMENT_ONLY_ROLLBACK: the restored body is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'SCP_SUBMIT_ASSESSMENT_ONLY_ROLLBACK ok: pre-20270103090000 body restored';
END $$;
