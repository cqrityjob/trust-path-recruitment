-- =============================================================================
-- P1-H -- a Passport entry under review cannot change underneath the reviewer
-- =============================================================================
--
-- THE DEFECT (2026-10-02 final audit, P1-H, reproduced on production with a
-- rolled-back probe):
--
--   A holder's self-declared claim or experience period stays writable by the
--   holder (sp_claims_self_update, sp_periods_self_update) while a
--   verification request on it is open, and sp_verifier_decide approves
--   whatever the row holds when the reviewer clicks. A holder could submit
--   plausible data and then change dates, role, employer or validity before
--   the CQrityjob reviewer or the employer approved -- a verified entry nobody
--   reviewed (probe: edited while pending, approved, started_on shifted 3650
--   days, assertion_level = verified). sp_credential_details already refuses
--   edits once a request exists; the claim and period rows did not.
--
-- THE FIX: a BEFORE UPDATE trigger on sp_claims and sp_experience_periods,
-- for direct client writes only (current_user is a client role; the SECURITY
-- DEFINER Passport functions -- decide, revoke, correct, withdraw, dispute --
-- run as the owner and are unaffected):
--   - while a request on the entry is 'pending' (in review), the holder's edit
--     is refused: SP_ENTRY_UNDER_REVIEW;
--   - while a request is 'clarification_requested' the reviewer has asked the
--     holder to correct the entry, so the edit is allowed -- and the request
--     returns to 'pending', so the reviewer decides on what is there now and
--     the entry is frozen again until they do.
--
-- NOT CHANGED: the row policies; the trust-field guards; every Passport RPC;
-- entries with no open request; CV-only claims with no request; any row.
-- Production holds 0 open requests on claims or periods.
--
-- Rollback: supabase/rollback/20270119090000_sp_entry_frozen_under_review_rollback.sql
-- Suite:    supabase/tests/sp_entry_frozen_under_review_test.sql
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.sp_claims') IS NULL OR to_regclass('public.sp_experience_periods') IS NULL
     OR to_regclass('public.sp_verification_requests') IS NULL THEN
    RAISE EXCEPTION 'SP_ENTRY_REVIEW_PRECONDITION: the Passport entry or request tables are missing';
  END IF;
END $$;

-- The review state of the caller's own entry. 'pending' means in review;
-- 'answered' means a clarification request was just returned to review by
-- this edit. Anybody else's entry, or none open: NULL. SECURITY DEFINER
-- because the request table is not client-writable; it acts only on the
-- caller's own entry, and returning one's own clarification to review is
-- exactly what the holder's edit means.
CREATE OR REPLACE FUNCTION public.sp_entry_review_on_holder_edit(_claim_id uuid, _period_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _holder uuid; _n integer;
BEGIN
  IF num_nonnulls(_claim_id, _period_id) <> 1 THEN RETURN NULL; END IF;
  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL OR _holder IS DISTINCT FROM auth.uid() THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM public.sp_verification_requests r
              WHERE r.status = 'pending'
                AND (r.claim_id = _claim_id OR r.period_id = _period_id)) THEN
    RETURN 'pending';
  END IF;

  UPDATE public.sp_verification_requests r
     SET status = 'pending', submitted_at = now()
   WHERE r.status = 'clarification_requested'
     AND (r.claim_id = _claim_id OR r.period_id = _period_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN CASE WHEN _n > 0 THEN 'answered' END;
END;
$function$
;
REVOKE ALL ON FUNCTION public.sp_entry_review_on_holder_edit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_entry_review_on_holder_edit(uuid, uuid) TO authenticated;

-- Not SECURITY DEFINER on purpose: current_user is what tells a holder's
-- direct write (a client role) from a Passport function's (the owner).
CREATE OR REPLACE FUNCTION public.sp_guard_entry_under_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _state text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'sp_claims' THEN
    _state := public.sp_entry_review_on_holder_edit(OLD.id, NULL);
  ELSE
    _state := public.sp_entry_review_on_holder_edit(NULL, OLD.id);
  END IF;
  IF _state = 'pending' THEN
    RAISE EXCEPTION 'SP_ENTRY_UNDER_REVIEW: this entry is being reviewed; withdraw the request to change it.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.sp_guard_entry_under_review() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sp_claims_frozen_under_review ON public.sp_claims;
CREATE TRIGGER sp_claims_frozen_under_review
  BEFORE UPDATE ON public.sp_claims
  FOR EACH ROW EXECUTE FUNCTION public.sp_guard_entry_under_review();
DROP TRIGGER IF EXISTS sp_periods_frozen_under_review ON public.sp_experience_periods;
CREATE TRIGGER sp_periods_frozen_under_review
  BEFORE UPDATE ON public.sp_experience_periods
  FOR EACH ROW EXECUTE FUNCTION public.sp_guard_entry_under_review();

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
        AND tgname IN ('sp_claims_frozen_under_review', 'sp_periods_frozen_under_review')) <> 2 THEN
    RAISE EXCEPTION 'SP_ENTRY_REVIEW_PROOF: the under-review triggers are missing';
  END IF;
  IF has_function_privilege('anon', 'public.sp_entry_review_on_holder_edit(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_ENTRY_REVIEW_PROOF: anon may call the review helper';
  END IF;
  RAISE NOTICE 'SP_ENTRY_REVIEW_PROOF ok: an entry in review is frozen; a clarification answer returns it to review';
END $$;
