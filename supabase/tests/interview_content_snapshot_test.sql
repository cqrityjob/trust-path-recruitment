-- Run on a disposable database with legacy_fixture before snapshot migration.
-- Fixtures are synthetic. Transaction rollback preserves the initial fixture.
\set ON_ERROR_STOP on
SET row_security TO on;
BEGIN;
CREATE FUNCTION pg_temp.ok(_yes boolean,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF _yes IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',_label; END IF;
 RAISE NOTICE 'ok  SNAP %',_label;
END $$;
CREATE FUNCTION pg_temp.attempt(_role text,_uid text,_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _out text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',coalesce(_uid,''),true);
 EXECUTE format('SET LOCAL ROLE %I',_role);
 BEGIN EXECUTE _sql; _out:='ok'; EXCEPTION WHEN OTHERS THEN _out:=SQLSTATE||':'||SQLERRM; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
 RETURN _out;
END $$;
CREATE TEMP TABLE fx AS SELECT * FROM public.ri_snapshot_test_cases;
GRANT ALL ON fx TO authenticated,service_role;

SELECT pg_temp.ok((SELECT count(*)=2 AND bool_and(provenance='observed_now') FROM scp_private.interview_content_snapshots),'1 truthful legacy backfill');
SELECT pg_temp.ok((SELECT r.payload=o.payload AND r.content_hash=o.content_hash FROM public.scp_interview_reports r CROSS JOIN public.ri_snapshot_test_old_report o WHERE r.id=(SELECT id FROM fx WHERE label='old_report')),'2 old report is byte-for-byte unchanged');
SELECT pg_temp.ok(NOT public.scp_iv_can_write_case((SELECT id FROM fx WHERE label='legacy')),'3 unreviewed legacy continuation fails closed');
SELECT pg_temp.ok(pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_case_frozen_content(%L)',(SELECT id FROM fx WHERE label='legacy')))='ok','4 owner reads legacy provenance');
SELECT pg_temp.ok(pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000003',format('SELECT public.scp_iv_case_frozen_content(%L)',(SELECT id FROM fx WHERE label='legacy'))) LIKE '42501:%','5 unrelated user denied');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','scp_private.interview_content_snapshots','SELECT') AND NOT has_table_privilege('service_role','scp_private.interview_content_snapshots','UPDATE'),'6 no private table access granted');
SELECT pg_temp.ok(pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000002',format('SELECT public.scp_iv_acknowledge_observed_content(%L,%L,''Review'')',(SELECT id FROM fx WHERE label='legacy'),(SELECT manifest->>'manifest_hash' FROM scp_private.interview_content_snapshots WHERE case_id=(SELECT id FROM fx WHERE label='legacy')))) LIKE '42501:%','7 member cannot acknowledge owner review');
SELECT pg_temp.ok(pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_acknowledge_observed_content(%L,''wrong'',''Review'')',(SELECT id FROM fx WHERE label='legacy'))) LIKE '40001:%CONTENT_STALE%','8 wrong manifest cannot be acknowledged');
SELECT pg_temp.ok(pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_acknowledge_observed_content(%L,%L,'' '')',(SELECT id FROM fx WHERE label='legacy'),(SELECT manifest->>'manifest_hash' FROM scp_private.interview_content_snapshots WHERE case_id=(SELECT id FROM fx WHERE label='legacy')))) LIKE '23514:%NOTE_REQUIRED%','9 explicit review note required');
SELECT pg_temp.ok(pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_cases SET status=''sources_ready'' WHERE id=%L',(SELECT id FROM fx WHERE label='legacy'))) LIKE '23514:%REVIEW_REQUIRED%','10 service transition cannot bypass legacy review');
SELECT pg_temp.ok(pg_temp.attempt('service_role',NULL,format('INSERT INTO public.scp_interview_findings(case_id,ai_run_id,finding_kind,statement,claim_class,human_state,human_actor_at) VALUES(%L,NULL,''gap'',''Synthetic'',''human_clarification'',''confirmed'',now())',(SELECT id FROM fx WHERE label='legacy'))) LIKE '23514:%REVIEW_REQUIRED%','11 alternate child write cannot bypass review');

DO $$ DECLARE _case uuid:=(SELECT id FROM fx WHERE label='legacy'); _hash text; _out text;
BEGIN
 SELECT manifest->>'manifest_hash' INTO _hash FROM scp_private.interview_content_snapshots WHERE case_id=_case;
 _out:=pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_acknowledge_observed_content(%L,%L,''Reviewed the observed material and approved a new interview plan; no historical freeze is claimed.'')',_case,_hash));
 PERFORM pg_temp.ok(_out='ok',format('12 explicit observed-now acknowledgement (%s)',_out));
 _out:=pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_acknowledge_observed_content(%L,%L,''Retry'')',_case,_hash));
 PERFORM pg_temp.ok(_out='ok' AND (SELECT count(*)=1 FROM scp_private.interview_content_acknowledgements WHERE case_id=_case)
 AND (SELECT count(*)=1 FROM public.scp_interview_case_events WHERE case_id=_case AND event='content_snapshot_acknowledged'),'13 idempotent acknowledgement and exact audit event');
END $$;
SELECT pg_temp.ok(pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('DO $gate$ BEGIN IF NOT public.scp_iv_can_write_case(%L) THEN RAISE EXCEPTION ''not writable''; END IF; END $gate$',(SELECT id FROM fx WHERE label='legacy')))='ok','14 reviewed legacy may continue');

DO $$ DECLARE _pack uuid;_case uuid;_role text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','b7070000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 FOREACH _role IN ARRAY ARRAY['vaktare-se','security-manager-se'] LOOP
  SELECT v.id INTO _pack FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug=_role AND v.version_number=1;
  _case:=public.scp_iv_create_case('b7070000-1111-4000-8000-000000000001','Snapshot new '||_role,_pack,'Synthetic new',NULL,'SNAP-'||_role);
  INSERT INTO fx VALUES(_role,_case);
 END LOOP;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
END $$;
SELECT pg_temp.ok((SELECT count(*)=2 AND bool_and(s.provenance='case_created' AND jsonb_array_length(s.manifest#>'{content,questions}')=8 AND jsonb_array_length(s.manifest#>'{content,competencies}')=6 AND s.manifest#>'{content,client_copy,sv}' IS NOT NULL AND s.manifest#>'{content,client_copy,en}' IS NOT NULL) FROM scp_private.interview_content_snapshots s JOIN fx ON fx.id=s.case_id WHERE fx.label IN('vaktare-se','security-manager-se')),'15 atomic complete snapshots for both roles with bilingual copy');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM scp_private.interview_content_snapshots s JOIN fx ON fx.id=s.case_id,jsonb_array_elements(s.manifest#>'{content,conduct_guidance}') g WHERE fx.label IN('vaktare-se','security-manager-se') AND g->>'method_id'<>s.manifest->>'method_id'),'16 method children match exact pinned method');
SELECT pg_temp.ok((SELECT manifest->>'manifest_hash'=encode(sha256(convert_to((manifest->'content')::text,'UTF8')),'hex') FROM scp_private.interview_content_snapshots WHERE case_id=(SELECT id FROM fx WHERE label='vaktare-se')),'17 digest covers actual saved content');

-- Real direct service writes: every owned table has insert/update/delete guards.
-- Updating identity is rejected before FK checks, including OLD ownership.
DO $$ DECLARE _table text;_out text;_id uuid;_n integer:=0;
BEGIN
 FOREACH _table IN ARRAY ARRAY['scp_roles','scp_role_versions','scp_interview_packs','scp_interview_pack_versions','scp_interview_pack_competencies','scp_interview_core_questions',
 'scp_interview_approved_probes','scp_interview_verification_rules','scp_interview_prohibited_areas','scp_interview_pack_competency_map',
 'scp_interview_question_competencies','scp_interview_evidence_dimensions','scp_interview_rating_anchors','scp_interview_methods',
 'scp_interview_method_practices','scp_interview_conduct_steps','scp_interview_conduct_guidance','scp_interview_conduct_prohibitions',
 'scp_trust_stages','scp_trust_stage_prohibitions','scp_trust_stage_ai_tasks','scp_trust_stage_claims'] LOOP
  EXECUTE format('SELECT x.id FROM public.%I x WHERE EXISTS(SELECT 1 FROM scp_private.interview_content_owner(%L,to_jsonb(x)) o JOIN scp_private.interview_content_locks l ON l.kind=o.kind AND l.content_id=o.content_id) LIMIT 1',_table,_table) INTO _id;
  IF _id IS NULL THEN CONTINUE; END IF;
  _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.%I SET id=gen_random_uuid() WHERE id=%L',_table,_id));
  PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%',format('18.%s service update %s (%s)',_n,_table,_out));
  _out:=pg_temp.attempt('service_role',NULL,format('DELETE FROM public.%I WHERE id=%L',_table,_id));
  PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%',format('19.%s service delete %s (%s)',_n,_table,_out));
  _n:=_n+1;
 END LOOP;
 PERFORM pg_temp.ok(_n>=17,format('20 at least seventeen populated content tables exercised (%s)',_n));
END $$;

SAVEPOINT unused_reparent_fixture;
DO $$ DECLARE _pack uuid;_unused uuid;_q uuid;_newq uuid:=gen_random_uuid();_method uuid;_newmethod uuid:=gen_random_uuid();_guidance uuid;_newguidance uuid:=gen_random_uuid();_out text;_comp uuid;_anchor uuid;
BEGIN
 SELECT c.pack_version_id,c.trust_method_id INTO _pack,_method FROM public.scp_interview_cases c WHERE c.id=(SELECT id FROM fx WHERE label='vaktare-se');
 SELECT id INTO _q FROM public.scp_interview_core_questions WHERE pack_version_id=_pack ORDER BY display_order LIMIT 1;
 INSERT INTO public.scp_interview_pack_versions SELECT (jsonb_populate_record(NULL::public.scp_interview_pack_versions,to_jsonb(v)||jsonb_build_object('id',gen_random_uuid(),'version_number',201,'pilot_availability','restricted','summary_sv','Synthetic unused draft'))).* FROM public.scp_interview_pack_versions v WHERE id=_pack RETURNING id INTO _unused;
 _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_core_questions SET pack_version_id=%L WHERE id=%L',_unused,_q));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','21 used-to-unused question move rejected');
 INSERT INTO public.scp_interview_core_questions SELECT (jsonb_populate_record(NULL::public.scp_interview_core_questions,to_jsonb(q)||jsonb_build_object('id',_newq,'pack_version_id',_unused))).* FROM public.scp_interview_core_questions q WHERE id=_q;
 _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_core_questions SET pack_version_id=%L WHERE id=%L',_pack,_newq));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','22 unused-to-used question move rejected');
 SELECT id INTO _comp FROM public.scp_interview_pack_competencies WHERE pack_version_id=_pack LIMIT 1;
 SELECT id INTO _anchor FROM public.scp_interview_rating_anchors WHERE question_id=_q LIMIT 1;
 _out:=pg_temp.attempt('service_role',NULL,format('INSERT INTO public.scp_interview_rating_anchors SELECT (jsonb_populate_record(NULL::public.scp_interview_rating_anchors,to_jsonb(a)||jsonb_build_object(''id'',gen_random_uuid(),''question_id'',NULL,''pack_competency_id'',%L::uuid))).* FROM public.scp_interview_rating_anchors a WHERE id=%L',_comp,_anchor));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','37 exclusive competency anchor parent is protected');
 _out:=pg_temp.attempt('service_role',NULL,format('INSERT INTO public.scp_interview_rating_anchors SELECT (jsonb_populate_record(NULL::public.scp_interview_rating_anchors,to_jsonb(a)||jsonb_build_object(''id'',gen_random_uuid(),''question_id'',%L::uuid,''pack_competency_id'',%L::uuid))).* FROM public.scp_interview_rating_anchors a WHERE id=%L',_newq,_comp,_anchor));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','38 mixed dual anchor cannot omit used competency ownership');
 _out:=pg_temp.attempt('service_role',NULL,format('INSERT INTO public.scp_interview_question_competencies SELECT (jsonb_populate_record(NULL::public.scp_interview_question_competencies,to_jsonb(m)||jsonb_build_object(''id'',gen_random_uuid(),''question_id'',%L::uuid,''pack_competency_id'',%L::uuid))).* FROM public.scp_interview_question_competencies m LIMIT 1',_newq,_comp));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','39 question map cannot omit used competency parent');
 _out:=pg_temp.attempt('service_role',NULL,format('INSERT INTO public.scp_interview_approved_probes SELECT (jsonb_populate_record(NULL::public.scp_interview_approved_probes,to_jsonb(p)||jsonb_build_object(''id'',gen_random_uuid(),''pack_version_id'',%L::uuid,''question_id'',%L::uuid))).* FROM public.scp_interview_approved_probes p LIMIT 1',_unused,_q));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','40 probe cannot omit used question parent');
 INSERT INTO public.scp_interview_methods SELECT (jsonb_populate_record(NULL::public.scp_interview_methods,to_jsonb(m)||jsonb_build_object('id',_newmethod,'slug','snapshot-unused-method','version_number',201,'approval_state','draft','approved_at',NULL,'approved_by',NULL))).* FROM public.scp_interview_methods m WHERE id=_method;
 SELECT id INTO _guidance FROM public.scp_interview_conduct_guidance WHERE method_id=_method LIMIT 1;
 _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_conduct_guidance SET method_id=%L WHERE id=%L',_newmethod,_guidance));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','23 used-to-unused method child move rejected');
 INSERT INTO public.scp_interview_conduct_guidance SELECT (jsonb_populate_record(NULL::public.scp_interview_conduct_guidance,to_jsonb(g)||jsonb_build_object('id',_newguidance,'method_id',_newmethod))).* FROM public.scp_interview_conduct_guidance g WHERE id=_guidance;
 _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_conduct_guidance SET method_id=%L WHERE id=%L',_method,_newguidance));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','24 unused-to-used method child move rejected');
 _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_cases SET pack_version_id=%L WHERE id=%L',_unused,(SELECT id FROM fx WHERE label='vaktare-se')));
 PERFORM pg_temp.ok(_out LIKE '23514:%BIND_IMMUTABLE%','25 bound case cannot silently switch content');
END $$;

ROLLBACK TO SAVEPOINT unused_reparent_fixture;
DO $$ DECLARE _pack uuid;_out text;
BEGIN
 SELECT pack_version_id INTO _pack FROM public.scp_interview_cases WHERE id=(SELECT id FROM fx WHERE label='vaktare-se');
 UPDATE public.scp_interview_pack_versions SET pilot_availability='restricted' WHERE id=_pack;
 _out:=pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_create_case(''b7070000-1111-4000-8000-000000000001'',''Withdrawn'',%L,''Synthetic'')',_pack));
 PERFORM pg_temp.ok(_out LIKE '%PACK_NOT_USABLE%','26 withdrawal stops new cases');
 _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_pack_versions SET summary_sv=''Changed after withdrawal'' WHERE id=%L',_pack));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','27 withdrawal never unlocks used content');
END $$;

SAVEPOINT live_corruption;
-- Even an operator bypassing triggers cannot silently substitute live guide
-- rows into the future report. This is test-only, inside a rolled-back savepoint.
SET LOCAL session_replication_role=replica;
UPDATE public.scp_interview_core_questions SET prompt_sv='SYNTHETIC LIVE CORRUPTION' WHERE pack_version_id=(SELECT pack_version_id FROM public.scp_interview_cases WHERE id=(SELECT id FROM fx WHERE label='vaktare-se'));
SET LOCAL session_replication_role=origin;
SELECT pg_temp.ok((SELECT jsonb_array_length(public.scp_iv_build_report_basis((SELECT id FROM fx WHERE label='vaktare-se'))->'questions')=8 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.scp_iv_build_report_basis((SELECT id FROM fx WHERE label='vaktare-se'))->'questions') q WHERE q->>'prompt_sv'='SYNTHETIC LIVE CORRUPTION') AND EXISTS(SELECT 1 FROM jsonb_array_elements(public.scp_iv_build_report_basis((SELECT id FROM fx WHERE label='vaktare-se'))->'questions') q WHERE q->>'prompt_sv'=s.manifest#>>'{content,questions,0,prompt_sv}') FROM scp_private.interview_content_snapshots s WHERE case_id=(SELECT id FROM fx WHERE label='vaktare-se')),'28 report reads saved question copy');
SELECT pg_temp.ok((SELECT scp_private.interview_frozen_manifest((SELECT id FROM fx WHERE label='vaktare-se'))=manifest FROM scp_private.interview_content_snapshots WHERE case_id=(SELECT id FROM fx WHERE label='vaktare-se')),'29 saved content remains exact despite live corruption');
ROLLBACK TO SAVEPOINT live_corruption;
INSERT INTO public.scp_content_roles(user_id,role) VALUES('b7070000-0000-4000-8000-000000000001','editor');
DO $$ DECLARE _pack uuid;_role uuid;_old uuid;_new uuid;_out text;
BEGIN
 SELECT pack_id,role_version_id,id INTO _pack,_role,_old FROM public.scp_interview_pack_versions WHERE id=(SELECT pack_version_id FROM public.scp_interview_cases WHERE id=(SELECT id FROM fx WHERE label='vaktare-se'));
 PERFORM set_config('request.jwt.claim.sub','b7070000-0000-4000-8000-000000000001',true);
 SET LOCAL ROLE authenticated;
 _new:=public.scp_interview_create_version(_pack,'sv-SE',_role,'Synthetic source','v2','New editable draft, previous used draft preserved');
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.ok(_new<>_old AND (SELECT content_status='draft' AND pilot_availability='restricted' FROM public.scp_interview_pack_versions WHERE id=_new) AND (SELECT content_status='draft' FROM public.scp_interview_pack_versions WHERE id=_old),'34 new draft version created without approving or retiring used draft');
 _out:=pg_temp.attempt('authenticated','b7070000-0000-4000-8000-000000000001',format('SELECT public.scp_interview_create_version(%L,''sv-SE'',%L,''Synthetic'',''v3'',NULL)',_pack,_role));
 PERFORM pg_temp.ok(_out LIKE '23514:%OPEN_VERSION_EXISTS%','35 only one unused open draft remains allowed');
 _out:=pg_temp.attempt('service_role',NULL,format('UPDATE public.scp_interview_pack_versions SET summary_sv=''Changed old draft'' WHERE id=%L',_old));
 PERFORM pg_temp.ok(_out LIKE '23514:%CONTENT_IN_USE%','36 old used draft stays locked after new version');
END $$;
SELECT pg_temp.ok(NOT (SELECT ai_enabled OR transcript_enabled FROM public.scp_interview_ai_config WHERE id),'30 AI and transcript stay off');
SELECT pg_temp.ok(pg_temp.attempt('postgres',NULL,format('UPDATE scp_private.interview_content_snapshots SET manifest=manifest||''{"rewrite":true}''::jsonb WHERE case_id=%L',(SELECT id FROM fx WHERE label='vaktare-se'))) LIKE '23514:%RECORD_IMMUTABLE%','31 stored snapshot cannot be edited even by table owner');
SELECT pg_temp.ok(pg_temp.attempt('postgres',NULL,'DELETE FROM scp_private.interview_content_locks') LIKE '23514:%RECORD_IMMUTABLE%','32 permanent lock cannot be removed even by table owner');
INSERT INTO auth.users(id,email) VALUES('b7070000-0000-4000-8000-000000000004','snapshot-audit-erasure@test.invalid');
INSERT INTO scp_private.interview_content_acknowledgements(case_id,manifest_hash,actor_id,note)
 SELECT case_id,manifest->>'manifest_hash','b7070000-0000-4000-8000-000000000004','Synthetic FK erasure proof'
 FROM scp_private.interview_content_snapshots WHERE case_id=(SELECT id FROM fx WHERE label='old_report_case');
DELETE FROM auth.users WHERE id='b7070000-0000-4000-8000-000000000004';
SELECT pg_temp.ok((SELECT actor_id IS NULL AND note='Synthetic FK erasure proof' FROM scp_private.interview_content_acknowledgements WHERE case_id=(SELECT id FROM fx WHERE label='old_report_case')),'33 genuine Auth FK erasure clears actor while preserving review');
ROLLBACK;
