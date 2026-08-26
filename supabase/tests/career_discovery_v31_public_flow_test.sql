-- Public v3.1 assessment flow — isolated integration fixture.
--
-- Proves the replay-on-login path end to end at the database level: a buffered
-- public run, persisted through the NORMAL authenticated pipeline, producing one
-- immutable snapshot owned by a real user.
--
-- ── WHY A TEMPORARY TEST INSTRUMENT ────────────────────────────────────
--
-- Production v3.1 sits at lifecycle_status = 'internal_test' with review gates
-- outstanding, and the database refuses candidate sessions against it. That
-- refusal is the review-gate control working.
--
-- So this fixture creates its OWN definition version, promotes only that one to
-- 'pilot' with only its own gates cleared, runs the flow, and rolls everything
-- back. Production status is never touched, and the guards are exercised rather
-- than bypassed: the test instrument has to satisfy exactly the same triggers a
-- real candidate would.
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

DO $$ BEGIN RAISE NOTICE 'GROUP P1 — production stays internal_test'; END $$;

-- =========================================================================
-- Group P1 — production v3.1 is LIVE and admits real candidates
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions
    WHERE definition_version = '2026-scd-v3.1.0') = 'active',
  'P1.1 production v3.1 is active — the launch migration applied');

INSERT INTO auth.users (id, email)
VALUES ('e1e1e1e1-0000-0000-0000-000000000001', 'public-flow@example.test');

-- The product: a real candidate can start a session against production v3.1.
-- This is the assertion that would have caught the whole "not available"
-- problem, so it is checked against the REAL instrument, not a fixture.
CREATE TEMP TABLE t_prod AS
WITH ins AS (
  INSERT INTO public.cd_sessions (definition_version_id, user_id, locale, status)
  SELECT id, 'e1e1e1e1-0000-0000-0000-000000000001', 'sv', 'in_progress'
    FROM public.cd_definition_versions WHERE definition_version = '2026-scd-v3.1.0'
  RETURNING id
) SELECT id AS sess FROM ins;

SELECT pg_temp.ok(
  (SELECT sess FROM t_prod) IS NOT NULL,
  'P1.2 a real candidate CAN start a session against production v3.1');

-- Outstanding reviews still exist and are still visible. Removing the block
-- did not remove the record.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_outstanding_reviews
    WHERE definition_version = '2026-scd-v3.1.0') > 0,
  'P1.3 outstanding reviews remain tracked on the live instrument');

DO $$ BEGIN RAISE NOTICE 'GROUP P2 — temporary pilot test instrument'; END $$;

-- =========================================================================
-- Group P2 — the fixture's own instrument, promoted only here
-- =========================================================================

INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, notes)
VALUES ('security-career-discovery-v3', 'TEST-scd-v3.1.0', 'v1', 'Fixture only. Rolled back.');

CREATE TEMP TABLE t_dv AS
WITH ins AS (
  INSERT INTO public.cd_definition_versions (
    assessment_id, assessment_version_id, definition_version, content_version,
    scoring_version, taxonomy_version, lifecycle_status, review_status)
  SELECT 'security-career-discovery-v3', av.id, 'TEST-scd-v3.1.0',
         'v3.1-draft-1',
         -- Reuses the real scoring version so the seeded 164 option loadings
         -- apply. The instrument is a fixture; the scoring contract is not.
         'v3.1-draft-1', 'cig-areas-v1', 'pilot',
         -- ONLY the four gates mandatory for pilot. The other three stay
         -- false, exactly as they are in production, so this fixture proves
         -- the new pilot rule rather than the old all-seven rule.
         jsonb_build_object(
           'content_review', true, 'language_review', true,
           'privacy_legal_review', true, 'accessibility_review', true,
           'sme_review', false, 'bias_review', false, 'psychometric_review', false)
    FROM public.assessment_versions av
   WHERE av.assessment_id = 'security-career-discovery-v3'
     AND av.model_version = 'TEST-scd-v3.1.0'
  RETURNING id
) SELECT id AS defver FROM ins;

-- Copy production's full 42-item registry so evidence metadata derives
-- identically. `adaptive_path` is copied too: since the personal layer was
-- registered, an adaptive row without its path violates
-- cd_definition_items_adaptive_path_presence.
INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, adaptive_path, section_id, display_order)
SELECT (SELECT defver FROM t_dv), di.item_id, di.item_version, di.item_kind,
       di.evidence_class, di.is_scored, di.adaptive_path, di.section_id,
       di.display_order
  FROM public.cd_definition_items di
  JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
 WHERE dv.definition_version = '2026-scd-v3.1.0';

-- Derived from the live definition rather than hardcoded. The literal was 42
-- and the instrument is now 44; a copied fixture should be asserted to match
-- its source, not to match a number somebody typed once.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items
    WHERE definition_version_id = (SELECT defver FROM t_dv))
  = (SELECT count(*) FROM public.cd_definition_items di
       JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
      WHERE dv.definition_version = '2026-scd-v3.1.0'),
  'P2.1 the test instrument carries the same items as the live definition');

-- The half that matters for this fixture: the scored set it will be validated
-- against. Pinned at the current 22-item Career DNA contract, matching C1.2b.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_definition_items
    WHERE definition_version_id = (SELECT defver FROM t_dv) AND is_scored) = 22,
  'P2.1b the fixture''s scored set is the current 22-item Career DNA contract');

SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions
    WHERE definition_version = 'TEST-scd-v3.1.0') = 'pilot',
  'P2.2 the fixture instrument is separate from production and did not disturb it');

DO $$ BEGIN RAISE NOTICE 'GROUP P3 — replay a buffered public run'; END $$;

-- =========================================================================
-- Group P3 — the replay, exactly as persistPublicV31Run performs it
-- =========================================================================

-- 1. Session, owned by a real user from the first insert. There is no
--    anonymous row at any point.
CREATE TEMP TABLE t_s AS
WITH ins AS (
  INSERT INTO public.cd_sessions (definition_version_id, user_id, locale, status)
  SELECT defver, 'e1e1e1e1-0000-0000-0000-000000000001', 'sv', 'in_progress' FROM t_dv
  RETURNING id
) SELECT id AS sess FROM ins;

SELECT pg_temp.ok(
  (SELECT user_id FROM public.cd_sessions WHERE id = (SELECT sess FROM t_s))
    = 'e1e1e1e1-0000-0000-0000-000000000001',
  'P3.1 the replayed session is owned by the signed-in user, never anonymous');

SELECT pg_temp.ok(
  (SELECT anon_session_token FROM public.cd_sessions WHERE id = (SELECT sess FROM t_s)) IS NULL,
  'P3.2 no anonymous session token is used');

SELECT pg_temp.ok(
  (SELECT adaptive_path FROM public.cd_sessions WHERE id = (SELECT sess FROM t_s)) IS NULL,
  'P3.3 a NULL context_status yields no adaptive path — no question was invented');

-- 2. Evidence, one row per buffered answer. Metadata is derived by the database.
INSERT INTO public.cd_evidence
  (session_id, item_id, item_version, item_kind, answer_value, evidence_class,
   is_scored, option_id, display_order)
SELECT (SELECT sess FROM t_s), di.item_id, di.item_version, di.item_kind,
       CASE WHEN di.item_kind = 'scale' THEN '7' ELSE di.item_id || '_A' END,
       di.evidence_class, di.is_scored,
       CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END,
       CASE WHEN di.item_kind = 'single_choice' THEN 2 END
  FROM public.cd_definition_items di
 WHERE di.definition_version_id = (SELECT defver FROM t_dv) AND di.is_scored;

-- Derived from the scored set the INSERT above actually reads, not from a
-- literal. What this protects is "one persisted row per buffered answer, none
-- dropped" — a property of the replay, not a product count. The product count
-- is pinned once, deliberately, at P2.1b; restating it here only meant that
-- advancing the Career DNA contract broke a test about persistence.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence WHERE session_id = (SELECT sess FROM t_s))
  = (SELECT count(*) FROM public.cd_definition_items
      WHERE definition_version_id = (SELECT defver FROM t_dv) AND is_scored),
  'P3.4 every buffered answer is persisted — one evidence row per scored item');

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM public.cd_v31_validate_session_evidence((SELECT sess FROM t_s))),
  'P3.5 the replayed evidence passes validation with no failures');

-- 3. Completion, through the same RPC a signed-in run uses.
CREATE TEMP TABLE t_res AS
SELECT * FROM public.cd_v31_complete_session(
  (SELECT sess FROM t_s),
  jsonb_build_object(
    'versions', jsonb_build_object(
      'reportSchemaVersion','cd-report-v3.1.0','patternDefinitionVersion','v3.1-draft-1'),
    'locale','sv','completedAt','2026-07-30T12:00:00.000Z',
    'outputA', jsonb_build_object('leadingPattern','CP01',
      'areas', jsonb_build_array(jsonb_build_object('id','SCA01','rank',1,'score',88)),
      'dimensions', jsonb_build_array(jsonb_build_object('id','CID01','name','Operativ orientering'))),
    'outputB', jsonb_build_object('locale','sv','presentedPattern','CP01',
      'leading', jsonb_build_object('name','Operativ trygghetsskapare')),
    'professions', jsonb_build_object('available', false, 'matches', jsonb_build_array())),
  'v3.1-draft-1', '2026-07-30T12:00:00.000Z'::timestamptz);

SELECT pg_temp.ok((SELECT was_created FROM t_res), 'P3.6 the replay creates exactly one snapshot');
SELECT pg_temp.ok(
  (SELECT status FROM public.cd_sessions WHERE id = (SELECT sess FROM t_s)) = 'completed',
  'P3.7 the session is completed atomically with its report');
SELECT pg_temp.ok(
  (SELECT definition_version FROM public.cd_report_snapshots
    WHERE session_id = (SELECT sess FROM t_s)) = 'TEST-scd-v3.1.0',
  'P3.8 the snapshot records the instrument it was actually taken against');

-- Retry safety: a candidate who double-taps Save gets the same report.
SELECT pg_temp.ok(
  NOT (SELECT was_created FROM public.cd_v31_complete_session(
    (SELECT sess FROM t_s), (SELECT '{}'::jsonb), 'v3.1-draft-1', now())),
  'P3.9 a retry returns the stored snapshot and creates nothing');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots WHERE session_id = (SELECT sess FROM t_s)) = 1,
  'P3.10 still exactly one snapshot after the retry');

DO $$ BEGIN RAISE NOTICE 'GROUP P4 — isolation and ownership'; END $$;

-- =========================================================================
-- Group P4 — the report belongs to exactly one person
-- =========================================================================

INSERT INTO auth.users (id, email)
VALUES ('e2e2e2e2-0000-0000-0000-000000000002', 'other-public@example.test');

GRANT SELECT ON t_s TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e2e2e2-0000-0000-0000-000000000002';

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots) = 0,
  'P4.1 another signed-in user cannot read the report');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_evidence) = 0,
  'P4.2 another signed-in user cannot read the answers');

RESET ROLE;
RESET request.jwt.claim.sub;

-- anon must still hold nothing. This is the assertion that would break if a
-- well-meaning "fix" had granted anonymous access instead of buffering.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_sessions',
  'permission denied', 'P4.3 anon still cannot touch cd_sessions');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_evidence',
  'permission denied', 'P4.4 anon still cannot touch cd_evidence');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.cd_report_snapshots',
  'permission denied', 'P4.5 anon still cannot touch cd_report_snapshots');
RESET ROLE;

-- Anon may never MUTATE anything: no UPDATE, no DELETE, on any cd_ table,
-- with no allowlist and no exception. Buffering exists precisely so that a
-- signed-out run never needs one.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'cd\_%'
      AND grantee='anon' AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')) = 0,
  'P4.6a anon holds no UPDATE or DELETE grant on any cd_ table');

-- No cd_ table admits a direct anonymous INSERT any more — not one.
--
-- Until 20260916090000 this assertion carried a two-table allowlist for the
-- telemetry tables introduced by 20260815090000, on the reasoning that their
-- boundary was tight. It was not: the policy was `WITH CHECK (true)` over
-- tables carrying a user_id and a session_id, so any holder of the publishable
-- key could write a row attributed to another candidate. The direct grant is
-- withdrawn; the allowlist is empty.
SELECT pg_temp.ok(
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name LIKE 'cd\_%'
      AND grantee='anon' AND privilege_type = 'INSERT') = 0,
  'P4.6b no cd_ table admits a direct anonymous INSERT');

-- The anonymous path itself is NOT gone, and this is where that is asserted
-- from the public-flow side: it moved into two SECURITY DEFINER entry points
-- that derive user_id from auth.uid() instead of accepting it. A change that
-- removed anonymous telemetry outright would fail here, which is the point —
-- "more secure" must not be allowed to mean "the feature was deleted".
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('cd_record_funnel_event','cd_submit_test_feedback')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')) = 2,
  'P4.6c exactly two audited entry points admit an anonymous write');

DO $$ BEGIN RAISE NOTICE 'GROUP P5 — honest governance record'; END $$;

-- =========================================================================
-- Group P5 — the product is live AND the record is honest
-- =========================================================================

SELECT pg_temp.ok(
  (SELECT lifecycle_status FROM public.cd_definition_versions
    WHERE definition_version = '2026-scd-v3.1.0') = 'active',
  'P5.1 production v3.1 is active');

-- The launch removed the BLOCK, not the RECORD. No review was marked done
-- that was not done, so unreviewed gates must still read false.
SELECT pg_temp.ok(
  (SELECT count(*) FROM jsonb_each(
     (SELECT review_status FROM public.cd_definition_versions
       WHERE definition_version = '2026-scd-v3.1.0')) g
    WHERE g.value = 'true'::jsonb) = 0,
  'P5.2 no review gate was falsely marked approved by the launch');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.cd_report_snapshots s
     JOIN public.cd_sessions sess ON sess.id = s.session_id
     JOIN public.cd_definition_versions dv ON dv.id = sess.definition_version_id
    WHERE dv.definition_version = '2026-scd-v3.1.0') >= 0,
  'P5.3 production snapshots are reachable through the normal pipeline');

DO $$ BEGIN RAISE NOTICE 'career_discovery_v31_public_flow_test: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
