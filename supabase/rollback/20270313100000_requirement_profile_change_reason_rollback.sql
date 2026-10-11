-- Rollback of 20270313100000 (reason131). Prefer an application rollback.
-- Restores the two public functions to their previous bodies, verbatim from
-- requirements080 and workspace20270310100000, and drops the private core.
-- No table, row, grant or history is touched: the history rows written while
-- the slot was installed stay where they are and keep reading through the
-- unchanged rec_ri_profile_change_history.
BEGIN;
CREATE OR REPLACE FUNCTION public.rec_ri_confirm_reviewed_profile(_job_id uuid,_expected_version integer,_operation_id uuid,_start_date date,_rules jsonb,_change_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_profile jsonb; impact jsonb; result jsonb; request_hash text; prior recruiter_intelligence.profile_change_reviews%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_can_manage(_job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF _operation_id IS NULL OR nullif(btrim(_change_reason),'') IS NULL OR char_length(_change_reason)>2000 THEN
    RAISE EXCEPTION 'RI_CHANGE_REASON_REQUIRED' USING ERRCODE='check_violation'; END IF;
  request_hash:=md5(jsonb_build_object('version',_expected_version,'start',_start_date,'rules',_rules,'reason',btrim(_change_reason))::text);
  SELECT * INTO prior FROM recruiter_intelligence.profile_change_reviews WHERE operation_id=_operation_id;
  IF FOUND THEN
    IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.job_id IS DISTINCT FROM _job_id OR prior.request_hash IS DISTINCT FROM request_hash THEN
      RAISE EXCEPTION 'RI_OPERATION_CONFLICT' USING ERRCODE='check_violation'; END IF;
    RETURN (SELECT o.result FROM recruiter_intelligence.operations o WHERE operation_id=_operation_id);
  END IF;
  IF EXISTS(SELECT 1 FROM recruiter_intelligence.operations WHERE operation_id=_operation_id) THEN
    RAISE EXCEPTION 'RI_OPERATION_CONFLICT' USING ERRCODE='check_violation'; END IF;
  old_profile:=recruiter_intelligence.profile_json(_job_id);
  impact:=public.rec_ri_profile_change_impact(_job_id,_expected_version);
  result:=public.rec_ri_confirm_profile(_job_id,_expected_version,_operation_id,_start_date,_rules);
  INSERT INTO recruiter_intelligence.profile_change_reviews(operation_id,job_id,profile_id,actor_id,prior_version,reason,request_hash,prior_profile,impact)
    VALUES(_operation_id,_job_id,(result->>'profileId')::uuid,auth.uid(),_expected_version,btrim(_change_reason),request_hash,old_profile,impact);
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.rec_ri_confirm_profile(_job_id uuid,_expected_version integer,_operation_id uuid,_start_date date,_rules jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; v integer; r jsonb; req public.recruitment_requirements%ROWTYPE; q public.recruitment_questions%ROWTYPE; rules jsonb:='[]'; request jsonb; result jsonb; pid uuid;
BEGIN
  SELECT * INTO j FROM public.jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_can_manage(_job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF _operation_id IS NULL OR _expected_version IS NULL OR _rules IS NULL OR jsonb_typeof(_rules)<>'array' OR jsonb_array_length(_rules)>30 THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
  request:=jsonb_build_object('version',_expected_version,'start',_start_date,'rules',_rules);
  result:=recruiter_intelligence.operation_result(_operation_id,_job_id,'profile',request); IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT coalesce(max(version),0) INTO v FROM public.rec_requirement_profiles WHERE job_id=_job_id;
  IF v<>_expected_version THEN RAISE EXCEPTION 'RI_STALE_VERSION' USING ERRCODE='PT409'; END IF;
  IF jsonb_array_length(_rules)<>(SELECT count(*) FROM public.recruitment_requirements WHERE job_id=_job_id)
     OR (SELECT count(DISTINCT x->>'requirementId') FROM jsonb_array_elements(_rules)x)<>jsonb_array_length(_rules) THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    SELECT * INTO req FROM public.recruitment_requirements WHERE id::text=r->>'requirementId' AND job_id=_job_id;
    IF NOT FOUND OR coalesce(r->>'kind','') NOT IN ('mandatory','desirable') OR nullif(btrim(r->>'instructionSv'),'') IS NULL
      OR char_length(r->>'instructionSv')>2000 OR char_length(r->>'instructionEn')>2000
      OR coalesce(r->>'decisionRule','') NOT IN ('boolean_yes','valid_at_start','human_confirmed')
      OR jsonb_typeof(r->'acceptedSources') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'acceptedSources') NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'acceptedSources')s WHERE s NOT IN ('application_answer','application_cv','interview_source','external_reference')) THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
    IF r->>'decisionRule'='boolean_yes' THEN
      SELECT * INTO q FROM public.recruitment_questions WHERE id::text=r->>'questionId' AND requirement_id=req.id AND job_id=j.id AND answer_kind='yes_no';
      IF NOT FOUND OR NOT(r->'acceptedSources' ? 'application_answer') THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
    ELSIF r->>'questionId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recruitment_questions WHERE id::text=r->>'questionId' AND requirement_id=req.id AND job_id=j.id) THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
    IF r->>'decisionRule'='valid_at_start' AND (_start_date IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'acceptedSources')s WHERE s NOT IN ('application_cv','interview_source'))) THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
    rules:=rules||jsonb_build_array(r||jsonb_build_object('questionId',r->>'questionId','instructionEn',r->>'instructionEn','labelSv',req.label_sv,'labelEn',req.label_en,'position',req.position));
  END LOOP;
  INSERT INTO public.rec_requirement_profiles(job_id,employer_id,version,start_date,rules,confirmed_by) VALUES(j.id,j.employer_id,v+1,_start_date,rules,auth.uid()) RETURNING id INTO pid;
  result:=recruiter_intelligence.profile_json(j.id);
  INSERT INTO recruiter_intelligence.operations VALUES(_operation_id,auth.uid(),j.id,'profile',md5(request::text),result,now(),j.id);
  RETURN result;
END $$;
DROP FUNCTION IF EXISTS recruiter_intelligence.confirm_profile_core(uuid,integer,uuid,date,jsonb);
COMMIT;
