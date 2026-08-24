-- Security Passport — the holder's WORK COUNTRY, told apart from the markets
-- whose regulated credentials the product supports.
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────
--
-- `sp_passport_profiles.jurisdiction_code` was `NOT NULL DEFAULT 'SE'`. Every
-- profile was therefore Swedish from the instant it was created — before the
-- holder had been asked anything. A person working in Dubai got a Passport
-- Card that told every reader they were in Sweden, and nothing in the schema
-- could tell "this holder said Sweden" apart from "nobody has asked yet".
--
-- For a product whose entire claim is that it does not assert things nobody
-- checked, a default country is not a convenience. It is a fabricated fact
-- about a real person.
--
-- ── WHAT THIS CHANGES ──────────────────────────────────────────────────
--
--   1. The default is dropped and the column becomes nullable, so "no country
--      stated" is representable as NULL instead of silently reading as Sweden.
--
--   2. A nullable `sub_jurisdiction_code` is added, so Dubai can be recorded
--      AS Dubai. `sp_sub_jurisdictions` already holds AE-DU; the Passport
--      profile simply had nowhere to put it, which is why a Dubai holder could
--      previously be represented no more precisely than "United Arab
--      Emirates". SIRA is a Dubai authority and does not license the UAE, so
--      collapsing the emirate into the country is a claim this product refuses
--      to make.
--
--   3. A CHECK keeps the two consistent: a sub-jurisdiction must belong to the
--      country beside it. The same rule `sp_market_packs` already applies to
--      itself, for the same reason.
--
-- ── WHAT THIS DELIBERATELY DOES NOT CHANGE ─────────────────────────────
--
-- NOTHING about market availability. Recording a work country is not being
-- granted a market: `sp_market_packs.is_active` still gates which regulated
-- credentials exist, GB and AE-DU are still inactive and still fail their
-- review CHECK if switched on, and the credential form still builds its
-- jurisdiction list from the ACTIVE packs alone. A holder may now say they
-- work in Dubai and will still find no Dubai credential to record.
--
-- ── LEGACY ROWS ARE NOT REWRITTEN ──────────────────────────────────────
--
-- Every existing profile reads 'SE'. Some of those holders chose Sweden; the
-- rest never got the chance, because the onboarding step offered nothing else.
-- The two are INDISTINGUISHABLE in the data — there is no timestamp, no answer
-- record and no audit row that separates them.
--
-- So they are left exactly as they are. Setting them to NULL would erase the
-- real choices of Swedish holders, who are the overwhelming majority and the
-- only market that is open; keeping them as 'SE' at worst leaves a Swedish
-- label on a holder who has not yet said otherwise, which they can correct in
-- onboarding. Guessing in either direction would be inventing data, and the
-- honest option — asking again — is a product decision and not a migration's
-- to make. New profiles start NULL and are asked.
--
-- Reversible: see supabase/rollback/20260908093000_sp_profile_work_country_rollback.sql

BEGIN;

-- 1. No more fabricated Sweden. -----------------------------------------
ALTER TABLE public.sp_passport_profiles
  ALTER COLUMN jurisdiction_code DROP DEFAULT;

ALTER TABLE public.sp_passport_profiles
  ALTER COLUMN jurisdiction_code DROP NOT NULL;

-- 2. Somewhere to put the emirate. ---------------------------------------
ALTER TABLE public.sp_passport_profiles
  ADD COLUMN IF NOT EXISTS sub_jurisdiction_code text
    REFERENCES public.sp_sub_jurisdictions(code);

-- 3. The two must agree. -------------------------------------------------
--
-- A sub-jurisdiction with no country, or belonging to a different one, would
-- let a profile say "Dubai" while claiming Sweden. Named and added
-- conditionally so a replay onto a database that already has it is a no-op.
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

COMMENT ON COLUMN public.sp_passport_profiles.jurisdiction_code IS
  'ISO 3166-1 alpha-2 country where the holder works. NULL means not yet '
  'stated — never assume a country. Independent of sp_market_packs.is_active, '
  'which decides whether that country''s regulated credentials can be recorded.';

COMMENT ON COLUMN public.sp_passport_profiles.sub_jurisdiction_code IS
  'Optional sub-jurisdiction of jurisdiction_code, e.g. AE-DU for Dubai. '
  'Recorded so an emirate is never flattened into its country; carries no '
  'market entitlement of any kind.';

COMMIT;
