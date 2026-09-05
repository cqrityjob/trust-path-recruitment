-- Admin assignment cancellation — a refusal you can act on.
--
-- ── WHAT WENT WRONG ─────────────────────────────────────────────────────────
--
-- A platform admin opened /admin/assignments/:id, typed a cancellation reason,
-- confirmed, and the dialog answered:
--
--     ASSIGNMENT_NOT_CANCELLABLE_OR_REASON_REQUIRED
--
-- The name of that string is the whole defect. It is a disjunction, because the
-- code that produced it could not tell which half had happened -- and neither
-- could the admin, and neither could support afterwards.
--
-- admin_cancel_assessment_assignment() (20260724130000) raises THREE different
-- refusals with `USING ERRCODE = 'check_violation'`:
--
--     * the reason is blank
--     * the reason is longer than 2000 characters
--     * the assignment is not in a cancellable status
--
-- and TWO more check violations can be raised by the table itself when the
-- UPDATE lands, from inside the same function:
--
--     * assessment_assignments_person_context_agrees -- added NOT VALID in
--       20260819090000, so a row written before that date passes its INSERT and
--       then fails EVERY LATER UPDATE, including a legitimate cancellation
--     * assessment_assignments_single_lineage
--
-- All five arrive at PostgREST as SQLSTATE 23514 and are indistinguishable
-- there. The TypeScript wrapper mapped that one SQLSTATE to that one string,
-- and the route rendered it verbatim.
--
-- ── WHAT THIS MIGRATION CHANGES ─────────────────────────────────────────────
--
-- The reporting, and only the reporting. Every precondition, every status the
-- function accepts, the required reason, the 2000-character ceiling, the
-- authorization check, the audit row and the single atomic UPDATE are byte-for-
-- byte the behaviour of 20260724130000. Nothing is relaxed:
--
--     * is_platform_admin() is still re-verified inside the function, so this
--       RPC remains the real boundary regardless of what any caller checks
--     * cancellable is still exactly (invited, opened, started)
--     * a reason is still required, still trimmed, still capped at 2000
--     * SECURITY DEFINER, search_path pinned, grants unchanged
--
-- What changes is that each refusal now names ITSELF, with a stable
-- ADMIN_CANCEL_* identifier at the front of the message. That is the same
-- convention scp_record_employer_decision() already uses for its SCP_* codes,
-- and for the same reason: the client extracts the identifier and renders its
-- own localized sentence, so the database's wording never reaches a user.
--
-- The identifiers are a contract. src/lib/admin/admin-error.ts maps every one
-- of them to a translation key, and scripts/admin-error-contract-check.ts fails
-- the build if this file raises one the client cannot name.
--
-- ── THE CASE THAT COULD NOT BE REPORTED AT ALL ──────────────────────────────
--
-- The two table-level check violations were the worst of the five, because the
-- function never knew they had happened -- they propagated out of the UPDATE
-- with a constraint name and a full row dump attached. That is now caught and
-- re-raised as ADMIN_CANCEL_STATE_INCONSISTENT, carrying the constraint name in
-- the SERVER log only. The admin is told the record needs attention; they are
-- not shown the row.
--
-- Catching it does NOT swallow it: the exception still aborts the statement, no
-- cancellation is recorded, and no audit row is written. The handler re-raises.
--
-- Reversible: re-run 20260724130000's function body. No data is read or written
-- by this migration, and no table, constraint, policy or grant is touched.

CREATE OR REPLACE FUNCTION public.admin_cancel_assessment_assignment(
  _assignment_id uuid,
  _reason text
)
RETURNS TABLE (id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean_reason text;
  _current_status text;
  _constraint text;
  _detail text;
BEGIN
  -- Authorization: unchanged from 20260724130000. The function does not trust
  -- the caller's own prior check and never has.
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_NOT_AUTHENTICATED: not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_FORBIDDEN: platform admin role required';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION
      'ADMIN_CANCEL_REASON_REQUIRED: a reason is required to cancel an assignment as admin'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(_clean_reason) > 2000 THEN
    RAISE EXCEPTION
      'ADMIN_CANCEL_REASON_TOO_LONG: reason is longer than the 2000 character maximum'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO _current_status
  FROM public.assessment_assignments
  WHERE assessment_assignments.id = _assignment_id
  FOR UPDATE;

  IF _current_status IS NULL THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_NOT_FOUND: assignment not found';
  END IF;

  -- The cancellable set, unchanged. It is duplicated in the route that offers
  -- the button (src/routes/_authenticated.admin.assignments.$assignmentId.tsx);
  -- scripts/admin-error-contract-check.ts asserts the two still agree, because
  -- nothing else would notice if they stopped.
  IF _current_status NOT IN ('invited', 'opened', 'started') THEN
    RAISE EXCEPTION
      'ADMIN_CANCEL_NOT_CANCELLABLE: assignment cannot be cancelled from status %',
      _current_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- The UPDATE is wrapped ONLY so a constraint violation can be named. A row
  -- whose stored data disagrees with a constraint added NOT VALID after it was
  -- written fails here, and the raw failure carries the constraint name and the
  -- entire row -- recipient email included -- which must not reach a browser.
  BEGIN
    UPDATE public.assessment_assignments
    SET status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = _clean_reason,
        cancelled_by = _caller
    WHERE assessment_assignments.id = _assignment_id;
  EXCEPTION WHEN check_violation OR not_null_violation OR foreign_key_violation THEN
    GET STACKED DIAGNOSTICS
      _constraint = CONSTRAINT_NAME,
      _detail     = MESSAGE_TEXT;
    -- The constraint name goes to the server log, where an engineer can read
    -- it. The client is given the identifier and nothing else.
    RAISE WARNING 'admin_cancel_assessment_assignment: assignment % failed constraint % (%)',
      _assignment_id, coalesce(_constraint, 'unknown'), _detail;
    RAISE EXCEPTION
      'ADMIN_CANCEL_STATE_INCONSISTENT: this assignment''s stored data does not satisfy a current constraint'
      USING ERRCODE = 'check_violation';
  END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (
    _caller, 'platform_admin', 'assignment_cancelled', 'assessment_assignment',
    _assignment_id::text,
    jsonb_build_object('previous_status', _current_status, 'reason', _clean_reason)
  );

  RETURN QUERY SELECT _assignment_id, _current_status, 'cancelled'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_assessment_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_assessment_assignment(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_cancel_assessment_assignment(uuid, text) IS
  'Platform-admin-only. Cancels an incomplete assignment (invited/opened/started only) with a required reason, atomically, and inserts one audit_logs row. The sole admin-side cancellation path. Every refusal is prefixed with a stable ADMIN_CANCEL_* identifier so the client can render localized copy instead of database wording; src/lib/admin/admin-error.ts holds the mapping and scripts/admin-error-contract-check.ts enforces that it is complete.';


-- =========================================================================
-- Prove it
-- =========================================================================
--
-- The behavioural contract is exercised against real rows by
-- supabase/tests/admin_assignment_cancellation_test.sql. What is proved here is
-- narrower and belongs with the definition: that the function still exists with
-- the same signature, security properties and grants, and that every refusal in
-- the body it just replaced is now identifiable.

DO $$
DECLARE _n int; _src text;
BEGIN
  SELECT prosrc INTO _src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_cancel_assessment_assignment';

  IF _src IS NULL THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_CONTRACT_FUNCTION_MISSING';
  END IF;

  -- Every refusal names itself.
  IF _src NOT LIKE '%ADMIN_CANCEL_NOT_AUTHENTICATED%'
     OR _src NOT LIKE '%ADMIN_CANCEL_FORBIDDEN%'
     OR _src NOT LIKE '%ADMIN_CANCEL_REASON_REQUIRED%'
     OR _src NOT LIKE '%ADMIN_CANCEL_REASON_TOO_LONG%'
     OR _src NOT LIKE '%ADMIN_CANCEL_NOT_FOUND%'
     OR _src NOT LIKE '%ADMIN_CANCEL_NOT_CANCELLABLE%'
     OR _src NOT LIKE '%ADMIN_CANCEL_STATE_INCONSISTENT%'
  THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_CONTRACT_INCOMPLETE: a refusal has no stable identifier';
  END IF;

  -- The authorization boundary is still inside the function.
  IF _src NOT LIKE '%is_platform_admin(_caller)%' THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_CONTRACT_AUTHZ_REMOVED';
  END IF;

  -- The cancellable set is unchanged.
  IF _src NOT LIKE '%''invited'', ''opened'', ''started''%' THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_CONTRACT_STATUS_SET_CHANGED';
  END IF;

  -- SECURITY DEFINER with a pinned search_path, as before.
  SELECT count(*) INTO _n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_cancel_assessment_assignment'
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public'];
  IF _n <> 1 THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_CONTRACT_SECURITY_PROPERTIES_CHANGED';
  END IF;

  -- anon still cannot execute it.
  IF has_function_privilege('anon', 'public.admin_cancel_assessment_assignment(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ADMIN_CANCEL_CONTRACT_ANON_CAN_EXECUTE';
  END IF;

  RAISE NOTICE 'ADMIN_CANCEL_ERROR_CONTRACT_PROOF ok';
END $$;
