-- Disposable synthetic database only; verifies the actual operator SELECT.
\set ON_ERROR_STOP on
\set report_query `sed '/^--/d' supabase/retention/application-material.dry-run.sql`
BEGIN;
SET LOCAL timezone='America/Los_Angeles';
\ir recruitment_assignment_fixture.sql
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'scopes'->0->>'recruitment_retention_months')::int=24,
 'DR1 default is 24 months');
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'missingCompletionDate')::int=0
 AND (:'report'::jsonb->'scopes'->0->>'missing_date')::boolean=false,
 'DR2 open advertisement without settings has a boolean false, not null');
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-0000000000ad';
UPDATE public.jobs SET status='expired',expires_at=now()-interval '1 second' WHERE id=(SELECT job FROM rj);
RESET request.jwt.claim.sub;
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'missingCompletionDate')::int=1
 AND (:'report'::jsonb->'scopes'->0->>'purge_at') IS NULL,
 'DR3 expired advertisement flags missing date without inventing one');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.set_application_status((SELECT application FROM rj),'rejected',NULL);
UPDATE public.jobs SET status='archived' WHERE id=(SELECT job FROM rj);
SELECT public.rec_complete_recruitment((SELECT job FROM rj),'completed',NULL,NULL);
RESET ROLE;
RESET request.jwt.claim.sub;
UPDATE public.recruitment_settings SET completed_at=now()-interval '6 months' WHERE job_id=(SELECT job FROM rj);
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'automaticEligible')::int=0,
 'DR4 six-month-old case is not due at default 24 months');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.rec_set_retention((SELECT employer FROM rj),6);
RESET ROLE;
RESET request.jwt.claim.sub;
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'automaticEligible')::int=1
 AND (:'report'::jsonb->'scopes'->0->>'purge_at')::timestamptz=now(),
 'DR5 actual UTC completion includes exact six-month boundary despite session timezone');
SELECT pg_temp.ok(jsonb_array_length(:'report'::jsonb->'automaticFirstEnqueueCandidates')=1
 AND (:'report'::jsonb->>'automaticEnabled')::boolean=false,
 'DR6 prospective automatic scope is reported while activation remains disabled');
UPDATE public.recruitment_settings SET completed_at=completed_at+interval '1 second' WHERE job_id=(SELECT job FROM rj);
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'automaticEligible')::int=0,
 'DR7 future by one second is excluded');
UPDATE public.recruitment_settings SET completed_at=now()-interval '24 months' WHERE job_id=(SELECT job FROM rj);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='ea000000-0000-0000-0000-000000000001';
SELECT public.rec_set_retention((SELECT employer FROM rj),24);
RESET ROLE;
RESET request.jwt.claim.sub;
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'automaticEligible')::int=1,
 'DR8 exact 24-month boundary is included');
INSERT INTO public.recruitment_erasure_jobs(employer_id,job_id,application_ids,reason,last_error)
 SELECT employer,job,ARRAY[application],'employer_request','RETENTION_UNMAPPED_OR_SHARED_DEPENDENCY: synthetic' FROM rj;
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'pendingManual')::int=1
 AND (:'report'::jsonb->'summary'->>'blockedJobs')::int=1
 AND jsonb_array_length(:'report'::jsonb->'manualModeFirstClaims')=1
 AND (:'report'::jsonb->'summary'->>'automaticEligible')::int=0,
 'DR9 queued manual scope, blocker and automatic duplicate exclusion are visible');
UPDATE public.recruitment_erasure_jobs SET next_attempt_at=now()+interval '1 second';
:report_query
\gset
SELECT pg_temp.ok(jsonb_array_length(:'report'::jsonb->'manualModeFirstClaims')=0
 AND (:'report'::jsonb->'summary'->>'pendingManual')::int=1,
 'DR10 future retry stays in debt but is not claimable');
SELECT pg_temp.ok((SELECT count(*) FROM public.job_applications)=1
 AND (SELECT count(*) FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id IS NOT NULL)=0,
 'DR11 report never queues or deletes material');
INSERT INTO public.storage_erasure_queue(bucket_id,object_path,reason,recruitment_erasure_job_id,last_error)
 SELECT 'job-application-cvs','synthetic/report-only.pdf','recruitment_material_deleted',id,'Synthetic API failure'
 FROM public.recruitment_erasure_jobs;
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'pendingFiles')::int=1
 AND (:'report'::jsonb->'summary'->>'failedFiles')::int=1,
 'DR12 failed file debt remains visible independently of future retry');
UPDATE public.recruitment_erasure_jobs SET next_attempt_at=now(),lease_until=now()+interval '10 minutes';
:report_query
\gset
SELECT pg_temp.ok(jsonb_array_length(:'report'::jsonb->'manualModeFirstClaims')=0,
 'DR13 active lease excludes a pending job from first claims');
UPDATE public.recruitment_erasure_jobs SET lease_until=NULL,reason='automatic_retention';
:report_query
\gset
SELECT pg_temp.ok((:'report'::jsonb->'summary'->>'pendingAutomatic')::int=1
 AND (:'report'::jsonb->'manualModeFirstClaims'->0->>'reason')='automatic_retention',
 'DR14 worker also claims already queued automatic jobs while automatic enqueue is disabled');
ROLLBACK;
