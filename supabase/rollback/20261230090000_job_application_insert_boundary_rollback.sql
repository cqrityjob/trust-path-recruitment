-- Rollback for 20261230090000_job_application_insert_boundary.
--
-- Restores the insert policy and the table-wide INSERT grant exactly as they
-- stood before (20260719173615: applicant_user_id = auth.uid() only). This
-- REOPENS P1-1 and P1-2 of the 2026-10-01 audit: a candidate can again create
-- an application with any status, an employer note, chosen timestamps, a
-- composed CV snapshot, and a CV path outside their own folder. No stored row
-- is touched in either direction.
--
-- ORDER: the insert policy calls cv_owned_application_snapshot(uuid), so this
-- rollback must run BEFORE 20261122090000's, which drops that function and is
-- refused (2BP01) while the policy depends on it.

DROP POLICY IF EXISTS "job_applications_owner_insert" ON public.job_applications;
CREATE POLICY "job_applications_owner_insert" ON public.job_applications
  FOR INSERT TO authenticated
  WITH CHECK (applicant_user_id = auth.uid());

REVOKE INSERT ON public.job_applications FROM authenticated;
GRANT INSERT ON public.job_applications TO authenticated;

DO $$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.job_applications', 'status', 'INSERT')
     OR (SELECT with_check FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'job_applications'
            AND policyname = 'job_applications_owner_insert') <> '(applicant_user_id = auth.uid())' THEN
    RAISE EXCEPTION 'JOB_APPLICATION_INSERT_ROLLBACK: the pre-20261230090000 insert boundary was not restored';
  END IF;
  RAISE NOTICE 'JOB_APPLICATION_INSERT_ROLLBACK ok: insert policy and grant are back to the 20260719173615 shape';
END $$;
