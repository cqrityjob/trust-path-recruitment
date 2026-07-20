-- =============================================================================
-- Phase H3.2.3 local validation — minimal bootstrap (employer-jobs error
-- sanitization round). Identical in method to
-- tests/database/phase-h3-2-1/00_bootstrap.sql: this round makes NO
-- schema/RLS change either (the fix is a pure TS-layer error-message
-- sanitization in employer-jobs.functions.ts) -- proving the fix is safe
-- means proving the underlying jobs_employer_* RLS + jobs_validate_
-- before_write() trigger behaviour employer-jobs.functions.ts relies on
-- is unchanged, and confirming the Postgres SQLSTATE the new
-- sanitizeJobWriteError() helper switches on (23514, check_violation) is
-- really what both a genuine CHECK constraint and the trigger's own
-- RAISE EXCEPTION ... USING ERRCODE = 'check_violation' guards produce.
--
-- Same primitives as phase-h3-2-1: anon/authenticated/service_role roles,
-- a minimal auth.users, and a local auth.uid() stand-in reading a GUC a
-- test session sets via set_config('request.jwt.claim.sub', ...). Every
-- real migration file in supabase/migrations/ is applied afterwards,
-- verbatim and in order.
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
