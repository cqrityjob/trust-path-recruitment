-- Phase H3.4A local validation — Candidate Application Core.
-- Proves: only published+internal jobs are applicable (BEFORE INSERT
-- trigger), duplicate ACTIVE applications are blocked (partial unique
-- index) while re-applying after withdrawal is allowed, employer_id is
-- always server-derived, cross-candidate and cross-employer isolation on
-- both job_applications and job_application_status_events, that there is
-- NO direct authenticated UPDATE path to job_applications.status for
-- either a candidate or an employer, and that set_application_status() is
-- the sole, validated, atomically-audited path for every transition.

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off

\echo '=== T1: candidate A applies to a published+internal job -- succeeds, employer_id auto-derived, status=submitted ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.job_applications (id, job_id, applicant_user_id, consent_given_at)
VALUES ('a4000001-0000-0000-0000-000000000001', 'f4000001-0000-0000-0000-000000000001', 'd4000002-0000-0000-0000-000000000002', now());
RESET ROLE;
SELECT status, employer_id FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';

\echo '=== T2: candidate A applies AGAIN to the same job while the first application is still active -- blocked (duplicate active application) ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.job_applications (id, job_id, applicant_user_id, consent_given_at)
VALUES ('a4000002-0000-0000-0000-000000000002', 'f4000001-0000-0000-0000-000000000001', 'd4000002-0000-0000-0000-000000000002', now());
RESET ROLE;
SELECT count(*) AS active_applications_for_job1 FROM public.job_applications
  WHERE job_id = 'f4000001-0000-0000-0000-000000000001' AND applicant_user_id = 'd4000002-0000-0000-0000-000000000002' AND status <> 'withdrawn';

\echo '=== T3: candidate A applies to a published+EXTERNAL job -- blocked (only internal jobs are applicable) ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.job_applications (id, job_id, applicant_user_id, consent_given_at)
VALUES ('a4000003-0000-0000-0000-000000000003', 'f4000002-0000-0000-0000-000000000002', 'd4000002-0000-0000-0000-000000000002', now());
RESET ROLE;

\echo '=== T4: candidate A applies to a DRAFT+internal job -- blocked (only published jobs are applicable) ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.job_applications (id, job_id, applicant_user_id, consent_given_at)
VALUES ('a4000004-0000-0000-0000-000000000004', 'f4000003-0000-0000-0000-000000000003', 'd4000002-0000-0000-0000-000000000002', now());
RESET ROLE;

\echo '=== T5: employer_id is always server-derived -- even an INSERT that supplies a WRONG employer_id has it silently overwritten to the real one from the job row ==='
SELECT set_config('request.jwt.claim.sub', 'd4000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES ('a4000005-0000-0000-0000-000000000005', 'f4000004-0000-0000-0000-000000000004', 'e4000001-0000-0000-0000-000000000001', 'd4000003-0000-0000-0000-000000000003', now());
RESET ROLE;
SELECT employer_id FROM public.job_applications WHERE id = 'a4000005-0000-0000-0000-000000000005';

\echo '=== T6: candidate B cannot see candidate A''s application -- cross-candidate isolation ==='
SELECT set_config('request.jwt.claim.sub', 'd4000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
SELECT count(*) AS candidate_b_visible_of_a4000001 FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T7: employer 2''s owner cannot see employer 1''s application (a4000001) -- cross-employer isolation ==='
SELECT set_config('request.jwt.claim.sub', 'd4000005-0000-0000-0000-000000000005', false);
SET ROLE authenticated;
SELECT count(*) AS employer2_visible_of_a4000001 FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T8: employer 1''s owner CAN see their own employer''s application (a4000001) ==='
SELECT set_config('request.jwt.claim.sub', 'd4000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT count(*) AS employer1_visible_of_a4000001 FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T9: candidate A cannot directly UPDATE their own application''s status via a raw client update -- no UPDATE grant/policy exists for authenticated at all beyond the admin-only one ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
UPDATE public.job_applications SET status = 'hired' WHERE id = 'a4000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';

\echo '=== T10: employer 1''s owner cannot directly UPDATE the application''s status via a raw client update either -- same reason ==='
SELECT set_config('request.jwt.claim.sub', 'd4000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
UPDATE public.job_applications SET status = 'rejected' WHERE id = 'a4000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';

\echo '=== T11: employer 1''s owner CAN advance the application via set_application_status() -- submitted -> reviewing ==='
SELECT set_config('request.jwt.claim.sub', 'd4000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT * FROM public.set_application_status('a4000001-0000-0000-0000-000000000001', 'reviewing', 'Looks promising.');
RESET ROLE;
SELECT status, employer_note FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';

\echo '=== T12: candidate A cannot set an employer-controlled status (hired) on their own application via set_application_status() ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.set_application_status('a4000001-0000-0000-0000-000000000001', 'hired', NULL);
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';

\echo '=== T13: employer 1''s owner cannot set withdrawn on the application -- employer can never withdraw on a candidate''s behalf ==='
SELECT set_config('request.jwt.claim.sub', 'd4000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT * FROM public.set_application_status('a4000001-0000-0000-0000-000000000001', 'withdrawn', NULL);
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';

\echo '=== T14: candidate A CAN withdraw their own eligible (reviewing) application via set_application_status() ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.set_application_status('a4000001-0000-0000-0000-000000000001', 'withdrawn', NULL);
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000001-0000-0000-0000-000000000001';

\echo '=== T15: candidate A cannot withdraw an ALREADY-withdrawn application -- invalid transition ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.set_application_status('a4000001-0000-0000-0000-000000000001', 'withdrawn', NULL);
RESET ROLE;

\echo '=== T16: after withdrawal, candidate A CAN re-apply to the same job -- the partial unique index only blocked the prior ACTIVE application, not a fresh one ==='
SELECT set_config('request.jwt.claim.sub', 'd4000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.job_applications (id, job_id, applicant_user_id, consent_given_at)
VALUES ('a4000006-0000-0000-0000-000000000006', 'f4000001-0000-0000-0000-000000000001', 'd4000002-0000-0000-0000-000000000002', now());
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000006-0000-0000-0000-000000000006';

\echo '=== T17: audit trail -- exactly 2 status events exist for the FIRST application (reviewing, then withdrawn), correctly attributed to employer then candidate ==='
SELECT set_config('request.jwt.claim.sub', 'd4000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT actor_role, previous_status, new_status FROM public.job_application_status_events
  WHERE application_id = 'a4000001-0000-0000-0000-000000000001' ORDER BY created_at ASC;
RESET ROLE;

\echo '=== T18: candidate B cannot see the status-event audit trail for candidate A''s application ==='
SELECT set_config('request.jwt.claim.sub', 'd4000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
SELECT count(*) AS candidate_b_visible_events FROM public.job_application_status_events
  WHERE application_id = 'a4000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T19: employer 2 cannot see the status-event audit trail for employer 1''s application ==='
SELECT set_config('request.jwt.claim.sub', 'd4000005-0000-0000-0000-000000000005', false);
SET ROLE authenticated;
SELECT count(*) AS employer2_visible_events FROM public.job_application_status_events
  WHERE application_id = 'a4000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T20: invalid employer transition blocked -- reviewing -> hired directly (skipping interview) is not in the allow-list ==='
SELECT set_config('request.jwt.claim.sub', 'd4000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT * FROM public.set_application_status('a4000006-0000-0000-0000-000000000006', 'reviewing', NULL);
SELECT * FROM public.set_application_status('a4000006-0000-0000-0000-000000000006', 'hired', NULL);
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000006-0000-0000-0000-000000000006';

\echo '=== T21: full happy-path employer funnel on the re-applied application -- reviewing (already set) -> interview -> hired, each step audited ==='
SELECT set_config('request.jwt.claim.sub', 'd4000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT * FROM public.set_application_status('a4000006-0000-0000-0000-000000000006', 'interview', 'Scheduling call.');
SELECT * FROM public.set_application_status('a4000006-0000-0000-0000-000000000006', 'hired', 'Offer accepted.');
RESET ROLE;
SELECT status FROM public.job_applications WHERE id = 'a4000006-0000-0000-0000-000000000006';
SELECT count(*) AS events_for_second_application FROM public.job_application_status_events
  WHERE application_id = 'a4000006-0000-0000-0000-000000000006';

\echo '=== T22: platform admin can see every application and every status event across both employers (spot check, unchanged pre-existing admin-select policies) ==='
SELECT set_config('request.jwt.claim.sub', 'd4000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS admin_visible_applications FROM public.job_applications WHERE id IN (
  'a4000001-0000-0000-0000-000000000001', 'a4000005-0000-0000-0000-000000000005', 'a4000006-0000-0000-0000-000000000006'
);
SELECT count(*) AS admin_visible_events FROM public.job_application_status_events
  WHERE application_id IN ('a4000001-0000-0000-0000-000000000001', 'a4000006-0000-0000-0000-000000000006');
RESET ROLE;

\echo '=== T23: final grant/policy inventory -- job_applications has no general UPDATE grant for authenticated (SELECT, INSERT only), and job_application_status_events has SELECT-only policies with no write path for authenticated at all ==='
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'job_applications' AND grantee = 'authenticated'
  GROUP BY grantee;
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_application_status_events' ORDER BY policyname;

\echo '=== DONE ==='
