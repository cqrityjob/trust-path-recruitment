-- Security Career Discovery v3.1 — the personal layer, at the database level.
--
-- Proves the MVP is actually administrable end to end:
--
--     2 Context  →  22 Career DNA  →  4 Discovery Path   =  28
--
-- and, more importantly, proves where the scoring boundary sits: the personal
-- layer is contextual evidence, and only the CQ items are scored.
--
-- ── ON THE CAREER DNA COUNT ─────────────────────────────────────────────
--
-- This suite was originally written around a 20-item Career DNA block, and
-- said so in about a dozen places. 20260816150000_cd_v31_content_v2_compliance
-- _dimension.sql then added CQ21/CQ22 additively, taking the scored set to 22.
--
-- The product count is now pinned ONCE, deliberately, in group L1. Everything
-- downstream derives its expectation from the registry via t_shape, because
-- those groups are about persistence, routing and the scoring boundary — not
-- about how many questions the instrument has. Restating the number in each of
-- them is what turned one approved content change into a dozen red assertions.
--
-- What protects stored reports is NOT this count: cd_report_snapshots freezes
-- its own content/scoring/pattern versions per row, so a snapshot is
-- reproducible against the version it was taken under no matter how the live
-- definition grows afterwards. That property is asserted in the completion
-- suite (group C5, snapshot stability under later change), which is where it
-- belongs.
--
-- Runs against PRODUCTION v3.1 ('active'), not a fixture, because the point is
-- that a real candidate's session works. Everything rolls back.

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

DO $$ BEGIN RAISE NOTICE 'GROUP L1 — the registry holds all 28 questions'; END $$;

-- =========================================================================
-- Group L1 — registry shape
--
-- THE pin. These four assertions are the only place the v3.1 item counts are
-- stated as literals. Changing the instrument's size is a product decision and
-- must land here, visibly, as a deliberate edit — never as a silent pass
-- because every count in the file happened to be derived.
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.1.0') = 44,
  'L1.1 v3.1 registers 44 items (2 context + 22 core + 20 adaptive)');

-- The scored set is the Career DNA contract. It moved from 20 to 22 exactly
-- once, additively, in 20260816150000 (CQ21/CQ22). It must not drift again
-- without this line changing with it.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.1.0' AND di.is_scored) = 22,
  'L1.2 the scored set is exactly the twenty-two Career DNA items');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.1.0'
      AND di.is_scored AND di.item_kind IN ('scale','single_choice')) = 22,
  'L1.3 every scored item is a Career DNA item');

-- The registry shape the rest of this suite administers, read from the live
-- definition rather than restated. `run_total` is what one candidate actually
-- answers: every core and context item, plus the four questions on the single
-- Discovery Path they were routed to.
CREATE TEMP TABLE t_shape AS
SELECT
  count(*) FILTER (WHERE di.item_kind IN ('scale','single_choice'))      AS core,
  count(*) FILTER (WHERE di.item_kind = 'context')                        AS context,
  4::bigint                                                              AS path_items,
  count(*) FILTER (WHERE di.item_kind IN ('scale','single_choice'))
    + count(*) FILTER (WHERE di.item_kind = 'context') + 4                AS run_total,
  count(*) FILTER (WHERE di.item_kind IN ('scale','single_choice'))
    + count(*) FILTER (WHERE di.item_kind = 'context')                    AS non_adaptive,
  count(*) FILTER (WHERE di.item_kind = 'context') + 4                    AS run_unscored
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0';

-- t_shape must agree with the pin above, or the derivation is measuring
-- something other than the instrument under test.
SELECT pg_temp.ok(
  (SELECT core = 22 AND context = 2 AND run_total = 28 FROM t_shape),
  'L1.1b the derived run shape matches the pinned contract (2 + 22 + 4 = 28)');

SELECT pg_temp.ok(
  (SELECT bool_and(NOT di.is_scored) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.1.0'
      AND di.item_kind IN ('context','adaptive')),
  'L1.4 no context or Discovery Path item is scored');

SELECT pg_temp.ok(
  (SELECT count(*) = 5 AND bool_and(n = 4) FROM (
     SELECT di.adaptive_path, count(*) AS n
       FROM public.cd_definition_items di
       JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
      WHERE dv.definition_version = '2026-scd-v3.1.0' AND di.item_kind = 'adaptive'
      GROUP BY di.adaptive_path) p),
  'L1.5 five Discovery Paths, four questions each');

-- The two owner-approved context questions, by their original ids.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.1.0'
      AND di.item_id IN ('CTX_CURRENT_STATUS','CTX_DISCOVERY_GOAL')) = 2,
  'L1.6 both original context questions are registered, under their own ids');

-- v3.0 is untouched — the same 42 rows and the same 20 scored. This is the
-- historical half of the CQ21/CQ22 change: growing v3.1 must not reach
-- backwards into the superseded instrument that older reports were taken
-- against.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.0.0') = 42,
  'L1.7 v3.0 still holds its own 42 items');

-- The comment above claimed this; now it is checked. v3.0's scored set stays
-- at 20 while v3.1's is 22 — the two instruments are allowed to differ, and
-- the older one is not allowed to move.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items di
     JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.0.0' AND di.is_scored) = 20,
  'L1.7b v3.0 still scores its own twenty items, unaffected by CQ21/CQ22');

-- The same item id means the same thing in both versions. If these ever
-- diverge, historical evidence stops being interpretable.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items a
     JOIN public.cd_definition_versions dva ON dva.id = a.definition_version_id
     JOIN public.cd_definition_items b ON b.item_id = a.item_id
     JOIN public.cd_definition_versions dvb ON dvb.id = b.definition_version_id
    WHERE dva.definition_version = '2026-scd-v3.0.0'
      AND dvb.definition_version = '2026-scd-v3.1.0'
      AND a.item_kind IN ('context','adaptive')
      AND (a.item_kind <> b.item_kind
        OR a.evidence_class <> b.evidence_class
        OR a.is_scored <> b.is_scored
        OR a.adaptive_path IS DISTINCT FROM b.adaptive_path)) = 0,
  'L1.8 shared item ids carry identical metadata in v3.0 and v3.1');

DO $$ BEGIN RAISE NOTICE 'GROUP L2 — routing is derived, never accepted'; END $$;

-- =========================================================================
-- Group L2 — the Discovery Path
-- =========================================================================

INSERT INTO auth.users (id, email)
VALUES ('11111111-aaaa-0000-0000-000000000001', 'personal-layer@example.test');

-- The client claims path 'A' while answering C1 as a security leader. The
-- database must ignore the claim and store 'E'.
CREATE TEMP TABLE t_sess AS
WITH ins AS (
  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, status, context_status, adaptive_path)
  SELECT id, '11111111-aaaa-0000-0000-000000000001', 'sv', 'in_progress',
         'security_leader', 'A'
    FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0'
  RETURNING id
) SELECT id AS sess FROM ins;

SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions WHERE id = (SELECT sess FROM t_sess)) = 'E',
  'L2.1 adaptive_path is DERIVED from C1, overwriting the client''s claim');

SELECT pg_temp.ok(
  public.cd_derive_adaptive_path('exploring_security') = 'A'
    AND public.cd_derive_adaptive_path('working_in_security') = 'B'
    AND public.cd_derive_adaptive_path('developing_current_role') = 'C'
    AND public.cd_derive_adaptive_path('changing_career_area') = 'D'
    AND public.cd_derive_adaptive_path('security_leader') = 'E',
  'L2.2 all five C1 answers route, and route to distinct paths');

SELECT pg_temp.must_fail(
  format('UPDATE public.cd_sessions SET context_status = ''exploring_security'' WHERE id = %L',
         (SELECT sess FROM t_sess)),
  'CD_CONTEXT_STATUS_IMMUTABLE',
  'L2.3 routing cannot be changed once assigned');

DO $$ BEGIN RAISE NOTICE 'GROUP L3 — every answer in the run persists'; END $$;

-- =========================================================================
-- Group L3 — evidence for the whole run
-- =========================================================================

-- Stage 1 · the two context answers.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
VALUES
  ((SELECT sess FROM t_sess), 'CTX_CURRENT_STATUS', 'security_leader'),
  ((SELECT sess FROM t_sess), 'CTX_DISCOVERY_GOAL', 'understand_strengths');

-- Stage 2 · the Career DNA answers, every scored item in the registry.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value, option_id)
SELECT (SELECT sess FROM t_sess), di.item_id,
       CASE WHEN di.item_kind = 'scale' THEN '7' ELSE di.item_id || '_A' END,
       CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0'
   AND di.item_kind IN ('scale','single_choice');

-- Stage 3 · the four Discovery Path answers, with their Career Context Signals.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value, answer_tags)
SELECT (SELECT sess FROM t_sess), di.item_id, 'a', ARRAY['leadership_signal']
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0'
   AND di.item_kind = 'adaptive' AND di.adaptive_path = 'E';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence WHERE session_id = (SELECT sess FROM t_sess))
  = (SELECT run_total FROM t_shape),
  'L3.1 every answer in the run persists — none dropped');

-- Metadata is DERIVED from the registry, not taken from the caller. The split
-- below is the scoring boundary, as stored: the Career DNA block is scored,
-- and the personal layer — 2 context + 4 Discovery Path — never is. That
-- boundary is the point of these two, not the size of either side.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_sess) AND is_scored)
  = (SELECT core FROM t_shape),
  'L3.2 exactly the Career DNA answers are stored as scored');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_sess) AND NOT is_scored)
  = (SELECT run_unscored FROM t_shape),
  'L3.3 the six personal-layer answers are stored as unscored');
SELECT pg_temp.ok(
  (SELECT bool_and(evidence_class = 'contextual_self_report') FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_sess) AND item_kind IN ('context','adaptive')),
  'L3.4 every personal-layer answer is contextual evidence');

-- The Career Context Signals the Excel engine reads are on the row.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_sess)
      AND array_length(answer_tags, 1) > 0) = 4,
  'L3.5 all four Discovery Path answers carry Career Context Signals');

DO $$ BEGIN RAISE NOTICE 'GROUP L3b — the payload the APPLICATION actually sends'; END $$;

-- =========================================================================
-- Group L3b — answer_tags: the column default is not a safety net
-- =========================================================================
--
-- The production failure this group exists to prevent: persistPublicV31Run
-- sent `answer_tags: null` on every row. cd_evidence.answer_tags is
-- `text[] NOT NULL DEFAULT ARRAY[]::text[]`, and an EXPLICIT null is not an
-- omitted column — the default only applies when the column is absent. Every
-- row was rejected with SQLSTATE 23502, the whole multi-row statement
-- aborted, cd_evidence stayed empty, and the candidate lost a completed run.
--
-- Group L3 above inserts WITHOUT naming answer_tags, so it exercises the
-- default and could never have caught this. These assertions insert the column
-- explicitly, exactly as the application does.

INSERT INTO auth.users (id, email)
VALUES ('11111111-aaaa-0000-0000-000000000003', 'payload@example.test');

CREATE TEMP TABLE t_payload AS
WITH ins AS (
  INSERT INTO public.cd_sessions
    (definition_version_id, user_id, locale, status, context_status)
  SELECT id, '11111111-aaaa-0000-0000-000000000003', 'sv', 'in_progress', 'exploring_security'
    FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0'
  RETURNING id
) SELECT id AS sess FROM ins;

-- The regression. An explicit null must be refused, and refused as 23502 on
-- answer_tags specifically — not silently coerced to the default.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.cd_evidence
            (session_id, item_id, item_version, answer_value, option_id, answer_tags)
          VALUES (%L, ''CQ01'', 1, ''7'', NULL, NULL)', (SELECT sess FROM t_payload)),
  'answer_tags',
  'L3b.1 an explicit null answer_tags is rejected (the production defect)');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_payload)) = 0,
  'L3b.2 the rejected statement left no partial rows');

-- The corrected payload: every column the application sends, named explicitly,
-- with [] on the non-adaptive rows.
INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, answer_value, option_id, answer_tags)
SELECT (SELECT sess FROM t_payload), di.item_id, 1,
       CASE WHEN di.item_kind = 'scale' THEN '7' ELSE di.item_id || '_A' END,
       CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END,
       ARRAY[]::text[]
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0'
   AND di.item_kind IN ('scale','single_choice');

INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, answer_value, option_id, answer_tags)
VALUES
  ((SELECT sess FROM t_payload), 'CTX_CURRENT_STATUS',  1, 'exploring_security', NULL, ARRAY[]::text[]),
  ((SELECT sess FROM t_payload), 'CTX_DISCOVERY_GOAL',  1, 'find_direction',     NULL, ARRAY[]::text[]);

INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, answer_value, option_id, answer_tags)
SELECT (SELECT sess FROM t_payload), di.item_id, 1, 'a', NULL, ARRAY['operational_interest']
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0'
   AND di.item_kind = 'adaptive' AND di.adaptive_path = 'A';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_payload))
  = (SELECT run_total FROM t_shape),
  'L3b.3 the corrected payload persists every row in the run');

-- An empty array is stored as empty, never as null — so a later read cannot
-- reintroduce the same confusion.
SELECT pg_temp.ok(
  (SELECT bool_and(answer_tags IS NOT NULL) FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_payload)),
  'L3b.4 every stored row holds a non-null answer_tags');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence
    WHERE session_id = (SELECT sess FROM t_payload)
      AND cardinality(answer_tags) = 0)
  = (SELECT non_adaptive FROM t_shape),
  'L3b.5 every non-adaptive row stores an empty tag array, never null');

-- A non-empty array on a non-adaptive item is still refused. The fix must not
-- have been "send tags everywhere".
SELECT pg_temp.must_fail(
  format('INSERT INTO public.cd_evidence
            (session_id, item_id, item_version, answer_value, option_id, answer_tags)
          VALUES (%L, ''CTX_CURRENT_STATUS'', 1, ''exploring_security'', NULL, ARRAY[''x''])',
         (SELECT sess FROM t_payload)),
  'CD_REPORT_TAGS_ONLY_ON_ADAPTIVE',
  'L3b.6 a context row still may not carry Career Context Signals');

DO $$ BEGIN RAISE NOTICE 'GROUP L4 — the guards still refuse what they should'; END $$;

-- =========================================================================
-- Group L4 — negative cases
-- =========================================================================

-- An adaptive item from a path this session is not on.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
          VALUES (%L, ''ADAPT_EXPLORE_01'', ''a'')', (SELECT sess FROM t_sess)),
  'CD_ADAPTIVE_PATH_MISMATCH',
  'L4.1 an answer from another Discovery Path is refused');

-- Report tags remain adaptive-only: a Career DNA answer cannot smuggle in a
-- signal the matching engine would then read.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.cd_evidence (session_id, item_id, answer_value, answer_tags)
          VALUES (%L, ''CQ01'', ''7'', ARRAY[''smuggled''])', (SELECT sess FROM t_sess)),
  'CD_REPORT_TAGS_ONLY_ON_ADAPTIVE',
  'L4.2 a Career DNA answer may not carry Career Context Signals');

-- A caller cannot assert that a context answer is scored.
SELECT pg_temp.must_fail(
  format('INSERT INTO public.cd_evidence (session_id, item_id, answer_value, is_scored)
          VALUES (%L, ''ADAPT_LEADER_01'', ''b'', true)', (SELECT sess FROM t_sess)),
  'CD_IS_SCORED_MISMATCH',
  'L4.3 a caller cannot claim a Discovery Path answer is scored');

-- An unrouted session cannot answer adaptive items at all.
INSERT INTO auth.users (id, email)
VALUES ('11111111-aaaa-0000-0000-000000000002', 'unrouted@example.test');

CREATE TEMP TABLE t_unrouted AS
WITH ins AS (
  INSERT INTO public.cd_sessions (definition_version_id, user_id, locale, status)
  SELECT id, '11111111-aaaa-0000-0000-000000000002', 'sv', 'in_progress'
    FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0'
  RETURNING id
) SELECT id AS sess FROM ins;

SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions WHERE id = (SELECT sess FROM t_unrouted)) IS NULL,
  'L4.4 a session with no C1 answer has no Discovery Path');

SELECT pg_temp.must_fail(
  format('INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
          VALUES (%L, ''ADAPT_LEADER_01'', ''a'')', (SELECT sess FROM t_unrouted)),
  'CD_ADAPTIVE_BEFORE_PATH_ASSIGNED',
  'L4.5 Discovery Path questions cannot be answered before routing');

DO $$ BEGIN RAISE NOTICE 'GROUP L5 — the completion contract is unchanged'; END $$;

-- =========================================================================
-- Group L5 — the report path did not move
-- =========================================================================

-- The full session validates: the six personal-layer answers neither satisfy
-- nor obstruct the scored-evidence requirement.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_validate_session_evidence(
     (SELECT sess FROM t_sess))) = 0,
  'L5.1 a full run raises NO validation failure at all');

-- And the validator counts the Career DNA block only, not the whole run.
-- Proven by answering ONLY that block on a second session: the database is
-- satisfied, because the personal layer is a product requirement enforced
-- before the write, not a scoring requirement. Stated explicitly so nobody
-- later reads this as the database guaranteeing the full run.
INSERT INTO public.cd_sessions
  (definition_version_id, user_id, locale, status, context_status)
SELECT id, '11111111-aaaa-0000-0000-000000000002', 'sv', 'in_progress', 'exploring_security'
  FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0';

CREATE TEMP TABLE t_core_only AS
SELECT id AS sess FROM public.cd_sessions
 WHERE user_id = '11111111-aaaa-0000-0000-000000000002'
   AND context_status = 'exploring_security';

INSERT INTO public.cd_evidence (session_id, item_id, answer_value, option_id)
SELECT (SELECT sess FROM t_core_only), di.item_id,
       CASE WHEN di.item_kind = 'scale' THEN '4' ELSE di.item_id || '_A' END,
       CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0'
   AND di.item_kind IN ('scale','single_choice');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_validate_session_evidence(
     (SELECT sess FROM t_core_only))) = 0,
  'L5.2 the scored requirement is the Career DNA block alone, not the whole run');

-- Removing one Career DNA answer DOES break it. Proves L5.1 and L5.2 pass for
-- the right reason rather than because the validator stopped counting.
DELETE FROM public.cd_evidence
 WHERE session_id = (SELECT sess FROM t_core_only) AND item_id = 'CQ01';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_validate_session_evidence(
     (SELECT sess FROM t_core_only))
    WHERE code = 'CD_CORE_INCOMPLETE') = 1,
  'L5.3 one missing Career DNA answer still fails the validator');

-- CQ22 specifically. CQ21/CQ22 were added after this suite was written, so
-- prove the validator genuinely requires the NEW items too rather than only
-- the original twenty — that is the difference between an instrument that grew
-- and one that merely registered two rows nothing reads.
INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
VALUES ((SELECT sess FROM t_core_only), 'CQ01', '4');

DELETE FROM public.cd_evidence
 WHERE session_id = (SELECT sess FROM t_core_only) AND item_id = 'CQ22';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_validate_session_evidence(
     (SELECT sess FROM t_core_only))
    WHERE code = 'CD_CORE_INCOMPLETE') = 1,
  'L5.3b a missing CQ22 fails the validator exactly like an original item');

INSERT INTO public.cd_evidence (session_id, item_id, answer_value)
VALUES ((SELECT sess FROM t_core_only), 'CQ22', '4');

-- Deleting every personal-layer answer does NOT break the report path. This is
-- the clean statement that Career DNA cannot depend on context.
DELETE FROM public.cd_evidence
 WHERE session_id = (SELECT sess FROM t_sess) AND NOT is_scored;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_v31_validate_session_evidence(
     (SELECT sess FROM t_sess))) = 0,
  'L5.4 removing all six personal answers leaves the report path intact');

DO $$ BEGIN RAISE NOTICE 'GROUP L6 — every path completes and produces a report'; END $$;

-- =========================================================================
-- Group L6 — all five Discovery Paths, end to end
-- =========================================================================
--
-- Full run -> validation -> cd_v31_complete_session -> one immutable
-- snapshot, for every path. This is the journey the candidate actually takes,
-- and it is what the answer_tags defect broke: the run reached this point and
-- died on the evidence insert.

DO $$
DECLARE
  _status text; _path text; _uid uuid; _sess uuid;
  _created boolean; _snap uuid; _n int;
  _statuses text[] := ARRAY['exploring_security','working_in_security',
                            'developing_current_role','changing_career_area','security_leader'];
BEGIN
  FOREACH _status IN ARRAY _statuses LOOP
    _uid := gen_random_uuid();
    INSERT INTO auth.users (id, email) VALUES (_uid, _status || '@e2e.test');

    INSERT INTO public.cd_sessions
      (definition_version_id, user_id, locale, status, context_status)
    SELECT id, _uid, 'sv', 'in_progress', _status
      FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0'
    RETURNING id INTO _sess;

    SELECT adaptive_path INTO _path FROM public.cd_sessions WHERE id = _sess;

    -- The Career DNA answers, with answer_tags named explicitly, as the
    -- application sends them.
    INSERT INTO public.cd_evidence
      (session_id, item_id, item_version, answer_value, option_id, answer_tags)
    SELECT _sess, di.item_id, 1,
           CASE WHEN di.item_kind = 'scale' THEN '7' ELSE di.item_id || '_A' END,
           CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END,
           ARRAY[]::text[]
      FROM public.cd_definition_items di
      JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
     WHERE dv.definition_version = '2026-scd-v3.1.0'
       AND di.item_kind IN ('scale','single_choice');

    -- The 2 context answers.
    INSERT INTO public.cd_evidence
      (session_id, item_id, item_version, answer_value, option_id, answer_tags)
    VALUES (_sess, 'CTX_CURRENT_STATUS', 1, _status, NULL, ARRAY[]::text[]),
           (_sess, 'CTX_DISCOVERY_GOAL', 1, 'find_direction', NULL, ARRAY[]::text[]);

    -- The 4 Discovery Path answers, carrying their Career Context Signals.
    INSERT INTO public.cd_evidence
      (session_id, item_id, item_version, answer_value, option_id, answer_tags)
    SELECT _sess, di.item_id, 1, 'a', NULL, ARRAY['signal_' || di.item_id]
      FROM public.cd_definition_items di
      JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
     WHERE dv.definition_version = '2026-scd-v3.1.0'
       AND di.item_kind = 'adaptive' AND di.adaptive_path = _path;

    SELECT count(*) INTO _n FROM public.cd_evidence WHERE session_id = _sess;
    PERFORM pg_temp.ok(_n = (SELECT run_total FROM t_shape),
      format('L6.1 %s: every answer in the run persists', _status));

    SELECT count(*) INTO _n FROM public.cd_evidence WHERE session_id = _sess AND is_scored;
    PERFORM pg_temp.ok(_n = (SELECT core FROM t_shape),
      format('L6.2 %s: Career DNA rests on exactly the scored answers', _status));

    SELECT count(*) INTO _n FROM public.cd_evidence
     WHERE session_id = _sess AND NOT is_scored;
    PERFORM pg_temp.ok(_n = (SELECT run_unscored FROM t_shape),
      format('L6.3 %s: the six context and Discovery Path answers stay unscored', _status));

    PERFORM pg_temp.ok(
      NOT EXISTS (SELECT 1 FROM public.cd_v31_validate_session_evidence(_sess)),
      format('L6.4 %s: the run passes validation with no failures', _status));

    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SELECT was_created, snapshot_id INTO _created, _snap
      FROM public.cd_v31_complete_session(
        _sess,
        jsonb_build_object(
          'versions', jsonb_build_object(
            'reportSchemaVersion','cd-report-v3.1.0','patternDefinitionVersion','v3.1-draft-1'),
          'locale','sv','completedAt','2026-08-01T12:00:00.000Z',
          'outputA', jsonb_build_object('leadingPattern','CP01',
            'areas', jsonb_build_array(jsonb_build_object('id','SCA01','rank',1,'score',88)),
            'dimensions', jsonb_build_array(
              jsonb_build_object('id','CID01','name','Operativ orientering'))),
          'outputB', jsonb_build_object('locale','sv','presentedPattern','CP01',
            'leading', jsonb_build_object('name','Operativ trygghetsskapare')),
          'professions', jsonb_build_object('available', false,
                                            'matches', jsonb_build_array())),
        'v3.1-draft-1', '2026-08-01T12:00:00.000Z'::timestamptz);

    PERFORM pg_temp.ok(_created AND _snap IS NOT NULL,
      format('L6.5 %s: completion creates exactly one report snapshot', _status));

    PERFORM pg_temp.ok(
      (SELECT status FROM public.cd_sessions WHERE id = _sess) = 'completed',
      format('L6.6 %s: the session completes atomically with its report', _status));

    -- The report must open for its owner. Read under that user's own RLS, not
    -- as superuser, because "the report opens" is an RLS question.
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SELECT count(*) INTO _n FROM public.cd_report_snapshots WHERE id = _snap;
    RESET ROLE;
    PERFORM pg_temp.ok(_n = 1, format('L6.7 %s: the owner can open the report', _status));

    -- Re-reading is what "opens after refresh, and after logout/login" is at
    -- the database layer: a fresh authenticated read of the same row.
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SELECT count(*) INTO _n FROM public.cd_report_snapshots WHERE id = _snap;
    RESET ROLE;
    PERFORM pg_temp.ok(_n = 1,
      format('L6.8 %s: the report opens again on a later session', _status));

    -- And only for its owner.
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    SELECT count(*) INTO _n FROM public.cd_report_snapshots WHERE id = _snap;
    RESET ROLE;
    PERFORM pg_temp.ok(_n = 0, format('L6.9 %s: nobody else can open it', _status));

    -- Idempotent: a double-tap on Save returns the same report.
    PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
    SELECT was_created INTO _created FROM public.cd_v31_complete_session(
      _sess,
      jsonb_build_object(
        'versions', jsonb_build_object(
          'reportSchemaVersion','cd-report-v3.1.0','patternDefinitionVersion','v3.1-draft-1'),
        'locale','sv','completedAt','2026-08-01T12:00:00.000Z',
        'outputA', jsonb_build_object('leadingPattern','CP01',
          'areas', jsonb_build_array(jsonb_build_object('id','SCA01','rank',1,'score',88)),
          'dimensions', jsonb_build_array(
            jsonb_build_object('id','CID01','name','Operativ orientering'))),
        'outputB', jsonb_build_object('locale','sv','presentedPattern','CP01',
          'leading', jsonb_build_object('name','Operativ trygghetsskapare')),
        'professions', jsonb_build_object('available', false, 'matches', jsonb_build_array())),
      'v3.1-draft-1', '2026-08-01T12:00:00.000Z'::timestamptz);
    PERFORM pg_temp.ok(NOT _created,
      format('L6.10 %s: a retry returns the same report, not a second one', _status));
  END LOOP;
END $$;

DO $$ BEGIN RAISE NOTICE 'career_discovery_v31_personal_layer_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
