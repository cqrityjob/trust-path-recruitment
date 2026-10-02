-- =============================================================================
-- P1-J -- a BESKT position cannot be reopened once the others are readable
-- =============================================================================
--
-- THE DEFECT (2026-10-02 final audit, P1-J, confirmed from the definitions
-- and a rolled-back probe):
--
--   bcp_conduct_may_see_others lets an assessor read the other positions once
--   their own is locked AND (the panel has revealed OR nobody is still open).
--   bcp_conduct_reopen_position refused only once a panel was revealed or
--   concluded. So when every position was locked and no panel existed yet (or
--   it was still open), assessor A could read B's locked position, reopen A's
--   own, change it and lock it again -- the anchoring the reopen guard's own
--   comment says "the whole design refuses" (probe: A_reads_B_entries=1,
--   reopen_err=none, A_state_now=open).
--
-- THE FIX: bcp_conduct_reopen_position also refuses
-- (BCP_CONDUCT_POSITIONS_ALREADY_SEEN) when the session has another position
-- and every other position is locked -- exactly the moment may_see_others
-- opens. A reopen while any other assessor is still open (nothing readable
-- yet) is unchanged. The body is otherwise the hosted one (md5
-- 55e5e05559d9b9624bf411b68ee2f322, pinned by the rollback); the added block
-- is marked 20270121090000.
--
-- NOT CHANGED: may_see_others; locking; the panel; every other function; any
-- row.
--
-- Rollback: supabase/rollback/20270121090000_bcp_conduct_reopen_after_exposure_rollback.sql
-- Suite:    supabase/tests/bcp_interview_conduct_test.sql (C7.9-C7.12)
-- =============================================================================

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

  -- 20270121090000 (P1-J): once every position in the session is locked,
  -- bcp_conduct_may_see_others opens the others to each assessor -- with or
  -- without a panel. A position reopened from there could be revised in the
  -- light of them, the dependency the reveal guard above refuses. So once
  -- every OTHER position is locked as well, none is reopened. (A session with
  -- no other position has nothing to read and is unaffected.)
  IF EXISTS (SELECT 1 FROM public.bcp_conduct_positions o
              WHERE o.session_id = _p.session_id AND o.id <> _p.id)
     AND NOT EXISTS (SELECT 1 FROM public.bcp_conduct_positions o
                      WHERE o.session_id = _p.session_id AND o.id <> _p.id
                        AND o.state <> 'locked') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITIONS_ALREADY_SEEN: every position is locked, so the others have been readable; this position cannot be reopened.'
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

DO $$
DECLARE _src text := (SELECT prosrc FROM pg_proc WHERE proname = 'bcp_conduct_reopen_position'
                         AND pronamespace = 'public'::regnamespace);
BEGIN
  IF position('BCP_CONDUCT_POSITIONS_ALREADY_SEEN' IN _src) = 0 OR position('20270121090000' IN _src) = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REOPEN_PROOF: bcp_conduct_reopen_position does not refuse after exposure';
  END IF;
  RAISE NOTICE 'BCP_CONDUCT_REOPEN_PROOF ok: no position is reopened once the others are readable';
END $$;
