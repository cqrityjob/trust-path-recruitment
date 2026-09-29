-- Roll back 20261224090000_candidate_application_context.
--
-- Drops rec_my_application_context(). This REINSTATES JB-01: a candidate's
-- application history loses the job title, employer and link once the
-- vacancy closes. Roll the application back first or together: the
-- application-history read at the same commit calls the function.
DROP FUNCTION IF EXISTS public.rec_my_application_context();
