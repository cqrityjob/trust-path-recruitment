-- Recovery of application capability, not erasure of interview history.
-- Remove dependent application use first. Existing checkpoint fields, classes,
-- audit events and final reports are retained; no stored hashes are changed.
-- Replaying the migration later requires a reviewed forward recovery migration.
DO $$
DECLARE _definition text;
BEGIN
  SELECT pg_get_functiondef('public.scp_iv_build_report_basis(uuid)'::regprocedure) INTO _definition;
  _definition := replace(_definition,
    '''category'', ''missing_or_contradictory'', ''origin'', f.origin,
      ''neutral_question'', f.neutral_question, ''source_passage_id'', f.source_passage_id,
      ''source_label'', f.source_label, ''responsible_label'', f.responsible_label,
      ''next_action'', f.next_action, ''due_on'', f.due_on,
      ''human_note'', f.human_note, ''human_actor_id'', f.human_actor_id,
      ''human_actor_at'', f.human_actor_at, ''revision'', f.revision)',
    '''category'', ''missing_or_contradictory'')');
  _definition := replace(_definition,
    'RETURN _payload || jsonb_build_object(''interview_foundation_version'', 1,
      ''content_manifest'', scp_private.interview_content_manifest(_case_id),
      ''ai_disclosure'', (_payload -> ''ai_disclosure'') || jsonb_build_object(''statement'',
        CASE WHEN jsonb_array_length(_payload #> ''{ai_disclosure,runs}'') > 0
          THEN ''AI-stöd har använts enligt de dokumenterade körningarna. Underlag och bedömningar granskas av människor. AI fattar inget urvals- eller anställningsbeslut.''
          ELSE ''Inget AI-stöd har använts för detta intervjuunderlag. Bedömningsunderlag och bedömningar har registrerats av människor. Inget automatiskt urvals- eller anställningsbeslut ingår.'' END));',
    'RETURN _payload;');
  IF position('scp_private.interview_content_manifest' IN _definition) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_FOUNDATION_ROLLBACK_PRECONDITION';
  END IF;
  EXECUTE _definition;
END $$;
DROP FUNCTION public.scp_iv_save_session_process(uuid,text,text,timestamptz);
DROP FUNCTION public.scp_iv_create_manual_finding(uuid,uuid,text,text,text,uuid,uuid,text,text,text,date);
DROP FUNCTION public.scp_iv_review_manual_finding(uuid,bigint,text,text,text,text,date);
DROP FUNCTION public.scp_iv_manual_finding_capabilities(uuid);
DROP FUNCTION public.scp_iv_case_content_manifest(uuid);
DROP FUNCTION scp_private.interview_content_manifest(uuid);
-- Keep the findings revision trigger: old direct owner/admin review writes
-- still stamp revisions and serialize against report finalisation. Removing
-- it would silently weaken concurrency of manual points already recorded.
