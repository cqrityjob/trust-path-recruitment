-- Phase H3.4B local validation — Closed Beta Completion (beta_feedback).
-- Proves: any authenticated user can submit their own feedback row (with
-- user_id forced to their own auth.uid() regardless of what they supply),
-- no one but a platform admin can read submissions (not even the
-- submitter themselves), and there is no UPDATE/DELETE path at all for
-- authenticated.

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off

\echo '=== T1: user A submits their own feedback -- succeeds ==='
SELECT set_config('request.jwt.claim.sub', 'd4b00002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.beta_feedback (id, user_id, category, message, page_path)
VALUES ('fb400001-0000-0000-0000-000000000001', 'd4b00002-0000-0000-0000-000000000002', 'bug', 'The apply button did nothing on Safari.', '/jobs/example');
RESET ROLE;

\echo '=== T2: user A cannot forge another user''s user_id on their own submission -- WITH CHECK (user_id = auth.uid()) blocks it ==='
SELECT set_config('request.jwt.claim.sub', 'd4b00002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.beta_feedback (id, user_id, category, message)
VALUES ('fb400002-0000-0000-0000-000000000002', 'd4b00003-0000-0000-0000-000000000003', 'idea', 'Forged submission attempt.');
RESET ROLE;

\echo '=== T3: an empty (whitespace-only) message is rejected by the CHECK constraint ==='
SELECT set_config('request.jwt.claim.sub', 'd4b00002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.beta_feedback (id, user_id, category, message)
VALUES ('fb400003-0000-0000-0000-000000000003', 'd4b00002-0000-0000-0000-000000000002', 'other', '   ');
RESET ROLE;

\echo '=== T4: user A cannot read back their OWN submission -- table-level SELECT is granted (required for the admin RLS policy below to be reachable at all), but no SELECT *policy* applies to a non-admin submitter, so they see zero rows ==='
SELECT set_config('request.jwt.claim.sub', 'd4b00002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT count(*) AS user_a_visible_own_feedback FROM public.beta_feedback WHERE id = 'fb400001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T5: user B cannot read user A''s submission either ==='
SELECT set_config('request.jwt.claim.sub', 'd4b00003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
SELECT count(*) AS user_b_visible_of_a FROM public.beta_feedback WHERE id = 'fb400001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T6: platform admin CAN read every submission ==='
SELECT set_config('request.jwt.claim.sub', 'd4b00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS admin_visible_feedback FROM public.beta_feedback WHERE id = 'fb400001-0000-0000-0000-000000000001';
RESET ROLE;

\echo '=== T7: no one (including admin) can UPDATE or DELETE a submission via a raw client call -- no UPDATE/DELETE grant exists for authenticated at all ==='
SELECT set_config('request.jwt.claim.sub', 'd4b00001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.beta_feedback SET message = 'tampered' WHERE id = 'fb400001-0000-0000-0000-000000000001';
DELETE FROM public.beta_feedback WHERE id = 'fb400001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT message FROM public.beta_feedback WHERE id = 'fb400001-0000-0000-0000-000000000001';

\echo '=== T8: final grant inventory -- authenticated has exactly INSERT and SELECT on beta_feedback (SELECT is required for the admin-only RLS policy to be reachable at all; RLS itself, proven by T4/T5/T6, is what actually restricts which rows each caller sees) ==='
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'beta_feedback' AND grantee = 'authenticated'
  GROUP BY grantee;

\echo '=== DONE ==='
