-- =============================================================================
-- P1-K -- only the security function erases material on a security vetting
-- =============================================================================
--
-- THE DEFECT (2026-10-02 final audit, P1-K, confirmed from the definition and
-- a rolled-back probe):
--
--   A security vetting's interview case is the appointed security function's
--   alone: scp_iv_can_read_case / scp_iv_can_write_case and
--   scp_iv_confirm_transcript_basis all require bcp_case_access_ok.
--   scp_iv_erase_source checked only "active owner or admin" and never
--   bcp_case_access_ok, so an owner or admin who is NOT the security officer
--   could irreversibly erase sources, passages and proposals on a vetting case
--   they cannot even read (probe: is_SO=f, can_read_case=f, erase_err=none,
--   source_state_after=erased).
--
-- THE FIX: scp_iv_erase_source also requires bcp_case_access_ok(_case_id),
-- refusing with SCP_IV_NOT_CASE_MEMBER exactly as confirm_transcript_basis
-- does. The body is otherwise the hosted one (md5 fc3984e279784abff4f197f0b3aa45a9,
-- pinned by the rollback); the added block is marked 20270120090000.
--
-- NOT CHANGED: erasure on ordinary cases; the security officer's own erasure;
-- every other function; any row.
--
-- Rollback: supabase/rollback/20270120090000_scp_iv_erase_vetting_boundary_rollback.sql
-- Suite:    supabase/tests/scp_iv_erase_vetting_boundary_test.sql
-- =============================================================================

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
  -- 20270120090000 (P1-K): a security vetting's case is the appointed
  -- security function's alone (bcp_case_access_ok). Being the employer's owner
  -- or admin is not that -- the same rule scp_iv_confirm_transcript_basis
  -- applies.
  IF NOT public.bcp_case_access_ok(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER: this case belongs to the security function.'
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

DO $$
DECLARE _src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_erase_source(uuid,text)'::regprocedure);
BEGIN
  IF position('bcp_case_access_ok' IN _src) = 0 OR position('20270120090000' IN _src) = 0 THEN
    RAISE EXCEPTION 'SCP_IV_ERASE_VETTING_PROOF: scp_iv_erase_source does not check the vetting boundary';
  END IF;
  RAISE NOTICE 'SCP_IV_ERASE_VETTING_PROOF ok: only the security function erases material on a security vetting';
END $$;
