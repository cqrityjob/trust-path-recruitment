-- CONTRACT: the compatibility window closes.
--
-- ══ WHAT THIS REMOVES, AND WHEN IT MAY BE APPLIED ════════════════════════
--
-- 20261007090000 (EXPAND) installed a temporary trigger,
-- career_profile_adopt_passport_profession, that carried an old client's
-- write of sp_passport_profiles.cig_profession_slug back to the canonical
-- career profile. It existed for exactly one reason: between applying that
-- migration and deploying the application phase, the running application was
-- still the one that writes that column directly, and refusing its writes
-- would have broken the Passport for every holder until the code caught up.
--
-- That window is now closed. The application phase removes professionSlug
-- from BOTH Passport write schemas -- profileBasicsInput and onboardingInput
-- -- so no client, including a stale tab, can send it any more. The only
-- remaining writer of that column is the mirror, which the database owns.
--
-- ══ WHY THIS SHIPS WITH THE CODE AND IS APPLIED AFTER IT ═════════════════
--
-- Lovable rebuilds the application from `origin/main` the moment a PR merges;
-- migrations run when somebody applies them. So merging the application PR
-- puts the new code live BEFORE this file can be applied, which is exactly
-- the ordering a contract migration needs: the writer is gone first, then the
-- compatibility for it is withdrawn.
--
-- Applying it early is not dangerous, only premature: the old client's
-- Passport writes would stop reaching the canonical row and the two copies
-- could diverge again, as they do on main today. Applying it late costs
-- nothing at all -- the trigger simply never fires, because nothing writes
-- the column.
--
-- ══ WHAT IT DOES NOT TOUCH ═══════════════════════════════════════════════
--
-- The mirror and the seed stay: they are the mechanism, not the
-- compatibility. So does the reconciliation log, which is evidence about what
-- the two copies held before consolidation and is what makes the expand
-- migration's rollback able to put those values back.
--
-- Reversible: supabase/rollback/20261008090000_canonical_professional_profile_contract_rollback.sql

DROP TRIGGER IF EXISTS career_profile_adopt_passport_profession_trg
  ON public.sp_passport_profiles;

DROP FUNCTION IF EXISTS public.career_profile_adopt_passport_profession();

COMMENT ON COLUMN public.sp_passport_profiles.cig_profession_slug IS
  'READ-ONLY MIRROR of security_career_profiles.current_profession_slug, '
  'maintained by career_profile_mirror_profession_to_passport() and seeded by '
  'career_profile_seed_passport_profession(). No application code writes it: '
  'the canonical Professional Profile is the single writer, and the '
  'compatibility path that briefly allowed the reverse direction was withdrawn '
  'by this migration.';

-- The claim above, enforced. If the compatibility function is somehow still
-- present the mirror is not one-way, and every statement this release makes
-- about a canonical profile is false.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'career_profile_adopt_passport_profession'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_PROFILE_CONTRACT_INCOMPLETE: the compatibility trigger survives';
  END IF;
END $$;
