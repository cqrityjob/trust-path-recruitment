-- Rollback for 20261231090000_scp_resolve_employment_owner_only.
--
-- Restores EXECUTE for `authenticated` exactly as 20260829097000 granted it,
-- and the original comment. This REOPENS P1-3 of the 2026-10-01 audit: any
-- signed-in user can again bind another employer's unbound employment record
-- to a person of their choosing. No binding is touched in either direction.

GRANT EXECUTE ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.scp_resolve_employment_for_assignment(uuid, text, uuid) IS
  'Resolves which employment record an assignment belongs to, once, at assignment '
  'time, and binds it to the subject. Email is a resolution hint for filling a '
  'blank -- never the durable join, and never a way to rebind existing history.';

DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.scp_resolve_employment_for_assignment(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_RESOLVE_EMPLOYMENT_ROLLBACK: the 20260829097000 grant was not restored';
  END IF;
  RAISE NOTICE 'SCP_RESOLVE_EMPLOYMENT_ROLLBACK ok: authenticated may execute the binding helper again';
END $$;
