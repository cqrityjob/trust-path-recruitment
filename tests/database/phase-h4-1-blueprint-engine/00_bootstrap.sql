-- =============================================================================
-- Phase H3.4 job-rejection-note-guard local validation — minimal
-- bootstrap. Same method as every prior phase: real schema fidelity
-- matters because this fix's new reject_job() RPC and the extended
-- jobs_validate_before_write() trigger must be proven against the
-- actual, current jobs/job_admin_meta tables and the actual
-- is_platform_admin() helper, not a hand-reconstructed subset.
--
-- Same primitives as every prior phase: anon/authenticated/service_role
-- roles, a minimal auth.users, and a local auth.uid() stand-in reading a
-- GUC a test session sets via set_config('request.jwt.claim.sub', ...).
-- Every real migration file in supabase/migrations/ is applied
-- afterwards, verbatim and in order, through this fix's own new
-- 20260720170000_h3_4_job_rejection_note_guard.sql.
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
