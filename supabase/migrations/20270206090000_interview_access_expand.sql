-- Interview access, expand. CLI-created 20261003195430; filename alone moved
-- to canonical slot 20270206090000 after checking all remote branches and open
-- PRs. Reservation and release order: PR #404, docs/security/interview-access.
-- Requires 20270204090000's scoped case gate; ordered after 20270205090000.
-- The old configuration read remains until the application is published with
-- this RPC. 20270207090000 is a SEPARATE contract release, not part of expand.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.scp_iv_can_read_case(uuid)') IS NULL
     OR position('employer_reports_readable' IN (SELECT prosrc FROM pg_proc
       WHERE oid='public.scp_iv_can_read_case(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'INTERVIEW_ACCESS_PRECONDITION: apply scoped case access (20270204090000) first';
  END IF;
END $$;

-- Private implementation: no raw administrative fields in the public return
-- contract. SECURITY DEFINER is needed to read the admin-only singleton after
-- contract; authorisation occurs before that read and is rechecked per call.
CREATE SCHEMA IF NOT EXISTS scp_private;
REVOKE ALL ON SCHEMA scp_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA scp_private TO authenticated;
CREATE FUNCTION scp_private.case_capabilities(_case_id uuid)
RETURNS TABLE(ai_enabled boolean, transcript_enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.scp_iv_can_read_case(_case_id), false) THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  -- Missing singleton is fail-closed, never a permission to run a provider.
  RETURN QUERY SELECT coalesce(c.ai_enabled, false), coalesce(c.transcript_enabled, false)
    FROM (SELECT true AS id) singleton
    LEFT JOIN public.scp_interview_ai_config c ON c.id = singleton.id;
END;
$$;
REVOKE ALL ON FUNCTION scp_private.case_capabilities(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION scp_private.case_capabilities(uuid) TO authenticated;

CREATE FUNCTION public.scp_iv_case_capabilities(_case_id uuid)
RETURNS TABLE(ai_enabled boolean, transcript_enabled boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM scp_private.case_capabilities(_case_id); $$;
REVOKE ALL ON FUNCTION public.scp_iv_case_capabilities(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_capabilities(uuid) TO authenticated;
COMMENT ON FUNCTION public.scp_iv_case_capabilities(uuid) IS
  'Two runtime flags for an authorised interview-case reader. No administrative metadata. '
  'Uses scp_iv_can_read_case including active standing, subject exclusion and vetting restrictions. '
  'Availability only: existing AI and transcript write gates remain authoritative.';

-- The raw version bank is platform-authoring material, in either mode and at
-- every publication status. Candidates receive assigned items through
-- scp_get_attempt_items, never this table. Assessors use their scoped case / 
-- report routes; employer membership is not a global content-author role.
ALTER POLICY scp_scenario_versions_read ON public.scp_scenario_versions
  TO authenticated USING (public.scp_can_author(auth.uid()));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='scp_scenario_versions' AND cmd IN ('SELECT','ALL')
    AND roles && ARRAY['public','anon','authenticated']::name[]
    AND (qual IS NULL OR qual = 'true')) THEN
    RAISE EXCEPTION 'INTERVIEW_ACCESS_PROOF: unconditional scenario read remains';
  END IF;
  IF has_function_privilege('anon','public.scp_iv_case_capabilities(uuid)','EXECUTE')
    OR has_function_privilege('anon','scp_private.case_capabilities(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'INTERVIEW_ACCESS_PROOF: anonymous capability execution';
  END IF;
END $$;
COMMIT;
