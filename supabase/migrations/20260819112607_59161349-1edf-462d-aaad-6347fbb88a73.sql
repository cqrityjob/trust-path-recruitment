-- ---------------------------------------------------------------------------
-- 1. cd_option_loadings: proprietary calibration, no application reader
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cd_option_loadings_read ON public.cd_option_loadings;

REVOKE SELECT ON public.cd_option_loadings FROM authenticated;
REVOKE ALL     ON public.cd_option_loadings FROM anon;

GRANT ALL ON public.cd_option_loadings TO service_role;

COMMENT ON TABLE public.cd_option_loadings IS
  'Career Discovery option→axis loading matrix. Proprietary calibration data: '
  'no grant to anon or authenticated. The product scores from the TypeScript '
  'matrix (src/lib/career-discovery/v31/option-matrix.ts); this table is the '
  'mirrored source of truth the guard script compares against, read as '
  'service_role.';

-- ---------------------------------------------------------------------------
-- 2. cd_profession_profiles: exposure recorded, NOT closed here
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.cd_profession_profiles IS
  'Career Discovery profession target profiles, every authored version. '
  'KNOWN EXPOSURE: readable by any authenticated account. Not closed in the '
  'Phase 0C repair because cd_profession_profiles_current is a security_invoker '
  'view and revoking the base grant would break signed-in profession matching. '
  'Owner decision pending -- see docs/technical/phase-0c-canonical-baseline-repair.md.';

-- ---------------------------------------------------------------------------
-- 3. Authored prompt library is not anonymous content
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.scp_followup_prompts') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.scp_followup_prompts FROM anon';
  END IF;
END $$;