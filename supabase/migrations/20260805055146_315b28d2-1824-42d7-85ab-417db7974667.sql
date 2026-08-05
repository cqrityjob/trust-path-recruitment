REVOKE ALL ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scp_compute_maturity(uuid, uuid, text, timestamptz) TO service_role;