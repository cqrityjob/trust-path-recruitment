-- =============================================================================
-- H3.3 — Employer status transition guard (database-integrity hardening).
--
-- Closes the one remaining bypass documented after the H3.3 platform-admin
-- moderation pass and its first integrity fix (commit
-- 253ae47703c108496c1da04a7b26f23ee5c7de07): a genuine platform-admin
-- session could still change employers.status via a raw client-side
-- UPDATE, because employers_admin_all RLS (Phase G1) and
-- employers_validate_before_write() (Phase H3.2) both already exempted
-- is_platform_admin() callers from every write-time check on this table.
-- That exemption is removed here FOR STATUS SPECIFICALLY. The slug
-- exemption for platform admins is untouched -- admins may still fix a
-- slug via adminUpsertEmployer, unaffected by this migration.
--
-- INVARIANT enforced by this migration: an EXISTING employer's status can
-- change ONLY by executing inside moderate_employer() (H3.3's SECURITY
-- DEFINER moderation RPC) -- never by any other caller, INCLUDING a
-- verified platform admin performing a raw table UPDATE, and regardless of
-- which Postgres role performs the write (authenticated OR service_role).
--
-- MECHANISM (Option A -- transaction-local marker) chosen over a column-
-- level GRANT/REVOKE restriction (Option B): moderate_employer() sets a
-- transaction-local session variable (set_config(..., true) -- the third
-- argument makes it local to the current transaction, reverting
-- automatically at COMMIT or ROLLBACK) exactly once, immediately before
-- its own internal UPDATE. The BEFORE UPDATE trigger on employers checks
-- for that exact marker whenever status is changing, and rejects the
-- write if it is absent.
--
-- This marker cannot be set by a client: PostgREST (the layer every
-- supabase-js .from()/.rpc() call goes through) only ever executes the
-- single statement/RPC call requested -- it exposes no way for a client to
-- run an arbitrary SET/set_config call before or alongside their own
-- UPDATE. The only code that can ever set this marker is the SQL inside
-- moderate_employer() itself, deployed and owned at the database level,
-- unreachable from the browser or any TypeScript server function.
--
-- Chosen over a column-level REVOKE/GRANT restriction (Option B) for one
-- concrete reason: a column-level REVOKE on the `authenticated` Postgres
-- role would not protect against a hypothetical direct write performed
-- with the service_role key (GRANT ALL ON employers TO service_role is
-- untouched by revoking a column privilege from `authenticated`) -- and
-- that exact class of mistake (a boundary enforced only for one Postgres
-- role, silently not covering service_role) is the specific failure mode
-- this multi-phase engagement has repeatedly guarded against elsewhere
-- (see admin-employer-moderation.functions.ts's own "never use
-- supabaseAdmin for a read RLS already grants" rule). The trigger-based
-- invariant below is uniform across every Postgres role, including
-- service_role, and is therefore strictly stronger for the same amount of
-- code. It was evaluated and rejected as the *sole* mechanism, not
-- overlooked.
--
-- Additive only. Does NOT edit the already-applied H3.3 migration
-- (20260720114043_h3_3_platform_admin_employer_moderation.sql) or the H3.2
-- employer-settings migration (20260720064743_h3_2_employer_settings.sql)
-- -- both functions below are updated via CREATE OR REPLACE FUNCTION,
-- which preserves each function's OID, owner, and existing ACL. The
-- pre-existing trigger (employers_validate_before_write_trigger, defined
-- once in the H3.2 migration and never redefined here) resolves the
-- replacement function body automatically by that preserved OID -- no
-- DROP/CREATE TRIGGER is needed. The pre-existing EXECUTE grant on
-- moderate_employer() likewise survives the replacement; it is reissued
-- below anyway, explicitly, for auditability.
--
-- Function ownership is unchanged by this migration (CREATE OR REPLACE
-- does not alter the owning role); both functions keep SET search_path =
-- public, exactly as originally defined, so this migration introduces no
-- new search_path-hijack surface.
--
-- ROLLBACK: to revert this migration, CREATE OR REPLACE both functions
-- with their pre-this-migration bodies:
--   - employers_validate_before_write() as defined in
--     20260720064743_h3_2_employer_settings.sql;
--   - moderate_employer() as defined in
--     20260720114043_h3_3_platform_admin_employer_moderation.sql.
-- No table, column, index, or RLS policy was added, dropped, or altered by
-- this migration, so no other rollback step is required.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. employers_validate_before_write() -- add the unconditional status
--    invariant; remove the now-redundant non-admin-only status branch (the
--    new unconditional check is a strict superset of it: it already
--    blocks every non-admin caller, and now also blocks admins). The slug
--    exemption for platform admins is untouched.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employers_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Status invariant (H3.3 database-integrity fix): no caller, of any
  -- role, including a verified platform admin, may change an existing
  -- employer's status except by executing inside moderate_employer(),
  -- which sets this exact transaction-local marker immediately before its
  -- own internal UPDATE. A client can never set this marker itself.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.employer_moderation_in_progress', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'employers.status can only be changed via moderate_employer()'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT public.is_platform_admin(auth.uid()) THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'slug cannot be changed by an employer member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.employers_validate_before_write() IS
  'H3.2 + H3.3 database-integrity fix. Enforces two independent invariants '
  'on every UPDATE to public.employers: (1) status can only change inside '
  'moderate_employer() (checked via an unforgeable transaction-local '
  'marker, for every role, including platform admins and service_role); '
  '(2) slug cannot be changed by a non-admin employer member.';


-- -----------------------------------------------------------------------------
-- 2. moderate_employer() -- identical logic to the original H3.3
--    definition, with exactly one addition: set the transaction-local
--    marker immediately before the employers UPDATE, so the trigger above
--    allows this specific, already-validated, already-audited write
--    through.
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

  -- H3.3 database-integrity fix: the ONLY place in the entire codebase
  -- this marker is ever set. Transaction-local (third argument `true`) --
  -- automatically reverts at the end of this transaction, whether commit
  -- or rollback, so it can never leak into a later, unrelated request.
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);

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
  'H3.3, hardened by the H3.3 database-integrity fix. Platform-admin-only. '
  'Validates a fixed transition allow-list, requires a non-empty note for '
  'rejected/suspended, and atomically updates employers.status + inserts '
  'exactly one employer_moderation_events row. Sets a transaction-local '
  'marker (app.employer_moderation_in_progress) immediately before its own '
  'UPDATE -- the ONLY way employers_validate_before_write() will ever '
  'allow a status change through, for any caller, any role.';
