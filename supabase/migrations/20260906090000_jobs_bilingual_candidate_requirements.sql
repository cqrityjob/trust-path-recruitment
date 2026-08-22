-- "Vad söker ni hos kandidaten?" — candidate requirements, bilingually.
--
-- THE PROBLEM WITH THE COLUMN WE ALREADY HAD.
--
-- public.jobs.requirements is jsonb and monolingual. It holds either a
-- legacy string[] or a bucketed object ({mandatory, preferred, formal,
-- employer_specific}), and it carries no language at all -- see
-- normalizeRequirements() in src/components/jobs/JobAdContent.tsx, which
-- accepts both shapes. There is real data in it: the pilot advertisement
-- seeded by 20260817113707_*.sql stores a Swedish string[]
-- ("Godkänd väktarutbildning (BYA GK1)", "B-körkort", ...).
--
-- Nothing in src/ has ever WRITTEN that column -- the employer form does
-- not offer the field, and the server function's payload schema does not
-- accept it. It is read-only, importer/seed-owned data.
--
-- So exposing it to the employer was never an option: a bilingual product
-- cannot ask an employer to type one requirements text and then show it to
-- both a Swedish and an English candidate.
--
-- THE MODEL CHOSEN.
--
-- requirements_sv / requirements_en text, mirroring title_sv/title_en and
-- description_sv/description_en exactly. The employer-facing question is
-- free prose ("describe the most important requirements, experience or
-- qualities"), which is the same shape as description -- so it gets the
-- same two columns, the same fallback rule, the same progressive-disclosure
-- UX, and no new query, type or renderer concept. A jsonb {sv,en} blob
-- would have been a second, different way to say "bilingual text" in a
-- schema that already has one.
--
-- BACKWARDS COMPATIBILITY: ADDITIVE, NON-DESTRUCTIVE, NO BACKFILL.
--
-- requirements (jsonb) is NOT dropped, NOT rewritten and NOT copied from.
-- Two reasons, both concrete:
--   1. Its language is a convention, not a fact recorded anywhere. Copying
--      it into requirements_sv would be a guess written into the data.
--   2. Its structured shape is a LIST (or four labelled lists). Flattening
--      that into one prose field is lossy in a way no migration can undo.
-- Instead the renderer keeps its legacy path: an advertisement with only
-- the old jsonb renders exactly as it does today, and one with the new
-- prose renders that. Nothing is lost and nothing has to be guessed. See
-- JobAdSections() in src/components/jobs/JobAdContent.tsx.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
-- Plain nullable text, exactly like description_sv/description_en, which
-- carry no length CHECK either (the 20 000-character bound lives in the
-- server function's zod schema, and is mirrored there for these two).

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS requirements_sv text,
  ADD COLUMN IF NOT EXISTS requirements_en text;

COMMENT ON COLUMN public.jobs.requirements_sv IS
  'What the employer is looking for in the candidate, in Swedish. Free '
  'prose, optional, employer-owned. Mirrors description_sv. Never required '
  'for either draft or publication.';

COMMENT ON COLUMN public.jobs.requirements_en IS
  'What the employer is looking for in the candidate, in English. Free '
  'prose, optional, employer-owned. Mirrors description_en. Never required '
  'for either draft or publication.';

COMMENT ON COLUMN public.jobs.requirements IS
  'LEGACY, read-only. Monolingual jsonb: either a string[] or a bucketed '
  'object (mandatory/preferred/formal/employer_specific). Importer- and '
  'seed-owned; no application code writes it. Superseded for employer-'
  'entered adverts by requirements_sv/requirements_en, but deliberately '
  'preserved and still rendered as a fallback so existing advertisements '
  'lose nothing.';

-- ---------------------------------------------------------------------------
-- 2. The two new columns join the archive-immutability list
-- ---------------------------------------------------------------------------
-- jobs_validate_before_write() enforces "only status may change when
-- archiving a published job" by naming every content column explicitly.
-- A column added without being named there becomes a hole in that rule:
-- an employer could rewrite the requirements of a live advertisement in
-- the same statement that closes it. This replaces the function body from
-- 20260814090000_jobs_archive_lifecycle.sql verbatim, with requirements_sv
-- and requirements_en added to that one list. Nothing else changes.

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
          (OLD.status = 'draft'     AND NEW.status = 'archived')   OR
          (OLD.status = 'rejected'  AND NEW.status = 'archived')   OR
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
           -- Added by this migration, for the reason stated above.
           OR NEW.requirements_sv IS DISTINCT FROM OLD.requirements_sv
           OR NEW.requirements_en IS DISTINCT FROM OLD.requirements_en
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
-- 3. In-migration assertions
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='jobs'
                    AND column_name='requirements_sv' AND data_type='text') THEN
    RAISE EXCEPTION 'JOB_REQS: requirements_sv is missing or is not text';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='jobs'
                    AND column_name='requirements_en' AND data_type='text') THEN
    RAISE EXCEPTION 'JOB_REQS: requirements_en is missing or is not text';
  END IF;

  -- The legacy column must still be here. This migration's whole promise is
  -- that no existing advertisement loses its requirements.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='jobs'
                    AND column_name='requirements') THEN
    RAISE EXCEPTION 'JOB_REQS: the legacy requirements column was dropped';
  END IF;

  -- Both new columns must be nullable: an advert without them is normal,
  -- for a draft and for a published advertisement alike.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='jobs'
                AND column_name IN ('requirements_sv','requirements_en')
                AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'JOB_REQS: a new requirements column is NOT NULL; it must be optional';
  END IF;

  -- And the archive-immutability rule must now mention them.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'jobs_validate_before_write'
       AND pronamespace = 'public'::regnamespace
       AND prosrc LIKE '%NEW.requirements_sv IS DISTINCT FROM OLD.requirements_sv%'
  ) THEN
    RAISE EXCEPTION 'JOB_REQS: requirements_sv is not covered by the archive-immutability rule';
  END IF;
END $$;
