-- Synthetic, disposable database only. Never execute against production.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='UTC';
\ir recruitment_assignment_fixture.sql
INSERT INTO public.sp_passport_profiles(holder_user_id,display_name) SELECT anna,'Synthetic holder' FROM rj;
INSERT INTO public.sp_claims(holder_user_id,claim_type,title) SELECT anna,'training','Synthetic own training' FROM rj;
-- Seed historical own test data, as scp_a_rollback_test does; restore the retirement guard immediately.
ALTER TABLE public.assessment_runs DISABLE TRIGGER assessment_runs_block_retired_definition_trg;
INSERT INTO public.assessment_runs(user_id,assessment_id,assessment_version_id,graph_version)
 SELECT r.anna,v.assessment_id,v.id,'cig-v1' FROM rj r CROSS JOIN public.assessment_versions v
 WHERE v.assessment_id='security-guard-foundation' ORDER BY v.id LIMIT 1;
ALTER TABLE public.assessment_runs ENABLE TRIGGER assessment_runs_block_retired_definition_trg;
CREATE TEMP TABLE retained AS SELECT (SELECT count(*) FROM auth.users) users,
 (SELECT count(*) FROM public.sp_claims) claims,
 (SELECT count(*) FROM public.assessment_runs) own_runs;
GRANT SELECT ON retained TO authenticated,service_role;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000009';
SELECT pg_temp.must_fail(format('SELECT public.rec_retention_overview(%L)',(SELECT employer FROM rj)),
 'RECRUITMENT_NOT_FOUND','L1 other organisation cannot read lifecycle');
SELECT pg_temp.must_fail(format('SELECT public.rec_archive_material(%L,%L,true)',(SELECT job FROM rj),(SELECT application FROM rj)),
 'RECRUITMENT_NOT_FOUND','L2 cross-organisation archive refused');
SELECT pg_temp.must_fail(format('SELECT public.rec_set_retention(%L,6)',(SELECT employer FROM rj)),
 'RECRUITMENT_NOT_PERMITTED','L3 cross-organisation retention write refused');
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(format('SELECT public.rec_archive_material(%L,%L,true)',(SELECT job FROM rj),(SELECT application FROM rj)),
 'APPLICATION_NOT_CLOSED','L4 active application cannot be archived');
SELECT pg_temp.must_fail(format('SELECT public.rec_preview_erasure(%L,NULL)',(SELECT job FROM rj)),
 'RETENTION_RECRUITMENT_NOT_COMPLETED','L5 active recruitment cannot be erased');
SELECT public.rec_set_retention((SELECT employer FROM rj),6);
SELECT pg_temp.ok((public.rec_retention_overview((SELECT employer FROM rj))->>'months')::int=6,'L6 owner may choose six months');
SELECT pg_temp.must_fail(format('SELECT public.rec_set_retention(%L,12)',(SELECT employer FROM rj)),
 'RETENTION_PERIOD_INVALID','L7 unsupported period refused');
CREATE TEMP TABLE assigned AS SELECT * FROM public.scp_assign_from_application(
 (SELECT employer FROM rj),(SELECT application FROM rj),(SELECT version_id FROM rjv));
SELECT public.rec_add_comment((SELECT application FROM rj),'Synthetic note');
SELECT public.rec_save_booking(NULL,(SELECT application FROM rj),now()+interval '1 day',30,'Europe/Stockholm','phone',NULL,NULL,NULL,NULL);
RESET ROLE;
RESET request.jwt.claim.sub;
CREATE TEMP TABLE case_material AS
 WITH inserted AS (INSERT INTO public.scp_interview_cases(employer_id,job_id,application_id,candidate_user_id,
 candidate_display_name,pack_version_id,role_version_id,title,created_by)
 SELECT employer,job,application,anna,'Synthetic candidate',pv.id,rv.id,'Synthetic interview',owner_user
 FROM rj CROSS JOIN public.scp_interview_pack_versions pv CROSS JOIN public.scp_role_versions rv LIMIT 1 RETURNING id)
 SELECT id FROM inserted;
INSERT INTO public.scp_interview_reports(case_id,pack_version_id,role_version_id) SELECT id,pack_version_id,role_version_id FROM public.scp_interview_cases WHERE id=(SELECT id FROM case_material);
INSERT INTO public.scp_interview_case_events(case_id,event,actor_kind,actor_id)
 SELECT c.id,'case_created','human',r.owner_user FROM case_material c CROSS JOIN rj r;
CREATE TEMP TABLE report_material AS SELECT gen_random_uuid() manifest,gen_random_uuid() participant,gen_random_uuid() employer;
INSERT INTO public.scp_report_computation_manifests(id,attempt_id,subject_id,issuer_organization_id,
 participant_snapshot_id,employer_snapshot_id,participant_report_version_id,employer_report_version_id,
 calculated_at,calculation_schema_version,scoring_model_version,signal_model_version,threshold_version,evidence_state_version,evidence_scope_version,brief_version,competency_mapping_version,released_by_role,body,canonical_sha256)
 SELECT m.manifest,a.id,a.subject_id,a.issuer_organization_id,m.participant,m.employer,v.id,v.id,
 now(),'v1','v1','v1','v1','v1','v1','v1','v1','owner','{"computation":{},"versions":{}}',public.scp_report_manifest_hash('{"computation":{},"versions":{}}')
 FROM report_material m CROSS JOIN public.scp_attempts a CROSS JOIN public.scp_report_versions v
 WHERE a.id=(SELECT attempt_id FROM assigned) LIMIT 1;
INSERT INTO public.scp_report_snapshots(id,attempt_id,subject_id,report_version_id,audience,payload,manifest_id,canonical_sha256)
 SELECT CASE WHEN au.audience='participant' THEN m.participant ELSE m.employer END,a.id,a.subject_id,
 v.id,au.audience,'{}',m.manifest,public.scp_report_manifest_hash('{"computation":{},"versions":{}}')
 FROM report_material m CROSS JOIN public.scp_attempts a CROSS JOIN
 (SELECT id FROM public.scp_report_versions LIMIT 1) v CROSS JOIN (VALUES('participant'),('employer')) au(audience)
 WHERE a.id=(SELECT attempt_id FROM assigned);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
GRANT SELECT ON case_material,report_material TO service_role;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.set_application_status((SELECT application FROM rj),'rejected',NULL);
SELECT public.rec_archive_material((SELECT job FROM rj),(SELECT application FROM rj),true);
SELECT pg_temp.ok((SELECT employer_archived_at IS NOT NULL AND status='rejected' FROM public.job_applications WHERE id=(SELECT application FROM rj)),
 'L8 terminal application archives while recruitment stays open');
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_candidate_view((SELECT job FROM rj),_stage=>'archived'))=1, 'L34 archived filter returns archived applications');
SELECT pg_temp.ok((SELECT count(*) FROM public.rec_candidate_view((SELECT job FROM rj),_stage=>'all'))=0, 'L35 ordinary list excludes archived applications');
SELECT public.rec_archive_material((SELECT job FROM rj),(SELECT application FROM rj),false);
RESET ROLE;
RESET request.jwt.claim.sub;
-- Separate application and employer; shared legacy file must stay with it.
INSERT INTO public.employer_memberships(employer_id,user_id,role,status)
 SELECT employer,bo,'member','active' FROM rj;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-0000000000ad';
INSERT INTO public.jobs(id,slug,short_id,employer_id,title_sv,application_method,status,published_at,expires_at)
 SELECT 'ea000000-2222-0000-0000-000000000009','retention-other','RET0009',other_employer,'Other','internal','published',now()-interval '1 day',now()+interval '30 days' FROM rj;
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,status,consent_given_at)
 SELECT 'ea000000-3333-0000-0000-000000000002'::uuid,job,employer,bo,'submitted',now() FROM rj UNION ALL
 SELECT 'ea000000-3333-0000-0000-000000000009'::uuid,'ea000000-2222-0000-0000-000000000009'::uuid,other_employer,anna,'submitted',now() FROM rj;
RESET request.jwt.claim.sub;
UPDATE public.job_applications SET cv_storage_path='legacy/shared.pdf' WHERE id IN (
 'ea000000-3333-0000-0000-000000000001','ea000000-3333-0000-0000-000000000009');
UPDATE public.job_applications SET cv_storage_path='legacy/unique.pdf' WHERE id='ea000000-3333-0000-0000-000000000002';
INSERT INTO public.recruitment_messages(application_id,job_id,employer_id,kind,subject,body,language)
 SELECT application,job,employer,'general','Synthetic','Synthetic body','sv' FROM rj;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.set_application_status('ea000000-3333-0000-0000-000000000002','reviewing',NULL);
SELECT public.set_application_status('ea000000-3333-0000-0000-000000000002','interview',NULL);
SELECT public.set_application_status('ea000000-3333-0000-0000-000000000002','hired',NULL);
UPDATE public.jobs SET status='archived' WHERE id=(SELECT job FROM rj);
SELECT pg_temp.ok((public.rec_retention_overview((SELECT employer FROM rj))->'jobs'->0->>'purgeAt') IS NULL,
 'L9 advertisement archive does not invent a retention date');
SELECT public.rec_complete_recruitment((SELECT job FROM rj),'completed',NULL,NULL);
CREATE TEMP TABLE clock AS SELECT completed_at FROM public.recruitment_settings WHERE job_id=(SELECT job FROM rj);
GRANT SELECT ON clock TO service_role;
SELECT public.rec_archive_material((SELECT job FROM rj),NULL,true);
SELECT public.rec_archive_material((SELECT job FROM rj),NULL,false);
SELECT public.rec_add_comment((SELECT application FROM rj),'Edited after completion');
SELECT public.rec_mark_application_viewed((SELECT application FROM rj));
SELECT pg_temp.ok((SELECT completion_state='completed' AND completed_at=(SELECT completed_at FROM clock)
 FROM public.recruitment_settings WHERE job_id=(SELECT job FROM rj)),
 'L10 archive, restore, views and notes do not reset the completion clock');
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail(format('SELECT public.rec_preview_erasure(%L,NULL)',(SELECT job FROM rj)),
 'RECRUITMENT_NOT_FOUND','L11 candidate cannot erase employer material');
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail(format('SELECT public.rec_set_retention(%L,6)',(SELECT employer FROM rj)),
 'RECRUITMENT_NOT_PERMITTED','L12 ordinary member cannot set period');
SELECT pg_temp.must_fail(format('SELECT public.rec_preview_erasure(%L,NULL)',(SELECT job FROM rj)),
 'RECRUITMENT_NOT_PERMITTED','L13 ordinary member cannot erase');
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE employee_material AS SELECT id FROM public.employees WHERE hired_from_application_id='ea000000-3333-0000-0000-000000000002';
GRANT SELECT ON employee_material TO service_role;
CREATE TEMP TABLE impact AS SELECT public.rec_preview_erasure((SELECT job FROM rj),NULL) payload;
SELECT pg_temp.ok((SELECT (payload->>'applications')::int=2 AND (payload->>'files')::int=2 AND (payload->>'sharedFiles')::int=1
 AND (payload->'counts'->>'assessment_assignments')::int=1 AND (payload->'counts'->>'scp_attempts')::int=1
 AND (payload->'counts'->>'recruitment_messages')::int=1 FROM impact),'L14 server impact includes exact scope and shared files');
RESET ROLE;
UPDATE public.job_applications SET cv_storage_path=NULL WHERE id='ea000000-3333-0000-0000-000000000009';
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail(format('SELECT public.rec_request_erasure(%L,NULL,%L)',(SELECT job FROM rj),(SELECT payload->>'fingerprint' FROM impact)),
 'RETENTION_PREVIEW_CHANGED','L44 confirmation also refuses changed shared-file scope');
RESET ROLE;
UPDATE public.job_applications SET cv_storage_path='legacy/shared.pdf' WHERE id='ea000000-3333-0000-0000-000000000009';
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail(format('SELECT public.rec_request_erasure(%L,NULL,%L)',(SELECT job FROM rj),'00000000000000000000000000000000'),
 'RETENTION_PREVIEW_CHANGED','L15 stale confirmation refused');
CREATE TEMP TABLE requested AS SELECT public.rec_request_erasure((SELECT job FROM rj),NULL,(SELECT payload->>'fingerprint' FROM impact)) id;
SELECT pg_temp.ok((SELECT id=public.rec_request_erasure((SELECT job FROM rj),NULL,(SELECT payload->>'fingerprint' FROM impact)) FROM requested),
 'L16 retry of manual request returns the same job');
SELECT pg_temp.must_fail(format('SELECT public.rec_reopen_recruitment(%L)',(SELECT job FROM rj)),
 'RETENTION_ERASURE_PENDING','L17 pending erasure cannot be reopened');
SELECT pg_temp.must_fail(format('SELECT public.rec_add_comment(%L,%L)',(SELECT application FROM rj),'Late note'), 'RETENTION_ERASURE_PENDING','L41 late notes cannot expand confirmed deletion scope');
SELECT pg_temp.must_fail('SELECT public.rec_claim_erasure()','permission denied','L18 browser cannot claim worker jobs');
RESET ROLE;
RESET request.jwt.claim.sub;
GRANT SELECT ON requested,assigned,rj TO service_role;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE claimed AS SELECT public.rec_claim_erasure() q;
SELECT public.rec_erase_rows((SELECT (q->>'id')::uuid FROM claimed),(SELECT (q->>'lease_token')::uuid FROM claimed));
SELECT pg_temp.ok((SELECT count(*) FROM public.job_applications WHERE job_id=(SELECT job FROM rj))=0,'L19 application rows physically removed');
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments WHERE application_id=(SELECT application FROM rj))=0
 AND (SELECT count(*) FROM public.scp_attempts WHERE id=(SELECT attempt_id FROM assigned))=0,'L20 test assignment and attempt physically removed');
SELECT pg_temp.ok((SELECT count(*) FROM public.recruitment_comments WHERE job_id=(SELECT job FROM rj))=0
 AND (SELECT count(*) FROM public.recruitment_messages WHERE job_id=(SELECT job FROM rj))=0
 AND (SELECT count(*) FROM public.recruitment_interview_bookings WHERE job_id=(SELECT job FROM rj))=0,
 'L21 notes, messages and interviews physically removed');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM public.scp_interview_cases WHERE id=(SELECT id FROM case_material))
 AND NOT EXISTS(SELECT 1 FROM public.scp_report_computation_manifests WHERE id=(SELECT manifest FROM report_material))
 AND NOT EXISTS(SELECT 1 FROM public.scp_report_snapshots WHERE id IN (SELECT participant FROM report_material UNION ALL SELECT employer FROM report_material)),
 'L33 immutable interview/report material and circular report links physically erased');
SELECT pg_temp.ok((SELECT count(*) FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id=(SELECT id FROM requested))=1
 AND NOT EXISTS(SELECT 1 FROM public.storage_erasure_queue WHERE object_path='legacy/shared.pdf'), 'L22 only unique file queued; shared file kept');
SELECT pg_temp.must_fail($test$ UPDATE public.job_applications SET cv_storage_path=(SELECT object_path FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id=(SELECT id FROM requested) LIMIT 1)
 WHERE id='ea000000-3333-0000-0000-000000000009' $test$,
 'RETENTION_FILE_ERASURE_PENDING','L43 another application cannot acquire a file already queued for erasure');
SELECT pg_temp.ok((SELECT cv_storage_path='legacy/shared.pdf' FROM public.job_applications WHERE id='ea000000-3333-0000-0000-000000000009'),
 'L23 other application and organisation unchanged');
SELECT pg_temp.ok((SELECT count(*) FROM auth.users)=(SELECT users FROM retained)
 AND (SELECT count(*) FROM public.sp_claims)=(SELECT claims FROM retained)
 AND (SELECT count(*) FROM public.assessment_runs)=(SELECT own_runs FROM retained), 'L24 account, Passport and own tests unchanged');
SELECT pg_temp.ok((SELECT count(*) FROM public.employees WHERE id IN (SELECT id FROM employee_material) AND hired_from_application_id IS NULL)=1,'L42 hired employee survives; only erased-application pointer is released');
SELECT pg_temp.ok(NOT public.rec_settle_erasure((SELECT (q->>'id')::uuid FROM claimed),(SELECT (q->>'lease_token')::uuid FROM claimed),'RETENTION_FILE_DELETE_FAILED'),
 'L25 pending file is not a completed purge');
SELECT pg_temp.ok((SELECT completed_at IS NULL AND last_error='RETENTION_FILE_DELETE_FAILED' FROM public.recruitment_erasure_jobs WHERE id=(SELECT id FROM requested)),
 'L26 failed erasure remains visible and retryable');
RESET ROLE;
UPDATE public.recruitment_erasure_jobs SET next_attempt_at=now() WHERE id=(SELECT id FROM requested);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE retry AS SELECT public.rec_claim_erasure() q;
SELECT public.rec_erase_rows((SELECT (q->>'id')::uuid FROM retry),(SELECT (q->>'lease_token')::uuid FROM retry));
SELECT pg_temp.ok((SELECT count(*) FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id=(SELECT id FROM requested))=1,'L27 row-erasure retry does not duplicate files');
UPDATE public.storage_erasure_queue SET completed_at=now() WHERE recruitment_erasure_job_id=(SELECT id FROM requested);
SELECT pg_temp.ok(public.rec_settle_erasure((SELECT (q->>'id')::uuid FROM retry),(SELECT (q->>'lease_token')::uuid FROM retry),NULL),
 'L28 completion requires file completion');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok((SELECT id=public.rec_request_erasure((SELECT job FROM rj),NULL,(SELECT payload->>'fingerprint' FROM impact)) FROM requested), 'L36 lost request acknowledgement after physical deletion returns original completed job');
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM recruitment_erasure.row_capability),'L29 temporary erasure capabilities removed');
-- Calendar months, at the exact bound. Missing dates and active work stay out.
UPDATE recruitment_erasure.activation SET enabled=true;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-0000000000ad';
INSERT INTO public.jobs(id,slug,short_id,employer_id,title_sv,application_method,status,published_at,expires_at)
SELECT x.id,x.slug,x.short,employer,'Dates','internal','published',now()-interval '1 day',now()+interval '30 days'
 FROM rj CROSS JOIN (VALUES
 ('ed000000-2222-0000-0000-000000000001'::uuid,'ret-date-1','RD0001'),
 ('ed000000-2222-0000-0000-000000000002'::uuid,'ret-date-2','RD0002'),
 ('ed000000-2222-0000-0000-000000000003'::uuid,'ret-date-3','RD0003'),
 ('ed000000-2222-0000-0000-000000000004'::uuid,'ret-date-4','RD0004')) x(id,slug,short);
INSERT INTO public.job_applications(id,job_id,employer_id,applicant_user_id,status,consent_given_at)
 SELECT replace(j.id::text,'2222','3333')::uuid,j.id,j.employer_id,r.anna,'submitted',now()
 FROM public.jobs j CROSS JOIN rj r WHERE j.slug LIKE 'ret-date-%';
RESET request.jwt.claim.sub;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.set_application_status(id,'rejected',NULL) FROM public.job_applications WHERE job_id::text LIKE 'ed000000%' AND job_id<>'ed000000-2222-0000-0000-000000000004';
UPDATE public.jobs SET status='archived' WHERE id::text LIKE 'ed000000%';
SELECT public.rec_complete_recruitment(id,'completed',NULL,NULL) FROM public.jobs WHERE id::text LIKE 'ed000000%' AND id NOT IN ('ed000000-2222-0000-0000-000000000003','ed000000-2222-0000-0000-000000000004');
RESET ROLE;
UPDATE public.recruitment_settings SET completed_at=now()-interval '6 months'
 WHERE job_id='ed000000-2222-0000-0000-000000000001';
UPDATE public.recruitment_settings SET completed_at=now()-interval '6 months'+interval '1 second'
 WHERE job_id='ed000000-2222-0000-0000-000000000002';
SELECT pg_temp.ok(timestamptz '2024-08-31 12:00:00+00'+interval '6 months'=timestamptz '2025-02-28 12:00:00+00','L37 calendar leap/month-end boundary');
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.rec_enqueue_due_retention()=1,'L30 exact six-month boundary includes due, excludes future, missing date and active cases');
SELECT pg_temp.ok(public.rec_enqueue_due_retention()=0,'L31 repeated automatic scan does not duplicate jobs');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.rec_set_retention((SELECT employer FROM rj),24);
RESET ROLE;
RESET request.jwt.claim.sub;
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.rec_enqueue_due_retention()=0,'L38 lengthening to 24 months does not enqueue six-month-old material');
CREATE TEMP TABLE changed_period_claim AS SELECT public.rec_claim_erasure() q;
SELECT pg_temp.must_fail(format('SELECT public.rec_erase_rows(%L,%L)',(SELECT q->>'id' FROM changed_period_claim),(SELECT q->>'lease_token' FROM changed_period_claim)),
 'RETENTION_PERIOD_NOT_DUE','L39 worker rechecks period before deleting a previously queued job');
RESET ROLE;
UPDATE public.recruitment_settings SET completed_at=now()-interval '24 months' WHERE job_id='ed000000-2222-0000-0000-000000000002';
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.rec_enqueue_due_retention()=1,'L40 exact 24-month boundary is included');
RESET ROLE;
SELECT pg_temp.ok((now()-interval '6 months')+interval '6 months'<=now(),'L32 calendar months used rather than 180 days');
ROLLBACK;
