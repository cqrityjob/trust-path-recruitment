-- Rollback for 20261013090000_sp_trust_boundary_hardening.sql.
--
-- Gives back, in order: the ability for an employer to be asked to verify a
-- regulated credential, the ability to record an approval that does not say
-- how it was reached, and the ability for two reviewers to decide one request
-- at the same time. Every one of those is the defect, not a feature, so this
-- file exists to make the forward migration reversible rather than because
-- reversing it is ever the right thing to do.
--
-- ── IT DESTROYS NO DATA ────────────────────────────────────────────────
--
-- The forward migration created no table and no column, rewrote no row and
-- back-filled nothing. It added two functions' worth of guards, one CHECK
-- constraint and three partial indexes. Dropping those removes rules, not
-- records: every verification request, every immutable decision and every
-- Passport event is exactly as it was, and running this file changes no row
-- in any of them.
--
-- ── RUN IT ONLY WITH THE APPLICATION HALF ──────────────────────────────
--
-- On its own it leaves the reviewer form and `decideVerification` still
-- refusing a methodless approval, and `submitForVerification` still refusing
-- employer attestation on a claim, so an ordinary user would see no change --
-- only the guarantee behind it would be gone.
--
-- ── ONE THING IT CANNOT GIVE BACK ──────────────────────────────────────
--
-- If a request was submitted while the constraint was in place, it is
-- period-only, and it stays period-only. That is a row that was written
-- correctly, not a restriction imprinted on it.

-- -----------------------------------------------------------------------------
-- 1. The employer attestation object boundary, at row level
-- -----------------------------------------------------------------------------
ALTER TABLE public.sp_verification_requests
  DROP CONSTRAINT IF EXISTS sp_vr_employer_attestation_is_employment_only;

-- -----------------------------------------------------------------------------
-- 2. The uniqueness invariants
-- -----------------------------------------------------------------------------
-- Dropping an index never fails on data and never loses a row. What returns is
-- the possibility of two final decisions on one request, and of two open
-- reviews on one entry.
DROP INDEX IF EXISTS public.sp_vd_one_final_decision_per_request;
DROP INDEX IF EXISTS public.sp_vr_one_open_request_per_claim;
DROP INDEX IF EXISTS public.sp_vr_one_open_request_per_period;

-- -----------------------------------------------------------------------------
-- 3. sp_submit_for_verification, restored to the definition 20260817120000 left
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_submit_for_verification(
  _claim_id uuid, _period_id uuid, _kind text, _employer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid; _id uuid;
BEGIN
  IF _claim_id IS NOT NULL THEN
    SELECT holder_user_id INTO _holder FROM public.sp_claims WHERE id = _claim_id;
  ELSE
    SELECT holder_user_id INTO _holder FROM public.sp_experience_periods WHERE id = _period_id;
  END IF;
  IF _holder IS NULL THEN RAISE EXCEPTION 'SP_TARGET_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;
  IF _holder <> auth.uid() THEN RAISE EXCEPTION 'SP_NOT_HOLDER' USING ERRCODE='insufficient_privilege'; END IF;

  IF EXISTS (SELECT 1 FROM public.sp_verification_requests
              WHERE status IN ('pending','clarification_requested')
                AND (claim_id = _claim_id OR period_id = _period_id)) THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_OPEN' USING ERRCODE='check_violation';
  END IF;

  INSERT INTO public.sp_verification_requests (
    holder_user_id, claim_id, period_id, request_kind, target_employer_id)
  VALUES (_holder, _claim_id, _period_id, _kind, _employer_id)
  RETURNING id INTO _id;
  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) IS NULL;

-- -----------------------------------------------------------------------------
-- 4. sp_verifier_decide, restored to the definition 20261012090000 left
-- -----------------------------------------------------------------------------
-- Byte-for-byte the PR 4 body: the holder_message rule that migration added is
-- KEPT, because rolling back this release must not silently roll back that one.
CREATE OR REPLACE FUNCTION public.sp_verifier_decide(
  _request_id uuid, _decision text, _method text, _decision_note text,
  _holder_message text, _valid_from date, _valid_until date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _org text;
BEGIN
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SP_REQUEST_NOT_FOUND' USING ERRCODE='no_data_found'; END IF;

  -- The boundary the production defect ran into. It stays exactly as it was.
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
    SELECT name INTO _org FROM public.employers WHERE id = _r.target_employer_id;
  END IF;

  IF _r.status NOT IN ('pending','clarification_requested') THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_DECIDED' USING ERRCODE='check_violation';
  END IF;

  -- NEW. An outcome the holder has to act on must tell them what to act on.
  --
  -- The test is "contains at least one non-whitespace character", written as a
  -- POSIX class rather than as `btrim(...) = ''`. One-argument `btrim` strips
  -- SPACES ONLY, so the btrim form accepted a tab or a newline as a reason —
  -- the Phase 10 assertion for that case caught it while this migration was
  -- being written, and it mattered: the TypeScript layer above uses
  -- `String.trim()`, which strips all whitespace, so the two would have
  -- disagreed about what counts as empty, with the database the weaker of the
  -- two. The one that cannot be bypassed must not be the lenient one.
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
  'The single path to VERIFIED. Refuses self-verification, refuses a non-verifier on a '
  'CQrityjob review, refuses a representative of the wrong employer, refuses a second '
  'decision, and refuses a rejection or clarification request that carries no '
  'candidate-facing holder_message. decision_note remains internal and remains optional.';
