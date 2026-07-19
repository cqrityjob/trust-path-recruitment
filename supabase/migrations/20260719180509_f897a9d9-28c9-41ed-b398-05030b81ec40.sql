-- Defense-in-depth RLS on storage.objects for the private job-application-cvs bucket.
-- The bucket is only written via server-side service_role code today; these policies
-- ensure that any future direct-from-browser upload is scoped to the applicant's own folder.
-- Path convention: '<applicant_user_id>/<job_id>/<filename>'.

DROP POLICY IF EXISTS "job_cvs_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_owner_delete" ON storage.objects;

CREATE POLICY "job_cvs_owner_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-application-cvs'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "job_cvs_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-application-cvs'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "job_cvs_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'job-application-cvs'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'job-application-cvs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "job_cvs_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-application-cvs'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);
