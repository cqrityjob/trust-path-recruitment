-- =============================================================================
-- SECURITY PASSPORT — THE GOVERNED ISSUER (20261112090000)
--
-- Every write below runs as ROLE authenticated with the holder's own
-- auth.uid(): the exact principal a browser, a mobile client or a direct
-- PostgREST call carries. No service_role, no elevated grant, no RLS bypass.
-- That is the whole point — the defect this migration closes was reachable by
-- an ordinary holder writing their own row, and a suite that proved the rule
-- only under a superuser would prove nothing about them.
--
-- The suite files the FORGED shapes as well as the canonical ones, and
-- asserts the refusal codes by name. A suite that only proves the fix works
-- cannot tell you the defect was real.
--
-- Run by scripts/db-test.sh after the full migration replay.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE 'ok  %', _label;
END $$;

/** One claim INSERT as the holder themselves. Returns 'OK' or the SP_ code it
 *  was refused with, so a test can assert WHICH rule fired rather than only
 *  that something did. */
CREATE OR REPLACE FUNCTION pg_temp.file_issuer(
  _uid uuid, _code text, _issuer text, _mode text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _t public.sp_credential_types%ROWTYPE; _msg text;
BEGIN
  SELECT * INTO _t FROM public.sp_credential_types WHERE code = _code;
  IF NOT FOUND THEN RETURN 'NO_SUCH_TYPE'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title,
       claimed_issuer_name, lifecycle_state)
    VALUES (_uid, _t.claim_type, _t.code, _t.name_sv, _issuer, _mode);
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RESET ROLE;
    RETURN split_part(_msg, ':', 1);
  END;
END $$;

/** Change ONLY claimed_issuer_name on an existing claim, as the holder. */
CREATE OR REPLACE FUNCTION pg_temp.reissue(_uid uuid, _claim uuid, _issuer text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    UPDATE public.sp_claims SET claimed_issuer_name = _issuer WHERE id = _claim;
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RESET ROLE;
    RETURN split_part(_msg, ':', 1);
  END;
END $$;

DO $$
DECLARE
  _h    uuid := 'a0000000-0000-0000-0000-0000000000e1';
  _r    text;
  _n    int;
  _cissp uuid;
  _vu1   uuid;
  _free_before jsonb;
  _asis  text;
  _isc2  text;
  _alias text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_h, 'governed-issuer@fixture.invalid')
  ON CONFLICT (id) DO NOTHING;

  SELECT i.display_name INTO _asis
    FROM public.sp_certification_definitions d
    JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
   WHERE d.credential_code = 'INTL_ASIS_CPP';
  SELECT i.display_name INTO _isc2
    FROM public.sp_certification_definitions d
    JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
   WHERE d.credential_code = 'INTL_ISC2_CISSP';

  PERFORM pg_temp.ok(_asis = 'ASIS International', '0.1 the governed issuer for CPP is ASIS International');
  PERFORM pg_temp.ok(_isc2 = 'ISC2', '0.2 the governed issuer for CISSP is ISC2');

  -- A free-text row planted BEFORE anything governed happens. Group 5 proves
  -- it is byte-for-byte untouched at the end.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, claimed_issuer_name, lifecycle_state)
  VALUES (_h, 'certification', 'CPP', 'Fake Corporation', 'active');
  RESET ROLE;
  SELECT to_jsonb(c) - 'id' - 'created_at' - 'updated_at' INTO _free_before
    FROM public.sp_claims c WHERE c.holder_user_id = _h AND c.credential_code IS NULL;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- a forged issuer is refused, in every lifecycle state';
  -- =====================================================================
  _r := pg_temp.file_issuer(_h, 'INTL_ASIS_CPP', 'Fake Corporation', 'active');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED',
    '1.1 an ACTIVE CPP may not be attributed to Fake Corporation (got ' || _r || ')');

  -- The one that a rule placed after the draft early-return would have let
  -- through: stored as a false attribution, refused only later at activation.
  _r := pg_temp.file_issuer(_h, 'INTL_ASIS_CPP', 'Fake Corporation', 'draft');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED',
    '1.2 nor may a DRAFT CPP (got ' || _r || ')');

  _r := pg_temp.file_issuer(_h, 'INTL_ASIS_CPP', 'Government of Sweden', 'active');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED',
    '1.3 nor to a state that grants no such thing (got ' || _r || ')');

  -- A near miss is still a miss: nothing here does fuzzy matching.
  _r := pg_temp.file_issuer(_h, 'INTL_ASIS_CPP', 'ASIS', 'active');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED',
    '1.4 nor the short form ASIS (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- aliases are for SEARCH and are never stored';
  -- =====================================================================
  SELECT a.alias INTO _alias
    FROM public.sp_certification_issuer_aliases a
    JOIN public.sp_certification_issuers i ON i.id = a.issuer_id
   WHERE i.issuer_code = 'ISC2' LIMIT 1;
  PERFORM pg_temp.ok(_alias IS NOT NULL, '2.1 ISC2 has at least one search alias');
  PERFORM pg_temp.ok(_alias <> _isc2, '2.2 and it is not the controlled display name');

  _r := pg_temp.file_issuer(_h, 'INTL_ISC2_CISSP', _alias, 'active');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED',
    '2.3 an alias may not be STORED as the issuer (got ' || _r || ')');

  PERFORM pg_temp.ok(
    (SELECT prosrc NOT LIKE '%sp_certification_issuer_aliases%'
       FROM pg_proc WHERE proname = 'sp_claims_credential_rules'),
    '2.4 the rule never reads the alias table at all');

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- the governed issuer is accepted; presence stays the catalogue''s business';
  -- =====================================================================
  _r := pg_temp.file_issuer(_h, 'INTL_ISC2_CISSP', _isc2, 'active');
  PERFORM pg_temp.ok(_r = 'OK', '3.1 the governed issuer is accepted (got ' || _r || ')');

  -- IDENTITY, NOT PRESENCE. Whether an issuer must be named at all is the
  -- catalogue's business (sp_credential_types.requires_issuer), and all
  -- fourteen governed certifications currently say false. This rule governs
  -- WHICH issuer may be stored, never whether one must be -- an absent issuer
  -- is incomplete, not a false attribution. An earlier draft of the migration
  -- also refused an active claim with a NULL issuer; it contradicted the
  -- catalogue's own flag and broke 20261111090000's canonical write path,
  -- which files a CPP exactly the way the product does.
  PERFORM pg_temp.ok(
    (SELECT bool_and(NOT requires_issuer) FROM public.sp_credential_types
      WHERE scope_code = 'global_professional'),
    '3.2 the catalogue does not require an issuer on a global certification');

  _r := pg_temp.file_issuer(_h, 'INTL_ASIS_CPP', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'OK',
    '3.3 so an ACTIVE claim may omit it, exactly as 20261111090000 files one (got ' || _r || ')');

  _r := pg_temp.file_issuer(_h, 'INTL_ASIS_PSP', NULL, 'draft');
  PERFORM pg_temp.ok(_r = 'OK',
    '3.4 and a DRAFT may be silent about it while the holder types (got ' || _r || ')');

  -- Whitespace is trimmed for comparison but the rule is exact otherwise.
  _r := pg_temp.file_issuer(_h, 'INTL_ISACA_CISA', '  ISACA  ', 'active');
  PERFORM pg_temp.ok(_r = 'OK',
    '3.5 surrounding whitespace does not make a governed name forged (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- a holder cannot re-issue an existing claim';
  -- =====================================================================
  SELECT id INTO _cissp FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code = 'INTL_ISC2_CISSP' LIMIT 1;
  PERFORM pg_temp.ok(_cissp IS NOT NULL, '4.1 the governed CISSP claim exists');

  _r := pg_temp.reissue(_h, _cissp, 'Fake Corporation');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_ISSUER_NOT_GOVERNED',
    '4.2 changing ONLY the issuer is refused (got ' || _r || ')');

  SELECT claimed_issuer_name INTO _r FROM public.sp_claims WHERE id = _cissp;
  PERFORM pg_temp.ok(_r = _isc2,
    '4.3 and the stored issuer is unchanged after the attempt (got ' || coalesce(_r,'NULL') || ')');

  -- Erasing it is ALLOWED, for the same reason 3.2 gives: absence is not
  -- attribution. Named here rather than left unstated so the boundary of this
  -- rule is visible to the next reader.
  _r := pg_temp.reissue(_h, _cissp, NULL);
  PERFORM pg_temp.ok(_r = 'OK',
    '4.4 a holder may clear the issuer, which claims nothing about anybody (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- nothing else changed';
  -- =====================================================================
  -- A national credential keeps the issuer semantics it has had since
  -- 20260817160000: any text, or none.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
     jurisdiction_code, lifecycle_state)
  SELECT _h, t.claim_type, 'VU1', t.name_sv, 'Any Training Provider AB', 'SE', 'active'
    FROM public.sp_credential_types t WHERE t.code = 'VU1'
  RETURNING id INTO _vu1;
  RESET ROLE;
  PERFORM pg_temp.ok(_vu1 IS NOT NULL,
    '5.1 a Swedish credential still accepts an arbitrary appointing authority');

  _r := pg_temp.reissue(_h, _vu1, 'Someone Else Entirely');
  PERFORM pg_temp.ok(_r = 'OK',
    '5.2 and the holder may still correct it (got ' || _r || ')');

  -- Free text is not upgraded and not constrained: it names no credential.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, claimed_issuer_name, lifecycle_state)
  VALUES (_h, 'certification', 'CISSP', 'Fake Corporation', 'active');
  RESET ROLE;
  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _h AND credential_code IS NULL;
  PERFORM pg_temp.ok(_n = 2,
    '5.3 a free-text claim may still name anything (got ' || _n || ')');

  PERFORM pg_temp.ok(
    (SELECT to_jsonb(c) - 'id' - 'created_at' - 'updated_at' = _free_before
       FROM public.sp_claims c
      WHERE c.holder_user_id = _h AND c.credential_code IS NULL AND c.title = 'CPP'),
    '5.4 and the pre-existing free-text row is byte-for-byte unchanged');

  -- The certification that WAS accepted was not promoted by being governed.
  PERFORM pg_temp.ok(
    (SELECT assertion_level = 'self_declared' FROM public.sp_claims WHERE id = _cissp),
    '5.5 a governed issuer does not raise the assertion level');
  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code IS NULL AND sub_jurisdiction_code IS NULL
       FROM public.sp_claims WHERE id = _cissp),
    '5.6 nor give an international certification a territory');
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_claim_certification_lifecycle
                 WHERE claim_id = _cissp),
    '5.7 nor create a standing the holder never declared');

  -- Every 20261111090000 refusal still fires.
  PERFORM pg_temp.ok(
    (SELECT prosrc LIKE '%SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION%'
        AND prosrc LIKE '%SP_SUB_JURISDICTION_REQUIRED%'
        AND prosrc LIKE '%SP_CREDENTIAL_TITLE_CONTROLLED%'
        AND prosrc LIKE '%SP_CREDENTIAL_NOT_AVAILABLE%'
       FROM pg_proc WHERE proname = 'sp_claims_credential_rules'),
    '5.8 every earlier refusal survived the reproduction');

  -- The rule refuses; it never silently rewrites what the caller sent.
  PERFORM pg_temp.ok(
    (SELECT prosrc NOT LIKE '%NEW.claimed_issuer_name :=%'
       FROM pg_proc WHERE proname = 'sp_claims_credential_rules'),
    '5.9 the rule never rewrites a submitted issuer into the governed one');

  -- Clean up so the suite is re-runnable and leaves the database as found.
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;
  DELETE FROM auth.users WHERE id = _h;

  RAISE NOTICE 'security_passport_governed_issuer_test: all assertions passed';
END $$;
