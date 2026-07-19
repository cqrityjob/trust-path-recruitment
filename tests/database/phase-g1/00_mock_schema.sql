-- =============================================================================
-- Phase G1 local validation — minimal mock schema
--
-- Reconstructs, with synthetic/minimal data only, exactly the pre-existing
-- production objects that supabase/migrations/20260719100000_employer_
-- memberships.sql either depends on (has_role, employers, jobs,
-- job_is_active, set_updated_at, audit_logs) or ALTERs in place (the 8
-- admin-equivalence policies + the 2 public-visibility policies), so that
-- migration file can be applied to this database completely UNMODIFIED —
-- the same file, byte for byte, that lives in supabase/migrations/.
--
-- No real users, employers, jobs, assessment data, emails, or tokens.
-- Every id below is a synthetic UUID; every name is fictional.
-- =============================================================================

-- Supabase-style roles (this local cluster has no Supabase Auth server,
-- so these are plain Postgres roles with the same names, used the same
-- way: RLS policies say "TO authenticated" / "TO anon" / "TO service_role",
-- and a test session does `SET ROLE ...` to switch between them).
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

-- Minimal auth.users — real Supabase Auth owns this table; we only need
-- enough of it to satisfy the FKs this migration and its dependencies use.
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

-- Local stand-in for Supabase's auth.uid(): in production this reads the
-- verified JWT's "sub" claim via a Postgres GUC set by PostgREST per
-- request. Here, a test session simulates "signing in as" a given user by
-- running:  SELECT set_config('request.jwt.claim.sub', '<uuid>', false);
-- before switching role. This is the standard local-RLS-testing pattern.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- -----------------------------------------------------------------------
-- profiles (unaffected by Phase G1 — included only for "simulate profiles"
-- completeness; no test in this suite exercises it beyond existing).
-- -----------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  locale text NOT NULL DEFAULT 'sv',
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------
-- Shared trigger function reused by every timestamped table, exactly as
-- in the real schema.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------
-- Platform roles: app_role enum, user_roles, has_role() — verbatim shape
-- from supabase/migrations/20260716153446_41bff585-....sql.
-- -----------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM (
  'superadmin', 'admin', 'content_editor', 'assessment_editor', 'support'
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- -----------------------------------------------------------------------
-- public.employers — pre-G1 shape (WITHOUT status; the Phase G1 migration
-- adds that column). Verbatim column list from
-- supabase/migrations/20260717113432_d50ef104-....sql.
-- -----------------------------------------------------------------------
CREATE TABLE public.employers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  website text,
  country text,
  description_sv text,
  description_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employers_country_idx ON public.employers (country);
GRANT SELECT ON public.employers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.employers TO authenticated;
GRANT ALL ON public.employers TO service_role;
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER set_employers_updated_at
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.employer_admin_meta (
  employer_id uuid PRIMARY KEY REFERENCES public.employers(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT false,
  verification_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.employer_admin_meta TO service_role;
ALTER TABLE public.employer_admin_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employer_admin_meta_admin_all" ON public.employer_admin_meta
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER set_employer_admin_meta_updated_at
  BEFORE UPDATE ON public.employer_admin_meta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------
-- public.job_is_active() — verbatim predicate from the real migration.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_is_active(
  status text, published_at timestamptz, deadline_at timestamptz, expires_at timestamptz
)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT status = 'published'
    AND published_at IS NOT NULL AND published_at <= now()
    AND (deadline_at IS NULL OR deadline_at > now())
    AND (expires_at IS NULL OR expires_at > now());
$$;

-- -----------------------------------------------------------------------
-- public.jobs — minimal columns: only what job_is_active() and the
-- visibility/admin policies this migration ALTERs actually need.
-- -----------------------------------------------------------------------
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','published','expired','rejected','archived')),
  published_at timestamptz,
  deadline_at timestamptz,
  expires_at timestamptz,
  title_sv text,
  title_en text
);
GRANT SELECT ON public.jobs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_public_active_select" ON public.jobs
  FOR SELECT TO anon, authenticated
  USING (public.job_is_active(status, published_at, deadline_at, expires_at));
CREATE POLICY "jobs_admin_select" ON public.jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "jobs_admin_write" ON public.jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "employers_public_active_select" ON public.employers
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.employer_id = employers.id
      AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
  ));
CREATE POLICY "employers_admin_all" ON public.employers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------
-- job_admin_meta, job_import_sources, job_audit_events — needed only
-- because the Phase G1 migration's section 8 runs ALTER POLICY against
-- named policies on these tables; minimal shape, not exercised further.
-- -----------------------------------------------------------------------
CREATE TABLE public.job_admin_meta (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  moderation_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  imported_at timestamptz,
  duplicate_of uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_admin_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_admin_meta_admin_all" ON public.job_admin_meta
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.job_import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text CHECK (kind IN ('manual','employer','feed')),
  terms_of_use text,
  active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.job_import_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_import_sources_admin_all" ON public.job_import_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "job_import_sources admin read" ON public.job_import_sources
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.job_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  job_slug_snapshot text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_audit_events_admin_select" ON public.job_audit_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------
-- public.audit_logs — the dormant, generic table Phase G1's application
-- code (not this migration) writes organisation/membership events to.
-- Included for completeness / to mirror production exactly; not written
-- to by any SQL in this migration.
-- -----------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  subject_type text,
  subject_id text,
  org_id uuid,
  ip_hash text,
  ua_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
-- Deliberately no policy for anon/authenticated -> effectively deny, same
-- as production.
