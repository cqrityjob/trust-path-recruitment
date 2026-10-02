-- Rollback for 20270116090000_scp_iv_findings_review_writes.
--
-- Restores the hosted state: table-level UPDATE on scp_interview_findings for
-- authenticated, the update policy on scp_iv_can_write_case alone, and no
-- attribution trigger. This REOPENS P1-C of the 2026-10-02 re-audit: any
-- member of the employer can again rewrite any column of any finding on a
-- case, including dropping it from the report and forging who reviewed it.
-- No row is touched.

DROP TRIGGER IF EXISTS scp_interview_findings_review_stamp ON public.scp_interview_findings;
DROP FUNCTION IF EXISTS public.scp_iv_stamp_finding_review();

REVOKE UPDATE (resolution_state, human_state, human_note) ON public.scp_interview_findings FROM authenticated;
GRANT UPDATE ON public.scp_interview_findings TO authenticated;

ALTER POLICY scp_interview_findings_update ON public.scp_interview_findings
  USING (public.scp_iv_can_write_case(case_id))
  WITH CHECK (public.scp_iv_can_write_case(case_id));

DO $$
BEGIN
  IF md5((SELECT coalesce(qual, '') || '|' || coalesce(with_check, '') FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'scp_interview_findings'
             AND policyname = 'scp_interview_findings_update')) <> 'eedd2ff88ee20bc5d5fdfeb1f6e1be33' THEN
    RAISE EXCEPTION 'SCP_IV_FINDINGS_ROLLBACK: scp_interview_findings_update is not the hosted pre-fix policy';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.scp_interview_findings', 'UPDATE') THEN
    RAISE EXCEPTION 'SCP_IV_FINDINGS_ROLLBACK: table-level UPDATE was not restored';
  END IF;
  RAISE NOTICE 'SCP_IV_FINDINGS_ROLLBACK ok: pre-20270116090000 grants, policy and triggers restored';
END $$;
