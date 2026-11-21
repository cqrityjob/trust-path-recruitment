-- Rollback for 20270326090000_security_work_assistant_dispatch_and_decision.sql.
-- Pre-adoption only: refuses while any assistant job or any suggestion bound to
-- one exists (they are spend and AI provenance records), then restores the
-- 20261211090000 bodies of reserve/dispatch/complete_processing verbatim, the
-- original kind/target constraints, budget index and comments. Records a human
-- created through sw_decide_suggestion are ordinary programme records and are
-- never touched. Remove dependent application code before executing it.
BEGIN;
LOCK TABLE public.sw_processing_jobs, public.sw_ai_suggestions IN ACCESS EXCLUSIVE MODE;
DO $preserve$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sw_processing_jobs WHERE kind = 'assistant')
     OR EXISTS (SELECT 1 FROM public.sw_ai_suggestions WHERE job_id IS NOT NULL) THEN
    RAISE EXCEPTION 'SW_ASSISTANT_ROLLBACK_DATA_PRESENT: preserve assistant jobs and suggestions' USING ERRCODE = '23514';
  END IF;
END $preserve$;
DROP FUNCTION public.sw_decide_suggestion(uuid, uuid, integer, text, text, jsonb);
DROP FUNCTION sw_private.decide_suggestion(uuid, uuid, integer, text, text, jsonb);
DROP TRIGGER sw_15_suggestion_job ON public.sw_ai_suggestions;
DROP FUNCTION sw_private.require_suggestion_job();
ALTER TABLE public.sw_ai_suggestions DROP CONSTRAINT sw_ai_suggestions_job_once, DROP CONSTRAINT sw_ai_suggestions_job_fk;
ALTER TABLE public.sw_ai_suggestions DROP COLUMN job_id;
DROP FUNCTION public.sw_reserve_assistant(uuid, uuid, uuid, jsonb);
DROP FUNCTION sw_private.reserve_assistant(uuid, uuid, uuid, jsonb);
ALTER TABLE public.sw_processing_jobs
  DROP CONSTRAINT sw_processing_jobs_target_check,
  DROP CONSTRAINT sw_processing_jobs_kind_check,
  ADD CONSTRAINT sw_processing_jobs_kind_check CHECK (kind IN ('extraction','ai')),
  ADD CONSTRAINT sw_processing_jobs_check1 CHECK((kind='extraction' AND document_id IS NOT NULL AND assessment_id IS NULL AND activation_id IS NULL) OR (kind='ai' AND assessment_id IS NOT NULL AND document_id IS NULL AND activation_id IS NOT NULL));
DROP INDEX public.sw_jobs_budget;
CREATE INDEX sw_jobs_budget ON public.sw_processing_jobs(workspace_id,created_at) WHERE kind='ai';
-- 20261211090000 bodies, verbatim.
CREATE OR REPLACE FUNCTION sw_private.reserve_processing(_workspace_id uuid,_request_id uuid,_kind text,_assessment_id uuid,_document_id uuid,_expected_version integer,_activation_id uuid) RETURNS public.sw_processing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.sw_processing_jobs; a public.sw_assessments; d public.sw_documents; cfg public.sw_ai_activations; manifest jsonb; budget bigint;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.sw_workspaces WHERE id=_workspace_id FOR UPDATE;
 SELECT * INTO j FROM public.sw_processing_jobs WHERE id=_request_id;
 IF FOUND THEN
  IF j.workspace_id<>_workspace_id OR j.created_by<>auth.uid() OR j.kind IS DISTINCT FROM _kind OR j.assessment_id IS DISTINCT FROM _assessment_id OR j.document_id IS DISTINCT FROM _document_id OR j.expected_version IS DISTINCT FROM _expected_version OR j.activation_id IS DISTINCT FROM _activation_id THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN j;
 END IF;
 IF _kind='extraction' THEN
  SELECT * INTO d FROM public.sw_documents WHERE workspace_id=_workspace_id AND id=_document_id;
  IF d.id IS NULL OR d.status<>'reserved' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='sw-documents' AND name=d.object_path) THEN RAISE EXCEPTION 'SW_UPLOAD_REQUIRED' USING ERRCODE='23514'; END IF;
  manifest:=jsonb_build_object('document',to_jsonb(d));budget:=0;
 ELSIF _kind='ai' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=_activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations v WHERE v.activation_id=_activation_id);
  IF cfg.id IS NULL OR NOT EXISTS(SELECT 1 FROM sw_private.worker_keys WHERE active) THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=_assessment_id FOR UPDATE;
  IF a.id IS NULL OR a.version IS DISTINCT FROM _expected_version OR a.status NOT IN ('draft','in_review') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.sw_analysis_inputs i WHERE i.workspace_id=_workspace_id AND i.assessment_id=a.id AND i.review_status='pending') THEN RAISE EXCEPTION 'SW_SOURCE_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
  manifest:=jsonb_build_object('assessment',to_jsonb(a),'method',(SELECT to_jsonb(m) FROM public.sw_method_versions m WHERE id=a.method_version_id),
   'activation',to_jsonb(cfg),'questions',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position,q.id) FROM public.sw_analysis_questions q WHERE q.workspace_id=_workspace_id AND q.assessment_id=a.id),'[]'),
   'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('segmentId',coalesce(e.id,s.id),'sourceItemId',s.id,'text',s.factual_extract,'sha256',sw_private.hash_text(s.factual_extract),'locator',coalesce(e.locator,'Manual source'),'reviewVersion',i.version) ORDER BY s.id) FROM public.sw_analysis_inputs i JOIN public.sw_source_items s ON s.workspace_id=i.workspace_id AND s.id=i.source_item_id LEFT JOIN public.sw_extraction_segments e ON e.workspace_id=s.workspace_id AND e.source_item_id=s.id WHERE i.workspace_id=_workspace_id AND i.assessment_id=a.id AND i.review_status='accepted'),'[]'));
  IF jsonb_array_length(manifest->'sources')=0 THEN RAISE EXCEPTION 'SW_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND kind='ai' AND input_hash=sw_private.hash_text(manifest::text);
  IF FOUND THEN
   IF j.created_by<>auth.uid() THEN RAISE EXCEPTION 'SW_JOB_ALREADY_RESERVED' USING ERRCODE='42501'; END IF;
   RETURN j;
  END IF;
  budget:=cfg.max_cost_micros;
  IF coalesce((SELECT sum(coalesce(actual_cost_micros,reserved_cost_micros)) FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND kind='ai' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)+budget>cfg.daily_budget_micros THEN RAISE EXCEPTION 'SW_AI_BUDGET_EXCEEDED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'SW_PROCESSING_KIND_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO public.sw_processing_jobs(id,workspace_id,kind,assessment_id,document_id,expected_version,activation_id,input_manifest,input_hash,reserved_cost_micros)
 VALUES(_request_id,_workspace_id,_kind,_assessment_id,_document_id,_expected_version,_activation_id,manifest,sw_private.hash_text(manifest::text),budget) RETURNING * INTO j;
 RETURN j;
END $$;
CREATE OR REPLACE FUNCTION sw_private.dispatch_processing(_workspace_id uuid,_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.sw_processing_jobs; cfg public.sw_ai_activations;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.created_by<>auth.uid() THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF j.status<>'reserved' THEN RETURN jsonb_build_object('job',to_jsonb(j),'dispatch',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM sw_private.worker_keys WHERE active) THEN RAISE EXCEPTION 'SW_WORKER_NOT_CONFIGURED' USING ERRCODE='42501'; END IF;
 IF j.kind='ai' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=j.activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations WHERE activation_id=j.activation_id);
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
  -- Child review writes take this same lock. Read their committed state only
  -- after acquiring it, and hold it until dispatch has been recorded.
  PERFORM 1 FROM public.sw_assessments WHERE workspace_id=_workspace_id AND id=j.assessment_id AND version=j.expected_version AND status IN ('draft','in_review') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  -- Sources are unique per assessment and in the server-built manifest.
  -- Equal cardinality plus the ID/version check below proves exact equality,
  -- including a newly accepted input that did not bump assessment.version.
  IF (SELECT count(*) FROM public.sw_analysis_inputs WHERE workspace_id=_workspace_id AND assessment_id=j.assessment_id AND review_status='accepted') <> jsonb_array_length(j.input_manifest->'sources') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(j.input_manifest->'sources') source WHERE NOT EXISTS(SELECT 1 FROM public.sw_analysis_inputs i WHERE i.workspace_id=_workspace_id AND i.assessment_id=j.assessment_id AND i.source_item_id=(source->>'sourceItemId')::uuid AND i.review_status='accepted' AND i.version=(source->>'reviewVersion')::integer)) OR j.input_manifest->'questions' IS DISTINCT FROM coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position,q.id) FROM public.sw_analysis_questions q WHERE q.workspace_id=_workspace_id AND q.assessment_id=j.assessment_id),'[]') THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE='PT409'; END IF;
 END IF;
 UPDATE public.sw_processing_jobs SET status='dispatched',fence=gen_random_uuid(),dispatched_at=now() WHERE id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('job',to_jsonb(j),'dispatch',true);
END $$;
CREATE OR REPLACE FUNCTION sw_private.complete_processing(_workspace_id uuid,_job_id uuid,_fence uuid,_key_id text,_payload text,_signature text) RETURNS public.sw_processing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.sw_processing_jobs; d public.sw_documents; cfg public.sw_ai_activations; body jsonb; segment jsonb; sid uuid; total_chars integer:=0; count_segments integer:=0; actual_cost bigint; outcome text;
BEGIN
 IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE='42501'; END IF;
 IF _payload IS NULL OR octet_length(_payload)>1048576 THEN RAISE EXCEPTION 'SW_PAYLOAD_TOO_LARGE' USING ERRCODE='23514'; END IF;
 SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND id=_job_id FOR UPDATE;
 IF j.id IS NULL OR j.created_by<>auth.uid() OR j.fence IS DISTINCT FROM _fence OR _fence IS NULL THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM sw_private.check_receipt(j.kind,j.id,j.fence,_key_id,_payload,_signature);
 IF j.output_hash IS NOT NULL THEN
  IF j.output_hash IS DISTINCT FROM sw_private.hash_text(_payload) THEN RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN j;
 END IF;
 IF j.status<>'dispatched' THEN RAISE EXCEPTION 'SW_JOB_FINAL' USING ERRCODE='23514'; END IF;
 body:=_payload::jsonb;outcome:=body->>'status';
 IF jsonb_typeof(body)<>'object' OR outcome IS NULL OR outcome NOT IN ('succeeded','failed','outcome_unknown') THEN RAISE EXCEPTION 'SW_OUTPUT_INVALID' USING ERRCODE='23514'; END IF;
 IF j.kind='extraction' AND outcome='succeeded' THEN
  SELECT * INTO d FROM public.sw_documents WHERE workspace_id=_workspace_id AND id=j.document_id FOR UPDATE;
  IF body->>'sha256' IS DISTINCT FROM d.sha256 OR jsonb_typeof(body->'segments') IS DISTINCT FROM 'array' OR char_length(coalesce(body->>'parserVersion','')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SW_EXTRACTION_INVALID' USING ERRCODE='23514'; END IF;
  FOR segment IN SELECT * FROM jsonb_array_elements(body->'segments') LOOP
   total_chars:=total_chars+char_length(coalesce(segment->>'text',''));count_segments:=count_segments+1;
   IF char_length(btrim(coalesce(segment->>'text',''))) NOT BETWEEN 1 AND 16000 OR total_chars>200000 OR count_segments>200 THEN RAISE EXCEPTION 'SW_EXTRACTION_LIMIT' USING ERRCODE='23514'; END IF;
   sid:=(segment->>'id')::uuid;
   INSERT INTO sw_private.source_write_intents VALUES(sid,_workspace_id,sw_private.hash_text(segment->>'text'),txid_current());
   INSERT INTO public.sw_source_items(id,workspace_id,source_id,deduplication_key,original_title,factual_extract,retrieval_status)
   VALUES(sid,_workspace_id,d.source_id,j.id::text||':'||sid::text,d.filename,segment->>'text','extracted');
   INSERT INTO public.sw_extraction_segments(id,workspace_id,document_id,source_item_id,job_id,parser_version,locator,page_number,section,text_sha256)
   VALUES(sid,_workspace_id,d.id,sid,j.id,body->>'parserVersion',segment->>'locator',(segment->>'pageNumber')::integer,segment->>'section',sw_private.hash_text(segment->>'text'));
   DELETE FROM sw_private.source_write_intents WHERE source_id=sid;
  END LOOP;
  IF count_segments=0 THEN RAISE EXCEPTION 'SW_EMPTY_EXTRACTION' USING ERRCODE='23514'; END IF;
  UPDATE public.sw_documents SET status='ready' WHERE id=d.id;
 ELSIF j.kind='extraction' AND outcome='failed' THEN UPDATE public.sw_documents SET status='failed' WHERE id=j.document_id;
 ELSIF j.kind='ai' AND outcome='succeeded' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=j.activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations WHERE activation_id=j.activation_id);
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
  IF body->>'provider' IS DISTINCT FROM cfg.provider OR body->>'model' IS DISTINCT FROM cfg.model OR jsonb_typeof(body->'output') IS DISTINCT FROM 'object' OR octet_length((body->'output')::text)>262144 OR body->>'inputTokens' IS NULL OR body->>'outputTokens' IS NULL OR (body->>'outputTokens')::bigint>cfg.max_output_tokens OR (body->>'inputTokens')::bigint<0 OR (body->>'outputTokens')::bigint<0 THEN RAISE EXCEPTION 'SW_AI_OUTPUT_INVALID' USING ERRCODE='23514'; END IF;
  actual_cost:=(body->>'costMicros')::bigint;
 END IF;
 IF outcome<>'succeeded' AND char_length(coalesce(body->>'errorCode','')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'SW_ERROR_CODE_REQUIRED' USING ERRCODE='23514'; END IF;
 UPDATE public.sw_processing_jobs SET status=outcome,completed_at=now(),output=CASE WHEN j.kind='ai' THEN body->'output' ELSE jsonb_build_object('segmentCount',count_segments) END,
  output_hash=sw_private.hash_text(_payload),error_code=body->>'errorCode',actual_cost_micros=actual_cost WHERE id=j.id RETURNING * INTO j;
 RETURN j;
END $$;
COMMENT ON TABLE public.sw_ai_suggestions IS 'AI proposals. Approving or rejecting changes only this row; authoritative records are written by the user through the ordinary editor path.';
COMMENT ON TABLE public.sw_processing_jobs IS 'One dispatch fence per request. Ambiguous provider outcome is terminal and retains budget; no automatic replay or claim lease stealing.';
COMMIT;
