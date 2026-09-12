-- Roll back the pilot catalogue visibility correction and the entitlement
-- privacy corrections that ship in the same file, in reverse order:
--
--   3. sp_is_pilot_member() and sp_market_access() return to their
--      20260915090000 definitions, grants and comments VERBATIM (any signed-in
--      caller may ask about any user id again);
--   2. sp_pilot_members regains the application-role grants it had before
--      this file (SELECT from 20260915090000; INSERT and UPDATE from the
--      platform's default privileges on a new table, inert because no write
--      policy exists) and the 20260915090000 self-read policy, verbatim;
--   1. the taxonomy's SELECT policy returns to the 20260817160000 shape,
--      USING (is_active).
--
-- This reinstates the DEFECTS the forward migration fixes -- an entitled pilot
-- member reads no GB / GB-NI / AE-DU catalogue rows and cannot register a
-- pilot claim; a holder can read the administrator's internal note about
-- them; holder A can enumerate holder B's pilot markets -- and it says so here
-- because that is what a rollback is. No row changes. Run BEFORE the
-- 20260915090000 pilot entitlement rollback: that file drops sp_market_access(),
-- which the corrected taxonomy policy depends on, and Postgres refuses the
-- drop while the dependency exists.

-- ---------------------------------------------------------------------------
-- 3. The membership functions, as 20260915090000 wrote them
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_is_pilot_member(_user_id uuid, _market_pack_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _market_pack_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sp_pilot_members m
     WHERE m.user_id = _user_id
       AND m.market_pack_code = _market_pack_code
       AND m.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.sp_is_pilot_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_is_pilot_member(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_is_pilot_member(uuid, text) IS
  'True when this user holds a live pilot entitlement for THIS market pack. '
  'Per market by design: a GB tester is not a Dubai tester.';

CREATE OR REPLACE FUNCTION public.sp_market_access(_user_id uuid, _market_pack_code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- COALESCE, not a join: an unknown market code returns no row at all, and a
  -- SQL function that returns NULL where the caller expects a state is how a
  -- closed market becomes an unhandled case at the call site.
  SELECT COALESCE(
    (SELECT CASE
       WHEN p.is_active THEN 'production'
       WHEN p.pilot_state = 'internal_pilot'
            AND public.sp_is_pilot_member(_user_id, p.code) THEN 'pilot'
       ELSE 'closed'
     END
     FROM public.sp_market_packs p
     WHERE p.code = _market_pack_code AND p.superseded_on IS NULL),
    'closed');
$$;

REVOKE ALL ON FUNCTION public.sp_market_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_market_access(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_market_access(uuid, text) IS
  'How this user may reach this market: production (public, legally cleared), '
  'pilot (internal_pilot AND entitled), or closed. The caller is told WHICH, '
  'because a pilot market must be presented as a pilot market.';

-- ---------------------------------------------------------------------------
-- 2. The entitlement table's application-role grants and self policy
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.sp_pilot_members TO authenticated;
REVOKE DELETE ON public.sp_pilot_members FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "sp pilot members see own entitlement" ON public.sp_pilot_members;
CREATE POLICY "sp pilot members see own entitlement" ON public.sp_pilot_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

COMMENT ON TABLE public.sp_pilot_members IS
  'Named, informed participants authorised to exercise ONE internal-pilot '
  'market each. Granted only by a platform administrator through '
  'sp_grant_pilot_member(). Membership confers exactly one thing: the ability '
  'to register credentials in that market while its legal review is pending.';

-- ---------------------------------------------------------------------------
-- 1. The taxonomy read policy, as 20260817160000 wrote it
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS sp_credential_types_read ON public.sp_credential_types;
CREATE POLICY sp_credential_types_read ON public.sp_credential_types
  FOR SELECT TO authenticated USING (is_active);

DO $$
DECLARE _qual text; _n integer;
BEGIN
  SELECT pg_get_expr(pol.polqual, pol.polrelid) INTO _qual
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.sp_credential_types'::regclass
     AND pol.polname  = 'sp_credential_types_read';
  IF _qual IS DISTINCT FROM 'is_active' THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE_ROLLBACK: policy is %, expected is_active', _qual;
  END IF;
  IF has_table_privilege('anon', 'public.sp_credential_types', 'SELECT') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE_ROLLBACK: anon can read the taxonomy';
  END IF;

  -- The exact pre-PR grant set for authenticated on the entitlement table.
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO _qual
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'sp_pilot_members' AND grantee = 'authenticated';
  IF _qual IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE_ROLLBACK: authenticated grants on sp_pilot_members are %, expected INSERT,SELECT,UPDATE', _qual;
  END IF;
  IF has_table_privilege('anon', 'public.sp_pilot_members', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sp_pilot_members', 'DELETE') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE_ROLLBACK: anon or DELETE reach on sp_pilot_members';
  END IF;
  SELECT count(*) INTO _n FROM pg_policy
   WHERE polrelid = 'public.sp_pilot_members'::regclass
     AND polname = 'sp pilot members see own entitlement' AND polcmd = 'r';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE_ROLLBACK: the self-read policy on sp_pilot_members was not restored';
  END IF;

  -- The two functions are the 20260915090000 ones again: SQL-language,
  -- SECURITY DEFINER, pinned, no caller check, same reach.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('sp_is_pilot_member', 'sp_market_access')
     AND l.lanname = 'sql' AND p.prosecdef
     AND position('SP_PILOT_MEMBERSHIP_PRIVATE' IN p.prosrc) = 0
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE_ROLLBACK: the membership functions were not restored verbatim (% of 2)', _n;
  END IF;
  IF has_function_privilege('anon', 'public.sp_market_access(uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.sp_market_access(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_PILOT_CATALOGUE_ROLLBACK: sp_market_access grants are not the 20260915090000 ones';
  END IF;
  RAISE NOTICE 'SP_PILOT_CATALOGUE_VISIBILITY_ROLLBACK ok';
END $$;
