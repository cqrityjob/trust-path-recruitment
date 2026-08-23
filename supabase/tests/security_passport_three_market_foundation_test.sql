-- Security Passport — three-market foundation assertions.
--
-- Every market rule is asserted by MUTATION: the suite attempts the thing the
-- rule forbids and fails if the database allows it. A suite that only inserted
-- valid rows would pass just as happily against a schema with no rules at all.
--
-- ── WHY EVERY DENIAL CARRIES A POSITIVE CONTROL ────────────────────────
--
-- "The insert was refused" is worthless on its own: it is equally true of a
-- schema that refuses everything, of a typo in a column name, and of a
-- principal who cannot see the table. So each denial below is paired with the
-- SAME insert differing in exactly the forbidden dimension, which must
-- succeed. A denial that cannot be contrasted has not proved anything.
--
-- The three properties that matter most, asserted explicitly:
--
--   * an unreviewed market pack cannot be switched on (the legal gate);
--   * a UAE claim without an emirate is refused rather than stored as
--     nationally valid;
--   * no title rule can name a credential from another market.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h1 uuid := '00000000-0000-0000-0000-00000000fa01';
  _n  integer;
  _txt text;
BEGIN
  INSERT INTO auth.users (id) VALUES (_h1) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- the four concepts exist and are separate';
  -- =====================================================================

  IF (SELECT count(*) FROM public.sp_jurisdictions WHERE code IN ('SE','GB','AE')) <> 3 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 expected SE, GB and AE jurisdictions';
  END IF;
  RAISE NOTICE 'ok  1.1 three countries are registered';

  -- The country check is unchanged, so 'AE-DU' can never be written where a
  -- reader assumes ISO 3166-1 alpha-2.
  BEGIN
    INSERT INTO public.sp_jurisdictions (code, name_sv, name_en)
    VALUES ('AE-DU', 'Dubai', 'Dubai');
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 a sub-jurisdiction was accepted as a country';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  1.2 a sub-jurisdiction cannot be stored as a country';
  END;

  IF (SELECT count(*) FROM public.sp_sub_jurisdictions WHERE jurisdiction_code = 'AE') <> 7 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 expected all seven emirates to be listed';
  END IF;
  IF (SELECT count(*) FROM public.sp_sub_jurisdictions
       WHERE jurisdiction_code = 'AE' AND is_active) <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.4 exactly one emirate must be supported';
  END IF;
  RAISE NOTICE 'ok  1.3 all seven emirates are listed rather than omitted';
  RAISE NOTICE 'ok  1.4 exactly one emirate (Dubai) is active';

  -- An emirate cannot be filed under the wrong country.
  BEGIN
    INSERT INTO public.sp_sub_jurisdictions (code, jurisdiction_code, name_sv, name_en)
    VALUES ('AE-XX', 'SE', 'Fel', 'Wrong');
    RAISE EXCEPTION 'ASSERTION FAILED: 1.5 an emirate was accepted under Sweden';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  1.5 a sub-jurisdiction cannot belong to another country';
  END;

  -- Global family and local role are separate tables, and no relation exists
  -- between two roles in different markets.
  IF (SELECT count(*) FROM public.sp_regulated_roles WHERE market_pack_code = 'SE') < 3 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.6 Sweden must have its three regulated roles';
  END IF;
  -- The invariant is not "Sweden is the only market" -- that was true the day
  -- this suite was written and stopped being true when the UK pack landed. It
  -- is that a role can never be live ahead of the rules that define it.
  IF EXISTS (
    SELECT 1 FROM public.sp_regulated_roles r
      JOIN public.sp_market_packs m ON m.code = r.market_pack_code
     WHERE r.is_active AND NOT m.is_active
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.7 a regulated role is active inside an inactive market';
  END IF;
  RAISE NOTICE 'ok  1.6 Väktare, Ordningsvakt and Skyddsvakt are distinct roles';
  RAISE NOTICE 'ok  1.7 no role is live inside a market pack that is not';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- the legal gate is a constraint, not a habit';
  -- =====================================================================

  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'SE') IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.1 Sweden must stay active';
  END IF;
  IF (SELECT bool_or(is_active) FROM public.sp_market_packs WHERE code IN ('GB','AE-DU')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 an unreviewed market pack is active';
  END IF;
  RAISE NOTICE 'ok  2.1 Sweden is unchanged and still active';
  RAISE NOTICE 'ok  2.2 the UK and Dubai packs ship switched off';

  -- The gate itself: activating unreviewed content must be impossible, not
  -- merely discouraged.
  BEGIN
    UPDATE public.sp_market_packs SET is_active = true WHERE code = 'GB';
    RAISE EXCEPTION 'ASSERTION FAILED: 2.3 an unreviewed market pack was activated';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  2.3 a pending pack cannot be activated';
  END;

  -- ...and an approval cannot be claimed anonymously.
  BEGIN
    UPDATE public.sp_market_packs SET legal_review_state = 'approved' WHERE code = 'GB';
    RAISE EXCEPTION 'ASSERTION FAILED: 2.4 an unattributed approval was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  2.4 approval requires a named reviewer and a date';
  END;

  -- POSITIVE CONTROL for 2.3 and 2.4: the same UPDATE, differing only in
  -- carrying a real review, must succeed — otherwise the denials above could
  -- be an immovable row rather than a working gate.
  UPDATE public.sp_market_packs
     SET legal_review_state = 'approved',
         legal_reviewed_by  = 'suite: positive control',
         legal_reviewed_on  = current_date,
         is_active          = true
   WHERE code = 'GB';
  IF (SELECT is_active FROM public.sp_market_packs WHERE code = 'GB') IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.5 a reviewed pack could not be activated';
  END IF;
  RAISE NOTICE 'ok  2.5 POSITIVE CONTROL a reviewed pack activates normally';

  -- Put it back. The rest of the suite depends on GB being off.
  UPDATE public.sp_market_packs
     SET legal_review_state = 'pending', legal_reviewed_by = NULL,
         legal_reviewed_on = NULL, is_active = false
   WHERE code = 'GB';

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- Sweden is untouched (the regression that matters)';
  -- =====================================================================

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code, jurisdiction_code)
  VALUES (_h1, 'training', 'VU1', 'VU1', 'SE');
  RAISE NOTICE 'ok  3.1 a Swedish VU1 still saves exactly as before';

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until)
  VALUES (_h1, 'licence', 'Ordningsvakt', 'OV', 'SE', 'Polismyndigheten',
          current_date + 200);
  RAISE NOTICE 'ok  3.2 a Swedish OV appointment still saves';

  -- The pre-existing taxonomy rules must still bite.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name)
    VALUES (_h1, 'licence', 'OV utan slutdatum', 'OV', 'SE', 'Polismyndigheten');
    RAISE EXCEPTION 'ASSERTION FAILED: 3.3 an open-ended appointment was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  3.3 a time-limited appointment still needs an end date';
  END;

  -- A free-text claim with no jurisdiction is still allowed: the market gate
  -- must not have quietly made jurisdiction mandatory on every row.
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title)
  VALUES (_h1, 'certification', 'Heta arbeten');
  RAISE NOTICE 'ok  3.4 a free-text claim with no jurisdiction is still accepted';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- unknown and unreviewed markets fail closed';
  -- =====================================================================

  BEGIN
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, jurisdiction_code)
    VALUES (_h1, 'licence', 'Norsk vekter', 'NO');
    RAISE EXCEPTION 'ASSERTION FAILED: 4.1 a claim in an unknown country was accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'ok  4.1 an unregistered country is refused by the foreign key';
    WHEN check_violation THEN
      RAISE NOTICE 'ok  4.1 an unregistered country is refused by the market gate';
  END;

  -- GB is a known country with an authored but UNREVIEWED pack. It must be
  -- refused, and distinguishably so: "not available yet" is a different
  -- message from "no such place".
  BEGIN
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, jurisdiction_code)
    VALUES (_h1, 'licence', 'SIA licence', 'GB');
    RAISE EXCEPTION 'ASSERTION FAILED: 4.2 an unreviewed market accepted a claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_MARKET_PACK_NOT_ACTIVE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 4.2 wrong error for an inactive pack: %', _txt;
    END IF;
    RAISE NOTICE 'ok  4.2 an inactive market pack is refused as SP_MARKET_PACK_NOT_ACTIVE';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- the UAE is never one undifferentiated jurisdiction';
  -- =====================================================================

  BEGIN
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, jurisdiction_code)
    VALUES (_h1, 'licence', 'SIRA card', 'AE');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.1 a UAE-wide claim was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_REQUIRED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 5.1 wrong error for a missing emirate: %', _txt;
    END IF;
    RAISE NOTICE 'ok  5.1 a UAE claim without an emirate is refused, not stored as national';
  END;

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, jurisdiction_code, sub_jurisdiction_code)
    VALUES (_h1, 'licence', 'Abu Dhabi card', 'AE', 'AE-AZ');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.2 an unsupported emirate was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_SUB_JURISDICTION_NOT_SUPPORTED%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 5.2 wrong error for an unsupported emirate: %', _txt;
    END IF;
    RAISE NOTICE 'ok  5.2 Abu Dhabi is refused as "not supported yet", not as a bad country';
  END;

  -- Dubai is registered but its pack is unreviewed, so it too is refused —
  -- and with the pack message, proving the emirate itself was accepted and it
  -- was the review state that stopped it.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, jurisdiction_code, sub_jurisdiction_code)
    VALUES (_h1, 'licence', 'Dubai cadre card', 'AE', 'AE-DU');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.3 an unreviewed Dubai pack accepted a claim';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_MARKET_PACK_NOT_ACTIVE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 5.3 wrong error for Dubai: %', _txt;
    END IF;
    RAISE NOTICE 'ok  5.3 Dubai is recognised, and refused only because it is unreviewed';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- a credential cannot cross a market';
  -- =====================================================================

  -- POSITIVE CONTROL: VU1 in Sweden works (asserted at 3.1). The same
  -- credential filed against another country must not.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code)
    VALUES (_h1, 'training', 'VU1 in Britain', 'VU1', 'GB');
    RAISE EXCEPTION 'ASSERTION FAILED: 6.1 a Swedish credential was filed as British';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  6.1 a Swedish credential cannot be recorded in another market';
  END;

  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2','OV','SV') AND market_pack_code = 'SE') <> 4 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.2 the launch credentials must belong to Sweden';
  END IF;
  RAISE NOTICE 'ok  6.2 the four launch credentials are backfilled into the SE pack';

  -- The truth model's load-bearing row: VU1 feeds education and nothing else.
  IF (SELECT contributes_to FROM public.sp_credential_types WHERE code = 'VU1')
     <> ARRAY['education_completed']::text[] THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.3 VU1 must contribute to education only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE code IN ('VU1','VU2')
                AND contributes_to && ARRAY['local_eligibility','active_title']::text[]) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.4 training must never feed eligibility or a title';
  END IF;
  RAISE NOTICE 'ok  6.3 VU1 contributes to completed education and nothing else';
  RAISE NOTICE 'ok  6.4 no training credential can feed eligibility or an active title';

  IF NOT (SELECT contributes_to @> ARRAY['active_title']::text[]
            FROM public.sp_credential_types WHERE code = 'OV') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.5 the OV appointment must be able to feed a title';
  END IF;
  RAISE NOTICE 'ok  6.5 POSITIVE CONTROL the OV appointment can feed an active title';

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- a title rule cannot reach across a market';
  -- =====================================================================

  BEGIN
    INSERT INTO public.sp_professional_titles
      (code, market_pack_code, output_kind, name_local, name_en,
       requires_credential_codes)
    VALUES ('TEST_GHOST', 'SE', 'education_completed', 'Spöke', 'Ghost',
            ARRAY['NO_SUCH_CREDENTIAL']::text[]);
    RAISE EXCEPTION 'ASSERTION FAILED: 7.1 a rule naming a missing credential was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok  7.1 a title rule cannot name a credential that does not exist';
  END;

  BEGIN
    INSERT INTO public.sp_professional_titles
      (code, market_pack_code, output_kind, name_local, name_en,
       requires_credential_codes)
    VALUES ('TEST_CROSS', 'GB', 'professional_competence', 'Cross', 'Cross',
            ARRAY['VU1']::text[]);
    RAISE EXCEPTION 'ASSERTION FAILED: 7.2 a cross-market title rule was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  7.2 a British title cannot be derived from a Swedish credential';
  END;

  -- Authority-bearing outputs can never rest on self-declared evidence.
  BEGIN
    INSERT INTO public.sp_professional_titles
      (code, market_pack_code, output_kind, name_local, name_en,
       requires_credential_codes, requires_assertion_level)
    VALUES ('TEST_SELFTITLE', 'SE', 'active_title', 'Påstådd', 'Claimed',
            ARRAY['OV']::text[], 'self_declared');
    RAISE EXCEPTION 'ASSERTION FAILED: 7.3 a self-declared active title rule was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  7.3 an active title rule must require verified evidence';
  END;

  BEGIN
    INSERT INTO public.sp_professional_titles
      (code, market_pack_code, output_kind, name_local, name_en,
       requires_credential_codes, requires_current_validity)
    VALUES ('TEST_STALE', 'SE', 'local_eligibility', 'Utgången', 'Lapsed',
            ARRAY['OV']::text[], false);
    RAISE EXCEPTION 'ASSERTION FAILED: 7.4 an eligibility rule ignoring expiry was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  7.4 an eligibility rule cannot ignore whether the credential is current';
  END;

  -- POSITIVE CONTROL: a well-formed Swedish rule inserts, so the four
  -- refusals above are the constraints working rather than the table
  -- rejecting everything.
  INSERT INTO public.sp_professional_titles
    (code, market_pack_code, output_kind, name_local, name_en,
     requires_credential_codes)
  VALUES ('TEST_OK', 'SE', 'active_title', 'Ordningsvakt', 'Public order guard',
          ARRAY['OV']::text[]);
  IF NOT EXISTS (SELECT 1 FROM public.sp_professional_titles WHERE code = 'TEST_OK') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 7.5 a valid title rule did not store';
  END IF;
  RAISE NOTICE 'ok  7.5 POSITIVE CONTROL a well-formed Swedish rule inserts normally';
  DELETE FROM public.sp_professional_titles WHERE code = 'TEST_OK';

  -- =====================================================================
  RAISE NOTICE 'GROUP 8 -- the source registry cannot fake a citation';
  -- =====================================================================

  SELECT count(*) INTO _n FROM public.sp_regulatory_sources;
  IF _n < 24 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.1 expected every official source, found %', _n;
  END IF;
  RAISE NOTICE 'ok  8.1 all % official sources are registered', _n;

  IF EXISTS (SELECT 1 FROM public.sp_regulatory_sources WHERE url !~ '^https://') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.2 a source is not an https URL';
  END IF;
  RAISE NOTICE 'ok  8.2 every registered source is https';

  -- Seeded unchecked, and honest about it.
  IF EXISTS (SELECT 1 FROM public.sp_regulatory_sources WHERE review_state = 'current') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.3 an unread source claims to be current';
  END IF;
  RAISE NOTICE 'ok  8.3 no source claims to be current before anybody read it';

  BEGIN
    UPDATE public.sp_regulatory_sources
       SET review_state = 'current'
     WHERE source_key = 'gb_sia_public_register';
    RAISE EXCEPTION 'ASSERTION FAILED: 8.4 a source was marked current with no check';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  8.4 marking a source current requires a date and a fingerprint';
  END;

  -- POSITIVE CONTROL: with a real check recorded, the same update succeeds.
  UPDATE public.sp_regulatory_sources
     SET checked_on = current_date,
         content_fingerprint = repeat('a', 64),
         availability = 'available',
         review_state = 'current'
   WHERE source_key = 'gb_sia_public_register';
  IF (SELECT review_state FROM public.sp_regulatory_sources
       WHERE source_key = 'gb_sia_public_register') <> 'current' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.5 a checked source could not be marked current';
  END IF;
  RAISE NOTICE 'ok  8.5 POSITIVE CONTROL a genuinely checked source marks current';

  -- =====================================================================
  RAISE NOTICE 'GROUP 9 -- RLS and grants are two separate gates, both shut';
  -- =====================================================================

  -- RLS on every new table. Asserted as a set rather than one by one so that
  -- a table added later without RLS fails here instead of being forgotten.
  SELECT count(*) INTO _n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('sp_sub_jurisdictions','sp_market_packs','sp_profession_families',
                       'sp_authorities','sp_regulated_roles','sp_regulatory_sources',
                       'sp_source_review_items','sp_professional_titles')
     AND NOT c.relrowsecurity;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 9.1 % new table(s) have RLS disabled', _n;
  END IF;
  RAISE NOTICE 'ok  9.1 all eight new tables have row level security enabled';

  -- A grant is the other gate, and it is not implied by a policy.
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_schema = 'public'
     AND table_name IN ('sp_sub_jurisdictions','sp_market_packs','sp_profession_families',
                        'sp_authorities','sp_regulated_roles','sp_regulatory_sources',
                        'sp_source_review_items','sp_professional_titles');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 9.2 anon holds % grant(s) on the new tables', _n;
  END IF;
  RAISE NOTICE 'ok  9.2 anon holds no grant of any kind on the new tables';

  -- Reference data is read-only to the application. A holder cannot edit the
  -- rules that describe their own market.
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE grantee = 'authenticated' AND table_schema = 'public'
     AND privilege_type IN ('INSERT','UPDATE','DELETE')
     AND table_name IN ('sp_sub_jurisdictions','sp_market_packs','sp_profession_families',
                        'sp_authorities','sp_regulated_roles','sp_regulatory_sources',
                        'sp_professional_titles');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 9.3 authenticated can write reference data (% grants)', _n;
  END IF;
  RAISE NOTICE 'ok  9.3 no signed-in user can write regulatory reference data';

  -- Review items are operations data and are readable by nobody through the
  -- API. RLS with no policy denies; the missing grant denies again.
  IF has_table_privilege('authenticated', 'public.sp_source_review_items', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 9.4 authenticated can read source review items';
  END IF;
  RAISE NOTICE 'ok  9.4 source review items are readable by neither anon nor authenticated';

  -- POSITIVE CONTROL for 9.2 and 9.4: the tables that SHOULD be readable by a
  -- signed-in holder are. Without this the four denials above would also pass
  -- against a migration that granted nothing to anyone.
  IF NOT has_table_privilege('authenticated', 'public.sp_market_packs', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.sp_sub_jurisdictions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.sp_professional_titles', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 9.5 a signed-in holder cannot read the forms'' own vocabulary';
  END IF;
  RAISE NOTICE 'ok  9.5 POSITIVE CONTROL a signed-in holder can read the market vocabulary';

  -- =====================================================================
  RAISE NOTICE 'GROUP 10 -- cleanup';
  -- =====================================================================
  DELETE FROM public.sp_claims WHERE holder_user_id = _h1;
  UPDATE public.sp_regulatory_sources
     SET checked_on = NULL, content_fingerprint = NULL,
         availability = 'unchecked', review_state = 'review_needed'
   WHERE source_key = 'gb_sia_public_register';
  RAISE NOTICE 'ok  10.1 suite data removed';
END $$;
