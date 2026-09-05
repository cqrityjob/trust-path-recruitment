-- =============================================================================
-- Security Passport — trust-source containment: a verification method must
-- come from the party that has the standing to use it.
-- =============================================================================
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- `sp_verifier_decide` accepted any value in `verification_method`'s CHECK
-- (document_review, employer_confirmation, issuer_confirmation) on ANY
-- request kind. A CQrityjob reviewer answering a `cqrityjob_review` request
-- could therefore record `issuer_confirmation` or `employer_confirmation`,
-- and the decision row then read:
--
--     decision = approved · method = issuer_confirmation · decider = CQrityjob
--
-- Every surface that renders provenance follows the METHOD, so the holder,
-- the CV, the card and the anonymous recipient page all printed "Confirmed
-- by the issuer" — about a decision in which no issuer took part, with no
-- issuer identity, no source reference and no receipt behind it. The
-- reviewer form offered all three methods in a dropdown; the database
-- offered them to any authenticated principal willing to call the RPC.
--
-- Hosted production carries three such rows (two issuer_confirmation, one
-- employer_confirmation, all with decider_organisation = 'CQrityjob'). They
-- are NOT rewritten here. See "what this does not do".
--
-- ── THE RULE ───────────────────────────────────────────────────────────
--
-- For the current product phase, stated once and enforced where the trust
-- state is written:
--
--     request_kind = 'cqrityjob_review'      ⇒ method = 'document_review'
--     request_kind = 'employer_attestation'  ⇒ method = 'employer_confirmation'
--     method = 'issuer_confirmation'         ⇒ refused for every kind
--
-- A telephone call, an email or a document read by CQrityjob is a CQrityjob
-- review. It is not the issuer confirming, and it is not the employer
-- confirming. `issuer_confirmation` stays in the column's CHECK -- the
-- historical rows carry it and history is not rewritten -- but no new row
-- may take it until a later release introduces a structurally identified
-- issuer organisation, issuer membership and authority, an issuer-specific
-- request kind, a source receipt, revocation authority and the RLS and
-- audit tests that go with them.
--
-- Enforced on APPROVALS only. A rejection or a clarification request
-- creates no trust and the application never sends a method with one; a
-- stray method on a refusal is not what this migration exists to stop.
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
--
--   * No table, column, constraint, index, policy, trigger or grant changes.
--     One SECURITY DEFINER function is replaced, byte-for-byte the
--     definition from 20261013090000 except the one block marked NEW.
--
--   * No historical row is rewritten, deleted, revoked or back-filled. The
--     three legacy decisions keep their method and their decider. How they
--     are PRESENTED is an application concern, handled in the same release
--     by the central trust-presentation helper, which renders them as a
--     CQrityjob review and never as a source confirmation.
--
--   * No preflight refuses on their presence. The rule is prospective: it
--     governs what may be WRITTEN from now on, and a migration that failed
--     because the past disagrees with the present would leave the door open
--     while somebody argued about the past. The preflight below only counts
--     them and says so, so an operator applying this can see what remains
--     for the owner to decide.
--
--   * No workflow state, assertion level, request kind or verification
--     method is added or removed. The column CHECK is untouched.
--
-- ── DEPLOY ORDER ───────────────────────────────────────────────────────
--
-- Additive and safe in either order. Applied before the application code,
-- the old reviewer form can still SELECT issuer_confirmation and is refused
-- by name, which the existing error classifier reports as an unknown,
-- retryable refusal until the code lands -- an inconvenience, not a defect,
-- and strictly safer than today. Applied after the code, the form no longer
-- offers anything this refuses, and the employer surface has always sent
-- employer_confirmation and nothing else.


-- =============================================================================
-- 0. Count what the past holds, without touching it
-- =============================================================================
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


-- =============================================================================
-- 1. The only path to VERIFIED, with the method bound to the request kind
-- =============================================================================
-- Reproduced in full: CREATE OR REPLACE rewrites the whole body, so the whole
-- body is written out rather than imagined as a patch. Byte-for-byte the
-- definition from 20261013090000 except the one block marked NEW. A reviewer
-- must be able to read this and see that the row lock, the self-verification
-- bar, the verifier check, the employer-representative check, the
-- employment-only check, the already-decided check, the method-required
-- rule, the holder-message rule, the append-only decision insert and the
-- verification-context door are all still exactly where they were, in the
-- order they were in.
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
END; $$;

-- Unchanged grants, restated because CREATE OR REPLACE on a SECURITY DEFINER
-- function is exactly the place a grant quietly widens if nobody says
-- otherwise. anon has never been able to call this and still cannot.
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


-- =============================================================================
-- 2. Assert the end state, in the same transaction
-- =============================================================================
-- A migration that reports success without checking is a claim, not a change.
DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide';

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_DECIDE_MISSING: sp_verifier_decide was not created.';
  END IF;

  -- The three new refusals.
  IF _src NOT LIKE '%SP_ISSUER_CONFIRMATION_NOT_AVAILABLE%'
     OR _src NOT LIKE '%SP_CQRITYJOB_REVIEW_REQUIRES_DOCUMENT_REVIEW%'
     OR _src NOT LIKE '%SP_EMPLOYER_ATTESTATION_REQUIRES_EMPLOYER_CONFIRMATION%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_CONTAINMENT_MISSING: a method/request-kind refusal is not in the body.';
  END IF;

  -- Every refusal the rewrite must not have lost, by name.
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

  -- anon must hold nothing on it, and authenticated must still hold EXECUTE.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_verifier_decide'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_GRANTS_WRONG: sp_verifier_decide is executable by anon or PUBLIC, or no longer executable by authenticated.';
  END IF;

  -- The invariants this function relies on are still in place.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                    AND indexname = 'sp_vd_one_final_decision_per_request') THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_INDEX_MISSING: sp_vd_one_final_decision_per_request is gone.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sp_decisions_append_only') THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_TRIGGER_MISSING: sp_decisions_append_only is gone.';
  END IF;
END $$;
