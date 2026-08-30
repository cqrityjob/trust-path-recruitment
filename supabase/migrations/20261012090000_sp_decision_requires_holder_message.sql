-- Security Passport — a refusal must say why, and the database is what makes
-- that true.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- `sp_verifier_decide` accepted a decision of 'rejected' or
-- 'clarification_requested' with `_holder_message` NULL. What the holder then
-- read on their own credential was a state and nothing else:
--
--     Avslagen
--
-- or, worse, because it demands an action it does not describe:
--
--     Komplettering begärd
--
-- A person cannot correct a document they have not been told is wrong, and
-- cannot supply information nobody named. An outcome with no reason is,
-- from where the holder is standing, the same as no outcome at all.
--
-- ── WHY IN THE FUNCTION AND NOT ONLY IN THE APPLICATION ────────────────
--
-- The TypeScript server function refuses this too, and the reviewer form
-- refuses it before that. Neither is the control. `sp_verifier_decide` is
-- EXECUTE-granted to `authenticated`, so any signed-in principal with the
-- verifier capability can call it directly through PostgREST and never touch
-- a line of this application's code. A rule that lives only above that grant
-- is a convention, not a boundary.
--
-- The two layers above it stay, and stay in that order, because they give the
-- reviewer an immediate and specific answer instead of a round trip that comes
-- back as a classified database error. This is the one that cannot be skipped.
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
--
--   * It does not require `_decision_note`. That is the reviewer's INTERNAL
--     reasoning, it is never shown to the holder, and requiring it would say
--     something about a field the holder cannot read. The two exist as two
--     fields precisely so that a rule about one is not a rule about the other.
--
--   * It does not touch approval. `_method` is still checked in the server
--     function only, exactly as before, and approval behaviour is unchanged.
--
--   * It adds no CHECK constraint to `sp_verification_requests`. Rows decided
--     before this migration may legitimately carry a null `holder_message`,
--     they are immutable history, and a table constraint would either need a
--     rewrite of that history or a NOT VALID exception that claims more than
--     it enforces. The write path is the honest place: `sp_verifier_decide` is
--     the only route by which a request reaches 'rejected' or
--     'clarification_requested' — `authenticated` holds SELECT and INSERT on
--     that table and no UPDATE — so guarding the function guards the state.
--
--   * It rewrites nothing. No historical decision is invented, amended or
--     back-filled. A decision already recorded without a reason stays exactly
--     as it was recorded, and the holder's Passport says that no reason was
--     registered rather than showing one that was never written.
--
-- ── DEPLOY ORDER ───────────────────────────────────────────────────────
--
-- Additive and safe in either order. Applied before the application code, an
-- older reviewer form that submits a reasonless rejection is refused, which is
-- the intended end state — the reviewer sees a generic "try again" instead of
-- the specific sentence, because the older bundle does not yet know the code.
-- Applied after, the application has already been refusing it. Nothing that
-- succeeded before this migration stops succeeding, except the one thing this
-- migration exists to stop.

-- -----------------------------------------------------------------------------
-- sp_verifier_decide — reproduced in full, with one new guard
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE rewrites the entire body, so the whole function is written
-- out rather than imagined as a patch. Byte-for-byte the definition from
-- 20260818090000 (the latest one; 20260817120000 is its predecessor) except
-- for the block marked NEW below. A reviewer must be able to read this and see
-- that the self-verification bar, the verifier check, the employer-
-- representative check, the already-decided check, the append-only decision
-- insert and the verification-context door are all still exactly where they
-- were.
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
