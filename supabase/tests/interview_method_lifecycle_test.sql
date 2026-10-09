-- Current-schema lifecycle authorization. Synthetic actors; every fixture and
-- private state transition rolls back. SET ROLE tests database API/RLS, not
-- genuine GoTrue, PostgREST transport, production installation or publication.
\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
SET row_security TO on;
BEGIN;
CREATE FUNCTION pg_temp.ok(_value boolean,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF _value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',_label; END IF;
 RAISE NOTICE 'ok  %',_label;
END $$;
CREATE FUNCTION pg_temp.try_as(_role text,_uid uuid,_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _result text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',coalesce(_uid::text,''),true);
 EXECUTE format('SET LOCAL ROLE %I',_role);
 BEGIN EXECUTE _sql; _result:='ok'; EXCEPTION WHEN OTHERS THEN _result:=SQLSTATE||':'||SQLERRM; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','',true);
 RETURN _result;
END $$;
CREATE TEMP TABLE lifecycle_fx(label text PRIMARY KEY,id uuid);
GRANT SELECT,INSERT ON lifecycle_fx TO authenticated,service_role;
CREATE TEMP TABLE lifecycle_old_snapshots AS SELECT * FROM scp_private.interview_content_snapshots;
CREATE TEMP TABLE lifecycle_old_locks AS SELECT * FROM scp_private.interview_content_locks;
CREATE TEMP TABLE lifecycle_old_reports AS SELECT id,payload,content_hash FROM public.scp_interview_reports;
CREATE TEMP TABLE lifecycle_function_contract AS
 SELECT oid::regprocedure::text signature,proowner,proacl,proconfig,provolatile,prosecdef,pronargdefaults
 FROM pg_proc WHERE oid IN('public.scp_iv_case_start_basis(uuid,uuid,uuid)'::regprocedure,
 'public.scp_interview_guard_pilot_grant()'::regprocedure,
 'public.scp_interview_suspend_version(uuid,text)'::regprocedure,
 'public.scp_interview_retire_version(uuid,text)'::regprocedure);

INSERT INTO auth.users(id,email) VALUES
 ('b7100000-0000-4000-8000-000000000001','lifecycle-owner@synthetic.invalid'),
 ('b7100000-0000-4000-8000-000000000002','lifecycle-outside-cohort@synthetic.invalid'),
 ('b7100000-0000-4000-8000-000000000003','lifecycle-other-owner@synthetic.invalid'),
 ('b7100000-0000-4000-8000-000000000004','lifecycle-publisher@synthetic.invalid');
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('b7100000-1111-4000-8000-000000000001','Lifecycle own synthetic','lifecycle-own-synthetic','active'),
 ('b7100000-1111-4000-8000-000000000003','Lifecycle other synthetic','lifecycle-other-synthetic','active');
INSERT INTO public.employer_memberships(employer_id,user_id,role,status) VALUES
 ('b7100000-1111-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','owner','active'),
 ('b7100000-1111-4000-8000-000000000001','b7100000-0000-4000-8000-000000000002','member','active'),
 ('b7100000-1111-4000-8000-000000000003','b7100000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.scp_content_roles(user_id,role) VALUES
 ('b7100000-0000-4000-8000-000000000004','publisher');
INSERT INTO lifecycle_fx SELECT 'pack',v.id FROM public.scp_interview_pack_versions v
 JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug='vaktare-se' AND v.version_number=1;
-- Availability is lifecycle metadata. This private SQL fixture restricts the
-- existing draft, without editing text/hash or creating any approved review.
UPDATE public.scp_interview_pack_versions SET pilot_availability='restricted'
 WHERE id=(SELECT id FROM lifecycle_fx WHERE label='pack');
INSERT INTO public.scp_interview_pack_pilot_grants
 (id,employer_id,pack_version_id,rationale,usage_mode,environment,starts_on,expires_on,cohort_user_ids)
 SELECT 'b7100000-2222-4000-8000-000000000001','b7100000-1111-4000-8000-000000000001',id,
 'Isolerad SQL-kontroll','internal_qa','development',current_date-1,current_date+30,
 ARRAY['b7100000-0000-4000-8000-000000000001'::uuid] FROM lifecycle_fx WHERE label='pack';
INSERT INTO lifecycle_fx VALUES('grant','b7100000-2222-4000-8000-000000000001');

SELECT pg_temp.ok(public.scp_iv_case_start_basis('b7100000-1111-4000-8000-000000000001',
 (SELECT id FROM lifecycle_fx WHERE label='pack'),'b7100000-0000-4000-8000-000000000001')='pilot_grant','LC1 restricted draft and valid cohort grant remain startable');
SELECT pg_temp.ok(public.scp_iv_case_start_basis('b7100000-1111-4000-8000-000000000001',
 (SELECT id FROM lifecycle_fx WHERE label='pack'),'b7100000-0000-4000-8000-000000000002') IS NULL,'LC2 outside cohort has no start basis');
SELECT pg_temp.ok(public.scp_iv_case_start_basis('b7100000-1111-4000-8000-000000000003',
 (SELECT id FROM lifecycle_fx WHERE label='pack'),'b7100000-0000-4000-8000-000000000003') IS NULL,'LC3 another employer has no grant');
SELECT pg_temp.ok(pg_temp.try_as('anon',NULL,format('SELECT public.scp_iv_case_start_basis(%L,%L)',
 'b7100000-1111-4000-8000-000000000001',(SELECT id FROM lifecycle_fx WHERE label='pack'))) LIKE '42501:%','LC4 internal eligibility oracle not callable anonymously');
SELECT pg_temp.ok(pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_case_start_basis(%L,%L)',
 'b7100000-1111-4000-8000-000000000001',(SELECT id FROM lifecycle_fx WHERE label='pack'))) LIKE '42501:%','LC5 owner has no internal oracle grant');
SELECT pg_temp.ok(pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',
 format('UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=clock_timestamp(),revocation_reason=''Unauthorized'' WHERE id=%L',
 (SELECT id FROM lifecycle_fx WHERE label='grant'))) LIKE '42501:%','LC6 employer cannot directly revoke platform grants');
SELECT pg_temp.ok(pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',
 format('INSERT INTO public.scp_interview_pack_pilot_grants(employer_id,pack_version_id,rationale) VALUES(%L,%L,''Unauthorized'')',
 'b7100000-1111-4000-8000-000000000003',(SELECT id FROM lifecycle_fx WHERE label='pack'))) LIKE '42501:%','LC7 direct client grant issuance denied');
SELECT pg_temp.ok(pg_temp.try_as('anon',NULL,'UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=clock_timestamp()') LIKE '42501:%','LC8 anonymous grant mutation denied');
DO $$ DECLARE _n integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','b7100000-0000-4000-8000-000000000003',true); SET LOCAL ROLE authenticated;
 SELECT count(*) INTO _n FROM public.scp_interview_pack_pilot_grants WHERE id='b7100000-2222-4000-8000-000000000001';
 RESET ROLE; PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.ok(_n=0,'LC9 grant reads retain tenant isolation');
END $$;
DO $$ DECLARE _p uuid:=(SELECT id FROM lifecycle_fx WHERE label='pack'); _c uuid; _r uuid; _plan uuid; _session uuid; _q uuid; _hash text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','b7100000-0000-4000-8000-000000000001',true); SET LOCAL ROLE authenticated;
 PERFORM pg_temp.ok(EXISTS(SELECT 1 FROM public.scp_iv_startable_pack_versions('b7100000-1111-4000-8000-000000000001') WHERE pack_version_id=_p AND entitlement_basis='pilot_grant'),
  'LC10 list agrees with granted draft');
 _c:=public.scp_iv_create_case('b7100000-1111-4000-8000-000000000001','Lifecycle ongoing',_p,'Synthetic',NULL,'LC-ongoing');
 INSERT INTO lifecycle_fx VALUES('ongoing',_c);
 PERFORM public.scp_iv_add_source(_c,'employer_requirements','Synthetic requirements','Synthetic original text.','recruitment','Synthetic SQL fixture');
 PERFORM public.scp_iv_mark_sources_ready(_c);
 _plan:=public.scp_iv_record_manual_prep_plan(_c,'60 minutes','AI off','Offer factual correction');
 PERFORM public.scp_iv_approve_prep_plan(_plan,'Human review');
 _session:=public.scp_iv_start_session(_c,'Synthetic interviewer');
 INSERT INTO lifecycle_fx VALUES('session',_session);
 _r:=public.scp_iv_create_case('b7100000-1111-4000-8000-000000000001','Lifecycle report',_p,'Synthetic report',NULL,'LC-report');
 INSERT INTO lifecycle_fx VALUES('reported_case',_r);
 PERFORM public.scp_iv_add_source(_r,'employer_requirements','Synthetic requirements','Synthetic original text.','recruitment','Synthetic SQL fixture');
 PERFORM public.scp_iv_mark_sources_ready(_r);
 _plan:=public.scp_iv_record_manual_prep_plan(_r,'60 minutes','AI off','Offer factual correction');
 PERFORM public.scp_iv_approve_prep_plan(_plan,'Human review');
 _session:=public.scp_iv_start_session(_r,'Synthetic interviewer');
 PERFORM public.scp_iv_set_session_state(_session,'completed','evaluation','Human reflection');
 PERFORM public.scp_iv_begin_evidence_review(_r);
 FOR _q IN SELECT id FROM public.scp_interview_core_questions WHERE pack_version_id=_p LOOP
  PERFORM public.scp_iv_record_assessment(_r,_q,0,'Insufficient evidence, human review.');
 END LOOP;
 PERFORM public.scp_iv_mark_assessed(_r);
 SELECT basis_hash INTO _hash FROM public.scp_iv_preview_report(_r);
 INSERT INTO lifecycle_fx VALUES('report',public.scp_iv_finalise_previewed_report(_r,_hash,NULL));
 RESET ROLE; PERFORM set_config('request.jwt.claim.sub','',true);
END $$;
CREATE TEMP TABLE lifecycle_saved_content AS SELECT * FROM scp_private.interview_content_snapshots
 WHERE case_id IN(SELECT id FROM lifecycle_fx WHERE label IN('ongoing','reported_case'));
CREATE TEMP TABLE lifecycle_saved_report AS SELECT id,payload,content_hash FROM public.scp_interview_reports
 WHERE id=(SELECT id FROM lifecycle_fx WHERE label='report');
CREATE TEMP TABLE lifecycle_saved_hash AS SELECT content_hash FROM public.scp_interview_pack_versions WHERE id=(SELECT id FROM lifecycle_fx WHERE label='pack');
SELECT pg_temp.ok((SELECT count(*)=2 FROM lifecycle_saved_content WHERE jsonb_array_length(manifest#>'{content,questions}')=8
 AND jsonb_array_length(manifest#>'{content,competencies}')=6 AND provenance='case_created'),'LC11 real cases freeze eight questions and six competencies');
SELECT pg_temp.ok((SELECT status='reported' FROM public.scp_interview_cases WHERE id=(SELECT id FROM lifecycle_fx WHERE label='reported_case')),'LC12 AI-off human report finalised normally');

CREATE FUNCTION pg_temp.check_revocation(_status text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE _grant uuid:=(SELECT id FROM lifecycle_fx WHERE label='grant'); _result text; _field text; _sql text;
BEGIN
 -- Each negative targets the real trigger through the existing service path.
 FOREACH _sql IN ARRAY ARRAY[
  'rationale=''changed''','usage_mode=''employer_pilot''','environment=''staging''',
  'starts_on=current_date-2','expires_on=current_date+60','cohort_user_ids=ARRAY[]::uuid[]',
  'employer_id=''b7100000-1111-4000-8000-000000000003''::uuid',
  'granted_by=''b7100000-0000-4000-8000-000000000003''::uuid','granted_at=clock_timestamp()',
  'id=''b7100000-2222-4000-8000-000000000099''::uuid',
  'pack_version_id=(SELECT id FROM public.scp_interview_pack_versions WHERE id<>(SELECT id FROM lifecycle_fx WHERE label=''pack'') LIMIT 1)'] LOOP
  _result:=pg_temp.try_as('service_role',NULL,format('UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=clock_timestamp(),revocation_reason=''Stop'',%s WHERE id=%L',_sql,_grant));
  PERFORM pg_temp.ok(_result LIKE '23514:%REVOCATION_ONLY%',format('LC13 %s rejects revocation plus %s',_status,split_part(_sql,'=',1)));
 END LOOP;
 _result:=pg_temp.try_as('service_role',NULL,format('UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=clock_timestamp() WHERE id=%L',_grant));
 PERFORM pg_temp.ok(_result LIKE '23514:%scp_interview_pilot_revocation_check%',format('LC14 %s reason remains required',_status));
 _result:=pg_temp.try_as('service_role',NULL,format('UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=clock_timestamp(),revocation_reason=''   '' WHERE id=%L',_grant));
 PERFORM pg_temp.ok(_result LIKE '23514:%scp_interview_pilot_revocation_check%',format('LC15 %s blank reason denied',_status));
 -- Roll back the successful revocation and its event after checking both.
 BEGIN
  _result:=pg_temp.try_as('service_role','b7100000-0000-4000-8000-000000000004',format('UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=clock_timestamp(),revoked_by=%L,revocation_reason=''Deliberate stop'' WHERE id=%L','b7100000-0000-4000-8000-000000000004',_grant));
  PERFORM pg_temp.ok(NOT public.scp_interview_pilot_grant_active('b7100000-1111-4000-8000-000000000001',(SELECT id FROM lifecycle_fx WHERE label='pack'),'b7100000-0000-4000-8000-000000000001'),format('LC16a %s revoked grant no longer authorizes',_status));
  PERFORM pg_temp.ok(_result='ok',format('LC16 %s genuine service revocation succeeds (%s)',_status,_result));
  PERFORM pg_temp.ok((SELECT revoked_at IS NOT NULL AND revoked_by='b7100000-0000-4000-8000-000000000004' AND revocation_reason='Deliberate stop' FROM public.scp_interview_pack_pilot_grants WHERE id=_grant),format('LC17 %s exact revocation attribution retained',_status));
  PERFORM pg_temp.ok(EXISTS(SELECT 1 FROM public.scp_interview_pack_events WHERE pack_version_id=(SELECT id FROM lifecycle_fx WHERE label='pack') AND event='draft_updated' AND metadata->>'pilot_grant'='updated' AND actor_id='b7100000-0000-4000-8000-000000000004'
   AND reason='Deliberate stop' AND (metadata->>'revoked')::boolean),format('LC18 %s revocation audit recorded',_status));
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback successful synthetic revocation';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $$;
SELECT pg_temp.check_revocation('draft');
SAVEPOINT lifecycle_window;
UPDATE public.scp_interview_pack_pilot_grants SET starts_on=current_date-30,expires_on=current_date-1 WHERE id=(SELECT id FROM lifecycle_fx WHERE label='grant');
SELECT pg_temp.ok(public.scp_iv_case_start_basis('b7100000-1111-4000-8000-000000000001',(SELECT id FROM lifecycle_fx WHERE label='pack'),'b7100000-0000-4000-8000-000000000001') IS NULL,'LC43 expired restricted grant remains denied');
UPDATE public.scp_interview_pack_pilot_grants SET starts_on=current_date+1,expires_on=current_date+30 WHERE id=(SELECT id FROM lifecycle_fx WHERE label='grant');
SELECT pg_temp.ok(public.scp_iv_case_start_basis('b7100000-1111-4000-8000-000000000001',(SELECT id FROM lifecycle_fx WHERE label='pack'),'b7100000-0000-4000-8000-000000000001') IS NULL,'LC44 future restricted grant remains denied');
ROLLBACK TO SAVEPOINT lifecycle_window;
INSERT INTO public.employers(id,name,slug,status) VALUES('b7100000-1111-4000-8000-000000000005','Suspended fixture','lifecycle-suspended','suspended');
INSERT INTO public.scp_interview_pack_pilot_grants(employer_id,pack_version_id,rationale,usage_mode,environment,expires_on)
 SELECT 'b7100000-1111-4000-8000-000000000005',id,'Synthetic suspended grant','internal_qa','development',current_date+30 FROM lifecycle_fx WHERE label='pack';
SELECT pg_temp.ok(public.scp_iv_case_start_basis('b7100000-1111-4000-8000-000000000005',(SELECT id FROM lifecycle_fx WHERE label='pack'),'b7100000-0000-4000-8000-000000000001') IS NULL,'LC45 suspended employer remains denied despite valid grant');
-- Private fixture walks the existing transition ladder without fabricating
-- review decisions or invoking publish. It is rolled back. Actual withdrawal
-- below uses the unchanged publisher-authenticated governed RPCs.
DO $$ DECLARE _s text;
BEGIN
 PERFORM set_config('scp_interview.governed_transition','on',true);
 FOREACH _s IN ARRAY ARRAY['expert_review','legal_review','cognitive_review','published'] LOOP
  UPDATE public.scp_interview_pack_versions SET content_status=_s WHERE id=(SELECT id FROM lifecycle_fx WHERE label='pack');
 END LOOP;
 PERFORM set_config('scp_interview.governed_transition','off',true);
END $$;
SELECT pg_temp.check_revocation('published');
SELECT pg_temp.ok(pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',format('SELECT public.scp_interview_suspend_version(%L,''Unauthorized'')',
 (SELECT id FROM lifecycle_fx WHERE label='pack'))) LIKE '42501:%NOT_PUBLISHER%','LC19 employer cannot withdraw content');
SELECT pg_temp.ok(pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000004',format('SELECT public.scp_interview_suspend_version(%L,''Deliberate synthetic suspension'')',
 (SELECT id FROM lifecycle_fx WHERE label='pack')))='ok','LC20 existing publisher can suspend an in-use version');
CREATE FUNCTION pg_temp.check_withdrawn(_status text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE _p uuid:=(SELECT id FROM lifecycle_fx WHERE label='pack'); _n integer; _result text;
BEGIN
 PERFORM pg_temp.ok(public.scp_interview_pilot_grant_active('b7100000-1111-4000-8000-000000000001',_p,'b7100000-0000-4000-8000-000000000001'),format('LC21 %s test really retains a valid grant',_status));
 PERFORM pg_temp.ok(public.scp_iv_case_start_basis('b7100000-1111-4000-8000-000000000001',_p,'b7100000-0000-4000-8000-000000000001') IS NULL,format('LC22 %s denies grant fallback for NEW cases',_status));
 PERFORM set_config('request.jwt.claim.sub','b7100000-0000-4000-8000-000000000001',true); SET LOCAL ROLE authenticated;
 SELECT count(*) INTO _n FROM public.scp_iv_startable_pack_versions('b7100000-1111-4000-8000-000000000001') WHERE pack_version_id=_p;
 RESET ROLE; PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.ok(_n=0,format('LC23 %s absent from startable list',_status));
 _result:=pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_create_case(%L,''Denied'',%L,''Synthetic'',NULL,''LC-denied'')','b7100000-1111-4000-8000-000000000001',_p));
 PERFORM pg_temp.ok(_result LIKE '42501:%PACK_NOT_USABLE%',format('LC24 %s direct create RPC denied',_status));
 _result:=pg_temp.try_as('service_role','b7100000-0000-4000-8000-000000000001',format('INSERT INTO public.scp_interview_cases(employer_id,pack_version_id,role_version_id,title,candidate_display_name,candidate_external_ref) SELECT %L,id,role_version_id,''Denied service bypass'',''Synthetic'',''LC-direct'' FROM public.scp_interview_pack_versions WHERE id=%L','b7100000-1111-4000-8000-000000000001',_p));
 PERFORM pg_temp.ok(_result LIKE '42501:%PACK_NOT_USABLE%',format('LC25 %s direct service INSERT cannot bypass binding',_status));
 _result:=pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',format('INSERT INTO public.scp_interview_cases(employer_id,pack_version_id,role_version_id,title,candidate_display_name,candidate_external_ref) SELECT %L,id,role_version_id,''Denied client bypass'',''Synthetic'',''LC-direct'' FROM public.scp_interview_pack_versions WHERE id=%L','b7100000-1111-4000-8000-000000000001',_p));
 PERFORM pg_temp.ok(_result LIKE '42501:%',format('LC26 %s direct authenticated INSERT retains denial',_status));
 _result:=pg_temp.try_as('service_role',NULL,format('INSERT INTO public.scp_interview_pack_pilot_grants(employer_id,pack_version_id,rationale) VALUES(%L,%L,''New forbidden grant'')','b7100000-1111-4000-8000-000000000003',_p));
 PERFORM pg_temp.ok(_result LIKE '23514:%PILOT_ON_WITHDRAWN_PACK%',format('LC27 %s new grant still forbidden',_status));
 _result:=pg_temp.try_as('service_role',NULL,format('UPDATE public.scp_interview_pack_pilot_grants SET expires_on=current_date+60 WHERE id=%L',(SELECT id FROM lifecycle_fx WHERE label='grant')));
 PERFORM pg_temp.ok(_result LIKE '23514:%PILOT_ON_WITHDRAWN_PACK%',format('LC28 %s ordinary grant extension still forbidden',_status));
 _result:=pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_case_frozen_content(%L)',(SELECT id FROM lifecycle_fx WHERE label='ongoing')));
 PERFORM pg_temp.ok(_result='ok',format('LC29 %s existing case remains readable',_status));
 _result:=pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000001',format('SELECT public.scp_iv_set_session_state(%L,''paused'')',(SELECT id FROM lifecycle_fx WHERE label='session')));
 PERFORM pg_temp.ok(_result='ok',format('LC30 %s existing session continuation remains permitted',_status));
 PERFORM pg_temp.ok(NOT EXISTS(SELECT 1 FROM lifecycle_saved_content b FULL JOIN scp_private.interview_content_snapshots s ON s.case_id=b.case_id WHERE b.case_id IS NOT NULL AND to_jsonb(b) IS DISTINCT FROM to_jsonb(s)),format('LC31 %s snapshot stays byte-equivalent',_status));
 PERFORM pg_temp.ok((SELECT r.payload=b.payload AND r.content_hash=b.content_hash FROM public.scp_interview_reports r JOIN lifecycle_saved_report b ON r.id=b.id),format('LC32 %s final report stays frozen',_status));
 PERFORM pg_temp.ok((SELECT v.content_hash IS NOT DISTINCT FROM b.content_hash FROM public.scp_interview_pack_versions v CROSS JOIN lifecycle_saved_hash b WHERE v.id=_p),format('LC33 %s lifecycle never restamps legacy hash',_status));
 _result:=pg_temp.try_as('service_role',NULL,format('UPDATE public.scp_interview_core_questions SET prompt_sv=prompt_sv||'' Silent amendment'' WHERE pack_version_id=%L',_p));
 PERFORM pg_temp.ok(_result LIKE '23514:%CONTENT_IN_USE%',format('LC34 %s service content rewrite still forbidden',_status));
 PERFORM pg_temp.check_revocation(_status);
END $$;
SELECT pg_temp.check_withdrawn('suspended');
SELECT pg_temp.ok(pg_temp.try_as('authenticated','b7100000-0000-4000-8000-000000000004',format('SELECT public.scp_interview_retire_version(%L,''Deliberate synthetic retirement'')',
 (SELECT id FROM lifecycle_fx WHERE label='pack')))='ok','LC35 publisher can retire an in-use version');
SELECT pg_temp.check_withdrawn('retired');

-- Executed negative controls: recreate each original defect inside a savepoint,
-- demand that the SAME runtime checks reject it, then restore exact definitions.
CREATE FUNCTION pg_temp.assertion_must_fail(_sql text,_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE _failed boolean:=false;
BEGIN
 BEGIN EXECUTE _sql;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
  _failed:=true;
 END;
 PERFORM pg_temp.ok(_failed,_label);
END $$;
SAVEPOINT lifecycle_old_start_mutant;
DO $$ DECLARE _def text;_needle text:='IF _status IS NULL OR _status IN (''suspended'', ''retired'') THEN';
BEGIN
 SELECT pg_get_functiondef('public.scp_iv_case_start_basis(uuid,uuid,uuid)'::regprocedure) INTO _def;
 IF position(_needle IN _def)=0 THEN RAISE EXCEPTION 'start mutant anchor missing'; END IF;
 EXECUTE replace(_def,_needle,'IF _status IS NULL THEN');
END $$;
SELECT pg_temp.assertion_must_fail('SELECT pg_temp.check_withdrawn(''retired'')','LC-NC1 same terminal test detects restored grant fallback defect');
ROLLBACK TO SAVEPOINT lifecycle_old_start_mutant;
SAVEPOINT lifecycle_cofield_mutant;
DO $$ DECLARE _def text;_needle text:=E'    IF (to_jsonb(NEW) - ARRAY[''revoked_at'',''revoked_by'',''revocation_reason''])\n       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[''revoked_at'',''revoked_by'',''revocation_reason'']) THEN';
BEGIN
 SELECT pg_get_functiondef('public.scp_interview_guard_pilot_grant()'::regprocedure) INTO _def;
 IF position(_needle IN _def)=0 THEN RAISE EXCEPTION 'cofield mutant anchor missing'; END IF;
 EXECUTE replace(_def,_needle,'    IF false THEN');
END $$;
SELECT pg_temp.assertion_must_fail('SELECT pg_temp.check_revocation(''retired'')','LC-NC2 same revocation test detects allowed co-field rewrite');
ROLLBACK TO SAVEPOINT lifecycle_cofield_mutant;

SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.scp_interview_pack_pilot_grants','UPDATE')
 AND NOT has_table_privilege('authenticated','public.scp_interview_pack_pilot_grants','INSERT')
 AND NOT has_function_privilege('authenticated','scp_private.interview_content_statement_lock()','EXECUTE')
 AND NOT has_function_privilege('service_role','scp_private.interview_content_statement_lock()','EXECUTE'),'LC36 no grant or private-lock permission widened');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.scp_interview_pack_pilot_grants'::regclass
 AND tgname='ri_pilot_grant_serialise' AND tgtype=22 AND tgenabled='O'),'LC37 BEFORE statement INSERT/UPDATE grant serialization is active');
SELECT pg_temp.ok((SELECT bool_and(position('scp_private.interview_content_lock()' IN prosrc)<position('FOR UPDATE' IN prosrc)
 AND position('SCP_INTERVIEW_NOT_PUBLISHER' IN prosrc)<position('scp_private.interview_content_lock()' IN prosrc)) FROM pg_proc
 WHERE oid IN('public.scp_interview_suspend_version(uuid,text)'::regprocedure,'public.scp_interview_retire_version(uuid,text)'::regprocedure)),
 'LC38 withdrawal checks publisher then takes content lock before version row');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM lifecycle_old_snapshots b LEFT JOIN scp_private.interview_content_snapshots s ON s.case_id=b.case_id WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(s))
 AND NOT EXISTS(SELECT 1 FROM lifecycle_old_locks b LEFT JOIN scp_private.interview_content_locks l ON l.kind=b.kind AND l.content_id=b.content_id WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(l)),
 'LC39 all pre-existing snapshots and permanent locks unchanged');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM lifecycle_old_reports b LEFT JOIN public.scp_interview_reports r ON r.id=b.id WHERE b.payload IS DISTINCT FROM r.payload OR b.content_hash IS DISTINCT FROM r.content_hash),
 'LC40 all pre-existing final report rows unchanged');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM lifecycle_function_contract c JOIN pg_proc p ON p.oid=c.signature::regprocedure
 WHERE (c.proowner,c.proacl,c.proconfig,c.provolatile,c.prosecdef,c.pronargdefaults) IS DISTINCT FROM (p.proowner,p.proacl,p.proconfig,p.provolatile,p.prosecdef,p.pronargdefaults)),
 'LC41 effective function ACL owner config defaults and security unchanged by tests');
SELECT pg_temp.ok(NOT (SELECT ai_enabled FROM public.scp_interview_ai_config WHERE id),'LC42 AI remains off');
ROLLBACK;
