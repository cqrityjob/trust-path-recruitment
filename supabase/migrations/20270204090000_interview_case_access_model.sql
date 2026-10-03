-- =============================================================================
-- Interview Intelligence: a case is read and worked on by the people on it, not by
-- every member -- and a candidate's corrections follow the vetting restriction
-- =============================================================================
--
-- THE DEFECTS (docs/release/2026-10-03-report-access-security-finding.md;
-- design: docs/release/2026-10-03-employer-report-access-design.md):
--
--   1. scp_iv_can_read_case, scp_iv_case_row_visible and the child-table policies
--      built on them admit every active member of the organisation, and
--      scp_iv_can_write_case admits owner, admin AND member: any colleague opens
--      any candidate's interview case -- sources, assessments, findings, notes, the
--      final report -- and can assess, add notes and conclude on it. The readiness
--      document lists "per-case assignment" as missing before public production.
--   2. A member who is the CANDIDATE reads the case about themselves.
--   3. (finding a) scp_iv_corrections_employer, the policy that lets the employer
--      read a candidate's corrections, checks membership only and omits
--      bcp_case_access_ok. MEASURED on the replayed chain (interview_case_access_
--      model_test.sql IC0.6): this was NOT an observable leak, because the policy's
--      own sub-select reads scp_interview_cases under row-level security and the
--      case row policy already hides a vetting-restricted case from anyone who is
--      not an officer on it. It is defence in depth: the policy now asks the case
--      gate itself, so the vetting restriction no longer depends on that sub-select.
--
-- THE FIX: the three case gates ask the one definition,
-- employer_reports_readable (20270203090000), with the case as context: the
-- caller must hold active standing, must not be the candidate or the applicant,
-- and must be owner or admin, the case's CREATOR, a member of its PANEL, hold a
-- `recruitment` reviewer grant, or be the named responsible recruiter of the
-- case's vacancy (the case's job, else its application's job). Writes follow the
-- same predicate, and keep their own conditions (not cancelled, retention
-- active). bcp_case_access_ok stays in both: the vetting restriction is
-- additive and can only narrow. scp_iv_corrections_employer now asks
-- scp_iv_can_read_case, so it carries bcp_case_access_ok and the whole model.
-- Every child-table policy of Interview Intelligence already reads through the
-- gates and follows without being edited.
--
-- INHERITED, NOT EDITED: the BESKT conduct functions and the two member-read
-- policies on bcp_conduct_sessions / bcp_conduct_reports authorise through
-- scp_iv_can_read_case / scp_iv_can_write_case. After this a plain member joins
-- a conduct session, records a stance or reads a conduct report only if they are
-- the case's creator, on its panel, or authorised as above. No bcp_* object is
-- changed.
--
-- EXPAND ONLY: no signature, grant or column changes; an application written for
-- the old model gets "not found" / an empty list for a case a plain member is not
-- on, as it already does for a vetting-restricted case. Each body is the hosted
-- body (20270111090000) with only the marked lines changed.
--
-- Requires 20270203090000 (employer_reports_readable).
-- Rollback: supabase/rollback/20270204090000_interview_case_access_model_rollback.sql
-- Suite:    supabase/tests/interview_case_access_model_test.sql
-- =============================================================================

DO $$
DECLARE _s text;
BEGIN
  IF to_regprocedure('public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)') IS NULL THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_PRECONDITION: employer_reports_readable is missing; apply 20270203090000 first';
  END IF;
  FOREACH _s IN ARRAY ARRAY['public.scp_iv_can_read_case(uuid)', 'public.scp_iv_can_write_case(uuid)', 'public.scp_iv_case_row_visible(uuid,uuid)',
                            'public.bcp_case_access_ok(uuid)', 'public.bcp_case_vetting_restricted(uuid)',
                            'public.bcp_is_security_officer(uuid,uuid)'] LOOP
    IF to_regprocedure(_s) IS NULL THEN
      RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_PRECONDITION: % is missing', _s;
    END IF;
  END LOOP;
  IF to_regclass('public.scp_interview_candidate_corrections') IS NULL THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_PRECONDITION: scp_interview_candidate_corrections is missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.scp_iv_can_read_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     -- 20270204090000: the one definition (20270203090000). Standing, not the subject,
     -- and owner/admin, the case's creator or panel, a recruitment reviewer, or
     -- the responsible recruiter of the case's vacancy. A plain member who is
     -- none of those reads nothing. Interview cases are the recruitment use case.
     AND EXISTS (SELECT 1
                   FROM public.scp_interview_cases c
                   LEFT JOIN public.job_applications a ON a.id = c.application_id
                  WHERE c.id = _case_id
                    AND public.employer_reports_readable(
                          c.employer_id, 'recruitment', c.job_id, c.application_id,
                          ARRAY[c.candidate_user_id, a.applicant_user_id], c.id))
     -- Additive, and unchanged: the security-vetting restriction narrows, never widens.
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
     -- 20270204090000: the same predicate as the read -- a plain member who is not the
     -- creator, on the panel or authorised is refused for write as well.
     AND EXISTS (SELECT 1
                   FROM public.scp_interview_cases c
                   LEFT JOIN public.job_applications a ON a.id = c.application_id
                  WHERE c.id = _case_id
                    AND c.status <> 'cancelled'
                    AND c.retention_state = 'active'
                    AND public.employer_reports_readable(
                          c.employer_id, 'recruitment', c.job_id, c.application_id,
                          ARRAY[c.candidate_user_id, a.applicant_user_id], c.id))
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
     -- 20270204090000: the one definition, for the row the policy is looking at
     AND EXISTS (SELECT 1
                   FROM public.scp_interview_cases c
                   LEFT JOIN public.job_applications a ON a.id = c.application_id
                  WHERE c.id = _case_id
                    AND c.employer_id = _employer_id
                    AND public.employer_reports_readable(
                          c.employer_id, 'recruitment', c.job_id, c.application_id,
                          ARRAY[c.candidate_user_id, a.applicant_user_id], c.id))
     AND (NOT public.bcp_case_vetting_restricted(_case_id)
          OR public.bcp_is_security_officer(_employer_id, auth.uid()));
$function$
;

REVOKE ALL ON FUNCTION public.scp_iv_case_row_visible(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_row_visible(uuid,uuid) TO authenticated, service_role;

-- Finding a (defence in depth, see the header): the employer's read of a candidate's
-- corrections follows the case gate, and with it bcp_case_access_ok, instead of leaning on
-- row-level security inside the policy's sub-select. The candidate's own policies are untouched.
ALTER POLICY "scp_iv_corrections_employer" ON public.scp_interview_candidate_corrections
  USING (public.scp_iv_can_read_case(case_id));

DO $$
DECLARE _s text; _src text;
BEGIN
  FOREACH _s IN ARRAY ARRAY['public.scp_iv_can_read_case(uuid)', 'public.scp_iv_can_write_case(uuid)', 'public.scp_iv_case_row_visible(uuid,uuid)'] LOOP
    _src := (SELECT prosrc FROM pg_proc WHERE oid = _s::regprocedure);
    IF position('20270204090000' IN _src) = 0 OR position('employer_reports_readable' IN _src) = 0
       OR position('has_active_employer_role' IN _src) > 0 THEN
      RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_PROOF: % does not ask the one definition (or still decides on membership)', _s;
    END IF;
  END LOOP;
  IF position('bcp_case_access_ok' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_can_read_case(uuid)'::regprocedure)) = 0
     OR position('bcp_case_access_ok' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_can_write_case(uuid)'::regprocedure)) = 0
     OR position('bcp_case_vetting_restricted' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_case_row_visible(uuid,uuid)'::regprocedure)) = 0
     OR position('bcp_is_security_officer' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_case_row_visible(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_PROOF: the vetting restriction is no longer in a case gate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'scp_iv_corrections_employer'
                  AND qual ~ 'scp_iv_can_read_case') THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_PROOF: the corrections policy does not use the case gate';
  END IF;
  IF has_function_privilege('anon', 'public.scp_iv_can_read_case(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_iv_can_write_case(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_iv_case_row_visible(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_iv_can_read_case(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_iv_can_write_case(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_iv_case_row_visible(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'INTERVIEW_CASE_ACCESS_PROOF: the case gates'' grants moved';
  END IF;
  RAISE NOTICE 'INTERVIEW_CASE_ACCESS_PROOF ok: three case gates and the corrections policy ask the one definition; the vetting restriction is intact';
END $$;
