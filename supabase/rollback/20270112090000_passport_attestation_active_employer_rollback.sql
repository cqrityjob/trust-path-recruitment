-- Rollback for 20270112090000_passport_attestation_active_employer.
--
-- Restores sp_employer_attestation_queue, sp_verifier_decide and the
-- sp_vr_employer_read policy as they were before (md5(prosrc) pinned below;
-- the restored sp_verifier_decide is the repository body, which differs from
-- the hosted one only in comments). This REOPENS that part of P1-B of the
-- 2026-10-02 re-audit: a SUSPENDED (or pending) organisation can again read
-- its attestation queue and confirm a holder's employment.
-- has_active_employer_role (20270108090000) is left in place. No row is
-- touched.

CREATE OR REPLACE FUNCTION public.sp_employer_attestation_queue(_employer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'SP_NOT_EMPLOYER_REPRESENTATIVE' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'submitted_at' DESC), '[]'::jsonb) INTO _out
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'status', r.status,
      'submitted_at', r.submitted_at,
      'decided_at', r.decided_at,
      -- NEW (B). The Passport display name where the holder set one, the
      -- account display name otherwise, and only then the empty string.
      'holder_name', coalesce(nullif(p.display_name, ''), nullif(a.display_name, ''), ''),
      'role_title', e.role_title,
      'employer_name', e.employer_name,
      'started_on', e.started_on,
      'ended_on', e.ended_on,
      'employment_type', e.employment_type,
      'fte_fraction', e.fte_fraction,
      'security_relevance', e.security_relevance,
      'holder_message', r.holder_message,
      -- NEW (A). The caller IS this request's holder, so no decision they
      -- make on it can succeed. Answered from auth.uid() here, never
      -- inferred by the page, so the interface and the guard cannot
      -- disagree about who somebody is.
      'is_self', (r.holder_user_id = auth.uid())
    ) AS x
    FROM public.sp_verification_requests r
    JOIN public.sp_experience_periods e      ON e.id = r.period_id
    LEFT JOIN public.sp_passport_profiles p  ON p.holder_user_id = r.holder_user_id
    LEFT JOIN public.profiles a              ON a.id = r.holder_user_id
   WHERE r.request_kind = 'employer_attestation'
     AND r.target_employer_id = _employer_id
  ) s;

  RETURN _out;
END; $function$
;

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

ALTER POLICY sp_vr_employer_read ON public.sp_verification_requests
  USING (request_kind = 'employer_attestation'::text
         AND target_employer_id IS NOT NULL
         AND public.has_employer_role(auth.uid(), target_employer_id, ARRAY['owner'::text, 'admin'::text]));

DO $$
DECLARE _m text;
BEGIN
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_employer_attestation_queue(uuid)'::regprocedure));
  IF _m <> '5ff3c16235ddbc86e55241b2f2e85532' THEN
    RAISE EXCEPTION 'PASSPORT_ATTESTATION_ACTIVE_ROLLBACK: sp_employer_attestation_queue is not the hosted pre-fix body';
  END IF;
  _m := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.sp_verifier_decide(uuid,text,text,text,text,date,date)'::regprocedure));
  IF _m <> 'ba3458fe2b4e5a38cde7e4ebd456999b' THEN
    RAISE EXCEPTION 'PASSPORT_ATTESTATION_ACTIVE_ROLLBACK: sp_verifier_decide is not the hosted pre-fix body';
  END IF;
  RAISE NOTICE 'PASSPORT_ATTESTATION_ACTIVE_ROLLBACK ok: hosted pre-fix bodies in place';
END $$;
