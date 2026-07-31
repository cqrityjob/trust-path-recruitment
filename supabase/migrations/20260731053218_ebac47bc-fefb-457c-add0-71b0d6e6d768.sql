-- 1. Security definer view -> invoker
ALTER VIEW public.scp_scoring_version_lineage SET (security_invoker = true);

-- 2. Pin search_path on project functions
ALTER FUNCTION public.cd_guard_adaptive_path_immutable() SET search_path = public;
ALTER FUNCTION public.scp_guard_definition_identity() SET search_path = public;
ALTER FUNCTION public.cd_guard_snapshot_versions_immutable() SET search_path = public;
ALTER FUNCTION public.cd_derive_adaptive_path(text) SET search_path = public;
ALTER FUNCTION public.cd_guard_completion_is_server_side() SET search_path = public;
ALTER FUNCTION public.assessment_assignments_immutable_guard() SET search_path = public;
ALTER FUNCTION public.scp_guard_family_identity() SET search_path = public;
ALTER FUNCTION public.scp_guard_legal_review_before_publish() SET search_path = public;
ALTER FUNCTION public.scp_guard_version_starts_as_draft() SET search_path = public;
ALTER FUNCTION public.cd_guard_derive_adaptive_path() SET search_path = public;
ALTER FUNCTION public.cd_guard_evidence_scoring_boundary() SET search_path = public;
ALTER FUNCTION public.cd_guard_adaptive_matches_session_path() SET search_path = public;

-- 3. Revoke anon EXECUTE on SECURITY DEFINER functions that must not be publicly callable.
--    public.employer_is_active_status is intentionally left callable: the anon
--    RLS policy jobs_public_active_select depends on it for public job browsing.
REVOKE EXECUTE ON FUNCTION public.scp_guard_bundle_composition() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cd_session_core_completion(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assessment_assignments_block_retired() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cd_guard_snapshot_requires_exact_core() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.scp_guard_family_product_separation() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.scp_guard_published_immutable() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cd_guard_evidence_matches_definition() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cd_guard_snapshot_derive_versions() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.scp_guard_child_of_published() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assessment_assignments_block_retired_reactivation() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cd_guard_session_requires_administrable_version() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.cd_session_core_completion(uuid) TO authenticated, service_role;