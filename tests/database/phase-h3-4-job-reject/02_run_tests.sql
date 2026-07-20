-- Phase H3.4 job-rejection-note-guard local validation.
-- Proves: reject_job() requires a non-empty, trimmed note (null/empty/
-- whitespace all rejected); a failed rejection changes neither jobs.status
-- nor job_admin_meta; a valid rejection succeeds atomically; publish/
-- approve is completely unaffected; a non-admin cannot reject at all; and
-- -- the actual point of this fix -- a direct raw UPDATE bypassing
-- reject_job() entirely is now ALSO blocked by the database itself, not
-- just discouraged by having a nicer RPC available.

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off

\echo '=== T1: reject with a NULL note -- fails, job status unchanged ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.reject_job('f4c00001-0000-0000-0000-000000000001', NULL);
RESET ROLE;
SELECT status FROM public.jobs WHERE id = 'f4c00001-0000-0000-0000-000000000001';

\echo '=== T2: reject with an EMPTY string note -- fails, job status unchanged ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.reject_job('f4c00001-0000-0000-0000-000000000001', '');
RESET ROLE;
SELECT status FROM public.jobs WHERE id = 'f4c00001-0000-0000-0000-000000000001';

\echo '=== T3: reject with a WHITESPACE-ONLY note -- fails, job status unchanged ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.reject_job('f4c00001-0000-0000-0000-000000000001', '   ');
RESET ROLE;
SELECT status FROM public.jobs WHERE id = 'f4c00001-0000-0000-0000-000000000001';

\echo '=== T6 (checked here, before T4 succeeds): none of the three failed attempts above created or modified a job_admin_meta row -- zero rows exist for this job yet ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS job_admin_meta_rows_before_success FROM public.job_admin_meta WHERE job_id = 'f4c00001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T4: reject with a VALID note -- succeeds, status=rejected, job_admin_meta.moderation_notes set and attributable to the real caller ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.reject_job('f4c00001-0000-0000-0000-000000000001', 'Registration number could not be verified.');
RESET ROLE;
SELECT status FROM public.jobs WHERE id = 'f4c00001-0000-0000-0000-000000000001';
SELECT moderation_notes, reviewed_by FROM public.job_admin_meta WHERE job_id = 'f4c00001-0000-0000-0000-000000000001';

\echo '=== T7: publish/approve is completely unaffected by this fix -- an admin can still transition a draft job straight through to published exactly as before ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs
SET status = 'published', published_at = now(), expires_at = now() + interval '30 days'
WHERE id = 'f4c00002-0000-0000-0000-000000000002';
RESET ROLE;
SELECT status FROM public.jobs WHERE id = 'f4c00002-0000-0000-0000-000000000002';

\echo '=== T8: a non-admin (employer owner) cannot call reject_job() at all, even for their own employer''s job ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.reject_job('f4c00003-0000-0000-0000-000000000003', 'Attempted forged rejection.');
RESET ROLE;
SELECT status FROM public.jobs WHERE id = 'f4c00003-0000-0000-0000-000000000003';

\echo '=== T9 (the actual point of this fix): a genuine platform admin session can NO LONGER reject a job via a raw direct UPDATE, bypassing reject_job() entirely -- the database itself now blocks it, not just the application layer ==='
SELECT set_config('request.jwt.claim.sub', 'd4c00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.jobs SET status = 'rejected' WHERE id = 'f4c00004-0000-0000-0000-000000000004';
RESET ROLE;
SELECT status FROM public.jobs WHERE id = 'f4c00004-0000-0000-0000-000000000004';

\echo '=== T10: final function inventory -- reject_job is the only function in the schema whose body sets app.job_rejection_in_progress ==='
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
  AND p.prosrc ILIKE '%job_rejection_in_progress%'
  AND p.prosrc ILIKE '%set_config%'
ORDER BY p.proname;

\echo '=== DONE ==='
