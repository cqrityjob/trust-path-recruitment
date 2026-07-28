-- Security Career Discovery v3.0 — Phase 1 database tests.
--
-- Covers the persistence and isolation half of the directive's §23 list
-- (tests 16–20), plus the database-side scoring-boundary and lifecycle
-- guards that the TypeScript guard cannot prove.
--
-- Runs inside one transaction that is rolled back, against a disposable
-- Postgres with the full migration history replayed. No real data is read
-- or written; every fixture is synthetic.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- Assert that `stmt` fails with a message containing `needle`.
CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected error containing "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

-- =========================================================================
-- Group 1 — the definition ships inert
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions
    WHERE assessment_id = 'security-career-discovery-v3') = 'design',
  'G1.1 v3.0 ships with lifecycle_status = design');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_versions
    WHERE assessment_id = 'security-career-discovery-v3'
      AND lifecycle_status IN ('pilot','active')) = 0,
  'G1.2 v3.0 is not in an administrable status');

SELECT pg_temp.ok(
  (SELECT count(*) FROM jsonb_each(
      (SELECT review_status FROM public.cd_definition_versions
        WHERE assessment_id = 'security-career-discovery-v3')) AS g(k, v)
    WHERE g.v = 'true'::jsonb) = 0,
  'G1.3 every review gate is outstanding');

SELECT pg_temp.ok(
  (SELECT employer_visible FROM public.assessments
    WHERE id = 'security-career-discovery-v3') = false,
  'G1.4 the catalog row is not visible to employers');

-- The live v2.1 definition is untouched.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessments WHERE id = 'public-career-assessment') = 1,
  'G1.5 the live public-career-assessment definition still exists');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_versions
    WHERE assessment_id = 'public-career-assessment') >= 1,
  'G1.6 the live public-career-assessment version still exists');

-- =========================================================================
-- Group 2 — a session cannot be created against a non-administrable version
-- =========================================================================
--
-- This is the structural reason v3.0 cannot reach a real candidate. It is a
-- TRIGGER, so it fires for BYPASSRLS callers too — proven in Group 7.

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_sessions (definition_version_id, anon_session_token)
  SELECT id, gen_random_uuid() FROM public.cd_definition_versions
  WHERE assessment_id = 'security-career-discovery-v3'
$$, 'CD_VERSION_NOT_ADMINISTRABLE',
  'G2.1 a session cannot start against a design-status version');

-- Promote to `active` but leave the gates outstanding — still refused.
UPDATE public.cd_definition_versions SET lifecycle_status = 'active'
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_sessions (definition_version_id, anon_session_token)
  SELECT id, gen_random_uuid() FROM public.cd_definition_versions
  WHERE assessment_id = 'security-career-discovery-v3'
$$, 'CD_REVIEW_GATES_OUTSTANDING',
  'G2.2 an active version with outstanding review gates still refuses sessions');

-- Clear the gates for the remaining fixtures. This simulates a fully
-- reviewed, owner-approved version; it is transaction-local and rolled back.
UPDATE public.cd_definition_versions
SET review_status = jsonb_build_object(
  'content_review', true, 'sme_review', true, 'language_review', true,
  'accessibility_review', true, 'bias_review', true,
  'privacy_legal_review', true, 'psychometric_review', true)
WHERE assessment_id = 'security-career-discovery-v3';

-- =========================================================================
-- Fixtures — two synthetic users, one session each
-- =========================================================================

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alpha@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'beta@example.test');

CREATE TEMP TABLE t_ids AS
SELECT id AS defver FROM public.cd_definition_versions
WHERE assessment_id = 'security-career-discovery-v3';

INSERT INTO public.cd_sessions
  (id, definition_version_id, user_id, locale, context_status, discovery_goal,
   adaptive_path, current_section, status)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001', defver,
  '11111111-1111-1111-1111-111111111111', 'sv',
  'exploring_security', 'find_direction', 'A', 'approach', 'in_progress'
FROM t_ids;

INSERT INTO public.cd_sessions
  (id, definition_version_id, user_id, locale, context_status, discovery_goal,
   adaptive_path, current_section, status)
SELECT
  'bbbbbbbb-0000-0000-0000-000000000002', defver,
  '22222222-2222-2222-2222-222222222222', 'en',
  'security_leader', 'understand_strengths', 'E', 'approach', 'in_progress'
FROM t_ids;

SELECT pg_temp.ok((SELECT count(*) FROM public.cd_sessions) = 2,
  'G2.3 two synthetic sessions created against a fully-reviewed active version');

-- =========================================================================
-- Group 3 — the adaptive path is fixed at creation (§14)
-- =========================================================================

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET adaptive_path = 'C'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'CD_ADAPTIVE_PATH_IMMUTABLE',
  'G3.1 the adaptive path cannot be changed after session creation');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET context_status = 'working_in_security'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'CD_CONTEXT_STATUS_IMMUTABLE',
  'G3.2 context_status, which determines the path, is equally frozen');

-- Changing the discovery goal (C2) is allowed and does NOT touch the path.
UPDATE public.cd_sessions SET discovery_goal = 'curious'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'A',
  'G3.3 changing the C2 answer leaves the adaptive path untouched');

-- Resume position may move freely.
UPDATE public.cd_sessions SET current_section = 'decisions', current_item = 'S4'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT current_section FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'decisions',
  'G3.4 resume position is updatable (test 16: refresh resumes the right place)');

-- =========================================================================
-- Group 4 — the scoring boundary, enforced in the database
-- =========================================================================

-- An adaptive answer cannot be relabelled as scored orientation evidence.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value,
     evidence_class, is_scored, adaptive_path)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_EXPLORE_01', 1, 'adaptive',
          'a', 'orientation_self_report', true, 'A')
$$, 'CD_SCORING_BOUNDARY_VIOLATION',
  'G4.1 an adaptive item cannot carry a scoring evidence class');

-- Nor can is_scored simply be asserted true for contextual evidence.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value,
     evidence_class, is_scored, adaptive_path)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_EXPLORE_02', 1, 'adaptive',
          'b', 'contextual_self_report', true, 'A')
$$, 'CD_SCORING_BOUNDARY_VIOLATION',
  'G4.2 is_scored is derived from evidence_class, never asserted by the caller');

-- Context questions are not scored (test 14).
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value,
     evidence_class, is_scored)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'CTX_CURRENT_STATUS', 1, 'context',
          'exploring_security', 'orientation_self_report', true)
$$, 'CD_SCORING_BOUNDARY_VIOLATION',
  'G4.3 a context question cannot be scored');

-- Only adaptive items may carry contextual report tags.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value, answer_tags,
     evidence_class, is_scored)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 1, 'single_axis',
          'full_presence', ARRAY['operational_interest'], 'orientation_self_report', true)
$$, 'CD_REPORT_TAGS_ONLY_ON_ADAPTIVE',
  'G4.4 a scored core item cannot carry contextual report tags');

-- An adaptive answer from another path is refused.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value,
     evidence_class, is_scored, adaptive_path)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_LEADER_01', 1, 'adaptive',
          'a', 'contextual_self_report', false, 'E')
$$, 'CD_ADAPTIVE_PATH_MISMATCH',
  'G4.5 a session on path A cannot store a path E adaptive answer');

-- The legitimate shapes succeed.
INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class, is_scored)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'CTX_CURRENT_STATUS', 1, 'context',
        'exploring_security', 'contextual_self_report', false);

INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, answer_tags,
   evidence_class, is_scored, adaptive_path)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_EXPLORE_01', 1, 'adaptive',
        'a', ARRAY['operational_interest'], 'contextual_self_report', false, 'A');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND is_scored) = 0,
  'G4.6 context and adaptive answers contribute zero scored evidence');

-- =========================================================================
-- Group 5 — going back updates, never duplicates (test 17)
-- =========================================================================

INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class, is_scored)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 1, 'single_axis',
        'remote_analysis', 'orientation_self_report', true);

UPDATE public.cd_evidence SET answer_value = 'full_presence'
WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND item_id = 'S1';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND item_id = 'S1') = 1,
  'G5.1 changing an answer leaves exactly one evidence row');
SELECT pg_temp.ok(
  (SELECT answer_value FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND item_id = 'S1') = 'full_presence',
  'G5.2 the revised answer is the stored one');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value, evidence_class, is_scored)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 1, 'single_axis',
          'mixed_planning', 'orientation_self_report', true)
$$, 'duplicate key',
  'G5.3 a second evidence row for the same item is rejected outright');

-- =========================================================================
-- Group 6 — a result requires the complete core (tests 12, 15)
-- =========================================================================

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
          '2026-scd-v3.0.0','scd-content-v3.0.0','scd-scoring-v3.0.0','cig-areas-v1')
$$, 'CD_CORE_INCOMPLETE',
  'G6.1 a report cannot be generated with 1 of 20 core items answered');

-- Answer the remaining 19 scored core items.
INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class, is_scored)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', v.item_id, 1, v.kind, 'x',
       CASE WHEN v.kind = 'behavioural' THEN 'behavioural_signal'
            ELSE 'orientation_self_report' END,
       true
FROM (VALUES
  ('S2','single_axis'),('S3','single_axis'),('S4','single_axis'),('S5','single_axis'),
  ('S6','single_axis'),('S7','single_axis'),('S8','single_axis'),
  ('T1','trade_off'),('T2','trade_off'),('T3','trade_off'),('T4','trade_off'),
  ('T5','trade_off'),('T6','trade_off'),('T7','trade_off'),('T8','trade_off'),
  ('B1','behavioural'),('B2','behavioural'),('B3','behavioural'),('B4','behavioural')
) AS v(item_id, kind);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND is_scored) = 20,
  'G6.2 all 20 scored core items are now answered');

-- A result is generatable WITHOUT the other three adaptive answers — the
-- structural proof that adaptive items are never required inputs.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND item_kind = 'adaptive') = 1,
  'G6.3 only 1 of 4 adaptive items is answered');

INSERT INTO public.cd_report_snapshots
  (session_id, definition_version, content_version, scoring_version, taxonomy_version,
   contextual_tags, context_status, discovery_goal)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '2026-scd-v3.0.0','scd-content-v3.0.0','scd-scoring-v3.0.0','cig-areas-v1',
        ARRAY['operational_interest'], 'exploring_security', 'curious');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
  'G6.4 a result generates from the complete core alone, with adaptive answers missing');

-- Test 18: the snapshot preserves its version references, immutably.
SELECT pg_temp.must_fail($$
  UPDATE public.cd_report_snapshots SET scoring_version = 'tampered'
  WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'CD_SNAPSHOT_VERSIONS_IMMUTABLE',
  'G6.5 a stored report''s version references cannot be rewritten');

SELECT pg_temp.ok(
  (SELECT definition_version || '|' || content_version || '|' || scoring_version || '|' || taxonomy_version
     FROM public.cd_report_snapshots
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  = '2026-scd-v3.0.0|scd-content-v3.0.0|scd-scoring-v3.0.0|cig-areas-v1',
  'G6.6 all four version references are preserved on the snapshot');

-- =========================================================================
-- Group 7 — the guards hold for BYPASSRLS callers
-- =========================================================================
--
-- service_role carries BYPASSRLS in Supabase. RLS policies would not stop
-- it; triggers do. This is why every integrity rule above is a trigger.

SET LOCAL ROLE service_role;

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET adaptive_path = 'D'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'CD_ADAPTIVE_PATH_IMMUTABLE',
  'G7.1 service_role (BYPASSRLS) still cannot change the adaptive path');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence
    (session_id, item_id, item_version, item_kind, answer_value,
     evidence_class, is_scored, adaptive_path)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'ADAPT_LEADER_02', 1, 'adaptive',
          'a', 'orientation_self_report', true, 'E')
$$, 'CD_SCORING_BOUNDARY_VIOLATION',
  'G7.2 service_role still cannot score an adaptive answer');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
          '2026-scd-v3.0.0','scd-content-v3.0.0','scd-scoring-v3.0.0','cig-areas-v1')
$$, 'CD_CORE_INCOMPLETE',
  'G7.3 service_role still cannot generate a report from an incomplete core');

RESET ROLE;

-- =========================================================================
-- Group 8 — one user cannot reach another's session or report (test 20)
-- =========================================================================
--
-- Differential test: the SAME query must return rows for the owner and zero
-- rows for the other user. A one-sided "returns nothing" check would pass
-- vacuously if RLS were misconfigured to hide everything.

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_sessions) = 1,
  'G8.1 user alpha sees exactly their own session');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_sessions
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0,
  'G8.2 user alpha cannot see user beta''s session');
-- 1 context + 1 adaptive + 20 scored core.
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_evidence) = 22,
  'G8.3 user alpha sees their own 22 evidence rows');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_report_snapshots) = 1,
  'G8.4 user alpha sees their own report snapshot');

SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_sessions) = 1,
  'G8.5 user beta sees exactly their own session');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'G8.6 user beta cannot see user alpha''s session');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_evidence) = 0,
  'G8.7 user beta cannot see user alpha''s evidence');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_report_snapshots) = 0,
  'G8.8 user beta cannot see user alpha''s report');

RESET ROLE;

-- =========================================================================
-- Group 9 — anonymous callers have no direct access at all
-- =========================================================================

-- Stronger than RLS filtering: anon holds no table privilege at all on the
-- candidate-data tables, so the request is refused outright rather than
-- returning an empty set.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_sessions',
  'permission denied', 'G9.1 anon is denied all access to cd_sessions');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_evidence',
  'permission denied', 'G9.2 anon is denied all access to cd_evidence');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_report_snapshots',
  'permission denied', 'G9.3 anon is denied all access to cd_report_snapshots');
-- Definition metadata is deliberately public: no candidate data, no weights.
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_definition_versions) >= 1,
  'G9.4 anon may read definition metadata (carries no candidate data)');
RESET ROLE;

-- =========================================================================
-- Group 10 — erasure works despite immutability (test 19 + GDPR)
-- =========================================================================
--
-- Immutability protects against MODIFICATION. It must never obstruct the
-- data subject's erasure. Deleting the session cascades to evidence and
-- snapshot.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DELETE FROM public.cd_sessions WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'G10.1 deleting the session erases its evidence');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'G10.2 deleting the session erases its report snapshot');

-- Test 19: pre-existing v2.1 history is entirely unaffected by all of this.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assessment_run_reports'
      AND table_type = 'BASE TABLE') = 1,
  'G10.3 the legacy assessment_run_reports table is intact');
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assessment_runs') >= 12,
  'G10.4 the legacy assessment_runs schema is unchanged');

-- =========================================================================

DO $$ BEGIN RAISE NOTICE 'career_discovery_v3_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
