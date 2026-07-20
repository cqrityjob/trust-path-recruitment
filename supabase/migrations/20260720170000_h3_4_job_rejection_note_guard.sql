-- =============================================================================
-- H3.4 — job rejection note requirement, enforced at the canonical server
-- boundary AND at the database level.
--
-- Gap found during Lovable Cloud verification: "admin cannot reject a job
-- without a non-empty internal moderation note" was enforced only by a
-- zod .refine() inside adminTransitionJob() (application layer) and by a
-- client-side guard in the admin job editor.
--
-- Ground truth confirmed before writing this migration:
--   - `jobs_admin_write` RLS (Phase A, unchanged) is `FOR ALL TO
--     authenticated USING (has_role(auth.uid(), 'admin'))` -- a genuine
--     platform admin session can already perform a raw
--     `UPDATE public.jobs SET status = 'rejected' ...` directly (via
--     supabase-js, a future route, or any other caller), completely
--     bypassing adminTransitionJob() and its zod check.
--   - `jobs_validate_before_write()` (the existing BEFORE INSERT/UPDATE
--     trigger) already fully exempts `is_platform_admin(auth.uid())`
--     callers from every one of its own transition/field rules -- so
--     today, a direct admin UPDATE to status='rejected' is not just RLS-
--     permitted, it is also trigger-permitted, with no note check
--     anywhere in the database. This is exactly the same class of gap
--     already found and closed for employer moderation in H3.3
--     (employers.status direct-update bypass) and correctly anticipated
--     as a general risk in that fix's own review notes.
--   - `adminSaveJobDraft()` (the other admin job-write function) was
--     re-audited and confirmed to accept no `status` field in its input
--     schema at all -- it cannot set status='rejected' under any input,
--     so it needed no change and is not touched by this migration.
--
-- Per this fix's own explicit instruction ("prefer application/server-
-- layer enforcement... add a database constraint or RPC change only if
-- direct authenticated status mutation can otherwise bypass the server
-- function") -- direct mutation IS confirmed possible, so both layers
-- are addressed here:
--
--   1. A new, narrowly-scoped SECURITY DEFINER RPC, reject_job(), is the
--      one path the *application* now uses to reject a job: it
--      atomically validates a non-empty (post-trim) note, updates
--      jobs.status, and upserts job_admin_meta.moderation_notes in one
--      transaction -- the same proven pattern already used for employer
--      moderation (moderate_employer, H3.3) and application status
--      changes (set_application_status, H3.4A). adminTransitionJob() now
--      calls this RPC for the 'reject' action specifically; every other
--      action (submit/publish/archive/unpublish) is completely
--      unchanged, still writing through the same RLS-scoped path as
--      before -- this is not a second moderation model, it is the single
--      existing model with its one previously-unprotected transition
--      closed.
--   2. `jobs_validate_before_write()` gains ONE new, unconditional check
--      (applies to every caller, INCLUDING platform admins, unlike every
--      other rule in this trigger): NEW.status = 'rejected' is only ever
--      allowed when a transaction-local marker
--      (app.job_rejection_in_progress) is set -- and the only place that
--      marker is ever set is inside reject_job() itself, immediately
--      before its own internal UPDATE. This closes the raw-update bypass
--      completely, exactly mirroring the transaction-local-marker
--      pattern already proven for employers.status in H3.3's own
--      database-integrity fix. A client can never set this marker
--      itself: PostgREST executes only the single statement/RPC call
--      requested, with no way to run an arbitrary `SET`/`set_config`
--      call before or alongside their own UPDATE.
--
-- Deliberately NOT touched: jobs_admin_write RLS itself (revoking or
-- narrowing it would affect every other admin job-write path, including
-- legitimate ones, and is out of scope for this narrow fix); every other
-- rule already inside jobs_validate_before_write() (transition
-- whitelist, published-job-frozen-field guard, employer-approval gate,
-- etc. -- all unchanged, still exactly as they were); the admin-exemption
-- pattern itself for every OTHER field/rule in this trigger (unchanged --
-- this migration adds exactly one new, universal, no-exemptions rule, not
-- a change to how the existing ones behave).
--
-- Additive only. Does not edit any already-applied migration.
--
-- Rollback: revert jobs_validate_before_write() to its pre-this-migration
-- body (supabase/migrations/20260719181557_f3038432-81c6-4331-802a-
-- 62a30ec97775.sql); drop function public.reject_job(uuid, text). No
-- table, column, index, or RLS policy was added or dropped by this
-- migration.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. jobs_validate_before_write() -- add the unconditional rejected-status
--    invariant. Every other rule in this function is unchanged.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_employer_status text;
BEGIN
  -- H3.4 integrity fix: no caller, of any role, including a verified
  -- platform admin, may set a job's status to 'rejected' except by
  -- executing inside reject_job(), which sets this exact transaction-
  -- local marker immediately before its own internal UPDATE. A client
  -- can never set this marker itself.
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
  'H3.1 + H3.4 database-integrity fix. All prior rules unchanged (family/'
  'profession validation, published-job field requirements, employer-'
  'approval gate, non-admin transition whitelist, published-job-frozen-'
  'field guard). New in H3.4: status=rejected is only ever allowed via an '
  'unforgeable transaction-local marker set exclusively inside '
  'reject_job() -- applies to every caller, including platform admins, '
  'unlike every other rule in this function.';


-- -----------------------------------------------------------------------------
-- 2. reject_job() -- the sole application-facing path a job's status may
--    be set to 'rejected' through; sets the transaction-local marker the
--    trigger above requires.
-- -----------------------------------------------------------------------------
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
-- The RETURNS TABLE output columns (job_id, status, updated_at) create
-- implicit PL/pgSQL variables with those exact names, colliding with
-- job_admin_meta's own job_id/status/updated_at columns. This body never
-- reads those OUT variables by name (only the underscore-prefixed local
-- variables below, and RETURN QUERY at the end) -- variable_conflict
-- use_column safely resolves every such bare identifier to the table
-- column instead, which is what every query in this function actually
-- needs (most concretely: `ON CONFLICT (job_id)` below, which would
-- otherwise raise a genuine "column reference is ambiguous" error).
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

  -- The one invariant this migration exists to enforce: a non-empty,
  -- trimmed note is required to reject a job. Whitespace-only counts as
  -- empty.
  _clean_note := NULLIF(btrim(_note), '');
  IF _clean_note IS NULL THEN
    RAISE EXCEPTION 'A non-empty internal note is required to reject a job'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(_clean_note) > 4000 THEN
    RAISE EXCEPTION 'Note is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the row before writing, consistent with every other moderation
  -- RPC in this schema.
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Deliberately no additional from-status check here beyond what
  -- already existed: jobs_validate_before_write() already exempts
  -- platform admins from its own transition whitelist (unchanged), so
  -- admin-driven rejection continues to be permitted from whichever
  -- states it already was -- this migration only closes the missing note
  -- requirement, nothing else.

  -- H3.4 integrity fix: the ONLY place in the entire codebase this
  -- marker is ever set. Transaction-local (third argument `true`) --
  -- automatically reverts at the end of this transaction, whether commit
  -- or rollback, so it can never leak into a later, unrelated request.
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
  'H3.4 integrity fix. The only path a job may be set to status=rejected '
  'through -- both at the application layer (adminTransitionJob calls '
  'this instead of a raw update) and structurally (jobs_validate_before_'
  'write() rejects any UPDATE/INSERT setting status=rejected without the '
  'transaction-local marker this function sets). Platform-admin-only '
  '(server-derived from auth.uid(), never trusted from client input). '
  'Requires a non-empty, trimmed internal note -- rejects with '
  'ERRCODE=check_violation otherwise, changing neither jobs.status nor '
  'job_admin_meta. Atomically updates jobs.status and upserts '
  'job_admin_meta.moderation_notes in one transaction, exactly like '
  'moderate_employer() (H3.3) and set_application_status() (H3.4A).';
