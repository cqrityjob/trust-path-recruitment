-- Self-reported work behaviour becomes a FIRST-CLASS, SEPARATE kind of evidence.
--
-- ── THE PRODUCT RULE THIS ENFORCES ──────────────────────────────────────
--
--     "I say I do this"  must never become  "I demonstrated this".
--
-- A recruitment assessment asks two structurally different questions. A
-- scenario asks the person to DO something and we observe the choice. A
-- work-behaviour item asks the person to DESCRIBE their own habits and we
-- record the description. Both are useful. They are not the same claim, and a
-- report that blends them is making a claim the assessment never earned.
--
-- Today the platform cannot tell them apart. scp_submit_attempt stamps every
-- response with source_type = 'assessment_response' regardless of what the item
-- asked, so a self-description would land in the ledger indistinguishable from
-- an observed choice, would be counted by scp_compute_maturity, and would show
-- up on an employer report as measured competence. That is the defect this
-- migration closes BEFORE any self-report content exists — there are currently
-- zero biq_frequency items in the bank, so nothing historical moves.
--
-- ── WHY THE SOURCE-TYPE REGISTRY, AND NOT A NEW TABLE ───────────────────
--
-- scp_evidence_source_types already exists precisely for this: "Evidence source
-- types as a REGISTRY, not an enum. Adding a future source is then a row, not a
-- migration that rewrites a CHECK on a live ledger." And #47 already added the
-- exact lever this needs — counts_toward_maturity — with the argument written
-- out in 20260825091000: neither tuning contribution nor tuning confidence can
-- make a non-competence source neutral, because one silently penalises and the
-- other silently rewards. The only neutral answer is to keep the row out of the
-- computation entirely.
--
-- Self-report is the same shape of problem as training completion:
--
--     self_report.counts_toward_maturity = false
--
-- The evidence is still written, still queryable, still shown to the employer
-- in its own clearly-labelled section, and still frozen into the snapshot. It
-- simply never becomes a claim about measured competence. A person who
-- describes themselves generously gains nothing on the observed axis, and a
-- person who describes themselves modestly loses nothing.
--
-- ── WHY THE ITEM DECLARES IT, AND NOT A FORMAT LOOKUP ───────────────────
--
-- `CASE WHEN item_format = 'biq_frequency' THEN 'self_report' END` would work
-- today and would be a trap later: item_format is a RENDERING decision (what
-- control the participant sees) and the evidence kind is an EPISTEMIC one (what
-- the answer is allowed to prove). They correlate now and will not always.
--
-- So the author declares it on the item version, it is reviewable in one
-- SELECT, and a guard keeps the declaration honest: a self-report item may not
-- also be a safety-critical observation or carry a human-review requirement,
-- because a reviewer cannot verify a person's description of their own habits
-- and a self-description is not a safety finding.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- Additive only. One registry row, one column with a safe default, one guard,
-- one CREATE OR REPLACE of scp_submit_attempt. No table, constraint, policy or
-- grant is dropped; no existing row is rewritten. Every item version in the
-- bank keeps evidence_source_type = 'assessment_response', which is exactly
-- what scp_submit_attempt hard-coded before, so replay is behaviour-identical.
--
-- Remediation: restore scp_submit_attempt from 20260819120000, drop the column
-- and the guard, delete the registry row. No data is lost by doing so.
--
-- Dependencies, verified present: public.scp_evidence_source_types (with
-- counts_toward_maturity), public.scp_item_versions, public.scp_competency_evidence,
-- public.scp_submit_attempt(uuid).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The source type
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_evidence_source_types
  (code, name_sv, name_en, has_active_writer, counts_toward_maturity)
VALUES
  ('self_report', 'Självrapporterat arbetsbeteende', 'Self-reported work behaviour', true, false)
ON CONFLICT (code) DO UPDATE
  SET name_sv = EXCLUDED.name_sv,
      name_en = EXCLUDED.name_en,
      has_active_writer = EXCLUDED.has_active_writer,
      counts_toward_maturity = EXCLUDED.counts_toward_maturity;

COMMENT ON TABLE public.scp_evidence_source_types IS
  'Evidence source types as a registry, not an enum. counts_toward_maturity is '
  'the governance lever: training_completion and self_report are both false, '
  'for different reasons that reach the same place. Completing training is '
  'development activity rather than proof of competence; describing your own '
  'habits is a statement about yourself rather than an observation of you. '
  'Both are recorded, both are shown to their audience, and neither becomes a '
  'measured-competence claim. Turning either to true is a governance decision '
  'requiring validation evidence.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The item declares what kind of evidence it can produce
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_item_versions
  ADD COLUMN IF NOT EXISTS evidence_source_type text NOT NULL
    DEFAULT 'assessment_response'
    REFERENCES public.scp_evidence_source_types(code) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_item_versions.evidence_source_type IS
  'What KIND of evidence an answer to this item is. assessment_response = the '
  'participant did something and the choice was observed. self_report = the '
  'participant described their own habits. The distinction is epistemic, not a '
  'rendering detail, which is why it is declared here rather than inferred from '
  'item_format. scp_submit_attempt stamps the evidence row from this column, so '
  'a report can separate the two and the maturity model can decline to count '
  'the second.';

-- The declaration has to stay honest, so three things a self-report item may
-- not be, each for its own reason:
--
--   * not safety-critical  — a safety finding is an observation about conduct,
--     and nobody's description of their own habits is one;
--   * not human-reviewed   — a reviewer can judge what a person WROTE about a
--     scenario; they cannot verify whether the person really does tidy up after
--     themselves on a night shift, and asking them to would invite exactly the
--     character judgement this product refuses to make;
--   * not a constructed response — free text needs a reviewer, see above.
CREATE OR REPLACE FUNCTION public.scp_guard_evidence_source_honesty()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evidence_source_type <> 'self_report' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_safety_critical THEN
    RAISE EXCEPTION
      'SCP_SELF_REPORT_NOT_SAFETY_CRITICAL: item version % is self-reported '
      'work behaviour and cannot also be a safety-critical observation. A '
      'safety finding is something a person did, not something they said about '
      'themselves.', NEW.id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.requires_human_review THEN
    RAISE EXCEPTION
      'SCP_SELF_REPORT_NOT_REVIEWABLE: item version % is self-reported work '
      'behaviour and cannot require human review. A reviewer can judge an '
      'answer to a scenario; they cannot verify a person''s description of '
      'their own habits, and asking them to invites a character judgement this '
      'product does not make.', NEW.id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.item_format = 'constructed_response' THEN
    RAISE EXCEPTION
      'SCP_SELF_REPORT_NOT_FREE_TEXT: item version % is self-reported work '
      'behaviour, and free text has no deterministic reading. Use a closed '
      'response format, or classify the item as an assessment response and let '
      'a reviewer read it.', NEW.id USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_item_versions_evidence_source_honesty ON public.scp_item_versions;
CREATE TRIGGER scp_item_versions_evidence_source_honesty
  BEFORE INSERT OR UPDATE ON public.scp_item_versions
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_evidence_source_honesty();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The writer stamps what the item declared
--
-- Body copied from 20260819120000 with ONE substantive change: the literal
-- 'assessment_response' in the INSERT becomes _r.evidence_source_type. Every
-- gate, every refusal and every other column is byte-for-byte the same, so a
-- bank with no self-report items behaves identically to before.
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
END; $function$;

COMMENT ON FUNCTION public.scp_submit_attempt(uuid) IS
  'Turns a completed run into evidence. Constructed responses, items flagged '
  'for review and every safety-critical item go to a person instead of being '
  'scored here. Each evidence row is stamped with the source type the ITEM '
  'declared, so an observed choice and a self-description are distinguishable '
  'for the whole life of the ledger -- and self_report evidence never reaches '
  'scp_compute_maturity, by registry rule rather than by anything this '
  'function decides.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Proof, in the migration, on the real functions
--
-- The claim is arithmetic, so it is checked arithmetically: a competency's
-- maturity must be IDENTICAL before and after adding self-report evidence to
-- the same subject.
--
-- The whole probe runs inside a plpgsql sub-block that ends by raising a
-- sentinel, so every row it wrote is rolled back to the savepoint the block
-- opened. That is the only way to leave nothing behind: evidence is
-- append-only by trigger, exactly as it should be, so the proof cannot tidy up
-- after itself with a DELETE.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _proof text;
BEGIN
  BEGIN
    DECLARE
      _subj uuid; _bv uuid; _cv uuid; _before text; _after text;
    BEGIN
      SELECT bv.id, m.competency_version_id INTO _bv, _cv
        FROM public.scp_behaviour_versions bv
        JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
       LIMIT 1;
      IF _bv IS NULL THEN
        RAISE EXCEPTION 'SCP_SR_NO_GRAPH: the competency graph is missing, so '
          'the isolation proof cannot run.';
      END IF;

      INSERT INTO public.scp_subjects DEFAULT VALUES RETURNING id INTO _subj;

      -- Three ordinary observed observations at 0.800, in three contexts.
      INSERT INTO public.scp_competency_evidence
        (subject_id, behaviour_version_id, source_type, source_ref,
         provenance_type, context_type, context_ref, contribution, confidence)
      SELECT _subj, _bv, 'assessment_response', gen_random_uuid(),
             'deterministic', 'scenario', gen_random_uuid(), 0.800, 0.900
        FROM generate_series(1,3);

      _before := public.scp_compute_maturity(_subj, _cv);

      -- Two self-reports that, if counted, would move BOTH the weighted mean
      -- and the source-type count -- the two failure modes #47 wrote out.
      INSERT INTO public.scp_competency_evidence
        (subject_id, behaviour_version_id, source_type, source_ref,
         provenance_type, context_type, context_ref, contribution, confidence)
      SELECT _subj, _bv, 'self_report', gen_random_uuid(),
             'deterministic', 'assessment_form', gen_random_uuid(), 1.000, 1.000
        FROM generate_series(1,2);

      _after := public.scp_compute_maturity(_subj, _cv);

      IF _before IS DISTINCT FROM _after THEN
        RAISE EXCEPTION
          'SCP_SR_ISOLATION_BROKEN: adding self-report evidence moved maturity '
          'from % to %. Self-reported behaviour must never change a '
          'measured-competence claim.', _before, _after;
      END IF;

      _proof := _before;
      RAISE EXCEPTION 'SCP_SR_PROOF_ROLLBACK';
    END;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SCP_SR_PROOF_ROLLBACK%' THEN RAISE; END IF;
  END;

  RAISE NOTICE
    'self_report isolation proven: maturity stayed % with self-report evidence present',
    coalesce(_proof, '(unset)');
END $$;

-- And the authoring guard actually refuses. Same rollback discipline.
DO $$
BEGIN
  BEGIN
    DECLARE _item uuid; _cv uuid; _bv uuid;
    BEGIN
      SELECT bv.id, cv.competency_id INTO _bv, _cv
        FROM public.scp_behaviour_versions bv
        JOIN public.scp_behaviour_competency_map m ON m.behaviour_version_id = bv.id
        JOIN public.scp_competency_versions cv ON cv.id = m.competency_version_id
       LIMIT 1;

      INSERT INTO public.scp_items (slug) VALUES ('scp-self-report-guard-probe')
      RETURNING id INTO _item;

      BEGIN
        INSERT INTO public.scp_item_versions
          (item_id, version_number, item_format, competency_id,
           primary_behaviour_id, mode, observable_behavior, response_process,
           evidence_source_type, is_safety_critical)
        VALUES (_item, 1, 'biq_frequency', _cv, _bv, 'assessment',
                'probe', 'probe', 'self_report', true);
        RAISE EXCEPTION
          'SCP_SR_GUARD_MISSING: a safety-critical self-report item was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      BEGIN
        INSERT INTO public.scp_item_versions
          (item_id, version_number, item_format, competency_id,
           primary_behaviour_id, mode, observable_behavior, response_process,
           evidence_source_type, requires_human_review)
        VALUES (_item, 1, 'biq_frequency', _cv, _bv, 'assessment',
                'probe', 'probe', 'self_report', true);
        RAISE EXCEPTION
          'SCP_SR_GUARD_MISSING: a human-reviewed self-report item was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      BEGIN
        INSERT INTO public.scp_item_versions
          (item_id, version_number, item_format, competency_id,
           primary_behaviour_id, mode, observable_behavior, response_process,
           evidence_source_type)
        VALUES (_item, 1, 'constructed_response', _cv, _bv, 'assessment',
                'probe', 'probe', 'self_report');
        RAISE EXCEPTION
          'SCP_SR_GUARD_MISSING: a free-text self-report item was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      RAISE EXCEPTION 'SCP_SR_PROOF_ROLLBACK';
    END;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'SCP_SR_PROOF_ROLLBACK%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'self_report authoring guard proven: three dishonest declarations refused';
END $$;
