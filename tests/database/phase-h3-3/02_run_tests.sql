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

\echo '=== T20 (integrity-review addendum): every function whose body issues an UPDATE against public.employers, from any source -- confirms moderate_employer() is the ONLY function that ever writes to the employers table at all (so, trivially, the only one able to write its status column). Matches literally on "UPDATE public.employers" (the exact form every UPDATE in this schema is written as); a looser two-substring match was tried first and produced one false positive (jobs_validate_before_write, which only SELECTs employers.status to check job-edit eligibility, never writes it) -- tightened to this exact-phrase form instead. ==='
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
  AND p.prosrc ILIKE '%UPDATE public.employers%'
ORDER BY p.proname;

\echo '=== T21 (database-integrity guard, migration 20260720140000): a genuine platform admin session can NO LONGER write employers.status via a raw client-side UPDATE -- the transaction-local-marker trigger guard now blocks this for every role, including platform admins. (Superseded assertion: an earlier pass of this same test intentionally proved this WAS possible and documented it as an accepted limitation; that limitation is now closed, and this test proves the closure.) Expect SQLSTATE 23514, no status change. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
UPDATE public.employers SET status = 'suspended' WHERE id = 'e3000005-0000-0000-0000-000000000005';
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000005-0000-0000-0000-000000000005';

\echo '=== T22 (database-integrity guard): a normal employer OWNER (non-admin, member of e3000003 which is active/editable) cannot change their own employer status via a raw UPDATE -- RLS (employers_owner_admin_update) permits reaching the row, but the trigger blocks the status change regardless. Expect SQLSTATE 23514, no status change. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000005-0000-0000-0000-000000000005', false);
SET ROLE authenticated;
UPDATE public.employers SET status = 'suspended' WHERE id = 'e3000003-0000-0000-0000-000000000003';
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000003-0000-0000-0000-000000000003';

\echo '=== T23 (database-integrity guard): a candidate with no employer membership at all cannot change ANY employer status via a raw UPDATE -- blocked at the RLS layer itself (employers_owner_admin_update''s USING clause excludes them, employers_admin_all requires is_platform_admin), before the trigger is even relevant. Expect zero rows affected, no status change. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
UPDATE public.employers SET status = 'active' WHERE id = 'e3000001-0000-0000-0000-000000000001';
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000001-0000-0000-0000-000000000001';

\echo '=== T24 (regression guard): the owner/admin of an editable employer CAN still update permitted, non-status organisation fields (this is the exact H3.2 employer-settings flow -- updateEmployerOrganisation never sends status, so it must be completely unaffected by this migration). Expect success, name changes, status unchanged. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000005-0000-0000-0000-000000000005', false);
SET ROLE authenticated;
UPDATE public.employers SET name = 'Fictional Suspended Co 3 (renamed)', website = 'https://example.invalid/renamed' WHERE id = 'e3000003-0000-0000-0000-000000000003';
RESET ROLE;
SELECT name, website, status FROM public.employers WHERE id = 'e3000003-0000-0000-0000-000000000003';

\echo '=== T25 (regression guard): slug remains protected from a non-admin employer member, unaffected by this migration (pre-existing H3.2 behaviour, reconfirmed after replacing employers_validate_before_write()). Expect SQLSTATE 23514, slug unchanged. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000005-0000-0000-0000-000000000005', false);
SET ROLE authenticated;
UPDATE public.employers SET slug = 'hijacked-slug' WHERE id = 'e3000003-0000-0000-0000-000000000003';
RESET ROLE;
SELECT slug FROM public.employers WHERE id = 'e3000003-0000-0000-0000-000000000003';

\echo '=== T26 (regression guard): brand-new self-service employer creation via create_my_employer_company() (Phase H3.1, unchanged code) still defaults to pending -- proves the new trigger logic, which only ever fires on TG_OP = UPDATE, has zero effect on INSERT. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000002-0000-0000-0000-000000000002', false);
SET ROLE authenticated;
SELECT * FROM public.create_my_employer_company('Fresh Guard-Test Co', 'fresh-guard-test-co', 'SE', NULL, NULL, NULL);
RESET ROLE;
SELECT status FROM public.employers WHERE slug = 'fresh-guard-test-co';

\echo '=== T27 (audit atomicity, whole-run check): exactly 4 employer_moderation_events rows exist at this point -- one for each of the 4 successful moderate_employer() calls so far in this run (T7 reject, T8 suspend, T9 reactivate, T6/14/15/16 approve). No failed call (T10, T11, T12, T13, and this test file''s own T21/T22/T23 raw-UPDATE attempts, all of which never reach moderate_employer at all) added a row. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT count(*) AS total_moderation_events FROM public.employer_moderation_events;
RESET ROLE;

\echo '=== T28 (failed transitions create neither status change nor audit row): repeat an invalid transition (approve an already-rejected employer) through the real moderate_employer() RPC and confirm the audit-row count from T27 does not increase. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer('e3000004-0000-0000-0000-000000000004', 'approved', NULL);
SELECT count(*) AS total_moderation_events_after_failed_call FROM public.employer_moderation_events;
RESET ROLE;
SELECT status FROM public.employers WHERE id = 'e3000004-0000-0000-0000-000000000004';

\echo '=== T29 (canonical RPC still works after the guard was added): platform admin can still approve a fresh pending employer end-to-end through moderate_employer() -- proves the transaction-local marker correctly lets the RPC''s own internal UPDATE through. ==='
SELECT set_config('request.jwt.claim.sub', 'd3000001-0000-0000-0000-000000000001', false);
SET ROLE authenticated;
SELECT * FROM public.moderate_employer(
  (SELECT id FROM public.employers WHERE slug = 'fresh-guard-test-co'),
  'approved',
  'Approved for guard-test verification.'
);
RESET ROLE;
SELECT status FROM public.employers WHERE slug = 'fresh-guard-test-co';

\echo '=== DONE ==='
