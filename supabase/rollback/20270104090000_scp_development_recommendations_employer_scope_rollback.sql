-- Rollback for 20270104090000_scp_development_recommendations_employer_scope.
--
-- Restores scp_development_recommendations exactly as hosted before
-- (md5(prosrc) 4f95eafb1ee4c7161c14b2bf7fa409f9) and drops the private helper
-- scp_compute_maturity_for_issuers. This REOPENS P1-2 of the 2026-10-02 audit:
-- an employer's recommendations are again selected and levelled from every
-- employer's evidence for the subject. No row is touched. CREATE OR REPLACE
-- keeps the comment.

CREATE OR REPLACE FUNCTION public.scp_development_recommendations(_subject_id uuid)
 RETURNS TABLE(module_version_id uuid, module_name_sv text, module_name_en text, summary_sv text, summary_en text, estimated_minutes integer, addresses_competency_sv text, addresses_competency_en text, maturity_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM public.scp_subject_identities si
         WHERE si.subject_id = _subject_id AND si.user_id = auth.uid())
     AND NOT EXISTS (
        SELECT 1 FROM public.scp_attempts a
          JOIN public.employer_memberships m
            ON m.employer_id = a.issuer_organization_id
           AND m.user_id = auth.uid() AND m.status = 'active'
         WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL)
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT ON (mv.id)
    mv.id, mv.name_sv, mv.name_en, mv.summary_sv, mv.summary_en,
    mv.estimated_minutes, cv.name_sv, cv.name_en,
    public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
  FROM public.scp_competency_evidence e
  JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
  JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
  JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
  JOIN public.scp_module_behaviour_map mbm ON mbm.behaviour_version_id = bv.id
  JOIN public.scp_module_versions mv ON mv.id = mbm.module_version_id
  JOIN public.scp_modules m ON m.id = mv.module_id
  WHERE e.subject_id = _subject_id
    AND e.superseded_by IS NULL
    -- #47: recommend only content that could actually be delivered. A draft or
    -- retired module is not a development option, it is an authoring artefact.
    AND mv.content_status = 'published'
    AND mv.retired_at IS NULL
    -- And never recommend another employer's private content.
    AND m.owner_employer_id IS NULL
    AND public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
        IN ('no_evidence','limited_evidence','developing_evidence')
  ORDER BY mv.id, mv.display_order;
END; $function$
;

REVOKE ALL ON FUNCTION public.scp_development_recommendations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_development_recommendations(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.scp_compute_maturity_for_issuers(uuid, uuid, text, timestamp with time zone, uuid[]);

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_development_recommendations(uuid)'::regprocedure))
     <> '4f95eafb1ee4c7161c14b2bf7fa409f9'
     OR to_regprocedure('public.scp_compute_maturity_for_issuers(uuid,uuid,text,timestamp with time zone,uuid[])') IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_RECOMMENDATIONS_SCOPE_ROLLBACK: the pre-20270104090000 state was not restored';
  END IF;
  RAISE NOTICE 'SCP_RECOMMENDATIONS_SCOPE_ROLLBACK ok: pre-20270104090000 body restored, helper dropped';
END $$;
