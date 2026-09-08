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
