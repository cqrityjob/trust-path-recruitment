-- Career Discovery availability -- the DATABASE half of the state x actor matrix.
--
-- docs/release/2026-10-03-career-analysis-availability.md is the truth table;
-- this suite executes the cells the database decides, in all three states of
-- public.cd_access_policy (internal_test / public / paused) for an anonymous
-- visitor, a signed-in candidate who is not a tester, an internal tester and a
-- platform admin, including the person who finished anonymously and then signs
-- up (the claim).
--
-- It is the companion of cd_access_policy_test.sql (which proves the control's
-- own mechanics: who may change it, that no client role can read the table).
-- This one proves the PRODUCT consequence of each state, end to end through the
-- same functions and tables the application uses.
--
-- ── WHAT THE DATABASE DOES NOT DO, AND THIS SUITE SAYS SO ─────────────
--
-- The application's gate (resolveSaveGate in v31-public.functions.ts) refuses a
-- signed-in non-tester's own run under internal_test and everybody's under
-- paused. The DATABASE does not: the cd_sessions insert policy is
-- `auth.uid() = user_id` and the admission trigger looks only at the
-- instrument's lifecycle. Group M3 pins exactly that, so a future change on
-- either side is noticed rather than assumed away: the claim path (a derived,
-- idempotent session id; the theft defence is RLS) behaves identically in all
-- three states at the database layer.
--
-- ── PLANTED CONTROLS (scripts/db-test.sh) ──────────────────────────────
--
--   NC1  cd_v31_may_start answers true for everyone       -> M1.* (the matrix)
--   NC2  cd_access_state never reads paused               -> M2.2 (the entrance)
--   NC3  the allowlist is ignored under internal_test     -> M1.* (the matrix)
--
-- The expected tables below are parsed by scripts/career-analysis-availability-
-- check.ts, which holds the TypeScript resolver and this suite to ONE table.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

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
      RAISE EXCEPTION 'ASSERTION FAILED: % -- expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- statement succeeded', label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text, text) TO PUBLIC;

-- ── People ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('cd0c0000-0000-4000-8000-000000000001', 'avail-admin@test.invalid',   now()),
  ('cd0c0000-0000-4000-8000-000000000002', 'avail-tester@test.invalid',  now()),
  ('cd0c0000-0000-4000-8000-000000000003', 'avail-plain@test.invalid',   now()),
  ('cd0c0000-0000-4000-8000-000000000004', 'avail-other@test.invalid',   now());
INSERT INTO public.user_roles (user_id, role) VALUES ('cd0c0000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.cd_internal_testers (user_id, granted_by, note)
VALUES ('cd0c0000-0000-4000-8000-000000000002', 'cd0c0000-0000-4000-8000-000000000001', 'suite');

-- ── The expected tables ─────────────────────────────────────────────────
--
-- ONE row per state x actor. `anon` is the signed-out visitor and is never
-- passed to cd_v31_may_start (an anonymous identity has no user id; the
-- anonymous entrance is cd_access_state's alone), so it appears in the
-- entrance table below and not here.
CREATE TEMP TABLE m_expected_may_start (state text, actor text, may_start boolean);
INSERT INTO m_expected_may_start (state, actor, may_start) VALUES
  ('internal_test', 'admin',  true),
  ('internal_test', 'tester', true),
  ('internal_test', 'plain',  false),
  ('public',        'admin',  true),
  ('public',        'tester', true),
  ('public',        'plain',  true),
  ('paused',        'admin',  true),
  ('paused',        'tester', false),
  ('paused',        'plain',  false);

-- The anonymous entrance: open under internal_test and public, closed paused.
CREATE TEMP TABLE m_expected_entrance (state text, entrance_open boolean);
INSERT INTO m_expected_entrance (state, entrance_open) VALUES
  ('internal_test', true),
  ('public',        true),
  ('paused',        false);

CREATE TEMP TABLE m_actual_may_start (state text, actor text, may_start boolean);
CREATE TEMP TABLE m_actual_entrance (state text, entrance_open boolean);
GRANT ALL ON m_actual_may_start, m_actual_entrance TO PUBLIC;

-- Records one signed-in answer AS the signed-in role, through the same grant a
-- real request uses; and one anonymous answer AS anon.
CREATE OR REPLACE FUNCTION pg_temp.rec_user(_state text, _actor text, _uid uuid) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO m_actual_may_start VALUES (_state, _actor, public.cd_v31_may_start(_uid));
$$;
CREATE OR REPLACE FUNCTION pg_temp.rec_anon(_state text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO m_actual_entrance VALUES (_state, public.cd_access_state() <> 'paused');
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rec_user(text, text, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.rec_anon(text) TO PUBLIC;

-- ── GROUP M0: where it starts ───────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP M0 -- the seeded state'; END $$;
SELECT pg_temp.ok(public.cd_access_state() = 'internal_test',
  'M0.1 the control ships as internal_test (what production reads today)');
SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0') = 'active',
  'M0.2 v3.1 is active: availability is the control, not the lifecycle');

-- ── GROUP M1: the signed-in matrix, all three states ────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP M1 -- may this signed-in person start (state x actor)'; END $$;

UPDATE public.cd_access_policy SET state = 'internal_test';
SET LOCAL ROLE authenticated;
SELECT pg_temp.rec_user('internal_test', 'admin',  'cd0c0000-0000-4000-8000-000000000001');
SELECT pg_temp.rec_user('internal_test', 'tester', 'cd0c0000-0000-4000-8000-000000000002');
SELECT pg_temp.rec_user('internal_test', 'plain',  'cd0c0000-0000-4000-8000-000000000003');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.rec_anon('internal_test');
RESET ROLE;

UPDATE public.cd_access_policy SET state = 'public';
SET LOCAL ROLE authenticated;
SELECT pg_temp.rec_user('public', 'admin',  'cd0c0000-0000-4000-8000-000000000001');
SELECT pg_temp.rec_user('public', 'tester', 'cd0c0000-0000-4000-8000-000000000002');
SELECT pg_temp.rec_user('public', 'plain',  'cd0c0000-0000-4000-8000-000000000003');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.rec_anon('public');
RESET ROLE;

UPDATE public.cd_access_policy SET state = 'paused';
SET LOCAL ROLE authenticated;
SELECT pg_temp.rec_user('paused', 'admin',  'cd0c0000-0000-4000-8000-000000000001');
SELECT pg_temp.rec_user('paused', 'tester', 'cd0c0000-0000-4000-8000-000000000002');
SELECT pg_temp.rec_user('paused', 'plain',  'cd0c0000-0000-4000-8000-000000000003');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.rec_anon('paused');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM m_actual_may_start) = (SELECT count(*) FROM m_expected_may_start),
  'M1.1 every state x actor cell was exercised');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM m_expected_may_start e
    FULL JOIN m_actual_may_start a USING (state, actor)
    WHERE e.may_start IS DISTINCT FROM a.may_start),
  'M1.2 cd_v31_may_start answers exactly the truth table in every state for admin, tester and plain candidate');
SELECT pg_temp.ok(
  (SELECT may_start FROM m_actual_may_start WHERE state = 'internal_test' AND actor = 'plain') = false
  AND (SELECT may_start FROM m_actual_may_start WHERE state = 'public' AND actor = 'plain') = true,
  'M1.3 the cell that decides the launch: a plain account is refused under internal_test and admitted under public');
SELECT pg_temp.ok(
  (SELECT may_start FROM m_actual_may_start WHERE state = 'paused' AND actor = 'admin') = true,
  'M1.4 under paused the database still admits a platform admin (the product UI is closed to everyone regardless: see the truth table)');
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(NOT public.cd_v31_may_start(NULL), 'M1.5 an absent identity is never admitted, in the current state');
RESET ROLE;

-- ── GROUP M2: the anonymous entrance ────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP M2 -- the anonymous entrance'; END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM m_actual_entrance) = 3,
  'M2.1 the entrance was read in all three states, as anon');
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM m_expected_entrance e
    FULL JOIN m_actual_entrance a USING (state)
    WHERE e.entrance_open IS DISTINCT FROM a.entrance_open),
  'M2.2 cd_access_state closes the anonymous entrance under paused and only then');
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT public.cd_v31_may_start(''cd0c0000-0000-4000-8000-000000000003'')',
  'permission denied', 'M2.3 anon cannot ask the signed-in question');
SELECT pg_temp.must_fail('SELECT public.cd_is_internal_tester(''cd0c0000-0000-4000-8000-000000000003'')',
  'permission denied', 'M2.4 anon cannot read the allowlist through its function either');
RESET ROLE;

-- The allowlist is consulted under internal_test and ignored under public.
UPDATE public.cd_access_policy SET state = 'internal_test';
DELETE FROM public.cd_internal_testers WHERE user_id = 'cd0c0000-0000-4000-8000-000000000002';
SELECT pg_temp.ok(NOT public.cd_v31_may_start('cd0c0000-0000-4000-8000-000000000002'),
  'M2.5 internal_test: removing the tester row withdraws their start');
UPDATE public.cd_access_policy SET state = 'public';
SELECT pg_temp.ok(public.cd_v31_may_start('cd0c0000-0000-4000-8000-000000000002'),
  'M2.6 public: the same account starts without a row (the allowlist is not consulted)');
INSERT INTO public.cd_internal_testers (user_id, granted_by, note)
VALUES ('cd0c0000-0000-4000-8000-000000000002', 'cd0c0000-0000-4000-8000-000000000001', 'suite');

-- ── GROUP M3: save and claim, at the database layer, in every state ─────
DO $$ BEGIN RAISE NOTICE 'GROUP M3 -- a claimed run is saved the same way in all three states'; END $$;

-- The same steps persistPublicV31Run takes for a claim: a session with a
-- DERIVED id (so the primary key is the idempotency check), the answers as
-- evidence, then cd_v31_complete_session. AS THE PLAIN CANDIDATE -- not a
-- tester, not an admin, no allowlist row -- against the LIVE v3.1 instrument.
CREATE TEMP TABLE m_claim (state text, claim_id uuid, snapshot_id uuid, created boolean);
GRANT ALL ON m_claim TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.claim_run(_state text, _claim uuid, _uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _dv uuid; _snap uuid; _created boolean;
BEGIN
  SELECT id INTO _dv FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0';
  INSERT INTO public.cd_sessions (id, definition_version_id, user_id, locale, status)
  VALUES (_claim, _dv, _uid, 'sv', 'in_progress');
  -- Exactly the six columns buildEvidenceRows sends (item kind, class and
  -- scoring are DERIVED by the database from the registry).
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, answer_value, option_id, answer_tags)
  SELECT _claim, di.item_id, 1,
         CASE WHEN di.item_kind = 'scale' THEN '7' ELSE di.item_id || '_A' END,
         CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END,
         '{}'::text[]
    FROM public.cd_definition_items di
   WHERE di.definition_version_id = _dv AND di.is_scored;
  SELECT r.snapshot_id, r.was_created INTO _snap, _created
    FROM public.cd_v31_complete_session(
      _claim,
      jsonb_build_object(
        'versions', jsonb_build_object(
          'reportSchemaVersion','cd-report-v3.1.0','patternDefinitionVersion','v3.1-draft-1'),
        'locale','sv','completedAt','2026-10-03T12:00:00.000Z',
        'outputA', jsonb_build_object('leadingPattern','CP01',
          'areas', jsonb_build_array(jsonb_build_object('id','SCA01','rank',1,'score',88)),
          'dimensions', jsonb_build_array(jsonb_build_object('id','CID01','name','Operativ orientering'))),
        'outputB', jsonb_build_object('locale','sv','presentedPattern','CP01',
          'leading', jsonb_build_object('name','Operativ trygghetsskapare')),
        'professions', jsonb_build_object('available', false, 'matches', jsonb_build_array())),
      'v3.1-draft-1', '2026-10-03T12:00:00Z'::timestamptz) r;
  INSERT INTO m_claim VALUES (_state, _claim, _snap, _created);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.claim_run(text, uuid, uuid) TO PUBLIC;

-- internal_test: a non-tester's claim
UPDATE public.cd_access_policy SET state = 'internal_test';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000003';
SELECT pg_temp.claim_run('internal_test', 'cd0c1000-0000-4000-8000-000000000001', 'cd0c0000-0000-4000-8000-000000000003');
RESET ROLE;
-- public
UPDATE public.cd_access_policy SET state = 'public';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000003';
SELECT pg_temp.claim_run('public', 'cd0c1000-0000-4000-8000-000000000002', 'cd0c0000-0000-4000-8000-000000000003');
RESET ROLE;
-- paused
UPDATE public.cd_access_policy SET state = 'paused';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000003';
SELECT pg_temp.claim_run('paused', 'cd0c1000-0000-4000-8000-000000000003', 'cd0c0000-0000-4000-8000-000000000003');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM m_claim WHERE snapshot_id IS NOT NULL AND created) = 3,
  'M3.1 a plain (non-tester) candidate''s claimed run is saved and completed in ALL THREE states at the database layer -- the application''s resolveSaveGate is the gate, and this pins that the database is not');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots s
     JOIN m_claim c ON c.claim_id = s.session_id) = 3,
  'M3.2 one immutable snapshot per claimed run');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.cd_sessions s JOIN m_claim c ON c.claim_id = s.id
               WHERE s.is_internal_test),
  'M3.3 none of them is marked an internal test: a public-state session is an ordinary candidate session');

-- Idempotency and the theft defence, as the application relies on them.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000003';
SELECT pg_temp.must_fail(
  $q$INSERT INTO public.cd_sessions (id, definition_version_id, user_id, locale, status)
     SELECT 'cd0c1000-0000-4000-8000-000000000001', id, 'cd0c0000-0000-4000-8000-000000000003', 'sv', 'in_progress'
       FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0'$q$,
  'duplicate key', 'M3.4 claiming the same run twice collides on the derived id (the primary key is the idempotency check)');
SELECT pg_temp.ok(
  NOT (SELECT was_created FROM public.cd_v31_complete_session(
         'cd0c1000-0000-4000-8000-000000000001', '{}'::jsonb, 'v3.1-draft-1', now())),
  'M3.5 and re-completing it returns the stored snapshot, creating nothing');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000004';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_sessions WHERE id = 'cd0c1000-0000-4000-8000-000000000001') = 0,
  'M3.6 another account cannot see the claimed run (the "already saved to another account" answer)');
SELECT pg_temp.must_fail(
  $q$SELECT * FROM public.cd_v31_complete_session('cd0c1000-0000-4000-8000-000000000001', '{}'::jsonb, 'v3.1-draft-1', now())$q$,
  'CD_NOT_SESSION_OWNER', 'M3.7 another account cannot complete it either');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots) = 0,
  'M3.8 and cannot read its report');
RESET ROLE;

-- Reading is never state-gated: the owner reads every one of their own reports
-- under every state, paused included.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(public.cd_access_state() = 'paused', 'M3.9 (precondition) the state is paused while the owner reads');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots) = 3,
  'M3.10 under paused the owner still reads all three saved reports (reading, history and the career summary are not state-gated)');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_my_report_history) = 3,
  'M3.11 and the history view lists them');
RESET ROLE;

-- ── GROUP M4: the owner's opening sequence and its rollback ─────────────
DO $$ BEGIN RAISE NOTICE 'GROUP M4 -- open, verify, roll back'; END $$;
UPDATE public.cd_access_policy SET state = 'internal_test';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.cd_set_access_state('public', 'x')$q$,
  'CD_ACCESS_REQUIRES_ADMIN', 'M4.1 a plain account cannot open the analysis');
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000002';
SELECT pg_temp.must_fail($q$SELECT public.cd_set_access_state('public', 'x')$q$,
  'CD_ACCESS_REQUIRES_ADMIN', 'M4.2 neither can an internal tester');
RESET ROLE;
SELECT pg_temp.ok(public.cd_access_state() = 'internal_test', 'M4.3 and the state did not move');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'cd0c0000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(public.cd_set_access_state('public', 'Public launch (suite)') = 'public',
  'M4.4 a platform admin opens the analysis with the exact documented call');
SELECT pg_temp.ok(public.cd_v31_may_start('cd0c0000-0000-4000-8000-000000000003'),
  'M4.5 and the plain account may start straight away');
SELECT pg_temp.ok(public.cd_set_access_state('internal_test', 'Back to the test group') = 'internal_test',
  'M4.6 rollback to internal_test with the documented call');
SELECT pg_temp.ok(NOT public.cd_v31_may_start('cd0c0000-0000-4000-8000-000000000003'),
  'M4.7 the plain account is refused again');
SELECT pg_temp.ok(public.cd_set_access_state('paused', 'Paused (suite)') = 'paused',
  'M4.8 and the hard stop');
SELECT pg_temp.ok(NOT public.cd_v31_may_start('cd0c0000-0000-4000-8000-000000000002'),
  'M4.9 paused refuses even the tester');
RESET ROLE;
SELECT pg_temp.ok(
  (SELECT note FROM public.cd_access_policy) = 'Paused (suite)'
  AND (SELECT changed_by FROM public.cd_access_policy) = 'cd0c0000-0000-4000-8000-000000000001',
  'M4.10 every change is stamped with who and why');

-- ── GROUP M5: nothing governed moved ────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP M5 -- the control moves no governance'; END $$;
SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0') = 'active'
  AND (SELECT count(*) FROM jsonb_each((SELECT review_status FROM public.cd_definition_versions
        WHERE definition_version = '2026-scd-v3.1.0')) g WHERE g.value = 'true'::jsonb) = 0,
  'M5.1 across every state change above the lifecycle is still active and all review gates are still false');

-- ── GROUP M6: the owner's read-only checklist runs on the final schema ──
DO $$ BEGIN RAISE NOTICE 'GROUP M6 -- the readiness queries'; END $$;
\i supabase/readiness/career-analysis-availability.sql
SELECT pg_temp.ok(true, 'M6.1 supabase/readiness/career-analysis-availability.sql executes against the replayed schema');

DO $$ BEGIN RAISE NOTICE 'cd_availability_matrix_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
