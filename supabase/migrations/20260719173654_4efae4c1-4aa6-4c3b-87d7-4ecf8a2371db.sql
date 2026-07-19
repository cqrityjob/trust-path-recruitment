REVOKE ALL ON FUNCTION public.job_applications_stamp_employer_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_applications_stamp_employer_id() TO service_role;