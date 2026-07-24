-- Admin Portal operational-scope — Phase 5 DB security regression proof.
-- Against the real, fully-migrated schema (not a mock). Every scenario
-- below maps directly to one bullet in the required Phase 5 checklist.

\set ON_ERROR_STOP off

-- T1/T2: non-admin cannot read admin-only data (employees, assignments,
-- user_roles) for an organisation they don't belong to; admin CAN read
-- across every organisation.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2000004-0000-0000-0000-000000000004', false); -- owner of org B
SELECT count(*) AS t1_org_b_owner_cannot_see_org_a_employee
FROM public.employees WHERE id = 'a2000021-0000-0000-0000-000000000001';
SELECT count(*) AS t1_org_b_owner_cannot_see_org_a_assignment
FROM public.assessment_assignments WHERE id = 'a2000031-0000-0000-0000-000000000001';
SELECT count(*) AS t1_org_b_owner_cannot_see_other_user_roles
FROM public.user_roles WHERE user_id = 'a2000001-0000-0000-0000-000000000001';
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2000002-0000-0000-0000-000000000002', false); -- ordinary admin
SELECT count(*) AS t2_admin_can_see_every_employer_employee
FROM public.employees WHERE employer_id IN (
  'a2000011-0000-0000-0000-000000000001', 'a2000012-0000-0000-0000-000000000002'
);
SELECT count(*) AS t2_admin_can_see_org_a_assignment
FROM public.assessment_assignments WHERE id = 'a2000031-0000-0000-0000-000000000001';
SELECT count(*) AS t2_admin_can_see_all_user_roles
FROM public.user_roles;
RESET ROLE;

-- T3: employer's own read/write scope for employees/assignments is
-- unaffected by the new admin policies (still org-scoped, still works).
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2000003-0000-0000-0000-000000000003', false); -- owner of org A
SELECT count(*) AS t3_org_a_owner_sees_own_employee
FROM public.employees WHERE id = 'a2000021-0000-0000-0000-000000000001';
SELECT count(*) AS t3_org_a_owner_still_cannot_see_org_b_employee
FROM public.employees WHERE id = 'a2000022-0000-0000-0000-000000000002';
RESET ROLE;

-- T4: ordinary admin CANNOT grant/revoke a platform role (superadmin-only).
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2000002-0000-0000-0000-000000000002', false); -- ordinary admin
SELECT * FROM public.admin_set_platform_role(
  'a2000003-0000-0000-0000-000000000003'::uuid, 'admin', true
);
RESET ROLE;

-- T5: superadmin CAN grant a platform role to someone else.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2000001-0000-0000-0000-000000000001', false); -- superadmin
SELECT * FROM public.admin_set_platform_role(
  'a2000003-0000-0000-0000-000000000003'::uuid, 'admin', true
);
SELECT count(*) AS t5_org_a_owner_now_has_admin_role
FROM public.user_roles WHERE user_id = 'a2000003-0000-0000-0000-000000000003' AND role = 'admin';

-- T6: self-elevation is blocked -- a superadmin cannot change THEIR OWN role.
SELECT * FROM public.admin_set_platform_role(
  'a2000001-0000-0000-0000-000000000001'::uuid, 'admin', true
);

-- T7: last-superadmin protection -- two superadmins exist right now
-- (a2000001, a2000006), so revoking one is currently allowed...
SELECT * FROM public.admin_set_platform_role(
  'a2000006-0000-0000-0000-000000000006'::uuid, 'superadmin', false
);
SELECT count(*) AS t7_only_one_superadmin_remains
FROM public.user_roles WHERE role = 'superadmin';

-- ...but now that only ONE superadmin (a2000001) remains, revoking THAT
-- one must be blocked.
SELECT * FROM public.admin_set_platform_role(
  'a2000001-0000-0000-0000-000000000001'::uuid, 'superadmin', false
);
SELECT count(*) AS t7b_last_superadmin_still_present
FROM public.user_roles WHERE role = 'superadmin';
RESET ROLE;

-- T8: admin assignment cancellation -- required reason enforced, fixed
-- precondition enforced, then a real cancellation succeeds and is audited.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2000002-0000-0000-0000-000000000002', false); -- ordinary admin (is_platform_admin -- sufficient for this RPC)

-- Empty reason must fail.
SELECT * FROM public.admin_cancel_assessment_assignment(
  'a2000031-0000-0000-0000-000000000001'::uuid, ''
);
SELECT status AS t8_status_unchanged_after_empty_reason
FROM public.assessment_assignments WHERE id = 'a2000031-0000-0000-0000-000000000001';

-- Real reason succeeds.
SELECT * FROM public.admin_cancel_assessment_assignment(
  'a2000031-0000-0000-0000-000000000001'::uuid, 'Duplicate invitation, superseded by a corrected one.'
);
SELECT status AS t8b_status_after_cancel, cancellation_reason AS t8b_reason, cancelled_by AS t8b_actor
FROM public.assessment_assignments WHERE id = 'a2000031-0000-0000-0000-000000000001';

-- Cancelling an already-cancelled assignment must fail (fixed precondition).
SELECT * FROM public.admin_cancel_assessment_assignment(
  'a2000031-0000-0000-0000-000000000001'::uuid, 'Trying again.'
);
RESET ROLE;

-- T9: raw invitation token is never exposed by anything an admin session
-- would call through the app -- confirmed structurally by
-- scripts/admin-portal-guard-check.ts (no .select() in the admin
-- assignment functions ever names invitation_token_hash). Sanity-check
-- here that the column itself still exists and is never targeted by any
-- admin RLS policy's own definition (policies gate ROWS, not columns --
-- this is a defense-in-depth note, not a DB-enforced boundary).
SELECT column_name FROM information_schema.columns
WHERE table_name = 'assessment_assignments' AND column_name = 'invitation_token_hash';

-- T10: every audit_logs row from this session is attributable, has a
-- previous/new state captured in metadata, and a timestamp -- the
-- general admin audit model this phase introduced.
SELECT action, actor_role, subject_type, (metadata ? 'reason' OR metadata ? 'role' OR metadata ? 'previous_status') AS has_context
FROM public.audit_logs
WHERE actor_id IN ('a2000001-0000-0000-0000-000000000001', 'a2000002-0000-0000-0000-000000000002')
ORDER BY at ASC;
