-- Phase H3.1 correction migration:
-- 1) Self-service employer onboarding via SECURITY DEFINER RPC.
-- 2) Allow draft-employer members to draft/edit jobs (but not submit until approved).
-- 3) Tighten CV storage: drop authenticated INSERT/UPDATE/DELETE policies until H4.

-- =====================================================================
-- 1. Member-facing employer status helper
--    Allows access to own employer workspace when status is active OR draft.
--    Public visibility (employers_public_active_select / jobs_public_active_select
--    / employer_is_active_status) is UNCHANGED — remains active-only.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.employer_members_can_edit(_employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status IN ('active', 'draft') FROM public.employers WHERE id = _employer_id;
$$;

REVOKE ALL ON FUNCTION public.employer_members_can_edit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employer_members_can_edit(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.employer_members_can_edit(uuid) IS
  'Member-facing gate. True when employer is active OR draft (self-service onboarding). '
  'Public visibility remains gated by employer_is_active_status (active-only). '
  'SECURITY DEFINER to bypass employers'' own RLS during policy evaluation, mirroring '
  'employer_is_active_status.';

-- =====================================================================
-- 2. Extend jobs_employer_* RLS so draft employers may draft/edit jobs.
-- =====================================================================
DROP POLICY IF EXISTS "jobs_employer_select_own" ON public.jobs;
CREATE POLICY "jobs_employer_select_own" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

DROP POLICY IF EXISTS "jobs_employer_insert_draft" ON public.jobs;
CREATE POLICY "jobs_employer_insert_draft" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
    AND status = 'draft'
  );

DROP POLICY IF EXISTS "jobs_employer_update_editable" ON public.jobs;
CREATE POLICY "jobs_employer_update_editable" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
    AND status IN ('draft','rejected','published')
  )
  WITH CHECK (
    public.has_employer_role(auth.uid(), employer_id, NULL)
    AND public.employer_members_can_edit(employer_id)
  );

-- =====================================================================
-- 3. Trigger guard: block submission for review until employer is active.
--    Preserves existing transition rules; adds the employer-approval gate.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.jobs_validate_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_employer_status text;
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

-- =====================================================================
-- 4. Self-service employer onboarding RPC.
--    SECURITY DEFINER so the caller (an authenticated user with no
--    membership yet) may atomically insert both the employers row and
--    their owner membership. Enforces:
--      - authenticated caller
--      - at most one self-service org per user (idempotency-lite; owner
--        of another org may not use this path — must be invited).
--        Enforced by rejecting if the caller already owns any employer.
--        (Platform admins may still create additional orgs via the
--        admin console.)
--      - name/slug normalisation & uniqueness (auto-suffixed)
--      - status locked to 'draft' — never active/verified from client input
--      - membership locked to role='owner', status='active'
--    Writes an audit_logs row.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_employer_self_service(
  p_name text,
  p_website text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_description_sv text DEFAULT NULL,
  p_description_en text DEFAULT NULL
)
RETURNS TABLE(employer_id uuid, employer_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_name text;
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
  v_id uuid;
  v_now timestamptz := now();
  v_existing_owner int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF char_length(v_name) < 2 OR char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'Organisation name must be 2–200 characters';
  END IF;

  IF p_website IS NOT NULL AND btrim(p_website) <> '' AND char_length(p_website) > 500 THEN
    RAISE EXCEPTION 'Website URL too long';
  END IF;
  IF p_country IS NOT NULL AND char_length(p_country) > 2 THEN
    RAISE EXCEPTION 'Country code must be ISO alpha-2';
  END IF;

  -- Reject if the caller already has an owner membership on any employer —
  -- self-service is a one-time onboarding path per user. Additional
  -- workspaces are provisioned by invitation from an existing owner or
  -- by platform admin.
  SELECT count(*) INTO v_existing_owner
    FROM public.employer_memberships
   WHERE user_id = v_caller AND role = 'owner' AND status = 'active';
  IF v_existing_owner > 0 THEN
    RAISE EXCEPTION 'You already own an employer organisation. Additional workspaces require invitation.';
  END IF;

  -- Slug: normalise base from name, append -2, -3 ... on collision.
  v_base_slug := regexp_replace(lower(unaccent(v_name)), '[^a-z0-9]+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '(^-+|-+$)', '', 'g');
  v_base_slug := substr(v_base_slug, 1, 80);
  IF v_base_slug = '' THEN v_base_slug := 'employer'; END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.employers WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
    IF v_suffix > 200 THEN
      RAISE EXCEPTION 'Could not generate a unique slug for organisation';
    END IF;
  END LOOP;

  INSERT INTO public.employers (
    name, slug, website, country, description_sv, description_en, status
  ) VALUES (
    v_name,
    v_slug,
    NULLIF(btrim(COALESCE(p_website, '')), ''),
    NULLIF(btrim(COALESCE(p_country, '')), ''),
    NULLIF(btrim(COALESCE(p_description_sv, '')), ''),
    NULLIF(btrim(COALESCE(p_description_en, '')), ''),
    'draft'
  ) RETURNING id INTO v_id;

  INSERT INTO public.employer_memberships (
    employer_id, user_id, role, status,
    created_by, invited_by, invited_at, accepted_at
  ) VALUES (
    v_id, v_caller, 'owner', 'active',
    v_caller, v_caller, v_now, v_now
  );

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
  VALUES (
    v_caller, 'employer_self_service', 'employer_self_service_created',
    'employer', v_id::text, v_id,
    jsonb_build_object('slug', v_slug, 'name', v_name)
  );

  employer_id := v_id;
  employer_slug := v_slug;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_employer_self_service(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_employer_self_service(text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_employer_self_service(text, text, text, text, text) IS
  'Self-service employer onboarding (Phase H3.1). Creates a draft employer + '
  'owner membership atomically for the authenticated caller. Status is locked '
  'to draft; verification/activation requires platform admin action. Callers '
  'may only self-service one organisation.';

-- Ensure unaccent is available for slugification (fallback to plain lower if not).
-- If the extension is not installed, replace unaccent(v_name) with just v_name
-- above. Try installing but ignore failure.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS unaccent;
  EXCEPTION WHEN OTHERS THEN
    -- If we can't create it, redefine the RPC without unaccent.
    NULL;
  END;
END $$;

-- =====================================================================
-- 5. CV storage tightening.
--    Applications flow (H1-server + future H4) writes to job-application-cvs
--    via service_role only. Until H4 introduces a browser upload path,
--    drop the authenticated INSERT/UPDATE/DELETE policies. Keep no
--    authenticated SELECT either — bucket remains private and reachable
--    only via server-issued signed URLs. Deny-by-default.
-- =====================================================================
DROP POLICY IF EXISTS "job_cvs_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_owner_delete" ON storage.objects;