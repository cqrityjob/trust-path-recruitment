-- Phase H3.3 local validation — Platform Admin Employer Moderation.
-- Proves moderate_employer()'s transition allow-list, note requirements,
-- audit atomicity, and RLS on employer_moderation_events, against the
-- real unmodified employers/employer_memberships schema.
--
-- Employer allocation across tests (each employer used for exactly the
-- sequence of assertions that keeps its state meaningful):
--   e3000001 (pending)   -> T11 (reject w/o note, fails) then T7 (reject w/ note, succeeds)
--   e3000002 (active)    -> T12 (suspend w/o note, fails) then T8 (suspend w/ note, succeeds)
--   e3000003 (suspended) -> T9 (reactivate, succeeds)
--   e3000004 (rejected)  -> T10 (invalid transition: approve a rejected employer, fails)
--   e3000005 (pending)   -> T6 (approve, succeeds), then T14/T15/T16 inspect its audit row

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off

\echo '=== T1: platform admin can list pending employers via RLS-scoped SELECT ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS admin_visible_pending FROM public.employers WHERE status = 'pending';
RESET ROLE;

\echo '=== T2: a normal employer owner (non-admin) cannot see other employers via employers_admin_all -- only their own via employers_member_select ==='
SELECT set_config('request.jwt.claim.sub', 'd3000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
SELECT count(*) AS owner_visible_employers FROM public.employers;
RESET ROLE;

\echo '=== T3: candidate-only user (no admin role, no employer membership) sees zero employers ==='
SELECT set_config('request.jwt.claim.sub', 'd3000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT count(*) AS candidate_visible_employers FROM public.employers;
RESET ROLE;

\echo '=== T4: platform admin can view full employer detail (any employer, any status) ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT id, status FROM public.employers WHERE id = 'e3000003-0000-0000-0000-000000000003';
RESET ROLE;

\echo '=== T5: non-admin (employer owner) cannot read employer_moderation_events at all -- no policy grants it, not even for their own employer ==='
SELECT set_config('request.jwt.claim.sub', 'd3000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT count(*) AS owner_visible_moderation_events FROM public.employer_moderation_events;
RESET ROLE;

\echo '=== T11: reject WITHOUT a note is rejected (note required for rejection) -- SQLSTATE 23514, employer status unchanged ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000001-0000-0000-0000-000000000001', 'rejected', NULL);
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000001-0000-0000-0000-000000000001';

\echo '=== T7: pending employer CAN be rejected with a note -- status becomes rejected ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000001-0000-0000-0000-000000000001', 'rejected', 'Registration number could not be verified.');
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000001-0000-0000-0000-000000000001';

\echo '=== T12: suspend WITHOUT a note is rejected (note required for suspension) -- SQLSTATE 23514, employer status unchanged ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000002-0000-0000-0000-000000000002', 'suspended', '   ');
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000002-0000-0000-0000-000000000002';

\echo '=== T8: active employer CAN be suspended with a note -- status becomes suspended ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000002-0000-0000-0000-000000000002', 'suspended', 'Reported for misleading job postings.');
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000002-0000-0000-0000-000000000002';

\echo '=== T9: suspended employer CAN be reactivated -- note optional, status becomes active ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000003-0000-0000-0000-000000000003', 'reactivated', NULL);
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000003-0000-0000-0000-000000000003';

\echo '=== T10: invalid transition -- approving an already-rejected employer is blocked (expected_previous=pending, actual=rejected) -- SQLSTATE 23514, status unchanged ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000004-0000-0000-0000-000000000004', 'approved', NULL);
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000004-0000-0000-0000-000000000004';

\echo '=== T13: the employer OWNER (not an admin) cannot moderate their own employer -- is_platform_admin() check inside the RPC blocks it, even for their own organisation ==='
SELECT set_config('request.jwt.claim.sub', 'd3000007-0000-0000-0000-000000000007', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000005-0000-0000-0000-000000000005', 'approved', NULL);
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000005-0000-0000-0000-000000000005';

\echo '=== T6 / T14 / T15 / T16: pending employer CAN be approved by the real admin; the resulting audit row records the ACTUAL calling admin (never client-suppliable), the correct previous/new status, and exactly one new row is created ==='
SELECT count(*) AS events_before FROM public.employer_moderation_events WHERE employer_id = 'e3000005-0000-0000-0000-000000000005';
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000005-0000-0000-0000-000000000005', 'approved', 'All documents verified.');
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000005-0000-0000-0000-000000000005';
SELECT count(*) AS events_after, count(*) FILTER (
  WHERE admin_user_id = 'd3000001-0000-0000-0000-000000000001'
    AND previous_status = 'pending' AND new_status = 'active' AND action = 'approved'
) AS matching_event
FROM public.employer_moderation_events WHERE employer_id = 'e3000005-0000-0000-0000-000000000005';

\echo '=== T17: audit note is not visible to the employer whose organisation it describes, even after a real moderation decision now exists for it ==='
SELECT set_config('request.jwt.claim.sub', 'd3000007-0000-0000-0000-000000000007', false);
SET ROLE authenticated;
SELECT count(*) AS owner_visible_own_events FROM public.employer_moderation_events WHERE employer_id = 'e3000005-0000-0000-0000-000000000005';
RESET ROLE;

\echo '=== T18: cross-tenant -- owner of employer A still cannot see employer B''s row, confirming ordinary employer RLS is unaffected by this phase ==='
SELECT set_config('request.jwt.claim.sub', 'd3000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT count(*) AS cross_tenant_visible FROM public.employers WHERE id = 'e3000005-0000-0000-0000-000000000005';
RESET ROLE;

\echo '=== T19: final policy inventory -- employer_moderation_events has exactly one SELECT policy (admin-only), no INSERT/UPDATE/DELETE policy for authenticated at all ==='
SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='employer_moderation_events' ORDER BY policyname;

\echo '=== DONE ==='
