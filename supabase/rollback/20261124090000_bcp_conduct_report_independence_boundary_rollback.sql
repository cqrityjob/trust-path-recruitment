-- ROLLBACK for 20261124090000_bcp_conduct_report_independence_boundary.
--
-- Restores bcp_conduct_report_blockers and bcp_conduct_preview_report to the
-- definitions 20261117090000 shipped: byte-for-byte the bodies this migration
-- replaced, with their grants and comments as they were.
--
-- ── WHAT ROLLING THIS BACK MEANS, SAID PLAINLY ─────────────────────────
--
-- It REOPENS two authorisation holes. After this script runs:
--
--   an assessor whose own position is still open can read every other
--   assessor's entries, corrections and verification trail through
--   bcp_conduct_preview_report, and anchor on them — which is the single
--   thing the conduct layer exists to prevent;
--
--   any signed-in user holding a session id can read the shape of a
--   stranger's interview through bcp_conduct_report_blockers.
--
-- That is not a reason to refuse — a rollback that cannot undo its migration
-- is not a rollback, and the way back has to exist. It is a reason to say it
-- here, in the file somebody runs at two in the morning, rather than leave
-- them to discover it from the diff.
--
-- ── WHAT IT REFUSES ────────────────────────────────────────────────────
--
-- It refuses if the application still depends on the boundary. The Report tab
-- shipped on the understanding that the database enforces independence; if
-- the deployed application is the one that expects it, restoring the old
-- definitions puts a reachable leak behind a live screen. The check is on the
-- CALLERS in the catalogue, not on anything outside the database, so it is a
-- fact this script can actually establish: a view or a function that came to
-- depend on either signature since.
--
-- One transaction. A failure restores nothing rather than half of it.

BEGIN;

DO $guard$
DECLARE
  _dependents text;
BEGIN
  SELECT string_agg(DISTINCT dependent.proname, ', ')
    INTO _dependents
    FROM pg_proc dependent
    JOIN pg_namespace dn ON dn.oid = dependent.pronamespace
   WHERE dn.nspname = 'public'
     AND dependent.proname NOT IN ('bcp_conduct_preview_report',
                                   'bcp_conduct_report_blockers')
     AND (position('bcp_conduct_preview_report' in dependent.prosrc) > 0);
  IF _dependents IS NOT NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_BOUNDARY_ROLLBACK: % call(s) bcp_conduct_preview_report and were written '
      'against the guarded definition. Review them before restoring the unguarded one.',
      _dependents;
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1 · The blocker reader, exactly as 20261117090000 defined it: no
--     authentication and no case authority.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_report_blockers(_session_id uuid)
RETURNS TABLE(code text, message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.bcp_conduct_sessions%ROWTYPE;
  _positions integer;
  _unlocked integer;
  _entries integer;
  _panel public.bcp_conduct_panels%ROWTYPE;
  _undocumented integer;
BEGIN
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    code := 'BCP_CONDUCT_SESSION_NOT_FOUND';
    message := 'No such conduct session.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE state <> 'locked')
    INTO _positions, _unlocked
    FROM public.bcp_conduct_positions WHERE session_id = _session_id;

  IF _positions = 0 THEN
    code := 'BCP_CONDUCT_NO_POSITION';
    message := 'Nobody holds a position in this conversation yet.';
    RETURN NEXT;
  END IF;

  IF _unlocked > 0 THEN
    code := 'BCP_CONDUCT_POSITION_OPEN';
    message := format('%s position(s) are still open. Every participant locks their own before the report is written.', _unlocked);
    RETURN NEXT;
  END IF;

  SELECT count(*) INTO _entries
    FROM public.bcp_conduct_entries e
    JOIN public.bcp_conduct_positions p ON p.id = e.position_id
   WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL;

  IF _entries = 0 THEN
    code := 'BCP_CONDUCT_NOTHING_DOCUMENTED';
    message := 'No documentation has been recorded, so there is nothing to report.';
    RETURN NEXT;
  END IF;

  -- A panel is required only where there is more than one position: a single
  -- assessor has nobody to disagree with, and demanding a panel would be
  -- demanding a ceremony rather than a safeguard.
  IF _positions > 1 THEN
    SELECT * INTO _panel FROM public.bcp_conduct_panels WHERE session_id = _session_id;
    IF _panel.id IS NULL THEN
      code := 'BCP_CONDUCT_PANEL_REQUIRED';
      message := 'More than one position was taken, so the panel has to meet before the report is written.';
      RETURN NEXT;
    ELSIF _panel.state = 'open' THEN
      code := 'BCP_CONDUCT_PANEL_NOT_REVEALED';
      message := 'The panel has not revealed the locked positions yet.';
      RETURN NEXT;
    ELSE
      -- Every theme both assessors documented differently needs the panel to
      -- have said SOMETHING about it -- agreement or a recorded difference.
      SELECT count(*) INTO _undocumented
        FROM (SELECT DISTINCT e.item_key
                FROM public.bcp_conduct_entries e
                JOIN public.bcp_conduct_positions p ON p.id = e.position_id
               WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL
               GROUP BY e.item_key
              HAVING count(DISTINCT e.position_id) > 1) shared
       WHERE NOT EXISTS (
         SELECT 1 FROM public.bcp_conduct_panel_resolutions r
          WHERE r.session_id = _session_id AND r.item_key = shared.item_key);
      IF _undocumented > 0 THEN
        code := 'BCP_CONDUCT_RESOLUTION_MISSING';
        message := format('%s theme(s) documented by more than one assessor have no recorded panel outcome.', _undocumented);
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_report_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_report_blockers(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2 · The preview, exactly as 20261117090000 defined it: case authority only,
--     with no independence check.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_preview_report(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _payload jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _payload := public.bcp_conduct_build_report_basis(_session_id);

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'payload', _payload,
    'basis_hash', public.bcp_conduct_basis_hash(_payload),
    'content_hash', public.scp_iv_content_hash(_payload),
    'blockers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', b.code, 'message', b.message)
                       ORDER BY b.code, b.message)
        FROM public.bcp_conduct_report_blockers(_session_id) b), '[]'::jsonb),
    'blocker_count', (SELECT count(*)::integer FROM public.bcp_conduct_report_blockers(_session_id)),
    'produces_score', false,
    'interpretation', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_preview_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_preview_report(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_conduct_preview_report(uuid) IS NULL;
COMMENT ON FUNCTION public.bcp_conduct_report_blockers(uuid) IS NULL;

-- ---------------------------------------------------------------------------
-- 3 · Prove the restoration is real: the guarded predicate is gone from both.
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE _src text;
BEGIN
  SELECT prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_preview_report';
  IF position('bcp_conduct_may_see_others' in _src) > 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_BOUNDARY_ROLLBACK: the preview still carries the independence check.';
  END IF;

  SELECT prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_report_blockers';
  IF position('scp_iv_can_read_case' in _src) > 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_BOUNDARY_ROLLBACK: the blocker reader still carries the case authority.';
  END IF;
END
$proof$;

COMMIT;
