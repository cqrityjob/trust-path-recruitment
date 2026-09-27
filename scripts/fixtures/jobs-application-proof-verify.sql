\set ON_ERROR_STOP on
DO $$
DECLARE app public.job_applications%ROWTYPE;
BEGIN
  SELECT * INTO STRICT app FROM public.job_applications
  WHERE job_id = 'b7200000-0000-4000-8000-000000000003'
    AND applicant_user_id = 'b7000000-0000-4000-8000-000000000001';
  IF app.status <> 'submitted' OR app.cv_source <> 'upload' THEN
    RAISE EXCEPTION 'Application state or CV source changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
    WHERE bucket_id = 'job-application-cvs' AND name = app.cv_storage_path) THEN
    RAISE EXCEPTION 'The application PDF is not stored';
  END IF;
  IF (SELECT count(*) FROM public.recruitment_messages
    WHERE application_id = app.id AND kind = 'receipt'
      AND status = 'sent' AND email_status = 'not_configured') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one in-app receipt and truthful unconfigured email delivery';
  END IF;
  RAISE NOTICE 'Verified one submitted application, its private PDF, and one in-app receipt with email not configured.';
END $$;
