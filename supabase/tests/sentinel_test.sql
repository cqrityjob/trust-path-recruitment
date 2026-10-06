\set ON_ERROR_STOP on
BEGIN;
\ir recruitment_assignment_fixture.sql
CREATE TEMP TABLE sf AS SELECT * FROM public.sentinel_forms;
GRANT SELECT ON sf TO authenticated;
INSERT INTO public.scp_test_grants(employer_id,purpose,definition_id,reason,authorised_by,expires_at)
SELECT employer,'closed_test',v.definition_id,'Sentinel disposable synthetic integration',owner_user,now()+interval '1 day'
FROM rj, public.scp_assessment_versions v WHERE v.id=(SELECT assessment_version_id FROM sf);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(format('SELECT * FROM public.scp_assign_from_application(%L,%L,%L)',(SELECT employer FROM rj),(SELECT application FROM rj),(SELECT assessment_version_id FROM sf)), 'SENTINEL_RELEASE_REQUIRED','S1 production disabled');
SELECT pg_temp.must_fail('SELECT * FROM public.sentinel_forms','permission denied','S2 private bank denied');
SELECT pg_temp.must_fail('SELECT * FROM public.sentinel_sessions','permission denied','S3 raw sessions denied');
SELECT pg_temp.must_fail('SELECT public.sentinel_review()','SENTINEL_AUTHOR_REQUIRED','S4 employer cannot read keys');
RESET ROLE;
INSERT INTO public.scp_fixture_access(employer_id,reason) SELECT employer,'Synthetic Sentinel preview' FROM rj;
UPDATE public.sentinel_forms SET preview_only=true,assignments_enabled=true;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE sa AS SELECT * FROM public.scp_assign_from_application((SELECT employer FROM rj),(SELECT application FROM rj),(SELECT assessment_version_id FROM sf));
CREATE TEMP TABLE sr AS SELECT * FROM public.scp_assign_from_application((SELECT employer FROM rj),(SELECT application FROM rj),(SELECT assessment_version_id FROM sf));
SELECT pg_temp.ok((SELECT sa.attempt_id=sr.attempt_id FROM sa,sr),'S5 assignment retry idempotent');
SELECT pg_temp.ok((SELECT (public.sentinel_catalog((SELECT employer FROM rj))->0->>'assignable')::boolean),'S6 preview catalog assignable');
SELECT pg_temp.ok(public.sentinel_session((SELECT attempt_id FROM sa)) IS NULL,'S7 employer cannot sit candidate attempt');
GRANT SELECT ON sa TO authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000009';
SELECT pg_temp.ok(public.sentinel_report((SELECT attempt_id FROM sa),(SELECT employer FROM rj)) IS NULL,'S8 cross tenant report refused');
SELECT pg_temp.ok(public.sentinel_catalog((SELECT employer FROM rj))='[]','S9 cross tenant catalog refused');
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(public.sentinel_session((SELECT attempt_id FROM sa)) IS NULL,'S10 other candidate refused');
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(public.sentinel_session((SELECT attempt_id FROM sa))->>'status'='ready','S11 untimed introduction');
SELECT pg_temp.ok(public.sentinel_session((SELECT attempt_id FROM sa))->'questions'='[]','S12 scored items withheld before start');
SELECT pg_temp.ok(jsonb_array_length(public.sentinel_practice((SELECT attempt_id FROM sa)))=3,'S13 three separate exercises');
SELECT pg_temp.must_fail(format('SELECT public.sentinel_employer_action(%L,''accommodation'',2100)',(SELECT attempt_id FROM sa)),'SENTINEL_ACCESS_DENIED','S14 candidate cannot extend deadline');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT public.sentinel_employer_action((SELECT attempt_id FROM sa),'accommodation',2100);
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE started AS SELECT public.sentinel_session((SELECT attempt_id FROM sa),'start') AS value;
SELECT pg_temp.ok((SELECT value->>'durationSeconds'='2100' FROM started),'S15 prestart accommodation');
SELECT pg_temp.ok((SELECT value->>'deadline'=public.sentinel_session((SELECT attempt_id FROM sa),'start')->>'deadline' FROM started),'S16 reopening cannot reset deadline');
SELECT pg_temp.ok(jsonb_array_length(public.sentinel_session((SELECT attempt_id FROM sa))->'questions')=20,'S17 twenty scored items');
SELECT pg_temp.ok(public.sentinel_session((SELECT attempt_id FROM sa))::text !~ '"(key|family|seed|strategies|explanation|designDifficulty)"','S18 candidate payload has no private metadata');
SELECT pg_temp.must_fail(format('SELECT public.sentinel_session(%L,''save'',''forged'',''o0'',1)',(SELECT attempt_id FROM sa)),'SENTINEL_INVALID_OPTION','S19 item tampering refused');
SELECT pg_temp.must_fail(format('SELECT public.scp_submit_attempt(%L)',(SELECT attempt_id FROM sa)),'SENTINEL_USE_TIMED_RUNNER','S20 generic competency scorer refused');
DO $$ DECLARE a uuid := (SELECT attempt_id FROM sa); i jsonb; state jsonb; first_id text; first_option text;
BEGIN
 state:=public.sentinel_session(a);
 FOR i IN SELECT value FROM jsonb_array_elements((SELECT items FROM sf)) LOOP
  state:=public.sentinel_session(a,'save',i->'question'->>'id',i->>'key',(state->>'revision')::int);
 END LOOP;
 first_id:=(SELECT items->0->'question'->>'id' FROM sf);first_option:=(SELECT items->0->>'key' FROM sf);
 PERFORM pg_temp.ok(public.sentinel_session(a,'save',first_id,first_option,0)->>'revision'=state->>'revision','S21 accepted save retry is idempotent');
 PERFORM pg_temp.must_fail(format('SELECT public.sentinel_session(%L,''save'',%L,%L,0)',a,first_id,CASE WHEN first_option='o0' THEN 'o1' ELSE 'o0' END),'SENTINEL_REVISION_CONFLICT','S22 stale tab cannot overwrite');
 PERFORM pg_temp.ok(public.sentinel_session(a)->'answers'=state->'answers','S23 refresh restores server answers');
 state:=public.sentinel_session(a,'finish');
 PERFORM pg_temp.ok(state->>'status'='completed','S24 explicit completion');
 PERFORM pg_temp.ok(state->'report'='null','S25 candidate report withheld by default');
 PERFORM pg_temp.ok(public.sentinel_session(a,'finish')->>'revision'=state->>'revision','S26 duplicate submit idempotent');
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT report->>'correct'='20' AND report->>'incorrect'='0' AND report->>'unanswered'='0' FROM public.sentinel_sessions WHERE attempt_id=(SELECT attempt_id FROM sa)),'S27 server raw scoring');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.scp_competency_evidence WHERE subject_id=(SELECT subject_id FROM sa)),'S28 no competency or passport evidence');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(public.sentinel_report((SELECT attempt_id FROM sa),(SELECT employer FROM rj))->'report'->>'correct'='20','S29 permitted employer raw report');
SELECT public.sentinel_employer_action((SELECT attempt_id FROM sa),'release');
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(public.sentinel_report((SELECT attempt_id FROM sa))->'report'->>'correct'='20','S30 released candidate report');
RESET ROLE;
-- A second application creates a distinct timed attempt for expiry testing.
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,status,consent_given_at)
SELECT gen_random_uuid(),job,employer,bo,'submitted',now() FROM rj RETURNING id AS second_application \gset
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE sb AS SELECT * FROM public.scp_assign_from_application((SELECT employer FROM rj),:'second_application',(SELECT assessment_version_id FROM sf));
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000003';
SELECT public.sentinel_session((SELECT attempt_id FROM sb),'start');
RESET ROLE;
UPDATE public.sentinel_sessions SET deadline=clock_timestamp()-interval '1 second' WHERE attempt_id=(SELECT attempt_id FROM sb);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(public.sentinel_session((SELECT attempt_id FROM sb),'save',(SELECT items->0->'question'->>'id' FROM sf),'o0',1)->>'status'='timed_out','S31 late answers finalise timeout without accepting');
RESET ROLE;
SELECT pg_temp.ok((SELECT answers='{}' AND report->>'correct'='0' AND report->>'unanswered'='20' FROM public.sentinel_sessions WHERE attempt_id=(SELECT attempt_id FROM sb)),'S32 timeout scores accepted answers only');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.sentinel_finish_internal(uuid,boolean)','EXECUTE'),'S33 internal scorer not callable');
SELECT pg_temp.ok(NOT has_function_privilege('anon','public.sentinel_session(uuid,text,text,text,integer)','EXECUTE'),'S34 anonymous attempt access refused');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.sentinel_sessions'::regclass AND confrelid='auth.users'::regclass AND confdeltype='c'),'S35 account erasure discovers cascading session data');
ROLLBACK;
