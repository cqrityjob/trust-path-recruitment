REVOKE EXECUTE ON FUNCTION public.cd_validate_option_matrix(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cd_validate_option_matrix(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cd_validate_option_matrix(text) TO service_role;