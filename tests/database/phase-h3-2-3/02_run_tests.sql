-- Phase H3.2.3 local validation — employer-jobs.functions.ts error
-- sanitization round. Proves the underlying RLS/trigger behaviour
-- employer-jobs.functions.ts depends on is unchanged (draft save, edit,
-- submit-for-review, pending-employer restriction, cross-tenant denial
-- all still work exactly as before), and empirically confirms the
-- Postgres SQLSTATE (23514, check_violation) that the new
-- sanitizeJobWriteError() helper switches on is really what both a
-- genuine column CHECK constraint (workplace_type) and the trigger's own
-- custom RAISE EXCEPTION ... USING ERRCODE = 'check_violation' guards
-- (taxonomy whitelist, employer-approval gate) actually produce.
--
-- \set VERBOSITY verbose makes psql print each error's SQLSTATE, so the
-- classification claim above can be read directly off this run's output
-- rather than merely asserted.

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off

\echo '=== T1: pending-employer owner can INSERT a new draft job (draft save still works) ==='
SELECT set_config('request.jwt.claim.sub', 'd2000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, family_id, workplace_type
) VALUES (
  'f2000002-0000-0000-0000-000000000002', 'fictional-pending-co-2-vakt-def456', 'def456fpc2',
  'e2000001-0000-0000-0000-000000000001', 'draft', 'Väktare', 'Security Guard',
  'external', 'protective_operations', 'onsite'
);
SELECT status, family_id, workplace_type FROM public.jobs WHERE id = 'f2000002-0000-0000-0000-000000000002';
RESET ROLE;

\echo '=== T2: pending-employer owner can UPDATE (edit) their own draft ==='
SELECT set_config('request.jwt.claim.sub', 'd2000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET title_sv = 'Väktare (uppdaterad)' WHERE id = 'f2000002-0000-0000-0000-000000000002';
SELECT title_sv FROM public.jobs WHERE id = 'f2000002-0000-0000-0000-000000000002';
RESET ROLE;

\echo '=== T3: pending-employer owner CANNOT submit for review -- rejected with the employer-approval-gate message; confirms SQLSTATE 23514 (the code sanitizeJobWriteError branches on) ==='
SELECT set_config('request.jwt.claim.sub', 'd2000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET status = 'pending_review' WHERE id = 'f2000002-0000-0000-0000-000000000002';
SELECT status FROM public.jobs WHERE id = 'f2000002-0000-0000-0000-000000000002';
RESET ROLE;

\echo '=== T4: active-employer owner can UPDATE (edit) their pre-existing draft ==='
SELECT set_config('request.jwt.claim.sub', 'd2000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
UPDATE public.jobs SET title_sv = 'SOC-analytiker (uppdaterad)' WHERE id = 'f2000001-0000-0000-0000-000000000001';
SELECT title_sv FROM public.jobs WHERE id = 'f2000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T5: active-employer owner submits that job for review with valid canonical family_id/workplace_type and all required fields present -- succeeds ==='
SELECT set_config('request.jwt.claim.sub', 'd2000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
UPDATE public.jobs SET status = 'pending_review' WHERE id = 'f2000001-0000-0000-0000-000000000001';
SELECT status FROM public.jobs WHERE id = 'f2000001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T6: active-employer owner attempts to save a NEW draft with an invalid (non-canonical, translated-label) family_id -- rejected; SQLSTATE 23514 ==='
SELECT set_config('request.jwt.claim.sub', 'd2000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, family_id, workplace_type
) VALUES (
  'f2000003-0000-0000-0000-000000000003', 'fictional-active-co-2-bad-ghi789', 'ghi789fac2',
  'e2000002-0000-0000-0000-000000000002', 'draft', 'Bad Job', 'Bad Job',
  'external', 'Säkerhet', 'onsite'
);
SELECT count(*) AS bad_family_id_job_exists FROM public.jobs WHERE id = 'f2000003-0000-0000-0000-000000000003';
RESET ROLE;

\echo '=== T7: active-employer owner attempts to save a NEW draft with the OLD invalid workplace_type value "on_site" -- rejected by the column CHECK constraint (not the trigger); SQLSTATE 23514 too, confirming both classes of validation error share the code sanitizeJobWriteError checks for ==='
SELECT set_config('request.jwt.claim.sub', 'd2000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en,
  application_method, family_id, workplace_type
) VALUES (
  'f2000004-0000-0000-0000-000000000004', 'fictional-active-co-2-bad2-jkl012', 'jkl012fac2',
  'e2000002-0000-0000-0000-000000000002', 'draft', 'Bad Job 2', 'Bad Job 2',
  'external', 'security_technology', 'on_site'
);
SELECT count(*) AS bad_workplace_type_job_exists FROM public.jobs WHERE id = 'f2000004-0000-0000-0000-000000000004';
RESET ROLE;

\echo '=== T8: cross-tenant -- pending-employer owner (employer A) cannot UPDATE active employer B''s job -- RLS denies, 0 rows affected, no error (UPDATE ... WHERE simply matches nothing under RLS) ==='
SELECT set_config('request.jwt.claim.sub', 'd2000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET title_sv = 'Hijacked' WHERE id = 'f2000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT title_sv FROM public.jobs WHERE id = 'f2000001-0000-0000-0000-000000000001';

\echo '=== T9: candidate-only user (no employer membership anywhere) cannot INSERT a draft job for the active employer -- RLS denies ==='
SELECT set_config('request.jwt.claim.sub', 'd2000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
INSERT INTO public.jobs (
  id, slug, short_id, employer_id, status, title_sv, title_en, application_method
) VALUES (
  'f2000005-0000-0000-0000-000000000005', 'fictional-active-co-2-intruder-mno345', 'mno345fac2',
  'e2000002-0000-0000-0000-000000000002', 'draft', 'Intruder Job', 'Intruder Job', 'external'
);
SELECT count(*) AS intruder_job_exists FROM public.jobs WHERE id = 'f2000005-0000-0000-0000-000000000005';
RESET ROLE;

\echo '=== T10: no schema/RLS drift -- jobs table policy/trigger inventory unchanged (confirms no migration was needed for this round) ==='
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='jobs' ORDER BY policyname;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.jobs'::regclass AND NOT tgisinternal ORDER BY tgname;

\echo '=== DONE ==='
