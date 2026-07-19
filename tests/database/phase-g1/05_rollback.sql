-- =============================================================================
-- Phase G1 local validation — exact rollback SQL, copied verbatim from
-- docs/job-intelligence/phase-g1-report.md "Rollback procedure".
-- =============================================================================

-- Revert the 8 admin-equivalence policies to their pre-G1 predicate
ALTER POLICY "job_import_sources_admin_all" ON public.job_import_sources
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "job_import_sources admin read" ON public.job_import_sources
  USING (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "employer_admin_meta_admin_all" ON public.employer_admin_meta
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "jobs_admin_select" ON public.jobs
  USING (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "jobs_admin_write" ON public.jobs
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "employers_admin_all" ON public.employers
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "job_admin_meta_admin_all" ON public.job_admin_meta
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER POLICY "job_audit_events_admin_select" ON public.job_audit_events
  USING (public.has_role(auth.uid(), 'admin'));

-- Revert the public-visibility narrowing to its pre-G1 predicate
ALTER POLICY "jobs_public_active_select" ON public.jobs
  USING (public.job_is_active(status, published_at, deadline_at, expires_at));
ALTER POLICY "employers_public_active_select" ON public.employers
  USING (EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.employer_id = employers.id
      AND public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at)
  ));

-- Remove every new object
DROP FUNCTION IF EXISTS public.employer_is_active_status(uuid);
DROP FUNCTION IF EXISTS public.update_employer_membership(uuid, text, text);
DROP POLICY IF EXISTS "employers_member_select" ON public.employers;
DROP POLICY IF EXISTS "employer_memberships_admin_all" ON public.employer_memberships;
DROP POLICY IF EXISTS "employer_memberships_self_select" ON public.employer_memberships;
DROP FUNCTION IF EXISTS public.has_employer_role(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.is_platform_admin(uuid);
DROP TABLE IF EXISTS public.employer_memberships;
ALTER TABLE public.employers DROP COLUMN IF EXISTS status;
