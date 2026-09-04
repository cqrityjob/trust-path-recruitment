-- TRUST Evidence Report — PR-R2A-2 hotfix: report-version continuity.
--
-- The production defect this suite exists to keep fixed: attempt
-- b9ff051d-c3fe-486e-bee4-cfb2e9ba1e98 was released, correctly owned and
-- offered by the candidate's own history, while the audience RPC returned
-- nothing -- because 20261024090000 inner-joined scp_report_versions and that
-- snapshot's template row does not exist in this database. 16 released
-- snapshots were affected, 8 participant and 8 employer.
--
--   C1  a report whose template row is missing is still readable by its
--       audience, and still safe
--   C2  the audience boundary is unchanged by the hotfix
--   C3  FUTURE INTEGRITY: a report released today cannot become an orphan
--   C4  history and report agree -- the exact contradiction, asserted away
--
-- HOW THE ORPHAN IS MADE. Not by a hand-written INSERT, which the foreign key
-- refuses, but the way production got one: session_replication_role = replica,
-- which is what a data-only restore uses and what carried references across
-- the 2026-08-29 cutover without their targets. That it takes that to create
-- one is itself part of the proof in C3.
--
-- One transaction, ends in ROLLBACK.

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

DO $$ BEGIN RAISE NOTICE 'GROUP C0 — fixture'; END $$;

SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('scp_participant_report','scp_employer_report')
      AND p.prosrc LIKE '%LEFT JOIN public.scp_report_versions%') = 2,
  'C0.1 both audience contracts left-join the report template (20261025090000 applied)');

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE xa AS
SELECT
  'fd000000-0000-0000-0000-000000000001'::uuid AS employer,
  'fd000000-0000-0000-0000-000000000002'::uuid AS owner_user,
  'fd000000-0000-0000-0000-000000000003'::uuid AS participant,
  'fd000000-0000-0000-0000-000000000004'::uuid AS other_employer,
  'fd000000-0000-0000-0000-000000000005'::uuid AS other_owner,
  'fd000000-0000-0000-0000-000000000006'::uuid AS reviewer_user,
  'fd000000-0000-0000-0000-000000000007'::uuid AS stranger;

INSERT INTO auth.users (id, email) VALUES
  ((SELECT owner_user     FROM xa), 'owner@r2a-continuity.test'),
  ((SELECT participant    FROM xa), 'participant@r2a-continuity.test'),
  ((SELECT other_owner    FROM xa), 'other-owner@r2a-continuity.test'),
  ((SELECT reviewer_user  FROM xa), 'reviewer@r2a-continuity.test'),
  ((SELECT stranger       FROM xa), 'stranger@r2a-continuity.test');

INSERT INTO public.employers (id, name, slug, status)
SELECT employer, 'Kontinuitet AB', 'kontinuitet-ab-r2a', 'active' FROM xa
UNION ALL
SELECT other_employer, 'Annan Kontinuitet AB', 'annan-kontinuitet-r2a', 'active' FROM xa;

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
       'R2A continuity suite', owner_user, now() + interval '30 days' FROM xa;

GRANT SELECT ON xa, xav TO authenticated, anon;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM xa), (SELECT version_id FROM xav),
  'participant@r2a-continuity.test', NULL, 'sv', 'workforce', NULL, NULL);
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
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000003';
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
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000006';
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
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
DO $$ DECLARE _att uuid; BEGIN
  SELECT attempt_id INTO _att FROM run;
  PERFORM public.scp_release_attempt_report(_att);
END $$;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run)) = 2,
  'C0.2 the fixture released one snapshot per audience');


DO $$ BEGIN RAISE NOTICE 'GROUP C3 — future integrity: a report released today cannot become an orphan'; END $$;

-- =========================================================================
-- Group C3 runs FIRST, on the untouched release, because it is about the
-- release that just happened.
-- =========================================================================

-- 3.1 The release path stores a template id that exists. It cannot invent one:
--     scp_release_attempt_report SELECTs an existing published row.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s
     JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE s.attempt_id = (SELECT attempt_id FROM run)) = 2,
  'C3.1 a report released today points at a report-version row that exists');

SELECT pg_temp.ok(
  (SELECT prosrc LIKE '%FROM public.scp_report_versions%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'scp_release_attempt_report'),
  'C3.2 and it can only ever store an id it SELECTed from that table');

-- 3.3 The foreign key refuses a dangling reference on an ordinary write.
--     A second, unreleased attempt, so the (attempt_id, audience) unique key
--     cannot fire first and hide what is being tested.
INSERT INTO auth.users (id, email)
VALUES ('fd000000-0000-0000-0000-000000000008', 'second@r2a-continuity.test');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE run2 AS
SELECT * FROM public.scp_employer_assign(
  (SELECT employer FROM xa), (SELECT version_id FROM xav),
  'second@r2a-continuity.test', NULL, 'sv', 'workforce', NULL, NULL);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT attempt_id FROM run2)) = 0,
  'C3.3a the second attempt has no snapshot yet, so the unique key cannot mask the foreign key');

SELECT pg_temp.must_fail(
  $$INSERT INTO public.scp_report_snapshots
      (attempt_id, subject_id, issuer_organization_id, report_version_id,
       audience, payload, threshold_version, safety_flags)
    SELECT a.id, a.subject_id, a.issuer_organization_id, gen_random_uuid(),
           'participant', '[]'::jsonb, 'v1', '[]'::jsonb
      FROM public.scp_attempts a WHERE a.id = (SELECT attempt_id FROM run2)$$,
  'violates foreign key constraint',
  'C3.3 the foreign key refuses a snapshot pointing at a template that does not exist');

SELECT pg_temp.ok(
  (SELECT c.convalidated AND c.confdeltype = 'r'
     FROM pg_constraint c
    WHERE c.conrelid = 'public.scp_report_snapshots'::regclass
      AND c.conname = 'scp_report_snapshots_report_version_id_fkey'),
  'C3.3b and that constraint is validated and declared ON DELETE RESTRICT');

-- 3.4 A referenced template cannot be deleted out from under a snapshot.
SELECT pg_temp.must_fail(
  $$DELETE FROM public.scp_report_versions v
     WHERE v.id = (SELECT report_version_id FROM public.scp_report_snapshots
                    WHERE attempt_id = (SELECT attempt_id FROM run) AND audience = 'participant')$$,
  'violates foreign key constraint',
  'C3.4 ON DELETE RESTRICT refuses to remove a template a released report still points at');

-- 3.5 A released snapshot cannot be repointed at another template.
SELECT pg_temp.must_fail(
  $$UPDATE public.scp_report_snapshots SET report_version_id = gen_random_uuid()
     WHERE attempt_id = (SELECT attempt_id FROM run)$$,
  'SCP_SNAPSHOT_IMMUTABLE',
  'C3.5 the immutability trigger refuses to repoint a released report, even as the owner');

-- 3.6 The four together: the ONLY way to reach the production state is to
--     bypass triggers, which is what a data-only restore does and what no
--     product path can do.
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s
     LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE v.id IS NULL) = 0,
  'C3.6 nothing this suite did through the product created an orphan');

DO $$ BEGIN RAISE NOTICE 'GROUP C1 — a report whose template row is missing is still readable'; END $$;

-- =========================================================================
-- Group C1 — reproduce the production state exactly, then assert the fix.
-- =========================================================================

-- Capture the correct output first, so "unchanged apart from limitations" is
-- a comparison rather than an assertion.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE before_par AS
SELECT to_jsonb(p) AS d FROM public.scp_participant_report((SELECT attempt_id FROM run)) p;
RESET ROLE; RESET request.jwt.claim.sub;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE before_emp AS
SELECT to_jsonb(e) AS d FROM public.scp_employer_report((SELECT attempt_id FROM run)) e;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT count(*) FROM before_par) = 1 AND (SELECT count(*) FROM before_emp) = 1
  AND (SELECT jsonb_array_length(d -> 'limitations_sv') > 0 FROM before_par),
  'C1.0 with the template present both audiences get their report, limitations included');

-- Now orphan BOTH snapshots exactly as the cutover did.
SET session_replication_role = replica;
UPDATE public.scp_report_snapshots
   SET report_version_id = 'd0ddaa61-2ede-4036-81a8-9555eb49338c'::uuid
 WHERE attempt_id = (SELECT attempt_id FROM run);
SET session_replication_role = origin;

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots s
     LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
    WHERE s.attempt_id = (SELECT attempt_id FROM run) AND v.id IS NULL) = 2,
  'C1.1 both snapshots now reference a template row that does not exist -- the production state');

-- A. The participant still gets their report.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE after_par AS
SELECT to_jsonb(p) AS d FROM public.scp_participant_report((SELECT attempt_id FROM run)) p;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM after_par) = 1,
  'C1.2 (A) the participant still receives their released report with the template row missing');

-- B. The employer still gets theirs.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE after_emp AS
SELECT to_jsonb(e) AS d FROM public.scp_employer_report((SELECT attempt_id FROM run)) e;
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok((SELECT count(*) FROM after_emp) = 1,
  'C1.3 (B) the employer still receives the released employer report');

-- C. Everything the reader sees is unchanged except the limitation arrays,
--    which are empty rather than invented.
SELECT pg_temp.ok(
  (SELECT b.d - 'limitations_sv' - 'limitations_en' = a.d - 'limitations_sv' - 'limitations_en'
     FROM before_par b, after_par a),
  'C1.4 (C) the participant document is byte-identical apart from the limitation arrays');
SELECT pg_temp.ok(
  (SELECT b.d - 'limitations_sv' - 'limitations_en' = a.d - 'limitations_sv' - 'limitations_en'
     FROM before_emp b, after_emp a),
  'C1.5 (C) the employer document is byte-identical apart from the limitation arrays');
SELECT pg_temp.ok(
  (SELECT d -> 'limitations_sv' = '[]'::jsonb AND d -> 'limitations_en' = '[]'::jsonb FROM after_par)
  AND (SELECT d -> 'limitations_sv' = '[]'::jsonb AND d -> 'limitations_en' = '[]'::jsonb FROM after_emp),
  'C1.6 missing template metadata is represented as empty, never reconstructed');

-- The provenance the snapshot carries itself is NOT lost.
SELECT pg_temp.ok(
  (SELECT (d -> 'context' ? 'report_key') AND (d -> 'context' ? 'report_version') FROM after_par)
  AND (SELECT (d -> 'context' ? 'report_key') AND (d -> 'context' ? 'report_version') FROM after_emp),
  'C1.7 the document still records which template produced it, from the snapshot''s own frozen context');

DO $$ BEGIN RAISE NOTICE 'GROUP C2 — the audience boundary is unchanged by the hotfix'; END $$;

-- =========================================================================
-- Group C2 — still on the orphaned snapshots, because a compatibility fix
-- that quietly widened access would be worse than the outage.
-- =========================================================================

-- G. The participant document carries nothing internal.
SELECT pg_temp.ok(
  (SELECT NOT (d ? 'derivation_input')
      AND d::text NOT LIKE '%maturity_level%'
      AND d::text NOT LIKE '%behaviour_version_id%'
      AND d -> 'safety_flags' = '[]'::jsonb
      AND d ->> 'payload' NOT LIKE '%severity%'
      AND d ->> 'payload' NOT LIKE '%reviewer_rationale%'
      AND d ->> 'payload' NOT LIKE '%score_value%'
      AND d ->> 'payload' NOT LIKE '%is_preferred%'
     FROM after_par),
  'C2.1 (G) the participant document has no derivation input, no severity, no rationale, no answer key');

-- H. The employer document carries no internal numbers or ids.
SELECT pg_temp.ok(
  (SELECT NOT (d ? 'derivation_input')
      AND d::text NOT LIKE '%behaviour_version_id%'
      -- coalesce: bool_and over an empty array is NULL, and this fixture's
      -- form carries no self-report items. An empty array trivially satisfies
      -- "no mean, no spread"; the array-length assertion below is what makes
      -- sure the observed side is not empty for the wrong reason.
      AND coalesce((SELECT bool_and(NOT (o ? 'mean') AND NOT (o ? 'spread'))
                      FROM jsonb_array_elements(d -> 'brief' -> 'observed') o), true)
      AND coalesce((SELECT bool_and(NOT (r ? 'mean') AND NOT (r ? 'spread'))
                      FROM jsonb_array_elements(d -> 'brief' -> 'self_reported') r), true)
      AND jsonb_array_length(coalesce(d -> 'brief' -> 'observed', '[]'::jsonb)) > 0
      AND coalesce(d ->> 'brief','') NOT LIKE '%score_value%'
     FROM after_emp),
  'C2.2 (H) the employer document has no derivation input, no mean, no spread, no behaviour id');

-- D. An unauthorised candidate gets nothing, orphan or not.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000007';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 0
  AND (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 0,
  'C2.3 (D) an unrelated signed-in account still gets nothing');
RESET ROLE; RESET request.jwt.claim.sub;

-- E. A second organisation gets nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000005';
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_employer_report((SELECT attempt_id FROM run))) = 0
  AND (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) = 0,
  'C2.4 (E) another organisation still gets nothing of this one''s run');
RESET ROLE; RESET request.jwt.claim.sub;

-- F. anon cannot execute either contract.
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_participant_report(%L::uuid)', (SELECT attempt_id FROM run)),
  'permission denied', 'C2.5 (F) anon still cannot execute the participant contract');
SELECT pg_temp.must_fail(
  format('SELECT count(*) FROM public.scp_employer_report(%L::uuid)', (SELECT attempt_id FROM run)),
  'permission denied', 'C2.6 (F) nor the employer contract');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'GROUP C4 — the history and the report must agree'; END $$;

-- =========================================================================
-- Group C4 — the contradiction the candidate actually saw, asserted away.
-- The list offers the report when the history RPC returns a participant
-- snapshot id and the lifecycle says result_available. Whenever it does, the
-- participant contract MUST return that report. This is the regression test.
-- =========================================================================

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE hist AS
SELECT lifecycle_state, participant_snapshot_id,
       (SELECT count(*) FROM public.scp_participant_report((SELECT attempt_id FROM run))) AS report_rows
  FROM public.scp_my_assessment_history()
 WHERE attempt_id = (SELECT attempt_id FROM run);
RESET ROLE; RESET request.jwt.claim.sub;

SELECT pg_temp.ok(
  (SELECT lifecycle_state FROM hist) = 'result_available'
  AND (SELECT participant_snapshot_id FROM hist) IS NOT NULL,
  'C4.1 (I) the history still says result_available and still names the snapshot');

SELECT pg_temp.ok(
  (SELECT report_rows FROM hist) = 1,
  'C4.2 (I) THE REGRESSION: whenever the history offers the report, the participant contract returns it');

-- Stated as the invariant rather than as one case: across every attempt this
-- fixture released, offering and rendering agree.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'fd000000-0000-0000-0000-000000000003';
SELECT pg_temp.ok(
  NOT EXISTS (
    SELECT 1 FROM public.scp_my_assessment_history() h
     WHERE h.lifecycle_state = 'result_available'
       AND h.participant_snapshot_id IS NOT NULL
       AND (SELECT count(*) FROM public.scp_participant_report(h.attempt_id)) = 0),
  'C4.3 (I) no attempt anywhere in this candidate''s history offers a result the report contract refuses');
RESET ROLE; RESET request.jwt.claim.sub;

ROLLBACK;
