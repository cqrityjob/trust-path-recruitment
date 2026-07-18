-- Restrict SELECT on cig_governance_settings and job_import_sources to admins only.
DROP POLICY IF EXISTS "cig_governance_settings read authenticated" ON public.cig_governance_settings;
CREATE POLICY "cig_governance_settings admin read"
  ON public.cig_governance_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "job_import_sources_authenticated_read" ON public.job_import_sources;
CREATE POLICY "job_import_sources admin read"
  ON public.job_import_sources
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
