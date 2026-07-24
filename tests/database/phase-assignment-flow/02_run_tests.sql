-- Phase: Employer Assessment Assignment workflow — RLS/tenant-isolation
-- and immutability proof, against the real migration files applied
-- verbatim (see 00_bootstrap.sql / 01_fixtures.sql). Exercises exactly the
-- policies and trigger added by
-- supabase/migrations/20260724090000_employer_assessment_assignments.sql.

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off

\echo '=== T1: active-employer owner CAN insert an assignment (real-consequence action, employer_is_active_status gate satisfied) ==='
SELECT set_config('request.jwt.claim.sub', 'a1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
INSERT INTO public.assessment_assignments (
  id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
  job_id, application_id, recipient_email, assigned_by, invitation_token_hash, expires_at
) VALUES (
  'f1000001-0000-0000-0000-000000000001', 'b1000001-0000-0000-0000-000000000001',
  'security-guard-foundation',
  (SELECT id FROM public.assessment_versions WHERE assessment_id = 'security-guard-foundation' ORDER BY published_at DESC LIMIT 1),
  'security_professional', 'recruitment',
  'c1000001-0000-0000-0000-000000000001', 'd1000001-0000-0000-0000-000000000001',
  'applicant.test@example.invalid', 'a1000001-0000-0000-0000-000000000001',
  'deadbeef0000000000000000000000000000000000000000000000000000',
  now() + interval '14 days'
);
SELECT count(*) AS t1_expect_1 FROM public.assessment_assignments WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T2: pending-employer owner CANNOT insert a real assignment (employer_is_active_status blocks it -- expect 0 rows after, RLS policy violation) ==='
SELECT set_config('request.jwt.claim.sub', 'a1000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.assessment_assignments (
  id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
  recipient_email, assigned_by, invitation_token_hash, expires_at
) VALUES (
  'f1000002-0000-0000-0000-000000000002', 'b1000002-0000-0000-0000-000000000002',
  'security-guard-foundation',
  (SELECT id FROM public.assessment_versions WHERE assessment_id = 'security-guard-foundation' ORDER BY published_at DESC LIMIT 1),
  'security_professional', 'workforce',
  'someone.test@example.invalid', 'a1000002-0000-0000-0000-000000000002',
  'cafef00d0000000000000000000000000000000000000000000000000000',
  now() + interval '14 days'
);
RESET ROLE;
SELECT count(*) AS t2_expect_0 FROM public.assessment_assignments WHERE employer_id = 'b1000002-0000-0000-0000-000000000002';

\echo '=== T3: active-employer owner CAN select their own assignment ==='
SELECT set_config('request.jwt.claim.sub', 'a1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS t3_expect_1 FROM public.assessment_assignments WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T4: a DIFFERENT employer (other active org) CANNOT see employer B1 assignment -- tenant isolation ==='
SELECT set_config('request.jwt.claim.sub', 'a1000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
SELECT count(*) AS t4_expect_0 FROM public.assessment_assignments WHERE id = 'f1000001-0000-0000-0000-000000000001';
SELECT count(*) AS t4b_expect_0_all_foreign_rows FROM public.assessment_assignments WHERE employer_id = 'b1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T5: other-active-employer owner CANNOT insert an assignment claiming employer B1''s id (cross-tenant create denial -- expect 0 rows) ==='
SELECT set_config('request.jwt.claim.sub', 'a1000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
INSERT INTO public.assessment_assignments (
  id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
  recipient_email, assigned_by, invitation_token_hash, expires_at
) VALUES (
  'f1000005-0000-0000-0000-000000000005', 'b1000001-0000-0000-0000-000000000001',
  'security-guard-foundation',
  (SELECT id FROM public.assessment_versions WHERE assessment_id = 'security-guard-foundation' ORDER BY published_at DESC LIMIT 1),
  'security_professional', 'recruitment',
  'hijack.test@example.invalid', 'a1000003-0000-0000-0000-000000000003',
  'f00dbabe0000000000000000000000000000000000000000000000000000',
  now() + interval '14 days'
);
RESET ROLE;
SELECT count(*) AS t5_expect_0 FROM public.assessment_assignments WHERE id = 'f1000005-0000-0000-0000-000000000005';

\echo '=== T6: immutability guard -- active-employer owner CANNOT change assessment_id on their own existing assignment (expect the update rejected, original value unchanged) ==='
SELECT set_config('request.jwt.claim.sub', 'a1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.assessment_assignments SET assessment_id = 'public-career-assessment' WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT assessment_id AS t6_expect_security_guard_foundation FROM public.assessment_assignments WHERE id = 'f1000001-0000-0000-0000-000000000001';

\echo '=== T6b: immutability guard also blocks changing invitation_token_hash and recipient_email ==='
SELECT set_config('request.jwt.claim.sub', 'a1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.assessment_assignments SET invitation_token_hash = 'changed00000000000000000000000000000000000000000000000000000' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.assessment_assignments SET recipient_email = 'attacker.test@example.invalid' WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT invitation_token_hash AS t6b_expect_original_hash, recipient_email AS t6b_expect_original_email
FROM public.assessment_assignments WHERE id = 'f1000001-0000-0000-0000-000000000001';

\echo '=== T7: active-employer owner CAN cancel their own incomplete assignment (status is not a guarded field) ==='
SELECT set_config('request.jwt.claim.sub', 'a1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.assessment_assignments SET status = 'cancelled', cancelled_at = now()
  WHERE id = 'f1000001-0000-0000-0000-000000000001' AND status IN ('invited','opened','started');
RESET ROLE;
SELECT status AS t7_expect_cancelled FROM public.assessment_assignments WHERE id = 'f1000001-0000-0000-0000-000000000001';

\echo '=== T8: recipient direct-select -- once recipient_user_id is set (service-role linking step, simulated here), that recipient can select their own assignment; a different signed-in user cannot ==='
SET ROLE service_role;
INSERT INTO public.assessment_assignments (
  id, employer_id, assessment_id, assessment_version_id, profile_id, use_case,
  employee_id, recipient_email, recipient_user_id, assigned_by, invitation_token_hash, expires_at, status
) VALUES (
  'f1000008-0000-0000-0000-000000000008', 'b1000001-0000-0000-0000-000000000001',
  'security-guard-foundation',
  (SELECT id FROM public.assessment_versions WHERE assessment_id = 'security-guard-foundation' ORDER BY published_at DESC LIMIT 1),
  'security_professional', 'workforce',
  'e1000001-0000-0000-0000-000000000001',
  'recipient-registered.test@example.invalid', 'a1000005-0000-0000-0000-000000000005',
  'a1000001-0000-0000-0000-000000000001',
  'abad1dea0000000000000000000000000000000000000000000000000000',
  now() + interval '14 days', 'completed'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1000005-0000-0000-0000-000000000005', false);
SET ROLE authenticated;
SELECT count(*) AS t8a_expect_1_own_assignment FROM public.assessment_assignments WHERE id = 'f1000008-0000-0000-0000-000000000008';
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT count(*) AS t8b_expect_0_different_user FROM public.assessment_assignments WHERE id = 'f1000008-0000-0000-0000-000000000008';
RESET ROLE;

\echo '=== T9: unauthenticated (anon role, no auth.uid()) CANNOT select any assignment via plain RLS-scoped access -- token-based recipient access must go through the service-role server function instead, never raw PostgREST ==='
SET ROLE anon;
SELECT count(*) AS t9_expect_0 FROM public.assessment_assignments;
RESET ROLE;
