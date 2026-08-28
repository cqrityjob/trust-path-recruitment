DROP POLICY IF EXISTS scp_scoring_versions_read ON public.scp_scoring_versions;
DROP POLICY IF EXISTS scp_role_weight_profile_weights_read ON public.scp_role_weight_profile_weights;

CREATE VIEW public.scp_scoring_version_lineage AS
SELECT
  sv.id,
  sv.slug,
  sv.version_number,
  sv.content_status,
  sv.validation_status,
  sv.published_at,
  sv.retired_at,
  sv.core_summary_is_indicative,
  sv.norm_comparison_permitted
FROM public.scp_scoring_versions sv;

GRANT SELECT ON public.scp_scoring_version_lineage TO authenticated;
GRANT SELECT ON public.scp_scoring_version_lineage TO service_role;

INSERT INTO public.scp_content_events (subject_type, subject_ref, action, reason, metadata) VALUES (
  'assessment_version', 'scp-a4-scoring-visibility', 'updated',
  'Review finding LOW-4: internal scoring configuration restricted to authoring roles; lineage exposed through a minimal read model.',
  jsonb_build_object('migration', '20260727150000_scp_a4_scoring_visibility')
);