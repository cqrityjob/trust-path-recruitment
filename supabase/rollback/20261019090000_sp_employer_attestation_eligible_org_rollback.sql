-- Rollback for 20261019090000_sp_employer_attestation_eligible_org.sql
--
-- Restores sp_submit_for_verification to its 20261013090000 definition,
-- byte-for-byte, dropping the eligibility check that migration added.
--
-- ── WHAT REVERTING COSTS ───────────────────────────────────────────────
--
-- This one is worth reading before running. Unlike a rollback that only
-- removes a convenience, this REOPENS a boundary: after it, an employment
-- confirmation request can again be addressed to an organisation CQrityjob has
-- not approved -- `draft`, `pending`, `rejected`, `suspended` or `archived` --
-- by any authenticated caller holding that organisation's id.
--
-- The exposure is bounded and worth stating exactly, rather than left to be
-- guessed at:
--
--   * Nothing here is a route to VERIFIED. sp_verifier_decide is untouched by
--     the forward migration and by this file. A holder still cannot decide
--     their own request (SP_SELF_VERIFICATION_FORBIDDEN), and only an owner or
--     admin of the named organisation can decide it at all.
--
--   * What comes back is the pre-20261019090000 behaviour: a request may sit
--     in the queue of an organisation the platform has suspended, and an
--     owner of that organisation can answer it.
--
--   * The application's picker filters on `status = 'active'` in its own
--     query and is unaffected by this file, so the ordinary path stays
--     narrow. That filter is a convenience and not a boundary, which is the
--     whole reason the forward migration exists -- so do not read "the UI
--     still filters" as "the rollback is free".
--
-- Prefer fixing forward. Run this only if the check itself is refusing a
-- legitimate request -- an organisation whose status is wrong in the data
-- rather than wrong in fact -- and even then, correcting the organisation's
-- status is the smaller change.
--
-- ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────
--
-- No table, column, policy, grant, index, constraint or trust state, because
-- the forward migration created none. No row is rewritten. Every other
-- refusal in this function -- SP_NOT_HOLDER, SP_REQUEST_ALREADY_OPEN,
-- SP_EMPLOYER_ATTESTATION_EMPLOYMENT_ONLY -- is restored unchanged, and the
-- foreign key on `target_employer_id` again becomes what refuses an id that
-- names no organisation.
--
-- Safe to run with the PR 17 application code still deployed: the picker never
-- offers an ineligible organisation in the first place, so the check has
-- nothing to refuse on the ordinary path.

CREATE OR REPLACE FUNCTION public.sp_submit_for_verification(
  _claim_id uuid, _period_id uuid, _kind text, _employer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _holder uuid; _id uuid;
BEGIN
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

REVOKE ALL ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_submit_for_verification(uuid,uuid,text,uuid) IS
  'Opens a verification request on the caller''s own entry. Refuses a submission '
  'for somebody else''s entry, refuses a second open request on the same entry '
  '(now atomically), and refuses employer attestation aimed at anything other '
  'than an employment period.';
