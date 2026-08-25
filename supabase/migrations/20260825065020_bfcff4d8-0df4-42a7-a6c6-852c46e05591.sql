BEGIN;

ALTER TABLE public.sp_passport_profiles
  ALTER COLUMN jurisdiction_code DROP DEFAULT;

ALTER TABLE public.sp_passport_profiles
  ALTER COLUMN jurisdiction_code DROP NOT NULL;

ALTER TABLE public.sp_passport_profiles
  ADD COLUMN IF NOT EXISTS sub_jurisdiction_code text
    REFERENCES public.sp_sub_jurisdictions(code);

ALTER TABLE public.sp_passport_profiles
  ADD COLUMN IF NOT EXISTS work_location_confirmed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sp_passport_profiles'::regclass
      AND conname  = 'sp_profile_sub_matches_country'
  ) THEN
    ALTER TABLE public.sp_passport_profiles
      ADD CONSTRAINT sp_profile_sub_matches_country
      CHECK (
        sub_jurisdiction_code IS NULL
        OR (
          jurisdiction_code IS NOT NULL
          AND left(sub_jurisdiction_code, 2) = jurisdiction_code
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sp_passport_profiles'::regclass
      AND conname  = 'sp_profile_confirmed_needs_country'
  ) THEN
    ALTER TABLE public.sp_passport_profiles
      ADD CONSTRAINT sp_profile_confirmed_needs_country
      CHECK (work_location_confirmed_at IS NULL OR jurisdiction_code IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.sp_passport_profiles.jurisdiction_code IS
  'ISO 3166-1 alpha-2 country where the holder works. NULL means not yet stated — never assume a country. Independent of sp_market_packs.is_active, which decides whether that country''s regulated credentials can be recorded.';

COMMENT ON COLUMN public.sp_passport_profiles.sub_jurisdiction_code IS
  'Optional sub-jurisdiction of jurisdiction_code, e.g. AE-DU for Dubai. Recorded so an emirate is never flattened into its country; carries no market entitlement of any kind.';

COMMENT ON COLUMN public.sp_passport_profiles.work_location_confirmed_at IS
  'When the HOLDER confirmed jurisdiction_code is where they work. NULL means the stored value is unconfirmed provenance - legacy rows carry SE from the old DEFAULT and must not be presented as the holder''s current work country until they answer. Never back-filled.';

COMMIT;