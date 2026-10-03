-- Rollback of 20270204090000_interview_case_access_model.
--
-- !! THIS REOPENS THE CASE TO EVERY MEMBER !! Any active member of an organisation
-- again reads and works on any of its interview cases, a candidate's corrections
-- on a security-vetting case are again readable by a member who may not open
-- the case, and a member who is the candidate again reads the case about
-- themselves. Run it ONLY in an isolated test database (scripts/db-test.sh and the
-- suite cycle it). Restores the three gates to the hosted 20270111090000 bodies
-- (md5(prosrc) pinned and verified) and the corrections policy to its hosted form.
-- Roll back BEFORE 20270203090000.

CREATE OR REPLACE FUNCTION public.scp_iv_can_read_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     -- 20270111090000: an active member of an ACTIVE organisation
     AND public.has_active_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id), NULL)
     AND public.bcp_case_access_ok(_case_id);
$function$
;

REVOKE ALL ON FUNCTION public.scp_iv_can_read_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_can_read_case(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_iv_can_write_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     -- 20270111090000: an active member of an ACTIVE organisation
     AND public.has_active_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id),
                                  ARRAY['owner','admin','member'])
     AND EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = _case_id
                    AND c.status <> 'cancelled'
                    AND c.retention_state = 'active')
     AND public.bcp_case_access_ok(_case_id);
$function$
;

REVOKE ALL ON FUNCTION public.scp_iv_can_write_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_can_write_case(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scp_iv_case_row_visible(_case_id uuid, _employer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     -- 20270111090000: an active member of an ACTIVE organisation
     AND public.has_active_employer_role(auth.uid(), _employer_id, NULL::text[])
     AND (NOT public.bcp_case_vetting_restricted(_case_id)
          OR public.bcp_is_security_officer(_employer_id, auth.uid()));
$function$
;

REVOKE ALL ON FUNCTION public.scp_iv_case_row_visible(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_row_visible(uuid,uuid) TO authenticated, service_role;

ALTER POLICY "scp_iv_corrections_employer" ON public.scp_interview_candidate_corrections
  USING ((EXISTS ( SELECT 1
   FROM scp_interview_cases c
  WHERE ((c.id = scp_interview_candidate_corrections.case_id) AND has_active_employer_role(auth.uid(), c.employer_id)))));

DO $$
DECLARE _pins jsonb := '{"public.scp_iv_can_read_case(uuid)": "e60a8e8a9741d6241cdd98005fbd4094", "public.scp_iv_can_write_case(uuid)": "1249ebde36e1743a717050ab48573a61", "public.scp_iv_case_row_visible(uuid,uuid)": "b6f6f202675bddc95a6e2e83cba67bf6"}'::jsonb;
  _k text; _bad text := '';
BEGIN
  FOR _k IN SELECT jsonb_object_keys(_pins) LOOP
    IF md5((SELECT prosrc FROM pg_proc WHERE oid = _k::regprocedure)) <> _pins ->> _k THEN
      _bad := _bad || ' ' || _k;
    END IF;
  END LOOP;
  IF _bad <> '' THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_ROLLBACK: not the hosted pre-fix body:%', _bad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'scp_iv_corrections_employer'
                  AND qual ~ 'has_active_employer_role' AND qual !~ 'scp_iv_can_read_case') THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_ROLLBACK: the corrections policy is not the hosted one';
  END IF;
  RAISE NOTICE 'INTERVIEW_CASE_ACCESS_ROLLBACK ok: the member-wide case gates are back';
END $$;
