-- 1) Revoke anon EXECUTE on employer_members_can_edit (used only by authenticated policies)
REVOKE EXECUTE ON FUNCTION public.employer_members_can_edit(uuid) FROM anon, PUBLIC;

-- 2) Storage policies for the private job-application-cvs bucket.
--    Path convention: <applicant_user_id>/<application_id>/<filename>
--    Applicant may read/write objects under their own uid folder.
--    Employer members of the job's employer may read CVs referenced by a job_applications row.

DROP POLICY IF EXISTS "job_cvs_applicant_select" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_update" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_delete" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_employer_select" ON storage.objects;

CREATE POLICY "job_cvs_applicant_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-application-cvs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "job_cvs_applicant_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-application-cvs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "job_cvs_applicant_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'job-application-cvs'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'job-application-cvs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "job_cvs_applicant_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'job-application-cvs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "job_cvs_employer_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-application-cvs'
  AND EXISTS (
    SELECT 1 FROM public.job_applications ja
    WHERE ja.cv_storage_path = storage.objects.name
      AND public.has_employer_role(auth.uid(), ja.employer_id, NULL)
      AND public.employer_is_active_status(ja.employer_id)
  )
);