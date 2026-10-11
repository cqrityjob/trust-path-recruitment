-- Canonical forward slot 20270313100000 ("reason131"), slutuppdrag 2026-10-11.
-- Every CHANGE of a confirmed requirement profile needs a stated reason and
-- lands in the private change history, whichever write path a client uses.
--
-- Before this slot the legacy rec_ri_confirm_profile (requirements080) could
-- still create a new profile version without a reason and without a history
-- row, so a review of version N could be followed by a silent version N+1
-- whose new rules nobody had motivated. The reviewed wrapper of
-- workspace20270310100000 required the reason, but only for its own callers.
--
-- What changes, additively:
--   - the validating body of the legacy function moves, unchanged, into the
--     private recruiter_intelligence.confirm_profile_core;
--   - rec_ri_confirm_profile keeps its signature and still serves the FIRST
--     confirmation of a recruitment (version 0 -> 1: there is no earlier
--     confirmed profile to motivate a change against) and the idempotent
--     replay of operations it already recorded; a change of an existing
--     version through it is refused with RI_CHANGE_REASON_REQUIRED;
--   - rec_ri_confirm_reviewed_profile calls the core directly and stays the
--     one path for a change: manager, CAS on the version, reason 1..2000
--     characters, idempotent by operation, one history row per change.
--
-- Nothing is rewritten: existing profiles, reviews, decisions, history rows,
-- ledgers and operations keep their bytes. The hosted history is read by the
-- unchanged rec_ri_profile_change_history; a version without a history row is
-- a version confirmed before this slot through the older path, and clients
-- show that absence as such rather than inventing a reason for it.
--
-- No AI, no stage mutation, no messages, no client DML.
BEGIN;

-- The validating body of requirements080's rec_ri_confirm_profile, verbatim,
-- as a private function. Not executable by any client role.
CREATE FUNCTION recruiter_intelligence.confirm_profile_core(_job_id uuid,_expected_version integer,_operation_id uuid,_start_date date,_rules jsonb) RETURNS jsonb
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
REVOKE ALL ON FUNCTION recruiter_intelligence.confirm_profile_core(uuid,integer,uuid,date,jsonb) FROM PUBLIC,anon,authenticated;

-- The legacy path: same signature, same guards and replays; a CHANGE needs the
-- reviewed wrapper. The hint names the way for an older client.
CREATE OR REPLACE FUNCTION public.rec_ri_confirm_profile(_job_id uuid,_expected_version integer,_operation_id uuid,_start_date date,_rules jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; v integer; request jsonb; result jsonb;
BEGIN
  SELECT * INTO j FROM public.jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_can_manage(_job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF _operation_id IS NULL OR _expected_version IS NULL OR _rules IS NULL THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
  request:=jsonb_build_object('version',_expected_version,'start',_start_date,'rules',_rules);
  result:=recruiter_intelligence.operation_result(_operation_id,_job_id,'profile',request); IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT coalesce(max(version),0) INTO v FROM public.rec_requirement_profiles WHERE job_id=_job_id;
  IF v>0 THEN
    RAISE EXCEPTION 'RI_CHANGE_REASON_REQUIRED' USING ERRCODE='check_violation',
      HINT='A confirmed requirement profile changes only through rec_ri_confirm_reviewed_profile with a stated reason.';
  END IF;
  RETURN recruiter_intelligence.confirm_profile_core(_job_id,_expected_version,_operation_id,_start_date,_rules);
END $$;
-- Grants of requirements080 stand: authenticated may execute, anon may not.

-- The reviewed wrapper of workspace20270310100000, now over the core: the
-- same guards, hash, idempotency and history row; it no longer passes through
-- the public legacy function, which would now refuse the change it records.
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
  result:=recruiter_intelligence.confirm_profile_core(_job_id,_expected_version,_operation_id,_start_date,_rules);
  INSERT INTO recruiter_intelligence.profile_change_reviews(operation_id,job_id,profile_id,actor_id,prior_version,reason,request_hash,prior_profile,impact)
    VALUES(_operation_id,_job_id,(result->>'profileId')::uuid,auth.uid(),_expected_version,btrim(_change_reason),request_hash,old_profile,impact);
  RETURN result;
END $$;
-- Grants of workspace20270310100000 stand: authenticated may execute, anon may not.

COMMIT;
