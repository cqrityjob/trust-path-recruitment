-- Security Career Discovery v3.0 — internal-test enablement and atomic
-- report completion.
--
-- ADDITIVE ONLY, scoped entirely to cd_* objects. Nothing about
-- career-guidance, public-career-assessment, assessment_runs,
-- assessment_responses, assessment_run_reports, employer flows or existing
-- authentication is read, altered or referenced. No Phase 1 migration is
-- rewritten.
--
-- Three things happen here:
--
--   1. The version is promoted design -> internal_test. It is still NOT
--      administrable to ordinary candidates: pilot/active plus every review
--      gate remains the only route for those, and `design` remains
--      unreachable by anyone. employer_visible stays false.
--   2. An explicit internal-tester allowlist, so the owner can authorise a
--      named tester without making them a platform administrator. Testing
--      the journey with two accounts should not require handing out admin.
--   3. cd_complete_session() gains its Phase 3 body: it now accepts the
--      DETERMINISTICALLY COMPUTED report payload, verifies the exact core
--      set under a row lock, writes the snapshot and flips the session to
--      completed -- all in one transaction, or none of it.

-- =========================================================================
-- 0. Repair: restore the scp_item_versions draft guard on a clean replay
-- =========================================================================
--
-- DEFECT FOUND DURING PRE-MERGE REVIEW, not introduced by this branch.
--
-- Lovable Cloud's sync re-issued the Security Competency migrations under
-- its own filenames. One of them, 20260728181901, begins:
--
--     DROP TRIGGER IF EXISTS scp_item_versions_insert_status ON ...;
--     CREATE TRIGGER scp_competency_versions_insert_status ...;   <-- line 15
--     ...
--     CREATE TRIGGER scp_item_versions_insert_status ...;         <-- line 17
--
-- On a clean replay the repository already carries those triggers from
-- 20260727140000 (A3), so line 15 aborts with "already exists" and line 17
-- never runs. The DROP has already taken effect. Net result: after a full
-- replay, scp_item_versions carries NO draft guard, and an item version
-- could be inserted directly as `published`, bypassing the HIGH-1 fix.
--
-- The LIVE Cloud database is unaffected -- it has all six guards, because
-- Cloud applied Lovable's file in an ordering where the trigger did not yet
-- exist. This is a replay-fidelity defect: the migration history no longer
-- reproduces the live schema, so any environment provisioned from scratch
-- would be missing a security guard.
--
-- Repaired here, idempotently and additively. No earlier migration is
-- edited. Restoring the guard is preferred over relaxing the test that
-- caught it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND c.relname = 'scp_item_versions'
      AND p.proname = 'scp_guard_version_starts_as_draft'
  ) THEN
    EXECUTE 'CREATE TRIGGER scp_item_versions_insert_status
             BEFORE INSERT ON public.scp_item_versions
             FOR EACH ROW EXECUTE FUNCTION public.scp_guard_version_starts_as_draft()';
    RAISE NOTICE 'Restored the scp_item_versions draft guard dropped by the Cloud sync re-issue.';
  END IF;
END $$;

-- =========================================================================
-- 1. Internal tester allowlist
-- =========================================================================

CREATE TABLE public.cd_internal_testers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

COMMENT ON TABLE public.cd_internal_testers IS
  'Named, informed participants authorised to run internal_test sessions of '
  'Security Career Discovery. Membership is granted only by a platform '
  'administrator through cd_grant_internal_tester(). Being on this list '
  'confers NOTHING except the ability to take the discovery itself.';

ALTER TABLE public.cd_internal_testers ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cd_internal_testers TO authenticated;
GRANT ALL    ON public.cd_internal_testers TO service_role;

-- A tester may see their own membership, so the UI can show whether access
-- is available. Nobody may see anyone else's.
CREATE POLICY "cd testers see own membership" ON public.cd_internal_testers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.cd_is_internal_tester(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_platform_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.cd_internal_testers t WHERE t.user_id = _user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.cd_is_internal_tester(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_is_internal_tester(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cd_grant_internal_tester(_user_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'CD_GRANT_REQUIRES_ADMIN: only a platform administrator may authorise an internal tester'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.cd_internal_testers (user_id, granted_by, note)
  VALUES (_user_id, auth.uid(), _note)
  ON CONFLICT (user_id) DO NOTHING;
END; $$;

REVOKE ALL ON FUNCTION public.cd_grant_internal_tester(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_grant_internal_tester(uuid, text) TO authenticated, service_role;

-- =========================================================================
-- 2. Promote the version to internal_test
-- =========================================================================
--
-- The review gates stay FALSE. That is deliberate and it is the whole point
-- of an internal test: named, informed participants exercise the instrument
-- before the gates are cleared. Ordinary candidates still cannot reach it,
-- because the pilot/active branch of the guard is unchanged and still
-- requires every gate.

UPDATE public.cd_definition_versions
SET lifecycle_status = 'internal_test'
WHERE assessment_id = 'security-career-discovery-v3'
  AND definition_version = '2026-scd-v3.0.0'
  AND lifecycle_status = 'design';

DO $$
DECLARE _status text; _visible boolean;
BEGIN
  SELECT lifecycle_status INTO _status FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3';
  SELECT employer_visible INTO _visible FROM public.assessments
   WHERE id = 'security-career-discovery-v3';

  IF _status <> 'internal_test' THEN
    RAISE EXCEPTION 'CD_PROMOTION_FAILED: expected internal_test, got %', _status;
  END IF;
  -- Belt and braces: this migration must never make the definition visible
  -- to employers, and must never reach pilot or active.
  IF _visible THEN
    RAISE EXCEPTION 'CD_EMPLOYER_VISIBILITY_LEAKED: employer_visible must remain false';
  END IF;
END $$;

-- =========================================================================
-- 3. Internal-test sessions for authorised testers
-- =========================================================================
--
-- Replaces cd_begin_internal_test_session so an allowlisted tester -- not
-- only a platform administrator -- can open a session. The lifecycle guard
-- itself is UNCHANGED and still demands the transaction-local marker, so
-- this function remains the only route.

CREATE OR REPLACE FUNCTION public.cd_begin_internal_test_session(
  _definition_version_id uuid,
  _locale text DEFAULT 'sv',
  _context_status text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text; _new_id uuid; _existing uuid;
BEGIN
  IF NOT public.cd_is_internal_tester(auth.uid()) THEN
    RAISE EXCEPTION 'CD_INTERNAL_TEST_NOT_AUTHORISED: caller is not an authorised internal tester'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT lifecycle_status INTO _status
  FROM public.cd_definition_versions WHERE id = _definition_version_id;

  IF _status IS DISTINCT FROM 'internal_test' THEN
    RAISE EXCEPTION
      'CD_NOT_AN_INTERNAL_TEST_VERSION: lifecycle_status is %, expected internal_test',
      COALESCE(_status, 'unknown') USING ERRCODE = 'check_violation';
  END IF;

  -- One unfinished session per tester per version: resume rather than
  -- duplicate. Returning the existing id makes the caller idempotent.
  SELECT id INTO _existing FROM public.cd_sessions
   WHERE user_id = auth.uid()
     AND definition_version_id = _definition_version_id
     AND status = 'in_progress'
   ORDER BY started_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  PERFORM set_config('cqj.cd_internal_test', 'on', true);

  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, context_status, is_internal_test)
  VALUES (_definition_version_id, auth.uid(), _locale, _context_status, true)
  RETURNING id INTO _new_id;

  PERFORM set_config('cqj.cd_internal_test', '', true);
  RETURN _new_id;
END; $$;

REVOKE ALL ON FUNCTION public.cd_begin_internal_test_session(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_begin_internal_test_session(uuid, text, text)
  TO authenticated, service_role;

-- =========================================================================
-- 4. Atomic completion — the Phase 3 body
-- =========================================================================
--
-- Scoring and ranking are computed DETERMINISTICALLY IN TYPESCRIPT
-- (src/lib/career-discovery/scoring.ts and area-ranking.ts), versioned and
-- unit-tested, then passed in here. This function's job is integrity and
-- atomicity, not arithmetic:
--
--   1. lock the session
--   2. refuse a repeat
--   3. verify the EXACT expected core item set
--   4. write the snapshot (versions derived by trigger, not accepted)
--   5. flip status and completed_at
--   6. commit -- or none of it
--
-- The old signature is dropped, not overloaded: leaving a one-argument
-- version callable would leave a path that completes a session with no
-- payload.

DROP FUNCTION IF EXISTS public.cd_complete_session(uuid);

CREATE OR REPLACE FUNCTION public.cd_complete_session(
  _session_id uuid,
  _dna_scores      jsonb,
  _career_areas    jsonb,
  _confidence      jsonb,
  _coverage        jsonb,
  _contextual_tags text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s record; _c record; _snapshot_id uuid;
BEGIN
  -- 1. Lock for the duration of the transaction. A concurrent completion
  --    blocks here and then fails at step 2.
  SELECT * INTO _s FROM public.cd_sessions WHERE id = _session_id FOR UPDATE;
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'CD_UNKNOWN_SESSION: %', _session_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Ownership is enforced here too, not only by RLS: this is a SECURITY
  -- DEFINER function and must not become a way to complete someone else's
  -- session. service_role callers pass auth.uid() IS NULL and are trusted.
  IF auth.uid() IS NOT NULL AND _s.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CD_NOT_SESSION_OWNER: a session may only be completed by its owner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Repeat completion is rejected with a stable code.
  IF _s.status = 'completed' THEN
    RAISE EXCEPTION 'CD_ALREADY_COMPLETED: session % is already completed', _session_id
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 3. Exact core set, both directions.
  SELECT * INTO _c FROM public.cd_session_core_completion(_session_id);
  IF array_length(_c.missing, 1) IS NOT NULL OR array_length(_c.unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_CORE_INCOMPLETE: % of % scored core items; missing %, unexpected %',
      _c.answered, _c.expected, _c.missing, _c.unexpected USING ERRCODE = 'check_violation';
  END IF;

  -- A report with no ranked areas is not a report. Refusing beats storing
  -- an empty shell that looks like a result.
  IF _career_areas IS NULL OR jsonb_array_length(_career_areas) = 0 THEN
    RAISE EXCEPTION 'CD_EMPTY_RANKING: a report cannot be stored with no ranked Security Career Areas'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Snapshot. definition/content/scoring/taxonomy versions and
  --    context_status/discovery_goal are assigned by
  --    cd_guard_snapshot_derive_versions(), never by this payload.
  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version,
     dna_scores, career_areas, confidence, coverage, contextual_tags)
  VALUES
    (_session_id, 'derived', 'derived', 'derived', 'derived',
     COALESCE(_dna_scores, '{}'::jsonb), _career_areas,
     COALESCE(_confidence, '{}'::jsonb), COALESCE(_coverage, '{}'::jsonb),
     COALESCE(_contextual_tags, ARRAY[]::text[]))
  RETURNING id INTO _snapshot_id;

  -- 5. Flip the session. The marker is what
  --    cd_guard_completion_is_server_side() checks for, and it is
  --    transaction-local, so it cannot leak to a client statement.
  PERFORM set_config('cqj.cd_completing', _session_id::text, true);

  UPDATE public.cd_sessions
     SET status = 'completed', completed_at = now()
   WHERE id = _session_id;

  PERFORM set_config('cqj.cd_completing', '', true);

  -- 6. Commit is the caller's transaction boundary. Any exception above
  --    rolls back the snapshot AND the status change together, so a
  --    session can never be completed without its report.
  RETURN _snapshot_id;
END; $$;

REVOKE ALL ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[])
  TO service_role;

COMMENT ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[]) IS
  'The ONLY path to a completed Security Career Discovery session. Locks the '
  'session, enforces ownership, refuses a repeat, verifies the exact core '
  'item set, writes the snapshot and flips status -- atomically. Scoring and '
  'ranking are computed deterministically in TypeScript and passed in; this '
  'function performs no arithmetic and stores no caller-supplied version '
  'strings.';

-- Reorder the completion guard's checks so the caller is told the ROOT
-- cause. Reopening a completed session previously reported
-- CD_COMPLETED_AT_WITHOUT_COMPLETION, because clearing the status tripped
-- the completed_at rule before the terminal rule. Replaced here rather than
-- by editing the Phase 1 migration, which is never rewritten.
CREATE OR REPLACE FUNCTION public.cd_guard_completion_is_server_side()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A completed session is terminal. Checked first: it is the root cause of
  -- any attempt to move a finished run backwards.
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'CD_COMPLETED_IS_TERMINAL: a completed session cannot be reopened'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF COALESCE(current_setting('cqj.cd_completing', true), '') <> NEW.id::text THEN
      RAISE EXCEPTION
        'CD_COMPLETION_REQUIRES_SERVER_PATH: a session is completed only by cd_complete_session(), which verifies the core item set and writes the report snapshot in one transaction'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status <> 'completed' AND NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_COMPLETED_AT_WITHOUT_COMPLETION: completed_at may only be set when status is completed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'CD_COMPLETED_AT_IMMUTABLE: completed_at cannot be rewritten'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- =========================================================================
-- 5. Report history
-- =========================================================================
--
-- Newest first, owner-scoped. A view keeps the history query in one place
-- and stops each caller re-deriving the join. RLS on the underlying tables
-- still applies -- the view is security_invoker, so it cannot become a way
-- to read another person's reports.

CREATE VIEW public.cd_my_report_history
WITH (security_invoker = true) AS
SELECT
  r.id            AS snapshot_id,
  r.session_id,
  r.generated_at,
  r.definition_version,
  r.content_version,
  r.scoring_version,
  r.taxonomy_version,
  r.context_status,
  r.discovery_goal,
  s.locale,
  s.is_internal_test,
  -- Top area key only, for the list row. The full payload needs the
  -- snapshot itself.
  (r.career_areas -> 0 ->> 'areaId') AS top_area_id
FROM public.cd_report_snapshots r
JOIN public.cd_sessions s ON s.id = r.session_id
ORDER BY r.generated_at DESC;

COMMENT ON VIEW public.cd_my_report_history IS
  'Owner-scoped Security Career Discovery report history, newest first. '
  'security_invoker, so the caller''s own RLS on cd_report_snapshots and '
  'cd_sessions governs -- this view can never widen visibility. No employer '
  'role has any grant on it.';

GRANT SELECT ON public.cd_my_report_history TO authenticated;
GRANT SELECT ON public.cd_my_report_history TO service_role;
