-- =============================================================================
-- Security Passport — the pilot catalogue is readable BY THE PEOPLE ENTITLED
-- TO IT.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- 20260817160000 made the credential taxonomy readable by any signed-in
-- holder under one condition:
--
--     CREATE POLICY sp_credential_types_read ON public.sp_credential_types
--       FOR SELECT TO authenticated USING (is_active);
--
-- That was right when every row was Swedish and active. 20260915090000 then
-- added the internal-pilot axis: GB, GB-NI and AE-DU credential types exist
-- with `is_active = false` and `pilot_state = 'internal_pilot'`, and
-- `sp_market_access(uid, pack)` answers 'pilot' for an entitled member. The
-- claim trigger and the read model were taught that answer. The SELECT
-- policy was not. So a real entitled member, reading through PostgREST as
-- `authenticated`, gets:
--
--   * `sp_market_access(uid,'GB') = 'pilot'`   -> the UI shows the market
--                                                 as open for the pilot;
--   * `SELECT ... FROM sp_credential_types
--      WHERE market_pack_code = 'GB'`          -> ZERO rows: no catalogue;
--   * an INSERT of a GB claim                  -> SP_CREDENTIAL_CODE_UNKNOWN,
--     because sp_claims_credential_rules() is SECURITY INVOKER and its
--     `SELECT * FROM sp_credential_types WHERE code = NEW.credential_code`
--     runs under the same policy and finds nothing.
--
-- The pilot suite did not catch it because it runs its claims as the table
-- owner, which bypasses RLS. Reproduced on a full replay of every migration
-- (docs/passport/three-market-evidence/rls-reproduction.md).
--
-- ── THE CORRECTION ─────────────────────────────────────────────────────
--
-- The policy learns the same three-way answer the rest of the domain already
-- uses, and nothing else:
--
--   1. `is_active`                        -- production, as before;
--   2. an internal-pilot type of a market  -- visible to THIS holder only when
--      pack the holder is entitled to         sp_market_access() says 'pilot',
--                                             i.e. the pack is in internal_pilot
--                                             AND the holder has a live grant;
--   3. a type this holder has already      -- so an existing own claim never
--      claimed                                loses its label if the grant is
--                                             revoked or the type retired.
--
-- What this does NOT do: open a market (no sp_market_packs row changes; the
-- suite asserts Sweden is still the only active pack), widen the anon surface
-- (anon still has no SELECT grant), let a non-member see a pilot row, or let
-- a GB member see a Dubai row. A pilot entitlement is per market by design and
-- this policy inherits that from sp_market_access().
--
-- ── AND THE ENTITLEMENT ITSELF IS NOT A THING TO BROWSE ────────────────
--
-- Two more corrections from the same review, in the same unshipped file:
--
--   2. sp_pilot_members was readable by its holder under a self policy, every
--      column: the administrator's internal note, who granted and who revoked.
--      The administration page promises the note is "never shown to the
--      user", and a promise the SELECT grant contradicts is not one. The
--      table loses every application-role grant; a holder learns their own
--      access through sp_market_access(), which is what every surface asks.
--
--   3. sp_is_pilot_member(uuid, text) and sp_market_access(uuid, text) took any
--      user id from any signed-in caller, so holder A could enumerate holder
--      B's pilot markets. They now answer about the CALLER, a platform
--      administrator may ask about anyone, and a session without a JWT
--      (the owner, service role, the test harness) is unrestricted. Anyone
--      else asking about someone else is refused with
--      SP_PILOT_MEMBERSHIP_PRIVATE (insufficient_privilege). Self-access, the
--      claim trigger (which asks about auth.uid()), the catalogue policy
--      above (auth.uid() again) and the administrator's grant/revoke RPCs
--      are unchanged in behaviour.
--
-- Schema-only: no new object is introduced, so no application release is
-- coupled to this file. Rollback restores the 20260817160000 policy, the
-- 20260915090000 function definitions, grants and self policy verbatim.
-- =============================================================================

DROP POLICY IF EXISTS sp_credential_types_read ON public.sp_credential_types;
CREATE POLICY sp_credential_types_read ON public.sp_credential_types
  FOR SELECT TO authenticated
  USING (
    is_active
    OR (
      pilot_state = 'internal_pilot'
      AND market_pack_code IS NOT NULL
      AND public.sp_market_access(auth.uid(), market_pack_code) = 'pilot'
    )
    OR EXISTS (
      SELECT 1 FROM public.sp_claims c
       WHERE c.holder_user_id = auth.uid()
         AND c.credential_code = public.sp_credential_types.code
    )
  );

COMMENT ON POLICY sp_credential_types_read ON public.sp_credential_types IS
  'Production types for every holder; internal-pilot types only for a holder '
  'whose sp_market_access() for that market pack is ''pilot''; plus the types '
  'of the holder''s own existing claims. Never anon.';

-- The grants are unchanged and re-stated so the surface is legible here:
-- signed-in holders read, the anonymous recipient page never does.
GRANT SELECT ON public.sp_credential_types TO authenticated;
REVOKE ALL ON public.sp_credential_types FROM anon;

-- ---------------------------------------------------------------------------
-- 2. The entitlement table is not readable by the people it is about
-- ---------------------------------------------------------------------------
-- SELECT was the 20260915090000 grant; INSERT and UPDATE were the platform's
-- default-privilege grants on a new table, inert because no write policy has
-- ever existed. All three go. service_role keeps its enumerated grants, and
-- the two administrator RPCs are SECURITY DEFINER and unaffected.
REVOKE ALL ON public.sp_pilot_members FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "sp pilot members see own entitlement" ON public.sp_pilot_members;

COMMENT ON TABLE public.sp_pilot_members IS
  'Named, informed participants authorised to exercise ONE internal-pilot '
  'market each. Granted only by a platform administrator through '
  'sp_grant_pilot_member(). Membership confers exactly one thing: the ability '
  'to register credentials in that market while its legal review is pending. '
  'Not readable by any application role: a holder learns their own access '
  'through sp_market_access(), and the internal note and the granting or '
  'revoking administrator never leave the database.';

-- ---------------------------------------------------------------------------
-- 3. Membership is answered about the caller, or by an administrator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_is_pilot_member(_user_id uuid, _market_pack_code text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _user_id IS NULL OR _market_pack_code IS NULL THEN
    RETURN false;
  END IF;
  -- A signed-in caller may ask about themselves; a platform administrator
  -- about anyone; a session with no JWT (owner, service role, harness) is
  -- not a holder and is not restricted. Everyone else is refused rather than
  -- answered, so "closed" can never be a lie told to hide a membership.
  IF _caller IS NOT NULL AND _caller <> _user_id AND NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION
      'SP_PILOT_MEMBERSHIP_PRIVATE: a pilot entitlement is visible to its holder and to platform administrators only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.sp_pilot_members m
     WHERE m.user_id = _user_id
       AND m.market_pack_code = _market_pack_code
       AND m.revoked_at IS NULL
  );
END $$;

REVOKE ALL ON FUNCTION public.sp_is_pilot_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_is_pilot_member(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_is_pilot_member(uuid, text) IS
  'True when this user holds a live pilot entitlement for THIS market pack. '
  'Per market by design: a GB tester is not a Dubai tester. Answers about the '
  'caller, or about anyone for a platform administrator; refuses otherwise.';

CREATE OR REPLACE FUNCTION public.sp_market_access(_user_id uuid, _market_pack_code text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _user_id IS NOT NULL AND _caller <> _user_id
     AND NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION
      'SP_PILOT_MEMBERSHIP_PRIVATE: a pilot entitlement is visible to its holder and to platform administrators only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- COALESCE, not a join: an unknown market code returns no row at all, and a
  -- function that returns NULL where the caller expects a state is how a
  -- closed market becomes an unhandled case at the call site.
  RETURN COALESCE(
    (SELECT CASE
       WHEN p.is_active THEN 'production'
       WHEN p.pilot_state = 'internal_pilot'
            AND public.sp_is_pilot_member(_user_id, p.code) THEN 'pilot'
       ELSE 'closed'
     END
     FROM public.sp_market_packs p
     WHERE p.code = _market_pack_code AND p.superseded_on IS NULL),
    'closed');
END $$;

REVOKE ALL ON FUNCTION public.sp_market_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_market_access(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_market_access(uuid, text) IS
  'How this user may reach this market: production (public, legally cleared), '
  'pilot (internal_pilot AND entitled), or closed. The caller is told WHICH, '
  'because a pilot market must be presented as a pilot market. Answers about '
  'the caller, or about anyone for a platform administrator; refuses otherwise.';

-- ---------------------------------------------------------------------------
-- Postflight proof. Structural, so it holds on hosted where this file is
-- applied by the integration; the functional proof (an impersonated member
-- reading 13 GB rows and a non-member reading none) is the SQL suite.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _qual text;
  _n    integer;
BEGIN
  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO _qual
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.sp_credential_types'::regclass
     AND pol.polname  = 'sp_credential_types_read';
  IF _qual IS NULL THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: the read policy is missing';
  END IF;
  IF position('sp_market_access' IN _qual) = 0
     OR position('is_active' IN _qual) = 0
     OR position('sp_claims' IN _qual) = 0 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: the read policy does not carry all three branches: %', _qual;
  END IF;

  -- Exactly one SELECT policy on the taxonomy, for authenticated only.
  SELECT count(*) INTO _n
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.sp_credential_types'::regclass AND pol.polcmd = 'r';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: expected one SELECT policy, found %', _n;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sp_credential_types'::regclass) THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: row level security is not enabled on the taxonomy';
  END IF;
  IF has_table_privilege('anon', 'public.sp_credential_types', 'SELECT') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: anon can read the taxonomy';
  END IF;

  -- Nothing about the markets changed: still exactly one publicly active
  -- pack, and no piloted pack claims a review.
  SELECT count(*) INTO _n FROM public.sp_market_packs WHERE is_active;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: % active market pack(s); expected exactly one', _n;
  END IF;
  SELECT count(*) INTO _n FROM public.sp_market_packs
   WHERE pilot_state = 'internal_pilot' AND (is_active OR legal_review_state <> 'pending');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: a piloted market pack is active or reviewed';
  END IF;

  -- 2. The entitlement table is closed to every application role.
  IF has_table_privilege('authenticated', 'public.sp_pilot_members', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sp_pilot_members', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sp_pilot_members', 'UPDATE')
     OR has_table_privilege('anon', 'public.sp_pilot_members', 'SELECT') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: an application role can still reach sp_pilot_members';
  END IF;
  IF has_column_privilege('authenticated', 'public.sp_pilot_members', 'note', 'SELECT')
     OR has_column_privilege('authenticated', 'public.sp_pilot_members', 'granted_by', 'SELECT')
     OR has_column_privilege('authenticated', 'public.sp_pilot_members', 'revoked_by', 'SELECT') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: a holder can still read the note or the audit columns';
  END IF;
  SELECT count(*) INTO _n FROM pg_policy WHERE polrelid = 'public.sp_pilot_members'::regclass;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: % policy(ies) still open sp_pilot_members to an application role', _n;
  END IF;
  IF NOT has_table_privilege('service_role', 'public.sp_pilot_members', 'SELECT') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: service_role lost its enumerated read of sp_pilot_members';
  END IF;

  -- 3. Both membership functions carry the caller check, stay pinned and
  --    stay out of anon''s reach.
  SELECT count(*) INTO _n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('sp_is_pilot_member', 'sp_market_access')
     AND p.prosecdef
     AND position('SP_PILOT_MEMBERSHIP_PRIVATE' IN p.prosrc) > 0
     AND position('is_platform_admin' IN p.prosrc) > 0
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: expected both membership functions to check the caller, found %', _n;
  END IF;
  IF has_function_privilege('anon', 'public.sp_is_pilot_member(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sp_market_access(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE: anon can execute a membership function';
  END IF;

  RAISE NOTICE 'SP_PILOT_CATALOGUE_VISIBILITY_PROOF ok';
END $$;
