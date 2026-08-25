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
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Supabase Auth's own ban column. Stubbed here for the same reason the
  -- Storage tables are: the Admin Control Center's account-disable path is a
  -- write to THIS column, so leaving it out would mean the suite asserted a
  -- disable that never touched anything real.
  banned_until timestamptz,
  last_sign_in_at timestamptz
);

-- Idempotent for a database bootstrapped before these columns existed.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

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


-- ---------------------------------------------------------------------------
-- Storage
--
-- Previously left unstubbed, which meant the two migrations that define
-- Storage RLS were allowlisted as known failures and their policies were
-- never executed, let alone tested. Phase 5 puts a holder's private
-- documents in a bucket, so "the Storage policy is probably fine" stopped
-- being an acceptable position.
--
-- This is the same minimal-stub approach as auth above: enough shape for the
-- real policies to compile and evaluate, and no attempt to reimplement
-- Supabase Storage. What is asserted is the POLICY, which is the part this
-- repository actually authors.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean NOT NULL DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name       text NOT NULL,
  owner      uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);

-- Supabase's own helper: the path segments BEFORE the filename. For
-- `<uid>/<uuid>.pdf` that is `{<uid>}`, which is what every bucket policy in
-- this repository keys on.
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN array_length(string_to_array(name, '/'), 1) <= 1 THEN ARRAY[]::text[]
    ELSE (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  END;
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)];
$$;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Grants mirror Supabase, so RLS is the only thing standing between a role
-- and an object. A test that passed because of a missing GRANT would prove
-- nothing about the policy.
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
