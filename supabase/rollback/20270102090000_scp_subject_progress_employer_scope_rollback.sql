-- Rollback for 20270102090000_scp_subject_progress_employer_scope.
--
-- Restores scp_subject_progress exactly as 20260820100000 defined it (hosted
-- md5(prosrc) 8d67a323904788c41f9be3f7384ae606). This REOPENS P0-1 of the
-- 2026-10-02 audit: an employer member can again read another employer's
-- employer-audience report rows for a shared subject. No row is touched.

CREATE OR REPLACE FUNCTION public.scp_subject_progress(_subject_id uuid)
 RETURNS TABLE(released_at timestamp with time zone, attempt_id uuid, competency_code text, competency_name_sv text, competency_name_en text, evidence_state text, observations integer, safety_flag_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _audience text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_subject_identities si
              WHERE si.subject_id = _subject_id AND si.user_id = auth.uid()) THEN
    _audience := 'participant';
  ELSIF EXISTS (SELECT 1 FROM public.scp_attempts a
                  JOIN public.employer_memberships m
                    ON m.employer_id = a.issuer_organization_id
                   AND m.user_id = auth.uid() AND m.status = 'active'
                 WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL) THEN
    _audience := 'employer';
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.released_at, s.attempt_id,
         x->>'competency_code', x->>'competency_name_sv', x->>'competency_name_en',
         x->>'evidence_state', (x->>'observations')::int,
         jsonb_array_length(s.safety_flags)
    FROM public.scp_report_snapshots s,
         jsonb_array_elements(s.payload) x
   WHERE s.subject_id = _subject_id
     AND s.audience = _audience
   ORDER BY s.released_at, x->>'competency_code';
END;
$function$

;

COMMENT ON FUNCTION public.scp_subject_progress(uuid) IS NULL;
REVOKE ALL ON FUNCTION public.scp_subject_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_subject_progress(uuid) TO authenticated;

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_subject_progress(uuid)'::regprocedure))
     <> '8d67a323904788c41f9be3f7384ae606' THEN
    RAISE EXCEPTION 'SCP_PROGRESS_SCOPE_ROLLBACK: the restored body is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'SCP_PROGRESS_SCOPE_ROLLBACK ok: pre-20270102090000 body restored';
END $$;
