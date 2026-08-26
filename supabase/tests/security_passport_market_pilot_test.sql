-- =============================================================================
-- Security Passport — the internal-pilot market entitlement.
--
-- Proves, at the DATABASE level, the two things the pilot must be:
--
--   1. USEFUL   — a named member of GB can register a GB credential in a market
--                 whose legal review is still pending;
--   2. CONTAINED — that entitlement widens nothing else. Not another market,
--                 not another person, not another credential, and above all
--                 not the jurisdiction rules.
--
-- Every assertion runs as an impersonated principal, because a gate that only
-- holds for the table owner is not a gate. The suite sets request.jwt.claim.sub
-- to move between synthetic users, matching the convention every other Passport
-- suite in this directory uses.
--
-- ── WHY THE DENIALS ARE THE POINT ──────────────────────────────────────
--
-- A pilot flag is exactly the kind of change that quietly becomes a bypass.
-- The cross-jurisdiction group below files every forbidden pairing the owner
-- named -- GB+VU1, GB+SIRA, AE-DU+OV, AE-DU+SIA, SE+SIA, SE+SIRA -- AS a fully
-- entitled pilot member of all three markets, which is the strongest position
-- an attacker or a confused UI could ever occupy. All six must still fail.
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

/** Runs one INSERT as `_uid` and reports the SQLSTATE/message, or 'OK'. */
CREATE OR REPLACE FUNCTION pg_temp.try_claim(
  _uid uuid, _code text, _title text, _jur text, _sub text, _type text,
  _valid_until date DEFAULT NULL, _issuer text DEFAULT 'Fiktiv myndighet',
  _scope text DEFAULT 'Fiktivt objekt')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code,
       jurisdiction_code, sub_jurisdiction_code, valid_until,
       claimed_issuer_name, authorisation_scope)
    VALUES (_uid, _type, _title, _code, _jur, _sub, _valid_until, _issuer, _scope);
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RETURN split_part(_msg, ':', 1);
  END;
END $$;

DO $$
DECLARE
  _se_user   uuid := gen_random_uuid();
  _gb_user   uuid := gen_random_uuid();
  _ni_user   uuid := gen_random_uuid();
  _du_user   uuid := gen_random_uuid();
  _public    uuid := gen_random_uuid();
  _all_three uuid := gen_random_uuid();
  _admin     uuid := gen_random_uuid();
  _r         text;
  _n         integer;
  _has_ni    boolean;
BEGIN
  -- Synthetic principals. auth.users rows only; no profile, no PII, no name.
  INSERT INTO auth.users (id, email)
  VALUES (_se_user,   'pilot-se@fixture.invalid'),
         (_gb_user,   'pilot-gb@fixture.invalid'),
         (_ni_user,   'pilot-ni@fixture.invalid'),
         (_du_user,   'pilot-du@fixture.invalid'),
         (_public,    'public-user@fixture.invalid'),
         (_all_three, 'pilot-all@fixture.invalid'),
         (_admin,     'pilot-admin@fixture.invalid')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin')
  ON CONFLICT DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'GB-NI') INTO _has_ni;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- governance is untouched';
  -- =====================================================================
  -- The whole point: piloting a market must not claim it was reviewed.
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE pilot_state = 'internal_pilot'
     AND (legal_review_state <> 'pending' OR is_active OR legal_reviewed_by IS NOT NULL);
  PERFORM pg_temp.ok(_n = 0,
    '1.1 no piloted market claims a legal review, an approval or public activation');

  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  PERFORM pg_temp.ok(_n = 1, '1.2 exactly one market is publicly active');

  PERFORM pg_temp.ok(
    (SELECT is_active AND pilot_state = 'closed'
       FROM public.sp_market_packs WHERE code = 'SE'),
    '1.3 that market is Sweden, and Sweden is not piloted');

  -- Scope: three markets and no more. Abu Dhabi in particular.
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE pilot_state = 'internal_pilot' AND code NOT IN ('GB', 'GB-NI', 'AE-DU');
  PERFORM pg_temp.ok(_n = 0, '1.4 no market outside GB / GB-NI / AE-DU is piloted');

  IF EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'AE-AZ') THEN
    PERFORM pg_temp.ok(
      (SELECT pilot_state = 'closed' FROM public.sp_market_packs WHERE code = 'AE-AZ'),
      '1.5 Abu Dhabi is present and explicitly NOT piloted');
  ELSE
    RAISE NOTICE 'ok  1.5 Abu Dhabi is not present at all (its migration is unapplied)';
  END IF;

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- the public user sees no change whatsoever';
  -- =====================================================================
  PERFORM pg_temp.ok(public.sp_market_access(_public, 'SE') = 'production',
    '2.1 public user: Sweden is production');
  PERFORM pg_temp.ok(public.sp_market_access(_public, 'GB') = 'closed',
    '2.2 public user: Great Britain is closed');
  PERFORM pg_temp.ok(public.sp_market_access(_public, 'AE-DU') = 'closed',
    '2.3 public user: Dubai is closed');
  PERFORM pg_temp.ok(public.sp_market_access(_public, 'ZZ') = 'closed',
    '2.4 public user: an unknown market is closed, not NULL');

  _r := pg_temp.try_claim(_public, 'UK_SIA_LICENCE_DS',
        'SIA Licence — Door Supervision', 'GB', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_MARKET_PACK_NOT_ACTIVE',
    '2.5 public user is refused a GB claim with SP_MARKET_PACK_NOT_ACTIVE (got ' || _r || ')');

  _r := pg_temp.try_claim(_public, 'AE_DU_SIRA_CARD_GUARD',
        'SIRA Security Cadre Card — Security Guard', 'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_MARKET_PACK_NOT_ACTIVE',
    '2.6 public user is refused a Dubai claim (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- granting is administrator-only';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', _gb_user::text, true);
  BEGIN
    PERFORM public.sp_grant_pilot_member(_gb_user, 'GB', 'self-service');
    PERFORM pg_temp.ok(false, '3.1 a candidate granted themselves pilot access');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  3.1 a candidate cannot grant themselves pilot access';
  END;

  -- Nor by writing the table directly: there is no INSERT policy for anyone.
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    INSERT INTO public.sp_pilot_members (user_id, market_pack_code)
    VALUES (_gb_user, 'GB');
    PERFORM set_config('role', 'postgres', true);
    PERFORM pg_temp.ok(false, '3.2 a candidate inserted their own entitlement');
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE NOTICE 'ok  3.2 RLS refuses a direct entitlement insert';
  END;

  -- The administrator can, and it is attributed to them.
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_gb_user, 'GB', 'UAT: SIA catalogue');
  PERFORM public.sp_grant_pilot_member(_du_user, 'AE-DU', 'UAT: SIRA catalogue');
  PERFORM public.sp_grant_pilot_member(_all_three, 'GB', 'UAT: cross-jurisdiction probe');
  PERFORM public.sp_grant_pilot_member(_all_three, 'AE-DU', 'UAT: cross-jurisdiction probe');
  IF _has_ni THEN
    PERFORM public.sp_grant_pilot_member(_ni_user, 'GB-NI', 'UAT: vehicle immobilisation');
  END IF;

  PERFORM pg_temp.ok(
    (SELECT granted_by FROM public.sp_pilot_members
      WHERE user_id = _gb_user AND market_pack_code = 'GB') = _admin,
    '3.3 the grant records who made it');

  -- A market nobody opened cannot be granted, so an entitlement can never sit
  -- dormant waiting to become real when someone flips a flag.
  BEGIN
    PERFORM public.sp_grant_pilot_member(_gb_user, 'SE', 'should be refused');
    PERFORM pg_temp.ok(false, '3.4 a grant was accepted for a non-pilot market');
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok  3.4 a market that is not in internal_pilot cannot be granted';
  END;

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- entitlement is PER MARKET';
  -- =====================================================================
  PERFORM pg_temp.ok(public.sp_market_access(_gb_user, 'GB') = 'pilot',
    '4.1 the GB member reaches GB as a pilot');
  PERFORM pg_temp.ok(public.sp_market_access(_gb_user, 'AE-DU') = 'closed',
    '4.2 the GB member does NOT thereby reach Dubai');
  PERFORM pg_temp.ok(public.sp_market_access(_du_user, 'AE-DU') = 'pilot',
    '4.3 the Dubai member reaches Dubai as a pilot');
  PERFORM pg_temp.ok(public.sp_market_access(_du_user, 'GB') = 'closed',
    '4.4 the Dubai member does NOT thereby reach Great Britain');
  PERFORM pg_temp.ok(public.sp_market_access(_gb_user, 'SE') = 'production',
    '4.5 a pilot member still reaches Sweden as production, not as a pilot');

  -- Membership is never a claim about the person.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_claims WHERE holder_user_id = _gb_user) = 0,
    '4.6 being granted pilot access created no claim and asserted nothing');

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- a pilot member can actually do the work';
  -- =====================================================================
  _r := pg_temp.try_claim(_gb_user, 'UK_SIA_LICENCE_DS',
        'SIA Licence — Door Supervision', 'GB', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'OK',
    '5.1 the GB member registers an SIA Door Supervision licence (got ' || _r || ')');

  _r := pg_temp.try_claim(_du_user, 'AE_DU_SIRA_CARD_GUARD',
        'SIRA Security Cadre Card — Security Guard', 'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'OK',
    '5.2 the Dubai member registers a SIRA cadre card (got ' || _r || ')');

  -- The claim keeps its OWN jurisdiction, which is the whole product model.
  PERFORM pg_temp.ok(
    (SELECT jurisdiction_code FROM public.sp_claims
      WHERE holder_user_id = _du_user AND credential_code = 'AE_DU_SIRA_CARD_GUARD')
      = 'AE'
    AND (SELECT sub_jurisdiction_code FROM public.sp_claims
          WHERE holder_user_id = _du_user AND credential_code = 'AE_DU_SIRA_CARD_GUARD')
      = 'AE-DU',
    '5.3 the Dubai claim is stored as AE / AE-DU, not flattened and not relabelled');

  -- Sweden still works for everybody, pilot member or not.
  _r := pg_temp.try_claim(_se_user, 'VU1', 'Väktarutbildning 1 (VU1)',
        'SE', NULL, 'training');
  PERFORM pg_temp.ok(_r = 'OK', '5.4 a non-pilot user still registers VU1 in Sweden (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- CROSS-JURISDICTION, as a member of all three';
  -- =====================================================================
  -- _all_three holds live entitlements for BOTH pilot markets. If pilot access
  -- were a bypass, this is the user it would show up on.
  PERFORM pg_temp.ok(public.sp_market_access(_all_three, 'GB') = 'pilot'
                 AND public.sp_market_access(_all_three, 'AE-DU') = 'pilot',
    '6.0 the probe user is a live pilot member of both markets');

  _r := pg_temp.try_claim(_all_three, 'VU1', 'Väktarutbildning 1 (VU1)',
        'GB', NULL, 'training');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_JURISDICTION_MISMATCH',
    '6.1 GB + VU1 is refused (got ' || _r || ')');

  _r := pg_temp.try_claim(_all_three, 'AE_DU_SIRA_CARD_GUARD',
        'SIRA Security Cadre Card — Security Guard', 'GB', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_JURISDICTION_MISMATCH',
    '6.2 GB + SIRA is refused (got ' || _r || ')');

  _r := pg_temp.try_claim(_all_three, 'OV', 'Ordningsvaktsförordnande',
        'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_JURISDICTION_MISMATCH',
    '6.3 Dubai + OV is refused (got ' || _r || ')');

  _r := pg_temp.try_claim(_all_three, 'UK_SIA_LICENCE_DS',
        'SIA Licence — Door Supervision', 'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_JURISDICTION_MISMATCH',
    '6.4 Dubai + SIA is refused (got ' || _r || ')');

  -- ── 6.5 and 6.6 refuse EARLIER than 6.1-6.4, and that is correct ────
  --
  -- Filed into SWEDEN, whose pack is publicly active, the market gate passes
  -- and `_pilot_market` stays false -- so a foreign credential that is not
  -- published (is_active = false, pilot_state reachable only inside its own
  -- market) is stopped by SP_CREDENTIAL_NOT_AVAILABLE before the jurisdiction
  -- comparison is reached. Were those catalogues ever published, the same
  -- write would fall through to SP_CREDENTIAL_JURISDICTION_MISMATCH instead.
  --
  -- Both are refusals and the assertion accepts either, because pinning the
  -- message would make this test fail on the day the GB catalogue goes live --
  -- when the behaviour it guards has not changed at all. That the jurisdiction
  -- rule itself fires is proved by 6.1-6.4, where the market IS open to the
  -- caller and the credential IS available, so nothing else can be doing the
  -- work.
  _r := pg_temp.try_claim(_all_three, 'UK_SIA_LICENCE_CCTV',
        'SIA Licence — Public Space Surveillance (CCTV)', 'SE', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(
    _r IN ('SP_CREDENTIAL_JURISDICTION_MISMATCH', 'SP_CREDENTIAL_NOT_AVAILABLE'),
    '6.5 Sweden + SIA CCTV is refused (got ' || _r || ')');

  _r := pg_temp.try_claim(_all_three, 'AE_DU_SIRA_CARD_GUARD',
        'SIRA Security Cadre Card — Security Guard', 'SE', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(
    _r IN ('SP_CREDENTIAL_JURISDICTION_MISMATCH', 'SP_CREDENTIAL_NOT_AVAILABLE'),
    '6.6 Sweden + SIRA is refused (got ' || _r || ')');

  -- The pilot-credential gate is scoped to the market it belongs to: a GB
  -- pilot credential is NOT reachable just because the caller is a pilot
  -- member somewhere. Filed into Dubai, which this user IS entitled to, the
  -- GB credential still cannot be registered.
  _r := pg_temp.try_claim(_all_three, 'UK_SIA_LICENCE_KH',
        'SIA Licence — Key Holding', 'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_CREDENTIAL_JURISDICTION_MISMATCH',
    '6.7 a GB pilot credential cannot be filed inside the Dubai pilot (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- Northern Ireland is its own market';
  -- =====================================================================
  IF _has_ni THEN
    _r := pg_temp.try_claim(_ni_user, 'UK_SIA_LICENCE_VI',
          'SIA Licence — Vehicle Immobilisation (Northern Ireland)',
          'GB', 'GB-NI', 'licence', '2030-01-01');
    PERFORM pg_temp.ok(_r = 'OK',
      '7.1 the GB-NI member registers vehicle immobilisation (got ' || _r || ')');

    -- The same credential, filed in Great Britain rather than Northern
    -- Ireland, by a member of BOTH GB markets. The SIA does not license
    -- immobilisation outside Northern Ireland and neither does this product.
    PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
    PERFORM public.sp_grant_pilot_member(_ni_user, 'GB', 'UAT: NI vs GB probe');

    _r := pg_temp.try_claim(_ni_user, 'UK_SIA_LICENCE_VI',
          'SIA Licence — Vehicle Immobilisation (Northern Ireland)',
          'GB', NULL, 'licence', '2030-01-01');
    PERFORM pg_temp.ok(_r = 'SP_SUB_JURISDICTION_NOT_SUPPORTED',
      '7.2 the same licence is refused in ordinary Great Britain (got ' || _r || ')');
  ELSE
    RAISE NOTICE 'ok  7.1 GB-NI pack absent (20260914090000 unapplied); NI assertions skipped';
    RAISE NOTICE 'ok  7.2 GB-NI pack absent; the GB/NI separation is asserted by its own suite';
  END IF;

  -- =====================================================================
  RAISE NOTICE 'GROUP 8 -- revocation stops new work and destroys no history';
  -- =====================================================================
  SELECT count(*) INTO _n FROM public.sp_claims WHERE holder_user_id = _gb_user;
  PERFORM pg_temp.ok(_n = 1, '8.0 the GB member has one claim before revocation');

  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_revoke_pilot_member(_gb_user, 'GB');

  PERFORM pg_temp.ok(public.sp_market_access(_gb_user, 'GB') = 'closed',
    '8.1 access is lost immediately on revocation');

  _r := pg_temp.try_claim(_gb_user, 'UK_SIA_LICENCE_CCTV',
        'SIA Licence — Public Space Surveillance (CCTV)', 'GB', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_MARKET_PACK_NOT_ACTIVE',
    '8.2 a revoked member cannot register anything new (got ' || _r || ')');

  -- The point of section 9: evidence survives the entitlement.
  SELECT count(*) INTO _n FROM public.sp_claims
   WHERE holder_user_id = _gb_user AND jurisdiction_code = 'GB'
     AND lifecycle_state = 'active';
  PERFORM pg_temp.ok(_n = 1,
    '8.3 the claim they already made survives revocation, active and still GB');

  -- The audit row survives too, attributed.
  PERFORM pg_temp.ok(
    (SELECT revoked_by FROM public.sp_pilot_members
      WHERE user_id = _gb_user AND market_pack_code = 'GB') = _admin,
    '8.4 the revocation is recorded and attributed, not deleted');

  -- Deletion is prevented by PRIVILEGE, not by a trigger, so it must be
  -- attempted as a role that actually runs requests. As the table owner this
  -- DELETE would succeed, which is inherent to ownership and is not a role any
  -- request runs as.
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    DELETE FROM public.sp_pilot_members WHERE user_id = _gb_user;
    PERFORM set_config('role', 'postgres', true);
    PERFORM pg_temp.ok(false, '8.5 authenticated deleted an entitlement row');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE NOTICE 'ok  8.5 no application role may delete an entitlement row';
  END;

  -- Re-granting reinstates without duplicating. Back to the administrator:
  -- the failed DELETE above left the candidate impersonated, and a grant that
  -- succeeded from here would mean the admin gate had stopped working.
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_gb_user, 'GB', 'UAT: reinstated');
  PERFORM pg_temp.ok(public.sp_market_access(_gb_user, 'GB') = 'pilot',
    '8.6 re-granting reinstates access');
  SELECT count(*) INTO _n FROM public.sp_pilot_members
   WHERE user_id = _gb_user AND market_pack_code = 'GB';
  PERFORM pg_temp.ok(_n = 1, '8.7 and leaves exactly one entitlement row');

  -- =====================================================================
  RAISE NOTICE 'GROUP 9 -- cleanup';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM public.sp_claims
   WHERE holder_user_id IN (_se_user, _gb_user, _ni_user, _du_user, _public, _all_three);
  -- Entitlements go with their users: sp_pilot_members.user_id carries
  -- ON DELETE CASCADE, which is also what makes account erasure work.
  DELETE FROM public.user_roles WHERE user_id = _admin;
  DELETE FROM auth.users
   WHERE id IN (_se_user, _gb_user, _ni_user, _du_user, _public, _all_three, _admin);

  SELECT count(*) INTO _n FROM public.sp_pilot_members;
  PERFORM pg_temp.ok(_n = 0, '9.1 the suite left no entitlement behind');
END $$;
