-- =============================================================================
-- Admin Portal operational scope — closes the remaining admin-visibility
-- and admin-role-management gaps found while making the Admin Portal the
-- real operational control center ahead of the pilot.
--
-- Ground truth confirmed before writing this file:
--   - employees, assessment_assignments, and user_roles each had ZERO
--     admin-scoped RLS policy. Every other operationally-relevant table
--     (employers, employer_memberships, jobs, job_applications,
--     job_application_status_events, job_audit_events, assessments,
--     assessment_versions) already has an `is_platform_admin(auth.uid())`
--     -gated policy, in the exact same style added here -- this is not a
--     new pattern, it is applying the existing one to the three tables
--     that were missing it.
--   - There is no is_superadmin() helper yet (only inline
--     has_role(_,'superadmin') calls inside is_platform_admin() and RLS
--     predicates). Platform role management (grant/revoke admin/
--     superadmin) needs a dedicated, narrower boundary than
--     is_platform_admin() -- "only superadmin may grant or revoke
--     platform admin roles" -- so this file adds the helper.
--   - user_roles' only existing policy is user_roles_self_select (a user
--     reads their own roles). No admin-wide read existed, and no write
--     path for platform roles exists anywhere except a manual database
--     insert -- this is the exact "no UI over an existing, real DB model"
--     gap identified in the audit.
--   - assessment_assignments has no cancellation-reason column and no
--     admin-scoped cancel path; the employer's own cancelAssessmentAssignment
--     (unchanged by this migration) requires no reason today and is not
--     retrofitted here to avoid changing already-shipped employer UX that
--     was not asked for. The new admin path is additive and separate.
--
-- Additive only. No existing table, column, policy, function, or trigger
-- is altered except via CREATE OR REPLACE (preserves OID/owner/ACL) or a
-- plain ADD COLUMN. Nothing in this migration is applied to any live
-- database by this tool -- Lovable applies it after merge, per process.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. employees — admin visibility + status-change path (Workforce oversight).
-- -----------------------------------------------------------------------------
CREATE POLICY "employees_admin_select" ON public.employees
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "employees_admin_update" ON public.employees
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));


-- -----------------------------------------------------------------------------
-- 2. assessment_assignments — admin visibility (Assignments + Results
--    oversight) + a validated, audited admin cancellation path.
-- -----------------------------------------------------------------------------
CREATE POLICY "assignments_admin_select" ON public.assessment_assignments
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.assessment_assignments.cancellation_reason IS
  'Required reason for an admin-initiated cancellation (admin_cancel_assessment_assignment()). Null for an employer''s own cancellation (that path does not require one) or for any non-cancelled assignment.';
COMMENT ON COLUMN public.assessment_assignments.cancelled_by IS
  'Set only by admin_cancel_assessment_assignment(). Null for an employer''s own cancellation.';

-- The sole path a platform admin can cancel an assignment through: fixed
-- precondition (must be invited/opened/started -- never completed/
-- expired/already cancelled), a required non-empty reason, one atomic
-- UPDATE, and one audit_logs row. Mirrors moderate_employer()/reject_job()
-- exactly: SECURITY DEFINER, re-verifies is_platform_admin() itself
-- (never trusts the caller's own prior check), so this RPC is the real
-- boundary regardless of what any TS wrapper does or doesn't check.
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


-- -----------------------------------------------------------------------------
-- 3. user_roles — admin read visibility + is_superadmin() + the sole
--    platform-role grant/revoke path (Users & Roles module).
-- -----------------------------------------------------------------------------
CREATE POLICY "user_roles_admin_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'superadmin');
$$;

REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_superadmin(uuid) IS
  'True iff the user holds platform role superadmin specifically (narrower than is_platform_admin, which also accepts admin). Used to gate platform role grant/revoke.';

-- The sole path any user's 'admin' or 'superadmin' platform role can ever
-- be granted or revoked through. Superadmin-only (not just admin).
-- Self-elevation is blocked unconditionally: a caller can never change
-- their OWN role row through this function, even a superadmin -- another
-- superadmin must always do it. Last-superadmin protection: revoking
-- 'superadmin' from a user is blocked if they are the only remaining
-- superadmin, so the platform can never be left with zero superadmins.
-- Restricted to exactly the two platform-admin roles ('admin',
-- 'superadmin') -- this tool is not a general role-assignment surface for
-- content_editor/assessment_editor/support, which are out of scope for
-- this pilot-readiness pass.
CREATE OR REPLACE FUNCTION public.admin_set_platform_role(
  _target_user_id uuid,
  _role text,
  _grant boolean
)
RETURNS TABLE (target_user_id uuid, granted_role text, granted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _superadmin_count int;
  _target_had_role boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_superadmin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: superadmin role required';
  END IF;
  IF _role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Invalid role: %; only admin/superadmin may be managed through this function', _role;
  END IF;
  IF _target_user_id = _caller THEN
    RAISE EXCEPTION 'SELF_ROLE_CHANGE_NOT_ALLOWED: a superadmin cannot change their own platform role'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Every bare `role` reference below is explicitly table-qualified
  -- (public.user_roles.role) -- this function's own RETURNS TABLE also
  -- has an output column named `role`, which PL/pgSQL would otherwise
  -- treat as ambiguous against the table column of the same name.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE public.user_roles.user_id = _target_user_id
      AND public.user_roles.role = _role::public.app_role
  ) INTO _target_had_role;

  IF NOT _grant AND _role = 'superadmin' AND _target_had_role THEN
    SELECT count(*) INTO _superadmin_count
    FROM public.user_roles WHERE public.user_roles.role = 'superadmin';
    IF _superadmin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_SUPERADMIN_PROTECTED: cannot remove the only remaining superadmin'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (_target_user_id, _role::public.app_role, _caller)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE public.user_roles.user_id = _target_user_id
      AND public.user_roles.role = _role::public.app_role;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (
    _caller, 'superadmin',
    CASE WHEN _grant THEN 'platform_role_granted' ELSE 'platform_role_revoked' END,
    'user', _target_user_id::text,
    jsonb_build_object('role', _role, 'had_role_before', _target_had_role)
  );

  RETURN QUERY SELECT _target_user_id, _role::text, _grant;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) IS
  'Superadmin-only. The sole path a user''s admin/superadmin platform role can be granted or revoked through. Blocks self-role-change unconditionally and blocks removing the last remaining superadmin. Inserts one audit_logs row per call.';
