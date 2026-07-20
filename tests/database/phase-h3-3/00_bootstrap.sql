-- =============================================================================
-- Phase H3.3 local validation — minimal bootstrap (Platform Admin Employer
-- Moderation). Same method as tests/database/phase-h3-2-1 and
-- phase-h3-2-3: real schema fidelity matters here specifically because
-- this phase's new moderate_employer() RPC and employer_moderation_events
-- RLS must be proven against the actual, current employers/
-- employer_memberships/jobs tables and the actual is_platform_admin()/
-- employer_members_can_edit() helpers -- not a hand-reconstructed subset.
--
-- Same primitives as phase-h3-2-1/-2-3: anon/authenticated/service_role
-- roles, a minimal auth.users, and a local auth.uid() stand-in reading a
-- GUC a test session sets via set_config('request.jwt.claim.sub', ...).
-- Every real migration file in supabase/migrations/ is applied
-- afterwards, verbatim and in order, through this phase's own new
-- 20260720114043_h3_3_platform_admin_employer_moderation.sql.
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
