-- The employer report access MODEL itself. Migration 20270203090000.
--
-- The matrix suite (employer_report_access_matrix_test.sql) asks "who reads what" across
-- every read path. This one asks the questions the matrix cannot, about the single
-- definition behind all of them -- employer_reports_readable -- and its resolvers:
--
--   RA0  REPRODUCTION on the pre-fix state (the real rollbacks inside a savepoint): a
--        member who holds a reviewer grant for ANOTHER use case, and a member who is no
--        reviewer at all, read a recruitment report, the lists and the counts.
--   RA1  the definition, called directly as each principal: standing, the subject, R1, R2 by
--        use case (an unknown use case is not reachable through a grant), R3 by vacancy
--        (by job or by application; another vacancy, another use case, another tenant's
--        job, no vacancy: refused), R4 by case (creator, panel, another case).
--   RA2  scp_attempt_reports_readable: every attempt for every kind of reader, an attempt
--        with NO assignment (no use case: owner/admin only), one with no issuer, an unknown id.
--   RA3  the snapshot gate: the three-argument form (no attempt, no use case: owner/admin
--        only), the four-argument form, and its cross-checks.
--   RA4  the lists, row for row: which attempts, invitations and reviews a reader is shown.
--   RA5  progress of a person whose released attempts span two use cases (and RA2.0/2.6/2.7: recommendations).
--   RA6  the responsible recruiter: reassigning, clearing, suspending and reactivating.
--   RA7  an organisation that is not active reads nothing, an owner included.
--   RA8  grants, definer posture, and that the three functions are not callable logged out.
--   RA9  employer_report_access: the caller's own facts, which tell the screen the truth.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

\ir employer_report_access_fixture.sql

-- A value as a principal: the first column as text, 'ERR:<sqlstate>' when refused.
CREATE OR REPLACE FUNCTION pg_temp.as_val(_uid uuid, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE CASE WHEN _uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
  BEGIN
    EXECUTE _sql INTO _r;
  EXCEPTION WHEN OTHERS THEN
    _r := 'ERR:' || SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
-- employer_reports_readable(e, use_case, job, application, subjects, case) as a principal.
CREATE OR REPLACE FUNCTION pg_temp.h(_uid uuid, _uc text DEFAULT NULL, _job uuid DEFAULT NULL, _app uuid DEFAULT NULL,
                                     _subjects uuid[] DEFAULT NULL, _case uuid DEFAULT NULL, _emp uuid DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT public.employer_reports_readable(%L, %L, %L, %L, %L, %L)',
    coalesce(_emp, (SELECT e FROM rm)), _uc, _job, _app, _subjects, _case));
$$;
CREATE OR REPLACE FUNCTION pg_temp.att(_uid uuid, _attempt uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT public.scp_attempt_reports_readable(%L)', _attempt));
$$;
-- A set of ids as a sorted text, as a principal.
CREATE OR REPLACE FUNCTION pg_temp.ids(_uid uuid, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT coalesce(string_agg(x::text, %L ORDER BY x::text), %L) FROM (%s) q(x)', ',', '', _sql) INTO _r;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
-- The names of attempts, for a readable assertion: r1 w r2 r3 ws v1 vs v2 v2w.
CREATE OR REPLACE FUNCTION pg_temp.names(_ids text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(n, ',' ORDER BY n), '') FROM (
    SELECT n FROM (SELECT 'r1' n, (SELECT r1 FROM rma) i UNION ALL SELECT 'w', (SELECT w FROM rma) UNION ALL
                   SELECT 'r2', (SELECT r2 FROM rma) UNION ALL SELECT 'r3', (SELECT r3 FROM rma) UNION ALL
                   SELECT 'ws', (SELECT ws FROM rma) UNION ALL SELECT 'v1', (SELECT v1 FROM rma) UNION ALL
                   SELECT 'vs', (SELECT vs FROM rma) UNION ALL SELECT 'v2', (SELECT v2 FROM rma) UNION ALL
                   SELECT 'v2w', (SELECT v2w FROM rma)) a
     WHERE _ids ~ a.i::text) z;
$$;

DO $$ BEGIN RAISE NOTICE 'GROUP RA-F -- the fixture is the one the matrix uses (nine attempts, two vacancies, three cases)'; END $$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.scp_attempts WHERE issuer_organization_id = (SELECT e FROM rm)) = 9
  AND (SELECT count(*) FROM public.recruitment_settings WHERE responsible_user_id IN ((SELECT r1 FROM rm), (SELECT r2 FROM rm))) = 2,
  'RA-F.1 nine attempts; r1 and r2 are the named responsible recruiters of V1 and V2');

-- Offboarded through the real function, as a platform administrator.
SELECT pg_temp.set_status((SELECT su  FROM rm), 'suspended');
SELECT pg_temp.set_status((SELECT rv  FROM rm), 'removed');
SELECT pg_temp.set_status((SELECT rmm FROM rm), 'removed');

-- ── RA0 · reproduction on the pre-fix state ──────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA0 -- reproduction on the pre-fix state'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20270204090000_interview_case_access_model_rollback.sql
\ir ../rollback/20270203090000_employer_report_access_model_rollback.sql
SELECT pg_temp.ok(to_regprocedure('public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)') IS NULL
  AND to_regprocedure('public.scp_attempt_reports_readable(uuid)') IS NULL,
  'RA0.0 PRE-FIX: the single definition does not exist; membership alone decides everywhere');
SELECT pg_temp.ok(
  pg_temp.as_val((SELECT pm FROM rm), format('SELECT count(*)::text FROM public.scp_employer_report(%L)', (SELECT v1 FROM rma))) = '1'
  AND pg_temp.as_val((SELECT pm FROM rm), format('SELECT count(*)::text FROM public.scp_employer_participants(%L)', (SELECT e FROM rm))) = '9'
  AND pg_temp.as_val((SELECT pm FROM rm), format('SELECT count(*)::text FROM public.scp_employer_invitations(%L)', (SELECT e FROM rm))) = '3',
  'RA0.1 PRE-FIX: a plain member reads a recruitment report, the whole participant list and the whole invitation list');
SELECT pg_temp.ok(
  pg_temp.as_val((SELECT gw FROM rm), format('SELECT count(*)::text FROM public.scp_employer_report(%L)', (SELECT v1 FROM rma))) = '1'
  AND pg_temp.as_val((SELECT r2 FROM rm), format('SELECT count(*)::text FROM public.scp_employer_report(%L)', (SELECT v1 FROM rma))) = '1',
  'RA0.2 PRE-FIX: a WORKFORCE-only reviewer and V2''s recruiter read V1''s recruitment report: neither the grant nor the vacancy is consulted');
SELECT pg_temp.ok(
  pg_temp.as_val((SELECT pm FROM rm), format('SELECT count(*)::text FROM public.scp_employer_review_pressure(%L)', (SELECT e FROM rm))) = '1'
  AND pg_temp.as_val((SELECT pm FROM rm), format('SELECT attempts_blocked::text FROM public.scp_employer_review_pressure(%L)', (SELECT e FROM rm))) = '2',
  'RA0.3 PRE-FIX: a plain member sees how many attempts wait for review (a count)');
ROLLBACK TO SAVEPOINT before_fix;

-- ── RA1 · the definition, called directly ────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA1 -- employer_reports_readable, principal by principal'; END $$;
SELECT pg_temp.ok(
  pg_temp.h((SELECT ow FROM rm)) = 'true' AND pg_temp.h((SELECT ad FROM rm)) = 'true'
  AND pg_temp.h((SELECT ow FROM rm), 'workforce') = 'true' AND pg_temp.h((SELECT ad FROM rm), 'recruitment') = 'true'
  AND pg_temp.h((SELECT ow FROM rm), 'whatever') = 'true',
  'RA1.1 R1: owner and admin read whatever the use case, a use case that is unknown or NULL included');
SELECT pg_temp.ok(
  pg_temp.h((SELECT pm FROM rm)) = 'false' AND pg_temp.h((SELECT pm FROM rm), 'workforce') = 'false'
  AND pg_temp.h((SELECT pm FROM rm), 'recruitment', (SELECT j1 FROM rm)) = 'false'
  AND pg_temp.h((SELECT pm FROM rm), 'recruitment', NULL, NULL, NULL, (SELECT case_a FROM rmc)) = 'false',
  'RA1.2 a plain member reads nothing, with any context: no use case, a use case, a vacancy, a case');
SELECT pg_temp.ok(
  pg_temp.h((SELECT gw FROM rm), 'workforce') = 'true' AND pg_temp.h((SELECT gw FROM rm), 'recruitment') = 'false'
  AND pg_temp.h((SELECT gc FROM rm), 'recruitment') = 'true' AND pg_temp.h((SELECT gc FROM rm), 'workforce') = 'false'
  AND pg_temp.h((SELECT gr FROM rm), 'workforce') = 'true' AND pg_temp.h((SELECT gr FROM rm), 'recruitment') = 'true',
  'RA1.3 R2: a grant reads its own use case(s) and not the other');
SELECT pg_temp.ok(
  pg_temp.h((SELECT gw FROM rm)) = 'false' AND pg_temp.h((SELECT gr FROM rm)) = 'false'
  AND pg_temp.h((SELECT gr FROM rm), 'other') = 'false' AND pg_temp.h((SELECT gr FROM rm), 'Workforce') = 'false',
  'RA1.4 R2: an unknown or NULL use case is not reachable through a grant, even one with both use cases');
SELECT pg_temp.ok(
  pg_temp.h((SELECT r1 FROM rm), 'recruitment', (SELECT j1 FROM rm)) = 'true'
  AND pg_temp.h((SELECT r1 FROM rm), 'recruitment', (SELECT j2 FROM rm)) = 'false'
  AND pg_temp.h((SELECT r2 FROM rm), 'recruitment', (SELECT j2 FROM rm)) = 'true'
  AND pg_temp.h((SELECT r2 FROM rm), 'recruitment', (SELECT j1 FROM rm)) = 'false',
  'RA1.5 R3: the named responsible recruiter reads their vacancy''s recruitment items and not another vacancy''s');
SELECT pg_temp.ok(
  pg_temp.h((SELECT r1 FROM rm), 'recruitment', NULL, (SELECT ap1 FROM rm)) = 'true'
  AND pg_temp.h((SELECT r1 FROM rm), 'recruitment', NULL, (SELECT ap2 FROM rm)) = 'false'
  AND pg_temp.h((SELECT r1 FROM rm), 'recruitment', NULL, (SELECT aps FROM rm)) = 'true',
  'RA1.6 R3: the vacancy may be named by its application: an application on V1 is V1''s, an application on V2 is not');
SELECT pg_temp.ok(
  pg_temp.h((SELECT r1 FROM rm), 'workforce', (SELECT j1 FROM rm)) = 'false'
  AND pg_temp.h((SELECT r1 FROM rm), NULL, (SELECT j1 FROM rm)) = 'false'
  AND pg_temp.h((SELECT r1 FROM rm), 'recruitment') = 'false'
  AND pg_temp.h((SELECT r1 FROM rm), 'recruitment', NULL, NULL) = 'false',
  'RA1.7 R3: only for a RECRUITMENT item, and only when the item names a vacancy');
-- A job of another organisation, whose settings name r1 as responsible: not a basis for A.
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, application_method, status)
SELECT 'e5a00000-3333-4000-8000-0000000000f1', 'rm-annan-vakans', 'RMX001', x, 'Annan vakans', 'internal', 'draft' FROM rm;
INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id)
SELECT 'e5a00000-3333-4000-8000-0000000000f1', x, r1 FROM rm;
SELECT pg_temp.ok(
  pg_temp.h((SELECT r1 FROM rm), 'recruitment', 'e5a00000-3333-4000-8000-0000000000f1') = 'false',
  'RA1.8 R3: a job of ANOTHER organisation, even one whose settings name the caller as responsible, is no basis for reading A''s items');
SELECT pg_temp.ok(
  pg_temp.h((SELECT cr FROM rm), 'recruitment', NULL, NULL, NULL, (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.h((SELECT pn FROM rm), 'recruitment', NULL, NULL, NULL, (SELECT case_a FROM rmc)) = 'true'
  AND pg_temp.h((SELECT cr FROM rm), 'recruitment', NULL, NULL, NULL, (SELECT case_b FROM rmc)) = 'false'
  AND pg_temp.h((SELECT pn FROM rm), 'recruitment', NULL, NULL, NULL, (SELECT kase FROM rmc)) = 'false',
  'RA1.9 R4: the creator and a panel member read their case, and not another');
SELECT pg_temp.ok(
  pg_temp.h((SELECT cr FROM rm), 'recruitment') = 'false' AND pg_temp.h((SELECT cr FROM rm)) = 'false',
  'RA1.10 R4 is about the case only: without it the creator reads nothing');
SELECT pg_temp.ok(
  pg_temp.h((SELECT cr FROM rm), 'recruitment', NULL, NULL, ARRAY[(SELECT cr FROM rm)], (SELECT case_a FROM rmc)) = 'false'
  AND pg_temp.h((SELECT sm FROM rm), 'recruitment', (SELECT j1 FROM rm), NULL, ARRAY[(SELECT sm FROM rm)]) = 'false'
  AND pg_temp.h((SELECT ow FROM rm), 'workforce', NULL, NULL, ARRAY[(SELECT ow FROM rm)]) = 'false'
  AND pg_temp.h((SELECT ow FROM rm), 'workforce', NULL, NULL, ARRAY[(SELECT p FROM rm), NULL]) = 'true',
  'RA1.11 the subject is excluded from every basis -- the creator of a case about themselves, an admin, the owner -- and an unrelated subject changes nothing');
SELECT pg_temp.ok(
  pg_temp.h((SELECT su FROM rm), 'workforce') = 'false' AND pg_temp.h((SELECT rv FROM rm)) = 'false'
  AND pg_temp.h((SELECT rmm FROM rm), 'recruitment', (SELECT j1 FROM rm)) = 'false'
  AND pg_temp.h((SELECT xo FROM rm)) = 'false' AND pg_temp.h((SELECT pa FROM rm)) = 'false'
  AND pg_temp.h((SELECT p FROM rm)) = 'false',
  'RA1.12 standing: a suspended admin, a removed admin, a removed member, the owner of another company, a platform admin and a candidate read nothing');
SELECT pg_temp.ok(
  pg_temp.h((SELECT ow FROM rm), NULL, NULL, NULL, NULL, NULL, (SELECT x FROM rm)) = 'false'
  AND pg_temp.as_val((SELECT ow FROM rm), 'SELECT public.employer_reports_readable(NULL, NULL, NULL, NULL, NULL, NULL)') = 'false',
  'RA1.13 another organisation''s id, and no organisation, are false for an owner of A');
SELECT pg_temp.ok(pg_temp.h(NULL) = 'ERR:42501',
  'RA1.14 logged out: the function is not executable at all');

-- ── RA2 · an attempt, resolved ───────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA2 -- scp_attempt_reports_readable'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.recs(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT count(*)::text FROM public.scp_development_recommendations(%L)', (SELECT s1 FROM rms)));
$$;
-- Baseline: p has two released workforce attempts, and every reader of workforce material may build on them.
SELECT pg_temp.ok(
  pg_temp.recs((SELECT ow FROM rm))::int > 0 AND pg_temp.recs((SELECT gr FROM rm))::int > 0 AND pg_temp.recs((SELECT gw FROM rm))::int > 0
  AND pg_temp.recs((SELECT pm FROM rm)) = '0' AND pg_temp.recs((SELECT gc FROM rm)) = '0' AND pg_temp.recs((SELECT r1 FROM rm)) = '0',
  'RA2.0 baseline: the owner, a reviewer with both grants and a workforce reviewer build recommendations on p''s two workforce attempts; a plain member, a recruitment reviewer and a recruiter do not');
-- An assessment attempt with NO assignment (so no use case), and one with no issuer.
INSERT INTO public.scp_attempts (subject_id, issuer_organization_id, assignment_id, mode, form_id, assessment_version_id,
   status, started_at, submitted_at, scored_at, released_at, governance_mode, validation_status_at_assignment,
   content_status_at_assignment, scoring_model_version, purpose_version_id)
SELECT subject_id, issuer_organization_id, NULL, mode, form_id, assessment_version_id, status, started_at, submitted_at,
       scored_at, released_at, governance_mode, validation_status_at_assignment, content_status_at_assignment,
       scoring_model_version, purpose_version_id
  FROM public.scp_attempts WHERE id = (SELECT r1 FROM rma);
INSERT INTO public.scp_attempts (subject_id, issuer_organization_id, assignment_id, mode, form_id, assessment_version_id,
   status, started_at, submitted_at, scored_at, released_at, governance_mode, validation_status_at_assignment,
   content_status_at_assignment, scoring_model_version, purpose_version_id)
SELECT subject_id, NULL, NULL, mode, form_id, assessment_version_id, status, started_at, submitted_at,
       scored_at, released_at, governance_mode, validation_status_at_assignment, content_status_at_assignment,
       scoring_model_version, purpose_version_id
  FROM public.scp_attempts WHERE id = (SELECT r1 FROM rma);
CREATE TEMP TABLE rau AS SELECT
  (SELECT id FROM public.scp_attempts WHERE assignment_id IS NULL AND issuer_organization_id IS NOT NULL) AS no_assignment,
  (SELECT id FROM public.scp_attempts WHERE issuer_organization_id IS NULL) AS no_issuer;
GRANT SELECT ON rau TO PUBLIC;
SELECT pg_temp.ok(
  pg_temp.att((SELECT ow FROM rm), (SELECT no_assignment FROM rau)) = 'true'
  AND pg_temp.att((SELECT ad FROM rm), (SELECT no_assignment FROM rau)) = 'true'
  AND pg_temp.att((SELECT gr FROM rm), (SELECT no_assignment FROM rau)) = 'false'
  AND pg_temp.att((SELECT gw FROM rm), (SELECT no_assignment FROM rau)) = 'false'
  AND pg_temp.att((SELECT r1 FROM rm), (SELECT no_assignment FROM rau)) = 'false'
  AND pg_temp.att((SELECT pm FROM rm), (SELECT no_assignment FROM rau)) = 'false',
  'RA2.1 an attempt with NO assignment has no use case: owner/admin read it; a reviewer holding BOTH grants does not');
SELECT pg_temp.ok(
  pg_temp.att((SELECT ow FROM rm), (SELECT no_issuer FROM rau)) = 'false'
  AND pg_temp.att((SELECT ow FROM rm), gen_random_uuid()) = 'false'
  AND pg_temp.att((SELECT ow FROM rm), NULL) = 'false',
  'RA2.2 an attempt with no issuer, an unknown id and NULL are false, never NULL');
SELECT pg_temp.ok(
  pg_temp.att((SELECT ow FROM rm), (SELECT r1 FROM rma)) = 'true'
  AND pg_temp.att((SELECT gw FROM rm), (SELECT r1 FROM rma)) = 'true'  AND pg_temp.att((SELECT gw FROM rm), (SELECT v1 FROM rma)) = 'false'
  AND pg_temp.att((SELECT gc FROM rm), (SELECT v2w FROM rma)) = 'true'  AND pg_temp.att((SELECT gc FROM rm), (SELECT w FROM rma)) = 'false'
  AND pg_temp.att((SELECT r1 FROM rm), (SELECT v1 FROM rma)) = 'true'   AND pg_temp.att((SELECT r1 FROM rm), (SELECT v2 FROM rma)) = 'false'
  AND pg_temp.att((SELECT r1 FROM rm), (SELECT r1 FROM rma)) = 'false',
  'RA2.3 the use case and the vacancy of an attempt come from its ASSIGNMENT, and decide R2 and R3');
SELECT pg_temp.ok(
  pg_temp.att((SELECT sm FROM rm), (SELECT vs FROM rma)) = 'false' AND pg_temp.att((SELECT sm FROM rm), (SELECT v1 FROM rma)) = 'true'
  AND pg_temp.att((SELECT sg FROM rm), (SELECT ws FROM rma)) = 'false' AND pg_temp.att((SELECT sg FROM rm), (SELECT r3 FROM rma)) = 'true'
  AND pg_temp.att((SELECT p FROM rm), (SELECT r1 FROM rma)) = 'false' AND pg_temp.att((SELECT c1 FROM rm), (SELECT v1 FROM rma)) = 'false',
  'RA2.4 the subject is excluded: the admin from their own attempt, the reviewer from theirs, the candidates from theirs');
SELECT pg_temp.ok(pg_temp.att(NULL, (SELECT r1 FROM rma)) = 'ERR:42501',
  'RA2.5 logged out: not executable');
-- The unassigned attempt is a released attempt of p's in the organisation that only an owner/admin may read.
SELECT pg_temp.ok(
  pg_temp.recs((SELECT ow FROM rm))::int > 0 AND pg_temp.recs((SELECT ad FROM rm))::int > 0,
  'RA2.6 the owner and the admin may still build recommendations: they can read every released attempt of p, the unassigned one included');
SELECT pg_temp.ok(
  pg_temp.recs((SELECT gw FROM rm)) = '0' AND pg_temp.recs((SELECT gr FROM rm)) = '0',
  'RA2.7 a partial reader gets NO recommendations: maturity is computed per issuing organisation and cannot be split by attempt, so an organisation counts only if EVERY released attempt of the subject in it is readable -- a reviewer who reads both of p''s assigned attempts is refused because of the third');

-- ── RA3 · the snapshot gate ──────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA3 -- scp_report_snapshot_readable'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.snap3(_uid uuid, _aud text, _subject uuid, _emp uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT public.scp_report_snapshot_readable(%L, %L, %L)', _aud, _subject, coalesce(_emp, (SELECT e FROM rm))));
$$;
CREATE OR REPLACE FUNCTION pg_temp.snap4(_uid uuid, _aud text, _subject uuid, _attempt uuid, _emp uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT public.scp_report_snapshot_readable(%L, %L, %L, %L)', _aud, _subject, coalesce(_emp, (SELECT e FROM rm)), _attempt));
$$;
SELECT pg_temp.ok(
  pg_temp.snap3((SELECT ow FROM rm), 'employer', (SELECT sv1 FROM rms)) = 'true'
  AND pg_temp.snap3((SELECT gr FROM rm), 'employer', (SELECT sv1 FROM rms)) = 'false'
  AND pg_temp.snap3((SELECT r1 FROM rm), 'employer', (SELECT sv1 FROM rms)) = 'false'
  AND pg_temp.snap3((SELECT pm FROM rm), 'employer', (SELECT sv1 FROM rms)) = 'false',
  'RA3.1 without an attempt the use case is unknown: the three-argument form is owner/admin only, a grant or a vacancy does not help');
SELECT pg_temp.ok(
  pg_temp.snap4((SELECT ow FROM rm), 'employer', (SELECT sv1 FROM rms), (SELECT v1 FROM rma)) = 'true'
  AND pg_temp.snap4((SELECT gr FROM rm), 'employer', (SELECT sv1 FROM rms), (SELECT v1 FROM rma)) = 'true'
  AND pg_temp.snap4((SELECT r1 FROM rm), 'employer', (SELECT sv1 FROM rms), (SELECT v1 FROM rma)) = 'true'
  AND pg_temp.snap4((SELECT r2 FROM rm), 'employer', (SELECT sv1 FROM rms), (SELECT v1 FROM rma)) = 'false'
  AND pg_temp.snap4((SELECT pm FROM rm), 'employer', (SELECT sv1 FROM rms), (SELECT v1 FROM rma)) = 'false',
  'RA3.2 naming the attempt: owner, a reviewer and V1''s recruiter read it; V2''s recruiter and a plain member do not');
SELECT pg_temp.ok(
  pg_temp.snap4((SELECT ow FROM rm), 'employer', (SELECT sv2 FROM rms), (SELECT v1 FROM rma)) = 'false'
  AND pg_temp.snap4((SELECT ow FROM rm), 'employer', (SELECT sv1 FROM rms), (SELECT v1 FROM rma), (SELECT x FROM rm)) = 'false'
  AND pg_temp.snap4((SELECT xo FROM rm), 'employer', (SELECT sv1 FROM rms), (SELECT v1 FROM rma), (SELECT x FROM rm)) = 'false',
  'RA3.3 the attempt must agree with the subject and the issuer it is asked about: a mismatch is false for everyone, an owner of the real issuer or of another company included');
SELECT pg_temp.ok(
  pg_temp.snap4((SELECT ow FROM rm), 'employer', (SELECT sv1 FROM rms), NULL) = pg_temp.snap3((SELECT ow FROM rm), 'employer', (SELECT sv1 FROM rms))
  AND pg_temp.snap4((SELECT gr FROM rm), 'employer', (SELECT sv1 FROM rms), NULL) = 'false',
  'RA3.4 with a NULL attempt the four-argument form is the three-argument one');
SELECT pg_temp.ok(
  pg_temp.snap3((SELECT p FROM rm), 'participant', (SELECT s1 FROM rms)) = 'true'
  AND pg_temp.snap4((SELECT p FROM rm), 'participant', (SELECT s1 FROM rms), (SELECT r1 FROM rma)) = 'true'
  AND pg_temp.snap3((SELECT ow FROM rm), 'participant', (SELECT s1 FROM rms)) = 'false'
  AND pg_temp.snap4((SELECT p2 FROM rm), 'participant', (SELECT s1 FROM rms), (SELECT r1 FROM rma)) = 'false',
  'RA3.5 the participant branch is unchanged: the subject reads their own document and nobody else does');
SELECT pg_temp.ok(
  pg_temp.snap3((SELECT sm FROM rm), 'employer', (SELECT svs FROM rms)) = 'false'
  AND pg_temp.snap4((SELECT sm FROM rm), 'employer', (SELECT svs FROM rms), (SELECT vs FROM rma)) = 'false'
  AND pg_temp.snap4((SELECT sm FROM rm), 'employer', (SELECT s1 FROM rms), (SELECT r1 FROM rma)) = 'true',
  'RA3.6 the admin who is the subject is refused on both forms, and still reads the others');

-- ── RA4 · the lists, row for row ─────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA4 -- which rows a reader is shown'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.list_participants(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.names(pg_temp.ids(_uid, format('SELECT attempt_id FROM public.scp_employer_participants(%L)', (SELECT e FROM rm))));
$$;
CREATE OR REPLACE FUNCTION pg_temp.list_pipeline(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.names(pg_temp.ids(_uid, format('SELECT attempt_id FROM public.scp_employer_assessment_pipeline(%L)', (SELECT e FROM rm))));
$$;
CREATE OR REPLACE FUNCTION pg_temp.list_board(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.names(pg_temp.ids(_uid, format('SELECT attempt_id FROM public.scp_employer_review_board(%L)', (SELECT e FROM rm))));
$$;
SELECT pg_temp.ok(
  pg_temp.list_participants((SELECT ow FROM rm)) = 'r1,r2,r3,v1,v2,v2w,vs,w,ws'
  AND pg_temp.list_pipeline((SELECT ad FROM rm)) = 'r1,r2,r3,v1,v2,v2w,vs,w,ws',
  'RA4.1 owner and admin see all nine attempts, in the participant list and in the pipeline');
SELECT pg_temp.ok(
  pg_temp.list_participants((SELECT gw FROM rm)) = 'r1,r2,r3,w,ws' AND pg_temp.list_pipeline((SELECT gw FROM rm)) = 'r1,r2,r3,w,ws'
  AND pg_temp.list_participants((SELECT gc FROM rm)) = 'v1,v2,v2w,vs' AND pg_temp.list_pipeline((SELECT gc FROM rm)) = 'v1,v2,v2w,vs',
  'RA4.2 a workforce reviewer is shown the workforce rows only; a recruitment reviewer the recruitment rows only');
SELECT pg_temp.ok(
  pg_temp.list_participants((SELECT r1 FROM rm)) = 'v1,vs' AND pg_temp.list_pipeline((SELECT r1 FROM rm)) = 'v1,vs'
  AND pg_temp.list_participants((SELECT r2 FROM rm)) = 'v2,v2w' AND pg_temp.list_pipeline((SELECT r2 FROM rm)) = 'v2,v2w',
  'RA4.3 a responsible recruiter is shown their vacancy''s rows only');
SELECT pg_temp.ok(
  pg_temp.list_participants((SELECT pm FROM rm)) = '' AND pg_temp.list_pipeline((SELECT pm FROM rm)) = ''
  AND pg_temp.list_board((SELECT pm FROM rm)) = '' AND pg_temp.list_participants((SELECT cr FROM rm)) = '',
  'RA4.4 a plain member, and the creator of a case, are shown no row at all');
SELECT pg_temp.ok(
  pg_temp.list_board((SELECT ow FROM rm)) = 'v2w,w' AND pg_temp.list_board((SELECT gc FROM rm)) = 'v2w'
  AND pg_temp.list_board((SELECT gw FROM rm)) = 'w' AND pg_temp.list_board((SELECT r2 FROM rm)) = 'v2w'
  AND pg_temp.list_board((SELECT r1 FROM rm)) = '',
  'RA4.5 the review board: the attempts waiting for review that the reader may read, and no others');
SELECT pg_temp.ok(
  pg_temp.list_participants((SELECT sm FROM rm)) = 'r1,r2,r3,v1,v2,v2w,w,ws'
  AND pg_temp.list_participants((SELECT sg FROM rm)) = 'r1,r2,r3,v1,v2,v2w,vs,w',
  'RA4.6 the admin is not shown the attempt about themselves, the reviewer is not shown theirs');
SELECT pg_temp.ok(
  pg_temp.as_val((SELECT r1 FROM rm), format('SELECT string_agg(invited_name, %L ORDER BY invited_name) FROM public.scp_employer_invitations(%L)', ',', (SELECT e FROM rm))) = 'Inbjuden vakans ett'
  AND pg_temp.as_val((SELECT gw FROM rm), format('SELECT string_agg(invited_name, %L ORDER BY invited_name) FROM public.scp_employer_invitations(%L)', ',', (SELECT e FROM rm))) = 'Inbjuden arbetsstyrka'
  AND pg_temp.as_val((SELECT gc FROM rm), format('SELECT string_agg(invited_name, %L ORDER BY invited_name) FROM public.scp_employer_invitations(%L)', ',', (SELECT e FROM rm))) = 'Inbjuden vakans ett,Inbjuden vakans två',
  'RA4.7 invitations follow the use case and the vacancy of the invitation');
CREATE OR REPLACE FUNCTION pg_temp.pressure(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format('SELECT coalesce(string_agg(attempts_blocked::text, %L), %L) FROM public.scp_employer_review_pressure(%L)', ',', 'none', (SELECT e FROM rm)));
$$;
SELECT pg_temp.ok(
  pg_temp.pressure((SELECT pm FROM rm)) = 'none' AND pg_temp.pressure((SELECT cr FROM rm)) = 'none'
  AND pg_temp.pressure((SELECT xo FROM rm)) = 'none' AND pg_temp.pressure((SELECT su FROM rm)) = 'none',
  'RA4.8 the review-pressure counts: a plain member, a case creator, an outsider and a suspended admin get NO row at all -- not even a row of zeros -- so they learn nothing about how much is waiting');
SELECT pg_temp.ok(
  pg_temp.pressure((SELECT ow FROM rm)) = '2' AND pg_temp.pressure((SELECT gc FROM rm)) = '1'
  AND pg_temp.pressure((SELECT gw FROM rm)) = '1' AND pg_temp.pressure((SELECT r2 FROM rm)) = '1'
  AND pg_temp.pressure((SELECT r1 FROM rm)) = '0',
  'RA4.9 and the authorised read their own counts: the owner 2 attempts waiting, a recruitment reviewer and V2''s recruiter 1 (v2w), a workforce reviewer 1 (w), and V1''s recruiter -- who reads two attempts, none waiting -- a row of zeros');

-- ── RA5 · progress of a person across use cases ──────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA5 -- a subject whose released attempts span two use cases'; END $$;
-- p also applies to V1 and sits the recruitment test: p now has workforce attempts r1, r2
-- and a recruitment attempt on V1, all released.
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, consent_given_at)
SELECT 'e5a00000-4444-4000-8000-000000000005', j1, e, p, 'submitted', now() FROM rm;
CREATE TEMP TABLE rav AS SELECT pg_temp.run_attempt((SELECT p FROM rm), 'rm-candidate@test.invalid', NULL, (SELECT ow FROM rm),
                                                    'e5a00000-4444-4000-8000-000000000005') AS v5;
GRANT SELECT ON rav TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.progress_attempts(_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(DISTINCT CASE WHEN a = (SELECT r1 FROM rma) THEN 'r1' WHEN a = (SELECT r2 FROM rma) THEN 'r2'
                                           WHEN a = (SELECT v5 FROM rav) THEN 'v5' ELSE '?' END, ',' ORDER BY
                                      CASE WHEN a = (SELECT r1 FROM rma) THEN 'r1' WHEN a = (SELECT r2 FROM rma) THEN 'r2'
                                           WHEN a = (SELECT v5 FROM rav) THEN 'v5' ELSE '?' END), '')
    FROM (SELECT x::uuid AS a FROM regexp_split_to_table(
            pg_temp.ids(_uid, format('SELECT DISTINCT attempt_id FROM public.scp_subject_progress(%L)', (SELECT s1 FROM rms))), ',') x WHERE x <> '') q;
$$;
SELECT pg_temp.ok(
  pg_temp.progress_attempts((SELECT ow FROM rm)) = 'r1,r2,v5' AND pg_temp.progress_attempts((SELECT gr FROM rm)) = 'r1,r2,v5',
  'RA5.1 the owner and a reviewer with both grants read the progress of all three released attempts');
SELECT pg_temp.ok(
  pg_temp.progress_attempts((SELECT gw FROM rm)) = 'r1,r2' AND pg_temp.progress_attempts((SELECT gc FROM rm)) = 'v5'
  AND pg_temp.progress_attempts((SELECT r1 FROM rm)) = 'v5' AND pg_temp.progress_attempts((SELECT r2 FROM rm)) = ''
  AND pg_temp.progress_attempts((SELECT pm FROM rm)) = '',
  'RA5.2 progress is filtered snapshot by snapshot: a workforce reviewer reads the workforce attempts, a recruitment reviewer and V1''s recruiter the recruitment one, V2''s recruiter and a plain member none');

-- ── RA6 · the responsible recruiter ──────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA6 -- the responsible recruiter of a vacancy'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.set_responsible(_job uuid, _user uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT ow FROM rm)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.rec_set_recruitment_responsible(_job, _user, NULL);
  EXCEPTION WHEN OTHERS THEN _r := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE TEMP TABLE ra6 (k text PRIMARY KEY, v text);
GRANT ALL ON ra6 TO PUBLIC;
INSERT INTO ra6 VALUES ('reassign', pg_temp.set_responsible((SELECT j1 FROM rm), (SELECT r2 FROM rm)));
SELECT pg_temp.ok((SELECT v FROM ra6 WHERE k = 'reassign') = 'ok'
  AND pg_temp.list_participants((SELECT r1 FROM rm)) = ''
  AND pg_temp.list_participants((SELECT r2 FROM rm)) = 'v1,v2,v2w,vs',
  'RA6.1 the owner reassigns V1 to r2: r1 stops reading V1 at once, r2 reads V1 and V2');
INSERT INTO ra6 VALUES ('clear', pg_temp.set_responsible((SELECT j1 FROM rm), NULL));
SELECT pg_temp.ok((SELECT v FROM ra6 WHERE k = 'clear') = 'ok'
  AND pg_temp.list_participants((SELECT r2 FROM rm)) = 'v2,v2w'
  AND pg_temp.att((SELECT r2 FROM rm), (SELECT v1 FROM rma)) = 'false',
  'RA6.2 clearing the responsible of V1 leaves nobody with that basis');
INSERT INTO ra6 VALUES ('back', pg_temp.set_responsible((SELECT j1 FROM rm), (SELECT r1 FROM rm)));
SELECT pg_temp.ok(pg_temp.list_participants((SELECT r1 FROM rm)) = 'v1,vs',
  'RA6.3 and naming r1 again restores it');
SELECT pg_temp.set_status((SELECT r1 FROM rm), 'suspended');
SELECT pg_temp.ok(
  (SELECT responsible_user_id FROM public.recruitment_settings WHERE job_id = (SELECT j1 FROM rm)) = (SELECT r1 FROM rm)
  AND pg_temp.list_participants((SELECT r1 FROM rm)) = '' AND pg_temp.att((SELECT r1 FROM rm), (SELECT v1 FROM rma)) = 'false',
  'RA6.4 a SUSPENDED responsible recruiter reads nothing, although the vacancy still names them');
SELECT pg_temp.set_status((SELECT r1 FROM rm), 'active');
SELECT pg_temp.ok(pg_temp.list_participants((SELECT r1 FROM rm)) = 'v1,vs',
  'RA6.5 (recorded, deliberate) reactivated, they are still the vacancy''s named responsible and read it again: the name is the owner''s assignment, not a grant; owner/admin change it with rec_set_recruitment_responsible');
INSERT INTO ra6 VALUES ('nonmember', pg_temp.set_responsible((SELECT j1 FROM rm), (SELECT xo FROM rm)));
SELECT pg_temp.ok((SELECT v FROM ra6 WHERE k = 'nonmember') ~ 'RESPONSIBLE_NOT_A_MEMBER',
  'RA6.6 only a member can be named responsible (existing rule, unchanged)');

-- ── RA7 · an organisation that is not active ─────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA7 -- a suspended organisation reads nothing'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.moderate(_action text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT pa FROM rm)::text, true);
  PERFORM public.moderate_employer((SELECT e FROM rm), _action, 'RA7');
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;
SELECT pg_temp.moderate('suspended');
SELECT pg_temp.ok(
  pg_temp.h((SELECT ow FROM rm)) = 'false' AND pg_temp.h((SELECT gr FROM rm), 'workforce') = 'false'
  AND pg_temp.h((SELECT r1 FROM rm), 'recruitment', (SELECT j1 FROM rm)) = 'false'
  AND pg_temp.att((SELECT ow FROM rm), (SELECT r1 FROM rma)) = 'false'
  AND pg_temp.list_participants((SELECT ow FROM rm)) = '',
  'RA7.1 with the organisation suspended, the owner, a reviewer and a recruiter read nothing');
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok(
  pg_temp.h((SELECT ow FROM rm)) = 'true' AND pg_temp.h((SELECT gr FROM rm), 'workforce') = 'true'
  AND pg_temp.h((SELECT r1 FROM rm), 'recruitment', (SELECT j1 FROM rm)) = 'true',
  'RA7.2 reactivated, they read again');

-- ── RA8 · grants and posture ─────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA8 -- grants and definer posture'; END $$;
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_attempt_reports_readable(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.scp_report_snapshot_readable(text,uuid,uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.employer_reports_readable(uuid,text,uuid,uuid,uuid[],uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_attempt_reports_readable(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.scp_report_snapshot_readable(text,uuid,uuid,uuid)', 'EXECUTE'),
  'RA8.1 the new functions are executable by authenticated and not by anon');
SELECT pg_temp.ok(
  (SELECT bool_and(p.prosecdef AND p.proconfig IS NOT NULL AND p.provolatile = 's') FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('employer_reports_readable', 'scp_attempt_reports_readable')),
  'RA8.2 both resolvers are SECURITY DEFINER, STABLE, with a pinned search_path');
SELECT pg_temp.ok(
  (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('scp_employer_report', 'scp_employer_report_identity', 'scp_subject_progress', 'scp_development_recommendations',
                        'scp_employer_decisions', 'scp_interview_notes', 'scp_employer_participants', 'scp_employer_assessment_pipeline',
                        'scp_employer_person_overview', 'scp_application_assessments', 'scp_employer_invitations',
                        'scp_employer_review_board', 'scp_employer_review_pressure', 'scp_employer_training_status',
                        'scp_report_snapshot_readable')),
  'RA8.3 every changed function kept its grants: authenticated may execute, anon may not');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
     AND policyname IN ('scp_report_snapshots_employer', 'scp_employer_decisions_member_read', 'scp_interview_notes_employer_read',
                        'scp_assessment_invitations_employer_read', 'assignments_employer_select', 'scp_training_assignments_read',
                        'scp_training_progress_read')
     AND roles = '{authenticated}' AND cmd = 'SELECT') = 7,
  'RA8.4 the seven altered policies are still authenticated, SELECT-only policies of the same names');

-- ── RA9 · the caller's own facts, for the screen ─────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP RA9 -- employer_report_access: what the application is told about the caller'; END $$;
-- member | owner_or_admin | readable use cases | responsible vacancies (j1/j2) | any case, for the caller.
CREATE OR REPLACE FUNCTION pg_temp.facts(_uid uuid, _emp uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.as_val(_uid, format($f$SELECT concat_ws('|', is_member::text, owner_or_admin::text,
         array_to_string(readable_use_cases, ','),
         replace(replace(array_to_string(responsible_job_ids, ','), %L, 'j1'), %L, 'j2'), case_access::text)
       FROM public.employer_report_access(%L)$f$, (SELECT j1 FROM rm)::text, (SELECT j2 FROM rm)::text, coalesce(_emp, (SELECT e FROM rm))));
$$;
SELECT pg_temp.ok(
  pg_temp.facts((SELECT ow FROM rm)) = 'true|true|recruitment,workforce||true'
  AND pg_temp.facts((SELECT ad FROM rm)) = 'true|true|recruitment,workforce||true',
  'RA9.1 an owner and an admin are told: member, owner/admin, both use cases, every case');
SELECT pg_temp.ok(
  pg_temp.facts((SELECT pm FROM rm)) = 'true|false|||false',
  'RA9.2 an ordinary member is told, truthfully, that they are a member with nothing to read: the screen can say "you do not have access to results"');
SELECT pg_temp.ok(
  pg_temp.facts((SELECT gw FROM rm)) = 'true|false|workforce||false'
  AND pg_temp.facts((SELECT gc FROM rm)) = 'true|false|recruitment||true'
  AND pg_temp.facts((SELECT gr FROM rm)) = 'true|false|recruitment,workforce||true',
  'RA9.3 a reviewer is told the use cases of their grant (and a recruitment reviewer that cases are theirs to open)');
SELECT pg_temp.ok(
  pg_temp.facts((SELECT r1 FROM rm)) = 'true|false||j1|true'
  AND pg_temp.facts((SELECT r2 FROM rm)) = 'true|false||j2|false',
  'RA9.4 a responsible recruiter is told which vacancy they answer for; V1''s recruiter has cases to open (A and B), V2''s has none yet');
SELECT pg_temp.ok(
  pg_temp.facts((SELECT cr FROM rm)) = 'true|false|||true' AND pg_temp.facts((SELECT pn FROM rm)) = 'true|false|||true',
  'RA9.5 the creator and a panel member are told they have a case to open and no results to read');
SELECT pg_temp.ok(
  pg_temp.facts((SELECT su FROM rm)) = 'false|false|||false' AND pg_temp.facts((SELECT rv FROM rm)) = 'false|false|||false'
  AND pg_temp.facts((SELECT xo FROM rm)) = 'false|false|||false' AND pg_temp.facts((SELECT pa FROM rm)) = 'false|false|||false'
  AND pg_temp.facts((SELECT p FROM rm)) = 'false|false|||false',
  'RA9.6 a suspended or removed admin, another company''s owner, a platform admin and a candidate are told nothing is theirs: not a member');
SELECT pg_temp.ok(
  pg_temp.facts((SELECT ow FROM rm), (SELECT x FROM rm)) = 'false|false|||false',
  'RA9.7 the answer is about the organisation asked: an owner of A is no owner of B');
SELECT pg_temp.ok(
  pg_temp.as_val((SELECT ow FROM rm), 'SELECT count(*)::text FROM public.employer_report_access(NULL)') = '1'
  AND pg_temp.facts(NULL) = 'ERR:42501',
  'RA9.8 always exactly one row, even for no organisation; logged out is refused outright');
SELECT pg_temp.moderate('suspended');
SELECT pg_temp.ok(pg_temp.facts((SELECT ow FROM rm)) = 'false|false|||false',
  'RA9.9 with the organisation suspended even its owner is told they are no member of an active organisation');
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok(
  (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   AND p.prosecdef AND p.proconfig IS NOT NULL AND p.provolatile = 's')
     FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'employer_report_access'),
  'RA9.10 employer_report_access is executable by authenticated, not anon, STABLE SECURITY DEFINER with a pinned search_path');

ROLLBACK;
