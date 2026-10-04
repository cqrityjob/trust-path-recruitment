-- Removes only the new application-share admission guard. Restores the prior
-- ability to create empty application disclosures; does not alter general shares.
DROP TRIGGER IF EXISTS sp_application_verified_content ON public.sp_disclosures;
DROP FUNCTION IF EXISTS public.sp_require_application_verified_content();
