-- Destructive schema rollback ONLY for an unused installation. After any
-- historical session exists, disable new assignments instead; preserve reports.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.sentinel_sessions) THEN
  RAISE EXCEPTION 'SENTINEL_ROLLBACK_BLOCKED: historical sessions exist; disable assignments instead';
 END IF;
END $$;
DROP TRIGGER sentinel_allocate ON public.scp_attempts;
DROP TRIGGER sentinel_attempt_guard ON public.scp_attempts;
DROP TRIGGER sentinel_assignment_guard ON public.assessment_assignments;
DROP TRIGGER sentinel_erase_assignment ON public.assessment_assignments;
DROP FUNCTION public.sentinel_status(uuid[]);
DROP FUNCTION public.sentinel_session(uuid,text,text,text,integer);
DROP FUNCTION public.sentinel_report(uuid,uuid);
DROP FUNCTION public.sentinel_employer_action(uuid,text,integer);
DROP FUNCTION public.sentinel_review();
DROP FUNCTION public.sentinel_practice(uuid);
DROP FUNCTION public.sentinel_catalog(uuid);
DROP FUNCTION public.sentinel_finish_internal(uuid,boolean);
DROP FUNCTION public.sentinel_allocate();
DROP FUNCTION public.sentinel_attempt_guard();
DROP FUNCTION public.sentinel_assignment_guard();
DROP FUNCTION public.sentinel_erase_assignment();
DROP TABLE public.sentinel_sessions;
DROP TABLE public.sentinel_forms;
DELETE FROM public.scp_forms WHERE slug='sentinel-v1-a';
DELETE FROM public.scp_assessment_versions WHERE definition_id IN(SELECT id FROM public.scp_assessment_definitions WHERE slug='abstract_reasoning_v1');
DELETE FROM public.scp_assessment_definitions WHERE slug='abstract_reasoning_v1';
DO $$ DECLARE body text; BEGIN
 body:=pg_get_functiondef('public.scp_employer_assign(uuid,uuid,text,timestamptz,text,text,uuid,text,uuid,uuid)'::regprocedure);
 EXECUTE replace(body,'IF NOT _has_items AND NOT EXISTS (SELECT 1 FROM public.sentinel_forms sf WHERE sf.assessment_version_id = _assessment_version_id) THEN','IF NOT _has_items THEN');
END $$;
