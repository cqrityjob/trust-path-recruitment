-- ============================================================================
-- 20261203090000 -- A security vetting's case ROW is the security function's
-- ============================================================================
--
-- 20261130090000 made a security vetting's interview case the appointed
-- security function's alone: scp_iv_can_read_case / _write_case add
-- bcp_case_access_ok, and every CHILD table of the case reads through them.
-- The case table itself kept its older policy,
--
--     scp_interview_cases_read  USING (has_employer_role(auth.uid(), employer_id, NULL))
--
-- so a plain member -- or an owner or admin who is not the security function
-- -- could still SELECT the vetting case's row: its title (role and
-- candidate), candidate reference and display name, application, job and
-- status, while scp_iv_can_read_case(case) answered false. This migration
-- closes that, and nothing else:
--
--   1. scp_iv_case_row_visible(case, employer) -- the SAME rule as
--      scp_iv_can_read_case (employer membership, and for a vetting case the
--      security function), but reading only the membership and BESKT tables,
--      never scp_interview_cases: the policy therefore cannot recurse.
--   2. scp_interview_cases_read is re-created on it. It is the table's only
--      policy (asserted below), so no other permissive policy keeps the row
--      open; the one view over the domain (scp_interview_process_quality) is
--      security_invoker and follows it; the child tables already read
--      through scp_iv_can_read_case, and scp_iv_corrections_employer's
--      EXISTS on the case table follows the new policy under RLS.
--   3. scp_iv_confirm_transcript_basis -- the one RPC that let an owner or
--      admin WRITE a vetting case without the security function -- now also
--      requires bcp_case_access_ok. Its body is md5-pinned (equal in
--      production 2026-09-19) and restored verbatim by the rollback.
--
-- A candidate never read this table directly; their views are the definer
-- RPCs scp_iv_candidate_interview_status / _detail, which are unchanged.
-- ROLLBACK REINTRODUCES THE GAP: run it only in an isolated test database.

DO $pre$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_confirm_transcript_basis(uuid,text,text,text,date)'::regprocedure))
       <> 'daf35ff566dc5e44ce799340cbcf8e46'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_case_vetting_restricted(uuid)'::regprocedure))
       <> 'b32abbdf35cb67dad076ff12b655277c'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_is_security_officer(uuid,uuid)'::regprocedure))
       <> 'ab47910593d1e6a343678d387e92af4e'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.has_employer_role(uuid,uuid,text[])'::regprocedure))
       <> 'c3b107a9b17f3e021efd1db967d1e461'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_can_read_case(uuid)'::regprocedure))
       <> '0407b86c8467b224ddece07781d80fa1'
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.bcp_case_access_ok(uuid)'::regprocedure))
       <> '02356e64182f89271b75895e4e9a8b64' THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_PRECONDITION: a pinned function body differs from the one verified in production.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_interview_cases') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = 'scp_interview_cases'
                       AND policyname = 'scp_interview_cases_read' AND cmd = 'SELECT'
                       AND permissive = 'PERMISSIVE' AND roles = ARRAY['authenticated']::name[]
                       AND qual = 'has_employer_role(auth.uid(), employer_id, NULL::text[])') THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_PRECONDITION: scp_interview_cases does not carry exactly the expected membership policy.';
  END IF;
  IF to_regprocedure('public.scp_iv_case_row_visible(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_PRECONDITION: scp_iv_case_row_visible already exists.';
  END IF;
END $pre$;


-- ---- 1. the rule, without reading the case table ----------------------------
CREATE FUNCTION public.scp_iv_case_row_visible(_case_id uuid, _employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), _employer_id, NULL::text[])
     AND (NOT public.bcp_case_vetting_restricted(_case_id)
          OR public.bcp_is_security_officer(_employer_id, auth.uid()));
$$;

COMMENT ON FUNCTION public.scp_iv_case_row_visible(uuid, uuid) IS
  'The read rule of scp_iv_can_read_case for the case row itself: employer membership, and for a '
  'security vetting''s case the appointed security function. Reads no scp_interview_cases row, so '
  'the case table''s policy can use it without recursion.';

REVOKE ALL ON FUNCTION public.scp_iv_case_row_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_case_row_visible(uuid, uuid) TO authenticated, service_role;


-- ---- 2. the case row follows it ---------------------------------------------
DROP POLICY scp_interview_cases_read ON public.scp_interview_cases;
CREATE POLICY scp_interview_cases_read ON public.scp_interview_cases
  FOR SELECT TO authenticated
  USING (public.scp_iv_case_row_visible(id, employer_id));


-- ---- 3. no write around the security function -------------------------------
CREATE OR REPLACE FUNCTION public.scp_iv_confirm_transcript_basis(_case_id uuid, _statement text, _candidate_informed_statement text DEFAULT NULL::text, _purpose_code text DEFAULT NULL::text, _retain_until date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CONFIRM_ROLE: confirming a lawful basis for transcript processing requires an employer owner or admin, not any member.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20261203090000: a security vetting's case is the appointed security
  -- function's alone (bcp_case_access_ok, 20261130090000). Being the
  -- employer's owner or admin is not that.
  IF NOT public.bcp_case_access_ok(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER: this case belongs to the security function.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _statement IS NULL OR btrim(_statement) = '' THEN
    RAISE EXCEPTION 'SCP_IV_TRANSCRIPT_STATEMENT_REQUIRED: state the lawful basis in writing.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _candidate_informed_statement IS NULL OR btrim(_candidate_informed_statement) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_CANDIDATE_NOT_INFORMED: state separately what the candidate was told about the recording, when and how. A lawful basis is not the same obligation as informing the person.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _purpose_code IS NULL OR btrim(_purpose_code) = '' THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_PURPOSE_REQUIRED: name the permitted purpose. A transcript processed for an unstated purpose can be used for any purpose later.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Retention has to be a decision someone made, not a field left blank. An
  -- open-ended retention period is indistinguishable from keeping it forever.
  IF _retain_until IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_RETENTION_REQUIRED: set a date after which this material is no longer kept.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _retain_until <= current_date THEN
    RAISE EXCEPTION
      'SCP_IV_TRANSCRIPT_RETENTION_IN_PAST: the retention date must be in the future.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases
     SET transcript_lawful_basis_confirmed_at = now(),
         transcript_lawful_basis_confirmed_by = auth.uid(),
         transcript_lawful_basis_statement = btrim(_statement),
         candidate_informed_confirmed_at = now(),
         candidate_informed_confirmed_by = auth.uid(),
         candidate_informed_statement = btrim(_candidate_informed_statement),
         transcript_purpose_code = btrim(_purpose_code),
         retain_until = _retain_until,
         retention_set_by = auth.uid(),
         retention_set_at = now(),
         updated_at = now()
   WHERE id = _case_id;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  PERFORM public.scp_iv_record_event(_case_id, 'transcript_authorised', 'human', NULL, NULL, NULL,
    btrim(_statement),
    jsonb_build_object('candidate_informed', true,
                       'purpose_code', btrim(_purpose_code),
                       'retain_until', _retain_until));
END; $function$;


REVOKE ALL ON FUNCTION public.scp_iv_confirm_transcript_basis(uuid, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_iv_confirm_transcript_basis(uuid, text, text, text, date) TO authenticated, service_role;

-- ---- postflight -----------------------------------------------------------------
DO $proof$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scp_interview_cases') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = 'scp_interview_cases'
                       AND policyname = 'scp_interview_cases_read' AND cmd = 'SELECT'
                       AND qual = 'scp_iv_case_row_visible(id, employer_id)') THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_PROOF: the case policy is not the security-aware one.';
  END IF;
  IF position('scp_interview_cases' IN (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_case_row_visible')) > 0 THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_PROOF: the policy helper reads the case table (recursion).';
  END IF;
  IF position('bcp_case_access_ok' IN (SELECT prosrc FROM pg_proc WHERE proname = 'scp_iv_confirm_transcript_basis')) = 0 THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_PROOF: the transcript basis can still be written around the security function.';
  END IF;
  IF has_function_privilege('anon', 'public.scp_iv_case_row_visible(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_iv_case_row_visible(uuid,uuid)', 'EXECUTE')
     OR has_table_privilege('anon', 'public.scp_interview_cases', 'SELECT')
     OR has_function_privilege('anon', 'public.scp_iv_confirm_transcript_basis(uuid,text,text,text,date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.scp_iv_confirm_transcript_basis(uuid,text,text,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_PROOF: a grant is not as intended.';
  END IF;
  RAISE NOTICE 'SCP_CASE_VETTING_READ_PROOF ok';
END $proof$;
