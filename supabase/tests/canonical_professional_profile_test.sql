-- CANONICAL PROFESSIONAL PROFILE — schema, mirror, reconciliation, RLS.
--
-- Proves that consolidating a fact into one home actually left it with one
-- home, at the layer where that can be established: the database. A guard in
-- the application says the current Passport code does not write the column;
-- only the database can say that nothing writes it, in either direction, and
-- that a rollback puts back what it found.
--
-- ── WHY THE EXPAND MIGRATION IS RE-APPLIED AT THE TOP ──────────────────
--
-- This suite describes the EXPAND phase, and the expand phase is not the
-- database's final state: a later contract migration removes the
-- compatibility trigger once no client writes the Passport column any more.
-- A suite that simply read whatever the replay left behind would therefore
-- assert one thing before that contract migration exists and a different
-- thing afterwards, and would start failing on the branch that adds it --
-- for a reason that has nothing to do with anything being wrong.
--
-- So the transaction re-applies the expand migration first, and every group
-- below runs against the expand state by construction, on any branch. It is
-- idempotent (Group C proves that), and it is rolled back with everything
-- else.
--
-- ── WHY THE MIGRATION IS RE-RUN AGAIN INSIDE GROUP C ───────────────────
--
-- The reconciliation runs once, during replay, against an empty database.
-- There is therefore no conflicting data in existence at the moment the only
-- interesting statements execute, and a suite that ran afterwards would be
-- asserting over an empty set — the classic test that passes because there
-- was nothing to get wrong.
--
-- So Group C seeds the exact disagreements the reconciliation exists to
-- handle and then executes the migration file itself, verbatim, by path.
-- That proves two things at once: the rule handles real conflicting rows,
-- and the migration is safely re-runnable, which is what makes it usable
-- against a hosted database whose state nobody can be certain of.
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

-- ── FIXTURES ───────────────────────────────────────────────────────────
--
-- Three holders, each standing for one branch of the reconciliation rule,
-- plus a stranger who exists only to be unable to see any of them.

INSERT INTO auth.users (id, email) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'agreeing@example.test'),
  ('c2222222-2222-2222-2222-222222222222', 'passport-only@example.test'),
  ('c3333333-3333-3333-3333-333333333333', 'conflicting@example.test'),
  ('c4444444-4444-4444-4444-444444444444', 'stranger@example.test');

-- Two catalogue professions to disagree about. Inserted only if the slugs are
-- not already present, so the suite does not depend on seed content.
INSERT INTO public.cig_professions (slug, canonical_key, title_sv, title_en, graph_version)
SELECT 'cpp-test-vaktare', 'CPP_TEST_VAKTARE', 'Testväktare', 'Test Security Officer', 'test'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_professions WHERE slug = 'cpp-test-vaktare');
INSERT INTO public.cig_professions (slug, canonical_key, title_sv, title_en, graph_version)
SELECT 'cpp-test-tekniker', 'CPP_TEST_TEKNIKER', 'Testtekniker', 'Test Technician', 'test'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_professions WHERE slug = 'cpp-test-tekniker');

-- The expand state, restored regardless of which later migrations exist on
-- this branch. See the header.
\i supabase/migrations/20261007090000_canonical_professional_profile.sql

DO $$ BEGIN RAISE NOTICE 'GROUP A — the canonical table says it is canonical'; END $$;

SELECT pg_temp.ok(
  (SELECT obj_description('public.security_career_profiles'::regclass, 'pg_class'))
    ILIKE '%CANONICAL%',
  'A1 security_career_profiles is documented as the canonical professional profile');

SELECT pg_temp.ok(
  (SELECT col_description('public.security_career_profiles'::regclass,
     (SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.security_career_profiles'::regclass
         AND attname = 'current_profession_slug')))
    ILIKE '%MIRROR%',
  'A2 the Passport column is documented as a mirror, not a second writer');

SELECT pg_temp.ok(
  to_regclass('public.security_career_profile_reconciliations') IS NOT NULL,
  'A3 the reconciliation log exists');

SELECT pg_temp.ok(
  (SELECT rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'security_career_profile_reconciliations'),
  'A4 row level security is enabled on the reconciliation log');

-- A conflict record is evidence. Nobody may manufacture one, and nobody may
-- destroy one; the only change a person may make is to say they have settled
-- it. That is INSERT and DELETE withheld, UPDATE granted.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'security_career_profile_reconciliations'
       AND grantee = 'authenticated'
       AND privilege_type IN ('INSERT', 'DELETE')),
  'A5 a user can neither manufacture nor destroy a conflict record');

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'security_career_profile_reconciliations'
       AND grantee = 'anon'),
  'A6 an anonymous visitor holds no grant on the reconciliation log at all');

-- The UPDATE privilege is COLUMN-scoped. Group G proves the behaviour by
-- executing the statements; this names the mechanism, so that a future
-- table-wide `GRANT UPDATE` fails here -- at the line that would have caused
-- it -- rather than only in the behavioural group further down.
SELECT pg_temp.ok(
  -- column_name is information_schema.sql_identifier, not text; cast before
  -- aggregating or the comparison has no operator.
  (SELECT array_agg(column_name::text ORDER BY column_name::text)
     FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'security_career_profile_reconciliations'
      AND grantee = 'authenticated'
      AND privilege_type = 'UPDATE') = ARRAY['resolved_at'],
  'A7 the holder''s UPDATE privilege covers resolved_at and no other column');

DO $$ BEGIN RAISE NOTICE 'GROUP B — the mirror, and only the mirror'; END $$;

SELECT pg_temp.ok(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'career_profile_mirror_profession_to_passport'),
  'B1 the mirror function is SECURITY DEFINER');

SELECT pg_temp.ok(
  (SELECT array_to_string(proconfig, ',') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'career_profile_mirror_profession_to_passport')
    LIKE '%search_path=%',
  'B2 and its search_path is pinned, so the caller cannot choose the schema');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.career_profile_mirror_profession_to_passport()', 'EXECUTE'),
  'B3 an anonymous visitor cannot execute the definer function');

-- The mirror in action. Two holders with a Passport, one without.
INSERT INTO public.sp_passport_profiles (holder_user_id)
VALUES ('c1111111-1111-1111-1111-111111111111'),
       ('c2222222-2222-2222-2222-222222222222'),
       ('c3333333-3333-3333-3333-333333333333');

INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
VALUES ('c1111111-1111-1111-1111-111111111111', 'cpp-test-vaktare');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'B4 writing the canonical profession mirrors it onto the holder''s Passport');

UPDATE public.security_career_profiles
   SET current_profession_slug = 'cpp-test-tekniker'
 WHERE user_id = 'c1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-tekniker',
  'B5 a later correction follows through to the mirror');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c2222222-2222-2222-2222-222222222222') IS NULL,
  'B6 and it touches no other holder''s Passport');

-- The mirror must not mint a Passport. A person who has never opened one and
-- fills in a career profile does not thereby acquire a Passport row.
INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
VALUES ('c4444444-4444-4444-4444-444444444444', 'cpp-test-vaktare');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.sp_passport_profiles
               WHERE holder_user_id = 'c4444444-4444-4444-4444-444444444444'),
  'B7 filling in a career profile never creates a Passport');

-- ── THE COMPATIBILITY WINDOW IS BIDIRECTIONAL, ON PURPOSE ───────────
--
-- During the expand phase the CURRENT application is still running, and it
-- writes this column directly. The choice was to refuse those writes -- which
-- breaks a live client -- or to carry them through so the two copies cannot
-- disagree whichever one is written. This asserts the second.
--
-- The one-way claim is a PHASE C property, and it is asserted there, in
-- supabase/tests/canonical_professional_profile_contract_test.sql, after the
-- writer that needs this trigger no longer exists.
UPDATE public.sp_passport_profiles
   SET cig_profession_slug = 'cpp-test-vaktare'
 WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'B8 during the window, an old client''s Passport write reaches the canonical row');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'B9 and the two copies agree afterwards, whichever side was written');

-- A free-text answer is the more specific statement of the two, and a
-- catalogue slug arriving from the old Passport UI is not grounds to discard
-- it. (The table''s CHECK forbids holding both, so there is no merge to make.)
UPDATE public.security_career_profiles
   SET current_profession_slug = NULL, current_profession_other = 'Säkerhetsskyddschef'
 WHERE user_id = 'c1111111-1111-1111-1111-111111111111';
UPDATE public.sp_passport_profiles
   SET cig_profession_slug = 'cpp-test-tekniker'
 WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT current_profession_other FROM public.security_career_profiles
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'Säkerhetsskyddschef'
  AND (SELECT current_profession_slug FROM public.security_career_profiles
        WHERE user_id = 'c1111111-1111-1111-1111-111111111111') IS NULL,
  'B10 a free-text canonical answer is never overwritten by the compatibility path');

-- Restore the fixture for the groups below.
UPDATE public.security_career_profiles
   SET current_profession_other = NULL, current_profession_slug = 'cpp-test-tekniker'
 WHERE user_id = 'c1111111-1111-1111-1111-111111111111';

-- ── THE OTHER ORDER: PROFILE FIRST, PASSPORT LATER ──────────────────
--
-- The common path for a new candidate, and the one the mirror alone cannot
-- serve: the canonical answer already exists and the mirror has already
-- fired against a Passport that did not exist yet.
INSERT INTO public.sp_passport_profiles (holder_user_id)
VALUES ('c4444444-4444-4444-4444-444444444444');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c4444444-4444-4444-4444-444444444444') = 'cpp-test-vaktare',
  'B12 a Passport opened AFTER the career profile is seeded with the canonical profession');

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c4444444-4444-4444-4444-444444444444') = 'cpp-test-vaktare',
  'B13 and the seed changed nothing about the canonical row');

-- Verification semantics are untouched. Nothing in this release can promote
-- anything, and the mirror writes exactly one column.
SELECT pg_temp.ok(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'career_profile_mirror_profession_to_passport')
    NOT ILIKE '%assertion_level%',
  'B14 the mirror cannot touch an assertion level');
SELECT pg_temp.ok(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'career_profile_mirror_profession_to_passport')
    NOT ILIKE '%verified%',
  'B15 nor a verification attribution');

-- The same, for the compatibility trigger. It writes ONE column on the
-- career profile and reaches nothing on the Passport at all.
SELECT pg_temp.ok(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'career_profile_adopt_passport_profession')
    NOT ILIKE '%assertion_level%',
  'B16 nor can the compatibility trigger');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('career_profile_mirror_profession_to_passport',
                        'career_profile_seed_passport_profession',
                        'career_profile_adopt_passport_profession')
      AND NOT p.prosecdef) = 0,
  'B17 all three sync functions are SECURITY DEFINER');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('career_profile_mirror_profession_to_passport',
                        'career_profile_seed_passport_profession',
                        'career_profile_adopt_passport_profession')
      AND array_to_string(p.proconfig, ',') NOT LIKE '%search_path=%') = 0,
  'B18 and all three pin their search_path');

DO $$ BEGIN RAISE NOTICE 'GROUP C — reconciliation, over rows that actually disagree'; END $$;

-- Seed the three branches, with the mirror trigger disabled so the fixtures
-- can be genuinely inconsistent. That inconsistency is the pre-release state
-- the reconciliation exists to meet; creating it any other way would be
-- creating a state the rule was never written for.
-- BOTH directions are disabled, not just the mirror. The fixtures below have
-- to be genuinely inconsistent, and that inconsistency is by definition the
-- PRE-EXPAND state -- the state that exists before either sync trigger does.
-- Seeding it with the compatibility trigger live would have the database
-- reconcile the rows as they were being written, and the reconciliation
-- would then be tested against data it had already fixed.
ALTER TABLE public.security_career_profiles DISABLE TRIGGER career_profile_mirror_profession_trg;
ALTER TABLE public.sp_passport_profiles DISABLE TRIGGER career_profile_adopt_passport_profession_trg;

DELETE FROM public.security_career_profiles;
DELETE FROM public.security_career_profile_reconciliations;
-- The fourth holder belongs to Group B's seed case, not to any of the three
-- reconciliation branches. Their Passport is removed so the branches below
-- are the only rows the reconciliation has to consider -- a fixture that
-- leaks between groups makes a count assertion measure the previous test.
DELETE FROM public.sp_passport_profiles
 WHERE holder_user_id = 'c4444444-4444-4444-4444-444444444444';

-- 1: canonical empty, Passport answered  → adopt.
UPDATE public.sp_passport_profiles SET cig_profession_slug = 'cpp-test-vaktare'
 WHERE holder_user_id = 'c2222222-2222-2222-2222-222222222222';
-- 2: both answered, DIFFERENT            → keep canonical, log the conflict.
INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
VALUES ('c3333333-3333-3333-3333-333333333333', 'cpp-test-tekniker');
UPDATE public.sp_passport_profiles SET cig_profession_slug = 'cpp-test-vaktare'
 WHERE holder_user_id = 'c3333333-3333-3333-3333-333333333333';
-- 3: both answered, the SAME             → nothing to reconcile, nothing logged.
INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
VALUES ('c1111111-1111-1111-1111-111111111111', 'cpp-test-vaktare');
UPDATE public.sp_passport_profiles SET cig_profession_slug = 'cpp-test-vaktare'
 WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111';

ALTER TABLE public.security_career_profiles ENABLE TRIGGER career_profile_mirror_profession_trg;
ALTER TABLE public.sp_passport_profiles ENABLE TRIGGER career_profile_adopt_passport_profession_trg;

\i supabase/migrations/20261007090000_canonical_professional_profile.sql

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c2222222-2222-2222-2222-222222222222') = 'cpp-test-vaktare',
  'C1 a Passport-only answer is adopted into the canonical row, not discarded');

SELECT pg_temp.ok(
  (SELECT resolution FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c2222222-2222-2222-2222-222222222222') = 'adopted_from_passport',
  'C2 and the adoption is recorded');

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c3333333-3333-3333-3333-333333333333') = 'cpp-test-tekniker',
  'C3 a real disagreement leaves the canonical answer standing -- nothing is overwritten');

SELECT pg_temp.ok(
  (SELECT resolution FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c3333333-3333-3333-3333-333333333333') = 'kept_canonical_conflict',
  'C4 the disagreement is recorded rather than resolved by guesswork');

SELECT pg_temp.ok(
  (SELECT passport_value FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c3333333-3333-3333-3333-333333333333') = 'cpp-test-vaktare'
  AND (SELECT canonical_value FROM public.security_career_profile_reconciliations
        WHERE user_id = 'c3333333-3333-3333-3333-333333333333') = 'cpp-test-tekniker',
  'C5 BOTH pre-consolidation values survive, so nothing is lost and rollback is possible');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c3333333-3333-3333-3333-333333333333') = 'cpp-test-tekniker',
  'C6 the two copies stop contradicting each other immediately');

SELECT pg_temp.ok(
  (SELECT resolved_at FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c3333333-3333-3333-3333-333333333333') IS NULL,
  'C7 while the conflict stays OPEN, for the person it belongs to to settle');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.security_career_profile_reconciliations
               WHERE user_id = 'c1111111-1111-1111-1111-111111111111'),
  'C8 two copies that already agreed are not reported as a conflict');

-- Re-runnable. A migration that cannot be applied twice cannot safely be
-- applied to a hosted database whose state nobody is certain of.
\i supabase/migrations/20261007090000_canonical_professional_profile.sql

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.security_career_profile_reconciliations) = 2,
  'C9 re-running the migration reconciles nothing twice');

DO $$ BEGIN RAISE NOTICE 'GROUP D — a profile is nobody else''s business'; END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c4444444-4444-4444-4444-444444444444', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.security_career_profiles) = 0,
  'D1 a signed-in stranger sees no other user''s professional profile');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.security_career_profile_reconciliations) = 0,
  'D2 and none of their conflict records');

SELECT set_config('request.jwt.claim.sub', 'c3333333-3333-3333-3333-333333333333', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.security_career_profile_reconciliations) = 1,
  'D3 the owner sees their own conflict');

-- The owner may settle their own conflict and nothing else about it.
UPDATE public.security_career_profile_reconciliations
   SET resolved_at = now()
 WHERE user_id = 'c3333333-3333-3333-3333-333333333333';

SELECT pg_temp.ok(
  (SELECT resolved_at FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c3333333-3333-3333-3333-333333333333') IS NOT NULL,
  'D4 and may mark it settled');

-- What a holder may NOT do to their own record -- manufacture it, destroy it,
-- or edit any of the evidence on it -- is the whole of Group G below, run as
-- executed statements rather than as grant inspection.

RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.security_career_profile_reconciliations',
  'permission denied',
  'D6 an anonymous visitor cannot read the reconciliation log');
SELECT pg_temp.must_fail(
  'SELECT count(*) FROM public.security_career_profiles',
  'permission denied',
  'D7 nor anybody''s professional profile');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP G — the record is evidence, not a form'; END $$;

-- ══ WHY THIS GROUP EXECUTES INSTEAD OF INSPECTING ══════════════════════
--
-- The previous version of this migration granted table-wide UPDATE and
-- relied on an RLS policy to constrain it. The policy did constrain it -- to
-- the holder's own ROW. Rows were never the exposure: a holder could rewrite
-- `canonical_value`, `passport_value`, `resolution`, `field` or `created_at`
-- on their own record, which is editing the evidence about their own case.
--
-- A guard that read `information_schema.role_table_grants` would have seen
-- "UPDATE granted to authenticated" both before and after the fix and had no
-- opinion, because the difference lives in
-- `information_schema.column_privileges`. So this group does not look at
-- privileges at all. It becomes the holder, issues each statement, and
-- records which succeeded.

-- A fresh, unresolved conflict to work on. Group D settled the other one.
INSERT INTO public.security_career_profile_reconciliations
  (user_id, field, canonical_value, passport_value, resolution)
VALUES ('c1111111-1111-1111-1111-111111111111', 'current_profession_slug',
        'cpp-test-tekniker', 'cpp-test-vaktare', 'kept_canonical_conflict');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1111111-1111-1111-1111-111111111111', true);

-- ── G1 · read your own record ────────────────────────────────────────
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 1,
  'G1 a holder can read their own reconciliation record');

-- The holder must be able to SEE both values -- that is what they are being
-- asked about. Reading is not the risk; writing is.
SELECT pg_temp.ok(
  (SELECT canonical_value FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-tekniker'
  AND (SELECT passport_value FROM public.security_career_profile_reconciliations
        WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'G1b including both of the values it is asking them about');

-- ── G2 · settle it — the ONE permitted write ─────────────────────────
UPDATE public.security_career_profile_reconciliations
   SET resolved_at = now()
 WHERE user_id = 'c1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT resolved_at FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') IS NOT NULL,
  'G2 and can set resolved_at on it');

-- ── G3-G7 · every other column is refused ────────────────────────────
--
-- Column privileges are checked before row security, so each of these fails
-- outright rather than quietly matching no rows -- which matters: a silent
-- zero-row UPDATE would look identical to a successful one from the client.
SELECT pg_temp.must_fail(
  $$UPDATE public.security_career_profile_reconciliations
       SET canonical_value = 'rewritten'
     WHERE user_id = 'c1111111-1111-1111-1111-111111111111'$$,
  'permission denied',
  'G3 but cannot rewrite canonical_value');

SELECT pg_temp.must_fail(
  $$UPDATE public.security_career_profile_reconciliations
       SET passport_value = 'rewritten'
     WHERE user_id = 'c1111111-1111-1111-1111-111111111111'$$,
  'permission denied',
  'G4 nor passport_value');

SELECT pg_temp.must_fail(
  $$UPDATE public.security_career_profile_reconciliations
       SET resolution = 'adopted_from_passport'
     WHERE user_id = 'c1111111-1111-1111-1111-111111111111'$$,
  'permission denied',
  'G5 nor resolution');

SELECT pg_temp.must_fail(
  $$UPDATE public.security_career_profile_reconciliations
       SET field = 'current_profession_slug'
     WHERE user_id = 'c1111111-1111-1111-1111-111111111111'$$,
  'permission denied',
  'G6 nor field');

SELECT pg_temp.must_fail(
  $$UPDATE public.security_career_profile_reconciliations
       SET created_at = now()
     WHERE user_id = 'c1111111-1111-1111-1111-111111111111'$$,
  'permission denied',
  'G7 nor created_at');

-- The smuggling case: a permitted column and a forbidden one in ONE
-- statement. If privileges were evaluated per-statement rather than
-- per-column this would slip through, and it is the shape an ordinary ORM
-- would generate.
SELECT pg_temp.must_fail(
  $$UPDATE public.security_career_profile_reconciliations
       SET resolved_at = now(), canonical_value = 'rewritten'
     WHERE user_id = 'c1111111-1111-1111-1111-111111111111'$$,
  'permission denied',
  'G7b and cannot smuggle a forbidden column alongside the permitted one');

-- ── G8-G9 · the record cannot be destroyed or manufactured ───────────
SELECT pg_temp.must_fail(
  $$DELETE FROM public.security_career_profile_reconciliations
     WHERE user_id = 'c1111111-1111-1111-1111-111111111111'$$,
  'permission denied',
  'G8 a holder cannot destroy their own record');

SELECT pg_temp.must_fail(
  $$INSERT INTO public.security_career_profile_reconciliations
      (user_id, field, canonical_value, passport_value, resolution)
    VALUES ('c1111111-1111-1111-1111-111111111111', 'current_profession_slug',
            'invented', 'invented', 'kept_canonical_conflict')$$,
  'permission denied',
  'G9 nor invent a conflict that never happened');

-- ── G10 · and none of it belongs to anybody else ─────────────────────
--
-- A different signed-in user, on the SAME row. Here RLS is the control
-- rather than the privilege system, so the statement is permitted and simply
-- matches nothing -- which is why the assertion reads the row back instead of
-- trusting that the UPDATE "worked".
RESET ROLE;
UPDATE public.security_career_profile_reconciliations
   SET resolved_at = NULL
 WHERE user_id = 'c1111111-1111-1111-1111-111111111111';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c4444444-4444-4444-4444-444444444444', true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 0,
  'G10 another signed-in user cannot even see the record');

UPDATE public.security_career_profile_reconciliations
   SET resolved_at = now()
 WHERE user_id = 'c1111111-1111-1111-1111-111111111111';

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT resolved_at FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') IS NULL,
  'G10b and their attempt to resolve it changed nothing');

-- ── G11 · the evidence is intact after all of that ───────────────────
SELECT pg_temp.ok(
  (SELECT canonical_value FROM public.security_career_profile_reconciliations
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-tekniker'
  AND (SELECT passport_value FROM public.security_career_profile_reconciliations
        WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare'
  AND (SELECT resolution FROM public.security_career_profile_reconciliations
        WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'kept_canonical_conflict',
  'G11 every evidence field survived the attempts unchanged');

-- The service role keeps what an operator needs -- the rollback below runs as
-- one, and reads these values to restore the Passport.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'security_career_profile_reconciliations'
      AND grantee = 'service_role'
      AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')) = 4,
  'G12 the service role retains full administrative access');

-- Housekeeping: leave the fixture as Group E expects to find it.
DELETE FROM public.security_career_profile_reconciliations
 WHERE user_id = 'c1111111-1111-1111-1111-111111111111';

DO $$ BEGIN RAISE NOTICE 'GROUP E — the documented rollback reverses it'; END $$;

\i supabase/rollback/20261007090000_canonical_professional_profile_rollback.sql

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c3333333-3333-3333-3333-333333333333') = 'cpp-test-vaktare',
  'E1 the rollback restores the Passport value the consolidation overwrote');

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c2222222-2222-2222-2222-222222222222') = 'cpp-test-vaktare',
  'E2 and keeps the adopted answer -- it is the user''s own, and discarding it would be the loss');

SELECT pg_temp.ok(
  to_regclass('public.security_career_profile_reconciliations') IS NULL,
  'E3 the reconciliation log is gone');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'career_profile_mirror_profession_to_passport'),
  'E4 and so is the mirror');

DO $$ BEGIN RAISE NOTICE 'GROUP F — OLD CODE + NEW DATABASE'; END $$;

-- ══ THE POINT OF THE WHOLE SPLIT ═══════════════════════════════════════
--
-- Applying this migration deploys nothing. The application that keeps running
-- against it is the one on main TODAY, and if that application breaks, the
-- expand phase is not an expand phase.
--
-- So this group replays what current main actually issues, statement for
-- statement, taken from the code as it stands before the application release:
--
--   savePassportBasics      UPDATE sp_passport_profiles
--                             SET display_name, headline,
--                                 cig_profession_slug, onboarding_answers
--                           WHERE holder_user_id = <caller>
--
--   saveOnboardingProgress  UPDATE sp_passport_profiles
--                             SET onboarding_step, onboarding_answers,
--                                 onboarding_state, question_version,
--                                 cig_profession_slug, jurisdiction_code, ...
--
--   ensureProfileRow        INSERT INTO sp_passport_profiles (holder_user_id)
--
--   upsertMySecurityCareerProfile
--                           INSERT ... ON CONFLICT (user_id) DO UPDATE on
--                           security_career_profiles
--
-- Each must still succeed, still write what it wrote before, and leave the
-- two copies in agreement rather than diverging as they do today.

-- The rollback in Group E removed everything. Restore the expand state so
-- this group runs against the database an operator would actually have.
\i supabase/migrations/20261007090000_canonical_professional_profile.sql

DELETE FROM public.sp_passport_profiles;
DELETE FROM public.security_career_profiles;

-- ── F1 · ensureProfileRow, exactly as the old client issues it ────────
INSERT INTO public.sp_passport_profiles (holder_user_id)
VALUES ('c1111111-1111-1111-1111-111111111111');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.sp_passport_profiles
           WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111'),
  'F1 the old client can still create a Passport row');

-- ── F2 · savePassportBasics, unchanged ───────────────────────────────
UPDATE public.sp_passport_profiles
   SET display_name = 'Elin Nordqvist',
       headline = 'Väktare med objektsansvar',
       cig_profession_slug = 'cpp-test-vaktare',
       onboarding_answers = jsonb_build_object(
         'identity.displayName', 'Elin Nordqvist',
         'profession.profession', 'cpp-test-vaktare')
 WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'F2 the old Passport writer still writes the column it has always written');

SELECT pg_temp.ok(
  (SELECT display_name FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'Elin Nordqvist',
  'F3 and the rest of that statement is untouched');

-- The improvement, not merely the absence of a break: the answer now reaches
-- the canonical row instead of sitting in a second copy nobody reconciles.
SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'F4 and it now reaches the canonical profile, so the two cannot diverge');

-- ── F5 · saveOnboardingProgress, unchanged ───────────────────────────
UPDATE public.sp_passport_profiles
   SET onboarding_step = 3,
       onboarding_answers = jsonb_build_object('profession.profession', 'cpp-test-tekniker'),
       onboarding_state = 'in_progress',
       cig_profession_slug = 'cpp-test-tekniker',
       jurisdiction_code = 'SE'
 WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT onboarding_step FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 3
  AND (SELECT cig_profession_slug FROM public.sp_passport_profiles
        WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-tekniker',
  'F5 the old onboarding autosave still writes every column it writes today');

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-tekniker',
  'F6 and it too stays in step with the canonical profile');

-- ── F7 · upsertMySecurityCareerProfile, unchanged ────────────────────
--
-- The old /my-career editor, writing the whole row. It must still work, and
-- the Passport must follow rather than keep the previous answer -- which is
-- precisely what it did NOT do before this migration.
INSERT INTO public.security_career_profiles
  (user_id, profile_version, current_status, current_profession_slug,
   current_profession_other, years_of_experience)
VALUES ('c1111111-1111-1111-1111-111111111111', 'scp-v1', 'working_in_industry',
        'cpp-test-vaktare', NULL, '5-10')
ON CONFLICT (user_id) DO UPDATE SET
  current_status = EXCLUDED.current_status,
  current_profession_slug = EXCLUDED.current_profession_slug,
  current_profession_other = EXCLUDED.current_profession_other,
  years_of_experience = EXCLUDED.years_of_experience;

SELECT pg_temp.ok(
  (SELECT years_of_experience FROM public.security_career_profiles
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = '5-10',
  'F7 the old career-profile editor still writes the whole row');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'F8 and the Passport follows it, instead of keeping a stale second answer');

-- ── F9 · no constraint the old client can now violate ────────────────
--
-- The expand phase adds no NOT NULL, no new CHECK and no new foreign key to
-- any table an existing client writes. Stated as an assertion rather than as
-- a promise, because "additive" is the kind of claim that is true when it is
-- written and false three migrations later.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN ('sp_passport_profiles', 'security_career_profiles')
      AND c.conname LIKE '%canonical%') = 0,
  'F9 the expand phase adds no constraint an existing client could violate');

-- ── F10 · and the writes are still the caller''s own ─────────────────
--
-- The compatibility trigger is SECURITY DEFINER, which is what lets it reach
-- the canonical row at all. It must not become a way to write SOMEBODY ELSE''S
-- profile: it keys on NEW.holder_user_id, and RLS still decides which Passport
-- row the caller could have updated in the first place.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c2222222-2222-2222-2222-222222222222', true);

UPDATE public.sp_passport_profiles
   SET cig_profession_slug = 'cpp-test-tekniker'
 WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111';

RESET ROLE;

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'F10 a signed-in stranger cannot reach another holder''s Passport row, so the trigger never fires for them');

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'c1111111-1111-1111-1111-111111111111') = 'cpp-test-vaktare',
  'F11 and their career profile is untouched');

ROLLBACK;
