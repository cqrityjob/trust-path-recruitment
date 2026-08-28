-- Migration 20260724120000: Admin audit — job publish requires active employer
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

-- Migration 20260724130000: Admin Portal operational scope
CREATE POLICY "employees_admin_select" ON public.employees
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "employees_admin_update" ON public.employees
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "assignments_admin_select" ON public.assessment_assignments
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_cancel_assessment_assignment(
  _assignment_id uuid,
  _reason text
)
RETURNS TABLE (id uuid, previous_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean_reason text;
  _current_status text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_platform_admin(_caller) THEN RAISE EXCEPTION 'Forbidden: platform admin role required'; END IF;
  _clean_reason := NULLIF(btrim(_reason), '');
  IF _clean_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel an assignment as admin' USING ERRCODE='check_violation'; END IF;
  IF char_length(_clean_reason) > 2000 THEN RAISE EXCEPTION 'Reason is too long' USING ERRCODE='check_violation'; END IF;
  SELECT status INTO _current_status FROM public.assessment_assignments WHERE assessment_assignments.id = _assignment_id FOR UPDATE;
  IF _current_status IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF _current_status NOT IN ('invited','opened','started') THEN RAISE EXCEPTION 'Assignment cannot be cancelled from status %', _current_status USING ERRCODE='check_violation'; END IF;
  UPDATE public.assessment_assignments SET status='cancelled', cancelled_at=now(), cancellation_reason=_clean_reason, cancelled_by=_caller WHERE assessment_assignments.id = _assignment_id;
  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'platform_admin', 'assignment_cancelled', 'assessment_assignment', _assignment_id::text, jsonb_build_object('previous_status', _current_status, 'reason', _clean_reason));
  RETURN QUERY SELECT _assignment_id, _current_status, 'cancelled'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_assessment_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_assessment_assignment(uuid, text) TO authenticated, service_role;

CREATE POLICY "user_roles_admin_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'superadmin'); $$;

REVOKE ALL ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_platform_role(
  _target_user_id uuid,
  _role text,
  _grant boolean
)
RETURNS TABLE (target_user_id uuid, granted_role text, granted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _superadmin_count int;
  _target_had_role boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_superadmin(_caller) THEN RAISE EXCEPTION 'Forbidden: superadmin role required'; END IF;
  IF _role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'Invalid role: %; only admin/superadmin may be managed through this function', _role; END IF;
  IF _target_user_id = _caller THEN RAISE EXCEPTION 'SELF_ROLE_CHANGE_NOT_ALLOWED: a superadmin cannot change their own platform role' USING ERRCODE='check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _target_user_id) THEN RAISE EXCEPTION 'Target user not found'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE public.user_roles.user_id = _target_user_id AND public.user_roles.role = _role::public.app_role) INTO _target_had_role;
  IF NOT _grant AND _role = 'superadmin' AND _target_had_role THEN
    SELECT count(*) INTO _superadmin_count FROM public.user_roles WHERE public.user_roles.role = 'superadmin';
    IF _superadmin_count <= 1 THEN RAISE EXCEPTION 'LAST_SUPERADMIN_PROTECTED: cannot remove the only remaining superadmin' USING ERRCODE='check_violation'; END IF;
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role, granted_by) VALUES (_target_user_id, _role::public.app_role, _caller) ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE public.user_roles.user_id = _target_user_id AND public.user_roles.role = _role::public.app_role;
  END IF;
  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, metadata)
  VALUES (_caller, 'superadmin', CASE WHEN _grant THEN 'platform_role_granted' ELSE 'platform_role_revoked' END, 'user', _target_user_id::text, jsonb_build_object('role', _role, 'had_role_before', _target_had_role));
  RETURN QUERY SELECT _target_user_id, _role::text, _grant;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) TO authenticated, service_role;