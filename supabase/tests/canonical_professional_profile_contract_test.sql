-- CONTRACT PHASE — the compatibility window closes, and the mirror is one-way.
--
-- The expand suite asserts that during the compatibility window a write to
-- sp_passport_profiles.cig_profession_slug reaches the canonical row. That is
-- correct FOR THAT WINDOW and wrong afterwards, so the opposite claim is
-- asserted here rather than being stated early and hoped for.
--
-- ── WHY BOTH MIGRATIONS ARE RE-APPLIED IN ORDER ────────────────────────
--
-- Same reason the expand suite re-applies its own file: the replay leaves the
-- database in whatever state the last migration on this branch produced, and a
-- suite that reads that state is asserting over an accident of ordering. Here
-- the transaction rebuilds the sequence explicitly -- expand, then contract --
-- so the transition itself is what is under test, not its residue.
--
-- Runs inside one transaction that is rolled back. Every fixture is synthetic.

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

INSERT INTO auth.users (id, email) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'contract-holder@example.test');

INSERT INTO public.cig_professions (slug, canonical_key, title_sv, title_en, graph_version)
SELECT 'cppc-test-vaktare', 'CPPC_TEST_VAKTARE', 'Testväktare', 'Test Security Officer', 'test'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_professions WHERE slug = 'cppc-test-vaktare');
INSERT INTO public.cig_professions (slug, canonical_key, title_sv, title_en, graph_version)
SELECT 'cppc-test-tekniker', 'CPPC_TEST_TEKNIKER', 'Testtekniker', 'Test Technician', 'test'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_professions WHERE slug = 'cppc-test-tekniker');

DO $$ BEGIN RAISE NOTICE 'GROUP K1 — the expand state, then the contract'; END $$;

\i supabase/migrations/20261007090000_canonical_professional_profile.sql

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = 'career_profile_adopt_passport_profession'),
  'K1.1 the compatibility trigger exists after the expand migration');

\i supabase/migrations/20261008090000_canonical_professional_profile_contract.sql

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public'
                 AND p.proname = 'career_profile_adopt_passport_profession'),
  'K1.2 and is gone after the contract migration');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname = 'career_profile_adopt_passport_profession_trg'
                 AND NOT tgisinternal),
  'K1.3 along with its trigger');

-- The mechanism must survive. Dropping the compatibility path is not the same
-- as dropping the mirror, and a contract migration that took both would leave
-- the disclosure package without a profession.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = 'career_profile_mirror_profession_to_passport'),
  'K1.4 the mirror survives the contract');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname = 'career_profile_seed_passport_profession'),
  'K1.5 and so does the seed');

SELECT pg_temp.ok(
  to_regclass('public.security_career_profile_reconciliations') IS NOT NULL,
  'K1.6 and the reconciliation log, which is evidence and the rollback''s source');

DO $$ BEGIN RAISE NOTICE 'GROUP K2 — the mirror is now one-way'; END $$;

INSERT INTO public.sp_passport_profiles (holder_user_id)
VALUES ('d1111111-1111-1111-1111-111111111111');

INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
VALUES ('d1111111-1111-1111-1111-111111111111', 'cppc-test-vaktare');

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'd1111111-1111-1111-1111-111111111111') = 'cppc-test-vaktare',
  'K2.1 the canonical answer still mirrors onto the Passport');

-- THE claim this whole release rests on. After the contract, a write to the
-- Passport column cannot travel back -- which is what makes the canonical row
-- canonical rather than merely first.
UPDATE public.sp_passport_profiles
   SET cig_profession_slug = 'cppc-test-tekniker'
 WHERE holder_user_id = 'd1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'd1111111-1111-1111-1111-111111111111') = 'cppc-test-vaktare',
  'K2.2 and a write to the Passport column can no longer rewrite it');

-- Stated structurally as well as behaviourally: no trigger on the Passport
-- writes the canonical table at all. The seed trigger READS it, which is why
-- the assertion is about writes rather than about mentions.
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE c.relname = 'sp_passport_profiles' AND NOT t.tgisinternal
       AND (pg_get_functiondef(p.oid) ILIKE '%UPDATE public.security_career_profiles%'
         OR pg_get_functiondef(p.oid) ILIKE '%INSERT INTO public.security_career_profiles%')),
  'K2.3 no trigger on the Passport WRITES the canonical table');

-- The next canonical write restores agreement, so a stray direct edit cannot
-- leave the two copies disagreeing for good.
UPDATE public.security_career_profiles
   SET current_profession_slug = 'cppc-test-vaktare'
 WHERE user_id = 'd1111111-1111-1111-1111-111111111111';
UPDATE public.security_career_profiles
   SET current_profession_slug = 'cppc-test-tekniker'
 WHERE user_id = 'd1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT cig_profession_slug FROM public.sp_passport_profiles
    WHERE holder_user_id = 'd1111111-1111-1111-1111-111111111111') = 'cppc-test-tekniker',
  'K2.4 and the next canonical write brings the mirror back into line');

DO $$ BEGIN RAISE NOTICE 'GROUP K3 — re-runnable, and reversible'; END $$;

\i supabase/migrations/20261008090000_canonical_professional_profile_contract.sql

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public'
                 AND p.proname = 'career_profile_adopt_passport_profession'),
  'K3.1 applying the contract twice is a no-op');

\i supabase/rollback/20261008090000_canonical_professional_profile_contract_rollback.sql

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgname = 'career_profile_adopt_passport_profession_trg'
             AND NOT tgisinternal),
  'K3.2 the rollback reopens the compatibility window');

-- And it reopens it WORKING, not merely present -- the reason to roll back is
-- that an old client is writing that column again.
UPDATE public.sp_passport_profiles
   SET cig_profession_slug = 'cppc-test-vaktare'
 WHERE holder_user_id = 'd1111111-1111-1111-1111-111111111111';

SELECT pg_temp.ok(
  (SELECT current_profession_slug FROM public.security_career_profiles
    WHERE user_id = 'd1111111-1111-1111-1111-111111111111') = 'cppc-test-vaktare',
  'K3.3 and an old client''s write reaches the canonical row again');

DO $$ BEGIN RAISE NOTICE 'GROUP K4 — a profile edit cannot reach a frozen report'; END $$;

-- ══ THE PRODUCT CLAIM, AT THE LAYER THAT CAN ENFORCE IT ════════════════
--
-- The whole Career Journey rests on one promise: updating your professional
-- profile changes the INTERPRETATION and never the assessment. The
-- application side of that is a pure function that returns a new object and
-- writes nothing (scripts/career-journey-check.ts). This is the other half --
-- proof that no database path leads from a profile write to a stored report.
--
-- Enumerated rather than asserted about one known trigger: the risk is a
-- function added later, not the two that exist today.

SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'security_career_profiles'
       AND NOT t.tgisinternal
       AND pg_get_functiondef(p.oid) ~* '(cd_report_snapshots|cd_sessions|cd_evidence|assessment_runs)'),
  'K4.1 nothing fired by a profile write mentions a stored report, a session or its evidence');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('career_profile_mirror_profession_to_passport',
                        'career_profile_seed_passport_profession')
      AND pg_get_functiondef(p.oid) ~* '(cd_|assessment_)') = 0,
  'K4.2 and neither sync function names any Career Discovery object at all');

-- The frozen report's own defence is unchanged by this release: the
-- immutability trigger that has always refused an UPDATE is still installed.
-- Asserted here because a migration that dropped it would otherwise be
-- noticed only by whatever tried to rely on it next.
SELECT pg_temp.ok(
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'cd_report_snapshots'
       AND NOT t.tgisinternal
       AND t.tgname = 'cd_report_snapshots_v31_immutable_trg'),
  'K4.3 the stored report''s own immutability trigger is untouched by this release');

ROLLBACK;
