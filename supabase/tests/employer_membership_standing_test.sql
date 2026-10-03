-- A suspension or removal by a platform admin cannot be undone by the
-- organisation, and a reviewer grant does not outlive the membership it was made
-- to. Migration 20270202090000.
--
-- Everything that asks "may THIS person do THIS" runs as `authenticated` with a
-- JWT subject set, never as the table owner. MS0 reproduces every defect on the
-- PRE-FIX state inside this suite: a savepoint, the real rollback file, the
-- defect, then a rollback to the savepoint.
--
--   MS-F  the fixture: organisation E (active) and E2; owner O, admin A, member M;
--         S, R, I: members that are suspended, removed, invited; V, W: members
--         with reviewer grants; U: an outsider; P: a platform admin.
--   MS0   REPRODUCTION on the pre-fix state: a suspended person files a request,
--         the organisation's owner approves them back in, and a reviewer grant
--         returns on reactivation.
--   MS1   the request insert: refused for a suspended or removed requester, with
--         the code the application maps; allowed for everybody else; per organisation.
--   MS2   approve_access_request never reactivates: owner, admin and platform
--         admin are all refused, the request stays pending and can be denied,
--         the membership row is unchanged; new and invited people are still admitted.
--   MS3   every other writer of employer_memberships (audited): company creation,
--         direct DML by an owner, an admin and the member, update_employer_membership
--         by a non-platform admin, the reviewer grant guard -- none moves a person back.
--   MS4   reviewer grants end with the membership and do not return; the history
--         is kept; a fresh grant by an owner works; other users and other
--         organisations are untouched; a role change does not revoke.
--   MS5   the platform-admin path is the one that still reactivates.
--   MS6   re-applying the migration revokes a stale grant (the backfill) and
--         changes nothing else.
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

CREATE TEMP TABLE ms AS SELECT
  '5a7d0000-1111-4000-8000-000000000001'::uuid AS e,
  '5a7d0000-1111-4000-8000-000000000002'::uuid AS e2,
  '5a7d0000-0000-4000-8000-000000000001'::uuid AS o,
  '5a7d0000-0000-4000-8000-000000000002'::uuid AS a,
  '5a7d0000-0000-4000-8000-000000000003'::uuid AS m,
  '5a7d0000-0000-4000-8000-000000000004'::uuid AS s,
  '5a7d0000-0000-4000-8000-000000000005'::uuid AS r,
  '5a7d0000-0000-4000-8000-000000000006'::uuid AS i,
  '5a7d0000-0000-4000-8000-000000000007'::uuid AS v,
  '5a7d0000-0000-4000-8000-000000000008'::uuid AS w,
  '5a7d0000-0000-4000-8000-000000000009'::uuid AS u,
  '5a7d0000-0000-4000-8000-00000000000a'::uuid AS p,
  '5a7d0000-0000-4000-8000-00000000000b'::uuid AS x,
  '5a7d0000-0000-4000-8000-00000000000c'::uuid AS n;

GRANT SELECT ON ms TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT o, 'ms-owner@test.invalid' FROM ms UNION ALL SELECT a, 'ms-admin@test.invalid' FROM ms UNION ALL
SELECT m, 'ms-member@test.invalid' FROM ms UNION ALL SELECT s, 'ms-suspended@test.invalid' FROM ms UNION ALL
SELECT r, 'ms-removed@test.invalid' FROM ms UNION ALL SELECT i, 'ms-invited@test.invalid' FROM ms UNION ALL
SELECT v, 'ms-reviewer-v@test.invalid' FROM ms UNION ALL SELECT w, 'ms-reviewer-w@test.invalid' FROM ms UNION ALL
SELECT u, 'ms-outsider@test.invalid' FROM ms UNION ALL SELECT p, 'ms-platform@test.invalid' FROM ms UNION ALL
SELECT x, 'ms-reviewer-x@test.invalid' FROM ms UNION ALL SELECT n, 'ms-new@test.invalid' FROM ms;
INSERT INTO public.user_roles (user_id, role) SELECT p, 'admin' FROM ms;
INSERT INTO public.employers (id, name, slug, status)
SELECT e, 'MS Employer', 'ms-employer', 'active' FROM ms UNION ALL
SELECT e2, 'MS Employer Two', 'ms-employer-two', 'active' FROM ms;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, o, 'owner', 'active' FROM ms UNION ALL SELECT e, a, 'admin', 'active' FROM ms UNION ALL
SELECT e, m, 'member', 'active' FROM ms UNION ALL SELECT e, s, 'member', 'active' FROM ms UNION ALL
SELECT e, r, 'member', 'active' FROM ms UNION ALL SELECT e, i, 'member', 'invited' FROM ms UNION ALL
SELECT e, v, 'member', 'active' FROM ms UNION ALL SELECT e, w, 'member', 'active' FROM ms UNION ALL
SELECT e, x, 'member', 'active' FROM ms UNION ALL
SELECT e2, o, 'owner', 'active' FROM ms UNION ALL SELECT e2, v, 'member', 'active' FROM ms;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e, v, ARRAY['workforce','recruitment']::text[], o FROM ms UNION ALL
SELECT e, w, ARRAY['workforce']::text[], o FROM ms UNION ALL
SELECT e, x, ARRAY['recruitment']::text[], o FROM ms UNION ALL
SELECT e2, v, ARRAY['workforce']::text[], o FROM ms;

-- ── Helpers: everything below acts through the real roles ────────────────
-- A statement as `authenticated` with a JWT subject: 'ok' or "<sqlstate>:<code>".
CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid uuid, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    _r := SQLSTATE || ':' || split_part(SQLERRM, ':', 1);
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
-- A DML statement as `authenticated`: the rows it touched, or -1 when it was refused.
CREATE OR REPLACE FUNCTION pg_temp.rows_as(_uid uuid, _sql text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE _n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS _n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    _n := -1;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _n;
END $$;
-- The platform admin's own function, as the admin screen calls it.
CREATE OR REPLACE FUNCTION pg_temp.set_status(_who uuid, _status text, _employer uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text; _e uuid := coalesce(_employer, (SELECT e FROM ms));
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT p FROM ms)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT u.status INTO _r FROM public.update_employer_membership(
    (SELECT mm.id FROM public.employer_memberships mm WHERE mm.employer_id = _e AND mm.user_id = _who), NULL, _status) u;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.set_role(_who uuid, _role text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT p FROM ms)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT u.role INTO _r FROM public.update_employer_membership(
    (SELECT mm.id FROM public.employer_memberships mm WHERE mm.employer_id = (SELECT e FROM ms) AND mm.user_id = _who), _role, NULL) u;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
-- The request a person files to E, as that person (the application's own insert).
CREATE OR REPLACE FUNCTION pg_temp.file_request(_who uuid, _employer uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.try_as(_who, format(
    'INSERT INTO public.employer_access_requests (employer_id, requester_user_id, message) VALUES (%L, %L, %L)',
    coalesce(_employer, (SELECT e FROM ms)), _who, 'ms'));
END $$;
CREATE OR REPLACE FUNCTION pg_temp.req_of(_who uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.employer_access_requests
   WHERE employer_id = (SELECT e FROM ms) AND requester_user_id = _who AND status = 'pending';
$$;
CREATE OR REPLACE FUNCTION pg_temp.decide(_by uuid, _who uuid, _decision text, _role text DEFAULT 'member') RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.try_as(_by, format(
    'SELECT * FROM public.approve_access_request(%L, %L, %L)', pg_temp.req_of(_who), _decision, _role));
END $$;
CREATE OR REPLACE FUNCTION pg_temp.mstate(_who uuid, _employer uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT status || '/' || role || '/' || (removed_at IS NOT NULL)::text FROM public.employer_memberships
   WHERE employer_id = coalesce(_employer, (SELECT e FROM ms)) AND user_id = _who;
$$;
CREATE OR REPLACE FUNCTION pg_temp.live_grants(_who uuid, _employer uuid DEFAULT NULL) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.scp_employer_reviewers
   WHERE employer_id = coalesce(_employer, (SELECT e FROM ms)) AND user_id = _who AND revoked_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION pg_temp.can_review(_who uuid, _uc text) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.scp_can_review_for(_who, (SELECT e FROM ms), _uc);
$$;

-- Results of actions are recorded in their own statement, and read in the next:
-- a function called in the same statement as the change would read the snapshot
-- taken before it.
CREATE TEMP TABLE msr (k text PRIMARY KEY, v text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_k text, _v text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO msr VALUES (_k, _v) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
$$;
CREATE OR REPLACE FUNCTION pg_temp.got(_k text) RETURNS text LANGUAGE sql AS $$
  SELECT v FROM msr WHERE k = _k;
$$;

DO $$ BEGIN RAISE NOTICE 'GROUP MS-F -- the fixture'; END $$;
SELECT pg_temp.ok(pg_temp.mstate((SELECT s FROM ms)) = 'active/member/false'
  AND pg_temp.mstate((SELECT i FROM ms)) = 'invited/member/false'
  AND pg_temp.live_grants((SELECT v FROM ms)) = 1 AND pg_temp.can_review((SELECT v FROM ms), 'recruitment'),
  'MS-F.1 S is an active member, I is invited, and V holds a live reviewer grant that works');

-- ── MS0 · reproduction on the pre-fix state ──────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP MS0 -- reproduction: the bypass and the returning grant on the pre-fix state'; END $$;
SAVEPOINT pre_fix;
\ir ../rollback/20270202090000_employer_membership_standing_not_bypassable_rollback.sql
-- S is suspended by the platform admin, then asks to come back.
SELECT pg_temp.rec('0s', pg_temp.set_status((SELECT s FROM ms), 'suspended'));
SELECT pg_temp.rec('0f', pg_temp.file_request((SELECT s FROM ms)));
SELECT pg_temp.ok(pg_temp.got('0s') = 'suspended' AND pg_temp.got('0f') = 'ok',
  'MS0.1 PRE-FIX: a person the platform admin suspended files an access request for the organisation');
SELECT pg_temp.rec('0d', pg_temp.decide((SELECT o FROM ms), (SELECT s FROM ms), 'approved'));
SELECT pg_temp.ok(pg_temp.got('0d') = 'ok' AND pg_temp.mstate((SELECT s FROM ms)) = 'active/member/false',
  'MS0.2 PRE-FIX: the organisation''s own owner approves them and the suspension is undone');
-- V is suspended and reactivated by the platform admin; the grant is back.
SELECT pg_temp.rec('0v', pg_temp.set_status((SELECT v FROM ms), 'suspended'));
SELECT pg_temp.ok(pg_temp.got('0v') = 'suspended'
  AND pg_temp.live_grants((SELECT v FROM ms)) = 1 AND NOT pg_temp.can_review((SELECT v FROM ms), 'recruitment'),
  'MS0.3 PRE-FIX: the grant of a suspended member stays live (inert while suspended)');
SELECT pg_temp.rec('0a', pg_temp.set_status((SELECT v FROM ms), 'active'));
SELECT pg_temp.ok(pg_temp.got('0a') = 'active'
  AND pg_temp.can_review((SELECT v FROM ms), 'recruitment') AND pg_temp.can_review((SELECT v FROM ms), 'workforce'),
  'MS0.4 PRE-FIX: reactivated, V reviews again with both use cases and nobody granted anything');
ROLLBACK TO SAVEPOINT pre_fix;

SELECT pg_temp.ok(pg_temp.mstate((SELECT s FROM ms)) = 'active/member/false'
  AND pg_temp.live_grants((SELECT v FROM ms)) = 1
  AND to_regprocedure('public.employer_access_request_standing_guard()') IS NOT NULL,
  'MS0.5 the savepoint was undone: the fix is back in place and the fixture is as it was');

-- ── MS1 · the request insert ─────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP MS1 -- the access-request insert'; END $$;
SELECT pg_temp.rec('1s', pg_temp.set_status((SELECT s FROM ms), 'suspended'));
SELECT pg_temp.rec('1r', pg_temp.set_status((SELECT r FROM ms), 'removed'));
SELECT pg_temp.ok(pg_temp.mstate((SELECT s FROM ms)) = 'suspended/member/false'
  AND pg_temp.mstate((SELECT r FROM ms)) = 'removed/member/true',
  'MS1.0 S is suspended and R removed, through update_employer_membership as the platform admin');
SELECT pg_temp.ok(pg_temp.file_request((SELECT s FROM ms)) = '42501:ACCESS_REQUEST_MEMBERSHIP_BLOCKED'
  AND (SELECT count(*) FROM public.employer_access_requests WHERE requester_user_id = (SELECT s FROM ms)) = 0,
  'MS1.1 a SUSPENDED person cannot file a request: the coded refusal, and no row');
SELECT pg_temp.ok(pg_temp.file_request((SELECT r FROM ms)) = '42501:ACCESS_REQUEST_MEMBERSHIP_BLOCKED'
  AND (SELECT count(*) FROM public.employer_access_requests WHERE requester_user_id = (SELECT r FROM ms)) = 0,
  'MS1.2 a REMOVED person cannot either');
SELECT pg_temp.ok(pg_temp.file_request((SELECT u FROM ms)) = 'ok'
  AND pg_temp.file_request((SELECT i FROM ms)) = 'ok'
  AND pg_temp.file_request((SELECT n FROM ms)) = 'ok',
  'MS1.3 an outsider, an invited person and a new person still can');
SELECT pg_temp.ok(pg_temp.file_request((SELECT s FROM ms), (SELECT e2 FROM ms)) = 'ok',
  'MS1.4 the block is per organisation: S, suspended at E, can still ask to join E2');
SELECT pg_temp.ok(pg_temp.try_as((SELECT p FROM ms), format(
    'INSERT INTO public.employer_access_requests (employer_id, requester_user_id) VALUES (%L, %L)',
    (SELECT e FROM ms), (SELECT s FROM ms))) = '42501:ACCESS_REQUEST_MEMBERSHIP_BLOCKED',
  'MS1.5 not even a platform admin files a request on behalf of a suspended person: they reactivate through update_employer_membership');

-- ── MS2 · an approval never reactivates ──────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP MS2 -- approve_access_request'; END $$;
-- A request that was filed BEFORE the suspension and is still pending: the
-- policy cannot stop it, the approval must.
INSERT INTO public.employer_access_requests (employer_id, requester_user_id, status, message)
SELECT e, v, 'pending', 'ms-pre-suspension' FROM ms;
SELECT pg_temp.rec('2v', pg_temp.set_status((SELECT v FROM ms), 'suspended'));
-- S and R are blocked from filing, so the old requests are planted as the table owner
-- with the guard stepped over: that is the state a person reaches by filing first and
-- being suspended after.
ALTER TABLE public.employer_access_requests DISABLE TRIGGER employer_access_requests_standing_guard;
INSERT INTO public.employer_access_requests (employer_id, requester_user_id, status, message)
SELECT e, s, 'pending', 'ms-old' FROM ms UNION ALL SELECT e, r, 'pending', 'ms-old' FROM ms;
ALTER TABLE public.employer_access_requests ENABLE TRIGGER employer_access_requests_standing_guard;
SELECT pg_temp.ok(pg_temp.mstate((SELECT v FROM ms)) = 'suspended/member/false'
  AND pg_temp.req_of((SELECT v FROM ms)) IS NOT NULL AND pg_temp.req_of((SELECT s FROM ms)) IS NOT NULL
  AND pg_temp.req_of((SELECT r FROM ms)) IS NOT NULL,
  'MS2.0 pending requests exist for a suspended member (S, V) and a removed one (R)');
SELECT pg_temp.ok(pg_temp.decide((SELECT o FROM ms), (SELECT s FROM ms), 'approved') = '42501:ACCESS_REQUEST_REACTIVATION_REFUSED'
  AND pg_temp.decide((SELECT a FROM ms), (SELECT s FROM ms), 'approved', 'admin') = '42501:ACCESS_REQUEST_REACTIVATION_REFUSED'
  AND pg_temp.decide((SELECT o FROM ms), (SELECT r FROM ms), 'approved') = '42501:ACCESS_REQUEST_REACTIVATION_REFUSED'
  AND pg_temp.decide((SELECT a FROM ms), (SELECT v FROM ms), 'approved') = '42501:ACCESS_REQUEST_REACTIVATION_REFUSED',
  'MS2.1 the owner and the admin cannot approve a suspended or a removed person back in');
SELECT pg_temp.ok(pg_temp.decide((SELECT p FROM ms), (SELECT s FROM ms), 'approved') = '42501:ACCESS_REQUEST_REACTIVATION_REFUSED'
  AND pg_temp.decide((SELECT p FROM ms), (SELECT r FROM ms), 'approved', 'owner') = '42501:ACCESS_REQUEST_REACTIVATION_REFUSED',
  'MS2.2 a platform admin approving through the request is refused too: update_employer_membership is the only path');
SELECT pg_temp.ok(pg_temp.mstate((SELECT s FROM ms)) = 'suspended/member/false'
  AND pg_temp.mstate((SELECT r FROM ms)) = 'removed/member/true'
  AND pg_temp.mstate((SELECT v FROM ms)) = 'suspended/member/false',
  'MS2.3 the memberships are exactly as they were: status, role and removed_at');
SELECT pg_temp.ok(pg_temp.req_of((SELECT s FROM ms)) IS NOT NULL AND pg_temp.req_of((SELECT r FROM ms)) IS NOT NULL,
  'MS2.4 the refused requests are still pending, not silently consumed');
-- The refusal is made twice. With the up-front check neutralised, the write
-- itself (ON CONFLICT ... DO UPDATE ... WHERE status NOT IN (...)) still refuses,
-- so a suspension committed between the check and the write is not overwritten.
DO $$
DECLARE _def text := pg_get_functiondef('public.approve_access_request(uuid,text,text)'::regprocedure);
BEGIN
  _def := replace(_def, 'public.approve_access_request(', 'pg_temp.approve_noprecheck(');
  IF position('AND EXISTS (SELECT 1 FROM public.employer_memberships m  -- rule:standing' IN _def) = 0 THEN
    RAISE EXCEPTION 'MS2.8 setup: the up-front standing check was not found in the body';
  END IF;
  _def := replace(_def, 'AND EXISTS (SELECT 1 FROM public.employer_memberships m  -- rule:standing',
                        'AND false AND EXISTS (SELECT 1 FROM public.employer_memberships m  -- rule:standing');
  EXECUTE _def;
END $$;
SELECT pg_temp.rec('28', pg_temp.try_as((SELECT o FROM ms), format(
  'SELECT * FROM pg_temp.approve_noprecheck(%L, %L, %L)', pg_temp.req_of((SELECT s FROM ms)), 'approved', 'member')));
SELECT pg_temp.ok(pg_temp.got('28') = '42501:ACCESS_REQUEST_REACTIVATION_REFUSED'
  AND pg_temp.mstate((SELECT s FROM ms)) = 'suspended/member/false'
  AND pg_temp.req_of((SELECT s FROM ms)) IS NOT NULL,
  'MS2.8 with the up-front check removed, the conflict write still refuses: the suspended member stays suspended and the request stays pending');
SELECT pg_temp.rec('2ds', pg_temp.decide((SELECT o FROM ms), (SELECT s FROM ms), 'denied'));
SELECT pg_temp.rec('2dr', pg_temp.decide((SELECT o FROM ms), (SELECT r FROM ms), 'denied'));
SELECT pg_temp.ok(pg_temp.got('2ds') = 'ok' AND pg_temp.got('2dr') = 'ok'
  AND (SELECT count(*) FROM public.employer_access_requests WHERE employer_id = (SELECT e FROM ms) AND requester_user_id IN ((SELECT s FROM ms), (SELECT r FROM ms)) AND status = 'denied') = 2,
  'MS2.5 a request from a suspended or removed person can still be DENIED');
SELECT pg_temp.rec('2u', pg_temp.decide((SELECT o FROM ms), (SELECT u FROM ms), 'approved'));
SELECT pg_temp.rec('2n', pg_temp.decide((SELECT a FROM ms), (SELECT n FROM ms), 'approved', 'admin'));
SELECT pg_temp.ok(pg_temp.got('2u') = 'ok' AND pg_temp.mstate((SELECT u FROM ms)) = 'active/member/false'
  AND pg_temp.got('2n') = 'ok' AND pg_temp.mstate((SELECT n FROM ms)) = 'active/admin/false',
  'MS2.6 a new person is still admitted, as member and as admin');
SELECT pg_temp.rec('2i', pg_temp.decide((SELECT o FROM ms), (SELECT i FROM ms), 'approved'));
SELECT pg_temp.ok(pg_temp.got('2i') = 'ok' AND pg_temp.mstate((SELECT i FROM ms)) = 'active/member/false',
  'MS2.7 an INVITED person is still admitted (that is what the conflict branch is for)');

-- ── MS3 · every other writer of employer_memberships ─────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP MS3 -- the other paths that write employer_memberships'; END $$;
SELECT pg_temp.ok(
  pg_temp.rows_as((SELECT o FROM ms), format('UPDATE public.employer_memberships SET status = %L, removed_at = NULL WHERE user_id = %L', 'active', (SELECT s FROM ms))) = 0
  AND pg_temp.rows_as((SELECT a FROM ms), format('UPDATE public.employer_memberships SET status = %L WHERE user_id = %L', 'active', (SELECT r FROM ms))) = 0
  AND pg_temp.rows_as((SELECT m FROM ms), format('UPDATE public.employer_memberships SET status = %L WHERE user_id = %L', 'active', (SELECT s FROM ms))) = 0
  AND pg_temp.mstate((SELECT s FROM ms)) = 'suspended/member/false' AND pg_temp.mstate((SELECT r FROM ms)) = 'removed/member/true',
  'MS3.1 the organisation''s owner, its admin and a member cannot UPDATE a membership through the table (no policy admits them)');
SELECT pg_temp.ok(
  pg_temp.rows_as((SELECT s FROM ms), format('UPDATE public.employer_memberships SET status = %L WHERE user_id = %L', 'active', (SELECT s FROM ms))) = 0
  AND pg_temp.rows_as((SELECT r FROM ms), format('UPDATE public.employer_memberships SET status = %L WHERE user_id = %L', 'active', (SELECT r FROM ms))) = 0
  AND pg_temp.mstate((SELECT s FROM ms)) = 'suspended/member/false',
  'MS3.2 and the suspended or removed person cannot UPDATE their own row');
SELECT pg_temp.ok(
  pg_temp.rows_as((SELECT o FROM ms), format('INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES (%L, %L, %L, %L)', (SELECT e FROM ms), (SELECT n FROM ms), 'member', 'active')) = -1
  AND pg_temp.rows_as((SELECT o FROM ms), format('DELETE FROM public.employer_memberships WHERE user_id = %L', (SELECT s FROM ms))) = 0
  AND pg_temp.mstate((SELECT s FROM ms)) = 'suspended/member/false',
  'MS3.3 the owner cannot INSERT or DELETE a membership row either');
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM ms), format('SELECT public.update_employer_membership(%L, NULL, %L)',
    (SELECT id FROM public.employer_memberships WHERE user_id = (SELECT s FROM ms) AND employer_id = (SELECT e FROM ms)), 'active')) = 'P0001:Forbidden'
  AND pg_temp.try_as((SELECT a FROM ms), format('SELECT public.update_employer_membership(%L, NULL, %L)',
    (SELECT id FROM public.employer_memberships WHERE user_id = (SELECT r FROM ms) AND employer_id = (SELECT e FROM ms)), 'active')) = 'P0001:Forbidden'
  AND pg_temp.try_as((SELECT s FROM ms), format('SELECT public.update_employer_membership(%L, NULL, %L)',
    (SELECT id FROM public.employer_memberships WHERE user_id = (SELECT s FROM ms) AND employer_id = (SELECT e FROM ms)), 'active')) = 'P0001:Forbidden',
  'MS3.4 update_employer_membership refuses the owner, the admin and the suspended person themselves: platform admin only');
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM ms), format('SELECT public.scp_grant_employer_reviewer(%L, %L, ARRAY[%L])', (SELECT e FROM ms), (SELECT s FROM ms), 'workforce')) = '42501:SCP_REVIEWER_NOT_A_MEMBER'
  AND pg_temp.try_as((SELECT o FROM ms), format('SELECT public.scp_grant_employer_reviewer(%L, %L, ARRAY[%L])', (SELECT e FROM ms), (SELECT r FROM ms), 'recruitment')) = '42501:SCP_REVIEWER_NOT_A_MEMBER'
  AND pg_temp.live_grants((SELECT s FROM ms)) = 0 AND pg_temp.live_grants((SELECT r FROM ms)) = 0,
  'MS3.5 a reviewer grant cannot be made to a suspended or a removed member');
-- Company creation makes a NEW organisation and its owner row; it cannot collide with E.
SELECT pg_temp.rec('3c1', pg_temp.try_as((SELECT s FROM ms), format('SELECT * FROM public.create_my_employer_company(%L, %L, %L, %L, %L, %L)',
    'MS Nytt Bolag', 'ms-nytt-bolag', 'SE', NULL, NULL, 'VD')));
SELECT pg_temp.ok(
  pg_temp.got('3c1') = 'ok'
  AND pg_temp.mstate((SELECT s FROM ms)) = 'suspended/member/false'
  AND (SELECT count(*) FROM public.employer_memberships WHERE user_id = (SELECT s FROM ms)) = 2,
  'MS3.6 create_my_employer_company by S makes a NEW organisation with S as its owner and leaves S suspended at E');
SELECT pg_temp.rec('3c2', pg_temp.try_as((SELECT r FROM ms), format('SELECT * FROM public.create_employer_self_service(%L, NULL, %L, NULL, NULL)',
    'MS Eget Bolag', 'SE')));
SELECT pg_temp.ok(
  pg_temp.got('3c2') = 'ok'
  AND pg_temp.mstate((SELECT r FROM ms)) = 'removed/member/true'
  AND (SELECT count(*) FROM public.employer_memberships WHERE user_id = (SELECT r FROM ms)) = 2,
  'MS3.7 create_employer_self_service by R likewise leaves R removed at E');
SELECT pg_temp.ok(
  NOT public.has_active_employer_role((SELECT s FROM ms), (SELECT e FROM ms))
  AND NOT public.has_active_employer_role((SELECT r FROM ms), (SELECT e FROM ms))
  AND NOT public.has_employer_role((SELECT s FROM ms), (SELECT e FROM ms)),
  'MS3.8 after every attempt above, S and R hold no standing at E');

-- ── MS4 · reviewer grants end with the membership ────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP MS4 -- reviewer grants'; END $$;
-- V was suspended in MS2 by update_employer_membership: its trigger has run.
SELECT pg_temp.ok(pg_temp.live_grants((SELECT v FROM ms)) = 0
  AND (SELECT count(*) FROM public.scp_employer_reviewers WHERE employer_id = (SELECT e FROM ms) AND user_id = (SELECT v FROM ms) AND revoked_at IS NOT NULL AND revoked_by = (SELECT p FROM ms)) = 1,
  'MS4.1 suspending V revoked V''s grant at E in the same transaction, recording the platform admin who did it');
SELECT pg_temp.ok(pg_temp.live_grants((SELECT v FROM ms), (SELECT e2 FROM ms)) = 1
  AND pg_temp.live_grants((SELECT w FROM ms)) = 1 AND pg_temp.live_grants((SELECT x FROM ms)) = 1,
  'MS4.2 V''s grant at ANOTHER organisation and the other reviewers'' grants are untouched');
SELECT pg_temp.rec('4a', pg_temp.set_status((SELECT v FROM ms), 'active'));
SELECT pg_temp.ok(pg_temp.got('4a') = 'active'
  AND pg_temp.mstate((SELECT v FROM ms)) = 'active/member/false'
  AND NOT pg_temp.can_review((SELECT v FROM ms), 'recruitment') AND NOT pg_temp.can_review((SELECT v FROM ms), 'workforce')
  AND pg_temp.live_grants((SELECT v FROM ms)) = 0,
  'MS4.3 reactivated by the platform admin, V is an active member again and does NOT review: the grant did not come back');
SELECT pg_temp.rec('4g', pg_temp.try_as((SELECT o FROM ms), format('SELECT public.scp_grant_employer_reviewer(%L, %L, ARRAY[%L, %L])', (SELECT e FROM ms), (SELECT v FROM ms), 'recruitment', 'workforce')));
SELECT pg_temp.ok(
  pg_temp.got('4g') = 'ok'
  AND pg_temp.can_review((SELECT v FROM ms), 'recruitment') AND pg_temp.can_review((SELECT v FROM ms), 'workforce')
  AND (SELECT count(*) FROM public.scp_employer_reviewers WHERE employer_id = (SELECT e FROM ms) AND user_id = (SELECT v FROM ms)) = 2,
  'MS4.4 a fresh grant by the owner works again, and the revoked row is kept as history');
SELECT pg_temp.rec('4w', pg_temp.set_status((SELECT w FROM ms), 'removed'));
SELECT pg_temp.ok(pg_temp.live_grants((SELECT w FROM ms)) = 0 AND pg_temp.mstate((SELECT w FROM ms)) = 'removed/member/true',
  'MS4.5 REMOVING W revokes W''s grant');
SELECT pg_temp.rec('4w2', pg_temp.set_status((SELECT w FROM ms), 'active'));
SELECT pg_temp.ok(pg_temp.mstate((SELECT w FROM ms)) = 'active/member/false' AND NOT pg_temp.can_review((SELECT w FROM ms), 'workforce'),
  'MS4.6 and reactivating a REMOVED member does not bring it back');
SELECT pg_temp.rec('4r', pg_temp.set_role((SELECT x FROM ms), 'admin'));
SELECT pg_temp.ok(pg_temp.got('4r') = 'admin'
  AND pg_temp.live_grants((SELECT x FROM ms)) = 1 AND pg_temp.can_review((SELECT x FROM ms), 'recruitment'),
  'MS4.7 a role change that leaves the member active does not revoke the grant');
-- DELETE: the row is gone, the grant must go with it, and a later re-admission must not revive it.
DELETE FROM public.employer_memberships WHERE employer_id = (SELECT e FROM ms) AND user_id = (SELECT x FROM ms);
SELECT pg_temp.ok(pg_temp.live_grants((SELECT x FROM ms)) = 0,
  'MS4.8 deleting a membership row revokes the grant');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e, x, 'member', 'active' FROM ms;
SELECT pg_temp.ok(pg_temp.mstate((SELECT x FROM ms)) = 'active/member/false' AND NOT pg_temp.can_review((SELECT x FROM ms), 'recruitment'),
  'MS4.9 and a re-created active membership does not revive it');

-- ── MS5 · the platform-admin path still reactivates ──────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP MS5 -- update_employer_membership is the one that reactivates'; END $$;
SELECT pg_temp.rec('5s', pg_temp.set_status((SELECT s FROM ms), 'active'));
SELECT pg_temp.rec('5r', pg_temp.set_status((SELECT r FROM ms), 'active'));
SELECT pg_temp.ok(pg_temp.got('5s') = 'active' AND pg_temp.got('5r') = 'active'
  AND public.has_active_employer_role((SELECT s FROM ms), (SELECT e FROM ms))
  AND public.has_active_employer_role((SELECT r FROM ms), (SELECT e FROM ms)),
  'MS5.1 the platform admin reactivates a suspended and a removed member through update_employer_membership');
SELECT pg_temp.rec('5i', pg_temp.try_as((SELECT p FROM ms), format('INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES (%L, %L, %L, %L)',
    (SELECT e2 FROM ms), (SELECT n FROM ms), 'member', 'active')));
SELECT pg_temp.ok(
  pg_temp.got('5i') = 'ok'
  AND public.has_active_employer_role((SELECT n FROM ms), (SELECT e2 FROM ms)),
  'MS5.2 and adds a member directly through the platform-admin policy, as the admin screen does');

-- ── MS6 · re-applying the migration ──────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP MS6 -- the backfill and replayability'; END $$;
SAVEPOINT pre_fix_again;
\ir ../rollback/20270202090000_employer_membership_standing_not_bypassable_rollback.sql
-- With the trigger gone, suspending W leaves its (re-made) grant live.
SELECT pg_temp.try_as((SELECT o FROM ms), format('SELECT public.scp_grant_employer_reviewer(%L, %L, ARRAY[%L])', (SELECT e FROM ms), (SELECT w FROM ms), 'workforce'));
SELECT pg_temp.set_status((SELECT w FROM ms), 'suspended');
SELECT pg_temp.ok(pg_temp.live_grants((SELECT w FROM ms)) = 1 AND pg_temp.mstate((SELECT w FROM ms)) = 'suspended/member/false',
  'MS6.1 on the pre-fix state a suspended member holds a live (inert) grant');
\ir ../migrations/20270202090000_employer_membership_standing_not_bypassable.sql
SELECT pg_temp.ok(pg_temp.live_grants((SELECT w FROM ms)) = 0
  AND (SELECT count(*) FROM public.scp_employer_reviewers WHERE employer_id = (SELECT e FROM ms) AND user_id = (SELECT w FROM ms) AND revoked_at IS NOT NULL) >= 2,
  'MS6.2 the migration (re-applied over the pre-fix state) revoked that stale grant, and the migration replays without error');
SELECT pg_temp.ok(pg_temp.live_grants((SELECT v FROM ms)) = 1 AND pg_temp.live_grants((SELECT o FROM ms)) = 0
  AND pg_temp.mstate((SELECT s FROM ms)) = 'active/member/false',
  'MS6.3 grants of active members, and every membership, are untouched by it');
ROLLBACK TO SAVEPOINT pre_fix_again;

ROLLBACK;
