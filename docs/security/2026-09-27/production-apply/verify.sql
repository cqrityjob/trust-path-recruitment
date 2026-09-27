BEGIN READ ONLY;
SELECT json_build_object(
 'observed_at',now(),'server_version',current_setting('server_version'),
 'relations',(SELECT json_agg(x ORDER BY schema,name) FROM (SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,pg_get_userbyid(c.relowner) AS owner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p','v','m','f')) x),
 'policies',(SELECT json_agg(x ORDER BY schemaname,tablename,policyname) FROM pg_policies x WHERE schemaname IN ('public','storage')),
 'columns',(SELECT json_agg(x ORDER BY schema,name,attnum) FROM (SELECT n.nspname AS schema,c.relname AS name,a.attname,a.attnum,a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') AND a.attacl IS NOT NULL) x),
 'defaults',(SELECT json_agg(x ORDER BY owner,schema,defaclobjtype) FROM (SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname AS schema,d.defaclobjtype,d.defaclacl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace) x),
 'functions',(SELECT json_agg(x ORDER BY signature) FROM (SELECT p.oid::regprocedure::text AS signature,md5(pg_get_functiondef(p.oid)) AS definition_md5,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','storage') AND p.prokind='f') x),
 'dml',(SELECT json_agg(x ORDER BY schema,name,role,privilege) FROM (SELECT n.nspname AS schema,c.relname AS name,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege) AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role) CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege) WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p','v','m','f')) x),
 'admin',(SELECT json_agg(x ORDER BY name,role,privilege) FROM (SELECT c.relname AS name,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege) AS allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('anon'),('authenticated')) r(role) CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) x),
 'ledger',(SELECT json_agg(x ORDER BY version) FROM (SELECT version,name,md5(array_to_string(statements,E'\n')) AS statements_md5 FROM supabase_migrations.schema_migrations) x)
) AS snapshot;
COMMIT;
