-- Security hardening — the EXPAND phase contract.
--
-- ── WHAT THIS SUITE IS FOR ─────────────────────────────────────────────
--
-- security_hardening_test.sql asserts the END state, after both migrations.
-- This one asserts the state IN BETWEEN, which is the state the hosted
-- database will actually sit in for however long it takes the new code to go
-- live — hours, or a weekend, or longer. Nothing else in this repository
-- exercises it, and an intermediate state nobody tests is an intermediate
-- state nobody can safely leave the system in.
--
-- The two questions it answers are the two the expand/contract split exists to
-- make answerable:
--
--   1. does the CURRENTLY DEPLOYED code still work once EXPAND is applied?
--   2. does the NEW code work at that same moment, before CONTRACT?
--
-- Both must be yes simultaneously. If (1) fails, applying EXPAND breaks
-- production. If (2) fails, deploying the code breaks production. Only both
-- together mean the two halves can ship in either order.
--
-- ── HOW IT IS RUN ──────────────────────────────────────────────────────
--
-- A canonical replay applies both migrations, so the post-EXPAND state does not
-- exist at the end of one. scripts/db-test.sh reaches it by applying the
-- CONTRACT rollback, running this suite, and re-applying CONTRACT — which
-- incidentally proves the contract rollback works and that CONTRACT is safe to
-- re-apply. See the "expand/contract release sequence" step there.
--
-- Everything happens in one transaction that ends in ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_role(role_name text, claim_sub text, stmt text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(claim_sub, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', role_name);
  EXECUTE stmt;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP E0 — this really is the post-EXPAND state'; END $$;

-- =========================================================================
-- Group E0 — the precondition
--
-- Without these, every assertion below would still pass against the FINAL
-- state and prove nothing about the intermediate one.
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('cd_record_funnel_event', 'cd_submit_test_feedback')) = 2,
  'E0.1 EXPAND is applied — both governed entry points exist');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('cd_v31_funnel_events', 'cd_test_feedback')
      AND cmd = 'INSERT') = 2,
  'E0.2 CONTRACT is NOT applied — both legacy INSERT policies are still here');

DO $$ BEGIN RAISE NOTICE 'GROUP E1 — the currently deployed code still works'; END $$;

-- =========================================================================
-- Group E1 — proof that applying EXPAND alone does not break main
--
-- These are the EXACT statements the deployed code issues. main's handler in
-- src/lib/career-discovery/v31-feedback.functions.ts inserts through the
-- publishable key (so, the anon role) and sets neither user_id nor session_id
-- on either table. Anything else would be testing a write nobody makes.
-- =========================================================================

SELECT pg_temp.as_role('anon', NULL,
  $$INSERT INTO public.cd_v31_funnel_events (event_name, detail)
    VALUES ('assessment_started', '{"format":"story"}'::jsonb)$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_funnel_events
    WHERE event_name = 'assessment_started'
      AND detail = '{"format":"story"}'::jsonb) >= 1,
  'E1.1 main''s direct funnel INSERT still succeeds after EXPAND');

SELECT pg_temp.as_role('anon', NULL,
  $$INSERT INTO public.cd_test_feedback
      (relevant, understood_why, pathway_realistic, requirements_useful,
       missing_career_note, explored_profession_id, free_text, locale)
    VALUES (4, true, true, true, NULL, 'SP005', 'legacy path', 'sv')$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_test_feedback WHERE free_text = 'legacy path') = 1,
  'E1.2 main''s direct feedback INSERT still succeeds after EXPAND');

-- The other two things main does against objects this migration touched.
SELECT pg_temp.as_role('anon', NULL, $$SELECT count(*) FROM public.jobs$$);
SELECT pg_temp.ok(true, 'E1.3 the public job board still renders for anon');

SELECT pg_temp.as_role('anon', NULL,
  $$SELECT count(*) FROM public.cd_get_shared_report('no-such-token')$$);
SELECT pg_temp.ok(true, 'E1.4 the share-token read still works for anon');

DO $$ BEGIN RAISE NOTICE 'GROUP E2 — the new code already works too'; END $$;

-- =========================================================================
-- Group E2 — proof that the code may deploy at any point after EXPAND
-- =========================================================================

INSERT INTO auth.users (id, email) VALUES
  ('ec000000-0000-0000-0000-000000000001', 'expand-owner@example.test'),
  ('ec000000-0000-0000-0000-000000000002', 'expand-other@example.test');

INSERT INTO public.cd_sessions (id, definition_version_id, user_id, locale, status)
SELECT 'ec000000-0000-0000-0000-0000000000aa', dv.id,
       'ec000000-0000-0000-0000-000000000001', 'sv', 'in_progress'
  FROM public.cd_definition_versions dv
 WHERE dv.lifecycle_status = 'active' ORDER BY dv.id LIMIT 1;

SELECT pg_temp.as_role('anon', NULL,
  $$SELECT public.cd_record_funnel_event('result_viewed', '{"format":"card"}'::jsonb)$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_funnel_events
    WHERE event_name = 'result_viewed' AND user_id IS NULL) >= 1,
  'E2.1 the governed funnel entry point already works for anon after EXPAND');

SELECT pg_temp.as_role('anon', NULL,
  $$SELECT public.cd_submit_test_feedback('en', 5::smallint)$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_test_feedback
    WHERE locale = 'en' AND relevant = 5 AND user_id IS NULL) >= 1,
  'E2.2 the governed feedback entry point already works for anon after EXPAND');

-- The security property the entry points exist for holds during the
-- transition too. The legacy path is still open beside them — that is what
-- CONTRACT closes — but nothing routed through the new path can be forged.
SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_record_funnel_event(''result_claimed'', ''{}''::jsonb,
         ''ec000000-0000-0000-0000-0000000000aa'')')$$,
  'CD_SESSION_NOT_YOURS',
  'E2.3 the entry point already refuses another user''s session during the transition');

SELECT pg_temp.as_role('authenticated', 'ec000000-0000-0000-0000-000000000001',
  $$SELECT public.cd_record_funnel_event('result_claimed', '{}'::jsonb,
      'ec000000-0000-0000-0000-0000000000aa')$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_funnel_events
    WHERE user_id = 'ec000000-0000-0000-0000-000000000001') = 1,
  'E2.4 and already stamps a signed-in candidate with their own id');

DO $$ BEGIN RAISE NOTICE 'GROUP E3 — everything except the legacy path is ALREADY hardened'; END $$;

-- =========================================================================
-- Group E3 — the rest of the hardening is not deferred
--
-- The phase split moves ONE thing to CONTRACT: withdrawing the legacy INSERT.
-- If any other part of the fix quietly moved with it, the hosted database
-- spends the transition window less protected than the design says it is.
-- =========================================================================

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.save_career_report(uuid,uuid,text,uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure,
    'EXECUTE'),
  'E3.1 save_career_report is closed to anon from EXPAND onward');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                       WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                       WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                         AND d.deptype = 'e')) = 0,
  'E3.2 search_path is fully pinned from EXPAND onward');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'pg_catalog.trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                       WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                         AND d.deptype = 'e')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) = 0,
  'E3.3 no trigger function is anon-executable from EXPAND onward');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'cig_profession_families_legacy_backup'
      AND grantee IN ('anon', 'PUBLIC')) = 0,
  'E3.4 the legacy backup table is hardened from EXPAND onward');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cig_profession_families_legacy_backup) >= 13,
  'E3.5 and still holds its 13 archived rows');

-- The inherited privileges nobody ever used are gone ALREADY, even though the
-- INSERT they arrived alongside is not. TRUNCATE is the one that matters:
-- row-level security does not apply to it, so the grant was the only control.
SELECT pg_temp.ok(
  (SELECT COALESCE(string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type), '')
     FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND table_name IN ('cd_v31_funnel_events', 'cd_test_feedback')) = 'INSERT',
  'E3.6 anon holds exactly INSERT on the telemetry tables — SELECT and TRUNCATE already gone');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'TRUNCATE public.cd_v31_funnel_events')$$,
  'permission denied',
  'E3.7 anon cannot TRUNCATE the telemetry tables during the transition');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT count(*) FROM public.cd_test_feedback')$$,
  'permission denied',
  'E3.8 anon cannot read back what it writes during the transition');

-- The validation constraints EXPAND added must accept everything main sends.
-- main's detail is a Zod-validated Record<string, string|number|boolean> and
-- its exploredProfessionId is capped at 20 characters, so both bounds are
-- satisfied by construction — asserted rather than reasoned about.
SELECT pg_temp.as_role('anon', NULL,
  $$INSERT INTO public.cd_v31_funnel_events (event_name, detail)
    VALUES ('profession_explored', '{"professionId":"SP005","rank":3,"expanded":true}'::jsonb)$$);
SELECT pg_temp.ok(true,
  'E3.9 the new detail constraint accepts the payload shape main actually sends');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'INSERT INTO public.cd_v31_funnel_events (event_name, detail)
         VALUES (''result_viewed'', jsonb_build_object(''blob'', repeat(''A'', 200000)))')$$,
  'cd_v31_funnel_events_detail_bounded',
  'E3.10 and rejects the 200 KB blob even on the legacy path');

DO $$ BEGIN RAISE NOTICE 'security_hardening_expand_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
