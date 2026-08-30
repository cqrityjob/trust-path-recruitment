-- Rollback for 20261007090000_canonical_professional_profile.sql.
--
-- ── WHAT COMES BACK, AND WHAT DOES NOT ────────────────────────────────
--
-- This reverses the MECHANISM: the mirror trigger and its function go, the
-- reconciliation log goes, and the table comments return to describing
-- nothing in particular. The Passport is then free to be a second writer
-- again, which is what the application code before this release expects.
--
-- What it does NOT do is un-reconcile the data, and the order matters:
--
--   * Step 1 restores every pre-consolidation Passport value from the
--     reconciliation log, BEFORE the log is dropped. That is the whole
--     reason the log exists. A holder whose Passport profession was
--     overwritten by the canonical value in step 3c of the migration gets
--     their original Passport answer back.
--   * A canonical row that was CREATED or FILLED IN by the migration's
--     adoption step keeps its value. Deleting it would throw away the
--     user's own answer to make the schema look untouched, which is the
--     wrong trade: the value is correct, it is theirs, and the pre-release
--     application reads that column perfectly well.
--
-- So a rollback leaves both copies holding what they held before, and the
-- product goes back to having two writers. Run it only with the application
-- code reverted, or the Passport UI will have no profession editor while
-- the canonical one is no longer mirrored.

-- ── 1. Restore the Passport values this release overwrote ─────────────
--
-- Only rows the migration actually recorded, and only where the current
-- value is still the canonical one it was set to -- a holder who has since
-- changed their Passport profession by some other route is not reverted.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'security_career_profile_reconciliations'
  ) THEN
    UPDATE public.sp_passport_profiles p
       SET cig_profession_slug = r.passport_value
      FROM public.security_career_profile_reconciliations r
     WHERE r.user_id = p.holder_user_id
       AND r.field = 'current_profession_slug'
       AND r.resolution = 'kept_canonical_conflict'
       AND r.passport_value IS NOT NULL
       AND p.cig_profession_slug IS DISTINCT FROM r.passport_value
       AND p.cig_profession_slug IS NOT DISTINCT FROM r.canonical_value;
  END IF;
END $$;

-- ── 2. Remove the mirror ──────────────────────────────────────────────

DROP TRIGGER IF EXISTS career_profile_mirror_profession_trg
  ON public.security_career_profiles;

DROP FUNCTION IF EXISTS public.career_profile_mirror_profession_to_passport();

DROP TRIGGER IF EXISTS career_profile_seed_passport_profession_trg
  ON public.sp_passport_profiles;

DROP FUNCTION IF EXISTS public.career_profile_seed_passport_profession();

-- The compatibility trigger goes too. Rolling back the expand phase returns
-- the database to a state where the two copies are independent again, which
-- is what the pre-release application expects -- and it is the state Phase C
-- reaches by a different route, from the other side, once no client writes
-- the Passport column any more.
DROP TRIGGER IF EXISTS career_profile_adopt_passport_profession_trg
  ON public.sp_passport_profiles;

DROP FUNCTION IF EXISTS public.career_profile_adopt_passport_profession();

-- ── 3. Remove the reconciliation log ──────────────────────────────────

DROP POLICY IF EXISTS "own scp reconciliation resolve"
  ON public.security_career_profile_reconciliations;
DROP POLICY IF EXISTS "own scp reconciliation select"
  ON public.security_career_profile_reconciliations;
DROP TABLE IF EXISTS public.security_career_profile_reconciliations;

-- ── 4. Un-say what the comments said ──────────────────────────────────

COMMENT ON COLUMN public.security_career_profiles.current_profession_slug IS NULL;
COMMENT ON TABLE public.security_career_profiles IS NULL;

-- ── 5. Prove it ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'career_profile_mirror_profession_trg'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'CANONICAL_PROFILE_ROLLBACK_INCOMPLETE: the mirror trigger is still present';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('career_profile_mirror_profession_to_passport',
                         'career_profile_seed_passport_profession',
                         'career_profile_adopt_passport_profession')
  ) THEN
    RAISE EXCEPTION 'CANONICAL_PROFILE_ROLLBACK_INCOMPLETE: a mirror function is still present';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'security_career_profile_reconciliations'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_PROFILE_ROLLBACK_INCOMPLETE: the reconciliation table is still present';
  END IF;
END $$;
