-- Rollback of 20270125090000_sp_decision_bound_to_reviewed_content.
--
-- Drops sp_verifier_decide_reviewed, restores sp_entry_review_on_holder_edit to
-- the hosted 20270119090000 body and sp_verifier_decide to the
-- hosted 20270112090000 body, which takes no reference to the reviewed
-- content, and drops sp_verification_requests.answered_at (a marker only:
-- dropping it loses no decision, request or entry). Verifies both restored
-- bodies by md5.

DROP FUNCTION IF EXISTS public.sp_verifier_decide_reviewed(uuid,timestamptz,text,text,text,text,date,date);

CREATE OR REPLACE FUNCTION public.sp_verifier_decide(_request_id uuid, _decision text, _method text, _decision_note text, _holder_message text, _valid_from date, _valid_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r public.sp_verification_requests%ROWTYPE; _org text;
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

REVOKE ALL ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) TO authenticated;

ALTER TABLE public.sp_verification_requests DROP COLUMN IF EXISTS answered_at;

DO $$
DECLARE _m text;
BEGIN
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)'::regprocedure));
  IF _m <> '7078c44c98d2d48e13849ff0037abda9' THEN
    RAISE EXCEPTION 'SP_REVIEWED_CONTENT_ROLLBACK: sp_verifier_decide is not the hosted pre-fix body (md5 %)', _m;
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_entry_review_on_holder_edit(uuid,uuid)'::regprocedure))
       <> '926a3a7913652e482b28ab7c93732872' THEN
    RAISE EXCEPTION 'SP_REVIEWED_CONTENT_ROLLBACK: sp_entry_review_on_holder_edit is not the hosted body';
  END IF;
  IF to_regprocedure('public.sp_verifier_decide_reviewed(uuid,timestamptz,text,text,text,text,date,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'SP_REVIEWED_CONTENT_ROLLBACK: sp_verifier_decide_reviewed survives';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'sp_verification_requests' AND column_name = 'answered_at') THEN
    RAISE EXCEPTION 'SP_REVIEWED_CONTENT_ROLLBACK: answered_at survives';
  END IF;
  RAISE NOTICE 'SP_REVIEWED_CONTENT_ROLLBACK ok: hosted decision body restored';
END $$;
