-- =============================================================================
-- Security Passport — the governed international-certification foundation.
--
-- Proves the twenty-four properties Phase 1 is defined by, against the schema
-- 20261111090000 creates, on a full migration replay.
--
-- ── HOW IT WRITES ──────────────────────────────────────────────────────
--
-- Every claim is filed as `SET LOCAL ROLE authenticated` with a JWT subject —
-- what PostgREST does. Running as the table owner bypasses row level security,
-- which is exactly how a catalogue nobody could read once stayed green for a
-- round, and it would make every isolation group below meaningless.
--
-- Every INSERT is built the way `credentialClaimFields` builds it: the market
-- comes from the DEFINITION, and for a global_professional definition both
-- jurisdiction columns are NULL. The shapes a forged client would send are
-- filed too, and asserted to be refused, because a suite that only proves the
-- fix works cannot tell you the defect was real.
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

/** One claim INSERT as role authenticated, reporting 'OK' or the SP_ code it
 *  was refused with. `_jur` and `_sub` are explicit so the suite can file the
 *  forged shapes as well as the canonical one. */
CREATE OR REPLACE FUNCTION pg_temp.file_as(
  _uid uuid, _code text, _jur text, _sub text, _mode text)
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
       claimed_issuer_name, jurisdiction_code, sub_jurisdiction_code,
       valid_until, authorisation_scope, lifecycle_state)
    VALUES (
      _uid, _t.claim_type, _t.code, _t.name_sv,
      CASE WHEN _t.requires_issuer THEN 'Fiktiv myndighet' ELSE NULL END,
      _jur, _sub,
      CASE WHEN _t.requires_valid_until THEN DATE '2030-01-01' ELSE NULL END,
      CASE WHEN _t.requires_scope THEN 'Fiktivt bevakningsuppdrag' ELSE NULL END,
      _mode);
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RESET ROLE;
    RETURN split_part(_msg, ':', 1);
  END;
END $$;

/** The canonical mapping: the market comes from the definition, which for a
 *  global certification means both columns are NULL. This is
 *  `credentialClaimFields`, in SQL. */
CREATE OR REPLACE FUNCTION pg_temp.file_canonical(_uid uuid, _code text, _mode text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _t public.sp_credential_types%ROWTYPE;
BEGIN
  SELECT * INTO _t FROM public.sp_credential_types WHERE code = _code;
  IF NOT FOUND THEN RETURN 'NO_SUCH_TYPE'; END IF;
  IF _t.scope_code = 'global_professional' THEN
    RETURN pg_temp.file_as(_uid, _code, NULL, NULL, _mode);
  END IF;
  RETURN pg_temp.file_as(_uid, _code, _t.jurisdiction_code, _t.sub_jurisdiction_code, _mode);
END $$;

/** An arbitrary statement as role authenticated, reporting OK or the SQLSTATE
 *  class it failed with. Used for the negative-security groups. */
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    EXECUTE _sql;
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RESET ROLE;
    RETURN 'REFUSED: ' || split_part(_msg, ':', 1);
  END;
END $$;

/** A single-value read as role authenticated. Returns NULL when the row is
 *  invisible, which is what RLS looks like from the wrong side. */
CREATE OR REPLACE FUNCTION pg_temp.count_as(_uid uuid, _sql text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  EXECUTE _sql INTO _n;
  RESET ROLE;
  RETURN _n;
END $$;

DO $$
DECLARE
  _global uuid := gen_random_uuid();   -- a holder with international certs
  _se     uuid := gen_random_uuid();   -- a Swedish holder, established first
  _gb     uuid := gen_random_uuid();   -- a pilot member for GB
  _none   uuid := gen_random_uuid();   -- a holder with no work country
  _odd    uuid := gen_random_uuid();   -- a holder in an unsupported country
  _other  uuid := gen_random_uuid();   -- candidate B, for isolation
  _admin  uuid := gen_random_uuid();
  _r      text;
  _n      integer;
  _b      bigint;
  _claim  uuid;
  _cpp    uuid;
  _se_before jsonb;
  _legacy_before jsonb;
  _payload jsonb;
  _disclosure uuid;
  _codes text[];
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_global, 'intl-global@fixture.invalid'),
    (_se,     'intl-swede@fixture.invalid'),
    (_gb,     'intl-brit@fixture.invalid'),
    (_none,   'intl-nocountry@fixture.invalid'),
    (_odd,    'intl-elsewhere@fixture.invalid'),
    (_other,  'intl-other@fixture.invalid'),
    (_admin,  'intl-admin@fixture.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin')
  ON CONFLICT DO NOTHING;

  -- ── The world BEFORE anything international happens ─────────────────
  -- A Swedish credential and a free-text row named after a real
  -- certification. Group 16 proves both are exactly this at the end.
  _r := pg_temp.file_canonical(_se, 'VU1', 'active');
  PERFORM pg_temp.ok(_r = 'OK', '0.1 a Swedish holder records VU1 (got ' || _r || ')');
  SELECT to_jsonb(c) - 'id' - 'created_at' - 'updated_at' INTO _se_before
    FROM public.sp_claims c WHERE c.holder_user_id = _se AND c.credential_code = 'VU1';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _se::text, true);
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, claimed_issuer_name, lifecycle_state)
  VALUES (_se, 'certification', 'CPP', 'ASIS', 'active');
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, claimed_issuer_name, lifecycle_state)
  VALUES (_se, 'certification', 'CISSP', 'ISC2', 'active');
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, lifecycle_state)
  VALUES (_se, 'training', 'test', 'active');
  RESET ROLE;

  SELECT jsonb_agg(to_jsonb(c) - 'id' - 'created_at' - 'updated_at' ORDER BY c.title)
    INTO _legacy_before
    FROM public.sp_claims c
   WHERE c.holder_user_id = _se AND c.credential_code IS NULL;
  PERFORM pg_temp.ok(jsonb_array_length(_legacy_before) = 3,
    '0.2 three free-text rows exist before the catalogue is touched');

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- the catalogue is exactly what was reviewed';
  -- =====================================================================
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE scope_code = 'global_professional' AND is_active;
  PERFORM pg_temp.ok(_n = 14,
    '1.1 exactly 14 active global_professional definitions (got ' || _n || ')');

  SELECT count(*) INTO _n FROM public.sp_certification_definitions;
  PERFORM pg_temp.ok(_n = 14, '1.2 exactly 14 certification definitions');

  SELECT count(*) INTO _n FROM public.sp_certification_issuers;
  PERFORM pg_temp.ok(_n = 5, '1.3 exactly 5 issuers');

  FOR _r, _n IN
    SELECT i.issuer_code, count(*)::int
      FROM public.sp_certification_definitions d
      JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
     GROUP BY i.issuer_code ORDER BY i.issuer_code
  LOOP
    PERFORM pg_temp.ok(
      (_r, _n) IN (('ASIS', 4), ('ISC2', 5), ('ISACA', 3), ('ACFE', 1), ('ACAMS', 1)),
      format('1.4 %s holds %s definition(s)', _r, _n));
  END LOOP;

  SELECT array_agg(code ORDER BY code) INTO _codes
    FROM public.sp_credential_types WHERE scope_code = 'global_professional';
  PERFORM pg_temp.ok(_codes = ARRAY[
      'INTL_ACAMS_CAMS','INTL_ACFE_CFE','INTL_ASIS_APP','INTL_ASIS_CPP',
      'INTL_ASIS_PCI','INTL_ASIS_PSP','INTL_ISACA_CISA','INTL_ISACA_CISM',
      'INTL_ISACA_CRISC','INTL_ISC2_CC','INTL_ISC2_CCSP','INTL_ISC2_CGRC',
      'INTL_ISC2_CISSP','INTL_ISC2_SSCP'],
    '1.5 the fourteen codes are exactly the reviewed set');

  -- The controlled display names. "(ISC)²" is a search alias and must never be
  -- the name a surface prints, and ISACA's expansion is an organisation name
  -- ISACA itself retired.
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE issuer_code = 'ISC2' AND display_name = 'ISC2'),
    '1.6 ISC2 displays as "ISC2"');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE issuer_code = 'ISC2'
      AND legal_name = 'International Information System Security Certification Consortium, Inc.'),
    '1.7 and carries its legal name separately');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_certification_issuer_aliases a
     JOIN public.sp_certification_issuers i ON i.id = a.issuer_id
    WHERE i.issuer_code = 'ISC2' AND a.alias = '(ISC)²' AND a.alias_kind = 'search_alias'),
    '1.8 "(ISC)²" is a SEARCH alias, not a display name');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE display_name LIKE '%Information Systems Audit and Control%'),
    '1.9 ISACA is not expanded into its retired organisation name');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE issuer_code = 'ACFE'
      AND display_name = 'Association of Certified Fraud Examiners (ACFE)'),
    '1.10 ACFE carries its controlled display name');

  -- ISO is not a personal certification issuer and must not be here.
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE display_name ILIKE '%ISO%' OR issuer_code LIKE 'ISO%'),
    '1.11 ISO is not an issuer: it publishes standards and awards no personal credential');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.sp_credential_types
    WHERE scope_code = 'global_professional'
      AND (name_en ILIKE '%ISO 31000%' OR name_en ILIKE '%ISO 22301%'
           OR name_en ILIKE '%27001%')),
    '1.12 no ISO standard is seeded as a personal certification');

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- the sources were reviewed, and the honest gaps are honest';
  -- =====================================================================
  SELECT count(*) INTO _n FROM public.sp_certification_sources
   WHERE reviewed_on <> DATE '2026-09-12';
  PERFORM pg_temp.ok(_n = 0, '2.1 every source carries the review date 2026-09-12');

  SELECT count(*) INTO _n FROM public.sp_certification_sources WHERE url !~ '^https://';
  PERFORM pg_temp.ok(_n = 0, '2.2 every source URL is https');

  SELECT string_agg(t.code, ', ' ORDER BY t.code) INTO _r
    FROM public.sp_credential_types t
   WHERE t.scope_code = 'global_professional'
     AND NOT EXISTS (SELECT 1 FROM public.sp_certification_sources s
                      WHERE s.credential_code = t.code AND s.source_kind = 'programme');
  PERFORM pg_temp.ok(_r IS NULL,
    '2.3 every definition has a reviewed programme source' || coalesce(' — missing ' || _r, ''));

  SELECT count(*) INTO _n FROM public.sp_certification_sources
   WHERE source_kind = 'maintenance_policy';
  PERFORM pg_temp.ok(_n >= 5, '2.4 every issuer has a reviewed maintenance source');

  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE issuer_code = 'ACAMS'
      AND public_verification_url IS NULL AND verification_mode = 'none'),
    '2.5 ACAMS records NO public verification URL — none was confirmed');

  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE issuer_code = 'ACFE'
      AND verification_mode = 'opt_in_directory' AND absence_is_inconclusive),
    '2.6 the ACFE directory is opt-in and its absence is recorded as inconclusive');

  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.sp_certification_issuers
    WHERE issuer_code IN ('ASIS','ISC2','ISACA') AND verification_mode = 'exact_match_lookup'
    HAVING count(*) = 3),
    '2.7 ASIS, ISC2 and ISACA publish exact-match lookups');

  -- An opt-in directory whose absence was conclusive would be the single most
  -- damaging thing this table could say about a real person. Asserted as the
  -- OWNER, so it is the CONSTRAINT that refuses rather than a missing grant —
  -- the grant is proved separately in group 11, and a test that cannot tell
  -- the two apart proves neither.
  BEGIN
    UPDATE public.sp_certification_issuers SET absence_is_inconclusive = false
     WHERE issuer_code = 'ACFE';
    PERFORM pg_temp.ok(false, '2.8 an opt-in directory was made conclusive');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true,
      '2.8 an opt-in directory cannot be made conclusive, by constraint');
  END;

  -- And `none` may not carry a verification URL: a mode of "we confirmed no
  -- lookup" with a URL beside it is the product asserting a capability it does
  -- not have.
  BEGIN
    UPDATE public.sp_certification_issuers
       SET public_verification_url = 'https://www.acams.org/en/search'
     WHERE issuer_code = 'ACAMS';
    PERFORM pg_temp.ok(false, '2.9 ACAMS was given a substitute verification URL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true,
      '2.9 an issuer with no confirmed lookup cannot be given a substitute URL');
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- a global definition is unbound from every territory';
  -- =====================================================================
  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE scope_code = 'global_professional'
     AND (claim_type <> 'certification' OR category <> 'qualification');
  PERFORM pg_temp.ok(_n = 0, '3.1 every global definition is certification / qualification');

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE scope_code = 'global_professional'
     AND (market_pack_code IS NOT NULL OR jurisdiction_code IS NOT NULL
          OR sub_jurisdiction_code IS NOT NULL OR authority_id IS NOT NULL
          OR regulated_role_id IS NOT NULL);
  PERFORM pg_temp.ok(_n = 0,
    '3.2 no global definition carries a market, jurisdiction, regulator or regulated role');

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE scope_code = 'global_professional'
     AND contributes_to && ARRAY['local_eligibility','active_title']::text[];
  PERFORM pg_temp.ok(_n = 0,
    '3.3 no global definition contributes to local eligibility or to a title');

  -- The constraint, not the seed. A row that tried to carry a country must be
  -- refused on INSERT and on UPDATE alike.
  BEGIN
    INSERT INTO public.sp_credential_types
      (code, claim_type, category, name_sv, name_en, symbol_label,
       scope_code, jurisdiction_code, market_pack_code)
    VALUES ('INTL_FORGED_1', 'certification', 'qualification', 'x', 'x', 'X',
            'global_professional', 'SE', 'SE');
    PERFORM pg_temp.ok(false, '3.4 a global definition with a jurisdiction was ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, '3.4 a global definition with a jurisdiction fails on INSERT');
  END;

  BEGIN
    UPDATE public.sp_credential_types SET jurisdiction_code = 'SE'
     WHERE code = 'INTL_ASIS_CPP';
    PERFORM pg_temp.ok(false, '3.5 a global definition was given a jurisdiction by UPDATE');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, '3.5 a global definition cannot be given a jurisdiction by UPDATE');
  END;

  BEGIN
    UPDATE public.sp_credential_types
       SET contributes_to = ARRAY['local_eligibility']::text[]
     WHERE code = 'INTL_ASIS_CPP';
    PERFORM pg_temp.ok(false, '3.6 a global definition was given local eligibility');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, '3.6 a global definition cannot be given local eligibility');
  END;

  BEGIN
    INSERT INTO public.sp_credential_types
      (code, claim_type, category, name_sv, name_en, symbol_label, scope_code)
    VALUES ('INTL_FORGED_2', 'licence', 'appointment', 'x', 'x', 'X',
            'global_professional');
    PERFORM pg_temp.ok(false, '3.7 a global licence/appointment was ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, '3.7 a global definition may not be a licence or an appointment');
  END;

  -- Duplicate identity fails, for both the credential code and the issuer code.
  BEGIN
    INSERT INTO public.sp_credential_types
      (code, claim_type, category, name_sv, name_en, symbol_label, scope_code)
    VALUES ('INTL_ASIS_CPP', 'certification', 'qualification', 'x', 'x', 'X',
            'global_professional');
    PERFORM pg_temp.ok(false, '3.8 a duplicate credential code was ACCEPTED');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.ok(true, '3.8 a duplicate credential code fails');
  END;

  BEGIN
    INSERT INTO public.sp_certification_issuers
      (issuer_code, display_name, official_url, verification_mode, source_reviewed_on)
    VALUES ('ASIS', 'Duplicate', 'https://example.invalid/', 'none', current_date);
    PERFORM pg_temp.ok(false, '3.9 a duplicate issuer code was ACCEPTED');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.ok(true, '3.9 a duplicate issuer code fails');
  END;

  BEGIN
    UPDATE public.sp_certification_issuers SET issuer_code = 'ASIS_NEW'
     WHERE issuer_code = 'ASIS';
    PERFORM pg_temp.ok(false, '3.10 an issuer code was renamed');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true, '3.10 an issuer code is immutable');
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- a null jurisdiction, on its own, means nothing';
  -- =====================================================================
  -- The probe: a definition with no country and no declared scope. If a null
  -- jurisdiction were a signal, this row would be international. It is not.
  INSERT INTO public.sp_credential_types
    (code, claim_type, category, name_sv, name_en, symbol_label, is_active)
  VALUES ('PROBE_NO_COUNTRY', 'certification', 'qualification',
          'Internationell CPP-liknande', 'International CPP-like', 'PRB', true);

  PERFORM pg_temp.ok(
    (SELECT scope_code FROM public.sp_credential_types WHERE code = 'PROBE_NO_COUNTRY') IS NULL,
    '4.1 a definition with no country has NO scope — null is not global');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_credential_types
      WHERE code = 'PROBE_NO_COUNTRY' AND scope_code = 'global_professional') = 0,
    '4.2 and it is not counted among the international certifications');

  -- Its name says "International" and mentions CPP. Neither upgrades it.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_credential_types
      WHERE scope_code = 'global_professional') = 14,
    '4.3 the word "International" in a name changes no count');

  -- No certification detail may attach to it, because it is not global.
  BEGIN
    INSERT INTO public.sp_certification_definitions
      (credential_code, issuer_id, canonical_name_en, abbreviation,
       programme_url, maintenance_policy_url, maintenance_policy_type,
       maintenance_summary_en, source_reviewed_on)
    SELECT 'PROBE_NO_COUNTRY', id, 'x', 'X', 'https://a.invalid/', 'https://b.invalid/',
           'none_published', 'x', current_date
      FROM public.sp_certification_issuers WHERE issuer_code = 'ASIS';
    PERFORM pg_temp.ok(false, '4.4 an undeclared definition was given certification detail');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true,
      '4.4 certification detail requires a DECLARED global scope, not a missing country');
  END;

  DELETE FROM public.sp_credential_types WHERE code = 'PROBE_NO_COUNTRY';

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- the canonical write path, from every work country';
  -- =====================================================================
  -- The holder states Sweden. A CPP is still not a Swedish credential.
  INSERT INTO public.sp_passport_profiles (holder_user_id, jurisdiction_code)
  VALUES (_global, 'SE')
  ON CONFLICT (holder_user_id) DO UPDATE SET jurisdiction_code = 'SE';

  _r := pg_temp.file_canonical(_global, 'INTL_ASIS_CPP', 'active');
  PERFORM pg_temp.ok(_r = 'OK', '5.1 a holder in Sweden records a CPP (got ' || _r || ')');

  SELECT id INTO _cpp FROM public.sp_claims
   WHERE holder_user_id = _global AND credential_code = 'INTL_ASIS_CPP';
  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code IS NULL AND sub_jurisdiction_code IS NULL
       FROM public.sp_claims WHERE id = _cpp),
    '5.2 and it is stored with NO country and NO sub-jurisdiction');

  -- A holder who has stated no work country at all.
  _r := pg_temp.file_canonical(_none, 'INTL_ISC2_CISSP', 'active');
  PERFORM pg_temp.ok(_r = 'OK',
    '5.3 a holder with no stated work country records a CISSP (got ' || _r || ')');

  -- A holder in a market nobody has opened. Abu Dhabi is authored, unreviewed
  -- and deliberately CLOSED — a holder there can register no regulated
  -- credential at all. The market gate never runs for their CISA, because the
  -- claim names no jurisdiction for it to gate.
  INSERT INTO public.sp_passport_profiles
    (holder_user_id, jurisdiction_code, sub_jurisdiction_code)
  VALUES (_odd, 'AE', 'AE-AZ')
  ON CONFLICT (holder_user_id) DO UPDATE
    SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-AZ';

  -- First, that their market really is shut: a regulated Abu Dhabi credential
  -- is refused. If it were not, 5.4 would prove nothing.
  _r := pg_temp.file_canonical(_odd, 'AE_AZ_PSBD_LICENCE_GUARD', 'active');
  PERFORM pg_temp.ok(_r <> 'OK',
    '5.4a their own regulated market is closed to them (got ' || _r || ')');

  _r := pg_temp.file_canonical(_odd, 'INTL_ISACA_CISA', 'active');
  PERFORM pg_temp.ok(_r = 'OK',
    '5.4b and they record a CISA anyway (got ' || _r || ')');

  -- And with no pilot entitlement anywhere.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_pilot_members WHERE user_id = _odd AND revoked_at IS NULL),
    '5.5 that holder holds no pilot entitlement of any kind');

  -- Every one of the fourteen saves, canonically.
  _n := 0;
  FOR _r IN SELECT code FROM public.sp_credential_types
             WHERE scope_code = 'global_professional' ORDER BY code
  LOOP
    IF pg_temp.file_canonical(_gb, _r, 'active') = 'OK' THEN _n := _n + 1; END IF;
  END LOOP;
  PERFORM pg_temp.ok(_n = 14, '5.6 all 14 definitions save canonically (got ' || _n || ')');

  -- A draft saves too, and the market rules do not bind it into a country.
  _r := pg_temp.file_canonical(_none, 'INTL_ACFE_CFE', 'draft');
  PERFORM pg_temp.ok(_r = 'OK', '5.7 a global certification saves as a draft');

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- a forged client cannot make a CPP Swedish';
  -- =====================================================================
  -- Every case here is a request a browser could send: the governed code, plus
  -- a country the client chose. The client's own mapping never builds one —
  -- `credentialClaimFields` writes NULL into both columns for a global
  -- definition — which is exactly why the refusal has to be the database's.
  --
  -- The holder is given the GB and Dubai pilot entitlements FIRST, so that the
  -- market gate passes and the refusal below is unambiguously the SCOPE rule.
  -- Without them a non-member is refused earlier with
  -- SP_MARKET_PACK_NOT_ACTIVE, which is also correct and proves nothing about
  -- scope.
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_global, 'GB',    'global certification suite');
  PERFORM public.sp_grant_pilot_member(_global, 'AE-DU', 'global certification suite');

  _r := pg_temp.file_as(_global, 'INTL_ASIS_PSP', 'SE', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION',
    '6.1 a global certification filed in Sweden — an ACTIVE market — is refused (got ' || _r || ')');

  _r := pg_temp.file_as(_global, 'INTL_ASIS_PSP', 'AE', 'AE-DU', 'active');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION',
    '6.2 filed in Dubai by an ENTITLED member it is refused too (got ' || _r || ')');

  _r := pg_temp.file_as(_global, 'INTL_ASIS_PSP', 'GB', NULL, 'draft');
  PERFORM pg_temp.ok(_r = 'SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION',
    '6.3 and as a DRAFT it is still refused — the rule is not a completeness rule');

  -- A holder with no entitlement at all is refused as well, by the market gate
  -- that runs first. Both refusals are correct; neither lets the row through.
  _r := pg_temp.file_as(_none, 'INTL_ASIS_PSP', 'AE', 'AE-DU', 'active');
  PERFORM pg_temp.ok(_r <> 'OK',
    '6.3b an unentitled holder is refused too, earlier (got ' || _r || ')');

  -- The correction path: an existing global claim cannot acquire a country.
  _r := pg_temp.as_user(_global,
    format($q$UPDATE public.sp_claims SET jurisdiction_code = 'SE' WHERE id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '6.4 an UPDATE cannot give an existing global claim a country (got ' || _r || ')');

  -- The trust and taxonomy fields the holder never owned are still not theirs.
  _r := pg_temp.as_user(_global,
    format($q$UPDATE public.sp_claims SET assertion_level = 'verified' WHERE id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '6.5 a holder cannot promote their own certification to verified');

  -- And the title stays the definition's.
  _r := pg_temp.as_user(_global,
    format($q$UPDATE public.sp_claims SET title = 'Chief CPP' WHERE id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '6.6 a holder cannot rename a governed certification');

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- manual selection and ?code= resolve identically';
  -- =====================================================================
  -- Both entry paths reach ONE server resolver, which reads the definition by
  -- code. Filing twice from the same definition must therefore produce
  -- byte-identical governed columns; if the two paths could differ, this is
  -- where they would.
  _r := pg_temp.file_canonical(_other, 'INTL_ISACA_CRISC', 'active');
  PERFORM pg_temp.ok(_r = 'OK', '7.1 candidate B records a CRISC');
  _r := pg_temp.file_canonical(_none, 'INTL_ISACA_CRISC', 'active');
  PERFORM pg_temp.ok(_r = 'OK', '7.2 and so does a holder who arrived by deep link');

  PERFORM pg_temp.ok(
    (SELECT count(DISTINCT (claim_type, credential_code, title, jurisdiction_code,
                            sub_jurisdiction_code, assertion_level))
       FROM public.sp_claims WHERE credential_code = 'INTL_ISACA_CRISC') = 1,
    '7.3 both resolutions produce identical governed values');

  -- =====================================================================
  RAISE NOTICE 'GROUP 8 -- trust and lifecycle are different questions';
  -- =====================================================================
  -- Through the ONLY write path a holder has. Not an INSERT: `authenticated`
  -- holds no INSERT on this table, and GROUP 8b proves that by trying.
  _r := pg_temp.as_user(_global, format(
    $q$SELECT public.sp_certification_lifecycle_declare(
         '%s'::uuid, DATE '2024-05-01', DATE '2027-05-01',
         'recertification_due', 'active', DATE '2026-09-12')$q$, _cpp));
  PERFORM pg_temp.ok(_r = 'OK', '8.1 a holder records their own dated standing');

  PERFORM pg_temp.ok(
    (SELECT holder_lifecycle_status FROM public.sp_claim_certification_lifecycle
      WHERE claim_id = _cpp) = 'active'
    AND (SELECT cycle_ends_on FROM public.sp_claim_certification_lifecycle
          WHERE claim_id = _cpp) = DATE '2027-05-01',
    '8.1b and the statement is stored exactly as they made it');

  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _cpp) = 'self_declared',
    '8.2 and the claim''s TRUST level is untouched by it');

  -- A status with no as-of date is a claim about the present nobody checked.
  _r := pg_temp.as_user(_global, format(
    $q$SELECT public.sp_certification_lifecycle_declare(
         '%s'::uuid, NULL, NULL, 'unknown', 'lapsed', NULL)$q$, _cpp));
  PERFORM pg_temp.ok(_r = 'REFUSED: SP_CERTIFICATION_LIFECYCLE_STATUS_UNDATED',
    '8.3 a status must say when it was true');

  -- And the refusal changed nothing.
  PERFORM pg_temp.ok(
    (SELECT holder_lifecycle_status FROM public.sp_claim_certification_lifecycle
      WHERE claim_id = _cpp) = 'active',
    '8.3b and a refused statement leaves the previous one standing');

  -- Document review is not issuer confirmation, and NEITHER is reachable: the
  -- write path has no parameter for the source and hardcodes holder_declared.
  PERFORM pg_temp.ok(
    (SELECT status_source FROM public.sp_claim_certification_lifecycle
      WHERE claim_id = _cpp) = 'holder_declared',
    '8.4 a holder''s statement is recorded as the holder''s own, always');

  PERFORM pg_temp.ok(
    (SELECT issuer_confirmed_at IS NULL AND issuer_confirmed_source_url IS NULL
       FROM public.sp_claim_certification_lifecycle WHERE claim_id = _cpp),
    '8.4b with no issuer attribution, because a holder cannot supply one');

  -- The programme's cycle never becomes the holder's date.
  PERFORM pg_temp.ok(
    (SELECT maintenance_cycle_months FROM public.sp_certification_definitions
      WHERE credential_code = 'INTL_ACFE_CFE') IS NULL,
    '8.5 an annual-compliance programme publishes no cycle, and none is invented');

  PERFORM pg_temp.ok(
    (SELECT maintenance_policy_type FROM public.sp_certification_definitions
      WHERE credential_code = 'INTL_ACFE_CFE') = 'annual_compliance',
    '8.6 and it is typed as annual compliance, not as a three-year expiry');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_certification_definitions d
       JOIN public.sp_certification_issuers i ON i.id = d.issuer_id
      WHERE i.issuer_code = 'ISACA'
        AND d.maintenance_policy_type = 'cycle_plus_annual_maintenance') = 3,
    '8.7 ISACA is annual-plus-cycle: the printed three-year date is not current standing');

  -- The holder has no valid_until on the claim itself, and nothing computed one.
  PERFORM pg_temp.ok(
    (SELECT valid_until FROM public.sp_claims WHERE id = _cpp) IS NULL,
    '8.8 the CLAIM carries no expiry: a recertification cycle is not one');

  -- A lifecycle row may not attach to a national credential, and the write
  -- path says so by name rather than by a generic privilege error.
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _se AND credential_code = 'VU1';
  _r := pg_temp.as_user(_se, format(
    $q$SELECT public.sp_certification_lifecycle_declare('%s'::uuid)$q$, _claim));
  PERFORM pg_temp.ok(_r = 'REFUSED: SP_CERTIFICATION_LIFECYCLE_NOT_GLOBAL',
    '8.9 the certification lifecycle model does not attach to a Swedish credential');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.sp_claim_certification_lifecycle WHERE claim_id = _claim),
    '8.9b and the refusal wrote nothing');

  -- =====================================================================
  RAISE NOTICE 'GROUP 8b -- a holder cannot forge who established their standing';
  -- =====================================================================
  -- THE DEFECT THIS GROUP EXISTS FOR. The first version of this migration gave
  -- `authenticated` whole-row INSERT and UPDATE on the lifecycle table behind a
  -- FOR ALL owner policy. The policy proved the ROW was the caller's and the
  -- trigger proved the CLAIM was the caller's; nothing proved the caller was
  -- entitled to set `status_source`. A holder could therefore write
  -- 'issuer_confirmed' with a timestamp and an https:// URL of their choosing
  -- and the Passport would carry an issuer confirmation no issuer ever made.
  --
  -- The old 8.4 tried `issuer_confirmed` WITHOUT the two attribution fields and
  -- watched the constraint refuse it. That proved the row shape. The forgery
  -- that worked supplied both fields, and nothing tried it. Independent review
  -- found it. Every assertion below is that missing attempt, and each one is
  -- written to SUCCEED against the defect if the privileges ever come back.

  -- A SECOND global certification of their own, so "move the row to another
  -- claim" below is a move between two claims the caller genuinely holds —
  -- the case ownership checks cannot catch.
  PERFORM pg_temp.ok(
    pg_temp.file_canonical(_global, 'INTL_ISACA_CISM', 'active') = 'OK',
    '8b.0 the same holder records a second international certification');
  SELECT id INTO _claim FROM public.sp_claims
   WHERE holder_user_id = _global AND credential_code = 'INTL_ISACA_CISM';
  PERFORM pg_temp.ok(_claim IS NOT NULL, '8b.0b and it is the claim the moves below target');

  -- 1. No direct INSERT, at all.
  _r := pg_temp.as_user(_global, format(
    $q$INSERT INTO public.sp_claim_certification_lifecycle (claim_id, holder_user_id)
        VALUES ('%s', '%s')$q$, _claim, _global));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '8b.1 a holder cannot INSERT a lifecycle row directly, even their own');

  -- 2. No direct UPDATE of the row they legitimately created in 8.1.
  _r := pg_temp.as_user(_global, format(
    $q$UPDATE public.sp_claim_certification_lifecycle
          SET holder_lifecycle_status = 'retired', status_as_of = current_date
        WHERE claim_id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '8b.2 nor UPDATE their own lifecycle row directly');

  -- 3. `document_reviewed` — CQrityjob reading a certificate, which a holder
  --    is not.
  _r := pg_temp.as_user(_global, format(
    $q$UPDATE public.sp_claim_certification_lifecycle
          SET status_source = 'document_reviewed' WHERE claim_id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '8b.3 nor declare that a document was reviewed');

  -- 4. THE FORGERY THAT USED TO WORK: fully populated issuer confirmation.
  _r := pg_temp.as_user(_global, format(
    $q$UPDATE public.sp_claim_certification_lifecycle
          SET status_source = 'issuer_confirmed',
              issuer_confirmed_at = now(),
              issuer_confirmed_source_url = 'https://isc2.org/verify/forged'
        WHERE claim_id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '8b.4 nor forge a COMPLETE issuer confirmation with a time and an https source');

  PERFORM pg_temp.ok(
    (SELECT status_source FROM public.sp_claim_certification_lifecycle
      WHERE claim_id = _cpp) = 'holder_declared'
    AND (SELECT issuer_confirmed_source_url FROM public.sp_claim_certification_lifecycle
          WHERE claim_id = _cpp) IS NULL,
    '8b.4b and the row still says holder_declared with no issuer attribution');

  -- 5. The constraint defect: for a non-issuer source, ONE issuer field was
  --    enough to satisfy an equivalence that was meant to forbid both.
  --    Asserted as the table owner, so it is the CONSTRAINT being tested and
  --    not the grant.
  BEGIN
    UPDATE public.sp_claim_certification_lifecycle
       SET issuer_confirmed_at = now() WHERE claim_id = _cpp;
    PERFORM pg_temp.ok(false,
      '8b.5 a holder_declared row ACCEPTED an issuer-confirmation timestamp');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true,
      '8b.5 a non-issuer source may not carry an issuer-confirmation time, even alone');
  END;

  BEGIN
    UPDATE public.sp_claim_certification_lifecycle
       SET issuer_confirmed_source_url = 'https://isc2.org/verify/forged'
     WHERE claim_id = _cpp;
    PERFORM pg_temp.ok(false,
      '8b.5b a holder_declared row ACCEPTED an issuer-confirmation source URL');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.ok(true,
      '8b.5b nor an issuer-confirmation source URL, even alone');
  END;

  -- 6. Identity and audit columns are not the caller's to move.
  _r := pg_temp.as_user(_global, format(
    $q$UPDATE public.sp_claim_certification_lifecycle
          SET claim_id = '%s' WHERE claim_id = '%s'$q$, _claim, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '8b.6 nor move the statement onto another credential of their own');

  _r := pg_temp.as_user(_global, format(
    $q$UPDATE public.sp_claim_certification_lifecycle
          SET holder_user_id = '%s' WHERE claim_id = '%s'$q$, _other, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '8b.7 nor rewrite whose statement it is');

  _r := pg_temp.as_user(_global, format(
    $q$UPDATE public.sp_claim_certification_lifecycle
          SET created_at = TIMESTAMPTZ '2019-01-01' WHERE claim_id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '8b.8 nor backdate when they first made it');

  -- 7. Another holder's claim, through the write path itself. The refusal must
  --    be the SAME as for a claim that does not exist, or the function answers
  --    "does holder B hold claim X?" for any X.
  SELECT id INTO _claim FROM public.sp_claims WHERE holder_user_id = _other LIMIT 1;
  _r := pg_temp.as_user(_global, format(
    $q$SELECT public.sp_certification_lifecycle_declare('%s'::uuid)$q$, _claim));
  PERFORM pg_temp.ok(_r = 'REFUSED: SP_CERTIFICATION_LIFECYCLE_CLAIM_NOT_YOURS',
    '8b.9 nor write lifecycle data for another holder''s claim');

  _r := pg_temp.as_user(_global,
    $q$SELECT public.sp_certification_lifecycle_declare(
         '00000000-0000-0000-0000-000000000000'::uuid)$q$);
  PERFORM pg_temp.ok(_r = 'REFUSED: SP_CERTIFICATION_LIFECYCLE_CLAIM_NOT_YOURS',
    '8b.10 and a claim that does not exist is refused identically, so the write path cannot enumerate');

  -- 8. What the holder legitimately CAN do: correct their own statement,
  --    without the row changing identity underneath them.
  SELECT to_jsonb(l) INTO _payload FROM public.sp_claim_certification_lifecycle l
   WHERE claim_id = _cpp;
  _r := pg_temp.as_user(_global, format(
    $q$SELECT public.sp_certification_lifecycle_declare(
         '%s'::uuid, DATE '2024-05-01', DATE '2028-05-01',
         'recertification_due', 'lapsed', DATE '2026-09-13')$q$, _cpp));
  PERFORM pg_temp.ok(_r = 'OK', '8b.11 a holder corrects their own statement');

  PERFORM pg_temp.ok(
    (SELECT holder_lifecycle_status FROM public.sp_claim_certification_lifecycle
      WHERE claim_id = _cpp) = 'lapsed'
    AND (SELECT cycle_ends_on FROM public.sp_claim_certification_lifecycle
          WHERE claim_id = _cpp) = DATE '2028-05-01',
    '8b.12 and the correction took');

  PERFORM pg_temp.ok(
    (SELECT created_at FROM public.sp_claim_certification_lifecycle WHERE claim_id = _cpp)
      = (_payload ->> 'created_at')::timestamptz
    AND (SELECT holder_user_id FROM public.sp_claim_certification_lifecycle WHERE claim_id = _cpp)
      = (_payload ->> 'holder_user_id')::uuid
    AND (SELECT count(*) FROM public.sp_claim_certification_lifecycle
          WHERE claim_id = _cpp) = 1,
    '8b.13 while claim_id, holder_user_id and created_at are preserved exactly');

  PERFORM pg_temp.ok(
    (SELECT status_source FROM public.sp_claim_certification_lifecycle
      WHERE claim_id = _cpp) = 'holder_declared',
    '8b.14 and a correction is still the holder''s own statement');

  -- 9. The trust level never moves, whatever the lifecycle says.
  PERFORM pg_temp.ok(
    (SELECT assertion_level FROM public.sp_claims WHERE id = _cpp) = 'self_declared',
    '8b.15 and none of it has changed the claim''s assertion_level');

  -- 10. The privileges and the policy themselves, read off the catalogue.
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.sp_claim_certification_lifecycle', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.sp_claim_certification_lifecycle', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.sp_claim_certification_lifecycle', 'DELETE'),
    '8b.16 no application role holds INSERT, UPDATE or DELETE on the lifecycle table');

  PERFORM pg_temp.ok(
    has_table_privilege('authenticated', 'public.sp_claim_certification_lifecycle', 'SELECT'),
    '8b.17 and the holder keeps SELECT, because it is their own record');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_policy
      WHERE polrelid = 'public.sp_claim_certification_lifecycle'::regclass
        AND polcmd <> 'r') = 0,
    '8b.18 and every policy on it is SELECT-only');

  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon',
      'public.sp_certification_lifecycle_declare(uuid,date,date,text,text,date)', 'EXECUTE'),
    '8b.19 anon cannot execute the write path');

  PERFORM pg_temp.ok(
    NOT has_table_privilege('anon', 'public.sp_claim_certification_lifecycle', 'SELECT'),
    '8b.20 nor read the table');

  PERFORM pg_temp.ok(
    (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'sp_certification_lifecycle_declare')
    AND EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'sp_certification_lifecycle_declare'
         AND p.proconfig IS NOT NULL
         AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%')),
    '8b.21 and the write path is SECURITY DEFINER with a fixed search_path');

  -- 11. A session with no JWT subject reaches none of it. `authenticated` is
  --     the role PostgREST uses for a request whose token it accepted; a
  --     request with no subject claim still arrives, and auth.uid() is NULL.
  --     The function refuses before it reads anything.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.sp_certification_lifecycle_declare(_cpp);
    RESET ROLE;
    PERFORM pg_temp.ok(false, '8b.22 a caller with no JWT subject was ACCEPTED');
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    PERFORM pg_temp.ok(true, '8b.22 and a caller with no JWT subject is refused outright');
  END;
  PERFORM set_config('request.jwt.claim.sub', _global::text, true);

  -- =====================================================================
  RAISE NOTICE 'GROUP 9 -- an inactive definition: readable, not selectable';
  -- =====================================================================
  UPDATE public.sp_credential_types SET is_active = false WHERE code = 'INTL_ASIS_APP';

  -- The holder who ALREADY holds one can still see the definition — the
  -- catalogue policy says so — and is refused on availability.
  _r := pg_temp.file_canonical(_gb, 'INTL_ASIS_APP', 'active');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_NOT_AVAILABLE',
    '9.1 a deactivated definition cannot be newly claimed (got ' || _r || ')');

  -- A holder who never claimed it cannot see it at all, so their refusal is
  -- the earlier "unknown". Both are refusals; this one reveals less, and it is
  -- 20261109090000's catalogue policy rather than anything this phase added.
  _r := pg_temp.file_canonical(_none, 'INTL_ASIS_APP', 'active');
  PERFORM pg_temp.ok(_r <> 'OK',
    '9.1b and a holder who never claimed it is refused too (got ' || _r || ')');

  -- The holder who already has one keeps it, and keeps being able to read it.
  _b := pg_temp.count_as(_gb,
    $q$SELECT count(*) FROM public.sp_credential_types WHERE code = 'INTL_ASIS_APP'$q$);
  PERFORM pg_temp.ok(_b = 1,
    '9.2 and a holder who already claimed it can still read its definition');

  _b := pg_temp.count_as(_gb,
    $q$SELECT count(*) FROM public.sp_claims WHERE credential_code = 'INTL_ASIS_APP'$q$);
  PERFORM pg_temp.ok(_b = 1, '9.3 and their existing claim survives untouched');

  UPDATE public.sp_credential_types SET is_active = true WHERE code = 'INTL_ASIS_APP';

  -- =====================================================================
  RAISE NOTICE 'GROUP 10 -- isolation: candidate A cannot reach candidate B';
  -- =====================================================================
  _b := pg_temp.count_as(_other,
    format($q$SELECT count(*) FROM public.sp_claims WHERE holder_user_id = '%s'$q$, _global));
  PERFORM pg_temp.ok(_b = 0, '10.1 candidate B cannot read candidate A''s claims');

  _b := pg_temp.count_as(_other,
    format($q$SELECT count(*) FROM public.sp_claim_certification_lifecycle
               WHERE holder_user_id = '%s'$q$, _global));
  PERFORM pg_temp.ok(_b = 0, '10.2 nor their certification lifecycle rows');

  _r := pg_temp.as_user(_other, format(
    $q$UPDATE public.sp_claim_certification_lifecycle
          SET holder_lifecycle_status = 'revoked', status_as_of = current_date
        WHERE claim_id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(
    (SELECT holder_lifecycle_status FROM public.sp_claim_certification_lifecycle
      WHERE claim_id = _cpp) = 'lapsed',
    '10.3 candidate B cannot revoke candidate A''s certification standing');

  _r := pg_temp.as_user(_other, format(
    $q$DELETE FROM public.sp_claim_certification_lifecycle WHERE claim_id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_claim_certification_lifecycle WHERE claim_id = _cpp),
    '10.4 nor delete it');

  -- And neither can its OWNER, by grant rather than by policy. Phase 8's rule:
  -- removal is withdrawal, and history is not erasable. A holder who no longer
  -- stands behind a statement corrects it to `unknown`.
  PERFORM pg_temp.ok(
    NOT has_table_privilege('authenticated', 'public.sp_claim_certification_lifecycle', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.sp_claim_certification_lifecycle', 'DELETE'),
    '10.6 no application role holds DELETE on the lifecycle table at all');

  _r := pg_temp.as_user(_global, format(
    $q$DELETE FROM public.sp_claim_certification_lifecycle WHERE claim_id = '%s'$q$, _cpp));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '10.7 so even the owner cannot erase their own statement (got ' || _r || ')');

  -- Through the write path, because a holder holds no UPDATE either.
  _r := pg_temp.as_user(_global, format(
    $q$SELECT public.sp_certification_lifecycle_declare('%s'::uuid)$q$, _cpp));
  PERFORM pg_temp.ok(
    _r = 'OK'
    AND (SELECT holder_lifecycle_status FROM public.sp_claim_certification_lifecycle
          WHERE claim_id = _cpp) = 'unknown',
    '10.8 they correct it back to `unknown` instead — the honest state');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.sp_claim_certification_lifecycle WHERE claim_id = _cpp),
    '10.9 and the record itself is still there, which is the point of not deleting');

  -- Nor attach their own lifecycle row to somebody else's claim.
  _r := pg_temp.as_user(_other, format(
    $q$INSERT INTO public.sp_claim_certification_lifecycle (claim_id, holder_user_id)
        VALUES ('%s', '%s')$q$, _cpp, _other));
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '10.5 nor attach their own lifecycle row to another holder''s claim');

  -- =====================================================================
  RAISE NOTICE 'GROUP 11 -- the catalogue is not holder-writable, and anon sees none of it';
  -- =====================================================================
  _r := pg_temp.as_user(_global,
    $q$INSERT INTO public.sp_certification_issuers
         (issuer_code, display_name, official_url, verification_mode, source_reviewed_on)
       VALUES ('FAKE', 'Fake Institute', 'https://fake.invalid/', 'none', current_date)$q$);
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%', '11.1 a holder cannot create an issuer');

  _r := pg_temp.as_user(_global,
    $q$UPDATE public.sp_certification_issuers SET display_name = 'Renamed'$q$);
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%', '11.2 a holder cannot rename an issuer');

  _r := pg_temp.as_user(_global,
    $q$UPDATE public.sp_credential_types SET scope_code = 'global_professional'
        WHERE code = 'VU1'$q$);
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%',
    '11.3 a holder cannot declare their own credential international');

  _r := pg_temp.as_user(_global,
    $q$INSERT INTO public.sp_certification_sources
         (issuer_id, source_kind, title, url, reviewed_on, reviewed_by)
       SELECT id, 'programme', 'x', 'https://x.invalid/', current_date, 'x'
         FROM public.sp_certification_issuers LIMIT 1$q$);
  PERFORM pg_temp.ok(_r LIKE 'REFUSED%', '11.4 a holder cannot add a reviewed source');

  PERFORM pg_temp.ok(
    NOT has_table_privilege('anon', 'public.sp_certification_issuers', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.sp_certification_definitions', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.sp_certification_sources', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.sp_certification_issuer_aliases', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.sp_credential_scopes', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.sp_claim_certification_lifecycle', 'SELECT'),
    '11.5 anonymous holds no grant on any new table');

  PERFORM pg_temp.ok(
    NOT has_table_privilege('anon', 'public.sp_claims', 'SELECT'),
    '11.6 and still none on sp_claims');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('sp_credential_scopes','sp_certification_issuers',
                          'sp_certification_issuer_aliases','sp_certification_sources',
                          'sp_certification_definitions','sp_claim_certification_lifecycle')
        AND rowsecurity) = 6,
    '11.7 row level security is enabled on all six new tables');

  -- =====================================================================
  RAISE NOTICE 'GROUP 12 -- the private credential reference stays private';
  -- =====================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _global::text, true);
  UPDATE public.sp_claims SET credential_reference = 'CPP-SECRET-4711' WHERE id = _cpp;
  RESET ROLE;
  PERFORM pg_temp.ok(
    (SELECT credential_reference FROM public.sp_claims WHERE id = _cpp) = 'CPP-SECRET-4711',
    '12.1 the owner records a private reference');

  _b := pg_temp.count_as(_other,
    $q$SELECT count(*) FROM public.sp_claims WHERE credential_reference = 'CPP-SECRET-4711'$q$);
  PERFORM pg_temp.ok(_b = 0, '12.2 another candidate cannot read it');

  -- The disclosure projection. Built with a column allowlist, and this is the
  -- assertion that the allowlist does not name the reference.
  INSERT INTO public.sp_disclosures
    (holder_user_id, package_code, purpose, locale, expires_at, token_hash)
  VALUES (_global, 'public_card', 'Fixture', 'sv', now() + interval '1 day',
          encode(digest('intl-fixture-token', 'sha256'), 'hex'))
  RETURNING id INTO _disclosure;

  _payload := public.sp_disclosure_payload(_disclosure);
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%CPP-SECRET-4711%',
    '12.3 the disclosure payload carries no private reference VALUE');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%credential_reference%',
    '12.4 and carries no credential_reference KEY at all');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%holder_note%',
    '12.5 nor the holder note');

  _payload := public.sp_selected_merits_payload(
    _global, ARRAY[_cpp]::uuid[], '{}'::uuid[], 'Fixture', 'sv',
    now() + interval '1 day', now());
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%CPP-SECRET-4711%',
    '12.6 the selected-merits payload carries no private reference either');
  PERFORM pg_temp.ok(_payload::text NOT LIKE '%credential_reference%',
    '12.7 and no credential_reference key');

  DELETE FROM public.sp_disclosures WHERE id = _disclosure;

  -- =====================================================================
  RAISE NOTICE 'GROUP 13 -- free text is never upgraded';
  -- =====================================================================
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = _se AND credential_code IS NULL) = 3,
    '13.1 the three free-text rows are still free text');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE holder_user_id = _se AND title IN ('CPP','CISSP')
        AND credential_code IS NOT NULL) = 0,
    '13.2 "CPP" and "CISSP" did not acquire a governed code');

  PERFORM pg_temp.ok(
    (SELECT jsonb_agg(to_jsonb(c) - 'id' - 'created_at' - 'updated_at' ORDER BY c.title)
       FROM public.sp_claims c
      WHERE c.holder_user_id = _se AND c.credential_code IS NULL) = _legacy_before,
    '13.3 and every column of all three is byte-for-byte what it was');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims
      WHERE claimed_issuer_name IN ('ASIS','ISC2') AND credential_code IS NOT NULL) = 0,
    '13.4 a matching ISSUER NAME upgraded nothing either');

  -- =====================================================================
  RAISE NOTICE 'GROUP 14 -- PR #222 is preserved: SE, GB and AE-DU are unchanged';
  -- =====================================================================
  PERFORM pg_temp.ok(
    (SELECT to_jsonb(c) - 'id' - 'created_at' - 'updated_at'
       FROM public.sp_claims c
      WHERE c.holder_user_id = _se AND c.credential_code = 'VU1') = _se_before,
    '14.1 the Swedish claim is byte-for-byte what it was before the catalogue');

  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code FROM public.sp_claims
      WHERE holder_user_id = _se AND credential_code = 'VU1') = 'SE',
    '14.2 a Swedish credential is still Swedish');

  -- The holder moves to Dubai. Nothing is rewritten.
  INSERT INTO public.sp_passport_profiles (holder_user_id, jurisdiction_code, sub_jurisdiction_code)
  VALUES (_se, 'AE', 'AE-DU')
  ON CONFLICT (holder_user_id) DO UPDATE
    SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-DU';

  PERFORM pg_temp.ok(
    (SELECT to_jsonb(c) - 'id' - 'created_at' - 'updated_at'
       FROM public.sp_claims c
      WHERE c.holder_user_id = _se AND c.credential_code = 'VU1') = _se_before,
    '14.3 changing work country rewrote NOTHING — not the credential, not the free text');

  -- And their CPP-titled free-text row still did not become a CPP.
  PERFORM pg_temp.ok(
    (SELECT jsonb_agg(to_jsonb(c) - 'id' - 'created_at' - 'updated_at' ORDER BY c.title)
       FROM public.sp_claims c
      WHERE c.holder_user_id = _se AND c.credential_code IS NULL) = _legacy_before,
    '14.4 nor the free-text rows');

  -- The GB and Dubai pilot behaviour, unchanged.
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_gb, 'GB', 'global certification suite');
  PERFORM public.sp_grant_pilot_member(_gb, 'AE-DU', 'global certification suite');

  _r := pg_temp.file_canonical(_gb, 'UK_SIA_LICENCE_DS', 'active');
  PERFORM pg_temp.ok(_r = 'OK', '14.5 an entitled GB member still records a SIA licence');
  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code FROM public.sp_claims
      WHERE holder_user_id = _gb AND credential_code = 'UK_SIA_LICENCE_DS') = 'GB',
    '14.6 attached to its own governed UK jurisdiction');

  _r := pg_temp.file_as(_gb, 'UK_SIA_LICENCE_DS', 'SE', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_NOT_AVAILABLE',
    '14.7 THE PR #222 DEFECT: a British licence filed in Sweden is still refused (got ' || _r || ')');

  _r := pg_temp.file_canonical(_gb, 'AE_DU_SIRA_CARD_GUARD', 'active');
  PERFORM pg_temp.ok(_r = 'OK', '14.8 an entitled Dubai member still records a SIRA cadre card');
  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code = 'AE' AND sub_jurisdiction_code = 'AE-DU'
       FROM public.sp_claims
      WHERE holder_user_id = _gb AND credential_code = 'AE_DU_SIRA_CARD_GUARD'),
    '14.9 with AE / AE-DU retained correctly');

  _r := pg_temp.file_as(_gb, 'AE_DU_SIRA_CARD_GUARD', 'AE', NULL, 'active');
  PERFORM pg_temp.ok(_r = 'SP_SUB_JURISDICTION_REQUIRED',
    '14.10 and a Dubai card with no emirate is still refused (got ' || _r || ')');

  -- No market was activated by any of this.
  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  PERFORM pg_temp.ok(_n = 1, '14.11 Sweden is still the only active market pack');

  SELECT count(*) INTO _n FROM public.sp_credential_types
   WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active;
  PERFORM pg_temp.ok(_n = 0, '14.12 and no pilot credential became publicly active');

  -- =====================================================================
  RAISE NOTICE 'GROUP 15 -- the international certification travels';
  -- =====================================================================
  -- The holder who recorded a CPP in Sweden is now in Dubai. The certification
  -- is unchanged, still has no country, and is still theirs.
  INSERT INTO public.sp_passport_profiles (holder_user_id, jurisdiction_code, sub_jurisdiction_code)
  VALUES (_global, 'AE', 'AE-DU')
  ON CONFLICT (holder_user_id) DO UPDATE
    SET jurisdiction_code = 'AE', sub_jurisdiction_code = 'AE-DU';

  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code IS NULL AND sub_jurisdiction_code IS NULL
       FROM public.sp_claims WHERE id = _cpp),
    '15.1 the CPP still carries no country after the holder moves');

  PERFORM pg_temp.ok(
    (SELECT lifecycle_state FROM public.sp_claims WHERE id = _cpp) = 'active',
    '15.2 and is still active');

  -- It grants nothing in Dubai, because it contributes to nothing that could.
  PERFORM pg_temp.ok(
    (SELECT NOT (contributes_to && ARRAY['local_eligibility','active_title']::text[])
       FROM public.sp_credential_types WHERE code = 'INTL_ASIS_CPP'),
    '15.3 and creates neither local eligibility nor a professional title there');

  -- No title rule anywhere may name a global certification: the cross-market
  -- integrity trigger refuses a rule whose credential has no market pack.
  BEGIN
    INSERT INTO public.sp_professional_titles
      (code, market_pack_code, name_local, name_en, requires_credential_codes)
    VALUES ('INTL_FORGED_TITLE', 'SE', 'Internationell vakt', 'International guard',
            ARRAY['INTL_ASIS_CPP']::text[]);
    PERFORM pg_temp.ok(false, '15.4 a title rule naming a CPP was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.ok(true,
      '15.4 no professional-title rule can name an international certification');
  END;

  -- ── Cleanup ────────────────────────────────────────────────────────
  DELETE FROM public.sp_claim_certification_lifecycle
   WHERE holder_user_id IN (_global, _se, _gb, _none, _odd, _other);
  DELETE FROM public.sp_passport_events
   WHERE holder_user_id IN (_global, _se, _gb, _none, _odd, _other);
  DELETE FROM public.sp_claims
   WHERE holder_user_id IN (_global, _se, _gb, _none, _odd, _other);
  DELETE FROM public.sp_pilot_members WHERE user_id IN (_gb, _global);
  DELETE FROM public.sp_passport_profiles
   WHERE holder_user_id IN (_global, _se, _gb, _none, _odd, _other);
  DELETE FROM public.user_roles WHERE user_id = _admin;
  DELETE FROM auth.users WHERE id IN (_global, _se, _gb, _none, _odd, _other, _admin);

  RAISE NOTICE 'security_passport_global_certification_test: complete';
END $$;
