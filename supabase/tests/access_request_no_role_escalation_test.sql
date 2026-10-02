-- P1-G (20270119090000): an access-request approval admits a person; it
-- cannot make an owner or change a live member's role.
--
--   AR-F the fixture: employer E (active) with owner O, admin A, member M; a
--        removed former member R; outsiders U and W; platform admin P.
--   AR0  REPRODUCTION. With the hosted body restored by the real rollback, A
--        files an access request to E and approves it as owner; A becomes an
--        owner. Rolled back.
--   AR1  A approving A's own request is refused (as owner, and at all).
--   AR2  A cannot make the outsider U an owner.
--   AR3  O cannot change a live member's role through a request: not A to
--        owner, not M to admin; the owner count is unchanged.
--   AR4  A still admits U as member and W as admin; R's removed membership is
--        reactivated as before.
--   AR5  a platform admin still grants owner.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE TEMP TABLE ar AS SELECT
  '0f190000-1111-4000-8000-000000000001'::uuid AS e,
  '0f190000-0000-4000-8000-000000000001'::uuid AS o,
  '0f190000-0000-4000-8000-000000000002'::uuid AS a,
  '0f190000-0000-4000-8000-000000000003'::uuid AS m,
  '0f190000-0000-4000-8000-000000000004'::uuid AS r,
  '0f190000-0000-4000-8000-000000000005'::uuid AS u,
  '0f190000-0000-4000-8000-000000000006'::uuid AS w,
  '0f190000-0000-4000-8000-000000000007'::uuid AS p;

INSERT INTO auth.users (id, email)
SELECT o, 'ar-owner@test.invalid' FROM ar UNION ALL SELECT a, 'ar-admin@test.invalid' FROM ar UNION ALL
SELECT m, 'ar-member@test.invalid' FROM ar UNION ALL SELECT r, 'ar-removed@test.invalid' FROM ar UNION ALL
SELECT u, 'ar-outsider-u@test.invalid' FROM ar UNION ALL SELECT w, 'ar-outsider-w@test.invalid' FROM ar UNION ALL
SELECT p, 'ar-platform@test.invalid' FROM ar;
INSERT INTO public.user_roles (user_id, role) SELECT p, 'admin' FROM ar;
INSERT INTO public.employers (id, name, slug, status) SELECT e, 'AR Employer', 'ar-employer', 'active' FROM ar;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, o, 'owner', 'active' FROM ar UNION ALL SELECT e, a, 'admin', 'active' FROM ar UNION ALL
SELECT e, m, 'member', 'active' FROM ar UNION ALL SELECT e, r, 'member', 'removed' FROM ar;

-- A pending request by _who to E (fixture write, as the table owner).
-- A refused approval leaves the request pending (one per requester), so reuse it.
CREATE OR REPLACE FUNCTION pg_temp.req(_who uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.employer_access_requests
   WHERE employer_id = (SELECT e FROM ar) AND requester_user_id = _who AND status = 'pending';
  IF _id IS NULL THEN
    INSERT INTO public.employer_access_requests (employer_id, requester_user_id, status)
    VALUES ((SELECT e FROM ar), _who, 'pending') RETURNING id INTO _id;
  END IF;
  RETURN _id;
END $$;
-- _as approves _req with _role. 'ok' or the error message prefix.
CREATE OR REPLACE FUNCTION pg_temp.approve(_as uuid, _req uuid, _role text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _as::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM * FROM public.approve_access_request(_req, 'approved', _role);
  EXCEPTION WHEN OTHERS THEN _r := split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.role_of(_who uuid) RETURNS text LANGUAGE sql AS $$
  SELECT role || '/' || status FROM public.employer_memberships
   WHERE employer_id = (SELECT e FROM ar) AND user_id = _who;
$$;
CREATE OR REPLACE FUNCTION pg_temp.owners() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.employer_memberships
   WHERE employer_id = (SELECT e FROM ar) AND role = 'owner' AND status = 'active';
$$;

SELECT pg_temp.ok(pg_temp.owners() = 1 AND pg_temp.role_of((SELECT a FROM ar)) = 'admin/active',
  'AR-F E has one owner, and A is an admin');

-- ── AR0 reproduction on the hosted body ──────────────────────────────────
SAVEPOINT pre_fix;
\ir ../rollback/20270119090000_access_request_no_role_escalation_rollback.sql
SELECT pg_temp.ok(pg_temp.approve((SELECT a FROM ar), pg_temp.req((SELECT a FROM ar)), 'owner') = 'ok'
  AND pg_temp.role_of((SELECT a FROM ar)) = 'owner/active' AND pg_temp.owners() = 2,
  'AR0.1 REPRODUCTION: pre-fix, admin A approves A''s own request as owner and becomes an owner');
ROLLBACK TO SAVEPOINT pre_fix;

-- ── AR1 no self-approval ────────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.approve((SELECT a FROM ar), pg_temp.req((SELECT a FROM ar)), 'owner') LIKE 'Forbidden%',
  'AR1.1 A approving A''s own request as owner is refused');
SELECT pg_temp.ok(pg_temp.approve((SELECT a FROM ar), pg_temp.req((SELECT a FROM ar)), 'member') LIKE 'Forbidden%'
  AND pg_temp.role_of((SELECT a FROM ar)) = 'admin/active',
  'AR1.2 A cannot approve A''s own request at all, and stays an admin');

-- ── AR2 no owner grants by the organisation ─────────────────────────────
SELECT pg_temp.ok(pg_temp.approve((SELECT a FROM ar), pg_temp.req((SELECT u FROM ar)), 'owner') LIKE 'Forbidden%'
  AND pg_temp.role_of((SELECT u FROM ar)) IS NULL,
  'AR2.1 A cannot make the outsider U an owner');
SELECT pg_temp.ok(pg_temp.approve((SELECT o FROM ar), pg_temp.req((SELECT w FROM ar)), 'owner') LIKE 'Forbidden%',
  'AR2.2 nor can the owner hand ownership out through the queue');

-- ── AR3 no role change for a live member ────────────────────────────────
SELECT pg_temp.ok(pg_temp.approve((SELECT o FROM ar), pg_temp.req((SELECT a FROM ar)), 'admin') LIKE 'Already a member%'
  AND pg_temp.approve((SELECT o FROM ar), pg_temp.req((SELECT m FROM ar)), 'admin') LIKE 'Already a member%',
  'AR3.1 the owner cannot rewrite a live member''s role through a request');
SELECT pg_temp.ok(pg_temp.role_of((SELECT a FROM ar)) = 'admin/active'
  AND pg_temp.role_of((SELECT m FROM ar)) = 'member/active' AND pg_temp.owners() = 1,
  'AR3.2 roles and the owner count are unchanged');

-- ── AR4 legitimate approvals still work ─────────────────────────────────
SELECT pg_temp.ok(pg_temp.approve((SELECT a FROM ar), pg_temp.req((SELECT u FROM ar)), 'member') = 'ok'
  AND pg_temp.role_of((SELECT u FROM ar)) = 'member/active',
  'AR4.1 A admits U as a member');
SELECT pg_temp.ok(pg_temp.approve((SELECT a FROM ar), pg_temp.req((SELECT w FROM ar)), 'admin') = 'ok'
  AND pg_temp.role_of((SELECT w FROM ar)) = 'admin/active',
  'AR4.2 A admits W as an admin');
SELECT pg_temp.ok(pg_temp.approve((SELECT o FROM ar), pg_temp.req((SELECT r FROM ar)), 'member') = 'ok'
  AND pg_temp.role_of((SELECT r FROM ar)) = 'member/active',
  'AR4.3 a removed former member is reactivated, as before');

-- ── AR5 the platform path is unchanged ──────────────────────────────────
SELECT pg_temp.ok(pg_temp.approve((SELECT p FROM ar), pg_temp.req((SELECT p FROM ar)), 'owner') = 'ok'
  AND pg_temp.role_of((SELECT p FROM ar)) = 'owner/active',
  'AR5.1 a platform admin still grants owner');

ROLLBACK;
