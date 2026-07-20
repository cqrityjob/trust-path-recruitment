-- =============================================================================
-- Phase H3.2.1 local validation — minimal bootstrap.
--
-- Unlike tests/database/phase-g1/00_mock_schema.sql (a synthetic
-- reconstruction used to test one migration file in isolation), this
-- defect-fix pass makes NO schema/RLS changes at all -- the bugs were in
-- application code (server functions using supabaseAdmin where RLS
-- already sufficed; a form submitting non-canonical taxonomy values).
-- Proving the fix is correct means testing against the REAL, FULL,
-- unmodified migration history, not a hand-reconstructed subset.
--
-- This file provides only the handful of primitives a real Supabase
-- project supplies outside of migration control: the `anon` /
-- `authenticated` / `service_role` roles, the `auth` schema, a minimal
-- `auth.users`, and a local stand-in for `auth.uid()` (reads a GUC a test
-- session sets via `set_config('request.jwt.claim.sub', ...)`, mirroring
-- PostgREST's real per-request JWT claim injection). Every real migration
-- file in supabase/migrations/ is then applied afterwards, verbatim and
-- in order, through 20260720064743_h3_2_employer_settings.sql.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Local stand-in for Supabase's auth.uid(): a test session simulates
-- "signing in as" a given user by running
--   SELECT set_config('request.jwt.claim.sub', '<uuid>', false);
-- before switching role -- the standard local-RLS-testing pattern already
-- used by tests/database/phase-g1 and tests/database/phase-h3-2.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
$$;
