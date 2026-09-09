-- Roll back the Security Passport share gateway only. Existing disclosure
-- tokens, disclosures, access rows and recipient transport remain untouched.

DROP FUNCTION IF EXISTS public.sp_get_disclosure_session(text);
DROP FUNCTION IF EXISTS public.sp_share_gateway_consume(text, text);
DROP FUNCTION IF EXISTS public.sp_share_gateway_issue(text, text);
DROP TABLE IF EXISTS public.sp_share_sessions;
DROP TABLE IF EXISTS public.sp_share_handoffs;
