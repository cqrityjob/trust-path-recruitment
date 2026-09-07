DO $$
DECLARE _n bigint;
BEGIN
  SELECT count(*) INTO _n
    FROM public.sp_verification_decisions d
    JOIN public.sp_verification_requests r ON r.id = d.request_id
   WHERE d.decision = 'approved'
     AND d.verification_method IN ('employer_confirmation', 'issuer_confirmation')
     AND d.decider_organisation = 'CQrityjob';
  RAISE NOTICE 'SP_TRUST_SOURCE_CONTAINMENT: % historical approval(s) carry a source-confirmation method with CQrityjob as decider. Left unchanged; presented as a CQrityjob review by the application. Report: scripts/passport-legacy-provenance-report.sql', _n;
END $$;


CREATE OR REPLACE FUNCTION public.sp_verifier_decide(
  _request_id uuid, _decision text, _method text, _decision_note text,
  _holder_message text, _valid_from date, _valid_until date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF NOT public.has_employer_role(auth.uid(), _r.target_employer_id, ARRAY['owner','admin']) THEN
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
END; $$;

REVOKE ALL ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) TO authenticated;

COMMENT ON FUNCTION public.sp_verifier_decide(uuid,text,text,text,text,date,date) IS
  'The single path to VERIFIED, and the single final decision on a request. Locks '
  'the request row before reading its status, so two concurrent deciders produce '
  'one decision and one refusal. Refuses self-verification, refuses a non-verifier '
  'on a CQrityjob review, refuses a representative of the wrong employer, refuses an '
  'employer attestation aimed at anything but an employment period, refuses a '
  'second decision, refuses an approval that does not state its verification '
  'method, refuses an approval whose method does not belong to the deciding party '
  '(a CQrityjob review is document_review; an employer attestation is '
  'employer_confirmation; issuer_confirmation is not available in this phase), and '
  'refuses a rejection or clarification request that carries no candidate-facing '
  'holder_message. decision_note remains internal and optional.';


DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide';

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_DECIDE_MISSING: sp_verifier_decide was not created.';
  END IF;

  IF _src NOT LIKE '%SP_ISSUER_CONFIRMATION_NOT_AVAILABLE%'
     OR _src NOT LIKE '%SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW%'
     OR _src NOT LIKE '%SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_CONTAINMENT_MISSING: a method/request-kind refusal is not in the body.';
  END IF;

  IF _src NOT LIKE '%FOR UPDATE%'
     OR _src NOT LIKE '%SP_SELF_VERIFICATION_FORBIDDEN%'
     OR _src NOT LIKE '%SP_NOT_VERIFIER%'
     OR _src NOT LIKE '%SP_NOT_EMPLOYER_REPRESENTATIVE%'
     OR _src NOT LIKE '%SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY%'
     OR _src NOT LIKE '%SP_REQUEST_ALREADY_DECIDED%'
     OR _src NOT LIKE '%SP_APPROVAL_REQUIRES_METHOD%'
     OR _src NOT LIKE '%SP_DECISION_REQUIRES_HOLDER_MESSAGE%'
     OR _src NOT LIKE '%sp.verification_context%'
     OR _src NOT LIKE '%verification_decided%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_GUARD_LOST: a pre-existing refusal or mechanism is missing from the rewritten body.';
  END IF;
END $$;

DO $$
DECLARE _def text; _n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide';
  IF _def NOT LIKE '%SECURITY DEFINER%' OR _def NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_UNPINNED: sp_verifier_decide lost SECURITY DEFINER or its pinned search_path.';
  END IF;

  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_GRANTS_WRONG: sp_verifier_decide is executable by anon or PUBLIC, or no longer executable by authenticated.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                    AND indexname = 'sp_vd_one_final_decision_per_request') THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_INDEX_MISSING: sp_vd_one_final_decision_per_request is gone.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_decisions_append_only') THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_TRIGGER_MISSING: sp_decisions_append_only is gone.';
  END IF;
END $$;