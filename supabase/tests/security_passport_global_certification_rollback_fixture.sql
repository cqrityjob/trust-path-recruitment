-- A representative PRE-ROLLBACK database, and a snapshot of it.
--
-- The rollback contract is not "the objects disappear". It is "the objects
-- disappear AND every row a holder ever wrote is still exactly what it was".
-- The second half cannot be checked against a memory, so this file plants the
-- rows and records them, and
-- security_passport_global_certification_rollback_assert.sql compares.
--
-- The fixture is deliberately the awkward one: free-text rows named after real
-- certifications, a Swedish credential, a British licence and a Dubai cadre
-- card. Those are the four shapes the rollback could plausibly damage.

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.zz_rollback_fixture_snapshot (
  label text PRIMARY KEY,
  body  jsonb NOT NULL
);

DO $$
DECLARE
  _se    uuid := '11111111-1111-4111-8111-111111111111';
  _gb    uuid := '22222222-2222-4222-8222-222222222222';
  _admin uuid := '33333333-3333-4333-8333-333333333333';
  _t     public.sp_credential_types%ROWTYPE;
  _code  text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_se,    'rollback-se@fixture.invalid'),
    (_gb,    'rollback-gb@fixture.invalid'),
    (_admin, 'rollback-admin@fixture.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_gb, 'GB',    'rollback fixture');
  PERFORM public.sp_grant_pilot_member(_gb, 'AE-DU', 'rollback fixture');

  -- Free text, named after real certifications. These must never be upgraded
  -- by the forward migration and must never be touched by the rollback.
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, claimed_issuer_name, lifecycle_state)
  VALUES (_se, 'certification', 'CPP', 'ASIS', 'active'),
         (_se, 'certification', 'CISSP', '(ISC)²', 'active'),
         (_se, 'training', 'test', NULL, 'active');

  -- One governed credential per market, built the way `credentialClaimFields`
  -- builds it: the market from the definition.
  FOREACH _code IN ARRAY ARRAY['VU1', 'UK_SIA_LICENCE_DS', 'AE_DU_SIRA_CARD_GUARD'] LOOP
    SELECT * INTO _t FROM public.sp_credential_types WHERE code = _code;
    -- The claim trigger asks `sp_is_pilot_member(auth.uid(), ...)`, so the
    -- JWT subject has to be the HOLDER for the pilot rows — filing them while
    -- the administrator's subject is still set would be refused with
    -- SP_MARKET_PACK_NOT_ACTIVE, which is the trigger working correctly and
    -- the fixture being wrong.
    PERFORM set_config('request.jwt.claim.sub',
      (CASE WHEN _code = 'VU1' THEN _se ELSE _gb END)::text, true);
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, credential_code, title, claimed_issuer_name,
       jurisdiction_code, sub_jurisdiction_code, valid_until, authorisation_scope,
       credential_reference, lifecycle_state)
    VALUES (
      CASE WHEN _code = 'VU1' THEN _se ELSE _gb END,
      _t.claim_type, _t.code, _t.name_sv,
      CASE WHEN _t.requires_issuer THEN 'Fiktiv myndighet' ELSE NULL END,
      _t.jurisdiction_code, _t.sub_jurisdiction_code,
      CASE WHEN _t.requires_valid_until THEN DATE '2030-01-01' ELSE NULL END,
      CASE WHEN _t.requires_scope THEN 'Fiktivt uppdrag' ELSE NULL END,
      -- Shaped to each definition's own `reference_pattern`. A reference the
      -- trigger would refuse is not a fixture of a real holder's record.
      CASE _code
        WHEN 'UK_SIA_LICENCE_DS'     THEN '1234567890123456'
        WHEN 'AE_DU_SIRA_CARD_GUARD' THEN 'SIRA-2026-000117'
        ELSE 'VU1-2019-000117'
      END,
      'active');
  END LOOP;

  INSERT INTO public.zz_rollback_fixture_snapshot (label, body)
  SELECT 'claims', jsonb_agg(to_jsonb(c) ORDER BY c.id)
    FROM public.sp_claims c WHERE c.holder_user_id IN (_se, _gb)
  ON CONFLICT (label) DO UPDATE SET body = EXCLUDED.body;

  -- The 59 definitions that predate the international catalogue, with every
  -- column EXCEPT the one the forward migration adds.
  INSERT INTO public.zz_rollback_fixture_snapshot (label, body)
  SELECT 'credential_types',
         jsonb_agg((to_jsonb(t) - 'scope_code') ORDER BY t.code)
    FROM public.sp_credential_types t WHERE t.code NOT LIKE 'INTL\_%'
  ON CONFLICT (label) DO UPDATE SET body = EXCLUDED.body;

  RAISE NOTICE 'rollback fixture planted: % claim(s), % pre-existing definition(s)',
    (SELECT count(*) FROM public.sp_claims WHERE holder_user_id IN (_se, _gb)),
    (SELECT count(*) FROM public.sp_credential_types WHERE code NOT LIKE 'INTL\_%');
END $$;
