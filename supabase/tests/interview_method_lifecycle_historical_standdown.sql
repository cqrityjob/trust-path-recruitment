-- DISPOSABLE HISTORICAL TEST HARNESS ONLY, never product rollback.
-- Current-schema lifecycle assertions and races must run first. Older snapshot
-- tests deliberately remove070's private helper. Stand down only this new
-- consumer in the EMPTY test DB and remove that helper call from withdrawal
-- RPCs; retain terminal-start denial and grant-revocation safeguards.
DO $$
DECLARE _signature text; _definition text; _lock text:=E'  PERFORM scp_private.interview_content_lock();\n';
BEGIN
 IF current_database() NOT LIKE '%ci_test%' THEN
  RAISE EXCEPTION 'SCP_IV_LIFECYCLE_HISTORICAL_TEST_DB_REQUIRED';
 END IF;
 IF EXISTS(SELECT 1 FROM public.scp_interview_cases)
 OR EXISTS(SELECT 1 FROM scp_private.interview_content_snapshots)
 OR EXISTS(SELECT 1 FROM scp_private.interview_content_locks) THEN
  RAISE EXCEPTION 'SCP_IV_LIFECYCLE_HISTORICAL_TEST_REQUIRES_EMPTY';
 END IF;
 DROP TRIGGER ri_pilot_grant_serialise ON public.scp_interview_pack_pilot_grants;
 FOREACH _signature IN ARRAY ARRAY[
  'public.scp_interview_suspend_version(uuid,text)',
  'public.scp_interview_retire_version(uuid,text)'] LOOP
  SELECT pg_get_functiondef(_signature::regprocedure) INTO _definition;
  IF position(_lock IN _definition)=0 THEN
   RAISE EXCEPTION 'SCP_IV_LIFECYCLE_HISTORICAL_PRECONDITION';
  END IF;
  EXECUTE replace(_definition,_lock,'');
 END LOOP;
END $$;
