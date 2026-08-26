-- Security hardening — the five Lovable/Supabase advisor findings.
--
-- Every assertion here is a PROPERTY, not a list of the objects that happen to
-- exist today. Adding a new SECURITY DEFINER function without a search_path, or
-- a new `WITH CHECK (true)` policy over a user-linked table, or a new
-- anon-executable definer function that is not on the reviewed allowlist, fails
-- this suite — which is the point. A guard that only knows today's filenames
-- protects today.
--
-- ── WHY THE GRANT ASSERTIONS ARE ANSWERABLE AT ALL ─────────────────────
--
-- Supabase ships ALTER DEFAULT PRIVILEGES granting anon and authenticated the
-- full set on every new object in `public`. A clean local replay does not, so
-- an assertion like "anon holds no SELECT on cd_test_feedback" USED to pass
-- locally and be false on hosted. Three migrations now reproduce those defaults
-- locally (20260817190000, 20260817210000 and 20260916090000), so the questions
-- below are asked of a database that can actually answer them.
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

-- Runs a statement as a principal and restores the session afterwards, so one
-- assertion's role never leaks into the next.
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

-- =========================================================================
-- Fixtures — a victim with a CLAIMED session, and a second, unrelated user
-- =========================================================================

INSERT INTO auth.users (id, email) VALUES
  ('5ec00000-0000-0000-0000-000000000001', 'sec-victim@example.test'),
  ('5ec00000-0000-0000-0000-000000000002', 'sec-attacker@example.test');

INSERT INTO public.cd_sessions (id, definition_version_id, user_id, locale, status)
SELECT '5ec00000-0000-0000-0000-0000000000aa',
       dv.id,
       '5ec00000-0000-0000-0000-000000000001',
       'sv', 'in_progress'
  FROM public.cd_definition_versions dv
 WHERE dv.lifecycle_status = 'active'
 ORDER BY dv.id
 LIMIT 1;

-- An UNCLAIMED session: the anonymous-first case the product actually runs on.
-- cd_sessions_owner_exactly_one requires an anon_session_token when user_id is
-- NULL, so this is a real anonymous session rather than a half-built one.
INSERT INTO public.cd_sessions (id, definition_version_id, user_id, anon_session_token, locale, status)
SELECT '5ec00000-0000-0000-0000-0000000000bb',
       dv.id,
       NULL,
       '5ec00000-0000-0000-0000-0000000000cc'::uuid,
       'sv', 'in_progress'
  FROM public.cd_definition_versions dv
 WHERE dv.lifecycle_status = 'active'
 ORDER BY dv.id
 LIMIT 1;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_sessions
    WHERE id IN ('5ec00000-0000-0000-0000-0000000000aa',
                 '5ec00000-0000-0000-0000-0000000000bb')) = 2,
  'F.0 fixtures: one claimed session and one anonymous session exist');

DO $$ BEGIN RAISE NOTICE 'GROUP S1 — cd_test_feedback cannot be spoofed'; END $$;

-- =========================================================================
-- Group S1 — finding 2
-- =========================================================================

-- S1.1 is the finding itself: the direct table write is gone. Everything else
-- in this group is only meaningful because of it — a bypass that still exists
-- makes every validation in the entry point decorative.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'cd_test_feedback'
      AND grantee IN ('anon', 'PUBLIC')) = 0,
  'S1.1 anon and PUBLIC hold NO table privilege on cd_test_feedback');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cd_test_feedback'
      AND cmd = 'INSERT') = 0,
  'S1.2 the WITH CHECK (true) INSERT policy is gone from cd_test_feedback');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'INSERT INTO public.cd_test_feedback (locale) VALUES (''sv'')')$$,
  'permission denied',
  'S1.3 anon cannot INSERT into cd_test_feedback directly');

-- The product requirement: anonymous feedback still works.
SELECT pg_temp.as_role('anon', NULL,
  $$SELECT public.cd_submit_test_feedback('sv', 4::smallint, true, true, true,
      'note', 'SP005', 'free text', '5ec00000-0000-0000-0000-0000000000bb')$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_test_feedback
    WHERE session_id = '5ec00000-0000-0000-0000-0000000000bb'
      AND user_id IS NULL AND relevant = 4) = 1,
  'S1.4 anonymous feedback still lands, attributed to nobody');

-- The finding, negatively: there is no user_id parameter to spoof, so an
-- anonymous caller cannot reach the victim at all.
SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_submit_test_feedback(''sv'', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         ''5ec00000-0000-0000-0000-0000000000aa'')')$$,
  'CD_SESSION_NOT_YOURS',
  'S1.5 anon cannot attach feedback to another user''s session');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('authenticated', '5ec00000-0000-0000-0000-000000000002',
      'SELECT public.cd_submit_test_feedback(''sv'', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         ''5ec00000-0000-0000-0000-0000000000aa'')')$$,
  'CD_SESSION_NOT_YOURS',
  'S1.6 a signed-in candidate cannot attach feedback to another candidate''s session');

-- A signed-in candidate's row carries THEIR id, whatever they pass — because
-- there is nothing to pass. This is the positive half of "cannot spoof".
SELECT pg_temp.as_role('authenticated', '5ec00000-0000-0000-0000-000000000001',
  $$SELECT public.cd_submit_test_feedback('en', 5::smallint, NULL, NULL, NULL, NULL, NULL, NULL,
      '5ec00000-0000-0000-0000-0000000000aa')$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_test_feedback
    WHERE user_id = '5ec00000-0000-0000-0000-000000000001'
      AND session_id = '5ec00000-0000-0000-0000-0000000000aa') = 1,
  'S1.7 a signed-in candidate''s feedback is stamped with their own id');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cd_submit_test_feedback'
      AND pg_get_function_arguments(p.oid) NOT LIKE '%user_id%') = 1,
  'S1.8 the feedback entry point has no user_id parameter at all');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_submit_test_feedback(''sv'', NULL, NULL, NULL, NULL,
         repeat(''x'', 501))')$$,
  'CD_FEEDBACK_NOTE_TOO_LONG',
  'S1.9 free-text length is enforced by the database, not only by the client');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_submit_test_feedback(''de'')')$$,
  'CD_FEEDBACK_LOCALE_INVALID',
  'S1.10 an unexpected locale is refused');

DO $$ BEGIN RAISE NOTICE 'GROUP S2 — cd_v31_funnel_events cannot be spoofed'; END $$;

-- =========================================================================
-- Group S2 — finding 3
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'cd_v31_funnel_events'
      AND grantee IN ('anon', 'PUBLIC')) = 0,
  'S2.1 anon and PUBLIC hold NO table privilege on cd_v31_funnel_events');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cd_v31_funnel_events'
      AND cmd = 'INSERT') = 0,
  'S2.2 the WITH CHECK (true) INSERT policy is gone from cd_v31_funnel_events');

-- No UPDATE or DELETE from any public role, by grant AND by policy. Both are
-- asserted: a grant with no policy and a policy with no grant fail differently.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('cd_v31_funnel_events', 'cd_test_feedback')
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
      AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')) = 0,
  'S2.3 no public role holds UPDATE, DELETE or TRUNCATE on either telemetry table');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('cd_v31_funnel_events', 'cd_test_feedback')
      AND cmd IN ('UPDATE', 'DELETE', 'ALL')) = 0,
  'S2.4 neither telemetry table carries an UPDATE, DELETE or FOR ALL policy');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'INSERT INTO public.cd_v31_funnel_events (event_name) VALUES (''result_viewed'')')$$,
  'permission denied',
  'S2.5 anon cannot INSERT into cd_v31_funnel_events directly');

-- The product requirement: anonymous, pre-login funnel tracking still works.
SELECT pg_temp.as_role('anon', NULL,
  $$SELECT public.cd_record_funnel_event('assessment_started', '{"format":"story"}'::jsonb,
      '5ec00000-0000-0000-0000-0000000000bb')$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_funnel_events
    WHERE session_id = '5ec00000-0000-0000-0000-0000000000bb'
      AND user_id IS NULL AND event_name = 'assessment_started') = 1,
  'S2.6 anonymous pre-login funnel events still land, attributed to nobody');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_record_funnel_event(''result_claimed'', ''{}''::jsonb,
         ''5ec00000-0000-0000-0000-0000000000aa'')')$$,
  'CD_SESSION_NOT_YOURS',
  'S2.7 anon cannot pin an event on another user''s session');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('authenticated', '5ec00000-0000-0000-0000-000000000002',
      'SELECT public.cd_record_funnel_event(''result_claimed'', ''{}''::jsonb,
         ''5ec00000-0000-0000-0000-0000000000aa'')')$$,
  'CD_SESSION_NOT_YOURS',
  'S2.8 a signed-in candidate cannot pin an event on another candidate''s session');

SELECT pg_temp.as_role('authenticated', '5ec00000-0000-0000-0000-000000000001',
  $$SELECT public.cd_record_funnel_event('result_claimed', '{}'::jsonb,
      '5ec00000-0000-0000-0000-0000000000aa')$$);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_funnel_events
    WHERE user_id = '5ec00000-0000-0000-0000-000000000001'
      AND session_id = '5ec00000-0000-0000-0000-0000000000aa') = 1,
  'S2.9 a signed-in candidate''s event is stamped with their own id');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cd_record_funnel_event'
      AND pg_get_function_arguments(p.oid) NOT LIKE '%user_id%') = 1,
  'S2.10 the funnel entry point has no user_id parameter at all');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_record_funnel_event(''admin_backdoor'')')$$,
  'CD_FUNNEL_EVENT_UNKNOWN',
  'S2.11 an event name outside the allowlist is refused');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_record_funnel_event(''result_viewed'', ''{}''::jsonb,
         ''5ec00000-0000-0000-0000-0000000000ff'')')$$,
  'CD_SESSION_UNKNOWN',
  'S2.12 an invented session id is refused rather than silently stored');

-- The privacy claim in the table's own comment, made enforceable. Before this
-- change a 200 KB free-text blob went straight into a table documented as
-- carrying "no free text, no PII" and readable by every platform admin.
SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_record_funnel_event(''result_viewed'',
         jsonb_build_object(''blob'', repeat(''A'', 200000)))')$$,
  'CD_FUNNEL_DETAIL_TOO_LARGE',
  'S2.13 an oversized detail payload is refused');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_record_funnel_event(''result_viewed'',
         ''{"nested":{"a":1}}''::jsonb)')$$,
  'CD_FUNNEL_DETAIL_VALUE_SHAPE',
  'S2.14 a structured (non-scalar) detail value is refused');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT public.cd_record_funnel_event(''result_viewed'', ''[1,2,3]''::jsonb)')$$,
  'CD_FUNNEL_DETAIL_NOT_OBJECT',
  'S2.15 a detail payload that is not an object is refused');

-- Drift guard: the entry point's allowlist and the table's own CHECK
-- constraint must name the SAME events. Two lists that can disagree are one
-- list plus a bug waiting to happen.
SELECT pg_temp.ok(
  (SELECT count(*) FROM (
     SELECT unnest(public.cd_v31_funnel_event_names()) AS e
     EXCEPT
     SELECT (regexp_matches(
       pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g'))[1]
       FROM pg_constraint c
      WHERE c.conrelid = 'public.cd_v31_funnel_events'::regclass
        AND c.conname = 'cd_v31_funnel_events_event_name_check'
   ) s) = 0,
  'S2.16 every name the entry point accepts is one the table CHECK allows');

SELECT pg_temp.ok(
  (SELECT count(*) FROM (
     SELECT (regexp_matches(
       pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g'))[1] AS e
       FROM pg_constraint c
      WHERE c.conrelid = 'public.cd_v31_funnel_events'::regclass
        AND c.conname = 'cd_v31_funnel_events_event_name_check'
     EXCEPT
     SELECT unnest(public.cd_v31_funnel_event_names())
   ) s) = 0,
  'S2.17 the table CHECK allows no name the entry point does not');

DO $$ BEGIN RAISE NOTICE 'GROUP S3 — SECURITY DEFINER least privilege'; END $$;

-- =========================================================================
-- Group S3 — finding 4
--
-- The allowlist below is the ONLY place a definer function is permitted to be
-- anon-executable. It is deliberately small and deliberately hard-coded: this
-- assertion is the review gate, and a new entry is a diff somebody approves.
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                       WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                         AND d.deptype = 'e'))
  = 'cd_get_shared_report, cd_record_funnel_event, cd_submit_test_feedback, employer_is_active_status',
  'S3.1 exactly four reviewed SECURITY DEFINER functions are anon-executable');

SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.save_career_report(uuid,uuid,text,uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure,
    'EXECUTE'),
  'S3.2 anon cannot execute save_career_report');

SELECT pg_temp.ok(
  NOT has_function_privilege('authenticated',
    'public.save_career_report(uuid,uuid,text,uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure,
    'EXECUTE'),
  'S3.3 authenticated cannot execute save_career_report either — it is service-role only');

SELECT pg_temp.ok(
  has_function_privilege('service_role',
    'public.save_career_report(uuid,uuid,text,uuid,text,text,jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure,
    'EXECUTE'),
  'S3.4 service_role keeps it — the real call sites still work');

-- The internal backstop, proved by temporarily restoring the grant this
-- migration removed. If the grant ever comes back, the function still refuses.
GRANT EXECUTE ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text) TO authenticated;

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('authenticated', '5ec00000-0000-0000-0000-000000000002',
      'SELECT * FROM public.save_career_report(
         ''5ec00000-0000-0000-0000-000000000001''::uuid, gen_random_uuid(), ''x'', NULL,
         ''g'', ''sv'', ''{}''::jsonb, ''{}''::jsonb, ''{}''::jsonb, ''v'', ''e'', ''p'', ''h'')')$$,
  'SAVE_CAREER_REPORT_NOT_OWNER',
  'S3.5 even WITH the grant restored, a signed-in caller cannot write another user''s report');

REVOKE ALL ON FUNCTION public.save_career_report(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text)
  FROM authenticated;

-- The whole trigger-function class, not the three that happened to be flagged.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'pg_catalog.trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                       WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                         AND d.deptype = 'e')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) = 0,
  'S3.6 no trigger function in public is executable by anon or authenticated');

-- ... and revoking it broke nothing, because trigger firing does not check
-- EXECUTE. Proved, not asserted in a comment: a trigger with its EXECUTE
-- revoked still fires for a role that cannot call it.
CREATE TABLE pg_temp.trigger_probe (id integer, tag text);
-- Carries a pinned search_path like every other function here, so that S4.1
-- below is answering a question about the schema and not about this probe.
CREATE OR REPLACE FUNCTION public.sec_probe_trigger_fn() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$ BEGIN NEW.tag := 'fired'; RETURN NEW; END $$;
CREATE TRIGGER sec_probe_trg BEFORE INSERT ON pg_temp.trigger_probe
  FOR EACH ROW EXECUTE FUNCTION public.sec_probe_trigger_fn();
REVOKE ALL ON FUNCTION public.sec_probe_trigger_fn() FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON pg_temp.trigger_probe TO anon;

SELECT pg_temp.as_role('anon', NULL,
  $$INSERT INTO pg_temp.trigger_probe (id) VALUES (1)$$);

SELECT pg_temp.ok(
  (SELECT tag FROM pg_temp.trigger_probe WHERE id = 1) = 'fired',
  'S3.7 a trigger still fires for a role that cannot EXECUTE its function');

-- The contrast that makes S3.7 meaningful: an RLS policy expression DOES check
-- EXECUTE, which is exactly why cd_get_shared_report and
-- employer_is_active_status keep their anon grant instead of losing it.
SELECT pg_temp.ok(
  has_function_privilege('anon', 'public.employer_is_active_status(uuid)'::regprocedure, 'EXECUTE'),
  'S3.8 employer_is_active_status stays anon-executable — an RLS policy names it');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'jobs'
      AND 'anon' = ANY (roles)
      AND qual LIKE '%employer_is_active_status%') = 1,
  'S3.9 and that policy is the public job board''s, so revoking it would black it out');

SELECT pg_temp.as_role('anon', NULL, $$SELECT count(*) FROM public.jobs$$);
SELECT pg_temp.ok(true, 'S3.10 anon can still read the public job board end to end');

SELECT pg_temp.as_role('anon', NULL,
  $$SELECT count(*) FROM public.cd_get_shared_report('no-such-token')$$);
SELECT pg_temp.ok(true, 'S3.11 anon can still call the share-token read');

-- The internal helper is NOT part of the public surface: it takes the caller
-- identity as a parameter, so exposing it would hand back the spoofing the
-- entry points exist to prevent.
SELECT pg_temp.ok(
  NOT has_function_privilege('anon',
    'public.cd_assert_session_writable(uuid,uuid)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.cd_assert_session_writable(uuid,uuid)'::regprocedure, 'EXECUTE'),
  'S3.12 the session-ownership helper is callable by neither anon nor authenticated');

DROP TRIGGER sec_probe_trg ON pg_temp.trigger_probe;
DROP FUNCTION public.sec_probe_trigger_fn();

DO $$ BEGIN RAISE NOTICE 'GROUP S4 — search_path is pinned, and stays pinned'; END $$;

-- =========================================================================
-- Group S4 — finding 5
--
-- Property, not inventory. Any function added later without a search_path
-- fails S4.1 whether it came from this repository or from a Lovable-generated
-- migration, and a SECURITY DEFINER one fails S4.2 as well.
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                       WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                       WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                         AND d.deptype = 'e')) = 0,
  'S4.1 no repository-owned function in public has a mutable search_path');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                       WHERE c LIKE 'search_path=%')) = 0,
  'S4.2 no SECURITY DEFINER function in public has a mutable search_path');

-- Extension functions are deliberately exempt and deliberately named as such:
-- ALTERing them breaks the extension upgrade path, and Supabase's own advisor
-- excludes them for the same reason. Asserted so "exempt" stays a decision.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
    JOIN pg_extension e ON e.oid = d.refobjid
   WHERE n.nspname = 'public'
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%')
     AND e.extname NOT IN ('pgcrypto', 'unaccent')) = 0,
  'S4.3 the only search_path-free functions left belong to pgcrypto and unaccent');

-- pg_temp must be named explicitly, and named LAST. Leaving it out does not
-- remove it from the path — it leaves it implicitly FIRST for table lookups,
-- which is the attack the setting exists to close.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('cd_record_funnel_event', 'cd_submit_test_feedback',
                        'cd_assert_session_writable', 'cd_v31_funnel_event_names',
                        'save_career_report', 'employer_is_active_status',
                        'cd_get_shared_report')
      AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                   WHERE c LIKE 'search_path=%pg\_temp')) = 7,
  'S4.4 every function this change touches ends its search_path with pg_temp');

DO $$ BEGIN RAISE NOTICE 'GROUP S5 — the legacy backup table'; END $$;

-- =========================================================================
-- Group S5 — finding 1
-- =========================================================================

SELECT pg_temp.ok(
  to_regclass('public.cig_profession_families_legacy_backup') IS NOT NULL,
  'S5.1 the legacy backup table still EXISTS — hardening is not deletion');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cig_profession_families_legacy_backup) >= 13,
  'S5.2 and it still holds the 13 archived rows it was created to preserve');

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'cig_profession_families_legacy_backup'
      AND grantee IN ('anon', 'PUBLIC')) = 0,
  'S5.3 anon and PUBLIC hold no privilege on the legacy backup at all');

-- TRUNCATE is the one that was never latent: row-level security does not apply
-- to it, so RLS was not standing between a caller and an emptied backup.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'cig_profession_families_legacy_backup'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')) = 0,
  'S5.4 no public role can write to or TRUNCATE the legacy backup');

SELECT pg_temp.ok(
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.cig_profession_families_legacy_backup'::regclass),
  'S5.5 RLS remains enabled on the legacy backup');

SELECT pg_temp.must_fail(
  $$SELECT pg_temp.as_role('anon', NULL,
      'SELECT count(*) FROM public.cig_profession_families_legacy_backup')$$,
  'permission denied',
  'S5.6 anon cannot read the legacy backup');

-- A non-admin authenticated user holds SELECT but matches no policy row, so
-- the read path is the admin policy and nothing else.
SELECT pg_temp.as_role('authenticated', '5ec00000-0000-0000-0000-000000000002',
  $$SELECT count(*) FROM public.cig_profession_families_legacy_backup$$);
SELECT pg_temp.ok(true,
  'S5.7 a non-admin authenticated read succeeds and returns nothing (RLS, not error)');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cig_profession_families_legacy_backup'
      AND cmd <> 'SELECT') = 0,
  'S5.8 the FOR ALL policy is gone — the backup is admin-READ, not admin-write');

DO $$ BEGIN RAISE NOTICE 'GROUP S6 — the property holds for objects that do not exist yet'; END $$;

-- =========================================================================
-- Group S6 — the guard is a guard
--
-- Each of these MAKES the violation the finding describes, then asserts the
-- property-based query above would have caught it. Without this group the
-- suite proves the current schema is clean and nothing about tomorrow's.
-- =========================================================================

-- 6a. A new SECURITY DEFINER function with no search_path.
CREATE FUNCTION public.sec_probe_no_path() RETURNS integer
LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                       WHERE c LIKE 'search_path=%')) = 1,
  'S6.1 S4.2''s query DOES see a newly added definer function with no search_path');

-- 6b. ... and that it is anon-executable, which is the other half of finding 4.
--     Note the grant is not written here: PostgreSQL's DEFAULT for a new
--     function is EXECUTE to PUBLIC, and PUBLIC includes anon. That default is
--     precisely how save_career_report became reachable.
SELECT pg_temp.ok(
  has_function_privilege('anon', 'public.sec_probe_no_path()'::regprocedure, 'EXECUTE'),
  'S6.2 a new definer function is anon-executable BY DEFAULT — no grant required');

SELECT pg_temp.ok(
  (SELECT COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                       WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass
                         AND d.deptype = 'e'))
  <> 'cd_get_shared_report, cd_record_funnel_event, cd_submit_test_feedback, employer_is_active_status',
  'S6.3 S3.1''s query DOES break when an unreviewed definer function appears');

DROP FUNCTION public.sec_probe_no_path();

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                       WHERE c LIKE 'search_path=%')) = 0,
  'S6.4 and it is clean again once the probe is removed');

-- 6c. A WITH CHECK (true) INSERT policy on a user-linked table.
CREATE POLICY sec_probe_open_insert ON public.cd_test_feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cd_test_feedback'
      AND cmd = 'INSERT') = 1,
  'S6.5 S1.2''s query DOES see a reintroduced WITH CHECK (true) INSERT policy');

DROP POLICY sec_probe_open_insert ON public.cd_test_feedback;

-- 6d. A restored spoofable write grant.
GRANT INSERT ON public.cd_v31_funnel_events TO anon;

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'cd_v31_funnel_events'
      AND grantee IN ('anon', 'PUBLIC')) = 1,
  'S6.6 S2.1''s query DOES see a restored direct anon INSERT grant');

REVOKE INSERT ON public.cd_v31_funnel_events FROM anon;

SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'cd_v31_funnel_events'
      AND grantee IN ('anon', 'PUBLIC')) = 0,
  'S6.7 and it is clean again once the grant is withdrawn');

DO $$ BEGIN RAISE NOTICE 'security_hardening_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
