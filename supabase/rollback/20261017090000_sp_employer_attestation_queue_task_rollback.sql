-- Rollback for 20261017090000_sp_employer_attestation_queue_task.sql
--
-- Restores sp_employer_attestation_queue to its 20260817140000 definition,
-- byte-for-byte, dropping the two keys that migration added.
--
-- ── WHAT REVERTING COSTS ───────────────────────────────────────────────
--
-- Nothing about security. `is_self` was never a permission: the refusal of a
-- self-confirmation lives in sp_verifier_decide and is untouched here, so
-- after this rollback a candidate who also owns the employer is still refused
-- -- they are simply refused AFTER pressing the button instead of being told
-- beforehand, which is the behaviour that shipped before PR 8.
--
-- The holder-name fallback goes with it, so a request from a holder who never
-- set a Passport display name reads as a blank name again.
--
-- ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────
--
-- No table, column, policy, grant, index, constraint or trust state, because
-- the forward migration created none. No row is rewritten. Every boundary
-- from PRs 4-7 is outside this file entirely.
--
-- Safe to run with the PR 8 application code still deployed: the employer
-- page reads a missing `is_self` as `false` and a missing name as an explicit
-- "name not recorded", which are exactly the pre-PR-8 states.

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
      'holder_name', coalesce(p.display_name, ''),
      'role_title', e.role_title,
      'employer_name', e.employer_name,
      'started_on', e.started_on,
      'ended_on', e.ended_on,
      'employment_type', e.employment_type,
      'fte_fraction', e.fte_fraction,
      'security_relevance', e.security_relevance,
      'holder_message', r.holder_message
    ) AS x
    FROM public.sp_verification_requests r
    JOIN public.sp_experience_periods e      ON e.id = r.period_id
    LEFT JOIN public.sp_passport_profiles p  ON p.holder_user_id = r.holder_user_id
   WHERE r.request_kind = 'employer_attestation'
     AND r.target_employer_id = _employer_id
  ) s;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.sp_employer_attestation_queue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_employer_attestation_queue(uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_employer_attestation_queue(uuid) IS NULL;
