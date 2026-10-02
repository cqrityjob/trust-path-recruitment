-- Rollback of 20270121090000_scp_iv_erase_vetting_boundary.
--
-- !! THIS REOPENS P1-K !! An owner or admin who is not the security officer
-- can again erase material on a security vetting. Run it ONLY in an isolated
-- test database (scripts/db-test.sh cycles it). Restores the hosted body
-- exactly (md5(prosrc) fc3984e279784abff4f197f0b3aa45a9).
CREATE OR REPLACE FUNCTION public.scp_iv_erase_source(_source_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _case_id uuid; _passages integer; _proposals integer;
BEGIN
  SELECT case_id INTO _case_id FROM public.scp_interview_case_sources WHERE id = _source_id;
  IF _case_id IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_SOURCE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- 20270111090000: an active member of an ACTIVE organisation
  IF auth.uid() IS NULL OR NOT public.has_active_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_ERASE_ROLE: erasing candidate material requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'SCP_IV_ERASE_REASON_REQUIRED: state why this material is being erased.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);

  UPDATE public.scp_interview_source_passages
     SET content = ''
   WHERE source_id = _source_id AND content <> '';
  GET DIAGNOSTICS _passages = ROW_COUNT;

  UPDATE public.scp_interview_evidence_proposals
     SET excerpt = '', relevance_rationale = '[raderat]'
   WHERE source_passage_id IN (
     SELECT id FROM public.scp_interview_source_passages WHERE source_id = _source_id);
  GET DIAGNOSTICS _proposals = ROW_COUNT;

  UPDATE public.scp_interview_case_sources
     SET content_text = '', retention_state = 'erased', erased_at = now()
   WHERE id = _source_id;

  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  -- The fourth argument is _ai_run_id, not a generic subject. An erasure has no
  -- AI run behind it, so it is NULL and the source is named in the metadata.
  PERFORM public.scp_iv_record_event(_case_id, 'source_erased', 'human', NULL, NULL, NULL,
    btrim(_reason),
    jsonb_build_object('source_id', _source_id,
                       'passages_cleared', _passages,
                       'proposals_cleared', _proposals,
                       'confirmed_evidence_kept', true,
                       'reports_kept', true));
END; $function$
;

DO $$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_erase_source(uuid,text)'::regprocedure))
     <> 'fc3984e279784abff4f197f0b3aa45a9' THEN
    RAISE EXCEPTION 'SCP_IV_ERASE_VETTING_ROLLBACK: the restored body is not the hosted one';
  END IF;
  RAISE NOTICE 'SCP_IV_ERASE_VETTING_ROLLBACK ok: the pre-fix body is restored';
END $$;
