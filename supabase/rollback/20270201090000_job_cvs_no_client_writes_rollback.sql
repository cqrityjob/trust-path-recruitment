-- Rollback of 20270201090000_job_cvs_no_client_writes.
--
-- !! THIS REOPENS THE CANDIDATE-CV BUCKET TO CLIENT WRITES !! A candidate can
-- again overwrite or delete the CV of an application already submitted, and
-- store any bytes at their own CV path through the Storage API. Run it ONLY in
-- an isolated test database (scripts/db-test.sh cycles it). Recreates the four
-- applicant policies exactly as 20260721085020 defined them.

DROP POLICY IF EXISTS "job_cvs_applicant_select" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_update" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_delete" ON storage.objects;

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

DO $$ BEGIN
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
         AND policyname IN ('job_cvs_applicant_select', 'job_cvs_applicant_insert',
                            'job_cvs_applicant_update', 'job_cvs_applicant_delete')) <> 4 THEN
    RAISE EXCEPTION 'JOB_CVS_NO_CLIENT_WRITES_ROLLBACK: the four applicant policies were not restored';
  END IF;
  RAISE NOTICE 'JOB_CVS_NO_CLIENT_WRITES_ROLLBACK ok: the applicant policies are restored';
END $$;
