-- Owner decision 2026-10-06: published catalogue content remains readable;
-- drafts, internal actor IDs and internal notes are author/admin-only.
-- Schema-only release. No data rewrite and no change to the other 34 reads.

ALTER POLICY "graph_versions read all" ON public.graph_versions
  TO authenticated USING (public.is_platform_admin(auth.uid()));
REVOKE SELECT ON public.graph_versions FROM PUBLIC, anon;
ALTER POLICY scp_bundle_versions_read ON public.scp_bundle_versions
  USING (public.scp_can_author(auth.uid()));
ALTER POLICY scp_role_weight_profiles_read ON public.scp_role_weight_profiles
  USING (public.scp_can_author(auth.uid()));

-- These narrowly projected views deliberately run as the table owner:
-- invoker views cannot read the now author-only base tables. Every projection
-- has an explicit publication predicate and excludes internal columns.
-- security_barrier prevents caller predicates from observing filtered rows.
CREATE VIEW public.graph_versions_published
  WITH (security_barrier = true, security_invoker = false) AS
  SELECT id, version, created_at, published_at, is_active
  FROM public.graph_versions WHERE published_at IS NOT NULL;
CREATE VIEW public.scp_bundle_versions_published
  WITH (security_barrier = true, security_invoker = false) AS
  SELECT id, bundle_id, version_number, content_status, validation_status,
    core_assessment_version_id, module_assessment_version_id,
    core_form_id, module_form_id, role_weight_profile_id, report_version,
    disclaimer_version, content_hash, approved_at, published_at, retired_at,
    created_at, updated_at, scoring_version_id
  FROM public.scp_bundle_versions WHERE content_status = 'published';
CREATE VIEW public.scp_role_weight_profiles_published
  WITH (security_barrier = true, security_invoker = false) AS
  SELECT id, profession_id, version_number, content_status, validation_status,
    content_hash, published_at, retired_at, created_at, updated_at
  FROM public.scp_role_weight_profiles WHERE content_status = 'published';

ALTER VIEW public.graph_versions_published OWNER TO postgres;
ALTER VIEW public.scp_bundle_versions_published OWNER TO postgres;
ALTER VIEW public.scp_role_weight_profiles_published OWNER TO postgres;
REVOKE ALL ON public.graph_versions_published,
  public.scp_bundle_versions_published, public.scp_role_weight_profiles_published
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.graph_versions_published TO anon, authenticated;
GRANT SELECT ON public.scp_bundle_versions_published,
  public.scp_role_weight_profiles_published TO authenticated;

ALTER POLICY scp_forms_read ON public.scp_forms USING (
  public.scp_can_author(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.scp_assessment_versions v
    WHERE v.id = scp_forms.assessment_version_id AND v.content_status = 'published'
  )
);
ALTER POLICY scp_form_blocks_read ON public.scp_form_blocks USING (
  public.scp_can_author(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.scp_forms f
    JOIN public.scp_assessment_versions v ON v.id = f.assessment_version_id
    WHERE f.id = scp_form_blocks.form_id AND v.content_status = 'published'
  )
);

COMMENT ON VIEW public.graph_versions_published IS
  'Published graph identity only. Deliberate owner projection; no notes or created_by. Base rows are platform-admin-only.';
COMMENT ON VIEW public.scp_bundle_versions_published IS
  'Published bundle projection; no approved_by, published_by or retired_reason. Authors use the RLS-protected base table.';
COMMENT ON VIEW public.scp_role_weight_profiles_published IS
  'Published profile metadata; no internal notes and no scoring weights. Authors use the RLS-protected base table.';
