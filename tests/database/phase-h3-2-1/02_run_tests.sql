-- Phase H3.2.1 local validation — defect-fix test runner.
-- Proves, against the real unmodified schema, that:
--   (a) ordinary employer dashboard/applications reads succeed via the
--       authenticated (RLS-scoped) role alone -- no service_role needed,
--       and a pending employer gets real zero counts, never an error;
--   (b) tenant isolation and candidate-exclusion are unaffected;
--   (c) the canonical family_id whitelist and workplace_type values used
--       by the corrected EmployerJobForm.tsx are exactly what the live
--       triggers/constraints accept, and the old buggy values are
--       exactly what they reject.
--
-- Convention (reused from phase-g1/phase-h3-1/phase-h3-2):
--   SELECT set_config('request.jwt.claim.sub', '<uuid>', false); SET ROLE authenticated;
--   RESET ROLE; to reset.

\set ON_ERROR_STOP off
\pset pager off

\echo '=== T1: pending-employer owner can SELECT own employer jobs via authenticated role (no service_role) -- expect 1 row (the draft) ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS pending_employer_job_count FROM public.jobs WHERE employer_id = 'e1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T2: pending-employer owner can SELECT job_applications for own employer -- expect 0 rows, NOT an error (a pending employer cannot yet have applications) ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS pending_employer_application_count FROM public.job_applications WHERE employer_id = 'e1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T3: active-employer owner can SELECT own employer jobs (2: 1 published + 1 draft) and applications (1) via authenticated role -- matches pre-fix behaviour exactly, proving no regression ==='
SELECT set_config('request.jwt.claim.sub', 'd1000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT count(*) AS active_employer_job_count FROM public.jobs WHERE employer_id = 'e1000002-0000-0000-0000-000000000002';
SELECT count(*) AS active_employer_application_count FROM public.job_applications WHERE employer_id = 'e1000002-0000-0000-0000-000000000002';
RESET ROLE;

\echo '=== T4: candidate-only user (no employer membership anywhere, but IS the applicant on file) cannot read employer_memberships for any employer -- this is the exact query getEmployerDashboardStats uses to gate access, so 0 rows here means the dashboard access check correctly fails closed ==='
SELECT set_config('request.jwt.claim.sub', 'd1000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT count(*) AS candidate_membership_rows FROM public.employer_memberships WHERE user_id = 'd1000004-0000-0000-0000-000000000004';
RESET ROLE;

\echo '=== T5: candidate-only user CANNOT see employer B''s unpublished draft job (the real employer-only boundary; jobs_employer_select_own requires membership) -- expect 0. The candidate DOES see the published job (1), which is correct, intended public visibility via jobs_public_active_select, not an employer-management view -- both counted separately to keep the two policies from being conflated ==='
SELECT set_config('request.jwt.claim.sub', 'd1000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT count(*) AS candidate_visible_draft_job FROM public.jobs WHERE employer_id = 'e1000002-0000-0000-0000-000000000002' AND status = 'draft';
SELECT count(*) AS candidate_visible_published_job FROM public.jobs WHERE employer_id = 'e1000002-0000-0000-0000-000000000002' AND status = 'published';
RESET ROLE;

\echo '=== T6: cross-tenant -- pending-employer owner (employer A) cannot SELECT active employer B''s DRAFT job or applications (the employer-only boundary) -- expect 0 for both. The employer A owner DOES see employer B''s published job (1), same intended public visibility as T5, not a tenant-isolation break ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS cross_tenant_draft_job FROM public.jobs WHERE employer_id = 'e1000002-0000-0000-0000-000000000002' AND status = 'draft';
SELECT count(*) AS cross_tenant_published_job FROM public.jobs WHERE employer_id = 'e1000002-0000-0000-0000-000000000002' AND status = 'published';
SELECT count(*) AS cross_tenant_applications FROM public.job_applications WHERE employer_id = 'e1000002-0000-0000-0000-000000000002';
RESET ROLE;

\echo '=== T7: suspended-employer owner cannot SELECT own employer jobs (employer_members_can_edit excludes suspended) -- expect 0 rows, not an error; matches the dashboard showing a real zero rather than crashing for a non-active/draft/pending employer too ==='
SELECT set_config('request.jwt.claim.sub', 'd1000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
SELECT count(*) AS suspended_employer_visible_jobs FROM public.jobs WHERE employer_id = 'e1000003-0000-0000-0000-000000000003';
RESET ROLE;

\echo '=== T8: anon role cannot see the pending employer''s draft job (public visibility requires employer_is_active_status + published) -- expect 0 rows ==='
SET ROLE anon;
SELECT count(*) AS anon_visible_pending_jobs FROM public.jobs WHERE employer_id = 'e1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T9: all 14 canonical Career Family IDs (career-area-labels.ts / EmployerJobForm.tsx select options) are accepted by the live assert_cig_family_id() trigger -- update the pending employer''s draft job through each one in turn as its owner ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET family_id = 'protective_operations' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'public_safety_justice' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'corrections_secure_transport' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'defence_national_security' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'corporate_security' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'critical_infrastructure_security' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'risk_management' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'crisis_management' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'business_continuity_resilience' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'cyber_information_security' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'financial_crime_compliance' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'security_technology' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'security_leadership_governance' WHERE id = 'f1000001-0000-0000-0000-000000000001';
UPDATE public.jobs SET family_id = 'investigations_intelligence' WHERE id = 'f1000001-0000-0000-0000-000000000001';
SELECT family_id AS last_accepted_family_id FROM public.jobs WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T10: the exact reported bad value -- a Swedish DISPLAY LABEL typed in as family_id -- is rejected with the exact reported error, and the column is left unchanged ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET family_id = 'Säkerhet' WHERE id = 'f1000001-0000-0000-0000-000000000001';
SELECT family_id AS family_id_after_rejected_write FROM public.jobs WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T11: workplace_type = onsite (the corrected form value) is accepted ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET workplace_type = 'onsite' WHERE id = 'f1000001-0000-0000-0000-000000000001';
SELECT workplace_type FROM public.jobs WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T12: workplace_type = on_site (the OLD buggy form value) is rejected by the CHECK constraint -- proves the pre-fix form would have failed to save on any real workplace-type selection ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET workplace_type = 'on_site' WHERE id = 'f1000001-0000-0000-0000-000000000001';
SELECT workplace_type AS workplace_type_after_rejected_write FROM public.jobs WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T13: employment_type and experience_level values used by the corrected form (enum-labels.ts) round-trip cleanly (no CHECK constraint on these two columns, but confirms the values the UI now sends are exactly what a normal save persists) ==='
SELECT set_config('request.jwt.claim.sub', 'd1000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET employment_type = 'contract', experience_level = 'lead' WHERE id = 'f1000001-0000-0000-0000-000000000001';
SELECT employment_type, experience_level FROM public.jobs WHERE id = 'f1000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T14: no schema/RLS drift -- confirm this defect-fix pass required no migration: employers policy/trigger inventory is unchanged from the H3.2 baseline ==='
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='employers' ORDER BY policyname;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.employers'::regclass AND NOT tgisinternal ORDER BY tgname;

\echo '=== DONE ==='
