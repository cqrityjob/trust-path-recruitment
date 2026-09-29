-- Career Discovery release control -- cd_access_policy, executed.
--
-- Proves the three states do what 20261222090000 says they do, that only a
-- platform administrator can move between them, that no client role can read
-- or write the policy row directly, and that the tester allowlist is neither
-- deleted nor bypassed: it decides in internal_test, is ignored in public, and
-- is overruled by paused.
--
-- auth.uid() resolves from request.jwt.claim.sub, so "acting as" someone is a
-- SET LOCAL; the Postgres ROLE is set where the grant matters.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement succeeded', label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

-- ── People ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('cd0a0000-0000-4000-8000-000000000001', 'cd-admin@test.invalid',     now()),
  ('cd0a0000-0000-4000-8000-000000000002', 'cd-tester@test.invalid',    now()),
  ('cd0a0000-0000-4000-8000-000000000003', 'cd-candidate@test.invalid', now());
INSERT INTO public.user_roles (user_id, role) VALUES ('cd0a0000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.cd_internal_testers (user_id, granted_by, note)
VALUES ('cd0a0000-0000-4000-8000-000000000002', 'cd0a0000-0000-4000-8000-000000000001', 'suite');

-- ── GROUP 1: the seeded state, and who can read it ──────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 1 — seeded state and reads'; END $$;
SELECT pg_temp.ok(public.cd_access_state() = 'internal_test', '1.1 ships as internal_test');

SET LOCAL ROLE anon;
SELECT pg_temp.ok(public.cd_access_state() = 'internal_test', '1.2 anon may read the state (the public entrance needs it)');
SELECT pg_temp.must_fail('SELECT state FROM public.cd_access_policy', 'permission denied', '1.3 anon cannot read the policy table directly');
SELECT pg_temp.must_fail('SELECT public.cd_v31_may_start(''cd0a0000-0000-4000-8000-000000000003'')', 'permission denied', '1.4 anon cannot ask the signed-in gate');
SELECT pg_temp.must_fail('SELECT public.cd_set_access_state(''public'')', 'permission denied', '1.5 anon cannot change the state');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0a0000-0000-4000-8000-000000000003';
SELECT pg_temp.must_fail('SELECT state FROM public.cd_access_policy', 'permission denied', '1.6 a signed-in user cannot read the policy table directly');
SELECT pg_temp.must_fail('UPDATE public.cd_access_policy SET state = ''public''', 'permission denied', '1.7 a signed-in user cannot write the policy table directly');
SELECT pg_temp.must_fail('SELECT public.cd_set_access_state(''public'', ''x'')', 'CD_ACCESS_REQUIRES_ADMIN', '1.8 a non-admin cannot change the state');
RESET ROLE;

-- ── GROUP 2: internal_test -- today's behaviour, unchanged ──────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 2 — internal_test'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0a0000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(NOT public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000003'), '2.1 a plain signed-in candidate may not start');
SELECT pg_temp.ok(public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000002'), '2.2 an allowlisted tester may start');
SELECT pg_temp.ok(public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000001'), '2.3 a platform admin may start');
SELECT pg_temp.ok(NOT public.cd_v31_may_start(NULL), '2.4 nobody is NULL');
RESET ROLE;

-- ── GROUP 3: public -- every signed-in user, allowlist not consulted ────
DO $$ BEGIN RAISE NOTICE 'GROUP 3 — public'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0a0000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(public.cd_set_access_state('public', '  launch  ') = 'public', '3.1 an admin opens the analysis');
RESET ROLE;
SELECT pg_temp.ok((SELECT state FROM public.cd_access_policy) = 'public', '3.2 the row moved');
SELECT pg_temp.ok((SELECT note FROM public.cd_access_policy) = 'launch', '3.3 the note is trimmed and kept');
SELECT pg_temp.ok((SELECT changed_by FROM public.cd_access_policy) = 'cd0a0000-0000-4000-8000-000000000001', '3.4 the change is stamped with the admin');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0a0000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000003'), '3.5 a plain signed-in candidate may start');
SELECT pg_temp.ok(public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000002'), '3.6 the tester still may');
SELECT pg_temp.ok(NOT public.cd_v31_may_start(NULL), '3.7 an anonymous identity still may not (the anonymous path never calls this)');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_internal_testers) = 1, '3.8 the allowlist is kept, not deleted');
SET LOCAL ROLE anon;
SELECT pg_temp.ok(public.cd_access_state() = 'public', '3.9 the anonymous entrance reads public');
RESET ROLE;

-- ── GROUP 4: paused -- closed to everyone but administrators ───────────
DO $$ BEGIN RAISE NOTICE 'GROUP 4 — paused'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0a0000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(public.cd_set_access_state('paused') = 'paused', '4.1 an admin pauses the analysis');
SELECT pg_temp.ok(NOT public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000003'), '4.2 a plain candidate may not start');
SELECT pg_temp.ok(NOT public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000002'), '4.3 even an allowlisted tester may not start');
SELECT pg_temp.ok(public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000001'), '4.4 a platform admin still may (to verify before reopening)');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.ok(public.cd_access_state() = 'paused', '4.5 the anonymous entrance reads paused');
RESET ROLE;

-- ── GROUP 5: refusals and the way back ──────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 5 — refusals'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0a0000-0000-4000-8000-000000000001';
SELECT pg_temp.must_fail('SELECT public.cd_set_access_state(''open'')', 'CD_ACCESS_UNKNOWN_STATE', '5.1 an unknown state is refused');
SELECT pg_temp.must_fail('SELECT public.cd_set_access_state(NULL)', 'CD_ACCESS_UNKNOWN_STATE', '5.2 NULL is refused');
SELECT pg_temp.ok(public.cd_set_access_state('internal_test', 'back to the test group') = 'internal_test', '5.3 the state can return to internal_test');
SELECT pg_temp.ok(NOT public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000003') AND public.cd_v31_may_start('cd0a0000-0000-4000-8000-000000000002'), '5.4 and the allowlist decides again');
RESET ROLE;

-- ── GROUP 6: the policy touches nothing governed ────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 6 — governance untouched'; END $$;
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cd_access_policy'::regclass AND NOT tgisinternal),
  '6.1 the policy table carries no trigger that could reach a definition version');
SELECT pg_temp.ok(
  (SELECT pg_get_functiondef('public.cd_set_access_state(text, text)'::regprocedure)) NOT ILIKE '%cd_definition_versions%',
  '6.2 changing the state never writes a definition version (lifecycle, review gates, scoring stay as they are)');
SELECT pg_temp.ok(
  (SELECT pg_get_functiondef('public.cd_set_access_state(text, text)'::regprocedure)) NOT ILIKE '%cd_internal_testers%',
  '6.3 changing the state never edits the tester allowlist');

ROLLBACK;
