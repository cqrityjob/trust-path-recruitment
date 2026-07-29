-- Security Career Discovery v3.0 — Phase 1 database tests.
--
-- Covers persistence and isolation (directive §23 tests 16–20), the
-- database-side scoring boundary, the lifecycle guard, and the five
-- integrity blockers closed by the hardening migration:
--
--   B1  item identity validated against a versioned registry
--   B2  adaptive_path derived from context_status
--   B3  snapshot version tuple derived from the session
--   B4  completion is server-side, transactional and currently blocked
--   B5  internal_test reachable only through an admin-authorised function
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

-- After the internal-test migration the version sits at internal_test.
-- It is still NOT reachable by an ordinary candidate: only pilot/active
-- with every review gate cleared is, and internal_test needs the
-- admin-authorised function. Group 14 proves both.
SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions
    WHERE assessment_id = 'security-career-discovery-v3') = 'internal_test',
  'G1.1 v3.0 sits at lifecycle_status = internal_test, never pilot or active');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_versions
    WHERE assessment_id = 'security-career-discovery-v3'
      AND lifecycle_status IN ('pilot','active')) = 0,
  'G1.2 v3.0 is not in a status ordinary candidates can reach');

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

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessments WHERE id = 'public-career-assessment') = 1,
  'G1.5 the live public-career-assessment definition still exists');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_versions
    WHERE assessment_id = 'public-career-assessment') >= 1,
  'G1.6 the live public-career-assessment version still exists');

-- =========================================================================
-- Group 2 — BLOCKER 1: the item registry
-- =========================================================================

CREATE TEMP TABLE t_ids AS
SELECT id AS defver FROM public.cd_definition_versions
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di JOIN t_ids ON di.definition_version_id = t_ids.defver) = 42,
  'G2.1 the registry holds exactly 42 items');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di JOIN t_ids ON di.definition_version_id = t_ids.defver
    WHERE di.is_scored) = 20,
  'G2.2 exactly 20 registry items are scored');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di JOIN t_ids ON di.definition_version_id = t_ids.defver
    WHERE di.item_kind = 'adaptive') = 20,
  'G2.3 the adaptive bank holds 20 items');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di JOIN t_ids ON di.definition_version_id = t_ids.defver
    WHERE di.item_kind = 'context') = 2,
  'G2.4 exactly 2 context items');
SELECT pg_temp.ok(
  (SELECT count(DISTINCT adaptive_path) FROM public.cd_definition_items di JOIN t_ids ON di.definition_version_id = t_ids.defver
    WHERE di.item_kind = 'adaptive') = 5,
  'G2.5 the adaptive bank spans five distinct paths');
SELECT pg_temp.ok(
  (SELECT bool_and(n = 4) FROM (
    SELECT count(*) AS n FROM public.cd_definition_items di JOIN t_ids ON di.definition_version_id = t_ids.defver
    WHERE di.item_kind = 'adaptive' GROUP BY di.adaptive_path) q),
  'G2.6 every adaptive path holds exactly 4 items');

-- The scoring boundary is a table constraint, so a bad registry row is
-- unauthorable in the first place.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_definition_items
    (definition_version_id, item_id, item_version, item_kind, evidence_class,
     is_scored, section_id, display_order)
  SELECT defver, 'BOGUS_SCORED_CONTEXTUAL', 1, 'single_axis', 'contextual_self_report',
         true, 'approach', 99 FROM t_ids
$$, 'cd_definition_items_scoring_boundary',
  'G2.7 a registry row cannot claim contextual evidence is scored');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_definition_items
    (definition_version_id, item_id, item_version, item_kind, evidence_class,
     is_scored, adaptive_path, section_id, display_order)
  SELECT defver, 'BOGUS_SCORED_ADAPTIVE', 1, 'adaptive', 'orientation_self_report',
         true, 'A', 'approach', 99 FROM t_ids
$$, 'cd_definition_items_contextual_kinds',
  'G2.8 an adaptive registry row cannot carry a scoring evidence class');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_definition_items
    (definition_version_id, item_id, item_version, item_kind, evidence_class,
     is_scored, section_id, display_order)
  SELECT defver, 'S1', 2, 'single_axis', 'orientation_self_report',
         true, 'approach', 1 FROM t_ids
$$, 'cd_definition_items_identity',
  'G2.9 an item id is unique within a definition version');

-- =========================================================================
-- Group 3 — a session cannot start against a non-administrable version
-- =========================================================================

-- Drop back to design transaction-locally to prove it is unreachable.
UPDATE public.cd_definition_versions SET lifecycle_status = 'design'
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_sessions (definition_version_id, anon_session_token)
  SELECT defver, gen_random_uuid() FROM t_ids
$$, 'CD_VERSION_NOT_ADMINISTRABLE',
  'G3.1 a session cannot start against a design-status version');

UPDATE public.cd_definition_versions SET lifecycle_status = 'internal_test'
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_sessions (definition_version_id, anon_session_token, is_internal_test)
  SELECT defver, gen_random_uuid(), true FROM t_ids
$$, 'CD_INTERNAL_TEST_REQUIRES_AUTHORISED_FUNCTION',
  'G3.2 an internal_test version is not reachable by a direct client insert');

SELECT pg_temp.must_fail($$
  SELECT public.cd_begin_internal_test_session((SELECT defver FROM t_ids), 'sv', 'exploring_security')
$$, 'CD_INTERNAL_TEST_NOT_AUTHORISED',
  'G3.3 the internal-test function refuses an unauthorised caller');

UPDATE public.cd_definition_versions SET lifecycle_status = 'active'
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_sessions (definition_version_id, anon_session_token)
  SELECT defver, gen_random_uuid() FROM t_ids
$$, 'CD_REVIEW_GATES_OUTSTANDING',
  'G3.4 an active version with outstanding review gates still refuses sessions');

-- Clear the gates for the remaining fixtures. Transaction-local, rolled back.
UPDATE public.cd_definition_versions
SET review_status = jsonb_build_object(
  'content_review', true, 'sme_review', true, 'language_review', true,
  'accessibility_review', true, 'bias_review', true,
  'privacy_legal_review', true, 'psychometric_review', true)
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_sessions (definition_version_id, anon_session_token, is_internal_test)
  SELECT defver, gen_random_uuid(), true FROM t_ids
$$, 'CD_INTERNAL_TEST_FLAG_ON_CANDIDATE_SESSION',
  'G3.5 a candidate session cannot flag itself as an internal test');

-- =========================================================================
-- Fixtures — two synthetic users, one session each
-- =========================================================================

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alpha@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'beta@example.test');

INSERT INTO public.cd_sessions
  (id, definition_version_id, user_id, locale, context_status, discovery_goal,
   adaptive_path, current_section, status)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001', defver,
  '11111111-1111-1111-1111-111111111111', 'sv',
  -- Deliberately claims path E while answering exploring_security. BLOCKER 2
  -- requires the database to derive the path rather than accept this.
  'exploring_security', 'find_direction', 'E', 'approach', 'in_progress'
FROM t_ids;

INSERT INTO public.cd_sessions
  (id, definition_version_id, user_id, locale, context_status, discovery_goal,
   current_section, status)
SELECT
  'bbbbbbbb-0000-0000-0000-000000000002', defver,
  '22222222-2222-2222-2222-222222222222', 'en',
  'security_leader', 'understand_strengths', 'approach', 'in_progress'
FROM t_ids;

-- =========================================================================
-- Group 4 — BLOCKER 2: adaptive_path is derived, never accepted
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'A',
  'G4.1 context_status=exploring_security cannot persist with path E — derived to A');

SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'E',
  'G4.2 security_leader derives path E with no caller-supplied value');

-- All five mappings, proven directly against the derivation function.
SELECT pg_temp.ok(
  public.cd_derive_adaptive_path('exploring_security') = 'A'
  AND public.cd_derive_adaptive_path('working_in_security') = 'B'
  AND public.cd_derive_adaptive_path('developing_current_role') = 'C'
  AND public.cd_derive_adaptive_path('changing_career_area') = 'D'
  AND public.cd_derive_adaptive_path('security_leader') = 'E',
  'G4.3 all five context_status values derive their specified path');

-- An attempted path change is overwritten back from context_status.
UPDATE public.cd_sessions SET adaptive_path = 'C'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'A',
  'G4.4 a client attempt to change the path is overwritten deterministically');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET context_status = 'working_in_security'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'CD_CONTEXT_STATUS_IMMUTABLE',
  'G4.5 context_status stays immutable once routing has been assigned');

-- Changing C2 leaves the path untouched.
UPDATE public.cd_sessions SET discovery_goal = 'curious'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'A',
  'G4.6 changing the C2 answer leaves the adaptive path untouched');

UPDATE public.cd_sessions SET current_section = 'decisions', current_item = 'S4'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.ok(
  (SELECT current_section FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'decisions',
  'G4.7 resume position is updatable (test 16: refresh resumes the right place)');

-- =========================================================================
-- Group 5 — BLOCKER 1: evidence is validated against the registry
-- =========================================================================

-- Unknown item id, including a semantic duplicate filed under a new id.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1_COPY', 'full_presence')
$$, 'CD_UNKNOWN_ITEM',
  'G5.1 a duplicated semantic question under another id is rejected');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'q16', 'anything')
$$, 'CD_UNKNOWN_ITEM',
  'G5.2 a legacy v2.1 item id cannot be answered in a v3 session');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, item_version, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 2, 'full_presence')
$$, 'CD_ITEM_VERSION_MISMATCH',
  'G5.3 a wrong item version is rejected');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, item_kind, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 'adaptive', 'full_presence')
$$, 'CD_ITEM_KIND_MISMATCH',
  'G5.4 a wrong item kind is rejected');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, evidence_class, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_EXPLORE_01',
          'orientation_self_report', 'a')
$$, 'CD_EVIDENCE_CLASS_MISMATCH',
  'G5.5 an adaptive item cannot be relabelled as scoring evidence');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, is_scored, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_EXPLORE_02', true, 'b')
$$, 'CD_IS_SCORED_MISMATCH',
  'G5.6 is_scored cannot be asserted true for a contextual item');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, evidence_class, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'CTX_CURRENT_STATUS',
          'orientation_self_report', 'exploring_security')
$$, 'CD_EVIDENCE_CLASS_MISMATCH',
  'G5.7 a context question cannot be scored');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value, answer_tags)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 'full_presence',
          ARRAY['operational_interest'])
$$, 'CD_REPORT_TAGS_ONLY_ON_ADAPTIVE',
  'G5.8 a scored core item cannot carry contextual report tags');

-- An adaptive item owned by another path.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_LEADER_01', 'a')
$$, 'CD_ADAPTIVE_PATH_MISMATCH',
  'G5.9 a path A session cannot answer a path E adaptive item');

-- The legitimate shapes succeed, with metadata DERIVED from the registry —
-- the caller supplies only the item id and the answer.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'CTX_CURRENT_STATUS', 'exploring_security');

INSERT INTO public.cd_evidence (session_id, item_id, answer_value, answer_tags)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ADAPT_EXPLORE_01', 'a',
        ARRAY['operational_interest']);

SELECT pg_temp.ok(
  (SELECT item_kind = 'context' AND evidence_class = 'contextual_self_report'
          AND is_scored = false AND item_version = 1 AND adaptive_path IS NULL
     FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND item_id = 'CTX_CURRENT_STATUS'),
  'G5.10 context evidence metadata is derived correctly from the registry');

SELECT pg_temp.ok(
  (SELECT item_kind = 'adaptive' AND evidence_class = 'contextual_self_report'
          AND is_scored = false AND adaptive_path = 'A'
     FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND item_id = 'ADAPT_EXPLORE_01'),
  'G5.11 adaptive evidence metadata is derived correctly, path included');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND is_scored) = 0,
  'G5.12 context and adaptive answers contribute zero scored evidence');

-- =========================================================================
-- Group 6 — going back updates, never duplicates (test 17)
-- =========================================================================

INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 'remote_analysis');

UPDATE public.cd_evidence SET answer_value = 'full_presence'
WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND item_id = 'S1';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND item_id = 'S1') = 1,
  'G6.1 changing an answer leaves exactly one evidence row');
SELECT pg_temp.ok(
  (SELECT answer_value FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND item_id = 'S1') = 'full_presence',
  'G6.2 the revised answer is the stored one');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'S1', 'mixed_planning')
$$, 'duplicate key',
  'G6.3 a second evidence row for the same item is rejected outright');

-- =========================================================================
-- Group 7 — BLOCKER 1: completion proves the EXACT core set
-- =========================================================================

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_report_snapshots (session_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001')
$$, 'CD_CORE_INCOMPLETE',
  'G7.1 a report cannot be generated with 1 of 20 scored core items');

SELECT pg_temp.ok(
  (SELECT array_length(missing, 1) FROM public.cd_session_core_completion(
     'aaaaaaaa-0000-0000-0000-000000000001')) = 19,
  'G7.2 the completion helper reports 19 missing core items by name');

-- Answer the remaining 19 scored core items, metadata derived throughout.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', v.item_id, 'x'
FROM (VALUES
  ('S2'),('S3'),('S4'),('S5'),('S6'),('S7'),('S8'),
  ('T1'),('T2'),('T3'),('T4'),('T5'),('T6'),('T7'),('T8'),
  ('B1'),('B2'),('B3'),('B4')
) AS v(item_id);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND is_scored) = 20,
  'G7.3 all 20 scored core items are now answered');
SELECT pg_temp.ok(
  (SELECT array_length(missing, 1) IS NULL AND array_length(unexpected, 1) IS NULL
     FROM public.cd_session_core_completion('aaaaaaaa-0000-0000-0000-000000000001')),
  'G7.4 the core set matches the registry exactly, in both directions');

-- Adaptive answers remain optional: 1 of 4 answered.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      AND item_kind = 'adaptive') = 1,
  'G7.5 only 1 of 4 adaptive items is answered');

-- ---- The four rejection cases the directive names, on a second session ----
--
-- Session beta is on path E and is used to construct each failure mode.

-- (a) 20 unknown item ids — every one is refused at insert.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'FAKE_01', 'x')
$$, 'CD_UNKNOWN_ITEM',
  'G7.6 20-unknown-items case: an unknown scored id cannot be stored at all');

-- (b) 19 correct + 1 unknown — same refusal, so the set can never form.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
SELECT 'bbbbbbbb-0000-0000-0000-000000000002', v.item_id, 'x'
FROM (VALUES
  ('S1'),('S2'),('S3'),('S4'),('S5'),('S6'),('S7'),('S8'),
  ('T1'),('T2'),('T3'),('T4'),('T5'),('T6'),('T7'),('T8'),
  ('B1'),('B2'),('B3')
) AS v(item_id);

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'B4_ALTERNATE', 'x')
$$, 'CD_UNKNOWN_ITEM',
  'G7.7 19-correct-plus-1-unknown case: the unknown 20th is refused');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_report_snapshots (session_id)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002')
$$, 'CD_CORE_INCOMPLETE',
  'G7.8 19 correct core items cannot produce a report');

SELECT pg_temp.ok(
  (SELECT missing = ARRAY['B4'] FROM public.cd_session_core_completion(
     'bbbbbbbb-0000-0000-0000-000000000002')),
  'G7.9 the missing item is identified by name, not merely counted');

-- (c) 20 correct + an extra scored item. The extra must come from the
--     registry to be storable at all, so it is constructed by adding a
--     21st scored registry item — proving the set-equality check, not just
--     the count, is what rejects it.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'B4', 'changed');

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, section_id, display_order)
SELECT defver, 'S9_EXTRA', 1, 'single_axis', 'orientation_self_report',
       true, 'development', 9 FROM t_ids;

INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'S9_EXTRA', 'x');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND is_scored) = 21,
  'G7.10 21 scored items are present, so a bare count of 20 would not catch it');

-- Session alpha now has 20 of the 21 expected: the extra registry item makes
-- alpha incomplete, which is exactly the set-equality behaviour wanted.
SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_report_snapshots (session_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001')
$$, 'CD_CORE_INCOMPLETE',
  'G7.11 adding a scored item to the definition makes a 20-item session incomplete');

-- Remove the extra registry row and the extra answer; both sessions return
-- to the real 20-item definition.
DELETE FROM public.cd_evidence
WHERE session_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND item_id = 'S9_EXTRA';
DELETE FROM public.cd_definition_items WHERE item_id = 'S9_EXTRA';

SELECT pg_temp.ok(
  (SELECT array_length(missing, 1) IS NULL AND array_length(unexpected, 1) IS NULL
     FROM public.cd_session_core_completion('aaaaaaaa-0000-0000-0000-000000000001')),
  'G7.12 alpha is complete again against the restored 20-item definition');

-- =========================================================================
-- Group 8 — BLOCKER 3: snapshot versions are derived, never accepted
-- =========================================================================

INSERT INTO public.cd_report_snapshots
  (session_id, definition_version, content_version, scoring_version, taxonomy_version,
   contextual_tags, context_status, discovery_goal)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        'TAMPERED-definition', 'TAMPERED-content', 'TAMPERED-scoring', 'TAMPERED-taxonomy',
        ARRAY['operational_interest'], 'security_leader', 'confirm_direction');

SELECT pg_temp.ok(
  (SELECT definition_version || '|' || content_version || '|' || scoring_version || '|' || taxonomy_version
     FROM public.cd_report_snapshots
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  = '2026-scd-v3.0.0|scd-content-v3.0.0|scd-scoring-v3.0.0|cig-areas-v1',
  'G8.1 a caller-supplied version tuple is discarded and derived from the definition');

SELECT pg_temp.ok(
  (SELECT context_status = 'exploring_security' AND discovery_goal = 'curious'
     FROM public.cd_report_snapshots
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'G8.2 context_status and discovery_goal are copied from the session, not the caller');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_report_snapshots SET scoring_version = 'tampered'
  WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'CD_SNAPSHOT_VERSIONS_IMMUTABLE',
  'G8.3 a stored report''s version references cannot be rewritten (test 18)');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_report_snapshots (session_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001')
$$, 'duplicate key',
  'G8.4 a session can never carry two report snapshots');

-- =========================================================================
-- Group 9 — BLOCKER 4: completion is server-side and transactional
-- =========================================================================

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET status = 'completed', completed_at = now()
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
$$, 'CD_COMPLETION_REQUIRES_SERVER_PATH',
  'G9.1 a client cannot mark its own session completed');

-- Alpha HAS a snapshot, and still cannot self-complete: possessing a
-- snapshot is not authorisation to flip the status.
SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET status = 'completed', completed_at = now()
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
$$, 'CD_COMPLETION_REQUIRES_SERVER_PATH',
  'G9.2 even a session with a snapshot cannot be completed by the client');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET completed_at = now()
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
$$, 'CD_COMPLETED_AT_WITHOUT_COMPLETION',
  'G9.3 completed_at cannot be set while the session is in_progress');

SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'in_progress',
  'G9.4 a failed completion attempt leaves the session in_progress');

-- The Phase 1 single-argument stub is GONE: Phase 3 replaced it with the
-- six-argument function and dropped rather than overloaded it, so no
-- payload-free completion path survives.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session'
      AND p.pronargs = 1) = 0,
  'G9.5 the payload-free cd_complete_session(uuid) stub no longer exists');

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cd_complete_session'
      AND p.pronargs = 6) = 1,
  'G9.6 exactly one completion function exists, and it requires the report payload');

-- Removing a core item still blocks completion. Group 14 exercises the
-- full transactional path end to end.
DELETE FROM public.cd_evidence
WHERE session_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND item_id = 'B4';

SELECT pg_temp.must_fail(
  'SELECT public.cd_complete_session(''bbbbbbbb-0000-0000-0000-000000000002'', ''{}''::jsonb, ''[{"areaId":"x"}]''::jsonb, ''{}''::jsonb, ''{}''::jsonb, ARRAY[]::text[])',
  'CD_CORE_INCOMPLETE',
  'G9.7 the completion function refuses an incomplete core');

SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'in_progress'
  AND (SELECT count(*) FROM public.cd_report_snapshots
        WHERE session_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0,
  'G9.8 a refused completion writes no snapshot and does not change status');

SELECT pg_temp.must_fail(
  'SELECT public.cd_complete_session(''99999999-9999-9999-9999-999999999999'', ''{}''::jsonb, ''[{"areaId":"x"}]''::jsonb, ''{}''::jsonb, ''{}''::jsonb, ARRAY[]::text[])',
  'CD_SESSION_NOT_FOUND',
  'G9.9 the completion function refuses an unknown session with the canonical code');

-- =========================================================================
-- Group 10 — the guards hold for BYPASSRLS callers
-- =========================================================================

SET LOCAL ROLE service_role;

SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'A',
  'G10.1 service_role sees the derived path, not the one originally supplied');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, evidence_class, answer_value)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'ADAPT_LEADER_02',
          'orientation_self_report', 'a')
$$, 'CD_EVIDENCE_CLASS_MISMATCH',
  'G10.2 service_role (BYPASSRLS) still cannot score an adaptive answer');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'TOTALLY_MADE_UP', 'x')
$$, 'CD_UNKNOWN_ITEM',
  'G10.3 service_role still cannot answer an unregistered item');

SELECT pg_temp.must_fail($$
  INSERT INTO public.cd_report_snapshots (session_id)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002')
$$, 'CD_CORE_INCOMPLETE',
  'G10.4 service_role still cannot generate a report from an incomplete core');

SELECT pg_temp.must_fail($$
  UPDATE public.cd_sessions SET status = 'completed', completed_at = now()
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
$$, 'CD_COMPLETION_REQUIRES_SERVER_PATH',
  'G10.5 even service_role must go through cd_complete_session()');

RESET ROLE;

-- =========================================================================
-- Group 11 — one user cannot reach another's session or report (test 20)
-- =========================================================================
--
-- Differential: the SAME query returns rows for the owner and zero for the
-- other user. A one-sided check would pass vacuously if RLS hid everything.

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_sessions) = 1,
  'G11.1 user alpha sees exactly their own session');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_sessions
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0,
  'G11.2 user alpha cannot see user beta''s session');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_evidence) = 22,
  'G11.3 user alpha sees their own 22 evidence rows');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_report_snapshots) = 1,
  'G11.4 user alpha sees their own report snapshot');

SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_sessions) = 1,
  'G11.5 user beta sees exactly their own session');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_sessions
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'G11.6 user beta cannot see user alpha''s session');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_evidence) = 19,
  'G11.7 user beta sees only their own evidence, never alpha''s');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_report_snapshots) = 0,
  'G11.8 user beta cannot see user alpha''s report');

RESET ROLE;

-- =========================================================================
-- Group 12 — anonymous callers have no direct access at all
-- =========================================================================

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_sessions',
  'permission denied', 'G12.1 anon is denied all access to cd_sessions');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_evidence',
  'permission denied', 'G12.2 anon is denied all access to cd_evidence');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_report_snapshots',
  'permission denied', 'G12.3 anon is denied all access to cd_report_snapshots');
-- Structure metadata is deliberately public: no candidate data, no weights.
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_definition_versions) >= 1,
  'G12.4 anon may read definition metadata (carries no candidate data)');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_definition_items) = 42,
  'G12.5 anon may read the item registry (carries no candidate data, no weights)');
RESET ROLE;

-- Anonymous session support is RESERVED, not implemented.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_sessions WHERE anon_session_token IS NOT NULL) = 0,
  'G12.6 no anonymous session exists — the path is reserved, not implemented');
SELECT pg_temp.ok(
  (SELECT obj_description('public.cd_sessions'::regclass) LIKE '%RESERVED AND NOT YET IMPLEMENTED%'),
  'G12.7 the table comment states anonymous support is not yet implemented');

-- =========================================================================
-- Group 13 — erasure works despite immutability (test 19 + GDPR)
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DELETE FROM public.cd_sessions WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'G13.1 deleting the session erases its evidence');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots
    WHERE session_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'G13.2 deleting the session erases its report snapshot');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items) = 42,
  'G13.3 erasing a person leaves the definition registry intact');

-- The legacy v2.1 world is entirely unaffected by all of the above.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assessment_run_reports'
      AND table_type = 'BASE TABLE') = 1,
  'G13.4 the legacy assessment_run_reports table is intact');
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assessment_runs') >= 12,
  'G13.5 the legacy assessment_runs schema is unchanged');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND c.relname IN ('assessment_runs','assessment_responses','assessment_run_reports')
      AND t.tgname LIKE 'cd\_%') = 0,
  'G13.6 no cd_ trigger was attached to any legacy assessment table');

-- =========================================================================

-- =========================================================================
-- Group 14 — internal-test enablement and ATOMIC completion (Phase 3)
-- =========================================================================

-- Groups 2-13 leave the version at `active` with gates cleared so candidate
-- fixtures could be built. Restore the shipped state for group 14.
UPDATE public.cd_definition_versions
SET lifecycle_status = 'internal_test',
    review_status = jsonb_build_object(
      'content_review', false, 'sme_review', false, 'language_review', false,
      'accessibility_review', false, 'bias_review', false,
      'privacy_legal_review', false, 'psychometric_review', false)
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions
    WHERE assessment_id = 'security-career-discovery-v3') = 'internal_test',
  'G14.1 the version is promoted to internal_test, not pilot or active');

SELECT pg_temp.ok(
  (SELECT employer_visible FROM public.assessments
    WHERE id = 'security-career-discovery-v3') = false,
  'G14.2 promotion did not make the definition visible to employers');

-- Review gates stay outstanding: that is the point of an internal test.
SELECT pg_temp.ok(
  (SELECT count(*) FROM jsonb_each(
      (SELECT review_status FROM public.cd_definition_versions
        WHERE assessment_id = 'security-career-discovery-v3')) AS g(k, v)
    WHERE g.v = 'true'::jsonb) = 0,
  'G14.3 internal testing runs before the review gates, which remain outstanding');

INSERT INTO auth.users (id, email) VALUES
  ('33333333-3333-3333-3333-333333333333', 'gamma@example.test');

CREATE TEMP TABLE t2 AS
SELECT id AS defver FROM public.cd_definition_versions
WHERE assessment_id = 'security-career-discovery-v3';
-- Readable under SET ROLE, so the fixtures below can run as a real caller.
GRANT SELECT ON t2 TO authenticated;

-- A non-tester cannot open a session, even though the version is now
-- internal_test.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
SELECT pg_temp.must_fail(
  'SELECT public.cd_begin_internal_test_session((SELECT defver FROM t2), ''sv'', NULL)',
  'CD_INTERNAL_TEST_NOT_AUTHORISED',
  'G14.4 an unauthorised user cannot open an internal-test session');
RESET ROLE;

-- Authorise them, then it works and is idempotent.
INSERT INTO public.cd_internal_testers (user_id) VALUES ('33333333-3333-3333-3333-333333333333');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
CREATE TEMP TABLE t_sess AS
SELECT public.cd_begin_internal_test_session((SELECT defver FROM t2), 'sv', 'exploring_security') AS sid;
GRANT SELECT ON t_sess TO authenticated;

SELECT pg_temp.ok((SELECT sid FROM t_sess) IS NOT NULL,
  'G14.5 an authorised tester can open an internal-test session');
SELECT pg_temp.ok(
  public.cd_begin_internal_test_session((SELECT defver FROM t2), 'sv', 'exploring_security')
    = (SELECT sid FROM t_sess),
  'G14.6 opening again returns the SAME session — no duplicate runs');
RESET ROLE;

-- An AUTHORISED tester still cannot reach a design-status version: the
-- status branch is what refuses here, not the authorisation branch.
UPDATE public.cd_definition_versions SET lifecycle_status = 'design'
WHERE assessment_id = 'security-career-discovery-v3';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
SELECT pg_temp.must_fail(
  'SELECT public.cd_begin_internal_test_session((SELECT defver FROM t2), ''sv'', NULL)',
  'CD_NOT_AN_INTERNAL_TEST_VERSION',
  'G14.6b design is unreachable even for an authorised tester');
RESET ROLE;
UPDATE public.cd_definition_versions SET lifecycle_status = 'internal_test'
WHERE assessment_id = 'security-career-discovery-v3';

SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions WHERE id = (SELECT sid FROM t_sess)) = 'A',
  'G14.7 the path is derived from context_status on the tester session');
SELECT pg_temp.ok(
  (SELECT is_internal_test FROM public.cd_sessions WHERE id = (SELECT sid FROM t_sess)),
  'G14.8 the session is marked as an internal test');

-- Completion refuses an incomplete core, and leaves nothing behind.
SELECT pg_temp.must_fail(
  format('SELECT public.cd_complete_session(%L, ''{}''::jsonb, ''[{"areaId":"x"}]''::jsonb, ''{}''::jsonb, ''{}''::jsonb, ARRAY[]::text[])',
         (SELECT sid FROM t_sess)),
  'CD_CORE_INCOMPLETE',
  'G14.9 completion refuses an incomplete core set');

SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions WHERE id = (SELECT sid FROM t_sess)) = 'in_progress'
  AND (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess)) = 0,
  'G14.10 a refused completion leaves the session in_progress with no snapshot');

-- Answer all 20 core items.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
SELECT (SELECT sid FROM t_sess), v.item_id, 'x'
FROM (VALUES ('S1'),('S2'),('S3'),('S4'),('S5'),('S6'),('S7'),('S8'),
             ('T1'),('T2'),('T3'),('T4'),('T5'),('T6'),('T7'),('T8'),
             ('B1'),('B2'),('B3'),('B4')) AS v(item_id);

-- An empty ranking is refused: a report with no areas is not a report.
SELECT pg_temp.must_fail(
  format('SELECT public.cd_complete_session(%L, ''{}''::jsonb, ''[]''::jsonb, ''{}''::jsonb, ''{}''::jsonb, ARRAY[]::text[])',
         (SELECT sid FROM t_sess)),
  'CD_EMPTY_RANKING',
  'G14.11 completion refuses a report with no ranked Security Career Areas');

-- The real completion: atomic.
CREATE TEMP TABLE t_snap AS
SELECT public.cd_complete_session(
  (SELECT sid FROM t_sess),
  '{"axes":[]}'::jsonb,
  '[{"areaId":"protective_operations","fit":0.98,"confidence":"strong"}]'::jsonb,
  '{"axisCoverage":1}'::jsonb,
  '{"coverage":1}'::jsonb,
  ARRAY['operational_interest']::text[]) AS snap;

SELECT pg_temp.ok((SELECT snap FROM t_snap) IS NOT NULL,
  'G14.12 completion returns a snapshot id');
SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions WHERE id = (SELECT sid FROM t_sess)) = 'completed'
  AND (SELECT completed_at FROM public.cd_sessions WHERE id = (SELECT sid FROM t_sess)) IS NOT NULL,
  'G14.13 the session is completed and stamped, in the same transaction');

-- Versions are DERIVED, not taken from the caller.
SELECT pg_temp.ok(
  (SELECT definition_version||'|'||content_version||'|'||scoring_version||'|'||taxonomy_version
     FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess))
  = '2026-scd-v3.0.0|scd-content-v3.0.0|scd-scoring-v3.0.0|cig-areas-v1',
  'G14.14 the stored version tuple is derived, not the literal ''derived'' placeholders passed in');

SELECT pg_temp.ok(
  (SELECT context_status FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess))
    = 'exploring_security',
  'G14.15 context_status is copied from the session onto the snapshot');

-- Repeat completion is rejected with a stable code, and creates nothing.
SELECT pg_temp.must_fail(
  format('SELECT public.cd_complete_session(%L, ''{}''::jsonb, ''[{"areaId":"x"}]''::jsonb, ''{}''::jsonb, ''{}''::jsonb, ARRAY[]::text[])',
         (SELECT sid FROM t_sess)),
  'CD_ALREADY_COMPLETED',
  'G14.16 repeat completion is rejected with a stable error code');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess)) = 1,
  'G14.17 a session can never accumulate a second snapshot');

-- A completed session is terminal and its client still cannot touch status.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
SELECT pg_temp.must_fail(
  format('UPDATE public.cd_sessions SET status = ''in_progress'' WHERE id = %L', (SELECT sid FROM t_sess)),
  'CD_COMPLETED_IS_TERMINAL',
  'G14.18 a completed session cannot be reopened by its owner');

-- History view is owner-scoped.
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_my_report_history) = 1,
  'G14.19 the tester sees exactly their own report in the history view');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_my_report_history) = 0,
  'G14.20 another user sees none of the tester''s reports in the history view');
RESET ROLE;

-- =========================================================================
-- Group 15 — report persistence, ownership and immutability
-- =========================================================================

-- Re-complete a session so this group has a stored report to reason about.
-- Created as the real caller: the RPC reads auth.uid().
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
CREATE TEMP TABLE t_sess2 AS
SELECT public.cd_begin_internal_test_session((SELECT defver FROM t2), 'sv', 'working_in_security') AS sid;
RESET ROLE;
GRANT SELECT ON t_sess2 TO authenticated;

INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
SELECT (SELECT sid FROM t_sess2), v.item_id, 'x'
FROM (VALUES ('S1'),('S2'),('S3'),('S4'),('S5'),('S6'),('S7'),('S8'),
             ('T1'),('T2'),('T3'),('T4'),('T5'),('T6'),('T7'),('T8'),
             ('B1'),('B2'),('B3'),('B4')) AS v(item_id);

CREATE TEMP TABLE t_snap2 AS
SELECT public.cd_complete_session(
  (SELECT sid FROM t_sess2),
  '{"axes":[{"axis":"CDA-01"}],"report":{"reportVersion":"scd-report-v1"}}'::jsonb,
  '[{"areaId":"protective_operations","fit":0.91,"confidence":"strong"}]'::jsonb,
  '{"axisCoverage":1}'::jsonb, '{"coverage":1}'::jsonb,
  ARRAY['operational_energy']::text[]) AS snap;

-- ONE durable report per completed session.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess2)) = 1,
  'G15.1 a completed session stores exactly one report snapshot');

-- Owned by the authenticated candidate who completed it.
SELECT pg_temp.ok(
  (SELECT s.user_id FROM public.cd_sessions s WHERE s.id = (SELECT sid FROM t_sess2))
    = '33333333-3333-3333-3333-333333333333',
  'G15.2 the report belongs to the candidate who completed it');

-- The full report payload is STORED, not recomputed at read time.
SELECT pg_temp.ok(
  (SELECT dna_scores ? 'report' FROM public.cd_report_snapshots
    WHERE session_id = (SELECT sid FROM t_sess2)),
  'G15.3 the rendered report is persisted in the snapshot, not derived live on read');

-- Reopening returns byte-identical stored content.
CREATE TEMP TABLE t_first AS
SELECT dna_scores, career_areas, confidence, coverage, contextual_tags,
       definition_version, content_version, scoring_version, taxonomy_version
FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess2);

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots r
    JOIN t_first f ON r.dna_scores = f.dna_scores
                  AND r.career_areas = f.career_areas
                  AND r.scoring_version = f.scoring_version
   WHERE r.session_id = (SELECT sid FROM t_sess2)) = 1,
  'G15.4 reopening the report returns the identical stored snapshot');

-- Duplicate completion cannot create a second report.
SELECT pg_temp.must_fail(
  format('SELECT public.cd_complete_session(%L, ''{}''::jsonb, ''[{"areaId":"x"}]''::jsonb, ''{}''::jsonb, ''{}''::jsonb, ARRAY[]::text[])',
         (SELECT sid FROM t_sess2)),
  'CD_ALREADY_COMPLETED',
  'G15.5 completing twice is rejected — double-click cannot duplicate a report');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess2)) = 1,
  'G15.6 still exactly one report after a duplicate completion attempt');

-- The unique constraint is the real guarantee, not the status check alone.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.cd_report_snapshots (session_id, definition_version, content_version, scoring_version, taxonomy_version, career_areas) VALUES (%L, ''x'', ''x'', ''x'', ''x'', ''[{"areaId":"y"}]''::jsonb)',
         (SELECT sid FROM t_sess2)),
  'duplicate key',
  'G15.7 a second snapshot row for the same session is refused by the database');

-- Answers survive report generation — the candidate never loses them.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence WHERE session_id = (SELECT sid FROM t_sess2) AND is_scored) = 20,
  'G15.8 all 20 scored answers remain after the report is generated');

-- ---- Ownership and isolation ------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess2)) = 1,
  'G15.9 candidate A can open candidate A''s report');
-- This candidate already completed a session in group 14, so assert the
-- SPECIFIC report is listed rather than a total that would drift.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_my_report_history h
    WHERE h.session_id = (SELECT sid FROM t_sess2)) = 1,
  'G15.10 the report appears in candidate A''s own history');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sid FROM t_sess2)) = 0,
  'G15.11 candidate B cannot open candidate A''s report');
SELECT pg_temp.ok((SELECT count(*) FROM public.cd_my_report_history) = 0,
  'G15.12 candidate B''s history does not leak candidate A''s report');
-- An unknown id and a foreign id are indistinguishable: both return nothing,
-- so a probe cannot confirm that another report exists.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots
    WHERE id = '00000000-0000-0000-0000-000000000000') = 0,
  'G15.13 an unknown snapshot id reveals nothing about other reports');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_report_snapshots',
  'permission denied', 'G15.14 signed-out users cannot read reports at all');
RESET ROLE;

-- Employer separation: no employer-facing grant exists on any cd_ object.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name LIKE 'cd\_%'
      AND grantee NOT IN ('postgres','service_role','authenticated','anon','sandbox_exec')) = 0,
  'G15.15 no employer role holds any grant on Career Discovery data');

-- Legacy separation: v3 completion wrote nothing into the legacy tables.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.assessment_runs
    WHERE assessment_id = 'security-career-discovery-v3') = 0,
  'G15.16 a v3 completion never writes into the legacy assessment_runs table');

DO $$ BEGIN RAISE NOTICE 'career_discovery_v3_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
