-- 20261202090000 — one interview per intended start, through real sessions.
--
-- Proves: a start follows its SOURCE (the exact test assignment, a BESKT
-- assignment, or an explicitly chosen setup), never the application alone;
-- the case is bound to the application's own candidate account, never an
-- invented reference; the test must be the application's own and submitted;
-- a test sent without a setup needs an explicit choice, and a recorded setup
-- cannot be swapped; a retry returns the same case; TRUST and BESKT are
-- separate processes; another organisation can neither read nor reuse a
-- start; a cancelled case releases its start and is kept; and the rows can
-- only be written by the governed functions. The candidate answers the real
-- 50-item Väktare test through the ordinary save/submit functions.
-- Everything is synthetic and rolls back.

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

CREATE TEMP TABLE st (
  emp_a uuid, emp_b uuid, owner_a uuid, member_a uuid, owner_b uuid,
  cand_1 uuid, cand_2 uuid, job_a uuid, job_b uuid, app_1 uuid, app_2 uuid, app_b uuid,
  test_v uuid, assign_1 uuid, attempt_1 uuid, assign_2 uuid, attempt_2 uuid,
  pack_v uuid, case_t uuid, case_s uuid, case_s2 uuid, case_new uuid,
  bv uuid, bprof uuid, bhash text, bassign uuid, case_b uuid
) ON COMMIT DROP;
INSERT INTO st DEFAULT VALUES;
GRANT ALL ON st TO authenticated;

-- Calls the start as a principal and returns its jsonb.
CREATE FUNCTION pg_temp.start_as(_who uuid, _emp uuid, _app uuid, _kind text, _src uuid,
  _method text, _g text DEFAULT NULL, _r text DEFAULT NULL, _e text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE _res jsonb;
BEGIN
  PERFORM pg_temp.become(_who); SET LOCAL ROLE authenticated;
  _res := public.scp_iv_start_interview(_emp, _app, _kind, _src, (SELECT pack_v FROM st), _method, _g, _r, _e);
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _res;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $f$;

CREATE FUNCTION pg_temp.start_sql(_emp uuid, _app uuid, _kind text, _src uuid, _method text,
  _g text DEFAULT NULL, _r text DEFAULT NULL, _e text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $f$
  SELECT format('SELECT public.scp_iv_start_interview(%L, %L, %L, %L, %L, %L, %L, %L, %L)',
                _emp, _app, _kind, _src, (SELECT pack_v FROM st), _method, _g, _r, _e);
$f$;

-- The candidate answers every served item and submits, as themselves.
CREATE FUNCTION pg_temp.take_test(_who uuid, _attempt uuid) RETURNS integer
LANGUAGE plpgsql AS $f$
DECLARE _i record; _n integer := 0; _opts jsonb;
BEGIN
  PERFORM pg_temp.become(_who); SET LOCAL ROLE authenticated;
  FOR _i IN SELECT * FROM public.scp_get_attempt_items(_attempt, 'sv-SE') LOOP
    _opts := _i.options;
    IF _i.item_format = 'constructed_response' THEN
      PERFORM public.scp_save_response(_attempt, _i.item_version_id, NULL, NULL, NULL,
        'SYNTETISKT svar: jag kontaktar arbetsledaren och dokumenterar händelsen.');
    ELSIF _i.item_format = 'sjt_best_worst' THEN
      PERFORM public.scp_save_response(_attempt, _i.item_version_id, NULL,
        (_opts->0->>'option_id')::uuid, (_opts->(jsonb_array_length(_opts) - 1)->>'option_id')::uuid, NULL);
    ELSE
      PERFORM public.scp_save_response(_attempt, _i.item_version_id, (_opts->0->>'option_id')::uuid, NULL, NULL, NULL);
    END IF;
    _n := _n + 1;
  END LOOP;
  PERFORM public.scp_submit_attempt(_attempt);
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _n;
END $f$;

-- ---- setup ---------------------------------------------------------------
DO $setup$
DECLARE
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _emp_a uuid := 'b7000000-0000-4000-8000-0000000000e1';
  _emp_b uuid := 'b7000000-0000-4000-8000-0000000000e2';
  _owner_a uuid := 'b7000000-0000-4000-8000-0000000000d1';
  _member_a uuid := 'b7000000-0000-4000-8000-0000000000d2';
  _owner_b uuid := 'b7000000-0000-4000-8000-0000000000d3';
  _cand_1 uuid := 'b7000000-0000-4000-8000-0000000000c1';
  _cand_2 uuid := 'b7000000-0000-4000-8000-0000000000c2';
  _job_a uuid; _job_b uuid; _app_1 uuid; _app_2 uuid; _app_b uuid; _v uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_owner_a, 'st-owner-a@synthetic.test'), (_member_a, 'st-member-a@synthetic.test'),
    (_owner_b, 'st-owner-b@synthetic.test'),
    (_cand_1, 'st-cand-1@synthetic.test'), (_cand_2, 'st-cand-2@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status) VALUES
    (_emp_a, 'SYNTETISK Start AB', 'synthetic-st-a', 'active'),
    (_emp_b, 'SYNTETISK Annan AB', 'synthetic-st-b', 'active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
    (_emp_a, _owner_a, 'owner', 'active'), (_emp_a, _member_a, 'member', 'active'),
    (_emp_b, _owner_b, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           description_sv, requirements_sv, status, published_at, expires_at)
  VALUES ('st-job-a', 'STJOBA', _emp_a, 'internal', 'Väktare (syntetisk)', 'Security officer (synthetic)',
          'SYNTETISK annons: bevakning av kontor.', 'Väktarutbildning.',
          'published', now(), now() + interval '90 days') RETURNING id INTO _job_a;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('st-job-b', 'STJOBB', _emp_b, 'internal', 'Väktare B (syntetisk)', 'Security officer B (synthetic)',
          'published', now(), now() + interval '90 days') RETURNING id INTO _job_b;
  PERFORM pg_temp.nobody();
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a, _emp_a, _cand_1, now()) RETURNING id INTO _app_1;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a, _emp_a, _cand_2, now()) RETURNING id INTO _app_2;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_b, _emp_b, _cand_1, now()) RETURNING id INTO _app_b;

  SELECT av.id INTO _v FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.slug = 'security-officer-recruitment' ORDER BY av.version_number DESC LIMIT 1;

  UPDATE st SET emp_a = _emp_a, emp_b = _emp_b, owner_a = _owner_a, member_a = _member_a,
    owner_b = _owner_b, cand_1 = _cand_1, cand_2 = _cand_2, job_a = _job_a, job_b = _job_b,
    app_1 = _app_1, app_2 = _app_2, app_b = _app_b, test_v = _v;
END $setup$;

-- The guide is what the startable list offers this employer, read as its owner.
DO $pack$
DECLARE r st%ROWTYPE; _v uuid;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  SELECT s.pack_version_id INTO _v FROM public.scp_iv_startable_pack_versions(r.emp_a) s LIMIT 1;
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE st SET pack_v = _v;
  PERFORM pg_temp.ok(_v IS NOT NULL AND r.test_v IS NOT NULL,
    'ST0.1 the employer has a startable guide and the Väktare test exists');
END $pack$;

-- The test is sent to each applicant through the ordinary assignment.
DO $assign$
DECLARE r st%ROWTYPE; _a record; _b record;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  SELECT * INTO _a FROM public.scp_employer_assign(r.emp_a, r.test_v, 'st-cand-1@synthetic.test',
    NULL, 'sv', 'recruitment', NULL, NULL, r.app_1, r.job_a);
  SELECT * INTO _b FROM public.scp_employer_assign(r.emp_a, r.test_v, 'st-cand-2@synthetic.test',
    NULL, 'sv', 'recruitment', NULL, NULL, r.app_2, r.job_a);
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE st SET assign_1 = _a.assignment_id, attempt_1 = _a.attempt_id,
                assign_2 = _b.assignment_id, attempt_2 = _b.attempt_id;
  PERFORM pg_temp.ok(_a.assignment_id IS NOT NULL AND _b.assignment_id IS NOT NULL
    AND (SELECT application_id FROM public.assessment_assignments WHERE id = _a.assignment_id) = r.app_1,
    'ST0.2 the Väktare test is assigned to each application through scp_employer_assign');
END $assign$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST1 — a start needs a completed test and a setup'; END $$;

DO $$
DECLARE r st%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust', 'operational', 'vaktare', 'general'),
    'SCP_START_TEST_NOT_COMPLETE', 'ST1.1 an unsubmitted test cannot start an interview');
  _n := pg_temp.take_test(r.cand_1, r.attempt_1);
  PERFORM pg_temp.ok(_n = 50 AND (SELECT status FROM public.scp_attempts WHERE id = r.attempt_1) IN ('submitted', 'scored'),
    'ST1.2 the candidate answers all 50 items and submits through the ordinary functions');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust'),
    'SCP_START_SETUP_REQUIRED', 'ST1.3 a test sent without a setup needs an explicit choice -- nothing is guessed');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_interview_cases WHERE application_id = r.app_1),
    'ST1.4 and a refused start leaves no case behind');
  PERFORM pg_temp.must_fail_as('authenticated', r.member_a,
    format('SELECT public.scp_record_assessment_setup(%L, %L, %L, %L, %L)',
           r.emp_a, r.assign_1, 'operational', 'vaktare', 'general'),
    'SCP_SETUP_NOT_PERMITTED', 'ST1.5 a plain member cannot record the setup a test was sent with');
  PERFORM pg_temp.as_user('authenticated', r.owner_a,
    format('SELECT public.scp_record_assessment_setup(%L, %L, %L, %L, %L)',
           r.emp_a, r.assign_1, 'operational', 'vaktare', 'general'));
  PERFORM pg_temp.as_user('authenticated', r.owner_a,
    format('SELECT public.scp_record_assessment_setup(%L, %L, %L, %L, %L)',
           r.emp_a, r.assign_1, 'operational', 'vaktare', 'general'));
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_assessment_setups WHERE assessment_assignment_id = r.assign_1) = 1,
    'ST1.6 the owner records it once; a repeat changes nothing');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    format('SELECT public.scp_record_assessment_setup(%L, %L, %L, %L, %L)',
           r.emp_a, r.assign_1, 'operational', 'vaktare', 'hospital'),
    'SCP_SETUP_ALREADY_RECORDED', 'ST1.7 a recorded setup cannot be swapped');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust', 'operational', 'vaktare', 'hospital'),
    'SCP_SETUP_ALREADY_RECORDED', 'ST1.8 nor overridden at the start by the caller');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST2 — the start from the test'; END $$;

DO $$
DECLARE r st%ROWTYPE; _res jsonb; _again jsonb; _c public.scp_interview_cases%ROWTYPE; _s public.scp_recruitment_setups%ROWTYPE;
BEGIN
  SELECT * INTO r FROM st;
  _res := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust');
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = (_res ->> 'case_id')::uuid;
  UPDATE st SET case_t = _c.id;
  PERFORM pg_temp.ok((_res ->> 'created')::boolean AND _c.application_id = r.app_1 AND _c.job_id = r.job_a
                     AND _c.employer_id = r.emp_a AND _c.pack_version_id = r.pack_v,
    'ST2.1 the start creates ONE case for this application, its job and the resolved guide');
  PERFORM pg_temp.ok(_c.candidate_user_id = r.cand_1 AND _c.candidate_external_ref IS NULL,
    'ST2.2 bound to the applicant''s own account -- no invented external reference');
  SELECT * INTO _s FROM public.scp_recruitment_setups WHERE interview_case_id = _c.id;
  PERFORM pg_temp.ok((_s.method, _s.role_group, _s.role_profile, _s.environment) = ('trust', 'operational', 'vaktare', 'general')
                     AND (_res ->> 'setup_recorded')::boolean
                     AND (_res ->> 'role_profile') = 'vaktare' AND (_res ->> 'environment') = 'general',
    'ST2.3 the case carries the setup the TEST was sent with');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.scp_interview_case_sources
                              WHERE case_id = _c.id AND source_kind = 'job_description')
                     AND (_res ->> 'material')::integer = (SELECT count(*) FROM public.scp_interview_case_sources WHERE case_id = _c.id),
    'ST2.4 its non-personal material is seeded in the same transaction, and counted from the rows');
  PERFORM pg_temp.ok((SELECT source_kind = 'assessment_assignment' AND source_id = r.assign_1
                             AND start_key = 'assessment:' || r.assign_1 AND application_id = r.app_1
                        FROM public.scp_interview_starts WHERE interview_case_id = _c.id),
    'ST2.5 the start records exactly which test it came from');

  _again := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust');
  PERFORM pg_temp.ok((_again ->> 'case_id')::uuid = _c.id AND NOT (_again ->> 'created')::boolean
                     AND (SELECT count(*) FROM public.scp_interview_cases WHERE application_id = r.app_1) = 1
                     AND (SELECT count(*) FROM public.scp_interview_starts WHERE application_id = r.app_1) = 1,
    'ST2.6 a retry (a lost response, a second tab) returns the same case and creates nothing');
  _again := pg_temp.start_as(r.member_a, r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust');
  PERFORM pg_temp.ok((_again ->> 'case_id')::uuid = _c.id,
    'ST2.7 a colleague of the same organisation reaches the same case');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST3 — sources are verified, not trusted'; END $$;

DO $$
DECLARE r st%ROWTYPE;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'assessment_assignment', r.assign_1, 'trust'),
    'SCP_START_SOURCE_MISMATCH', 'ST3.1 one candidate''s test cannot start another candidate''s interview');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'assessment_assignment', r.assign_2, 'trust', 'operational', 'vaktare', 'general'),
    'SCP_START_TEST_NOT_COMPLETE', 'ST3.2 the second candidate''s unsubmitted test starts nothing');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_b,
    pg_temp.start_sql(r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust'),
    'SCP_START_NOT_FOUND', 'ST3.3 another organisation can neither reuse nor learn of the start');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_b,
    pg_temp.start_sql(r.emp_b, r.app_b, 'assessment_assignment', r.assign_1, 'trust'),
    'SCP_START_SOURCE_MISMATCH', 'ST3.4 nor carry this organisation''s test into its own application of the same person');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'beskt'),
    'SCP_START_INVALID', 'ST3.5 a TRUST test cannot start a BESKT process');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'chosen_setup', NULL, 'beskt', 'operational', 'vaktare', 'general'),
    'SCP_START_INVALID', 'ST3.6 a BESKT process starts only from its own assignment');
  PERFORM pg_temp.must_fail_as('authenticated', r.cand_1,
    pg_temp.start_sql(r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust'),
    'SCP_START_NOT_FOUND', 'ST3.7 the candidate cannot start or read the employer''s interview');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST4 — an interview before any test, from a chosen setup'; END $$;

DO $$
DECLARE r st%ROWTYPE; _a jsonb; _b jsonb; _c jsonb;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust'),
    'SCP_START_SETUP_REQUIRED', 'ST4.1 without a chosen setup nothing is started -- no silent Väktare');
  _a := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general');
  _b := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general');
  -- A second, isolated fixture setup: another role and environment route to
  -- their own start and carry their own setup.
  _c := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'strategic', 'fixture_manager', 'hospital');
  UPDATE st SET case_s = (_a ->> 'case_id')::uuid, case_s2 = (_c ->> 'case_id')::uuid;
  PERFORM pg_temp.ok((_a ->> 'created')::boolean AND (_b ->> 'case_id') = (_a ->> 'case_id') AND NOT (_b ->> 'created')::boolean,
    'ST4.2 a chosen setup starts one case; the same choice again returns it');
  PERFORM pg_temp.ok((_c ->> 'case_id') <> (_a ->> 'case_id')
                     AND (SELECT (role_group, role_profile, environment) = ('strategic', 'fixture_manager', 'hospital')
                            FROM public.scp_recruitment_setups WHERE interview_case_id = (_c ->> 'case_id')::uuid)
                     AND (SELECT (role_group, role_profile, environment) = ('operational', 'vaktare', 'general')
                            FROM public.scp_recruitment_setups WHERE interview_case_id = (_a ->> 'case_id')::uuid),
    'ST4.3 a different setup is a different process, with its own case and its own recorded setup');
  PERFORM pg_temp.ok((SELECT bool_and(candidate_user_id = r.cand_2 AND candidate_external_ref IS NULL)
                        FROM public.scp_interview_cases WHERE application_id = r.app_2),
    'ST4.4 both are bound to the second applicant''s own account');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_cases WHERE application_id = r.app_1) = 1,
    'ST4.5 and the first application still has exactly its one case');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST5 — TRUST and BESKT stay apart'; END $$;

DO $$
DECLARE r st%ROWTYPE; _v uuid; _res jsonb; _b jsonb; _again jsonb; _trust jsonb;
BEGIN
  SELECT * INTO r FROM st;
  _v := pg_temp.build_method('synthetic-st-recruitment', 'recruitment_support', _store => false);
  PERFORM pg_temp.submit(_v); PERFORM pg_temp.approve_all(_v); PERFORM pg_temp.publish(_v);
  UPDATE st SET bv = _v,
    bprof = (SELECT id FROM public.beskt_exposure_profiles WHERE method_version_id = _v AND profile_key = 'lone_working'),
    bhash = (SELECT content_hash FROM public.beskt_method_versions WHERE id = _v);
  SELECT * INTO r FROM st;
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_start_beskt(gen_random_uuid(), r.app_1, 'recruitment_support', r.bv, r.bprof, r.bhash,
    r.owner_a, 'Kontakt: rekryteraren, 08-000 00 00');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE st SET bassign = (_res ->> 'assignment_id')::uuid;
  SELECT * INTO r FROM st;

  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt'),
    'SCP_START_SETUP_REQUIRED', 'ST5.1 a BESKT assignment without a setup needs an explicit choice');
  PERFORM pg_temp.as_user('authenticated', r.owner_a,
    format('SELECT public.scp_record_recruitment_setup(%L, %L, %L, %L, %L, NULL, %L)',
           r.emp_a, 'beskt', 'operational', 'vaktare', 'general', r.bassign));
  _b := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt');
  _again := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt');
  _trust := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust');
  UPDATE st SET case_b = (_b ->> 'case_id')::uuid;
  PERFORM pg_temp.ok((_b ->> 'created')::boolean AND (_again ->> 'case_id') = (_b ->> 'case_id')
                     AND (_b ->> 'case_id')::uuid <> r.case_t AND (_trust ->> 'case_id')::uuid = r.case_t,
    'ST5.2 the BESKT start has its own case; neither process ever returns the other''s');
  PERFORM pg_temp.ok((SELECT beskt_assignment_id = r.bassign AND method = 'beskt'
                        FROM public.scp_recruitment_setups WHERE interview_case_id = (_b ->> 'case_id')::uuid)
                     AND (SELECT candidate_user_id FROM public.scp_interview_cases WHERE id = (_b ->> 'case_id')::uuid) = r.cand_1,
    'ST5.3 the BESKT case carries its assignment''s setup and the same candidate account');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'beskt_assignment', r.bassign, 'beskt'),
    'SCP_START_SOURCE_MISMATCH', 'ST5.4 a BESKT assignment cannot start another application''s interview');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST6 — lifecycle: cancelled releases, history stays'; END $$;

DO $$
DECLARE r st%ROWTYPE; _res jsonb;
BEGIN
  SELECT * INTO r FROM st;
  -- Cases have no cancel function yet; a cancelled case is set up the way
  -- one would exist, with replication-role triggers off for this one row.
  SET LOCAL session_replication_role = replica;
  UPDATE public.scp_interview_cases SET cancelled_at = now() WHERE id = r.case_s;
  SET LOCAL session_replication_role = origin;
  _res := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general');
  UPDATE st SET case_new = (_res ->> 'case_id')::uuid;
  PERFORM pg_temp.ok((_res ->> 'created')::boolean AND (_res ->> 'case_id')::uuid <> r.case_s,
    'ST6.1 a cancelled case releases its start: the next start creates a new case');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.scp_interview_cases WHERE id = r.case_s)
                     AND (SELECT superseded_reason FROM public.scp_interview_starts WHERE interview_case_id = r.case_s) = 'case_cancelled'
                     AND (SELECT count(*) FROM public.scp_interview_starts
                           WHERE employer_id = r.emp_a AND start_key LIKE 'setup:' || r.app_2 || ':trust:operational:vaktare:general'
                             AND superseded_at IS NULL) = 1,
    'ST6.2 the cancelled case and its start are kept, marked superseded; one live start remains');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST7 — only the governed functions write, and reads follow the case'; END $$;

DO $$
DECLARE r st%ROWTYPE; _n integer;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    format('INSERT INTO public.scp_interview_starts (employer_id, application_id, start_key, source_kind, interview_case_id, created_by) VALUES (%L, %L, %L, %L, %L, %L)',
           r.emp_a, r.app_1, 'setup:x', 'chosen_setup', r.case_t, r.owner_a),
    'permission denied', 'ST7.1 an employer cannot write a start row directly');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_starts SET application_id = %L WHERE interview_case_id = %L', r.app_2, r.case_t),
    'SCP_START_UNGOVERNED_WRITE', 'ST7.2 even the owner of the table cannot rewrite a start outside the functions');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.scp_assessment_setups WHERE assessment_assignment_id = %L', r.assign_1),
    'SCP_START_UNGOVERNED_WRITE', 'ST7.3 nor delete the setup a test was sent with');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    format('SELECT public.scp_iv_start_result(%L, false, %L, %L, %L, %L)', r.case_t, 'trust', 'operational', 'vaktare', 'general'),
    'permission denied', 'ST7.4 the internal result helper is not callable');

  PERFORM pg_temp.become(r.owner_b); SET LOCAL ROLE authenticated;
  SELECT (SELECT count(*) FROM public.scp_interview_starts WHERE employer_id = r.emp_a)
       + (SELECT count(*) FROM public.scp_assessment_setups WHERE employer_id = r.emp_a) INTO _n;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'ST7.5 another organisation reads none of this organisation''s starts or setups');
  PERFORM pg_temp.become(r.cand_1); SET LOCAL ROLE authenticated;
  SELECT (SELECT count(*) FROM public.scp_interview_starts)
       + (SELECT count(*) FROM public.scp_assessment_setups) INTO _n;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = 0, 'ST7.6 the candidate reads none of them');
  PERFORM pg_temp.become(r.member_a); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.scp_interview_starts WHERE employer_id = r.emp_a;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_n = (SELECT count(*) FROM public.scp_interview_starts WHERE employer_id = r.emp_a) AND _n >= 5,
    'ST7.7 a colleague reads every start whose case they may read');
END $$;

ROLLBACK;
