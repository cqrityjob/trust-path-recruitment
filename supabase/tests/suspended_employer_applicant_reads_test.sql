-- P1-3 (20270105090000): a suspended employer reads no applicant through the
-- definer functions.
--
--   SE-F the fixture: an application to employer E with an assessment
--        attempt and a Passport disclosure; E's owner and a plain member read
--        all three while E is active.
--   SE0  REPRODUCTION. E is suspended. Row-level security already hides the
--        application. Inside a savepoint the pre-fix functions are restored
--        by running the real rollback file, and E's owner still reads the
--        applicant's name and phone, their assessments and their disclosure.
--        Rolled back.
--   SE1  with E suspended, all three functions give E's members the same
--        empty answer a non-member gets, and the disclosure is not counted
--        as accessed.
--   SE2  the same for every other non-active status (pending, rejected,
--        archived).
--   SE3  re-activating E restores every read; the applicant's own read of
--        the application is unaffected throughout.
--   SE4  unchanged refusals: another employer's owner, a suspended member of
--        an active E, and anon.
--
-- Synthetic principals; everything rolls back. auth.uid() resolves from
-- request.jwt.claim.sub; Passport writes need a live session, as in
-- sp_application_passport_test.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated', 'session_id', _uid)::text, true);
END $$;

-- What a principal reads through each function, as the authenticated role:
-- 'candidate:<rows>,<phone seen t/f>|assessments:<rows>|disclosure:<status>'.
CREATE OR REPLACE FUNCTION pg_temp.reads_as(_uid text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _c int; _phone boolean; _a int; _d text;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  SET LOCAL ROLE authenticated;
  SELECT count(*), coalesce(bool_or(phone = '070-5550101'), false) INTO _c, _phone
    FROM public.scp_application_candidate('0f0d0000-5555-4000-8000-000000000001');
  SELECT count(*) INTO _a FROM public.scp_application_assessments('0f0d0000-5555-4000-8000-000000000001');
  _d := public.sp_application_disclosure('0f0d0000-5555-4000-8000-000000000001')->>'status';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN format('candidate:%s,%s|assessments:%s|disclosure:%s', _c, _phone, _a, _d);
END $$;

-- Suspend / reactivate through the real moderation function, as a platform
-- admin. Other statuses have no moderation transition from 'active', so SE2
-- sets them with the transaction-local marker moderate_employer() itself uses.
CREATE OR REPLACE FUNCTION pg_temp.moderate(_action text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.act_as('0f0d0000-0000-4000-8000-00000000000a');
  PERFORM public.moderate_employer('0f0d0000-1111-4000-8000-000000000001', _action, 'P1-3 regression');
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.force_status(_s text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = '0f0d0000-1111-4000-8000-000000000001';
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.rls_rows_as(_uid text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE _n int;
BEGIN
  PERFORM pg_temp.act_as(_uid);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.job_applications WHERE id = '0f0d0000-5555-4000-8000-000000000001';
  RESET ROLE;
  RETURN _n;
END $$;

-- ── Cast ────────────────────────────────────────────────────────────────
-- c candidate; o owner of E; m plain member of E; s suspended member of E;
-- x owner of another employer; a platform admin (creates the job only).
INSERT INTO auth.users (id, email) VALUES
  ('0f0d0000-0000-4000-8000-000000000001', 'se-candidate@test.invalid'),
  ('0f0d0000-0000-4000-8000-000000000002', 'se-owner@test.invalid'),
  ('0f0d0000-0000-4000-8000-000000000003', 'se-member@test.invalid'),
  ('0f0d0000-0000-4000-8000-000000000004', 'se-suspended-member@test.invalid'),
  ('0f0d0000-0000-4000-8000-000000000005', 'se-other-owner@test.invalid'),
  ('0f0d0000-0000-4000-8000-00000000000a', 'se-admin@test.invalid');
INSERT INTO auth.sessions (id, user_id)
SELECT id, id FROM auth.users WHERE id::text LIKE '0f0d0000-0000-4000-8000-%';
INSERT INTO public.user_roles (user_id, role) VALUES ('0f0d0000-0000-4000-8000-00000000000a', 'admin');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('0f0d0000-1111-4000-8000-000000000001', 'SE Employer', 'se-employer', 'active'),
  ('0f0d0000-1111-4000-8000-000000000002', 'SE Other Employer', 'se-other-employer', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  ('0f0d0000-1111-4000-8000-000000000001', '0f0d0000-0000-4000-8000-000000000002', 'owner', 'active'),
  ('0f0d0000-1111-4000-8000-000000000001', '0f0d0000-0000-4000-8000-000000000003', 'member', 'active'),
  ('0f0d0000-1111-4000-8000-000000000001', '0f0d0000-0000-4000-8000-000000000004', 'member', 'suspended'),
  ('0f0d0000-1111-4000-8000-000000000002', '0f0d0000-0000-4000-8000-000000000005', 'owner', 'active');
INSERT INTO public.profiles (id, display_name) VALUES ('0f0d0000-0000-4000-8000-000000000001', 'SE Kandidat')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- A published job (only a platform admin may create one directly).
SELECT set_config('request.jwt.claim.sub', '0f0d0000-0000-4000-8000-00000000000a', true);
INSERT INTO public.jobs (id, employer_id, title_sv, title_en, status, application_method, slug, short_id, published_at, expires_at)
VALUES ('0f0d0000-4444-4000-8000-000000000001', '0f0d0000-1111-4000-8000-000000000001',
        'Väktare', 'Security guard', 'published', 'internal', 'se-vaktare', 'SEP0001', now(), now() + interval '30 days');
SELECT set_config('request.jwt.claim.sub', '', true);

-- The application, an assessment attempt for it, and a Passport disclosure.
INSERT INTO public.job_applications (id, job_id, applicant_user_id, phone, cover_note, consent_given_at)
VALUES ('0f0d0000-5555-4000-8000-000000000001', '0f0d0000-4444-4000-8000-000000000001',
        '0f0d0000-0000-4000-8000-000000000001', '070-5550101', 'Jag söker tjänsten.', now());
INSERT INTO public.scp_subjects (id) VALUES ('0f0d0000-2222-4000-8000-000000000001');
INSERT INTO public.scp_subject_identities (subject_id, user_id) VALUES
  ('0f0d0000-2222-4000-8000-000000000001', '0f0d0000-0000-4000-8000-000000000001');
DO $$
DECLARE _g uuid;
        _av uuid := (SELECT av.id FROM public.scp_assessment_versions av JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
                      WHERE d.slug = 'fixture-delivery-e2e' LIMIT 1);
BEGIN
  INSERT INTO public.assessment_assignments
    (employer_id, scp_assessment_version_id, profile_id, use_case, recipient_email, recipient_user_id,
     assigned_by, invitation_token_hash, expires_at, status, application_id)
  VALUES ('0f0d0000-1111-4000-8000-000000000001', _av, 'fixture', 'recruitment', 'se@test.invalid',
          '0f0d0000-0000-4000-8000-000000000001', '0f0d0000-0000-4000-8000-000000000002',
          'se-token-1', now() + interval '30 days', 'invited', '0f0d0000-5555-4000-8000-000000000001')
  RETURNING id INTO _g;
  INSERT INTO public.scp_attempts (subject_id, issuer_organization_id, assignment_id, mode, form_id,
                                   assessment_version_id, status)
  VALUES ('0f0d0000-2222-4000-8000-000000000001', '0f0d0000-1111-4000-8000-000000000001', _g, 'assessment',
          (SELECT f.id FROM public.scp_forms f WHERE f.assessment_version_id = _av LIMIT 1), _av, 'in_progress');
END $$;
SELECT pg_temp.act_as('0f0d0000-0000-4000-8000-000000000001');
INSERT INTO public.sp_disclosures (id, holder_user_id, package_code, purpose, application_id, expires_at)
VALUES ('0f0d0000-6666-4000-8000-000000000001', '0f0d0000-0000-4000-8000-000000000001',
        'verified_qualifications', 'job_application', '0f0d0000-5555-4000-8000-000000000001', now() + interval '30 days');
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);

CREATE TEMP TABLE seen(label text PRIMARY KEY, val text);
GRANT ALL ON seen TO authenticated;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SE-F — while E is active its members read all three'; END $$;
-- =========================================================================
INSERT INTO seen VALUES ('owner_active', pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000002'));
SELECT pg_temp.ok((SELECT val FROM seen WHERE label = 'owner_active') LIKE 'candidate:1,t|assessments:1|disclosure:%'
                  AND (SELECT val FROM seen WHERE label = 'owner_active') NOT LIKE '%disclosure:none',
  'SE-F.1 E''s owner reads the applicant, their assessment and their disclosure (' || (SELECT val FROM seen WHERE label = 'owner_active') || ')');
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000003') = (SELECT val FROM seen WHERE label = 'owner_active'),
  'SE-F.2 a plain member reads the same');
SELECT pg_temp.ok(pg_temp.rls_rows_as('0f0d0000-0000-4000-8000-000000000002') = 1,
  'SE-F.3 row-level security shows the owner the application');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SE0 — reproduction: the pre-fix functions serve a suspended employer'; END $$;
-- =========================================================================
SELECT pg_temp.moderate('suspended');
SAVEPOINT pre_fix;
\ir ../rollback/20270105090000_suspended_employer_applicant_reads_rollback.sql
SELECT pg_temp.ok(pg_temp.rls_rows_as('0f0d0000-0000-4000-8000-000000000002') = 0,
  'SE0.1 PRE-FIX: with E suspended, row-level security already hides the application');
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000002') = (SELECT val FROM seen WHERE label = 'owner_active'),
  'SE0.2 PRE-FIX: yet E''s owner still reads name and phone, assessments and the disclosure through the functions');
ROLLBACK TO SAVEPOINT pre_fix;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SE1 — a suspended employer reads nothing'; END $$;
-- =========================================================================
INSERT INTO seen VALUES ('access_before', (SELECT access_count::text FROM public.sp_disclosures WHERE id = '0f0d0000-6666-4000-8000-000000000001'));
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000002') = 'candidate:0,f|assessments:0|disclosure:none',
  'SE1.1 E''s owner reads no applicant, no assessment and no disclosure while E is suspended');
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000003') = 'candidate:0,f|assessments:0|disclosure:none',
  'SE1.2 neither does a plain member');
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000003') = pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000005'),
  'SE1.3 the answer is the one a non-member gets: "suspended" cannot be told from "not there"');
SELECT pg_temp.ok((SELECT access_count::text FROM public.sp_disclosures WHERE id = '0f0d0000-6666-4000-8000-000000000001')
                    = (SELECT val FROM seen WHERE label = 'access_before'),
  'SE1.4 the refused reads did not count as disclosure accesses');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SE2 — every other non-active status'; END $$;
-- =========================================================================
DO $$
DECLARE _s text;
BEGIN
  FOREACH _s IN ARRAY ARRAY['pending', 'rejected', 'archived', 'draft'] LOOP
    PERFORM pg_temp.force_status(_s);
    PERFORM pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000002') = 'candidate:0,f|assessments:0|disclosure:none',
      'SE2 an employer in status ' || _s || ' reads nothing');
  END LOOP;
END $$;

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SE3 — re-activation restores the reads; the applicant is unaffected'; END $$;
-- =========================================================================
SELECT pg_temp.force_status('suspended');
SELECT pg_temp.moderate('reactivated');
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000002') = (SELECT val FROM seen WHERE label = 'owner_active'),
  'SE3.1 once E is active again its owner reads all three as before');
SELECT pg_temp.moderate('suspended');
SELECT pg_temp.ok(pg_temp.rls_rows_as('0f0d0000-0000-4000-8000-000000000001') = 1,
  'SE3.2 the applicant still reads their own application while E is suspended');
SELECT pg_temp.moderate('reactivated');

-- =========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP SE4 — unchanged refusals'; END $$;
-- =========================================================================
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000005') = 'candidate:0,f|assessments:0|disclosure:none',
  'SE4.1 another employer''s owner reads nothing');
SELECT pg_temp.ok(pg_temp.reads_as('0f0d0000-0000-4000-8000-000000000004') = 'candidate:0,f|assessments:0|disclosure:none',
  'SE4.2 a suspended member of an active E reads nothing');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.scp_application_candidate(uuid)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.scp_application_assessments(uuid)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.sp_application_disclosure(uuid)', 'EXECUTE'),
  'SE4.3 anon cannot execute any of the three');

DO $$ BEGIN RAISE NOTICE 'ALL suspended_employer_applicant_reads assertions passed'; END $$;
ROLLBACK;
