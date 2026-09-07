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