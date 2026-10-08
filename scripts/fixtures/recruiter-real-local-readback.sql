-- Read-only companion to recruiter-real-local-setup.sql. No identifying content.
-- UUIDs below identify ONLY the reserved synthetic E1/E2 namespace.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'at',clock_timestamp(),'server_version',current_setting('server_version'),
 'migration_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
 'migration_frontier',(SELECT max(version) FROM supabase_migrations.schema_migrations),
 'auth_users',(SELECT count(*) FROM auth.users),
 'auth_confirmed_invalid_bcrypt',(SELECT count(*) FROM auth.users WHERE email LIKE 'ri-real-%@fixture.invalid'
    AND email_confirmed_at IS NOT NULL AND encrypted_password ~ '^\$2[aby]\$'),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('employer_id',employer_id,'user_id',user_id,'role',role,'status',status) ORDER BY employer_id,role,user_id)
    FROM public.employer_memberships WHERE employer_id IN ('e8050000-1111-4000-8000-000000000001','e8050000-1111-4000-8000-000000000002')),
 'reviewer_grants',(SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'allowed_use_cases',allowed_use_cases,'revoked',revoked_at IS NOT NULL))
    FROM public.scp_employer_reviewers WHERE employer_id='e8050000-1111-4000-8000-000000000001'),
 'platform_roles',(SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'role',role)) FROM public.user_roles WHERE user_id IN
    (SELECT id FROM auth.users WHERE email LIKE 'ri-real-%@fixture.invalid')),
 'jobs',(SELECT count(*) FROM public.jobs WHERE employer_id='e8050000-1111-4000-8000-000000000001'),
 'applications',(SELECT count(*) FROM public.job_applications WHERE employer_id='e8050000-1111-4000-8000-000000000001'),
 'receipts_enabled',(SELECT count(*) FROM public.recruitment_settings WHERE employer_id='e8050000-1111-4000-8000-000000000001' AND receipt_enabled),
 'cases',(SELECT count(*) FROM public.scp_interview_cases WHERE employer_id IN ('e8050000-1111-4000-8000-000000000001','e8050000-1111-4000-8000-000000000002')),
 'reports',(SELECT count(*) FROM public.scp_interview_reports r JOIN public.scp_interview_cases c ON c.id=r.case_id WHERE c.employer_id IN ('e8050000-1111-4000-8000-000000000001','e8050000-1111-4000-8000-000000000002')),
 'ai_enabled',(SELECT ai_enabled FROM public.scp_interview_ai_config WHERE id),
 'transcript_enabled',(SELECT transcript_enabled FROM public.scp_interview_ai_config WHERE id),
 'ai_runs',(SELECT count(*) FROM public.scp_interview_ai_runs),
 'sw_ai_runs',(SELECT count(*) FROM public.sw_ai_runs),
 'recruitment_messages',(SELECT count(*) FROM public.recruitment_messages),
 'email_attempts',(SELECT coalesce(sum(email_attempts),0) FROM public.recruitment_messages),
 'erasure_jobs',(SELECT count(*) FROM public.recruitment_erasure_jobs),
 'storage_erasure_queue',(SELECT count(*) FROM public.storage_erasure_queue),
 'role_versions',(SELECT jsonb_agg(jsonb_build_object('id',v.id,'slug',p.slug,'version',v.version_number,
    'status',v.content_status,'pilot_availability',v.pilot_availability,'stored_hash',v.content_hash,
    'questions',(SELECT count(*) FROM public.scp_interview_core_questions q WHERE q.pack_version_id=v.id),
    'competencies',(SELECT count(*) FROM public.scp_interview_pack_competencies c WHERE c.pack_version_id=v.id)) ORDER BY p.slug,v.version_number)
    FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id WHERE p.slug IN ('vaktare-se','security-manager-se'))
);
COMMIT;
