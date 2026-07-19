-- =============================================================================
-- Phase H3.1 local validation — test runner
-- Convention (reused from phase-g1): simulate a signed-in user with
--   SELECT set_config('request.jwt.claim.sub', '<uuid>', false); SET ROLE authenticated;
-- Reset with: RESET ROLE;
-- =============================================================================

\set ON_ERROR_STOP off
\pset pager off

\echo '=== SCHEMA TESTS ==='

\echo '--- T1: employers.status CHECK now includes pending/rejected ---'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.employers'::regclass AND conname = 'employers_status_check';

\echo '--- T2: employers.registration_number, employer_memberships.job_title exist ---'
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE (table_name='employers' AND column_name='registration_number')
   OR (table_name='employer_memberships' AND column_name='job_title');

\echo '--- T3: employer_access_requests shape, constraints, indexes, trigger, RLS ---'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='employer_access_requests' ORDER BY ordinal_position;
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.employer_access_requests'::regclass ORDER BY conname;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='employer_access_requests' ORDER BY indexname;
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.employer_access_requests'::regclass;
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='employer_access_requests' ORDER BY policyname;

\echo '--- T4: no UPDATE grant/policy exists on employer_access_requests beyond admin_all ---'
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='employer_access_requests'
  AND grantee='authenticated' ORDER BY privilege_type;

\echo '--- T5: NO new INSERT/UPDATE policy exists on employers or employer_memberships beyond what G1 already had ---'
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('employers','employer_memberships')
ORDER BY tablename, policyname;

\echo '--- T6: create_my_employer_company / approve_access_request are SECURITY DEFINER, revoked from anon, granted to authenticated ---'
SELECT p.proname, p.prosecdef AS security_definer, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('create_my_employer_company','approve_access_request')
ORDER BY p.proname;
SELECT p.proname, r.rolname AS grantee, has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) r
WHERE n.nspname='public' AND p.proname IN ('create_my_employer_company','approve_access_request')
ORDER BY p.proname, r.rolname;


\echo '=== FUNCTIONAL / SECURITY TESTS ==='

\echo '--- T7: unauthenticated (auth.uid() IS NULL) cannot call create_my_employer_company ---'
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE authenticated;
SELECT * FROM public.create_my_employer_company('Should Not Exist AB', 'should-not-exist-ab', 'SE', NULL, NULL, NULL);
RESET ROLE;

\echo '--- T8: candidate A creates a company (self-service) — should succeed, employer.status=pending, membership role=owner/status=active ---'
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_my_employer_company('Fictional Aurora Security AB', 'fictional-aurora-security-ab', 'SE', '556677-8899', 'https://aurora-security.example', 'Grundare');
RESET ROLE;

SELECT id, slug, name, status, registration_number, website FROM public.employers WHERE slug LIKE 'fictional-aurora%';
SELECT employer_id, user_id, role, status, job_title FROM public.employer_memberships
WHERE user_id = 'c0000001-0000-0000-0000-000000000001';

\echo '--- T9: same candidate A creating a company with the exact same name again — must be blocked as DUPLICATE_EMPLOYER, not create a second row ---'
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.create_my_employer_company('Fictional Aurora Security AB', 'fictional-aurora-security-ab', 'SE', NULL, NULL, NULL);
RESET ROLE;
SELECT count(*) AS should_be_1 FROM public.employers WHERE lower(name) = lower('Fictional Aurora Security AB');

\echo '--- T10: a different candidate (B) with an unrelated but slug-colliding name gets a unique slug, not blocked ---'
SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.create_my_employer_company('Fictional Aurora Security Group', 'fictional-aurora-security-ab', 'NO', NULL, NULL, NULL);
RESET ROLE;
SELECT slug, name FROM public.employers WHERE name = 'Fictional Aurora Security Group';

\echo '--- T11: validation — blank name rejected ---'
SELECT set_config('request.jwt.claim.sub', 'c0000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
SELECT * FROM public.create_my_employer_company('   ', 'blank', 'SE', NULL, NULL, NULL);
RESET ROLE;

\echo '--- T12: candidate C requests access to the Aurora company created in T8 ---'
-- Captured via RESET ROLE (superuser) both before and after the insert, not
-- via any simulated actor's RLS-scoped view, so the test script's own
-- variable chaining is never coupled to what a restricted actor may or may
-- not be authorised to see -- that authorisation question is exactly what
-- T14/T16/T18 test deliberately, and must not be short-circuited by \gset
-- silently capturing nothing when a policy (correctly) returns zero rows.
SELECT id AS aurora_id FROM public.employers WHERE slug = 'fictional-aurora-security-ab' \gset
SELECT set_config('request.jwt.claim.sub', 'c0000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
INSERT INTO public.employer_access_requests (employer_id, requester_user_id, message)
VALUES (:'aurora_id', 'c0000003-0000-0000-0000-000000000003', 'I work here, please add me')
RETURNING id, status;
RESET ROLE;
SELECT id AS aurora_request_id FROM public.employer_access_requests
WHERE employer_id = :'aurora_id' AND requester_user_id = 'c0000003-0000-0000-0000-000000000003'
ORDER BY created_at DESC LIMIT 1 \gset

\echo '--- T13: candidate C requests AGAIN while pending — must be blocked by the partial unique index ---'
SELECT set_config('request.jwt.claim.sub', 'c0000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
INSERT INTO public.employer_access_requests (employer_id, requester_user_id, message)
VALUES (:'aurora_id', 'c0000003-0000-0000-0000-000000000003', 'second attempt');
RESET ROLE;

\echo '--- T14: candidate C cannot read another users request row directly (RLS self-scope) ---'
SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT count(*) AS should_be_0 FROM public.employer_access_requests WHERE requester_user_id = 'c0000003-0000-0000-0000-000000000003';
RESET ROLE;

\echo '--- T15: employer A owner (candidate A) CAN see the pending request against their own company ---'
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT requester_user_id, status FROM public.employer_access_requests WHERE employer_id = :'aurora_id';
RESET ROLE;

\echo '--- T16: an unrelated candidate (B, no membership at Aurora) attempting to APPROVE the request directly via UPDATE — must fail (no owner-writable UPDATE policy) ---'
SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
UPDATE public.employer_access_requests SET status = 'approved' WHERE id = :'aurora_request_id';
RESET ROLE;
SELECT status FROM public.employer_access_requests WHERE id = :'aurora_request_id';

\echo '--- T17: the owner themself attempting to APPROVE via a direct UPDATE (not the RPC) — must ALSO fail, no UPDATE policy exists for owners at all, function-mediated only ---'
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employer_access_requests SET status = 'approved', granted_role = 'owner' WHERE id = :'aurora_request_id';
RESET ROLE;
SELECT status FROM public.employer_access_requests WHERE id = :'aurora_request_id';

\echo '--- T18: an unrelated candidate (B) attempting to APPROVE via the RPC — must be rejected (forbidden) ---'
SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.approve_access_request(:'aurora_request_id', 'approved', 'owner');
RESET ROLE;

\echo '--- T19: the actual owner (candidate A) approves via the RPC with role=member — must succeed, create exactly one membership row ---'
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.approve_access_request(:'aurora_request_id', 'approved', 'member');
RESET ROLE;
SELECT employer_id, user_id, role, status FROM public.employer_memberships WHERE user_id = 'c0000003-0000-0000-0000-000000000003';
SELECT status, granted_role, decided_by FROM public.employer_access_requests WHERE id = :'aurora_request_id';

\echo '--- T20: approving the SAME request a second time — must fail (already decided) ---'
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.approve_access_request(:'aurora_request_id', 'approved', 'admin');
RESET ROLE;

\echo '--- T21: candidate C can now submit a NEW request to a DIFFERENT company (not blocked cross-company by the partial index) ---'
SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT id AS group_id FROM public.employers WHERE name = 'Fictional Aurora Security Group' \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'c0000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
INSERT INTO public.employer_access_requests (employer_id, requester_user_id) VALUES (:'group_id', 'c0000003-0000-0000-0000-000000000003') RETURNING status;
RESET ROLE;

\echo '--- T22: platform admin can approve a request for a company they are not a member of ---'
SELECT id AS group_request_id FROM public.employer_access_requests WHERE employer_id = :'group_id' AND requester_user_id = 'c0000003-0000-0000-0000-000000000003' \gset
SELECT set_config('request.jwt.claim.sub', 'c0000004-0000-0000-0000-000000000004', false);
SET ROLE authenticated;
SELECT * FROM public.approve_access_request(:'group_request_id', 'approved', 'member');
RESET ROLE;
SELECT employer_id, user_id, role, status FROM public.employer_memberships
WHERE user_id = 'c0000003-0000-0000-0000-000000000003' AND employer_id = :'group_id';

\echo '--- T23: DENY path — reactivation test: a removed member re-requests and is re-approved with a different role, reusing the same underlying row (ON CONFLICT path) ---'
-- Captured via superuser context (RESET ROLE), same rationale as T12 above.
SELECT id AS deny_target FROM public.employer_memberships
WHERE user_id = 'c0000003-0000-0000-0000-000000000003' AND employer_id = :'group_id' \gset
UPDATE public.employer_memberships SET status = 'removed', removed_at = now() WHERE id = :'deny_target';

SELECT set_config('request.jwt.claim.sub', 'c0000003-0000-0000-0000-000000000003', false);
SET ROLE authenticated;
INSERT INTO public.employer_access_requests (employer_id, requester_user_id) VALUES (:'group_id', 'c0000003-0000-0000-0000-000000000003');
RESET ROLE;
SELECT id AS reapply_id FROM public.employer_access_requests
WHERE employer_id = :'group_id' AND requester_user_id = 'c0000003-0000-0000-0000-000000000003' AND status = 'pending' \gset

SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.approve_access_request(:'reapply_id', 'approved', 'admin');
RESET ROLE;
SELECT id = :'deny_target' AS reactivated_same_row, employer_id, user_id, role, status, removed_at FROM public.employer_memberships
WHERE user_id = 'c0000003-0000-0000-0000-000000000003' AND employer_id = :'group_id';

\echo '--- T24: cross-tenant privilege escalation attempt — candidate B (owner of the "Group" company) tries direct INSERT of an owner membership for themself at the Aurora company they do NOT belong to ---'
SELECT set_config('request.jwt.claim.sub', 'c0000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES (:'aurora_id', 'c0000002-0000-0000-0000-000000000002', 'owner', 'active');
RESET ROLE;

\echo '--- T25: forged active status — candidate A (owner, pending company) tries direct UPDATE of employers.status to active ---'
SELECT set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employers SET status = 'active' WHERE id = :'aurora_id';
SELECT status FROM public.employers WHERE id = :'aurora_id';
RESET ROLE;

\echo '--- T26: audit_logs rows were written for company_created, access_request_approved ---'
SELECT action, subject_type, count(*) FROM public.audit_logs
WHERE action IN ('company_created','access_request_approved') GROUP BY action, subject_type ORDER BY action;

\echo '=== DONE ==='
