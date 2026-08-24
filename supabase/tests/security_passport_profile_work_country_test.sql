-- Security Passport — a holder's work country is stated, never assumed.
--
-- The defect: sp_passport_profiles.jurisdiction_code was NOT NULL DEFAULT 'SE',
-- so a profile was Swedish before its holder had been asked anything, and a
-- holder working in Dubai got a Passport Card telling every reader they were in
-- Sweden. Nothing in the schema could tell "said Sweden" from "not yet asked".
--
-- These assertions hold the corrected shape, and — just as importantly — hold
-- the line that recording a work country grants NO market.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _se uuid := '00000000-0000-0000-0000-00000000fc01';
  _ae uuid := '00000000-0000-0000-0000-00000000fc02';
  _txt text;
  _n   integer;
  _ts  timestamptz;
BEGIN
  INSERT INTO auth.users (id) VALUES (_se), (_ae) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- a new profile asserts no country at all';
  -- =====================================================================

  SELECT column_default INTO _txt
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sp_passport_profiles'
     AND column_name = 'jurisdiction_code';
  IF _txt IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 jurisdiction_code still defaults to %', _txt;
  END IF;
  RAISE NOTICE 'ok  1.1 jurisdiction_code has no default — no country is fabricated';

  SELECT is_nullable INTO _txt
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sp_passport_profiles'
     AND column_name = 'jurisdiction_code';
  IF _txt <> 'YES' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 jurisdiction_code cannot represent "not stated"';
  END IF;
  RAISE NOTICE 'ok  1.2 "not stated" is representable as NULL';

  -- A profile created without a country must STAY without one.
  INSERT INTO public.sp_passport_profiles (holder_user_id) VALUES (_se)
    ON CONFLICT (holder_user_id) DO UPDATE SET jurisdiction_code = NULL;
  SELECT jurisdiction_code INTO _txt
    FROM public.sp_passport_profiles WHERE holder_user_id = _se;
  IF _txt IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 a new profile invented country %', _txt;
  END IF;
  RAISE NOTICE 'ok  1.3 a profile created without a country has none';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- Dubai is recordable AS Dubai';
  -- =====================================================================

  INSERT INTO public.sp_passport_profiles (holder_user_id, jurisdiction_code, sub_jurisdiction_code)
       VALUES (_ae, 'AE', 'AE-DU')
    ON CONFLICT (holder_user_id)
    DO UPDATE SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-DU';

  SELECT sub_jurisdiction_code INTO _txt
    FROM public.sp_passport_profiles WHERE holder_user_id = _ae;
  IF _txt <> 'AE-DU' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.1 the emirate was not stored (got %)', _txt;
  END IF;
  RAISE NOTICE 'ok  2.1 a Dubai holder is recorded as AE + AE-DU, not flattened to AE';

  -- SIRA is a Dubai authority and does not license the UAE. An emirate that
  -- can be attached to the wrong country is the same claim by another route.
  BEGIN
    UPDATE public.sp_passport_profiles
       SET jurisdiction_code = 'SE', sub_jurisdiction_code = 'AE-DU'
     WHERE holder_user_id = _ae;
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 an emirate was accepted under the wrong country';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  2.2 a sub-jurisdiction must belong to the country beside it';
  END;

  BEGIN
    UPDATE public.sp_passport_profiles
       SET jurisdiction_code = NULL, sub_jurisdiction_code = 'AE-DU'
     WHERE holder_user_id = _ae;
    RAISE EXCEPTION 'ASSERTION FAILED: 2.3 an emirate was accepted with no country';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  2.3 an emirate cannot float without a country';
  END;

  -- Only real sub-jurisdictions, so a typo cannot become a place.
  BEGIN
    UPDATE public.sp_passport_profiles
       SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-ZZ'
     WHERE holder_user_id = _ae;
    RAISE EXCEPTION 'ASSERTION FAILED: 2.4 an unknown sub-jurisdiction was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok  2.4 the sub-jurisdiction must exist in sp_sub_jurisdictions';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- stating a country grants NO market';
  -- =====================================================================

  -- This is the load-bearing one. The whole point of separating work country
  -- from market availability is that widening the first must not widen the
  -- second, so the profile above must not have opened anything.
  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'AE-DU') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 the Dubai market pack became active';
  END IF;
  RAISE NOTICE 'ok  3.1 a Dubai holder exists and the Dubai market is still closed';

  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'GB') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 the UK market pack became active';
  END IF;
  RAISE NOTICE 'ok  3.2 the UK market is still closed';

  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.3 expected exactly one active market, found %', _n;
  END IF;
  RAISE NOTICE 'ok  3.3 exactly one market is open, and it is still Sweden only';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- existing Swedish holders are untouched';
  -- =====================================================================

  -- The migration deliberately does NOT rewrite legacy 'SE' rows: an explicit
  -- Swedish choice and the old default are indistinguishable in the data, and
  -- guessing either way would invent something.
  UPDATE public.sp_passport_profiles SET jurisdiction_code = 'SE' WHERE holder_user_id = _se;
  SELECT jurisdiction_code INTO _txt
    FROM public.sp_passport_profiles WHERE holder_user_id = _se;
  IF _txt <> 'SE' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.1 a stated Swedish country did not survive';
  END IF;
  RAISE NOTICE 'ok  4.1 a holder who states Sweden still reads Sweden';

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- a stored country is not a confirmed one';
  -- =====================================================================

  -- The legacy shape: 'SE' present, confirmation absent. This is the row the
  -- old DEFAULT produced for holders who were never asked, and it must be
  -- distinguishable from a holder who chose Sweden.
  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'SE', work_location_confirmed_at = NULL
   WHERE holder_user_id = _se;

  SELECT work_location_confirmed_at INTO _ts
    FROM public.sp_passport_profiles WHERE holder_user_id = _se;
  IF _ts IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.1 a legacy row arrived pre-confirmed';
  END IF;
  RAISE NOTICE 'ok  5.1 a legacy SE row carries no confirmation';

  -- The column must be able to hold the distinction, not merely exist.
  UPDATE public.sp_passport_profiles
     SET work_location_confirmed_at = now()
   WHERE holder_user_id = _se;
  SELECT work_location_confirmed_at INTO _ts
    FROM public.sp_passport_profiles WHERE holder_user_id = _se;
  IF _ts IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.2 a confirmation could not be recorded';
  END IF;
  RAISE NOTICE 'ok  5.2 a holder who states Sweden is recorded as having stated it';

  -- A confirmation standing over no country would be provenance for nothing,
  -- and would let a row claim it had been answered when it had not.
  BEGIN
    UPDATE public.sp_passport_profiles
       SET jurisdiction_code = NULL, work_location_confirmed_at = now()
     WHERE holder_user_id = _se;
    RAISE EXCEPTION 'ASSERTION FAILED: 5.3 a confirmation was accepted with no country';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  5.3 a confirmation cannot stand over an absent country';
  END;

  -- Provenance is orthogonal to market availability: confirming Dubai must not
  -- open Dubai.
  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-DU',
         work_location_confirmed_at = now()
   WHERE holder_user_id = _ae;
  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'AE-DU') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.4 confirming Dubai opened the Dubai market';
  END IF;
  RAISE NOTICE 'ok  5.4 a CONFIRMED Dubai holder still has no Dubai market';

  DELETE FROM public.sp_passport_profiles WHERE holder_user_id IN (_se, _ae);
  DELETE FROM auth.users WHERE id IN (_se, _ae);

  RAISE NOTICE 'security_passport_profile_work_country_test: all assertions passed';
END $$;
