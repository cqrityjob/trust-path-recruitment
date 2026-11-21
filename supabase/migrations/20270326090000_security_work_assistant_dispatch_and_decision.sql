-- =============================================================================
-- Security Work: one billable dispatch path for the assistant, and an atomic,
-- idempotent human decision on an AI suggestion.
-- =============================================================================
--
-- Next canonical ledger slot after 20270325090000 (docs/release/release-sequence.md;
-- the ledger leads the clock). Schema only: no provider, key, activation,
-- worker secret or schedule is created, and no existing row is rewritten.
--
-- WHY. Two defects in the programme assistant (20270117090000), found in code
-- review of main 93ef3602 and described in
-- docs/security-intelligence/security-work-runtime-map.md:
--
--  A. Duplicate billable dispatch. The analysis path reserves budget and takes
--     a single-dispatch fence (sw_reserve_processing / sw_dispatch_processing).
--     The assistant did neither: it read sw_ai_suggestions by request id, and
--     if no row existed it called the provider, inserting the suggestion only
--     afterwards. Two concurrent requests with one id both reached the
--     provider. Its spend was also outside the workspace's daily budget.
--  B. Non-atomic application. Approving a suggestion wrote business records
--     (assets, actions, mandate text, risk narrative, report narrative) one
--     PostgREST call at a time, then recorded the decision. A failure in the
--     middle left some records without a decision; a concurrent second
--     approval could create a second set.
--
-- WHAT THIS ADDS.
--  1. sw_processing_jobs accepts kind 'assistant': no assessment, no document,
--     an activation. The assistant reserves through sw_reserve_assistant
--     (request id = operation id; the frozen manifest is everything the model
--     will see; the same daily budget as analysis drafts), and dispatches and
--     completes through the EXISTING sw_dispatch_processing /
--     sw_complete_processing fence and signed receipt. Their bodies change by
--     one branch each, shown below; reserve_processing's budget sum now counts
--     both kinds, so the two paths share ONE ledger.
--  2. sw_ai_suggestions.job_id. A suggestion can be inserted only from a
--     succeeded assistant job of the same id, created by the same person, and
--     its kind, context, request text, sources, prompt version, provider,
--     model and content must equal the reserved manifest and the signed
--     output. No other path can create a suggestion, so no suggestion can
--     claim AI provenance that the ledger does not hold.
--  3. sw_decide_suggestion: approve-and-apply or reject in ONE transaction,
--     SECURITY INVOKER (so the caller's RLS, guard_record, audit and lifecycle
--     triggers apply exactly as on the forms), locking the suggestion first.
--     A retry of the same decision by the same person returns the stored
--     result and writes nothing; a different decision, a stale version or a
--     stale target version is a conflict; any failure leaves nothing behind.
--
-- NOT CHANGED: analysis jobs, the analysis manifest/dispatch checks, extraction,
-- sw_apply_ai_draft (it already refuses any job whose kind is not 'ai'),
-- activations, worker keys, RLS policies, grants on existing objects.
--
-- Rollback: supabase/rollback/20270326090000_security_work_assistant_dispatch_and_decision_rollback.sql
-- Suite:    supabase/tests/security_work_assistant_dispatch_test.sql
BEGIN;

-- Fail closed if the constraint we replace is not the one this file was
-- written against (auto-named in 20261211090000).
DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sw_processing_jobs'::regclass AND conname = 'sw_processing_jobs_check1'
      AND pg_get_constraintdef(oid) LIKE '%kind = ''extraction''::text%kind = ''ai''::text%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sw_processing_jobs'::regclass AND conname = 'sw_processing_jobs_kind_check'
  ) THEN
    RAISE EXCEPTION 'SW_ASSISTANT_PRECONDITION: sw_processing_jobs constraints differ from 20261211090000';
  END IF;
END
$precondition$;

-- -----------------------------------------------------------------------------
-- 1. The assistant joins the processing ledger
-- -----------------------------------------------------------------------------
ALTER TABLE public.sw_processing_jobs
  DROP CONSTRAINT sw_processing_jobs_kind_check,
  DROP CONSTRAINT sw_processing_jobs_check1,
  ADD CONSTRAINT sw_processing_jobs_kind_check CHECK (kind IN ('extraction', 'ai', 'assistant')),
  ADD CONSTRAINT sw_processing_jobs_target_check CHECK (
    (kind = 'extraction' AND document_id IS NOT NULL AND assessment_id IS NULL AND activation_id IS NULL)
    OR (kind = 'ai' AND assessment_id IS NOT NULL AND document_id IS NULL AND activation_id IS NOT NULL)
    OR (kind = 'assistant' AND assessment_id IS NULL AND document_id IS NULL AND expected_version IS NULL AND activation_id IS NOT NULL)
  );
DROP INDEX public.sw_jobs_budget;
CREATE INDEX sw_jobs_budget ON public.sw_processing_jobs(workspace_id, created_at) WHERE kind IN ('ai', 'assistant');

-- One daily budget for every billable kind (the only change in this body).
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
  IF coalesce((SELECT sum(coalesce(actual_cost_micros,reserved_cost_micros)) FROM public.sw_processing_jobs WHERE workspace_id=_workspace_id AND kind IN ('ai','assistant') AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)+budget>cfg.daily_budget_micros THEN RAISE EXCEPTION 'SW_AI_BUDGET_EXCEEDED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'SW_PROCESSING_KIND_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO public.sw_processing_jobs(id,workspace_id,kind,assessment_id,document_id,expected_version,activation_id,input_manifest,input_hash,reserved_cost_micros)
 VALUES(_request_id,_workspace_id,_kind,_assessment_id,_document_id,_expected_version,_activation_id,manifest,sw_private.hash_text(manifest::text),budget) RETURNING * INTO j;
 RETURN j;
END $$;

-- The assistant's reservation. The request id is the operation id: a retry with
-- the same id and the same frozen input returns the same job (whatever its
-- state, including dispatched or outcome_unknown -- never permission to send
-- again); the same id with anything else is refused. The manifest is built by
-- the server from caller-scoped reads and is everything the model will see.
-- Reserving it sends nothing: the server re-collects the context and compares
-- it with this manifest before it asks sw_dispatch_processing for the fence.
CREATE FUNCTION sw_private.reserve_assistant(_workspace_id uuid, _request_id uuid, _activation_id uuid, _input_manifest jsonb) RETURNS public.sw_processing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.sw_processing_jobs; cfg public.sw_ai_activations; h text;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _request_id IS NULL OR _activation_id IS NULL OR _input_manifest IS NULL OR jsonb_typeof(_input_manifest) <> 'object'
     OR octet_length(_input_manifest::text) > 262144
     OR NOT (_input_manifest ?& ARRAY['kind', 'capability', 'contextKind', 'contextId', 'requestText', 'language', 'promptVersion', 'decisionRequired', 'context', 'sources'])
     OR jsonb_typeof(_input_manifest->'sources') <> 'array' OR jsonb_typeof(_input_manifest->'context') <> 'object' THEN
    RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
  END IF;
  h := sw_private.hash_text(_input_manifest::text);
  -- The same serialization point as every other reservation in the workspace.
  PERFORM 1 FROM public.sw_workspaces WHERE id = _workspace_id FOR UPDATE;
  SELECT * INTO j FROM public.sw_processing_jobs WHERE id = _request_id;
  IF FOUND THEN
    IF j.workspace_id <> _workspace_id OR j.created_by <> auth.uid() OR j.kind <> 'assistant'
       OR j.activation_id IS DISTINCT FROM _activation_id OR j.input_hash <> h THEN
      RAISE EXCEPTION 'SW_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23514';
    END IF;
    RETURN j;
  END IF;
  SELECT * INTO cfg FROM public.sw_ai_activations
   WHERE id = _activation_id AND workspace_id = _workspace_id AND valid_until > now()
     AND NOT EXISTS (SELECT 1 FROM public.sw_ai_activation_revocations v WHERE v.activation_id = _activation_id);
  IF cfg.id IS NULL OR NOT EXISTS (SELECT 1 FROM sw_private.worker_keys WHERE active) THEN
    RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE = '42501';
  END IF;
  IF coalesce((SELECT sum(coalesce(actual_cost_micros, reserved_cost_micros)) FROM public.sw_processing_jobs
                WHERE workspace_id = _workspace_id AND kind IN ('ai', 'assistant')
                  AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)
     + cfg.max_cost_micros > cfg.daily_budget_micros THEN
    RAISE EXCEPTION 'SW_AI_BUDGET_EXCEEDED' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.sw_processing_jobs(id, workspace_id, kind, activation_id, input_manifest, input_hash, reserved_cost_micros)
  VALUES (_request_id, _workspace_id, 'assistant', _activation_id, _input_manifest, h, cfg.max_cost_micros)
  RETURNING * INTO j;
  RETURN j;
END $$;
CREATE FUNCTION public.sw_reserve_assistant(_workspace_id uuid, _request_id uuid, _activation_id uuid, _input_manifest jsonb) RETURNS public.sw_processing_jobs
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.reserve_assistant(_workspace_id, _request_id, _activation_id, _input_manifest)$$;

-- The existing single-dispatch fence, with one added branch for 'assistant'.
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
 -- An assistant request has no assessment to pin: its frozen manifest is the
 -- whole input, and the activation must still be live at the moment of dispatch.
 IF j.kind='assistant' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=j.activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations WHERE activation_id=j.activation_id);
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
 END IF;
 UPDATE public.sw_processing_jobs SET status='dispatched',fence=gen_random_uuid(),dispatched_at=now() WHERE id=j.id RETURNING * INTO j;
 RETURN jsonb_build_object('job',to_jsonb(j),'dispatch',true);
END $$;

-- The existing signed completion: an assistant result is validated exactly like
-- an analysis draft (activation live, provider and model as approved, token
-- bounds) and its output is stored. The only changes in this body are the two
-- kind tests.
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
 ELSIF j.kind IN ('ai','assistant') AND outcome='succeeded' THEN
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id=j.activation_id AND workspace_id=_workspace_id AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM public.sw_ai_activation_revocations WHERE activation_id=j.activation_id);
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'SW_AI_NOT_ACTIVATED' USING ERRCODE='42501'; END IF;
  IF body->>'provider' IS DISTINCT FROM cfg.provider OR body->>'model' IS DISTINCT FROM cfg.model OR jsonb_typeof(body->'output') IS DISTINCT FROM 'object' OR octet_length((body->'output')::text)>262144 OR body->>'inputTokens' IS NULL OR body->>'outputTokens' IS NULL OR (body->>'outputTokens')::bigint>cfg.max_output_tokens OR (body->>'inputTokens')::bigint<0 OR (body->>'outputTokens')::bigint<0 THEN RAISE EXCEPTION 'SW_AI_OUTPUT_INVALID' USING ERRCODE='23514'; END IF;
  actual_cost:=(body->>'costMicros')::bigint;
 END IF;
 IF outcome<>'succeeded' AND char_length(coalesce(body->>'errorCode','')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'SW_ERROR_CODE_REQUIRED' USING ERRCODE='23514'; END IF;
 UPDATE public.sw_processing_jobs SET status=outcome,completed_at=now(),output=CASE WHEN j.kind IN ('ai','assistant') THEN body->'output' ELSE jsonb_build_object('segmentCount',count_segments) END,
  output_hash=sw_private.hash_text(_payload),error_code=body->>'errorCode',actual_cost_micros=actual_cost WHERE id=j.id RETURNING * INTO j;
 RETURN j;
END $$;

-- -----------------------------------------------------------------------------
-- 2. A suggestion exists only as the stored result of a succeeded assistant job
-- -----------------------------------------------------------------------------
ALTER TABLE public.sw_ai_suggestions
  ADD COLUMN job_id uuid,
  ADD CONSTRAINT sw_ai_suggestions_job_fk FOREIGN KEY (workspace_id, job_id) REFERENCES public.sw_processing_jobs(workspace_id, id),
  ADD CONSTRAINT sw_ai_suggestions_job_once UNIQUE (workspace_id, job_id);

CREATE FUNCTION sw_private.require_suggestion_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.sw_processing_jobs; cfg public.sw_ai_activations; m jsonb;
BEGIN
  SELECT * INTO j FROM public.sw_processing_jobs WHERE workspace_id = NEW.workspace_id AND id = NEW.job_id;
  IF NEW.job_id IS NULL OR j.id IS NULL OR j.kind <> 'assistant' OR j.status <> 'succeeded'
     OR NEW.id IS DISTINCT FROM j.id OR j.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'SW_SUGGESTION_JOB_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cfg FROM public.sw_ai_activations WHERE id = j.activation_id;
  m := j.input_manifest;
  IF NEW.kind IS DISTINCT FROM m->>'kind'
     OR NEW.context_kind IS DISTINCT FROM m->>'contextKind'
     OR NEW.context_id IS DISTINCT FROM (CASE WHEN m->>'contextId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (m->>'contextId')::uuid END)
     OR NEW.request_text IS DISTINCT FROM m->>'requestText'
     OR NEW.source_records IS DISTINCT FROM m->'sources'
     OR NEW.prompt_version IS DISTINCT FROM m->>'promptVersion'
     OR NEW.decision_required IS DISTINCT FROM (m->>'decisionRequired')::boolean
     OR NEW.provider IS DISTINCT FROM cfg.provider OR NEW.model IS DISTINCT FROM cfg.model
     OR NEW.content IS DISTINCT FROM j.output THEN
    RAISE EXCEPTION 'SW_SUGGESTION_PROVENANCE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sw_15_suggestion_job BEFORE INSERT ON public.sw_ai_suggestions FOR EACH ROW EXECUTE FUNCTION sw_private.require_suggestion_job();

-- -----------------------------------------------------------------------------
-- 3. The human decision, in one transaction
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: every write below is the caller's own, through
-- RLS and the same guard/audit/lifecycle triggers as the forms. Locks are taken
-- in one order -- the suggestion, then its single target -- so two approvers
-- serialize on the suggestion and the second sees the first one's decision.
CREATE FUNCTION sw_private.decide_suggestion(_workspace_id uuid, _suggestion_id uuid, _expected_version integer, _status text, _decision_note text, _apply jsonb) RETURNS public.sw_ai_suggestions
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  s public.sw_ai_suggestions;
  _kind text := _apply->>'kind';
  _request_hash text;
  _ids uuid[] := '{}';
  _id uuid;
  _item jsonb;
  _target text;
  _extra jsonb := '{}';
  _gap public.sw_gaps;
  _report public.sw_management_reports;
  _narrative jsonb;
  _section text;
BEGIN
  IF NOT sw_private.can_edit(_workspace_id) THEN RAISE EXCEPTION 'SW_EDITOR_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _status IS NULL OR _status NOT IN ('approved', 'rejected') OR _decision_note IS NULL OR _expected_version IS NULL
     OR _apply IS NULL OR jsonb_typeof(_apply) <> 'object' OR _kind IS NULL
     OR (_status = 'rejected' AND _kind <> 'none') THEN
    RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
  END IF;
  _request_hash := sw_private.hash_text(jsonb_build_object('status', _status, 'note', _decision_note, 'apply', _apply)::text);
  SELECT * INTO s FROM public.sw_ai_suggestions WHERE workspace_id = _workspace_id AND id = _suggestion_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF s.status <> 'proposed' THEN
    -- The same person retrying the same decision gets the stored result.
    IF s.status = _status AND s.decided_by = auth.uid() AND s.applied_target->>'request_hash' = _request_hash THEN RETURN s; END IF;
    RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF s.version <> _expected_version THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409'; END IF;

  IF _status = 'approved' AND _kind <> 'none' THEN
    IF _kind = 'mandate_document' AND s.kind = 'mandate_draft' THEN
      UPDATE public.sw_security_mandates
         SET mandate_document = s.content->>'text',
             document_provenance = jsonb_build_object('origin', 'ai_suggestion', 'suggestion_id', s.id)
       WHERE workspace_id = _workspace_id AND version = (_apply->>'version')::integer
      RETURNING id INTO _id;
      IF _id IS NULL THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409'; END IF;
      _target := 'sw_security_mandates'; _ids := ARRAY[_id];
    ELSIF _kind = 'assets' AND s.kind = 'asset_suggestions' THEN
      IF jsonb_typeof(_apply->'assets') IS DISTINCT FROM 'array' OR jsonb_array_length(_apply->'assets') NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
      END IF;
      FOR _item IN SELECT value FROM jsonb_array_elements(_apply->'assets') LOOP
        IF jsonb_typeof(_item->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(_item->'description') IS DISTINCT FROM 'string'
           OR jsonb_typeof(_item->'category') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
        END IF;
        INSERT INTO public.sw_protected_assets(workspace_id, name, description, category, business_importance, status)
        VALUES (_workspace_id, _item->>'name', _item->>'description', _item->>'category', 'medium', 'active')
        RETURNING id INTO _id;
        _ids := _ids || _id;
      END LOOP;
      _target := 'sw_protected_assets';
    ELSIF _kind = 'risk_scenario' AND s.kind = 'risk_scenario' THEN
      -- Narrative only: rating, owner and status stay as the human left them.
      UPDATE public.sw_risks
         SET threat_scenario = s.content->>'threat_scenario', description = s.content->>'description'
       WHERE workspace_id = _workspace_id AND id = (_apply->>'riskId')::uuid
         AND version = (_apply->>'version')::integer AND status = 'proposed'
      RETURNING id INTO _id;
      IF _id IS NULL THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409'; END IF;
      _target := 'sw_risks'; _ids := ARRAY[_id];
    ELSIF _kind = 'actions' AND s.kind = 'gap_action' THEN
      SELECT * INTO _gap FROM public.sw_gaps WHERE workspace_id = _workspace_id AND id = (_apply->>'gapId')::uuid;
      IF _gap.id IS NULL THEN RAISE EXCEPTION 'SW_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
      IF jsonb_typeof(_apply->'actions') IS DISTINCT FROM 'array' OR jsonb_array_length(_apply->'actions') NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
      END IF;
      FOR _item IN SELECT value FROM jsonb_array_elements(_apply->'actions') LOOP
        IF jsonb_typeof(_item->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(_item->'description') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
        END IF;
        INSERT INTO public.sw_actions(workspace_id, risk_id, gap_id, asset_id, source_kind, title, description, priority, status)
        VALUES (_workspace_id, _gap.related_risk_id, _gap.id, _gap.related_asset_id, 'gap', _item->>'title', _item->>'description', 'medium', 'open')
        RETURNING id INTO _id;
        _ids := _ids || _id;
      END LOOP;
      _target := 'sw_actions';
    ELSIF _kind = 'report_narrative' AND s.kind = 'report_narrative' THEN
      SELECT * INTO _report FROM public.sw_management_reports
       WHERE workspace_id = _workspace_id AND id = (_apply->>'reportId')::uuid FOR UPDATE;
      IF _report.id IS NULL OR _report.status <> 'draft' OR _report.version IS DISTINCT FROM (_apply->>'version')::integer THEN
        RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409';
      END IF;
      IF jsonb_typeof(_apply->'sections') IS DISTINCT FROM 'array' OR jsonb_array_length(_apply->'sections') NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
      END IF;
      _narrative := coalesce(_report.narrative, '{}'::jsonb);
      FOR _section IN SELECT value FROM jsonb_array_elements_text(_apply->'sections') LOOP
        IF jsonb_typeof(s.content->'sections'->_section) IS DISTINCT FROM 'string' OR btrim(s.content->'sections'->>_section) = '' THEN
          RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
        END IF;
        _narrative := jsonb_set(_narrative, ARRAY[_section],
          jsonb_build_object('text', s.content->'sections'->>_section, 'origin', 'ai', 'suggestion_id', s.id));
      END LOOP;
      UPDATE public.sw_management_reports SET narrative = _narrative
       WHERE workspace_id = _workspace_id AND id = _report.id AND version = _report.version
      RETURNING id INTO _id;
      IF _id IS NULL THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409'; END IF;
      _target := 'sw_management_reports'; _ids := ARRAY[_id]; _extra := jsonb_build_object('sections', _apply->'sections');
    ELSE
      RAISE EXCEPTION 'SW_INPUT_INVALID' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.sw_ai_suggestions
     SET status = _status, decision_note = _decision_note,
         applied_target = jsonb_strip_nulls(jsonb_build_object('table', _target, 'ids', CASE WHEN _target IS NULL THEN NULL ELSE to_jsonb(_ids) END, 'request_hash', _request_hash)) || _extra
   WHERE workspace_id = _workspace_id AND id = _suggestion_id AND version = _expected_version
  RETURNING * INTO s;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SW_CONFLICT' USING ERRCODE = 'PT409'; END IF;
  RETURN s;
END $$;
CREATE FUNCTION public.sw_decide_suggestion(_workspace_id uuid, _suggestion_id uuid, _expected_version integer, _status text, _decision_note text, _apply jsonb) RETURNS public.sw_ai_suggestions
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$SELECT sw_private.decide_suggestion(_workspace_id, _suggestion_id, _expected_version, _status, _decision_note, _apply)$$;

-- -----------------------------------------------------------------------------
-- 4. Privileges. Hosted default privileges grant new functions to anon; every
--    new function is revoked from everyone first and granted only as stated.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION sw_private.reserve_assistant(uuid, uuid, uuid, jsonb), sw_private.decide_suggestion(uuid, uuid, integer, text, text, jsonb),
  sw_private.require_suggestion_job(), public.sw_reserve_assistant(uuid, uuid, uuid, jsonb), public.sw_decide_suggestion(uuid, uuid, integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sw_private.reserve_assistant(uuid, uuid, uuid, jsonb), sw_private.decide_suggestion(uuid, uuid, integer, text, text, jsonb),
  public.sw_reserve_assistant(uuid, uuid, uuid, jsonb), public.sw_decide_suggestion(uuid, uuid, integer, text, text, jsonb)
  TO authenticated;

COMMENT ON COLUMN public.sw_ai_suggestions.job_id IS 'The succeeded assistant processing job this suggestion is the stored result of (same id). Required for every new suggestion by sw_15_suggestion_job.';
COMMENT ON TABLE public.sw_ai_suggestions IS 'AI proposals, each the stored result of one reserved, fenced, signed assistant job. A decision and everything it applies are written together by sw_decide_suggestion as the deciding user.';
COMMENT ON TABLE public.sw_processing_jobs IS 'One dispatch fence per request (analysis drafts, assistant requests, extraction). Ambiguous provider outcome is terminal and retains budget; no automatic replay or claim lease stealing. AI kinds share one daily budget.';

COMMIT;
