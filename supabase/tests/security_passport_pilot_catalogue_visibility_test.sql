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
--
-- GROUPS 8-9 pin the two privacy corrections that ship in the same migration:
-- a holder cannot read the entitlement table (so the administrator's internal
-- note and the audit columns really are never shown), and holder A cannot
-- learn holder B's pilot membership through sp_is_pilot_member() or
-- sp_market_access(), while self-access and administrator access still work.
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
  _valid_until date DEFAULT NULL, _issuer text DEFAULT 'Fiktiv myndighet',
  _scope text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    INSERT INTO public.sp_claims
      (holder_user_id, claim_type, title, credential_code,
       jurisdiction_code, sub_jurisdiction_code, valid_until, claimed_issuer_name,
       authorisation_scope)
    VALUES (_uid, _type, _title, _code, _jur, _sub, _valid_until, _issuer, _scope);
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    RESET ROLE;
    RETURN split_part(_msg, ':', 1);
  END;
END $$;

/** Runs `_sql` as role authenticated with `_uid` as the JWT subject and
 *  reports 'OK' or the SQLSTATE it failed with. Membership-privacy probes
 *  use this: the assertion is about WHETHER the database answers at all. */
CREATE OR REPLACE FUNCTION pg_temp.probe_as(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    EXECUTE _sql;
    RESET ROLE;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE;
    RESET ROLE;
    RETURN _state;
  END;
END $$;

/** Evaluates a scalar text expression as role authenticated with `_uid` as
 *  the subject, or reports the SQLSTATE prefixed with 'ERR:'. */
CREATE OR REPLACE FUNCTION pg_temp.eval_as(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text; _out text;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  BEGIN
    EXECUTE _sql INTO _out;
    RESET ROLE;
    RETURN _out;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE;
    RESET ROLE;
    RETURN 'ERR:' || _state;
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
  RAISE NOTICE 'GROUP 8 -- the entitlement table is closed to the people it is about';
  -- =====================================================================
  -- The Dubai member holds a live entitlement with a note. As themselves, as
  -- role authenticated, they cannot read the note, the audit columns, or the
  -- row at all: "never shown to the user" is a grant, not a promise.
  PERFORM pg_temp.ok(
    pg_temp.probe_as(_du_user, 'SELECT note FROM public.sp_pilot_members') = '42501',
    '8.1 a holder cannot SELECT the internal note about themselves (permission denied)');
  PERFORM pg_temp.ok(
    pg_temp.probe_as(_du_user, 'SELECT granted_by, revoked_by FROM public.sp_pilot_members') = '42501',
    '8.2 a holder cannot SELECT who granted or revoked them');
  PERFORM pg_temp.ok(
    pg_temp.probe_as(_du_user, 'SELECT user_id, market_pack_code FROM public.sp_pilot_members') = '42501',
    '8.3 a holder cannot SELECT the entitlement row at all');
  PERFORM pg_temp.ok(
    pg_temp.probe_as(_du_user,
      format('INSERT INTO public.sp_pilot_members (user_id, market_pack_code) VALUES (%L, %L)', _du_user, 'GB')) = '42501',
    '8.4 a holder cannot INSERT an entitlement (no grant, not merely no policy)');
  PERFORM pg_temp.ok(
    pg_temp.probe_as(_du_user,
      format('UPDATE public.sp_pilot_members SET revoked_at = NULL WHERE user_id = %L', _du_user)) = '42501',
    '8.5 a holder cannot UPDATE an entitlement');
  PERFORM pg_temp.ok(
    NOT has_column_privilege('authenticated', 'public.sp_pilot_members', 'note', 'SELECT')
    AND (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.sp_pilot_members'::regclass) = 0,
    '8.6 no column grant and no policy opens sp_pilot_members to an application role');
  PERFORM pg_temp.ok(
    has_table_privilege('service_role', 'public.sp_pilot_members', 'SELECT')
    AND NOT has_table_privilege('service_role', 'public.sp_pilot_members', 'DELETE'),
    '8.7 service_role keeps its enumerated read and still holds no DELETE');

  -- =====================================================================
  RAISE NOTICE 'GROUP 9 -- membership is private: A cannot inspect B';
  -- =====================================================================
  -- _du_user is a live Dubai member; _public holds nothing. Each asks about
  -- the other, as role authenticated.
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_public, format('SELECT public.sp_is_pilot_member(%L, %L)::text', _du_user, 'AE-DU')) = 'ERR:42501',
    '9.1 a stranger asking sp_is_pilot_member() about the Dubai member is refused, not told false');
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_public, format('SELECT public.sp_market_access(%L, %L)', _du_user, 'AE-DU')) = 'ERR:42501',
    '9.2 a stranger asking sp_market_access() about the Dubai member is refused, not told closed');
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_du_user, format('SELECT public.sp_market_access(%L, %L)', _public, 'AE-DU')) = 'ERR:42501',
    '9.3 a member asking about a non-member is refused just the same');
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_du_user, format('SELECT public.sp_market_access(%L, %L)', _public, 'SE')) = 'ERR:42501',
    '9.4 even a production market is not answered about someone else');

  -- Self-access is untouched, in both directions of the answer.
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_du_user, format('SELECT public.sp_market_access(%L, %L)', _du_user, 'AE-DU')) = 'pilot'
    AND pg_temp.eval_as(_du_user, format('SELECT public.sp_is_pilot_member(%L, %L)::text', _du_user, 'AE-DU')) = 'true',
    '9.5 the Dubai member asking about themselves is told pilot / true');
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_du_user, format('SELECT public.sp_market_access(%L, %L)', _du_user, 'GB')) = 'closed'
    AND pg_temp.eval_as(_du_user, format('SELECT public.sp_market_access(%L, %L)', _du_user, 'SE')) = 'production',
    '9.6 and about their other markets: GB closed, Sweden production');
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_public, format('SELECT public.sp_market_access(%L, %L)', _public, 'AE-DU')) = 'closed'
    AND pg_temp.eval_as(_public, format('SELECT public.sp_is_pilot_member(%L, %L)::text', _public, 'AE-DU')) = 'false',
    '9.7 a non-member asking about themselves is told closed / false');

  -- A platform administrator may ask about anyone: the administration page
  -- and the grant/revoke RPCs depend on it.
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_admin, format('SELECT public.sp_market_access(%L, %L)', _du_user, 'AE-DU')) = 'pilot'
    AND pg_temp.eval_as(_admin, format('SELECT public.sp_is_pilot_member(%L, %L)::text', _du_user, 'AE-DU')) = 'true'
    AND pg_temp.eval_as(_admin, format('SELECT public.sp_market_access(%L, %L)', _public, 'AE-DU')) = 'closed',
    '9.8 a platform administrator is answered about anyone');

  -- The catalogue policy and the claim trigger ask about auth.uid() and keep
  -- working under the restriction: the Dubai member still reads their 30
  -- rows and still files a claim, as authenticated.
  PERFORM pg_temp.ok(
    pg_temp.visible_as(_du_user, $q$market_pack_code = 'AE-DU'$q$) = _du_total,
    '9.9 the catalogue policy still answers the entitled member after the restriction');
  _r := pg_temp.try_claim_as(_du_user, 'AE_DU_SIRA_CARD_GUARD',
        'SIRA Security Cadre Card — Security Guard', 'AE', 'AE-DU', 'licence', '2030-01-01',
        'Security Industry Regulatory Agency', 'Fiktivt bevakningsbolag');
  PERFORM pg_temp.ok(_r = 'OK',
    '9.10 the claim trigger still admits the entitled member as authenticated (got ' || _r || ')');
  _r := pg_temp.try_claim_as(_public, 'AE_DU_SIRA_CARD_GUARD',
        'SIRA Security Cadre Card — Security Guard', 'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r = 'SP_MARKET_PACK_NOT_ACTIVE',
    '9.11 and still refuses the non-member with the same public refusal (got ' || _r || ')');

  -- Revocation, seen through the restricted functions, as the former member.
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  PERFORM public.sp_revoke_pilot_member(_du_user, 'AE-DU');
  PERFORM pg_temp.ok(
    pg_temp.eval_as(_du_user, format('SELECT public.sp_market_access(%L, %L)', _du_user, 'AE-DU')) = 'closed'
    AND pg_temp.visible_as(_du_user, $q$market_pack_code = 'AE-DU'$q$) = 1,
    '9.12 after revocation the former member is told closed and keeps only the type they claimed');
  _r := pg_temp.try_claim_as(_du_user, 'AE_DU_SIRA_CARD_EVENT',
        'SIRA Security Cadre Card — Event Security', 'AE', 'AE-DU', 'licence', '2030-01-01');
  PERFORM pg_temp.ok(_r <> 'OK',
    '9.13 and cannot register a new Dubai card (got ' || _r || ')');

  -- =====================================================================
  RAISE NOTICE 'GROUP 10 -- cleanup';
  -- =====================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM public.sp_claims WHERE holder_user_id IN (_gb_user, _ni_user, _du_user, _public);
  DELETE FROM public.user_roles WHERE user_id = _admin;
  DELETE FROM auth.users WHERE id IN (_gb_user, _ni_user, _du_user, _public, _admin);
  SELECT count(*) INTO _n FROM public.sp_pilot_members
   WHERE user_id IN (_gb_user, _ni_user, _du_user);
  PERFORM pg_temp.ok(_n = 0, '10.1 the suite left no entitlement behind');
END $$;
