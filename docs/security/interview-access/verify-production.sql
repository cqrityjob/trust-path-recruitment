-- Run only after Claude's corresponding release step. Read-only metadata;
-- no production candidate row or fixture write. Save timestamp/results and
-- compare exact function bodies to the reviewed commit before recording applied.
BEGIN READ ONLY;
SELECT now() AS verified_at,current_database();
SELECT version,name FROM supabase_migrations.schema_migrations
 WHERE version IN ('20270206090000','20270207090000') ORDER BY version;
SELECT tablename,policyname,cmd,roles,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('scp_interview_ai_config','scp_scenario_versions',
 'sp_credential_definition_versions','sp_recognition_policies','sp_credential_scopes',
 'sp_credential_organisation_roles','sp_credential_definition_reviews') ORDER BY tablename,policyname;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,
 has_any_column_privilege('authenticated',c.oid,'INSERT') AS auth_insert,
 has_any_column_privilege('authenticated',c.oid,'UPDATE') AS auth_update,
 has_table_privilege('authenticated',c.oid,'DELETE') AS auth_delete
 FROM pg_class c WHERE c.oid IN ('public.scp_interview_ai_config'::regclass,'public.scp_scenario_versions'::regclass);
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,p.proacl,md5(p.prosrc),pg_get_functiondef(p.oid)
 FROM pg_proc p WHERE p.oid IN ('public.scp_iv_case_capabilities(uuid)'::regprocedure,
 'scp_private.case_capabilities(uuid)'::regprocedure,'public.scp_iv_can_read_case(uuid)'::regprocedure);
SELECT has_function_privilege('anon','public.scp_iv_case_capabilities(uuid)','EXECUTE') AS anon_public_rpc,
 has_function_privilege('anon','scp_private.case_capabilities(uuid)','EXECUTE') AS anon_private_helper;
ROLLBACK;
