-- Rollback for 20261008090000_canonical_professional_profile_contract.sql.
--
-- Reopens the compatibility window by restoring the trigger the contract
-- migration withdrew. Run this if the application phase has to be reverted
-- while the expand migration stays applied -- which is the one state where
-- an old client is writing sp_passport_profiles.cig_profession_slug again
-- and needs that write carried through to the canonical row.
--
-- The definition is restored verbatim from the expand migration. It is a
-- CREATE OR REPLACE there and a CREATE OR REPLACE here, so re-applying
-- either file in any order converges on the same function.
--
-- Destroys nothing: the contract migration only dropped a trigger and a
-- function, and rewrote one column comment.

CREATE OR REPLACE FUNCTION public.career_profile_adopt_passport_profession()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.security_career_profiles
     WHERE user_id = NEW.holder_user_id
       AND current_profession_other IS NOT NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.security_career_profiles (user_id, current_profession_slug)
  VALUES (NEW.holder_user_id, NEW.cig_profession_slug)
  ON CONFLICT (user_id) DO UPDATE
     SET current_profession_slug = EXCLUDED.current_profession_slug
   WHERE public.security_career_profiles.current_profession_slug
         IS DISTINCT FROM EXCLUDED.current_profession_slug;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.career_profile_adopt_passport_profession() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS career_profile_adopt_passport_profession_trg
  ON public.sp_passport_profiles;
CREATE TRIGGER career_profile_adopt_passport_profession_trg
  AFTER UPDATE OF cig_profession_slug ON public.sp_passport_profiles
  FOR EACH ROW
  WHEN (NEW.cig_profession_slug IS DISTINCT FROM OLD.cig_profession_slug)
  EXECUTE FUNCTION public.career_profile_adopt_passport_profession();

COMMENT ON COLUMN public.sp_passport_profiles.cig_profession_slug IS
  'Mirror of security_career_profiles.current_profession_slug, with a '
  'compatibility path allowing an old client''s direct write to reach the '
  'canonical row. See 20261007090000.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'career_profile_adopt_passport_profession_trg'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'CANONICAL_PROFILE_CONTRACT_ROLLBACK_INCOMPLETE: the compatibility trigger is not back';
  END IF;
END $$;
