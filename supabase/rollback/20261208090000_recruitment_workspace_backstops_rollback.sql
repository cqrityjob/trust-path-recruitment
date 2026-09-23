-- Rollback for 20261208090000_recruitment_workspace_backstops.sql.
--
-- Stands the two job_applications backstops down and nothing else. Every
-- recruitment table, every rec_* function and every row stays; the new
-- application keeps enforcing both rules itself.
--
-- WHEN: first step of an APPLICATION rollback -- before, or together with, the
-- revert of the application PR. The application on `main` before the
-- recruitment workspace lets every member record a decision through
-- set_application_status() and sends no answers from its apply dialog; with
-- these triggers live it would show members a bare "could not update" and
-- turn candidates away from vacancies that have required questions. Standing
-- them down returns that application to exactly its own permission model.
--
-- On hosted this runs as a new, reviewed migration carrying this file's body,
-- never by hand and never through Lovable's query_database.

BEGIN;

DROP TRIGGER IF EXISTS job_applications_decision_guard ON public.job_applications;
DROP TRIGGER IF EXISTS job_applications_required_answers ON public.job_applications;
DROP FUNCTION IF EXISTS public.rec_application_decision_guard();
DROP FUNCTION IF EXISTS public.rec_check_required_answers();

COMMIT;
