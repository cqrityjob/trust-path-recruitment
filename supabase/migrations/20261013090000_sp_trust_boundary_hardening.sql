-- Security Passport — WHO may create trust, ON WHAT object, UNDER WHICH
-- conditions. Three answers that were true in the user interface and not yet
-- true in the database.
--
-- Every rule below already existed somewhere. The reviewer form knew it, or
-- the TypeScript server function knew it, or the intended workflow implied
-- it. None of that survives a crafted call. `sp_submit_for_verification` and
-- `sp_verifier_decide` are both EXECUTE-granted to `authenticated`, and
-- `authenticated` holds INSERT on `sp_verification_requests` directly, so a
-- signed-in principal reaches all three over PostgREST without loading a line
-- of this application. A boundary that only the client enforces is a
-- convention.
--
--
-- ── A. AN EMPLOYER MAY CONFIRM EMPLOYMENT. NOTHING ELSE. ───────────────
--
-- `request_kind = 'employer_attestation'` could be aimed at a CLAIM. The
-- Phase 3 table required only that such a request name a target employer
-- (`sp_vr_employer_kind_has_employer`); it never required that the thing
-- being attested to was an employment period.
--
-- So this sequence worked, end to end, with no defect in any single step:
--
--   1. the holder calls sp_submit_for_verification(_claim_id => <a VU1
--      claim>, _period_id => NULL, _kind => 'employer_attestation',
--      _employer_id => <a co-operating employer>);
--   2. an owner or admin of that employer calls sp_verifier_decide(...,
--      'approved', 'employer_confirmation', ...);
--   3. the VU1 claim is now `assertion_level = 'verified'`, attributed to
--      that company by name.
--
-- A guarding company confirmed a state-regulated guard qualification. The
-- Passport then said something no employer has the standing to say, and said
-- it in the same words it uses for a credential CQrityjob actually reviewed.
-- The candidate's own Passport UI never offers this; the database offered it
-- to anyone willing to make the call by hand.
--
-- The rule is stated once, as a shape, and then enforced at all three points
-- a request can pass through:
--
--     request_kind = 'employer_attestation'
--       ⇒  period_id IS NOT NULL AND claim_id IS NULL
--
-- The `claim_id IS NULL` half is not redundant. Without it a request could
-- name a period AND a claim, satisfy a period-only test, and still carry a
-- credential into `sp_verifier_decide`, whose approval branch reads
-- `IF _r.claim_id IS NOT NULL THEN` FIRST and would have verified the claim.
--
--
-- ── B. AN APPROVAL MUST SAY HOW ────────────────────────────────────────
--
-- `decideVerification` refuses an approval with no method. `sp_verifier_decide`
-- did not, and it is the one that cannot be skipped. A crafted RPC call could
-- record `status = 'approved'` with `verification_method` NULL: a claim
-- reading VERIFIED, attributed to a named organisation, with no answer to the
-- only question that makes verification checkable — how?
--
-- This is the exact mirror of the rule PR 4 added for refusals, and the
-- prefix comment there applies unchanged here: the layers above stay, in
-- their order, because they give the reviewer an immediate and specific
-- answer. This is the one that is a boundary.
--
--
-- ── C. ONE REQUEST, ONE FINAL DECISION ─────────────────────────────────
--
-- `sp_verifier_decide` read the request, checked `status NOT IN
-- ('pending','clarification_requested')`, and then wrote — with no lock held
-- across the gap. Two reviewers, or one reviewer in two tabs, could both read
-- 'pending', both pass the check, and both write. The result is two immutable
-- rows in `sp_verification_decisions` for one request and two Passport
-- events, of which the second is not a decision anybody made.
--
-- `FOR UPDATE` closes it. Under READ COMMITTED the second transaction blocks
-- on the row, and when it is released it re-reads the row it locked — now
-- 'approved' — so the already-decided check that was already there fires.
-- The check does not move and is not rewritten; it is simply given the
-- guarantee it was written assuming. The lock is one row, taken on the
-- request being decided, and nothing else.
--
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────
--
--   * No workflow state is added or removed. pending, clarification_requested,
--     rejected, approved, withdrawn and the revocation path are exactly as
--     they were, and so is every assertion level.
--
--   * No trust source is added, renamed or merged. issuer, verifier,
--     verification_method, decider_organisation and request_kind remain five
--     separate facts, which is what lets a later release say "verified against
--     the issuing authority" without it being indistinguishable from
--     "confirmed by the employer".
--
--   * `sp_is_verifier` is untouched. It is still the platform-admin
--     capability, which is a known and separately-tracked coarseness. A
--     dedicated Passport Reviewer role is a role-model change and does not
--     belong in a migration about object boundaries.
--
--   * No method is restricted BY request kind. A CQrityjob reviewer approving
--     with 'employer_confirmation' — a reviewer who telephoned the employer
--     and is recording that honestly — is existing, asserted behaviour
--     (Phase 10, GROUP 4). Narrowing it is a product decision about what
--     methods mean, not a security boundary, and guessing at it here would
--     break a truthful record to enforce an invented rule.
--
--   * No historical row is rewritten, deleted or back-filled. Every new
--     constraint is checked against existing rows FIRST and refuses loudly,
--     naming the offending rows, rather than being added NOT VALID and
--     claiming a guarantee it does not have.
--
--
-- ── DEPLOY ORDER ───────────────────────────────────────────────────────
--
-- Additive and safe in either order. Nothing that succeeds today stops
-- succeeding except the four things this migration exists to stop. Applied
-- before the application code, an older bundle cannot construct any of them:
-- the candidate UI only ever submits employer attestation for an employment
-- period, and the reviewer form has refused a methodless approval since long
-- before this.


-- =============================================================================
-- 0. Inspect before constraining
-- =============================================================================
-- A constraint added over data that violates it either fails with a message
-- about a constraint name, or is added NOT VALID and quietly guarantees less
-- than it appears to. Neither is a useful thing to hand an operator at 02:00,
-- so each new invariant is checked here first and refuses with the SHAPE of
-- the problem and the identifiers needed to look at it.
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY submitted_at)
    INTO _bad
    FROM public.sp_verification_requests
   WHERE request_kind = 'employer_attestation'
     AND (period_id IS NULL OR claim_id IS NOT NULL);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'SP_PREFLIGHT_EMPLOYER_ATTESTATION_ON_NON_EMPLOYMENT: employer_attestation requests that name a claim, or name no employment period, already exist and must be reviewed by a human before this boundary is enforced. sp_verification_requests.id: %', _bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(request_id::text || ' (' || n::text || ')', ', ')
    INTO _bad
    FROM (SELECT request_id, count(*) AS n
            FROM public.sp_verification_decisions
           WHERE decision IN ('approved','rejected')
           GROUP BY request_id HAVING count(*) > 1) d;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'SP_PREFLIGHT_DUPLICATE_FINAL_DECISION: a verification request already carries more than one final decision -- the race this migration closes may have already occurred, and which decision stands is a human judgement, not a migration''s. sp_verification_decisions.request_id: %', _bad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(subject, ', ')
    INTO _bad
    FROM (SELECT coalesce('claim ' || claim_id::text, 'period ' || period_id::text) AS subject
            FROM public.sp_verification_requests
           WHERE status IN ('pending','clarification_requested')
             AND (claim_id IS NOT NULL OR period_id IS NOT NULL)
           GROUP BY claim_id, period_id HAVING count(*) > 1) o;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION
      'SP_PREFLIGHT_DUPLICATE_OPEN_REQUEST: more than one verification request is open on the same entry. Closing all but one is a decision about somebody''s live review queue and is not made here. Subject: %', _bad
      USING ERRCODE = 'check_violation';
  END IF;
END $$;


-- =============================================================================
-- 1. A. The object boundary, at row level
-- =============================================================================
-- The first of the three enforcement points. This one holds even for a row
-- written by a path nobody has thought of yet, including a future function,
-- because `authenticated` inserts into this table directly under RLS.
ALTER TABLE public.sp_verification_requests
  DROP CONSTRAINT IF EXISTS sp_vr_employer_attestation_is_employment_only;
ALTER TABLE public.sp_verification_requests
  ADD CONSTRAINT sp_vr_employer_attestation_is_employment_only CHECK (
    request_kind <> 'employer_attestation'
    OR (period_id IS NOT NULL AND claim_id IS NULL));

COMMENT ON CONSTRAINT sp_vr_employer_attestation_is_employment_only
  ON public.sp_verification_requests IS
  'An employer confirms employment they were party to. They have no standing to '
  'verify a training credential, a licence, an authorisation, an education claim, '
  'a skill or a language -- and least of all a regulated qualification such as VU1, '
  'VU2, Ordningsvakt or Skyddsvakt, where the state, not an employer, is the '
  'authority. Employer attestation is therefore valid ONLY against an employment '
  'period. claim_id must be NULL, not merely unused: sp_verifier_decide branches on '
  'claim_id first, so a request naming both would verify the credential.';


-- =============================================================================
-- 2. C. One final decision, and one open request, as structure
-- =============================================================================
-- The `FOR UPDATE` added to sp_verifier_decide below is what makes the
-- decision path correct. These two indexes are what make it stay correct: they
-- are invariants of the DATA, so they survive a future rewrite of either
-- function by somebody who has not read this comment.
--
-- The predicate is deliberately narrow.
--
--   * 'clarification_requested' is EXCLUDED. It is not a final decision --
--     pending -> clarification_requested -> approved is the ordinary shape of
--     a review that needed a better document, and it legitimately writes two
--     decision rows.
--
--   * 'revoked' is EXCLUDED. sp_verifier_revoke deliberately files the
--     revocation against the SAME request as the approval it reverses, so the
--     audit chain reads grant-then-revocation on one thread. Including it
--     would make revocation impossible.
--
-- What is left is exactly the claim being made: an approval or a rejection is
-- final, and there is at most one of them per request.
CREATE UNIQUE INDEX IF NOT EXISTS sp_vd_one_final_decision_per_request
  ON public.sp_verification_decisions (request_id)
  WHERE decision IN ('approved', 'rejected');

COMMENT ON INDEX public.sp_vd_one_final_decision_per_request IS
  'One verification request receives one final decision. Excludes '
  'clarification_requested (not final -- a review may ask, then decide) and '
  'revoked (filed against the approving request on purpose, so the audit chain '
  'holds).';

-- The same shape of race exists in submission: sp_submit_for_verification
-- tested for an open request and then inserted, with nothing in between. Two
-- concurrent submissions both saw none and both wrote, putting the same
-- credential in the reviewer queue twice. These make that unrepresentable
-- rather than merely unlikely; the function below turns the resulting unique
-- violation back into the SP_REQUEST_ALREADY_OPEN the caller already handles.
--
-- Two indexes rather than one over both columns: a UNIQUE index treats NULLs
-- as distinct by default, so a single index on (claim_id, period_id) would
-- constrain nothing.
CREATE UNIQUE INDEX IF NOT EXISTS sp_vr_one_open_request_per_claim
  ON public.sp_verification_requests (claim_id)
  WHERE claim_id IS NOT NULL AND status IN ('pending', 'clarification_requested');

CREATE UNIQUE INDEX IF NOT EXISTS sp_vr_one_open_request_per_period
  ON public.sp_verification_requests (period_id)
  WHERE period_id IS NOT NULL AND status IN ('pending', 'clarification_requested');

COMMENT ON INDEX public.sp_vr_one_open_request_per_claim IS
  'One open review per entry. Structural form of the check sp_submit_for_verification '
  'already made non-atomically.';
COMMENT ON INDEX public.sp_vr_one_open_request_per_period IS
  'One open review per entry. Structural form of the check sp_submit_for_verification '
  'already made non-atomically.';


-- =============================================================================
-- 3. A. The object boundary, at the submission RPC
-- =============================================================================
-- Reproduced in full: CREATE OR REPLACE rewrites the whole body, so the whole
-- body is written out rather than imagined as a patch. Byte-for-byte the
-- definition from 20260817120000 except the two blocks marked NEW.
--
-- Row-level enforcement (section 1) already makes the crafted call fail. This
-- exists so it fails as a NAMED refusal the caller can act on, at the point
-- the caller is standing, rather than as a constraint name from inside the
-- database -- the same reason the holder_message rule lives in three places.
CREATE OR REPLACE FUNCTION public.sp_submit_for_verification(
  _claim_id uuid, _period_id uuid, _kind text, _employer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid; _id uuid;
BEGIN
  -- NEW. An employer confirms employment. A request that asks one to confirm
  -- anything else is refused before it is a row, whoever is asking.
  IF _kind = 'employer_attestation' AND (_period_id IS NULL OR _claim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY' USING ERRCODE='check_violation';
  END IF;

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

  -- NEW. The check above is a read followed by a write, and a concurrent
  -- submission fits between them. The partial unique indexes decide it; this
  -- block only translates their refusal back into the answer this function
  -- has always given, so the loser of the race and a caller who simply asked
  -- twice read the same sentence.
  BEGIN
    INSERT INTO public.sp_verification_requests (
      holder_user_id, claim_id, period_id, request_kind, target_employer_id)
    VALUES (_holder, _claim_id, _period_id, _kind, _employer_id)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_OPEN' USING ERRCODE='check_violation';
  END;
  RETURN _id;
END; $$;

-- Unchanged grants, restated because CREATE OR REPLACE on a SECURITY DEFINER
-- function is exactly the place a grant quietly widens if nobody says
-- otherwise. anon has never been able to call this and still cannot.
REVOKE ALL ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) IS
  'Opens a verification request on the caller''s own entry. Refuses a submission '
  'for somebody else''s entry, refuses a second open request on the same entry '
  '(now atomically), and refuses employer attestation aimed at anything other '
  'than an employment period.';


-- =============================================================================
-- 4. A + B + C, at the only path to VERIFIED
-- =============================================================================
-- Reproduced in full for the same reason. Byte-for-byte the definition from
-- 20261012090000 except the three blocks marked NEW and the two words
-- `FOR UPDATE`. A reviewer must be able to read this and see that the
-- self-verification bar, the verifier check, the employer-representative
-- check, the already-decided check, the holder-message rule PR 4 added, the
-- append-only decision insert and the verification-context door are all still
-- exactly where they were, in the order they were in.
CREATE OR REPLACE FUNCTION public.sp_verifier_decide(
  _request_id uuid, _decision text, _method text, _decision_note text,
  _holder_message text, _valid_from date, _valid_until date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.sp_verification_requests%ROWTYPE; _org text;
BEGIN
  -- NEW (C): `FOR UPDATE`, and nothing else on this line.
  --
  -- The row is held from here to COMMIT, so the already-decided check below
  -- and the writes that follow it are one indivisible step instead of two
  -- reads with a window between them. A second caller blocks here; when the
  -- first commits, READ COMMITTED re-reads the locked row before returning
  -- it, so the second sees 'approved' and takes the refusal that was always
  -- written for it. Exactly one row is locked -- this request. Nothing about
  -- the queue, the holder's other entries or their Passport is touched.
  SELECT * INTO _r FROM public.sp_verification_requests WHERE id = _request_id FOR UPDATE;
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

    -- NEW (A). Deliberately AFTER the authorisation check, so a representative
    -- of an unrelated employer is told they are not the representative and
    -- learns nothing about what the request contains.
    --
    -- Section 1 stops such a row being written from now on. This stops one
    -- being ACTED on -- a row that predates this migration, or one somebody
    -- reaches by a route not yet imagined, still cannot be turned into trust.
    -- A boundary that only guards the door is not guarding the room.
    IF _r.period_id IS NULL OR _r.claim_id IS NOT NULL THEN
      RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY' USING ERRCODE='insufficient_privilege';
    END IF;

    SELECT name INTO _org FROM public.employers WHERE id = _r.target_employer_id;
  END IF;

  IF _r.status NOT IN ('pending','clarification_requested') THEN
    RAISE EXCEPTION 'SP_REQUEST_ALREADY_DECIDED' USING ERRCODE='check_violation';
  END IF;

  -- NEW (B). "Verified" that cannot say how is the unfalsifiable claim this
  -- product exists to replace. The server function has refused it all along;
  -- the server function is not the boundary.
  --
  -- Non-whitespace rather than `btrim(...) = ''`, for the reason PR 4 records
  -- one block below: one-argument btrim strips SPACES ONLY, so it would accept
  -- a tab as a method while `String.trim()` in the TypeScript layer would not,
  -- leaving the database the more permissive of the two. WHICH methods are
  -- allowed is not restated here -- `sp_verification_requests.verification_method`
  -- already carries that CHECK, and the UPDATE below runs into it, so a value
  -- outside the model is refused by the model rather than by a second list
  -- that could drift away from it.
  IF _decision = 'approved'
     AND (_method IS NULL OR _method !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'SP_APPROVAL_REQUIRES_METHOD' USING ERRCODE='check_violation';
  END IF;

  -- An outcome the holder has to act on must tell them what to act on.
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
  'on a CQrityjob review, refuses a representative of the wrong employer, refuses '
  'an employer attestation aimed at anything but an employment period, refuses a '
  'second decision, refuses an approval that does not state its verification '
  'method, and refuses a rejection or clarification request that carries no '
  'candidate-facing holder_message. decision_note remains internal and optional.';
