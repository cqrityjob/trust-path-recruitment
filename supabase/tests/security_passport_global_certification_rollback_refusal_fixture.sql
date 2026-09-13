-- A holder records an international certification. After this, the rollback
-- MUST refuse: removing the definition would delete their claim, and a
-- rollback that deletes holder data is not a rollback.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h uuid := '44444444-4444-4444-8444-444444444444';
  _t public.sp_credential_types%ROWTYPE;
  _claim uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_h, 'rollback-intl@fixture.invalid')
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO _t FROM public.sp_credential_types WHERE code = 'INTL_ASIS_CPP';

  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, credential_code, title, lifecycle_state)
  VALUES (_h, _t.claim_type, _t.code, _t.name_sv, 'active')
  RETURNING id INTO _claim;

  INSERT INTO public.sp_claim_certification_lifecycle
    (claim_id, holder_user_id, awarded_on, holder_lifecycle_status, status_as_of)
  VALUES (_claim, _h, DATE '2025-01-15', 'active', DATE '2026-09-12');

  RAISE NOTICE 'refusal fixture planted: one CPP claim and its lifecycle row';
END $$;
