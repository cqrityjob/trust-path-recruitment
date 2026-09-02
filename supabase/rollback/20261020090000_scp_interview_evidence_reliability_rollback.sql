-- Rollback for 20261020090000_scp_interview_evidence_reliability.sql
--
-- Removes the origin-in-case guard and restores the five writers to the
-- definitions they had before it, byte-for-byte from the migrations that
-- last defined them:
--
--   scp_iv_author_evidence            20260920090000
--   scp_iv_confirm_evidence_proposal  20260930090000
--   scp_iv_record_assessment          20261009090000
--   scp_iv_mark_assessed              20260920090000
--   scp_iv_report_blockers            20260921090000
--   scp_iv_finalise_report            20260920090000
--
-- ── WHAT REVERTING COSTS ───────────────────────────────────────────────
--
-- This reopens the reliability gaps the forward migration closed, and it is
-- worth being exact about which:
--
--   * A retried or double-clicked "use as material" inserts the same excerpt
--     twice, and both copies reach the report.
--   * A retried identical assessment save is refused with a supersede-reason
--     error, so a save that already landed is reported as a failure.
--   * A retried decision on a proposal is refused as already reviewed.
--   * A second "complete the report" writes a second report version with the
--     same content and marks the first superseded.
--   * Evidence may again cite a note or passage from ANOTHER case of the same
--     employer -- including the same candidate's interview for another job --
--     and a dimension from another question.
--   * Material confirmed after a question was assessed no longer blocks the
--     report: the frozen report may show evidence under an assessment that
--     never saw it.
--
--   * Producing a second report version after material changed fails again
--     with a raw constraint error (see the constraint note below).
--
-- Nothing here is a route around a permission: every membership check and the
-- owner/admin finalisation rule are identical before and after. No table,
-- column, policy, grant or index is touched, because the forward migration
-- created none; one CHECK constraint is restored to its original text. No row is rewritten; evidence and assessments recorded while
-- the forward migration was live remain valid rows under these definitions.
--
-- Prefer fixing forward. Run this only if the origin guard is refusing a
-- write the product legitimately makes, and even then, correcting the caller
-- is the smaller change.

BEGIN;

-- The report check constraint, as 20260920090000 wrote it. This is the one
-- statement here that can REFUSE: a database in which a report has actually
-- been superseded by a later version holds rows that the original rule never
-- allowed, and PostgreSQL will not add a constraint those rows violate. That
-- refusal is correct -- those rows are history and must not be edited to fit
-- -- and it means this rollback is only fully applicable while no case has
-- been re-finalised.
ALTER TABLE public.scp_interview_reports
  DROP CONSTRAINT IF EXISTS scp_interview_reports_final;
ALTER TABLE public.scp_interview_reports
  ADD CONSTRAINT scp_interview_reports_final
  CHECK ((status = 'final') = (finalised_at IS NOT NULL));

DROP TRIGGER IF EXISTS scp_interview_evidence_proposals_origin_in_case ON public.scp_interview_evidence_proposals;
DROP TRIGGER IF EXISTS scp_interview_evidence_origin_in_case ON public.scp_interview_evidence;
DROP TRIGGER IF EXISTS scp_interview_findings_origin_in_case ON public.scp_interview_findings;
DROP FUNCTION IF EXISTS public.scp_iv_guard_evidence_origin_in_case();

-- ---- scp_iv_author_evidence, as defined in 20260920090000 -----------------
CREATE OR REPLACE FUNCTION public.scp_iv_author_evidence(
  _case_id uuid, _question_id uuid, _excerpt text,
  _evidence_dimension_id uuid DEFAULT NULL, _pack_competency_id uuid DEFAULT NULL,
  _note_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.scp_interview_evidence
    (case_id, origin, note_id, excerpt, question_id, evidence_dimension_id,
     pack_competency_id, confirmed_by)
  VALUES (_case_id, 'human_authored', _note_id, _excerpt, _question_id,
          _evidence_dimension_id, _pack_competency_id, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_case_id, 'evidence_authored', 'human', NULL, NULL, NULL, NULL,
    jsonb_build_object('evidence_id', _id));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ---- scp_iv_confirm_evidence_proposal, as defined in 20260930090000 ----
CREATE OR REPLACE FUNCTION public.scp_iv_confirm_evidence_proposal(
  _proposal_id uuid,
  _decision text,                       -- 'accept' | 'edit' | 'reject' | 'unresolved'
  _edited_excerpt text DEFAULT NULL,
  _correction_class text DEFAULT NULL,
  _note text DEFAULT NULL,
  -- 5E as the HUMAN confirms it. NULL means "keep what the engine proposed";
  -- the proposal keeps its own copy either way, so the two remain separable.
  _e1 text DEFAULT NULL,
  _e2 text DEFAULT NULL,
  _e3 text DEFAULT NULL,
  _e4 text DEFAULT NULL,
  _e5 text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.scp_interview_evidence_proposals%ROWTYPE;
  _evidence_id uuid;
BEGIN
  SELECT * INTO _p FROM public.scp_interview_evidence_proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PROPOSAL_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_p.case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _p.review_state <> 'pending' THEN
    RAISE EXCEPTION 'SCP_IV_PROPOSAL_ALREADY_REVIEWED: this proposal is already "%".', _p.review_state
      USING ERRCODE = 'check_violation';
  END IF;
  IF _decision NOT IN ('accept', 'edit', 'reject', 'unresolved') THEN
    RAISE EXCEPTION 'SCP_IV_UNKNOWN_DECISION: "%".', _decision USING ERRCODE = 'check_violation';
  END IF;
  IF _decision IN ('edit', 'reject') AND _correction_class IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_CORRECTION_CLASS_REQUIRED: say WHY it was changed or rejected. "the model was wrong" and "I prefer different words" are different problems with different fixes.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _decision = 'edit' AND (_edited_excerpt IS NULL OR btrim(_edited_excerpt) = '') THEN
    RAISE EXCEPTION 'SCP_IV_EDIT_NEEDS_TEXT' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.scp_interview_evidence_proposals
     SET review_state = CASE _decision
           WHEN 'accept' THEN 'confirmed' WHEN 'edit' THEN 'edited'
           WHEN 'reject' THEN 'rejected' ELSE 'unresolved' END,
         reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = _note, correction_class = _correction_class
   WHERE id = _proposal_id;

  -- Only accept and edit produce evidence. A rejected or unresolved proposal
  -- never reaches the confirmed table, and therefore never reaches a report.
  IF _decision IN ('accept', 'edit') THEN
    INSERT INTO public.scp_interview_evidence
      (case_id, proposal_id, origin, note_id, source_passage_id,
       excerpt, original_excerpt, question_id, evidence_dimension_id,
       pack_competency_id, confirmed_by, correction_note,
       e1_situation, e2_own_role, e3_action, e4_effect, e5_reflection)
    VALUES (_p.case_id, _p.id,
            CASE _decision WHEN 'accept' THEN 'ai_proposed_accepted' ELSE 'ai_proposed_edited' END,
            _p.note_id, _p.source_passage_id,
            CASE _decision WHEN 'accept' THEN _p.excerpt ELSE btrim(_edited_excerpt) END,
            CASE _decision WHEN 'edit' THEN _p.excerpt ELSE NULL END,
            _p.question_id, _p.evidence_dimension_id, _p.pack_competency_id,
            auth.uid(),
            CASE _decision WHEN 'edit' THEN coalesce(_note, 'Korrigerad av granskare.') ELSE NULL END,
            coalesce(nullif(btrim(coalesce(_e1, '')), ''), _p.e1_situation),
            coalesce(nullif(btrim(coalesce(_e2, '')), ''), _p.e2_own_role),
            coalesce(nullif(btrim(coalesce(_e3, '')), ''), _p.e3_action),
            coalesce(nullif(btrim(coalesce(_e4, '')), ''), _p.e4_effect),
            coalesce(nullif(btrim(coalesce(_e5, '')), ''), _p.e5_reflection))
    RETURNING id INTO _evidence_id;
  END IF;

  PERFORM public.scp_iv_record_event(_p.case_id,
    CASE _decision WHEN 'accept' THEN 'evidence_confirmed' WHEN 'edit' THEN 'evidence_edited'
                   WHEN 'reject' THEN 'evidence_rejected' ELSE 'evidence_rejected' END,
    'human', _p.ai_run_id, 'pending', _decision, _note,
    jsonb_build_object('proposal_id', _proposal_id, 'correction_class', _correction_class));

  RETURN _evidence_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_confirm_evidence_proposal(
  uuid, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_confirm_evidence_proposal(
  uuid, text, text, text, text, text, text, text, text, text) TO authenticated, service_role;

-- ---- scp_iv_record_assessment, as defined in 20261009090000 ------------
CREATE OR REPLACE FUNCTION public.scp_iv_record_assessment(
  _case_id uuid, _question_id uuid, _level integer, _rationale text,
  _uncertainty_note text DEFAULT NULL, _supersede_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _anchor_id uuid; _pack uuid; _existing uuid; _id uuid; _evidence_count integer;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _rationale IS NULL OR btrim(_rationale) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_RATIONALE_REQUIRED: a level without reasoning is a number, not an assessment.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pack_version_id INTO _pack FROM public.scp_interview_cases WHERE id = _case_id;
  SELECT a.id INTO _anchor_id FROM public.scp_interview_rating_anchors a
   WHERE a.question_id = _question_id AND a.level = _level;
  IF _anchor_id IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_NO_ANCHOR: the pinned pack defines no level-% anchor for this question.', _level
      USING ERRCODE = 'check_violation';
  END IF;

  -- A level above 0 asserts something about described behaviour, so there has
  -- to BE described behaviour: confirmed evidence for this question. Level 0 is
  -- exempt, because "insufficient evidence" is precisely the judgement you make
  -- when there is none.
  --
  -- This runs before the supersede branch on purpose: a documented change of
  -- mind is not a way around the rule.
  IF _level > 0 THEN
    SELECT count(*) INTO _evidence_count FROM public.scp_interview_evidence
     WHERE case_id = _case_id AND question_id = _question_id;
    IF _evidence_count = 0 THEN
      RAISE EXCEPTION
        'SCP_IV_NO_CONFIRMED_EVIDENCE: a level above 0 must rest on confirmed evidence for this question. If there is none, the honest level is 0 -- insufficient evidence.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Supersede rather than edit, so both judgements survive.
  SELECT id INTO _existing FROM public.scp_interview_assessments
   WHERE case_id = _case_id AND question_id = _question_id
     AND assessor_id = auth.uid() AND superseded_by IS NULL;

  IF _existing IS NOT NULL AND _supersede_reason IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_SUPERSEDE_REASON_REQUIRED: you have already assessed this question. Changing a recorded judgement requires a documented reason.'
      USING ERRCODE = 'check_violation';
  END IF;

  _id := gen_random_uuid();

  -- The original leaves the live index BEFORE the replacement enters it.
  IF _existing IS NOT NULL THEN
    SET CONSTRAINTS public.scp_interview_assessments_superseded_by_fkey DEFERRED;
    UPDATE public.scp_interview_assessments
       SET superseded_by = _id, supersede_reason = _supersede_reason
     WHERE id = _existing;
  END IF;

  INSERT INTO public.scp_interview_assessments
    (id, case_id, question_id, anchor_id, level, rationale, uncertainty_note,
     assessor_id, locked_at)
  VALUES (_id, _case_id, _question_id, _anchor_id, _level, btrim(_rationale),
          _uncertainty_note, auth.uid(), now());

  IF _existing IS NOT NULL THEN
    PERFORM public.scp_iv_record_event(_case_id, 'assessment_superseded', 'human', NULL, NULL, NULL,
      _supersede_reason, jsonb_build_object('previous', _existing, 'replacement', _id));
  END IF;

  PERFORM public.scp_iv_record_event(_case_id, 'assessment_recorded', 'human', NULL, NULL, NULL, NULL,
    jsonb_build_object('question_id', _question_id, 'level', _level));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_assessment(uuid, uuid, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_assessment(uuid, uuid, integer, text, text, text)
  TO authenticated, service_role;

-- ---- scp_iv_mark_assessed, as defined in 20260920090000 ----------------
CREATE OR REPLACE FUNCTION public.scp_iv_mark_assessed(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.scp_iv_set_case_status(_case_id, 'assessed');
  PERFORM public.scp_iv_record_event(_case_id, 'assessment_recorded', 'human', NULL,
    'evidence_review', 'assessed');
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_mark_assessed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_mark_assessed(uuid) TO authenticated, service_role;


-- ---- scp_iv_report_blockers, as defined in 20260921090000 --------------
CREATE OR REPLACE FUNCTION public.scp_iv_report_blockers(_case_id uuid)
RETURNS TABLE (code text, message text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.scp_interview_cases%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'CASE_NOT_FOUND', 'Intervjun finns inte.';
    RETURN;
  END IF;

  IF NOT public.scp_iv_can_read_case(_case_id) THEN
    RETURN QUERY SELECT 'NOT_PERMITTED', 'Du saknar behörighet till den här intervjun.';
    RETURN;
  END IF;

  -- The state precondition, stated in the user's language rather than left to
  -- surface as a transition error after the button is pressed.
  IF _c.status NOT IN ('assessed', 'reported') THEN
    RETURN QUERY SELECT 'ASSESSMENT_NOT_COMPLETE',
      'Bedömningen är inte markerad som klar. Gå till Evidens och välj "Klar med bedömningen" när varje fråga har en bedömning.';
  END IF;

  RETURN QUERY
    SELECT 'QUESTION_NOT_ASSESSED',
           format('%s har ingen registrerad mänsklig bedömning.', q.code)
      FROM public.scp_interview_core_questions q
     WHERE q.pack_version_id = _c.pack_version_id
       AND NOT EXISTS (SELECT 1 FROM public.scp_interview_assessments a
                        WHERE a.case_id = _case_id AND a.question_id = q.id
                          AND a.superseded_by IS NULL);

  RETURN QUERY
    SELECT 'PROPOSALS_AWAITING_REVIEW',
           format('%s AI-förslag har inte granskats av en människa.', count(*)::text)
      FROM public.scp_interview_evidence_proposals p
     WHERE p.case_id = _case_id AND p.review_state = 'pending'
    HAVING count(*) > 0;

  RETURN;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_report_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_report_blockers(uuid) TO authenticated, service_role;


-- ---- scp_iv_finalise_report, as defined in 20260920090000 --------------
CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(_case_id uuid, _draft_run_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), _c.employer_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_FINALISE_ROLE: finalising a candidate interview report requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', code, message), E'\n')
    INTO _n, _blockers FROM public.scp_iv_report_blockers(_case_id);
  IF _n > 0 THEN
    RAISE EXCEPTION E'SCP_IV_REPORT_BLOCKED: this case is not ready for a report.\n%', _blockers
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_interview_reports WHERE case_id = _case_id;

  -- The snapshot. Built ONLY from confirmed evidence and recorded human
  -- assessments: the proposals table is not read here, and cannot be.
  SELECT jsonb_build_object(
    'case', jsonb_build_object(
      'title', _c.title,
      'candidate', _c.candidate_display_name,
      'employer_id', _c.employer_id,
      'status_at_report', _c.status),
    'pinned', jsonb_build_object(
      'pack_version_id', _c.pack_version_id,
      'pack_content_hash', _c.pack_content_hash,
      'role_version_id', _c.role_version_id),
    'sources', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', s.source_kind, 'label', s.label,
               'purpose', s.purpose_code, 'origin', s.origin) ORDER BY s.created_at)
        FROM public.scp_interview_case_sources s
       WHERE s.case_id = _case_id), '[]'::jsonb),
    'questions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'code', q.code, 'order', q.display_order, 'prompt', q.prompt_sv,
               'evidence', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'excerpt', ev.excerpt, 'origin', ev.origin,
                          'confirmed_by', ev.confirmed_by, 'confirmed_at', ev.confirmed_at,
                          'was_corrected', ev.original_excerpt IS NOT NULL))
                   FROM public.scp_interview_evidence ev
                  WHERE ev.case_id = _case_id AND ev.question_id = q.id), '[]'::jsonb),
               'assessment', (
                 SELECT jsonb_build_object(
                          'level', a.level, 'rationale', a.rationale,
                          'uncertainty', a.uncertainty_note,
                          'assessor_id', a.assessor_id, 'assessed_at', a.assessed_at,
                          'anchor', an.anchor_sv,
                          'level_meaning', an.label_sv,
                          'counts_toward_aggregation', an.counts_toward_aggregation)
                   FROM public.scp_interview_assessments a
                   JOIN public.scp_interview_rating_anchors an ON an.id = a.anchor_id
                  WHERE a.case_id = _case_id AND a.question_id = q.id
                    AND a.superseded_by IS NULL LIMIT 1)
             ) ORDER BY q.display_order)
        FROM public.scp_interview_core_questions q
       WHERE q.pack_version_id = _c.pack_version_id), '[]'::jsonb),
    'unresolved', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', f.finding_kind, 'statement', f.statement,
               'state', f.resolution_state) ORDER BY f.created_at)
        FROM public.scp_interview_findings f
       WHERE f.case_id = _case_id
         AND f.resolution_state IN ('open','needs_verification','unresolved_difference')), '[]'::jsonb),
    'ai_disclosure', jsonb_build_object(
      'runs', coalesce((
        SELECT jsonb_agg(DISTINCT jsonb_build_object(
                 'task', r.task, 'task_version', r.task_version,
                 'prompt_version', r.prompt_version, 'policy_version', r.policy_version,
                 'provider', r.provider, 'model', r.model))
          FROM public.scp_interview_ai_runs r
         WHERE r.case_id = _case_id AND r.status = 'succeeded'), '[]'::jsonb),
      'statement',
      'AI har förberett, extraherat och föreslagit. Varje uppgift i denna rapport är bekräftad av en namngiven människa. AI har inte poängsatt, rangordnat eller rekommenderat, och AI har inte fattat anställningsbeslutet.'),
    'decision_boundary',
    'Denna rapport är beslutsstöd. Anställningsbeslutet fattas av behörig människa hos arbetsgivaren och dokumenteras utanför detta underlag.'
  ) INTO _payload;

  INSERT INTO public.scp_interview_reports
    (case_id, version_number, status, draft_ai_run_id, payload, content_hash,
     pack_version_id, pack_content_hash, role_version_id, finalised_by, finalised_at)
  VALUES (_case_id, _next, 'final', _draft_run_id, _payload,
          md5(_payload::text), _c.pack_version_id, _c.pack_content_hash,
          _c.role_version_id, auth.uid(), now())
  RETURNING id INTO _report_id;

  UPDATE public.scp_interview_reports
     SET status = 'superseded'
   WHERE case_id = _case_id AND id <> _report_id AND status = 'final';

  PERFORM public.scp_iv_set_case_status(_case_id, 'reported');
  PERFORM public.scp_iv_record_event(_case_id, 'report_finalised', 'human', NULL,
    'assessed', 'reported', NULL,
    jsonb_build_object('report_id', _report_id, 'version', _next,
                       'content_hash', md5(_payload::text)));

  -- Complete the provenance chain in the graph, tenant-scoped: this report now
  -- carries these confirmed evidence items and these human assessments.
  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'confirmed_evidence', ev.id, 'reported_in', 'report_conclusion', _report_id,
         _c.employer_id, 'Confirmed evidence included in the finalised report.'
    FROM public.scp_interview_evidence ev WHERE ev.case_id = _case_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.scp_intel_edges
    (from_kind, from_id, relation, to_kind, to_id, employer_id, note)
  SELECT 'human_assessment', a.id, 'assessed_against', 'rating_anchor', a.anchor_id,
         _c.employer_id, 'Human judgement recorded against a governed anchor.'
    FROM public.scp_interview_assessments a
   WHERE a.case_id = _case_id AND a.superseded_by IS NULL
  ON CONFLICT DO NOTHING;

  RETURN _report_id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_finalise_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_finalise_report(uuid, uuid) TO authenticated, service_role;


COMMIT;
