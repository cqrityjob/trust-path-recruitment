-- =============================================================================
-- Security Passport -- languages and practical skills, driven by the taxonomy.
--
-- Run against a disposable Postgres with the full migration history replayed
-- (scripts/db-test.sh). Every assertion RAISEs on failure, so a non-zero psql
-- exit means "do not merge".
--
-- ── THE DEFECT THIS SUITE EXISTS FOR ────────────────────────────────────
--
-- `listSkillTypes` requested every column of `sp_skill_types` EXCEPT
-- `allowed_levels`, while the mapper below it still read that field. The
-- column never arrived, so every type came back with an empty scale, the
-- level field never rendered, and the browser sent skill_level = NULL for
-- everything. `sp_claims_skill_rules` then refused every type that HAS a
-- scale -- all 19 languages, Körkort, Truckkort, Liftkort and ADR -- with
-- SP_SKILL_LEVEL_REQUIRED. HLR, the single type whose scale is legitimately
-- empty, was the only entry a holder could save, which is exactly what the
-- owner reported.
--
-- A per-skill test list would not have caught it either, because it would
-- have been written from the same assumption. So this suite iterates the
-- TAXONOMY: every active row must be saveable through its own declared
-- rules, and a new row added later is covered the day it is inserted.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
--
-- It never grants trust. Every row it writes is self-declared, and the
-- assertions prove that a holder cannot reach VERIFIED.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Synthetic holder. No real person, email or credential appears in this file.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES ('11111111-2222-3333-4444-555555555555', 'sp-skill-suite@synthetic.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sp_passport_profiles (holder_user_id, display_name, jurisdiction_code)
VALUES ('11111111-2222-3333-4444-555555555555', 'Syntetisk Testperson', 'SE')
ON CONFLICT (holder_user_id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES ('66666666-7777-8888-9999-000000000000', 'sp-skill-verifier@synthetic.test')
ON CONFLICT (id) DO NOTHING;

DO $suite$
DECLARE
  _holder   uuid := '11111111-2222-3333-4444-555555555555';
  _verifier uuid := '66666666-7777-8888-9999-000000000000';
  _jur      text;
  _t        record;
  _lvl      text;
  _id       uuid;
  _n        integer := 0;
  _asserts  integer := 0;
  _langs    integer := 0;
  _skills   integer := 0;
  _got      text;
BEGIN
  SELECT code INTO _jur FROM public.sp_jurisdictions WHERE is_active LIMIT 1;
  IF _jur IS NULL THEN RAISE EXCEPTION 'FIXTURE: no active jurisdiction to test with'; END IF;

  -- =========================================================================
  -- 1. The taxonomy is present and non-trivial.
  -- =========================================================================
  SELECT count(*) INTO _n FROM public.sp_skill_types WHERE is_active;
  IF _n = 0 THEN
    RAISE EXCEPTION 'SP_SKILL_TAXONOMY_EMPTY: no active sp_skill_types -- Phase 11 missing?';
  END IF;
  _asserts := _asserts + 1;

  -- The regression guard proper. A scale that is empty for EVERY row is the
  -- shape the bug produced downstream; at least one type must declare levels.
  SELECT count(*) INTO _n
  FROM public.sp_skill_types WHERE is_active AND cardinality(allowed_levels) > 0;
  IF _n = 0 THEN
    RAISE EXCEPTION 'SP_SKILL_NO_SCALED_TYPE: every active type has an empty allowed_levels';
  END IF;
  _asserts := _asserts + 1;

  -- =========================================================================
  -- 2. EVERY active taxonomy row saves through its own declared rules.
  --    Table-driven: a row inserted next year is covered automatically.
  -- =========================================================================
  FOR _t IN
    SELECT * FROM public.sp_skill_types WHERE is_active ORDER BY claim_type, sort_order
  LOOP
    -- The level the form would offer: the first value on the declared scale,
    -- or NULL where the type has no scale at all.
    _lvl := CASE WHEN cardinality(_t.allowed_levels) > 0 THEN _t.allowed_levels[1] ELSE NULL END;

    INSERT INTO public.sp_claims (
      holder_user_id, claim_type, skill_code, skill_level, title,
      jurisdiction_code, valid_until
    ) VALUES (
      _holder, _t.claim_type, _t.code, _lvl, _t.name_sv,
      CASE WHEN _t.requires_jurisdiction THEN _jur ELSE NULL END,
      CASE WHEN _t.requires_valid_until THEN current_date + 365 ELSE NULL END
    ) RETURNING id INTO _id;

    -- Read-back: stored code and level must be exactly what was declared.
    SELECT skill_level INTO _got FROM public.sp_claims WHERE id = _id;
    IF _lvl IS DISTINCT FROM _got THEN
      RAISE EXCEPTION 'SP_SKILL_READBACK_LEVEL: % stored % expected %', _t.code, _got, _lvl;
    END IF;

    -- A holder-created entry is self-declared and unverified. Always.
    PERFORM 1 FROM public.sp_claims
      WHERE id = _id AND assertion_level = 'self_declared'
        AND lifecycle_state = 'active'
        AND verified_by_user_id IS NULL AND verified_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SP_SKILL_TRUST_LEAK: % was not created self-declared/unverified', _t.code;
    END IF;

    IF _t.claim_type = 'language' THEN _langs := _langs + 1; ELSE _skills := _skills + 1; END IF;
    _asserts := _asserts + 3;
  END LOOP;

  IF _langs = 0 THEN RAISE EXCEPTION 'SP_SKILL_NO_LANGUAGE_ROWS'; END IF;
  IF _skills = 0 THEN RAISE EXCEPTION 'SP_SKILL_NO_PRACTICAL_ROWS'; END IF;

  -- =========================================================================
  -- 3. EVERY value on EVERY scale is accepted, and off-scale values are not.
  -- =========================================================================
  FOR _t IN
    SELECT * FROM public.sp_skill_types
    WHERE is_active AND cardinality(allowed_levels) > 0
    ORDER BY code
  LOOP
    FOREACH _lvl IN ARRAY _t.allowed_levels LOOP
      BEGIN
        INSERT INTO public.sp_claims (
          holder_user_id, claim_type, skill_code, skill_level, title,
          jurisdiction_code, valid_until, lifecycle_state
        ) VALUES (
          _holder, _t.claim_type, _t.code, _lvl, _t.name_sv,
          CASE WHEN _t.requires_jurisdiction THEN _jur ELSE NULL END,
          CASE WHEN _t.requires_valid_until THEN current_date + 365 ELSE NULL END,
          'draft'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'SP_SKILL_SCALE_VALUE_REJECTED: % refused its own level % (%)',
          _t.code, _lvl, SQLERRM;
      END;
      _asserts := _asserts + 1;
    END LOOP;

    -- Off-scale is refused.
    BEGIN
      INSERT INTO public.sp_claims (holder_user_id, claim_type, skill_code, skill_level, title)
      VALUES (_holder, _t.claim_type, _t.code, '__not_on_scale__', _t.name_sv);
      RAISE EXCEPTION 'SP_SKILL_OFFSCALE_ACCEPTED: % accepted a level off its scale', _t.code;
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%SP_SKILL_OFFSCALE_ACCEPTED%' THEN RAISE; END IF;
    END;
    _asserts := _asserts + 1;

    -- A missing level is refused for anything that HAS a scale. This is the
    -- exact payload the broken UI produced, and the reason nothing saved.
    BEGIN
      INSERT INTO public.sp_claims (
        holder_user_id, claim_type, skill_code, skill_level, title,
        jurisdiction_code, valid_until
      ) VALUES (
        _holder, _t.claim_type, _t.code, NULL, _t.name_sv,
        CASE WHEN _t.requires_jurisdiction THEN _jur ELSE NULL END,
        CASE WHEN _t.requires_valid_until THEN current_date + 365 ELSE NULL END
      );
      RAISE EXCEPTION 'SP_SKILL_NULL_LEVEL_ACCEPTED: % accepted a NULL level', _t.code;
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%SP_SKILL_NULL_LEVEL_ACCEPTED%' THEN RAISE; END IF;
    END;
    _asserts := _asserts + 1;
  END LOOP;

  -- =========================================================================
  -- 4. A level on a scaleless type is refused.
  -- =========================================================================
  FOR _t IN
    SELECT * FROM public.sp_skill_types
    WHERE is_active AND cardinality(allowed_levels) = 0
  LOOP
    BEGIN
      INSERT INTO public.sp_claims (
        holder_user_id, claim_type, skill_code, skill_level, title, valid_until
      ) VALUES (
        _holder, _t.claim_type, _t.code, 'anything', _t.name_sv,
        CASE WHEN _t.requires_valid_until THEN current_date + 365 ELSE NULL END
      );
      RAISE EXCEPTION 'SP_SKILL_LEVEL_ON_SCALELESS_ACCEPTED: %', _t.code;
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%SP_SKILL_LEVEL_ON_SCALELESS_ACCEPTED%' THEN RAISE; END IF;
    END;
    _asserts := _asserts + 1;
  END LOOP;

  -- =========================================================================
  -- 5. Required jurisdiction and required end date are enforced.
  -- =========================================================================
  FOR _t IN
    SELECT * FROM public.sp_skill_types WHERE is_active AND requires_jurisdiction
  LOOP
    _lvl := CASE WHEN cardinality(_t.allowed_levels) > 0 THEN _t.allowed_levels[1] ELSE NULL END;
    BEGIN
      INSERT INTO public.sp_claims (
        holder_user_id, claim_type, skill_code, skill_level, title, jurisdiction_code, valid_until
      ) VALUES (
        _holder, _t.claim_type, _t.code, _lvl, _t.name_sv, NULL,
        CASE WHEN _t.requires_valid_until THEN current_date + 365 ELSE NULL END
      );
      RAISE EXCEPTION 'SP_SKILL_MISSING_JURISDICTION_ACCEPTED: %', _t.code;
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%SP_SKILL_MISSING_JURISDICTION_ACCEPTED%' THEN RAISE; END IF;
    END;
    _asserts := _asserts + 1;

    -- The owner typed "SV" (the language code) into a field wanting "SE".
    -- The FK is the real rule, and it must still be the real rule.
    BEGIN
      INSERT INTO public.sp_claims (
        holder_user_id, claim_type, skill_code, skill_level, title, jurisdiction_code, valid_until
      ) VALUES (
        _holder, _t.claim_type, _t.code, _lvl, _t.name_sv, 'SV',
        CASE WHEN _t.requires_valid_until THEN current_date + 365 ELSE NULL END
      );
      RAISE EXCEPTION 'SP_SKILL_BAD_JURISDICTION_ACCEPTED: % accepted a non-jurisdiction', _t.code;
    EXCEPTION
      WHEN foreign_key_violation THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%SP_SKILL_BAD_JURISDICTION_ACCEPTED%' THEN RAISE; END IF;
    END;
    _asserts := _asserts + 1;
  END LOOP;

  FOR _t IN
    SELECT * FROM public.sp_skill_types WHERE is_active AND requires_valid_until
  LOOP
    _lvl := CASE WHEN cardinality(_t.allowed_levels) > 0 THEN _t.allowed_levels[1] ELSE NULL END;
    BEGIN
      INSERT INTO public.sp_claims (
        holder_user_id, claim_type, skill_code, skill_level, title, jurisdiction_code, valid_until
      ) VALUES (
        _holder, _t.claim_type, _t.code, _lvl, _t.name_sv,
        CASE WHEN _t.requires_jurisdiction THEN _jur ELSE NULL END, NULL
      );
      RAISE EXCEPTION 'SP_SKILL_MISSING_VALID_UNTIL_ACCEPTED: %', _t.code;
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%SP_SKILL_MISSING_VALID_UNTIL_ACCEPTED%' THEN RAISE; END IF;
    END;
    _asserts := _asserts + 1;
  END LOOP;

  -- =========================================================================
  -- 6. Boundaries: a skill is not a credential, and an unknown code is refused.
  -- =========================================================================
  BEGIN
    INSERT INTO public.sp_claims (holder_user_id, claim_type, skill_code, skill_level, title)
    VALUES (_holder, 'language', 'lang_definitely_not_real', 'A1', 'Nope');
    RAISE EXCEPTION 'SP_SKILL_UNKNOWN_CODE_ACCEPTED';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
    WHEN OTHERS THEN IF SQLERRM LIKE '%SP_SKILL_UNKNOWN_CODE_ACCEPTED%' THEN RAISE; END IF;
  END;
  _asserts := _asserts + 1;

  -- A language must never also wear a credential symbol.
  BEGIN
    INSERT INTO public.sp_claims (
      holder_user_id, claim_type, skill_code, credential_code, skill_level, title
    ) VALUES (_holder, 'language', 'lang_sv', 'VU1', 'A1', 'Svenska');
    RAISE EXCEPTION 'SP_SKILL_CREDENTIAL_MIX_ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN IF SQLERRM LIKE '%SP_SKILL_CREDENTIAL_MIX_ACCEPTED%' THEN RAISE; END IF;
  END;
  _asserts := _asserts + 1;

  -- The four taxonomy credentials stay in sp_credential_types, not here.
  SELECT count(*) INTO _n FROM public.sp_skill_types
  WHERE upper(code) IN ('VU1','VU2','OV','SV');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SP_SKILL_CREDENTIAL_DUPLICATED: credential codes leaked into sp_skill_types';
  END IF;
  _asserts := _asserts + 1;

  -- =========================================================================
  -- 7. A holder cannot self-verify.
  -- =========================================================================
  BEGIN
    INSERT INTO public.sp_claims (
      holder_user_id, claim_type, skill_code, skill_level, title,
      assertion_level, verified_by_user_id, verified_at
    ) VALUES (
      _holder, 'language', 'lang_en', 'B2', 'Engelska',
      'verified', _holder, now()
    );
    RAISE EXCEPTION 'SP_SKILL_SELF_VERIFY_ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN IF SQLERRM LIKE '%SP_SKILL_SELF_VERIFY_ACCEPTED%' THEN RAISE; END IF;
  END;
  _asserts := _asserts + 1;

  -- =========================================================================
  -- 8. The vocabulary is read-only to the application.
  -- =========================================================================
  SELECT count(*) INTO _n
  FROM information_schema.role_table_grants
  WHERE table_name = 'sp_skill_types'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SP_SKILL_VOCABULARY_WRITABLE: % write grants on sp_skill_types', _n;
  END IF;
  _asserts := _asserts + 1;

  SELECT count(*) INTO _n
  FROM information_schema.role_table_grants
  WHERE table_name IN ('sp_skill_types','sp_jurisdictions') AND grantee = 'anon';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SP_SKILL_ANON_READABLE: anon holds % grants', _n;
  END IF;
  _asserts := _asserts + 1;

  -- The form reads jurisdictions; authenticated must be able to.
  SELECT count(*) INTO _n
  FROM information_schema.role_table_grants
  WHERE table_name = 'sp_jurisdictions' AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  IF _n = 0 THEN
    RAISE EXCEPTION 'SP_JURISDICTION_UNREADABLE: authenticated cannot SELECT sp_jurisdictions';
  END IF;
  _asserts := _asserts + 1;

  RAISE NOTICE 'sp_skill_taxonomy_test: % assertions over % languages and % practical skills',
    _asserts, _langs, _skills;
END $suite$;

-- ---------------------------------------------------------------------------
-- 9. Correction keeps history: a material correction supersedes rather than
--    destroys, and does not carry verification forward.
-- ---------------------------------------------------------------------------
DO $correction$
DECLARE
  _holder   uuid := '11111111-2222-3333-4444-555555555555';
  _verifier uuid := '66666666-7777-8888-9999-000000000000';
  _orig uuid;
  _new  uuid;
  _n    integer;
BEGIN
  INSERT INTO public.sp_claims (
    holder_user_id, claim_type, skill_code, skill_level, title,
    assertion_level, verified_by_user_id, verified_at
  ) VALUES (
    _holder, 'language', 'lang_de', 'B1', 'Tyska',
    'verified', _verifier, now()
  ) RETURNING id INTO _orig;

  UPDATE public.sp_claims SET lifecycle_state = 'superseded' WHERE id = _orig;

  INSERT INTO public.sp_claims (
    holder_user_id, claim_type, skill_code, skill_level, title, version_no, supersedes_id
  ) VALUES (
    _holder, 'language', 'lang_de', 'C1', 'Tyska', 2, _orig
  ) RETURNING id INTO _new;

  -- The earlier version still exists.
  SELECT count(*) INTO _n FROM public.sp_claims WHERE id = _orig;
  IF _n <> 1 THEN RAISE EXCEPTION 'SP_SKILL_CORRECTION_DESTROYED_HISTORY'; END IF;

  -- The corrected version carries no borrowed verification.
  PERFORM 1 FROM public.sp_claims
    WHERE id = _new AND assertion_level = 'self_declared'
      AND verified_by_user_id IS NULL AND verified_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SP_SKILL_CORRECTION_INHERITED_TRUST';
  END IF;

  RAISE NOTICE 'sp_skill_taxonomy_test: correction/versioning assertions passed';
END $correction$;

ROLLBACK;
