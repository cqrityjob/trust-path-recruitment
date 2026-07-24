-- Admin System Integration Audit — regression proof.
--
-- Proves the exact gap found (an admin could publish a job for a
-- pending/rejected/suspended employer, with the job then silently
-- invisible everywhere else) is now closed at the database level, for
-- every caller including a genuine platform admin session, across the
-- employer's full pending -> active -> suspended -> active lifecycle.
--
-- Session simulated as the admin user throughout (SET ROLE authenticated
-- + request.jwt.claim.sub), exactly like every other admin-path proof in
-- this suite (see phase-h3-3, phase-h3-4-job-reject).

\set ON_ERROR_STOP off

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1900001-0000-0000-0000-000000000001', false);

-- Sanity: caller is recognised as platform admin.
SELECT public.is_platform_admin('a1900001-0000-0000-0000-000000000001'::uuid) AS t0_is_admin;

-- T1: employer is 'pending' -- publishing job #1 must fail, even as a
-- verified platform admin, even though jobs_admin_write RLS and the
-- admin-exemption branch of jobs_validate_before_write() would otherwise
-- allow this write through with no other check.
UPDATE public.jobs
SET status = 'published', published_at = now()
WHERE id = 'a1900021-0000-0000-0000-000000000001';

SELECT status AS t1_job_status_after_blocked_publish
FROM public.jobs WHERE id = 'a1900021-0000-0000-0000-000000000001';

RESET ROLE;

-- T2: approve the employer (the one, sole, canonical transition path).
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1900001-0000-0000-0000-000000000001', false);
SELECT * FROM public.moderate_employer(
  'a1900011-0000-0000-0000-000000000001'::uuid, 'approved', NULL
);
SELECT status AS t2_employer_status_after_approve
FROM public.employers WHERE id = 'a1900011-0000-0000-0000-000000000001';

-- T3: same publish now succeeds -- approval instantly unlocks publishing,
-- no separate flag, no cache to bust (this is a live per-write DB check).
UPDATE public.jobs
SET status = 'published', published_at = now()
WHERE id = 'a1900021-0000-0000-0000-000000000001';

SELECT status AS t3_job_status_after_publish_while_active
FROM public.jobs WHERE id = 'a1900021-0000-0000-0000-000000000001';

-- T4: the newly-published job is now visible via the exact same
-- jobs_public_active_select policy the public site/candidates query
-- through, proving admin state and public state now agree.
RESET ROLE;
SET ROLE anon;
SELECT count(*) AS t4_public_can_see_job
FROM public.jobs WHERE id = 'a1900021-0000-0000-0000-000000000001';
RESET ROLE;

-- T5: suspend the (now-active) employer.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1900001-0000-0000-0000-000000000001', false);
SELECT * FROM public.moderate_employer(
  'a1900011-0000-0000-0000-000000000001'::uuid, 'suspended', 'Compliance review in progress.'
);
SELECT status AS t5_employer_status_after_suspend
FROM public.employers WHERE id = 'a1900011-0000-0000-0000-000000000001';

-- T6: publishing the SECOND (still-draft) job must now fail, proving the
-- gate re-engages the instant an approved employer is suspended -- not
-- just at first-approval time.
UPDATE public.jobs
SET status = 'published', published_at = now()
WHERE id = 'a1900022-0000-0000-0000-000000000002';

SELECT status AS t6_job2_status_after_blocked_publish_while_suspended
FROM public.jobs WHERE id = 'a1900022-0000-0000-0000-000000000002';

-- T7: the FIRST job, already published before the suspension, keeps its
-- own status='published' row (suspension does not retroactively edit
-- other rows) -- but public visibility for it is revoked immediately,
-- with no cache and no separate step, because jobs_public_active_select
-- re-evaluates employer_is_active_status() on every read.
RESET ROLE;
SET ROLE anon;
SELECT count(*) AS t7_public_can_no_longer_see_job_after_suspend
FROM public.jobs WHERE id = 'a1900021-0000-0000-0000-000000000001';
RESET ROLE;

-- T8: reactivate -- publishing job #2 now succeeds, and job #1 becomes
-- publicly visible again, both without any further write to jobs itself.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1900001-0000-0000-0000-000000000001', false);
SELECT * FROM public.moderate_employer(
  'a1900011-0000-0000-0000-000000000001'::uuid, 'reactivated', NULL
);
UPDATE public.jobs
SET status = 'published', published_at = now()
WHERE id = 'a1900022-0000-0000-0000-000000000002';
SELECT status AS t8_job2_status_after_publish_while_reactivated
FROM public.jobs WHERE id = 'a1900022-0000-0000-0000-000000000002';
RESET ROLE;

SET ROLE anon;
SELECT count(*) AS t9_public_can_see_both_jobs_after_reactivate
FROM public.jobs WHERE id IN (
  'a1900021-0000-0000-0000-000000000001', 'a1900022-0000-0000-0000-000000000002'
);
RESET ROLE;
