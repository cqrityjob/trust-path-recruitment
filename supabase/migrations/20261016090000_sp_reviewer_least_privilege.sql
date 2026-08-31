-- =============================================================================
-- Security Passport — dedicated reviewer capability + privilege minimisation
-- =============================================================================
--
-- Two defects, both found by audit, both reachable without this application.
--
-- (A) ROLE CONFLATION. public.sp_is_verifier() was defined as, literally,
--     `SELECT public.is_platform_admin(_user_id)`. Every Passport reviewer
--     path in the database funnels through that one function -- the queue,
--     the request detail, evidence access, sp_verifier_decide,
--     sp_verifier_revoke and dispute resolution -- so the ONLY way to let
--     somebody review a credential was to make them a platform admin, which
--     also hands them user administration, employer administration, jobs,
--     applications, assessments, audit and the permanent-account-deletion
--     surface. A person hired to check whether a guard licence is genuine
--     had to be given the ability to delete accounts. That is a staffing
--     and separation-of-duties problem, not a theoretical one.
--
--     Fixed by adding ONE value to the existing public.app_role enum
--     (20261015090000) and teaching sp_is_verifier to accept it:
--
--         has_role(user, 'passport_verifier') OR is_platform_admin(user)
--
--     The OR is deliberate and one-directional. A platform admin keeps
--     reviewing exactly as before -- no existing admin loses anything, and
--     no admin has to be re-granted anything. A passport_verifier does NOT
--     become an admin: is_platform_admin() is untouched and still reads
--     admin/superadmin only, so every admin-gated policy, function and route
--     refuses a reviewer exactly as it refuses any other signed-in user.
--
--     No new subsystem. public.user_roles already is the platform's
--     server-side, service-role-managed, RLS-protected role store with
--     granted_at/granted_by columns; a reviewer is one row in it.
--
-- (B) TRUNCATE. This project's hosted database carries
--     `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO
--     anon, authenticated`, so every Passport table arrived with the full
--     privilege set. Six of those seven privileges are bounded by RLS.
--     TRUNCATE IS NOT -- row-level security does not apply to TRUNCATE at
--     all. Verified empirically before this migration, on a disposable
--     replay of the whole migration history with the hosted default
--     privileges applied first (a clean local replay cannot show this,
--     because the migrations that mirror those defaults are timestamped
--     AFTER the Passport tables were created):
--
--         BEGIN; SET LOCAL ROLE authenticated;
--         TRUNCATE public.sp_verification_decisions;   -- TRUNCATE TABLE
--
--     That is the append-only decision log -- the entire immutable record of
--     who verified what, on what evidence, by what method -- emptied by any
--     signed-in user. sp_verification_requests, sp_evidence, sp_claims,
--     sp_experience_periods and every other sp_ table were equally exposed,
--     21 in total, and sp_pilot_members was exposed to anon as well.
--
--     PostgREST never issues TRUNCATE, so this was not reachable through the
--     Data API. It was reachable by anything else holding the authenticated
--     role, and "the current API client happens not to send that verb" is
--     not a boundary.
--
--     Fixed by revoking TRUNCATE, and the equally unnecessary REFERENCES and
--     TRIGGER, from anon and authenticated on the Passport tables. SELECT /
--     INSERT / UPDATE / DELETE are NOT touched by this migration: those are
--     the privileges the product actually uses and they stay exactly as the
--     preceding migrations left them, RLS and column grants included.
--
-- (C) decided_by. See section D below.
--
-- SCOPE. The revoke is deliberately scoped to `sp\_%` -- the Passport
-- domain -- and NOT applied repository-wide, and the ALTER DEFAULT
-- PRIVILEGES statements themselves are deliberately NOT changed. Changing
-- the defaults would silently alter every future table in the schema,
-- including tables owned by domains this PR has not audited. That is a
-- separate, larger decision and is recorded as a deferred finding rather
-- than taken quietly here.
--
-- Rewrites no data. Creates no table and no column. Adds no trust state, no
-- assertion level and no verification method. Touches no RLS policy.
-- =============================================================================

BEGIN;

-- =============================================================================
-- A. sp_is_verifier — dedicated capability OR platform admin
-- =============================================================================
-- Body restated in full rather than patched: this is a SECURITY DEFINER
-- authorization primitive, and CREATE OR REPLACE on one of those is exactly
-- where a grant silently widens.

CREATE OR REPLACE FUNCTION public.sp_is_verifier(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'passport_verifier'::public.app_role)
      OR public.is_platform_admin(_user_id);
$$;

REVOKE ALL ON FUNCTION public.sp_is_verifier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_is_verifier(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.sp_is_verifier IS
  'CQrityjob Passport verification capability. True for a user holding the '
  'dedicated platform role passport_verifier, OR for a platform admin '
  '(backwards compatibility -- admins reviewed Passport requests before the '
  'dedicated role existed and still do). The converse does NOT hold: a '
  'passport_verifier is not a platform admin, is_platform_admin() does not '
  'read this role, and no admin-gated surface accepts it. Still deliberately '
  'narrow: a verifier acts only through the sp_verifier_* functions and has '
  'no blanket read over Passport content.';


-- =============================================================================
-- B. Granting and revoking the capability
-- =============================================================================
-- No new management surface. public.admin_set_platform_role() is already the
-- sole audited path a platform role is granted or revoked through:
-- superadmin-only, self-role-change blocked, one audit_logs row per call,
-- granted_by recorded on the row. It carried a hard allowlist of exactly
-- ('admin','superadmin'); this widens that allowlist by one value and
-- changes nothing else in the function.
--
--   grant:  SELECT public.admin_set_platform_role('<uuid>', 'passport_verifier', true);
--   revoke: SELECT public.admin_set_platform_role('<uuid>', 'passport_verifier', false);
--
-- Revocation is immediate and total: sp_is_verifier() is STABLE, reads
-- user_roles on every call, and every reviewer path re-checks it, so the
-- next queue read and the next decision attempt both refuse. It rewrites no
-- history -- decisions already made keep their decided_by and
-- decider_organisation and remain valid records of what was true when they
-- were made.
--
-- The last-superadmin protection below is untouched and still applies only
-- to 'superadmin'. It is not extended to passport_verifier: a platform with
-- zero reviewers is a staffing state, not a lockout.

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
  IF _role NOT IN ('admin', 'superadmin', 'passport_verifier') THEN
    RAISE EXCEPTION 'Invalid role: %; only admin/superadmin/passport_verifier may be managed through this function', _role;
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

COMMENT ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) IS
  'Superadmin-only. The sole path a user''s admin/superadmin/passport_verifier '
  'platform role can be granted or revoked through. Blocks self-role-change '
  'unconditionally and blocks removing the last remaining superadmin. Inserts '
  'one audit_logs row per call. passport_verifier grants Passport review '
  'capability ONLY -- it confers no admin authorization anywhere.';


-- =============================================================================
-- C. TRUNCATE / REFERENCES / TRIGGER -- revoked across the Passport domain
-- =============================================================================
-- Every table whose name begins `sp_` is Passport-owned. A loop is used
-- rather than 21 hand-written statements so a Passport table added later
-- cannot be missed -- but section E asserts the end state explicitly, so
-- this is not "revoke and hope".
--
-- SELECT, INSERT, UPDATE and DELETE are deliberately NOT in this list. They
-- are the privileges the product actually uses, they are bounded by RLS and
-- by the column grants migration 20261014090000 installed, and touching
-- them here would be a data-access redesign rather than a privilege cleanup.

DO $$
DECLARE
  _t text;
  _n int := 0;
BEGIN
  FOR _t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'sp\_%'
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
      _t
    );
    _n := _n + 1;
  END LOOP;
  RAISE NOTICE 'sp_ tables hardened: %', _n;
END;
$$;



-- -----------------------------------------------------------------------------
-- C2. The append-only guarantee, expressed as a privilege
-- -----------------------------------------------------------------------------
-- The same default privileges left `authenticated` holding table-level
-- UPDATE on both verification tables, and INSERT on the decision log.
--
-- Unlike TRUNCATE these were NOT reachable: RLS does bound INSERT and
-- UPDATE, and neither table carries an UPDATE policy, nor the decision log
-- an INSERT policy, so every such attempt was already refused. They are
-- removed because they are dead weight on the two tables where "append-only,
-- written solely by sp_verifier_decide" is the entire trust guarantee --
-- leaving a privilege whose only defence is the continued absence of a
-- policy makes that guarantee depend on nobody ever adding one.
--
-- Nothing in the repository writes either table directly; every write is a
-- SECURITY DEFINER function running as the owner, and those are unaffected.
-- The holder's column-level INSERT on sp_verification_requests, which
-- migration 20261014090000 shaped deliberately and which policy
-- sp_vr_self_insert backs, is NOT touched.

REVOKE UPDATE         ON public.sp_verification_requests  FROM anon, authenticated;
REVOKE UPDATE, INSERT ON public.sp_verification_decisions FROM anon, authenticated;

-- =============================================================================
-- D. decided_by -- the individual reviewer's user id is internal
-- =============================================================================
-- Migration 20261014090000 replaced table-level SELECT on the two
-- verification tables with explicit column lists, and both lists included
-- `decided_by`. A holder could therefore read the internal database user id
-- of the individual person who judged their credential, simply by asking
-- PostgREST for that column on their own row.
--
-- The candidate's legitimate question is "who verified this?", and the
-- honest answer is organisational: `decider_organisation` on
-- sp_verification_decisions, which stays granted and which is exactly what
-- the candidate-facing panel already renders (VerificationPanel reads
-- `organisation`; nothing candidate-facing in this repository selects
-- decided_by). Naming the individual reviewer to the person whose
-- credential they rejected serves no product purpose.
--
-- The column is NOT dropped and no row is rewritten. The internal audit
-- trail keeps decided_by in full, and the SECURITY DEFINER verifier
-- functions that legitimately read it are unaffected because they run as
-- the owner, not as the caller.

REVOKE SELECT (decided_by) ON public.sp_verification_requests  FROM authenticated;
REVOKE SELECT (decided_by) ON public.sp_verification_decisions FROM authenticated;

COMMENT ON COLUMN public.sp_verification_requests.decided_by IS
  'INTERNAL. The individual reviewer''s user id, retained for audit. Not '
  'granted to authenticated: the holder is told decider_organisation.';
COMMENT ON COLUMN public.sp_verification_decisions.decided_by IS
  'INTERNAL. The individual reviewer''s user id, retained for audit. Not '
  'granted to authenticated: the holder is told decider_organisation.';


-- =============================================================================
-- E. Assert the end state, in the transaction that created it
-- =============================================================================
-- A privilege migration that silently did nothing looks identical to one
-- that worked. These raise rather than return, so a partial application
-- rolls the whole migration back.

DO $$
DECLARE
  _leaked text;
  _missing text;
BEGIN
  -- C1. No sp_ table may leave TRUNCATE/REFERENCES/TRIGGER with anon or authenticated.
  SELECT string_agg(DISTINCT table_name || ':' || grantee || ':' || privilege_type, ', ')
    INTO _leaked
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name LIKE 'sp\_%'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');
  IF _leaked IS NOT NULL THEN
    RAISE EXCEPTION 'PASSPORT_PRIVILEGE_LEAK: %', _leaked;
  END IF;

  -- D1. decided_by must not be readable by authenticated on either table.
  SELECT string_agg(table_name, ', ') INTO _leaked
  FROM information_schema.column_privileges
  WHERE grantee = 'authenticated'
    AND table_schema = 'public'
    AND table_name IN ('sp_verification_requests', 'sp_verification_decisions')
    AND column_name = 'decided_by'
    AND privilege_type = 'SELECT';
  IF _leaked IS NOT NULL THEN
    RAISE EXCEPTION 'PASSPORT_DECIDED_BY_STILL_READABLE: %', _leaked;
  END IF;

  -- D2. ...but the candidate-facing provenance must survive. A cleanup that
  -- took decider_organisation with it would break the product quietly.
  SELECT string_agg(x.col, ', ') INTO _missing
  FROM (VALUES ('decider_organisation'), ('decision'), ('verification_method'), ('decided_at')) AS x(col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'sp_verification_decisions'
      AND column_name = x.col
      AND privilege_type = 'SELECT'
  );
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'PASSPORT_PROVENANCE_LOST: %', _missing;
  END IF;

  -- D3. PR 6's internal-note protection must still hold -- and after C2 the
  -- note is now unreachable to anon/authenticated by EVERY privilege, not
  -- just the SELECT and INSERT that PR 6 closed.
  SELECT string_agg(DISTINCT table_name || ':' || grantee || ':' || privilege_type, ', ')
    INTO _leaked
  FROM information_schema.column_privileges
  WHERE grantee IN ('anon', 'authenticated')
    AND table_schema = 'public'
    AND table_name IN ('sp_verification_requests', 'sp_verification_decisions')
    AND column_name = 'decision_note';
  IF _leaked IS NOT NULL THEN
    RAISE EXCEPTION 'PASSPORT_DECISION_NOTE_REGRESSED: %', _leaked;
  END IF;

  -- A1. The dedicated capability must actually be wired into sp_is_verifier.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sp_is_verifier'
      AND p.prosrc LIKE '%passport_verifier%'
  ) THEN
    RAISE EXCEPTION 'PASSPORT_VERIFIER_ROLE_NOT_WIRED';
  END IF;
END;
$$;

COMMIT;
