-- =============================================================================
-- Employment confirmation may only be addressed to an organisation that
-- CQrityjob has approved.
-- =============================================================================
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────
--
-- `sp_submit_for_verification` has never looked at the organisation being
-- asked. It checks that the caller owns the entry, that an employer
-- attestation names an employment period and not a credential, and that no
-- other request on that entry is open. It then writes whatever
-- `_employer_id` it was handed, and the only thing standing behind that
-- column is the foreign key -- the id must be AN organisation, not an
-- ELIGIBLE one.
--
-- That is reachable, and not only by a crafted call:
--
--   * `employers_member_select` (20260719100000) lets an active member read
--     their own organisation at ANY status. A candidate who registered a
--     company through the employer portal has one sitting in `pending` --
--     20260719190845 inserts it that way -- and it appeared in the
--     candidate's own employer picker. They could address employment
--     confirmation to a company CQrityjob has not approved.
--
--   * `draft`, `rejected`, `suspended` and `archived` are the same story
--     arrived at by different routes. A suspended organisation is one
--     CQrityjob has stopped trusting; a request routed into it is a request
--     that should not be answered, and if it is answered the answer becomes
--     `assertion_level = 'verified'` like any other.
--
-- The picker now filters on `status = 'active'` in its query. This exists
-- because a filter in a query is a convenience and not a boundary: the RPC is
-- callable by any authenticated principal with an id in their hand, and the
-- rule has to live where the write happens.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────
--
-- It does not touch requests that already exist. An organisation suspended
-- the day after it was asked keeps its open request, its queue and its
-- ability to answer: `sp_employer_attestation_queue` and `sp_verifier_decide`
-- are unchanged by this migration, and retro-actively voiding a request in
-- flight would break a workflow to enforce a rule about STARTING one.
--
-- It does not touch `cqrityjob_review` in any way. That path has no employer.
--
-- It does not decide who may verify, and it does not weaken the
-- self-verification prohibition, which lives in `sp_verifier_decide`
-- (`SP_SELF_VERIFICATION_FORBIDDEN`) and is untouched here. Note what the two
-- rules do together: a candidate who registers their own company can no
-- longer even ADDRESS a request to it while it is unapproved, and if it is
-- approved they still cannot decide their own request.
--
-- ── DEPLOY ORDER ───────────────────────────────────────────────────────
--
-- Safe in either order, and safe alone.
--
--   Applied BEFORE the code: the picker still offers ineligible
--   organisations to the few candidates who can see one, and choosing one now
--   fails with a named error instead of writing a request that could not
--   usefully be answered. Strictly better than today.
--
--   Applied AFTER the code: the picker already refuses to offer them, so the
--   check has nothing to refuse and the migration is invisible.
--
-- No column is added, dropped or retyped, so there is no expand/contract pair
-- here to get the ordering of.

-- =============================================================================
-- sp_submit_for_verification
-- =============================================================================
-- Reproduced in full: CREATE OR REPLACE rewrites the whole body, so the whole
-- body is written out rather than imagined as a patch. Byte-for-byte the
-- definition from 20261013090000 except the one block marked NEW.
CREATE OR REPLACE FUNCTION public.sp_submit_for_verification(
  _claim_id uuid, _period_id uuid, _kind text, _employer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid; _id uuid; _employer_status text;
BEGIN
  -- An employer confirms employment. A request that asks one to confirm
  -- anything else is refused before it is a row, whoever is asking.
  IF _kind = 'employer_attestation' AND (_period_id IS NULL OR _claim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY' USING ERRCODE='check_violation';
  END IF;

  -- NEW. The organisation being asked must be one CQrityjob has approved.
  --
  -- Placed before the holder check on purpose, and it is the one ordering
  -- decision in this function that discloses anything: it means a caller
  -- learns that an id is not an eligible employer without having proved they
  -- own the entry. That is acceptable here and would not be elsewhere --
  -- eligibility is a property of an ORGANISATION, the same organisations are
  -- already listed publicly by the job site, and the alternative is a
  -- candidate whose request is refused for the wrong stated reason. Nothing
  -- about the ENTRY is revealed either way; that check still stands below.
  --
  -- NULL is refused explicitly rather than left to the table CHECK. The
  -- constraint (`sp_vr_employer_kind_has_employer`, 20260817120000) already makes the
  -- row unwritable, but it surfaces as a constraint name from inside the
  -- database, and this function's contract is that a caller gets a sentence
  -- it can act on.
  IF _kind = 'employer_attestation' THEN
    IF _employer_id IS NULL THEN
      RAISE EXCEPTION 'SP_EMPLOYER_REQUIRED' USING ERRCODE='check_violation';
    END IF;
    SELECT status INTO _employer_status FROM public.employers WHERE id = _employer_id;
    IF _employer_status IS NULL THEN
      RAISE EXCEPTION 'SP_EMPLOYER_NOT_FOUND' USING ERRCODE='no_data_found';
    END IF;
    IF _employer_status <> 'active' THEN
      RAISE EXCEPTION 'SP_EMPLOYER_NOT_ELIGIBLE' USING ERRCODE='insufficient_privilege';
    END IF;
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

  -- The check above is a read followed by a write, and a concurrent
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
  '(atomically), refuses employer attestation aimed at anything other than an '
  'employment period, and refuses employer attestation addressed to an '
  'organisation CQrityjob has not approved (employers.status <> ''active'').';


-- =============================================================================
-- Assert the end state, in the same transaction
-- =============================================================================
-- A migration that reports success without checking is a claim, not a change.
DO $$
DECLARE _src text; _n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_submit_for_verification';

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_SUBMIT_MISSING: sp_submit_for_verification was not created.';
  END IF;

  IF _src NOT LIKE '%SP_EMPLOYER_NOT_ELIGIBLE%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_ELIGIBILITY_MISSING: the eligibility refusal is not in the body.';
  END IF;

  -- The checks this migration must not have removed while rewriting the body.
  IF _src NOT LIKE '%SP_NOT_HOLDER%'
     OR _src NOT LIKE '%SP_REQUEST_ALREADY_OPEN%'
     OR _src NOT LIKE '%SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_GUARD_LOST: a pre-existing refusal is missing from the rewritten body.';
  END IF;

  IF _src NOT LIKE '%SECURITY DEFINER%' OR _src NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_UNPINNED: the function lost SECURITY DEFINER or its pinned search_path.';
  END IF;

  -- anon must not be able to call it, and authenticated must still be able to.
  SELECT count(*) INTO _n
    FROM information_schema.routine_privileges
   WHERE specific_schema = 'public'
     AND routine_name = 'sp_submit_for_verification'
     AND grantee = 'anon';
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_GRANTS_WRONG: anon can execute sp_submit_for_verification.';
  END IF;

  SELECT count(*) INTO _n
    FROM information_schema.routine_privileges
   WHERE specific_schema = 'public'
     AND routine_name = 'sp_submit_for_verification'
     AND grantee = 'authenticated'
     AND privilege_type = 'EXECUTE';
  IF _n = 0 THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_GRANTS_WRONG: authenticated cannot execute sp_submit_for_verification.';
  END IF;
END $$;
