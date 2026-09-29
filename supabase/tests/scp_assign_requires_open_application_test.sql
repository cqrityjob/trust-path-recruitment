-- A test is sent only to a candidate still in the process -- AS-01, executed.
--
-- scp_employer_assign() (every entry point ends in it) refuses an application
-- that is rejected, hired or withdrawn, and any application in a completed or
-- cancelled recruitment, BEFORE its idempotent replay -- so a re-send to a
-- closed application is refused, not silently replayed. Everything already
-- sent stays exactly as it was.
--
-- Uses the recruitment assignment fixture: one guarding company, one job, an
-- applicant with an account (anna), an owner who may assign.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;
\ir recruitment_assignment_fixture.sql

-- Three more applicants with accounts, all open at the start.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('ea000000-0000-0000-0000-0000000000d1', 'dan@journey.test', now()),
  ('ea000000-0000-0000-0000-0000000000d2', 'eva@journey.test', now()),
  ('ea000000-0000-0000-0000-0000000000d3', 'fia@journey.test', now());
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT 'ea000000-3333-0000-0000-0000000000d1'::uuid, job, employer, 'ea000000-0000-0000-0000-0000000000d1'::uuid, 'submitted', now() FROM rj
UNION ALL
SELECT 'ea000000-3333-0000-0000-0000000000d2'::uuid, job, employer, 'ea000000-0000-0000-0000-0000000000d2'::uuid, 'submitted', now() FROM rj
UNION ALL
SELECT 'ea000000-3333-0000-0000-0000000000d3'::uuid, job, employer, 'ea000000-0000-0000-0000-0000000000d3'::uuid, 'submitted', now() FROM rj;

-- ── GROUP 1: the open application takes a test (baseline) ──────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 1 — open application'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
CREATE TEMP TABLE as01_first AS
SELECT * FROM public.scp_assign_from_application((SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv));
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM as01_first) = 1, '1.1 a submitted application takes a test');
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments WHERE application_id = (SELECT application FROM rj)) = 1, '1.2 exactly one assignment exists');

-- ── GROUP 2: rejected -- refused, and NOT replayed ──────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 2 — rejected application'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT public.set_application_status((SELECT application FROM rj), 'rejected', 'Not this time');
SELECT pg_temp.must_fail(format('SELECT * FROM public.scp_assign_from_application(%L::uuid,%L::uuid,%L::uuid)',
  (SELECT employer FROM rj), (SELECT application FROM rj), (SELECT version_id FROM rjv)),
  'SCP_APPLICATION_NOT_OPEN', '2.1 the wrapper refuses a rejected application');
SELECT pg_temp.must_fail(format('SELECT * FROM public.scp_employer_assign(%L::uuid,%L::uuid,%L,NULL,''sv'',''recruitment'',NULL,NULL,%L::uuid,NULL)',
  (SELECT employer FROM rj), (SELECT version_id FROM rjv), 'anna@journey.test', (SELECT application FROM rj)),
  'SCP_APPLICATION_NOT_OPEN', '2.2 the shared RPC refuses it too -- the same test is refused, not replayed');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments WHERE application_id = (SELECT application FROM rj)) = 1, '2.3 what was already sent stays');
SELECT pg_temp.ok((SELECT status FROM public.assessment_assignments WHERE id = (SELECT assignment_id FROM as01_first)) = 'invited', '2.4 and is untouched');

-- ── GROUP 3: withdrawn by the candidate ────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 3 — withdrawn application'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-0000000000d1';
SELECT public.set_application_status('ea000000-3333-0000-0000-0000000000d1', 'withdrawn', NULL);
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(format('SELECT * FROM public.scp_assign_from_application(%L::uuid,%L::uuid,%L::uuid)',
  (SELECT employer FROM rj), 'ea000000-3333-0000-0000-0000000000d1', (SELECT version_id FROM rjv)),
  'SCP_APPLICATION_NOT_OPEN', '3.1 a withdrawn application takes no test');
RESET ROLE; RESET request.jwt.claim.sub;

-- ── GROUP 4: hired ─────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 4 — hired application'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT public.set_application_status('ea000000-3333-0000-0000-0000000000d2', 'reviewing', NULL);
SELECT public.set_application_status('ea000000-3333-0000-0000-0000000000d2', 'interview', NULL);
-- An interview-stage application still takes a test (it is in the process).
CREATE TEMP TABLE as01_interview AS
SELECT * FROM public.scp_assign_from_application((SELECT employer FROM rj), 'ea000000-3333-0000-0000-0000000000d2', (SELECT version_id FROM rjv));
SELECT pg_temp.ok((SELECT count(*) FROM as01_interview) = 1, '4.1 an application at interview stage still takes a test');
SELECT public.set_application_status('ea000000-3333-0000-0000-0000000000d2', 'hired', NULL);
SELECT pg_temp.must_fail(format('SELECT * FROM public.scp_assign_from_application(%L::uuid,%L::uuid,%L::uuid)',
  (SELECT employer FROM rj), 'ea000000-3333-0000-0000-0000000000d2', (SELECT version_id FROM rjv)),
  'SCP_APPLICATION_NOT_OPEN', '4.2 a hired application takes no new test');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments WHERE application_id = 'ea000000-3333-0000-0000-0000000000d2') = 1, '4.3 the test sent before the hire stays');

-- ── GROUP 5: completed recruitment ─────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 5 — completed recruitment'; END $$;
-- rec_complete_recruitment() refuses while an application is unresolved, so a
-- completed recruitment with an open application cannot arise through the
-- product; the guard is a backstop. Plant the state directly to prove it.
INSERT INTO public.recruitment_settings (job_id, employer_id)
SELECT job, employer FROM rj ON CONFLICT (job_id) DO NOTHING;
UPDATE public.recruitment_settings SET completion_state = 'completed', completed_at = now()
 WHERE job_id = (SELECT job FROM rj);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'ea000000-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail(format('SELECT * FROM public.scp_assign_from_application(%L::uuid,%L::uuid,%L::uuid)',
  (SELECT employer FROM rj), 'ea000000-3333-0000-0000-0000000000d3', (SELECT version_id FROM rjv)),
  'SCP_RECRUITMENT_COMPLETED', '5.1 an open application in a completed recruitment takes no test');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT pg_temp.ok((SELECT count(*) FROM public.assessment_assignments WHERE application_id = 'ea000000-3333-0000-0000-0000000000d3') = 0, '5.2 and nothing was created');

-- ── GROUP 6: the guard is the database's, not the button's ─────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 6 — the guard lives in the function'; END $$;
SELECT pg_temp.ok(
  pg_get_functiondef('public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)'::regprocedure)
    LIKE '%SCP_APPLICATION_NOT_OPEN%'
  AND pg_get_functiondef('public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)'::regprocedure)
    LIKE '%SCP_RECRUITMENT_COMPLETED%',
  '6.1 both refusals are in scp_employer_assign, the RPC every entry point ends in');
SELECT pg_temp.ok(NOT has_function_privilege('anon',
  'public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)', 'EXECUTE'),
  '6.2 anon still cannot assign');

ROLLBACK;
