-- Roll back the pilot catalogue visibility correction only: the taxonomy's
-- SELECT policy returns to the 20260817160000 shape, USING (is_active).
--
-- This reinstates the DEFECT the forward migration fixes -- an entitled pilot
-- member reads no GB / GB-NI / AE-DU catalogue rows and cannot register a
-- pilot claim -- and it says so here because that is what a rollback is.
-- No row, grant or market state changes. Run BEFORE the 20260915090000 pilot
-- entitlement rollback: that file drops sp_market_access(), which the
-- corrected policy depends on, and Postgres refuses the drop while the
-- dependency exists.

DROP POLICY IF EXISTS sp_credential_types_read ON public.sp_credential_types;
CREATE POLICY sp_credential_types_read ON public.sp_credential_types
  FOR SELECT TO authenticated USING (is_active);

DO $$
DECLARE _qual text;
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
  RAISE NOTICE 'SP_PILOT_CATALOGUE_VISIBILITY_ROLLBACK ok';
END $$;
