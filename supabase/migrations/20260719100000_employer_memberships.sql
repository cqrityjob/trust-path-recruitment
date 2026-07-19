-- =============================================================================
-- Phase G1 — Employer Identity Foundation
--
-- Adds the minimum secure backend required for one shared, existing
-- authenticated user (auth.users) to also belong to zero, one, or several
-- employer organisations, without any new authentication system and without
-- creating a parallel "organisations" table. `public.employers` (delivered in
-- the Phase A — Job Intelligence Foundation migration) is reused as-is as the
-- organisation entity.
--
-- This migration is purely additive except for the eight ALTER POLICY
-- statements in section 5 (admin/superadmin equivalence) and the two ALTER
-- POLICY statements in section 6 (public-visibility narrowing) — both use
-- ALTER POLICY, never DROP+CREATE, so there is never a moment without a
-- policy in place, and every existing predicate is preserved except the one
-- named correction in each case. See docs/job-intelligence/phase-g1-report.md
-- for the full rationale, before/after text, and rollback drill.
--
-- No self-service. No employer portal UI. No job-write access for
-- non-admins. VITE_EMPLOYER_PORTAL_ENABLED / VITE_JOBS_ENABLED /
-- VITE_CIG_LIFECYCLE_ENFORCED are all unaffected by this migration and
-- remain false.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. employers.status — additive column, safe default
-- -----------------------------------------------------------------------------
-- Every existing row becomes 'active' on migration — correct, since every
-- row that exists today is a live, admin-managed employer with no prior
-- lifecycle concept. No backfill logic needed beyond the column default.

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
-- One row per (employer, user). Role/status are text + CHECK, not native
-- Postgres enums, matching this codebase's own established convention for
-- exactly this kind of lifecycle column (see jobs.status, employers.status
-- above) — a CHECK constraint is a single, ordinary DROP/ADD to extend
-- later, unlike a native enum's ALTER TYPE ... ADD VALUE, which this
-- project has already had to handle carefully elsewhere (cig_content_status).

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

-- employer_id / user_id: point lookups ("who is a member of this
-- employer" / "which employers is this user a member of").
CREATE INDEX employer_memberships_employer_idx ON public.employer_memberships (employer_id);
CREATE INDEX employer_memberships_user_idx ON public.employer_memberships (user_id);
CREATE INDEX employer_memberships_status_idx ON public.employer_memberships (status);

-- Composite: the one genuinely distinct common lookup not already covered
-- by the UNIQUE(employer_id, user_id) index or the single-column indexes
-- above — "list this user's active memberships across every employer"
-- (listMyEmployerMemberships / has_employer_role's underlying access
-- pattern). No other composite is added — a redundant index was
-- deliberately avoided.
CREATE INDEX employer_memberships_user_status_idx ON public.employer_memberships (user_id, status);

CREATE TRIGGER set_employer_memberships_updated_at
  BEFORE UPDATE ON public.employer_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grant is intentionally broad (matches the existing `employers` table's
-- own grant style, e.g. "GRANT INSERT, UPDATE, DELETE ... TO authenticated;
-- -- admin-gated by policy") — RLS is the real write boundary (section 4:
-- no INSERT/UPDATE/DELETE policy exists for a non-admin authenticated
-- user, so any such attempt is rejected by RLS, not by the grant).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_memberships TO authenticated;
GRANT ALL ON public.employer_memberships TO service_role;

ALTER TABLE public.employer_memberships ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 3. public.is_platform_admin(uuid) — admin/superadmin equivalence helper
-- -----------------------------------------------------------------------------
-- Fixes a real, pre-existing defect (identified in the Phase G1 read-only
-- audit): assertAdmin()/adminWhoAmI() and 8 existing RLS policies check
-- has_role(admin) only, so a superadmin-only user is currently locked out
-- of the entire admin console. This function is the single, reusable fix,
-- applied consistently in sections 5 below — not a new parallel mechanism.

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
  'True iff the user holds platform role admin OR superadmin. Does not '
  'broaden access for content_editor, assessment_editor, or support — '
  'those roles are untouched by this function and by every policy that '
  'uses it.';


-- -----------------------------------------------------------------------------
-- 4. public.has_employer_role(uuid, uuid, text[]) — membership helper
-- -----------------------------------------------------------------------------
-- Mirrors has_role()'s own shape (SECURITY DEFINER, pinned search_path,
-- same authenticated/service_role-only grant). Only ever reads
-- employer_memberships directly (no recursive RLS: this function is the
-- thing RLS policies call, it never itself queries a table whose policies
-- call back into it). _roles = NULL means "any active membership,
-- regardless of role" — used by employers_member_select below.
--
-- A second helper (e.g. current_user_employer_ids()) was considered and
-- deliberately NOT added: every call site in this migration and in
-- membership.functions.ts needs a role check scoped to one specific
-- employer_id, which this function already covers; a "list of all my
-- employer ids" helper has no current caller and would be redundant.

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
  'restricted to one of _roles. Suspended/removed/invited memberships '
  'never satisfy this check — only status = ''active'' does.';


-- -----------------------------------------------------------------------------
-- 5. employer_memberships RLS policies
-- -----------------------------------------------------------------------------

-- A user may always read their OWN membership rows, in any status —
-- including 'suspended'/'removed' — so they can see their own history
-- (e.g. "you were removed from X"). This is visibility of one's own
-- record, not a grant of ACCESS: actual authorisation everywhere else
-- (employers_member_select below, and every future employer-scoped check)
-- goes through has_employer_role(), which requires status = 'active'
-- regardless of what this policy allows a user to see about themselves.
CREATE POLICY "employer_memberships_self_select" ON public.employer_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Platform admin/superadmin manage all membership rows. No separate
-- INSERT/UPDATE/DELETE policy exists for anyone else — an ordinary member
-- (owner/admin/member role, any status) has zero write path to this table
-- in Phase G1, matching "no self-service membership write permissions
-- yet" for every employer-scoped role.
CREATE POLICY "employer_memberships_admin_all" ON public.employer_memberships
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));


-- -----------------------------------------------------------------------------
-- 6. employers — new member-scoped read policy
-- -----------------------------------------------------------------------------
-- Lets an active member read their OWN employer's full public row
-- regardless of whether that employer currently has any publicly-active
-- job (the existing employers_public_active_select policy below requires
-- an active job to exist at all — a brand-new organisation with zero jobs
-- yet would otherwise be invisible even to its own members). This policy
-- is purely additive: it only ever ADDS visibility for the specific
-- caller's own org(s), never removes or narrows anything.

CREATE POLICY "employers_member_select" ON public.employers
  FOR SELECT
  TO authenticated
  USING (public.has_employer_role(auth.uid(), id, NULL));


-- -----------------------------------------------------------------------------
-- 7. Public visibility narrowing — suspended/archived employers excluded
-- -----------------------------------------------------------------------------
-- BEFORE (verbatim, as it exists today — captured here so a reviewer can
-- diff without needing to open the original migration file):
--
--   CREATE POLICY "jobs_public_active_select"
--     ON public.jobs FOR SELECT
--     TO anon, authenticated
--     USING (public.job_is_active(status, published_at, deadline_at, expires_at));
--
--   CREATE POLICY "employers_public_active_select"
--     ON public.employers FOR SELECT
--     TO anon, authenticated
--     USING (EXISTS (
--       SELECT 1 FROM public.jobs j
--       WHERE j.employer_id = employers.id
--         AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
--     ));
--
-- AFTER — every original predicate preserved character-for-character,
-- exactly one AND condition added to each, via ALTER POLICY (never
-- DROP+CREATE, so there is never a window without a policy in place).
-- Active employers keep exactly their current public behaviour; only
-- suspended/archived employers (and, transitively, their jobs) lose
-- public visibility.

ALTER POLICY "jobs_public_active_select" ON public.jobs
  USING (
    public.job_is_active(status, published_at, deadline_at, expires_at)
    AND EXISTS (
      SELECT 1 FROM public.employers e
      WHERE e.id = jobs.employer_id AND e.status = 'active'
    )
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
-- Every one of these 8 policies currently reads
-- `public.has_role(auth.uid(), 'admin')` only (verified by direct read of
-- supabase/migrations/20260717113432_d50ef104-....sql and
-- supabase/migrations/20260718182544_dbec41a3-....sql immediately before
-- writing this migration — see docs/job-intelligence/phase-g1-report.md
-- for the exact grep output). The ONLY change in each is the literal
-- substitution has_role(auth.uid(),'admin') -> is_platform_admin(auth.uid())
-- in USING and, where present, WITH CHECK. No other predicate, no other
-- table, no other role (content_editor/assessment_editor/support) is
-- touched. ALTER POLICY is used throughout — never DROP+CREATE.

-- 1/8
ALTER POLICY "job_import_sources_admin_all" ON public.job_import_sources
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 2/8
ALTER POLICY "job_import_sources admin read" ON public.job_import_sources
  USING (public.is_platform_admin(auth.uid()));

-- 3/8
ALTER POLICY "employer_admin_meta_admin_all" ON public.employer_admin_meta
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 4/8
ALTER POLICY "jobs_admin_select" ON public.jobs
  USING (public.is_platform_admin(auth.uid()));

-- 5/8
ALTER POLICY "jobs_admin_write" ON public.jobs
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 6/8
ALTER POLICY "employers_admin_all" ON public.employers
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 7/8
ALTER POLICY "job_admin_meta_admin_all" ON public.job_admin_meta
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 8/8
ALTER POLICY "job_audit_events_admin_select" ON public.job_audit_events
  USING (public.is_platform_admin(auth.uid()));


-- -----------------------------------------------------------------------------
-- 9. public.update_employer_membership(uuid, text, text) — atomic
--    role/status mutation with race-free final-active-owner protection
-- -----------------------------------------------------------------------------
-- Added after the Phase G1 code review identified a real check-then-act
-- race: the original design ran a plain SELECT count(...) in application
-- code, then a separate UPDATE, with no lock and no shared transaction.
-- Two concurrent platform-admin requests, each demoting a DIFFERENT
-- active owner of the SAME employer, could both pass their own count
-- check before either committed, jointly leaving the employer with zero
-- active owners — exactly the state this feature exists to prevent.
--
-- Fix: the count-check and the mutation now happen inside ONE function,
-- in ONE transaction, after taking row locks that force any second
-- concurrent call touching the same employer to wait rather than race.
--
-- SECURITY INVOKER (not DEFINER): deliberately. The calling platform
-- admin already has direct RLS-granted access to employer_memberships
-- via the employer_memberships_admin_all policy (section 5 above) — a
-- SECURITY INVOKER function runs with the caller's own privileges and
-- auth.uid(), so RLS keeps applying inside it exactly as if the caller
-- ran the statements directly. This means RLS remains the authoritative
-- boundary even if the explicit is_platform_admin() check below were
-- ever accidentally removed in a future edit — a non-admin's SELECT ...
-- FOR UPDATE / UPDATE would still be denied by RLS itself, not merely
-- by this function's own logic. SECURITY DEFINER was considered and
-- rejected: nothing here needs to read or write anything the calling
-- admin doesn't already have direct RLS access to, so bypassing RLS
-- would only widen the trust boundary for no benefit.
--
-- Locking strategy (the actual race fix): one SELECT ... FOR UPDATE
-- locks the target membership row AND every row that is currently an
-- active owner for the same employer, together, in a single statement,
-- ordered by id. Two concurrent calls against the same employer always
-- request that same lock set in that same order, so the second call
-- simply blocks (ordinary lock contention) until the first call's
-- transaction commits or rolls back — it can never observe a stale,
-- pre-change count, and the two calls can never deadlock each other
-- (both always acquire locks in the same relative order). Once
-- unblocked, the second call re-reads the now-committed state and
-- evaluates the final-owner rule against genuinely current data.
--
-- No-op handling: if the requested role/status equals the row's current
-- role/status, the function returns immediately with changed = false
-- and performs no UPDATE at all — the caller (membership.functions.ts)
-- uses this flag to skip writing a misleading audit event for a change
-- that didn't happen.
--
-- removed_at semantics: set to now() exactly when the resulting status
-- is 'removed', and explicitly cleared to NULL for every other
-- resulting status (active, invited, suspended) — a membership can never
-- carry a stale removed_at from an earlier removal after being
-- reactivated or otherwise changed.

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
  -- Authorization: auth.uid() only. No actor identity is ever accepted
  -- as a parameter, so a caller cannot assert someone else's identity.
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  -- Input validation: explicit, even though the TypeScript caller also
  -- validates with zod against the same value sets — this function must
  -- be safe to call directly (e.g. via a raw RPC request), not just via
  -- the approved server function.
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

  -- The actual race fix: lock the target row and every active-owner row
  -- for this employer together, in id order. See the comment block
  -- above for why this specific shape avoids both the race and any
  -- deadlock between two concurrent calls.
  PERFORM 1
  FROM public.employer_memberships em
  WHERE em.employer_id = _employer_id
    AND (em.id = _membership_id OR (em.role = 'owner' AND em.status = 'active'))
  ORDER BY em.id
  FOR UPDATE;

  SELECT * INTO _existing FROM public.employer_memberships WHERE id = _membership_id;

  _final_role := COALESCE(_new_role, _existing.role);
  _final_status := COALESCE(_new_status, _existing.status);

  -- No-op: nothing to change. Return the current row unchanged with
  -- changed = false and stop — no UPDATE, no updated_at bump.
  IF _final_role = _existing.role AND _final_status = _existing.status THEN
    RETURN QUERY
      SELECT em.id, em.employer_id, em.user_id, em.role, em.status,
             em.invited_at, em.accepted_at, em.removed_at, em.created_at, em.updated_at,
             false
      FROM public.employer_memberships em
      WHERE em.id = _membership_id;
    RETURN;
  END IF;

  -- Final-active-owner protection: only relevant when the row being
  -- changed is CURRENTLY an active owner and the requested change would
  -- move it out of that state. The count below is computed after the
  -- lock above, inside this same transaction, against rows this
  -- transaction already holds locks on — no other transaction can have
  -- changed them since.
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
      -- removed_at semantics (Phase G1 code-review fix): set only when
      -- the resulting status is 'removed', cleared to NULL for every
      -- other resulting status — never left stale.
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
  'Atomic role/status mutation for employer_memberships, added by the '
  'Phase G1 code-review fix. Authorization: auth.uid() + is_platform_admin() '
  'only, re-checked here even though RLS also enforces it. Concurrency: '
  'locks the target row and all active-owner rows for the employer '
  'together (id order) before evaluating the final-owner rule, so '
  'concurrent calls on the same employer serialize instead of racing. '
  'No-op calls (role/status unchanged) return changed = false and write '
  'nothing. removed_at is always NULL unless the resulting status is '
  '''removed''.';
