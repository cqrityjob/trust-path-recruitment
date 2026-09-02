-- ============================================================================
-- Interview evidence reliability — what a recruiter confirms is exactly what
-- the assessor and the final report rely on
-- ============================================================================
--
-- Created with `supabase migration new scp_interview_evidence_reliability`.
-- The CLI stamps the wall clock (2026-09-02) and this repository's migration
-- versions deliberately run AHEAD of it; per the established convention the
-- CLI output is renamed to the next canonical slot after 20261019090000.
--
-- ── WHAT THE AUDIT FOUND ────────────────────────────────────────────────────
--
-- The evidence chain was already the right SHAPE: interviewer notes are a
-- source, AI proposals are a separate table with no path to a report, confirmed
-- evidence is written only by two SECURITY DEFINER RPCs and holds no UPDATE or
-- DELETE grant for clients, assessments supersede rather than edit, the report
-- is a hashed snapshot behind an immutability trigger, and every write is
-- gated on membership of the case's employer.
--
-- Five gaps remained, all of the same family -- the chain trusted its callers
-- to behave once:
--
--   1. scp_iv_author_evidence inserted a new row on every call. A double-click,
--      a network retry or a reopened screen produced the same excerpt twice,
--      and both copies reached the report.
--   2. scp_iv_record_assessment refused a second identical save with an error
--      about supersede reasons, so a retry of a save that had already landed
--      was reported to the recruiter as a failure.
--   3. scp_iv_confirm_evidence_proposal refused a retried decision the same
--      way, so a retried "confirm" that had already succeeded looked like a
--      refusal.
--   4. scp_iv_finalise_report wrote a NEW report version on every call. Two
--      clicks on "complete the report" produced v1 and v2 with the same
--      content and v1 marked superseded.
--   5. Nothing bound a piece of evidence to the case it cites. A note id from
--      one interview -- the same candidate's interview for a different job,
--      say -- could be attached as the provenance of evidence in another,
--      and an evidence dimension from another question could be attached to
--      this one. The question-in-pinned-pack guard did not catch it because
--      both cases pin the same pack.
--
-- And one contract was missing rather than broken: an assessment referenced
-- no evidence state. Confirmed evidence is append-only, so material could be
-- added AFTER a question was assessed, and the report then showed the new
-- material under an assessment that had never seen it. Silent drift.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
--
--   S1  A guard trigger: evidence, proposals and findings may only cite a note
--       or passage belonging to THEIR case, a dimension belonging to THEIR
--       question, and a competency from the case's pinned pack.
--   S2  Idempotent writers. The same human confirming the same material for
--       the same question is one item; a repeated identical assessment returns
--       the recorded one; a repeated decision on a proposal returns the
--       evidence it already produced; finalising an unchanged case returns the
--       report it already has. Concurrent calls for one case are serialised on
--       the case row, so two simultaneous clicks cannot both see "nothing yet".
--   S3  The assessment-to-evidence contract, stated once: an assessment covers
--       the confirmed evidence that existed when it was recorded. Evidence is
--       append-only, so that set is exact and reconstructible from timestamps.
--       Material confirmed later is NOT covered, and the report is blocked
--       (ASSESSMENT_PREDATES_MATERIAL) until the question is assessed again --
--       through the existing supersede path, with the existing documented
--       reason. Nothing is invalidated silently and nothing is edited in place.
--
--   S5  One CHECK constraint corrected so that a report can actually be
--       superseded by a later version -- the versioning path the schema always
--       described but, as the new suite found, could never take.
--
-- Nothing here changes Q1-Q8, the anchors, Level 0, the four-stage workflow,
-- who may finalise, the AI provider architecture, or any grant. No table, no
-- column, no policy. Every function keeps its signature. No row is rewritten.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- S1. Evidence cites only its own case, question and pack.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_guard_evidence_origin_in_case()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _note_case uuid; _passage_case uuid; _dim_question uuid;
  _comp_pack uuid; _case_pack uuid;
BEGIN
  IF NEW.note_id IS NOT NULL THEN
    SELECT s.case_id INTO _note_case
      FROM public.scp_interview_session_notes n
      JOIN public.scp_interview_sessions s ON s.id = n.session_id
     WHERE n.id = NEW.note_id;
    IF _note_case IS NULL OR _note_case <> NEW.case_id THEN
      RAISE EXCEPTION
        'SCP_IV_EVIDENCE_ORIGIN_MISMATCH: the cited interview note belongs to a different case. Evidence never travels between interviews.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.source_passage_id IS NOT NULL THEN
    SELECT src.case_id INTO _passage_case
      FROM public.scp_interview_source_passages p
      JOIN public.scp_interview_case_sources src ON src.id = p.source_id
     WHERE p.id = NEW.source_passage_id;
    IF _passage_case IS NULL OR _passage_case <> NEW.case_id THEN
      RAISE EXCEPTION
        'SCP_IV_EVIDENCE_ORIGIN_MISMATCH: the cited source passage belongs to a different case. Evidence never travels between interviews.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Findings carry a question and a passage but no dimension or competency.
  IF TG_TABLE_NAME IN ('scp_interview_evidence_proposals', 'scp_interview_evidence') THEN
    IF NEW.evidence_dimension_id IS NOT NULL THEN
      SELECT d.question_id INTO _dim_question
        FROM public.scp_interview_evidence_dimensions d WHERE d.id = NEW.evidence_dimension_id;
      IF _dim_question IS NULL OR _dim_question <> NEW.question_id THEN
        RAISE EXCEPTION
          'SCP_IV_EVIDENCE_DIMENSION_MISMATCH: the evidence dimension belongs to a different question.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW.pack_competency_id IS NOT NULL THEN
      SELECT c.pack_version_id INTO _comp_pack
        FROM public.scp_interview_pack_competencies c WHERE c.id = NEW.pack_competency_id;
      SELECT pack_version_id INTO _case_pack
        FROM public.scp_interview_cases WHERE id = NEW.case_id;
      IF _comp_pack IS NULL OR _case_pack IS NULL OR _comp_pack <> _case_pack THEN
        RAISE EXCEPTION
          'SCP_IV_EVIDENCE_COMPETENCY_MISMATCH: the requirement belongs to a pack this case did not pin.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_guard_evidence_origin_in_case() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.scp_iv_guard_evidence_origin_in_case() IS
  'Evidence, proposals and findings may cite only a note or passage of their '
  'own case, a dimension of their own question and a competency of the pinned '
  'pack. Interview context is application-scoped; nothing here is reusable '
  'across cases.';

DROP TRIGGER IF EXISTS scp_interview_evidence_proposals_origin_in_case ON public.scp_interview_evidence_proposals;
CREATE TRIGGER scp_interview_evidence_proposals_origin_in_case
  BEFORE INSERT OR UPDATE ON public.scp_interview_evidence_proposals
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_evidence_origin_in_case();
DROP TRIGGER IF EXISTS scp_interview_evidence_origin_in_case ON public.scp_interview_evidence;
CREATE TRIGGER scp_interview_evidence_origin_in_case
  BEFORE INSERT OR UPDATE ON public.scp_interview_evidence
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_evidence_origin_in_case();
DROP TRIGGER IF EXISTS scp_interview_findings_origin_in_case ON public.scp_interview_findings;
CREATE TRIGGER scp_interview_findings_origin_in_case
  BEFORE INSERT OR UPDATE ON public.scp_interview_findings
  FOR EACH ROW EXECUTE FUNCTION public.scp_iv_guard_evidence_origin_in_case();


-- ────────────────────────────────────────────────────────────────────────────
-- S2a. Authoring evidence is idempotent.
--
--      The EXISTING function from 20260920090000, same signature. Two things
--      change: the case row is locked so two simultaneous calls run one after
--      the other, and an identical human-authored item for the same question
--      returns the existing id instead of inserting a twin. An empty excerpt
--      is refused by name rather than by a CHECK constraint's error text.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_author_evidence(
  _case_id uuid, _question_id uuid, _excerpt text,
  _evidence_dimension_id uuid DEFAULT NULL, _pack_competency_id uuid DEFAULT NULL,
  _note_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _text text := btrim(coalesce(_excerpt, ''));
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _text = '' THEN
    RAISE EXCEPTION 'SCP_IV_EVIDENCE_TEXT_REQUIRED: evidence with no words is not evidence.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialise writers for this case. A double-click sends two requests that
  -- would otherwise both find "no such item yet" and both insert.
  PERFORM 1 FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;

  -- The same person confirming the same words for the same question, from the
  -- same note, is ONE piece of evidence. A retry returns it.
  SELECT id INTO _id FROM public.scp_interview_evidence
   WHERE case_id = _case_id AND question_id = _question_id
     AND origin = 'human_authored'
     AND note_id IS NOT DISTINCT FROM _note_id
     AND evidence_dimension_id IS NOT DISTINCT FROM _evidence_dimension_id
     AND pack_competency_id IS NOT DISTINCT FROM _pack_competency_id
     AND btrim(excerpt) = _text
   ORDER BY created_at LIMIT 1;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  INSERT INTO public.scp_interview_evidence
    (case_id, origin, note_id, excerpt, question_id, evidence_dimension_id,
     pack_competency_id, confirmed_by)
  VALUES (_case_id, 'human_authored', _note_id, _text, _question_id,
          _evidence_dimension_id, _pack_competency_id, auth.uid())
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_case_id, 'evidence_authored', 'human', NULL, NULL, NULL, NULL,
    jsonb_build_object('evidence_id', _id));
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid)
  TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- S2b. Deciding on a proposal is idempotent for the SAME decision by the SAME
--      person. A different decision on a reviewed proposal is still refused,
--      exactly as before: a review is not reopened by retrying it.
--
--      The EXISTING function from 20260930090000, same signature; the proposal
--      row is locked for the duration so two simultaneous clicks serialise.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_confirm_evidence_proposal(
  _proposal_id uuid,
  _decision text,                       -- 'accept' | 'edit' | 'reject' | 'unresolved'
  _edited_excerpt text DEFAULT NULL,
  _correction_class text DEFAULT NULL,
  _note text DEFAULT NULL,
  _e1 text DEFAULT NULL,
  _e2 text DEFAULT NULL,
  _e3 text DEFAULT NULL,
  _e4 text DEFAULT NULL,
  _e5 text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.scp_interview_evidence_proposals%ROWTYPE;
  _evidence_id uuid;
  _target_state text;
BEGIN
  IF _decision NOT IN ('accept', 'edit', 'reject', 'unresolved') THEN
    RAISE EXCEPTION 'SCP_IV_UNKNOWN_DECISION: "%".', _decision USING ERRCODE = 'check_violation';
  END IF;
  _target_state := CASE _decision
    WHEN 'accept' THEN 'confirmed' WHEN 'edit' THEN 'edited'
    WHEN 'reject' THEN 'rejected' ELSE 'unresolved' END;

  SELECT * INTO _p FROM public.scp_interview_evidence_proposals
   WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PROPOSAL_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_write_case(_p.case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _p.review_state <> 'pending' THEN
    -- A retry of the decision already recorded, by the person who recorded
    -- it, returns what that decision produced. Anything else is a second
    -- review, and a review is not reopened by retrying it.
    IF _p.reviewed_by = auth.uid() AND _p.review_state = _target_state THEN
      SELECT id INTO _evidence_id FROM public.scp_interview_evidence WHERE proposal_id = _p.id;
      IF _decision <> 'edit'
         OR (SELECT excerpt FROM public.scp_interview_evidence WHERE id = _evidence_id)
            = btrim(coalesce(_edited_excerpt, '')) THEN
        RETURN _evidence_id;
      END IF;
    END IF;
    RAISE EXCEPTION 'SCP_IV_PROPOSAL_ALREADY_REVIEWED: this proposal is already "%".', _p.review_state
      USING ERRCODE = 'check_violation';
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
     SET review_state = _target_state,
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


-- ────────────────────────────────────────────────────────────────────────────
-- S2c. Recording an assessment is idempotent for an IDENTICAL repeat.
--
--      The EXISTING function from 20261009090000, same signature and the same
--      supersede mechanics. A retry that carries exactly the live judgement --
--      same level, same reasoning, same uncertainty -- returns that judgement
--      instead of demanding a supersede reason for a change that is not one.
--      A genuinely different judgement still requires the documented reason,
--      and a level above 0 still requires confirmed evidence.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_record_assessment(
  _case_id uuid, _question_id uuid, _level integer, _rationale text,
  _uncertainty_note text DEFAULT NULL, _supersede_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _anchor_id uuid; _pack uuid; _existing uuid; _id uuid; _evidence_count integer;
  _existing_level integer; _existing_rationale text; _existing_uncertainty text;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _rationale IS NULL OR btrim(_rationale) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_RATIONALE_REQUIRED: a level without reasoning is a number, not an assessment.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialise writers for this case, so two simultaneous saves cannot both
  -- find "no live assessment yet".
  PERFORM 1 FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;

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
  SELECT id, level, rationale, uncertainty_note
    INTO _existing, _existing_level, _existing_rationale, _existing_uncertainty
    FROM public.scp_interview_assessments
   WHERE case_id = _case_id AND question_id = _question_id
     AND assessor_id = auth.uid() AND superseded_by IS NULL;

  IF _existing IS NOT NULL AND _supersede_reason IS NULL THEN
    -- The judgement already recorded, sent again: a retry, not a change.
    IF _existing_level = _level
       AND _existing_rationale = btrim(_rationale)
       AND _existing_uncertainty IS NOT DISTINCT FROM _uncertainty_note THEN
      RETURN _existing;
    END IF;
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


-- ────────────────────────────────────────────────────────────────────────────
-- S2d. Marking the assessment complete is idempotent.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_mark_assessed(_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text;
BEGIN
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT status INTO _status FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  -- Already there: a second click is not a second transition.
  IF _status = 'assessed' THEN RETURN; END IF;
  PERFORM public.scp_iv_set_case_status(_case_id, 'assessed');
  PERFORM public.scp_iv_record_event(_case_id, 'assessment_recorded', 'human', NULL,
    'evidence_review', 'assessed');
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_mark_assessed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_mark_assessed(uuid) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- S3. The assessment-to-evidence contract, as a report blocker.
--
--     The EXISTING function from 20260921090000 with one blocker appended.
--     An assessment covers the confirmed evidence that existed when it was
--     recorded. Evidence is append-only (clients hold no UPDATE or DELETE on
--     it, and no RPC edits a row), so "existed when it was recorded" is
--     exactly confirmed_at <= assessed_at. Material confirmed after the live
--     assessment is not covered by it, and the report waits until the
--     question has been assessed again.
-- ────────────────────────────────────────────────────────────────────────────
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

  -- Material confirmed AFTER the live assessment of its question. The
  -- assessment stands as it was made; it simply does not cover this material,
  -- and a report that showed both side by side would imply that it did.
  RETURN QUERY
    SELECT DISTINCT 'ASSESSMENT_PREDATES_MATERIAL',
           format('%s har fått nytt bekräftat underlag efter bedömningen. Gå igenom bedömningen igen.', q.code)
      FROM public.scp_interview_core_questions q
      JOIN public.scp_interview_assessments a
        ON a.case_id = _case_id AND a.question_id = q.id AND a.superseded_by IS NULL
     WHERE q.pack_version_id = _c.pack_version_id
       AND EXISTS (SELECT 1 FROM public.scp_interview_evidence ev
                    WHERE ev.case_id = _case_id AND ev.question_id = q.id
                      AND ev.confirmed_at > a.assessed_at);

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


-- ────────────────────────────────────────────────────────────────────────────
-- S2e. Finalising is idempotent.
--
--      The EXISTING function from 20260920090000, same signature and the SAME
--      payload -- a report frozen before this migration and one frozen after
--      it hash identically. One addition: if the latest final report already
--      holds this content, it is returned rather than superseded by a copy of
--      itself. The comparison ignores status_at_report, which is the one
--      payload field that changes by virtue of the first finalisation itself.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(_case_id uuid, _draft_run_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _blockers text; _n integer; _next integer; _report_id uuid; _payload jsonb;
  _latest_id uuid; _latest_payload jsonb;
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

  -- Unchanged since the last final report: return that report. Two clicks on
  -- "complete the report" are one report, and a retry after a lost response
  -- finds the report it already made.
  SELECT id, payload INTO _latest_id, _latest_payload
    FROM public.scp_interview_reports
   WHERE case_id = _case_id AND status = 'final'
   ORDER BY version_number DESC LIMIT 1;
  IF _latest_id IS NOT NULL
     AND (_latest_payload #- '{case,status_at_report}') = (_payload #- '{case,status_at_report}') THEN
    RETURN _latest_id;
  END IF;

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

  IF _c.status <> 'reported' THEN
    PERFORM public.scp_iv_set_case_status(_case_id, 'reported');
  END IF;
  PERFORM public.scp_iv_record_event(_case_id, 'report_finalised', 'human', NULL,
    _c.status, 'reported', NULL,
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


-- ────────────────────────────────────────────────────────────────────────────
-- S5. A superseded report keeps the moment it was finalised.
--
--     Found by the new suite, not by a user: producing a SECOND report version
--     after material changed has never worked. scp_iv_finalise_report marks
--     the previous final report 'superseded' -- and scp_interview_reports_final
--     read (status = 'final') = (finalised_at IS NOT NULL), so a superseded
--     row that honestly kept its finalised_at violated the check, and the
--     whole finalisation rolled back with a raw constraint error. The
--     immutability guard had always permitted exactly this transition; the
--     constraint contradicted it, and no test walked the path.
--
--     The corrected rule says what was meant: a DRAFT has no finalisation
--     moment, and anything that was ever final keeps it. Every existing row
--     satisfies both readings (superseded rows could not exist), so no row is
--     rewritten and nothing is relaxed for drafts or finals.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scp_interview_reports
  DROP CONSTRAINT scp_interview_reports_final;
ALTER TABLE public.scp_interview_reports
  ADD CONSTRAINT scp_interview_reports_final
  CHECK ((status = 'draft') = (finalised_at IS NULL));

COMMENT ON CONSTRAINT scp_interview_reports_final ON public.scp_interview_reports IS
  'A draft has no finalisation moment; a final or superseded report keeps '
  'the one it was given. Superseded rows are history, and history keeps its '
  'dates.';


-- ────────────────────────────────────────────────────────────────────────────
-- S4. Self-check. The migration proves its own claims before it commits.
-- ────────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE _n integer;
BEGIN
  IF (SELECT count(*) FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname IN ('scp_interview_evidence_proposals_origin_in_case',
                        'scp_interview_evidence_origin_in_case',
                        'scp_interview_findings_origin_in_case')) <> 3 THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: the origin-in-case guard is not attached to all three tables.';
  END IF;

  IF position('FOR UPDATE' in
        pg_get_functiondef('public.scp_iv_author_evidence(uuid, uuid, text, uuid, uuid, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: authoring evidence does not serialise on the case.';
  END IF;
  IF position('ASSESSMENT_PREDATES_MATERIAL' in
        pg_get_functiondef('public.scp_iv_report_blockers(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: the blocker list does not know about material confirmed after an assessment.';
  END IF;
  IF position('status_at_report' in
        pg_get_functiondef('public.scp_iv_finalise_report(uuid, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: finalisation is not idempotent.';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conname = 'scp_interview_reports_final') NOT LIKE '%draft%' THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: a superseded report still cannot keep its finalisation moment.';
  END IF;

  -- The prohibition surface is exactly as it was: no scoring column, no
  -- aggregate, no ranking function arrived with this.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (table_name LIKE 'scp\_interview\_%' ESCAPE '\' OR table_name LIKE 'scp\_iv\_%' ESCAPE '\')
     AND (column_name IN ('total_score','suitability_score','fit_score','ranking',
                          'hire_recommendation','pass_threshold','credibility_score',
                          'deception_probability','culture_fit','weight','weighting')
          OR column_name LIKE '%credibility%' OR column_name LIKE '%deception%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: % prohibited column(s) exist in the interview domain.', _n;
  END IF;
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND (p.proname LIKE 'scp\_iv\_%' ESCAPE '\' OR p.proname LIKE 'scp\_interview\_%' ESCAPE '\')
     AND (p.proname LIKE '%total%' OR p.proname LIKE '%rank%'
          OR p.proname LIKE '%recommend%' OR p.proname LIKE '%suitab%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: a scoring/ranking function exists in the interview domain.';
  END IF;

  -- Clients still hold SELECT only on confirmed evidence. The append-only
  -- property the assessment contract rests on is a grant, and it is asserted.
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema = 'public' AND table_name = 'scp_interview_evidence'
                AND grantee = 'authenticated' AND privilege_type IN ('UPDATE','DELETE','INSERT')) THEN
    RAISE EXCEPTION 'SCP_IV_ER_ASSERT: confirmed evidence is writable by clients; the assessment contract assumes append-only.';
  END IF;

  RAISE NOTICE 'SCP_IV_ER_ASSERT: evidence is case-bound, writers are idempotent, assessments cover the material that existed when they were made.';
END
$assert$;

COMMIT;
