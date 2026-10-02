-- =============================================================================
-- P1 -- Passport evidence and verification requests are written only by
--       their functions
-- =============================================================================
--
-- THE DEFECT (2026-10-02 pre-launch hostile-user audit, P1-4, reproduced on
-- production inside a rolled-back transaction):
--
--   `authenticated` held INSERT and UPDATE on sp_evidence, and the only row
--   rule (sp_evidence_self, FOR ALL) was holder_user_id = auth.uid(). Nothing
--   tied claim_id, period_id or storage_path to that same holder. Holder A
--   could therefore insert -- or repoint by UPDATE -- an evidence row of A's
--   onto holder B's claim. The verifier's dossier for B's claim showed A's
--   file, and B could not remove it (sp_withdraw_evidence: SP_NOT_HOLDER).
--   The attacker needs B's claim id, which older share links and an
--   employer's disclosure view carry.
--
--   sp_verification_requests had the same shape: a column INSERT grant and
--   sp_vr_self_insert (holder_user_id = auth.uid(), status 'pending'), with
--   nothing tying claim_id / period_id to the holder, and no employer
--   eligibility check. A could open a request on B's entry, which also blocks
--   B's own submission (SP_REQUEST_ALREADY_OPEN).
--
-- THE INVARIANT: no client writes either table directly. Every legitimate
-- write already goes through a SECURITY DEFINER function that checks the
-- holder, the target and (for evidence) the storage path:
--   sp_evidence               sp_attach_evidence, sp_withdraw_evidence
--   sp_verification_requests  sp_submit_for_verification,
--                             sp_withdraw_verification_request,
--                             sp_verifier_decide
-- The application only ever SELECTs these tables directly
-- (src/lib/security-passport/*.functions.ts).
--
-- Two independent layers:
--   1. Privileges: INSERT/UPDATE on sp_evidence and INSERT on
--      sp_verification_requests are revoked from every client role.
--   2. Policies: sp_evidence_self becomes SELECT-only and sp_vr_self_insert
--      is dropped, so no permissive write policy remains for a client role
--      even where a stack's default privileges re-grant a column.
--
-- NOT CHANGED: every read (holder, verifier, employer), the restrictive
-- session policy, the five functions above, Storage policies, any row.
--
-- HISTORICAL DATA (production, read-only, 2026-10-02): 12 evidence rows and
-- 11 requests; 0 whose claim/period belongs to another holder, 0 evidence
-- paths outside the holder's folder. Nothing to repair.
--
-- Rollback: supabase/rollback/20270106090000_sp_evidence_and_request_writes_rpc_only_rollback.sql
-- Suite:    supabase/tests/sp_evidence_and_request_writes_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
DECLARE _f text;
BEGIN
  FOREACH _f IN ARRAY ARRAY[
    'public.sp_attach_evidence(uuid,uuid,text,text,text,integer,text)',
    'public.sp_withdraw_evidence(uuid)',
    'public.sp_submit_for_verification(uuid,uuid,text,uuid)',
    'public.sp_withdraw_verification_request(uuid)'] LOOP
    IF to_regprocedure(_f) IS NULL THEN
      RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_PRECONDITION: % is missing', _f;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(_f)) THEN
      RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_PRECONDITION: % is not SECURITY DEFINER; revoking table writes would break it', _f;
    END IF;
  END LOOP;
END $$;

-- ── 1. Privileges ────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE ON public.sp_evidence FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, holder_user_id, claim_id, period_id, storage_path, file_name,
               mime_type, size_bytes, sha256, lifecycle_state, uploaded_at),
       UPDATE (id, holder_user_id, claim_id, period_id, storage_path, file_name,
               mime_type, size_bytes, sha256, lifecycle_state, uploaded_at)
  ON public.sp_evidence FROM PUBLIC, anon, authenticated;

REVOKE INSERT ON public.sp_verification_requests FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, holder_user_id, claim_id, period_id, request_kind, target_employer_id, status)
  ON public.sp_verification_requests FROM PUBLIC, anon, authenticated;

-- ── 2. Policies ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sp_evidence_self ON public.sp_evidence;
CREATE POLICY sp_evidence_self ON public.sp_evidence
  FOR SELECT TO authenticated
  USING (holder_user_id = auth.uid());
COMMENT ON POLICY sp_evidence_self ON public.sp_evidence IS
  'P1 2026-10-02 (20270106090000): a holder READS their own evidence. Writes '
  'go only through sp_attach_evidence / sp_withdraw_evidence, which check the '
  'holder, the claim or period, and the storage path.';

DROP POLICY IF EXISTS sp_vr_self_insert ON public.sp_verification_requests;

-- ── 3. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _r text; _c text;
BEGIN
  FOREACH _r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(_r, 'public.sp_evidence', 'INSERT')
       OR has_table_privilege(_r, 'public.sp_evidence', 'UPDATE')
       OR has_table_privilege(_r, 'public.sp_verification_requests', 'INSERT') THEN
      RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_PROOF: % still holds a table write privilege', _r;
    END IF;
    FOR _c IN SELECT attname FROM pg_attribute
               WHERE attrelid = 'public.sp_evidence'::regclass AND attnum > 0 AND NOT attisdropped LOOP
      IF has_column_privilege(_r, 'public.sp_evidence', _c, 'INSERT')
         OR has_column_privilege(_r, 'public.sp_evidence', _c, 'UPDATE') THEN
        RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_PROOF: % may still write sp_evidence.%', _r, _c;
      END IF;
    END LOOP;
    FOR _c IN SELECT attname FROM pg_attribute
               WHERE attrelid = 'public.sp_verification_requests'::regclass AND attnum > 0 AND NOT attisdropped LOOP
      IF has_column_privilege(_r, 'public.sp_verification_requests', _c, 'INSERT') THEN
        RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_PROOF: % may still insert sp_verification_requests.%', _r, _c;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename IN ('sp_evidence', 'sp_verification_requests')
                AND permissive = 'PERMISSIVE' AND cmd <> 'SELECT'
                AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) THEN
    RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_PROOF: a permissive client write policy remains';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.sp_evidence', 'SELECT') THEN
    RAISE EXCEPTION 'SP_WRITES_RPC_ONLY_PROOF: the holder lost their read of sp_evidence';
  END IF;
  RAISE NOTICE 'SP_WRITES_RPC_ONLY_PROOF ok: Passport evidence and requests are written only through their functions';
END $$;
