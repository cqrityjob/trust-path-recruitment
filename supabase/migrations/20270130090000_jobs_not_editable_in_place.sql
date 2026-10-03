-- =============================================================================
-- A published (or closed) advertisement is not editable in place
-- =============================================================================
--
-- THE DEFECT (launch-readiness audit of the job board, reproduced on a replayed
-- database as an `authenticated` member with a JWT subject, then rolled back):
--
--   UPDATE public.jobs SET title_sv = 'x', description_sv = 'x',
--          application_method = 'external', application_url = 'javascript:...'
--    WHERE id = <a LIVE job of the caller's organisation>;      -- UPDATE 1
--
--   The same statement on an archived job also succeeded. Any active member of
--   an organisation could rewrite a live advertisement through PostgREST,
--   bypassing saveEmployerJobDraft (which refuses a non-draft with
--   JOB_NOT_EDITABLE and writes the audit row) altogether.
--
-- WHY THE DATABASE ALLOWED IT. The rule existed. 20260720170000 carried
--     ELSIF OLD.status NOT IN ('draft','rejected') THEN
--       RAISE EXCEPTION 'Job is not in an employer-editable state'
--   and, above it, 'A published job cannot be edited in place; close and
--   duplicate it instead'. Both vanished when jobs_validate_before_write() was
--   re-declared from 20260724120000 onward, and nothing replaced them: the RLS
--   update policy (jobs_employer_update_editable) admits published and archived
--   rows, `authenticated` holds UPDATE on every column, and the trigger had no
--   branch for a same-status update of a non-draft row.
--   docs/job-intelligence/jobs-mvp-v1-spec.md says this is "trigger-enforced,
--   not merely a UI restriction" and that a member "cannot edit a published
--   job's content in place".
--
--   pending_review and expired rows are not reachable: the RLS update policy
--   does not admit those statuses, so a member's UPDATE matches 0 rows. The new
--   branch covers them as well, so the rule does not rest on that one policy.
--
-- THE FIX. One new branch in the employer (non-platform-admin) UPDATE path:
-- when the caller is a client role, the row was not draft/rejected and the
-- status is unchanged, nothing but updated_at may differ. The body is otherwise
-- the hosted one (20260906100000, md5 of prosrc 7e7477c391e41071f01e599e90c8e1a5,
-- pinned by the rollback).
--
-- NOT CHANGED. Every transition an employer may make (draft/rejected ->
-- published or pending_review, draft/rejected/published -> archived, archived
-- -> draft); the publication gate; the archive-immutability list; platform
-- admins and the admin moderation path; reject_job() and every other SECURITY
-- DEFINER writer; the RLS policies and grants; any stored row.
--
-- OBSERVED, NOT CHANGED HERE: sweep_expired_jobs() (published -> expired, run by
-- service_role) is refused by the employer allow-list below, before and after
-- this migration -- nothing schedules it, and a published job stops being
-- visible by job_is_active() at expires_at without any status change.
--
-- App order: no application change is needed for this migration, and none
-- depends on it. The application already refuses non-drafts (JOB_NOT_EDITABLE).
-- It can be applied before or after any code deploy.
--
-- Rollback: supabase/rollback/20270130090000_jobs_not_editable_in_place_rollback.sql
-- Suite:    supabase/tests/jobs_not_editable_in_place_test.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_employer_status text;
  v_is_admin boolean;
  -- Set only when THIS trigger stamped published_at a few lines below.
  -- It exempts that one write -- and nothing else -- from the
  -- moderation-owned published_at guard, safely, because the value being
  -- exempted is the one the database just produced itself, never one the
  -- caller sent.
  v_stamped_published_at boolean := false;
BEGIN
  v_is_admin := public.is_platform_admin(auth.uid());

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

  -- ---------------------------------------------------------------------
  -- Employer self-publication: stamp the publication moment.
  -- ---------------------------------------------------------------------
  -- Deliberately placed BEFORE the published-job validation below, so that
  -- block sees the stamped timestamp and applies every one of its rules to
  -- it -- including the 90-day window, which is measured from this exact
  -- value. Placing it after would either bypass those checks or evaluate
  -- them against a value the row never keeps.
  --
  -- Re-stamped on every transition INTO published rather than preserved:
  -- for an advertisement that was published before, archived, restored to
  -- draft and published again, "when did this become visible to candidates"
  -- is today, not last spring. That is also the meaning schema.org
  -- JobPosting.datePosted carries on the public page.
  --
  -- Who this applies to: everyone who does not name a timestamp. A caller
  -- that DOES name one -- which on the admin moderation path means
  -- admin.functions.ts sending published_at explicitly -- fails the last
  -- condition, is not stamped, and keeps the value it chose. A non-admin
  -- that names one is not stamped either, and is then refused outright by
  -- the moderation-owned guard further down. Admin status decides whether
  -- you may SET this column; it no longer decides whether the database
  -- fills it in for you.
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
     AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at THEN
    v_stamped_published_at := true;
    NEW.published_at := now();
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

  IF NOT v_is_admin THEN

    IF TG_OP = 'INSERT' THEN
      -- Unchanged, and load-bearing: an employer still cannot INSERT a row
      -- that is already published. Publication is only ever reachable as a
      -- transition off an existing draft, which is what makes the checks
      -- above unavoidable.
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Employers may only create a job with status=draft'
          USING ERRCODE = 'check_violation';
      END IF;

    ELSIF TG_OP = 'UPDATE' THEN

      IF NEW.employer_id IS DISTINCT FROM OLD.employer_id THEN
        RAISE EXCEPTION 'employer_id cannot be changed'
          USING ERRCODE = 'check_violation';
      END IF;

      -- Unchanged for every write except the self-publication transition,
      -- where the trigger itself has already replaced the value with now()
      -- and whatever the caller sent is gone.
      IF NEW.published_at IS DISTINCT FROM OLD.published_at AND NOT v_stamped_published_at THEN
        RAISE EXCEPTION 'published_at is a moderation-owned field'
          USING ERRCODE = 'check_violation';
      END IF;

      -- NEW (20270130090000). Once a job has left the employer's own hands it is
      -- not editable in place -- whoever the member is and however they reach
      -- the table. 'draft' and 'rejected' are the two states an employer works
      -- on; every other state (pending_review, published, archived, expired) is
      -- the platform's record of what was moderated, shown to candidates or
      -- closed. With the status unchanged, only bookkeeping may differ.
      --
      -- Whole-row, not a column list: a column added to jobs later is protected
      -- the day it is added, and no column can be forgotten the way the
      -- archive-immutability list below forgot salary and the skill ids.
      -- `updated_at` is the one bookkeeping column; set_jobs_updated_at
      -- overwrites it afterwards anyway.
      --
      -- Client roles only. current_user is `authenticated` (or `anon`) for a
      -- direct write through the API and the owner for a SECURITY DEFINER
      -- function, which is how reject_job and every other sanctioned writer
      -- reaches this table -- the same distinction 20270119090000 draws for
      -- Passport entries. Platform admins are outside this block altogether.
      --
      -- Every legitimate move stays a STATUS CHANGE and is judged by the
      -- allow-list below: draft/rejected -> published or pending_review,
      -- draft/rejected/published -> archived, archived -> draft.
      IF current_user IN ('authenticated', 'anon')
         AND OLD.status NOT IN ('draft', 'rejected')
         AND NEW.status IS NOT DISTINCT FROM OLD.status
         AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        RAISE EXCEPTION 'Job is not in an employer-editable state'
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
          -- The two new ones. An active employer publishes its own advert.
          (OLD.status = 'draft'     AND NEW.status = 'published') OR
          (OLD.status = 'rejected'  AND NEW.status = 'published') OR
          -- Kept, deliberately. pending_review is not deleted and not
          -- orphaned: legacy adverts already sitting in it remain valid and
          -- manageable, and the route into it stays open for the
          -- exceptional advert and for any future moderation policy.
          (OLD.status = 'draft'     AND NEW.status = 'pending_review') OR
          (OLD.status = 'rejected'  AND NEW.status = 'pending_review') OR
          (OLD.status = 'published' AND NEW.status = 'archived')   OR
          (OLD.status = 'draft'     AND NEW.status = 'archived')   OR
          (OLD.status = 'rejected'  AND NEW.status = 'archived')   OR
          -- Restore still lands in draft, never straight back in published.
          -- Combined with the new draft -> published above this is no longer
          -- a way around moderation -- there is no moderation to go around
          -- for an active employer -- but it does keep a restored advert
          -- passing the full publication gate again before it goes live.
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

COMMENT ON FUNCTION public.jobs_validate_before_write() IS
  'Job write guard: taxonomy validation, the published-job quality gate '
  '(employer must be active, published_at set and not future, valid '
  'application target, expires_at set and within 90 days), the employer '
  'status-transition allow-list, and the archive-immutability rule. An ACTIVE '
  'employer may take its own advertisement straight to published. '
  'published_at is stamped whenever a write transitions a job INTO published '
  'without supplying one (20260906100000). As of 20270130090000 a client-role '
  'write that leaves the status of a non-draft, non-rejected job unchanged may '
  'change nothing but updated_at: a published or closed advertisement is not '
  'editable in place.';

-- ---------------------------------------------------------------------------
-- In-migration assertions
-- ---------------------------------------------------------------------------

DO $$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc
   WHERE proname = 'jobs_validate_before_write'
     AND pronamespace = 'public'::regnamespace;

  IF _src IS NULL THEN
    RAISE EXCEPTION 'JOBS_NOT_EDITABLE_IN_PLACE: jobs_validate_before_write() is missing';
  END IF;

  IF _src NOT LIKE '%Job is not in an employer-editable state%'
     OR _src NOT LIKE '%(to_jsonb(NEW) - ''updated_at'') IS DISTINCT FROM (to_jsonb(OLD) - ''updated_at'')%'
     OR _src NOT LIKE '%current_user IN (''authenticated'', ''anon'')%' THEN
    RAISE EXCEPTION 'JOBS_NOT_EDITABLE_IN_PLACE: the in-place edit refusal is not in the installed body';
  END IF;

  -- Everything the previous migrations installed must still be here.
  IF _src NOT LIKE '%published_at is a moderation-owned field%'
     OR _src NOT LIKE '%Cannot publish job: employer organisation is not approved%'
     OR _src NOT LIKE '%OLD.status = ''draft''     AND NEW.status = ''published''%'
     OR _src NOT LIKE '%NEW.status = ''pending_review''%'
     OR _src NOT LIKE '%Only status may change when archiving a published job%'
     OR _src NOT LIKE '%NEW.requirements_sv IS DISTINCT FROM OLD.requirements_sv%'
     OR _src NOT LIKE '%NEW.published_at := now()%'
     OR _src NOT LIKE '%jobs.status can only be set to rejected via reject_job()%' THEN
    RAISE EXCEPTION 'JOBS_NOT_EDITABLE_IN_PLACE: an earlier guard left jobs_validate_before_write()';
  END IF;

  RAISE NOTICE 'JOBS_NOT_EDITABLE_IN_PLACE ok: a client-role write cannot edit a non-draft job in place';
END $$;
