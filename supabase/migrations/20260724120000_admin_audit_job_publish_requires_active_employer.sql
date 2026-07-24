-- =============================================================================
-- Admin System Integration Audit — job publish must require an active
-- employer, for EVERY caller including platform admins.
--
-- Gap found: jobs_validate_before_write()'s existing employer-approval
-- gate ("Cannot submit job for review: employer organisation is not yet
-- approved") lives INSIDE the `IF NOT public.is_platform_admin(auth.uid())`
-- block (see 20260720170000_h3_4_job_rejection_note_guard.sql), so it only
-- ever fires for an employer's own self-service submit-for-review call.
-- adminTransitionJob()'s "publish" action (src/lib/job-intelligence/
-- admin.functions.ts) writes status='published' directly through the
-- caller's RLS-scoped client with no employer-status check anywhere in
-- that TS handler either. Net effect confirmed by reading both layers: a
-- platform admin can publish a job belonging to a pending, rejected, or
-- suspended employer. The write succeeds, job_admin_meta records a
-- reviewer, and the admin UI shows a "Published" badge -- but the job
-- stays permanently invisible everywhere else, because
-- jobs_public_active_select (20260719115332) independently requires
-- employer_is_active_status(employer_id) = true. This is exactly the
-- "isolated UI, fake status" failure mode: the admin action appears to
-- succeed while silently disagreeing with the rest of the platform, with
-- no error and no indicator anywhere in /admin/jobs.
--
-- Fix: move the employer-active requirement for status='published' into
-- the ALREADY-unconditional `IF NEW.status = 'published' THEN ... END IF`
-- block that immediately precedes the `IF NOT is_platform_admin(...)`
-- branch -- that block already validates published_at/deadline_at/
-- application_method/expires_at for every caller, admin included, with no
-- exemption; this adds one more universal rule to the same block, not a
-- new conditional. No existing rule in this trigger is altered.
--
-- Additive only. CREATE OR REPLACE preserves the function's OID, owner,
-- and ACL; the pre-existing jobs_validate_before_write_trigger picks up
-- the new body automatically, no DROP/CREATE TRIGGER needed. Rollback:
-- CREATE OR REPLACE jobs_validate_before_write() with the body from
-- 20260720170000_h3_4_job_rejection_note_guard.sql.
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
    -- Admin-audit fix: unconditional (no is_platform_admin exemption,
    -- unlike the submit-for-review check below it belongs next to
    -- conceptually) -- a job can never become 'published' while its
    -- employer is not 'active', regardless of which caller or Postgres
    -- role performs the write. This is the same invariant the employer
    -- self-service path already enforces for 'pending_review'; publish is
    -- the one remaining transition into a status->employer-status
    -- consistency rule that had no check at all.
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
          (OLD.status = 'published' AND NEW.status = 'archived')
        ) THEN
          RAISE EXCEPTION 'Employers cannot change status from % to %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
        END IF;

        -- H3.1: block submission to pending_review until employer is active.
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

COMMENT ON FUNCTION public.jobs_validate_before_write() IS
  'H3.1/H3.4/Admin-audit. Enforces job field/transition invariants. The '
  'published-status block (published_at, deadline_at, application_method, '
  'expires_at, AND (as of the admin audit) employer_is_active) is '
  'unconditional -- applies to every caller, including platform admins. '
  'The employer-approval-required-for-pending_review check and the '
  'employer-exemption block below it are unchanged.';
