-- Rollback of 20270121090000_bcp_conduct_reopen_after_exposure.
--
-- !! THIS REOPENS P1-J !! An assessor can again read the others' locked
-- positions and then reopen and revise their own. Run it ONLY in an isolated
-- test database (scripts/db-test.sh cycles it). Restores the hosted body
-- exactly (md5(prosrc) 55e5e05559d9b9624bf411b68ee2f322).
CREATE OR REPLACE FUNCTION public.bcp_conduct_reopen_position(_operation_id uuid, _position_id uuid, _expected_revision integer, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REOPEN_REASON_REQUIRED: say why, so the history can be read afterwards.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_reopen_position',
    'position_id', _position_id, 'expected_revision', _expected_revision, 'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_position_id::text, 0));

  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';
  END IF;
  IF _p.assessor_id <> _caller THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only reopen your own position.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',
      _p.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _p.state <> 'locked' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_LOCKED: this position is not locked.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Once the panel has revealed, everyone has already read this position.
  -- Reopening it then would let a recorded view be revised in the light of
  -- other people's -- the exact dependency the whole design refuses.
  IF EXISTS (SELECT 1 FROM public.bcp_conduct_panels p
              WHERE p.session_id = _p.session_id AND p.state IN ('revealed', 'concluded')) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_PANEL_ALREADY_REVEALED: this position has already been seen by the panel and cannot be reopened.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.bcp_conduct_positions
     SET state = 'open', locked_at = NULL, lock_operation_id = NULL,
         reopened_at = now(), reopened_by = _caller, reopen_reason = _reason,
         reopen_count = reopen_count + 1, revision = revision + 1
   WHERE id = _position_id;

  _result := jsonb_build_object('position_id', _position_id, 'session_id', _p.session_id,
    'state', 'open', 'reopen_count', _p.reopen_count + 1, 'position_revision', _p.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_position_reopened', 'locked', 'open', _reason,
    _s.bound_content_hash, _p.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _p.session_id, 'position_id', _position_id));

  RETURN _result;
END;
$function$
;

DO $$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE proname = 'bcp_conduct_reopen_position'
            AND pronamespace = 'public'::regnamespace)) <> '55e5e05559d9b9624bf411b68ee2f322' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REOPEN_ROLLBACK: the restored body is not the hosted one';
  END IF;
  RAISE NOTICE 'BCP_CONDUCT_REOPEN_ROLLBACK ok: the pre-fix body is restored';
END $$;
