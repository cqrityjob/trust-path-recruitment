-- Security Passport — United Kingdom (SIA) market pack assertions.
--
-- The pack ships switched off, so most of this suite has to switch it on to
-- test it and switch it back afterwards. That is deliberate and is itself
-- asserted: GROUP 1 proves nothing can be recorded while the pack is
-- unreviewed, and GROUP 6 proves the suite left it that way.
--
-- The mistake the whole pack exists to prevent is asserted directly: passing
-- the training the SIA requires must never produce a licensed title.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h uuid := '00000000-0000-0000-0000-00000000fd01';
  _n integer;
  _txt text;
BEGIN
  INSERT INTO auth.users (id) VALUES (_h) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- the pack ships switched off, twice over';
  -- =====================================================================

  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'GB') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 the GB pack must ship inactive';
  END IF;
  IF (SELECT legal_review_state FROM public.sp_market_packs WHERE code = 'GB') <> 'pending' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 the GB pack must ship pending review';
  END IF;
  RAISE NOTICE 'ok  1.1 the GB market pack is inactive';
  RAISE NOTICE 'ok  1.2 and its regulatory content is recorded as unreviewed';

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'GB' AND is_active) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 a UK credential is switched on';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE market_pack_code = 'GB' AND is_active) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.4 a UK derivation rule is switched on';
  END IF;
  RAISE NOTICE 'ok  1.3 every UK credential is individually inactive as well';
  RAISE NOTICE 'ok  1.4 and so is every UK derivation rule';

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, credential_reference)
    VALUES (_h, 'licence', 'SIA Door Supervisor', 'UK_SIA_LICENCE_DS', 'GB',
            'Security Industry Authority', current_date + 365, '1234567812345678');
    RAISE EXCEPTION 'ASSERTION FAILED: 1.5 an unreviewed market accepted a claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_MARKET_PACK_NOT_ACTIVE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 1.5 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  1.5 no UK credential can be recorded until the pack is reviewed';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- with the pack open, a licence and a course differ';
  -- =====================================================================
  -- Switching on exactly as a reviewer would, so the rest of the suite tests
  -- the pack the product would actually ship.
  UPDATE public.sp_market_packs
     SET legal_review_state = 'approved',
         legal_reviewed_by = 'suite: UK pack test',
         legal_reviewed_on = current_date,
         is_active = true
   WHERE code = 'GB';
  UPDATE public.sp_credential_types SET is_active = true WHERE market_pack_code = 'GB';
  UPDATE public.sp_professional_titles SET is_active = true WHERE market_pack_code = 'GB';

  IF (SELECT count(DISTINCT category) FROM public.sp_credential_types
       WHERE market_pack_code = 'GB') <> 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.1 the pack must carry both categories';
  END IF;
  IF (SELECT category FROM public.sp_credential_types WHERE code = 'UK_SIA_LICENCE_DS')
     <> 'appointment' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 an SIA licence must be an appointment';
  END IF;
  IF (SELECT category FROM public.sp_credential_types WHERE code = 'UK_SIA_QUAL_DS')
     <> 'qualification' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.3 the qualification must be a qualification';
  END IF;
  RAISE NOTICE 'ok  2.1 licences and qualifications are separate credential types';
  RAISE NOTICE 'ok  2.2 an SIA licence is an appointment: time-limited, granted by the SIA';
  RAISE NOTICE 'ok  2.3 the training behind it is a qualification';

  -- THE assertion. A qualification must not be able to feed a title, whatever
  -- the derivation rules later say.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'GB' AND category = 'qualification'
                AND contributes_to && ARRAY['local_eligibility','active_title']::text[]) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.4 a UK qualification can feed eligibility or a title';
  END IF;
  RAISE NOTICE 'ok  2.4 MUTATION: no UK qualification feeds eligibility or an active title';

  IF EXISTS (
    SELECT 1 FROM public.sp_professional_titles t
     WHERE t.market_pack_code = 'GB'
       AND t.output_kind IN ('active_title', 'local_eligibility')
       AND EXISTS (
         SELECT 1 FROM unnest(t.requires_credential_codes) AS c(code)
          JOIN public.sp_credential_types ct ON ct.code = c.code
         WHERE ct.category = 'qualification')
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.5 a UK title rests on a qualification';
  END IF;
  RAISE NOTICE 'ok  2.5 MUTATION: passing the SIA training never produces a licensed title';

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- one licence, one activity';
  -- =====================================================================

  SELECT count(*) INTO _n FROM public.sp_regulated_roles WHERE market_pack_code = 'GB';
  IF _n < 7 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 expected the seven licensable activities, found %', _n;
  END IF;
  RAISE NOTICE 'ok  3.1 all % licensable activities are modelled separately', _n;

  -- Every licence names exactly one activity, so "is this person licensed for
  -- CCTV" is a join rather than a string comparison against typed text.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'GB' AND category = 'appointment'
                AND regulated_role_id IS NULL) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 an SIA licence names no activity';
  END IF;
  RAISE NOTICE 'ok  3.2 every SIA licence names exactly one licensable activity';

  -- Non-front-line grants eligibility but no professional title: it is not a
  -- licence to perform a front-line activity.
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE output_kind = 'active_title'
                AND requires_credential_codes @> ARRAY['UK_SIA_LICENCE_NFL']::text[]) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.3 non-front-line produces a professional title';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_professional_titles
                  WHERE output_kind = 'local_eligibility'
                    AND requires_credential_codes @> ARRAY['UK_SIA_LICENCE_NFL']::text[]) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.4 non-front-line grants no eligibility either';
  END IF;
  RAISE NOTICE 'ok  3.3 MUTATION: a non-front-line licence produces no front-line title';
  RAISE NOTICE 'ok  3.4 POSITIVE CONTROL it does still produce its own eligibility';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- the licence number is sixteen digits, enforced';
  -- =====================================================================

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, credential_reference)
    VALUES (_h, 'licence', 'SIA Door Supervisor', 'UK_SIA_LICENCE_DS', 'GB',
            'Security Industry Authority', current_date + 365, '12345');
    RAISE EXCEPTION 'ASSERTION FAILED: 4.1 a five-digit licence number was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_REFERENCE_FORMAT%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 4.1 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  4.1 a malformed SIA licence number is refused';
  END;

  -- The format binds a DRAFT too: eight digits in a sixteen-digit field is
  -- wrong when it is stored, not when it is submitted.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       credential_reference, lifecycle_state)
    VALUES (_h, 'licence', 'SIA Door Supervisor', 'UK_SIA_LICENCE_DS', 'GB',
            'ABCD567812345678', 'draft');
    RAISE EXCEPTION 'ASSERTION FAILED: 4.2 a non-numeric licence number was accepted in a draft';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  4.2 the format binds drafts too, so the holder is told immediately';
  END;

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, credential_reference)
  VALUES (_h, 'licence', 'SIA Door Supervisor', 'UK_SIA_LICENCE_DS', 'GB',
          'Security Industry Authority', current_date + 365, '1234567812345678');
  RAISE NOTICE 'ok  4.3 POSITIVE CONTROL a real sixteen-digit licence number stores';

  -- A qualification has no such pattern: a certificate number is whatever the
  -- awarding organisation prints.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, credential_reference)
  VALUES (_h, 'training', 'Level 2 Award for Door Supervisors', 'UK_SIA_QUAL_DS', 'GB',
          'Approved Training Provider Ltd', 'AO/2026/DS/00417');
  RAISE NOTICE 'ok  4.4 a qualification certificate number is not forced into that shape';

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- nothing crosses a market, in either direction';
  -- =====================================================================

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, credential_reference)
    VALUES (_h, 'licence', 'SIA licence in Sweden', 'UK_SIA_LICENCE_DS', 'SE',
            'Security Industry Authority', current_date + 365, '1234567812345678');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.1 a British licence was filed as Swedish';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  5.1 a British licence cannot be recorded in Sweden';
  END;

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code)
    VALUES (_h, 'training', 'VU1 in Britain', 'VU1', 'GB');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.2 a Swedish credential was filed as British';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  5.2 and a Swedish credential cannot be recorded in the UK';
  END;

  -- No rule anywhere may name credentials from two markets.
  IF EXISTS (
    SELECT 1 FROM public.sp_professional_titles t
     WHERE EXISTS (
       SELECT 1 FROM unnest(t.requires_credential_codes) AS c(code)
        JOIN public.sp_credential_types ct ON ct.code = c.code
       WHERE ct.market_pack_code IS DISTINCT FROM t.market_pack_code)
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.3 a derivation rule reaches across markets';
  END IF;
  RAISE NOTICE 'ok  5.3 no derivation rule anywhere names a foreign credential';

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- the suite puts the pack back the way it found it';
  -- =====================================================================
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;

  UPDATE public.sp_professional_titles SET is_active = false WHERE market_pack_code = 'GB';
  UPDATE public.sp_credential_types SET is_active = false WHERE market_pack_code = 'GB';
  UPDATE public.sp_market_packs
     SET is_active = false, legal_review_state = 'pending',
         legal_reviewed_by = NULL, legal_reviewed_on = NULL
   WHERE code = 'GB';

  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'GB')
     OR EXISTS (SELECT 1 FROM public.sp_credential_types
                 WHERE market_pack_code = 'GB' AND is_active) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.1 the suite left the UK pack switched on';
  END IF;
  RAISE NOTICE 'ok  6.1 the UK pack is inactive and unreviewed again';
END $$;
