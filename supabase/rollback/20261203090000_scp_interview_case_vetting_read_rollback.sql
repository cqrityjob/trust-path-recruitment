-- Rollback of 20261203090000_scp_interview_case_vetting_read.
--
-- !! THIS REINTRODUCES A KNOWN ACCESS GAP !!
-- After it, any member of an employer can again SELECT a security vetting's
-- interview case row (title, candidate, application), and an owner or admin
-- who is not the security function can again confirm its transcript basis.
-- Run it ONLY in an isolated test database (scripts/db-test.sh cycles it to
-- prove it restores the previous state exactly), never against production.
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'scp_interview_cases'
                    AND policyname = 'scp_interview_cases_read'
                    AND qual = 'scp_iv_case_row_visible(id, employer_id)')
     OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_confirm_transcript_basis(uuid,text,text,text,date)'::regprocedure))
        <> 'eb9c745d2b7745299c41289c385e9e36' THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_ROLLBACK: the database is not in the state 20261203090000 leaves.';
  END IF;
END $guard$;

DROP POLICY scp_interview_cases_read ON public.scp_interview_cases;
CREATE POLICY scp_interview_cases_read ON public.scp_interview_cases
  FOR SELECT TO authenticated
  USING (public.has_employer_role(auth.uid(), employer_id, NULL::text[]));

DROP FUNCTION public.scp_iv_case_row_visible(uuid, uuid);

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

DO $rbproof$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.scp_iv_confirm_transcript_basis(uuid,text,text,text,date)'::regprocedure))
       <> 'daf35ff566dc5e44ce799340cbcf8e46'
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = 'scp_interview_cases'
                       AND policyname = 'scp_interview_cases_read'
                       AND qual = 'has_employer_role(auth.uid(), employer_id, NULL::text[])') THEN
    RAISE EXCEPTION 'SCP_CASE_VETTING_READ_ROLLBACK: the previous state was not restored exactly.';
  END IF;
  RAISE NOTICE 'SCP_CASE_VETTING_READ_ROLLBACK ok (the membership-only case read is back: test databases only)';
END $rbproof$;
