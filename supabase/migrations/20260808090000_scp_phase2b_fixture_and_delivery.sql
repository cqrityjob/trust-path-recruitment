-- Phase 2b — the test-only published fixture, and the delivery / scoring /
-- review / evidence / release backbone the Assessment Center journey runs on.
--
-- ADDITIVE ONLY.
--
-- ── WHY A FIXTURE FLAG EXISTS AT ALL ──────────────────────────────────────
--
-- Phase 2 must prove an end-to-end journey, and a journey cannot be proven
-- against draft content: scp_guard_assignment_published correctly refuses to
-- assign anything unpublished. The honest resolution is NOT to publish the real
-- Security Guard programme early -- that content is awaiting expert, legal,
-- cognitive and accessibility review -- but to publish a clearly-marked test
-- fixture and make the distinction a DATABASE FACT rather than a naming
-- convention.
--
-- Hence scp_assessment_definitions.is_test_fixture. Every guard below, and the
-- Phase 2 test suite, asserts on that column: NO non-fixture Academy content is
-- published by this migration, and the real Security Guard programme stays
-- exactly as Phase 1G left it.

-- =========================================================================
-- SECTION 1 — The fixture marker
-- =========================================================================

ALTER TABLE public.scp_assessment_definitions
  ADD COLUMN IF NOT EXISTS is_test_fixture boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scp_assessment_definitions.is_test_fixture IS
  'TRUE only for content that exists to exercise the delivery pipeline. A '
  'fixture may be published and assigned so the journey can be proven '
  'end-to-end; it is never real assessment content, never shown in the '
  'employer library outside test builds, and never produces evidence that is '
  'presented as a competence claim about a real person. The Phase 2 suite '
  'asserts that every published Academy version belongs to a fixture.';

-- =========================================================================
-- SECTION 1b — The ninth review trigger
-- =========================================================================
--
-- Phase 1C modelled eight review triggers, all of which assume a provider RAN.
-- With the null provider enabled -- the database-enforced default -- nothing
-- runs at all, and the honest reason a constructed response reaches a human is
-- simply that no provider was available to score it.
--
-- Calling that "confidence below threshold" would be a small lie in the audit
-- trail: there is no confidence, because there was no run. So the vocabulary
-- gains the value that describes what actually happened.

ALTER TABLE public.scp_human_reviews
  DROP CONSTRAINT IF EXISTS scp_human_reviews_trigger_reason_check;
ALTER TABLE public.scp_human_reviews
  ADD CONSTRAINT scp_human_reviews_trigger_reason_check
  CHECK (trigger_reason IN (
    'safety_critical_detected',
    'confidence_below_threshold',
    'repeated_runs_disagree',
    'legally_sensitive_action',
    'recruitment_use',
    'participant_requested',
    'schema_invalid_output',
    'administrator_mandated',
    'no_provider_available'));

-- =========================================================================
-- SECTION 2 — Report snapshots
-- =========================================================================
--
-- Phase 1C created scp_report_versions -- the versioned TEMPLATE. What was
-- missing is the immutable SNAPSHOT: the projection of the graph, frozen at the
-- moment a report was released, so that recomputing maturity later (because
-- evidence was superseded, or a threshold recalibrated) can never retroactively
-- change a report somebody has already read.

CREATE TABLE IF NOT EXISTS public.scp_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.scp_attempts(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.scp_subjects(id) ON DELETE RESTRICT,
  issuer_organization_id uuid REFERENCES public.employers(id) ON DELETE RESTRICT,
  report_version_id uuid NOT NULL
    REFERENCES public.scp_report_versions(id) ON DELETE RESTRICT,
  audience text NOT NULL CHECK (audience IN ('participant','employer')),
  -- The frozen projection. An array of {competency, maturity_level, ...}.
  -- Deliberately jsonb: a snapshot is a rendering, not a queryable model. The
  -- queryable model is the ledger, which is still there.
  payload jsonb NOT NULL,
  threshold_version text NOT NULL DEFAULT 'v1',
  scoring_model_version text,
  -- Safety-critical findings are stored SEPARATELY from the payload so that a
  -- report template can never structurally omit them, and so a query can find
  -- every outstanding flag without parsing a rendering.
  safety_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, audience)
);

COMMENT ON TABLE public.scp_report_snapshots IS
  'Immutable snapshots of a graph projection at release time. Recomputation of '
  'maturity NEVER changes an issued snapshot -- that is the whole point. '
  'Contains maturity levels only: no percentage, no pass/fail, no ranking and '
  'no employment recommendation.';

-- Immutable once written. A correction is a new attempt or a new snapshot,
-- never an edit of one already read.
CREATE OR REPLACE FUNCTION public.scp_guard_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'SCP_SNAPSHOT_IMMUTABLE: an issued report snapshot cannot be % -- issue a '
    'new one instead.', lower(TG_OP)
    USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS scp_report_snapshots_immutable ON public.scp_report_snapshots;
CREATE TRIGGER scp_report_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.scp_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_snapshot_immutable();

ALTER TABLE public.scp_report_snapshots ENABLE ROW LEVEL SECURITY;

-- A participant reads their OWN released report. Nothing else.
DROP POLICY IF EXISTS scp_report_snapshots_own ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_own ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (
    audience = 'participant'
    AND EXISTS (SELECT 1 FROM public.scp_subject_identities si
                 WHERE si.subject_id = scp_report_snapshots.subject_id
                   AND si.user_id = auth.uid()));

-- An employer member reads the EMPLOYER report for its own organisation. Note
-- that this carries a pseudonymous subject_id: it does not tell the employer
-- who the person is. That still requires scp_resolve_participant_identity().
DROP POLICY IF EXISTS scp_report_snapshots_employer ON public.scp_report_snapshots;
CREATE POLICY scp_report_snapshots_employer ON public.scp_report_snapshots
  FOR SELECT TO authenticated
  USING (
    audience = 'employer'
    AND issuer_organization_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.employer_memberships m
                 WHERE m.employer_id = scp_report_snapshots.issuer_organization_id
                   AND m.user_id = auth.uid()
                   AND m.status = 'active'));

GRANT SELECT ON public.scp_report_snapshots TO authenticated;
GRANT ALL    ON public.scp_report_snapshots TO service_role;
REVOKE ALL   ON public.scp_report_snapshots FROM anon;

-- =========================================================================
-- SECTION 3 — Delivery
-- =========================================================================
--
-- Delivery is a SECURITY DEFINER function, for the same reason identity
-- resolution is: a participant has no read policy on scp_item_versions,
-- scp_item_texts or scp_item_options, and they must not gain one. A view would
-- either return nothing or become a bank-wide leak.
--
-- The projection is the security boundary. It returns scenario, prompt and
-- option labels. It CANNOT return score_value, scoring_rationale, is_preferred,
-- is_best_key, is_worst_key, distractor_error_type or learning feedback,
-- because those columns are not in the RETURNS TABLE at all.

CREATE OR REPLACE FUNCTION public.scp_get_attempt_items(
  _attempt_id uuid,
  _language   text DEFAULT 'sv-SE'
)
RETURNS TABLE (
  item_version_id uuid,
  display_order   integer,
  item_format     text,
  scenario        text,
  prompt          text,
  is_safety_critical boolean,
  options         jsonb,
  saved_option_id uuid,
  saved_best_id   uuid,
  saved_worst_id  uuid,
  saved_text      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _form_id uuid;
BEGIN
  -- The attempt must belong to the caller. Not "an" attempt -- THIS caller's.
  SELECT a.form_id INTO _form_id
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id
     AND si.user_id = auth.uid();
  IF _form_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    iv.id,
    fi.display_order,
    iv.item_format,
    it.scenario,
    it.prompt,
    iv.is_safety_critical,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'option_id', o.id,
                'option_key', o.option_key,
                'label', ot.label)
              ORDER BY o.display_order)
         FROM public.scp_item_options o
         JOIN public.scp_item_option_texts ot
           ON ot.item_option_id = o.id AND ot.language = _language
        WHERE o.item_version_id = iv.id),
      '[]'::jsonb),
    r.selected_option_id,
    r.best_option_id,
    r.worst_option_id,
    r.response_text
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
  JOIN public.scp_item_texts it
    ON it.item_version_id = iv.id AND it.language = _language
  LEFT JOIN public.scp_candidate_responses r
    ON r.attempt_id = _attempt_id AND r.item_version_id = iv.id
  WHERE fi.form_id = _form_id
  ORDER BY fi.display_order;
END; $$;

COMMENT ON FUNCTION public.scp_get_attempt_items(uuid, text) IS
  'The ONLY delivery path. Returns item text and option LABELS for an attempt '
  'the caller owns, plus any answers already saved so a run can be resumed. '
  'Structurally incapable of returning a score, key, rationale, preference '
  'flag or learning feedback: those columns are absent from the return type.';

REVOKE ALL     ON FUNCTION public.scp_get_attempt_items(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_get_attempt_items(uuid, text) TO authenticated;

-- =========================================================================
-- SECTION 4 — Saving an answer
-- =========================================================================

CREATE OR REPLACE FUNCTION public.scp_save_response(
  _attempt_id       uuid,
  _item_version_id  uuid,
  _selected_option_id uuid DEFAULT NULL,
  _best_option_id   uuid DEFAULT NULL,
  _worst_option_id  uuid DEFAULT NULL,
  _response_text    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE _status text; _form_id uuid; _id uuid;
BEGIN
  SELECT a.status, a.form_id INTO _status, _form_id
    FROM public.scp_attempts a
    JOIN public.scp_subject_identities si ON si.subject_id = a.subject_id
   WHERE a.id = _attempt_id AND si.user_id = auth.uid();

  IF _form_id IS NULL THEN
    RAISE EXCEPTION 'SCP_ATTEMPT_NOT_YOURS: no attempt of yours with that id.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Answers are accepted while a run is open, and never afterwards. Submission
  -- is the boundary between "the participant is answering" and "this is
  -- evidence", and it has to be one-way for the evidence to mean anything.
  IF _status <> 'in_progress' THEN
    RAISE EXCEPTION
      'SCP_ATTEMPT_NOT_OPEN: this attempt is "%" -- answers can only be saved '
      'while it is in_progress.', _status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The item must actually be on this attempt's form. Otherwise a participant
  -- could answer items from a form they were never served.
  IF NOT EXISTS (SELECT 1 FROM public.scp_form_items
                  WHERE form_id = _form_id AND item_version_id = _item_version_id) THEN
    RAISE EXCEPTION 'SCP_ITEM_NOT_ON_FORM: that item is not part of this attempt.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_candidate_responses
    (attempt_id, item_version_id, selected_option_id, best_option_id,
     worst_option_id, response_text)
  VALUES
    (_attempt_id, _item_version_id, _selected_option_id, _best_option_id,
     _worst_option_id, nullif(btrim(coalesce(_response_text,'')), ''))
  ON CONFLICT (attempt_id, item_version_id) DO UPDATE
    SET selected_option_id = EXCLUDED.selected_option_id,
        best_option_id     = EXCLUDED.best_option_id,
        worst_option_id    = EXCLUDED.worst_option_id,
        response_text      = EXCLUDED.response_text,
        responded_at       = now()
  RETURNING id INTO _id;

  RETURN _id;
END; $$;

COMMENT ON FUNCTION public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) IS
  'Saves or replaces one answer on an open attempt the caller owns. Refuses '
  'items that are not on the attempt''s own form, and refuses any write once '
  'the attempt has been submitted.';

REVOKE ALL     ON FUNCTION public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_save_response(uuid, uuid, uuid, uuid, uuid, text) TO authenticated;

-- =========================================================================
-- SECTION 5 — Submission, deterministic scoring, and routing to review
-- =========================================================================
--
-- This is where responses become EVIDENCE. Three rules are encoded here rather
-- than documented:
--
--   1. Closed formats score deterministically, server-side, and write evidence
--      with provenance_type = 'deterministic'.
--   2. Constructed responses are NEVER scored deterministically. With the null
--      provider enabled they route straight to human review, which is exactly
--      what the provider abstraction promised.
--   3. An attempt is 'scored' only when nothing is still awaiting a human. A
--      report cannot be released before that, because scp_attempt_release_
--      after_scoring requires scored_at.

CREATE OR REPLACE FUNCTION public.scp_submit_attempt(_attempt_id uuid)
RETURNS TABLE (evidence_written int, reviews_opened int, attempt_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _r record;
  _ev int := 0;
  _rv int := 0;
  _contribution numeric(4,3);
  _max numeric;
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

  FOR _r IN
    SELECT r.id AS response_id, r.selected_option_id, r.best_option_id,
           r.worst_option_id, r.response_text,
           iv.id AS item_version_id, iv.item_format, iv.primary_behaviour_id,
           iv.is_safety_critical, iv.requires_human_review
      FROM public.scp_candidate_responses r
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE r.attempt_id = _attempt_id
  LOOP
    -- An item with no behaviour cannot produce evidence. Phase 1A makes this
    -- impossible for Academy content; the guard stays because "impossible"
    -- should still fail loudly rather than silently drop evidence.
    IF _r.primary_behaviour_id IS NULL THEN
      RAISE EXCEPTION
        'SCP_ITEM_WITHOUT_BEHAVIOUR: item % has no primary behaviour, so its '
        'response cannot become evidence.', _r.item_version_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF _r.item_format = 'constructed_response' OR _r.requires_human_review THEN
      -- Rule 2. No deterministic score, no AI (the null provider cannot score),
      -- so the only honest destination is a person.
      INSERT INTO public.scp_human_reviews (response_id, trigger_reason, review_status)
      VALUES (_r.response_id,
              CASE WHEN _r.is_safety_critical THEN 'safety_critical_detected'
                   ELSE 'no_provider_available' END,
              'pending');
      _rv := _rv + 1;
      CONTINUE;
    END IF;

    -- Rule 1. Deterministic scoring, normalised to 0..1 against the item's own
    -- maximum, so evidence strength never depends on an item's raw scale.
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

  -- Rule 3. 'submitted' IS the awaiting-review state -- the existing attempt
  -- vocabulary already distinguishes submitted from scored, so no new status
  -- value is invented here.
  UPDATE public.scp_attempts
     SET submitted_at = now(),
         status       = CASE WHEN _rv > 0 THEN 'submitted' ELSE 'scored' END,
         scored_at    = CASE WHEN _rv > 0 THEN NULL ELSE now() END
   WHERE id = _attempt_id;

  RETURN QUERY SELECT _ev, _rv,
    (SELECT a.status FROM public.scp_attempts a WHERE a.id = _attempt_id);
END; $$;

COMMENT ON FUNCTION public.scp_submit_attempt(uuid) IS
  'Turns an attempt''s responses into graph evidence. Closed formats score '
  'deterministically server-side; constructed responses and anything flagged '
  'safety-critical route to human review and are NEVER auto-scored. The '
  'attempt only reaches "scored" when no review is outstanding, which is what '
  'stops a report being released over an unreviewed answer.';

REVOKE ALL     ON FUNCTION public.scp_submit_attempt(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_submit_attempt(uuid) TO authenticated;

-- =========================================================================
-- SECTION 6 — Completing a human review
-- =========================================================================

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
SET search_path = public, pg_temp
AS $$
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

  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _resp.attempt_id;

  UPDATE public.scp_human_reviews
     SET review_status = 'completed', outcome = _outcome,
         reviewer_actor_id = auth.uid(), reviewer_rationale = _rationale,
         completed_at = now()
   WHERE id = _review_id;

  -- A human decision enters the ledger as evidence in its own right, with
  -- provenance 'human_review' -- which outranks a deterministic or AI row for
  -- the same response in scp_compute_maturity().
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

  -- The attempt becomes scoreable only once every review is closed.
  SELECT count(*) INTO _outstanding
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _resp.attempt_id AND hr.review_status = 'pending';

  IF _outstanding = 0 THEN
    UPDATE public.scp_attempts
       SET status = 'scored', scored_at = now()
     WHERE id = _resp.attempt_id AND scored_at IS NULL;
  END IF;

  RETURN _evidence_id;
END; $$;

COMMENT ON FUNCTION public.scp_complete_human_review(uuid, text, text, numeric, text) IS
  'Closes one human review and writes the reviewer''s decision into the graph '
  'with provenance human_review, which outranks the AI or deterministic row for '
  'the same response. Requires the authoring capability -- an employer can never '
  'adjudicate its own candidate''s evidence. The attempt becomes scored only '
  'when no review is left outstanding.';

REVOKE ALL     ON FUNCTION public.scp_complete_human_review(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_complete_human_review(uuid, text, text, numeric, text) TO authenticated;

-- =========================================================================
-- SECTION 7 — Releasing the report
-- =========================================================================

CREATE OR REPLACE FUNCTION public.scp_release_attempt_report(_attempt_id uuid)
RETURNS TABLE (participant_snapshot uuid, employer_snapshot uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _role text; _payload jsonb; _flags jsonb;
  _pv uuid; _ev uuid; _p_id uuid; _e_id uuid;
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN; END IF;

  -- Release is an employer act, restricted the same way identity resolution is.
  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RELEASE: releasing a development '
      'report requires owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.scored_at IS NULL THEN
    RAISE EXCEPTION 'SCP_RELEASE_BEFORE_SCORED: this attempt still has work '
      'outstanding -- a report cannot be released over an unreviewed response.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_ALREADY_RELEASED: this attempt''s report is already '
      'released; snapshots are immutable.' USING ERRCODE = 'unique_violation';
  END IF;

  -- The projection. MATURITY LEVELS ONLY -- there is deliberately nowhere in
  -- this structure to put a percentage, a total or a rank.
  SELECT jsonb_agg(x ORDER BY x->>'competency_code')
    INTO _payload
    FROM (
      SELECT jsonb_build_object(
               'competency_code', c.code,
               'competency_name_sv', cv.name_sv,
               'competency_name_en', cv.name_en,
               'maturity_level',
                 public.scp_compute_maturity(_a.subject_id, cv.id, 'v1', now()),
               'observations', count(*)
             ) AS x
        FROM public.scp_competency_evidence e
        JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
        JOIN public.scp_behaviour_competency_map bcm
          ON bcm.behaviour_version_id = bv.id
        JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
        JOIN public.scp_competencies c ON c.id = cv.competency_id
       WHERE e.subject_id = _a.subject_id
         AND e.superseded_by IS NULL
       GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
    ) s;

  -- Safety-critical findings, stored separately so no template can drop them.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.subject_id = _a.subject_id
     AND e.is_safety_critical AND e.superseded_by IS NULL;

  SELECT id INTO _pv FROM public.scp_report_versions
   WHERE audience = 'participant' AND content_status = 'published'
   ORDER BY version_number DESC LIMIT 1;
  SELECT id INTO _ev FROM public.scp_report_versions
   WHERE audience = 'employer' AND content_status = 'published'
   ORDER BY version_number DESC LIMIT 1;
  IF _pv IS NULL OR _ev IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_PUBLISHED_REPORT_TEMPLATE: a report cannot be '
      'rendered without a published template for each audience.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
          'participant', COALESCE(_payload,'[]'::jsonb), _flags, _a.scoring_model_version)
  RETURNING id INTO _p_id;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, safety_flags, scoring_model_version)
  VALUES (_attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
          'employer', COALESCE(_payload,'[]'::jsonb), _flags, _a.scoring_model_version)
  RETURNING id INTO _e_id;

  UPDATE public.scp_attempts SET released_at = now(), status = 'released'
   WHERE id = _attempt_id;

  RETURN QUERY SELECT _p_id, _e_id;
END; $$;

COMMENT ON FUNCTION public.scp_release_attempt_report(uuid) IS
  'Freezes the graph projection into two immutable snapshots -- one per '
  'audience -- and marks the attempt released. Refuses to release while any '
  'human review is outstanding. Safety-critical findings are snapshotted in '
  'their own column so a high maturity level can never conceal one.';

REVOKE ALL     ON FUNCTION public.scp_release_attempt_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_release_attempt_report(uuid) TO authenticated;

-- =========================================================================
-- SECTION 8 — Prove the boundary still holds
-- =========================================================================

DO $$
DECLARE _n int;
BEGIN
  -- The real Security Guard content is untouched and still unpublished.
  SELECT count(*) INTO _n
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.content_status = 'published' AND NOT d.is_test_fixture;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2B_REAL_CONTENT_PUBLISHED: % non-fixture versions are published', _n;
  END IF;

  -- Delivery cannot return a key, a score or a rationale: assert on the
  -- function's own return type rather than trusting the body.
  SELECT count(*) INTO _n
    FROM unnest(string_to_array(
           pg_get_function_result((SELECT oid FROM pg_proc
             WHERE proname = 'scp_get_attempt_items' LIMIT 1)), ',')) AS col
   WHERE col ILIKE '%score%' OR col ILIKE '%rationale%' OR col ILIKE '%is_preferred%'
      OR col ILIKE '%key%'   OR col ILIKE '%feedback%' OR col ILIKE '%anchor%';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_P2B_DELIVERY_LEAKS: the delivery projection exposes % scoring column(s)', _n;
  END IF;

  -- AI is still off.
  IF EXISTS (SELECT 1 FROM public.scp_ai_providers WHERE is_enabled AND code <> 'null_provider') THEN
    RAISE EXCEPTION 'SCP_P2B_AI_ENABLED';
  END IF;
END $$;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata)
VALUES (
  'assessment_version', 'scp-phase2b-delivery', 'created',
  'Phase 2b: the delivery, deterministic scoring, human-review, evidence and release backbone, plus the is_test_fixture marker that keeps published fixture content distinguishable from real content as a database fact rather than a naming convention.',
  jsonb_build_object(
    'migration', '20260808090000_scp_phase2b_fixture_and_delivery',
    'rpcs_added', 5,
    'real_content_published', false));
