-- ============================================================================
-- Superseding an assessment could never have worked
-- ============================================================================
--
-- Hosted owner UAT: a recruiter saved a rating and could not change it.
--
-- The product rule was never in doubt and is not changed here. A recorded
-- judgement is not edited; it is SUPERSEDED, so both survive with a documented
-- reason. scp_iv_record_assessment was written to do exactly that, and the
-- server function has passed a supersede reason through since the day it was
-- added.
--
-- It could not work. The function INSERTed the replacement first and only then
-- marked the original superseded, and
--
--   scp_interview_assessments_live_idx
--     UNIQUE (case_id, question_id, assessor_id) WHERE superseded_by IS NULL
--
-- is checked at the end of the INSERT statement, at which moment BOTH rows are
-- live. Every attempt to change an assessment died on a raw unique-violation.
-- The path had no test, so nothing said so.
--
-- The obvious reordering -- mark the original superseded first -- needs the
-- replacement's id before the replacement exists, and superseded_by is a
-- self-referencing foreign key checked immediately. So the key becomes
-- DEFERRABLE, the function generates the id up front, defers the key for its
-- own transaction, updates and then inserts.
--
-- INITIALLY IMMEDIATE, deliberately: every other writer keeps immediate
-- checking, and only this function -- which knows it is building a two-row
-- chain -- asks for the deferral.
--
-- Nothing about what is allowed changes. The unique index stays. The locked
-- guard, the in-place-edit guard and the reattribution guard stay. The
-- evidence rule -- a level above 0 must rest on confirmed evidence -- stays,
-- and now demonstrably survives the supersede path too.
-- ============================================================================

BEGIN;

ALTER TABLE public.scp_interview_assessments
  DROP CONSTRAINT scp_interview_assessments_superseded_by_fkey;

ALTER TABLE public.scp_interview_assessments
  ADD CONSTRAINT scp_interview_assessments_superseded_by_fkey
  FOREIGN KEY (superseded_by) REFERENCES public.scp_interview_assessments(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY IMMEDIATE;

COMMENT ON CONSTRAINT scp_interview_assessments_superseded_by_fkey
  ON public.scp_interview_assessments IS
  'Deferrable so scp_iv_record_assessment can mark the original superseded '
  'BEFORE inserting its replacement. Doing it the other way round puts two '
  'live rows in scp_interview_assessments_live_idx for the duration of the '
  'INSERT, which is why changing an assessment always failed. Immediate for '
  'every other writer.';

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

COMMIT;
