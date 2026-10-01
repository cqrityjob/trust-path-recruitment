-- =============================================================================
-- P1 -- only the assignment path may bind an employment record to a person
-- =============================================================================
--
-- THE DEFECT (2026-10-01 pre-release security audit, P1-3, reproduced on a
-- replayed database with production's grants and rolled back):
--
--   scp_resolve_employment_for_assignment(_employer_id, _email, _subject_id)
--   is SECURITY DEFINER and binds an unbound employment record to a person
--   when exactly one active record in that employer carries the email. It
--   trusts every argument: it never asks whether the caller belongs to the
--   employer, nor whether the subject is the caller's. 20260829097000 granted
--   it to `authenticated` so scp_employer_assign could call it -- but a
--   definer function owned by the same role does not need the caller's grant.
--
--   So any signed-in user, with no employer membership at all, could attach
--   another employer's employee record to a person of their choosing.
--   Employer ids are public through job listings; the attacker needs only the
--   employee's email. The binding is permanent by design (it never rebinds),
--   so it also blocks the real employee from ever being linked, and that
--   employer's released results then follow the wrong person.
--
-- THE FIX: the helper is not a client entry point. EXECUTE is revoked from
-- PUBLIC, anon and authenticated; its owner keeps it. Its only callers --
-- scp_employer_assign and scp_employment_from_application -- are SECURITY
-- DEFINER functions owned by the same role, so they keep calling it, after
-- their own membership checks, exactly as before. The function body is not
-- changed. No application code calls it (only the generated types list it).
--
-- HISTORICAL DATA: hosted read-only check on 2026-10-01: 5 employment
-- records, 2 bound, and both are explained by an assignment from their own
-- employer. Nothing is unbound or rebound here.
--
-- Rollback: supabase/rollback/20261231090000_scp_resolve_employment_owner_only_rollback.sql
-- Suite:    supabase/tests/scp_resolve_employment_owner_only_test.sql
-- =============================================================================

-- ── 0. Precondition: every caller can still reach it without the grant ───
DO $$
DECLARE _owner oid; _bad text;
BEGIN
  SELECT proowner INTO _owner FROM pg_proc
   WHERE oid = to_regprocedure('public.scp_resolve_employment_for_assignment(uuid,text,uuid)');
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'SCP_RESOLVE_EMPLOYMENT_PRECONDITION: scp_resolve_employment_for_assignment(uuid,text,uuid) is missing';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname <> 'scp_resolve_employment_for_assignment'
     AND p.prosrc LIKE '%scp_resolve_employment_for_assignment%'
     AND NOT (p.prosecdef AND p.proowner = _owner);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_RESOLVE_EMPLOYMENT_PRECONDITION: % call(s) the helper without running as its owner; revoking the grant would break them', _bad;
  END IF;
END $$;

-- ── 1. Not a client entry point ──────────────────────────────────────────
REVOKE ALL ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid) IS
  'Resolves which employment record an assignment belongs to, once, at assignment '
  'time, and binds it to the subject. Email is a resolution hint for filling a '
  'blank -- never the durable join, and never a way to rebind existing history. '
  'It trusts its arguments, so it is NOT a client entry point: owner-only since '
  '20261231090000, called by scp_employer_assign and '
  'scp_employment_from_application after their own checks.';

-- ── 2. Postflight ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.scp_resolve_employment_for_assignment(uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.scp_resolve_employment_for_assignment(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_RESOLVE_EMPLOYMENT_PROOF: a client role may still execute the binding helper';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_RESOLVE_EMPLOYMENT_PROOF: scp_employer_assign lost its grant';
  END IF;
  RAISE NOTICE 'SCP_RESOLVE_EMPLOYMENT_PROOF ok: the binding helper is owner-only; assignment still reaches it';
END $$;
