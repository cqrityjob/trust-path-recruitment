-- Rollback of 20261202090000_scp_interview_starts.
--
-- Refuses while anything depends on it: a start or a test setup has been
-- recorded (those rows are history of real starts and are never discarded
-- by a rollback). Otherwise removes the new objects; no existing function or
-- table was changed by the migration, so nothing is restored.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_interview_starts)
     OR EXISTS (SELECT 1 FROM public.scp_assessment_setups) THEN
    RAISE EXCEPTION 'SCP_START_ROLLBACK_REFUSED: interview starts or test setups are recorded.';
  END IF;
END $guard$;

DROP FUNCTION public.scp_iv_start_choices(uuid, uuid);
DROP FUNCTION public.scp_iv_start_interview(uuid, uuid, text, uuid, text, uuid, text, text, text, text);
DROP FUNCTION public.scp_iv_start_result(uuid, boolean, text, text, text, text);
DROP FUNCTION public.scp_record_assessment_setup(uuid, uuid, text, text, text);
DROP TABLE public.scp_interview_starts;
DROP TABLE public.scp_assessment_setups;
DROP FUNCTION public.scp_guard_interview_start_rows();
DROP TABLE public.scp_recruitment_content_links;
DROP TABLE public.scp_recruitment_role_profiles;
DROP FUNCTION public.scp_guard_recruitment_content_link();

DO $rbproof$
BEGIN
  IF to_regclass('public.scp_interview_starts') IS NOT NULL
     OR to_regclass('public.scp_assessment_setups') IS NOT NULL
     OR to_regclass('public.scp_recruitment_content_links') IS NOT NULL
     OR to_regclass('public.scp_recruitment_role_profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_START_ROLLBACK: objects remain.';
  END IF;
  RAISE NOTICE 'SCP_INTERVIEW_STARTS_ROLLBACK ok';
END $rbproof$;
