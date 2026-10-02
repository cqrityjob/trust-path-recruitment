-- P1-L (20270118090000): an employer creates an assessment assignment as an
-- invitation only; it cannot write the result.
--
--   FA-F the fixture: employer E (active) with an owner, a published legacy
--        assessment version from the seeded catalogue.
--   FA0  REPRODUCTION. Inside a savepoint the pre-fix grant is restored with
--        the real rollback file. E's owner creates a row that is already
--        'completed' with an invented engine_result. Rolled back.
--   FA1  after the fix, every attempt to write a lifecycle or result column on
--        creation is refused (42501), and no such row exists.
--   FA2  the application's own create shape still works: the row is an
--        invitation ('invited', no result).
--   FA3  no client role holds table-level INSERT; anon holds none at all.
--
-- Synthetic principals. Everything rolls back. auth.uid() resolves from
-- request.jwt.claim.sub.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.try_as(_uid text, _sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _n bigint; _r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid, ''), true);
  IF _uid IS NULL THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
  BEGIN
    EXECUTE _sql;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _r := 'ok:' || _n;
  EXCEPTION WHEN OTHERS THEN
    _r := 'err:' || SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;

CREATE TEMP TABLE fa AS SELECT
  '0f170000-1111-4000-8000-000000000001'::uuid AS e,
  '0f170000-0000-4000-8000-000000000001'::uuid AS o,
  (SELECT v.id FROM public.assessment_versions v WHERE v.assessment_id = 'security-career-discovery-v3'
    ORDER BY v.id LIMIT 1) AS av;
GRANT SELECT ON fa TO authenticated, anon;

INSERT INTO auth.users (id, email) SELECT o, 'fa-owner@test.invalid' FROM fa;
INSERT INTO public.employers (id, name, slug, status) SELECT e, 'FA Employer', 'fa-employer', 'active' FROM fa;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) SELECT e, o, 'owner', 'active' FROM fa;

SELECT pg_temp.ok((SELECT av IS NOT NULL FROM fa), 'FA-F a published legacy assessment version exists');

-- An insert of the application's own shape plus, optionally, one extra column.
CREATE OR REPLACE FUNCTION pg_temp.create_sql(_extra_cols text, _extra_vals text, _email text) RETURNS text
LANGUAGE sql AS $$
  SELECT format(
    'INSERT INTO public.assessment_assignments (employer_id, assessment_id, assessment_version_id, profile_id, use_case, recipient_email, assigned_by, language, invitation_token_hash, expires_at%s) '
    'VALUES (%L, ''security-career-discovery-v3'', %L, ''security_professional'', ''workforce'', %L, %L, ''sv'', md5(%L), now() + interval ''7 days''%s)',
    coalesce(', ' || _extra_cols, ''), (SELECT e FROM fa), (SELECT av FROM fa), _email, (SELECT o FROM fa), _email,
    coalesce(', ' || _extra_vals, ''));
$$;

CREATE OR REPLACE FUNCTION pg_temp.forged() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.assessment_assignments
   WHERE employer_id = (SELECT e FROM fa)
     AND (status <> 'invited' OR engine_result IS NOT NULL OR answers IS NOT NULL
          OR completion_id IS NOT NULL OR completed_at IS NOT NULL);
$$;

-- ── FA0 reproduction on the pre-fix grant ─────────────────────────────────
SAVEPOINT pre_fix;
\i supabase/rollback/20270118090000_assessment_assignment_insert_columns_rollback.sql
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('status, completed_at, completion_id, engine_result, answers',
                       '''completed'', now(), gen_random_uuid(), ''{"forged":true}''::jsonb, ''{}''::jsonb',
                       'fa-victim-0@test.invalid')) = 'ok:1'
  AND pg_temp.forged() = 1,
  'FA0.1 REPRODUCTION: pre-fix, the owner creates an already-completed assignment with an invented result');
ROLLBACK TO SAVEPOINT pre_fix;

-- ── FA1 after the fix nothing but an invitation can be created ───────────
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('status, completed_at, completion_id, engine_result, answers',
                       '''completed'', now(), gen_random_uuid(), ''{"forged":true}''::jsonb, ''{}''::jsonb',
                       'fa-victim-1@test.invalid')) = 'err:42501',
  'FA1.1 the same completed-with-result insert is refused (42501)');
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('engine_result', '''{"forged":true}''::jsonb', 'fa-victim-2@test.invalid')) = 'err:42501',
  'FA1.2 an invented engine_result alone is refused');
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('status', '''completed''', 'fa-victim-3@test.invalid')) = 'err:42501',
  'FA1.3 a status other than the default is refused');
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('answers', '''{}''::jsonb', 'fa-victim-4@test.invalid')) = 'err:42501'
  AND pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('completion_id', 'gen_random_uuid()', 'fa-victim-5@test.invalid')) = 'err:42501'
  AND pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('completed_at', 'now()', 'fa-victim-6@test.invalid')) = 'err:42501'
  AND pg_temp.try_as((SELECT o FROM fa)::text,
    pg_temp.create_sql('started_at', 'now()', 'fa-victim-7@test.invalid')) = 'err:42501',
  'FA1.4 answers, completion_id, completed_at and started_at are refused on creation');
SELECT pg_temp.ok(pg_temp.forged() = 0, 'FA1.5 no assignment of E carries a status or result the server did not write');

-- ── FA2 the application's create shape still works ───────────────────────
SELECT pg_temp.ok(
  pg_temp.try_as((SELECT o FROM fa)::text, pg_temp.create_sql(NULL, NULL, 'fa-invitee@test.invalid')) = 'ok:1',
  'FA2.1 the owner creates an invitation exactly as createAssessmentAssignment does');
SELECT pg_temp.ok(
  (SELECT status = 'invited' AND engine_result IS NULL AND completed_at IS NULL
     FROM public.assessment_assignments
    WHERE employer_id = (SELECT e FROM fa) AND recipient_email = 'fa-invitee@test.invalid'),
  'FA2.2 and the row is an invitation with no result');

-- ── FA3 privileges ───────────────────────────────────────────────────────
SELECT pg_temp.ok(
  NOT has_table_privilege('authenticated', 'public.assessment_assignments', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.assessment_assignments', 'INSERT')
  AND NOT has_column_privilege('anon', 'public.assessment_assignments', 'employer_id', 'INSERT'),
  'FA3.1 no client role holds table-level INSERT, and anon may insert nothing');
SELECT pg_temp.ok(
  NOT has_column_privilege('authenticated', 'public.assessment_assignments', 'engine_result', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.assessment_assignments', 'status', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.assessment_assignments', 'assessment_run_id', 'INSERT'),
  'FA3.2 the result, status and run columns are not client-insertable');

ROLLBACK;
