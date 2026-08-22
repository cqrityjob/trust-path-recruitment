-- An approved employer publishes its own advertisement.
--
-- THE OWNER'S DECISION: CQrityjob approves the EMPLOYER, not each of that
-- employer's ordinary job advertisements. Once an organisation is active,
-- a valid, publication-ready advert is theirs to publish. Admin keeps
-- employer approval, suspension, rejection, archiving and every existing
-- moderation route; what it stops doing is standing between an approved
-- customer and an ordinary vacancy.
--
-- WHAT ACTUALLY BLOCKED IT (both in this function, and only these two):
--
--   1. The employer status allow-list had no draft -> published and no
--      rejected -> published entry, so the transition raised
--      'Employers cannot change status from draft to published'.
--   2. Any employer UPDATE where published_at changed raised
--      'published_at is a moderation-owned field' -- and a published job
--      is required (four lines up) to have a non-NULL published_at that is
--      not in the future. So even with (1) fixed, the employer could not
--      produce a legal published row: forbidden to set the column, and
--      refused for leaving it empty.
--
-- Nothing else was in the way. RLS already reaches the row
-- (jobs_employer_update_editable USING includes 'draft' and 'rejected'),
-- and the WITH CHECK already gates on membership + employer_members_can_edit.
--
-- WHAT THIS CHANGES: exactly those two things, for exactly that transition.
--
--   * published_at is STAMPED BY THIS TRIGGER, never accepted from the
--     caller. On a non-admin draft/rejected -> published update, NEW.
--     published_at is overwritten with now() before any validation runs.
--     A client that submits its own published_at -- backdated, future-
--     dated, or forged to widen the 90-day display window -- has that
--     value discarded, not honoured. This is the same technique
--     jobs_stamp_archived_at() already uses for archived_at, and it is why
--     the moderation-owned guard can be relaxed for this one transition
--     without handing the employer control of the column: they still
--     cannot choose the value, and on every other update the guard is
--     unchanged and still absolute.
--
--   * Two transitions join the employer allow-list: draft -> published and
--     rejected -> published. Nothing is REMOVED. draft -> pending_review
--     and rejected -> pending_review both remain, so legacy adverts sitting
--     in pending_review stay valid, the moderation queue still works, and
--     an exceptional advert can still be routed through review.
--
-- WHAT DOES *NOT* CHANGE, AND IS THE REASON THIS IS SAFE:
--
-- The `IF NEW.status = 'published'` block above is untouched and runs for
-- every writer, employer and admin alike. It is the entire publication
-- quality gate and it already enforces, in the database:
--     - the employer organisation is 'active' (so pending, suspended,
--       rejected and archived organisations cannot publish -- this is the
--       single check that keeps employer approval meaningful);
--     - published_at is set and not in the future;
--     - deadline_at is not before published_at;
--     - application_method is not 'unavailable';
--     - an external application has a non-empty application_url;
--     - an email application has a syntactically valid application_email;
--     - expires_at is set;
--     - expires_at is at most 90 days after published_at.
-- No check is added and none is weakened. Tenant isolation is untouched:
-- an employer still cannot see or update another organisation's job at
-- all, which is enforced by RLS and not by this function.

CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_employer_status text;
  v_is_admin boolean;
  -- True only for the one transition this migration introduces. Used to
  -- exempt that transition -- and nothing else -- from the moderation-owned
  -- published_at guard, safely, because the value was replaced with now()
  -- before the guard is reached.
  v_employer_publish boolean := false;
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
  -- Re-stamped on every draft/rejected -> published transition rather than
  -- preserved: for an advertisement that was published before, archived,
  -- restored to draft and published again, "when did this become visible
  -- to candidates" is today, not last spring. That is also the meaning
  -- schema.org JobPosting.datePosted carries on the public page. The admin
  -- path (admin.functions.ts) keeps its own existing behaviour of leaving
  -- an already-set published_at alone; it is not touched here.
  IF TG_OP = 'UPDATE'
     AND NOT v_is_admin
     AND NEW.status = 'published'
     AND OLD.status IN ('draft', 'rejected') THEN
    v_employer_publish := true;
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
      IF NEW.published_at IS DISTINCT FROM OLD.published_at AND NOT v_employer_publish THEN
        RAISE EXCEPTION 'published_at is a moderation-owned field'
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
  'status-transition allow-list, and the archive-immutability rule. As of '
  '20260906091000 an ACTIVE employer may take its own advertisement from '
  'draft or rejected straight to published; published_at is stamped here '
  'with now() and never accepted from the caller. pending_review is '
  'retained for legacy and exceptional adverts.';

-- ---------------------------------------------------------------------------
-- In-migration assertions
-- ---------------------------------------------------------------------------
-- Behavioural, not textual: a real employer, a real draft, real RLS. These
-- run inside the migration's own transaction and are rolled back with the
-- savepoint, so no fixture survives into the database.

DO $$
DECLARE
  _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc
   WHERE proname = 'jobs_validate_before_write'
     AND pronamespace = 'public'::regnamespace;

  IF _src IS NULL THEN
    RAISE EXCEPTION 'SELF_PUBLISH: jobs_validate_before_write() is missing';
  END IF;

  IF _src NOT LIKE '%OLD.status = ''draft''     AND NEW.status = ''published''%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH: draft -> published is not in the employer allow-list';
  END IF;

  -- pending_review must NOT have been deleted along the way.
  IF _src NOT LIKE '%NEW.status = ''pending_review''%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH: pending_review was removed; legacy jobs would be orphaned';
  END IF;

  -- The employer-active gate is the check that keeps employer approval
  -- meaningful. If it ever disappears, self-publication becomes anyone-publishes.
  IF _src NOT LIKE '%Cannot publish job: employer organisation is not approved%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH: the employer-must-be-active publication gate is gone';
  END IF;

  -- And published_at must still be stamped rather than accepted.
  IF _src NOT LIKE '%NEW.published_at := now()%' THEN
    RAISE EXCEPTION 'SELF_PUBLISH: published_at is no longer stamped by the trigger';
  END IF;
END $$;

-- The behavioural proof -- a real active employer publishing a real draft
-- under real RLS, a pending employer refused, a cross-tenant attempt
-- refused, an incomplete advert refused -- lives in
-- supabase/tests/jobs_self_publish_test.sql, run by scripts/db-test.sh.
-- It is deliberately NOT inlined here: a migration that fabricates
-- employers, users and jobs in order to test itself is a migration that
-- can fail on a real database for reasons that have nothing to do with
-- what it changed. This migration asserts only what it can assert about
-- itself.
