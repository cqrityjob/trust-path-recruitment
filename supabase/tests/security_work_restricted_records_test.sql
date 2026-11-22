-- Security Work 20270329090000: risks and actions derived from a restricted
-- mission's impact brief stay need-to-know, through every table that points
-- at them; accepting a mission review needs an approver. Real roles,
-- synthetic data, rolled back unless sw_restricted_keep_fixture.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok  SW-RRC %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE; IF state<>code THEN RAISE EXCEPTION '% expected %, got % (%)',label,code,state,SQLERRM; END IF; RAISE NOTICE 'ok  SW-RRC %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',coalesce(u,''),true);PERFORM set_config('request.jwt.claims',CASE WHEN u IS NULL THEN '{}' ELSE jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text END,true); END $$;
-- Refused for permission or by a guard that cannot see the target; never accepted.
CREATE OR REPLACE FUNCTION pg_temp.refused(s text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE; IF state NOT IN ('42501','23514') THEN RAISE EXCEPTION '% expected a refusal, got % (%)',label,state,SQLERRM; END IF; RAISE NOTICE 'ok  SW-RRC %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
-- How many rows an UPDATE as the current user changed (RLS filters silently).
CREATE OR REPLACE FUNCTION pg_temp.changed(s text) RETURNS integer LANGUAGE plpgsql AS $$ DECLARE n integer; BEGIN EXECUTE s; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;
-- Everything one principal can read about one derived risk and its actions.
CREATE OR REPLACE FUNCTION pg_temp.visible(_risk uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM public.sw_risks WHERE id=_risk)::int
       + (SELECT count(*) FROM public.sw_actions WHERE risk_id=_risk)::int
       + (SELECT count(*) FROM public.sw_controls WHERE risk_id=_risk)::int
       + (SELECT count(*) FROM public.sw_risk_assets WHERE risk_id=_risk)::int
       + (SELECT count(*) FROM public.sw_citations WHERE risk_id=_risk)::int
       + (SELECT count(*) FROM public.sw_evidence_links WHERE target_kind IN ('risk','action') AND (target_id=_risk OR target_id IN (SELECT a.id FROM public.sw_actions a WHERE a.risk_id=_risk)))::int
       + (SELECT count(*) FROM public.sw_audit_events WHERE entity_id=_risk OR entity_id IN (SELECT a.id FROM public.sw_actions a WHERE a.risk_id=_risk))::int
       + (SELECT count(*) FROM public.sw_record_versions WHERE risk_id=_risk)::int $$;

-- Reserve, dispatch, sign, complete and store an assistant result (the legitimate path).
CREATE OR REPLACE FUNCTION pg_temp.sign(_job uuid,_fence uuid,_payload text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT sw_private.receipt_mac('assistant'||E'\n'||_job::text||E'\n'||_fence::text||E'\n'||sw_private.hash_text(_payload),repeat('synthetic-only-',4)) $$;
CREATE OR REPLACE FUNCTION pg_temp.manifest(_kind text,_ck text,_cid text,_req text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('kind',_kind,'capability',_kind,'contextKind',_ck,'contextId',_cid,'requestText',_req,'language','sv',
    'promptVersion','sw-rrc-test','decisionRequired',true,'context',jsonb_build_object('note','synthetic'),'sources','[]'::jsonb) $$;
CREATE OR REPLACE FUNCTION pg_temp.produce(_w uuid,_id uuid,_m jsonb,_output jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f uuid; p text := jsonb_build_object('status','succeeded','output',_output,'provider','synthetic','model','synthetic-model','inputTokens',10,'outputTokens',20,'costMicros',40)::text;
BEGIN
  PERFORM public.sw_reserve_assistant(_w,_id,'5c000000-0000-4000-8000-000000000040',_m);
  f := (public.sw_dispatch_processing(_w,_id)->'job'->>'fence')::uuid;
  PERFORM public.sw_complete_processing(_w,_id,f,'synthetic-test-key',p,pg_temp.sign(_id,f,p));
  INSERT INTO public.sw_ai_suggestions(id,workspace_id,job_id,kind,context_kind,context_id,request_text,content,source_records,provider,model,prompt_version,decision_required)
  VALUES(_id,_w,_id,_m->>'kind',_m->>'contextKind',(_m->>'contextId')::uuid,_m->>'requestText',_output,_m->'sources','synthetic','synthetic-model','sw-rrc-test',true);
  RETURN _id;
END $$;

-- 1 owner (approver, OUTSIDE the circle), 2 approving editor (creates the
-- circle), 3 editor without approval (in the circle), 4 editor outside,
-- 5 viewer outside, 6 viewer in the circle, 7 owner of another workspace.
INSERT INTO auth.users(id,email,email_confirmed_at) SELECT ('5c000000-0000-4000-8000-00000000000'||n)::uuid,'rrc-'||n||'@example.test',now() FROM generate_series(1,7) n;
INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '5c000000-%';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000001');
SELECT sw_create_personal_workspace('Restricted records A') AS wa \gset
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000007');
SELECT sw_create_personal_workspace('Restricted records B') AS wb \gset
RESET ROLE;
INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
 (:'wa','5c000000-0000-4000-8000-000000000002','editor',true),
 (:'wa','5c000000-0000-4000-8000-000000000003','editor',false),
 (:'wa','5c000000-0000-4000-8000-000000000004','editor',false),
 (:'wa','5c000000-0000-4000-8000-000000000005','viewer',false),
 (:'wa','5c000000-0000-4000-8000-000000000006','viewer',false);
INSERT INTO sw_private.worker_keys(key_id,secret) SELECT 'synthetic-test-key',repeat('synthetic-only-',4) WHERE NOT EXISTS (SELECT 1 FROM sw_private.worker_keys WHERE key_id='synthetic-test-key');
INSERT INTO public.sw_ai_activations(id,workspace_id,environment,purpose,provider,model,task_version,prompt_version,policy_version,output_schema_version,data_processing_approval,approved_by,valid_until,max_cost_micros,daily_budget_micros,max_output_tokens,timeout_ms) VALUES
 ('5c000000-0000-4000-8000-000000000040',:'wa','internal_qa','draft_analysis','synthetic','synthetic-model','v1','v1','v1','v1','Synthetic approval only','5c000000-0000-4000-8000-000000000001',now()+interval '1 hour',100,1000,2048,10000);

-- ---------------------------------------------------------------------------
-- Surface
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok((SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND column_name='access_mission_id' AND table_name IN ('sw_risks','sw_actions'))
  AND (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='sw_missions' AND column_name IN ('review_accepted_by','review_accepted_at')),'scope and acceptance columns exist');
SELECT pg_temp.ok(has_function_privilege('authenticated','sw_private.can_see_scope(uuid,uuid)','EXECUTE') AND has_function_privilege('authenticated','sw_private.can_see_record(uuid,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','sw_private.record_scope(uuid,text,text)','EXECUTE') AND NOT has_function_privilege('authenticated','sw_private.guard_record_scope()','EXECUTE')
  AND NOT has_function_privilege('anon','sw_private.can_see_scope(uuid,uuid)','EXECUTE'),'policy helpers for authenticated only; scope lookup and guards for nobody');

-- ---------------------------------------------------------------------------
-- A restricted mission's brief becomes a risk and actions inside the circle
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
INSERT INTO sw_missions(workspace_id,kind,title,restricted) VALUES(:'wa','monitoring_impact','Board-only supplier review',true) RETURNING id AS rm \gset
SELECT sw_set_mission_member(:'wa',:'rm','5c000000-0000-4000-8000-000000000003',true);
SELECT sw_set_mission_member(:'wa',:'rm','5c000000-0000-4000-8000-000000000006',true);
INSERT INTO sw_missions(workspace_id,kind,title) VALUES(:'wa','monitoring_impact','Open road monitoring') RETURNING id AS om \gset
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
INSERT INTO sw_sources(workspace_id,name) VALUES(:'wa','Manual note') RETURNING id AS src \gset
INSERT INTO sw_source_items(workspace_id,source_id,deduplication_key,original_title,factual_extract) VALUES(:'wa',:'src','rrc1','Supplier insolvency rumour','Confidential: key supplier may be insolvent.') RETURNING id AS item \gset
INSERT INTO sw_change_briefs(workspace_id,title,mission_id,what_changed,why_it_matters,evidence_item_ids) VALUES
 (:'wa','Supplier insolvency',:'rm','CONFIDENTIAL supplier may fail','CONFIDENTIAL single-source dependency',ARRAY[:'item'::uuid]) RETURNING id AS brief \gset
UPDATE sw_change_briefs SET status='in_review' WHERE id=:'brief';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
UPDATE sw_change_briefs SET status='approved' WHERE id=:'brief';
SELECT version AS bv FROM sw_change_briefs WHERE id=:'brief' \gset
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT sw_apply_change_brief(%L,%L,%s,gen_random_uuid(),%L)',:'wa',:'brief',:bv,'{"risk":{"title":"CONFIDENTIAL supplier risk"},"actions":[{"title":"x","priority":"critical"}]}'),'23514','a failing apply leaves nothing behind');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_risks WHERE workspace_id=:'wa'),'after the failure no risk exists');
SELECT '{"risk":{"title":"CONFIDENTIAL supplier risk","description":"CONFIDENTIAL single-source dependency","threatScenario":"CONFIDENTIAL supplier may fail"},"actions":[{"title":"CONFIDENTIAL find second supplier","priority":"high"},{"title":"CONFIDENTIAL brief the board"}]}' AS apply \gset
SELECT (sw_apply_change_brief(:'wa',:'brief',:bv,'5c000000-0000-4000-8000-0000000000b1',:'apply')).risk_id AS risk \gset
SELECT pg_temp.ok((SELECT access_mission_id=:'rm' FROM sw_risks WHERE id=:'risk') AND (SELECT count(*)=2 FROM sw_actions WHERE risk_id=:'risk' AND access_mission_id=:'rm'),'the derived risk and actions carry the restricted mission''s scope');
SELECT pg_temp.ok((sw_apply_change_brief(:'wa',:'brief',:bv,'5c000000-0000-4000-8000-0000000000b1',:'apply')).risk_id=:'risk' AND (SELECT count(*)=1 FROM sw_risks WHERE workspace_id=:'wa'),'a retry returns the receipt and creates nothing more');
-- The circle works with the records.
SELECT pg_temp.ok(pg_temp.changed(format('UPDATE sw_risks SET description=''CONFIDENTIAL updated by the circle'' WHERE id=%L',:'risk'))=1,'a circle editor updates the derived risk');
INSERT INTO sw_controls(workspace_id,risk_id,title) VALUES(:'wa',:'risk','CONFIDENTIAL dual sourcing');
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','Production line','operations') RETURNING id AS asset \gset
INSERT INTO sw_risk_assets(workspace_id,risk_id,asset_id) VALUES(:'wa',:'risk',:'asset');
INSERT INTO sw_actions(workspace_id,risk_id,source_kind,title) VALUES(:'wa',:'risk','risk','CONFIDENTIAL added later') RETURNING id AS later \gset
SELECT pg_temp.ok((SELECT access_mission_id=:'rm' FROM sw_actions WHERE id=:'later'),'an action added later to the risk inherits its scope');
SELECT pg_temp.ok(pg_temp.visible(:'risk')>=10,'the circle reads the risk, its actions, control, asset link, evidence links, history and versions');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000006');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_risks WHERE id=:'risk') AND (SELECT count(*)=3 FROM sw_actions WHERE risk_id=:'risk'),'a viewer in the circle reads the derived records');
SELECT pg_temp.ok(pg_temp.changed(format('UPDATE sw_risks SET title=''viewer'' WHERE id=%L',:'risk'))=0,'a viewer in the circle cannot change them');

-- ---------------------------------------------------------------------------
-- Outside the circle: no direct read, no indirect read, no change
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok(pg_temp.visible(:'risk')=0,'an editor outside the circle reads nothing of the derived records or what points at them');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_audit_events WHERE workspace_id=:'wa' AND entity_table IN ('sw_risks','sw_actions','sw_controls'))
  AND (SELECT count(*)=0 FROM sw_record_versions WHERE workspace_id=:'wa' AND (risk_id IS NOT NULL OR action_id IS NOT NULL)),'nothing of them reaches the outside editor through the workspace history');
SELECT pg_temp.ok(pg_temp.changed(format('UPDATE sw_risks SET title=''Outsider rewrite'' WHERE id=%L',:'risk'))=0
  AND pg_temp.changed(format('UPDATE sw_actions SET status=''in_progress'' WHERE risk_id=%L',:'risk'))=0,'an editor outside the circle cannot change the risk or its actions');
SELECT pg_temp.fail(format('INSERT INTO sw_actions(workspace_id,risk_id,source_kind,title) VALUES(%L,%L,''risk'',''Outsider action'')',:'wa',:'risk'),'42501','an editor outside the circle cannot attach an action to the risk');
SELECT pg_temp.refused(format('INSERT INTO sw_controls(workspace_id,risk_id,title) VALUES(%L,%L,''Outsider control'')',:'wa',:'risk'),'an editor outside the circle cannot attach a control to the risk');
SELECT pg_temp.fail(format('INSERT INTO sw_evidence_links(workspace_id,source_id,target_kind,target_id) VALUES(%L,%L,''risk'',%L)',:'wa',:'src',:'risk'),'42501','an editor outside the circle cannot link evidence to the risk');
SELECT pg_temp.fail(format('INSERT INTO sw_risks(workspace_id,title,access_mission_id) VALUES(%L,''Planted'',%L)',:'wa',:'rm'),'42501','an editor outside the circle cannot create a record in its scope');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok(pg_temp.visible(:'risk')=0,'a viewer outside the circle reads nothing of them');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok(pg_temp.visible(:'risk')=0 AND pg_temp.changed(format('UPDATE sw_risks SET title=''Owner rewrite'' WHERE id=%L',:'risk'))=0,'a workspace owner outside the circle neither reads nor changes them');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000007');
SELECT pg_temp.ok(pg_temp.visible(:'risk')=0 AND (SELECT count(*)=0 FROM sw_risks WHERE workspace_id=:'wa') AND (SELECT count(*)=0 FROM sw_actions WHERE workspace_id=:'wa'),'another workspace reaches nothing');

-- ---------------------------------------------------------------------------
-- The scope is persisted: links, client fields and revision cannot shed it
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
DELETE FROM sw_mission_links WHERE mission_id=:'rm' AND target_id=:'risk';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_risks WHERE id=:'risk'),'removing the mission link leaves the risk need-to-know');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('UPDATE sw_risks SET access_mission_id=NULL WHERE id=%L',:'risk'),'23514','the scope cannot be cleared');
SELECT pg_temp.fail(format('UPDATE sw_actions SET access_mission_id=%L WHERE id=%L',:'om',:'later'),'23514','the scope cannot be moved to an open mission');
SELECT pg_temp.fail(format('UPDATE sw_risks SET assessment_id=gen_random_uuid() WHERE id=%L',:'risk'),'23514','a scoped risk cannot join an assessment, whose revision would copy it unscoped');
INSERT INTO sw_actions(workspace_id,source_kind,title) VALUES(:'wa','manual','Ordinary action') RETURNING id AS loose \gset
SELECT pg_temp.fail(format('UPDATE sw_actions SET risk_id=%L WHERE id=%L',:'risk',:'loose'),'23514','an ordinary action cannot be moved under a scoped risk');
SELECT pg_temp.fail(format('INSERT INTO sw_actions(workspace_id,risk_id,source_kind,title,access_mission_id) VALUES(%L,%L,''risk'',''Escapee'',%L)',:'wa',:'risk',:'om'),'23514','an action cannot take a different scope than its risk');
-- The assistant's results are workspace-readable: a scoped record is never its context.
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,gen_random_uuid(),''5c000000-0000-4000-8000-000000000040'',%L)',:'wa',
  jsonb_build_object('kind','risk_review','capability','risk_review','contextKind','risk','contextId',:'risk','requestText','Review','language','sv','promptVersion','t','decisionRequired',true,'context','{}'::jsonb,'sources','[]'::jsonb)),'42501','the assistant refuses a scoped risk as context');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,gen_random_uuid(),''5c000000-0000-4000-8000-000000000040'',%L)',:'wa',
  jsonb_build_object('kind','workspace_summary','capability','workspace_summary','contextKind','workspace','contextId','','requestText','Summarise','language','sv','promptVersion','t','decisionRequired',false,'context','{}'::jsonb,'sources',jsonb_build_array(jsonb_build_object('table','sw_actions','id',:'later')))),'42501','the assistant refuses a scoped action among its sources');

-- ---------------------------------------------------------------------------
-- Membership is live; open missions and ordinary records are unchanged
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
SELECT sw_set_mission_member(:'wa',:'rm','5c000000-0000-4000-8000-000000000006',false);
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000006');
SELECT pg_temp.ok(pg_temp.visible(:'risk')=0,'removing a member from the circle removes their access to the derived records');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
INSERT INTO sw_change_briefs(workspace_id,title,mission_id,what_changed,why_it_matters,evidence_item_ids) VALUES
 (:'wa','Road works',:'om','Lane closed','Deliveries slower',ARRAY[:'item'::uuid]) RETURNING id AS obrief \gset
UPDATE sw_change_briefs SET status='in_review' WHERE id=:'obrief';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
UPDATE sw_change_briefs SET status='approved' WHERE id=:'obrief';
SELECT version AS obv FROM sw_change_briefs WHERE id=:'obrief' \gset
SELECT (sw_apply_change_brief(:'wa',:'obrief',:obv,gen_random_uuid(),'{"risk":{"title":"Slower deliveries"},"actions":[{"title":"Plan routes"}]}')).risk_id AS orisk \gset
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_risks WHERE id=:'orisk') AND pg_temp.changed(format('UPDATE sw_risks SET description=''Checked'' WHERE id=%L',:'orisk'))=1,'a risk from an open mission stays readable and workable by every editor');
INSERT INTO sw_risks(workspace_id,title) VALUES(:'wa','Ordinary risk') RETURNING id AS plain \gset
INSERT INTO sw_actions(workspace_id,risk_id,source_kind,title) VALUES(:'wa',:'plain','risk','Ordinary follow-up') RETURNING id AS plain_action \gset
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((SELECT access_mission_id IS NULL FROM sw_risks WHERE id=:'plain') AND (SELECT count(*)=1 FROM sw_actions WHERE id=:'plain_action'),'ordinary records stay workspace-wide');

-- ---------------------------------------------------------------------------
-- Mission review: accepting is an approval
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
INSERT INTO sw_missions(workspace_id,kind,title,brief) VALUES(:'wa','risk_assessment','Site risk','{"decision":"Budget"}') RETURNING id AS rv \gset
UPDATE sw_missions SET execution_state='ready' WHERE id=:'rv';
UPDATE sw_missions SET execution_state='needs_review', review_state='in_review' WHERE id=:'rv';
SELECT pg_temp.fail(format('UPDATE sw_missions SET review_state=''accepted'' WHERE id=%L',:'rv'),'42501','an editor without approval rights cannot accept a mission review');
SELECT pg_temp.fail(format('UPDATE sw_missions SET review_state=''accepted'', execution_state=''completed'' WHERE id=%L',:'rv'),'42501','nor accept and complete in one step');
UPDATE sw_missions SET review_accepted_by='5c000000-0000-4000-8000-000000000003', review_accepted_at=now() WHERE id=:'rv';
SELECT pg_temp.ok((SELECT review_state='in_review' AND review_accepted_by IS NULL FROM sw_missions WHERE id=:'rv'),'the acceptance stamp cannot be written by a client');
SELECT pg_temp.fail(format('UPDATE sw_missions SET execution_state=''completed'' WHERE id=%L',:'rv'),'23514','a mission cannot be completed without an accepted review');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000006');
SELECT pg_temp.ok(pg_temp.changed(format('UPDATE sw_missions SET review_state=''accepted'' WHERE id=%L',:'rv'))=0,'a viewer cannot accept a review');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
UPDATE sw_missions SET review_state='accepted' WHERE id=:'rv';
SELECT pg_temp.ok((SELECT review_state='accepted' AND review_accepted_by='5c000000-0000-4000-8000-000000000002' AND review_accepted_at IS NOT NULL FROM sw_missions WHERE id=:'rv'),'an approver accepts; the database stamps who and when');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
UPDATE sw_missions SET brief='{"decision":"Budget","scope":"Rewritten after acceptance"}' WHERE id=:'rv';
SELECT pg_temp.ok((SELECT review_state='changes_requested' AND review_accepted_by IS NULL FROM sw_missions WHERE id=:'rv'),'changing the reviewed brief withdraws the acceptance');
SELECT pg_temp.fail(format('UPDATE sw_missions SET execution_state=''completed'' WHERE id=%L',:'rv'),'23514','a withdrawn acceptance does not complete the mission');
UPDATE sw_missions SET review_state='in_review' WHERE id=:'rv';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
UPDATE sw_missions SET review_state='accepted' WHERE id=:'rv';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
UPDATE sw_missions SET execution_state='completed' WHERE id=:'rv';
SELECT pg_temp.ok((SELECT execution_state='completed' AND review_accepted_by='5c000000-0000-4000-8000-000000000002' FROM sw_missions WHERE id=:'rv'),'after an approver''s acceptance the editor completes the mission');
-- Restricted: an approver outside the circle reaches nothing to accept.
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
UPDATE sw_missions SET execution_state='ready' WHERE id=:'rm';
UPDATE sw_missions SET execution_state='needs_review', review_state='in_review' WHERE id=:'rm';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok(pg_temp.changed(format('UPDATE sw_missions SET review_state=''accepted'' WHERE id=%L',:'rm'))=0,'an approving owner outside a restricted mission cannot accept its review');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('UPDATE sw_missions SET review_state=''accepted'' WHERE id=%L',:'rm'),'42501','a circle editor without approval rights cannot accept it either');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
UPDATE sw_missions SET review_state='accepted' WHERE id=:'rm';
SELECT pg_temp.ok((SELECT review_accepted_by='5c000000-0000-4000-8000-000000000002' FROM sw_missions WHERE id=:'rm'),'an approver in the circle accepts it');
-- ---------------------------------------------------------------------------
-- History keeps the scope it was written with: links, assets, controls and a
-- deleted citation never fall back to the workspace
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
INSERT INTO sw_citations(workspace_id,risk_id,source_item_id,claim,excerpt) VALUES(:'wa',:'risk',:'item','CONFIDENTIAL claim','key supplier may be insolvent') RETURNING id AS cit \gset
DELETE FROM sw_citations WHERE id=:'cit';
INSERT INTO sw_evidence_links(workspace_id,source_id,target_kind,target_id) VALUES(:'wa',:'src','action',:'later') RETURNING id AS alink \gset
DELETE FROM sw_evidence_links WHERE id=:'alink';
RESET ROLE;
CREATE TEMP TABLE rrc_children ON COMMIT DROP AS
  SELECT id FROM sw_risk_assets WHERE risk_id=:'risk'
  UNION ALL SELECT id FROM sw_controls WHERE risk_id=:'risk'
  UNION ALL SELECT id FROM sw_evidence_links WHERE target_id=:'risk' OR target_id IN (SELECT id FROM sw_actions WHERE risk_id=:'risk')
  UNION ALL SELECT :'cit'::uuid UNION ALL SELECT :'alink'::uuid;
GRANT SELECT ON rrc_children TO authenticated;
SELECT count(*) AS child_events FROM sw_audit_events e JOIN rrc_children c ON c.id=e.entity_id \gset
SELECT pg_temp.ok(:child_events>=7 AND (SELECT count(*)>=3 FROM sw_audit_events e JOIN rrc_children c ON c.id=e.entity_id WHERE e.entity_table IN ('sw_evidence_links','sw_risk_assets'))
  AND (SELECT count(*)=2 FROM sw_audit_events WHERE entity_id=:'cit'),'fixture: the restricted record''s links, asset link, control and deleted citation have history');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_audit_events e JOIN rrc_children c ON c.id=e.entity_id),'an editor outside the circle reads no history of the restricted record''s links, assets, controls or deleted citation');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_audit_events e JOIN rrc_children c ON c.id=e.entity_id),'a viewer outside the circle reads none of that history');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_audit_events e JOIN rrc_children c ON c.id=e.entity_id),'a workspace owner outside the circle reads none of that history');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((SELECT count(*)=:child_events FROM sw_audit_events e JOIN rrc_children c ON c.id=e.entity_id),'the circle keeps the whole history, the deleted citation''s included');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
INSERT INTO sw_evidence_links(workspace_id,source_id,target_kind,target_id) VALUES(:'wa',:'src','risk',:'plain') RETURNING id AS plink \gset
DELETE FROM sw_evidence_links WHERE id=:'plink';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_audit_events WHERE entity_id=:'plink') AND (SELECT count(*)>=1 FROM sw_audit_events WHERE entity_id=:'plain'),'ordinary history stays workspace-readable, a deleted link''s included');

-- ---------------------------------------------------------------------------
-- An open mission's work is ordinary work: reports and the assistant use it.
-- Restricting the mission later takes the copies into the circle with it.
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
INSERT INTO sw_management_reports(workspace_id,title,language,facts,computed,narrative,mission_scope) VALUES(:'wa','Status','sv',
  jsonb_build_object('risks',jsonb_build_array(jsonb_build_object('id',:'orisk'),jsonb_build_object('id',:'plain')),'actions','[]'::jsonb),'{}','{}','{}') RETURNING id AS rep \gset
SELECT pg_temp.ok((SELECT mission_scope=ARRAY[:'om'::uuid] FROM sw_management_reports WHERE id=:'rep'),'an open mission''s risk enters a workspace report, which records the mission it drew on');
UPDATE sw_management_reports SET mission_scope='{}', title='Status Q1' WHERE id=:'rep';
SELECT pg_temp.ok((SELECT mission_scope=ARRAY[:'om'::uuid] AND title='Status Q1' FROM sw_management_reports WHERE id=:'rep'),'the report''s mission list is the database''s, not the client''s');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_management_reports WHERE id=:'rep'),'a viewer outside every circle reads the open-mission report');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('INSERT INTO sw_management_reports(workspace_id,title,language,facts,computed,narrative) VALUES(%L,''Leak'',''sv'',%L,''{}'',''{}'')',:'wa',
  jsonb_build_object('risks',jsonb_build_array(jsonb_build_object('id',:'risk')))),'42501','a restricted mission''s risk never enters a workspace report, not even from inside the circle');
SELECT pg_temp.fail(format('UPDATE sw_management_reports SET facts=%L WHERE id=%L',jsonb_build_object('actions',jsonb_build_array(jsonb_build_object('id',:'later'))),:'rep'),'42501','nor is it added to an existing report');
-- The assistant: an open mission's risk is context; a restricted one is not.
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
SELECT pg_temp.produce(:'wa','5c000000-0000-4000-8000-0000000000c1',pg_temp.manifest('risk_scenario','risk',:'orisk','Describe'),'{"threat_scenario":"Scenario","description":"Description","missing_information":[],"questions":[]}') AS osug \gset
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_processing_jobs WHERE id=:'osug') AND (SELECT count(*)=1 FROM sw_ai_suggestions WHERE id=:'osug'),'the assistant works on an open mission''s risk and the workspace reads the result');
-- The mission's creator restricts it: the records and every copy follow.
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
UPDATE sw_missions SET restricted=true WHERE id=:'om';
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_risks WHERE id=:'orisk') AND (SELECT count(*)=0 FROM sw_management_reports WHERE id=:'rep')
  AND (SELECT count(*)=0 FROM sw_processing_jobs WHERE id=:'osug') AND (SELECT count(*)=0 FROM sw_ai_suggestions WHERE id=:'osug')
  AND (SELECT count(*)=0 FROM sw_audit_events WHERE entity_id IN (:'orisk',:'rep',:'osug')),'once the mission is restricted its records, report, assistant result and their history leave the outsiders');
SELECT pg_temp.ok(pg_temp.changed(format('UPDATE sw_management_reports SET title=''Outsider'' WHERE id=%L',:'rep'))=0,'an outside editor cannot change that report any more');
SELECT pg_temp.fail(format('SELECT sw_reserve_assistant(%L,gen_random_uuid(),''5c000000-0000-4000-8000-000000000040'',%L)',:'wa',pg_temp.manifest('report_narrative','management_report',:'rep','Draft')),'42501','the assistant refuses a report that drew on a now-restricted mission');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_management_reports WHERE id=:'rep') AND (SELECT count(*)=1 FROM sw_ai_suggestions WHERE id=:'osug'),'the mission''s circle keeps the report and the assistant result');
SELECT sw_set_mission_member(:'wa',:'om','5c000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_management_reports WHERE id=:'rep'),'a member added to the circle reads the report');
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000002');
SELECT sw_set_mission_member(:'wa',:'om','5c000000-0000-4000-8000-000000000005',false);
SELECT pg_temp.login('5c000000-0000-4000-8000-000000000005');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_management_reports WHERE id=:'rep') AND (SELECT count(*)=0 FROM sw_ai_suggestions WHERE id=:'osug'),'removing the member removes the report and the assistant result');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_risks WHERE id=:'plain'),'ordinary records are untouched by all of this');

RESET ROLE;

\if :{?sw_restricted_keep_fixture}
\else
ROLLBACK;
\endif
