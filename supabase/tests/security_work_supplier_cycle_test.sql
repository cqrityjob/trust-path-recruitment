-- Security Work 20270330090000: the supplier cycle, as the plan's synthetic
-- pilot. A public warning concerns the supplier of an access-control system at
-- two offices; the version in use is unknown. Real roles, synthetic data,
-- rolled back unless sw_supplier_keep_fixture.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok  SW-SUP %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; msg text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE, msg=MESSAGE_TEXT; IF state<>code THEN RAISE EXCEPTION '% expected %, got % (%)',label,code,state,msg; END IF; RAISE NOTICE 'ok  SW-SUP %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.failmsg(s text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE msg text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT; IF position(needle IN msg)=0 THEN RAISE EXCEPTION '% expected %, got %',label,needle,msg; END IF; RAISE NOTICE 'ok  SW-SUP %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',coalesce(u,''),true);PERFORM set_config('request.jwt.claims',CASE WHEN u IS NULL THEN '{}' ELSE jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text END,true); END $$;
CREATE OR REPLACE FUNCTION pg_temp.changed(s text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n integer; BEGIN EXECUTE s; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;
-- Everything one principal can read about one supplier request.
CREATE OR REPLACE FUNCTION pg_temp.visible(_r uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM public.sw_supplier_requests WHERE id=_r)::int
       + (SELECT count(*) FROM public.sw_supplier_request_events WHERE request_id=_r)::int
       + (SELECT count(*) FROM public.sw_supplier_request_shares WHERE request_id=_r)::int
       + (SELECT count(*) FROM public.sw_supplier_responses WHERE request_id=_r)::int
       + (SELECT count(*) FROM public.sw_supplier_verifications WHERE request_id=_r)::int
       + (SELECT count(*) FROM public.sw_decisions WHERE subject_kind='supplier_request' AND subject_id=_r)::int
       + (SELECT count(*) FROM public.sw_audit_events WHERE entity_id=_r)::int $$;

-- 1 owner (approver, sharing right), 2 security chief (editor), 3 CISO (editor,
-- approver = verifier), 4 coordinator (editor, no rights), 5 viewer,
-- 6 owner of another customer, 7 editor outside a restricted circle.
INSERT INTO auth.users(id,email,email_confirmed_at) SELECT ('5d000000-0000-4000-8000-00000000000'||n)::uuid,'sup-'||n||'@example.test',now() FROM generate_series(1,7) n;
INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '5d000000-%';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000001');
SELECT sw_create_personal_workspace('Nordic Logistics (synthetic)') AS wa \gset
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000006');
SELECT sw_create_personal_workspace('Other customer (synthetic)') AS wb \gset
RESET ROLE;
INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
 (:'wa','5d000000-0000-4000-8000-000000000002','editor',false),
 (:'wa','5d000000-0000-4000-8000-000000000003','editor',true),
 (:'wa','5d000000-0000-4000-8000-000000000004','editor',false),
 (:'wa','5d000000-0000-4000-8000-000000000005','viewer',false),
 (:'wa','5d000000-0000-4000-8000-000000000007','editor',false);

-- ---------------------------------------------------------------------------
-- Surface and rights
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok((SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN
  ('sw_supplier_profiles','sw_asset_dependencies','sw_supplier_contracts','sw_supplier_obligations','sw_decisions','sw_supplier_requests','sw_supplier_request_events','sw_supplier_request_shares','sw_supplier_responses','sw_supplier_verifications','sw_supplier_reviews'))
  AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee IN ('anon','service_role') AND table_name LIKE 'sw_supplier%')
  AND NOT has_table_privilege('authenticated','public.sw_supplier_requests','INSERT') AND NOT has_table_privilege('authenticated','public.sw_supplier_requests','UPDATE')
  AND NOT has_table_privilege('authenticated','public.sw_supplier_request_events','INSERT') AND NOT has_table_privilege('authenticated','public.sw_supplier_verifications','INSERT'),
  'eleven tables with RLS; no anon or service_role access; the request lifecycle is command-only');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.sw_verify_supplier_response(uuid,uuid,uuid,integer,uuid,text,text,text,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','sw_private.supplier_share_content(public.sw_supplier_requests)','EXECUTE')
  AND NOT has_function_privilege('authenticated','sw_private.supplier_event(public.sw_supplier_requests,text,text,jsonb,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.sw_save_supplier_request(uuid,uuid,uuid,integer,jsonb)','EXECUTE'),
  'commands for authenticated only; the event writer and share builder for nobody');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('SELECT sw_set_member_sharing(%L,%L,true)',:'wa','5d000000-0000-4000-8000-000000000002'),'42501','only a workspace owner grants the external sharing right');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('SELECT sw_set_member_sharing(%L,%L,true)',:'wa','5d000000-0000-4000-8000-000000000005'),'23514','a viewer cannot hold the sharing right');
SELECT sw_set_member_sharing(:'wa','5d000000-0000-4000-8000-000000000001',true);

-- ---------------------------------------------------------------------------
-- 1. The warning meets the business: supplier, system, offices, impact
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','Passage Systems AB','suppliers') RETURNING id AS supplier \gset
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','Access control system','systems') RETURNING id AS acs \gset
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','Office Stockholm','facilities') RETURNING id AS sto \gset
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','Office Gothenburg','facilities') RETURNING id AS gbg \gset
SELECT pg_temp.fail(format('INSERT INTO sw_supplier_profiles(workspace_id,asset_id) VALUES(%L,%L)',:'wa',:'acs'),'23514','a supplier profile belongs to a supplier asset only');
INSERT INTO sw_supplier_profiles(workspace_id,asset_id,internal_owner_id,contact_route,services) VALUES(:'wa',:'supplier','5d000000-0000-4000-8000-000000000003','support@passage.example.test','Access control hardware and firmware');
SELECT pg_temp.fail(format('INSERT INTO sw_asset_dependencies(workspace_id,from_asset_id,to_asset_id,relation,confirmed,confirmed_by) VALUES(%L,%L,%L,''supplied_by'',true,''5d000000-0000-4000-8000-000000000005'')',:'wa',:'acs',:'supplier'),'42501','a client cannot plant who confirmed a relation');
INSERT INTO sw_asset_dependencies(workspace_id,from_asset_id,to_asset_id,relation,confirmed) VALUES(:'wa',:'acs',:'supplier','supplied_by',true) RETURNING id AS dep \gset
INSERT INTO sw_asset_dependencies(workspace_id,from_asset_id,to_asset_id,relation) VALUES(:'wa',:'acs',:'sto','located_at'),(:'wa',:'acs',:'gbg','located_at');
SELECT pg_temp.ok((SELECT confirmed_by='5d000000-0000-4000-8000-000000000003' AND confirmed_at IS NOT NULL FROM sw_asset_dependencies WHERE id=:'dep')
  AND (SELECT count(*)=2 FROM sw_asset_dependencies WHERE relation='located_at' AND NOT confirmed AND confirmed_by IS NULL),
  'a relation''s confirmation is stamped by the database; unconfirmed relations say so');
SELECT pg_temp.fail(format('INSERT INTO sw_asset_dependencies(workspace_id,from_asset_id,to_asset_id,relation) VALUES(%L,%L,%L,''depends_on'')',:'wa',:'acs',:'acs'),'23514','an asset cannot depend on itself');
INSERT INTO sw_risks(workspace_id,title,description) VALUES(:'wa','Firmware flaw in access control','Public warning from the supplier; version in use unknown') RETURNING id AS risk \gset
INSERT INTO sw_risk_assets(workspace_id,risk_id,asset_id,impact_status) VALUES(:'wa',:'risk',:'acs','unconfirmed') RETURNING id AS impact \gset
SELECT pg_temp.ok((SELECT impact_status='unconfirmed' AND impact_checked_by IS NULL FROM sw_risk_assets WHERE id=:'impact'),'an unknown version is an unconfirmed impact, not a confirmed one');
SELECT pg_temp.fail(format('SELECT sw_set_asset_impact(%L,%L,''confirmed'','''')',:'wa',:'impact'),'23514','confirming an impact needs a note');
SELECT sw_set_asset_impact(:'wa',:'impact','confirmed','Version 4.2 confirmed on site; affected');
SELECT pg_temp.ok((SELECT impact_status='confirmed' AND impact_checked_by='5d000000-0000-4000-8000-000000000003' FROM sw_risk_assets WHERE id=:'impact'),'the person who confirmed the impact is stamped');

-- ---------------------------------------------------------------------------
-- 2. One action, decisions on it, and the supplier's contract
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
INSERT INTO sw_actions(workspace_id,risk_id,source_kind,title,assignee_user_id,asset_id) VALUES(:'wa',:'risk','risk','Secure the access control system','5d000000-0000-4000-8000-000000000003',:'acs') RETURNING id AS action \gset
INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale) VALUES(:'wa','risk',:'risk','remediate','Both offices depend on the system; remediate with the supplier');
SELECT pg_temp.fail(format('INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale) VALUES(%L,''risk'',%L,''accept_risk'',''Live with it'')',:'wa',:'risk'),'42501','accepting a risk needs the approval right');
SELECT pg_temp.fail(format('INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale) VALUES(%L,''action'',%L,''defer'',''Later'')',:'wa',:'action'),'23514','deferring needs a review date');
SELECT pg_temp.ok((SELECT decided_by='5d000000-0000-4000-8000-000000000002' FROM sw_decisions WHERE subject_id=:'risk'),'the decision maker is stamped by the database');
INSERT INTO sw_supplier_contracts(workspace_id,supplier_asset_id,contract_key,title,document_ref) VALUES(:'wa',:'supplier','PS-2024-01','Service agreement access control','DMS 4411') RETURNING id AS contract \gset
SELECT pg_temp.fail(format('INSERT INTO sw_supplier_contracts(workspace_id,supplier_asset_id,contract_key,title,verified) VALUES(%L,%L,''PS-X'',''Self-verified'',true)',:'wa',:'supplier'),'42501','only the approval right verifies a contract');
INSERT INTO sw_supplier_obligations(workspace_id,supplier_asset_id,contract_id,clause,scope,expected_result,verification_method,time_rule,response_days) VALUES
 (:'wa',:'supplier',:'contract','7.2','Security vulnerabilities in delivered firmware','Impact statement and remediation plan','Written statement with affected versions','Respond within 5 calendar days',5) RETURNING id AS obligation \gset
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
UPDATE sw_supplier_contracts SET verified=true WHERE id=:'contract';
SELECT pg_temp.fail(format('UPDATE sw_supplier_contracts SET title=''Rewritten'' WHERE id=%L',:'contract'),'42501','a contract version cannot be rewritten (columns beyond verification are not even writable)');
INSERT INTO sw_supplier_contracts(workspace_id,supplier_asset_id,contract_key,title) VALUES(:'wa',:'supplier','PS-2024-01','Service agreement access control, amended') RETURNING contract_version AS cv2 \gset
SELECT pg_temp.ok(:cv2=2 AND (SELECT verified_by='5d000000-0000-4000-8000-000000000003' FROM sw_supplier_contracts WHERE id=:'contract'),'a change is a new contract version; the verified one stays as it was');

-- ---------------------------------------------------------------------------
-- 3. The request: basis, draft, approved external version, dispatch
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT jsonb_build_object('actionId',:'action','supplierAssetId',:'supplier','basisKind','contract_obligation','obligationId',:'obligation',
  'internalOwnerId','5d000000-0000-4000-8000-000000000002','title','Impact of firmware advisory on our access control',
  'task','Confirm whether firmware 4.2 at our two offices is affected and provide a remediation plan.','expectedResult','Written impact statement and dated plan',
  'responseInstruction','Reply to security@nordic.example.test quoting the reference.','verificationCriteria','Affected versions listed; plan has dates; INTERNAL: compare with our asset register',
  'requestedDue',(current_date+5)::text) AS fields \gset
SELECT pg_temp.failmsg(format('SELECT sw_save_supplier_request(%L,gen_random_uuid(),NULL,NULL,%L)',:'wa',:'fields'),'SW_CONFIRMED_OBLIGATION_REQUIRED','an unconfirmed obligation is not a contractual basis');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
UPDATE sw_supplier_obligations SET confirmed=true WHERE id=:'obligation';
SELECT pg_temp.fail(format('UPDATE sw_supplier_obligations SET expected_result=''Something else'' WHERE id=%L',:'obligation'),'23514','a confirmed obligation is history: its content cannot change');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000005');
SELECT pg_temp.fail(format('SELECT sw_save_supplier_request(%L,gen_random_uuid(),NULL,NULL,%L)',:'wa',:'fields'),'42501','a viewer cannot prepare a request');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT (sw_save_supplier_request(:'wa','5d000000-0000-4000-8000-0000000000a1',NULL,NULL,:'fields')).id AS req \gset
SELECT pg_temp.ok((SELECT status='draft' AND reference ~ '^LB-[0-9]{4}-0001$' AND cycle=1 FROM sw_supplier_requests WHERE id=:'req'),'a draft request with its own reference is attached to the existing action');
SELECT pg_temp.ok((sw_save_supplier_request(:'wa','5d000000-0000-4000-8000-0000000000a1',NULL,NULL,:'fields')).id=:'req' AND (SELECT count(*)=1 FROM sw_supplier_requests WHERE workspace_id=:'wa'),'a retried create returns the same request and creates nothing more');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_actions WHERE workspace_id=:'wa'),'no second action is created: the request is the action''s supplier part');
SELECT version AS v FROM sw_supplier_requests WHERE id=:'req' \gset
SELECT pg_temp.fail(format('SELECT sw_approve_supplier_share(%L,gen_random_uuid(),%L,%s,''Passage Systems support'',''Impact statement'')',:'wa',:'req',:v),'42501','an editor without the sharing right cannot release anything externally');
SELECT pg_temp.failmsg(format('SELECT sw_record_supplier_dispatch(%L,gen_random_uuid(),%L,%s,''email'',''support@passage.example.test'',now())',:'wa',:'req',:v),'SW_APPROVED_SHARE_REQUIRED','nothing is sent before an approved external version exists');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000001');
SELECT (sw_approve_supplier_share(:'wa','5d000000-0000-4000-8000-0000000000a2',:'req',:v,'Passage Systems support','Impact statement and remediation plan')).version AS v \gset
SELECT pg_temp.ok((SELECT status='ready_to_send' AND share_version=1 AND NOT share_stale FROM sw_supplier_requests WHERE id=:'req')
  AND (SELECT approved_by='5d000000-0000-4000-8000-000000000001' AND content->>'reference' IS NOT NULL AND content->'contract'->>'clause'='7.2'
        AND NOT content ? 'verificationCriteria' AND position('INTERNAL' IN content::text)=0 AND position('risk' IN lower(content::text))=0
        FROM sw_supplier_request_shares WHERE request_id=:'req' AND share_version=1),
  'the sharing right approves an exact external version: reference, task, clause; no internal criteria or risk');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT (sw_save_supplier_request(:'wa',gen_random_uuid(),:'req',:v,jsonb_build_object('task','Confirm whether firmware 4.2 or 4.3 at our two offices is affected and provide a remediation plan.'))).version AS v \gset
SELECT pg_temp.ok((SELECT status='draft' AND share_stale FROM sw_supplier_requests WHERE id=:'req'),'changing the external content withdraws the approval and marks the shared version stale');
SELECT pg_temp.ok((SELECT content->>'task' NOT LIKE '%4.3%' FROM sw_supplier_request_shares WHERE request_id=:'req' AND share_version=1),'what was approved earlier is never silently changed');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000001');
SELECT (sw_approve_supplier_share(:'wa',gen_random_uuid(),:'req',:v,'Passage Systems support','Impact statement and remediation plan')).version AS v \gset
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000004');
SELECT (sw_record_supplier_dispatch(:'wa','5d000000-0000-4000-8000-0000000000a3',:'req',:v,'email','support@passage.example.test',now()-interval '1 day')).version AS v \gset
SELECT pg_temp.ok((SELECT status='awaiting_response' FROM sw_supplier_requests WHERE id=:'req')
  AND (SELECT details->>'shareVersion'='2' AND details->>'recipient'='support@passage.example.test' FROM sw_supplier_request_events WHERE request_id=:'req' AND event='dispatched'),
  'a recorded dispatch of the approved version: sent, which is not read and not accepted');

-- ---------------------------------------------------------------------------
-- 4. An insufficient answer, a revision, an objection and a scope decision
-- ---------------------------------------------------------------------------
SELECT (sw_record_supplier_response(:'wa',gen_random_uuid(),:'req',:v,jsonb_build_object('kind','done','authorName','J. Berg, Passage Systems','origin','email',
  'body','We have upgraded.','receivedAt',(now()-interval '12 hours')::text))).version AS v \gset
SELECT id AS resp1 FROM sw_supplier_responses WHERE request_id=:'req' AND seq=1 \gset
SELECT pg_temp.ok((SELECT status='awaiting_verification' FROM sw_supplier_requests WHERE id=:'req') AND (SELECT recorded_by='5d000000-0000-4000-8000-000000000004' AND author_name LIKE 'J. Berg%' FROM sw_supplier_responses WHERE id=:'resp1'),
  'the supplier''s "done" awaits verification; who registered it and who wrote it are separate');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('UPDATE sw_actions SET status=''completed'', decision_rationale=''Supplier says done'', completion_evidence=''Mail'' WHERE id=%L',:'action'),'23514','the supplier''s "done" does not complete the action');
SELECT pg_temp.fail(format('SELECT sw_verify_supplier_response(%L,gen_random_uuid(),%L,%s,%L,''accepted'',''Looks fine'','''','''')',:'wa',:'req',:v,:'resp1'),'42501','an editor without the verifier right cannot accept');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT (sw_verify_supplier_response(:'wa',gen_random_uuid(),:'req',:v,:'resp1','needs_revision','No versions listed, no dated plan','Mail of 21 Nov','Impact unknown')).version AS v \gset
SELECT pg_temp.ok((SELECT status='needs_revision' FROM sw_supplier_requests WHERE id=:'req'),'the verifier asks for a revision when evidence is missing');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000004');
SELECT (sw_record_supplier_response(:'wa',gen_random_uuid(),:'req',:v,jsonb_build_object('kind','objection','authorName','J. Berg, Passage Systems','origin','phone',
  'body','The upgrade to 4.3 is not included in the service agreement.','proposedDue',(current_date+20)::text))).version AS v \gset
SELECT pg_temp.ok((SELECT status='needs_revision' AND supplier_proposed_due=current_date+20 AND requested_due=current_date+5 FROM sw_supplier_requests WHERE id=:'req')
  AND (SELECT count(*)=1 FROM sw_supplier_request_events WHERE request_id=:'req' AND event='objection_recorded'),
  'an objection is recorded; the customer''s and the supplier''s dates stay separate');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale,amount,currency,cost_scope,mandate) VALUES(%L,''supplier_request'',%L,''scope_cost'',''Order the upgrade'',48000,''SEK'',''Upgrade to 4.3, both offices'',''CFO mandate'')',:'wa',:'req'),'42501','a scope and cost decision needs the approval right');
INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale) VALUES(:'wa','action',:'action','temporary_protection','Guards at both entrances until verified');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale,amount) VALUES(%L,''supplier_request'',%L,''scope_cost'',''Order'',1)',:'wa',:'req'),'23514','a scope and cost decision needs amount, currency, scope and mandate');
INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale,amount,currency,cost_scope,mandate) VALUES
 (:'wa','supplier_request',:'req','scope_cost','Upgrade is outside the agreement; order it separately',48000,'SEK','Upgrade to 4.3, both offices','CFO mandate 2026-11') RETURNING id AS costdec \gset
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('SELECT sw_save_supplier_request(%L,gen_random_uuid(),NULL,NULL,%L)',:'wa',
  (:'fields'::jsonb || jsonb_build_object('basisKind','change_order','obligationId',NULL,'title','Upgrade order'))::text),'23514','a change order needs the scope and cost decision');
SELECT pg_temp.failmsg(format('SELECT sw_save_supplier_request(%L,gen_random_uuid(),NULL,NULL,%L)',:'wa',
  (:'fields'::jsonb || jsonb_build_object('basisKind','change_order','obligationId',NULL,'changeDecisionId',(SELECT d.id FROM sw_decisions d WHERE d.decision='temporary_protection' LIMIT 1),'title','Upgrade order'))::text),'SW_SCOPE_COST_DECISION_REQUIRED','another kind of decision does not authorise an order');
SELECT (sw_save_supplier_request(:'wa',gen_random_uuid(),NULL,NULL,(:'fields'::jsonb || jsonb_build_object('basisKind','change_order','obligationId',NULL,'changeDecisionId',:'costdec','title','Upgrade order 4.3'))::jsonb)).id AS order_req \gset
SELECT pg_temp.ok((SELECT basis_kind='change_order' AND status='draft' FROM sw_supplier_requests WHERE id=:'order_req'),'the separate order is its own request under the same action, backed by the decision');
SELECT pg_temp.fail(format('SELECT sw_change_supplier_due(%L,gen_random_uuid(),%L,%s,''agreed'',%L,'''')',:'wa',:'req',:v,current_date+15),'23514','a date change needs a reason');
SELECT (sw_change_supplier_due(:'wa',gen_random_uuid(),:'req',:v,'agreed',current_date+15,'Agreed by phone with J. Berg')).version AS v \gset
SELECT pg_temp.ok((SELECT agreed_due=current_date+15 AND requested_due=current_date+5 FROM sw_supplier_requests WHERE id=:'req')
  AND (SELECT details->>'from' IS NULL AND details->>'to'=(current_date+15)::text FROM sw_supplier_request_events WHERE request_id=:'req' AND event='due_changed'),
  'the agreed date is stored separately and the change is kept in the history');

-- ---------------------------------------------------------------------------
-- 5. A new answer is verified; concurrency, idempotency, separate verifier
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000004');
INSERT INTO sw_sources(workspace_id,name) VALUES(:'wa','Supplier statement LB-0001') RETURNING id AS evidence \gset
SELECT (sw_record_supplier_response(:'wa',gen_random_uuid(),:'req',:v,jsonb_build_object('kind','done','authorName','J. Berg, Passage Systems','origin','email',
  'body','Versions 4.2 affected at both offices; patch 4.2.7 installed 28 Nov; report attached.','claimedDoneAt',now()::text,'evidenceSourceIds',jsonb_build_array(:'evidence')))).version AS v \gset
SELECT id AS resp2 FROM sw_supplier_responses WHERE request_id=:'req' AND kind='done' ORDER BY seq DESC LIMIT 1 \gset
SELECT pg_temp.fail(format('SELECT sw_record_supplier_response(%L,gen_random_uuid(),%L,%s,%L)',:'wa',:'req',:v,jsonb_build_object('kind','plan','authorName','x','origin','email','body','y','evidenceSourceIds',jsonb_build_array(gen_random_uuid()))),'23514','evidence must be a source of this workspace');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT sw_verify_supplier_response(%L,gen_random_uuid(),%L,%s,%L,''accepted'',''x'','''','''')',:'wa',:'req',:v,:'resp1'),'23514','only the latest "done" of the cycle can be verified');
SELECT (sw_verify_supplier_response(:'wa','5d000000-0000-4000-8000-0000000000a4',:'req',:v,:'resp2','accepted','Versions listed; patch verified on both sites','Supplier statement LB-0001; site check','')).version AS v_after \gset
SELECT pg_temp.fail(format('SELECT sw_verify_supplier_response(%L,gen_random_uuid(),%L,%s,%L,''accepted'',''Second verifier'','''','''')',:'wa',:'req',:v,:'resp2'),'40001','a second verifier on the same version gets a conflict, not a second outcome');
SELECT pg_temp.ok((sw_verify_supplier_response(:'wa','5d000000-0000-4000-8000-0000000000a4',:'req',:v,:'resp2','accepted','Versions listed; patch verified on both sites','Supplier statement LB-0001; site check','')).version=:v_after
  AND (SELECT count(*)=1 FROM sw_supplier_verifications WHERE request_id=:'req' AND outcome='accepted'),'a retried verification returns the outcome and records nothing more');
SELECT pg_temp.fail(format('SELECT sw_withdraw_supplier_request(%L,%L,%L,%s,''Reuse'')',:'wa','5d000000-0000-4000-8000-0000000000a4',:'order_req',1),'23505','an operation id cannot be reused for another command');
RESET ROLE;
SELECT pg_temp.fail(format('INSERT INTO sw_supplier_verifications(workspace_id,request_id,response_id,cycle,outcome,criteria_checked,verified_by) VALUES(%L,%L,%L,1,''accepted'',''x'',%L)',:'wa',:'req',:'resp2','5d000000-0000-4000-8000-000000000001'),'23505','at most one acceptance per cycle, whatever runs concurrently');
SELECT pg_temp.fail(format('UPDATE sw_supplier_responses SET body=''rewritten'' WHERE id=%L',:'resp1'),'23514','responses are history: they cannot be rewritten');
SELECT pg_temp.fail(format('DELETE FROM sw_supplier_request_events WHERE request_id=%L',:'req'),'23514','request events cannot be removed');
SELECT pg_temp.fail(format('UPDATE sw_decisions SET rationale=''changed'' WHERE id=%L',:'costdec'),'23514','decisions are append-only');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('UPDATE sw_supplier_requests SET status=''accepted'' WHERE id=%L',:'order_req'),'42501','no client can set a request''s status directly');
-- Reopen: a new cycle, the earlier acceptance stays.
SELECT pg_temp.fail(format('SELECT sw_reopen_supplier_request(%L,gen_random_uuid(),%L,%s,''Patch incomplete'')',:'wa',:'req',:v_after),'42501','reopening needs the approval right');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT (sw_reopen_supplier_request(:'wa',gen_random_uuid(),:'req',:v_after,'Gothenburg reader still on 4.2.6')).version AS v \gset
SELECT pg_temp.ok((SELECT status='in_progress' AND cycle=2 FROM sw_supplier_requests WHERE id=:'req') AND (SELECT count(*)=1 FROM sw_supplier_verifications WHERE request_id=:'req' AND cycle=1 AND outcome='accepted'),
  'reopening starts cycle 2 and keeps the earlier acceptance');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000004');
SELECT (sw_record_supplier_response(:'wa',gen_random_uuid(),:'req',:v,jsonb_build_object('kind','done','authorName','J. Berg','origin','email','body','Gothenburg reader patched to 4.2.7.'))).version AS v \gset
SELECT id AS resp3 FROM sw_supplier_responses WHERE request_id=:'req' AND cycle=2 AND kind='done' \gset
-- Separate verifier for a critical request: the internal owner may not verify.
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
SELECT (sw_save_supplier_request(:'wa',gen_random_uuid(),:'req',:v,jsonb_build_object('requiresSeparateVerifier',true,'internalOwnerId','5d000000-0000-4000-8000-000000000003'))).version AS v \gset
SELECT pg_temp.failmsg(format('SELECT sw_save_supplier_request(%L,gen_random_uuid(),%L,%s,%L)',:'wa',:'req',:v,jsonb_build_object('requiresSeparateVerifier',false)),'SW_SEPARATE_VERIFIER_LOCKED','an ordinary edit cannot lower the separate-verifier requirement');
SELECT pg_temp.failmsg(format('SELECT sw_save_supplier_request(%L,gen_random_uuid(),%L,%s,%L)',:'wa',:'req',:v,jsonb_build_object('internalOwnerId','5d000000-0000-4000-8000-000000000004')),'SW_SEPARATE_VERIFIER_LOCKED','nor move ownership away so the former owner could verify');
SELECT pg_temp.ok((SELECT requires_separate_verifier AND internal_owner_id='5d000000-0000-4000-8000-000000000003' AND version=:v FROM sw_supplier_requests WHERE id=:'req'),'the requirement and its owner are unchanged');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT sw_verify_supplier_response(%L,gen_random_uuid(),%L,%s,%L,''accepted'',''Own check'','''','''')',:'wa',:'req',:v,:'resp3'),'42501','a critical request needs a verifier other than its internal owner');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000001');
SELECT (sw_verify_supplier_response(:'wa',gen_random_uuid(),:'req',:v,:'resp3','accepted','Reader firmware read out on site: 4.2.7','Site visit 2 Dec','')).version AS v \gset
SELECT pg_temp.ok((SELECT status='accepted' AND cycle=2 FROM sw_supplier_requests WHERE id=:'req'),'a separate verifier accepts the second cycle');

-- ---------------------------------------------------------------------------
-- 6. The action completes only when its supplier work is settled
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('UPDATE sw_actions SET status=''completed'', decision_rationale=''Patched'', completion_evidence=''Verification LB-0001'' WHERE id=%L',:'action'),'23514','an open order request still blocks completion');
SELECT pg_temp.ok(pg_temp.changed(format('SELECT sw_withdraw_supplier_request(%L,gen_random_uuid(),%L,1,''Patch made the upgrade unnecessary'')',:'wa',:'order_req'))=1,'an unneeded request is withdrawn with a reason');
UPDATE sw_actions SET status='completed', decision_rationale='Patched and verified on both sites', completion_evidence='Verification of LB request, cycle 2' WHERE id=:'action';
SELECT pg_temp.ok((SELECT status='completed' FROM sw_actions WHERE id=:'action'),'with every request accepted or withdrawn the action completes');
SELECT pg_temp.fail(format('SELECT sw_reopen_supplier_request(%L,gen_random_uuid(),%L,%s,''Late doubt'')',:'wa',:'req',:v),'23514','a request of a closed action cannot be reopened');
-- A documented deviation is the only other way to close.
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
INSERT INTO sw_actions(workspace_id,risk_id,source_kind,title) VALUES(:'wa',:'risk','risk','Spare reader stock') RETURNING id AS action2 \gset
SELECT (sw_save_supplier_request(:'wa',gen_random_uuid(),NULL,NULL,(:'fields'::jsonb || jsonb_build_object('actionId',:'action2','basisKind','information','obligationId',NULL,'title','Spare reader availability'))::jsonb)).id AS info_req \gset
SELECT pg_temp.fail(format('UPDATE sw_actions SET status=''completed'', decision_rationale=''Enough'', completion_evidence=''Stock count'' WHERE id=%L',:'action2'),'23514','an unanswered request blocks completion');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale) VALUES(:'wa','action',:'action2','close_with_deviation','Own stock suffices; supplier answer no longer needed');
UPDATE sw_actions SET status='completed', decision_rationale='Closed with documented deviation', completion_evidence='Stock count 4 Dec' WHERE id=:'action2';
SELECT pg_temp.ok((SELECT status='completed' FROM sw_actions WHERE id=:'action2'),'an approver''s documented deviation closes the action');

-- ---------------------------------------------------------------------------
-- 7. Need-to-know: other customer, restricted mission, viewer
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok(pg_temp.visible(:'req')>=10 AND (SELECT count(*)>=1 FROM sw_decisions WHERE subject_id=:'req'),'a viewer of the workspace reads the request and its history');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000006');
SELECT pg_temp.ok(pg_temp.visible(:'req')=0 AND (SELECT count(*)=0 FROM sw_supplier_profiles WHERE workspace_id=:'wa') AND (SELECT count(*)=0 FROM sw_supplier_contracts WHERE workspace_id=:'wa'),
  'another customer reads nothing of the supplier cycle');
SELECT pg_temp.fail(format('SELECT sw_record_supplier_response(%L,gen_random_uuid(),%L,1,%L)',:'wa',:'req',jsonb_build_object('kind','plan','authorName','x','origin','email','body','y')),'42501','another customer cannot act on a request by its id');
SELECT sw_create_personal_workspace('Second space B') AS wb2 \gset
SELECT pg_temp.fail(format('SELECT sw_save_supplier_request(%L,gen_random_uuid(),NULL,NULL,%L)',:'wb',:'fields'),'42501','another customer cannot attach a request to this customer''s action');
-- Restricted mission: a scoped action and its request stay in the circle.
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
INSERT INTO sw_missions(workspace_id,kind,title,restricted) VALUES(:'wa','monitoring_impact','Board-only supplier dispute',true) RETURNING id AS rm \gset
SELECT sw_set_mission_member(:'wa',:'rm','5d000000-0000-4000-8000-000000000004',true);
INSERT INTO sw_actions(workspace_id,source_kind,title,access_mission_id) VALUES(:'wa','manual','Confidential supplier escalation',:'rm') RETURNING id AS secret_action \gset
SELECT (sw_save_supplier_request(:'wa',gen_random_uuid(),NULL,NULL,(:'fields'::jsonb || jsonb_build_object('actionId',:'secret_action','basisKind','information','obligationId',NULL,'title','CONFIDENTIAL escalation'))::jsonb)).id AS secret_req \gset
INSERT INTO sw_decisions(workspace_id,subject_kind,subject_id,decision,rationale) VALUES(:'wa','supplier_request',:'secret_req','investigate','CONFIDENTIAL');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000007');
SELECT pg_temp.ok(pg_temp.visible(:'secret_req')=0 AND (SELECT count(*)=0 FROM sw_supplier_requests WHERE title LIKE 'CONFIDENTIAL%')
  AND (SELECT count(*)=0 FROM sw_audit_events WHERE entity_table IN ('sw_supplier_requests','sw_decisions') AND entity_id IN (:'secret_req',(SELECT d.id FROM sw_decisions d WHERE d.subject_id=:'secret_req'))),
  'an editor outside the restricted circle reads nothing of its supplier request, decisions or their history');
SELECT pg_temp.fail(format('SELECT sw_withdraw_supplier_request(%L,gen_random_uuid(),%L,1,''x'')',:'wa',:'secret_req'),'42501','nor can act on it');
SELECT pg_temp.fail(format('SELECT sw_withdraw_supplier_request(%L,gen_random_uuid(),gen_random_uuid(),1,''x'')',:'wa'),'42501','the refusal is the same as for an id that does not exist');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok(pg_temp.visible(:'secret_req')>=3,'a circle member works with it');
-- A replay returns the request as it is now: it re-checks the caller's access now.
SELECT (sw_change_supplier_due(:'wa','5d000000-0000-4000-8000-0000000000b1',:'secret_req',1,'requested',current_date+30,'Escalation timetable')).version AS sv \gset
SELECT pg_temp.ok((sw_change_supplier_due(:'wa','5d000000-0000-4000-8000-0000000000b1',:'secret_req',1,'requested',current_date+30,'Escalation timetable')).version=:sv,'a circle member''s retry is replayed safely');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT sw_set_mission_member(:'wa',:'rm','5d000000-0000-4000-8000-000000000004',false);
SELECT (sw_save_supplier_request(:'wa',gen_random_uuid(),:'secret_req',:sv,jsonb_build_object('title','CONFIDENTIAL escalation, board decision attached'))).version AS sv \gset
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000004');
SELECT pg_temp.fail(format('SELECT title FROM sw_change_supplier_due(%L,%L,%L,1,''requested'',%L,''Escalation timetable'')',:'wa','5d000000-0000-4000-8000-0000000000b1',:'secret_req',current_date+30),'42501','after leaving the circle, a retry of the earlier operation reveals nothing of the updated request');

-- ---------------------------------------------------------------------------
-- 8. Supplier review
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000002');
INSERT INTO sw_supplier_reviews(workspace_id,supplier_asset_id,period_start,period_end,findings,next_review_at) VALUES(:'wa',:'supplier',current_date-90,current_date,'First answer lacked evidence; scope dispute on upgrades',current_date+90) RETURNING id AS review \gset
SELECT pg_temp.fail(format('UPDATE sw_supplier_reviews SET status=''approved'' WHERE id=%L',:'review'),'42501','approving a supplier review needs the approval right');
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
UPDATE sw_supplier_reviews SET status='approved' WHERE id=:'review';
SELECT pg_temp.fail(format('UPDATE sw_supplier_reviews SET findings=''rewritten'' WHERE id=%L',:'review'),'23514','an approved review is final');
SELECT pg_temp.ok((SELECT approved_by='5d000000-0000-4000-8000-000000000003' FROM sw_supplier_reviews WHERE id=:'review'),'the approver of the review is stamped');
-- A deactivated member's retry is refused too, even with the right operation id.
RESET ROLE;
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000001');
UPDATE sw_workspace_memberships SET active=false WHERE workspace_id=:'wa' AND user_id='5d000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5d000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT title FROM sw_verify_supplier_response(%L,%L,%L,%s,%L,''accepted'',''Versions listed; patch verified on both sites'',''Supplier statement LB-0001; site check'','''')',:'wa','5d000000-0000-4000-8000-0000000000a4',:'req',:v,:'resp2'),'42501','a deactivated member''s retry of an earlier verification returns nothing');
RESET ROLE;

\if :{?sw_supplier_keep_fixture}
\else
ROLLBACK;
\endif
