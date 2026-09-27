-- Metadata only. Target verified separately with Supabase get_project:
-- wrygicdfxwjnrugduxnt / CQrityjob Production. Never select application rows.
BEGIN READ ONLY;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname NOT IN ('pg_catalog','information_schema')
ORDER BY schemaname,tablename,policyname;

SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity,
 c.relforcerowsecurity,c.reloptions,pg_get_userbyid(c.relowner) AS owner,c.relacl,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS anon_write,
 has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS auth_write
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p','v','m') ORDER BY 1,2;

SELECT c.relname,a.attname,a.attacl FROM pg_attribute a
JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND a.attacl IS NOT NULL ORDER BY 1,2;

SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname AS schema,
 d.defaclobjtype,d.defaclacl FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3;

SELECT p.oid::regprocedure::text AS signature,p.proname,p.prosecdef,p.proconfig,
 p.proacl,pg_get_functiondef(p.oid) AS definition,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef ORDER BY p.proname,p.oid;

SELECT c.relname,pg_get_viewdef(c.oid,true) AS definition FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v' ORDER BY 1;

SELECT n.nspname AS schema,c.relname AS name,t.tgname,t.tgenabled,
 pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','storage') AND NOT t.tgisinternal ORDER BY 1,2,3;

SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' ORDER BY table_name,ordinal_position;

SELECT nspname,has_schema_privilege('anon',oid,'USAGE') AS anon_usage,
 has_schema_privilege('anon',oid,'CREATE') AS anon_create,
 has_schema_privilege('authenticated',oid,'USAGE') AS auth_usage,
 has_schema_privilege('authenticated',oid,'CREATE') AS auth_create
FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema' ORDER BY 1;

SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls
FROM pg_roles WHERE rolname IN ('anon','authenticated','authenticator','postgres','service_role');

SELECT r.rolname,setting FROM pg_db_role_setting s
LEFT JOIN pg_roles r ON r.oid=s.setrole CROSS JOIN LATERAL unnest(s.setconfig) AS setting
WHERE setting LIKE 'pgrst.db_schemas=%';
ROLLBACK;
