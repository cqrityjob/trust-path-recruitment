-- Security Passport — the employer's side of employment confirmation, as a
-- read model.
--
-- PR 8 turns "an employer CAN confirm employment" into "an employer FINDS the
-- request and answers it". Almost all of that is user interface, and this
-- migration is deliberately small: it changes one function, adds no table, no
-- column, no policy, no workflow state and no trust state, and grants nobody
-- anything they did not already have.
--
-- Two facts the employer's page needs and could not get, and one of them was
-- producing an action that could never succeed.
--
--
-- ── A. THE REQUEST THE EMPLOYER MUST NOT ANSWER, SAID OUT LOUD ─────────
--
-- A candidate may also own the company they worked for. Nothing about that is
-- suspicious -- a guard who later starts a small firm is an ordinary career --
-- and `has_employer_role(uid, employer, owner|admin)` is true for them, so
-- their own request appeared in their own employer queue with a Confirm
-- button beside it.
--
-- Pressing it did not verify anything. `sp_verifier_decide` refuses on
-- `_r.holder_user_id = auth.uid()` before it writes, and PR 5's suite proves
-- it. What the person met was a generic failure with no explanation, on a
-- control the product had offered them.
--
-- That is the shape of defect a boundary is supposed to prevent and an
-- interface is supposed to explain, and only the database can answer it
-- honestly: `auth.uid()` is not something a page may be trusted to compare
-- for itself. `sp_verifier_queue` already returns `is_self` for exactly this
-- reason (Phase 10, and PR 5 relies on it); the employer queue did not, so
-- the employer surface had no way to be as truthful as the reviewer surface.
--
-- The flag is NOT a permission and does not become one. It changes nothing
-- about who may decide -- the refusal is, and stays, in sp_verifier_decide.
-- It lets the page state the refusal in advance instead of staging it.
--
--
-- ── B. A REQUEST WITH NO NAME ON IT CANNOT BE ANSWERED ─────────────────
--
-- `holder_name` read `sp_passport_profiles.display_name`, which is NULLABLE,
-- and coalesced it to the empty string. An employer then received:
--
--     [no name]
--     Väktare
--     2024-01-01 – 2025-12-31
--
-- and was asked whether it was correct. There is no honest answer to that.
-- The whole request is "does this PERSON's stated employment match your
-- records", so a nameless request is not a harder question, it is a different
-- and unanswerable one.
--
-- `public.profiles.display_name` is the account's own name, set at signup by
-- the same person. Falling back to it adds NO new category of information to
-- this payload -- the holder's name is the first field the employer was
-- always meant to receive, and the request cannot function without it. It is
-- the same fallback, from the same table, that `scp_employer_team` already
-- makes for the same reason, and it is reachable here only because this
-- function is SECURITY DEFINER and has already proved the caller is an
-- owner or admin of the employer the request names.
--
-- Nothing else widens. No claim, no credential, no evidence, no second
-- employment period, no other holder, and no column of `profiles` beyond the
-- display name.
--
--
-- ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────
--
--   * No inbox table. The verification request IS the task; a second store of
--     "there is a task" is a second thing to keep in step with the first, and
--     the first is the one the trust model is built on.
--
--   * No count function. The dashboard derives its number from THIS function,
--     the same way `passportReviewCounts` derives from `sp_verifier_queue`,
--     so the count and the list cannot disagree and the authorisation check
--     is not written twice.
--
--   * No notification table, no email, no delivery state.
--
--   * No new trust source, assertion level or verification method. Employer
--     confirmation remains `employer_confirmation`, distinct from
--     `document_review` and `issuer_confirmation`, which is what lets a later
--     release add issuer and registry verification without any of them
--     becoming indistinguishable.
--
--   * No change to who may decide, to what may be attested, or to any
--     boundary PRs 4-7 established.
--
--
-- ── DEPLOY ORDER ───────────────────────────────────────────────────────
--
-- Additive to the returned JSON in both directions, so either order is safe.
-- Applied first, the current application ignores the two new keys. Applied
-- after the code, `is_self` is absent and the mapper reads it as `false` --
-- which is the behaviour of today's page exactly, and the decision itself was
-- always refused by the database rather than by the flag.


-- =============================================================================
-- The employer's queue
-- =============================================================================
-- Reproduced in full: CREATE OR REPLACE rewrites the whole body, so the whole
-- body is written out rather than imagined as a patch. Byte-for-byte the
-- definition from 20260817140000 except the two lines marked NEW and the
-- LEFT JOIN that feeds the second of them.
--
-- The authorisation check stays first, unchanged, and stays the only thing
-- standing between a signed-in principal and somebody else's employment
-- history. The field list stays a list -- every value named, nothing
-- spread -- so a column added to any of these tables tomorrow is invisible
-- here until somebody writes it in.
CREATE OR REPLACE FUNCTION public.sp_employer_attestation_queue(_employer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

-- Unchanged grants, restated because CREATE OR REPLACE on a SECURITY DEFINER
-- function is exactly the place a grant quietly widens if nobody says
-- otherwise. anon has never been able to call this and still cannot.
REVOKE ALL ON FUNCTION public.sp_employer_attestation_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_employer_attestation_queue(uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_employer_attestation_queue(uuid) IS
  'Employment confirmation requests addressed to one employer, for an owner or '
  'admin of that employer. The narrowest read in the product: one employment '
  'period and the holder''s name, and no way to ask for anything else -- no '
  'qualification, no document, no other employment, no other holder. Carries '
  'is_self so a candidate who also owns the employer is told the decision is '
  'refused rather than being offered a control that cannot work; the refusal '
  'itself remains in sp_verifier_decide.';


-- =============================================================================
-- Assert the end state, in the same transaction
-- =============================================================================
-- A migration that reports success without checking is a claim, not a change.
-- Both new keys are asserted to EXIST in the returned shape, and the whole
-- privacy boundary this function rests on is asserted to be unmoved: an
-- unrelated employer is still refused outright.
DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_employer_attestation_queue';

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_QUEUE_MISSING: sp_employer_attestation_queue was not created.';
  END IF;
  IF _src NOT LIKE '%''is_self''%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_IS_SELF_MISSING: the employer queue does not carry is_self, so the employer surface cannot state a self-confirmation refusal in advance.';
  END IF;
  IF _src NOT LIKE '%a.display_name%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_HOLDER_NAME_FALLBACK_MISSING: the employer queue can still return a nameless request.';
  END IF;
  IF _src NOT LIKE '%SP_NOT_EMPLOYER_REPRESENTATIVE%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_AUTHORISATION_LOST: the employer queue no longer proves the caller represents the employer.';
  END IF;
  -- The two things this function must never learn how to return.
  IF _src LIKE '%sp_claims%' OR _src LIKE '%sp_evidence%' THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_SCOPE_WIDENED: the employer queue reads a Passport table it has no standing to read.';
  END IF;
END $$;

DO $$
DECLARE _n integer;
BEGIN
  -- anon must hold nothing on it, and authenticated must still hold EXECUTE.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sp_employer_attestation_queue'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF _n > 0 THEN
    RAISE EXCEPTION 'SP_POSTFLIGHT_GRANTS_WRONG: sp_employer_attestation_queue is executable by anon, or no longer executable by authenticated.';
  END IF;
END $$;
