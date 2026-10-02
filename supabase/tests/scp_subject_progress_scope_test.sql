-- P0 2026-10-02 (20270102090000): the progress series shows an employer only
-- its own organisation's reports. Two real employers assess the same person
-- through the real assign -> answer -> submit -> review -> release flow, as
-- the principals allowed to take each step. One transaction, ends in ROLLBACK.
--
--   PS0  reproduction: on the pre-fix body (the real rollback, inside a
--        savepoint) employer 1's owner reads employer 2's report rows
--   PS1  each employer reads only its own organisation's rows, and still reads
--        all of them
--   PS2  the participant still reads their own series across both employers
--   PS3  a member of BOTH employers reads both
--   PS4  outsiders read nothing: a suspended member, a member of an unrelated
--        employer, anon

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.fixture_rubric_levels(_ivid uuid, _fmt text)
RETURNS jsonb LANGUAGE sql AS $fn$
  SELECT CASE WHEN _fmt <> 'constructed_response' THEN NULL ELSE (
    SELECT jsonb_object_agg(d.dimension_key, CASE WHEN d.assesses_writing_quality THEN 0 ELSE 4 END)
      FROM public.scp_rubric_dimensions d
      JOIN public.scp_rubric_versions rv ON rv.id = d.rubric_version_id
     WHERE rv.item_version_id = _ivid) END;
$fn$;

-- ── Fixture ──────────────────────────────────────────────────────────────
--   e1/e2  two employers that each assess the same participant
--   o1/o2  their owners; r1/r2 their authorised reviewers
--   both   an active member of e1 AND e2
--   other  an owner of e3, which never assessed the participant
CREATE TEMP TABLE ps AS SELECT
  'c7000000-0000-4000-8000-0000000000e1'::uuid AS e1,
  'c7000000-0000-4000-8000-0000000000e2'::uuid AS e2,
  'c7000000-0000-4000-8000-0000000000e3'::uuid AS e3,
  'c7000000-0000-4000-8000-000000000001'::uuid AS o1,
  'c7000000-0000-4000-8000-000000000002'::uuid AS o2,
  'c7000000-0000-4000-8000-000000000011'::uuid AS r1,
  'c7000000-0000-4000-8000-000000000012'::uuid AS r2,
  'c7000000-0000-4000-8000-000000000003'::uuid AS participant,
  'c7000000-0000-4000-8000-000000000004'::uuid AS both_m,
  'c7000000-0000-4000-8000-000000000005'::uuid AS other_o;
GRANT SELECT ON ps TO PUBLIC;

INSERT INTO auth.users (id, email)
SELECT o1, 'ps-o1@scope.test' FROM ps UNION ALL SELECT o2, 'ps-o2@scope.test' FROM ps UNION ALL
SELECT r1, 'ps-r1@scope.test' FROM ps UNION ALL SELECT r2, 'ps-r2@scope.test' FROM ps UNION ALL
SELECT participant, 'ps-participant@scope.test' FROM ps UNION ALL
SELECT both_m, 'ps-both@scope.test' FROM ps UNION ALL SELECT other_o, 'ps-other@scope.test' FROM ps;

INSERT INTO public.employers (id, name, slug, status)
SELECT e1, 'PS Ett AB', 'ps-ett-ab', 'active' FROM ps UNION ALL
SELECT e2, 'PS Två AB', 'ps-tva-ab', 'active' FROM ps UNION ALL
SELECT e3, 'PS Tre AB', 'ps-tre-ab', 'active' FROM ps;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e1, o1, 'owner', 'active' FROM ps UNION ALL
SELECT e2, o2, 'owner', 'active' FROM ps UNION ALL
SELECT e3, other_o, 'owner', 'active' FROM ps UNION ALL
SELECT e1, r1, 'member', 'active' FROM ps UNION ALL
SELECT e2, r2, 'member', 'active' FROM ps UNION ALL
SELECT e1, both_m, 'member', 'active' FROM ps UNION ALL
SELECT e2, both_m, 'member', 'active' FROM ps;
INSERT INTO public.scp_employer_reviewers (employer_id, user_id, allowed_use_cases, granted_by)
SELECT e1, r1, ARRAY['workforce','recruitment']::text[], o1 FROM ps UNION ALL
SELECT e2, r2, ARRAY['workforce','recruitment']::text[], o2 FROM ps;

CREATE TEMP TABLE psv AS
SELECT av.id AS version_id, av.definition_id
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
 WHERE d.slug = 'sg-operational-baseline'
 ORDER BY av.version_number DESC LIMIT 1;
GRANT SELECT ON psv TO PUBLIC;
INSERT INTO public.scp_test_grants (employer_id, purpose, definition_id, reason, authorised_by, expires_at)
SELECT e1, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM psv), 'Progress scope suite', o1, now() + interval '30 days' FROM ps UNION ALL
SELECT e2, 'closed_test'::public.scp_governance_mode, (SELECT definition_id FROM psv), 'Progress scope suite', o2, now() + interval '30 days' FROM ps;

-- One full sitting for one employer, each step as the principal allowed to take it.
CREATE OR REPLACE FUNCTION pg_temp.run_attempt(_emp uuid, _owner uuid, _reviewer uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE _att uuid; _it record; _rv record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  SELECT attempt_id INTO _att FROM public.scp_employer_assign(
    _emp, (SELECT version_id FROM psv), 'ps-participant@scope.test', NULL, 'sv', 'workforce', NULL, NULL);
  PERFORM set_config('request.jwt.claim.sub', (SELECT participant FROM ps)::text, true);
  FOR _it IN
    SELECT iv.id AS ivid, iv.item_format,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order LIMIT 1) AS a,
           (SELECT o.id FROM public.scp_item_options o WHERE o.item_version_id = iv.id ORDER BY o.display_order DESC LIMIT 1) AS z
      FROM public.scp_form_items fi
      JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
      JOIN public.scp_attempts at ON at.id = _att AND at.form_id = fi.form_id
     ORDER BY fi.display_order
  LOOP
    IF _it.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, NULL, NULL, 'Svar.');
    ELSIF _it.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_att, _it.ivid, NULL, _it.a, _it.z, NULL);
    ELSE
      PERFORM public.scp_save_response(_att, _it.ivid, _it.a, NULL, NULL, NULL);
    END IF;
  END LOOP;
  PERFORM public.scp_submit_attempt(_att);
  PERFORM set_config('request.jwt.claim.sub', _reviewer::text, true);
  FOR _rv IN
    SELECT hr.id, iv.is_safety_critical, iv.id AS item_version_id, iv.item_format
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
     WHERE r.attempt_id = _att AND hr.review_status = 'pending'
  LOOP
    PERFORM public.scp_complete_human_review(_rv.id, 'upheld', 'Inom mandatet.',
      CASE WHEN _rv.is_safety_critical THEN 'no_concern' END,
      pg_temp.fixture_rubric_levels(_rv.item_version_id, _rv.item_format));
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM public.scp_release_attempt_report(_att);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _att;
END $$;

CREATE TEMP TABLE pa AS SELECT
  pg_temp.run_attempt((SELECT e1 FROM ps), (SELECT o1 FROM ps), (SELECT r1 FROM ps)) AS a1,
  NULL::uuid AS a2;
UPDATE pa SET a2 = pg_temp.run_attempt((SELECT e2 FROM ps), (SELECT o2 FROM ps), (SELECT r2 FROM ps));
GRANT SELECT ON pa TO PUBLIC;
CREATE TEMP TABLE psubj AS
SELECT subject_id FROM public.scp_attempts WHERE id = (SELECT a1 FROM pa);
GRANT SELECT ON psubj TO PUBLIC;

DO $$ BEGIN RAISE NOTICE 'GROUP PS-F -- the fixture is one person assessed by two employers'; END $$;
SELECT pg_temp.ok(
  (SELECT count(DISTINCT subject_id) FROM public.scp_attempts WHERE id IN ((SELECT a1 FROM pa), (SELECT a2 FROM pa))) = 1,
  'PS-F.1 both attempts are the same subject');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT a1 FROM pa) AND audience = 'employer'
      AND issuer_organization_id = (SELECT e1 FROM ps)) = 1
  AND (SELECT count(*) FROM public.scp_report_snapshots WHERE attempt_id = (SELECT a2 FROM pa) AND audience = 'employer'
      AND issuer_organization_id = (SELECT e2 FROM ps)) = 1,
  'PS-F.2 each employer released its own employer report');

-- Rows of the progress series, as a given user, split by which attempt they describe.
CREATE OR REPLACE FUNCTION pg_temp.rows_as(_uid uuid, _att uuid) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE _n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO _n FROM public.scp_subject_progress((SELECT subject_id FROM psubj)) p
   WHERE _att IS NULL OR p.attempt_id = _att;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _n;
END $$;

-- ── PS0 · reproduction on the pre-fix body ──────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PS0 -- reproduction on the pre-fix body'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20270102090000_scp_subject_progress_employer_scope_rollback.sql
SELECT pg_temp.ok(pg_temp.rows_as((SELECT o1 FROM ps), (SELECT a2 FROM pa)) > 0,
  'PS0.1 PRE-FIX: employer 1''s owner reads employer 2''s report rows');
ROLLBACK TO SAVEPOINT before_fix;

-- ── PS1 · each employer reads only, and all of, its own rows ────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PS1 -- each employer reads only its own organisation''s rows'; END $$;
SELECT pg_temp.ok(pg_temp.rows_as((SELECT o1 FROM ps), (SELECT a2 FROM pa)) = 0,
  'PS1.1 employer 1''s owner reads no row of employer 2''s report');
SELECT pg_temp.ok(pg_temp.rows_as((SELECT o2 FROM ps), (SELECT a1 FROM pa)) = 0,
  'PS1.2 employer 2''s owner reads no row of employer 1''s report');
SELECT pg_temp.ok(
  pg_temp.rows_as((SELECT o1 FROM ps), (SELECT a1 FROM pa))
  = (SELECT jsonb_array_length(payload) FROM public.scp_report_snapshots
      WHERE attempt_id = (SELECT a1 FROM pa) AND audience = 'employer') AND pg_temp.rows_as((SELECT o1 FROM ps), (SELECT a1 FROM pa)) > 0,
  'PS1.3 employer 1''s owner still reads every row of its own report');
SELECT pg_temp.ok(pg_temp.rows_as((SELECT r1 FROM ps), NULL) = pg_temp.rows_as((SELECT o1 FROM ps), NULL),
  'PS1.4 an ordinary member of employer 1 reads the same series as its owner');

-- ── PS2 · the participant's own series is unchanged ─────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PS2 -- the participant still reads their own series'; END $$;
SELECT pg_temp.ok(
  pg_temp.rows_as((SELECT participant FROM ps), (SELECT a1 FROM pa)) > 0
  AND pg_temp.rows_as((SELECT participant FROM ps), (SELECT a2 FROM pa)) > 0,
  'PS2.1 the participant reads their participant rows from both employers');

-- ── PS3 · a member of both reads both ───────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PS3 -- a member of both employers reads both'; END $$;
SELECT pg_temp.ok(
  pg_temp.rows_as((SELECT both_m FROM ps), (SELECT a1 FROM pa)) > 0
  AND pg_temp.rows_as((SELECT both_m FROM ps), (SELECT a2 FROM pa)) > 0,
  'PS3.1 an active member of both organisations reads both organisations'' rows');

-- ── PS4 · outsiders read nothing ────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP PS4 -- outsiders read nothing'; END $$;
UPDATE public.employer_memberships SET status = 'suspended'
 WHERE user_id = (SELECT both_m FROM ps) AND employer_id = (SELECT e2 FROM ps);
SELECT pg_temp.ok(
  pg_temp.rows_as((SELECT both_m FROM ps), (SELECT a2 FROM pa)) = 0
  AND pg_temp.rows_as((SELECT both_m FROM ps), (SELECT a1 FROM pa)) > 0,
  'PS4.1 a suspended membership no longer reads that organisation''s rows; the active one still does');
SELECT pg_temp.ok(pg_temp.rows_as((SELECT other_o FROM ps), NULL) = 0,
  'PS4.2 the owner of an unrelated employer reads nothing');
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.scp_subject_progress(uuid)', 'EXECUTE'),
  'PS4.3 anon cannot call it');

ROLLBACK;
