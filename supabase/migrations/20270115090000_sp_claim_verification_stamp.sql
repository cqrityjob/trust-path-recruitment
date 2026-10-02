-- =============================================================================
-- P1-F -- a holder cannot set or change a claim's verification stamp
-- =============================================================================
--
-- THE DEFECT (2026-10-02 full re-audit, P1-F, reproduced on production inside
-- a rolled-back transaction):
--
--   sp_claims carries the verification stamp verified_at and
--   verified_by_user_id. sp_verifier_decide writes both when it approves.
--   The holder's own UPDATE policy (sp_claims_self_update) required
--   verified_by_user_id IS NULL, but nothing covered verified_at: neither
--   the policy nor the trust-field trigger sp_guard_trust_fields_immutable,
--   which guards assertion_level and lifecycle_state. authenticated holds
--   UPDATE on every column. A holder therefore wrote verified_at on their own
--   self-declared credential (rows=1). sp_selected_merits_payload, which
--   serves recipient links and previews, then emitted
--   assertion=self_declared with verified_at=2026-01-15, and the recipient
--   view renders a "verified at" line whenever the value is present.
--
-- THE INVARIANT: on a claim, verified_at and verified_by_user_id change only
-- inside the verification workflow, and a holder's direct edit never leaves a
-- self-declared claim carrying a verification time.
--
-- THE FIX: two independent layers, either of which alone refuses the forgery.
--   1. sp_guard_trust_fields_immutable: on sp_claims, a change to verified_at
--      or verified_by_user_id outside sp.verification_context raises
--      SP_TRUST_FIELD_IMMUTABLE -- the rule it already applies to
--      assertion_level. sp_verifier_decide is the only writer that sets the
--      context; no other function writes either column on UPDATE.
--   2. sp_claims_self_update (WITH CHECK) also requires verified_at IS NULL,
--      as it already required verified_by_user_id IS NULL.
--
-- NOT CHANGED: the verification workflow; sp_correct_claim (a definer INSERT
-- that carries the stamp forward on a non-material correction and clears it on
-- a material one); every holder edit of a claim's own fields; the period table
-- (it shares the trigger, and the new block is skipped for it); grants;
-- reads; payloads; any row. Hosted: every claim with a verified_at has an
-- approved verification decision, and no self-declared claim carries one.
--
-- Rollback: supabase/rollback/20270115090000_sp_claim_verification_stamp_rollback.sql
-- Suite:    supabase/tests/sp_claim_verification_stamp_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.sp_guard_trust_fields_immutable()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                     AND tablename = 'sp_claims' AND policyname = 'sp_claims_self_update') THEN
    RAISE EXCEPTION 'SP_VERIFICATION_STAMP_PRECONDITION: the trust-field trigger or the holder update policy is missing';
  END IF;
  -- Nothing to repair: no self-declared claim may already carry a stamp.
  IF EXISTS (SELECT 1 FROM public.sp_claims
              WHERE assertion_level = 'self_declared'
                AND (verified_at IS NOT NULL OR verified_by_user_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'SP_VERIFICATION_STAMP_PRECONDITION: a self-declared claim already carries a verification stamp; investigate before applying';
  END IF;
END $$;

-- ── 1. The trust-field trigger guards the stamp ───────────────────────────
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

  -- 20270115090000: the verification stamp. On a claim, verified_at and
  -- verified_by_user_id record who verified it and when; only the
  -- verification workflow (sp_verifier_decide, which sets
  -- sp.verification_context) may write them. Nested so the column names are
  -- only resolved for sp_claims: sp_experience_periods shares this trigger
  -- and has neither column.
  IF TG_TABLE_NAME = 'sp_claims' THEN
    IF (NEW.verified_at IS DISTINCT FROM OLD.verified_at
        OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id)
       AND coalesce(current_setting('sp.verification_context', true), '') <> 'on' THEN
      RAISE EXCEPTION 'SP_TRUST_FIELD_IMMUTABLE: verified_at and verified_by_user_id may only change through the verification workflow'
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

-- ── 2. The holder's own update leaves no verification time ────────────────
ALTER POLICY sp_claims_self_update ON public.sp_claims
  WITH CHECK (holder_user_id = auth.uid()
              AND assertion_level = 'self_declared'
              AND verified_by_user_id IS NULL
              -- 20270115090000: and no verification time either.
              AND verified_at IS NULL);

-- ── 3. Postflight ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF position('verified_at IS DISTINCT FROM OLD.verified_at' IN
       (SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_guard_trust_fields_immutable()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SP_VERIFICATION_STAMP_PROOF: the trust-field trigger does not guard verified_at';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sp_claims'
                  AND policyname = 'sp_claims_self_update' AND with_check LIKE '%verified_at IS NULL%') THEN
    RAISE EXCEPTION 'SP_VERIFICATION_STAMP_PROOF: sp_claims_self_update does not require verified_at IS NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_claims_trust_immutable' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_periods_trust_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'SP_VERIFICATION_STAMP_PROOF: a trust-field trigger is missing';
  END IF;
  RAISE NOTICE 'SP_VERIFICATION_STAMP_PROOF ok: the verification stamp changes only through the verification workflow';
END $$;
