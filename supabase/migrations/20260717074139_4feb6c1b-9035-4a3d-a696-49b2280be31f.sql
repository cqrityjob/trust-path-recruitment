-- Lock down SECURITY DEFINER function execution.
-- handle_new_user is a trigger; no client role needs EXECUTE.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- has_role is invoked from RLS policies as the querying role, so authenticated
-- must retain EXECUTE. Revoke from PUBLIC and anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;