-- Every row the fixture planted is exactly what it was, after the rollback.
--
-- Byte-for-byte, including created_at and updated_at: a rollback that touched
-- a row would move `updated_at`, and a comparison that excluded it would be a
-- comparison designed not to notice.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT _cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', _label; END IF;
  RAISE NOTICE 'ok  %', _label;
END $$;

DO $$
DECLARE
  _se uuid := '11111111-1111-4111-8111-111111111111';
  _gb uuid := '22222222-2222-4222-8222-222222222222';
  _before jsonb;
  _after  jsonb;
BEGIN
  SELECT body INTO _before FROM public.zz_rollback_fixture_snapshot WHERE label = 'claims';
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO _after
    FROM public.sp_claims c WHERE c.holder_user_id IN (_se, _gb);
  PERFORM pg_temp.ok(_before = _after,
    'R1 every planted claim is byte-for-byte what it was, timestamps included');

  PERFORM pg_temp.ok(jsonb_array_length(_after) = 6, 'R2 all six claims survive');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims c
      WHERE c.holder_user_id = _se AND c.credential_code IS NULL) = 3,
    'R3 the three free-text rows are still free text');

  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code FROM public.sp_claims
      WHERE holder_user_id = _se AND credential_code = 'VU1') = 'SE',
    'R4 the Swedish credential is still Swedish');

  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code FROM public.sp_claims
      WHERE holder_user_id = _gb AND credential_code = 'UK_SIA_LICENCE_DS') = 'GB',
    'R5 the British licence is still British');

  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code = 'AE' AND sub_jurisdiction_code = 'AE-DU'
       FROM public.sp_claims
      WHERE holder_user_id = _gb AND credential_code = 'AE_DU_SIRA_CARD_GUARD'),
    'R6 the Dubai cadre card still carries AE / AE-DU');

  PERFORM pg_temp.ok(
    (SELECT credential_reference FROM public.sp_claims
      WHERE holder_user_id = _gb AND credential_code = 'UK_SIA_LICENCE_DS')
      = '1234567890123456',
    'R7 the private credential reference survived unchanged');

  SELECT body INTO _before FROM public.zz_rollback_fixture_snapshot WHERE label = 'credential_types';
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.code) INTO _after
    FROM public.sp_credential_types t WHERE t.code NOT LIKE 'INTL\_%';
  PERFORM pg_temp.ok(_before = _after,
    'R8 all 59 pre-existing definitions are byte-for-byte what they were');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_credential_types WHERE code LIKE 'INTL\_%') = 0,
    'R9 and the fourteen international definitions are gone');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'sp_credential_types' AND column_name = 'scope_code') = 0,
    'R10 the scope column is gone, taking its backfill with it');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('sp_credential_scopes','sp_certification_issuers',
                        'sp_certification_issuer_aliases','sp_certification_sources',
                        'sp_certification_definitions','sp_claim_certification_lifecycle')) = 0,
    'R11 all six new tables are gone');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_proc WHERE proname IN
      ('sp_certification_definition_rules','sp_certification_lifecycle_rules',
       'sp_certification_issuer_code_immutable')) = 0,
    'R12 and their trigger functions with them');

  PERFORM pg_temp.ok(
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conname = 'sp_credential_types_symbol_label_check')
      LIKE '%<= 4%',
    'R13 the symbol plate is back to four characters');

  -- The restored trigger still refuses everything PR #222 made it refuse.
  PERFORM pg_temp.ok(
    (SELECT prosrc FROM pg_proc WHERE proname = 'sp_claims_credential_rules')
      LIKE '%SP_SUB_JURISDICTION_REQUIRED%',
    'R14 the restored trigger still names SP_SUB_JURISDICTION_REQUIRED');
  PERFORM pg_temp.ok(
    (SELECT prosrc FROM pg_proc WHERE proname = 'sp_claims_credential_rules')
      NOT LIKE '%SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION%',
    'R15 and no longer names the rule this rollback removed');
END $$;
