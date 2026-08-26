-- =============================================================================
-- Security hardening — the five Lovable/Supabase advisor findings
-- PHASE 2 of 2: CONTRACT. Withdraws the legacy write path.
--
-- ── DO NOT APPLY THIS BEFORE THE NEW CODE IS LIVE ────────────────────────
--
-- 20260916090000 (EXPAND) added the two governed entry points and took nothing
-- away, so it is safe to apply while the previous code is still deployed. This
-- file is the other half: it removes the direct INSERT that the PREVIOUS code
-- used, and once it is applied that code can no longer write.
--
-- The precondition is therefore a deployment fact, not a schema fact, and it is
-- the one thing this migration cannot check for itself: the application must
-- already be calling public.cd_record_funnel_event() and
-- public.cd_submit_test_feedback() rather than inserting into the tables
-- directly. In this repository that means the commit carrying
-- src/lib/career-discovery/v31-feedback.functions.ts's RPC form is live on the
-- Lovable-synced main branch.
--
-- Applied too early, the failure is bounded and silent rather than dramatic:
-- both writes are fire-and-forget by design, so anonymous funnel events and
-- test-group feedback would simply stop being recorded until the code catches
-- up. No candidate-facing flow blocks, and no data is lost that already exists.
-- It is still the wrong order.
--
-- ── WHAT THIS ACTUALLY DOES ──────────────────────────────────────────────
--
-- Exactly two things, on two tables:
--
--   * drops the `FOR INSERT TO anon, authenticated WITH CHECK (true)` policies
--     that 20260815090000 created — findings 2 and 3, verbatim;
--   * revokes the transitional INSERT grant EXPAND left in place.
--
-- Everything else in the hardening is already done. The search_path pinning,
-- the SECURITY DEFINER least-privilege work, save_career_report, the legacy
-- backup table and the validation constraints all landed in EXPAND and are not
-- touched again here. This file adds no object, changes no function body and
-- alters no product behaviour beyond closing the legacy path.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Refuse to run if EXPAND is not in place.
--
-- Not a deployment check — that one cannot be made from inside the database.
-- This is the narrower question that CAN be answered: if the governed entry
-- points are missing, withdrawing the legacy path leaves NO write path at all,
-- and anonymous telemetry stops permanently rather than temporarily. Failing
-- closed here is the difference between a sequencing mistake and an outage.
-- ---------------------------------------------------------------------------
DO $precondition$
DECLARE _entry_points integer;
BEGIN
  SELECT count(*) INTO _entry_points
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('cd_record_funnel_event', 'cd_submit_test_feedback')
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF _entry_points <> 2 THEN
    RAISE EXCEPTION
      'SECURITY_HARDENING_CONTRACT_BLOCKED: % of 2 governed entry points exist and are '
      'anon-executable. Apply 20260916090000_security_hardening_expand.sql first — '
      'withdrawing the legacy write now would leave no anonymous write path at all.',
      _entry_points;
  END IF;
END
$precondition$;

-- ---------------------------------------------------------------------------
-- Finding 2 and finding 3, closed.
--
-- The policy and the grant both have to go, and either one alone would do it:
-- PostgreSQL requires the table privilege AND a matching policy. Both are
-- removed anyway, so neither is left as a latent half-open door for a future
-- policy or a future grant to complete by accident.
--
-- The entry points keep working because they run as their owner, which is not
-- subject to this table's row-level security. That is a deliberate, narrow
-- bypass through one audited function per table, not a widened policy: neither
-- function contains a statement that can update or delete an existing row.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS cd_v31_funnel_events_insert ON public.cd_v31_funnel_events;
DROP POLICY IF EXISTS cd_test_feedback_insert     ON public.cd_test_feedback;

REVOKE INSERT ON public.cd_v31_funnel_events FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.cd_test_feedback     FROM PUBLIC, anon, authenticated;

-- `authenticated` keeps SELECT: the admin read policy is what narrows it to
-- platform admins, and without the grant that policy is dead. Re-stated rather
-- than assumed, so a REVOKE ALL added above this line in future cannot quietly
-- take the admin console's read away.
GRANT SELECT ON public.cd_v31_funnel_events TO authenticated;
GRANT SELECT ON public.cd_test_feedback     TO authenticated;

-- ---------------------------------------------------------------------------
-- The final wording. EXPAND left both comments saying "MIGRATING"; that stops
-- being true here, and a comment that outlives its phase is how the next
-- reader learns to distrust all of them.
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.cd_v31_funnel_events IS
  'Privacy-safe funnel events for the v3.1 anonymous-first flow (Execution '
  'Mandate §34). Anonymous tracking is supported and intended; the ONLY write '
  'path for anon and authenticated is cd_record_funnel_event(), which derives '
  'user_id from auth.uid() and bounds the detail payload. Direct INSERT was '
  'withdrawn: WITH CHECK (true) let any caller attribute an event to any user.';

COMMENT ON TABLE public.cd_test_feedback IS
  'Lightweight, opt-in test-group feedback (Execution Mandate §31). Never the '
  'candidate''s raw assessment answers. Anonymous submission is supported and '
  'intended; the ONLY write path for anon and authenticated is '
  'cd_submit_test_feedback(), which derives user_id from auth.uid(). Direct '
  'INSERT was withdrawn: WITH CHECK (true) let any caller attribute feedback '
  'to any user.';

-- =============================================================================
-- Post-conditions. The end state this whole change exists to reach.
-- =============================================================================

DO $post$
DECLARE
  _anon_tbl     integer;
  _bad_policy   integer;
  _entry_points integer;
BEGIN
  -- 1. anon holds no table privilege at all on either telemetry table.
  SELECT count(*) INTO _anon_tbl
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee IN ('anon', 'PUBLIC')
     AND table_name IN ('cd_v31_funnel_events', 'cd_test_feedback');
  IF _anon_tbl <> 0 THEN
    RAISE EXCEPTION 'SECURITY_HARDENING_CONTRACT_INCOMPLETE: anon/PUBLIC still hold % telemetry table grant(s)', _anon_tbl;
  END IF;

  -- 2. No INSERT policy survives on either — the WITH CHECK (true) pair is gone.
  SELECT count(*) INTO _bad_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('cd_v31_funnel_events', 'cd_test_feedback')
     AND cmd = 'INSERT';
  IF _bad_policy <> 0 THEN
    RAISE EXCEPTION 'SECURITY_HARDENING_CONTRACT_INCOMPLETE: % INSERT policy/policies survive', _bad_policy;
  END IF;

  -- 3. And the feature is still there. Closing the legacy path must not have
  --    closed anonymous telemetry with it — that would be a feature deletion
  --    wearing a security fix's clothes.
  SELECT count(*) INTO _entry_points
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('cd_record_funnel_event', 'cd_submit_test_feedback')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF _entry_points <> 2 THEN
    RAISE EXCEPTION 'SECURITY_HARDENING_CONTRACT_INCOMPLETE: anonymous telemetry lost its entry points (% of 2)', _entry_points;
  END IF;

  RAISE NOTICE 'security hardening (contract): the legacy write path is closed, both entry points live';
END
$post$;
