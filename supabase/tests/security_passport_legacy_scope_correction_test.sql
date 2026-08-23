-- Security Passport — a grandfathered claim must never become unwritable.
--
-- ── THE ROW THIS SUITE IS ABOUT ────────────────────────────────────────
--
-- Reproduced from the shape of the one such row in production on 2026-08-23,
-- read read-only, structural columns only:
--
--   credential_code SV · lifecycle active · assertion_level VERIFIED
--   version_no 1 · no predecessor · has issuer · has valid_until
--   no reference · no note · has verifier · jurisdiction SE
--   authorisation_scope NULL
--
-- `verified` is what makes it serious. Before the fix the holder could read it
-- and withdraw it but not correct it — and correction is the only way to supply
-- the scope the rule now wants. The single escape from a frozen record was to
-- throw away a real verifier's decision.
--
-- The fixture creates it the way production did: while `SV` did not yet require
-- a scope. No trigger is disabled and no rule is bypassed; the taxonomy really
-- did change underneath the row.

\set ON_ERROR_STOP on

DO $$
DECLARE
  _h        uuid := '00000000-0000-0000-0000-00000000a101';
  _verifier uuid := '00000000-0000-0000-0000-00000000a199';
  _other    uuid := '00000000-0000-0000-0000-00000000a102';
  _legacy   uuid := 'a1000000-0000-4000-8000-00000000d001';
  _ov       uuid := 'a1000000-0000-4000-8000-00000000d002';
  _modern   uuid := 'a1000000-0000-4000-8000-00000000d003';
  _new      uuid;
  _r        public.sp_claims%ROWTYPE;
  _old_r    public.sp_claims%ROWTYPE;
  _txt      text;
BEGIN
  INSERT INTO auth.users (id) VALUES (_h), (_verifier), (_other) ON CONFLICT DO NOTHING;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- reproduce the production row through real history';
  -- =====================================================================
  UPDATE public.sp_credential_types SET requires_scope = false WHERE code = 'SV';

  INSERT INTO public.sp_claims
    (id, holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, assertion_level, lifecycle_state,
     verified_by_user_id, verified_at)
  VALUES (_legacy, _h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, 'verified', 'active',
          _verifier, now());

  UPDATE public.sp_credential_types SET requires_scope = true WHERE code = 'SV';

  SELECT * INTO _r FROM public.sp_claims WHERE id = _legacy;
  IF _r.authorisation_scope IS NOT NULL OR _r.assertion_level <> 'verified'
     OR _r.lifecycle_state <> 'active' OR _r.version_no <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.1 the legacy fixture does not match production';
  END IF;
  RAISE NOTICE 'ok  1.1 a verified, active, scopeless SV claim exists, as in production';

  IF (SELECT requires_scope FROM public.sp_credential_types WHERE code = 'SV') IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 1.2 SV must require a scope again';
  END IF;
  RAISE NOTICE 'ok  1.2 and SV requires a scope, so the row is genuinely grandfathered';

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- the holder can correct it (the defect)';
  -- =====================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);

  -- Correcting something else entirely, supplying no scope. Before the fix this
  -- raised SP_CREDENTIAL_REQUIRES_SCOPE and the claim was frozen.
  SELECT public.sp_correct_claim(
    _legacy, 'Skyddsvaktsförordnande', 'Länsstyrelsen i Stockholms län', 'SE',
    NULL, NULL, (current_date + 300)::date,
    'Rättar myndighetens namn', 'SV', NULL, NULL, NULL, NULL) INTO _new;
  RESET ROLE;
  RAISE NOTICE 'ok  2.1 a legacy scopeless claim can be corrected at all';

  SELECT * INTO _r FROM public.sp_claims WHERE id = _new;
  IF _r.authorisation_scope IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.2 the correction invented a scope';
  END IF;
  RAISE NOTICE 'ok  2.2 the new version inherits the grandfathered absence, not a guess';

  SELECT * INTO _old_r FROM public.sp_claims WHERE id = _legacy;
  IF _old_r.lifecycle_state <> 'superseded' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.3 the predecessor was not superseded';
  END IF;
  IF _old_r.claimed_issuer_name <> 'Länsstyrelsen'
     OR _old_r.assertion_level <> 'verified'
     OR _old_r.verified_by_user_id <> _verifier THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.4 the superseded row was modified';
  END IF;
  RAISE NOTICE 'ok  2.3 the predecessor is superseded, not deleted';
  RAISE NOTICE 'ok  2.4 and its own fields are untouched — history is immutable';

  -- Changing the issuer is material, so the verifier's decision must not survive.
  IF _r.assertion_level <> 'self_declared' OR _r.verified_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 2.5 a material correction kept its verification';
  END IF;
  RAISE NOTICE 'ok  2.5 a material change resets trust and drops the attribution';

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- the holder can supply the missing scope';
  -- =====================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT public.sp_correct_claim(
    _new, 'Skyddsvaktsförordnande', 'Länsstyrelsen i Stockholms län', 'SE',
    NULL, NULL, (current_date + 300)::date,
    'Lägger till omfattning', 'SV', NULL, NULL, NULL, NULL,
    NULL, 'Skyddsobjekt: Hamnen') INTO _new;
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _new;
  IF _r.authorisation_scope IS DISTINCT FROM 'Skyddsobjekt: Hamnen' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 3.1 the scope did not persist';
  END IF;
  RAISE NOTICE 'ok  3.1 the holder supplies the scope through their own correction';
  RAISE NOTICE 'ok  3.2 the grandfathered gap closes by holder action, never by a guess';

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- and it can never be taken away again';
  -- =====================================================================
  -- Omitting the argument CARRIES THE SCOPE FORWARD -- sp_correct_claim
  -- coalesces it with the stored value. That is the ordinary case: a
  -- correction about something else must not disturb the scope.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  SELECT public.sp_correct_claim(
    _new, 'Skyddsvaktsförordnande', 'Länsstyrelsen i Stockholms län', 'SE',
    NULL, NULL, (current_date + 300)::date,
    'Rättar en anteckning', 'SV', NULL, 'en anteckning', NULL, NULL) INTO _new;
  RESET ROLE;

  SELECT * INTO _r FROM public.sp_claims WHERE id = _new;
  IF _r.authorisation_scope IS DISTINCT FROM 'Skyddsobjekt: Hamnen' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: 4.1 an unrelated correction lost the scope';
  END IF;
  RAISE NOTICE 'ok  4.1 POSITIVE CONTROL an unrelated correction carries the scope forward';

  -- Explicitly blanking it is the only way to attempt removal, and it is
  -- refused: the predecessor has a scope, so this one must too.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _h::text, true);
  BEGIN
    PERFORM public.sp_correct_claim(
      _new, 'Skyddsvaktsförordnande', 'Länsstyrelsen i Stockholms län', 'SE',
      NULL, NULL, (current_date + 300)::date,
      'Försöker ta bort omfattningen', 'SV', NULL, NULL, NULL, NULL,
      NULL, '   ');
    RESET ROLE;
    RAISE EXCEPTION 'ASSERTION FAILED: 4.2 a recorded scope was blanked away';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_REQUIRES_SCOPE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 4.2 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  4.2 MUTATION a recorded scope cannot be blanked by a correction';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- the grandfather clause opens no new door';
  -- =====================================================================
  -- A NEW claim has no predecessor to inherit from, so it still needs a scope.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until)
    VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
            'Länsstyrelsen', current_date + 300);
    RAISE EXCEPTION 'ASSERTION FAILED: 5.1 a brand-new scopeless SV claim was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _txt = MESSAGE_TEXT;
    IF _txt NOT LIKE 'SP_CREDENTIAL_REQUIRES_SCOPE%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: 5.1 wrong error: %', _txt;
    END IF;
    RAISE NOTICE 'ok  5.1 MUTATION a new claim still requires a scope';
  END;

  -- Nor may a correction of a SCOPED claim drop it, which 4.2 proved through
  -- the RPC; proven here at the table so it holds for every caller.
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
       claimed_issuer_name, valid_until, supersedes_id, version_no)
    VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
            'Länsstyrelsen', current_date + 300, _new, 99);
    RAISE EXCEPTION 'ASSERTION FAILED: 5.2 a superseding row dropped a recorded scope';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  5.2 MUTATION superseding a SCOPED claim still requires a scope';
  END;

  -- POSITIVE CONTROL: superseding the ORIGINAL legacy row (which has none) is
  -- allowed. Without this, 5.1 and 5.2 would also pass against a rule that
  -- simply refused everything.
  INSERT INTO public.sp_claims
    (holder_user_id, claim_type, title, credential_code, jurisdiction_code,
     claimed_issuer_name, valid_until, supersedes_id, version_no)
  VALUES (_h, 'licence', 'Skyddsvaktsförordnande', 'SV', 'SE',
          'Länsstyrelsen', current_date + 300, _legacy, 98);
  RAISE NOTICE 'ok  5.3 POSITIVE CONTROL superseding the grandfathered row is allowed';

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- none of this crosses a holder boundary';
  -- =====================================================================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _other::text, true);
  BEGIN
    PERFORM public.sp_correct_claim(
      _new, 'Skyddsvaktsförordnande', 'Fel', 'SE',
      NULL, NULL, (current_date + 300)::date,
      'Annan innehavare', 'SV', NULL, NULL, NULL, NULL,
      NULL, 'Skyddsobjekt: Annat');
    RESET ROLE;
    RAISE EXCEPTION 'ASSERTION FAILED: 6.1 another holder corrected this claim';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'ok  6.1 MUTATION another holder cannot correct it, scope or not';
  WHEN others THEN
    RESET ROLE;
    RAISE;
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- cleanup';
  -- =====================================================================
  -- Passport history is append-only and refuses a DELETE, which is the guard
  -- working. Removing the auth user cascades the whole fixture away without
  -- asking any table to break its own contract.
  UPDATE public.sp_claims SET supersedes_id = NULL WHERE holder_user_id = _h;
  DELETE FROM public.sp_claims WHERE holder_user_id = _h;
  DELETE FROM auth.users WHERE id IN (_h, _verifier, _other);
  RAISE NOTICE 'ok  7.1 suite data removed without deleting history';
END $$;
