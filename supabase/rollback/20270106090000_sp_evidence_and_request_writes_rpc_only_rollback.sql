-- Rollback for 20270106090000_sp_evidence_and_request_writes_rpc_only.
--
-- Restores the pre-fix grants and policies exactly: table INSERT/UPDATE on
-- sp_evidence and column INSERT on sp_verification_requests for
-- `authenticated`, sp_evidence_self FOR ALL, and sp_vr_self_insert. This
-- REOPENS P1-4 of the 2026-10-02 audit: a holder can again attach or repoint
-- evidence onto another holder's claim, and open a request on another
-- holder's entry. No row is touched.

GRANT INSERT, UPDATE ON public.sp_evidence TO authenticated;
GRANT INSERT (id, holder_user_id, claim_id, period_id, request_kind, target_employer_id, status)
  ON public.sp_verification_requests TO authenticated;

DROP POLICY IF EXISTS sp_evidence_self ON public.sp_evidence;
CREATE POLICY sp_evidence_self ON public.sp_evidence
  FOR ALL TO authenticated
  USING (holder_user_id = auth.uid())
  WITH CHECK (holder_user_id = auth.uid());

DROP POLICY IF EXISTS sp_vr_self_insert ON public.sp_verification_requests;
CREATE POLICY sp_vr_self_insert ON public.sp_verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (holder_user_id = auth.uid() AND status = 'pending' AND decided_by IS NULL);

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.sp_evidence', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.sp_evidence', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.sp_verification_requests', 'claim_id', 'INSERT')
     OR (SELECT cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sp_evidence'
           AND policyname = 'sp_evidence_self') <> 'ALL'
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'sp_verification_requests' AND policyname = 'sp_vr_self_insert') THEN
    RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_ROLLBACK: the pre-20270106090000 grants and policies were not restored';
  END IF;
  RAISE NOTICE 'SP_WRITES_RPC_ONLY_ROLLBACK ok: direct client writes are back to the pre-fix shape';
END $$;
