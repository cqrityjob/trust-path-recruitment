-- Roll back 20261226090000_application_notes_column_privileges (the CONTRACT half).
--
-- Restores the table-level SELECT grants on job_applications and
-- job_application_status_events to `authenticated` exactly as they stood
-- (20260719173615 / 20260720150000). This REINSTATES JB-02: the applicant can
-- again read the employer's note through the API. It says so because that is
-- what a rollback is. The EXPAND half's functions stay; nothing reads
-- differently because of this file except the API column reads it re-opens.
REVOKE SELECT ON public.job_applications FROM authenticated;
REVOKE SELECT ON public.job_application_status_events FROM authenticated;
GRANT SELECT ON public.job_applications TO authenticated;
GRANT SELECT ON public.job_application_status_events TO authenticated;
DO $$
BEGIN
  IF NOT has_column_privilege('authenticated', 'public.job_applications', 'employer_note', 'SELECT') THEN
    RAISE EXCEPTION 'JB02_CONTRACT_ROLLBACK failed: employer_note is still not granted';
  END IF;
  RAISE NOTICE 'JB02_CONTRACT_ROLLBACK ok: table-level SELECT restored to authenticated (the notes are readable by the applicant again)';
END $$;
