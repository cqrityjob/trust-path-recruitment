-- =============================================================================
-- Phase G1 — Employer Identity Foundation
-- Approved source: PR #4, branch phase-g1-employer-memberships, commit 0354e07
-- Applied per Owner Approval — Mostafa Alshawi
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. employers.status — additive column, safe default
-- -----------------------------------------------------------------------------
ALTER TABLE public.employers
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'suspended', 'archived'));

COMMENT ON COLUMN public.employers.status IS
  'Organisation lifecycle, independent of individual job status. '
  'suspended/archived employers are excluded from public visibility '
  '(see section 6) even if they still own individually-published jobs.';


-- -----------------------------------------------------------------------------
-- 2. employer_memberships — new table
-- -----------------------------------------------------------------------------
CREATE TABLE public.employer_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employer_id, user_id)
);

COMMENT ON TABLE public.employer_memberships IS
  'Phase G1. Links an existing auth.users identity to an employer with a '
  'role and status. Admin-only writes in G1 (no self-service). Role names '
  '(owner/admin/member) are employer-scoped and intentionally distinct '
  'from public.app_role (platform-scoped) — the two are never compared to '
  'each other in any policy or function.';

CREATE INDEX employer_memberships_employer_idx ON public.employer_memberships (employer_id);
CREATE INDEX employer_memberships_user_idx ON public.employer_memberships (user_id);
CREATE INDEX employer_memberships_status_idx ON public.employer_memberships (status);
CREATE INDEX employer_memberships_user_status_idx ON public.employer_memberships (user_id, status);

CREATE TRIGGER set_employer_memberships_updated_at
  BEFORE UPDATE ON public.employer_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_memberships TO authenticated;
GRANT ALL ON public.employer_memberships TO service_role;

ALTER TABLE public.employer_memberships ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 3. public.is_platform_admin(uuid)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'superadmin');
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_platform_admin(uuid) IS
  'True iff the user holds platform role admin OR superadmin.';


-- -----------------------------------------------------------------------------
-- 4. public.has_employer_role(uuid, uuid, text[])
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_employer_role(
  _user_id uuid,
  _employer_id uuid,
  _roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employer_memberships em
    WHERE em.user_id = _user_id
      AND em.employer_id = _employer_id
      AND em.status = 'active'
      AND (_roles IS NULL OR em.role = ANY(_roles))
  );
$$;

REVOKE ALL ON FUNCTION public.has_employer_role(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_employer_role(uuid, uuid, text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_employer_role(uuid, uuid, text[]) IS
  'True iff _user_id has an ACTIVE membership in _employer_id, optionally '
  'restricted to one of _roles.';


-- -----------------------------------------------------------------------------
-- 5. employer_memberships RLS policies
-- -----------------------------------------------------------------------------
CREATE POLICY "employer_memberships_self_select" ON public.employer_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "employer_memberships_admin_all" ON public.employer_memberships
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));


-- -----------------------------------------------------------------------------
-- 6. employers — new member-scoped read policy
-- -----------------------------------------------------------------------------
CREATE POLICY "employers_member_select" ON public.employers
  FOR SELECT
  TO authenticated
  USING (public.has_employer_role(auth.uid(), id, NULL));


-- -----------------------------------------------------------------------------
-- 7. Public visibility narrowing — suspended/archived employers excluded
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employer_is_active_status(_employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status = 'active' FROM public.employers WHERE id = _employer_id;
$$;

REVOKE ALL ON FUNCTION public.employer_is_active_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_is_active_status(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.employer_is_active_status(uuid) IS
  'RLS-recursion-avoidance helper. SECURITY DEFINER so this lookup does '
  'not re-trigger employers'' own RLS policies when called from '
  'jobs_public_active_select. Returns only a boolean.';

ALTER POLICY "jobs_public_active_select" ON public.jobs
  USING (
    public.job_is_active(status, published_at, deadline_at, expires_at)
    AND public.employer_is_active_status(jobs.employer_id)
  );

ALTER POLICY "employers_public_active_select" ON public.employers
  USING (
    employers.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.employer_id = employers.id
        AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
    )
  );


-- -----------------------------------------------------------------------------
-- 8. Admin/superadmin equivalence correction — 8 existing policies
-- -----------------------------------------------------------------------------
ALTER POLICY "job_import_sources_admin_all" ON public.job_import_sources
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

ALTER POLICY "job_import_sources admin read" ON public.job_import_sources
  USING (public.is_platform_admin(auth.uid()));

ALTER POLICY "employer_admin_meta_admin_all" ON public.employer_admin_meta
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

ALTER POLICY "jobs_admin_select" ON public.jobs
  USING (public.is_platform_admin(auth.uid()));

ALTER POLICY "jobs_admin_write" ON public.jobs
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

ALTER POLICY "employers_admin_all" ON public.employers
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

ALTER POLICY "job_admin_meta_admin_all" ON public.job_admin_meta
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

ALTER POLICY "job_audit_events_admin_select" ON public.job_audit_events
  USING (public.is_platform_admin(auth.uid()));


-- -----------------------------------------------------------------------------
-- 9. public.update_employer_membership(uuid, text, text)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_employer_membership(
  _membership_id uuid,
  _new_role text DEFAULT NULL,
  _new_status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  employer_id uuid,
  user_id uuid,
  role text,
  status text,
  invited_at timestamptz,
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  changed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _employer_id uuid;
  _existing public.employer_memberships;
  _final_role text;
  _final_status text;
  _other_active_owners int;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  IF _new_role IS NULL AND _new_status IS NULL THEN
    RAISE EXCEPTION 'No change requested: specify a new role, a new status, or both';
  END IF;
  IF _new_role IS NOT NULL AND _new_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  IF _new_status IS NOT NULL AND _new_status NOT IN ('invited', 'active', 'suspended', 'removed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT em.employer_id INTO _employer_id
  FROM public.employer_memberships em
  WHERE em.id = _membership_id;

  IF _employer_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  PERFORM 1
  FROM public.employer_memberships em
  WHERE em.employer_id = _employer_id
    AND (em.id = _membership_id OR (em.role = 'owner' AND em.status = 'active'))
  ORDER BY em.id
  FOR UPDATE;

  SELECT * INTO _existing FROM public.employer_memberships em WHERE em.id = _membership_id;

  _final_role := COALESCE(_new_role, _existing.role);
  _final_status := COALESCE(_new_status, _existing.status);

  IF _final_role = _existing.role AND _final_status = _existing.status THEN
    RETURN QUERY
      SELECT em.id, em.employer_id, em.user_id, em.role, em.status,
             em.invited_at, em.accepted_at, em.removed_at, em.created_at, em.updated_at,
             false
      FROM public.employer_memberships em
      WHERE em.id = _membership_id;
    RETURN;
  END IF;

  IF _existing.role = 'owner' AND _existing.status = 'active'
     AND (_final_role <> 'owner' OR _final_status <> 'active') THEN
    SELECT count(*) INTO _other_active_owners
    FROM public.employer_memberships em
    WHERE em.employer_id = _employer_id
      AND em.role = 'owner'
      AND em.status = 'active'
      AND em.id <> _membership_id;

    IF _other_active_owners = 0 THEN
      RAISE EXCEPTION 'Cannot change this membership: it is the only active owner for this employer. Assign another active owner first.';
    END IF;
  END IF;

  UPDATE public.employer_memberships em
  SET role = _final_role,
      status = _final_status,
      accepted_at = CASE
        WHEN _final_status = 'active' AND em.status <> 'active' THEN _now
        ELSE em.accepted_at
      END,
      removed_at = CASE WHEN _final_status = 'removed' THEN _now ELSE NULL END,
      updated_at = _now
  WHERE em.id = _membership_id;

  RETURN QUERY
    SELECT em.id, em.employer_id, em.user_id, em.role, em.status,
           em.invited_at, em.accepted_at, em.removed_at, em.created_at, em.updated_at,
           true
    FROM public.employer_memberships em
    WHERE em.id = _membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_employer_membership(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_employer_membership(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.update_employer_membership(uuid, text, text) IS
  'Atomic role/status mutation for employer_memberships. Platform-admin only. '
  'Locks target row + all active-owner rows for the employer (id order) before '
  'evaluating final-owner rule. No-op returns changed=false. removed_at is '
  'NULL unless resulting status is ''removed''.';