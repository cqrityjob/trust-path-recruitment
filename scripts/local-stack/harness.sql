-- The LOCAL routed-evidence harness: the parts of a Supabase stack that the
-- browser walk needs and that supabase/tests/00_bootstrap.sql deliberately
-- does not stub, because the SQL suite never speaks HTTP.
--
-- It is applied ONLY to a disposable local database, after the full migration
-- history has been replayed. It adds no product behaviour, no policy and no
-- grant: everything it touches lives in the `auth` schema, which this
-- repository does not own.
--
-- WHY IT EXISTS: `supabase start` pulls its container images from Docker Hub,
-- public.ecr.aws and ghcr.io. In the environment this evidence was captured
-- in, the network policy answers 403 to those registries' blob CDNs, so no
-- Supabase image can be fetched at all. Rather than drop the routed walk, the
-- stack is assembled from the parts that ARE reachable: a real PostgreSQL 16
-- with the real migration history, the real PostgREST enforcing the real RLS,
-- and a local token endpoint standing in for GoTrue. See README.md for
-- exactly which parts are real and which are substituted.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() NOT IN ('beskt_e2e', 'postgres', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'BCP_HARNESS_WRONG_DATABASE: this harness rewrites auth helper functions and runs only against a disposable local database (got "%").',
      current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · auth.uid(), auth.role() and auth.jwt() as PRODUCTION defines them.
--
-- The SQL harness reads `request.jwt.claim.sub`, which a test sets directly
-- with set_config. PostgREST sets no such GUC: it sets `request.jwt.claims`,
-- the whole verified claim set as JSON. These bodies are Supabase's own, so
-- the walk's RLS decisions are made from the same input production makes them
-- from -- and the SQL suite's set_config path keeps working unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- ---------------------------------------------------------------------------
-- 2 · The GoTrue columns a password sign-in needs.
--
-- Added here rather than in the fixture, so that the SAME fixture text runs
-- unchanged against a real `supabase start` stack, where auth.users already
-- has every one of them.
-- ---------------------------------------------------------------------------
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS instance_id uuid;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS aud text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS confirmation_token text DEFAULT '';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_token text DEFAULT '';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_new text DEFAULT '';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change text DEFAULT '';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_current text DEFAULT '';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_change text DEFAULT '';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_change_token text DEFAULT '';
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS reauthentication_token text DEFAULT '';

-- ---------------------------------------------------------------------------
-- 3 · The role PostgREST connects as.
--
-- `authenticator` is created NOLOGIN-adjacent by the bootstrap (LOGIN, no
-- password). PostgREST authenticates with a password over TCP, so it gets
-- one here -- and NOT the privilege to do anything itself: it inherits
-- nothing and can only SET ROLE to anon / authenticated / service_role, which
-- is exactly the production arrangement.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('ALTER ROLE authenticator LOGIN NOINHERIT PASSWORD %L',
                 current_setting('bcp.authenticator_password', true));
END $$;

GRANT USAGE ON SCHEMA public TO authenticator;

COMMIT;

SELECT 'harness applied: auth.uid() reads request.jwt.claims, '
       || (SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'auth' AND table_name = 'users')
       || ' auth.users column(s)' AS status;
