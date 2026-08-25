-- Security Passport — the recipient learns WHERE the holder works, precisely.
--
-- `sp_passport_profiles` has stored `sub_jurisdiction_code` since
-- 20260908093000, and every authenticated surface renders a Dubai holder as
-- "Dubai, Förenade Arabemiraten". `sp_disclosure_payload` emitted only the
-- COUNTRY for the holder, so the recipient page — the one surface a stranger
-- ever sees — collapsed that into "United Arab Emirates". SIRA licenses the
-- emirate and not the country, so that is the UAE-wide reading the Dubai market
-- pack exists to refuse, reappearing at the worst possible place.
--
-- These assertions pin the payload contract, and pin the things the fix must
-- NOT have moved: a credential keeps its own jurisdiction, the scope boundary
-- is unchanged, and no market opened.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h  uuid := '00000000-0000-0000-0000-00000000fd01';
  _v  uuid := '00000000-0000-0000-0000-00000000fd02';
  _d  uuid;
  _c  uuid;
  _p  jsonb;
  _n  integer;
BEGIN
  -- A separate verifier: sp_claim_no_self_verification refuses a holder who
  -- verifies themselves, which is exactly the rule we do not want to bypass.
  INSERT INTO auth.users (id) VALUES (_h), (_v) ON CONFLICT DO NOTHING;

  INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
       VALUES (_h, 'Fiktiv Testsson', 'SE')
    ON CONFLICT (holder_user_id) DO UPDATE
       SET display_name = 'Fiktiv Testsson', jurisdiction_code = 'SE',
           sub_jurisdiction_code = NULL, privacy_mode = 'full_name';

  -- One verified Swedish credential, so the credential-vs-holder separation
  -- below has something real to separate.
  INSERT INTO public.sp_claims (
    id, holder_user_id, claim_type, credential_code, title,
    claimed_issuer_name, jurisdiction_code, issued_on, assertion_level,
    lifecycle_state, verified_by_user_id, verified_at)
  VALUES (gen_random_uuid(), _h, 'training', 'VU1', 'Väktarutbildning 1',
          'BYA', 'SE', '2025-01-01', 'verified', 'active',
          _v, now())
  RETURNING id INTO _c;

  INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash, expires_at)
       VALUES (_h, 'public_card', encode(digest('fd01-test-token','sha256'),'hex'),
               now() + interval '30 days')
  RETURNING id INTO _d;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- the holder payload carries country AND emirate';
  -- =====================================================================

  _p := public.sp_disclosure_payload(_d);
  IF NOT (_p ? 'sub_jurisdiction') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 the holder payload has no sub_jurisdiction key';
  END IF;
  RAISE NOTICE 'ok  1.1 the holder object carries a sub_jurisdiction key';

  -- Sweden: a country and NO emirate. Nothing may be invented.
  IF _p->>'jurisdiction' <> 'SE' OR _p->>'sub_jurisdiction' IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 Sweden produced % / %',
      _p->>'jurisdiction', _p->>'sub_jurisdiction';
  END IF;
  RAISE NOTICE 'ok  1.2 Sweden       -> jurisdiction SE, sub_jurisdiction null';

  UPDATE public.sp_passport_profiles SET jurisdiction_code = 'GB' WHERE holder_user_id = _h;
  _p := public.sp_disclosure_payload(_d);
  IF _p->>'jurisdiction' <> 'GB' OR _p->>'sub_jurisdiction' IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 the UK produced % / %',
      _p->>'jurisdiction', _p->>'sub_jurisdiction';
  END IF;
  RAISE NOTICE 'ok  1.3 UK           -> jurisdiction GB, sub_jurisdiction null';

  -- Dubai: the case the whole migration exists for.
  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-DU'
   WHERE holder_user_id = _h;
  _p := public.sp_disclosure_payload(_d);
  IF _p->>'jurisdiction' <> 'AE' OR _p->>'sub_jurisdiction' <> 'AE-DU' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.4 Dubai produced % / %',
      _p->>'jurisdiction', _p->>'sub_jurisdiction';
  END IF;
  RAISE NOTICE 'ok  1.4 Dubai        -> jurisdiction AE, sub_jurisdiction AE-DU';

  -- The rest of the UAE keeps its distinction: a country with no emirate is
  -- not silently promoted to Dubai.
  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'AE', sub_jurisdiction_code = NULL
   WHERE holder_user_id = _h;
  _p := public.sp_disclosure_payload(_d);
  IF _p->>'jurisdiction' <> 'AE' OR _p->>'sub_jurisdiction' IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.5 UAE-other produced % / %',
      _p->>'jurisdiction', _p->>'sub_jurisdiction';
  END IF;
  RAISE NOTICE 'ok  1.5 UAE (other)  -> jurisdiction AE, sub_jurisdiction null';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- a credential keeps its OWN jurisdiction';
  -- =====================================================================

  -- The holder is in Dubai; the credential is Swedish. A recipient who reads
  -- the credential as a UAE credential is the failure this separation prevents.
  UPDATE public.sp_passport_profiles
     SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-DU'
   WHERE holder_user_id = _h;
  _p := public.sp_disclosure_payload(_d);

  IF (_p->'verified_claims'->0->>'jurisdiction') <> 'SE' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.1 the Swedish credential reported %',
      _p->'verified_claims'->0->>'jurisdiction';
  END IF;
  RAISE NOTICE 'ok  2.1 a Dubai-based holder''s Swedish credential still says SE';

  IF (_p->'verified_claims'->0->>'sub_jurisdiction') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 the credential inherited an emirate';
  END IF;
  RAISE NOTICE 'ok  2.2 and the holder''s emirate did not leak onto it';

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- nothing else about the disclosure moved';
  -- =====================================================================

  -- The public card must still withhold the exact protected object. This is
  -- the boundary the migration was forbidden to touch.
  IF (_p->'verified_claims'->0 ? 'scope_limited') IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 scope_limited disappeared from the payload';
  END IF;
  RAISE NOTICE 'ok  3.1 the scope-limited flag is still emitted';

  IF (_p ? 'holder_note') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 holder_note reached a disclosure';
  END IF;
  RAISE NOTICE 'ok  3.2 holder_note is still absent, as it always has been';

  -- Stating a work country opens no market, whatever the payload now says.
  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.3 expected exactly one active market, found %', _n;
  END IF;
  RAISE NOTICE 'ok  3.3 exactly one market is open, and it is still Sweden only';

  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'AE-DU') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.4 the Dubai market pack became active';
  END IF;
  RAISE NOTICE 'ok  3.4 a Dubai holder on a disclosure did not open Dubai';

  DELETE FROM public.sp_disclosures WHERE id = _d;
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;
  DELETE FROM public.sp_passport_profiles WHERE holder_user_id = _h;
  DELETE FROM auth.users WHERE id IN (_h, _v);

  RAISE NOTICE 'security_passport_disclosure_holder_jurisdiction_test: all assertions passed';
END $$;
