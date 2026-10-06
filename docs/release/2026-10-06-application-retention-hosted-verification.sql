-- Read-only catalogue verification after PR #444. Explicit target: wrygicdfxwjnrugduxnt.
-- No lifecycle RPC, DDL, retention enqueue, row erasure or Storage deletion is executed.

select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as args,md5(p.prosrc) as body_md5,p.prosecdef as definer,p.proconfig as config,to_jsonb(p.proacl) as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='recruitment_erasure' or (n.nspname='public' and p.proname in ('rec_archive_material','rec_candidate_view','rec_claim_erasure','rec_enqueue_due_retention','rec_erase_rows','rec_erasure_file_exists','rec_preview_erasure','rec_request_erasure','rec_retention_overview','rec_retention_scope','rec_retry_erasure','rec_set_retention','rec_settle_erasure','sweep_application_retention')) order by n.nspname,p.proname;

SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl) ORDER BY c.relname,a.attname) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped AND ((c.relname='job_applications' AND a.attname='employer_archived_at') OR (c.relname='recruitment_settings' AND a.attname='archived_at') OR (c.relname='employers' AND a.attname='recruitment_retention_months') OR (c.relname='storage_erasure_queue' AND a.attname='recruitment_erasure_job_id'))),
 'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (n.nspname='recruitment_erasure' OR (n.nspname='public' AND c.relname='recruitment_erasure_jobs'))),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='recruitment_erasure_jobs'),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname) FROM pg_constraint c WHERE c.conname IN ('scp_manifest_employer_snapshot_fkey','bcp_invitations_assignment_id_fkey','employers_recruitment_retention_months_check','storage_erasure_queue_recruitment_erasure_job_id_fkey')),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgname IN ('retention_pending_guard','retention_period_guard')),
 'privateSchemaPrivileges',(SELECT jsonb_agg(jsonb_build_object('role',r,'usage',has_schema_privilege(r,'recruitment_erasure','USAGE'),'create',has_schema_privilege(r,'recruitment_erasure','CREATE')) ORDER BY r) FROM unnest(ARRAY['anon','authenticated','service_role']) r),
 'privateSchemaAcl',(SELECT nspacl FROM pg_namespace WHERE nspname='recruitment_erasure'),
 'privateTablePrivileges',(SELECT jsonb_agg(jsonb_build_object('role',r,'table',c.relname,'select',has_table_privilege(r,c.oid,'SELECT'),'insert',has_table_privilege(r,c.oid,'INSERT'),'update',has_table_privilege(r,c.oid,'UPDATE'),'delete',has_table_privilege(r,c.oid,'DELETE')) ORDER BY c.relname,r) FROM pg_class c CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r WHERE c.relnamespace='recruitment_erasure'::regnamespace AND c.relkind='r'),
 'functionPrivileges',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'function',p.proname,'role',r,'execute',has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY n.nspname,p.proname,r) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r WHERE n.nspname='recruitment_erasure' OR (n.nspname='public' AND (p.proname LIKE 'rec_%erasure%' OR p.proname IN ('rec_retention_scope','rec_retention_overview','rec_set_retention','rec_archive_material','rec_enqueue_due_retention','sweep_application_retention'))))
) AS catalog;

SELECT proname,md5(prosrc) AS installed_md5,
 md5(replace(prosrc,E'\n IF TG_OP = \'DELETE\' AND recruitment_erasure.releases(TG_RELID,to_jsonb(OLD)) THEN RETURN OLD; END IF;','')) AS original_md5,
 prosecdef AS definer,proconfig AS config,to_jsonb(proacl) AS acl
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('bcp_guard_answer','bcp_guard_assignment','bcp_guard_conduct_report','scp_guard_manifest_immutable','scp_guard_snapshot_immutable','sentinel_erase_assignment','sp_passport_session_write_guard') ORDER BY proname;

SELECT jsonb_build_object(
 'activationEnabled',(SELECT enabled FROM recruitment_erasure.activation WHERE singleton),
 'jobs',(SELECT count(*) FROM public.recruitment_erasure_jobs),
 'rowCapabilities',(SELECT count(*) FROM recruitment_erasure.row_capability),
 'linkedFiles',(SELECT count(*) FROM public.storage_erasure_queue WHERE recruitment_erasure_job_id IS NOT NULL),
 'archivedApplications',(SELECT count(*) FROM public.job_applications WHERE employer_archived_at IS NOT NULL),
 'archivedRecruitments',(SELECT count(*) FROM public.recruitment_settings WHERE archived_at IS NOT NULL),
 'retentionPeriods',(SELECT jsonb_object_agg(months,n) FROM (SELECT recruitment_retention_months months,count(*) n FROM public.employers GROUP BY 1) p),
 'cronRelation',to_regclass('cron.job')::text,
 'accounts',(SELECT count(*) FROM auth.users),
 'applications',(SELECT count(*) FROM public.job_applications),
 'passportClaims',(SELECT count(*) FROM public.sp_claims),
 'ownRuns',(SELECT count(*) FROM public.assessment_runs),
 'cvFiles',(SELECT count(*) FROM storage.objects WHERE bucket_id='job-application-cvs')
) AS state;

SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT current_setting('server_version') AS server_version;
