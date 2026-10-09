-- Created by supabase migration new as 20261008181238; canonical forward slot.
-- Review metadata only. Existing profiles, reports, stages and AI stay untouched.
BEGIN;
CREATE TABLE recruiter_intelligence.profile_change_reviews (
  -- Logical operation identity; no FK that would mask the existing operations
  -- TRUNCATE guard or change its established failure contract.
  operation_id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.rec_requirement_profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prior_version integer NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
  request_hash text NOT NULL,
  prior_profile jsonb NOT NULL,
  impact jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE recruiter_intelligence.profile_change_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recruiter_intelligence.profile_change_reviews FROM PUBLIC,anon,authenticated;
CREATE FUNCTION recruiter_intelligence.protect_profile_change_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 AND (
    NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=OLD.job_id) OR
    NOT EXISTS(SELECT 1 FROM public.rec_requirement_profiles WHERE id=OLD.profile_id) OR
    NOT EXISTS(SELECT 1 FROM recruiter_intelligence.operations WHERE operation_id=OLD.operation_id)) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.actor_id)
    AND (to_jsonb(NEW)-'actor_id')=(to_jsonb(OLD)-'actor_id') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'RI_HISTORY_IMMUTABLE' USING ERRCODE='check_violation';
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.protect_profile_change_review() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER rec_profile_change_review_immutable BEFORE UPDATE OR DELETE ON recruiter_intelligence.profile_change_reviews FOR EACH ROW EXECUTE FUNCTION recruiter_intelligence.protect_profile_change_review();
CREATE TRIGGER rec_profile_change_review_truncate BEFORE TRUNCATE ON recruiter_intelligence.profile_change_reviews FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_profile_change_review();

CREATE FUNCTION public.rec_ri_profile_change_impact(_job_id uuid, _expected_version integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v integer; result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND public.rec_is_member(employer_id))
    THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT coalesce(max(version),0) INTO v FROM public.rec_requirement_profiles WHERE job_id=_job_id;
  IF v IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION 'RI_STALE_VERSION' USING ERRCODE='PT409'; END IF;
  SELECT jsonb_build_object('version',v,'received',count(*),
    'active',count(*) FILTER(WHERE a.status IN('submitted','reviewing','interview') AND a.withdrawn_at IS NULL AND a.employer_archived_at IS NULL),
    'archived',count(*) FILTER(WHERE a.employer_archived_at IS NOT NULL),
    'withdrawn',count(*) FILTER(WHERE a.withdrawn_at IS NOT NULL),
    'decided',count(*) FILTER(WHERE a.status IN('hired','rejected')),
    'reviewedActive',count(*) FILTER(WHERE a.status IN('submitted','reviewing','interview') AND a.withdrawn_at IS NULL AND a.employer_archived_at IS NULL
      AND recruiter_intelligence.application_state(a.id)->>'reviewState'='reviewed')) INTO result
    FROM public.job_applications a WHERE a.job_id=_job_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_profile_change_impact(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_profile_change_impact(uuid,integer) TO authenticated;

CREATE FUNCTION public.rec_ri_confirm_reviewed_profile(_job_id uuid,_expected_version integer,_operation_id uuid,_start_date date,_rules jsonb,_change_reason text) RETURNS jsonb
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
REVOKE ALL ON FUNCTION public.rec_ri_confirm_reviewed_profile(uuid,integer,uuid,date,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_confirm_reviewed_profile(uuid,integer,uuid,date,jsonb,text) TO authenticated;

-- Read through an authorized RPC; private audit tables never expose candidates.
CREATE FUNCTION public.rec_ri_profile_change_history(_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND public.rec_is_member(employer_id)) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('version',p.version,'reason',h.reason,'actorId',h.actor_id,'reviewedAt',h.reviewed_at,'priorProfile',h.prior_profile,'profile',to_jsonb(p),'impact',h.impact) ORDER BY p.version DESC)
    FROM recruiter_intelligence.profile_change_reviews h JOIN public.rec_requirement_profiles p ON p.id=h.profile_id WHERE h.job_id=_job_id),'[]');
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_profile_change_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_profile_change_history(uuid) TO authenticated;
-- Same statement snapshot and permission-redacted originals for all three.
CREATE FUNCTION public.rec_ri_compare_applications(_job_id uuid,_profile_id uuid,_application_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE profile uuid; result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND public.rec_is_member(employer_id)) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF _application_ids IS NULL OR cardinality(_application_ids) NOT BETWEEN 2 AND 3
     OR (SELECT count(DISTINCT id) FROM unnest(_application_ids)id)<>cardinality(_application_ids)
     OR (SELECT count(*) FROM public.job_applications WHERE id=ANY(_application_ids) AND job_id=_job_id)<>cardinality(_application_ids) THEN
    RAISE EXCEPTION 'RI_COMPARISON_INVALID' USING ERRCODE='check_violation'; END IF;
  SELECT id INTO profile FROM public.rec_requirement_profiles WHERE job_id=_job_id ORDER BY version DESC LIMIT 1;
  IF profile IS NULL OR profile IS DISTINCT FROM _profile_id THEN RAISE EXCEPTION 'RI_SOURCE_STALE' USING ERRCODE='PT409'; END IF;
  SELECT jsonb_agg(jsonb_build_object('name',p.display_name,'review',public.rec_ri_get_review(a.id)) ORDER BY array_position(_application_ids,a.id)) INTO result
    FROM public.job_applications a LEFT JOIN public.profiles p ON p.id=a.applicant_user_id WHERE a.id=ANY(_application_ids);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_compare_applications(uuid,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_compare_applications(uuid,uuid,uuid[]) TO authenticated;
CREATE FUNCTION public.rec_ri_next_unreviewed(_employer_id uuid,_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.rec_is_member(_employer_id) OR (_job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND employer_id=_employer_id)) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  WITH remaining AS MATERIALIZED (
    SELECT a.id,a.job_id,a.created_at,a.status,a.withdrawn_at,a.employer_archived_at,s.completion_state,s.archived_at,
      p.display_name,recruiter_intelligence.application_state(a.id)ri
    FROM public.job_applications a LEFT JOIN public.recruitment_settings s ON s.job_id=a.job_id
    LEFT JOIN public.profiles p ON p.id=a.applicant_user_id
    WHERE a.employer_id=_employer_id AND (_job_id IS NULL OR a.job_id=_job_id)
      AND recruiter_intelligence.application_state(a.id)->>'reviewState'<>'reviewed'
  ), actionable AS MATERIALIZED (
    SELECT * FROM remaining WHERE status IN('submitted','reviewing','interview') AND withdrawn_at IS NULL
      AND employer_archived_at IS NULL AND archived_at IS NULL AND coalesce(completion_state,'open')='open'
  ) SELECT jsonb_build_object('remaining',(SELECT count(*) FROM actionable),'historicalExcluded',(SELECT count(*) FROM remaining)-(SELECT count(*) FROM actionable),
    'next',(SELECT jsonb_build_object('applicationId',id,'jobId',job_id,'name',display_name,'profileVersion',ri->'profileVersion') FROM actionable ORDER BY created_at,id LIMIT 1)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_next_unreviewed(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_next_unreviewed(uuid,uuid) TO authenticated;
-- Page evidence is read-only; definitions/bindings cannot create a new criterion.
CREATE FUNCTION public.rec_ri_page_evidence(_job_id uuid,_profile_id uuid,_application_ids uuid[],_requirement_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE profile public.rec_requirement_profiles%ROWTYPE; result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND public.rec_is_member(employer_id)) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO profile FROM public.rec_requirement_profiles WHERE job_id=_job_id ORDER BY version DESC LIMIT 1;
  IF profile.id IS NULL OR profile.id IS DISTINCT FROM _profile_id THEN RAISE EXCEPTION 'RI_SOURCE_STALE' USING ERRCODE='PT409'; END IF;
  IF _application_ids IS NULL OR cardinality(_application_ids) NOT BETWEEN 1 AND 100 OR cardinality(_application_ids)<>(SELECT count(DISTINCT id) FROM unnest(_application_ids)id)
    OR (SELECT count(*) FROM public.job_applications WHERE id=ANY(_application_ids) AND job_id=_job_id)<>cardinality(_application_ids)
    OR _requirement_ids IS NULL OR cardinality(_requirement_ids) NOT BETWEEN 1 AND 3
    OR cardinality(_requirement_ids)<>(SELECT count(DISTINCT id) FROM unnest(_requirement_ids)id)
    OR EXISTS(SELECT 1 FROM unnest(_requirement_ids)id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(profile.rules)r WHERE r->>'requirementId'=id::text)) THEN
    RAISE EXCEPTION 'RI_COMPARISON_INVALID' USING ERRCODE='check_violation'; END IF;
  SELECT jsonb_object_agg(a.id, (SELECT coalesce(jsonb_agg(c),'[]') FROM jsonb_array_elements(public.rec_ri_get_review(a.id)->'criteria')c WHERE (c->>'requirementId')::uuid=ANY(_requirement_ids))) INTO result FROM public.job_applications a WHERE id=ANY(_application_ids);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_page_evidence(uuid,uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_page_evidence(uuid,uuid,uuid[],uuid[]) TO authenticated;
COMMIT;
