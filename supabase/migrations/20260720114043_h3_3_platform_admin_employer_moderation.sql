-- =============================================================================
-- Phase H3.3 — Platform Admin Employer Moderation.
--
-- Additive only. No existing table, column, policy, function, or trigger
-- is altered. Ground truth confirmed before writing this file:
--   - is_platform_admin(uuid) already exists (Phase G1) and already
--     exempts platform admins from employers_validate_before_write()'s
--     (Phase H3.2) status/slug guard -- unchanged here.
--   - employers.status already has the full 6-value CHECK constraint
--     ('draft','pending','active','rejected','suspended','archived')
--     (Phase H3.1). No column/constraint change needed.
--   - The existing adminUpsertEmployer() TS server function (Phase B/G1)
--     can already write employers.status via RLS's employers_admin_all
--     policy, but with NO transition validation at all -- that gap is
--     exactly what moderate_employer() below closes for the formal
--     moderation workflow, without touching adminUpsertEmployer() itself
--     (still used for the separate "manually create an employer" tool).
--   - employer_members_can_edit() (Phase H3.1 correction) already returns
--     false for 'suspended' and 'rejected' -- a suspended or rejected
--     employer's members already lose jobs_employer_* draft-write access
--     today, with no change required here. Confirmed, not re-implemented.
--   - The general audit_logs table (Phase A) is service-role-write-only,
--     generic jsonb metadata, and best-effort (no atomicity with any
--     write it accompanies). job_audit_events/job_admin_meta are job-
--     scoped. Per this phase's explicit instruction not to rely on that
--     pattern for moderation decisions, employer_moderation_events below
--     is a new, dedicated, explicitly-columned, admin-only-readable
--     table, written exclusively by one atomic SECURITY DEFINER RPC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. employer_moderation_events — one row per platform-admin moderation
--    decision on an employer's status.
-- -----------------------------------------------------------------------------
CREATE TABLE public.employer_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved', 'rejected', 'suspended', 'reactivated')),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX employer_moderation_events_employer_idx
  ON public.employer_moderation_events (employer_id, created_at DESC);

COMMENT ON TABLE public.employer_moderation_events IS
  'H3.3. One row per platform-admin moderation decision on an employer''s status. '
  'Written exclusively by moderate_employer() (SECURITY DEFINER) -- no direct '
  'INSERT/UPDATE/DELETE grant exists for authenticated. Readable only by platform '
  'admins; never by the employer whose row it describes -- internal notes must '
  'never be employer-visible.';

-- SELECT only for authenticated -- writes happen exclusively inside
-- moderate_employer(), which runs as the (privileged) function owner and
-- therefore bypasses this grant/RLS boundary entirely, exactly like every
-- other SECURITY DEFINER write path already established in this schema
-- (create_my_employer_company, approve_access_request,
-- update_employer_membership).
GRANT SELECT ON public.employer_moderation_events TO authenticated;
GRANT ALL ON public.employer_moderation_events TO service_role;

ALTER TABLE public.employer_moderation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer_moderation_events_admin_select"
  ON public.employer_moderation_events
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));
-- Deliberately no policy for non-admins: an employer member must never be
-- able to read moderation notes about their own organisation, and no
-- INSERT/UPDATE/DELETE policy exists for `authenticated` at all.

-- -----------------------------------------------------------------------------
-- 2. moderate_employer(_employer_id, _action, _note) — the only path an
--    employer's status can change through as part of the formal
--    moderation workflow. Validates a fixed transition allow-list,
--    requires a note for rejection/suspension, and atomically updates
--    employers.status + inserts the audit row: if either the UPDATE or
--    the INSERT fails, the whole function's effects roll back (standard
--    Postgres function-body transactional semantics).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.moderate_employer(
  _employer_id uuid,
  _action text,
  _note text DEFAULT NULL
)
RETURNS TABLE (
  employer_id uuid,
  previous_status text,
  new_status text,
  action text,
  admin_user_id uuid,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _current_status text;
  _expected_previous text;
  _target_status text;
  _clean_note text;
  _event_id uuid;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  IF _action NOT IN ('approved', 'rejected', 'suspended', 'reactivated') THEN
    RAISE EXCEPTION 'Invalid moderation action: %', _action;
  END IF;

  _clean_note := NULLIF(btrim(_note), '');
  IF _action IN ('rejected', 'suspended') AND _clean_note IS NULL THEN
    RAISE EXCEPTION 'A note is required for action %', _action
      USING ERRCODE = 'check_violation';
  END IF;
  IF _clean_note IS NOT NULL AND char_length(_clean_note) > 2000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the row before checking its status, so two concurrent moderation
  -- calls on the same employer can't both read the same "before" state
  -- and both succeed.
  SELECT status INTO _current_status
  FROM public.employers
  WHERE id = _employer_id
  FOR UPDATE;

  IF _current_status IS NULL THEN
    RAISE EXCEPTION 'Employer not found';
  END IF;

  -- Fixed transition allow-list. Every other status value, and every
  -- other requested (from, action) pair, is rejected.
  CASE _action
    WHEN 'approved' THEN
      _expected_previous := 'pending';
      _target_status := 'active';
    WHEN 'rejected' THEN
      _expected_previous := 'pending';
      _target_status := 'rejected';
    WHEN 'suspended' THEN
      _expected_previous := 'active';
      _target_status := 'suspended';
    WHEN 'reactivated' THEN
      _expected_previous := 'suspended';
      _target_status := 'active';
  END CASE;

  IF _current_status <> _expected_previous THEN
    RAISE EXCEPTION 'Invalid transition: employer status is %, action % requires %',
      _current_status, _action, _expected_previous
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.employers
  SET status = _target_status, updated_at = _now
  WHERE id = _employer_id;

  INSERT INTO public.employer_moderation_events (
    employer_id, action, previous_status, new_status, admin_user_id, note, created_at
  ) VALUES (
    _employer_id, _action, _current_status, _target_status, _caller, _clean_note, _now
  )
  RETURNING id INTO _event_id;

  RETURN QUERY
    SELECT e.employer_id, e.previous_status, e.new_status, e.action, e.admin_user_id, e.note, e.created_at
    FROM public.employer_moderation_events e
    WHERE e.id = _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_employer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_employer(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.moderate_employer(uuid, text, text) IS
  'H3.3. Platform-admin-only. Validates a fixed transition allow-list '
  '(pending->active via "approved", pending->rejected via "rejected", '
  'active->suspended via "suspended", suspended->active via "reactivated"), '
  'requires a non-empty note for rejected/suspended, and atomically updates '
  'employers.status + inserts exactly one employer_moderation_events row. '
  'Never trusts a client-supplied admin id -- auth.uid() only, verified via '
  'is_platform_admin(). Row-locked (FOR UPDATE) to prevent a concurrent '
  'double-moderation race on the same employer.';
