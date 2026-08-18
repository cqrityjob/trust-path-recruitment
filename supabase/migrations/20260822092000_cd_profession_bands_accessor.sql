-- Career Discovery calibration data stops being directly enumerable.
--
-- Privilege and access-path change only. No scoring, no calibration, no band,
-- no weight, no centrality, no profession and no item is altered. Every value a
-- candidate's matching run reads is byte-identical to what it read before.
--
-- ── THE PROBLEM ────────────────────────────────────────────────────────
--
-- 20260730090000 granted SELECT on public.cd_profession_profiles to
-- `authenticated` under a `USING (true)` policy. Any account that can sign up
-- could therefore page every profession target profile ever authored --
-- including every historical calibration batch, and the evidence_basis,
-- confidence and source_reference columns that record how the calibration was
-- derived. That is the core of the matching IP.
--
-- The obvious fix -- revoke the grant -- breaks the product. The product reads
-- through public.cd_profession_profiles_current, which is declared
-- `WITH (security_invoker = true)`, so it resolves permissions as the CALLING
-- user. Revoking the base grant makes the view fail for every signed-in
-- candidate.
--
-- ── THE DESIGN ─────────────────────────────────────────────────────────
--
-- A narrowly-scoped SECURITY DEFINER accessor that the legitimate scoring path
-- calls, and nothing else:
--
--   * SECURITY DEFINER with `SET search_path = public, pg_temp`, so it cannot
--     be redirected by a caller-controlled search_path.
--   * Seven columns, not eleven. evidence_basis, confidence, source_reference
--     and created_at are NOT returned: matching never used them, and they are
--     the columns that describe how the calibration was made.
--   * Current calibration batch only -- the same DISTINCT ON the view applies.
--     Historical batches become unreachable through the application entirely.
--   * Rows restricted to the professions the caller names, which is what a
--     matching run actually needs.
--
-- ── WHAT THIS DOES AND DOES NOT CLAIM ──────────────────────────────────
--
-- It removes: historical calibration batches, the provenance columns, and
-- direct PostgREST enumeration of the base table and the view.
--
-- It does NOT claim a caller can never assemble the current band set. A
-- matching run legitimately needs every candidate profession's bands, so any
-- accessor that serves matching can be called repeatedly with the profession
-- ids, which are themselves ordinary catalogue data. The honest description is
-- that the calibration surface is reduced to exactly what matching consumes,
-- and that bulk enumeration now requires deliberate, attributable RPC traffic
-- rather than one anonymous table read. Rate limiting is a separate concern and
-- is not claimed here.
--
-- Forward-only. Remediation is at the bottom of this file, in comment form.

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

-- Remediation, if this must ever be undone:
--   GRANT SELECT ON public.cd_profession_profiles         TO authenticated;
--   GRANT SELECT ON public.cd_profession_profiles_current TO authenticated;
--   CREATE POLICY cd_profession_profiles_read ON public.cd_profession_profiles
--     FOR SELECT TO authenticated USING (true);
--   DROP FUNCTION public.cd_profession_bands_for_matching(text[]);
