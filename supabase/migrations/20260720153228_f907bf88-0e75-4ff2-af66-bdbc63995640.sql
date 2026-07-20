-- =============================================================================
-- H3.4 — job rejection note requirement, enforced at the canonical server
-- boundary AND at the database level.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_employer_status text;
BEGIN
  IF NEW.status = 'rejected' THEN
    IF current_setting('app.job_rejection_in_progress', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'jobs.status can only be set to rejected via reject_job()'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

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
    IF NEW.expires_at IS NULL THEN
      RAISE EXCEPTION 'A published job requires expires_at to be set (JobPosting validThrough)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at > NEW.published_at + INTERVAL '90 days' THEN
      RAISE EXCEPTION 'expires_at cannot be more than 90 days after published_at'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

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

        IF NEW.status = 'pending_review' THEN
          SELECT status INTO v_employer_status FROM public.employers WHERE id = NEW.employer_id;
          IF v_employer_status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'Cannot submit job for review: employer organisation is not yet approved (status=%). Contact CQrityjob support.', v_employer_status
              USING ERRCODE = 'check_violation';
          END IF;
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

COMMENT ON FUNCTION public.jobs_validate_before_write() IS
  'H3.1 + H3.4 database-integrity fix. Adds unconditional rejected-status marker check while preserving all prior rules.';


CREATE OR REPLACE FUNCTION public.reject_job(
  _job_id uuid,
  _note text
)
RETURNS TABLE (
  job_id uuid,
  status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _caller uuid := auth.uid();
  _clean_note text;
  _now timestamptz := now();
  _job public.jobs%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_platform_admin(_caller) THEN
    RAISE EXCEPTION 'Forbidden: platform admin role required';
  END IF;

  _clean_note := NULLIF(btrim(_note), '');
  IF _clean_note IS NULL THEN
    RAISE EXCEPTION 'A non-empty internal note is required to reject a job'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(_clean_note) > 4000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  PERFORM set_config('app.job_rejection_in_progress', 'on', true);

  UPDATE public.jobs
  SET status = 'rejected', updated_at = _now
  WHERE id = _job_id;

  INSERT INTO public.job_admin_meta (
    job_id, reviewed_by, reviewed_at, moderation_notes, updated_by, updated_at
  ) VALUES (
    _job_id, _caller, _now, _clean_note, _caller, _now
  )
  ON CONFLICT (job_id) DO UPDATE SET
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    moderation_notes = EXCLUDED.moderation_notes,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT _job_id, 'rejected'::text, _now;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_job(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reject_job(uuid, text) IS
  'H3.4 integrity fix. The only path a job may be set to status=rejected. Platform-admin-only. Requires a non-empty trimmed internal note.';