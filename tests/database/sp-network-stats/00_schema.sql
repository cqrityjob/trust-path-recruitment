-- Minimal stand-in for the slice of the schema sp_network_stats() reads.
-- The column names, constraints and the PRIMARY KEY on holder_user_id are the
-- production definitions (20260817090000, 20260908093000); everything the
-- function does not touch is omitted. The hosted project's default privileges
-- (SELECT on new tables to the client roles) are reproduced on purpose, so the
-- migration's explicit REVOKEs are what is being tested.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT anon, authenticated, service_role TO CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TYPE public.app_role AS ENUM ('superadmin','admin','content_editor','assessment_editor','support','passport_verifier');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL, UNIQUE (user_id, role));
CREATE FUNCTION public.is_platform_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','superadmin')) $$;

CREATE TABLE public.sp_passport_profiles (
  holder_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text, jurisdiction_code text,
  onboarding_state text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_state IN ('not_started','in_progress','completed')),
  declared_accurate_at timestamptz,
  work_location_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sp_profile_completed_has_declaration CHECK (onboarding_state <> 'completed' OR declared_accurate_at IS NOT NULL));
ALTER TABLE public.sp_passport_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_profiles_self_select ON public.sp_passport_profiles FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
REVOKE ALL ON public.sp_passport_profiles FROM anon;

CREATE TABLE public.sp_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('draft','active','expired','revoked','superseded','disputed','withdrawn')));
ALTER TABLE public.sp_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_claims_self_select ON public.sp_claims FOR SELECT TO authenticated USING (holder_user_id = auth.uid());
REVOKE ALL ON public.sp_claims FROM anon;
