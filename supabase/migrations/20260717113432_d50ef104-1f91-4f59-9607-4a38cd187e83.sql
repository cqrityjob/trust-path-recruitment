
-- =============================================================================
-- Phase A — Job Intelligence Foundation
-- =============================================================================
-- No seed rows for employers/jobs. Only job_import_sources reference rows.
-- Dev seed data lives in supabase/seeds/phase_a_dev_seed.sql (manual apply only).

-- -----------------------------------------------------------------------------
-- 1. Reference table: job_import_sources
-- -----------------------------------------------------------------------------
CREATE TABLE public.job_import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('manual','employer','feed')),
  terms_of_use text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_import_sources TO authenticated;
GRANT ALL ON public.job_import_sources TO service_role;

ALTER TABLE public.job_import_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_import_sources_admin_all"
  ON public.job_import_sources FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "job_import_sources_authenticated_read"
  ON public.job_import_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER set_job_import_sources_updated_at
  BEFORE UPDATE ON public.job_import_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reference rows (v1 uses only manual + employer_submission)
INSERT INTO public.job_import_sources (name, kind, terms_of_use, active) VALUES
  ('manual', 'manual',
   'Jobs created directly by CQrityjob administrators. Lawful basis: internal operations.',
   true),
  ('employer_submission', 'employer',
   'Jobs submitted by employers and moderated by CQrityjob administrators. Lawful basis: contract / legitimate interest with employer consent.',
   true);

-- -----------------------------------------------------------------------------
-- 2. employers (public row)
-- -----------------------------------------------------------------------------
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
GRANT INSERT, UPDATE, DELETE ON public.employers TO authenticated; -- admin-gated by policy
GRANT ALL ON public.employers TO service_role;

ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_employers_updated_at
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. employer_admin_meta (admin-only sibling)
-- -----------------------------------------------------------------------------
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
-- No anon/authenticated grants: admins reach this table via service_role helpers.

ALTER TABLE public.employer_admin_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer_admin_meta_admin_all"
  ON public.employer_admin_meta FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_employer_admin_meta_updated_at
  BEFORE UPDATE ON public.employer_admin_meta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Active-job predicate (used by RLS on jobs and employers)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_is_active(
  p_status text,
  p_published_at timestamptz,
  p_deadline_at timestamptz,
  p_expires_at timestamptz
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_status = 'published'
     AND p_published_at IS NOT NULL AND p_published_at <= now()
     AND (p_deadline_at IS NULL OR p_deadline_at > now())
     AND (p_expires_at  IS NULL OR p_expires_at  > now());
$$;

-- -----------------------------------------------------------------------------
-- 5. CIG taxonomy validators (family whitelist + profession slug existence)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_cig_family_id(p_family_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Canonical 13 Career Families, mirroring src/lib/career-center/profession-families.ts
  SELECT p_family_id IN (
    'exploring',
    'guarding',
    'police_public',
    'defence_protective',
    'corporate',
    'physical_technical',
    'risk_crisis',
    'investigations_intel',
    'financial_crime',
    'critical_infra',
    'cyber_infosec',
    'consulting_specialist'
  );
$$;

-- -----------------------------------------------------------------------------
-- 6. jobs (public row)
-- -----------------------------------------------------------------------------
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  short_id text NOT NULL UNIQUE,

  source_id uuid REFERENCES public.job_import_sources(id),
  source_job_id text,
  source_url text,
  canonical_url text,

  employer_id uuid NOT NULL REFERENCES public.employers(id),

  -- Classification (CIG-backed)
  profession_slug text REFERENCES public.cig_professions(slug),
  family_id text,
  related_profession_slugs text[] NOT NULL DEFAULT '{}',
  sector text,
  employer_type text,

  -- Presentation
  title_sv text,
  title_en text,
  description_sv text,
  description_en text,
  responsibilities jsonb,
  requirements jsonb,
  benefits jsonb,

  -- Work context
  location_text text,
  country text,
  region text,
  city text,
  workplace_type text CHECK (workplace_type IN ('remote','hybrid','onsite')),
  employment_type text,
  experience_level text,
  language_requirements text[] NOT NULL DEFAULT '{}',
  travel_required boolean,
  shift_work boolean,
  night_work boolean,

  -- Formal / regulated
  regulated boolean NOT NULL DEFAULT false,
  formal_requirement_ids text[] NOT NULL DEFAULT '{}',
  security_vetting_mentioned boolean NOT NULL DEFAULT false,
  driving_licence_required boolean NOT NULL DEFAULT false,

  -- Application
  application_method text NOT NULL
    CHECK (application_method IN ('external','email','internal','unavailable')),
  application_url text,
  application_email text,

  -- Lifecycle
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','published','expired','rejected','archived')),
  published_at timestamptz,
  deadline_at timestamptz,
  expires_at timestamptz,

  -- Dedupe
  content_hash text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX jobs_status_published_idx  ON public.jobs (status, published_at DESC);
CREATE INDEX jobs_family_status_idx     ON public.jobs (family_id, status);
CREATE INDEX jobs_profession_status_idx ON public.jobs (profession_slug, status);
CREATE INDEX jobs_country_region_idx    ON public.jobs (country, region, status);
CREATE INDEX jobs_content_hash_idx      ON public.jobs (content_hash);
CREATE INDEX jobs_text_search_idx ON public.jobs USING GIN (
  to_tsvector('simple',
    COALESCE(title_sv,'') || ' ' ||
    COALESCE(title_en,'') || ' ' ||
    COALESCE(description_sv,'') || ' ' ||
    COALESCE(description_en,'')
  )
);

GRANT SELECT ON public.jobs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.jobs TO authenticated; -- admin-gated by policy
GRANT ALL ON public.jobs TO service_role;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CIG taxonomy + published-path validation trigger
CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Family whitelist
  IF NEW.family_id IS NOT NULL AND NOT public.assert_cig_family_id(NEW.family_id) THEN
    RAISE EXCEPTION 'Invalid family_id %; must be a canonical Career Family', NEW.family_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Profession slug existence (FK also enforces this; trigger provides a clearer message)
  IF NEW.profession_slug IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cig_professions p WHERE p.slug = NEW.profession_slug) THEN
    RAISE EXCEPTION 'Invalid profession_slug %; not found in cig_professions', NEW.profession_slug
      USING ERRCODE = 'check_violation';
  END IF;

  -- Published-status application-path rules
  IF NEW.status = 'published' THEN
    IF NEW.published_at IS NULL OR NEW.published_at > now() THEN
      RAISE EXCEPTION 'A published job requires published_at set to a past or current timestamp'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.deadline_at IS NOT NULL AND NEW.deadline_at < NEW.published_at THEN
      RAISE EXCEPTION 'deadline_at must be on or after published_at'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.application_method = 'unavailable' THEN
      RAISE EXCEPTION 'A published job cannot have application_method=unavailable'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.application_method = 'internal' THEN
      RAISE EXCEPTION 'application_method=internal is not supported in v1'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.application_method = 'external'
       AND (NEW.application_url IS NULL OR btrim(NEW.application_url) = '') THEN
      RAISE EXCEPTION 'Published external job requires a non-empty application_url'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.application_method = 'email'
       AND (NEW.application_email IS NULL OR NEW.application_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      RAISE EXCEPTION 'Published email job requires a valid application_email'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_validate_before_write_tg
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_validate_before_write();

-- Jobs RLS
CREATE POLICY "jobs_public_active_select"
  ON public.jobs FOR SELECT
  TO anon, authenticated
  USING (public.job_is_active(status, published_at, deadline_at, expires_at));

CREATE POLICY "jobs_admin_select"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "jobs_admin_write"
  ON public.jobs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Employers RLS: an employer is publicly readable only when it has at least
-- one active job. Same predicate as jobs to keep the read model coherent.
CREATE POLICY "employers_public_active_select"
  ON public.employers FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.employer_id = employers.id
      AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
  ));

CREATE POLICY "employers_admin_all"
  ON public.employers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- 7. job_admin_meta (admin-only sibling)
-- -----------------------------------------------------------------------------
CREATE TABLE public.job_admin_meta (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  moderation_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz,
  duplicate_of uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.job_admin_meta TO service_role;
-- No anon/authenticated grants.

ALTER TABLE public.job_admin_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_admin_meta_admin_all"
  ON public.job_admin_meta FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_job_admin_meta_updated_at
  BEFORE UPDATE ON public.job_admin_meta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. saved_jobs
-- -----------------------------------------------------------------------------
CREATE TABLE public.saved_jobs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX saved_jobs_user_saved_at_idx ON public.saved_jobs (user_id, saved_at DESC);

GRANT SELECT, INSERT, DELETE ON public.saved_jobs TO authenticated;
GRANT ALL ON public.saved_jobs TO service_role;

ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_jobs_owner_select"
  ON public.saved_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "saved_jobs_owner_insert"
  ON public.saved_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_jobs_owner_delete"
  ON public.saved_jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 9. job_audit_events (audit-safe: no FK to jobs, survives deletion)
-- -----------------------------------------------------------------------------
CREATE TABLE public.job_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid, -- deliberately no FK: audit survives job deletion
  job_slug_snapshot text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'created','updated','submitted','published','rejected',
    'expired','archived','duplicate_marked','deleted'
  )),
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_audit_events_job_id_created_at_idx
  ON public.job_audit_events (job_id, created_at DESC);

GRANT SELECT ON public.job_audit_events TO authenticated; -- admin-gated by policy
GRANT ALL ON public.job_audit_events TO service_role;

ALTER TABLE public.job_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_audit_events_admin_select"
  ON public.job_audit_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies: writes go through service_role (server
-- functions) or a future SECURITY DEFINER trigger.
