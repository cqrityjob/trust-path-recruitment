-- ===========================================================================
-- BESKT — the report preview must obey the independence rule
--
-- 20261127090000
--
-- ── WHAT IS WRONG TODAY ────────────────────────────────────────────────
--
-- 20261117090000 shipped two report readers that do not apply the
-- authorisation their own domain already defines. Both are applied in
-- production, and both are reachable by any signed-in caller.
--
--   bcp_conduct_preview_report
--       Guards on authentication, the session, and scp_iv_can_read_case —
--       and then calls bcp_conduct_build_report_basis, which is SECURITY
--       DEFINER and therefore reads past bcp_conduct_positions_own_or_revealed,
--       bcp_conduct_entries_own_or_revealed and
--       bcp_conduct_verifications_own_or_revealed. It never calls
--       bcp_conduct_may_see_others. So it returns EVERY assessor's entries,
--       correction chains and verification trails to anyone who may read the
--       case, including an assessor whose own position is still open. The
--       blocker list comes back ALONGSIDE the payload, not instead of it, so
--       it withholds nothing.
--
--       An assessor could therefore read a colleague's locked record before
--       taking their own position and anchor on it. Independent positions are
--       the reason the conduct layer exists; this is the hole that empties it.
--
--   bcp_conduct_report_blockers
--       No authorisation of any kind — not authentication, not the case
--       authority — while being SECURITY DEFINER and granted to
--       `authenticated`. Any signed-in user holding a session id learned the
--       shape of a stranger's interview: how many assessors, how many still
--       open, whether anything is documented, whether a panel has revealed,
--       and how many themes two assessors disagree about.
--
-- ── WHAT THIS MIGRATION DOES ───────────────────────────────────────────
--
-- Re-creates exactly those two functions, with exactly those two checks
-- added. Nothing else changes: no table, no policy, no grant, no signature,
-- no other function, and no row. Both keep their owner, their
-- SECURITY DEFINER marking, their fixed search_path and their existing
-- privilege set, which the postflight re-proves against the catalogue.
--
-- ── WHY THE PREDICATE IS REUSED AND NOT RE-DERIVED ─────────────────────
--
-- bcp_conduct_may_see_others is the canonical answer to "may this caller see
-- another assessor's material yet": the caller's own position is locked AND
-- either the panel has revealed or nobody is still open. bcp_conduct_workspace
-- answers `others_visible` from it, and the three row policies enforce the
-- same shape. Writing the condition out again here would create a second
-- answer to one question, and the two would eventually disagree.
--
-- ── WHAT IS DELIBERATELY NOT CHANGED ───────────────────────────────────
--
--   bcp_conduct_build_report_basis  already REVOKEd from authenticated and
--                                   anon; it is not a reachable oracle, and
--                                   the postflight keeps it that way.
--   bcp_conduct_final_report        a finalised report cannot exist until the
--                                   blocker sweep passed, which requires every
--                                   position locked. Reading the finished
--                                   document is the decision-maker's path and
--                                   is unchanged.
--   bcp_conduct_report_versions     version numbers, hashes, who and when. No
--                                   position content.
--   bcp_conduct_basis_hash          not SECURITY DEFINER; hashes a payload the
--                                   caller already holds.
--
-- ── BEHAVIOUR CHANGE, STATED PLAINLY ───────────────────────────────────
--
-- A participant whose own position is open can no longer preview the report.
-- That is the point. What they still have is bcp_conduct_report_blockers,
-- which names what is missing without disclosing anybody's record, and their
-- own workspace, which has always shown them their own entries.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0 · Preconditions. This migration edits two functions and nothing else, so
--     it refuses rather than silently creating them if the base is wrong.
-- ---------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regprocedure('public.bcp_conduct_preview_report(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'BCP_PRECONDITION: public.bcp_conduct_preview_report(uuid) is missing; the base must include 20261117090000.';
  END IF;
  IF to_regprocedure('public.bcp_conduct_report_blockers(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'BCP_PRECONDITION: public.bcp_conduct_report_blockers(uuid) is missing; the base must include 20261117090000.';
  END IF;
  IF to_regprocedure('public.bcp_conduct_may_see_others(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'BCP_PRECONDITION: public.bcp_conduct_may_see_others(uuid) is missing; the base must include 20261113090000.';
  END IF;
  IF to_regprocedure('public.scp_iv_can_read_case(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'BCP_PRECONDITION: public.scp_iv_can_read_case(uuid) is missing.';
  END IF;
END
$pre$;

-- ---------------------------------------------------------------------------
-- 1 · The blocker reader: authenticate, and apply the case authority.
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
  -- THE SECOND FIX. This function had no authorisation of ANY kind: not
  -- authentication, not the case authority. It is SECURITY DEFINER and
  -- granted to `authenticated`, so any signed-in user holding a session id
  -- learned how many assessors a stranger's interview has, how many are
  -- still open, whether anything is documented, whether a panel exists and
  -- has revealed, and how many themes two assessors disagree about.
  --
  -- That is metadata about somebody else's interview and about a named
  -- candidate's process, and none of it was ever meant to be readable
  -- outside the case.
  --
  -- It stays reachable on its own for a caller who MAY read the case: a
  -- screen that wants to say what is still missing without rendering the
  -- document calls exactly this, and the preview is no longer a substitute
  -- for it now that the preview waits for the independence rule.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    code := 'BCP_CONDUCT_SESSION_NOT_FOUND';
    message := 'No such conduct session.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
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

COMMENT ON FUNCTION public.bcp_conduct_report_blockers(uuid) IS
  'What still stands between a conduct session and a written report, named so '
  'a person can act on it. Every entry is a HUMAN step that has not happened, '
  'never a quality bar. Gated by scp_iv_can_read_case: the counts describe a '
  'named candidate''s process and are not readable outside the case.';

-- ---------------------------------------------------------------------------
-- 2 · The preview: apply the independence rule the rest of the layer applies.
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

  -- THE FIX. The independence rule, applied to the document as it is applied
  -- to every other read of the record.
  --
  -- `bcp_conduct_build_report_basis` is SECURITY DEFINER and therefore reads
  -- past bcp_conduct_positions_own_or_revealed and its two siblings. Without
  -- this line the preview hands every assessor's entries, corrections and
  -- verification trail to any caller who may read the case -- including an
  -- assessor whose own position is still open, which is the one thing the
  -- conduct layer exists to prevent.
  --
  -- The predicate is the canonical one, not a re-derivation: the same
  -- function the workspace answers `others_visible` from, so the two cannot
  -- drift into disagreeing about when a colleague's record becomes readable.
  --
  -- It is checked AFTER the case authority on purpose, so a stranger learns
  -- "you may not read this case" rather than the lifecycle state of a case
  -- that is none of their business.
  IF NOT public.bcp_conduct_may_see_others(_session_id) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position first; the report rests on every assessor''s record.'
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

COMMENT ON FUNCTION public.bcp_conduct_preview_report(uuid) IS
  'The BESKT report as it WOULD be written, with its hashes and what still '
  'stands in the way. Gated by scp_iv_can_read_case AND by '
  'bcp_conduct_may_see_others: a caller whose own position is still open '
  'cannot read another assessor''s record through the document, which is the '
  'independence rule the row policies carry everywhere else.';

-- ---------------------------------------------------------------------------
-- 3 · Postflight. The migration proves its own claims against the catalogue
--     rather than against its own source text.
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE
  _src text;
  _n integer;
BEGIN
  -- 3.1 The preview calls the canonical predicate, by name.
  SELECT prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_preview_report';
  IF _src IS NULL OR position('bcp_conduct_may_see_others' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: the preview does not call bcp_conduct_may_see_others.';
  END IF;
  IF position('scp_iv_can_read_case' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: the preview lost its case authority.';
  END IF;

  -- 3.2 The blocker reader authenticates AND applies the case authority.
  SELECT prosrc INTO _src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_report_blockers';
  IF _src IS NULL OR position('scp_iv_can_read_case' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: the blocker reader has no case authority.';
  END IF;
  IF position('auth.uid() IS NULL' in _src) = 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: the blocker reader does not authenticate.';
  END IF;

  -- 3.3 Both stay SECURITY DEFINER with a fixed search_path, owned by the
  --     role that owns the domain. A DEFINER function without a pinned
  --     search_path is a different and worse defect than the one being fixed.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('bcp_conduct_preview_report', 'bcp_conduct_report_blockers')
     AND p.prosecdef
     AND 'search_path=public' = ANY (coalesce(p.proconfig, ARRAY[]::text[]));
  IF _n <> 2 THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: expected 2 SECURITY DEFINER functions with a fixed search_path, found %.', _n;
  END IF;

  -- 3.4 Exactly one overload of each, so no second signature answers the
  --     same question without the checks.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_preview_report';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: % overloads of bcp_conduct_preview_report.', _n;
  END IF;
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_report_blockers';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: % overloads of bcp_conduct_report_blockers.', _n;
  END IF;

  -- 3.5 Neither is executable by anon or PUBLIC.
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('bcp_conduct_preview_report', 'bcp_conduct_report_blockers')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: % of the two report readers are anon/PUBLIC executable.', _n;
  END IF;

  -- 3.6 The internal basis builder stays internal. It is the function the
  --     preview delegates to, so an `authenticated` grant on it would make
  --     this whole migration decorative.
  IF has_function_privilege('authenticated',
       'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REPORT_BOUNDARY_PROOF: bcp_conduct_build_report_basis is client-callable; it would be an alternative oracle.';
  END IF;
END
$proof$;

COMMIT;
