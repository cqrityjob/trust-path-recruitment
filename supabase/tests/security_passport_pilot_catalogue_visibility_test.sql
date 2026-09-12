-- =============================================================================
-- Security Passport — the pilot catalogue is visible to the entitled, and to
-- nobody else. Regression suite for 20261109090000.
--
-- THE DEFECT THIS PINS DOWN: the taxonomy's SELECT policy was USING (is_active)
-- while every GB / GB-NI / AE-DU credential type is is_active = false. An
-- entitled pilot member therefore received sp_market_access() = 'pilot' — the
-- UI opened the market for them — and then read ZERO catalogue rows, and was
-- refused their own claim with SP_CREDENTIAL_CODE_UNKNOWN because the claim
-- trigger (SECURITY INVOKER) reads the taxonomy under the same policy.
--
-- Every read and every claim below runs as `SET LOCAL ROLE authenticated`
-- with a request.jwt.claim.sub, which is what PostgREST does and what the
-- older pilot suite did NOT do (it ran as the owner and so bypassed RLS).
--
-- Counts are taken from the owner first and compared under impersonation, so
-- the suite states "a member sees exactly the rows that exist", not a number
-- that rots when a catalogue grows.
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

/** How many taxonomy rows `_uid` can read, as role authenticated, under
 *  `_where` (a literal the suite itself writes). */
CREATE OR REPLACE FUNCTION pg_temp.visible_as(_uid uuid, _where text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE _n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  EXECUTE format('SELECT count(*) FROM public.sp_credential_types WHERE %s', _where) INTO _n;
  RESET ROLE;
  RETURN _n;
END $$;

/** One INSERT into sp_claims as role authenticated, reporting 'OK' or the
 *  SP_ code the database refused it with. */
CREATE OR REPLACE FUNCTION pg_temp.try_claim_as(
  _uid uuid, _code text, _title text, _jur text, _sub text, _type text,
  _valid_until date DEFAULT NULL, _issuer text DEFAULT 'Fiktiv myndighet')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code,
       jurisdiction_code, sub_jurisdiction_code, valid_until, claimed_issuer_name)
    VALUES (_uid, _type, _title, _code, _jur, _sub, _valid_until, _issuer);
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RESET ROLE;
    RETURN split_part(_msg, ':', 1);
  END;
END $$;

/** SQLSTATE of an anonymous read of the taxonomy, or 'OK' if it was allowed. */
CREATE OR REPLACE FUNCTION pg_temp.anon_read()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text; _n integer;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO _n FROM public.sp_credential_types;
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE;
    RESET ROLE;
    RETURN _state;
  END;
END $$;

DO $$
DECLARE
  _gb_user   uuid := gen_random_uuid();
  _ni_user   uuid := gen_random_uuid();
  _du_user   uuid := gen_random_uuid();
  _public    uuid := gen_random_uuid();
  _admin     uuid := gen_random_uuid();
  _qual      text;
  _r         text;
  _n         integer;
  _gb_total  integer;
  _ni_total  integer;
  _du_total  integer;
  _prod_total integer;
  _has_ni    boolean;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (_gb_user, 'catvis-gb@fixture.invalid'),
         (_ni_user, 'catvis-ni@fixture.invalid'),
         (_du_user, 'catvis-du@fixture.invalid'),
         (_public,  'catvis-public@fixture.invalid'),
         (_admin,   'catvis-admin@fixture.invalid')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_admin, 'admin')
  ON CONFLICT DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM public.sp_market_packs WHERE code = 'GB-NI') INTO _has_ni;

  -- What exists, read as the owner (RLS bypassed): the yardstick.
  SELECT count(*) INTO _gb_total FROM public.sp_credential_types
   WHERE market_pack_code = 'GB' AND pilot_state = 'internal_pilot' AND NOT is_active;
  SELECT count(*) INTO _ni_total FROM public.sp_credential_types
   WHERE market_pack_code = 'GB-NI' AND pilot_state = 'internal_pilot' AND NOT is_active;
  SELECT count(*) INTO _du_total FROM public.sp_credential_types
   WHERE market_pack_code = 'AE-DU' AND pilot_state = 'internal_pilot' AND NOT is_active;
  SELECT count(*) INTO _prod_total FROM public.sp_credential_types WHERE is_active;

  -- =====================================================================
  RAISE NOTICE 'GROUP 1 -- the policy, the surface and the markets';
  -- =====================================================================
  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO _qual
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.sp_credential_types'::regclass
     AND pol.polname = 'sp_credential_types_read';
  PERFORM pg_temp.ok(_qual IS NOT NULL AND position('sp_market_access' IN _qual) > 0,
    '1.1 the taxonomy read policy consults sp_market_access()');
  PERFORM pg_temp.ok(position('sp_claims' IN _qual) > 0,
    '1.2 the taxonomy read policy keeps a holder''s own claimed types readable');
  PERFORM pg_temp.ok(_qual <> 'is_active',
    '1.3 the policy is no longer the 20260817160000 shape USING (is_active)');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.sp_credential_types'::regclass) = 1,
    '1.4 exactly one policy on the taxonomy: read-only, nothing writable from the app');
  PERFORM pg_temp.ok(NOT has_table_privilege('anon', 'public.sp_credential_types', 'SELECT'),
    '1.5 anon holds no SELECT grant on the taxonomy');
  PERFORM pg_temp.ok(_gb_total >= 13 AND _du_total >= 30,
    format('1.6 the pilot catalogues exist and are inactive (GB %s, AE-DU %s)', _gb_total, _du_total));
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.sp_market_packs WHERE is_active) = 1
    AND (SELECT is_active FROM public.sp_market_packs WHERE code = 'SE'),
    '1.7 Sweden is still the only active market; nothing here opened one');

  -- =====================================================================
  RAISE NOTICE 'GROUP 2 -- a public holder sees production only';
  -- =====================================================================
  PERFORM pg_temp.ok(pg_temp.visible_as(_public, 'is_active') = _prod_total,
    format('2.1 the public holder reads every production type (%s)', _prod_total));
  PERFORM pg_temp.ok(pg_temp.visible_as(_public, 'NOT is_active') = 0,
    '2.2 the public holder reads no inactive type at all');
  PERFORM pg_temp.ok(pg_temp.visible_as(_public, $q$pilot_state = 'internal_pilot'$q$) = 0,
    '2.3 the public holder reads no pilot row');
  PERFORM pg_temp.ok(pg_temp.visible_as(_public, $q$code = 'UK_SIA_LICENCE_DS'$q$) = 0,
    '2.4 a GB licence code does not resolve for the public holder');
  _r := pg_temp.try_claim_as(_public, 'UK_SIA_LICENCE_DS',
        'SIA Licence — Door Supervision', 'GB', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r <> 'OK',
    '2.5 the public holder is still refused a GB claim (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 3 -- the defect: an entitled GB member, as authenticated';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_gb_user, 'GB', 'catalogue visibility suite');
  PERFORM pg_temp.ok(public.sp_market_access(_gb_user, 'GB') = 'pilot',
    '3.1 the member''s access to GB is pilot');

  PERFORM pg_temp.ok(
    pg_temp.visible_as(_gb_user, $q$market_pack_code = 'GB'$q$) = _gb_total,
    format('3.2 THE FIX: the GB member reads every GB catalogue row (%s), not zero', _gb_total));
  PERFORM pg_temp.ok(
    pg_temp.visible_as(_gb_user, $q$code = 'UK_SIA_LICENCE_DS'$q$) = 1,
    '3.3 a GB licence code resolves for the GB member (the form''s lookup works)');
  PERFORM pg_temp.ok(pg_temp.visible_as(_gb_user, 'is_active') = _prod_total,
    '3.4 the GB member still reads every production type');
  PERFORM pg_temp.ok(
    pg_temp.visible_as(_gb_user, $q$market_pack_code = 'GB' AND category = 'appointment'$q$) = 7
    AND pg_temp.visible_as(_gb_user, $q$market_pack_code = 'GB' AND category = 'qualification'$q$) = 6,
    '3.5 grouped as the catalogue groups it: 7 licences, 6 qualifications');

  _r := pg_temp.try_claim_as(_gb_user, 'UK_SIA_LICENCE_DS',
        'SIA Licence — Door Supervision', 'GB', NULL, 'licence', '2030-01-01',
        'Security Industry Authority');
  PERFORM pg_temp.ok(_r = 'OK',
    '3.6 THE FIX: the GB member registers a GB licence as authenticated (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 4 -- the entitlement is PER MARKET, in the read too';
  -- =====================================================================
  PERFORM pg_temp.ok(pg_temp.visible_as(_gb_user, $q$market_pack_code = 'AE-DU'$q$) = 0,
    '4.1 the GB member reads no Dubai row');
  IF _has_ni THEN
    PERFORM pg_temp.ok(pg_temp.visible_as(_gb_user, $q$market_pack_code = 'GB-NI'$q$) = 0,
      '4.2 the GB member reads no Northern Ireland row');
  ELSE
    RAISE NOTICE 'ok  4.2 GB-NI pack absent (20260914090000 unapplied); NI read skipped';
  END IF;
  PERFORM pg_temp.ok(pg_temp.visible_as(_gb_user, $q$market_pack_code = 'AE-AZ'$q$) = 0,
    '4.3 the GB member reads no Abu Dhabi row (closed, never piloted)');

  -- Cross-jurisdiction is still refused from the strongest position.
  _r := pg_temp.try_claim_as(_gb_user, 'VU1', 'Väktarutbildning 1', 'GB', NULL, 'training');
  PERFORM pg_temp.ok(_r <> 'OK',
    '4.4 a Swedish course cannot be filed in GB by a GB member (got ' || _r || ')');
  _r := pg_temp.try_claim_as(_gb_user, 'AE_DU_SIRA_CARD_GUARD',
        'SIRA Security Cadre Card — Security Guard', 'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r <> 'OK',
    '4.5 a Dubai cadre card cannot be filed by a GB-only member (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 5 -- Northern Ireland and Dubai members see their own market';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_grant_pilot_member(_du_user, 'AE-DU', 'catalogue visibility suite');
  PERFORM pg_temp.ok(
    pg_temp.visible_as(_du_user, $q$market_pack_code = 'AE-DU'$q$) = _du_total,
    format('5.1 the Dubai member reads every Dubai row (%s)', _du_total));
  PERFORM pg_temp.ok(
    pg_temp.visible_as(_du_user, $q$market_pack_code = 'AE-DU' AND category = 'appointment'$q$) = 15
    AND pg_temp.visible_as(_du_user, $q$market_pack_code = 'AE-DU' AND category = 'qualification'$q$) = 15,
    '5.2 grouped as the catalogue groups it: 15 cadre cards, 15 courses');
  PERFORM pg_temp.ok(pg_temp.visible_as(_du_user, $q$market_pack_code = 'GB'$q$) = 0,
    '5.3 the Dubai member reads no GB row');
  PERFORM pg_temp.ok(pg_temp.visible_as(_du_user, $q$market_pack_code = 'AE-AZ'$q$) = 0,
    '5.4 the Dubai member reads no Abu Dhabi row: Dubai is not the UAE');

  IF _has_ni THEN
    PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
    PERFORM public.sp_grant_pilot_member(_ni_user, 'GB-NI', 'catalogue visibility suite');
    PERFORM pg_temp.ok(
      pg_temp.visible_as(_ni_user, $q$market_pack_code = 'GB-NI'$q$) = _ni_total AND _ni_total = 1,
      '5.5 the Northern Ireland member reads the one NI row: vehicle immobilisation');
    PERFORM pg_temp.ok(pg_temp.visible_as(_ni_user, $q$market_pack_code = 'GB'$q$) = 0,
      '5.6 a GB-NI-only member reads no ordinary GB row: NI is its own market');
    _r := pg_temp.try_claim_as(_ni_user, 'UK_SIA_LICENCE_VI',
          'SIA Licence — Vehicle Immobilisation (Northern Ireland)',
          'GB', 'GB-NI', 'licence', '2030-01-01', 'Security Industry Authority');
    PERFORM pg_temp.ok(_r = 'OK',
      '5.7 the NI member registers vehicle immobilisation as authenticated (got ' || _r || ')');
  ELSE
    RAISE NOTICE 'ok  5.5 GB-NI pack absent; NI assertions skipped';
    RAISE NOTICE 'ok  5.6 GB-NI pack absent; NI assertions skipped';
    RAISE NOTICE 'ok  5.7 GB-NI pack absent; NI assertions skipped';
  END IF;

  -- =====================================================================
  RAISE NOTICE 'GROUP 6 -- revocation closes the catalogue, keeps the record readable';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_revoke_pilot_member(_gb_user, 'GB');
  PERFORM pg_temp.ok(public.sp_market_access(_gb_user, 'GB') = 'closed',
    '6.1 after revocation GB is closed to the former member');
  PERFORM pg_temp.ok(
    pg_temp.visible_as(_gb_user, $q$market_pack_code = 'GB'$q$) = 1
    AND pg_temp.visible_as(_gb_user, $q$code = 'UK_SIA_LICENCE_DS'$q$) = 1,
    '6.2 the former member still reads the ONE type they already claimed, and no other');
  _r := pg_temp.try_claim_as(_gb_user, 'UK_SIA_LICENCE_SG',
        'SIA Licence — Security Guarding', 'GB', NULL, 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r <> 'OK',
    '6.3 the former member cannot register a new GB licence (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 7 -- anon reads nothing';
  -- =====================================================================
  _r := pg_temp.anon_read();
  PERFORM pg_temp.ok(_r = '42501',
    '7.1 an anonymous read of the taxonomy is refused outright (SQLSTATE ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 8 -- cleanup';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM public.sp_claims WHERE holder_user_id IN (_gb_user, _ni_user, _du_user, _public);
  DELETE FROM public.user_roles WHERE user_id = _admin;
  DELETE FROM auth.users WHERE id IN (_gb_user, _ni_user, _du_user, _public, _admin);
  SELECT count(*) INTO _n FROM public.sp_pilot_members
   WHERE user_id IN (_gb_user, _ni_user, _du_user);
  PERFORM pg_temp.ok(_n = 0, '8.1 the suite left no entitlement behind');
END $$;
