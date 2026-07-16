
-- ============================================================
-- Sprint 08 — Infrastructure Foundation
-- ============================================================

-- Shared updated_at trigger
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

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  locale TEXT NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv','en')),
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a profile row on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, locale)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'locale', 'sv')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- user_roles (platform-level roles; org roles come later)
-- ------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM (
  'superadmin',
  'admin',
  'content_editor',
  'assessment_editor',
  'support'
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, role)
);

-- Auth-only; no anon access. Reads via has_role() SECURITY DEFINER.
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users may see their own role assignments; role management is service-role only.
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Secure role check (SECURITY DEFINER, avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, anon;

-- ------------------------------------------------------------
-- consent_records
-- ------------------------------------------------------------
CREATE TABLE public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX consent_records_user_purpose_idx
  ON public.consent_records (user_id, purpose);

GRANT SELECT, INSERT, UPDATE ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_self_select" ON public.consent_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "consent_self_insert" ON public.consent_records
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Only the "revoked_at" transition is meaningful for updates; keep it self-scoped.
CREATE POLICY "consent_self_revoke" ON public.consent_records
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- audit_logs (append-only; no direct client access)
-- ------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  org_id UUID,
  ip_hash TEXT,
  ua_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_at_idx ON public.audit_logs (actor_id, at DESC);
CREATE INDEX audit_logs_subject_idx ON public.audit_logs (subject_type, subject_id);

-- Deliberately NO grants to anon/authenticated. Only service_role writes/reads.
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated -> effectively deny.

-- ------------------------------------------------------------
-- assessments + assessment_versions
-- ------------------------------------------------------------
CREATE TABLE public.assessments (
  id TEXT PRIMARY KEY,               -- e.g. 'security_career_guidance'
  name_sv TEXT NOT NULL,
  name_en TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('career_guidance','professional')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public read: catalog is not sensitive.
GRANT SELECT ON public.assessments TO anon, authenticated;
GRANT ALL ON public.assessments TO service_role;

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessments_public_read" ON public.assessments
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "assessments_admin_write" ON public.assessments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'assessment_editor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'assessment_editor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE TABLE public.assessment_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id TEXT NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  disclaimer_version TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (assessment_id, model_version, disclaimer_version)
);

CREATE INDEX assessment_versions_assessment_idx
  ON public.assessment_versions (assessment_id, published_at DESC);

GRANT SELECT ON public.assessment_versions TO anon, authenticated;
GRANT ALL ON public.assessment_versions TO service_role;

ALTER TABLE public.assessment_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessment_versions_public_read" ON public.assessment_versions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "assessment_versions_admin_write" ON public.assessment_versions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'assessment_editor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'assessment_editor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

-- Seed the current career guidance assessment + its version
INSERT INTO public.assessments (id, name_sv, name_en, kind)
VALUES ('security_career_guidance', 'Karriärvägledningstest inom säkerhet', 'Security Career Guidance Assessment', 'career_guidance');

INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, notes)
VALUES ('security_career_guidance', '2026.07-06A.1', '2026.07-06B.1', 'Initial seeded version matching src/lib/career-assessment MODEL_VERSION / DISCLAIMER_VERSION');
