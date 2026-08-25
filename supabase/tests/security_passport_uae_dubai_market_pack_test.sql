-- Security Passport — Dubai (SIRA) market pack assertions.
--
-- Three things this pack must never do, each asserted by attempting it:
--
--   1. present a Dubai credential as valid anywhere else in the UAE;
--   2. turn a completed SIRA course into a licensed professional title;
--   3. store anything about the medical or conduct checks behind a card.
--
-- Like the UK suite, most of this has to switch the pack on to test it. GROUP 1
-- proves it ships off and GROUP 7 proves the suite put it back.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h uuid := '00000000-0000-0000-0000-00000000fe01';
  _n integer;
  _txt text;
BEGIN
  INSERT INTO auth.users (id) VALUES (_h) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- Dubai ships switched off, and is Dubai only';
  -- =====================================================================

  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'AE-DU') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 the Dubai pack must ship inactive';
  END IF;
  RAISE NOTICE 'ok  1.1 the Dubai market pack is inactive and unreviewed';

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'AE-DU' AND is_active) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 a Dubai credential is switched on';
  END IF;
  RAISE NOTICE 'ok  1.2 every Dubai credential is individually inactive as well';

  -- Every row is pinned to the emirate, so none of it can be recorded as
  -- national even if a caller supplies AE with no sub-jurisdiction.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'AE-DU'
                AND (sub_jurisdiction_code IS DISTINCT FROM 'AE-DU'
                     OR jurisdiction_code IS DISTINCT FROM 'AE')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 a Dubai credential is not pinned to AE-DU';
  END IF;
  RAISE NOTICE 'ok  1.3 every Dubai credential is pinned to the emirate, not the country';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- opening Dubai does not open the UAE';
  -- =====================================================================
  UPDATE public.sp_market_packs
     SET legal_review_state = 'approved',
         legal_reviewed_by = 'suite: Dubai pack test',
         legal_reviewed_on = current_date,
         is_active = true
   WHERE code = 'AE-DU';
  UPDATE public.sp_credential_types SET is_active = true WHERE market_pack_code = 'AE-DU';
  UPDATE public.sp_professional_titles SET is_active = true WHERE market_pack_code = 'AE-DU';

  -- The card records normally in Dubai.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     sub_jurisdiction_code, claimed_issuer_name, valid_until,
     credential_reference, authorisation_scope)
  VALUES (_h, 'licence', 'SIRA Security Cadre Card — Security Guard', 'AE_DU_SIRA_CARD_GUARD', 'AE',
          'AE-DU', 'Security Industry Regulatory Agency', current_date + 700,
          'SIRA-2026-004417', 'Fictional Security Services LLC');
  RAISE NOTICE 'ok  2.1 POSITIVE CONTROL a Dubai cadre card records normally';

  -- With the pack live, a UAE claim with no emirate is STILL refused. This is
  -- the assertion that matters most in the whole suite: activating Dubai must
  -- not activate the country.
  --
  -- The probe names a CREDENTIAL_CODE, and from 20260910090000 that is
  -- load-bearing. The market gate governs which REGULATED credentials may be
  -- registered; it used to run on every claim carrying a jurisdiction, which
  -- is how a British driving licence became unrecordable because the UK
  -- SECURITY pack is unreviewed. What must never soften is this: a SIRA cadre
  -- card cannot be recorded as UAE-wide, and it still cannot.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, authorisation_scope)
    VALUES (_h, 'licence', 'SIRA Security Cadre Card — Security Guard',
            'AE_DU_SIRA_CARD_GUARD', 'AE', 'SIRA', current_date + 700,
            'Fictional Security Services LLC');
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 a UAE-wide claim was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_REQUIRED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 2.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  2.2 MUTATION: opening Dubai does not make the UAE a jurisdiction';
  END;

  -- And the other six emirates remain unsupported, distinguishably.
  FOR _txt IN SELECT code FROM public.sp_sub_jurisdictions
               WHERE jurisdiction_code = 'AE' AND code <> 'AE-DU' LOOP
    BEGIN
      INSERT INTO public.sp_claims
        (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
         sub_jurisdiction_code, claimed_issuer_name, valid_until, authorisation_scope)
      VALUES (_h, 'licence', 'SIRA Security Cadre Card — Security Guard',
              'AE_DU_SIRA_CARD_GUARD', 'AE', _txt,
              'SIRA', current_date + 700, 'Fictional Security Services LLC');
      RAISE EXCEPTION 'ASSERTION FAILED: 2.3 % was accepted', _txt;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE 'ok  2.3 MUTATION: all six other emirates are still refused as unsupported';

  -- A Dubai credential cannot be filed against another emirate either.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name, valid_until, authorisation_scope)
    VALUES (_h, 'licence', 'SIRA Security Cadre Card — Security Guard', 'AE_DU_SIRA_CARD_GUARD', 'AE',
            'AE-AZ', 'SIRA', current_date + 700, 'Fictional LLC');
    RAISE EXCEPTION 'ASSERTION FAILED: 2.4 a Dubai card was filed against Abu Dhabi';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  2.4 a SIRA cadre card cannot be recorded for another emirate';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- the card is not the courses';
  -- =====================================================================

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE market_pack_code = 'AE-DU' AND category = 'qualification';
  IF _n < 6 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 expected the training set, found %', _n;
  END IF;
  RAISE NOTICE 'ok  3.1 % Dubai training credentials exist separately from the card', _n;

  IF EXISTS (
    SELECT 1 FROM public.sp_professional_titles t
     WHERE t.market_pack_code = 'AE-DU' AND t.output_kind = 'active_title'
       AND EXISTS (
         SELECT 1 FROM unnest(t.requires_credential_codes) AS c(code)
          JOIN public.sp_credential_types ct ON ct.code = c.code
         WHERE ct.category = 'qualification')
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 a Dubai title rests on a course';
  END IF;
  RAISE NOTICE 'ok  3.2 MUTATION: completing every SIRA course produces no professional title';

  -- Somebody who holds all five courses and no card records five completions
  -- and nothing more. Recorded here as data rather than derived, because the
  -- engine assertions live in scripts/passport-identity-engine-check.ts.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     sub_jurisdiction_code, claimed_issuer_name)
  SELECT _h, 'training', ct.name_en, ct.code, 'AE', 'AE-DU', 'Certified Training Centre LLC'
    FROM public.sp_credential_types ct
   WHERE ct.market_pack_code = 'AE-DU' AND ct.claim_type = 'training';
  RAISE NOTICE 'ok  3.3 POSITIVE CONTROL every SIRA course records on its own';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- the card says which company, and for how long';
  -- =====================================================================

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name, valid_until, credential_reference)
    VALUES (_h, 'licence', 'SIRA Security Cadre Card — Security Supervisor', 'AE_DU_SIRA_CARD_SUPERVISOR', 'AE',
            'AE-DU', 'SIRA', current_date + 700, 'SIRA-2026-004418');
    RAISE EXCEPTION 'ASSERTION FAILED: 4.1 a cadre card with no employing company was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_REQUIRES_SCOPE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 4.1 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  4.1 a cadre card must name the licensed company it is tied to';
  END;

  IF (SELECT typical_validity_months FROM public.sp_credential_types
       WHERE code = 'AE_DU_SIRA_CARD_GUARD') <> 24 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.2 the published two-year validity is not recorded';
  END IF;
  RAISE NOTICE 'ok  4.2 the published two-year cadre validity is recorded as a hint';

  -- The hint must never have been turned into a stored expiry.
  IF EXISTS (SELECT 1 FROM public.sp_claims
              WHERE holder_user_id = _h AND credential_code = 'AE_DU_SIRA_CARD_GUARD'
                AND valid_until <> current_date + 700) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.3 a validity hint overwrote the stated expiry';
  END IF;
  RAISE NOTICE 'ok  4.3 MUTATION: the hint never overrides the date the card itself states';

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- nothing about the checks behind a card is storable';
  -- =====================================================================

  IF (SELECT narrow_result_only FROM public.sp_credential_types
       WHERE code = 'AE_DU_FITNESS_CHECKED') IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.1 the fitness check must be narrow-result-only';
  END IF;
  RAISE NOTICE 'ok  5.1 the fitness requirement is a narrow result';

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name, holder_note)
    VALUES (_h, 'certification', 'Fitness requirement checked', 'AE_DU_FITNESS_CHECKED',
            'AE', 'AE-DU', 'Approved Clinic LLC',
            'Passed despite noted blood pressure finding');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.2 a medical note was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_NARROW_RESULT_ONLY%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 5.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  5.2 MUTATION: no medical detail can be attached to the fitness check';
  END;

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name)
    VALUES (_h, 'certification', 'Medically cleared after review', 'AE_DU_FITNESS_CHECKED',
            'AE', 'AE-DU', 'Approved Clinic LLC');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.3 a free-text medical title was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  5.3 MUTATION: the title must be the controlled label, not a finding';
  END;

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     sub_jurisdiction_code, claimed_issuer_name)
  VALUES (_h, 'certification', 'Fitness requirement checked', 'AE_DU_FITNESS_CHECKED',
          'AE', 'AE-DU', 'Approved Clinic LLC');
  RAISE NOTICE 'ok  5.4 POSITIVE CONTROL the checked result itself records normally';

  -- A fitness check derives NOTHING. It is a recorded fact, not a status:
  -- passing a medical does not permit anybody to work, and the card is what
  -- does. An earlier draft had it produce local_eligibility and the Swedish
  -- suite's global invariant caught it.
  IF (SELECT contributes_to FROM public.sp_credential_types
       WHERE code = 'AE_DU_FITNESS_CHECKED') <> ARRAY[]::text[] THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.6 the fitness check derives a status';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE requires_credential_codes @> ARRAY['AE_DU_FITNESS_CHECKED']::text[]) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.7 a derivation rule rests on the fitness check';
  END IF;
  RAISE NOTICE 'ok  5.6 MUTATION: passing a medical derives no eligibility and no title';
  RAISE NOTICE 'ok  5.7 and no derivation rule anywhere names it';

  -- The schema simply has nowhere to put the rest.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'sp_claims'
                AND column_name ~* 'emirates_id|visa|conduct|criminal|medical|health') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.5 sp_claims grew a column for prohibited data';
  END IF;
  RAISE NOTICE 'ok  5.5 sp_claims has no column for an Emirates ID, visa, conduct or health data';

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- Arabic is absent rather than invented';
  -- =====================================================================

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'AE-DU' AND name_ar IS NOT NULL) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.1 an unreviewed Arabic label was shipped';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE market_pack_code = 'AE-DU' AND name_ar IS NOT NULL) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.2 an unreviewed Arabic title was shipped';
  END IF;
  RAISE NOTICE 'ok  6.1 no Arabic credential label ships without a competent reviewer';
  RAISE NOTICE 'ok  6.2 and no Arabic title either — the engine falls back to English';

  -- Every title says Dubai out loud, so a reader cannot take one for a
  -- national or portable licence.
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles
              WHERE market_pack_code = 'AE-DU' AND output_kind = 'active_title'
                AND name_en NOT LIKE '%Dubai%') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.3 a Dubai title does not name Dubai';
  END IF;
  RAISE NOTICE 'ok  6.3 every Dubai title names the emirate in its own label';

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- the suite puts the pack back the way it found it';
  -- =====================================================================
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;

  UPDATE public.sp_professional_titles SET is_active = false WHERE market_pack_code = 'AE-DU';
  UPDATE public.sp_credential_types SET is_active = false WHERE market_pack_code = 'AE-DU';
  UPDATE public.sp_market_packs
     SET is_active = false, legal_review_state = 'pending',
         legal_reviewed_by = NULL, legal_reviewed_on = NULL
   WHERE code = 'AE-DU';

  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'AE-DU') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 7.1 the suite left the Dubai pack switched on';
  END IF;
  RAISE NOTICE 'ok  7.1 the Dubai pack is inactive and unreviewed again';
END $$;
