-- Full-current-schema stage. Synthetic fixture only; all writes roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.conflict_ok(_condition boolean,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF _condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: CONFLICT %',_label; END IF;
 RAISE NOTICE 'ok  CONFLICT %',_label;
END $$;
CREATE FUNCTION pg_temp.conflict_result(_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE _sql; RETURN 'ok';
 EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||':'||SQLERRM;
END $$;
SELECT pg_temp.conflict_ok((SELECT count(*)=12 FROM scp_private.interview_conflict_prior_functions),'01 exact repair scope');
SELECT pg_temp.conflict_ok(NOT has_table_privilege('authenticated','scp_private.interview_conflict_prior_functions','SELECT')
 AND NOT has_table_privilege('service_role','scp_private.interview_conflict_prior_functions','SELECT')
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='scp_private.interview_conflict_prior_functions'::regclass),'02 recovery journal remains private');
DO $$ DECLARE _r record;_def text;
BEGIN
 FOR _r IN SELECT signature FROM scp_private.interview_conflict_prior_functions
 WHERE signature NOT IN ('public.scp_iv_set_session_state(uuid,text,text,text,text)','public.scp_iv_guard_finding_revision()') LOOP
  _def:=pg_get_functiondef(_r.signature::regprocedure);
  PERFORM pg_temp.conflict_ok(position('PT409' IN _def)>0 AND position('serialization_failure' IN _def)=0,'03 domain transport '||_r.signature);
  PERFORM pg_temp.conflict_ok(has_function_privilege('authenticated',_r.signature,'EXECUTE')
    AND NOT has_function_privilege('anon',_r.signature,'EXECUTE'),'04 unchanged caller boundary '||_r.signature);
 END LOOP;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('b7080000-0000-4000-8000-000000000011','conflict-owner@fixture.invalid'),
 ('b7080000-0000-4000-8000-000000000012','conflict-candidate@fixture.invalid');
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('b7080000-1111-4000-8000-000000000011','Conflict synthetic','conflict-transport-synthetic','active');
INSERT INTO public.employer_memberships(user_id,employer_id,role,status) VALUES
 ('b7080000-0000-4000-8000-000000000011','b7080000-1111-4000-8000-000000000011','owner','active');
INSERT INTO public.jobs(id,employer_id,slug,short_id,title_sv,title_en,status,application_method) VALUES
 ('b7080000-2222-4000-8000-000000000011','b7080000-1111-4000-8000-000000000011','conflict-transport-job','RICAS011','Syntetisk roll','Synthetic role','draft','internal');
INSERT INTO public.recruitment_settings(job_id,employer_id,receipt_enabled) VALUES
 ('b7080000-2222-4000-8000-000000000011','b7080000-1111-4000-8000-000000000011',false);
UPDATE public.jobs SET status='published',expires_at=now()+interval '30 days' WHERE id='b7080000-2222-4000-8000-000000000011';
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,consent_given_at,cover_note) VALUES
 ('b7080000-3333-4000-8000-000000000011','b7080000-2222-4000-8000-000000000011','b7080000-1111-4000-8000-000000000011','b7080000-0000-4000-8000-000000000012',now(),'Synthetic CAS transport');
CREATE TEMP TABLE conflict_booking(id uuid);
GRANT ALL ON conflict_booking TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='b7080000-0000-4000-8000-000000000011';
INSERT INTO conflict_booking SELECT (public.rec_save_booking(NULL,'b7080000-3333-4000-8000-000000000011',now()+interval '1 day',45,'Europe/Stockholm','phone',NULL,NULL,'Synthetic',NULL)->>'id')::uuid;
SELECT pg_temp.conflict_ok(pg_temp.conflict_result('SELECT public.rec_set_recruitment_responsible(''b7080000-2222-4000-8000-000000000011'',NULL,-1)')='PT409:STALE_VERSION','05 recruitment assignment stale');
SELECT pg_temp.conflict_ok(pg_temp.conflict_result('SELECT public.rec_complete_recruitment(''b7080000-2222-4000-8000-000000000011'',''completed'',NULL,-1)')='PT409:STALE_VERSION','06 completion stale');
SELECT pg_temp.conflict_ok(pg_temp.conflict_result('SELECT public.rec_set_application_responsible(''b7080000-3333-4000-8000-000000000011'',NULL,-1)')='PT409:STALE_VERSION','07 application assignment stale');
SELECT pg_temp.conflict_ok(pg_temp.conflict_result('SELECT public.rec_set_application_stage(''b7080000-3333-4000-8000-000000000011'',''reviewing'',''interview'',NULL)')='PT409:STALE_APPLICATION_STAGE','08 stage stale');
SELECT pg_temp.conflict_ok(pg_temp.conflict_result(format('SELECT public.rec_save_booking(%L,''b7080000-3333-4000-8000-000000000011'',now()+interval ''1 day'',45,''Europe/Stockholm'',''phone'',NULL,NULL,''Synthetic'',-1)',(SELECT id FROM conflict_booking)))='PT409:STALE_VERSION','09 booking stale');
SELECT pg_temp.conflict_ok(pg_temp.conflict_result(format('SELECT public.rec_set_booking_status(%L,''cancelled'',NULL,-1)',(SELECT id FROM conflict_booking)))='PT409:STALE_VERSION','10 booking status stale');
SELECT pg_temp.conflict_ok(pg_temp.conflict_result('SELECT public.rec_set_receipt_settings(''b7080000-2222-4000-8000-000000000011'',false,NULL,NULL,NULL,NULL,-1)')='PT409:STALE_VERSION','11 receipt stale');
RESET ROLE;
SELECT pg_temp.conflict_ok((SELECT status='submitted' FROM public.job_applications WHERE id='b7080000-3333-4000-8000-000000000011')
 AND NOT EXISTS(SELECT 1 FROM public.recruitment_messages WHERE application_id='b7080000-3333-4000-8000-000000000011'),'12 stale attempts never move stage or send messages');
-- Genuine engine serialization failures retain their native SQLSTATE. This
-- test does not make a blanket replacement of 40001 or change Sentinel/CV.
SELECT pg_temp.conflict_ok(pg_temp.conflict_result('DO $x$ BEGIN RAISE EXCEPTION ''engine witness'' USING ERRCODE=''serialization_failure''; END $x$')='40001:engine witness','13 genuine serialization state preserved');
ROLLBACK;
