-- TRUST Evidence Report — PR-R2A, the state BETWEEN the two phases.
--
-- 20261024090000 (EXPAND) creates the audience entry points and closes the
-- ledger and default-privilege exposures; 20261025090000 (CONTRACT) withdraws
-- the direct snapshot read. Hosted, the database sits in the post-EXPAND state
-- for as long as it takes the migrated code to deploy, and a canonical replay
-- never stops there. scripts/db-test.sh reaches it deliberately -- rolls
-- CONTRACT back, runs this file, re-applies CONTRACT -- so that both of these
-- hold at once:
--
--   E1  the code on main today (direct RLS-bounded table reads) still works
--   E2  the code this PR ships (the two entry points) already works
--
-- and the exposures EXPAND alone closes (R0-X2, TRUNCATE) are already closed.
--
-- The fixture is the report-audience suite's: the sg-operational-baseline
-- form walked by one candidate, reviewed, released. Own uuids (fe...) so it
-- can never collide with that suite's rows in a shared run. One transaction,
-- ends in ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
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

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key,
             CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

DO $$ BEGIN RAISE NOTICE 'GROUP E0 — this is the post-EXPAND state'; END $$;

-- The suite is meaningless anywhere else, so it refuses to run anywhere else.
SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'scp_participant_report')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'scp_employer_report'),
  'E0.1 EXPAND is applied: the audience entry points exist');
SELECT pg_temp.ok(
  has_table_privilege('authenticated', 'public.scp_report_snapshots', 'SELECT'),
  'E0.2 CONTRACT is not: authenticated still holds the direct SELECT on scp_report_snapshots');

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE xa AS
SELECT
  'fe000000-0000-0000-0000-000000000001'::uuid AS employer,
  'fe000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fe000000-0000-0000-0000-000000000003'::uuid AS participant,
  'fe000000-0000-0000-0000-000000000004'::uuid AS other_employer,
  'fe000000-0000-0000-0000-000000000005'::uuid AS other_owner,
  'fe000000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fe000000-0000-0000-0000-000000000007'::uuid AS stranger;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user     FROM xa), 'owner@r2a-expand.test'),
  ((SELECT participant    FROM xa), 'participant@r2a-expand.test'),
  ((SELECT other_owner    FROM xa), 'other-owner@r2a-expand.test'),
  ((SELECT reviewer_user  FROM xa), 'reviewer@r2a-expand.test'),
  ((SELECT stranger       FROM xa), 'stranger@r2a-expand.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Expand AB', 'expand-ab-r2a', 'active' FROM xa
UNION ALL
SELECT other_employer, 'Annan Expand AB', 'annan-expand-r2a', 'active' FROM xa;

INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT employer, owner_user, 'owner', 'active' FROM xa
UNION ALL
SELECT other_employer, other_owner, 'owner', 'active' FROM xa
UNION ALL
SELECT employer, reviewer_user, 'member', 'active' FROM xa;

INSERT INTO public.scp_content_roles (user_id, role, granted_by)
SELECT reviewer_user, 'reviewer', owner_user FROM xa;

INSERT INTO public.scp_employer_reviewers
  (employer_id, user_id, allowed_use_cases, granted_by)
SELECT employer, reviewer_user, ARRAY['workforce','recruitment']::text[], owner_user FROM xa;

CREATE TEMP TABLE xav AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;

INSERT INTO public.scp_test_grants
  (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT employer, 'closed_test', (SELECT definition_id FROM xav),
       'R2A expand-phase suite', owner_user, now() + interval '30 days' FROM xa;

GRANT SELECT ON xa, xav TO authenticated, anon;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM xa), (SELECT version_id FROM xav),
  'participant@r2a-expand.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;
GRANT SELECT ON run TO authenticated, anon;

CREATE TEMP TABLE xitems AS
SELECT fi.display_order, iv.id AS ivid, iv.item_format,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1)      AS first_option,
       (SELECT o.id FROM public.scp_item_options o
         WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS last_option
  FROM public.scp_form_items fi
  JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
 WHERE fi.form_id = (SELECT a.form_id FROM public.scp_attempts a
                      WHERE a.id = (SELECT attempt_id FROM run));
GRANT SELECT ON xitems TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000003';
DO $$
DECLARE _att uuid; _it record;
BEGIN
  SELECT attempt_id INTO _att FROM run;
  FOR _it IN SELECT * FROM xitems ORDER BY display_order LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL,
        'Jag följer instruktionen, håller avstånd, larmar och dokumenterar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.first_option, _it.last_option, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.first_option, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000006';
DO $$
DECLARE _att uuid; _rv record;
BEGIN
  SELECT attempt_id INTO _att FROM run;
  FOR _rv IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format, i.slug
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_items i ON i.id = iv.item_id
     WHERE r.attempt_id = _att AND hr.review_status = 'pending'
  LOOP
    PERFORM public.scp_complete_human_review(_rv.id, 'upheld',
      'Inom mandatet, prioriterar säkerhet, dokumenterar åtgärden.',
      CASE WHEN NOT _rv.is_safety_critical THEN NULL
           WHEN _rv.slug = 'sg-b-10' THEN 'high'
           ELSE 'no_concern' END,
      pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
  END LOOP;
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000002';
DO $$ DECLARE _att uuid; BEGIN
  SELECT attempt_id INTO _att FROM run;
  PERFORM public.scp_release_attempt_report(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run)) = 2,
  'E0.3 the fixture released one snapshot per audience');

DO $$ BEGIN RAISE NOTICE 'GROUP E1 — the code on main still works after EXPAND'; END $$;

-- =========================================================================
-- Group E1 — the deployed reads, verbatim. getAcademyReport selects the
-- audience document columns joined to the template; the Interview
-- Intelligence bridge selects released_at and brief of the employer row.
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*)
     FROM public.scp_report_snapshots s
     JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE s.attempt_id = (SELECT attempt_id FROM run) AND s.audience = 'participant'
      AND s.payload IS NOT NULL AND s.context IS NOT NULL AND v.limitations_sv IS NOT NULL) = 1,
  'E1.1 main''s direct participant read (getAcademyReport) still returns the participant row after EXPAND');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'employer') = 0,
  'E1.3 and the re-pointed row policy still hides the employer row from the participant');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*)
     FROM public.scp_report_snapshots s
     JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE s.attempt_id = (SELECT attempt_id FROM run) AND s.audience = 'employer'
      AND s.brief IS NOT NULL) = 1
  AND (SELECT count(*) FROM public.scp_report_snapshots
        WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'employer'
          AND released_at IS NOT NULL AND brief ? 'observed') = 1,
  'E1.2 main''s direct employer read (getAcademyReport and the interview bridge) still returns the employer row after EXPAND');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'participant') = 0,
  'E1.4 and the employer still cannot see the participant row');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run)) = 0,
  'E1.5 the other organisation reads nothing through the direct read');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000007';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots
    WHERE attempt_id = (SELECT attempt_id FROM run)) = 0,
  'E1.6 nor does a stranger');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP E2 — the new entry points already work after EXPAND'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 1
  AND (SELECT audience FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 'participant'
  AND (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 0,
  'E2.1 the participant entry point already returns the participant document, and only that one');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000002';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 1
  AND (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 0
  AND (SELECT brief::text NOT LIKE '%"mean"%' AND brief::text NOT LIKE '%"spread"%'
          AND jsonb_array_length(brief -> 'observed') > 0
          AND safety_flags::text NOT LIKE '%behaviour_version_id%'
          AND jsonb_array_length(safety_flags) = 1
        FROM public.scp_employer_report((SELECT attempt_id FROM run))),
  'E2.2 the employer entry point already returns the employer document without mean/spread or internal ids');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 0
  AND (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 0,
  'E2.3 the other organisation gets nothing from either entry point');
RESET ROLE; RESET request.jwt.claim.sub;

DO $$ BEGIN RAISE NOTICE 'GROUP E3 — what EXPAND alone already closed'; END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fe000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_competency_evidence) = 0,
  'E3.1 the participant already reads no evidence-ledger row (R0-X2 closed by EXPAND)');
SELECT pg_temp.must_fail('TRUNCATE public.scp_interview_notes',
  'permission denied', 'E3.2 a signed-in user already cannot TRUNCATE the interview notes');
SELECT pg_temp.must_fail('TRUNCATE public.scp_employer_report_decisions',
  'permission denied', 'E3.3 nor the decision log');
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('TRUNCATE public.scp_interview_notes',
  'permission denied', 'E3.4 anon cannot TRUNCATE the interview notes');
SELECT pg_temp.must_fail('TRUNCATE public.scp_employer_report_decisions',
  'permission denied', 'E3.5 nor the decision log');
SELECT pg_temp.must_fail('SELECT count(*) FROM public.scp_report_snapshots',
  'permission denied', 'E3.6 anon cannot read the snapshot table');
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_employer_report(%L::uuid)', (SELECT attempt_id FROM run)),
  'permission denied', 'E3.7 anon cannot execute the employer entry point');
RESET ROLE;

ROLLBACK;
