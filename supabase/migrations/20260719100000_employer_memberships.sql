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
