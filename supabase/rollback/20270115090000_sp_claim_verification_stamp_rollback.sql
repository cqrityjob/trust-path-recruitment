-- Rollback for 20270115090000_sp_claim_verification_stamp.
--
-- Restores sp_guard_trust_fields_immutable exactly as hosted before (md5
-- pinned below) and sp_claims_self_update's WITH CHECK without the
-- verified_at clause. This REOPENS P1-F of the 2026-10-02 re-audit: a holder
-- can again write verified_at on their own self-declared claim, and recipient
-- payloads will show it. No row is touched.

CREATE OR REPLACE FUNCTION public.sp_guard_trust_fields_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assertion_level IS DISTINCT FROM OLD.assertion_level THEN
    IF NEW.assertion_level = 'document_provided'
       AND OLD.assertion_level = 'self_declared'
       AND coalesce(current_setting('sp.evidence_context', true), '') = 'on' THEN
      NULL;
    -- Withdrawal. Only ever downward, and only from document_provided: a
    -- VERIFIED claim is never reduced by removing a file, because the
    -- verification was a decision about the fact, not about the upload.
    ELSIF NEW.assertion_level = 'self_declared'
       AND OLD.assertion_level = 'document_provided'
       AND coalesce(current_setting('sp.evidence_context', true), '') = 'on' THEN
      NULL;
    ELSIF coalesce(current_setting('sp.verification_context', true), '') = 'on' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'SP_TRUST_FIELD_IMMUTABLE: assertion_level may only change through the evidence or verification workflow'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     AND NEW.lifecycle_state NOT IN ('superseded', 'withdrawn')
     AND coalesce(current_setting('sp.verification_context', true), '') <> 'on' THEN
    RAISE EXCEPTION 'SP_LIFECYCLE_TRANSITION_NOT_ALLOWED: % -> % requires the verification workflow',
      OLD.lifecycle_state, NEW.lifecycle_state USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

ALTER POLICY sp_claims_self_update ON public.sp_claims
  WITH CHECK (holder_user_id = auth.uid()
              AND assertion_level = 'self_declared'
              AND verified_by_user_id IS NULL);

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_guard_trust_fields_immutable()'::regprocedure)) <> '5023814211fa52d78d4af1d14aab19cf' THEN
    RAISE EXCEPTION 'SP_VERIFICATION_STAMP_ROLLBACK: sp_guard_trust_fields_immutable is not the hosted pre-fix body';
  END IF;
  IF md5((SELECT coalesce(qual, '') || '|' || coalesce(with_check, '') FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'sp_claims' AND policyname = 'sp_claims_self_update')) <> '0dfb5e338f259e51ea3d11980b578ed7' THEN
    RAISE EXCEPTION 'SP_VERIFICATION_STAMP_ROLLBACK: sp_claims_self_update is not the hosted pre-fix policy';
  END IF;
  RAISE NOTICE 'SP_VERIFICATION_STAMP_ROLLBACK ok: pre-20270115090000 trigger and policy restored';
END $$;
