-- ============================================================================
-- 5E — CQrityjob's evidence-structuring model
-- ============================================================================
--
-- Created with `supabase migration new scp_interview_5e_evidence_structure`.
-- The CLI stamps the wall clock (2026-08-29), and this repository's migration
-- versions deliberately run AHEAD of it: the tables altered below are created
-- in 20260920090000. A clock-stamped file therefore sorts ~20 places BEFORE
-- the table it alters and breaks the strict replay contract. Per the
-- repository's established convention the CLI output is renamed to the next
-- canonical slot -- not invented, moved, and recorded here so the next reader
-- knows why the name and the clock disagree.
--
-- ── What 5E is, and is not ──────────────────────────────────────────────────
--
-- 5E is CQrityjob's own model for STRUCTURING an account of something that
-- happened, so a reader can see which parts of it are actually present:
--
--     1. Example / situation      what the situation was
--     2. Own role                 what the candidate's part in it was
--     3. Exact action             what they actually did
--     4. Effect / result          what followed
--     5. Reflection / learning    what they took from it
--
-- It is NOT a validated predictor of job performance, and nothing here makes
-- it one. There is deliberately:
--
--   * no numeric completeness value      * no score
--   * no total                           * no weighting
--   * no threshold                       * no ordering of candidates
--
-- The fields are nullable TEXT. A missing field is EVIDENCE OF A GAP -- a
-- question the interviewer did not get an answer to -- and the product shows
-- it as exactly that. It must never become "3 of 5" or any other number,
-- because the moment completeness is counted it starts being compared, and a
-- comparison across candidates is the thing this product does not do.
--
-- ── Where the fields live ───────────────────────────────────────────────────
--
-- On BOTH the AI proposal and the human-confirmed evidence, kept separate on
-- purpose: the proposal records how the ENGINE structured the note, the
-- evidence records how the HUMAN did, and a human edit must never travel
-- backwards into the proposal. The interview note itself is untouched by
-- either -- it is the immutable source both of them cite.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- S1. The AI's structuring of a note. A proposal, and only ever a proposal.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scp_interview_evidence_proposals
  ADD COLUMN e1_situation text,
  ADD COLUMN e2_own_role text,
  ADD COLUMN e3_action text,
  ADD COLUMN e4_effect text,
  ADD COLUMN e5_reflection text;

COMMENT ON COLUMN public.scp_interview_evidence_proposals.e1_situation IS
  '5E(1) Example/situation, as the engine structured it. Descriptive text, '
  'never a score. NULL means the account did not contain it -- a gap to ask '
  'about, not a mark against the candidate.';
COMMENT ON COLUMN public.scp_interview_evidence_proposals.e2_own_role IS
  '5E(2) The candidate''s own role. Descriptive text, never a score.';
COMMENT ON COLUMN public.scp_interview_evidence_proposals.e3_action IS
  '5E(3) What the candidate actually did. Descriptive text, never a score.';
COMMENT ON COLUMN public.scp_interview_evidence_proposals.e4_effect IS
  '5E(4) Effect/result. Descriptive text, never a score.';
COMMENT ON COLUMN public.scp_interview_evidence_proposals.e5_reflection IS
  '5E(5) Reflection/learning. Descriptive text, never a score.';


-- ────────────────────────────────────────────────────────────────────────────
-- S2. The human's structuring, on confirmed evidence. Separate columns so a
--     correction is visibly the human's and the proposal survives beside it.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scp_interview_evidence
  ADD COLUMN e1_situation text,
  ADD COLUMN e2_own_role text,
  ADD COLUMN e3_action text,
  ADD COLUMN e4_effect text,
  ADD COLUMN e5_reflection text;

COMMENT ON COLUMN public.scp_interview_evidence.e1_situation IS
  '5E(1) as CONFIRMED by a human. The proposal keeps its own copy, so what the '
  'engine suggested and what the person accepted are both readable afterwards.';
COMMENT ON COLUMN public.scp_interview_evidence.e2_own_role IS '5E(2), human-confirmed.';
COMMENT ON COLUMN public.scp_interview_evidence.e3_action IS '5E(3), human-confirmed.';
COMMENT ON COLUMN public.scp_interview_evidence.e4_effect IS '5E(4), human-confirmed.';
COMMENT ON COLUMN public.scp_interview_evidence.e5_reflection IS '5E(5), human-confirmed.';


-- ────────────────────────────────────────────────────────────────────────────
-- S3. Recording a proposal carries its 5E structure.
--
--     The EXISTING function from 20260920090000 with five nullable fields
--     appended. The caller still supplies resolved IDs -- questionId,
--     evidenceDimensionId, packCompetencyId -- because that is the contract
--     the application and the runtime suite already speak. Changing it to
--     resolve codes here would have been a redesign wearing a migration's
--     clothes, and it would have silently dropped every proposal whose codes
--     did not resolve.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scp_iv_record_evidence_proposals(_run_id uuid, _items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _case_id uuid; _n integer := 0; _item jsonb;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_ai_runs WHERE id = _run_id;
  IF _case_id IS NULL OR NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _n := _n + 1;
    INSERT INTO public.scp_interview_evidence_proposals
      (case_id, ai_run_id, note_id, source_passage_id, excerpt, question_id,
       evidence_dimension_id, pack_competency_id, extraction_confidence,
       relevance_rationale, uncertainty_note, prohibited_conclusion_note,
       e1_situation, e2_own_role, e3_action, e4_effect, e5_reflection)
    VALUES (_case_id, _run_id,
            nullif(_item ->> 'noteId', '')::uuid,
            nullif(_item ->> 'sourcePassageId', '')::uuid,
            _item ->> 'excerpt',
            (_item ->> 'questionId')::uuid,
            nullif(_item ->> 'evidenceDimensionId', '')::uuid,
            nullif(_item ->> 'packCompetencyId', '')::uuid,
            nullif(_item ->> 'extractionConfidence', '')::numeric,
            coalesce(_item ->> 'relevanceRationale', ''),
            _item ->> 'uncertaintyNote',
            _item ->> 'prohibitedConclusionNote',
            nullif(btrim(coalesce(_item ->> 'e1Situation', '')), ''),
            nullif(btrim(coalesce(_item ->> 'e2OwnRole', '')), ''),
            nullif(btrim(coalesce(_item ->> 'e3Action', '')), ''),
            nullif(btrim(coalesce(_item ->> 'e4Effect', '')), ''),
            nullif(btrim(coalesce(_item ->> 'e5Reflection', '')), ''));
  END LOOP;

  PERFORM public.scp_iv_record_event(_case_id, 'evidence_proposed', 'ai', _run_id, NULL, NULL, NULL,
    jsonb_build_object('proposals', _n));
  RETURN _n;
END; $$;

REVOKE ALL ON FUNCTION public.scp_iv_record_evidence_proposals(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_record_evidence_proposals(uuid, jsonb)
  TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- S4. Confirming a proposal carries the 5E structure forward.
--
--     This is the EXISTING function from 20260920090000 with five optional
--     parameters appended and nothing else touched. The decision vocabulary
--     ('accept' | 'edit' | 'reject' | 'unresolved'), the correction-class
--     requirement, the both-texts-on-edit rule and the event names are all
--     preserved -- they are a working contract that other suites depend on,
--     and 5E is an addition to it rather than an excuse to redesign it.
-- ────────────────────────────────────────────────────────────────────────────
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

-- Retire the five-argument form so no caller can confirm evidence by a path
-- that silently drops the 5E structure.
DROP FUNCTION IF EXISTS public.scp_iv_confirm_evidence_proposal(uuid, text, text, text, text);


-- ────────────────────────────────────────────────────────────────────────────
-- S5. Self-check. 5E must be describable and never countable.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _n integer;
BEGIN
  -- Every 5E column is TEXT. A numeric one would be the first step towards a
  -- completeness score, which is exactly what this must never become.
  SELECT count(*) INTO _n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('scp_interview_evidence_proposals', 'scp_interview_evidence')
     AND column_name ~ '^e[1-5]_'
     AND data_type <> 'text';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_IV_5E: % 5E column(s) are not text. 5E describes an account; it never scores one.', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('scp_interview_evidence_proposals', 'scp_interview_evidence')
     AND column_name ~ '^e[1-5]_';
  IF _n <> 10 THEN
    RAISE EXCEPTION 'SCP_IV_5E: expected 10 5E columns (5 proposal + 5 evidence), found %.', _n;
  END IF;

  -- Nullable on purpose: a missing E is a GAP the interviewer should ask
  -- about, not a defect to be rejected at write time.
  SELECT count(*) INTO _n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('scp_interview_evidence_proposals', 'scp_interview_evidence')
     AND column_name ~ '^e[1-5]_' AND is_nullable = 'NO';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_IV_5E: % 5E column(s) are NOT NULL. A missing E is a gap to ask about, not a write error.', _n;
  END IF;

  RAISE NOTICE 'SCP_IV_5E: 5E persists as description on proposals and confirmed evidence; nothing counts it.';
END $$;
