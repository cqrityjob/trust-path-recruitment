-- Security Career Discovery v3.1 — PR 3 completion and snapshot stability.
--
-- Proves the four properties a stored report depends on:
--
--   ATOMIC       a failed completion leaves no session completed without a
--                report, and no report without a completed session;
--   IDEMPOTENT   a retry returns the stored result rather than duplicating;
--   IMMUTABLE    the database refuses any rewrite of a stored snapshot;
--   ISOLATED     a historical report can be read without consulting any
--                current definition, item registry, matrix or template.
--
-- The stability group is the important one. It does not simulate a version
-- change by editing a constant in TypeScript — it MUTATES THE ACTUAL TABLES
-- a naive implementation would read at render time (definition versions, the
-- item registry, the option matrix) and then proves the stored bytes are
-- unchanged.
--
-- Runs inside one transaction that is rolled back. Every fixture is synthetic.

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
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;

DO $$ BEGIN RAISE NOTICE 'GROUP C1 — fixtures and validation'; END $$;

-- =========================================================================
-- Fixtures: a complete v3.1 session
-- =========================================================================

UPDATE public.cd_definition_versions SET lifecycle_status = 'active'
WHERE definition_version = '2026-scd-v3.1.0';

UPDATE public.cd_definition_versions
SET review_status = jsonb_build_object(
  'content_review', true, 'sme_review', true, 'language_review', true,
  'accessibility_review', true, 'bias_review', true,
  'privacy_legal_review', true, 'psychometric_review', true)
WHERE definition_version = '2026-scd-v3.1.0';

INSERT INTO auth.users (id, email)
VALUES ('c1c1c1c1-0000-0000-0000-000000000001', 'v31complete@example.test');

CREATE TEMP TABLE t_dv AS
SELECT id AS defver FROM public.cd_definition_versions
WHERE definition_version = '2026-scd-v3.1.0';

CREATE TEMP TABLE t_s AS
WITH ins AS (
  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, context_status, discovery_goal,
     current_section, status, option_order_seed)
  SELECT defver, 'c1c1c1c1-0000-0000-0000-000000000001', 'sv',
         'exploring_security', 'find_direction', 'approach', 'in_progress', 12345
    FROM t_dv
  RETURNING id
) SELECT id AS sess FROM ins;

-- An incomplete session must be reported as such, with a reason.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.cd_v31_validate_session_evidence((SELECT sess FROM t_s))
           WHERE code = 'CD_CORE_INCOMPLETE'),
  'C1.1 an unanswered session is reported incomplete, not scored');

-- Answer all 20 items: scales get a value, single-choice items get option A.
INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
   is_scored, option_id, display_order)
SELECT (SELECT sess FROM t_s), di.item_id, di.item_version, di.item_kind,
       CASE WHEN di.item_kind = 'scale' THEN '7' ELSE di.item_id || '_A' END,
       di.evidence_class, di.is_scored,
       CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END,
       CASE WHEN di.item_kind = 'single_choice' THEN 0 END
  FROM public.cd_definition_items di
  JOIN t_dv ON di.definition_version_id = t_dv.defver
 WHERE di.is_scored;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence WHERE session_id = (SELECT sess FROM t_s)) = 20,
  'C1.2 all twenty scored items are answered');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.cd_v31_validate_session_evidence((SELECT sess FROM t_s))),
  'C1.3 a complete session passes evidence validation with no failures');

-- A SECOND complete session, created here rather than in group C7 because
-- group C5 deliberately retires the definition, retires every item and
-- deletes the option matrix. A session cannot be started after that — which
-- is exactly the property C5 exists to demonstrate.
INSERT INTO auth.users (id, email)
VALUES ('c2c2c2c2-0000-0000-0000-000000000002', 'other@example.test');

CREATE TEMP TABLE t_s2 AS
WITH ins AS (
  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, context_status, discovery_goal,
     current_section, status)
  SELECT defver, 'c2c2c2c2-0000-0000-0000-000000000002', 'en',
         'exploring_security', 'find_direction', 'approach', 'in_progress'
    FROM t_dv
  RETURNING id
) SELECT id AS sess FROM ins;

INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
   is_scored, option_id, display_order)
SELECT (SELECT sess FROM t_s2), di.item_id, di.item_version, di.item_kind,
       CASE WHEN di.item_kind = 'scale' THEN '5' ELSE di.item_id || '_B' END,
       di.evidence_class, di.is_scored,
       CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_B' END,
       CASE WHEN di.item_kind = 'single_choice' THEN 1 END
  FROM public.cd_definition_items di
  JOIN t_dv ON di.definition_version_id = t_dv.defver
 WHERE di.is_scored;


DO $$ BEGIN RAISE NOTICE 'GROUP C2 — validation refuses bad evidence'; END $$;

-- =========================================================================
-- Group C2 — validation refuses rather than repairs
-- =========================================================================

-- An option belonging to another question must be caught. This is the defect
-- class that would otherwise score the wrong dimensions in silence.
UPDATE public.cd_evidence SET option_id = 'CQ09_C'
 WHERE session_id = (SELECT sess FROM t_s) AND item_id = 'CQ02';

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM public.cd_v31_validate_session_evidence((SELECT sess FROM t_s))
           WHERE code = 'CD_OPTION_ITEM_MISMATCH'),
  'C2.1 an option belonging to another question is refused');

SELECT pg_temp.must_fail(
  format('SELECT public.cd_v31_complete_session(%L::uuid, %L::jsonb, %L, now())',
         (SELECT sess FROM t_s), '{"outputA":{"areas":[1]},"outputB":{},"versions":{}}', 'v3.1-draft-1'),
  'CD_VALIDATION_FAILED',
  'C2.2 completion refuses a session whose evidence does not validate');

SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions WHERE id = (SELECT sess FROM t_s)) = 'in_progress',
  'C2.3 a refused completion leaves the session resumable, not half-finished');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s)) = 0,
  'C2.4 a refused completion writes no partial snapshot');

UPDATE public.cd_evidence SET option_id = 'CQ02_A'
 WHERE session_id = (SELECT sess FROM t_s) AND item_id = 'CQ02';

DO $$ BEGIN RAISE NOTICE 'GROUP C3 — atomic completion'; END $$;

-- =========================================================================
-- Group C3 — a successful completion
-- =========================================================================

CREATE TEMP TABLE t_payload AS
SELECT jsonb_build_object(
  'versions', jsonb_build_object(
    'definitionVersion','2026-scd-v3.1.0',
    'contentVersion','v3.1-draft-1',
    'scoringVersion','v3.1-draft-1',
    'optionMatrixVersion','v3.1-draft-1',
    'patternDefinitionVersion','v3.1-draft-1',
    'storyTemplateVersion','v3.1-draft-1',
    'taxonomyVersion','cig-areas-v1',
    'reportSchemaVersion','cd-report-v3.1.0',
    'professionCalibrationVersion', NULL),
  'locale','sv',
  'completedAt','2026-07-30T12:00:00.000Z',
  'outputA', jsonb_build_object(
    'leadingPattern','CP01',
    'areas', jsonb_build_array(jsonb_build_object('id','SCA01','name','Bevakning','rank',1,'score',88)),
    'dimensions', jsonb_build_array(jsonb_build_object('id','CID01','name','Operativ orientering','score',0.7))),
  'outputB', jsonb_build_object(
    'locale','sv','presentedPattern','CP01',
    'leading', jsonb_build_object('name','Operativ trygghetsskapare',
      'answers', jsonb_build_object('howYouWork','Dina svar tyder pa att du fungerar bast pa plats.')),
    'share', jsonb_build_object(
      'sv', jsonb_build_object('patternId','CP01','name','Operativ trygghetsskapare',
                               'summary','Trygg nara verksamheten.'))),
  'professions', jsonb_build_object('available', false, 'matches', jsonb_build_array())
) AS payload;

CREATE TEMP TABLE t_result AS
SELECT * FROM public.cd_v31_complete_session(
  (SELECT sess FROM t_s), (SELECT payload FROM t_payload),
  'v3.1-draft-1', '2026-07-30T12:00:00.000Z'::timestamptz);

SELECT pg_temp.ok((SELECT was_created FROM t_result), 'C3.1 the first completion creates a snapshot');
SELECT pg_temp.ok((SELECT snapshot_id FROM t_result) IS NOT NULL, 'C3.2 it returns a snapshot id');

SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions WHERE id = (SELECT sess FROM t_s)) = 'completed',
  'C3.3 the session is now completed');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s)) = 1,
  'C3.4 exactly one snapshot exists');

-- The version tuple is derived from the session, never taken from the caller.
SELECT pg_temp.ok(
  (SELECT definition_version FROM public.cd_report_snapshots
    WHERE session_id = (SELECT sess FROM t_s)) = '2026-scd-v3.1.0',
  'C3.5 the stored definition version is derived from the session');

SELECT pg_temp.ok(
  (SELECT pattern_definition_version FROM public.cd_report_snapshots
    WHERE session_id = (SELECT sess FROM t_s)) = 'v3.1-draft-1',
  'C3.6 the pattern definition version is stored');

SELECT pg_temp.ok(
  (SELECT candidate_story -> 'presentedPattern' FROM public.cd_report_snapshots
    WHERE session_id = (SELECT sess FROM t_s)) = '"CP01"'::jsonb,
  'C3.7 Output B is stored as rendered content');

DO $$ BEGIN RAISE NOTICE 'GROUP C4 — idempotency'; END $$;

-- =========================================================================
-- Group C4 — retry safety
-- =========================================================================

CREATE TEMP TABLE t_retry AS
SELECT * FROM public.cd_v31_complete_session(
  (SELECT sess FROM t_s), (SELECT payload FROM t_payload),
  'v3.1-draft-1', '2026-07-30T13:00:00.000Z'::timestamptz);

SELECT pg_temp.ok(
  NOT (SELECT was_created FROM t_retry),
  'C4.1 a retry reports that it created nothing');

SELECT pg_temp.ok(
  (SELECT snapshot_id FROM t_retry) = (SELECT snapshot_id FROM t_result),
  'C4.2 a retry returns the SAME snapshot id');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s)) = 1,
  'C4.3 a retry creates no duplicate snapshot');

-- Even a caller bypassing the function entirely cannot duplicate.
SELECT pg_temp.must_fail(format($f$
  INSERT INTO public.cd_report_snapshots
    (session_id, definition_version, content_version, scoring_version, taxonomy_version)
  VALUES (%L::uuid, 'derived', 'derived', 'derived', 'derived')
$f$, (SELECT sess FROM t_s)),
  'duplicate key', 'C4.4 a direct second insert is refused by the unique constraint');

-- The retry must not have moved the completion timestamp.
SELECT pg_temp.ok(
  (SELECT generated_at FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s))
    = '2026-07-30T12:00:00.000Z'::timestamptz,
  'C4.5 the retry did not overwrite the original completion time');

DO $$ BEGIN RAISE NOTICE 'GROUP C8 — payload contract'; END $$;

-- =========================================================================
-- Group C8 — the database refuses a payload that is not a report
-- =========================================================================

SELECT pg_temp.must_fail(format(
  'SELECT public.cd_v31_complete_session(%L::uuid, ''{"outputA":{}}''::jsonb, ''v3.1-draft-1'', now())',
  (SELECT sess FROM t_s2)),
  'CD_PAYLOAD_INCOMPLETE', 'C8.1 a payload without Output B is refused');

SELECT pg_temp.must_fail(format(
  'SELECT public.cd_v31_complete_session(%L::uuid,
     ''{"outputA":{"areas":[1]},"outputB":{},"versions":{}}''::jsonb, ''v3.1-draft-1'', now())',
  (SELECT sess FROM t_s2)),
  'CD_PAYLOAD_UNVERSIONED', 'C8.2 an unversioned payload is refused');

SELECT pg_temp.must_fail(format(
  'SELECT public.cd_v31_complete_session(%L::uuid,
     ''{"outputA":{"areas":[1]},"outputB":{},"versions":{"reportSchemaVersion":"x","patternDefinitionVersion":"v1"}}''::jsonb,
     ''v3.1-draft-1'', now())',
  (SELECT sess FROM t_s2)),
  'CD_PATTERN_VERSION_MISMATCH', 'C8.3 a payload disagreeing with the column is refused');

SELECT pg_temp.must_fail(format(
  'SELECT public.cd_v31_complete_session(%L::uuid,
     ''{"outputA":{"areas":[]},"outputB":{},"versions":{"reportSchemaVersion":"x","patternDefinitionVersion":"v3.1-draft-1"}}''::jsonb,
     ''v3.1-draft-1'', now())',
  (SELECT sess FROM t_s2)),
  'CD_EMPTY_RANKING', 'C8.4 a report with no ranked areas is refused');

-- Owner requirement: an unapproved profession may never reach ranking.
SELECT pg_temp.must_fail(format(
  'SELECT public.cd_v31_complete_session(%L::uuid,
     ''{"outputA":{"areas":[1]},"outputB":{},"professions":{"matches":[{"id":"SP001"}]},
        "versions":{"reportSchemaVersion":"x","patternDefinitionVersion":"v3.1-draft-1"}}''::jsonb,
     ''v3.1-draft-1'', now())',
  (SELECT sess FROM t_s2)),
  'CD_UNAPPROVED_PROFESSION_RANKING',
  'C8.5 a profession match is refused while no profession is approved for ranking');

SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions WHERE id = (SELECT sess FROM t_s2)) = 'in_progress',
  'C8.6 every refused payload left the second session resumable');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s2)) = 0,
  'C8.7 no partial snapshot was written for any refused payload');

DO $$ BEGIN RAISE NOTICE 'GROUP C5 — snapshot stability under later change'; END $$;

-- =========================================================================
-- Group C5 — THE STABILITY PROOF
-- =========================================================================
--
-- Capture the stored bytes, then change everything a naive implementation
-- might read at render time, then compare. Not a simulation: these are the
-- real tables.

CREATE TEMP TABLE t_before AS
SELECT md5(patterns::text || candidate_story::text || career_areas::text
           || dna_scores::text || definition_version || content_version
           || scoring_version || COALESCE(pattern_definition_version,'')) AS digest
FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s);

-- 1. A later SCORING configuration.
UPDATE public.cd_option_loadings SET value = 0.111 WHERE scoring_version = 'v3.1-draft-1';
SELECT pg_temp.ok(
  (SELECT md5(patterns::text || candidate_story::text || career_areas::text
              || dna_scores::text || definition_version || content_version
              || scoring_version || COALESCE(pattern_definition_version,''))
     FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s))
  = (SELECT digest FROM t_before),
  'C5.1 rewriting every option loading leaves the stored snapshot byte-identical');

-- 2. A later ITEM REGISTRY.
UPDATE public.cd_definition_items SET is_active = false, retired_at = now()
 WHERE definition_version_id = (SELECT defver FROM t_dv);
SELECT pg_temp.ok(
  (SELECT md5(patterns::text || candidate_story::text || career_areas::text
              || dna_scores::text || definition_version || content_version
              || scoring_version || COALESCE(pattern_definition_version,''))
     FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s))
  = (SELECT digest FROM t_before),
  'C5.2 retiring every item leaves the stored snapshot byte-identical');

-- 3. A later DEFINITION VERSION, including its content and scoring strings.
UPDATE public.cd_definition_versions
   SET content_version = 'v9.9-later', scoring_version = 'v9.9-later',
       lifecycle_status = 'retired'
 WHERE id = (SELECT defver FROM t_dv);
SELECT pg_temp.ok(
  (SELECT md5(patterns::text || candidate_story::text || career_areas::text
              || dna_scores::text || definition_version || content_version
              || scoring_version || COALESCE(pattern_definition_version,''))
     FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s))
  = (SELECT digest FROM t_before),
  'C5.3 retiring the definition and bumping its versions leaves the snapshot byte-identical');

-- 4. Deleting the option matrix entirely.
DELETE FROM public.cd_option_loadings WHERE scoring_version = 'v3.1-draft-1';
SELECT pg_temp.ok(
  (SELECT md5(patterns::text || candidate_story::text || career_areas::text
              || dna_scores::text || definition_version || content_version
              || scoring_version || COALESCE(pattern_definition_version,''))
     FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s))
  = (SELECT digest FROM t_before),
  'C5.4 deleting the entire option matrix leaves the snapshot byte-identical');

-- 5. The report is still fully readable with the definition gone.
SELECT pg_temp.ok(
  (SELECT output_b -> 'presentedPattern' FROM public.cd_v31_stored_reports
    WHERE session_id = (SELECT sess FROM t_s)) = '"CP01"'::jsonb,
  'C5.5 the stored report still renders with its definition retired and its matrix deleted');

SELECT pg_temp.ok(
  (SELECT output_b -> 'leading' ->> 'name' FROM public.cd_v31_stored_reports
    WHERE session_id = (SELECT sess FROM t_s)) = 'Operativ trygghetsskapare',
  'C5.6 candidate-facing text survives because it was stored, not referenced');

-- 6. The reading view must not depend on any live definition table.
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_depend d
     JOIN pg_rewrite r ON r.oid = d.objid
     JOIN pg_class v ON v.oid = r.ev_class
     JOIN pg_class t ON t.oid = d.refobjid
    WHERE v.relname = 'cd_v31_stored_reports'
      AND t.relname IN ('cd_definition_versions','cd_definition_items','cd_option_loadings')) = 0,
  'C5.7 the stored-report view depends on no definition, item or matrix table');

DO $$ BEGIN RAISE NOTICE 'GROUP C6 — immutability'; END $$;

-- =========================================================================
-- Group C6 — the database refuses any rewrite
-- =========================================================================

SELECT pg_temp.must_fail(format($f$
  UPDATE public.cd_report_snapshots SET patterns = '{"leadingPattern":"CP08"}'::jsonb
   WHERE session_id = %L::uuid $f$, (SELECT sess FROM t_s)),
  'CD_SNAPSHOT_IMMUTABLE', 'C6.1 stored Output A cannot be rewritten');

SELECT pg_temp.must_fail(format($f$
  UPDATE public.cd_report_snapshots SET candidate_story = '{}'::jsonb
   WHERE session_id = %L::uuid $f$, (SELECT sess FROM t_s)),
  'CD_SNAPSHOT_IMMUTABLE', 'C6.2 stored Output B cannot be rewritten');

SELECT pg_temp.must_fail(format($f$
  UPDATE public.cd_report_snapshots SET pattern_definition_version = 'v9'
   WHERE session_id = %L::uuid $f$, (SELECT sess FROM t_s)),
  'CD_SNAPSHOT_IMMUTABLE', 'C6.3 the stored pattern version cannot be rewritten');

DO $$ BEGIN RAISE NOTICE 'GROUP C7 — ownership and isolation'; END $$;

-- =========================================================================
-- Group C7 — a session may only be completed by its owner
-- =========================================================================

-- A completed session belonging to someone else is unreadable.
-- The fixture tables are owned by the test role; the switched-to role needs
-- read access to them in order to name the session it is denied.
GRANT SELECT ON t_s, t_s2 TO authenticated;

-- The harness resolves auth.uid() from request.jwt.claim.sub (singular).
-- Setting request.jwt.claims instead leaves auth.uid() NULL, which the
-- completion function treats as a trusted service_role caller — so the
-- ownership assertion below would pass without ever exercising the guard.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c2c2c2c2-0000-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots) = 0,
  'C7.1 another user cannot read the completed report');

SELECT pg_temp.must_fail(format(
  'SELECT public.cd_v31_complete_session(%L::uuid, ''{}''::jsonb, ''v3.1-draft-1'', now())',
  (SELECT sess FROM t_s)),
  'CD_NOT_SESSION_OWNER',
  'C7.2 another user cannot complete a session they do not own');

RESET ROLE;
RESET request.jwt.claim.sub;

SELECT pg_temp.must_fail(
  'SELECT public.cd_v31_complete_session(''00000000-0000-0000-0000-000000000000''::uuid,
     ''{}''::jsonb, ''v3.1-draft-1'', now())',
  'CD_SESSION_NOT_FOUND', 'C7.3 an unknown session is refused');

DO $$ BEGIN RAISE NOTICE 'career_discovery_v31_completion_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
