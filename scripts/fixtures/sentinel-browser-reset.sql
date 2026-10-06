-- Optional repeat of the disposable browser rehearsal. Never production.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'sentinel_e2e' THEN RAISE EXCEPTION 'SENTINEL_LOCAL_ONLY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sentinel_forms WHERE preview_only AND assignments_enabled) THEN RAISE EXCEPTION 'SYNTHETIC_PREVIEW_REQUIRED'; END IF;
END $$;
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
