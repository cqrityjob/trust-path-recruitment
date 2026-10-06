-- Reopens the five pre-decision reads. No data is changed or deleted.
-- Use only with an explicit owner decision to reopen those boundaries.
DROP VIEW IF EXISTS public.graph_versions_published;
DROP VIEW IF EXISTS public.scp_bundle_versions_published;
DROP VIEW IF EXISTS public.scp_role_weight_profiles_published;
ALTER POLICY "graph_versions read all" ON public.graph_versions
  TO anon, authenticated USING (true);
GRANT SELECT ON public.graph_versions TO anon;
ALTER POLICY scp_bundle_versions_read ON public.scp_bundle_versions USING (true);
ALTER POLICY scp_role_weight_profiles_read ON public.scp_role_weight_profiles USING (true);
ALTER POLICY scp_forms_read ON public.scp_forms USING (true);
ALTER POLICY scp_form_blocks_read ON public.scp_form_blocks USING (true);
