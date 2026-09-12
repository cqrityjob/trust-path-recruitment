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
-- Schema-only: no new object is introduced, so no application release is
-- coupled to this file. Rollback restores the 20260817160000 policy verbatim.
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

  RAISE NOTICE 'SP_PILOT_CATALOGUE_VISIBILITY_PROOF ok';
END $$;
