-- Rollback of 20270316090000 (sp_review_reply_history_and_notices).
-- Prefer an application rollback. This refuses to discard a recorded holder
-- reply, a per-decision holder message or a notice, restores sp_verifier_decide
-- to its 20270125090000 body verbatim, and removes everything the slot added.
-- Run 20270318090000 and 20270317090000 rollbacks first.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.sp_verification_replies)
     OR EXISTS (SELECT 1 FROM public.sp_verification_decisions WHERE holder_message IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.user_notices) THEN
    RAISE EXCEPTION 'SP_ROLLBACK_REQUIRES_PRESERVED_DATA';
  END IF;
  IF to_regclass('public.rec_talent_contact_requests') IS NOT NULL OR to_regclass('public.sp_talent_profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'SP_ROLLBACK_ORDER: roll back 20270318090000 and 20270317090000 first';
  END IF;
END $$;

DROP TRIGGER IF EXISTS sp_metric_on_request ON public.sp_verification_requests;
DROP TRIGGER IF EXISTS sp_metric_on_claim ON public.sp_claims;
DROP TRIGGER IF EXISTS sp_notice_on_decision ON public.sp_verification_decisions;
DROP TRIGGER IF EXISTS sp_notice_on_request ON public.sp_verification_requests;
DROP FUNCTION IF EXISTS public.sp_metric_on_request();
DROP FUNCTION IF EXISTS public.sp_metric_on_claim();
DROP FUNCTION IF EXISTS public.product_metric_counts(date, date);
DROP FUNCTION IF EXISTS public.product_metric_record(text);
DROP TABLE IF EXISTS public.product_metric_events;
DROP FUNCTION IF EXISTS public.user_notices_settle_email(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.user_notices_claim_emails(integer);
DROP FUNCTION IF EXISTS public.user_notices_still_allowed(public.user_notices);
DROP FUNCTION IF EXISTS public.sp_notice_on_decision();
DROP FUNCTION IF EXISTS public.sp_decision_trust(text, text, boolean);
DROP FUNCTION IF EXISTS public.sp_notice_on_request();
DROP FUNCTION IF EXISTS public.sp_notice_reviewers();
DROP FUNCTION IF EXISTS public.user_notices_enqueue(uuid, text, text, text, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.user_notices_mark_read(uuid[]);
DROP FUNCTION IF EXISTS public.user_notices_inbox(integer);
DROP FUNCTION IF EXISTS public.user_notices_visible(public.user_notices);
DROP TABLE IF EXISTS public.user_notices;
DROP FUNCTION IF EXISTS public.sp_review_thread(uuid, uuid);
DROP FUNCTION IF EXISTS public.sp_entry_review_state(uuid, uuid);
DROP FUNCTION IF EXISTS public.sp_entry_review_state_core(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.sp_review_reader(uuid, uuid);
DROP FUNCTION IF EXISTS public.sp_reply_to_clarification(uuid, timestamptz, text);
DROP TABLE IF EXISTS public.sp_verification_replies;
DROP FUNCTION IF EXISTS public.sp_verification_replies_guard();
DROP FUNCTION IF EXISTS public.sp_assert_passport_session();

-- sp_verifier_decide, verbatim from 20270125090000.
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

REVOKE SELECT (holder_message, recorded_at) ON public.sp_verification_decisions FROM authenticated;
ALTER TABLE public.sp_verification_decisions DROP COLUMN IF EXISTS holder_message;
ALTER TABLE public.sp_verification_decisions DROP COLUMN IF EXISTS recorded_at;

DO $$ BEGIN
  IF to_regclass('public.user_notices') IS NOT NULL OR to_regprocedure('public.sp_reply_to_clarification(uuid,timestamptz,text)') IS NOT NULL
     OR position('lifecycle_state = CASE' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)'::regprocedure)) > 0
     OR position('SP_REVIEW_STALE' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SP_REPLY_HISTORY_ROLLBACK_PROOF failed';
  END IF;
  RAISE NOTICE 'SP_REPLY_HISTORY_ROLLBACK_PROOF ok';
END $$;
COMMIT;
