-- Created with `supabase migration new recruiter_intelligence_requirements`
-- as 20261008052318; only the filename moved to reserved canonical 20270308090000.
-- Additive P1. No AI execution, ranking, stage mutation, messages or cron.
BEGIN;

CREATE SCHEMA IF NOT EXISTS recruiter_intelligence;
REVOKE ALL ON SCHEMA recruiter_intelligence FROM PUBLIC, anon, authenticated;

CREATE TABLE public.rec_requirement_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  start_date date,
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array'),
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, version)
);
CREATE TABLE public.rec_requirement_review_heads (
  application_id uuid PRIMARY KEY REFERENCES public.job_applications(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK(revision >= 0),
  confirmed_profile_id uuid REFERENCES public.rec_requirement_profiles(id) ON DELETE CASCADE,
  confirmed_binding text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  next_action text CHECK(next_action IS NULL OR char_length(next_action) BETWEEN 1 AND 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rec_requirement_decisions (
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.rec_requirement_profiles(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL,
  state text NOT NULL CHECK(state IN ('met','not_met','clarify')),
  source_kind text CHECK(source_kind IN ('application_answer','application_cv','interview_source','external_reference')),
  source_reference text,
  source_version text,
  -- Opaque provenance for the accompanying human text. No FK: deleting an
  -- original case must not turn its private note into an unscoped note.
  source_case_id uuid CHECK(source_kind IS DISTINCT FROM 'interview_source' OR source_case_id IS NOT NULL),
  source_label text CHECK(source_label IS NULL OR char_length(source_label) BETWEEN 1 AND 500),
  valid_until date,
  note text NOT NULL CHECK(char_length(note) BETWEEN 1 AND 3000),
  neutral_question text CHECK(neutral_question IS NULL OR char_length(neutral_question) BETWEEN 1 AND 3000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(application_id, profile_id, requirement_id)
);
CREATE INDEX rec_requirement_decisions_application_idx ON public.rec_requirement_decisions(application_id, requirement_id, updated_at DESC);
CREATE TABLE public.rec_requirement_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.rec_requirement_profiles(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed boolean NOT NULL,
  binding_token text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(application_id, revision)
);
CREATE TABLE recruiter_intelligence.operations (
  operation_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_id uuid NOT NULL,
  kind text NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE
);
ALTER TABLE recruiter_intelligence.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recruiter_intelligence.operations FROM PUBLIC, anon, authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['rec_requirement_profiles','rec_requirement_review_heads','rec_requirement_decisions','rec_requirement_review_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
  END LOOP;
END $$;
GRANT SELECT ON public.rec_requirement_profiles,public.rec_requirement_review_heads TO authenticated;
CREATE POLICY rec_requirement_profiles_read ON public.rec_requirement_profiles FOR SELECT TO authenticated USING(public.rec_is_member(employer_id));
CREATE POLICY rec_requirement_heads_read ON public.rec_requirement_review_heads FOR SELECT TO authenticated USING(public.rec_is_member(employer_id));
-- Decision/event payloads are not granted for direct reads: citations to a
-- private interview never become organization-wide data through an audit row.

CREATE FUNCTION recruiter_intelligence.protect_profile() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 AND NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=OLD.job_id) THEN RETURN OLD; END IF;
  -- Only auth-user erasure may clear the actor without changing content.
  IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND NEW.confirmed_by IS NULL AND OLD.confirmed_by IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.confirmed_by)
     AND (to_jsonb(NEW)-'confirmed_by')=(to_jsonb(OLD)-'confirmed_by') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'RI_PROFILE_IMMUTABLE' USING ERRCODE='check_violation';
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.protect_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER rec_requirement_profiles_immutable BEFORE UPDATE OR DELETE ON public.rec_requirement_profiles
FOR EACH ROW EXECUTE FUNCTION recruiter_intelligence.protect_profile();

CREATE FUNCTION recruiter_intelligence.protect_used_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.jobs WHERE id=OLD.job_id) AND EXISTS(
    SELECT 1 FROM public.rec_requirement_profiles p, jsonb_array_elements(p.rules) r
    WHERE p.job_id=OLD.job_id AND CASE WHEN TG_TABLE_NAME='recruitment_requirements'
      THEN r->>'requirementId'=OLD.id::text ELSE r->>'questionId'=OLD.id::text END) THEN
    RAISE EXCEPTION 'RI_PROFILE_IDENTITY_IN_USE' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.protect_used_identity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER rec_requirement_identity_used BEFORE UPDATE OR DELETE ON public.recruitment_requirements FOR EACH ROW EXECUTE FUNCTION recruiter_intelligence.protect_used_identity();
CREATE TRIGGER rec_question_identity_used BEFORE UPDATE OR DELETE ON public.recruitment_questions FOR EACH ROW EXECUTE FUNCTION recruiter_intelligence.protect_used_identity();

-- No raw service-role bypass for the new canonical records. RPCs derive the
-- user and tenant themselves; an RLS-bypassing role gets no table privilege.
REVOKE ALL ON public.rec_requirement_profiles,public.rec_requirement_review_heads,public.rec_requirement_decisions,public.rec_requirement_review_events,recruiter_intelligence.operations FROM service_role;
CREATE FUNCTION recruiter_intelligence.protect_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
  IF TG_OP='TRUNCATE' THEN
    IF TG_TABLE_NAME IN ('recruitment_requirements','recruitment_questions') AND NOT EXISTS(SELECT 1 FROM public.rec_requirement_profiles) THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'RI_HISTORY_TRUNCATE' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN
    IF TG_TABLE_NAME='rec_requirement_review_events' THEN
      IF NOT EXISTS(SELECT 1 FROM public.job_applications WHERE id=OLD.application_id)
        OR NOT EXISTS(SELECT 1 FROM public.rec_requirement_profiles WHERE id=OLD.profile_id) THEN RETURN OLD; END IF;
    ELSIF TG_TABLE_NAME='operations' THEN
      IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.actor_id)
        OR NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=OLD.job_id) THEN RETURN OLD; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='rec_requirement_review_events' AND TG_OP='UPDATE' AND pg_trigger_depth()>1 THEN
    IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.actor_id)
      AND (to_jsonb(NEW)-'actor_id')=(to_jsonb(OLD)-'actor_id') THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'RI_HISTORY_IMMUTABLE' USING ERRCODE='check_violation';
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.protect_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER rec_requirement_events_immutable BEFORE UPDATE OR DELETE ON public.rec_requirement_review_events FOR EACH ROW EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_operations_immutable BEFORE UPDATE OR DELETE ON recruiter_intelligence.operations FOR EACH ROW EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_profiles_truncate BEFORE TRUNCATE ON public.rec_requirement_profiles FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_heads_truncate BEFORE TRUNCATE ON public.rec_requirement_review_heads FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_decisions_truncate BEFORE TRUNCATE ON public.rec_requirement_decisions FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_events_truncate BEFORE TRUNCATE ON public.rec_requirement_review_events FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_operations_truncate BEFORE TRUNCATE ON recruiter_intelligence.operations FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_originals_truncate BEFORE TRUNCATE ON public.recruitment_requirements FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_history();
CREATE TRIGGER rec_requirement_questions_truncate BEFORE TRUNCATE ON public.recruitment_questions FOR EACH STATEMENT EXECUTE FUNCTION recruiter_intelligence.protect_history();

CREATE FUNCTION recruiter_intelligence.operation_result(_id uuid,_scope uuid,_kind text,_request jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE o recruiter_intelligence.operations%ROWTYPE; BEGIN
  SELECT * INTO o FROM recruiter_intelligence.operations WHERE operation_id=_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF o.actor_id<>auth.uid() OR o.scope_id<>_scope OR o.kind<>_kind OR o.request_hash<>md5(_request::text) THEN
    RAISE EXCEPTION 'RI_OPERATION_CONFLICT' USING ERRCODE='check_violation';
  END IF; RETURN o.result;
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.operation_result(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION recruiter_intelligence.source_version(_application uuid,_kind text,_reference text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE; v jsonb;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id=_application;
  IF NOT FOUND OR a.withdrawn_at IS NOT NULL OR a.status='withdrawn' THEN RETURN NULL; END IF;
  IF _kind='application_answer' THEN
    SELECT to_jsonb(ans) INTO v FROM public.job_application_answers ans JOIN public.recruitment_questions q ON q.id=ans.question_id
    WHERE ans.application_id=a.id AND ans.question_id::text=_reference AND q.job_id=a.job_id;
  ELSIF _kind='application_cv' AND _reference=a.id::text THEN
    IF a.cv_source='cqrityjob_cv' AND a.cv_document_snapshot IS NOT NULL THEN v:=a.cv_document_snapshot;
    ELSIF a.cv_storage_path IS NOT NULL THEN
      SELECT jsonb_build_object('path',a.cv_storage_path,'object',to_jsonb(o)) INTO v
      FROM storage.objects o WHERE o.bucket_id='job-application-cvs' AND o.name=a.cv_storage_path;
    END IF;
  ELSIF _kind='interview_source' THEN
    SELECT to_jsonb(s) INTO v FROM public.scp_interview_case_sources s JOIN public.scp_interview_cases c ON c.id=s.case_id
    WHERE s.id::text=_reference AND c.application_id=a.id AND c.employer_id=a.employer_id
      AND s.retention_state='active' AND s.disclosure_id IS NULL;
    -- Passport disclosures must be consumed through their existing permission
    -- contract, never treated as ordinary persisted text in this P1 adapter.
  ELSIF _kind='external_reference' AND nullif(btrim(_reference),'') IS NOT NULL THEN
    v:=jsonb_build_object('application',a.id,'humanReference',btrim(_reference));
  END IF;
  IF v IS NULL THEN RETURN NULL; END IF;
  RETURN encode(public.digest(v::text,'sha256'),'hex');
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.source_version(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION recruiter_intelligence.profile_json(_job uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
SELECT jsonb_build_object('jobId',j.id,'profileId',p.id,'version',coalesce(p.version,0),'startDate',p.start_date,
  'confirmedAt',p.confirmed_at,'confirmedBy',p.confirmed_by,'canManage',public.rec_can_manage(j.id),'rules',coalesce(p.rules,'[]'::jsonb),
  'requirements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'labelSv',r.label_sv,'labelEn',r.label_en,'position',r.position) ORDER BY r.position,r.id) FROM public.recruitment_requirements r WHERE r.job_id=j.id),'[]'::jsonb),
  'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'requirementId',q.requirement_id,'promptSv',q.prompt_sv,'promptEn',q.prompt_en,'answerKind',q.answer_kind) ORDER BY q.position,q.id) FROM public.recruitment_questions q WHERE q.job_id=j.id),'[]'::jsonb))
FROM public.jobs j LEFT JOIN LATERAL(SELECT * FROM public.rec_requirement_profiles WHERE job_id=j.id ORDER BY version DESC LIMIT 1)p ON true WHERE j.id=_job;
$$;
REVOKE ALL ON FUNCTION recruiter_intelligence.profile_json(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rec_ri_get_profile(_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND public.rec_is_member(employer_id)) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN recruiter_intelligence.profile_json(_job_id);
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_get_profile(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_get_profile(uuid) TO authenticated;

CREATE FUNCTION public.rec_ri_confirm_profile(_job_id uuid,_expected_version integer,_operation_id uuid,_start_date date,_rules jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; v integer; r jsonb; req public.recruitment_requirements%ROWTYPE; q public.recruitment_questions%ROWTYPE; rules jsonb:='[]'; request jsonb; result jsonb; pid uuid;
BEGIN
  SELECT * INTO j FROM public.jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_can_manage(_job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF _operation_id IS NULL OR _expected_version IS NULL OR _rules IS NULL OR jsonb_typeof(_rules)<>'array' OR jsonb_array_length(_rules)>30 THEN RAISE EXCEPTION 'RI_PROFILE_INVALID' USING ERRCODE='check_violation'; END IF;
  request:=jsonb_build_object('version',_expected_version,'start',_start_date,'rules',_rules);
  result:=recruiter_intelligence.operation_result(_operation_id,_job_id,'profile',request); IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT coalesce(max(version),0) INTO v FROM public.rec_requirement_profiles WHERE job_id=_job_id;
  IF v<>_expected_version THEN RAISE EXCEPTION 'RI_STALE_VERSION' USING ERRCODE='check_violation'; END IF;
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
REVOKE ALL ON FUNCTION public.rec_ri_confirm_profile(uuid,integer,uuid,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_confirm_profile(uuid,integer,uuid,date,jsonb) TO authenticated;

CREATE FUNCTION recruiter_intelligence.criterion(_application uuid,_profile public.rec_requirement_profiles,_rule jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.rec_requirement_decisions%ROWTYPE; answer public.job_application_answers%ROWTYPE; sv text; state text:='clarify'; basis jsonb; current boolean:=false; has_override boolean:=false;
BEGIN
  SELECT dd.* INTO d FROM public.rec_requirement_decisions dd JOIN public.rec_requirement_profiles pp ON pp.id=dd.profile_id
  WHERE dd.application_id=_application AND dd.requirement_id::text=_rule->>'requirementId'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(pp.rules)old WHERE old->>'requirementId'=_rule->>'requirementId'
      AND old->>'decisionRule'=_rule->>'decisionRule' AND old->>'instructionSv'=_rule->>'instructionSv'
      AND (old->>'instructionEn') IS NOT DISTINCT FROM (_rule->>'instructionEn')
      AND (old->>'questionId') IS NOT DISTINCT FROM (_rule->>'questionId'))
  ORDER BY dd.updated_at DESC,pp.version DESC,dd.profile_id LIMIT 1;
  IF FOUND AND (d.source_kind IS NULL OR _rule->'acceptedSources' ? d.source_kind) THEN
    sv:=recruiter_intelligence.source_version(_application,d.source_kind,d.source_reference);
    current:=sv IS NOT NULL AND sv=d.source_version;
    IF current OR (d.state='clarify' AND d.source_kind IS NULL) THEN
      has_override:=true;
      state:=d.state;
      IF _rule->>'decisionRule'='valid_at_start' AND state<>'clarify' THEN
        state:=CASE WHEN d.valid_until IS NULL THEN 'clarify' WHEN d.valid_until>=_profile.start_date THEN 'met' ELSE 'not_met' END;
      END IF;
      IF d.source_kind IS NOT NULL THEN basis:=jsonb_build_object('kind',d.source_kind,'reference',d.source_reference,'version',d.source_version,'label',coalesce(d.source_label,d.source_kind),'answerBool',NULL,'answerText',NULL,'caseId',(SELECT s.case_id FROM public.scp_interview_case_sources s WHERE d.source_kind='interview_source' AND s.id::text=d.source_reference)); END IF;
    END IF;
  END IF;
  -- A currently accepted original explicit NO dominates clarification. A
  -- human may document a conflict, but cannot turn the fixed boolean rule
  -- into gray by clearing its citation or selecting clarify.
  IF _rule->>'decisionRule'='boolean_yes' AND (NOT has_override OR EXISTS(SELECT 1 FROM public.job_application_answers ans WHERE ans.application_id=_application AND ans.question_id::text=_rule->>'questionId' AND ans.answer_bool IS FALSE)) THEN
    SELECT * INTO answer FROM public.job_application_answers WHERE application_id=_application AND question_id::text=_rule->>'questionId';
    sv:=recruiter_intelligence.source_version(_application,'application_answer',_rule->>'questionId');
    IF FOUND AND sv IS NOT NULL THEN
      state:=CASE WHEN answer.answer_bool IS TRUE THEN 'met' WHEN answer.answer_bool IS FALSE THEN 'not_met' ELSE 'clarify' END;
      current:=true;
      basis:=jsonb_build_object('kind','application_answer','reference',answer.question_id,'version',sv,'label',coalesce(answer.prompt_sv_snapshot,answer.prompt_en_snapshot),'answerBool',answer.answer_bool,'answerText',answer.answer_text);
    END IF;
  END IF;
  RETURN _rule||jsonb_build_object('state',state,'source',basis,'sourceCurrent',current,'validUntil',d.valid_until,'note',d.note,'neutralQuestion',d.neutral_question,'reviewedBy',d.updated_by,'reviewedAt',d.updated_at,'_human_source_case_id',d.source_case_id);
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.criterion(uuid,public.rec_requirement_profiles,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION recruiter_intelligence.application_state(_application uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE; h public.rec_requirement_review_heads%ROWTYPE; c jsonb; criteria jsonb:='[]'; status text:='not_established'; musts integer:=0; no_count integer:=0; gaps integer:=0; token text; sources jsonb;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id=_application;
  SELECT * INTO p FROM public.rec_requirement_profiles WHERE job_id=a.job_id ORDER BY version DESC LIMIT 1;
  FOR c IN SELECT recruiter_intelligence.criterion(a.id,p,r) FROM jsonb_array_elements(coalesce(p.rules,'[]'))r LOOP
    criteria:=criteria||jsonb_build_array(c);
    IF c->>'kind'='mandatory' THEN musts:=musts+1; IF c->>'state'='not_met' THEN no_count:=no_count+1; ELSIF c->>'state'='clarify' THEN gaps:=gaps+1; END IF; END IF;
  END LOOP;
  IF musts>0 THEN status:=CASE WHEN no_count>0 THEN 'yellow' WHEN gaps>0 THEN 'gray' ELSE 'green' END; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'version',recruiter_intelligence.source_version(a.id,'application_answer',q.id::text)) ORDER BY q.id),'[]') INTO sources FROM public.recruitment_questions q WHERE q.job_id=a.job_id;
  sources:=sources||jsonb_build_array(jsonb_build_object('cv',recruiter_intelligence.source_version(a.id,'application_cv',a.id::text)));
  sources:=sources||coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'version',recruiter_intelligence.source_version(a.id,'interview_source',s.id::text)) ORDER BY s.id) FROM public.scp_interview_case_sources s JOIN public.scp_interview_cases cc ON cc.id=s.case_id WHERE cc.application_id=a.id AND (s.source_kind='candidate_cv' OR EXISTS(SELECT 1 FROM public.rec_requirement_decisions dd WHERE dd.application_id=a.id AND dd.source_kind='interview_source' AND dd.source_reference=s.id::text))),'[]');
  token:=md5(jsonb_build_object('profile',p.id,'rules',p.rules,'start',p.start_date,'sources',sources,'withdrawn',a.withdrawn_at,'cvSource',a.cv_source)::text);
  SELECT * INTO h FROM public.rec_requirement_review_heads WHERE application_id=a.id;
  RETURN jsonb_build_object('profileId',p.id,'profileVersion',coalesce(p.version,0),'requirementStatus',status,'reviewState',CASE WHEN h.confirmed_binding=token AND h.confirmed_profile_id=p.id THEN 'reviewed' WHEN h.reviewed_at IS NOT NULL THEN 'stale' ELSE 'pending' END,'analysisState','not_used','revision',coalesce(h.revision,0),'bindingToken',token,'criteria',criteria,'nextAction',h.next_action,'reviewedBy',h.reviewed_by,'reviewedAt',h.reviewed_at);
END $$;
REVOKE ALL ON FUNCTION recruiter_intelligence.application_state(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.rec_ri_get_review(_application_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE; state jsonb; sources jsonb; cv text;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id=_application_id;
  IF NOT FOUND OR NOT public.rec_is_member(a.employer_id) THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE='insufficient_privilege'; END IF;
  state:=recruiter_intelligence.application_state(a.id);
  -- Application membership does not widen access to another interview's
  -- private original. Keep the organization-level status, redact its private
  -- citation and human text for callers who cannot open that exact case.
  -- Human-text origin survives erasure and public explicit-NO fallback.
  -- It is internal only; the public response strips it in every branch.
  state:=jsonb_set(state,'{criteria}',coalesce((SELECT jsonb_agg(CASE
    WHEN cr->>'_human_source_case_id' IS NOT NULL AND NOT public.scp_iv_can_read_case((cr->>'_human_source_case_id')::uuid)
    THEN (cr-'_human_source_case_id')||jsonb_build_object('source',CASE WHEN cr#>>'{source,kind}'='interview_source' THEN NULL ELSE cr->'source' END,'sourceCurrent',CASE WHEN cr#>>'{source,kind}'='interview_source' THEN false ELSE (cr->>'sourceCurrent')::boolean END,'validUntil',NULL,'note',NULL,'neutralQuestion',NULL,'reviewedBy',NULL,'reviewedAt',NULL)
    ELSE cr-'_human_source_case_id' END) FROM jsonb_array_elements(state->'criteria')cr),'[]'));
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind','application_answer','reference',ans.question_id,'version',recruiter_intelligence.source_version(a.id,'application_answer',ans.question_id::text),'label',coalesce(ans.prompt_sv_snapshot,ans.prompt_en_snapshot),'answerBool',ans.answer_bool,'answerText',ans.answer_text) ORDER BY ans.question_id),'[]') INTO sources FROM public.job_application_answers ans WHERE ans.application_id=a.id AND recruiter_intelligence.source_version(a.id,'application_answer',ans.question_id::text) IS NOT NULL;
  cv:=recruiter_intelligence.source_version(a.id,'application_cv',a.id::text);
  IF cv IS NOT NULL THEN sources:=sources||jsonb_build_array(jsonb_build_object('kind','application_cv','reference',a.id,'version',cv,'label','Submitted CV','answerBool',NULL,'answerText',NULL)); END IF;
  sources:=sources||coalesce((SELECT jsonb_agg(jsonb_build_object('kind','interview_source','reference',s.id,'version',recruiter_intelligence.source_version(a.id,'interview_source',s.id::text),'label',s.label,'answerBool',NULL,'answerText',NULL,'caseId',cc.id) ORDER BY s.id) FROM public.scp_interview_case_sources s JOIN public.scp_interview_cases cc ON cc.id=s.case_id WHERE cc.application_id=a.id AND public.scp_iv_can_read_case(cc.id) AND recruiter_intelligence.source_version(a.id,'interview_source',s.id::text) IS NOT NULL),'[]');
  RETURN state||jsonb_build_object('applicationId',a.id,'jobId',a.job_id,'employerId',a.employer_id,'canManage',public.rec_can_manage(a.job_id),'profile',recruiter_intelligence.profile_json(a.job_id),'availableSources',sources,'responsibleUserId',(SELECT responsible_user_id FROM public.recruitment_application_meta WHERE application_id=a.id),'assignmentVersion',(SELECT version FROM public.recruitment_application_meta WHERE application_id=a.id));
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_get_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_get_review(uuid) TO authenticated;

CREATE FUNCTION public.rec_ri_save_review(_application_id uuid,_profile_id uuid,_expected_revision integer,_binding_token text,_operation_id uuid,_decisions jsonb,_confirm boolean,_next_action text,_responsible_user_id uuid,_expected_assignment_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE; p public.rec_requirement_profiles%ROWTYPE; h public.rec_requirement_review_heads%ROWTYPE; r jsonb; d jsonb; sourceversion text; wanted text; request jsonb; result jsonb; current jsonb; metadata public.recruitment_application_meta%ROWTYPE; initialized boolean; source_case uuid;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id=_application_id;
  IF NOT FOUND OR NOT public.rec_can_manage(a.job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM public.jobs WHERE id=a.job_id FOR UPDATE;
  SELECT * INTO a FROM public.job_applications WHERE id=_application_id FOR UPDATE;
  IF a.status NOT IN ('submitted','reviewing','interview') OR a.employer_archived_at IS NOT NULL THEN RAISE EXCEPTION 'APPLICATION_NOT_OPEN' USING ERRCODE='check_violation'; END IF;
  IF _operation_id IS NULL OR _expected_revision IS NULL OR _binding_token IS NULL OR _confirm IS NULL OR _decisions IS NULL OR jsonb_typeof(_decisions)<>'array' OR jsonb_array_length(_decisions)>30 OR char_length(_next_action)>2000 THEN RAISE EXCEPTION 'RI_REVIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  request:=jsonb_build_object('profile',_profile_id,'revision',_expected_revision,'binding',_binding_token,'decisions',_decisions,'confirm',_confirm,'next',_next_action,'responsible',_responsible_user_id,'assignmentVersion',_expected_assignment_version);
  result:=recruiter_intelligence.operation_result(_operation_id,a.id,'review',request); IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT * INTO p FROM public.rec_requirement_profiles WHERE job_id=a.job_id ORDER BY version DESC LIMIT 1;
  IF p.id IS NULL OR p.id IS DISTINCT FROM _profile_id THEN RAISE EXCEPTION 'RI_SOURCE_STALE' USING ERRCODE='check_violation'; END IF;
  INSERT INTO public.rec_requirement_review_heads(application_id,employer_id) VALUES(a.id,a.employer_id) ON CONFLICT DO NOTHING;
  SELECT * INTO h FROM public.rec_requirement_review_heads WHERE application_id=a.id FOR UPDATE;
  IF h.revision<>_expected_revision THEN RAISE EXCEPTION 'RI_STALE_VERSION' USING ERRCODE='check_violation'; END IF;
  current:=recruiter_intelligence.application_state(a.id);
  IF current->>'bindingToken' IS DISTINCT FROM _binding_token THEN RAISE EXCEPTION 'RI_SOURCE_STALE' USING ERRCODE='check_violation'; END IF;
  -- Existing assignment RPCs maintain their own revision. Compare the
  -- caller's observed version before decisions/actions can be persisted,
  -- even when the submitted responsible person appears unchanged. Lock the
  -- metadata row; no server-side 'latest version' may overwrite a stale draft.
  INSERT INTO public.recruitment_application_meta(application_id,job_id,employer_id)
    VALUES(a.id,a.job_id,a.employer_id) ON CONFLICT(application_id) DO NOTHING RETURNING true INTO initialized;
  SELECT * INTO metadata FROM public.recruitment_application_meta WHERE application_id=a.id FOR UPDATE;
  IF (_expected_assignment_version IS NULL AND initialized IS DISTINCT FROM true)
    OR (_expected_assignment_version IS NOT NULL AND (initialized IS TRUE OR metadata.version IS DISTINCT FROM _expected_assignment_version)) THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE='serialization_failure';
  END IF;
  IF (SELECT count(DISTINCT x->>'requirementId') FROM jsonb_array_elements(_decisions)x)<>jsonb_array_length(_decisions) THEN RAISE EXCEPTION 'RI_REVIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  IF _responsible_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employer_memberships WHERE employer_id=a.employer_id AND user_id=_responsible_user_id AND status='active') THEN RAISE EXCEPTION 'RESPONSIBLE_NOT_A_MEMBER' USING ERRCODE='check_violation'; END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(_decisions) LOOP
    SELECT value INTO r FROM jsonb_array_elements(p.rules) WHERE value->>'requirementId'=d->>'requirementId';
    IF r IS NULL OR coalesce(d->>'state','') NOT IN ('met','not_met','clarify') OR nullif(btrim(d->>'note'),'') IS NULL OR char_length(d->>'note')>3000 OR char_length(d->>'sourceLabel')>500 OR char_length(d->>'sourceReference')>500 OR char_length(d->>'neutralQuestion')>3000 THEN RAISE EXCEPTION 'RI_REVIEW_INVALID' USING ERRCODE='check_violation'; END IF;
    sourceversion:=recruiter_intelligence.source_version(a.id,d->>'sourceKind',d->>'sourceReference');
    IF d->>'sourceKind' IS NOT NULL AND (NOT(r->'acceptedSources' ? (d->>'sourceKind')) OR sourceversion IS NULL OR sourceversion IS DISTINCT FROM (d->>'sourceVersion')) THEN RAISE EXCEPTION 'RI_SOURCE_STALE' USING ERRCODE='check_violation'; END IF;
    source_case:=NULL;
    IF d->>'sourceKind'='interview_source' THEN
      SELECT s.case_id INTO source_case FROM public.scp_interview_case_sources s WHERE s.id::text=d->>'sourceReference' AND public.scp_iv_can_read_case(s.case_id);
      IF NOT FOUND THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
    END IF;
    IF d->>'state'<>'clarify' THEN
      IF sourceversion IS NULL THEN RAISE EXCEPTION 'RI_ACCEPTED_SOURCE_REQUIRED' USING ERRCODE='check_violation'; END IF;
      IF r->>'decisionRule'='boolean_yes' THEN
        SELECT CASE WHEN ans.answer_bool IS TRUE THEN 'met' WHEN ans.answer_bool IS FALSE THEN 'not_met' ELSE 'clarify' END INTO wanted FROM public.job_application_answers ans WHERE ans.application_id=a.id AND ans.question_id::text=r->>'questionId';
        IF d->>'sourceKind'<>'application_answer' OR d->>'sourceReference' IS DISTINCT FROM r->>'questionId' OR wanted IS DISTINCT FROM d->>'state' THEN RAISE EXCEPTION 'RI_ACCEPTED_SOURCE_REQUIRED' USING ERRCODE='check_violation'; END IF;
      ELSIF r->>'decisionRule'='valid_at_start' THEN
        wanted:=CASE WHEN d->>'validUntil' IS NULL THEN 'clarify' WHEN (d->>'validUntil')::date>=p.start_date THEN 'met' ELSE 'not_met' END;
        IF d->>'sourceKind' NOT IN ('application_cv','interview_source') OR wanted IS DISTINCT FROM d->>'state' THEN RAISE EXCEPTION 'RI_ACCEPTED_SOURCE_REQUIRED' USING ERRCODE='check_violation'; END IF;
        IF d->>'sourceKind'='interview_source' AND NOT EXISTS(SELECT 1 FROM public.scp_interview_case_sources s WHERE s.id::text=d->>'sourceReference' AND s.source_kind='candidate_cv') THEN RAISE EXCEPTION 'RI_ACCEPTED_SOURCE_REQUIRED' USING ERRCODE='check_violation'; END IF;
      END IF;
    END IF;
    INSERT INTO public.rec_requirement_decisions(application_id,profile_id,requirement_id,state,source_kind,source_reference,source_version,source_case_id,source_label,valid_until,note,neutral_question,updated_by,updated_at)
    VALUES(a.id,p.id,(d->>'requirementId')::uuid,d->>'state',d->>'sourceKind',d->>'sourceReference',sourceversion,source_case,nullif(btrim(d->>'sourceLabel'),''),(d->>'validUntil')::date,btrim(d->>'note'),nullif(btrim(d->>'neutralQuestion'),''),auth.uid(),clock_timestamp())
    ON CONFLICT(application_id,profile_id,requirement_id) DO UPDATE SET state=EXCLUDED.state,source_kind=EXCLUDED.source_kind,source_reference=EXCLUDED.source_reference,source_version=EXCLUDED.source_version,source_case_id=EXCLUDED.source_case_id,source_label=EXCLUDED.source_label,valid_until=EXCLUDED.valid_until,note=EXCLUDED.note,neutral_question=EXCLUDED.neutral_question,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp();
  END LOOP;
  IF _confirm AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.rules)rr WHERE rr->>'kind'='mandatory') OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.rules)rr WHERE rr->>'kind'='mandatory' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_decisions)dd WHERE dd->>'requirementId'=rr->>'requirementId'))) THEN RAISE EXCEPTION 'RI_REVIEW_INCOMPLETE' USING ERRCODE='check_violation'; END IF;
  current:=recruiter_intelligence.application_state(a.id);
  IF _confirm AND EXISTS(SELECT 1 FROM jsonb_array_elements(current->'criteria')c WHERE c->>'kind'='mandatory' AND c->>'state'='clarify') AND (nullif(btrim(_next_action),'') IS NULL OR _responsible_user_id IS NULL) THEN RAISE EXCEPTION 'RI_REVIEW_INCOMPLETE' USING ERRCODE='check_violation'; END IF;
  IF metadata.responsible_user_id IS DISTINCT FROM _responsible_user_id THEN PERFORM public.rec_set_application_responsible(a.id,_responsible_user_id,metadata.version); END IF;
  UPDATE public.rec_requirement_review_heads SET revision=h.revision+1,confirmed_profile_id=CASE WHEN _confirm THEN p.id ELSE NULL END,confirmed_binding=CASE WHEN _confirm THEN current->>'bindingToken' ELSE NULL END,reviewed_by=CASE WHEN _confirm THEN auth.uid() ELSE reviewed_by END,reviewed_at=CASE WHEN _confirm THEN clock_timestamp() ELSE reviewed_at END,next_action=nullif(btrim(_next_action),''),updated_at=clock_timestamp() WHERE application_id=a.id;
  INSERT INTO public.rec_requirement_review_events(application_id,employer_id,profile_id,revision,actor_id,confirmed,binding_token,payload) VALUES(a.id,a.employer_id,p.id,h.revision+1,auth.uid(),_confirm,current->>'bindingToken',request);
  result:=jsonb_build_object('applicationId',a.id,'revision',h.revision+1);
  INSERT INTO recruiter_intelligence.operations VALUES(_operation_id,auth.uid(),a.id,'review',md5(request::text),result,now(),a.job_id);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_save_review(uuid,uuid,integer,text,uuid,jsonb,boolean,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_save_review(uuid,uuid,integer,text,uuid,jsonb,boolean,text,uuid,integer) TO authenticated;

-- Single statement snapshot: unfiltered counts, globally filtered totals,
-- ordering and page/around selection all derive from the same MATERIALIZED base.
CREATE FUNCTION public.rec_ri_candidate_view(_employer_id uuid,_job_id uuid,_filters jsonb,_sort text,_dir text,_page integer,_size integer,_around uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f jsonb:=coalesce(_filters,'{}'); sortv text:=coalesce(_sort,'requirements'); stagev text:=coalesce(f->>'stage','open'); dirv text:=coalesce(_dir,CASE WHEN sortv IN ('requirements','applied') THEN 'desc' ELSE 'asc' END); result jsonb;
BEGIN
  IF NOT public.rec_is_member(_employer_id) OR (_job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.jobs WHERE id=_job_id AND employer_id=_employer_id)) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF jsonb_typeof(f)<>'object' OR sortv NOT IN ('requirements','applied','name','stage','activity') OR dirv NOT IN ('asc','desc') OR coalesce(_size,25) NOT BETWEEN 1 AND 100 OR stagev NOT IN ('all','received','archived','open','decided','new','review','interview')
    OR (f->>'requirement' IS NOT NULL AND f->>'requirement' NOT IN ('green','yellow','gray','not_established')) OR (f->>'review' IS NOT NULL AND f->>'review' NOT IN ('pending','reviewed','stale','remaining')) OR (f->>'analysis' IS NOT NULL AND f->>'analysis'<>'not_used') THEN RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  IF (f ? 'answers' AND jsonb_typeof(f->'answers')<>'array') OR char_length(f->>'q')>160
    OR (f->>'assessment' IS NOT NULL AND f->>'assessment'<>'open')
    OR (f->>'status' IS NOT NULL AND f->>'status' NOT IN ('submitted','reviewing','interview','hired','rejected','withdrawn'))
    OR (f->>'owner' IS NOT NULL AND f->>'owner'<>'none' AND f->>'owner' !~ '^[a-fA-F0-9-]{36}$')
    OR (f->>'job' IS NOT NULL AND f->>'job' !~ '^[a-fA-F0-9-]{36}$') THEN RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(f->'answers','[]'))af WHERE jsonb_typeof(af)<>'object' OR af->>'question_id' IS NULL OR jsonb_typeof(af->'value') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'CANDIDATE_VIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  WITH base AS MATERIALIZED(
    SELECT a.id,a.job_id,a.applicant_user_id,a.status,a.created_at,a.updated_at,a.cv_storage_path,a.cv_source,a.employer_archived_at,p.display_name,m.responsible_user_id,m.first_viewed_at,coalesce(m.version,1)meta_version,j.title_sv,j.title_en,
      public.rec_can_manage(a.job_id)can_manage,recruiter_intelligence.application_state(a.id)ri,
      b.starts_at next_activity_at,b.timezone next_activity_timezone,b.status next_activity_status,
      EXISTS(SELECT 1 FROM public.assessment_assignments aa WHERE aa.application_id=a.id AND aa.status NOT IN ('completed','cancelled','expired'))assessment_open
    FROM public.job_applications a JOIN public.jobs j ON j.id=a.job_id LEFT JOIN public.profiles p ON p.id=a.applicant_user_id
    LEFT JOIN public.recruitment_application_meta m ON m.application_id=a.id
    LEFT JOIN LATERAL(SELECT bk.starts_at,bk.timezone,bk.status FROM public.recruitment_interview_bookings bk WHERE bk.application_id=a.id AND a.status IN ('submitted','reviewing','interview') AND bk.status IN ('planned','invited','confirmed') AND bk.starts_at>=now()-interval '1 hour' ORDER BY bk.starts_at,bk.id LIMIT 1)b ON true
    WHERE a.employer_id=_employer_id AND (_job_id IS NULL OR a.job_id=_job_id)
  ), filtered AS MATERIALIZED(
    SELECT * FROM base a WHERE CASE stagev WHEN 'received' THEN true WHEN 'archived' THEN a.employer_archived_at IS NOT NULL ELSE a.employer_archived_at IS NULL END
      AND CASE stagev WHEN 'open' THEN a.status IN ('submitted','reviewing','interview') WHEN 'decided' THEN a.status NOT IN ('submitted','reviewing','interview') WHEN 'new' THEN a.status='submitted' WHEN 'review' THEN a.status='reviewing' WHEN 'interview' THEN a.status='interview' ELSE true END
      AND (f->>'job' IS NULL OR a.job_id::text=f->>'job') AND (f->>'status' IS NULL OR a.status=f->>'status')
      AND (f->>'owner' IS NULL OR CASE WHEN f->>'owner'='none' THEN a.responsible_user_id IS NULL ELSE a.responsible_user_id::text=f->>'owner' END)
      AND (nullif(btrim(f->>'q'),'') IS NULL OR a.display_name ILIKE '%'||replace(replace(replace(btrim(f->>'q'),'\','\\'),'%','\%'),'_','\_')||'%' ESCAPE '\')
      AND (f->>'requirement' IS NULL OR a.ri->>'requirementStatus'=f->>'requirement')
      AND (f->>'review' IS NULL OR CASE WHEN f->>'review'='remaining' THEN a.ri->>'reviewState'<>'reviewed' ELSE a.ri->>'reviewState'=f->>'review' END)
      AND (f->>'analysis' IS NULL OR a.ri->>'analysisState'=f->>'analysis')
      AND (f->>'assessment' IS NULL OR f->>'assessment'<>'open' OR a.assessment_open)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(f->'answers','[]'))af WHERE NOT EXISTS(SELECT 1 FROM public.job_application_answers ans WHERE ans.application_id=a.id AND ans.question_id::text=af->>'question_id' AND to_jsonb(ans.answer_bool)=af->'value'))
  ), ranked AS MATERIALIZED(
    SELECT f.*,row_number() OVER(ORDER BY
      CASE WHEN sortv='requirements' THEN CASE f.ri->>'requirementStatus' WHEN 'green' THEN 0 WHEN 'yellow' THEN 1 WHEN 'gray' THEN 2 ELSE 3 END END,
      CASE WHEN sortv IN ('requirements','applied') AND dirv='asc' THEN f.created_at END ASC,
      CASE WHEN sortv IN ('requirements','applied') AND dirv='desc' THEN f.created_at END DESC,
      CASE WHEN sortv='name' AND dirv='asc' THEN f.display_name COLLATE "sv-SE-x-icu" END ASC NULLS LAST,
      CASE WHEN sortv='name' AND dirv='desc' THEN f.display_name COLLATE "sv-SE-x-icu" END DESC NULLS LAST,
      CASE WHEN sortv='stage' THEN array_position(ARRAY['submitted','reviewing','interview','hired','rejected','withdrawn'],f.status)*CASE WHEN dirv='asc' THEN 1 ELSE -1 END END,
      CASE WHEN sortv='activity' AND dirv='asc' THEN f.next_activity_at END ASC NULLS LAST,
      CASE WHEN sortv='activity' AND dirv='desc' THEN f.next_activity_at END DESC NULLS LAST,f.id ASC)rank FROM filtered f
  ), bounds AS(SELECT count(*)total,greatest(1,ceil(count(*)::numeric/coalesce(_size,25))::integer)pages FROM filtered), pagebounds AS(SELECT *,least(greatest(coalesce(_page,1),1),pages)page FROM bounds), picked AS(
    SELECT r.* FROM ranked r CROSS JOIN pagebounds b WHERE CASE WHEN _around IS NOT NULL THEN r.rank BETWEEN (SELECT rank-1 FROM ranked WHERE id=_around) AND (SELECT rank+1 FROM ranked WHERE id=_around) ELSE r.rank>(b.page-1)*coalesce(_size,25) AND r.rank<=b.page*coalesce(_size,25) END
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg((to_jsonb(p)-'ri'-'cv_document_snapshot')||jsonb_build_object('requirement_status',p.ri->>'requirementStatus','review_state',p.ri->>'reviewState','analysis_state',p.ri->>'analysisState','next_action',p.ri->>'nextAction','review_revision',p.ri->'revision','profile_version',p.ri->'profileVersion') ORDER BY p.rank)FROM picked p),'[]'),
    'total',b.total,'page',b.page,'pages',b.pages,'from',coalesce((SELECT min(rank)FROM picked),0),'to',coalesce((SELECT max(rank)FROM picked),0),
    'counts',(SELECT jsonb_build_object('total',count(*),'new',count(*)FILTER(WHERE status='submitted'),'review',count(*)FILTER(WHERE status='reviewing'),'interview',count(*)FILTER(WHERE status='interview'),'hired',count(*)FILTER(WHERE status='hired'),'decided',count(*)FILTER(WHERE status NOT IN ('submitted','reviewing','interview')))FROM base WHERE employer_archived_at IS NULL),
    'intelligenceCounts',(SELECT jsonb_build_object('received',count(*),'reviewed',count(*)FILTER(WHERE ri->>'reviewState'='reviewed'),'remaining',count(*)FILTER(WHERE ri->>'reviewState'<>'reviewed'),'green',count(*)FILTER(WHERE ri->>'requirementStatus'='green'),'yellow',count(*)FILTER(WHERE ri->>'requirementStatus'='yellow'),'gray',count(*)FILTER(WHERE ri->>'requirementStatus'='gray'),'notEstablished',count(*)FILTER(WHERE ri->>'requirementStatus'='not_established'),'filtered',b.total,'filteredReviewed',(SELECT count(*)FROM filtered WHERE ri->>'reviewState'='reviewed'),'filteredRemaining',(SELECT count(*)FROM filtered WHERE ri->>'reviewState'<>'reviewed'),'archived',count(*)FILTER(WHERE employer_archived_at IS NOT NULL),'withdrawn',count(*)FILTER(WHERE status='withdrawn'),'decided',count(*)FILTER(WHERE status NOT IN ('submitted','reviewing','interview')))FROM base)) INTO result FROM pagebounds b;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid) TO authenticated;

CREATE FUNCTION public.rec_ri_manual_reference(_application_id uuid,_label text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a public.job_applications%ROWTYPE; BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id=_application_id;
  IF NOT FOUND OR NOT public.rec_can_manage(a.job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF nullif(btrim(_label),'') IS NULL OR char_length(_label)>500 THEN RAISE EXCEPTION 'RI_REVIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  RETURN jsonb_build_object('kind','external_reference','reference',btrim(_label),'label',btrim(_label),'version',recruiter_intelligence.source_version(a.id,'external_reference',btrim(_label)),'answerBool',NULL,'answerText',NULL);
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_manual_reference(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_manual_reference(uuid,text) TO authenticated;

CREATE FUNCTION public.rec_ri_transfer_requirements(_application_id uuid,_case_id uuid,_expected_revision integer,_binding_token text,_operation_id uuid,_requirement_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.job_applications%ROWTYPE; c public.scp_interview_cases%ROWTYPE; current jsonb; criterion jsonb; request jsonb; result jsonb; ids uuid[]:='{}'; sid uuid; body text; ref text; rid uuid;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id=_application_id;
  IF NOT FOUND OR NOT public.rec_can_manage(a.job_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM 1 FROM public.jobs WHERE id=a.job_id FOR UPDATE;
  PERFORM 1 FROM public.job_applications WHERE id=a.id FOR UPDATE;
  SELECT * INTO c FROM public.scp_interview_cases WHERE id=_case_id FOR UPDATE;
  IF NOT FOUND OR c.application_id IS DISTINCT FROM a.id OR c.employer_id<>a.employer_id OR NOT public.scp_iv_can_write_case(c.id) OR (c.status IN ('reported','cancelled') OR c.retention_state<>'active') THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  IF _operation_id IS NULL OR _requirement_ids IS NULL OR cardinality(_requirement_ids) NOT BETWEEN 1 AND 30 OR (SELECT count(DISTINCT r) FROM unnest(_requirement_ids)r)<>cardinality(_requirement_ids) THEN RAISE EXCEPTION 'RI_REVIEW_INVALID' USING ERRCODE='check_violation'; END IF;
  request:=jsonb_build_object('case',c.id,'revision',_expected_revision,'binding',_binding_token,'requirements',to_jsonb(_requirement_ids));
  result:=recruiter_intelligence.operation_result(_operation_id,a.id,'transfer',request); IF result IS NOT NULL THEN RETURN result; END IF;
  current:=recruiter_intelligence.application_state(a.id);
  IF (current->>'revision')::integer IS DISTINCT FROM _expected_revision OR current->>'bindingToken' IS DISTINCT FROM _binding_token THEN RAISE EXCEPTION 'RI_SOURCE_STALE' USING ERRCODE='check_violation'; END IF;
  FOREACH rid IN ARRAY _requirement_ids LOOP
    SELECT value INTO criterion FROM jsonb_array_elements(current->'criteria') WHERE value->>'requirementId'=rid::text;
    IF criterion IS NULL THEN RAISE EXCEPTION 'RI_REVIEW_INVALID' USING ERRCODE='check_violation'; END IF;
    -- Explicit selection copies only the supplied answer or human note and
    -- citations. A CV remains an application pointer, never a wholesale copy.
    IF criterion->>'_human_source_case_id' IS NOT NULL AND NOT public.scp_iv_can_read_case((criterion->>'_human_source_case_id')::uuid) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
    ref:=criterion#>>'{source,reference}';
    IF criterion#>>'{source,kind}'='interview_source' THEN
      IF NOT EXISTS(SELECT 1 FROM public.scp_interview_case_sources s WHERE s.id::text=ref AND public.scp_iv_can_read_case(s.case_id)) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
    END IF;
    body:=jsonb_build_object('requirementId',rid,'profileId',current->>'profileId','profileVersion',current->'profileVersion','source',criterion->'source','state',criterion->>'state','humanNote',criterion->>'note','neutralQuestion',criterion->>'neutralQuestion','nextAction',current->>'nextAction')::text;
    SELECT s.id INTO sid FROM public.scp_interview_case_sources s WHERE s.case_id=c.id AND s.source_kind='employer_requirements' AND s.retention_state='active' AND s.content_text=body ORDER BY s.created_at,s.id LIMIT 1;
    IF sid IS NULL THEN sid:=public.scp_iv_add_source(c.id,'employer_requirements',coalesce(criterion->>'labelSv',criterion->>'labelEn',rid::text),body,'recruitment_interview','Employer explicitly selected current requirement material for the same application interview.','employer_supplied',a.id); END IF;
    ids:=array_append(ids,sid);
  END LOOP;
  result:=jsonb_build_object('sourceIds',to_jsonb(ids),'count',cardinality(ids));
  INSERT INTO recruiter_intelligence.operations VALUES(_operation_id,auth.uid(),a.id,'transfer',md5(request::text),result,now(),a.job_id);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_transfer_requirements(uuid,uuid,integer,text,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_transfer_requirements(uuid,uuid,integer,text,uuid,uuid[]) TO authenticated;

-- Overview reuses the same authoritative received-scope predicate. One RPC,
-- no browser-side N+1 count reads; all jobs observe one statement snapshot.
CREATE FUNCTION public.rec_ri_overview_counts(_employer_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
  IF NOT public.rec_is_member(_employer_id) THEN RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('jobId',j.id,'intelligenceCounts',v.envelope->'intelligenceCounts','counts',v.envelope->'counts') ORDER BY j.id) FROM public.jobs j CROSS JOIN LATERAL(SELECT public.rec_ri_candidate_view(_employer_id,j.id,'{"stage":"received"}', 'requirements',NULL,1,1,NULL)envelope)v WHERE j.employer_id=_employer_id),'[]');
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_overview_counts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_overview_counts(uuid) TO authenticated;

COMMIT;
