-- =============================================================================
-- ROLLBACK — security hardening, PHASE 2 of 2: CONTRACT
--
-- Reverses 20260916091000_security_hardening_contract.sql.
--
-- ── WHAT THIS IS FOR ───────────────────────────────────────────────────
--
-- The realistic reason to run this is a sequencing mistake: CONTRACT applied
-- before the new code was live, so the deployed application is still inserting
-- directly and its funnel events and feedback have gone quiet. This file
-- reopens the legacy path and buys back the time to deploy the code properly.
--
-- It returns the database to the POST-EXPAND state, not to the original one.
-- The governed entry points, the search_path pinning, the SECURITY DEFINER
-- least-privilege work, save_career_report and the legacy backup table are all
-- EXPAND's and are untouched here. Both write paths work afterwards, which is
-- exactly the state the expand/contract split is designed to be safe in.
--
-- ── WHAT IT REOPENS ────────────────────────────────────────────────────
--
-- Findings 2 and 3, deliberately: `FOR INSERT TO anon, authenticated WITH
-- CHECK (true)` over two tables carrying a user_id that references auth.users
-- and a session_id that references cd_sessions. While this is in place, any
-- holder of the publishable key can attribute a funnel event or a feedback row
-- to another candidate's account and another candidate's session.
--
-- That is what the state before CONTRACT was, and a rollback that quietly
-- declined to restore it would not be a rollback. Treat it as temporary.
--
-- ── WHAT IT DOES NOT REOPEN ────────────────────────────────────────────
--
-- The inherited anon SELECT and anon TRUNCATE on both tables. EXPAND revoked
-- those and EXPAND owns them; CONTRACT never touched either, so there is
-- nothing here to put back. Rows are untouched: nothing in this file deletes.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · Reopen the legacy write path
--
-- Both halves, because PostgreSQL needs both: the table privilege AND a
-- matching policy. Restoring one without the other would look like a rollback
-- and still refuse every write.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS cd_v31_funnel_events_insert ON public.cd_v31_funnel_events;
CREATE POLICY cd_v31_funnel_events_insert ON public.cd_v31_funnel_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS cd_test_feedback_insert ON public.cd_test_feedback;
CREATE POLICY cd_test_feedback_insert ON public.cd_test_feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT INSERT ON public.cd_v31_funnel_events TO anon, authenticated;
GRANT INSERT ON public.cd_test_feedback     TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · The transitional wording EXPAND left, restored with it
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.cd_v31_funnel_events IS
  'Privacy-safe funnel events for the v3.1 anonymous-first flow (Execution '
  'Mandate §34). MIGRATING (expand phase): the governed write path is '
  'cd_record_funnel_event(), which derives user_id from auth.uid(); the legacy '
  'direct INSERT is still open for the currently deployed code and is '
  'withdrawn by 20260916091000.';

COMMENT ON TABLE public.cd_test_feedback IS
  'Lightweight, opt-in test-group feedback (Execution Mandate §31). Never the '
  'candidate''s raw assessment answers. MIGRATING (expand phase): the governed '
  'write path is cd_submit_test_feedback(), which derives user_id from '
  'auth.uid(); the legacy direct INSERT is still open for the currently '
  'deployed code and is withdrawn by 20260916091000.';

-- ---------------------------------------------------------------------------
-- 3 · Prove it landed in the post-EXPAND state, not somewhere in between
-- ---------------------------------------------------------------------------

DO $verify$
DECLARE
  _policies     integer;
  _anon_priv    text;
  _entry_points integer;
BEGIN
  SELECT count(*) INTO _policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('cd_v31_funnel_events', 'cd_test_feedback')
     AND cmd = 'INSERT';
  IF _policies <> 2 THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: % of 2 legacy INSERT policies restored', _policies;
  END IF;

  -- Exactly INSERT and nothing more: the post-EXPAND shape. Anything wider
  -- means this file put back a privilege that belongs to EXPAND's rollback.
  SELECT COALESCE(string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type), '')
    INTO _anon_priv
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee = 'anon'
     AND table_name IN ('cd_v31_funnel_events', 'cd_test_feedback');
  IF _anon_priv <> 'INSERT' THEN
    RAISE EXCEPTION
      'ROLLBACK WRONG SHAPE: anon holds [%] on the telemetry tables, expected exactly INSERT', _anon_priv;
  END IF;

  -- EXPAND's half must still be standing. If the entry points are gone, this
  -- is not the post-EXPAND state and something ran out of order.
  SELECT count(*) INTO _entry_points
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('cd_record_funnel_event', 'cd_submit_test_feedback')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF _entry_points <> 2 THEN
    RAISE EXCEPTION
      'ROLLBACK OUT OF ORDER: % of 2 governed entry points survive. The expand rollback '
      'appears to have run first.', _entry_points;
  END IF;

  RAISE NOTICE 'security hardening (contract) rollback: both write paths open, post-expand state restored';
END
$verify$;

COMMIT;
