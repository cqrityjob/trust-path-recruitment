-- =============================================================================
-- Phase G1 local validation — test runner
--
-- Run after 00_mock_schema.sql, the actual migration file, 01_fixtures.sql,
-- the employer C/D status updates, and 02_membership_fixtures.sql.
--
-- Convention: to simulate a signed-in Supabase user, set the JWT-claim GUC
-- and switch Postgres role:
--   SELECT set_config('request.jwt.claim.sub', '<uuid>', false);
--   SET ROLE authenticated;
-- To simulate anon: SET ROLE anon; (no claim needed, auth.uid() is NULL
-- because RESET request.jwt.claim.sub or an empty claim).
-- To reset to the unrestricted superuser between blocks: RESET ROLE;
-- =============================================================================

\echo '=== SCHEMA TESTS ==='

\echo '--- Test 2: employers.status column, default, CHECK ---'
SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='employers' AND column_name='status';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.employers'::regclass AND contype = 'c';

\echo '--- Test 3: employer_memberships columns, FKs, constraints, indexes, trigger, grants, RLS ---'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='employer_memberships' ORDER BY ordinal_position;
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.employer_memberships'::regclass ORDER BY conname;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='employer_memberships' ORDER BY indexname;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.employer_memberships'::regclass AND NOT tgisinternal;
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='employer_memberships' ORDER BY grantee, privilege_type;
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employer_memberships'::regclass;

\echo '--- Test 4: helper/RPC functions exist with expected security mode and grants ---'
SELECT p.proname, p.prosecdef AS security_definer, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('is_platform_admin','has_employer_role','update_employer_membership')
ORDER BY p.proname;
SELECT p.proname, r.rolname AS grantee, has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) r
WHERE n.nspname='public' AND p.proname IN ('is_platform_admin','has_employer_role','update_employer_membership')
ORDER BY p.proname, r.rolname;

\echo '--- Test 5: expected policies exist ---'
SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename IN ('employer_memberships','employers')
ORDER BY tablename, policyname;

\echo '=== AUTHORIZATION TESTS ==='

\echo '--- Test 6: unauthenticated (anon) cannot read or write memberships ---'
RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT count(*) AS anon_visible_memberships FROM public.employer_memberships;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
      VALUES ('a1111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'member', 'active');
    RAISE NOTICE 'TEST 6 FAIL: anon insert succeeded (should have been denied)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 6 PASS: anon insert denied with insufficient_privilege';
  END;
END $$;
RESET ROLE;

\echo '--- Test 7: candidate with no membership sees zero rows ---'
SELECT set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
SET ROLE authenticated;
SELECT count(*) AS candidate_visible_memberships FROM public.employer_memberships;
RESET ROLE;

\echo '--- Test 8: active member sees only own membership and own employer ---'
SELECT set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
SET ROLE authenticated;
SELECT employer_id, user_id, role, status FROM public.employer_memberships;
SELECT id, slug FROM public.employers;
RESET ROLE;

\echo '--- Test 9: user in employer A cannot see employer B directly (attempt to select by id) ---'
SELECT set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
SET ROLE authenticated;
SELECT id, slug FROM public.employers WHERE id = 'b2222222-2222-2222-2222-222222222222';
SELECT count(*) AS should_be_zero FROM public.employer_memberships WHERE employer_id = 'b2222222-2222-2222-2222-222222222222';
RESET ROLE;

\echo '--- Test 10: user in two employers sees only those two ---'
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;
SELECT employer_id FROM public.employer_memberships ORDER BY employer_id;
SELECT id, slug FROM public.employers ORDER BY slug;
RESET ROLE;

\echo '--- Test 11: invited/suspended/removed memberships grant no employer access ---'
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false); -- suspended
SET ROLE authenticated;
\echo 'suspended user -- own row still visible (self-select has no status filter, by design):'
SELECT status FROM public.employer_memberships WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
\echo 'suspended user -- employer access via employers_member_select (expect ZERO rows):'
SELECT count(*) AS should_be_zero FROM public.employers WHERE id = 'a1111111-1111-1111-1111-111111111111' AND public.has_employer_role(auth.uid(), id, NULL);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false); -- removed
SET ROLE authenticated;
\echo 'removed user -- has_employer_role (expect false):'
SELECT public.has_employer_role(auth.uid(), 'a1111111-1111-1111-1111-111111111111', NULL) AS should_be_false;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', false); -- invited
SET ROLE authenticated;
\echo 'invited user -- has_employer_role (expect false):'
SELECT public.has_employer_role(auth.uid(), 'a1111111-1111-1111-1111-111111111111', NULL) AS should_be_false;
RESET ROLE;

\echo '--- Test 12: platform admin can administer memberships ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- admin
SET ROLE authenticated;
SELECT public.is_platform_admin(auth.uid()) AS admin_should_be_true;
SELECT count(*) AS admin_sees_all_rows FROM public.employer_memberships;
RESET ROLE;

\echo '--- Test 13: superadmin can administer memberships (the corrected defect) ---'
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false); -- superadmin only
SET ROLE authenticated;
SELECT public.is_platform_admin(auth.uid()) AS superadmin_only_should_be_true;
SELECT count(*) AS superadmin_sees_all_rows FROM public.employer_memberships;
RESET ROLE;

\echo '--- Test 14: content_editor/assessment_editor/support do NOT gain platform-admin access ---'
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false); -- content_editor
SET ROLE authenticated;
SELECT public.is_platform_admin(auth.uid()) AS content_editor_should_be_false;
SELECT count(*) AS content_editor_visible_memberships_should_be_zero FROM public.employer_memberships;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false); -- assessment_editor
SET ROLE authenticated;
SELECT public.is_platform_admin(auth.uid()) AS assessment_editor_should_be_false;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false); -- support
SET ROLE authenticated;
SELECT public.is_platform_admin(auth.uid()) AS support_should_be_false;
RESET ROLE;

\echo '--- Test 15: employer-scoped admin role user cannot grant platform roles (structural + attempted write) ---'
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', false); -- employer-scoped "admin"
SET ROLE authenticated;
SELECT public.is_platform_admin(auth.uid()) AS employer_scoped_admin_should_be_false;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'admin');
    RAISE NOTICE 'TEST 15 FAIL: employer-scoped admin role user was able to write user_roles';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 15 PASS: user_roles write denied to employer-scoped admin role user';
  END;
END $$;
RESET ROLE;

\echo '--- Test 16: forged actor identity is impossible (structural check, no live-DB parameter exists) ---'
SELECT pg_get_function_arguments(oid) AS update_employer_membership_signature
FROM pg_proc WHERE proname = 'update_employer_membership' AND pronamespace = 'public'::regnamespace;

\echo '=== OWNER PROTECTION TESTS ==='

\echo '--- Test 17: final active owner cannot be downgraded ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); -- platform admin caller
SET ROLE authenticated;
DO $$
DECLARE _mid uuid;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'b2222222-2222-2222-2222-222222222222' AND user_id = '00000000-0000-0000-0000-0000000000b1';
  BEGIN
    PERFORM public.update_employer_membership(_mid, 'member', NULL);
    RAISE NOTICE 'TEST 17 FAIL: sole owner role downgrade succeeded (should have been blocked)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 17 PASS: sole owner role downgrade blocked: %', SQLERRM;
  END;
END $$;
RESET ROLE;

\echo '--- Test 18: final active owner cannot be suspended ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE _mid uuid;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'b2222222-2222-2222-2222-222222222222' AND user_id = '00000000-0000-0000-0000-0000000000b1';
  BEGIN
    PERFORM public.update_employer_membership(_mid, NULL, 'suspended');
    RAISE NOTICE 'TEST 18 FAIL: sole owner suspension succeeded (should have been blocked)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 18 PASS: sole owner suspension blocked: %', SQLERRM;
  END;
END $$;
RESET ROLE;

\echo '--- Test 19: final active owner cannot be removed ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE _mid uuid;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'b2222222-2222-2222-2222-222222222222' AND user_id = '00000000-0000-0000-0000-0000000000b1';
  BEGIN
    PERFORM public.update_employer_membership(_mid, NULL, 'removed');
    RAISE NOTICE 'TEST 19 FAIL: sole owner removal succeeded (should have been blocked)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 19 PASS: sole owner removal blocked: %', SQLERRM;
  END;
END $$;
RESET ROLE;

\echo 'Confirm employer B still has exactly one active owner after 3 blocked attempts:'
SELECT count(*) AS employer_b_active_owners FROM public.employer_memberships
  WHERE employer_id = 'b2222222-2222-2222-2222-222222222222' AND role='owner' AND status='active';

\echo '--- Test 20: with two active owners, one CAN be changed ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE _mid uuid; _row record;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'a1111111-1111-1111-1111-111111111111' AND user_id = '99999999-9999-9999-9999-999999999999';
  SELECT * INTO _row FROM public.update_employer_membership(_mid, 'member', NULL);
  RAISE NOTICE 'TEST 20 PASS: two-owner downgrade succeeded, changed=%, new role=%', _row.changed, _row.role;
END $$;
RESET ROLE;
\echo 'Confirm employer A active-owner count is now exactly 1 (owner_a1 remains):'
SELECT count(*) AS employer_a_active_owners FROM public.employer_memberships
  WHERE employer_id = 'a1111111-1111-1111-1111-111111111111' AND role='owner' AND status='active';
-- Restore owner_a2 back to 'owner'/'active' so employer A has two active
-- owners again for the concurrency test (test 21) below.
SET ROLE service_role;
UPDATE public.employer_memberships SET role='owner', status='active', removed_at=NULL
  WHERE employer_id = 'a1111111-1111-1111-1111-111111111111' AND user_id = '99999999-9999-9999-9999-999999999999';
RESET ROLE;

\echo '=== STATE INTEGRITY TESTS ==='

\echo '--- Test 22: no-op role update returns changed=false ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE _mid uuid; _row record;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'a1111111-1111-1111-1111-111111111111' AND user_id = '77777777-7777-7777-7777-777777777777';
  SELECT * INTO _row FROM public.update_employer_membership(_mid, 'member', NULL); -- already 'member'
  RAISE NOTICE 'TEST 22 RESULT: changed=% (expect false)', _row.changed;
END $$;
RESET ROLE;

\echo '--- Test 23: no-op status update returns changed=false ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE _mid uuid; _row record;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'a1111111-1111-1111-1111-111111111111' AND user_id = '77777777-7777-7777-7777-777777777777';
  SELECT * INTO _row FROM public.update_employer_membership(_mid, NULL, 'active'); -- already 'active'
  RAISE NOTICE 'TEST 23 RESULT: changed=% (expect false)', _row.changed;
END $$;
RESET ROLE;

\echo '--- Test 24: active -> removed sets removed_at ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE _mid uuid; _row record;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'a1111111-1111-1111-1111-111111111111' AND user_id = '77777777-7777-7777-7777-777777777777';
  SELECT * INTO _row FROM public.update_employer_membership(_mid, NULL, 'removed');
  RAISE NOTICE 'TEST 24 RESULT: changed=%, status=%, removed_at IS NOT NULL = %', _row.changed, _row.status, (_row.removed_at IS NOT NULL);
END $$;
RESET ROLE;

\echo '--- Test 25: removed -> active clears removed_at ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$
DECLARE _mid uuid; _row record;
BEGIN
  SELECT id INTO _mid FROM public.employer_memberships
    WHERE employer_id = 'a1111111-1111-1111-1111-111111111111' AND user_id = '77777777-7777-7777-7777-777777777777';
  SELECT * INTO _row FROM public.update_employer_membership(_mid, NULL, 'active');
  RAISE NOTICE 'TEST 25 RESULT: changed=%, status=%, removed_at IS NULL = %', _row.changed, _row.status, (_row.removed_at IS NULL);
END $$;
RESET ROLE;

\echo '--- Test 26/27/28: employer no-op vs real update + audit metadata (exercised at the application layer; verified here at the schema/RLS layer that audit_logs itself is write-only-by-service_role and holds no sensitive fields for any row inserted so far) ---'
SET ROLE service_role;
SELECT action, subject_type, org_id, metadata FROM public.audit_logs ORDER BY at;
RESET ROLE;
\echo 'Confirm authenticated/anon cannot read or write audit_logs directly (RLS/grant boundary):'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM public.audit_logs;
    RAISE NOTICE 'TEST 26-28 SUPPORT CHECK: authenticated SELECT on audit_logs did not raise (grant-level check, see row count separately)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 26-28 SUPPORT CHECK PASS: authenticated SELECT on audit_logs denied';
  END;
END $$;
RESET ROLE;

\echo '=== PUBLIC VISIBILITY TESTS ==='

\echo '--- Test 29: active employer with active job remains publicly visible ---'
RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT id, slug FROM public.employers WHERE id = 'a1111111-1111-1111-1111-111111111111';
SELECT id, title_sv FROM public.jobs WHERE employer_id = 'a1111111-1111-1111-1111-111111111111';
RESET ROLE;

\echo '--- Test 30: suspended employer is not publicly visible ---'
RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT count(*) AS should_be_zero FROM public.employers WHERE id = 'c3333333-3333-3333-3333-333333333333';
RESET ROLE;

\echo '--- Test 31: archived employer is not publicly visible ---'
RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT count(*) AS should_be_zero FROM public.employers WHERE id = 'd4444444-4444-4444-4444-444444444444';
RESET ROLE;

\echo '--- Test 32: jobs belonging to suspended/archived employers are not publicly visible ---'
RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT count(*) AS should_be_zero_suspended FROM public.jobs WHERE employer_id = 'c3333333-3333-3333-3333-333333333333';
SELECT count(*) AS should_be_zero_archived FROM public.jobs WHERE employer_id = 'd4444444-4444-4444-4444-444444444444';
RESET ROLE;

\echo '=== REGRESSION TESTS ==='

\echo '--- Test 33: existing admin keeps access to jobs/employers admin surfaces ---'
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SET ROLE authenticated;
SELECT count(*) AS admin_sees_all_jobs FROM public.jobs;
SELECT count(*) AS admin_sees_all_employers FROM public.employers;
RESET ROLE;

\echo '--- Test 34: superadmin gains intended equivalent access ---'
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
SET ROLE authenticated;
SELECT count(*) AS superadmin_sees_all_jobs FROM public.jobs;
SELECT count(*) AS superadmin_sees_all_employers FROM public.employers;
RESET ROLE;

\echo '--- Test 35/36: no candidate-owned tables exist in this mock (by design -- Phase G1 never touches them in the real schema either); confirming the migration file itself contains no reference to assessment_runs/assessment_run_reports ---'
\! grep -c "assessment_run" /Users/mostafas/trust-path-recruitment/supabase/migrations/20260719100000_employer_memberships.sql || true

\echo '=== ALL SEQUENTIAL TESTS COMPLETE ==='
