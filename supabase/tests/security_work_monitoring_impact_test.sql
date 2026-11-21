-- Security Work Release B (20270328090000): permitted source -> signed fetch ->
-- story cluster -> impact brief -> review -> risk/actions -> review flags.
-- Real roles, synthetic data, rolled back unless sw_monitoring_keep_fixture.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok  SW-MON %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE; IF state<>code THEN RAISE EXCEPTION '% expected %, got % (%)',label,code,state,SQLERRM; END IF; RAISE NOTICE 'ok  SW-MON %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',coalesce(u,''),true);PERFORM set_config('request.jwt.claims',CASE WHEN u IS NULL THEN '{}' ELSE jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text END,true); END $$;
CREATE OR REPLACE FUNCTION pg_temp.sign(_run uuid,_source uuid,_payload text) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT sw_private.receipt_mac('fetch'||E'\n'||_run::text||E'\n'||_source::text||E'\n'||sw_private.hash_text(_payload),repeat('synthetic-only-',4)) $$;
CREATE OR REPLACE FUNCTION pg_temp.item(_guid text,_title text,_text text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('guid',_guid,'title',_title,'url','https://feeds.example.test/'||_guid,'publishedAt','2026-11-20T10:00:00Z','text',_text,'contentHash',encode(sha256(convert_to(_text,'UTF8')),'hex')) $$;
CREATE OR REPLACE FUNCTION pg_temp.fetch(_w uuid,_run uuid,_source uuid,_payload jsonb) RETURNS public.sw_fetch_runs LANGUAGE sql AS $$
  SELECT public.sw_record_fetch(_w,_run,_source,'synthetic-test-key',_payload::text,pg_temp.sign(_run,_source,_payload::text)) $$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('5a000000-0000-4000-8000-000000000001','mon-approver@example.test',now()),
 ('5a000000-0000-4000-8000-000000000002','mon-editor@example.test',now()),
 ('5a000000-0000-4000-8000-000000000003','mon-viewer@example.test',now()),
 ('5a000000-0000-4000-8000-000000000004','mon-owner-b@example.test',now());
INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '5a000000-%';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000001');
SELECT sw_create_personal_workspace('Monitoring workspace A') AS wa \gset
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000004');
SELECT sw_create_personal_workspace('Monitoring workspace B') AS wb \gset
INSERT INTO sw_sources(workspace_id,name) VALUES(:'wb','B manual') RETURNING id AS bsource \gset
INSERT INTO sw_source_items(workspace_id,source_id,deduplication_key,original_title,factual_extract) VALUES(:'wb',:'bsource','b1','B item','B text') RETURNING id AS bitem \gset
RESET ROLE;
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000001');
INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
 (:'wa','5a000000-0000-4000-8000-000000000002','editor',false),
 (:'wa','5a000000-0000-4000-8000-000000000003','viewer',false);
INSERT INTO sw_private.worker_keys(key_id,secret) SELECT 'synthetic-test-key',repeat('synthetic-only-',4) WHERE NOT EXISTS (SELECT 1 FROM sw_private.worker_keys WHERE key_id='synthetic-test-key');

-- ---------------------------------------------------------------------------
-- Surface
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok((SELECT bool_and(relrowsecurity) AND count(*)=7 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sw_feed_hosts','sw_fetch_runs','sw_story_clusters','sw_cluster_items','sw_change_briefs','sw_review_flags','sw_change_brief_applications')),'seven new tables, all with RLS');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_class c, unnest(ARRAY['anon','service_role']) r WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('sw_feed_hosts','sw_fetch_runs','sw_story_clusters','sw_cluster_items','sw_change_briefs','sw_review_flags','sw_change_brief_applications') AND has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),'anon and service_role hold no privilege on them');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.sw_feed_hosts','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','public.sw_fetch_runs','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','public.sw_change_brief_applications','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','public.sw_story_clusters','INSERT,UPDATE,DELETE'),'hosts, runs, clusters and applications have no client write');
SELECT pg_temp.ok(has_function_privilege('authenticated','public.sw_record_fetch(uuid,uuid,uuid,text,text,text)','EXECUTE') AND has_function_privilege('authenticated','public.sw_apply_change_brief(uuid,uuid,integer,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.sw_record_fetch(uuid,uuid,uuid,text,text,text)','EXECUTE') AND NOT has_function_privilege('anon','public.sw_apply_change_brief(uuid,uuid,integer,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.sw_record_fetch(uuid,uuid,uuid,text,text,text)','EXECUTE') AND NOT has_function_privilege('authenticated','sw_private.guard_change_brief()','EXECUTE'),'the two RPCs are for authenticated only; trigger functions for nobody');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_feed_hosts),'the migration approves no feed host');

-- ---------------------------------------------------------------------------
-- Permitted sources and protected health
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('INSERT INTO sw_sources(workspace_id,name,publisher,source_type,feed_url) VALUES(%L,''Unapproved'',''X'',''official_feed'',''https://feeds.example.test/rss'')',:'wa'),'23514','an official feed on an unapproved host is refused');
RESET ROLE;
INSERT INTO sw_feed_hosts(host,publisher,terms_reference,approval_note) VALUES
 ('feeds.example.test','Synthetic Authority','Synthetic open licence','Synthetic approval for tests'),
 ('other.example.test','Synthetic Wire','Synthetic open licence','Synthetic approval for tests'),
 ('retired.example.test','Retired','Synthetic','Synthetic');
UPDATE sw_feed_hosts SET active=false WHERE host='retired.example.test';
SET LOCAL ROLE authenticated;
SELECT pg_temp.fail(format('INSERT INTO sw_sources(workspace_id,name,publisher,source_type,feed_url) VALUES(%L,''Retired'',''X'',''official_feed'',''https://retired.example.test/rss'')',:'wa'),'23514','an inactive host is not permitted');
SELECT pg_temp.fail(format('INSERT INTO sw_sources(workspace_id,name,publisher,source_type,feed_url) VALUES(%L,''Plain'',''X'',''official_feed'',''http://feeds.example.test/rss'')',:'wa'),'23514','a feed must be https');
INSERT INTO sw_sources(workspace_id,name,publisher,source_type,feed_url,reliability_category,poll_target_minutes) VALUES(:'wa','Authority feed','Synthetic Authority','official_feed','https://feeds.example.test/rss','official',60) RETURNING id AS feed \gset
INSERT INTO sw_sources(workspace_id,name,publisher,source_type,feed_url) VALUES(:'wa','Wire feed','Synthetic Wire','official_feed','https://other.example.test/rss') RETURNING id AS wire \gset
SELECT pg_temp.fail(format('UPDATE sw_sources SET last_success_at=now() WHERE id=%L',:'feed'),'42501','nobody can claim coverage by writing source health');
SELECT pg_temp.fail(format('INSERT INTO sw_sources(workspace_id,name,last_success_at) VALUES(%L,''Forged'',now())',:'wa'),'42501','a new source cannot be born healthy');
SELECT pg_temp.fail(format('INSERT INTO sw_source_items(workspace_id,source_id,deduplication_key,original_title,factual_extract,retrieval_status) VALUES(%L,%L,''f'',''Forged'',''Forged'',''fetched'')',:'wa',:'feed'),'42501','a client cannot forge a fetched item');
SELECT pg_temp.fail(format('INSERT INTO sw_source_items(workspace_id,source_id,deduplication_key,original_title,factual_extract,content_hash) VALUES(%L,%L,''f2'',''Forged'',''Forged'',repeat(''a'',64))',:'wa',:'feed'),'42501','a client cannot forge a content hash');

-- ---------------------------------------------------------------------------
-- Signed fetch runs
-- ---------------------------------------------------------------------------
SELECT jsonb_build_object('status','succeeded','httpStatus',200,'etag','"v1"','items',jsonb_build_array(
  pg_temp.item('g1','Road closed near Terminal Gothenburg','The E6 is closed near the terminal after an incident.'),
  pg_temp.item('g2','Power outage in district','Grid operator reports outage.'))) AS p1 \gset
SELECT pg_temp.fail(format('SELECT sw_record_fetch(%L,gen_random_uuid(),%L,''synthetic-test-key'',%L,repeat(''0'',64))',:'wa',:'feed',:'p1'),'42501','an unsigned fetch receipt is refused');
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT pg_temp.fetch(%L,gen_random_uuid(),%L,%L::jsonb)',:'wa',:'feed',:'p1'),'42501','a viewer cannot record a fetch');
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000002');
SELECT (pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a1',:'feed',:'p1')).items_new AS n1 \gset
SELECT pg_temp.ok(:n1=2 AND (SELECT count(*)=2 FROM sw_source_items WHERE source_id=:'feed' AND retrieval_status='fetched' AND content_hash IS NOT NULL),'a signed run stores new items as fetched, with their hash');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_intelligence_items i JOIN sw_source_items s ON s.id=i.source_item_id WHERE s.source_id=:'feed' AND i.status='pending'),'new items are queued for human triage');
SELECT pg_temp.ok((SELECT last_success_at IS NOT NULL AND last_checked_at IS NOT NULL AND feed_etag='"v1"' FROM sw_sources WHERE id=:'feed'),'a successful run records health and the validator');
SELECT pg_temp.ok((pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a1',:'feed',:'p1')).items_new=2 AND (SELECT count(*)=1 FROM sw_fetch_runs WHERE id='5a000000-0000-4000-8000-0000000000a1'),'a retried receipt returns the same run and stores nothing twice');
SELECT pg_temp.fail(format('SELECT pg_temp.fetch(%L,''5a000000-0000-4000-8000-0000000000a1'',%L,''{"status":"not_modified"}''::jsonb)',:'wa',:'feed'),'23514','the same run id with a different payload is refused');
SELECT pg_temp.ok((pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a2',:'feed',:'p1')).items_new=0,'an item already stored is not stored again');
-- The same story copied by another publisher is not independent corroboration.
SELECT jsonb_build_object('status','succeeded','httpStatus',200,'items',jsonb_build_array(
  pg_temp.item('w1','Road closed near Terminal Gothenburg!','The E6 is closed near the terminal after an incident.'))) AS pcopy \gset
SELECT (pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a3',:'wire',:'pcopy')).id IS NOT NULL AS r3 \gset
SELECT id AS cluster FROM sw_story_clusters WHERE workspace_id=:'wa' AND title LIKE 'Road closed%' ORDER BY first_seen_at LIMIT 1 \gset
SELECT pg_temp.ok((SELECT item_count=2 AND independent_sources=1 AND has_copies FROM sw_story_clusters WHERE id=:'cluster'),'a copied story joins its cluster without adding an independent source');
SELECT jsonb_build_object('status','succeeded','httpStatus',200,'items',jsonb_build_array(
  pg_temp.item('w2','Road closed near terminal Gothenburg','Police confirm a lorry fire closed the E6 for hours.'))) AS pindep \gset
SELECT (pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a4',:'wire',:'pindep')).id IS NOT NULL AS r4 \gset
SELECT pg_temp.ok((SELECT item_count=3 AND independent_sources=2 FROM sw_story_clusters WHERE id=:'cluster'),'different text from another publisher is a second independent source');
SELECT (pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a5',:'feed','{"status":"failed","httpStatus":503,"errorCode":"upstream_503"}'::jsonb)).status AS failed \gset
SELECT pg_temp.ok(:'failed'='failed' AND (SELECT last_failure='upstream_503' AND last_failure_at IS NOT NULL AND (SELECT status='failed' AND error_code='upstream_503' AND items_new=0 FROM sw_fetch_runs WHERE id='5a000000-0000-4000-8000-0000000000a5') FROM sw_sources WHERE id=:'feed'),'a failed run is recorded as a coverage failure, not as quiet');
SELECT (pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a6',:'feed','{"status":"not_modified","httpStatus":304}'::jsonb)).items_new AS n6 \gset
SELECT pg_temp.ok(:n6=0 AND (SELECT last_failure IS NULL FROM sw_sources WHERE id=:'feed'),'not-modified is a successful check that adds nothing');
RESET ROLE;
UPDATE sw_feed_hosts SET active=false WHERE host='other.example.test';
SET LOCAL ROLE authenticated;
SELECT pg_temp.fail(format('SELECT pg_temp.fetch(%L,gen_random_uuid(),%L,''{"status":"not_modified"}''::jsonb)',:'wa',:'wire'),'42501','withdrawing a host stops its fetches');

-- ---------------------------------------------------------------------------
-- Impact briefs
-- ---------------------------------------------------------------------------
SELECT id AS item1 FROM sw_source_items WHERE source_id=:'feed' AND deduplication_key LIKE 'feed:%' AND original_title LIKE 'Road closed%' \gset
INSERT INTO sw_change_briefs(workspace_id,title,cluster_id,what_changed,evidence_item_ids,evidence) VALUES
 (:'wa','E6 closure affects the Gothenburg terminal',:'cluster','The E6 is closed near the terminal.',ARRAY[:'item1'::uuid,:'item1'::uuid],'[{"title":"forged"}]') RETURNING id AS brief \gset
SELECT pg_temp.ok((SELECT jsonb_array_length(evidence)=1 AND evidence->0->>'title' LIKE 'Road closed%' AND evidence->0->>'publisher'='Synthetic Authority' AND evidence->0->>'retrievalStatus'='fetched' AND evidence->0 ? 'retrievedAt' AND cardinality(evidence_item_ids)=1 FROM sw_change_briefs WHERE id=:'brief'),'evidence is built by the database from the cited item; a supplied one is discarded');
SELECT pg_temp.fail(format('INSERT INTO sw_change_briefs(workspace_id,title,evidence_item_ids) VALUES(%L,''x'',ARRAY[%L::uuid])',:'wa',:'bitem'),'23514','another workspace''s item cannot be cited');
SELECT pg_temp.fail(format('INSERT INTO sw_change_briefs(workspace_id,title,evidence_item_ids) VALUES(%L,''x'',ARRAY[gen_random_uuid()])',:'wa'),'23514','a missing item cannot be cited');
SELECT pg_temp.fail(format('INSERT INTO sw_change_briefs(workspace_id,title,status) VALUES(%L,''x'',''approved'')',:'wa'),'23514','a brief starts as a draft');
INSERT INTO sw_missions(workspace_id,kind,title) VALUES(:'wa','risk_assessment','Not monitoring') RETURNING id AS rmission \gset
SELECT pg_temp.fail(format('INSERT INTO sw_change_briefs(workspace_id,title,mission_id) VALUES(%L,''x'',%L)',:'wa',:'rmission'),'23514','a brief belongs to a monitoring mission');
INSERT INTO sw_missions(workspace_id,kind,title,restricted) VALUES(:'wa','monitoring_impact','Restricted monitoring',true) RETURNING id AS mmission \gset
UPDATE sw_change_briefs SET mission_id=:'mmission', why_it_matters='The terminal depends on the E6 for 80% of departures.', known='Closure confirmed by the authority.', uncertain='Duration unknown.', proposed_actions='[{"title":"Re-route departures"}]' WHERE id=:'brief';
UPDATE sw_change_briefs SET status='in_review' WHERE id=:'brief';
SELECT pg_temp.ok((SELECT submitted_by='5a000000-0000-4000-8000-000000000002' AND submitted_at IS NOT NULL FROM sw_change_briefs WHERE id=:'brief'),'submission is stamped by the database');
SELECT pg_temp.fail(format('UPDATE sw_change_briefs SET why_it_matters=''changed'' WHERE id=%L',:'brief'),'23514','content under review is frozen');
SELECT pg_temp.fail(format('UPDATE sw_change_briefs SET status=''approved'' WHERE id=%L',:'brief'),'42501','an editor cannot approve an impact brief');
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_change_briefs WHERE id=:'brief'),'a brief in a restricted mission is invisible outside its circle');
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_change_briefs WHERE id=:'brief'),'need-to-know holds for briefs even for the workspace owner');
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000002');
SELECT sw_set_mission_member(:'wa',:'mmission','5a000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('UPDATE sw_change_briefs SET status=''approved'', why_it_matters=''rewritten at approval'' WHERE id=%L',:'brief'),'23514','an approval cannot change what was submitted');
UPDATE sw_change_briefs SET status='approved', decision_note='Reviewed' WHERE id=:'brief';
SELECT pg_temp.ok((SELECT status='approved' AND approved_by='5a000000-0000-4000-8000-000000000001' AND approved_at IS NOT NULL FROM sw_change_briefs WHERE id=:'brief'),'an approver in the circle approves; the stamp is the database''s');
SELECT pg_temp.fail(format('UPDATE sw_change_briefs SET title=''rewritten'' WHERE id=%L',:'brief'),'23514','an approved brief is immutable');
INSERT INTO sw_change_briefs(workspace_id,title,what_changed,evidence_item_ids) VALUES(:'wa','Incomplete','Something changed',ARRAY[:'item1'::uuid]) RETURNING id AS incomplete \gset
UPDATE sw_change_briefs SET status='in_review' WHERE id=:'incomplete';
SELECT pg_temp.fail(format('UPDATE sw_change_briefs SET status=''approved'' WHERE id=%L',:'incomplete'),'23514','a brief without why it matters cannot be approved');
SELECT pg_temp.fail(format('UPDATE sw_change_briefs SET status=''rejected'' WHERE id=%L',:'incomplete'),'23514','a rejection needs a note');

-- ---------------------------------------------------------------------------
-- From the approved brief to risk and actions, once
-- ---------------------------------------------------------------------------
SELECT version AS bv FROM sw_change_briefs WHERE id=:'brief' \gset
SELECT pg_temp.fail(format('SELECT sw_apply_change_brief(%L,%L,1,gen_random_uuid(),%L)',:'wa',:'incomplete','{"actions":[{"title":"x"}]}'),'PT409','an unapproved brief cannot be applied');
SELECT pg_temp.fail(format('SELECT sw_apply_change_brief(%L,%L,%s,gen_random_uuid(),%L)',:'wa',:'brief',:bv,'{"risk":{"title":"E6 disruption"},"actions":[{"title":"Re-route","priority":"critical"}]}'),'23514','a failing action leaves nothing behind');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_risks WHERE workspace_id=:'wa' AND source_kind='monitoring') AND (SELECT count(*)=0 FROM sw_change_brief_applications WHERE brief_id=:'brief'),'after the failure no risk and no receipt exist');
SELECT '{"risk":{"title":"Transport disruption at the Gothenburg terminal","description":"E6 closure","threatScenario":"Prolonged closure of the main access road"},"actions":[{"title":"Re-route departures","priority":"high","dueDate":"2026-12-01"},{"title":"Inform customers"}]}' AS apply \gset
SELECT (sw_apply_change_brief(:'wa',:'brief',:bv,'5a000000-0000-4000-8000-0000000000b1',:'apply')).risk_id AS risk \gset
SELECT pg_temp.ok((SELECT source_kind='monitoring' AND status='proposed' AND likelihood IS NULL AND created_by='5a000000-0000-4000-8000-000000000001' FROM sw_risks WHERE id=:'risk'),'the risk is created as the approver, unrated and proposed');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_actions WHERE risk_id=:'risk' AND status='open') AND (SELECT count(*)=1 FROM sw_actions WHERE risk_id=:'risk' AND due_date='2026-12-01' AND priority='high'),'the actions are created and linked to the risk');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_evidence_links WHERE target_kind='risk' AND target_id=:'risk' AND source_id=:'feed') AND (SELECT count(*)=3 FROM sw_mission_links WHERE mission_id=:'mmission'),'the risk cites its source and the mission links risk and actions');
SELECT pg_temp.ok((sw_apply_change_brief(:'wa',:'brief',:bv,'5a000000-0000-4000-8000-0000000000b1',:'apply')).risk_id=:'risk' AND (SELECT count(*)=1 FROM sw_risks WHERE workspace_id=:'wa' AND source_kind='monitoring'),'a retry returns the receipt and creates nothing');
SELECT pg_temp.fail(format('SELECT sw_apply_change_brief(%L,%L,%s,gen_random_uuid(),%L)',:'wa',:'brief',:bv,:'apply'),'PT409','a brief is applied once');

-- ---------------------------------------------------------------------------
-- New evidence flags the approved brief; a revision supersedes it
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000002');
SELECT jsonb_build_object('status','succeeded','httpStatus',200,'items',jsonb_build_array(
  pg_temp.item('g3','Road closed near Terminal Gothenburg - update','Authority now expects the E6 to reopen tomorrow.'))) AS pnew \gset
SELECT (pg_temp.fetch(:'wa','5a000000-0000-4000-8000-0000000000a7',:'feed',:'pnew')).items_new AS n7 \gset
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_review_flags WHERE brief_id=:'brief' AND status='open'),'new evidence in a cited story raises a review flag');
SELECT pg_temp.ok((SELECT status='approved' AND title='E6 closure affects the Gothenburg terminal' FROM sw_change_briefs WHERE id=:'brief'),'the approved brief itself is unchanged');
SELECT id AS flag FROM sw_review_flags WHERE brief_id=:'brief' \gset
SELECT pg_temp.fail(format('UPDATE sw_review_flags SET status=''resolved'' WHERE id=%L',:'flag'),'23514','resolving a flag needs a note');
SELECT id AS item3 FROM sw_source_items WHERE source_id=:'feed' AND original_title LIKE '%update' \gset
INSERT INTO sw_change_briefs(workspace_id,title,mission_id,supersedes_id,what_changed,why_it_matters,evidence_item_ids) VALUES
 (:'wa','E6 closure: expected to reopen',:'mmission',:'brief','Reopening expected tomorrow.','Departures can resume.',ARRAY[:'item1'::uuid,:'item3'::uuid]) RETURNING id AS revision \gset
SELECT pg_temp.fail(format('INSERT INTO sw_change_briefs(workspace_id,title,supersedes_id) VALUES(%L,''Second open revision'',%L)',:'wa',:'brief'),'23505','one open revision at a time');
UPDATE sw_change_briefs SET status='in_review' WHERE id=:'revision';
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000001');
UPDATE sw_change_briefs SET status='approved' WHERE id=:'revision';
SELECT pg_temp.ok((SELECT status='superseded' FROM sw_change_briefs WHERE id=:'brief') AND (SELECT status='resolved' FROM sw_review_flags WHERE id=:'flag'),'approving the revision supersedes the old brief and resolves its flag');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_change_brief_applications WHERE brief_id=:'brief'),'the old brief''s application stays on record');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('5a000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_fetch_runs WHERE workspace_id=:'wa') AND (SELECT count(*)=0 FROM sw_story_clusters WHERE workspace_id=:'wa') AND (SELECT count(*)=0 FROM sw_change_briefs WHERE workspace_id=:'wa') AND (SELECT count(*)=0 FROM sw_review_flags WHERE workspace_id=:'wa'),'another workspace sees no runs, clusters, briefs or flags');
SELECT pg_temp.fail(format('SELECT pg_temp.fetch(%L,gen_random_uuid(),%L,''{"status":"not_modified"}''::jsonb)',:'wa',:'feed'),'42501','another workspace cannot record a fetch');
RESET ROLE;

\if :{?sw_monitoring_keep_fixture}
\else
ROLLBACK;
\endif
