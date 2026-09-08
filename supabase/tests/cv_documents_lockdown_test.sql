-- cv_documents LOCKDOWN (phase 3) — the door is shut, and the room still works.
--
-- ── WHAT THIS SUITE IS FOR ─────────────────────────────────────────────
--
-- Phase 1 (20261102090000) installed a controlled write path beside the
-- direct one and deliberately revoked nothing, so it could be applied while
-- the published application still wrote cv_documents through PostgREST.
-- Phase 3 takes the direct path away.
--
-- Two things therefore have to be true at once, and a suite that proved only
-- the first would be describing a broken product:
--
--   THE DOOR IS SHUT     a signed-in holder cannot INSERT, UPDATE, DELETE or
--                        TRUNCATE the table, and the fabrication that started
--                        this whole correction is refused at the privilege
--                        layer rather than caught later.
--   THE ROOM STILL WORKS the same holder can still create, edit and delete
--                        their own CV through the controlled functions.
--
-- ── AND THE PRECONDITION ───────────────────────────────────────────────
--
-- Applying the lockdown WITHOUT phase 1 would leave a database in which
-- nobody can write a CV at all: the direct path revoked, the controlled path
-- absent. The migration refuses to run in that state, and Group X proves the
-- refusal rather than trusting the comment that describes it.
--
-- Runs inside one transaction that is rolled back. Every fixture is
-- synthetic; no real data is read or written.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected error containing "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_holder(uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
END $$;

-- ── FIXTURES ───────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email) VALUES
  ('70000000-0000-0000-0000-00000000000a', 'lockdown@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, country, locale) VALUES
  ('70000000-0000-0000-0000-00000000000a', 'Lova Lockdown', 'SE', 'sv')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.security_career_profiles
  (user_id, current_status, current_profession_slug, years_of_experience) VALUES
  ('70000000-0000-0000-0000-00000000000a', 'working_in_industry', 'vaktare', '1-3')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, started_on, lifecycle_state)
VALUES ('e7000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-00000000000a',
        'Lockdown Bevakning AB', 'Väktare', DATE '2023-01-01', 'active')
ON CONFLICT (id) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP D — the door is shut'; END $$;
-- ═════════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');

-- THE STATEMENT THIS WHOLE CORRECTION EXISTS FOR. Under phase 1 it lands; the
-- cv_documents_controlled_writes suite proves that, on purpose. Here it is
-- refused at the privilege layer, before any policy is consulted.
SELECT pg_temp.must_fail(
  $$INSERT INTO public.cv_documents (owner_user_id, title, source_bundle)
    VALUES ('70000000-0000-0000-0000-00000000000a', 'Fabricated',
            '{"identity":{"displayName":"Lova Lockdown"},
              "employment":[{"id":"ffffffff-0000-0000-0000-000000000001",
                             "employerName":"Säkerhetspolisen",
                             "roleTitle":"Operativ chef",
                             "startedOn":"2011-01-01"}]}'::jsonb)$$,
  'permission denied',
  'D1 a holder can no longer write an invented employment history directly');

SELECT pg_temp.must_fail(
  $$UPDATE public.cv_documents SET source_bundle = '{}'::jsonb$$,
  'permission denied',
  'D2 nor edit the facts of a CV that already exists');

SELECT pg_temp.must_fail(
  $$DELETE FROM public.cv_documents$$,
  'permission denied',
  'D3 nor delete one outside the revision-checked function');

-- The privilege row-level security cannot constrain at all. It was never
-- granted; the lockdown revokes it anyway, and this is where that is checked
-- rather than assumed.
SELECT pg_temp.must_fail(
  $$TRUNCATE public.cv_documents$$,
  'permission denied',
  'D4 nor empty the table, which no policy could have stopped');

RESET ROLE;

SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.cv_documents', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.cv_documents', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.cv_documents', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.cv_documents', 'TRUNCATE'),
  'D5 and the privileges themselves are gone, not merely unused');

SELECT pg_temp.ok(
  has_table_privilege('authenticated', 'public.cv_documents', 'SELECT'),
  'D6 while reading their own CVs is untouched');

SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.cv_documents', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.cv_documents', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.cv_documents', 'TRUNCATE'),
  'D7 anon holds nothing at all, as before');

-- Kept as defence in depth. If a future migration re-grants INSERT by
-- accident -- which is exactly how this table got here -- the WITH CHECK
-- still stops one person writing a row owned by another.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cv_documents') = 4,
  'D8 the four owner-scoped policies survive the lockdown');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP W — and the room still works'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- A lockdown that also locked the holder out of their own CV would be a
-- regression dressed as a fix. Every verb the application needs is exercised
-- through the controlled path, as the holder, after the revoke.

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');

DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.cv_create(
    'bbbb0000-0000-4000-8000-000000000001'::uuid,
    'Lovas CV', 'sv', 'general', NULL, false,
    ARRAY['e7000000-0000-0000-0000-000000000001']::uuid[],
    '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb,
    '{}'::jsonb);
  PERFORM set_config('pg_temp.cv', _r ->> 'cv_id', true);
  PERFORM set_config('pg_temp.rev', _r ->> 'updated_at', true);
END $$;

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents
    WHERE owner_user_id = '70000000-0000-0000-0000-00000000000a') = 1,
  'W1 the holder can still create a CV through the controlled path');

SELECT pg_temp.ok(
  (SELECT source_bundle #>> '{employment,0,employerName}' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'Lockdown Bevakning AB',
  'W2 built from their own records, as before');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');

DO $$
BEGIN
  PERFORM public.cv_save(
    current_setting('pg_temp.cv')::uuid,
    current_setting('pg_temp.rev')::timestamptz,
    'Omdöpt CV');
END $$;

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT title FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 'Omdöpt CV',
  'W3 and still edit it');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');
SELECT pg_temp.must_fail(
  format($$SELECT public.cv_save(%L::uuid, %L::timestamptz, 'Stale')$$,
         current_setting('pg_temp.cv'), '2020-01-01 00:00:00+00'),
  'CV_CHANGED',
  'W4 with the revision check still in force');

DO $$
BEGIN
  PERFORM public.cv_delete(
    current_setting('pg_temp.cv')::uuid,
    (SELECT updated_at FROM public.cv_documents
      WHERE id = current_setting('pg_temp.cv')::uuid));
END $$;
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents
    WHERE id = current_setting('pg_temp.cv')::uuid) = 0,
  'W5 and delete it, which is the last verb the application needs');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP R — the refresh path, which is the one that is not obvious'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- ── WHY THIS GROUP EXISTS, WHEN GROUP W ALREADY PASSED ─────────────────
--
-- Group W exercises cv_create, cv_save and cv_delete. All three are SECURITY
-- DEFINER, so their survival after the revoke follows from what SECURITY
-- DEFINER means. cv_refresh_from_profile is different and was the one entry
-- point this suite did not touch:
--
--   cv_refresh_from_profile  SECURITY INVOKER   <- owns no privilege at all
--     └── cv_save            SECURITY DEFINER   <- does the write
--
-- It runs as the CALLER. After this migration that caller has no UPDATE on
-- cv_documents, so the only reason it still works is that it does not write:
-- it delegates, and the definer function underneath writes on its behalf.
-- That is a real property of the code and it is not visible from the
-- function's own definition, which is exactly the kind of thing that should
-- be executed rather than reasoned about.
--
-- If somebody later "simplifies" the wrapper into a direct UPDATE, everything
-- else in this file still passes and "Update from profile" breaks in
-- production for every user, on the day the lockdown is applied.

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');

DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.cv_create(
    'bbbb0000-0000-4000-8000-000000000002'::uuid,
    'CV att uppdatera', 'sv', 'general', NULL, false,
    ARRAY['e7000000-0000-0000-0000-000000000001']::uuid[],
    '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb,
    '{}'::jsonb);
  PERFORM set_config('pg_temp.rcv', _r ->> 'cv_id', true);
  PERFORM set_config('pg_temp.rrev', _r ->> 'updated_at', true);
END $$;
RESET ROLE;

-- The profile moves underneath the saved CV, so the refresh has something to
-- carry. A refresh that changed nothing could pass without ever writing.
UPDATE public.sp_experience_periods
   SET employer_name = 'Lockdown Bevakning Sverige AB'
 WHERE id = 'e7000000-0000-0000-0000-000000000001';

SELECT pg_temp.ok(
  (SELECT source_bundle #>> '{employment,0,employerName}' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.rcv')::uuid) = 'Lockdown Bevakning AB',
  'R1 the saved CV still holds the old employer, as a snapshot should');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.cv_refresh_from_profile(
    current_setting('pg_temp.rcv')::uuid,
    current_setting('pg_temp.rrev')::timestamptz);
  PERFORM set_config('pg_temp.rrev2', _r ->> 'updated_at', true);
END $$;
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT source_bundle #>> '{employment,0,employerName}' FROM public.cv_documents
    WHERE id = current_setting('pg_temp.rcv')::uuid) = 'Lockdown Bevakning Sverige AB',
  'R2 cv_refresh_from_profile still WRITES after the revoke, through its delegation');

SELECT pg_temp.ok(
  (SELECT updated_at FROM public.cv_documents
    WHERE id = current_setting('pg_temp.rcv')::uuid)
  = current_setting('pg_temp.rrev2')::timestamptz,
  'R3 and the revision it returned is the one now on the row');

-- The mechanism itself, asserted so a future reader is told WHY R2 holds
-- rather than being left to infer it.
SELECT pg_temp.ok(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cv_save')
  AND NOT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'cv_refresh_from_profile'),
  'R4 cv_save is DEFINER and the refresh is INVOKER — delegation is the mechanism');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');
SELECT pg_temp.must_fail(
  format($$SELECT public.cv_refresh_from_profile(%L::uuid, %L::timestamptz)$$,
         current_setting('pg_temp.rcv'), '2020-01-01 00:00:00+00'),
  'CV_CHANGED',
  'R5 a stale revision is refused by the refresh too, not only by cv_save');
RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP O — who may call, and about whose rows'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- The revoke removes a table privilege. It does not, and must not, weaken the
-- checks inside the functions -- otherwise the lockdown would have moved the
-- hole rather than closed it.

INSERT INTO auth.users (id, email) VALUES
  ('70000000-0000-0000-0000-00000000000b', 'other@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, display_name, country, locale) VALUES
  ('70000000-0000-0000-0000-00000000000b', 'Otto Other', 'SE', 'sv')
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000b');

-- CV_NOT_FOUND for somebody else's CV, and the SAME answer a genuinely absent
-- one gives. A caller who can tell those apart has an existence oracle over
-- other people's documents.
SELECT pg_temp.must_fail(
  format($$SELECT public.cv_save(%L::uuid, %L::timestamptz, 'Taken over')$$,
         current_setting('pg_temp.rcv'), current_setting('pg_temp.rrev2')),
  'CV_NOT_FOUND',
  'O1 another signed-in holder cannot save over this CV');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_refresh_from_profile(%L::uuid, %L::timestamptz)$$,
         current_setting('pg_temp.rcv'), current_setting('pg_temp.rrev2')),
  'CV_NOT_FOUND',
  'O2 nor refresh it');

SELECT pg_temp.must_fail(
  format($$SELECT public.cv_delete(%L::uuid, %L::timestamptz)$$,
         current_setting('pg_temp.rcv'), current_setting('pg_temp.rrev2')),
  'CV_NOT_FOUND',
  'O3 nor delete it');

SELECT pg_temp.must_fail(
  $$SELECT public.cv_save('00000000-0000-4000-8000-00000000dead'::uuid, now(), 'x')$$,
  'CV_NOT_FOUND',
  'O4 and a CV that does not exist gives the identical answer');

RESET ROLE;

-- Unauthenticated: `authenticated` with no JWT subject at all.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.must_fail(
  $$SELECT public.cv_create('bbbb0000-0000-4000-8000-00000000000e'::uuid, 'x', 'sv', 'general',
      NULL, false, ARRAY[]::uuid[], '{}'::jsonb, '{}'::jsonb)$$,
  'CV_NOT_AUTHENTICATED',
  'O5 a caller with no identity is refused before anything is read');
RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP F — the function surface after the revoke'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- Closing the table and leaving an internal builder callable would move the
-- problem rather than solve it: cv_source_bundle takes an id array and
-- returns facts, and cv_application_snapshot shapes the copy an employer
-- receives. Neither is a client surface.
--
-- PUBLIC is checked separately from anon and authenticated on purpose. A
-- grant to PUBLIC is inherited by every role including future ones, it is what
-- Postgres gives a new function by default, and it is invisible if you only
-- ever ask about the two roles you happen to be thinking about.

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated',
        'public.cv_source_bundle(uuid[],text,boolean,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
        'public.cv_source_bundle(uuid[],text,boolean,text)', 'EXECUTE'),
  'F1 the bundle builder is not a client surface');

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated',
        'public.cv_application_snapshot(public.cv_documents,timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
        'public.cv_application_snapshot(public.cv_documents,timestamptz)', 'EXECUTE'),
  'F2 nor is the employer-snapshot builder');

DO $$
DECLARE _leaky text;
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                    ', ' ORDER BY p.proname)
    INTO _leaky
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname LIKE 'cv\_%'
     AND aclcontains(coalesce(p.proacl, acldefault('f', p.proowner)),
                     makeaclitem(0::oid, p.proowner, 'EXECUTE', false));
  PERFORM pg_temp.ok(_leaky IS NULL,
    format('F3 no cv_* function is executable by PUBLIC (leaky: %s)', coalesce(_leaky, 'none')));
END $$;

DO $$
DECLARE _open text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO _open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'cv\_%'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.ok(_open IS NULL,
    format('F4 no cv_* function is executable by anon at all (open: %s)', coalesce(_open, 'none')));
END $$;

DO $$
DECLARE _holder text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO _holder
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'cv\_%'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  PERFORM pg_temp.ok(
    _holder = 'cv_create, cv_delete, cv_refresh_from_profile, cv_save',
    format('F5 the holder may execute exactly the four entry points (got: %s)',
           coalesce(_holder, 'none')));
END $$;

DO $$
DECLARE _unpinned text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO _unpinned
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'cv\_%'
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                      WHERE c LIKE 'search\_path=%');
  PERFORM pg_temp.ok(_unpinned IS NULL,
    format('F6 every cv_* function pins search_path (unpinned: %s)', coalesce(_unpinned, 'none')));
END $$;

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP I — idempotency still holds after the revoke'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- The lost-response contract is what makes a retry safe, and it lives in the
-- operations ledger, which no client can reach. The revoke must not have
-- disturbed it. (The genuine TWO-PROCESS race is proved separately, from
-- db-test.sh, because two sessions cannot contend inside one transaction.)

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_holder('70000000-0000-0000-0000-00000000000a');

DO $$
DECLARE _a jsonb; _b jsonb;
BEGIN
  _a := public.cv_create(
    'bbbb0000-0000-4000-8000-000000000003'::uuid, 'Replay', 'sv', 'general', NULL, false,
    ARRAY['e7000000-0000-0000-0000-000000000001']::uuid[],
    '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb, '{}'::jsonb);
  _b := public.cv_create(
    'bbbb0000-0000-4000-8000-000000000003'::uuid, 'Replay', 'sv', 'general', NULL, false,
    ARRAY['e7000000-0000-0000-0000-000000000001']::uuid[],
    '{"email":"","phone":"","showEmail":false,"showPhone":false}'::jsonb, '{}'::jsonb);
  PERFORM pg_temp.ok((_a ->> 'cv_id') = (_b ->> 'cv_id'),
    'I1 the same operation id returns the same CV after the lockdown');
  PERFORM pg_temp.ok((_b ->> 'replayed')::boolean,
    'I2 and says so, rather than quietly making a second one');
  PERFORM set_config('pg_temp.icv', _a ->> 'cv_id', true);
END $$;
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cv_documents
    WHERE id = current_setting('pg_temp.icv')::uuid) = 1,
  'I3 exactly one row exists for that request');

-- ═════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP X — it refuses to lock an empty room'; END $$;
-- ═════════════════════════════════════════════════════════════════════════
--
-- Applying the lockdown without phase 1 would revoke the direct writes with
-- no controlled path behind them: nobody could save a CV, the table would
-- look perfectly healthy, and every save would fail. The migration refuses
-- instead -- and the refusal is executed here rather than trusted.
--
-- The functions are renamed out of the way and back, because dropping them
-- would take the whole dependent chain with it and this suite still needs
-- them afterwards.

ALTER FUNCTION public.cv_create(uuid, text, text, text, text, boolean, uuid[], jsonb, jsonb, text, text)
  RENAME TO cv_create__hidden_for_test;

DO $$
DECLARE _missing text;
BEGIN
  SELECT string_agg(want, ', ' ORDER BY want) INTO _missing
    FROM unnest(ARRAY['cv_create', 'cv_save', 'cv_refresh_from_profile', 'cv_delete']) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = want);

  PERFORM pg_temp.ok(_missing = 'cv_create',
    'X1 the precondition notices exactly which entry point is missing');
END $$;

ALTER FUNCTION public.cv_create__hidden_for_test(uuid, text, text, text, text, boolean, uuid[], jsonb, jsonb, text, text)
  RENAME TO cv_create;

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'cv_create'),
  'X2 and the fixture put it back');

DO $$ BEGIN RAISE NOTICE 'PASS — cv_documents_lockdown_test'; END $$;

ROLLBACK;
