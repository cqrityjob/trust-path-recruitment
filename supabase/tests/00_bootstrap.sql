-- Disposable-Postgres bootstrap for migration replay and database tests.
--
-- Provides the minimum Supabase-managed surface that this repository's real
-- migrations depend on, so the full migration history can be replayed against
-- a plain PostgreSQL instance in CI or locally. It is a TEST HARNESS ONLY --
-- it is never applied to any real environment, and it deliberately does not
-- attempt to reproduce Supabase's auth, storage or realtime implementations.
--
-- Anything added here must be the minimum needed to make a real migration
-- run. If a test needs richer behaviour, the test should set it up itself.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The three PostgREST roles every migration's GRANT/RLS clauses reference.
-- service_role carries BYPASSRLS to match Supabase, which is precisely why
-- the SCP immutability guards are triggers rather than RLS policies: a
-- trigger still fires for a BYPASSRLS caller.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- auth.uid() resolves from a transaction-local setting, so a test can act as
-- a specific user with SET LOCAL and have RLS evaluate exactly as it would
-- against a real JWT.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO anon, authenticated, service_role;
