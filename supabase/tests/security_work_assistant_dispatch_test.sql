-- Security Work assistant dispatch and decision (20270326090000), executed as
-- real database roles. Synthetic and transaction-local: rolled back at the end
-- unless sw_assistant_keep_fixture is set by the rollback proof.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok  SW-AST %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE; IF state<>code THEN RAISE EXCEPTION '% expected %, got % (%)',label,code,state,SQLERRM; END IF; RAISE NOTICE 'ok  SW-AST %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',coalesce(u,''),true);PERFORM set_config('request.jwt.claims',CASE WHEN u IS NULL THEN '{}' ELSE jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text END,true); END $$;
-- The worker's HMAC, computed by the test owner (callers cannot execute it).
CREATE OR REPLACE FUNCTION pg_temp.sign(_job uuid,_fence uuid,_payload text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT sw_private.receipt_mac('assistant'||E'\n'||_job::text||E'\n'||_fence::text||E'\n'||sw_private.hash_text(_payload),repeat('synthetic-only-',4)) $$;
CREATE OR REPLACE FUNCTION pg_temp.manifest(_kind text,_ck text,_cid text,_req text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('kind',_kind,'capability',_kind,'contextKind',_ck,'contextId',_cid,'requestText',_req,'language','sv',
    'promptVersion','sw-assistant-test','decisionRequired',true,'context',jsonb_build_object('note','synthetic'),'sources','[]'::jsonb) $$;
CREATE OR REPLACE FUNCTION pg_temp.payload(_output jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_object('status','succeeded','output',_output,'provider','synthetic','model','synthetic-model','inputTokens',10,'outputTokens',20,'costMicros',40)::text $$;
-- Reserve, dispatch, sign, complete and store: the whole legitimate path.
CREATE OR REPLACE FUNCTION pg_temp.produce(_w uuid,_id uuid,_m jsonb,_output jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f uuid; p text := pg_temp.payload(_output);
BEGIN
  PERFORM public.sw_reserve_assistant(_w,_id,'55000000-0000-4000-8000-000000000040',_m);
  f := (public.sw_dispatch_processing(_w,_id)->'job'->>'fence')::uuid;
  PERFORM public.sw_complete_processing(_w,_id,f,'synthetic-test-key',p,pg_temp.sign(_id,f,p));
  INSERT INTO public.sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,context_id,request_text,content,source_records,provider,model,prompt_version,decision_required)
  VALUES(_id,_w,_id,_m->>'kind',_m->>'contextKind',CASE WHEN _m->>'contextId' ~* '^[0-9a-f-]{36}$' THEN (_m->>'contextId')::uuid END,_m->>'requestText',_output,_m->'sources','synthetic','synthetic-model','sw-assistant-test',true);
  RETURN _id;
END $$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('55000000-0000-4000-8000-000000000001','ast-owner-a@example.test',now()),
 ('55000000-0000-4000-8000-000000000002','ast-editor-a@example.test',now()),
 ('55000000-0000-4000-8000-000000000003','ast-viewer-a@example.test',now()),
 ('55000000-0000-4000-8000-000000000004','ast-owner-b@example.test',now()),
 ('55000000-0000-4000-8000-000000000005','ast-outsider@example.test',now());
INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '55000000-%';

SET LOCAL ROLE authenticated;
SELECT pg_temp.login('55000000-0000-4000-8000-000000000001');
SELECT sw_create_personal_workspace('Assistant workspace A') AS wa \gset
SELECT pg_temp.login('55000000-0000-4000-8000-000000000004');
SELECT sw_create_personal_workspace('Assistant workspace B') AS wb \gset
RESET ROLE;
SELECT pg_temp.login('55000000-0000-4000-8000-000000000001');
INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
 (:'wa','55000000-0000-4000-8000-000000000002','editor',false),
 (:'wa','55000000-0000-4000-8000-000000000003','viewer',false);
INSERT INTO sw_private.worker_keys(key_id,secret) SELECT 'synthetic-test-key',repeat('synthetic-only-',4) WHERE NOT EXISTS (SELECT 1 FROM sw_private.worker_keys WHERE key_id='synthetic-test-key');
INSERT INTO public.sw_ai_activations(id,workspace_id,environment,purpose,provider,model,task_version,prompt_version,policy_version,output_schema_version,data_processing_approval,approved_by,valid_until,max_cost_micros,daily_budget_micros,max_output_tokens,timeout_ms) VALUES
 ('55000000-0000-4000-8000-000000000040',:'wa','internal_qa','draft_analysis','synthetic','synthetic-model','v1','v1','v1','v1','Synthetic approval only','55000000-0000-4000-8000-000000000001',now()+interval '1 hour',100,1000,2048,10000),
 ('55000000-0000-4000-8000-000000000041',:'wa','internal_qa','draft_analysis','synthetic','synthetic-model','v1','v1','v1','v1','Synthetic approval only','55000000-0000-4000-8000-000000000001',now()+interval '1 hour',100,1000,2048,10000),
 ('55000000-0000-4000-8000-000000000042',:'wb','internal_qa','draft_analysis','synthetic','synthetic-model','v1','v1','v1','v1','Synthetic approval only','55000000-0000-4000-8000-000000000004',now()+interval '1 hour',100,1000,2048,10000);

-- ---------------------------------------------------------------------------
-- Surface
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok(
  has_function_privilege('authenticated','public.sw_reserve_assistant(uuid,uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('authenticated','public.sw_decide_suggestion(uuid,uuid,integer,text,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.sw_reserve_assistant(uuid,uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.sw_decide_suggestion(uuid,uuid,integer,text,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.sw_reserve_assistant(uuid,uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.sw_decide_suggestion(uuid,uuid,integer,text,text,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','sw_private.reserve_assistant(uuid,uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)','EXECUTE'),
  'two new RPCs are executable by authenticated only');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','sw_private.require_suggestion_job()','EXECUTE')
  AND NOT has_function_privilege('anon','sw_private.require_suggestion_job()','EXECUTE'),'provenance trigger function is not callable');
SELECT pg_temp.ok((SELECT bool_and(proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE oid IN ('sw_private.reserve_assistant(uuid,uuid,uuid,jsonb)'::regprocedure,'sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)'::regprocedure,'sw_private.require_suggestion_job()'::regprocedure,'public.sw_reserve_assistant(uuid,uuid,uuid,jsonb)'::regprocedure,'public.sw_decide_suggestion(uuid,uuid,integer,text,text,jsonb)'::regprocedure)),'every new function pins an empty search_path');
SELECT pg_temp.ok((SELECT NOT prosecdef FROM pg_proc WHERE oid='sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)'::regprocedure),'the decision runs as the caller (SECURITY INVOKER)');
SELECT pg_temp.ok(
  (SELECT position('kind IN (''ai'',''assistant'') AND created_at' IN prosrc) > 0 FROM pg_proc WHERE oid='sw_private.reserve_processing(uuid,uuid,text,uuid,uuid,integer,uuid)'::regprocedure)
  AND (SELECT position('kind IN (''ai'', ''assistant'')' IN prosrc) > 0 FROM pg_proc WHERE oid='sw_private.reserve_assistant(uuid,uuid,uuid,jsonb)'::regprocedure),
  'analysis drafts and assistant requests are summed against one daily budget');
-- The programme suite's invariants, restated for the new state: the only code
-- that turns a suggestion into authoritative records is the caller-run decision,
-- and no trigger on suggestions writes anywhere.
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'sw_private'::regnamespace) AND p.proname LIKE '%' AND p.prosrc ILIKE '%sw_ai_suggestions%'
  AND p.prosrc ~* '(insert into|update) public\.sw_(security_mandates|protected_assets|risks|gaps|actions|management_reports)'
  AND p.oid <> 'sw_private.decide_suggestion(uuid,uuid,integer,text,text,jsonb)'::regprocedure),'only sw_decide_suggestion applies a suggestion');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.sw_ai_suggestions'::regclass AND NOT t.tgisinternal
  AND t.tgfoid NOT IN ('sw_private.guard_record()'::regprocedure,'sw_private.record_change()'::regprocedure,'sw_private.guard_programme()'::regprocedure,'sw_private.require_suggestion_job()'::regprocedure))
  AND (SELECT prosrc !~* '(insert|update|delete)\s' FROM pg_proc WHERE oid='sw_private.require_suggestion_job()'::regprocedure),'no trigger on suggestions writes elsewhere');

-- ---------------------------------------------------------------------------
-- Reservation: one operation id, one immutable intent, one budget
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('55000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Why?')),'42501','a viewer cannot reserve billable work');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000005');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Why?')),'42501','an outsider cannot reserve in the workspace');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040','{"kind":"explanation"}'),'23514','an incomplete manifest is refused');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000042',pg_temp.manifest('explanation','workspace',NULL,'Why?')),'42501','another workspace''s activation cannot be used');
SELECT (sw_reserve_assistant(:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Why?'))).status AS st \gset
SELECT pg_temp.ok((SELECT kind='assistant' AND status='reserved' AND reserved_cost_micros=100 AND assessment_id IS NULL AND fence IS NULL AND created_by='55000000-0000-4000-8000-000000000002' FROM sw_processing_jobs WHERE id='55000000-0000-4000-8000-000000000100'),'an editor reserves one assistant job at the activation''s maximum cost');
SELECT pg_temp.ok((sw_reserve_assistant(:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Why?'))).id='55000000-0000-4000-8000-000000000100'
  AND (SELECT count(*)=1 FROM sw_processing_jobs WHERE id='55000000-0000-4000-8000-000000000100'),'a retry of the same operation returns the same reservation and charges nothing more');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Something else?')),'23514','the same operation id with a different input is refused');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000041',pg_temp.manifest('explanation','workspace',NULL,'Why?')),'23514','the same operation id under another activation is refused');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Why?')),'23514','another person cannot claim someone else''s operation id');
SELECT pg_temp.fail('INSERT INTO sw_processing_jobs(id,workspace_id,kind,activation_id,input_manifest,input_hash) VALUES(gen_random_uuid(),'''||:'wa'||''',''assistant'',''55000000-0000-4000-8000-000000000040'',''{}'',repeat(''a'',64))','42501','no client can write the processing ledger directly');
RESET ROLE;
SELECT pg_temp.fail(format('INSERT INTO sw_processing_jobs(id,workspace_id,kind,assessment_id,activation_id,input_manifest,input_hash,created_by) VALUES(gen_random_uuid(),%L,''assistant'',gen_random_uuid(),''55000000-0000-4000-8000-000000000040'',''{}'',repeat(''a'',64),''55000000-0000-4000-8000-000000000001'')',:'wa'),'23514','an assistant job cannot carry an assessment target');
SELECT pg_temp.fail(format('INSERT INTO sw_processing_jobs(id,workspace_id,kind,input_manifest,input_hash,created_by) VALUES(gen_random_uuid(),%L,''assistant'',''{}'',repeat(''a'',64),''55000000-0000-4000-8000-000000000001'')',:'wa'),'23514','an assistant job requires an activation');
-- Budget: 1000 per day, 100 per reservation; nine more fit, the eleventh does not.
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('55000000-0000-4000-8000-000000000002');
SELECT count(sw_reserve_assistant(:'wa',('55000000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,'55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Budget '||n))) FROM generate_series(10,18) n;
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000199','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Over budget')),'23514','the workspace daily budget stops the next reservation');
RESET ROLE;
DELETE FROM sw_processing_jobs WHERE id::text LIKE '55000000-0000-4000-8000-0000000001%' AND id <> '55000000-0000-4000-8000-000000000100';
SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- Dispatch and completion: the existing fence and signed receipt
-- ---------------------------------------------------------------------------
SELECT sw_dispatch_processing(:'wa','55000000-0000-4000-8000-000000000100')->'job'->>'fence' AS fence \gset
SELECT pg_temp.ok((SELECT status='dispatched' AND fence IS NOT NULL FROM sw_processing_jobs WHERE id='55000000-0000-4000-8000-000000000100'),'dispatch takes the single fence');
SELECT pg_temp.ok((sw_dispatch_processing(:'wa','55000000-0000-4000-8000-000000000100')->>'dispatch')::boolean=false,'a second dispatch of the same operation is never granted');
SELECT pg_temp.ok((sw_reserve_assistant(:'wa','55000000-0000-4000-8000-000000000100','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Why?'))).status='dispatched','a retry after dispatch returns the dispatched job, not a new reservation');
SELECT pg_temp.fail(format('SELECT sw_complete_processing(%L,%L,%L,''synthetic-test-key'',%L,repeat(''0'',64))',:'wa','55000000-0000-4000-8000-000000000100',:'fence',pg_temp.payload('{"text":"x"}')),'42501','an unsigned completion is refused');
SELECT jsonb_build_object('status','succeeded','output',jsonb_build_object('text','x'),'provider','synthetic','model','other-model','inputTokens',1,'outputTokens',1,'costMicros',1)::text AS wrongmodel \gset
SELECT pg_temp.fail(format('SELECT sw_complete_processing(%L,%L,%L,''synthetic-test-key'',%L,%L)',:'wa','55000000-0000-4000-8000-000000000100',:'fence',:'wrongmodel',pg_temp.sign('55000000-0000-4000-8000-000000000100',:'fence',:'wrongmodel')),'23514','a result from an unapproved model is refused');
SELECT jsonb_build_object('status','outcome_unknown','errorCode','AI_TIMEOUT')::text AS unknown \gset
SELECT pg_temp.ok((sw_complete_processing(:'wa','55000000-0000-4000-8000-000000000100',:'fence','synthetic-test-key',:'unknown',pg_temp.sign('55000000-0000-4000-8000-000000000100',:'fence',:'unknown'))).status='outcome_unknown','a lost acknowledgement is recorded as outcome_unknown');
SELECT pg_temp.ok((sw_dispatch_processing(:'wa','55000000-0000-4000-8000-000000000100')->>'dispatch')::boolean=false
  AND (SELECT reserved_cost_micros=100 AND actual_cost_micros IS NULL FROM sw_processing_jobs WHERE id='55000000-0000-4000-8000-000000000100'),'outcome_unknown is never re-sent and keeps its reservation');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(%L,%L,%L,''explanation'',''workspace'',''Why?'',''{"text":"x"}'',''[]'',''synthetic'',''synthetic-model'',''sw-assistant-test'')','55000000-0000-4000-8000-000000000100',:'wa','55000000-0000-4000-8000-000000000100'),'42501','no suggestion from an outcome_unknown job');

-- Revocation between reservation and dispatch stops the dispatch.
SELECT (sw_reserve_assistant(:'wa','55000000-0000-4000-8000-000000000101','55000000-0000-4000-8000-000000000041',pg_temp.manifest('explanation','workspace',NULL,'Revoked?'))).id AS revokedjob \gset
RESET ROLE;
INSERT INTO sw_ai_activation_revocations(activation_id,reason) VALUES('55000000-0000-4000-8000-000000000041','Synthetic revocation');
SET LOCAL ROLE authenticated;
SELECT pg_temp.fail(format('SELECT sw_dispatch_processing(%L,%L)',:'wa',:'revokedjob'),'42501','a revoked activation cannot dispatch an earlier reservation');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa','55000000-0000-4000-8000-000000000102','55000000-0000-4000-8000-000000000041',pg_temp.manifest('explanation','workspace',NULL,'Revoked?')),'42501','a revoked activation cannot reserve');

-- ---------------------------------------------------------------------------
-- A suggestion is exactly the stored result of its own succeeded job
-- ---------------------------------------------------------------------------
SELECT pg_temp.manifest('asset_suggestions','workspace',NULL,'Which assets?') AS assetm \gset
SELECT '{"assets":[{"name":"Control room","category":"facilities","reason":"Synthetic"}]}' AS assetout \gset
SELECT sw_reserve_assistant(:'wa','55000000-0000-4000-8000-000000000110','55000000-0000-4000-8000-000000000040',:'assetm') IS NOT NULL AS r \gset
SELECT sw_dispatch_processing(:'wa','55000000-0000-4000-8000-000000000110')->'job'->>'fence' AS f110 \gset
SELECT pg_temp.payload(:'assetout') AS p110 \gset
SELECT (sw_complete_processing(:'wa','55000000-0000-4000-8000-000000000110',:'f110','synthetic-test-key',:'p110',pg_temp.sign('55000000-0000-4000-8000-000000000110',:'f110',:'p110'))).status AS st110 \gset
SELECT pg_temp.ok(:'st110'='succeeded'
  AND (SELECT output=:'assetout'::jsonb AND actual_cost_micros=40 FROM sw_processing_jobs WHERE id='55000000-0000-4000-8000-000000000110'),'a signed assistant result is stored with its measured cost');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(workspace_id,kind,context_kind,request_text,content,provider,model,prompt_version) VALUES(%L,''asset_suggestions'',''workspace'',''Which assets?'',%L,''synthetic'',''synthetic-model'',''sw-assistant-test'')',:'wa',:'assetout'),'42501','a suggestion without a job is refused');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(%L,%L,%L,''asset_suggestions'',''workspace'',''Which assets?'',''{"assets":[{"name":"Forged","category":"other","reason":"x"}]}'',''[]'',''synthetic'',''synthetic-model'',''sw-assistant-test'')','55000000-0000-4000-8000-000000000110',:'wa','55000000-0000-4000-8000-000000000110'),'23514','content other than the signed result is refused');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(%L,%L,%L,''mandate_draft'',''workspace'',''Which assets?'',%L,''[]'',''synthetic'',''synthetic-model'',''sw-assistant-test'')','55000000-0000-4000-8000-000000000110',:'wa','55000000-0000-4000-8000-000000000110',:'assetout'),'23514','a kind other than the reserved one is refused');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(%L,%L,%L,''asset_suggestions'',''workspace'',''Which assets?'',%L,''[]'',''synthetic'',''another-model'',''sw-assistant-test'')','55000000-0000-4000-8000-000000000110',:'wa','55000000-0000-4000-8000-000000000110',:'assetout'),'23514','a model other than the approved one is refused');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(gen_random_uuid(),%L,%L,''asset_suggestions'',''workspace'',''Which assets?'',%L,''[]'',''synthetic'',''synthetic-model'',''sw-assistant-test'')',:'wa','55000000-0000-4000-8000-000000000110',:'assetout'),'42501','a suggestion id other than its job id is refused');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(%L,%L,%L,''asset_suggestions'',''workspace'',''Which assets?'',%L,''[]'',''synthetic'',''synthetic-model'',''sw-assistant-test'')','55000000-0000-4000-8000-000000000110',:'wa','55000000-0000-4000-8000-000000000110',:'assetout'),'42501','another member cannot store someone else''s result');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000002');
INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,context_id,request_text,content,source_records,provider,model,prompt_version,decision_required)
VALUES('55000000-0000-4000-8000-000000000110',:'wa','55000000-0000-4000-8000-000000000110','asset_suggestions','workspace',NULL,'Which assets?',:'assetout','[]','synthetic','synthetic-model','sw-assistant-test',true);
SELECT pg_temp.ok((SELECT status='proposed' AND job_id=id FROM sw_ai_suggestions WHERE id='55000000-0000-4000-8000-000000000110'),'the exact signed result is stored as a proposal');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(%L,%L,%L,''asset_suggestions'',''workspace'',''Which assets?'',%L,''[]'',''synthetic'',''synthetic-model'',''sw-assistant-test'')','55000000-0000-4000-8000-000000000110',:'wa','55000000-0000-4000-8000-000000000110',:'assetout'),'23505','one job yields at most one suggestion');
SELECT pg_temp.fail(format('UPDATE sw_ai_suggestions SET job_id=NULL WHERE id=%L','55000000-0000-4000-8000-000000000110'),'23514','the job link is immutable');

-- ---------------------------------------------------------------------------
-- The decision: one transaction, idempotent, nothing partial
-- ---------------------------------------------------------------------------
SELECT count(*) AS assets_before FROM sw_protected_assets WHERE workspace_id=:'wa' \gset
SELECT pg_temp.login('55000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa','55000000-0000-4000-8000-000000000110','{"kind":"none"}'),'42501','a viewer cannot decide');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000004');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa','55000000-0000-4000-8000-000000000110','{"kind":"none"}'),'42501','another workspace''s owner cannot decide');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,7,''approved'','''',%L)',:'wa','55000000-0000-4000-8000-000000000110','{"kind":"none"}'),'PT409','a stale suggestion version conflicts');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''rejected'','''',%L)',:'wa','55000000-0000-4000-8000-000000000110','{"kind":"assets","assets":[]}'),'23514','a rejection cannot apply anything');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa','55000000-0000-4000-8000-000000000110','{"kind":"mandate_document","version":1}'),'23514','an application of the wrong kind is refused');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa','55000000-0000-4000-8000-000000000110',
  '{"kind":"assets","assets":[{"name":"A one","description":"","category":"facilities"},{"name":"A two","description":"","category":"systems"},{"name":"A three","description":"","category":"not-a-category"}]}'),'23514','a failing third record aborts the whole application');
SELECT pg_temp.ok((SELECT count(*) FROM sw_protected_assets WHERE workspace_id=:'wa')=:assets_before
  AND (SELECT status='proposed' AND version=1 FROM sw_ai_suggestions WHERE id='55000000-0000-4000-8000-000000000110'),'after a failure no asset exists and the suggestion is still open');
SELECT '{"kind":"assets","assets":[{"name":"Control room","description":"Synthetic","category":"facilities"},{"name":"Visitor register","description":"","category":"information"}]}' AS assetapply \gset
SELECT (sw_decide_suggestion(:'wa','55000000-0000-4000-8000-000000000110',1,'approved','Edited names',:'assetapply')).version AS decidedversion \gset
SELECT pg_temp.ok((SELECT status='approved' AND decided_by='55000000-0000-4000-8000-000000000002' AND applied_target->>'table'='sw_protected_assets' AND jsonb_array_length(applied_target->'ids')=2 AND applied_target ? 'request_hash' FROM sw_ai_suggestions WHERE id='55000000-0000-4000-8000-000000000110'),'approval records the decision with exactly the records it created');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_protected_assets a JOIN sw_ai_suggestions s ON s.id='55000000-0000-4000-8000-000000000110' AND a.id::text IN (SELECT jsonb_array_elements_text(s.applied_target->'ids')) WHERE a.created_by='55000000-0000-4000-8000-000000000002' AND a.business_importance='medium' AND a.consequence_level IS NULL AND a.owner_id IS NULL),'created assets belong to the deciding human and carry no AI rating or owner');
SELECT pg_temp.ok((sw_decide_suggestion(:'wa','55000000-0000-4000-8000-000000000110',1,'approved','Edited names',:'assetapply')).version=:decidedversion
  AND (SELECT count(*) FROM sw_protected_assets WHERE workspace_id=:'wa')=:assets_before+2,'a retry of the same decision returns the stored result and creates nothing');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''rejected'','''',%L)',:'wa','55000000-0000-4000-8000-000000000110','{"kind":"none"}'),'PT409','a different decision on a decided suggestion conflicts');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'',''Different note'',%L)',:'wa','55000000-0000-4000-8000-000000000110',:'assetapply'),'PT409','a changed note is a different decision');
SELECT pg_temp.login('55000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'',''Edited names'',%L)',:'wa','55000000-0000-4000-8000-000000000110',:'assetapply'),'PT409','a second approver cannot apply the same suggestion again');
SELECT pg_temp.ok((SELECT count(*) FROM sw_protected_assets WHERE workspace_id=:'wa')=:assets_before+2,'still exactly one set of records');
SELECT pg_temp.ok((SELECT count(*)>=2 FROM sw_audit_events WHERE workspace_id=:'wa' AND entity_table='sw_protected_assets' AND actor_user_id='55000000-0000-4000-8000-000000000002'),'each created record is audited against the deciding human');

-- Mandate: the expected target version is enforced and nothing is written on conflict.
SELECT pg_temp.login('55000000-0000-4000-8000-000000000002');
INSERT INTO sw_security_mandates(workspace_id,organisation_description) VALUES(:'wa','Synthetic organisation') RETURNING id AS mandate \gset
UPDATE sw_security_mandates SET security_mission='Protect people' WHERE id=:'mandate';
SELECT pg_temp.produce(:'wa','55000000-0000-4000-8000-000000000120',pg_temp.manifest('mandate_draft','mandate',:'mandate','Draft a mandate'),'{"text":"Synthetic mandate text.","caveats":[]}') AS msug \gset
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa',:'msug','{"kind":"mandate_document","version":1}'),'PT409','a stale mandate version conflicts');
SELECT pg_temp.ok((SELECT mandate_document='' FROM sw_security_mandates WHERE id=:'mandate') AND (SELECT status='proposed' FROM sw_ai_suggestions WHERE id=:'msug'),'the conflict wrote neither the mandate nor the decision');
SELECT (sw_decide_suggestion(:'wa',:'msug',1,'approved','','{"kind":"mandate_document","version":2}')).status AS mst \gset
SELECT pg_temp.ok(:'mst'='approved'
  AND (SELECT mandate_document='Synthetic mandate text.' AND document_provenance->>'suggestion_id'=:'msug' AND version=3 FROM sw_security_mandates WHERE id=:'mandate'),'the mandate text and its provenance are written with the decision');

-- Gap actions: links come from the gap, never from the request.
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','Gap asset','systems') RETURNING id AS gapasset \gset
INSERT INTO sw_gaps(workspace_id,source_kind,title,related_asset_id) VALUES(:'wa','manual','Synthetic gap',:'gapasset') RETURNING id AS gap \gset
SELECT pg_temp.produce(:'wa','55000000-0000-4000-8000-000000000130',pg_temp.manifest('gap_action','gap',:'gap','Propose actions'),'{"actions":[{"title":"Review","description":"d","why":"w"}]}') AS gsug \gset
SELECT pg_temp.ok((sw_decide_suggestion(:'wa',:'gsug',1,'approved','',format('{"kind":"actions","gapId":"%s","actions":[{"title":"Review access","description":"Synthetic"},{"title":"Update log","description":""}]}',:'gap')::jsonb)).status='approved','gap actions are applied with the decision');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_actions WHERE gap_id=:'gap' AND asset_id=:'gapasset' AND source_kind='gap' AND priority='medium' AND status='open' AND assignee_user_id IS NULL AND due_date IS NULL AND created_by='55000000-0000-4000-8000-000000000002'),'actions carry the gap''s links and no AI-chosen owner, date or priority');

-- Risk narrative: only a proposed risk at the expected version.
INSERT INTO sw_risks(workspace_id,title,source_kind) VALUES(:'wa','Synthetic risk','programme') RETURNING id AS risk \gset
SELECT pg_temp.produce(:'wa','55000000-0000-4000-8000-000000000140',pg_temp.manifest('risk_scenario','risk',:'risk','Describe'),'{"threat_scenario":"Scenario","description":"Description","missing_information":[],"questions":[]}') AS rsug \gset
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa',:'rsug',format('{"kind":"risk_scenario","riskId":"%s","version":9}',:'risk')),'PT409','a stale risk version conflicts');
SELECT (sw_decide_suggestion(:'wa',:'rsug',1,'approved','',format('{"kind":"risk_scenario","riskId":"%s","version":1}',:'risk')::jsonb)).status AS rst \gset
SELECT pg_temp.ok(:'rst'='approved'
  AND (SELECT threat_scenario='Scenario' AND likelihood IS NULL AND consequence IS NULL AND status='proposed' FROM sw_risks WHERE id=:'risk'),'only the risk narrative changes; no rating is written');

-- Report narrative: only sections the suggestion actually contains, only on a draft.
INSERT INTO sw_management_reports(workspace_id,title,narrative) VALUES(:'wa','Synthetic report','{"risk_picture":{"text":"Human text","origin":"user"}}') RETURNING id AS mreport \gset
SELECT pg_temp.produce(:'wa','55000000-0000-4000-8000-000000000145',pg_temp.manifest('report_narrative','management_report',:'mreport','Draft'),'{"sections":{"executive_position":"Synthetic position"},"caveats":[]}') AS nsug \gset
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa',:'nsug',format('{"kind":"report_narrative","reportId":"%s","version":1,"sections":["executive_position","risk_picture"]}',:'mreport')),'23514','a section the suggestion does not contain is refused, and nothing is written');
SELECT pg_temp.ok((SELECT narrative='{"risk_picture":{"text":"Human text","origin":"user"}}'::jsonb FROM sw_management_reports WHERE id=:'mreport'),'the refused application left the report unchanged');
SELECT (sw_decide_suggestion(:'wa',:'nsug',1,'approved','',format('{"kind":"report_narrative","reportId":"%s","version":1,"sections":["executive_position"]}',:'mreport')::jsonb)).status AS nst \gset
SELECT pg_temp.ok(:'nst'='approved' AND (SELECT narrative->'executive_position'->>'origin'='ai' AND narrative->'executive_position'->>'suggestion_id'=:'nsug' AND narrative->'risk_picture'->>'origin'='user' FROM sw_management_reports WHERE id=:'mreport'),'the chosen section is marked AI-drafted and human sections are kept');

-- Rejection writes nothing but the decision.
SELECT pg_temp.produce(:'wa','55000000-0000-4000-8000-000000000150',pg_temp.manifest('explanation','workspace',NULL,'Explain'),'{"text":"Synthetic explanation"}') AS xsug \gset
SELECT (sw_decide_suggestion(:'wa',:'xsug',1,'rejected','Not useful','{"kind":"none"}')).status AS xst \gset
SELECT pg_temp.ok(:'xst'='rejected'
  AND (SELECT applied_target - 'request_hash' = '{}'::jsonb FROM sw_ai_suggestions WHERE id=:'xsug'),'a rejection records only the decision');

-- Membership removal while work is queued blocks every later step.
SELECT (sw_reserve_assistant(:'wa','55000000-0000-4000-8000-000000000160','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Queued'))).id AS queued \gset
SELECT pg_temp.produce(:'wa','55000000-0000-4000-8000-000000000161',pg_temp.manifest('explanation','workspace',NULL,'Pending'),'{"text":"Pending"}') AS pending \gset
RESET ROLE;
SELECT pg_temp.login('55000000-0000-4000-8000-000000000001');
UPDATE sw_workspace_memberships SET active=false WHERE workspace_id=:'wa' AND user_id='55000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('55000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('SELECT sw_dispatch_processing(%L,%L)',:'wa',:'queued'),'42501','a removed member cannot dispatch their queued job');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,%L,%L,%L)',:'wa',:'queued','55000000-0000-4000-8000-000000000040',pg_temp.manifest('explanation','workspace',NULL,'Queued')),'42501','a removed member cannot even read back their reservation');
SELECT pg_temp.fail(format('SELECT sw_decide_suggestion(%L,%L,1,''approved'','''',%L)',:'wa',:'pending','{"kind":"none"}'),'42501','a removed member cannot decide a pending suggestion');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_ai_suggestions WHERE workspace_id=:'wa'),'a removed member reads nothing');

-- Workspace isolation of the ledger.
SELECT pg_temp.login('55000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_processing_jobs WHERE workspace_id=:'wa') AND (SELECT count(*)=0 FROM sw_ai_suggestions WHERE workspace_id=:'wa'),'workspace B sees none of A''s jobs or suggestions');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,request_text,content,source_records,provider,model,prompt_version) VALUES(%L,%L,%L,''explanation'',''workspace'',''Pending'',''{"text":"Pending"}'',''[]'',''synthetic'',''synthetic-model'',''sw-assistant-test'')',:'pending',:'wb',:'pending'),'42501','A''s job cannot become a suggestion in B');
RESET ROLE;

\if :{?sw_assistant_keep_fixture}
\else
ROLLBACK;
\endif
