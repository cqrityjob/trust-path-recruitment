-- 1. cd_definition_versions: scope public reads to live lifecycle statuses
DROP POLICY IF EXISTS "cd definition versions readable" ON public.cd_definition_versions;

CREATE POLICY "cd definition versions live readable"
ON public.cd_definition_versions
FOR SELECT
TO anon, authenticated
USING (lifecycle_status IN ('pilot', 'active'));

CREATE POLICY "cd definition versions admin or tester readable"
ON public.cd_definition_versions
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.cd_is_internal_tester(auth.uid())
);

-- 2. cd_definition_items: no anonymous access; live versions for signed-in users
DROP POLICY IF EXISTS "cd definition items readable" ON public.cd_definition_items;

REVOKE SELECT ON public.cd_definition_items FROM anon;

CREATE POLICY "cd definition items live readable"
ON public.cd_definition_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.cd_definition_versions dv
    WHERE dv.id = cd_definition_items.definition_version_id
      AND dv.lifecycle_status IN ('pilot', 'active')
  )
);

CREATE POLICY "cd definition items admin or tester readable"
ON public.cd_definition_items
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.cd_is_internal_tester(auth.uid())
);

-- 3. audit_logs: admin-only read path
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS "audit logs admin select" ON public.audit_logs;
CREATE POLICY "audit logs admin select"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

-- 4. assessment_run_reports: writes only through trusted backend paths
REVOKE INSERT, UPDATE, DELETE ON public.assessment_run_reports FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assessment_run_reports FROM anon;
GRANT ALL ON public.assessment_run_reports TO service_role;

DROP POLICY IF EXISTS "assessment run reports service write" ON public.assessment_run_reports;
CREATE POLICY "assessment run reports service write"
ON public.assessment_run_reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.assessment_run_reports IS
  'Generated career reports. Written only by the SECURITY DEFINER function save_career_report() or service_role; authenticated users have SELECT on their own rows and no write privilege at all.';

-- 5. Internal SECURITY DEFINER helpers must not be anon-callable
REVOKE EXECUTE ON FUNCTION public.cd_v31_complete_session(uuid, jsonb, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cd_v31_validate_session_evidence(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cd_validate_option_matrix(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cd_guard_option_order_seed_immutable() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cd_guard_profession_ranking_approval() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cd_guard_share_revocation_is_one_way() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cd_guard_snapshot_v31_immutable() FROM anon, authenticated, PUBLIC;