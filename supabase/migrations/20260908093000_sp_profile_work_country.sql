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
-- ── LEGACY ROWS ARE NOT REWRITTEN, AND NOT BELIEVED EITHER ─────────────
--
-- Every existing profile reads 'SE'. Some of those holders chose Sweden; the
-- rest never got the chance, because the onboarding step offered nothing else.
-- The two are INDISTINGUISHABLE in the stored value.
--
-- Rewriting them is not an option — setting them all to NULL would erase the
-- real choices of Swedish holders, who are the overwhelming majority and the
-- only open market, and guessing the other way invents data. But LEAVING them
-- and continuing to present them as the holder's confirmed current work
-- country is not honest either: that is the same assertion the DEFAULT was
-- making, just made once instead of continuously.
--
-- So a third column records PROVENANCE rather than value:
--
--     work_location_confirmed_at
--
-- NULL means "nobody has confirmed this is where they work". Legacy rows keep
-- their 'SE' and get NULL, so the value survives for correction while no
-- surface may present it as current truth. A holder who answers the country
-- step — from a list that now has more than one entry, so the answer means
-- something — gets a timestamp, and only then does the location display.
--
-- ── WHY A NEW COLUMN AND NOT AN EXISTING ONE ───────────────────────────
--
-- Two candidates were checked against real rows before adding anything:
--
--   `declared_accurate_at` — set when a holder declares their profile accurate
--     at the end of onboarding. A local row exists with declared_accurate_at
--     SET and no country answer at all, which is exactly the case this must
--     catch. It answers a different question.
--
--   `onboarding_answers ->> 'jurisdiction.jurisdiction'` — present for anyone
--     who completed the old step. But that step offered ONE option, so its
--     presence proves the holder clicked, not that they chose. It cannot
--     distinguish a real answer from the only answer available.
--
-- Neither is trustworthy for this question, so provenance is recorded
-- explicitly.
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

-- 3. Provenance: has the HOLDER said this is where they work? ------------
--
-- NULL for every existing row, including the Swedish ones, because none of
-- them was asked a question with more than one answer.
ALTER TABLE public.sp_passport_profiles
  ADD COLUMN IF NOT EXISTS work_location_confirmed_at timestamptz;

-- 4. The two must agree. -------------------------------------------------
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

-- A confirmation with nothing to confirm is meaningless, and would let a row
-- claim provenance for a country it does not have.
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
  'ISO 3166-1 alpha-2 country where the holder works. NULL means not yet '
  'stated — never assume a country. Independent of sp_market_packs.is_active, '
  'which decides whether that country''s regulated credentials can be recorded.';

COMMENT ON COLUMN public.sp_passport_profiles.sub_jurisdiction_code IS
  'Optional sub-jurisdiction of jurisdiction_code, e.g. AE-DU for Dubai. '
  'Recorded so an emirate is never flattened into its country; carries no '
  'market entitlement of any kind.';

COMMENT ON COLUMN public.sp_passport_profiles.work_location_confirmed_at IS
  'When the HOLDER confirmed jurisdiction_code is where they work. NULL means '
  'the stored value is unconfirmed provenance - legacy rows carry SE from the '
  'old DEFAULT and must not be presented as the holder''s current work country '
  'until they answer. Never back-filled.';

COMMIT;
