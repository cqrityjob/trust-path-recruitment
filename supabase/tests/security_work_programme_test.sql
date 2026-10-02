-- Security Work programme (20270111090000): workspace isolation, roles,
-- lifecycle and AI-suggestion guardrails executed as real database roles.
-- Everything is synthetic and transaction-local (rolled back at the end
-- unless sw_programme_keep_fixture is set by the rollback proof).
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok  SW-PROG %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE; IF state<>code THEN RAISE EXCEPTION '% expected %, got % (%)',label,code,state,SQLERRM; END IF; RAISE NOTICE 'ok  SW-PROG %',label; RETURN; END; RAISE EXCEPTION 'unexpected success: %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',coalesce(u,''),true);PERFORM set_config('request.jwt.claims',CASE WHEN u IS NULL THEN '{}' ELSE jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false,'session_id',u)::text END,true); END $$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('54000000-0000-4000-8000-000000000001','prog-owner-a@example.test',now()),
 ('54000000-0000-4000-8000-000000000002','prog-editor-a@example.test',now()),
 ('54000000-0000-4000-8000-000000000003','prog-viewer-a@example.test',now()),
 ('54000000-0000-4000-8000-000000000004','prog-owner-b@example.test',now()),
 ('54000000-0000-4000-8000-000000000005','prog-outsider@example.test',now());
INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '54000000-%';

SET LOCAL ROLE authenticated;
SELECT pg_temp.login('54000000-0000-4000-8000-000000000001');
SELECT sw_create_personal_workspace('Programme workspace A') AS wa \gset
SELECT pg_temp.login('54000000-0000-4000-8000-000000000004');
SELECT sw_create_personal_workspace('Programme workspace B') AS wb \gset
RESET ROLE;
-- Memberships are administered outside the application; the audit writer
-- still requires a human actor, so the owner of A performs it as superuser.
SELECT pg_temp.login('54000000-0000-4000-8000-000000000001');
INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
 (:'wa','54000000-0000-4000-8000-000000000002','editor',false),
 (:'wa','54000000-0000-4000-8000-000000000003','viewer',false);

-- ---------------------------------------------------------------------------
-- Surface: ten new tables, RLS on, no PUBLIC/anon/service privilege, helpers
-- pinned and not executable by callers.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE prog_tables(name text PRIMARY KEY);
INSERT INTO prog_tables VALUES ('sw_security_mandates'),('sw_protected_assets'),('sw_risk_assets'),('sw_baseline_assessments'),('sw_baseline_answers'),('sw_gaps'),('sw_evidence_links'),('sw_ai_suggestions'),('sw_programme_plans'),('sw_management_reports');
GRANT SELECT ON prog_tables TO PUBLIC;
SELECT pg_temp.ok((SELECT count(*) FROM prog_tables t JOIN pg_class c ON c.oid=to_regclass('public.'||t.name) WHERE c.relrowsecurity)=10,'all ten programme tables enable RLS');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM prog_tables t WHERE has_table_privilege('anon','public.'||t.name,'SELECT') OR has_table_privilege('service_role','public.'||t.name,'SELECT') OR has_table_privilege('anon','public.'||t.name,'INSERT')),'anon and service hold no programme table privilege');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='sw_private'::regnamespace AND p.proname IN ('guard_programme','guard_action_approval','guard_lifecycle') AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR NOT coalesce(p.proconfig @> ARRAY['search_path=""'],false))),'programme guards pin search_path and are not caller-executable');
SELECT pg_temp.ok((SELECT count(*) FROM pg_trigger WHERE tgname='sw_90_audit' AND tgrelid IN (SELECT to_regclass('public.'||name) FROM prog_tables))=10,'every programme table is audited');

-- ---------------------------------------------------------------------------
-- Workspace A: mandate, assets, programme risk, gap, action, baseline, plan.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('54000000-0000-4000-8000-000000000002');
INSERT INTO sw_security_mandates(workspace_id,security_mission,reporting_line,risk_acceptance_authority,review_date) VALUES(:'wa','Protect people and operations','CEO','CEO on advice of the Head of Security',current_date+365) RETURNING id AS mandate \gset
SELECT pg_temp.fail(format('INSERT INTO sw_security_mandates(workspace_id,security_mission) VALUES(%L,''second'')',:'wa'),'23505','one mandate per workspace');
INSERT INTO sw_protected_assets(workspace_id,name,category,owner_label,consequence_level) VALUES(:'wa','Head office','facilities','Facility manager',4) RETURNING id AS asset \gset
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','Customer register','information') RETURNING id AS asset2 \gset
SELECT pg_temp.fail(format('INSERT INTO sw_protected_assets(workspace_id,name,category,owner_id) VALUES(%L,''Bad owner'',''people'',%L)',:'wa','54000000-0000-4000-8000-000000000004'),'23503','asset owner must be a workspace member');
SELECT pg_temp.fail(format('INSERT INTO sw_protected_assets(workspace_id,name,category,consequence_level) VALUES(%L,''Bad level'',''people'',9)',:'wa'),'23514','consequence level stays within 1..5');

-- A programme risk needs no analysis parent and keeps the deterministic rating.
INSERT INTO sw_risks(workspace_id,title,source_kind,owner_id,likelihood,consequence,threat_scenario) VALUES(:'wa','Intrusion at head office','programme','54000000-0000-4000-8000-000000000001',3,4,'Unauthorised entry outside office hours') RETURNING id AS risk \gset
SELECT pg_temp.ok((SELECT assessment_id IS NULL AND status='proposed' AND owner_id IS NOT NULL FROM sw_risks WHERE id=:'risk'),'programme risk is proposed without an analysis');
INSERT INTO sw_risk_assets(workspace_id,risk_id,asset_id) VALUES(:'wa',:'risk',:'asset');
SELECT pg_temp.fail(format('INSERT INTO sw_risk_assets(workspace_id,risk_id,asset_id) VALUES(%L,%L,%L)',:'wa',:'risk',:'asset'),'23505','a risk links each asset once');
SELECT pg_temp.fail(format('UPDATE sw_risks SET status=''accepted'',decision_rationale=''editor guess'' WHERE id=%L',:'risk'),'42501','editor without approval right cannot accept a risk');
SELECT pg_temp.login('54000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('UPDATE sw_risks SET status=''accepted'' WHERE id=%L',:'risk'),'23514','acceptance requires a rationale');
SELECT pg_temp.fail(format('UPDATE sw_risks SET status=''accepted'',decision_rationale=''x'',accepted_by=%L WHERE id=%L','54000000-0000-4000-8000-000000000001',:'risk'),'23514','acceptance stamp cannot be supplied by the caller');
UPDATE sw_risks SET status='accepted',decision_rationale='Accepted within tolerance after review' WHERE id=:'risk';
SELECT pg_temp.ok((SELECT accepted_by='54000000-0000-4000-8000-000000000001' AND accepted_at IS NOT NULL FROM sw_risks WHERE id=:'risk'),'approver accepts a programme risk; stamp is set by the trigger');
SELECT pg_temp.fail(format('UPDATE sw_risks SET owner_id=NULL WHERE id=%L',:'risk'),'23514','accepted risk content is immutable');

-- Legacy rule unchanged: a risk under an analysis still needs an approved analysis.
INSERT INTO sw_assessments(workspace_id,title,analysis_type,method_version_id) VALUES(:'wa','Legacy analysis','monitoring','monitoring-v1') RETURNING id AS analysis \gset
INSERT INTO sw_risks(workspace_id,assessment_id,title,likelihood,consequence) VALUES(:'wa',:'analysis','Analysis risk',2,2) RETURNING id AS arisk \gset
SELECT pg_temp.fail(format('UPDATE sw_risks SET status=''accepted'',decision_rationale=''too early'' WHERE id=%L',:'arisk'),'23514','analysis risk still requires an approved analysis');

-- Gaps and actions: a gap never creates an action; actions may stand alone.
SELECT pg_temp.login('54000000-0000-4000-8000-000000000002');
INSERT INTO sw_baseline_assessments(workspace_id,content_version,market) VALUES(:'wa','baseline-v1','se') RETURNING id AS baseline \gset
SELECT pg_temp.fail(format('INSERT INTO sw_baseline_assessments(workspace_id,content_version,market) VALUES(%L,''baseline-v1'',''se'')',:'wa'),'23505','one open baseline per workspace');
INSERT INTO sw_baseline_answers(workspace_id,baseline_id,question_id,answer) VALUES(:'wa',:'baseline','gov.q1','partly') RETURNING id AS answer \gset
SELECT pg_temp.fail(format('INSERT INTO sw_baseline_answers(workspace_id,baseline_id,question_id,answer) VALUES(%L,%L,''gov.q1'',''no'')',:'wa',:'baseline'),'23505','one answer per question per baseline');
SELECT pg_temp.fail(format('INSERT INTO sw_baseline_answers(workspace_id,baseline_id,question_id,answer) VALUES(%L,%L,''gov.q2'',''maybe'')',:'wa',:'baseline'),'23514','answers use the four allowed values');
INSERT INTO sw_gaps(workspace_id,source_kind,domain,title,baseline_id,baseline_question_id,business_impact,related_asset_id) VALUES(:'wa','baseline','governance','Mandate not documented',:'baseline','gov.q1','high',:'asset') RETURNING id AS gap \gset
SELECT pg_temp.fail(format('INSERT INTO sw_gaps(workspace_id,source_kind,domain,title,baseline_id,baseline_question_id) VALUES(%L,''baseline'',''governance'',''dup'',%L,''gov.q1'')',:'wa',:'baseline'),'23505','one gap per baseline question');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_actions WHERE gap_id=:'gap'),'recording a gap creates no action');
INSERT INTO sw_actions(workspace_id,title,source_kind,gap_id,asset_id,approval_required,priority,due_date) VALUES(:'wa','Write the mandate','gap',:'gap',:'asset',true,'high',current_date-1) RETURNING id AS action \gset
SELECT pg_temp.ok((SELECT assessment_id IS NULL AND status='open' FROM sw_actions WHERE id=:'action'),'action from a gap needs no analysis');
UPDATE sw_gaps SET related_risk_id=:'risk',owner_id='54000000-0000-4000-8000-000000000002',status='in_progress' WHERE id=:'gap';
SELECT pg_temp.ok((SELECT related_risk_id=:'risk' AND version=2 FROM sw_gaps WHERE id=:'gap'),'a gap can be linked to a risk after it was recorded');
SELECT pg_temp.fail(format('UPDATE sw_actions SET status=''completed'',decision_rationale=''done'',completion_evidence=''Mandate v1 signed'',approval_note=''ok'' WHERE id=%L',:'action'),'42501','approval-required completion needs an approver');
SELECT pg_temp.login('54000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('UPDATE sw_actions SET status=''completed'',decision_rationale=''done'',completion_evidence=''Mandate v1 signed'' WHERE id=%L',:'action'),'23514','approval-required completion needs an approval note');
UPDATE sw_actions SET status='completed',decision_rationale='done',completion_evidence='Mandate v1 signed',approval_note='Approved by owner' WHERE id=:'action';
SELECT pg_temp.ok((SELECT closed_by='54000000-0000-4000-8000-000000000001' FROM sw_actions WHERE id=:'action'),'approver completes an approval-required action');
INSERT INTO sw_programme_plans(workspace_id,checklist_version,completed_task_ids) VALUES(:'wa','plan-90-v1','{d30.map-stakeholders}') RETURNING id AS plan \gset
SELECT pg_temp.fail(format('INSERT INTO sw_programme_plans(workspace_id,checklist_version) VALUES(%L,''plan-90-v1'')',:'wa'),'23505','one 90-day plan per workspace');
INSERT INTO sw_sources(workspace_id,name) VALUES(:'wa','Security policy 2026') RETURNING id AS source \gset
INSERT INTO sw_evidence_links(workspace_id,source_id,target_kind,target_id) VALUES(:'wa',:'source','mandate',:'mandate');
INSERT INTO sw_evidence_links(workspace_id,source_id,target_kind,target_id) VALUES(:'wa',:'source','gap',:'gap');
SELECT pg_temp.fail(format('INSERT INTO sw_evidence_links(workspace_id,source_id,target_kind,target_id) VALUES(%L,%L,''gap'',%L)',:'wa',:'source',:'gap'),'23505','evidence links are unique per target');

-- ---------------------------------------------------------------------------
-- AI suggestions: proposed only; content immutable; decision stamped; no
-- authoritative table changes when a suggestion is approved.
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('54000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(workspace_id,kind,content,provider,model,prompt_version,status) VALUES(%L,''mandate_draft'',''{"text":"x"}'',''anthropic'',''claude-test'',''v1'',''approved'')',:'wa'),'23514','a suggestion cannot be born approved');
INSERT INTO sw_ai_suggestions(workspace_id,kind,context_kind,context_id,content,source_records,provider,model,prompt_version) VALUES(:'wa','mandate_draft','mandate',:'mandate','{"text":"Draft mandate"}',format('[{"table":"sw_security_mandates","id":"%s"}]',:'mandate')::jsonb,'anthropic','claude-test','sw-assistant-1.0.0') RETURNING id AS suggestion \gset
SELECT pg_temp.fail(format('UPDATE sw_ai_suggestions SET content=''{"text":"edited"}'' WHERE id=%L',:'suggestion'),'23514','suggestion content is immutable');
SELECT pg_temp.fail(format('UPDATE sw_ai_suggestions SET status=''approved'',decided_by=%L WHERE id=%L','54000000-0000-4000-8000-000000000002',:'suggestion'),'23514','decision stamp cannot be supplied by the caller');
SELECT (SELECT count(*) FROM sw_audit_events WHERE workspace_id=:'wa') AS audit_before \gset
SELECT (SELECT md5(string_agg(m::text,'' ORDER BY m.id)) FROM sw_security_mandates m WHERE workspace_id=:'wa') AS mandate_before \gset
UPDATE sw_ai_suggestions SET status='approved',decision_note='Used as mandate draft' WHERE id=:'suggestion';
SELECT pg_temp.ok((SELECT status='approved' AND decided_by='54000000-0000-4000-8000-000000000002' AND decided_at IS NOT NULL FROM sw_ai_suggestions WHERE id=:'suggestion'),'approval stamps the deciding human');
SELECT pg_temp.ok((SELECT md5(string_agg(m::text,'' ORDER BY m.id)) FROM sw_security_mandates m WHERE workspace_id=:'wa')=:'mandate_before','approving a suggestion changes no authoritative record');
SELECT pg_temp.ok((SELECT count(*) FROM sw_audit_events WHERE workspace_id=:'wa')=:'audit_before'+1,'approval is audited once and touches nothing else');
SELECT pg_temp.fail(format('UPDATE sw_ai_suggestions SET status=''rejected'' WHERE id=%L',:'suggestion'),'23514','a decided suggestion is final');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.sw_ai_suggestions'::regclass AND NOT t.tgisinternal AND t.tgfoid NOT IN ('sw_private.guard_record()'::regprocedure,'sw_private.record_change()'::regprocedure,'sw_private.guard_programme()'::regprocedure)),'no trigger on suggestions writes elsewhere');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'sw_private'::regnamespace) AND p.proname LIKE 'sw%' AND p.prosrc ILIKE '%sw_ai_suggestions%' AND p.prosrc ~* 'insert into public\.sw_(security_mandates|protected_assets|risks|gaps|actions|management_reports)'),'no database function copies a suggestion into an authoritative table');

-- ---------------------------------------------------------------------------
-- Management reports: approval needs an approver and an executive position.
-- ---------------------------------------------------------------------------
INSERT INTO sw_management_reports(workspace_id,title,language,facts,computed,narrative) VALUES(:'wa','Status Q4','sv','{"risks":[]}','{"maturity":{"overall":1}}','{}') RETURNING id AS report \gset
SELECT pg_temp.fail(format('UPDATE sw_management_reports SET status=''approved'' WHERE id=%L',:'report'),'42501','editor cannot approve a management report');
SELECT pg_temp.login('54000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('UPDATE sw_management_reports SET status=''approved'' WHERE id=%L',:'report'),'23514','approval requires an executive position');
UPDATE sw_management_reports SET narrative='{"executive_position":{"text":"Stable, two decisions required","origin":"user"}}' WHERE id=:'report';
UPDATE sw_management_reports SET status='approved' WHERE id=:'report';
SELECT pg_temp.ok((SELECT approved_by='54000000-0000-4000-8000-000000000001' AND version=3 FROM sw_management_reports WHERE id=:'report'),'approver approves; stamp and version are trigger-owned');
SELECT pg_temp.fail(format('UPDATE sw_management_reports SET narrative=''{}'' WHERE id=%L',:'report'),'23514','approved report content is immutable');

-- ---------------------------------------------------------------------------
-- Viewer: reads, never writes.
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('54000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_protected_assets WHERE workspace_id=:'wa'),'viewer reads workspace assets');
SELECT pg_temp.fail(format('INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(%L,''viewer asset'',''people'')',:'wa'),'42501','viewer cannot add an asset');
-- A viewer holds the UPDATE grant but the policy exposes no row: the write
-- is a no-op and the gap is unchanged (the foundation suite proves denial
-- the same way).
WITH attempt AS (UPDATE sw_gaps SET status='resolved' WHERE id=:'gap' RETURNING 1)
SELECT pg_temp.ok((SELECT count(*)=0 FROM attempt) AND (SELECT status='in_progress' FROM sw_gaps WHERE id=:'gap'),'viewer cannot change a gap');
SELECT pg_temp.fail(format('INSERT INTO sw_ai_suggestions(workspace_id,kind,content,provider,model,prompt_version) VALUES(%L,''explanation'',''{}'',''anthropic'',''m'',''v'')',:'wa'),'42501','viewer cannot record a suggestion');

-- ---------------------------------------------------------------------------
-- Workspace B and the outsider: nothing of A is visible or writable.
-- ---------------------------------------------------------------------------
SELECT pg_temp.login('54000000-0000-4000-8000-000000000004');
CREATE OR REPLACE FUNCTION pg_temp.none_visible(ws uuid,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE t record; n bigint; BEGIN
  FOR t IN SELECT name FROM prog_tables ORDER BY name LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id=%L',t.name,ws) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'ASSERTION FAILED: % sees % rows of %',label,n,t.name; END IF;
  END LOOP;
  RAISE NOTICE 'ok  SW-PROG % reads no programme row of another workspace',label;
END $$;
SELECT pg_temp.none_visible(:'wa','workspace B owner');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_risks WHERE workspace_id=:'wa'),'workspace B owner reads no programme risk of A');
SELECT pg_temp.fail(format('INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(%L,''cross'',''people'')',:'wa'),'42501','workspace B owner cannot write into A');
SELECT pg_temp.fail(format('INSERT INTO sw_risk_assets(workspace_id,risk_id,asset_id) VALUES(%L,%L,%L)',:'wb',:'risk',:'asset'),'23503','workspace B cannot link A records through its own workspace id');
WITH attempt AS (UPDATE sw_ai_suggestions SET status='rejected' WHERE id=:'suggestion' RETURNING 1)
SELECT pg_temp.ok((SELECT count(*)=0 FROM attempt),'workspace B cannot decide A suggestions');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_ai_suggestions WHERE id=:'suggestion'),'workspace B never sees A suggestion content');
SELECT pg_temp.login('54000000-0000-4000-8000-000000000005');
SELECT pg_temp.none_visible(:'wa','outsider');
SELECT pg_temp.fail(format('INSERT INTO sw_security_mandates(workspace_id,security_mission) VALUES(%L,''outsider'')',:'wa'),'42501','outsider cannot write a mandate');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.fail('SELECT count(*) FROM public.sw_protected_assets','42501','anon cannot read protected assets');
SELECT pg_temp.fail('SELECT count(*) FROM public.sw_ai_suggestions','42501','anon cannot read suggestions');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.fail('SELECT count(*) FROM public.sw_management_reports','42501','service role holds no programme privilege');
RESET ROLE;

-- Existing analysis records survive and remain readable with their parents.
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_risks WHERE id=:'arisk' AND assessment_id=:'analysis'),'existing analysis risk keeps its parent');

\if :{?sw_programme_keep_fixture}
\else
ROLLBACK;
\endif
