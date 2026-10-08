BEGIN;
-- Created by CLI as 20261008074656; renamed to next approved canonical slot.
-- Business CAS conflicts are final input decisions, not engine serialization
-- failures. PostgREST14 retries custom40001 indefinitely. Preserve every
-- domain message, argument/default, owner, ACL and product rule; return409.
CREATE TABLE scp_private.interview_conflict_prior_functions (
  signature text PRIMARY KEY,
  definition text NOT NULL
);
ALTER TABLE scp_private.interview_conflict_prior_functions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scp_private.interview_conflict_prior_functions
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE _signature text; _message text; _definition text; _pattern text; _count integer;
BEGIN
  FOR _signature, _message IN SELECT * FROM (VALUES
    ('public.scp_iv_save_session_process(uuid,text,text,timestamptz)','SCP_IV_SESSION_PROCESS_STALE'),
    ('public.scp_iv_review_manual_finding(uuid,bigint,text,text,text,text,date)','SCP_IV_FINDING_STALE'),
    ('public.scp_iv_acknowledge_observed_content(uuid,text,text)','SCP_IV_CONTENT_STALE'),
    ('public.rec_set_recruitment_responsible(uuid,uuid,integer)','STALE_VERSION'),
    ('public.rec_complete_recruitment(uuid,text,text,integer)','STALE_VERSION'),
    ('public.rec_set_application_responsible(uuid,uuid,integer)','STALE_VERSION'),
    ('public.rec_set_application_stage(uuid,text,text,text)','STALE_APPLICATION_STAGE'),
    ('public.rec_save_booking(uuid,uuid,timestamptz,integer,text,text,text,text,text,integer)','STALE_VERSION'),
    ('public.rec_set_booking_status(uuid,text,text,integer)','STALE_VERSION'),
    ('public.rec_set_receipt_settings(uuid,boolean,text,text,text,text,integer)','STALE_VERSION')
  ) AS chosen(signature,message) LOOP
    IF to_regprocedure(_signature) IS NULL THEN RAISE EXCEPTION 'RI_CONFLICT_FUNCTION_MISSING: %',_signature; END IF;
    _definition:=pg_get_functiondef(_signature::regprocedure);
    INSERT INTO scp_private.interview_conflict_prior_functions VALUES(_signature,_definition);
    _pattern:='RAISE[[:space:]]+EXCEPTION[[:space:]]+'||quote_literal(_message)
      ||'[[:space:]]+USING[[:space:]]+ERRCODE[[:space:]]*=[[:space:]]*''serialization_failure''';
    SELECT count(*) INTO _count FROM regexp_matches(_definition,_pattern,'gi');
    IF _count<>1 THEN RAISE EXCEPTION 'RI_CONFLICT_SOURCE_PRECONDITION: % (% matches)',_signature,_count; END IF;
    _definition:=regexp_replace(_definition,_pattern,
      'RAISE EXCEPTION '||quote_literal(_message)||' USING ERRCODE = ''PT409''','gi');
    EXECUTE _definition;
  END LOOP;
  FOREACH _signature IN ARRAY ARRAY['public.scp_iv_set_session_state(uuid,text,text,text,text)',
    'public.scp_iv_guard_finding_revision()'] LOOP
    INSERT INTO scp_private.interview_conflict_prior_functions VALUES(_signature,pg_get_functiondef(_signature::regprocedure));
  END LOOP;
END $$;

-- Always acquire the case before the session. A normal status write used to
-- acquire session first, then KEY SHARE on the case through the event FK.
-- NO KEY UPDATE still serializes writers/finalisation, while remaining
-- compatible with child INSERT foreign-key checks. No case/session ID changes.
DO $$ DECLARE _definition text; _needle text;
BEGIN
  _definition:=pg_get_functiondef('public.scp_iv_set_session_state(uuid,text,text,text,text)'::regprocedure);
  _needle:='SELECT status INTO _old FROM public.scp_interview_sessions WHERE id = _session_id;';
  IF position(_needle IN _definition)=0 THEN RAISE EXCEPTION 'RI_CONFLICT_SESSION_STATE_PRECONDITION'; END IF;
  _definition:=replace(_definition,_needle,$replacement$
  PERFORM 1 FROM public.scp_interview_cases WHERE id = _case_id FOR NO KEY UPDATE;
  IF NOT public.scp_iv_can_write_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT status INTO _old FROM public.scp_interview_sessions WHERE id = _session_id FOR NO KEY UPDATE;
$replacement$);
  EXECUTE _definition;
  _definition:=pg_get_functiondef('public.scp_iv_save_session_process(uuid,text,text,timestamptz)'::regprocedure);
  IF (length(_definition)-length(replace(_definition,'FOR UPDATE','')))/length('FOR UPDATE')<>2 THEN
    RAISE EXCEPTION 'RI_CONFLICT_SESSION_PROCESS_LOCK_PRECONDITION';
  END IF;
  EXECUTE replace(_definition,'FOR UPDATE','FOR NO KEY UPDATE');
END $$;

-- Direct owner/admin finding review locks its finding before its trigger can
-- see the case. Shared case locks prevent finalisation's FOR UPDATE, but do
-- not conflict with each other, so direct and RPC review cannot deadlock on
-- finding->case versus case->finding. The finding row lock/revision is still
-- exclusive. CREATE retains its serial case lock and idempotency contract.
DO $$ DECLARE _definition text; _needle text;
BEGIN
  _definition:=pg_get_functiondef('public.scp_iv_review_manual_finding(uuid,bigint,text,text,text,text,date)'::regprocedure);
  _needle:='WHERE c.id = _case_id FOR UPDATE;';
  IF position(_needle IN _definition)=0 THEN RAISE EXCEPTION 'RI_CONFLICT_FINDING_REVIEW_LOCK_PRECONDITION'; END IF;
  EXECUTE replace(_definition,_needle,'WHERE c.id = _case_id FOR KEY SHARE;');
  _definition:=pg_get_functiondef('public.scp_iv_guard_finding_revision()'::regprocedure);
  _needle:='WHERE id = NEW.case_id FOR UPDATE;';
  IF position(_needle IN _definition)=0 THEN RAISE EXCEPTION 'RI_CONFLICT_FINDING_DIRECT_LOCK_PRECONDITION'; END IF;
  EXECUTE replace(_definition,_needle,'WHERE id = NEW.case_id FOR KEY SHARE;');
END $$;
-- Engine-generated40001 is untouched. Sentinel, CV, source text, snapshots,
-- approvals, AI, lifecycle decisions and final report payloads are untouched.
COMMIT;
