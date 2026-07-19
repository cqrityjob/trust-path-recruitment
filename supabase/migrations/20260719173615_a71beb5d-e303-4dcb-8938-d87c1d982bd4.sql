-- =========================================================================
-- Jobs MVP v1 — H1 migration
-- Additive schema + RLS + trigger + maintenance functions.
-- CV storage bucket is created via supabase--storage_create_bucket.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1. jobs — additive columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS salary_min integer,
  ADD COLUMN IF NOT EXISTS salary_max integer,
  ADD COLUMN IF NOT EXISTS salary_currency text,
  ADD COLUMN IF NOT EXISTS salary_period text,
  ADD COLUMN IF NOT EXISTS required_skill_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_skill_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seniority text,
  ADD COLUMN IF NOT EXISTS education_requirements text,
  ADD COLUMN IF NOT EXISTS work_environment text,
  ADD COLUMN IF NOT EXISTS leadership_responsibility boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS mapping_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mapping_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_level text,
  ADD COLUMN IF NOT EXISTS inference_method text,
  ADD COLUMN IF NOT EXISTS model_version text;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_salary_range_check,
  ADD CONSTRAINT jobs_salary_range_check
    CHECK (salary_max IS NULL OR salary_min IS NULL OR salary_max >= salary_min);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_salary_currency_check,
  ADD CONSTRAINT jobs_salary_currency_check
    CHECK (salary_currency IS NULL OR salary_currency IN ('SEK','EUR','USD','GBP','NOK','DKK'));

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_salary_period_check,
  ADD CONSTRAINT jobs_salary_period_check
    CHECK (salary_period IS NULL OR salary_period IN ('hour','month','year'));

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_seniority_check,
  ADD CONSTRAINT jobs_seniority_check
    CHECK (seniority IS NULL OR seniority IN ('entry','mid','senior','lead'));

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_education_requirements_len_check,
  ADD CONSTRAINT jobs_education_requirements_len_check
    CHECK (education_requirements IS NULL OR char_length(education_requirements) <= 1000);

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_work_environment_check,
  ADD CONSTRAINT jobs_work_environment_check
    CHECK (work_environment IS NULL OR work_environment IN ('critical_infrastructure','public_facing','cash_in_transit','office','industrial','other'));

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_source_type_check,
  ADD CONSTRAINT jobs_source_type_check
    CHECK (source_type IS NULL OR source_type IN ('employer_entered','moderator_corrected','imported','ai_suggested'));

-- ---------------------------------------------------------------------------
-- 2. jobs_validate_before_write — trigger extensions (C1, M2, internal unblock)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.family_id IS NOT NULL AND NOT public.assert_cig_family_id(NEW.family_id) THEN
    RAISE EXCEPTION 'Invalid family_id %; must be a canonical Career Family', NEW.family_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.profession_slug IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cig_professions p WHERE p.slug = NEW.profession_slug) THEN
    RAISE EXCEPTION 'Invalid profession_slug %; not found in cig_professions', NEW.profession_slug
      USING ERRCODE = 'check_violation';
  END IF;

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
    -- application_method='internal' is now allowed.
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

    -- M2: expires_at required at publish, bounded to a 90-day maximum period.
    IF NEW.expires_at IS NULL THEN
      RAISE EXCEPTION 'A published job requires expires_at to be set (JobPosting validThrough)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at > NEW.published_at + INTERVAL '90 days' THEN
      RAISE EXCEPTION 'expires_at cannot be more than 90 days after published_at'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- C1: employer self-service transition guard. Platform admins exempt.
  IF NOT public.is_platform_admin(auth.uid()) THEN

    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Employers may only create a job with status=draft'
          USING ERRCODE = 'check_violation';
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN

      IF NEW.employer_id IS DISTINCT FROM OLD.employer_id THEN
        RAISE EXCEPTION 'employer_id cannot be changed'
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
        RAISE EXCEPTION 'published_at is a moderation-owned field'
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
          (OLD.status = 'draft'     AND NEW.status = 'pending_review') OR
          (OLD.status = 'rejected'  AND NEW.status = 'pending_review') OR
          (OLD.status = 'published' AND NEW.status = 'archived')
        ) THEN
          RAISE EXCEPTION 'Employers cannot change status from % to %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      IF OLD.status = 'published' AND NEW.status = 'archived' THEN
        IF NEW.title_sv IS DISTINCT FROM OLD.title_sv
           OR NEW.title_en IS DISTINCT FROM OLD.title_en
           OR NEW.description_sv IS DISTINCT FROM OLD.description_sv
           OR NEW.description_en IS DISTINCT FROM OLD.description_en
           OR NEW.responsibilities IS DISTINCT FROM OLD.responsibilities
           OR NEW.requirements IS DISTINCT FROM OLD.requirements
           OR NEW.benefits IS DISTINCT FROM OLD.benefits
           OR NEW.profession_slug IS DISTINCT FROM OLD.profession_slug
           OR NEW.family_id IS DISTINCT FROM OLD.family_id
           OR NEW.related_profession_slugs IS DISTINCT FROM OLD.related_profession_slugs
           OR NEW.sector IS DISTINCT FROM OLD.sector
           OR NEW.employer_type IS DISTINCT FROM OLD.employer_type
           OR NEW.location_text IS DISTINCT FROM OLD.location_text
           OR NEW.country IS DISTINCT FROM OLD.country
           OR NEW.region IS DISTINCT FROM OLD.region
           OR NEW.city IS DISTINCT FROM OLD.city
           OR NEW.workplace_type IS DISTINCT FROM OLD.workplace_type
           OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
           OR NEW.experience_level IS DISTINCT FROM OLD.experience_level
           OR NEW.language_requirements IS DISTINCT FROM OLD.language_requirements
           OR NEW.travel_required IS DISTINCT FROM OLD.travel_required
           OR NEW.shift_work IS DISTINCT FROM OLD.shift_work
           OR NEW.night_work IS DISTINCT FROM OLD.night_work
           OR NEW.regulated IS DISTINCT FROM OLD.regulated
           OR NEW.formal_requirement_ids IS DISTINCT FROM OLD.formal_requirement_ids
           OR NEW.security_vetting_mentioned IS DISTINCT FROM OLD.security_vetting_mentioned
           OR NEW.driving_licence_required IS DISTINCT FROM OLD.driving_licence_required
           OR NEW.application_method IS DISTINCT FROM OLD.application_method
           OR NEW.application_url IS DISTINCT FROM OLD.application_url
           OR NEW.application_email IS DISTINCT FROM OLD.application_email
           OR NEW.salary_min IS DISTINCT FROM OLD.salary_min
           OR NEW.salary_max IS DISTINCT FROM OLD.salary_max
           OR NEW.salary_currency IS DISTINCT FROM OLD.salary_currency
           OR NEW.salary_period IS DISTINCT FROM OLD.salary_period
           OR NEW.required_skill_ids IS DISTINCT FROM OLD.required_skill_ids
           OR NEW.preferred_skill_ids IS DISTINCT FROM OLD.preferred_skill_ids
           OR NEW.seniority IS DISTINCT FROM OLD.seniority
           OR NEW.education_requirements IS DISTINCT FROM OLD.education_requirements
           OR NEW.work_environment IS DISTINCT FROM OLD.work_environment
           OR NEW.leadership_responsibility IS DISTINCT FROM OLD.leadership_responsibility
           OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
           OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at
        THEN
          RAISE EXCEPTION 'A published job cannot be edited in place; close and duplicate it instead'
            USING ERRCODE = 'check_violation';
        END IF;

      ELSIF OLD.status NOT IN ('draft','rejected') THEN
        RAISE EXCEPTION 'Job is not in an employer-editable state'
          USING ERRCODE = 'check_violation';
      END IF;

    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. jobs — employer-scoped RLS policies (C1)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "jobs_employer_select_own" ON public.jobs;
CREATE POLICY "jobs_employer_select_own" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
  );

DROP POLICY IF EXISTS "jobs_employer_insert_draft" ON public.jobs;
CREATE POLICY "jobs_employer_insert_draft" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
    AND status = 'draft'
  );

DROP POLICY IF EXISTS "jobs_employer_update_editable" ON public.jobs;
CREATE POLICY "jobs_employer_update_editable" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
    AND status IN ('draft','rejected','published')
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
  );

-- ---------------------------------------------------------------------------
-- 4. job_audit_events — action CHECK extension
-- ---------------------------------------------------------------------------
ALTER TABLE public.job_audit_events
  DROP CONSTRAINT IF EXISTS job_audit_events_action_check;

ALTER TABLE public.job_audit_events
  ADD CONSTRAINT job_audit_events_action_check
    CHECK (action IN (
      'created','updated','submitted','published','rejected','expired',
      'archived','duplicate_marked','deleted',
      'changes_requested','resubmitted','closed'
    ));

-- ---------------------------------------------------------------------------
-- 5. job_applications — new table + trigger + RLS (C2 + H5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_applications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id           uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  applicant_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'submitted'
                          CHECK (status IN ('submitted','viewed','withdrawn')),
  phone                 text,
  cover_note            text CHECK (cover_note IS NULL OR char_length(cover_note) <= 1000),
  cv_storage_path       text,
  cv_original_filename  text,
  cv_mime_type          text CHECK (cv_mime_type IS NULL OR cv_mime_type IN (
                          'application/pdf',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        )),
  cv_size_bytes         integer CHECK (cv_size_bytes IS NULL OR cv_size_bytes <= 5242880),
  consent_given_at      timestamptz NOT NULL,
  withdrawn_at          timestamptz,
  employer_note         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, applicant_user_id)
);

CREATE INDEX IF NOT EXISTS job_applications_applicant_created_idx
  ON public.job_applications (applicant_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_applications_employer_job_status_idx
  ON public.job_applications (employer_id, job_id, status);

REVOKE ALL ON public.job_applications FROM anon;
GRANT SELECT, INSERT ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

CREATE OR REPLACE FUNCTION public.job_applications_stamp_employer_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT employer_id INTO NEW.employer_id FROM public.jobs WHERE id = NEW.job_id;
  IF NEW.employer_id IS NULL THEN
    RAISE EXCEPTION 'job_id does not reference an existing job';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_applications_stamp_employer_id_trigger ON public.job_applications;
CREATE TRIGGER job_applications_stamp_employer_id_trigger
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.job_applications_stamp_employer_id();

DROP TRIGGER IF EXISTS job_applications_set_updated_at ON public.job_applications;
CREATE TRIGGER job_applications_set_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_applications_owner_select" ON public.job_applications;
CREATE POLICY "job_applications_owner_select" ON public.job_applications
  FOR SELECT TO authenticated
  USING (applicant_user_id = auth.uid());

DROP POLICY IF EXISTS "job_applications_owner_insert" ON public.job_applications;
CREATE POLICY "job_applications_owner_insert" ON public.job_applications
  FOR INSERT TO authenticated
  WITH CHECK (applicant_user_id = auth.uid());

DROP POLICY IF EXISTS "job_applications_employer_select" ON public.job_applications;
CREATE POLICY "job_applications_employer_select" ON public.job_applications
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_is_active_status(employer_id)
  );

DROP POLICY IF EXISTS "job_applications_admin_select" ON public.job_applications;
CREATE POLICY "job_applications_admin_select" ON public.job_applications
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Intentional: no UPDATE policy for `authenticated`. All updates route
-- through withdraw_my_application() / update_application_as_employer().
DROP POLICY IF EXISTS "job_applications_admin_update" ON public.job_applications;
CREATE POLICY "job_applications_admin_update" ON public.job_applications
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. job_analytics_events — new table + RLS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  text NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_analytics_events_created_idx
  ON public.job_analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS job_analytics_events_user_created_idx
  ON public.job_analytics_events (user_id, created_at DESC);

REVOKE ALL ON public.job_analytics_events FROM anon, authenticated;
GRANT ALL ON public.job_analytics_events TO service_role;

ALTER TABLE public.job_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_analytics_events_admin_select" ON public.job_analytics_events;
CREATE POLICY "job_analytics_events_admin_select" ON public.job_analytics_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. Scheduled maintenance functions (service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_jobs()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  WITH flipped AS (
    UPDATE public.jobs
    SET status = 'expired', updated_at = now()
    WHERE status = 'published' AND expires_at <= now()
    RETURNING id, slug
  )
  INSERT INTO public.job_audit_events (job_id, job_slug_snapshot, actor_id, action, after)
  SELECT id, slug, NULL, 'expired', jsonb_build_object('status', 'expired')
  FROM flipped;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_jobs() TO service_role;

CREATE OR REPLACE FUNCTION public.sweep_application_retention()
RETURNS TABLE(application_id uuid, cv_storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH doomed AS (
    SELECT ja.id AS id, ja.cv_storage_path AS cv_storage_path
    FROM public.job_applications ja
    JOIN public.jobs j ON j.id = ja.job_id
    WHERE
      (j.status IN ('archived','expired') AND j.updated_at <= now() - INTERVAL '12 months')
      OR (ja.status = 'withdrawn' AND ja.withdrawn_at <= now() - INTERVAL '12 months')
  ),
  removed AS (
    DELETE FROM public.job_applications
    WHERE id IN (SELECT id FROM doomed)
    RETURNING id
  )
  SELECT d.id, d.cv_storage_path FROM doomed d
  JOIN removed r ON r.id = d.id;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_application_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_application_retention() TO service_role;

CREATE OR REPLACE FUNCTION public.sweep_analytics_retention()
RETURNS TABLE(deidentified integer, purged integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  n_deid integer;
  n_purge integer;
BEGIN
  UPDATE public.job_analytics_events
  SET user_id = NULL
  WHERE user_id IS NOT NULL AND created_at <= now() - INTERVAL '90 days';
  GET DIAGNOSTICS n_deid = ROW_COUNT;

  DELETE FROM public.job_analytics_events
  WHERE user_id IS NULL AND created_at <= now() - INTERVAL '24 months';
  GET DIAGNOSTICS n_purge = ROW_COUNT;

  RETURN QUERY SELECT n_deid, n_purge;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_analytics_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_analytics_retention() TO service_role;
