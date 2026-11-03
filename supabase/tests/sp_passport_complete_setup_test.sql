-- Security Passport: the /passport/start completion -- executed (BUG-04).
--
-- Proves 20270323090000 does what it says:
--
--   GROUP CS1  refusals: anon, no declaration, no current Passport merit (a
--              draft or a CV record does not count) and a signed-out holder
--              all complete nothing and number nobody
--   GROUP CS2  completing with a current credential, with an employment only,
--              or before any profile row existed, marks the profile completed
--              and declared and assigns exactly one Passport number, through
--              the existing trigger
--   GROUP CS3  completing again changes nothing -- same number, same
--              declaration date, no second event -- even once the merit that
--              completed it has been withdrawn
--   GROUP CS4  the table: a client cannot write itself into or out of
--              `completed`, and its ordinary writes still work
--   GROUP CS5  privileges, and the real rollback: it removes the function and
--              the guard and keeps every number; the migration re-applies
--
-- Every simulated JWT names a live auth.sessions row, so the Passport session
-- guard is satisfied rather than bypassed. All inside one transaction that is
-- rolled back. The suite shares one now(): CS3 moves the first declaration
-- back before completing again, so a re-stamp would show.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
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

-- One statement as the holder, through the authenticated role, with a JWT that
-- names their live session (or, with _live = false, a session that does not
-- exist). Returns 'ok:<row count>' or 'err:<message>'.
CREATE OR REPLACE FUNCTION pg_temp.as_holder(_uid uuid, _sql text, _live boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _n bigint; _r text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated',
                      'session_id', CASE WHEN _live THEN _uid ELSE gen_random_uuid() END)::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _r := 'ok:' || _n;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

-- The anon case is called while impersonating anon.
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

-- ── Fixtures ──────────────────────────────────────────────────────────────
--   1 a current catalogue credential     2 nothing at all
--   3 a draft credential only            4 an employment only
--   5 a CV record only (not a Passport credential)
--   6 a current credential and no profile row yet
--   7 no profile, no merit               8 a current credential, signed out

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('5d000000-0000-4000-8000-000000000001', 'setup-credential@test.invalid', now(), '{}'),
  ('5d000000-0000-4000-8000-000000000002', 'setup-empty@test.invalid',      now(), '{}'),
  ('5d000000-0000-4000-8000-000000000003', 'setup-draft@test.invalid',      now(), '{}'),
  ('5d000000-0000-4000-8000-000000000004', 'setup-employment@test.invalid', now(), '{}'),
  ('5d000000-0000-4000-8000-000000000005', 'setup-cv-record@test.invalid',  now(), '{}'),
  ('5d000000-0000-4000-8000-000000000006', 'setup-no-profile@test.invalid', now(), '{}'),
  ('5d000000-0000-4000-8000-000000000007', 'setup-self-made@test.invalid',  now(), '{}'),
  ('5d000000-0000-4000-8000-000000000008', 'setup-signed-out@test.invalid', now(), '{}');

-- A live session per actor, reusing the user id as the session id inside this
-- rolled-back fixture. Holder 8 has none.
INSERT INTO auth.sessions (id, user_id)
SELECT id, id FROM auth.users
 WHERE id IN ('5d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000002',
              '5d000000-0000-4000-8000-000000000003', '5d000000-0000-4000-8000-000000000004',
              '5d000000-0000-4000-8000-000000000005', '5d000000-0000-4000-8000-000000000006',
              '5d000000-0000-4000-8000-000000000007');

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, onboarding_state) VALUES
  ('5d000000-0000-4000-8000-000000000001', 'Setup Credential', 'not_started'),
  ('5d000000-0000-4000-8000-000000000002', 'Setup Empty',      'not_started'),
  ('5d000000-0000-4000-8000-000000000003', 'Setup Draft',      'in_progress'),
  ('5d000000-0000-4000-8000-000000000004', 'Setup Employment', 'not_started'),
  ('5d000000-0000-4000-8000-000000000005', 'Setup CV Record',  'not_started'),
  ('5d000000-0000-4000-8000-000000000008', 'Setup Signed Out', 'not_started');

INSERT INTO public.sp_claims
  (holder_user_id, claim_type, credential_code, title, claimed_issuer_name, jurisdiction_code,
   issued_on, assertion_level, lifecycle_state)
VALUES
  ('5d000000-0000-4000-8000-000000000001', 'training', 'OV_TRAINING',
   'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten', 'SE', current_date - 100, 'self_declared', 'active'),
  ('5d000000-0000-4000-8000-000000000003', 'training', 'OV_TRAINING',
   'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten', 'SE', current_date - 100, 'self_declared', 'draft'),
  ('5d000000-0000-4000-8000-000000000006', 'training', 'OV_TRAINING',
   'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten', 'SE', current_date - 100, 'self_declared', 'active'),
  ('5d000000-0000-4000-8000-000000000008', 'training', 'OV_TRAINING',
   'Ordningsvaktsutbildning (grundutbildning)', 'Polismyndigheten', 'SE', current_date - 100, 'self_declared', 'active');

-- A free-text course on the shared claim spine: a CV record, not a Passport
-- credential (sp_is_passport_credential('training', NULL) is false).
INSERT INTO public.sp_claims (holder_user_id, claim_type, title, claimed_issuer_name, issued_on, lifecycle_state)
VALUES ('5d000000-0000-4000-8000-000000000005', 'training', 'Konflikthantering', 'Test issuer', '2025-01-01', 'active');

INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, started_on)
VALUES ('5d000000-0000-4000-8000-000000000004', 'Test Security AB', 'Väktare', '2024-01-01');

-- ── GROUP CS1 · refusals ──────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CS1 refusals'; END $$;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT public.sp_passport_complete_setup(true)',
  'permission denied', 'CS1.1 anon cannot complete a Passport');
RESET ROLE;

SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000001', 'SELECT public.sp_passport_complete_setup(false)')
    = 'err:SP_DECLARATION_REQUIRED',
  'CS1.2 completion refuses a false declaration');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000001', 'SELECT public.sp_passport_complete_setup(NULL)')
    = 'err:SP_DECLARATION_REQUIRED',
  'CS1.3 completion refuses a missing declaration');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000002', 'SELECT public.sp_passport_complete_setup(true)')
    = 'err:SP_NO_CURRENT_MERIT',
  'CS1.4 an empty Passport cannot be completed');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000003', 'SELECT public.sp_passport_complete_setup(true)')
    = 'err:SP_NO_CURRENT_MERIT',
  'CS1.5 a draft credential does not complete a Passport');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000005', 'SELECT public.sp_passport_complete_setup(true)')
    = 'err:SP_NO_CURRENT_MERIT',
  'CS1.6 a CV record that is not a Passport credential does not complete a Passport');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000008', 'SELECT public.sp_passport_complete_setup(true)', false)
    = 'err:SP_SESSION_REVOKED',
  'CS1.7 a signed-out holder cannot complete a Passport');

SELECT pg_temp.ok(
  (SELECT count(*) = 5 AND bool_and(declared_accurate_at IS NULL)
          AND bool_and(onboarding_state = CASE WHEN holder_user_id = '5d000000-0000-4000-8000-000000000003'
                                               THEN 'in_progress' ELSE 'not_started' END)
     FROM public.sp_passport_profiles
    WHERE holder_user_id IN ('5d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000002',
                             '5d000000-0000-4000-8000-000000000003', '5d000000-0000-4000-8000-000000000005',
                             '5d000000-0000-4000-8000-000000000008'))
  AND NOT EXISTS (SELECT 1 FROM public.sp_passport_events
                   WHERE event_type IN ('declaration_recorded', 'onboarding_completed')
                     AND holder_user_id::text LIKE '5d000000-%'),
  'CS1.8 a refused completion leaves every profile and the log untouched');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers WHERE holder_user_id::text LIKE '5d000000-%'),
  'CS1.9 a refused completion numbers nobody');

-- ── GROUP CS2 · completion numbers the holder once ────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CS2 completion'; END $$;

-- The call and its check are two statements: a check in the same statement
-- reads that statement's snapshot, taken before the call wrote anything.
SELECT pg_temp.as_holder('5d000000-0000-4000-8000-000000000001', 'SELECT public.sp_passport_complete_setup(true)') AS cs21 \gset
SELECT pg_temp.ok(
  :'cs21' = 'ok:1'
  AND (SELECT onboarding_state = 'completed' AND declared_accurate_at IS NOT NULL
         FROM public.sp_passport_profiles WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'),
  'CS2.1 a current credential completes and declares the profile');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_passport_numbers
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'),
  'CS2.2 the holder has exactly one Passport number');
SELECT pg_temp.as_holder('5d000000-0000-4000-8000-000000000004', 'SELECT public.sp_passport_complete_setup(true)') AS cs23 \gset
SELECT pg_temp.ok(
  :'cs23' = 'ok:1'
  AND (SELECT count(*) = 1 FROM public.sp_passport_numbers
        WHERE holder_user_id = '5d000000-0000-4000-8000-000000000004'),
  'CS2.3 an employment alone completes and numbers the holder');
SELECT pg_temp.as_holder('5d000000-0000-4000-8000-000000000006', 'SELECT public.sp_passport_complete_setup(true)') AS cs24 \gset
SELECT pg_temp.ok(
  :'cs24' = 'ok:1'
  AND (SELECT onboarding_state = 'completed' FROM public.sp_passport_profiles
        WHERE holder_user_id = '5d000000-0000-4000-8000-000000000006')
  AND EXISTS (SELECT 1 FROM public.sp_passport_numbers
               WHERE holder_user_id = '5d000000-0000-4000-8000-000000000006'),
  'CS2.4 a credential saved before any profile existed gets a profile and completes');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 AND bool_and(detail->>'source' = 'setup')
          AND bool_and(detail->>'question_version' = 'sp-q-v1')
          AND bool_and(detail ? 'declared_at')
     FROM public.sp_passport_events
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'
      AND event_type = 'declaration_recorded'),
  'CS2.5 the declaration is recorded once, with its question version');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_passport_events
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'
      AND event_type = 'onboarding_completed'),
  'CS2.6 the completion is logged once');

-- ── GROUP CS3 · a second completion changes nothing ───────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CS3 idempotent'; END $$;

-- The suite shares one now(), so a second completion that re-stamped the
-- declaration would write the same value. Move the first one back an hour.
UPDATE public.sp_passport_profiles SET declared_accurate_at = declared_accurate_at - interval '1 hour'
 WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001';

CREATE TEMP TABLE first_state AS
  SELECT n.passport_number, p.declared_accurate_at
    FROM public.sp_passport_numbers n
    JOIN public.sp_passport_profiles p USING (holder_user_id)
   WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001';

SELECT pg_temp.as_holder('5d000000-0000-4000-8000-000000000001', 'SELECT public.sp_passport_complete_setup(true)') AS cs31 \gset
SELECT pg_temp.ok(
  :'cs31' = 'ok:1'
  AND (SELECT n.passport_number = f.passport_number
              AND p.declared_accurate_at = f.declared_accurate_at
         FROM first_state f, public.sp_passport_numbers n, public.sp_passport_profiles p
        WHERE n.holder_user_id = '5d000000-0000-4000-8000-000000000001'
          AND p.holder_user_id = n.holder_user_id),
  'CS3.1 a second completion keeps the same number and declaration date');
SELECT pg_temp.ok(
  (SELECT count(*) = 2 FROM public.sp_passport_events
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'
      AND event_type IN ('declaration_recorded', 'onboarding_completed')),
  'CS3.2 a second completion writes no second declaration or completion event');

-- A stale tab: the only credential is withdrawn after the completion.
UPDATE public.sp_claims SET lifecycle_state = 'withdrawn'
 WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001';
SELECT pg_temp.as_holder('5d000000-0000-4000-8000-000000000001', 'SELECT public.sp_passport_complete_setup(true)') AS cs33 \gset
SELECT pg_temp.ok(
  :'cs33' = 'ok:1'
  AND (SELECT p.onboarding_state = 'completed' AND p.declared_accurate_at = f.declared_accurate_at
         FROM first_state f, public.sp_passport_profiles p
        WHERE p.holder_user_id = '5d000000-0000-4000-8000-000000000001')
  AND (SELECT count(*) = 2 FROM public.sp_passport_events
        WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'
          AND event_type IN ('declaration_recorded', 'onboarding_completed')),
  'CS3.3 a completed Passport stays as it is when completed again after its merit was withdrawn');

-- ── GROUP CS4 · the table refuses a client-written completion ─────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CS4 table guard'; END $$;

SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000002',
    $q$UPDATE public.sp_passport_profiles SET onboarding_state = 'completed', declared_accurate_at = now()
        WHERE holder_user_id = '5d000000-0000-4000-8000-000000000002'$q$)
    = 'err:SP_COMPLETION_RPC_ONLY',
  'CS4.1 a holder cannot mark their own profile completed through the Data API');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000007',
    $q$INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, onboarding_state, declared_accurate_at)
       VALUES ('5d000000-0000-4000-8000-000000000007', 'Self Made', 'completed', now())$q$)
    = 'err:SP_COMPLETION_RPC_ONLY',
  'CS4.2 a holder cannot create a profile that is already completed');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000004',
    $q$UPDATE public.sp_passport_profiles SET onboarding_state = 'in_progress'
        WHERE holder_user_id = '5d000000-0000-4000-8000-000000000004'$q$)
    = 'err:SP_COMPLETION_RPC_ONLY',
  'CS4.3 a holder cannot reopen a completed Passport');
SELECT pg_temp.ok(
  pg_temp.as_holder('5d000000-0000-4000-8000-000000000004',
    $q$UPDATE public.sp_passport_profiles SET declared_accurate_at = now()
        WHERE holder_user_id = '5d000000-0000-4000-8000-000000000004'$q$) = 'ok:1'
  AND pg_temp.as_holder('5d000000-0000-4000-8000-000000000003',
    $q$UPDATE public.sp_passport_profiles SET onboarding_state = 'in_progress', onboarding_step = 2
        WHERE holder_user_id = '5d000000-0000-4000-8000-000000000003'
          AND onboarding_state <> 'completed'$q$) = 'ok:1',
  'CS4.4 re-affirming a completed declaration and saving a draft step still work');
SELECT pg_temp.ok(
  (SELECT onboarding_state = 'not_started' AND declared_accurate_at IS NULL
     FROM public.sp_passport_profiles WHERE holder_user_id = '5d000000-0000-4000-8000-000000000002')
  AND NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles
                   WHERE holder_user_id = '5d000000-0000-4000-8000-000000000007')
  AND NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers
                   WHERE holder_user_id IN ('5d000000-0000-4000-8000-000000000002',
                                            '5d000000-0000-4000-8000-000000000007')),
  'CS4.5 a refused client write completes, creates and numbers nothing');

-- ── GROUP CS5 · privileges and rollback ───────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP CS5 privileges and rollback'; END $$;

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_passport_complete_setup(boolean)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.sp_passport_complete_setup(boolean)', 'EXECUTE'),
  'CS5.1 only authenticated may execute the completion');

\i supabase/rollback/20270323090000_sp_passport_complete_setup_rollback.sql
SELECT pg_temp.ok(
  to_regprocedure('public.sp_passport_complete_setup(boolean)') IS NULL
  AND to_regprocedure('public.sp_passport_completion_guard()') IS NULL
  AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_profile_completion_guard'),
  'CS5.2 the rollback removes the completion and the table guard');
SELECT pg_temp.ok(
  (SELECT count(*) = 3 FROM public.sp_passport_numbers
    WHERE holder_user_id IN ('5d000000-0000-4000-8000-000000000001',
                             '5d000000-0000-4000-8000-000000000004',
                             '5d000000-0000-4000-8000-000000000006')),
  'CS5.3 the rollback keeps every assigned number');

\i supabase/migrations/20270323090000_sp_passport_complete_setup.sql
SELECT pg_temp.ok(
  has_function_privilege('authenticated', 'public.sp_passport_complete_setup(boolean)', 'EXECUTE')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_profile_completion_guard'
                AND tgrelid = 'public.sp_passport_profiles'::regclass),
  'CS5.4 the migration re-applies cleanly after a rollback');

ROLLBACK;
