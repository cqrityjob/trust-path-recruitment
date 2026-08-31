-- Rollback for 20261016090000_sp_reviewer_least_privilege.sql.
--
-- Restores the two defects the forward migration closed:
--
--   * sp_is_verifier goes back to being, literally, is_platform_admin -- so
--     reviewing a Passport credential once again REQUIRES full platform
--     administration, and every user holding only 'passport_verifier'
--     silently loses the ability to review. Their historical decisions are
--     untouched and remain valid.
--
--   * TRUNCATE, REFERENCES and TRIGGER go back to `authenticated` on the
--     Passport tables. TRUNCATE is not bounded by RLS, so this restores the
--     state in which any signed-in user could empty the append-only
--     verification decision log.
--
--   * decided_by becomes readable again by the holder.
--
-- All three are the defect, not a feature. This file exists so the forward
-- migration is reversible, not because reversing it is ever the right thing
-- to do.
--
-- ── IT DESTROYS NO DATA ────────────────────────────────────────────────
--
-- The forward migration created no table and no column, rewrote no row and
-- back-filled nothing. It changed privileges and two function bodies.
-- Running this file changes privileges and two function bodies back.
--
-- It deliberately does NOT restore UPDATE on the verification tables or
-- INSERT on the decision log. Neither table has ever carried a policy
-- permitting either, so no product path regresses without them, and handing
-- back a write privilege on an append-only trust log to undo a role change
-- would be gratuitous.
--
-- PR 6's decision_note protection is NOT reversed here: it belongs to
-- migration 20261014090000 and its own rollback file.

BEGIN;

-- A. sp_is_verifier -- back to the platform-admin conflation.
CREATE OR REPLACE FUNCTION public.sp_is_verifier(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_user_id);
$$;

REVOKE ALL ON FUNCTION public.sp_is_verifier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_is_verifier(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_is_verifier IS
  'CQrityjob verification capability. Deliberately narrow: a verifier may act '
  'only through sp_verifier_decide(), and has no blanket read over Passport '
  'content.';

-- B. admin_set_platform_role -- back to the two-role allowlist.
--    Any existing 'passport_verifier' rows are left in place; they simply
--    stop meaning anything once sp_is_verifier no longer reads them.
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

-- C. Hand TRUNCATE/REFERENCES/TRIGGER back to authenticated on the Passport
--    tables. anon is NOT re-granted: it held nothing the application needs,
--    and restoring a defect is not a reason to restore it to anon too.
DO $$
DECLARE _t text;
BEGIN
  FOR _t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'sp\_%'
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'GRANT TRUNCATE, REFERENCES, TRIGGER ON public.%I TO authenticated', _t);
  END LOOP;
END;
$$;

-- D. decided_by readable by the holder again.
GRANT SELECT (decided_by) ON public.sp_verification_requests  TO authenticated;
GRANT SELECT (decided_by) ON public.sp_verification_decisions TO authenticated;

COMMIT;
