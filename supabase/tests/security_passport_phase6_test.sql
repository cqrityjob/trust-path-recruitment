-- Security Passport — Phase 6 assertions: the launch credential taxonomy.
--
-- Every rule this migration adds is asserted by MUTATION: the suite attempts
-- the thing the rule forbids and fails if the database allows it. A test that
-- only inserted valid rows would pass just as happily against a schema with
-- no rules at all.
--
-- Two properties matter more than the rest and are asserted explicitly:
--
--   * a credential with no real expiry is NOT forced to invent one (VU1/VU2);
--   * a time-limited appointment CANNOT be recorded as if it were open-ended
--     (OV/SV), and cannot be recorded without the authority that granted it.
--
-- Phase 6 must also not have opened any new route to VERIFIED, so the Phase 2
-- trust guard is re-asserted here against a claim carrying a credential code.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h1 uuid := '00000000-0000-0000-0000-00000000f601';
  _h2 uuid := '00000000-0000-0000-0000-00000000f602';
  _n  integer;
BEGIN
  INSERT INTO auth.users (id) VALUES (_h1), (_h2) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'GROUP 1 -- the taxonomy is present and controlled';

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE code IN ('VU1', 'VU2', 'OV', 'SV');
  IF _n <> 4 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 expected the four launch credentials, found %', _n;
  END IF;
  RAISE NOTICE 'ok  1.1 VU1, VU2, OV and SV are all present';

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE category NOT IN ('qualification', 'appointment')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 a credential has an unknown category';
  END IF;
  RAISE NOTICE 'ok  1.2 every credential is a qualification or an appointment';

  -- The distinction is not decorative: VU1/VU2 are qualifications, OV/SV are
  -- appointments, and only the appointments are time-limited.
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2') AND category = 'qualification') <> 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.3 VU1/VU2 must be qualifications';
  END IF;
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('OV','SV') AND category = 'appointment'
         AND requires_valid_until AND requires_issuer) <> 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.4 OV/SV must be time-limited appointments requiring an authority';
  END IF;
  RAISE NOTICE 'ok  1.3 VU1/VU2 are qualifications';
  RAISE NOTICE 'ok  1.4 OV/SV are appointments requiring an end date and an authority';

  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('VU1','VU2') AND requires_valid_until) <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.5 a training credential must not require an expiry';
  END IF;
  RAISE NOTICE 'ok  1.5 no expiry requirement is invented for VU1/VU2';

  RAISE NOTICE 'GROUP 2 -- qualifications record honestly';

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
  VALUES (_h1, 'training', 'VU1', 'VU1');
  RAISE NOTICE 'ok  2.1 VU1 accepted with no valid_until';

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
  VALUES (_h1, 'training', 'VU2', 'VU2');
  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _h1 AND credential_code IN ('VU1', 'VU2');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 VU1 and VU2 must coexist, found % row(s)', _n;
  END IF;
  RAISE NOTICE 'ok  2.2 adding VU2 does not overwrite or supersede VU1';

  RAISE NOTICE 'GROUP 3 -- appointments cannot be misrepresented';

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, claimed_issuer_name)
    VALUES (_h1, 'licence', 'OV', 'OV', 'Polismyndigheten');
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 an appointment was accepted with no end date';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  3.1 a time-limited appointment is refused without valid_until';
  END;

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, valid_until)
    VALUES (_h1, 'licence', 'OV', 'OV', '2027-01-01');
    RAISE EXCEPTION 'ASSERTION FAILED: 3.2 an appointment was accepted with no authority';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  3.2 an appointment is refused without an appointing authority';
  END;

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name, valid_until)
  VALUES (_h1, 'licence', 'OV', 'OV', 'Polismyndigheten', '2027-01-01');
  RAISE NOTICE 'ok  3.3 a complete appointment is accepted';

  -- authorisation_scope arrived with the Swedish truth model (20260907091000):
  -- a skyddsvakt approval is limited to an employer, principal or protected
  -- object, and an approval shown without saying which reads as a general
  -- national licence. What this assertion is ABOUT -- that skyddsvakt and
  -- ordningsvakt are separate claims -- is unchanged.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, claimed_issuer_name, valid_until,
     authorisation_scope)
  VALUES (_h1, 'licence', 'SV', 'SV', 'Polismyndigheten', '2027-06-30',
          'Skyddsobjekt: Syntetisk anläggning');
  RAISE NOTICE 'ok  3.4 skyddsvakt is a separate appointment claim from ordningsvakt';

  RAISE NOTICE 'GROUP 4 -- drafts can be saved half-finished';

  -- Save-and-resume would be impossible if the rules bound a draft.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, lifecycle_state)
  VALUES (_h1, 'licence', 'OV in progress', 'OV', 'draft');
  RAISE NOTICE 'ok  4.1 a draft appointment saves without the mandatory fields';

  -- ...but promoting that draft to a real claim must still be refused.
  BEGIN
    UPDATE public.sp_claims SET lifecycle_state = 'active'
     WHERE holder_user_id = _h1 AND title = 'OV in progress';
    RAISE EXCEPTION 'ASSERTION FAILED: 4.2 an incomplete draft was promoted to active';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  4.2 an incomplete draft cannot be promoted to a real claim';
  END;

  RAISE NOTICE 'GROUP 5 -- the code cannot lie about what kind of thing it is';

  BEGIN
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
    VALUES (_h1, 'licence', 'VU1 filed as a licence', 'VU1');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.1 VU1 was accepted under the wrong claim_type';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  5.1 a credential cannot be filed under the wrong claim_type';
  END;

  BEGIN
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
    VALUES (_h1, 'training', 'invented', 'NOTREAL');
    RAISE EXCEPTION 'ASSERTION FAILED: 5.2 an unknown credential code was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok  5.2 an unknown credential code is refused';
  END;

  -- A free-text claim is not claiming to be one of the four and is not bound
  -- by their rules -- otherwise Phase 6 would have broken every existing row.
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title)
  VALUES (_h1, 'certification', 'Some unrelated course');
  RAISE NOTICE 'ok  5.3 a claim with no credential code is unaffected';

  RAISE NOTICE 'GROUP 6 -- Phase 6 opened no new route to VERIFIED';

  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, assertion_level)
    VALUES (_h1, 'training', 'self-declared verified', 'VU1', 'verified');
    RAISE EXCEPTION 'ASSERTION FAILED: 6.1 a holder self-asserted VERIFIED on a coded claim';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  6.1 a coded claim still cannot be born VERIFIED';
  END;

  IF EXISTS (SELECT 1 FROM public.sp_claims
              WHERE credential_code IS NOT NULL AND assertion_level <> 'self_declared') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 6.2 a coded claim reached a higher assertion level';
  END IF;
  RAISE NOTICE 'ok  6.2 every coded claim written here is still self_declared';

  RAISE NOTICE 'GROUP 7 -- the private columns stay private';

  -- The recipient payload is assembled by name. If either private column ever
  -- appears in that function, it reaches strangers.
  IF pg_get_functiondef('public.sp_get_disclosure(text)'::regprocedure)
       ~ '(credential_reference|holder_note)' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 7.1 sp_get_disclosure names a private column';
  END IF;
  RAISE NOTICE 'ok  7.1 sp_get_disclosure discloses neither the reference nor the holder note';

  -- anon must not be able to read the taxonomy directly either; the recipient
  -- page gets what it needs from the one SECURITY DEFINER function.
  IF has_table_privilege('anon', 'public.sp_credential_types', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 7.2 anon can read sp_credential_types directly';
  END IF;
  RAISE NOTICE 'ok  7.2 anon has no direct read on the taxonomy';

  IF NOT EXISTS (SELECT 1 FROM pg_class
                  WHERE relname = 'sp_credential_types' AND relrowsecurity) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 7.3 RLS is not enabled on sp_credential_types';
  END IF;
  RAISE NOTICE 'ok  7.3 RLS is enabled on the taxonomy table';

  RAISE NOTICE 'GROUP 8 -- cross-holder isolation is unchanged';

  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code)
  VALUES (_h2, 'training', 'VU1', 'VU1');
  SELECT count(*) INTO _n FROM public.sp_claims WHERE holder_user_id = _h2;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 8.1 second holder sees % rows, expected 1', _n;
  END IF;
  RAISE NOTICE 'ok  8.1 a second holder''s coded claim is independent';

  -- Clean up this suite's own fixtures.
  DELETE FROM public.sp_claims WHERE holder_user_id IN (_h1, _h2);
  DELETE FROM auth.users WHERE id IN (_h1, _h2);
  RAISE NOTICE 'ok  8.2 suite fixtures removed';
END $$;
