-- Optional repeat of the disposable browser rehearsal. Never production.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'sentinel_e2e' THEN RAISE EXCEPTION 'SENTINEL_LOCAL_ONLY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sentinel_forms WHERE preview_only AND assignments_enabled AND version='sentinel-v1-a.preview') THEN RAISE EXCEPTION 'SYNTHETIC_PREVIEW_REQUIRED'; END IF;
END $$;
BEGIN;
-- Test reset only: the product intentionally forbids reopening a closed run.
-- Inside this transaction, restore the two fake lineages together rather than
-- teaching the application or its production triggers to reopen assessments.
SET LOCAL session_replication_role = replica;
-- Restore only the two synthetic assignments, including a previous cancellation.
UPDATE public.assessment_assignments aa SET status='opened',started_at=NULL,completed_at=NULL,
 expires_at=now()+interval '1 day'
FROM public.sentinel_sessions s,auth.users u
WHERE aa.id=s.assignment_id AND u.id=s.recipient_user_id
 AND u.email IN('anna@journey.test','bo@journey.test') AND s.version='sentinel-v1-a.preview';
UPDATE public.scp_attempts a SET status='in_progress',submitted_at=NULL,scored_at=NULL
FROM public.sentinel_sessions s,auth.users u
WHERE a.id=s.attempt_id AND u.id=s.recipient_user_id
 AND u.email IN('anna@journey.test','bo@journey.test') AND s.version='sentinel-v1-a.preview';
UPDATE public.sentinel_sessions s SET status='ready',answers='{}',revision=0,
 started_at=NULL,deadline=NULL,finished_at=NULL,report=NULL,report_visible=false,
 items=f.items,version=f.version
FROM public.sentinel_forms f,auth.users u
WHERE u.id=s.recipient_user_id AND u.email IN('anna@journey.test','bo@journey.test')
 AND f.preview_only;
UPDATE public.assessment_assignments aa SET language='en'
FROM auth.users u, public.sentinel_forms f
WHERE u.id=aa.recipient_user_id AND u.email='bo@journey.test'
 AND aa.scp_assessment_version_id=f.assessment_version_id AND f.preview_only;
COMMIT;
