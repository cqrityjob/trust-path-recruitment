CREATE OR REPLACE FUNCTION public.cd_profession_bands_for_matching(
  _profession_ids text[]
)
RETURNS TABLE (
  profession_id       text,
  calibration_version text,
  dimension_id        text,
  band_low            numeric,
  band_high           numeric,
  weight              numeric,
  centrality          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (p.profession_id, p.dimension_id)
    p.profession_id,
    p.calibration_version,
    p.dimension_id,
    p.band_low,
    p.band_high,
    p.weight,
    p.centrality
  FROM public.cd_profession_profiles p
  WHERE p.profession_id = ANY (COALESCE(_profession_ids, ARRAY[]::text[]))
  ORDER BY p.profession_id, p.dimension_id, p.created_at DESC;
$$;

COMMENT ON FUNCTION public.cd_profession_bands_for_matching(text[]) IS
  'The only application path to Career Discovery profession calibration. '
  'Returns the CURRENT calibration batch only, seven columns only, for the '
  'named professions only. Provenance columns (evidence_basis, confidence, '
  'source_reference) are deliberately absent. Historical calibration batches '
  'are unreachable through this function by design.';

REVOKE ALL     ON FUNCTION public.cd_profession_bands_for_matching(text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cd_profession_bands_for_matching(text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Close the direct paths
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cd_profession_profiles_read ON public.cd_profession_profiles;

REVOKE SELECT ON public.cd_profession_profiles         FROM authenticated;
REVOKE ALL    ON public.cd_profession_profiles         FROM anon;
REVOKE SELECT ON public.cd_profession_profiles_current FROM authenticated;
REVOKE ALL    ON public.cd_profession_profiles_current FROM anon;

GRANT ALL    ON public.cd_profession_profiles         TO service_role;
GRANT SELECT ON public.cd_profession_profiles_current TO service_role;

COMMENT ON TABLE public.cd_profession_profiles IS
  'Career Discovery profession target profiles, every authored calibration '
  'batch. Proprietary calibration data: no grant to anon or authenticated. '
  'The application reads cd_profession_bands_for_matching(text[]); internal '
  'calibration and audit work reads this table as service_role.';

COMMENT ON VIEW public.cd_profession_profiles_current IS
  'Current calibration batch per (profession_id, dimension_id). Retained for '
  'internal and service_role use; security_invoker, so it grants nothing on '
  'its own. The application path is cd_profession_bands_for_matching(text[]).';