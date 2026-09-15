-- Read-only. Execute only in the intended project after separately approved deployment.
SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace
AND relname IN ('sp_credential_classes','sp_credential_jurisdictions','sp_credential_definition_metadata',
'sp_credential_definition_jurisdictions','sp_credential_adapter_mappings','sp_credential_details',
'sp_evidence_extractions','sp_credential_disclosure_policy','sp_credential_share_events') ORDER BY relname;
SELECT 'sp_credential_classes' AS table_name,count(*) FROM public.sp_credential_classes
UNION ALL SELECT 'sp_credential_jurisdictions',count(*) FROM public.sp_credential_jurisdictions
UNION ALL SELECT 'sp_credential_definition_metadata',count(*) FROM public.sp_credential_definition_metadata
UNION ALL SELECT 'sp_credential_definition_jurisdictions',count(*) FROM public.sp_credential_definition_jurisdictions
UNION ALL SELECT 'sp_credential_adapter_mappings',count(*) FROM public.sp_credential_adapter_mappings
UNION ALL SELECT 'sp_credential_details',count(*) FROM public.sp_credential_details
UNION ALL SELECT 'sp_evidence_extractions',count(*) FROM public.sp_evidence_extractions
UNION ALL SELECT 'sp_credential_disclosure_policy',count(*) FROM public.sp_credential_disclosure_policy
UNION ALL SELECT 'sp_credential_share_events',count(*) FROM public.sp_credential_share_events;
SELECT schemaname,tablename,policyname,permissive,roles,cmd FROM pg_policies
WHERE policyname IN ('sp_credential_session_read','sp_private_session_read','sp_evidence_session_read') ORDER BY schemaname,tablename;
SELECT p.proname,p.prosecdef,p.proconfig,
has_function_privilege('anon',p.oid,'execute') AS anon_execute,
has_function_privilege('authenticated',p.oid,'execute') AS authenticated_execute
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
('sp_passport_session_active','sp_passport_session_write_guard','sp_save_international_credential',
'sp_create_credential_disclosure_v2','sp_preview_credential_disclosure_v2','sp_credential_payload_v2',
'sp_disclosure_payload_v1','sp_get_disclosure_session') ORDER BY p.proname;
SELECT id,public FROM storage.buckets WHERE id='passport-evidence';
