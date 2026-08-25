-- Security Passport — jurisdiction-first credential catalogue assertions.
--
-- The defect this suite exists to keep closed, in one sentence: a candidate
-- whose credential jurisdiction is the United Kingdom must never be offered
-- VU1, VU2, Ordningsvakt or Skyddsvakt.
--
-- ── WHY THE CATALOGUE QUERY IS ASSERTED HERE AND NOT IN A COMPONENT ────
--
-- The read filter lives in a server function and the write refusal lives in a
-- database trigger. A React test could only prove the first, and the first is
-- the half an attacker skips. So this suite asserts the PARTITION as a
-- property of the data (GROUPS 1-5) and the REFUSAL as a property of the
-- trigger (GROUPS 6-7), for every caller including service_role.
--
-- The partition is expressed exactly as listCredentialCatalogue expresses it:
-- resolve the market pack from (jurisdiction, sub-jurisdiction), then take the
-- credentials belonging to that pack. If those two ever disagree, one of them
-- is a bug — asserting the same shape is the point.
--
-- ── WHY THIS SUITE SWITCHES PACKS ON ───────────────────────────────────
--
-- GB, GB-NI, AE-DU and AE-AZ all ship inactive pending legal review, and this
-- change does NOT activate them. But "a Swedish credential cannot be filed
-- under a British claim" must be true for a reason better than "the British
-- market is switched off" — otherwise the guarantee evaporates on the day a
-- reviewer approves the pack.
--
-- So GROUP 7 switches the packs on inside the transaction, proves the
-- cross-jurisdiction refusals still fire with the market gate out of the way,
-- and switches them back. GROUP 8 asserts it switched them back.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h   uuid := '00000000-0000-0000-0000-00000000fc01';
  _n   integer;
  _txt text;


BEGIN
  INSERT INTO auth.users (id) VALUES (_h) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- Sweden is complete and is Sweden only';
  -- =====================================================================

  -- Every Swedish credential the product ships. Named individually rather
  -- than counted, so losing one is a failure with a name in it.
  FOR _txt IN SELECT unnest(ARRAY[
        'VU1', 'VU2', 'OV', 'SV',
        'OV_TRAINING', 'OV_REFRESHER', 'OV_TRANSPORT', 'SE_PERSONNEL_APPROVAL'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sp_credential_types
                    WHERE code = _txt AND market_pack_code = 'SE'
                      AND jurisdiction_code = 'SE') THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: 1.1 % is missing from the Swedish catalogue', _txt;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  1.1 all eight Swedish credentials are in the SE catalogue';

  -- The screenshot defect, asserted directly.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'SE'
                AND (code LIKE 'UK\_%' OR code LIKE 'AE\_%')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 a foreign credential is in the Swedish catalogue';
  END IF;
  RAISE NOTICE 'ok  1.2 no SIA and no SIRA credential appears under Sweden';

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE code IN ('VU1','VU2','OV','SV') AND jurisdiction_code <> 'SE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 a Swedish credential claims another jurisdiction';
  END IF;
  RAISE NOTICE 'ok  1.3 every Swedish credential is jurisdiction SE and nothing else';

  -- Sweden is the one market with no sub-jurisdiction, and a claim in it must
  -- never be asked for one.
  IF EXISTS (SELECT 1 FROM public.sp_market_packs
              WHERE jurisdiction_code = 'SE' AND sub_jurisdiction_code IS NOT NULL) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.4 Sweden has acquired a sub-jurisdiction pack';
  END IF;
  RAISE NOTICE 'ok  1.4 Sweden is a national market and asks for no region';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- the United Kingdom shows SIA and only SIA';
  -- =====================================================================

  FOR _txt IN SELECT unnest(ARRAY[
        'UK_SIA_LICENCE_SG', 'UK_SIA_LICENCE_DS', 'UK_SIA_LICENCE_CCTV',
        'UK_SIA_LICENCE_CP', 'UK_SIA_LICENCE_CVIT', 'UK_SIA_LICENCE_KH',
        'UK_SIA_LICENCE_NFL'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sp_credential_types
                    WHERE code = _txt AND market_pack_code = 'GB'
                      AND jurisdiction_code = 'GB'
                      AND sub_jurisdiction_code IS NULL) THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: 2.1 % is missing from the GB national catalogue', _txt;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  2.1 all seven Great Britain SIA licence sectors are catalogued';

  -- Training and licence are separate objects. Asserted as a count of ROWS,
  -- because the failure mode is somebody merging them into one row with a flag.
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE market_pack_code = 'GB' AND claim_type = 'training';
  IF _n <> 6 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 2.2 expected 6 GB licence-linked qualifications, found %', _n;
  END IF;
  RAISE NOTICE 'ok  2.2 the licence-linked qualifications are six separate credentials';

  -- Key holding must NOT have one. The SIA does not require a licence-linked
  -- qualification for it, and inventing one to make the pack look symmetrical
  -- would invent a training requirement.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types WHERE code = 'UK_SIA_QUAL_KH') THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 2.3 key holding has acquired a licence-linked qualification';
  END IF;
  RAISE NOTICE 'ok  2.3 key holding has no invented licence-linked qualification';

  -- No licence row may be reachable from a training credential's title rule.
  IF EXISTS (
    SELECT 1 FROM public.sp_professional_titles t
     WHERE t.market_pack_code = 'GB'
       AND t.output_kind IN ('local_eligibility', 'active_title')
       AND EXISTS (SELECT 1 FROM public.sp_credential_types c
                    WHERE c.code = ANY (t.requires_credential_codes)
                      AND c.claim_type = 'training')
  ) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 2.4 a UK qualification produces a licensed status';
  END IF;
  RAISE NOTICE 'ok  2.4 passing SIA training never produces a licensed title';

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code IN ('GB', 'GB-NI')
                AND code IN ('VU1','VU2','OV','SV','OV_TRAINING','OV_REFRESHER',
                             'OV_TRANSPORT','SE_PERSONNEL_APPROVAL')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.5 a Swedish credential is in the UK catalogue';
  END IF;
  RAISE NOTICE 'ok  2.5 VU1, VU2, Ordningsvakt and Skyddsvakt are absent from the UK';

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code IN ('GB', 'GB-NI') AND code LIKE 'AE\_%') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.6 a SIRA credential is in the UK catalogue';
  END IF;
  RAISE NOTICE 'ok  2.6 no SIRA or Abu Dhabi credential appears under the UK';

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- Northern Ireland is its own licensing territory';
  -- =====================================================================

  IF NOT EXISTS (SELECT 1 FROM public.sp_credential_types
                  WHERE code = 'UK_SIA_LICENCE_VI'
                    AND market_pack_code = 'GB-NI'
                    AND jurisdiction_code = 'GB'
                    AND sub_jurisdiction_code = 'GB-NI') THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 3.1 the vehicle immobilisation licence is not scoped to GB-NI';
  END IF;
  RAISE NOTICE 'ok  3.1 vehicle immobilisation is a Northern Ireland credential';

  SELECT count(*) INTO _n FROM public.sp_credential_types WHERE market_pack_code = 'GB-NI';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 expected 1 GB-NI credential, found %', _n;
  END IF;
  RAISE NOTICE 'ok  3.2 and it is the only one, so GB-NI never mirrors Great Britain';

  -- The national market must still resolve without a region. This is the
  -- assertion that would catch GB-NI accidentally turning the UK into a
  -- sub-jurisdiction market like the UAE.
  IF NOT EXISTS (SELECT 1 FROM public.sp_market_packs
                  WHERE jurisdiction_code = 'GB' AND sub_jurisdiction_code IS NULL) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 3.3 the UK lost its national pack and now requires a region';
  END IF;
  RAISE NOTICE 'ok  3.3 a UK holder is still not forced to name a region';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- Dubai is SIRA, in full, and is not the UAE';
  -- =====================================================================

  FOR _txt IN SELECT unnest(ARRAY[
        'AE_DU_SIRA_CARD_GUARD', 'AE_DU_SIRA_CARD_SUPERVISOR',
        'AE_DU_SIRA_CARD_OPS_MANAGER', 'AE_DU_SIRA_CARD_SECURITY_MANAGER',
        'AE_DU_SIRA_CARD_HEAD_OF_SECURITY', 'AE_DU_SIRA_CARD_MONEY_TRANSPORT',
        'AE_DU_SIRA_CARD_EVENT_GUARD', 'AE_DU_SIRA_CARD_BODYGUARD',
        'AE_DU_SIRA_CARD_WATCHMAN', 'AE_DU_SIRA_CARD_SYSTEMS_OPERATOR',
        'AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN', 'AE_DU_SIRA_CARD_SYSTEMS_ENGINEER',
        'AE_DU_SIRA_CARD_TRAINER', 'AE_DU_SIRA_CARD_EXPERT',
        'AE_DU_SIRA_CARD_CONSULTANT'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sp_credential_types
                    WHERE code = _txt AND market_pack_code = 'AE-DU'
                      AND jurisdiction_code = 'AE'
                      AND sub_jurisdiction_code = 'AE-DU') THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: 4.1 % is missing from the Dubai cadre catalogue', _txt;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  4.1 all fifteen SIRA Security Cadre categories are catalogued';

  -- Every card is scoped to the emirate. A cadre card with a NULL
  -- sub-jurisdiction would be storable as a UAE-wide credential.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'AE-DU' AND sub_jurisdiction_code IS DISTINCT FROM 'AE-DU') THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 4.2 a Dubai credential is not scoped to the emirate';
  END IF;
  RAISE NOTICE 'ok  4.2 no Dubai credential can be stored as UAE-wide';

  -- The courses are not the cards.
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE market_pack_code = 'AE-DU' AND claim_type = 'training';
  IF _n <> 14 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.3 expected 14 SIRA courses, found %', _n;
  END IF;
  RAISE NOTICE 'ok  4.3 the SIRA courses are fourteen credentials separate from the cards';

  IF EXISTS (
    SELECT 1 FROM public.sp_professional_titles t
     WHERE t.market_pack_code = 'AE-DU'
       AND t.output_kind IN ('local_eligibility', 'active_title')
       AND EXISTS (SELECT 1 FROM public.sp_credential_types c
                    WHERE c.code = ANY (t.requires_credential_codes)
                      AND c.claim_type = 'training')
  ) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 4.4 a SIRA course produces a licensed status';
  END IF;
  RAISE NOTICE 'ok  4.4 completing a SIRA course never produces a cadre title';

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'AE-DU'
                AND (code IN ('VU1','VU2','OV','SV') OR code LIKE 'UK\_%')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.5 a Swedish or SIA credential is in the Dubai catalogue';
  END IF;
  RAISE NOTICE 'ok  4.5 no Swedish and no SIA credential appears under Dubai';

  -- Nothing may translate a SIRA category into a Swedish or British one.
  IF EXISTS (SELECT 1 FROM public.sp_professional_titles t
              WHERE t.market_pack_code = 'AE-DU'
                AND (t.name_en ILIKE '%väktare%' OR t.name_en ILIKE '%ordningsvakt%'
                     OR t.name_en ILIKE '%skyddsvakt%' OR t.name_en ILIKE '%SIA%')) THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 4.6 a Dubai title borrows a Swedish or British name';
  END IF;
  RAISE NOTICE 'ok  4.6 a SIRA Security Guard is never described as a Väktare';

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- the UAE is seven emirates, not one market';
  -- =====================================================================

  FOR _txt IN SELECT unnest(ARRAY[
        'AE_AZ_PSBD_LICENCE_GUARD', 'AE_AZ_PSBD_LICENCE_CIT',
        'AE_AZ_PSBD_LICENCE_BANKS', 'AE_AZ_PSBD_LICENCE_EVENT',
        'AE_AZ_PSBD_LICENCE_SUPERVISOR', 'AE_AZ_PSBD_LICENCE_MANAGER',
        'AE_AZ_PSBD_LICENCE_TRAINER'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sp_credential_types
                    WHERE code = _txt AND market_pack_code = 'AE-AZ'
                      AND sub_jurisdiction_code = 'AE-AZ') THEN
      RAISE EXCEPTION
        'ASSERTION FAILED: 5.1 % is missing from the Abu Dhabi catalogue', _txt;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok  5.1 the seven Abu Dhabi PSBD licence categories are catalogued';

  -- Abu Dhabi must never inherit Dubai. This is the assertion that the whole
  -- sub-jurisdiction model exists for.
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'AE-AZ' AND code LIKE 'AE\_DU\_%') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.2 a Dubai credential is in the Abu Dhabi catalogue';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code = 'AE-AZ' AND authority_id =
                    (SELECT id FROM public.sp_authorities WHERE code = 'AE_DU_SIRA')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.3 an Abu Dhabi credential claims SIRA as its regulator';
  END IF;
  RAISE NOTICE 'ok  5.2 Abu Dhabi holds no SIRA credential';
  RAISE NOTICE 'ok  5.3 and names the Ministry of Interior, never SIRA, as its authority';

  -- The five emirates nobody has read a framework for must stay empty.
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE sub_jurisdiction_code IN ('AE-SH','AE-AJ','AE-UQ','AE-RK','AE-FU');
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 5.4 % market pack(s) exist for an unreviewed emirate', _n;
  END IF;
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE sub_jurisdiction_code IN ('AE-SH','AE-AJ','AE-UQ','AE-RK','AE-FU');
  IF _n <> 0 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 5.5 % credential(s) exist for an unreviewed emirate', _n;
  END IF;
  RAISE NOTICE 'ok  5.4 Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah and Fujairah have no pack';
  RAISE NOTICE 'ok  5.5 and no invented credential list';

  -- All seven emirates are nonetheless NAMED, so the UI can say "not supported
  -- yet" instead of pretending the place does not exist.
  SELECT count(*) INTO _n FROM public.sp_sub_jurisdictions WHERE jurisdiction_code = 'AE';
  IF _n <> 7 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 5.6 expected 7 emirates, found %', _n;
  END IF;
  RAISE NOTICE 'ok  5.6 all seven emirates are named so none is silently omitted';

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- the market gate refuses before anything is chosen';
  -- =====================================================================

  BEGIN
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, jurisdiction_code)
    VALUES (_h, 'licence', 'A UAE licence', 'AE');
    RAISE EXCEPTION 'ASSERTION FAILED: 6.1 a UAE-wide claim was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_REQUIRED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 6.1 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  6.1 the UAE cannot be named without an emirate';
  END;

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, jurisdiction_code, sub_jurisdiction_code)
    VALUES (_h, 'licence', 'A Fujairah licence', 'AE', 'AE-FU');
    RAISE EXCEPTION 'ASSERTION FAILED: 6.2 an unsupported emirate was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_NOT_SUPPORTED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 6.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  6.2 Fujairah is refused, and never answered with Dubai';
  END;

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, jurisdiction_code, sub_jurisdiction_code)
    VALUES (_h, 'licence', 'An Abu Dhabi licence', 'AE', 'AE-AZ');
    RAISE EXCEPTION 'ASSERTION FAILED: 6.3 an unreviewed Abu Dhabi pack accepted a claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_MARKET_PACK_NOT_ACTIVE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 6.3 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  6.3 Abu Dhabi is refused as pending review, never as Dubai';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- cross-jurisdiction writes fail with the gate OPEN';
  -- =====================================================================
  -- Every pack is switched on for this group only. Without it, each refusal
  -- below would prove nothing more than "the market is inactive", and the
  -- guarantee would quietly disappear the day a reviewer approves a pack.

  UPDATE public.sp_market_packs
     SET legal_review_state = 'approved',
         legal_reviewed_by = 'suite: jurisdiction catalogue test',
         legal_reviewed_on = current_date,
         is_active = true
   WHERE code IN ('GB', 'GB-NI', 'AE-DU', 'AE-AZ');
  UPDATE public.sp_credential_types SET is_active = true
   WHERE market_pack_code IN ('GB', 'GB-NI', 'AE-DU', 'AE-AZ');

  -- 7.1  GB claim + Swedish VU1
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code)
    VALUES (_h, 'training', 'Väktargrundutbildning', 'VU1', 'GB');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.1 a Swedish VU1 was filed as a UK claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_JURISDICTION_MISMATCH%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.1 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.1 GB claim + VU1 is refused as a jurisdiction mismatch';
  END;

  -- 7.2  AE-DU claim + Swedish Skyddsvakt
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name, valid_until, authorisation_scope)
    VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'AE', 'AE-DU',
            'Länsstyrelsen', current_date + 365, 'Fictional site');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.2 a Swedish skyddsvakt was filed as a Dubai claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_JURISDICTION_MISMATCH%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.2 AE-DU claim + Skyddsvakt is refused';
  END;

  -- 7.3  SE claim + SIA Door Supervision
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, credential_reference)
    VALUES (_h, 'licence', 'SIA Door Supervision', 'UK_SIA_LICENCE_DS', 'SE',
            'Security Industry Authority', current_date + 365, '1234567812345678');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.3 an SIA licence was filed as a Swedish claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_JURISDICTION_MISMATCH%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.3 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.3 SE claim + SIA Door Supervision is refused';
  END;

  -- 7.4  GB claim + SIRA Security Guard
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, authorisation_scope, credential_reference)
    VALUES (_h, 'licence', 'SIRA Security Guard', 'AE_DU_SIRA_CARD_GUARD', 'GB',
            'SIRA', current_date + 700, 'Fictional LLC', 'ABC-1234');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.4 a SIRA cadre card was filed as a UK claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_JURISDICTION_MISMATCH%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.4 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.4 GB claim + SIRA Security Guard is refused';
  END;

  -- 7.5  AE-DU claim + SIA CCTV licence
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name, valid_until, credential_reference)
    VALUES (_h, 'licence', 'SIA CCTV', 'UK_SIA_LICENCE_CCTV', 'AE', 'AE-DU',
            'Security Industry Authority', current_date + 365, '1234567812345678');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.5 an SIA licence was filed as a Dubai claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_JURISDICTION_MISMATCH%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.5 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.5 AE-DU claim + SIA CCTV is refused';
  END;

  -- 7.6  Abu Dhabi claim + a Dubai cadre card. Same country, same country
  -- code, different regulator — the refusal the jurisdiction check alone
  -- cannot make, and the reason sub-jurisdiction exists.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name, valid_until,
       authorisation_scope, credential_reference)
    VALUES (_h, 'licence', 'SIRA card in Abu Dhabi', 'AE_DU_SIRA_CARD_SUPERVISOR',
            'AE', 'AE-AZ', 'SIRA', current_date + 700, 'Fictional LLC', 'ABC-1234');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.6 a Dubai card was filed against Abu Dhabi';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_NOT_SUPPORTED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.6 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.6 a SIRA card cannot be filed against Abu Dhabi';
  END;

  -- 7.7  The mirror: an Abu Dhabi licence filed against Dubai.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       sub_jurisdiction_code, claimed_issuer_name, valid_until, authorisation_scope)
    VALUES (_h, 'licence', 'Abu Dhabi guard licence', 'AE_AZ_PSBD_LICENCE_GUARD',
            'AE', 'AE-DU', 'Ministry of Interior', current_date + 365, 'Fictional LLC');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.7 an Abu Dhabi licence was filed against Dubai';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_NOT_SUPPORTED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.7 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.7 and an Abu Dhabi licence cannot be filed against Dubai';
  END;

  -- 7.8  Northern Ireland's licence cannot be recorded as a Great Britain one.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, credential_reference)
    VALUES (_h, 'licence', 'Vehicle immobilisation', 'UK_SIA_LICENCE_VI', 'GB',
            'Security Industry Authority', current_date + 365, '1234567812345678');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.8 a Northern Ireland licence was filed as Great Britain';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_NOT_SUPPORTED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 7.8 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  7.8 vehicle immobilisation cannot be claimed outside Northern Ireland';
  END;

  -- 7.9  And the one that must still SUCCEED, so the suite is not merely
  -- proving that everything fails.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, credential_reference)
  VALUES (_h, 'licence', 'SIA Licence — Door Supervision', 'UK_SIA_LICENCE_DS', 'GB',
          'Security Industry Authority', current_date + 365, '1234567812345678');
  RAISE NOTICE 'ok  7.9 a genuine SIA door supervision licence in GB is accepted';

  DELETE FROM public.sp_claims WHERE holder_user_id = _h;

  -- =====================================================================
  RAISE NOTICE 'GROUP 8 -- the suite leaves every unreviewed pack switched off';
  -- =====================================================================

  UPDATE public.sp_market_packs
     SET is_active = false, legal_review_state = 'pending',
         legal_reviewed_by = NULL, legal_reviewed_on = NULL
   WHERE code IN ('GB', 'GB-NI', 'AE-DU', 'AE-AZ');
  UPDATE public.sp_credential_types SET is_active = false
   WHERE market_pack_code IN ('GB', 'GB-NI', 'AE-DU', 'AE-AZ');

  IF EXISTS (SELECT 1 FROM public.sp_market_packs
              WHERE code IN ('GB', 'GB-NI', 'AE-DU', 'AE-AZ')
                AND (is_active OR legal_review_state <> 'pending')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.1 the suite left an unreviewed pack switched on';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE market_pack_code IN ('GB', 'GB-NI', 'AE-DU', 'AE-AZ') AND is_active) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.2 the suite left an unreviewed credential switched on';
  END IF;
  RAISE NOTICE 'ok  8.1 every unreviewed market pack is pending and inactive again';
  RAISE NOTICE 'ok  8.2 and so is every credential in one';

  -- Sweden, which was never switched, is still exactly as it was.
  IF NOT (SELECT is_active FROM public.sp_market_packs WHERE code = 'SE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.3 the suite switched Sweden off';
  END IF;
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE market_pack_code = 'SE' AND is_active;
  IF _n <> 8 THEN
    RAISE EXCEPTION
      'ASSERTION FAILED: 8.4 expected 8 active Swedish credentials, found %', _n;
  END IF;
  RAISE NOTICE 'ok  8.3 Sweden is still live';
  RAISE NOTICE 'ok  8.4 with all eight of its credentials selectable';

  DELETE FROM auth.users WHERE id = _h;
END $$;
