WITH tables AS (
SELECT c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND ((n.nspname='public' AND c.relname LIKE 'sw\_%' ESCAPE '\') OR n.nspname='sw_private')
), funcs AS (
SELECT p.*, n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='sw_private' OR (n.nspname='public' AND p.proname LIKE 'sw\_%' ESCAPE '\')
)
SELECT jsonb_build_object(
'tables',(SELECT jsonb_agg(jsonb_build_object('schema',t.nspname,'name',t.relname,'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,
'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=t.oid),
'constraints',(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname) FROM pg_constraint c WHERE c.conrelid=t.oid),
'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tr.tgname,'definition',pg_get_triggerdef(tr.oid)) ORDER BY tr.tgname) FROM pg_trigger tr WHERE tr.tgrelid=t.oid AND NOT tr.tgisinternal),
'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'roles',(SELECT array_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles)),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=t.oid),
'grants',(SELECT jsonb_agg(jsonb_build_object('role',r,'privilege',v,'allowed',has_table_privilege(r,t.oid,v)) ORDER BY r,v) FROM unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) v)
) ORDER BY t.nspname,t.relname) FROM tables t),
'functions',(SELECT jsonb_agg(jsonb_build_object('schema',p.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'definer',p.prosecdef,'config',p.proconfig,'source_md5',md5(p.prosrc),'public_execute',EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM funcs p),
'storage_bucket',(SELECT jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) FROM storage.buckets WHERE id='sw-documents'),
'storage_policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'roles',(SELECT array_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles)),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid='storage.objects'::regclass AND p.polname LIKE 'sw\_%' ESCAPE '\'),
'method_templates',(SELECT jsonb_build_object('methods',(SELECT jsonb_agg(to_jsonb(m)-'created_at' ORDER BY id) FROM public.sw_method_versions m),'templates',(SELECT jsonb_agg(to_jsonb(t)-'created_at' ORDER BY id) FROM public.sw_report_templates t))),
'schema_grants',(SELECT jsonb_agg(jsonb_build_object('role',r,'usage',has_schema_privilege(r,'sw_private','USAGE'),'create',has_schema_privilege(r,'sw_private','CREATE')) ORDER BY r) FROM unnest(ARRAY['anon','authenticated','service_role']) r)
) AS catalog;

