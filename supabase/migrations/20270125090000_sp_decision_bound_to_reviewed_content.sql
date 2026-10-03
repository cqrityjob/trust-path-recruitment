-- =============================================================================
-- 20270125090000 -- Security Passport: a review decision is bound to the
-- content the reviewer actually saw.
--
-- After 20270119090000 a holder answers a clarification by editing the entry,
-- and the request returns to 'pending' with a new submitted_at. Nothing tied
-- the decision to what the reviewer had on screen: a reviewer who opened the
-- entry, asked for a clarification and later pressed "approve" on the page
-- they still had open verified the holder's NEW content, which that page never
-- showed. sp_verifier_decide takes no reference to the content at all.
--
-- The correction reuses the request's own content epoch, submitted_at:
--
--   * sp_verifier_decide_reviewed(_request_id, _reviewed_submitted_at, ...)
--     is the decision entry point the application calls. It passes the
--     submitted_at its page was loaded with (sp_verifier_request_detail and
--     sp_employer_attestation_queue both return it with the content) and
--     calls sp_verifier_decide in the same transaction.
--   * sp_verifier_decide, after its authorisation and already-decided checks,
--     refuses with SP_REVIEW_STALE when that submitted_at is not the request's
--     current one, and refuses a request whose holder has answered a
--     clarification when no submitted_at was passed -- a bare RPC call cannot decide on
--     content its caller did not load. Both run under the existing
--     SELECT ... FOR UPDATE on the request, the row the holder's clarification
--     answer also updates, so an edit and a decision serialise.
--
--   * sp_verification_requests.answered_at (new) is set by
--     sp_entry_review_on_holder_edit when the holder's edit answers a
--     clarification; that answer now stamps submitted_at with clock_timestamp().
--
-- Unchanged: a request whose content has not changed since it was submitted
-- (never sent for clarification, or not yet answered) is decided exactly as
-- before, by either entry point (its content is frozen from submission by
-- 20270119090000); every authorisation, method, message and validity rule;
-- clarification, withdrawal and the holder's answer; who may decide.
-- The function body is otherwise the hosted one (20270112090000), pinned by
-- the rollback.
--
-- Rollback: supabase/rollback/20270125090000_sp_decision_bound_to_reviewed_content_rollback.sql
-- Suite:    supabase/tests/sp_decision_bound_to_reviewed_content_test.sql
-- =============================================================================

ALTER TABLE public.sp_verification_requests ADD COLUMN IF NOT EXISTS answered_at timestamptz;
COMMENT ON COLUMN public.sp_verification_requests.answered_at IS
  'When the holder last answered a clarification by changing the entry (set by '
  'sp_entry_review_on_holder_edit). A decision on an answered request must name '
  'the submitted_at its decider reviewed (sp_verifier_decide_reviewed).';

CREATE OR REPLACE FUNCTION public.sp_verifier_decide(_request_id uuid, _decision text, _method text, _decision_note text, _holder_message text, _valid_from date, _valid_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r public.sp_verification_requests%ROWTYPE; _org text; _seen text;
BEGIN
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  IF _r.holder_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SP_SELF_VERIFICATION_FORBIDDEN' USING ERRCODE='insufficient_privilege';
  END IF;

  IF _r.request_kind = 'cqrityjob_review' THEN
    IF NOT public.sp_is_verifier(auth.uid()) THEN
      RAISE EXCEPTION 'SP_NOT_VERIFIER' USING ERRCODE='insufficient_privilege';
    END IF;
    _org := 'CQrityjob';
  ELSE
    -- 20270112090000: an active owner/admin of an ACTIVE organisation
    IF NOT public.has_active_employer_role(auth.uid(), _r.target_employer_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'SP_NOT_EMPLOYER_REPRESENTATIVE' USING ERRCODE='insufficient_privilege';
    END IF;

    IF _r.period_id IS NULL OR _r.claim_id IS NOT NULL THEN
      RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY' USING ERRCODE='insufficient_privilege';
    END IF;

    SELECT name INTO _org FROM public.employers WHERE id = _r.target_employer_id;
  END IF;

  IF _r.status NOT IN ('pending','clarification_requested') THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_DECIDED' USING ERRCODE='check_violation';
  END IF;

  -- 20270125090000: the decision is bound to the content the decider saw.
  -- sp_verifier_decide_reviewed passes the request's submitted_at as the
  -- decider's page showed it; a clarification answer moves submitted_at
  -- (20270119090000), so a page loaded before the answer no longer matches.
  -- A request whose holder has answered a clarification by changing the
  -- entry (answered_at is set) cannot be decided without that binding at
  -- all, so a stale page or a bare RPC call fails safely and the decider
  -- must reload the changed content. The marker is transaction-local and
  -- cleared on read.
  _seen := nullif(current_setting('sp.reviewed_submitted_at', true), '');
  PERFORM set_config('sp.reviewed_submitted_at', '', true);
  IF _seen IS NOT NULL THEN
    IF _seen::timestamptz IS DISTINCT FROM _r.submitted_at THEN
      RAISE EXCEPTION 'SP_REVIEW_STALE: the entry changed after it was opened; reload it and decide again'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _r.answered_at IS NOT NULL THEN
    RAISE EXCEPTION 'SP_REVIEW_STALE: this request was answered after a clarification; reload it and decide on what it now says'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _decision = 'approved'
     AND (_method IS NULL OR _method !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'SP_APPROVAL_REQUIRES_METHOD' USING ERRCODE='check_violation';
  END IF;

  -- NEW. The method must belong to the party deciding.
  --
  -- Placed AFTER the authorisation and already-decided checks, so a caller
  -- who may not decide at all is told that and nothing more, and after the
  -- method-required rule, so an absent method still reads as absent rather
  -- than as "not permitted". Approvals only: a refusal creates no trust.
  --
  -- `issuer_confirmation` first and unconditionally. There is no request
  -- kind an issuer answers yet, so there is no caller for whom it is true.
  IF _decision = 'approved' THEN
    IF _method = 'issuer_confirmation' THEN
      RAISE EXCEPTION 'SP_ISSUER_CONFIRMATION_NOT_AVAILABLE' USING ERRCODE='check_violation';
    END IF;
    IF _r.request_kind = 'cqrityjob_review' AND _method <> 'document_review' THEN
      RAISE EXCEPTION 'SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW' USING ERRCODE='check_violation';
    END IF;
    IF _r.request_kind = 'employer_attestation' AND _method <> 'employer_confirmation' THEN
      RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION' USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF _decision IN ('rejected','clarification_requested')
     AND (_holder_message IS NULL OR _holder_message !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'SP_DECISION_REQUIRES_HOLDER_MESSAGE' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.sp_verification_requests
     SET status = _decision, decided_at = now(), decided_by = auth.uid(),
         verification_method = _method, decision_note = _decision_note,
         holder_message = _holder_message, valid_from = _valid_from, valid_until = _valid_until
   WHERE id = _request_id;

  INSERT INTO public.sp_verification_decisions (
    request_id, holder_user_id, decided_by, decider_organisation, decision,
    verification_method, decision_note, valid_from, valid_until)
  VALUES (_request_id, _r.holder_user_id, auth.uid(), _org, _decision,
          _method, _decision_note, _valid_from, _valid_until);

  IF _decision = 'approved' THEN
    PERFORM set_config('sp.verification_context', 'on', true);
    IF _r.claim_id IS NOT NULL THEN
      UPDATE public.sp_claims
         SET assertion_level = 'verified', verified_by_user_id = auth.uid(), verified_at = now(),
             valid_from = coalesce(_valid_from, valid_from), valid_until = coalesce(_valid_until, valid_until)
       WHERE id = _r.claim_id;
    ELSE
      UPDATE public.sp_experience_periods
         SET assertion_level = 'verified'
       WHERE id = _r.period_id;
    END IF;
    PERFORM set_config('sp.verification_context', 'off', true);
  END IF;

  INSERT INTO public.sp_passport_events (holder_user_id, actor_user_id, event_type, subject_type, subject_id, detail)
  VALUES (_r.holder_user_id, auth.uid(), 'verification_decided',
          CASE WHEN _r.claim_id IS NOT NULL THEN 'claim' ELSE 'experience' END,
          coalesce(_r.claim_id, _r.period_id),
          jsonb_build_object('decision', _decision, 'method', _method, 'organisation', _org));
END; $function$
;

REVOKE ALL ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) TO authenticated;

-- The holder's clarification answer (20270119090000) now records answered_at,
-- and stamps submitted_at with clock_timestamp() instead of now() so the new
-- content epoch differs from the one before it even inside one transaction.
-- Otherwise the body is the hosted one.
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
     SET status = 'pending', submitted_at = clock_timestamp(), answered_at = clock_timestamp()
   WHERE r.status = 'clarification_requested'
     AND (r.claim_id = _claim_id OR r.period_id = _period_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN CASE WHEN _n > 0 THEN 'answered' END;
END;
$function$
;
REVOKE ALL ON FUNCTION public.sp_entry_review_on_holder_edit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_entry_review_on_holder_edit(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sp_verifier_decide_reviewed(
  _request_id uuid, _reviewed_submitted_at timestamptz, _decision text, _method text,
  _decision_note text, _holder_message text, _valid_from date, _valid_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _reviewed_submitted_at IS NULL THEN
    RAISE EXCEPTION 'SP_REVIEW_STALE: say which version of the entry was reviewed'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('sp.reviewed_submitted_at', _reviewed_submitted_at::text, true);
  PERFORM public.sp_verifier_decide(_request_id, _decision, _method, _decision_note,
                                    _holder_message, _valid_from, _valid_until);
  PERFORM set_config('sp.reviewed_submitted_at', '', true);
END; $function$
;

REVOKE ALL ON FUNCTION public.sp_verifier_decide_reviewed(uuid,timestamptz,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_decide_reviewed(uuid,timestamptz,text,text,text,text,date,date) TO authenticated;

-- Postflight.
DO $$
BEGIN
  IF position('SP_REVIEW_STALE' IN (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SP_REVIEWED_CONTENT_PROOF: sp_verifier_decide does not bind the decision to the reviewed content';
  END IF;
  IF position('has_active_employer_role' IN (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SP_REVIEWED_CONTENT_PROOF: sp_verifier_decide lost the active-organisation rule';
  END IF;
  IF has_function_privilege('anon', 'public.sp_verifier_decide_reviewed(uuid,timestamptz,text,text,text,text,date,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SP_REVIEWED_CONTENT_PROOF: anon may decide';
  END IF;
  RAISE NOTICE 'SP_REVIEWED_CONTENT_PROOF ok: a decision is bound to the content its decider loaded';
END $$;
