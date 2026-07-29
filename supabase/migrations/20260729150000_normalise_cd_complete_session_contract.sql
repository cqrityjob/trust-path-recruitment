-- Canonicalise the cd_complete_session contract.
--
-- ── WHY THIS EXISTS ────────────────────────────────────────────────────
--
-- Two definitions of cd_complete_session are in the repository:
--
--   20260729075534  Cloud's re-issue. Deployed. Raises CD_SESSION_NOT_FOUND.
--   20260729090000  The authored file. Raises CD_UNKNOWN_SESSION.
--
-- Cloud's copy carries the EARLIER timestamp, so on a clean replay it runs
-- first and the authored file then aborts on "cd_internal_testers already
-- exists" — before it reaches its own definition. Which body survives
-- therefore depends on replay order, which is exactly the kind of drift
-- that must not decide a security-relevant contract.
--
-- This migration runs after both and states the contract outright. It does
-- not edit either earlier file, and it does not depend on either aborting.
--
-- ── CANONICAL ERROR CODE: CD_SESSION_NOT_FOUND ─────────────────────────
--
-- Cloud's deployed behaviour is the source of truth. A repository-wide
-- search found NO production consumer of CD_UNKNOWN_SESSION: the only
-- TypeScript consumers (src/lib/career-discovery/discovery.functions.ts)
-- match CD_CORE_INCOMPLETE and CD_ALREADY_COMPLETED, both of which this
-- body raises unchanged.
--
-- KNOWN INCONSISTENCY, deliberately left alone: cd_guard_evidence_matches_
-- definition() and cd_guard_snapshot_derive_versions() still raise
-- CD_UNKNOWN_SESSION for the same "no such session" condition. Aligning
-- them is a separate, wider change and is reported rather than smuggled in
-- here.
--
-- ── IDEMPOTENCY ────────────────────────────────────────────────────────
--
-- Safe on an empty replay, safe on Cloud where 20260729075534 already
-- applied, and safe to run more than once: every statement is CREATE OR
-- REPLACE, DROP ... IF EXISTS, or a guarded DO block.

-- =========================================================================
-- 1. The authoritative body
-- =========================================================================
--
-- Signature, volatility, SECURITY DEFINER, search_path hardening and the
-- return type all match the deployed function exactly. Only the contract is
-- pinned; nothing about how it is called changes.

CREATE OR REPLACE FUNCTION public.cd_complete_session(
  _session_id      uuid,
  _dna_scores      jsonb,
  _career_areas    jsonb,
  _confidence      jsonb,
  _coverage        jsonb,
  _contextual_tags text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s record; _c record; _snapshot_id uuid;
BEGIN
  -- 1. Lock for the duration of the transaction. A concurrent completion
  --    blocks here and then fails deterministically at step 3.
  SELECT * INTO _s FROM public.cd_sessions WHERE id = _session_id FOR UPDATE;

  -- 2. Unknown session. CANONICAL: CD_SESSION_NOT_FOUND / no_data_found.
  IF _s.id IS NULL THEN
    RAISE EXCEPTION 'CD_SESSION_NOT_FOUND: %', _session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 3. Ownership, enforced here as well as by RLS. This is SECURITY
  --    DEFINER, so it must never become a way to complete someone else's
  --    session. A service_role caller has auth.uid() IS NULL and is trusted.
  IF auth.uid() IS NOT NULL AND _s.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CD_NOT_SESSION_OWNER: a session may only be completed by its owner'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 4. Repeat completion is REJECTED, not silently idempotent: a second
  --    call must not look like it produced a second result.
  IF _s.status = 'completed' THEN
    RAISE EXCEPTION 'CD_ALREADY_COMPLETED: session % is already completed', _session_id
      USING ERRCODE = 'unique_violation';
  END IF;

  -- 5. The exact expected core item set, compared in both directions.
  SELECT * INTO _c FROM public.cd_session_core_completion(_session_id);
  IF array_length(_c.missing, 1) IS NOT NULL OR array_length(_c.unexpected, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'CD_CORE_INCOMPLETE: % of % scored core items; missing %, unexpected %',
      _c.answered, _c.expected, _c.missing, _c.unexpected USING ERRCODE = 'check_violation';
  END IF;

  -- 6. A report with no ranked areas is not a report.
  IF _career_areas IS NULL OR jsonb_array_length(_career_areas) = 0 THEN
    RAISE EXCEPTION 'CD_EMPTY_RANKING: a report cannot be stored with no ranked Security Career Areas'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 7. Snapshot. The version tuple and context columns are assigned by
  --    cd_guard_snapshot_derive_versions(), never by this payload — the
  --    'derived' literals below are placeholders the trigger overwrites.
  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version,
     dna_scores, career_areas, confidence, coverage, contextual_tags)
  VALUES
    (_session_id, 'derived', 'derived', 'derived', 'derived',
     COALESCE(_dna_scores, '{}'::jsonb), _career_areas,
     COALESCE(_confidence, '{}'::jsonb), COALESCE(_coverage, '{}'::jsonb),
     COALESCE(_contextual_tags, ARRAY[]::text[]))
  RETURNING id INTO _snapshot_id;

  -- 8. Flip the session. The marker is transaction-local, so it cannot leak
  --    to a client statement and let a client self-complete.
  PERFORM set_config('cqj.cd_completing', _session_id::text, true);

  UPDATE public.cd_sessions
     SET status = 'completed', completed_at = now()
   WHERE id = _session_id;

  PERFORM set_config('cqj.cd_completing', '', true);

  -- 9. Atomic: any exception above rolls back the snapshot AND the status
  --    change together, so a session can never be completed without its
  --    report, nor carry a report without being completed.
  RETURN _snapshot_id;
END; $$;

-- =========================================================================
-- 2. Drop obsolete overloads — AFTER the canonical body exists
-- =========================================================================
--
-- The Phase 1 payload-free stub would complete a session without a report.
-- 20260729090000 drops it, but on a clean replay that file aborts before
-- reaching the drop, so the stub survives. Dropped here unconditionally.
--
-- Ordered after the CREATE so there is never an instant with no callable
-- cd_complete_session.

DROP FUNCTION IF EXISTS public.cd_complete_session(uuid);

-- =========================================================================
-- 3. Grants and ownership — restated, not assumed
-- =========================================================================
--
-- CREATE OR REPLACE preserves the existing ACL, but only if the function
-- already existed. On a path where it did not, the default would be EXECUTE
-- to PUBLIC. Restating makes the outcome identical either way.

REVOKE ALL ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[])
  TO service_role;

COMMENT ON FUNCTION public.cd_complete_session(uuid, jsonb, jsonb, jsonb, jsonb, text[]) IS
  'CANONICAL. The only path to a completed Security Career Discovery '
  'session. Locks the session, enforces ownership, refuses a repeat, '
  'verifies the exact core item set, then writes the snapshot and flips '
  'status atomically. Raises CD_SESSION_NOT_FOUND for an unknown session '
  '(pinned by 20260729150000 after a repository/Cloud divergence). Scoring '
  'is computed in versioned TypeScript; this function performs no arithmetic '
  'and stores no caller-supplied version strings.';

-- =========================================================================
-- 4. Prove the end state, whichever duplicate ran first
-- =========================================================================

DO $$
DECLARE _sigs int; _stub int; _body text; _secdef boolean; _cfg text[];
BEGIN
  SELECT count(*) INTO _sigs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session';
  IF _sigs <> 1 THEN
    RAISE EXCEPTION 'CD_CONTRACT_NOT_UNIQUE: expected exactly 1 cd_complete_session overload, found %', _sigs;
  END IF;

  SELECT count(*) INTO _stub FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session' AND p.pronargs = 1;
  IF _stub <> 0 THEN
    RAISE EXCEPTION 'CD_STUB_SURVIVED: the payload-free completion path is still callable';
  END IF;

  SELECT pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    INTO _body, _secdef, _cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session';

  IF _body NOT LIKE '%CD_SESSION_NOT_FOUND%' THEN
    RAISE EXCEPTION 'CD_CONTRACT_NOT_CANONICAL: the surviving body does not raise CD_SESSION_NOT_FOUND';
  END IF;
  IF _body LIKE '%CD_UNKNOWN_SESSION%' THEN
    RAISE EXCEPTION 'CD_CONTRACT_NOT_CANONICAL: the surviving body still raises CD_UNKNOWN_SESSION';
  END IF;
  IF NOT _secdef THEN
    RAISE EXCEPTION 'CD_CONTRACT_DEGRADED: cd_complete_session must remain SECURITY DEFINER';
  END IF;
  IF _cfg IS NULL OR NOT ('search_path=public' = ANY(_cfg)) THEN
    RAISE EXCEPTION 'CD_CONTRACT_DEGRADED: search_path hardening was lost';
  END IF;

  RAISE NOTICE 'cd_complete_session canonicalised: 1 overload, SECURITY DEFINER, search_path pinned, CD_SESSION_NOT_FOUND.';
END $$;
