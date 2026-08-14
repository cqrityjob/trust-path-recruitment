-- Job advertisement archiving.
--
-- Employers could create advertisements and duplicate them, but never put one
-- away. Six drafts had already collected in one test organisation, three of
-- them untitled, with no action available on them at all. Duplicate without
-- archive only makes that worse over time.
--
-- ARCHIVE, NOT DELETE. The owner's decision, and the right one: applications,
-- moderation decisions and audit rows all hang off a job, and a hard delete
-- would take the history with it. Archiving is a status, so everything that
-- ever happened to the advertisement stays exactly where it was.
--
-- ADDITIVE. `archived` was already in the jobs status CHECK and
-- published -> archived was already an allowed employer transition. This
-- migration adds the three transitions that were missing, one column, and the
-- RLS reach to perform them. No column is dropped, no policy is loosened, no
-- row is rewritten.

-- ---------------------------------------------------------------------------
-- 1. When it was archived
-- ---------------------------------------------------------------------------
-- Nullable and never back-filled: rows archived before this migration are
-- honestly unknown rather than silently dated today.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.jobs.archived_at IS
  'When the advertisement was archived. NULL for everything not archived, and '
  'for rows archived before this column existed.';

CREATE INDEX IF NOT EXISTS jobs_employer_status_idx
  ON public.jobs (employer_id, status);

-- ---------------------------------------------------------------------------
-- 2. The transition rules
-- ---------------------------------------------------------------------------

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
    SELECT status INTO v_employer_status FROM public.employers WHERE id = NEW.employer_id;
    IF v_employer_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Cannot publish job: employer organisation is not approved (status=%). Approve the employer first.', v_employer_status
        USING ERRCODE = 'check_violation';
    END IF;

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
          (OLD.status = 'published' AND NEW.status = 'archived')   OR
          -- Archiving, added here. A draft or a rejected advertisement is the
          -- employer's own to put away; published -> archived already existed
          -- and is unchanged. pending_review is deliberately NOT archivable:
          -- it is in a moderator's queue, and letting it vanish underneath
          -- them would be a moderation defect, not a convenience.
          (OLD.status = 'draft'     AND NEW.status = 'archived')   OR
          (OLD.status = 'rejected'  AND NEW.status = 'archived')   OR
          -- Restore returns to draft, never straight back to published. A
          -- restored advertisement re-enters the normal path and must be
          -- submitted for review again, so archiving can never be used to
          -- slip past moderation.
          (OLD.status = 'archived'  AND NEW.status = 'draft')
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
        THEN
          RAISE EXCEPTION 'Only status may change when archiving a published job'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Stamp archived_at, and clear it on restore
-- ---------------------------------------------------------------------------
-- In a trigger rather than in the application, so a restore performed from any
-- caller cannot leave a stale archive date behind.

CREATE OR REPLACE FUNCTION public.jobs_stamp_archived_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'archived' AND (OLD.status IS DISTINCT FROM 'archived') THEN
    NEW.archived_at := now();
  ELSIF NEW.status <> 'archived' AND OLD.status = 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS jobs_stamp_archived_at_trg ON public.jobs;
CREATE TRIGGER jobs_stamp_archived_at_trg
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_stamp_archived_at();

-- ---------------------------------------------------------------------------
-- 4. RLS reach for restore
-- ---------------------------------------------------------------------------
-- The USING clause listed draft, rejected and published, so an archived row
-- was not updatable at all and restore was impossible. WITH CHECK is untouched
-- -- the transition rules above remain the only thing deciding what a status
-- may become, and the public read policy is not modified, so an archived
-- advertisement stops being publicly visible exactly as before.

DROP POLICY IF EXISTS "jobs_employer_update_editable" ON public.jobs;
CREATE POLICY "jobs_employer_update_editable" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
    AND status IN ('draft','rejected','published','archived')
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

-- ---------------------------------------------------------------------------
-- 5. Audit vocabulary
-- ---------------------------------------------------------------------------

ALTER TABLE public.job_audit_events
  DROP CONSTRAINT IF EXISTS job_audit_events_action_check;

DO $$
DECLARE _actions text[];
BEGIN
  SELECT array_agg(DISTINCT action) INTO _actions FROM public.job_audit_events;
  _actions := coalesce(_actions, '{}') || ARRAY[
    'created','updated','submitted','approved','rejected','published',
    'archived','restored','duplicated','expired'
  ];
  EXECUTE format(
    'ALTER TABLE public.job_audit_events ADD CONSTRAINT job_audit_events_action_check '
    'CHECK (action = ANY (%L))', _actions);
END $$;

-- ---------------------------------------------------------------------------
-- 6. In-migration assertions
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='jobs'
                    AND column_name='archived_at') THEN
    RAISE EXCEPTION 'JOBS_ARCHIVE: archived_at was not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='jobs'
                    AND policyname='jobs_employer_update_editable'
                    AND qual LIKE '%archived%') THEN
    RAISE EXCEPTION 'JOBS_ARCHIVE: the update policy cannot reach archived rows';
  END IF;

  -- The public read path must be untouched: an archived advertisement is not
  -- an active one, and job_is_active is what every public surface trusts.
  IF public.job_is_active('archived', now(), NULL, now() + interval '30 days') THEN
    RAISE EXCEPTION 'JOBS_ARCHIVE: an archived advertisement reads as publicly active';
  END IF;
END $$;
