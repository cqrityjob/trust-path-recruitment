-- v0.3 P0: real authorization and persistence, AI off, synthetic actors only.
-- Rolls back all fixtures. No hosted writes and no artificial client grants.
\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
-- pg_dump restores with row_security=off in its session. Exercise ordinary
-- caller RLS even when this suite follows that restore in the same psql call.
SET row_security TO on;
BEGIN;
CREATE FUNCTION pg_temp.ok(_condition boolean,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',_label; END IF;
  RAISE NOTICE 'ok  %',_label;
END $$;
CREATE FUNCTION pg_temp.try_as(_uid text,_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _result text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',coalesce(_uid,''),true);
  IF _uid IS NULL THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
  BEGIN EXECUTE _sql; _result := 'ok';
  EXCEPTION WHEN OTHERS THEN _result := SQLSTATE || ':' || SQLERRM; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub','',true);
  RETURN _result;
END $$;
CREATE TEMP TABLE fx(label text PRIMARY KEY,id uuid);
GRANT ALL ON fx TO authenticated,anon;
CREATE TEMP TABLE clocks(label text PRIMARY KEY,stamp timestamptz,rev bigint);
GRANT ALL ON clocks TO authenticated;
CREATE FUNCTION pg_temp.point_sql(_case text,_op text,_statement text DEFAULT 'Datum behöver klarläggas.',
  _question uuid DEFAULT NULL,_passage uuid DEFAULT NULL,_label text DEFAULT 'Ansökan, kandidatens datumuppgift')
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT * FROM public.scp_iv_create_manual_finding(%L,%L,''unclear'',%L,
    ''Vad avser datumen?'',%L,%L,%L,''Rekryteraren'',''Be kandidaten förklara datumen'',NULL)',
    (SELECT id FROM fx WHERE label=_case),_op,_statement,_question,_passage,_label);
$$;
CREATE FUNCTION pg_temp.review_sql(_rev bigint) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT * FROM public.scp_iv_review_manual_finding(%L,%s,''needs_verification'',
    ''Original behöver kontrolleras.'',''Behörig kontrollansvarig'',''Kontrollera intygets giltighet'',''2026-11-01'')',
    (SELECT id FROM fx WHERE label='point'),_rev);
$$;

INSERT INTO auth.users(id,email) VALUES
 ('b6030000-0000-4000-8000-000000000001','ri-owner@test.invalid'),
 ('b6030000-0000-4000-8000-000000000002','ri-admin@test.invalid'),
 ('b6030000-0000-4000-8000-000000000003','ri-creator@test.invalid'),
 ('b6030000-0000-4000-8000-000000000004','ri-unrelated@test.invalid'),
 ('b6030000-0000-4000-8000-000000000005','ri-reviewer@test.invalid'),
 ('b6030000-0000-4000-8000-000000000009','ri-other-owner@test.invalid'),
 ('b6030000-0000-4000-8000-000000000010','ri-candidate@test.invalid');
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('b6030000-1111-4000-8000-000000000001','RI employer','ri-p0-synthetic','active'),
 ('b6030000-1111-4000-8000-000000000009','RI other employer','ri-p0-other','active');
INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES
 ('b6030000-1111-4000-8000-000000000001','b6030000-0000-4000-8000-000000000001','owner','active'),
 ('b6030000-1111-4000-8000-000000000001','b6030000-0000-4000-8000-000000000002','admin','active'),
 ('b6030000-1111-4000-8000-000000000001','b6030000-0000-4000-8000-000000000003','member','active'),
 ('b6030000-1111-4000-8000-000000000001','b6030000-0000-4000-8000-000000000004','member','active'),
 ('b6030000-1111-4000-8000-000000000001','b6030000-0000-4000-8000-000000000005','member','active'),
 ('b6030000-1111-4000-8000-000000000009','b6030000-0000-4000-8000-000000000009','owner','active');
INSERT INTO public.scp_employer_reviewers(employer_id,user_id,allowed_use_cases,granted_by) VALUES
 ('b6030000-1111-4000-8000-000000000001','b6030000-0000-4000-8000-000000000005',ARRAY['recruitment'],
  'b6030000-0000-4000-8000-000000000001');

DO $$
DECLARE _pack uuid;_case uuid;_case2 uuid;_source uuid;_source2 uuid;_plan uuid;_session uuid;
BEGIN
 SELECT v.id INTO _pack FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id
   WHERE p.slug='vaktare-se' AND v.version_number=1;
 PERFORM set_config('request.jwt.claim.sub','b6030000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 _case := public.scp_iv_create_case('b6030000-1111-4000-8000-000000000001','RI P0',_pack,'Syntetisk A',NULL,'RI-P0-A');
 _case2 := public.scp_iv_create_case('b6030000-1111-4000-8000-000000000001','RI P0 second',_pack,'Syntetisk B',NULL,'RI-P0-B');
 _source := public.scp_iv_add_source(_case,'employer_requirements','Rollkrav','Syntetiskt kravutdrag.','recruitment','Syntetiskt test');
 _source2 := public.scp_iv_add_source(_case2,'employer_requirements','Andra rollkrav','Andra syntetiska kravutdraget.','recruitment','Syntetiskt test');
 PERFORM public.scp_iv_mark_sources_ready(_case);
 _plan := public.scp_iv_record_manual_prep_plan(_case,'60 minuter','Ingen AI används.','Sammanfatta och erbjud rättelse.');
 PERFORM public.scp_iv_approve_prep_plan(_plan,'Granskad manuellt.');
 _session := public.scp_iv_start_session(_case,'Syntetisk intervjuare');
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
 -- The creator is an eligible active member; another plain member has no case basis.
 UPDATE public.scp_interview_cases SET created_by='b6030000-0000-4000-8000-000000000003' WHERE id=_case;
 INSERT INTO fx VALUES ('case',_case),('case2',_case2),('session',_session),('pack',_pack),('source',_source);
 INSERT INTO fx SELECT 'passage',id FROM public.scp_interview_source_passages WHERE source_id=_source LIMIT 1;
 INSERT INTO fx SELECT 'other_passage',id FROM public.scp_interview_source_passages WHERE source_id=_source2 LIMIT 1;
 INSERT INTO fx SELECT 'q',id FROM public.scp_interview_core_questions WHERE pack_version_id=_pack ORDER BY display_order LIMIT 1;
 INSERT INTO fx SELECT 'other_q',q.id FROM public.scp_interview_core_questions q
   JOIN public.scp_interview_pack_versions v ON v.id=q.pack_version_id JOIN public.scp_interview_packs p ON p.id=v.pack_id
   WHERE p.slug='security-manager-se' ORDER BY q.display_order LIMIT 1;
END $$;

SELECT pg_temp.ok(NOT (SELECT ai_enabled OR transcript_enabled FROM public.scp_interview_ai_config WHERE id),'P0.1 AI and transcript remain off');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.scp_iv_create_manual_finding(uuid,uuid,text,text,text,uuid,uuid,text,text,text,date)','EXECUTE'),'P0.2 anon cannot create');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','scp_private.interview_content_manifest(uuid)','EXECUTE'),'P0.3 raw manifest helper is not callable');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.scp_interview_findings','INSERT')
 AND NOT has_column_privilege('authenticated','public.scp_interview_findings','next_action','UPDATE'),'P0.4 no raw creation or metadata writes granted');

SELECT pg_temp.ok(pg_temp.try_as(NULL,pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000001')) LIKE '42501:%','P0.5 anon denied via direct call');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000004',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000001')) LIKE '42501:%INTERVIEW_CASE_NOT_FOUND%','P0.6 unrelated colleague denied');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000009',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000001')) LIKE '42501:%','P0.7 other employer denied');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000010',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000001')) LIKE '42501:%','P0.8 candidate denied');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000001'))='ok','P0.9 creator records manual point without AI');
INSERT INTO fx SELECT 'point',id FROM public.scp_interview_findings WHERE operation_id='b6030000-2222-4000-8000-000000000001';
SELECT pg_temp.ok((SELECT origin='human' AND ai_run_id IS NULL AND claim_class='human_clarification'
 AND created_by='b6030000-0000-4000-8000-000000000003' AND human_actor_id=created_by
 AND human_actor_at IS NOT NULL AND revision=1 FROM public.scp_interview_findings WHERE id=(SELECT id FROM fx WHERE label='point')),'P0.10 provenance and actor are server recorded');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000001'))='ok'
 AND (SELECT count(*)=1 FROM public.scp_interview_findings WHERE operation_id='b6030000-2222-4000-8000-000000000001'),'P0.11 retry creates no duplicate');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000001','Ändrad innebörd')) LIKE '23514:%OPERATION_REUSED%','P0.12 same operation cannot silently change input');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000005',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000002'))='ok','P0.13 scoped reviewer may create');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000003','Datum',NULL,(SELECT id FROM fx WHERE label='other_passage'))) LIKE '23514:%ORIGIN_MISMATCH%','P0.14 passage from other case refused');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000003','Datum',(SELECT id FROM fx WHERE label='other_q'))) LIKE '23514:%QUESTION_NOT_IN_PACK%','P0.15 question from other pack refused');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000003',' ')) LIKE '23514:%INVALID_INPUT%','P0.16 blank statement refused');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000003','Datum',NULL,NULL,NULL)) LIKE '23514:%INVALID_INPUT%','P0.17 source reference required');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000003','Datum',(SELECT id FROM fx WHERE label='q'),(SELECT id FROM fx WHERE label='passage'),NULL))='ok','P0.18 same-case quoted source and pinned question accepted');
SELECT pg_temp.ok((SELECT claim_class='source_grounded' FROM public.scp_interview_findings WHERE operation_id='b6030000-2222-4000-8000-000000000003'),'P0.19 source-grounded and human provenance are separate');

SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.review_sql(1)) LIKE '42501:%REVIEW_ROLE%','P0.20 creator cannot settle report control point');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000005',pg_temp.review_sql(1)) LIKE '42501:%REVIEW_ROLE%','P0.21 reviewer cannot settle owner review');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000001',pg_temp.review_sql(1))='ok','P0.22 owner review succeeds');
SELECT pg_temp.ok((SELECT revision=2 AND human_actor_id='b6030000-0000-4000-8000-000000000001'
 AND due_on='2026-11-01' AND resolution_state='needs_verification' FROM public.scp_interview_findings WHERE id=(SELECT id FROM fx WHERE label='point')),'P0.23 reviewer date and revision recorded');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000002',pg_temp.review_sql(1)) LIKE '40001:%FINDING_STALE%','P0.24 stale review cannot overwrite');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000002',pg_temp.review_sql(2))='ok','P0.25 admin reviews current revision');
INSERT INTO clocks SELECT 'point',updated_at,revision FROM public.scp_interview_findings WHERE id=(SELECT id FROM fx WHERE label='point');
DO $$ DECLARE _result text;
BEGIN
 _result:=pg_temp.try_as('b6030000-0000-4000-8000-000000000001',format('UPDATE public.scp_interview_findings SET human_note=''Direkt API-granskning'' WHERE id=%L',(SELECT id FROM fx WHERE label='point')));
 PERFORM pg_temp.ok(_result='ok',format('P0.26 existing direct owner review remains permitted (%s)',_result));
END $$;
SELECT pg_temp.ok((SELECT f.revision=c.rev+1 AND f.updated_at>c.stamp AND f.human_actor_id='b6030000-0000-4000-8000-000000000001'
 FROM public.scp_interview_findings f JOIN clocks c ON c.label='point' WHERE f.id=(SELECT id FROM fx WHERE label='point')),'P0.27 direct review advances revision and timestamp');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000001',pg_temp.review_sql(3)) LIKE '40001:%FINDING_STALE%','P0.28 RPC detects intervening direct write');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000001',format('UPDATE public.scp_interview_findings SET next_action=''Bypass'' WHERE id=%L',(SELECT id FROM fx WHERE label='point'))) LIKE '42501:%','P0.29 raw follow-up metadata write refused');

INSERT INTO clocks SELECT 'session',updated_at,NULL FROM public.scp_interview_sessions WHERE id=(SELECT id FROM fx WHERE label='session');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',format('SELECT * FROM public.scp_iv_save_session_process(%L,''Jag lyssnade öppet.'',''En planerad paus.'',%L)',
 (SELECT id FROM fx WHERE label='session'),(SELECT stamp FROM clocks WHERE label='session')))='ok','P0.30 creator saves reflection and deviations');
SELECT pg_temp.ok((SELECT process_reflection='Jag lyssnade öppet.' AND protocol_deviations='En planerad paus.' FROM public.scp_interview_sessions WHERE id=(SELECT id FROM fx WHERE label='session')),'P0.31 reload retains process text');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',format('SELECT * FROM public.scp_iv_save_session_process(%L,''Stale'',NULL,%L)',
 (SELECT id FROM fx WHERE label='session'),(SELECT stamp FROM clocks WHERE label='session'))) LIKE '40001:%SESSION_PROCESS_STALE%','P0.32 stale process save refused');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000004',format('SELECT * FROM public.scp_iv_save_session_process(%L,NULL,NULL,%L)',
 (SELECT id FROM fx WHERE label='session'),(SELECT updated_at FROM public.scp_interview_sessions WHERE id=(SELECT id FROM fx WHERE label='session')))) LIKE '42501:%','P0.33 unrelated colleague cannot save session');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',format('SELECT public.scp_iv_set_session_state(%L,''paused'')',(SELECT id FROM fx WHERE label='session')))='ok','P0.34 existing pause remains usable');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',format('SELECT * FROM public.scp_iv_save_session_process(%L,NULL,'''',%L)',
 (SELECT id FROM fx WHERE label='session'),(SELECT updated_at FROM public.scp_interview_sessions WHERE id=(SELECT id FROM fx WHERE label='session'))))='ok','P0.35 paused session supports explicit clearing');
SELECT pg_temp.ok((SELECT process_reflection IS NULL AND protocol_deviations IS NULL FROM public.scp_interview_sessions WHERE id=(SELECT id FROM fx WHERE label='session')),'P0.36 clearing survives reload');

SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000004',format('SELECT public.scp_iv_case_content_manifest(%L)',(SELECT id FROM fx WHERE label='case'))) LIKE '42501:%','P0.37 unrelated colleague cannot fetch manifest');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',format('SELECT public.scp_iv_case_content_manifest(%L)',(SELECT id FROM fx WHERE label='case')))='ok','P0.38 creator manifest read succeeds');
CREATE FUNCTION pg_temp.case_manifest(_case uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 IF to_regprocedure('scp_private.interview_frozen_manifest(uuid)') IS NOT NULL THEN
  RETURN scp_private.interview_frozen_manifest(_case);
 END IF;
 RETURN scp_private.interview_content_manifest(_case);
END $$;
CREATE TEMP TABLE manifest AS SELECT pg_temp.case_manifest((SELECT id FROM fx WHERE label='case')) AS payload;
SELECT pg_temp.ok((SELECT jsonb_array_length(payload#>'{content,questions}')=8 AND jsonb_array_length(payload#>'{content,competencies}')=6
 AND payload->>'content_hash_algorithm'='sha256-jsonb-v1' AND length(payload->>'manifest_hash')=64 FROM manifest),'P0.39 complete baseline with separate digest');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM manifest,jsonb_array_elements(payload#>'{content,conduct_guidance}') g
 WHERE g->>'method_id'<>payload->>'method_id'),'P0.40 every method child is case-pinned');
SELECT pg_temp.ok((SELECT pg_temp.case_manifest((SELECT id FROM fx WHERE label='case'))=payload FROM manifest),'P0.41 repeat read is deterministic');
SAVEPOINT translation_change;
DO $$ DECLARE _message text;
BEGIN
 BEGIN UPDATE public.scp_interview_rating_anchors SET anchor_en=coalesce(anchor_en,'')||' Synthetic translation amendment'
 WHERE id=(SELECT (a->>'id')::uuid FROM manifest,jsonb_array_elements(payload#>'{content,anchors}') a LIMIT 1);
 EXCEPTION WHEN OTHERS THEN _message:=SQLERRM; END;
 IF to_regprocedure('scp_private.interview_frozen_manifest(uuid)') IS NOT NULL THEN
  PERFORM pg_temp.ok(_message LIKE 'SCP_IV_CONTENT_IN_USE:%','P0.42 used language content is permanently protected');
 ELSE
  PERFORM pg_temp.ok((SELECT scp_private.interview_content_manifest((SELECT id FROM fx WHERE label='case'))->>'manifest_hash'<>payload->>'manifest_hash'
  AND public.scp_interview_pack_content_hash((SELECT id FROM fx WHERE label='pack'))=payload->>'recomputed_pack_hash' FROM manifest),'P0.42 separate manifest detects language change omitted by legacy hash');
 END IF;
END $$;
ROLLBACK TO SAVEPOINT translation_change;
CREATE TEMP TABLE report_basis AS SELECT public.scp_iv_build_report_basis((SELECT id FROM fx WHERE label='case')) AS payload;
SELECT pg_temp.ok((SELECT payload#>>'{ai_disclosure,statement}' LIKE 'Inget AI-stöd%' FROM report_basis),'P0.43 AI-off future report disclosure is truthful');
SELECT pg_temp.ok((SELECT payload#>>'{content_manifest,manifest_hash}'=(SELECT payload->>'manifest_hash' FROM manifest)
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'unresolved') p WHERE p->>'next_action'='Kontrollera intygets giltighet'
 AND p->>'neutral_question'='Vad avser datumen?') FROM report_basis),'P0.44 future basis contains manifest and follow-up metadata');

-- Walk the real AI-off report path. No fixtures jump the case state machine.
DO $$
DECLARE _case uuid:=(SELECT id FROM fx WHERE label='case');_q uuid;_hash text;_report uuid;_message text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','b6030000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 PERFORM public.scp_iv_set_session_state((SELECT id FROM fx WHERE label='session'),'in_progress');
 PERFORM public.scp_iv_set_session_state((SELECT id FROM fx WHERE label='session'),'completed','evaluation');
 PERFORM public.scp_iv_begin_evidence_review(_case);
 FOR _q IN SELECT id FROM public.scp_interview_core_questions WHERE pack_version_id=(SELECT id FROM fx WHERE label='pack') LOOP
   PERFORM public.scp_iv_record_assessment(_case,_q,0,'Underlaget räcker inte för bedömning.');
 END LOOP;
 PERFORM public.scp_iv_mark_assessed(_case);
 SELECT basis_hash INTO _hash FROM public.scp_iv_preview_report(_case);
 PERFORM public.scp_iv_review_manual_finding((SELECT id FROM fx WHERE label='point'),4,'needs_verification',
   'Kontrollplanen har granskats.','Kontrollansvarig','Kontrollera originalet','2026-11-02');
 BEGIN
   PERFORM public.scp_iv_finalise_previewed_report(_case,_hash,NULL);
 EXCEPTION WHEN OTHERS THEN _message:=SQLERRM; END;
 PERFORM pg_temp.ok(_message LIKE '%SCP_IV_STALE_PREVIEW%',format('P0.47 changed control metadata invalidates preview (received %s)',_message));
 SELECT basis_hash INTO _hash FROM public.scp_iv_preview_report(_case);
 _report:=public.scp_iv_finalise_previewed_report(_case,_hash,NULL);
 INSERT INTO fx VALUES('report',_report);
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
END $$;
CREATE TEMP TABLE frozen_report AS SELECT payload,content_hash FROM public.scp_interview_reports WHERE id=(SELECT id FROM fx WHERE label='report');
SELECT pg_temp.ok((SELECT status='reported' FROM public.scp_interview_cases WHERE id=(SELECT id FROM fx WHERE label='case')),'P0.48 real AI-off report finalised');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000001',format('SELECT * FROM public.scp_iv_save_session_process(%L,''Late'',NULL,%L)',
 (SELECT id FROM fx WHERE label='session'),(SELECT updated_at FROM public.scp_interview_sessions WHERE id=(SELECT id FROM fx WHERE label='session')))) LIKE '23514:%PROCESS_REPORTED%','P0.49 process text cannot rewrite reported interview');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000001',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000004')) LIKE '23514:%FINDING_REPORTED%','P0.50 new report-basis point refused after finalisation');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000001',pg_temp.review_sql(5))='ok','P0.51 owner can document subsequent follow-up');
SELECT pg_temp.ok((SELECT r.payload=f.payload AND r.content_hash=f.content_hash FROM public.scp_interview_reports r CROSS JOIN frozen_report f
 WHERE r.id=(SELECT id FROM fx WHERE label='report')),'P0.52 follow-up never changes frozen report');
DO $$
DECLARE _message text;
BEGIN
 BEGIN UPDATE public.scp_interview_reports SET payload=payload||'{"rewrite":true}'::jsonb WHERE id=(SELECT id FROM fx WHERE label='report');
 EXCEPTION WHEN OTHERS THEN _message:=SQLERRM; END;
 PERFORM pg_temp.ok(_message LIKE '%SCP_IV_REPORT_IMMUTABLE%','P0.53 final payload is immutable even for table owner');
END $$;
SAVEPOINT later_method_text;
DO $$ DECLARE _message text;
BEGIN
 BEGIN UPDATE public.scp_interview_conduct_guidance SET statement_en=statement_en||' Synthetic later method text.'
 WHERE id=(SELECT (g->>'id')::uuid FROM manifest,jsonb_array_elements(payload#>'{content,conduct_guidance}') g LIMIT 1);
 EXCEPTION WHEN OTHERS THEN _message:=SQLERRM; END;
 IF to_regprocedure('scp_private.interview_frozen_manifest(uuid)') IS NOT NULL THEN
  PERFORM pg_temp.ok(_message LIKE 'SCP_IV_CONTENT_IN_USE:%' AND (SELECT r.payload=f.payload AND r.content_hash=f.content_hash
  FROM public.scp_interview_reports r CROSS JOIN frozen_report f WHERE r.id=(SELECT id FROM fx WHERE label='report')),
  'P0.54 used method copy protected and final report unchanged');
 ELSE
  PERFORM pg_temp.ok((SELECT scp_private.interview_content_manifest((SELECT id FROM fx WHERE label='case'))->>'manifest_hash'
  <>r.payload#>>'{content_manifest,manifest_hash}' AND r.payload=f.payload AND r.content_hash=f.content_hash
  FROM public.scp_interview_reports r CROSS JOIN frozen_report f WHERE r.id=(SELECT id FROM fx WHERE label='report')),'P0.54 later method text does not rewrite stored manifest');
 END IF;
END $$;
ROLLBACK TO SAVEPOINT later_method_text;

SAVEPOINT capability_recovery;
\ir ../rollback/20270306090000_recruiter_intelligence_interview_foundation_rollback.sql
SELECT pg_temp.ok(to_regprocedure('public.scp_iv_create_manual_finding(uuid,uuid,text,text,text,uuid,uuid,text,text,text,date)') IS NULL
 AND EXISTS(SELECT 1 FROM public.scp_interview_findings WHERE id=(SELECT id FROM fx WHERE label='point') AND origin='human'),
 'P0.55 recovery removes capability and preserves manual history');
SELECT pg_temp.ok((SELECT r.payload=f.payload AND r.content_hash=f.content_hash FROM public.scp_interview_reports r CROSS JOIN frozen_report f
 WHERE r.id=(SELECT id FROM fx WHERE label='report')),'P0.56 recovery preserves report and its hash');
ROLLBACK TO SAVEPOINT capability_recovery;

-- Removed membership immediately closes both reads and writes.
UPDATE public.employer_memberships SET status='removed' WHERE user_id='b6030000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',pg_temp.point_sql('case','b6030000-2222-4000-8000-000000000004')) LIKE '42501:%','P0.45 removed creator cannot create');
SELECT pg_temp.ok(pg_temp.try_as('b6030000-0000-4000-8000-000000000003',format('SELECT public.scp_iv_case_content_manifest(%L)',(SELECT id FROM fx WHERE label='case'))) LIKE '42501:%','P0.46 removed creator cannot read manifest');
ROLLBACK;
