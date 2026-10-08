-- Empty-install rollback ONLY. Once any case has adopted content, recover the
-- app without removing this schema: permanent locks and history must survive.
-- No DELETE, approval, legacy hash update or historical report rewrite occurs.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM scp_private.interview_content_locks)
 OR EXISTS(SELECT 1 FROM scp_private.interview_content_snapshots) THEN
  RAISE EXCEPTION 'SCP_IV_CONTENT_ROLLBACK_DATA_PRESENT: keep schema and roll back the app; forward recovery required';
 END IF;
END $$;
DO $$ DECLARE _r record; _check text;
BEGIN
 FOR _r IN SELECT signature,definition FROM scp_private.interview_content_prior_functions WHERE signature<>'constraint:events' LOOP
  EXECUTE _r.definition;
 END LOOP;
 SELECT definition INTO _check FROM scp_private.interview_content_prior_functions WHERE signature='constraint:events';
 ALTER TABLE public.scp_interview_case_events DROP CONSTRAINT scp_interview_case_events_event_check;
 EXECUTE 'ALTER TABLE public.scp_interview_case_events ADD CONSTRAINT scp_interview_case_events_event_check '||_check;
 FOR _r IN SELECT t.tgname,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relnamespace='public'::regnamespace AND t.tgname IN('ri_content_serialise','ri_content_in_use','ri_content_bind','ri_content_capture','ri_content_review','ri_content_truncate') LOOP
  EXECUTE format('DROP TRIGGER %I ON public.%I',_r.tgname,_r.relname);
 END LOOP;
END $$;
DROP FUNCTION public.scp_iv_case_frozen_content(uuid);
DROP FUNCTION public.scp_iv_case_frozen_labels(uuid[]);
DROP FUNCTION public.scp_iv_acknowledge_observed_content(uuid,text,text);
DROP FUNCTION public.scp_iv_content_inventory(uuid);
DROP FUNCTION scp_private.interview_content_review_gate();
DROP FUNCTION scp_private.interview_case_content_capture();
DROP FUNCTION scp_private.interview_case_content_bind();
DROP FUNCTION scp_private.interview_capture_content(uuid,text);
DROP FUNCTION scp_private.interview_frozen_manifest(uuid);
DROP FUNCTION scp_private.interview_content_ready(uuid);
DROP FUNCTION scp_private.interview_content_guard();
DROP FUNCTION scp_private.interview_content_owner(text,jsonb);
DROP FUNCTION scp_private.interview_content_statement_lock();
DROP TABLE scp_private.interview_content_acknowledgements;
DROP TABLE scp_private.interview_content_snapshots;
DROP TABLE scp_private.interview_content_locks;
DROP TABLE scp_private.interview_client_copy_versions;
DROP FUNCTION scp_private.interview_content_append_only();
DROP FUNCTION scp_private.interview_content_lock();
DROP TABLE scp_private.interview_content_prior_functions;
