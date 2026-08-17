-- =============================================================================
-- Security Passport — Phase 7b: close an inherited anon EXECUTE grant
--
-- ── HOW IT GOT THERE ─────────────────────────────────────────────────────
--
-- Hosted Supabase projects carry
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
--
-- so EVERY function created in `public` is granted to anon the moment it
-- exists. Every Passport RPC therefore ends with an explicit REVOKE — except
-- `sp_claims_credential_rules`, the Phase 6 trigger function, which was
-- created without one because a trigger function is not something a caller
-- was ever meant to invoke.
--
-- The result, observed on the hosted project immediately after Phase 6 was
-- applied: `anon` held EXECUTE on one `sp_*` function, breaking the invariant
-- that Phase 5 and Phase 7 both assert — "anon can execute NO sp_* function
-- at all".
--
-- ── WHY THE TEST SUITE DID NOT CATCH IT ──────────────────────────────────
--
-- A clean local replay has no such default privileges: `00_bootstrap.sql`
-- creates the roles but not Supabase's ALTER DEFAULT PRIVILEGES, so a new
-- function is granted to PUBLIC only and the anon-grant query returns zero.
-- The suite was asking the right question of a database that could not answer
-- it. This migration therefore ALSO recreates the condition locally, so the
-- existing assertions become meaningful on both.
--
-- ── WHAT THE ACTUAL RISK WAS ─────────────────────────────────────────────
--
-- Small, and worth stating precisely rather than overselling: PostgreSQL
-- refuses to execute a `RETURNS trigger` function outside a trigger context
-- ("trigger functions can only be called as triggers"), so anon could not
-- have run it usefully. What it did break is the invariant itself — the thing
-- that makes "anon executes nothing here" checkable rather than aspirational.
-- =============================================================================

REVOKE ALL ON FUNCTION public.sp_claims_credential_rules() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sp_claims_credential_rules IS
  'Enforces the taxonomy rules on every claim write, for every caller '
  'including service_role. Drafts are exempt so a half-filled form can be '
  'saved; the rules bind the moment the claim is no longer a draft. '
  'EXECUTE is revoked from anon/authenticated/PUBLIC: it runs as a trigger, '
  'never as a call.';

-- ---------------------------------------------------------------------------
-- Make the local replay behave like the hosted project.
--
-- Without this, the anon-grant assertions in Phase 5 and Phase 7 pass locally
-- for the wrong reason. With it, any future Passport function that forgets its
-- REVOKE fails the suite on a developer's machine and in CI, which is where a
-- grant like this should be caught.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon';
  END IF;
END $$;
