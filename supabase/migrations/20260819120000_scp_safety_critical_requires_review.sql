-- Safety-critical observations are a human judgement, not a deterministic one.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- scp_submit_attempt wrote every auto-scored response as final competency
-- evidence, copying is_safety_critical from the item but never setting
-- safety_severity. scp_evidence_safety_is_specified requires a severity
-- whenever the evidence is safety-critical, so the INSERT was refused and the
-- entire submission aborted with a raw 23514.
--
-- Twelve of the eighteen Security Guard items are safety-critical; ten of them
-- had requires_human_review = false and therefore took the deterministic path.
-- No candidate could submit the assessment. The 4-item delivery fixture has
-- zero safety-critical items, which is why the Phase 2 journey suite passed
-- throughout.
--
-- ── WHY THIS IS THE SMALLEST COHERENT FIX ───────────────────────────────
--
-- The architecture already routes work to humans. scp_submit_attempt's loop
-- says:
--
--     IF item_format = 'constructed_response' OR requires_human_review THEN
--       INSERT INTO scp_human_reviews (... trigger_reason ...)
--       ... CONTINUE;   -- no evidence written here
--
-- and it ALREADY labels that review 'safety_critical_detected' when the item is
-- safety-critical. The model anticipated exactly this case. scp_complete_human_
-- review then writes the evidence, taking _safety_severity from the reviewer.
--
-- So nothing new is built here. No pending-evidence table, no parallel review
-- system, no weakened constraint. Three narrow corrections complete the model
-- that was already there.
--
-- ── 1. STRUCTURAL: the deterministic path may never produce safety evidence ──
--
-- The routing condition gains `OR is_safety_critical`. This is the load-bearing
-- change: it makes "final safety-critical evidence always came from a human
-- review" true by construction, not by the correctness of a per-item flag.
--
-- ── 2. DATA: the flag is made honest ─────────────────────────────────────
--
-- requires_human_review is set true on safety-critical item versions. With (1)
-- this is redundant for routing, and it is still right: the item genuinely does
-- require human review, and every surface that reads the flag — review queues,
-- authoring UI, the item bank — should say so rather than disagree with the
-- engine. Authorised as a narrow assessment-governance correction.
--
-- NOT changed: scoring, score_value, best/worst keys, questions, option labels,
-- competencies, behaviours, content_status, validation_status, or any of the
-- five review gates. The programme stays draft/design with every gate pending
-- and remains runnable only under a closed_test grant.
--
-- ── 3. GUARD: a reviewer cannot omit the severity ────────────────────────
--
-- scp_complete_human_review accepted _safety_severity => NULL for a
-- safety-critical response, which simply moved the same raw 23514 from
-- submission time to review time. It now refuses with a named, actionable
-- error. Severity is still never invented — it is required from the human whose
-- judgement it is.
--
-- Reversible: restore the two function bodies from 20260807090000 /
-- 20260805053845 and reset requires_human_review on the affected item versions.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 + 2 — routing, and the honest flag
-- ═══════════════════════════════════════════════════════════════════════════

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

    -- `OR _r.is_safety_critical` is the whole fix. A safety-critical
    -- observation carries a severity, severity is a human judgement, and this
    -- path has no human in it -- so this path must never produce one. Checked
    -- on the ITEM's own flag rather than on requires_human_review, so a wrong
    -- flag cannot route safety-critical work back into deterministic scoring.
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
    (SELECT status FROM public.scp_attempts WHERE id = _attempt_id);
END; $function$;

COMMENT ON FUNCTION public.scp_submit_attempt(uuid) IS
  'Turns a completed run into evidence. Constructed responses, items flagged '
  'for human review, and ALL safety-critical items are routed to '
  'scp_human_reviews instead of scored deterministically: a safety-critical '
  'observation must carry a severity, and severity is a human judgement. The '
  'candidate''s attempt completes either way -- waiting for a reviewer is not '
  'the candidate''s problem.';

-- The data correction. Narrow: only requires_human_review, only on
-- safety-critical item versions, nothing else touched.
UPDATE public.scp_item_versions
   SET requires_human_review = true
 WHERE is_safety_critical
   AND NOT requires_human_review;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 — a reviewer may not omit the severity
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_complete_human_review(
  _review_id    uuid,
  _outcome      text,
  _rationale    text,
  _contribution numeric DEFAULT 0.5,
  _safety_severity text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _resp record; _a public.scp_attempts%ROWTYPE; _evidence_id uuid; _outstanding int;
BEGIN
  -- Reviewing is an authoring capability, not an employer one. An employer must
  -- never be able to decide what its own candidate's evidence says.
  IF NOT public.scp_can_author(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_NOT_A_REVIEWER: completing a review requires the '
      'content-review capability.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _outcome NOT IN ('upheld','adjusted','overturned') THEN
    RAISE EXCEPTION 'SCP_BAD_REVIEW_OUTCOME: "%" is not a review outcome.', _outcome
      USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(btrim(_rationale),'') = '' THEN
    RAISE EXCEPTION 'SCP_REVIEW_WITHOUT_RATIONALE: a review decision must state '
      'its reasons.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT hr.id AS review_id, r.id AS response_id, r.attempt_id,
         iv.primary_behaviour_id, iv.is_safety_critical
    INTO _resp
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE hr.id = _review_id AND hr.review_status = 'pending';

  IF _resp.review_id IS NULL THEN
    RAISE EXCEPTION 'SCP_REVIEW_NOT_PENDING: no pending review with that id.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The severity is the reviewer's judgement and the reason this response was
  -- routed to a human at all. Without this check the same raw 23514 simply
  -- moves from submission time to review time.
  IF _resp.is_safety_critical THEN
    IF _safety_severity IS NULL THEN
      RAISE EXCEPTION
        'SCP_SAFETY_SEVERITY_REQUIRED: this is a safety-critical observation. '
        'State how severe it is (low, medium, high or critical) -- it cannot be '
        'inferred from the score.' USING ERRCODE = 'check_violation';
    END IF;
    IF _safety_severity NOT IN ('low','medium','high','critical') THEN
      RAISE EXCEPTION
        'SCP_BAD_SAFETY_SEVERITY: "%" is not a severity. Use low, medium, high '
        'or critical.', _safety_severity USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _safety_severity IS NOT NULL THEN
    -- Severity on a non-safety observation would make the evidence say
    -- something the item never claimed.
    RAISE EXCEPTION
      'SCP_SEVERITY_ON_NON_SAFETY_ITEM: this observation is not safety-critical, '
      'so it carries no severity.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _resp.attempt_id;

  UPDATE public.scp_human_reviews
     SET review_status = 'completed', outcome = _outcome,
         reviewer_actor_id = auth.uid(), reviewer_rationale = _rationale,
         completed_at = now()
   WHERE id = _review_id;

  INSERT INTO public.scp_competency_evidence (
    subject_id, behaviour_version_id, source_type, source_ref,
    provenance_type, provenance_ref, created_by_service, assessor_actor_id,
    issuer_organization_id, jurisdiction_id, purpose_version_id, role_version_id,
    context_type, context_ref, contribution, confidence,
    is_safety_critical, safety_severity, review_status, disclosure_class, observed_at)
  VALUES (
    _a.subject_id, _resp.primary_behaviour_id, 'assessment_response', _resp.response_id,
    'human_review', _review_id, 'scp_complete_human_review', auth.uid(),
    _a.issuer_organization_id, _a.jurisdiction_id, _a.purpose_version_id,
    _a.role_version_id, 'assessment_form', _a.form_id,
    round(greatest(0, least(1, _contribution)), 3), 1.000,
    _resp.is_safety_critical, _safety_severity, 'upheld', 'internal_employer', now())
  RETURNING id INTO _evidence_id;

  SELECT count(*) INTO _outstanding
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _resp.attempt_id AND hr.review_status = 'pending';

  IF _outstanding = 0 THEN
    UPDATE public.scp_attempts
       SET status = 'scored', scored_at = now()
     WHERE id = _resp.attempt_id AND status = 'submitted';
  END IF;

  RETURN _evidence_id;
END; $function$;

COMMENT ON FUNCTION public.scp_complete_human_review(uuid, text, text, numeric, text) IS
  'Records a reviewer''s judgement and writes the resulting evidence. A '
  'safety-critical observation REQUIRES an explicit severity from the reviewer '
  'and a non-safety one refuses to carry any. The attempt becomes scored only '
  'when no pending review remains, which is what the release gate reads.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _det text; _rev text; _unflagged int;
BEGIN
  _det := pg_get_functiondef('public.scp_submit_attempt(uuid)'::regprocedure);
  _rev := pg_get_functiondef(
    'public.scp_complete_human_review(uuid,text,text,numeric,text)'::regprocedure);

  IF _det NOT LIKE '%OR _r.is_safety_critical THEN%' THEN
    RAISE EXCEPTION 'SCP_SAFETY_REVIEW: the deterministic path can still score '
      'a safety-critical response';
  END IF;

  IF _rev NOT LIKE '%SCP_SAFETY_SEVERITY_REQUIRED%' THEN
    RAISE EXCEPTION 'SCP_SAFETY_REVIEW: a reviewer can still omit the severity';
  END IF;

  SELECT count(*) INTO _unflagged
    FROM public.scp_item_versions
   WHERE is_safety_critical AND NOT requires_human_review;
  IF _unflagged > 0 THEN
    RAISE EXCEPTION 'SCP_SAFETY_REVIEW: % safety-critical item version(s) still '
      'claim they need no human review', _unflagged;
  END IF;

  -- The invariant this whole migration exists to protect. Stated as data, so it
  -- is checked against what is actually stored rather than against a function
  -- body: no final safety-critical evidence without a severity, ever.
  IF EXISTS (SELECT 1 FROM public.scp_competency_evidence
              WHERE is_safety_critical AND safety_severity IS NULL) THEN
    RAISE EXCEPTION 'SCP_SAFETY_REVIEW: safety-critical evidence without a '
      'severity already exists';
  END IF;
END $$;
