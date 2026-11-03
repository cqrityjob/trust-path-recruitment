-- Security Passport: the /passport/start completion -- executed (BUG-04).
--
-- Proves 20270323090000 does what it says:
--
--   GROUP 1  refusals: no declaration, no current merit (a draft does not
--            count) and anon all complete nothing and number nobody
--   GROUP 2  completing with a current claim, or with an employment only,
--            marks the profile completed and declared and assigns exactly one
--            Passport number, through the existing trigger
--   GROUP 3  completing again changes nothing: same number, same declaration
--            date, one completion event
--   GROUP 4  the boundary: a holder completes only their own Passport, and the
--            real rollback removes the function and keeps every number
--
-- All inside one transaction that is rolled back.

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

-- The temp helpers are called while impersonating client roles.
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

-- ── Fixtures ──────────────────────────────────────────────────────────────
--   1 a current claim          2 nothing at all
--   3 a draft claim only       4 an employment only

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('5d000000-0000-4000-8000-000000000001', 'setup-claim@test.invalid',      now(), '{}'),
  ('5d000000-0000-4000-8000-000000000002', 'setup-empty@test.invalid',      now(), '{}'),
  ('5d000000-0000-4000-8000-000000000003', 'setup-draft@test.invalid',      now(), '{}'),
  ('5d000000-0000-4000-8000-000000000004', 'setup-employment@test.invalid', now(), '{}');

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, onboarding_state) VALUES
  ('5d000000-0000-4000-8000-000000000001', 'Setup Claim',      'not_started'),
  ('5d000000-0000-4000-8000-000000000002', 'Setup Empty',      'not_started'),
  ('5d000000-0000-4000-8000-000000000003', 'Setup Draft',      'in_progress'),
  ('5d000000-0000-4000-8000-000000000004', 'Setup Employment', 'not_started');

INSERT INTO public.sp_claims (holder_user_id, claim_type, title, claimed_issuer_name, issued_on, lifecycle_state)
VALUES
  ('5d000000-0000-4000-8000-000000000001', 'training', 'Väktargrundutbildning', 'Test issuer', '2025-01-01', 'active'),
  ('5d000000-0000-4000-8000-000000000003', 'training', 'Unfinished course',     'Test issuer', '2025-01-01', 'draft');

INSERT INTO public.sp_experience_periods (holder_user_id, employer_name, role_title, started_on)
VALUES ('5d000000-0000-4000-8000-000000000004', 'Test Security AB', 'Väktare', '2024-01-01');

-- ── GROUP 1 · refusals ────────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 1 refusals'; END $$;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT public.sp_passport_complete_setup(true)',
  'permission denied', 'anon cannot complete a Passport');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000001';
SELECT pg_temp.must_fail('SELECT public.sp_passport_complete_setup(false)',
  'SP_DECLARATION_REQUIRED', 'completion refuses a false declaration');
SELECT pg_temp.must_fail('SELECT public.sp_passport_complete_setup(NULL)',
  'SP_DECLARATION_REQUIRED', 'completion refuses a missing declaration');

SET LOCAL request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000002';
SELECT pg_temp.must_fail('SELECT public.sp_passport_complete_setup(true)',
  'SP_NO_CURRENT_MERIT', 'an empty Passport cannot be completed');

SET LOCAL request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000003';
SELECT pg_temp.must_fail('SELECT public.sp_passport_complete_setup(true)',
  'SP_NO_CURRENT_MERIT', 'a draft credential does not complete a Passport');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT onboarding_state <> 'completed' AND declared_accurate_at IS NULL
     FROM public.sp_passport_profiles WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'),
  'a refused completion leaves the profile untouched');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers
               WHERE holder_user_id IN ('5d000000-0000-4000-8000-000000000001',
                                        '5d000000-0000-4000-8000-000000000002',
                                        '5d000000-0000-4000-8000-000000000003')),
  'a refused completion numbers nobody');

-- ── GROUP 2 · completion numbers the holder once ──────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 2 completion'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000001';
SELECT public.sp_passport_complete_setup(true);
SET LOCAL request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000004';
SELECT public.sp_passport_complete_setup(true);
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT onboarding_state = 'completed' AND declared_accurate_at IS NOT NULL
     FROM public.sp_passport_profiles WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'),
  'the profile is completed and declared');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_passport_numbers
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'),
  'the holder has exactly one Passport number');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_passport_numbers
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000004'),
  'an employment alone completes and numbers the holder');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_passport_events
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'
      AND event_type = 'declaration_recorded'
      AND detail->>'source' = 'setup'),
  'the declaration is recorded as an event');

CREATE TEMP TABLE first_state AS
  SELECT n.passport_number, p.declared_accurate_at
    FROM public.sp_passport_numbers n
    JOIN public.sp_passport_profiles p USING (holder_user_id)
   WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001';

-- ── GROUP 3 · a second completion changes nothing ─────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 3 idempotent'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000001';
SELECT public.sp_passport_complete_setup(true);
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT n.passport_number = f.passport_number
          AND p.declared_accurate_at = f.declared_accurate_at
     FROM first_state f, public.sp_passport_numbers n, public.sp_passport_profiles p
    WHERE n.holder_user_id = '5d000000-0000-4000-8000-000000000001'
      AND p.holder_user_id = n.holder_user_id),
  'a second completion keeps the same number and declaration date');
SELECT pg_temp.ok(
  (SELECT count(*) = 1 FROM public.sp_passport_events
    WHERE holder_user_id = '5d000000-0000-4000-8000-000000000001'
      AND event_type = 'onboarding_completed'),
  'completion is logged once');

-- ── GROUP 4 · boundary and rollback ───────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP 4 boundary'; END $$;

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.sp_passport_numbers
               WHERE holder_user_id = '5d000000-0000-4000-8000-000000000002'),
  'completing one holder numbers no other holder');
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.sp_passport_complete_setup(boolean)', 'EXECUTE'),
  'anon holds no EXECUTE on the completion');

\i supabase/rollback/20270323090000_sp_passport_complete_setup_rollback.sql
SELECT pg_temp.ok(
  to_regprocedure('public.sp_passport_complete_setup(boolean)') IS NULL,
  'the rollback removes the completion');
SELECT pg_temp.ok(
  (SELECT count(*) = 2 FROM public.sp_passport_numbers
    WHERE holder_user_id IN ('5d000000-0000-4000-8000-000000000001',
                             '5d000000-0000-4000-8000-000000000004')),
  'the rollback keeps every assigned number');

\i supabase/migrations/20270323090000_sp_passport_complete_setup.sql
SELECT pg_temp.ok(
  to_regprocedure('public.sp_passport_complete_setup(boolean)') IS NOT NULL
  AND has_function_privilege('authenticated', 'public.sp_passport_complete_setup(boolean)', 'EXECUTE'),
  'the migration re-applies cleanly after a rollback');

ROLLBACK;
\echo '    ok  Security Passport setup completion assertions passed'
