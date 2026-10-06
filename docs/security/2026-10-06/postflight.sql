-- Read-only; run ONLY after approved application on the explicitly selected production project.
-- Capture results beside the baseline. No mutation, no impersonation of a real account.
SELECT version,name FROM supabase_migrations.schema_migrations
WHERE version='20270218090000';
SELECT tablename,policyname,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN
('graph_versions','scp_bundle_versions','scp_role_weight_profiles','scp_forms','scp_form_blocks')
ORDER BY tablename,policyname;
SELECT c.relname,c.reloptions,pg_get_viewdef(c.oid,true),c.relacl
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN
('graph_versions_published','scp_bundle_versions_published','scp_role_weight_profiles_published');
SELECT c.relname,r.role,has_table_privilege(r.role,c.oid,'SELECT') AS can_select,
 has_table_privilege(r.role,c.oid,'INSERT,UPDATE,DELETE') AS can_write,
 has_any_column_privilege(r.role,c.oid,'INSERT') AS can_insert_column,
 has_any_column_privilege(r.role,c.oid,'UPDATE') AS can_update_column
FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated')) r(role)
WHERE c.relnamespace='public'::regnamespace AND c.relname IN
('graph_versions','scp_bundle_versions','scp_role_weight_profiles','scp_forms','scp_form_blocks',
'graph_versions_published','scp_bundle_versions_published','scp_role_weight_profiles_published')
ORDER BY c.relname,r.role;
-- Requires separate approved ordinary/author synthetic sessions for behaviour;
-- management-owner SELECT counts alone do not prove ordinary-user access.
