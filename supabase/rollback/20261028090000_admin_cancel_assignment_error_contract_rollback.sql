-- Rollback for 20261028090000_admin_cancel_assignment_error_contract.sql
--
-- Restores admin_cancel_assessment_assignment() to the definition it had in
-- 20260724130000, byte for byte. Nothing else is touched, because the migration
-- being reversed touched nothing else: no table, constraint, policy, grant or
-- row. Running this is safe at any time and loses no data.
--
-- WHAT YOU GET BACK BY RUNNING THIS
--
-- The defect. Three refusals sharing ERRCODE check_violation with the two table
-- constraints that can fire from inside the UPDATE, so a caller sees SQLSTATE
-- 23514 and cannot tell which of five things happened. src/lib/admin/admin-error.ts
-- still maps the pre-migration identifier, so an admin gets a localized (if
-- less specific) sentence rather than a constant -- but "this cannot be
-- cancelled" will again be shown for a reason that was merely too long.
--
-- Roll back only to unblock something, and re-apply.

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
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to cancel an assignment as admin'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(_clean_reason) > 2000 THEN
    RAISE EXCEPTION 'Reason is too long' USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO _current_status
  FROM public.assessment_assignments
  WHERE assessment_assignments.id = _assignment_id
  FOR UPDATE;

  IF _current_status IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF _current_status NOT IN ('invited', 'opened', 'started') THEN
    RAISE EXCEPTION 'Assignment cannot be cancelled from status %', _current_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.assessment_assignments
  SET status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = _clean_reason,
      cancelled_by = _caller
  WHERE assessment_assignments.id = _assignment_id;

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
  'Platform-admin-only. Cancels an incomplete assignment (invited/opened/started only) with a required reason, atomically, and inserts one audit_logs row. The sole admin-side cancellation path.';
