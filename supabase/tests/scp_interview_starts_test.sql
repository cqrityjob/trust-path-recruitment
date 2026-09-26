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
-- only be written by the governed functions. The DATABASE verifies the setup,
-- the test and the guide against scp_recruitment_content_links: two genuinely
-- different guides route to their own setups, and every crossed combination
-- is refused before a single row is written. BESKT starts from an application
-- and from an accepted standalone invitation are atomic with their governed
-- link -- a forced failure rolls all of it back -- and a security vetting's
-- case is the security function's from its first moment. The candidate answers the real
-- 50-item Väktare test through the ordinary save/submit functions.
-- Requires 20261203090000 (the case row's security-function policy) as well:
-- ST10 reads the vetting case row directly.
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
  bv uuid, bprof uuid, bhash text, bassign uuid, case_b uuid,
  syn_pack_v uuid, invitee uuid, inv_assign uuid, officer uuid, vet_assign uuid
) ON COMMIT DROP;
INSERT INTO st DEFAULT VALUES;
GRANT ALL ON st TO authenticated;

-- Calls the start as a principal and returns its jsonb. The guide version
-- is NULL unless named: the database derives it from the setup.
CREATE FUNCTION pg_temp.start_as(_who uuid, _emp uuid, _app uuid, _kind text, _src uuid,
  _method text, _g text DEFAULT NULL, _r text DEFAULT NULL, _e text DEFAULT NULL,
  _pack uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE _res jsonb;
BEGIN
  PERFORM pg_temp.become(_who); SET LOCAL ROLE authenticated;
  _res := public.scp_iv_start_interview(_emp, _app, _kind, _src, _method, _pack, _g, _r, _e);
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _res;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $f$;

CREATE FUNCTION pg_temp.start_sql(_emp uuid, _app uuid, _kind text, _src uuid, _method text,
  _g text DEFAULT NULL, _r text DEFAULT NULL, _e text DEFAULT NULL, _pack uuid DEFAULT NULL) RETURNS text
LANGUAGE sql AS $f$
  SELECT format('SELECT public.scp_iv_start_interview(%L, %L, %L, %L, %L, %L, %L, %L, %L)',
                _emp, _app, _kind, _src, _method, _pack, _g, _r, _e);
$f$;

-- Everything a start could write, counted: a refused start must leave it equal.
CREATE FUNCTION pg_temp.world() RETURNS text LANGUAGE sql AS $f$
  SELECT format('%s/%s/%s/%s/%s/%s',
    (SELECT count(*) FROM public.scp_interview_cases),
    (SELECT count(*) FROM public.scp_interview_starts),
    (SELECT count(*) FROM public.scp_recruitment_setups),
    (SELECT count(*) FROM public.scp_assessment_setups),
    (SELECT count(*) FROM public.bcp_case_links),
    (SELECT count(*) FROM public.scp_interview_case_sources));
$f$;

-- A candidate prepares for BESKT the ordinary way: acknowledge the notice,
-- answer everything (first option for a choice) until routing settles, submit.
CREATE FUNCTION pg_temp.fill(_assignment uuid) RETURNS void LANGUAGE plpgsql AS $fill$
DECLARE _doc jsonb; _entries jsonb; _round integer := 0;
BEGIN
  LOOP
    _round := _round + 1;
    IF _round > 20 THEN RAISE EXCEPTION 'ST: the preparation never settled.'; END IF;
    SELECT d INTO _doc FROM public.bcp_candidate_preparation(_assignment) d;
    SELECT jsonb_agg(jsonb_build_object(
             'item_key', it ->> 'item_key', 'response_state', 'answered',
             'value_text', CASE WHEN it ->> 'answer_type' IN ('short_text', 'long_text')
               THEN to_jsonb('SYNTETISKT svar.'::text) END,
             'value_boolean', CASE WHEN it ->> 'answer_type' IN ('boolean', 'acknowledgement')
               THEN to_jsonb(true) END,
             'value_date', CASE WHEN it ->> 'answer_type' = 'date' THEN to_jsonb(current_date - 30) END,
             'option_keys', CASE WHEN it ->> 'answer_type' IN ('single_choice', 'multi_choice')
               THEN jsonb_build_array(it -> 'options' -> 0 ->> 'option_key') ELSE '[]'::jsonb END)
           ORDER BY (it ->> 'sequence_position')::integer)
      INTO _entries
      FROM jsonb_array_elements(_doc -> 'items') it
     WHERE it -> 'answer' IS NULL OR jsonb_typeof(it -> 'answer') = 'null';
    EXIT WHEN _entries IS NULL OR jsonb_array_length(_entries) = 0;
    PERFORM public.bcp_save_answers(gen_random_uuid(), _assignment,
      (_doc -> 'response' ->> 'revision')::integer, _entries);
  END LOOP;
END $fill$;

CREATE FUNCTION pg_temp.submit_prep(_who uuid, _assignment uuid) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE _version text := (SELECT notice_version FROM public.bcp_assignments WHERE id = _assignment);
BEGIN
  PERFORM pg_temp.become(_who); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), _assignment, _version,
    public.bcp_notice_hash(_assignment, 'sv-SE'), 'sv-SE');
  PERFORM pg_temp.fill(_assignment);
  PERFORM public.bcp_submit(gen_random_uuid(), _assignment,
    (SELECT (d -> 'response' ->> 'revision')::integer FROM public.bcp_candidate_preparation(_assignment) d));
  RESET ROLE; PERFORM pg_temp.nobody();
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $f$;

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
    (_cand_1, 'st-cand-1@synthetic.test'), (_cand_2, 'st-cand-2@synthetic.test'),
    ('b7000000-0000-4000-8000-0000000000c3', 'st-invitee@synthetic.test'),
    ('b7000000-0000-4000-8000-0000000000a1', 'st-officer@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status) VALUES
    (_emp_a, 'SYNTETISK Start AB', 'synthetic-st-a', 'active'),
    (_emp_b, 'SYNTETISK Annan AB', 'synthetic-st-b', 'active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
    (_emp_a, _owner_a, 'owner', 'active'), (_emp_a, _member_a, 'member', 'active'),
    (_emp_a, 'b7000000-0000-4000-8000-0000000000a1', 'member', 'active'),
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
    app_1 = _app_1, app_2 = _app_2, app_b = _app_b, test_v = _v,
    invitee = 'b7000000-0000-4000-8000-0000000000c3', officer = 'b7000000-0000-4000-8000-0000000000a1';
END $setup$;

-- The guide is what the startable list offers this employer, read as its owner.
DO $pack$
DECLARE r st%ROWTYPE; _v uuid;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  SELECT s.pack_version_id INTO _v FROM public.scp_iv_startable_pack_versions(r.emp_a) s
    JOIN public.scp_interview_pack_versions v ON v.id = s.pack_version_id
    JOIN public.scp_recruitment_content_links l ON l.interview_pack_id = v.pack_id
   WHERE l.role_profile = 'vaktare' AND l.environment = 'general'
   ORDER BY v.version_number DESC LIMIT 1;
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE st SET pack_v = _v;
  PERFORM pg_temp.ok(_v IS NOT NULL AND r.test_v IS NOT NULL,
    'ST0.1 the employer can start the guide the Väktare setup links to, and the Väktare test exists');
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


DO $$ BEGIN RAISE NOTICE 'GROUP ST4 — each setup gets its own guide'; END $$;

-- A second, genuinely different guide: a synthetic strategic role with its
-- own role-interview guide, linked for the hospital environment only.
DO $syn$
DECLARE r st%ROWTYPE;
BEGIN
  SELECT * INTO r FROM st;
  INSERT INTO public.scp_roles (id, slug, profession_id)
  SELECT 'b7100000-0000-4000-8000-000000000001', 'synthetic-st-manager-role', ro.profession_id
    FROM public.scp_roles ro JOIN public.scp_interview_packs p ON p.role_id = ro.id WHERE p.slug = 'vaktare-se';
  INSERT INTO public.scp_interview_packs (id, slug, role_id, name_sv, name_en, purpose_sv, pack_kind)
  VALUES ('b7100000-0000-4000-8000-000000000002', 'synthetic-st-manager-guide',
          'b7100000-0000-4000-8000-000000000001', 'SYNTETISK chefsguide', 'Synthetic manager guide',
          'SYNTETISK guide för en strategisk roll.', 'role_interview');
  INSERT INTO public.scp_interview_pack_versions
    (id, pack_id, version_number, content_status, validation_label, locale, role_version_id,
     source_reference, source_document_version, content_hash, summary_sv, pilot_availability)
  SELECT 'b7100000-0000-4000-8000-000000000003', 'b7100000-0000-4000-8000-000000000002', 1,
         v.content_status, v.validation_label, v.locale, v.role_version_id, 'SYNTETISK',
         v.source_document_version, md5('st-manager') || md5('guide'), 'SYNTETISK', v.pilot_availability
    FROM public.scp_interview_pack_versions v WHERE v.id = r.pack_v;
  INSERT INTO public.scp_recruitment_role_profiles (role_profile, role_group, role_id)
  VALUES ('fixture_manager', 'strategic', 'b7100000-0000-4000-8000-000000000001');
  INSERT INTO public.scp_recruitment_content_links (role_profile, environment, interview_pack_id, assessment_definition_id)
  VALUES ('fixture_manager', 'hospital', 'b7100000-0000-4000-8000-000000000002', NULL);
  UPDATE st SET syn_pack_v = 'b7100000-0000-4000-8000-000000000003';

  PERFORM pg_temp.must_fail(
    format('INSERT INTO public.scp_recruitment_content_links (role_profile, environment, interview_pack_id) VALUES (%L, %L, %L)',
           'fixture_manager', 'general', (SELECT pack_id FROM public.scp_interview_pack_versions WHERE id = r.pack_v)),
    'SCP_CONTENT_LINK_INCONSISTENT', 'ST4.0 a guide of another role cannot be linked to a role profile');
END $syn$;

DO $$
DECLARE r st%ROWTYPE; _a jsonb; _b jsonb; _c jsonb;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust'),
    'SCP_START_SETUP_REQUIRED', 'ST4.1 without a chosen setup nothing is started -- no silent Väktare');
  _a := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general');
  _b := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general');
  _c := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'strategic', 'fixture_manager', 'hospital');
  UPDATE st SET case_s = (_a ->> 'case_id')::uuid, case_s2 = (_c ->> 'case_id')::uuid;
  PERFORM pg_temp.ok((_a ->> 'created')::boolean AND (_b ->> 'case_id') = (_a ->> 'case_id') AND NOT (_b ->> 'created')::boolean,
    'ST4.2 a chosen setup starts one case; the same choice again returns it');
  PERFORM pg_temp.ok(
    (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = (_a ->> 'case_id')::uuid) = r.pack_v
    AND (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = (_c ->> 'case_id')::uuid) = r.syn_pack_v
    AND r.pack_v <> r.syn_pack_v,
    'ST4.3 each setup gets its OWN guide: Väktare the Väktare guide, the strategic role its own -- derived by the database');
  PERFORM pg_temp.ok((SELECT (role_group, role_profile, environment) = ('strategic', 'fixture_manager', 'hospital')
                        FROM public.scp_recruitment_setups WHERE interview_case_id = (_c ->> 'case_id')::uuid)
                     AND (SELECT (role_group, role_profile, environment) = ('operational', 'vaktare', 'general')
                            FROM public.scp_recruitment_setups WHERE interview_case_id = (_a ->> 'case_id')::uuid),
    'ST4.4 and each case records the setup it was started with');
  PERFORM pg_temp.ok((SELECT bool_and(candidate_user_id = r.cand_2 AND candidate_external_ref IS NULL)
                        FROM public.scp_interview_cases WHERE application_id = r.app_2),
    'ST4.5 both are bound to the second applicant''s own account');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.scp_interview_cases WHERE application_id = r.app_1) = 1,
    'ST4.6 and the first application still has exactly its one case');
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ok(
    (SELECT array_agg(role_profile || ':' || environment) FROM public.scp_iv_start_choices(r.emp_a, r.assign_1))
      = ARRAY['vaktare:general']
    -- Before any test, every setup whose guide is startable: the fixture's,
    -- the operational Väktare setup, and -- since 20261217090000 opened the
    -- Säkerhetschef guide for pilot -- the strategic security_manager setup.
    AND (SELECT array_agg(role_profile || ':' || environment ORDER BY role_profile) FROM public.scp_iv_start_choices(r.emp_a))
      = ARRAY['fixture_manager:hospital', 'security_manager:general', 'vaktare:general'],
    'ST4.7 the choices after the Väktare test are only the setups built on it; before any test, every setup with content');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(r.owner_b); SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.scp_iv_start_choices(r.emp_a)),
    'ST4.8 another organisation is offered nothing of this one');
  RESET ROLE; PERFORM pg_temp.nobody();
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST8 — crossed test, role, method and guide combinations are refused before any write'; END $$;

DO $$
DECLARE r st%ROWTYPE; _before text; _res jsonb;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.take_test(r.cand_2, r.attempt_2);
  _before := pg_temp.world();
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'assessment_assignment', r.assign_2, 'trust', 'strategic', 'fixture_manager', 'hospital'),
    'SCP_START_TEST_MISMATCH', 'ST8.1 a Väktare test cannot be relabelled as another role''s test');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'strategic', 'vaktare', 'general'),
    'SCP_START_SETUP_INCOMPATIBLE', 'ST8.2 a role profile outside its role group is refused');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'nobody_role', 'general'),
    'SCP_START_SETUP_INCOMPATIBLE', 'ST8.3 an unknown role profile is refused');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'hospital'),
    'SCP_START_NO_CONTENT', 'ST8.4 an environment without content of its own is refused, not decorated');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general', r.syn_pack_v),
    'SCP_START_GUIDE_MISMATCH', 'ST8.5 a guide the employer may start is still not the Väktare setup''s guide');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', 'strategic', 'fixture_manager', 'hospital', r.pack_v),
    'SCP_START_GUIDE_MISMATCH', 'ST8.6 nor is the Väktare guide the strategic role''s');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'assessment_assignment', r.assign_2, 'beskt', 'operational', 'vaktare', 'general'),
    'SCP_START_INVALID', 'ST8.7 a TRUST test cannot be carried into the BESKT method');
  PERFORM pg_temp.ok(pg_temp.world() = _before
                     AND NOT EXISTS (SELECT 1 FROM public.scp_assessment_setups WHERE assessment_assignment_id = r.assign_2),
    'ST8.8 every refused start left zero new cases, setups, starts, links and sources behind');
  _res := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'assessment_assignment', r.assign_2, 'trust', 'operational', 'vaktare', 'general');
  PERFORM pg_temp.ok((_res ->> 'created')::boolean
                     AND (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = (_res ->> 'case_id')::uuid) = r.pack_v
                     AND EXISTS (SELECT 1 FROM public.scp_assessment_setups WHERE assessment_assignment_id = r.assign_2 AND role_profile = 'vaktare'),
    'ST8.9 the compatible choice starts, with the Väktare guide, and records the test''s setup');
  _res := pg_temp.start_as(r.owner_a, r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', NULL, NULL, NULL, r.pack_v);
  PERFORM pg_temp.ok((_res ->> 'case_id')::uuid = r.case_s AND NOT (_res ->> 'created')::boolean
                     AND _res ->> 'role_profile' = 'vaktare' AND _res ->> 'environment' = 'general',
    'ST8.10 naming only the Väktare guide derives its one setup, and reaches the same start');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'chosen_setup', NULL, 'trust', NULL, NULL, NULL, r.syn_pack_v),
    'SCP_START_SETUP_REQUIRED', 'ST8.11 a guide with no general-environment link names no setup: the choice stays the employer''s');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST5 — BESKT from an application: atomic, linked, apart from TRUST'; END $$;

DO $$
DECLARE r st%ROWTYPE; _v uuid; _res jsonb;
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
END $$;

DO $$
DECLARE r st%ROWTYPE; _before text;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt'),
    'SCP_START_SETUP_REQUIRED', 'ST5.1 a BESKT assignment without a setup needs an explicit choice');
  PERFORM pg_temp.as_user('authenticated', r.owner_a,
    format('SELECT public.scp_record_recruitment_setup(%L, %L, %L, %L, %L, NULL, %L)',
           r.emp_a, 'beskt', 'operational', 'vaktare', 'general', r.bassign));
  _before := pg_temp.world();
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt'),
    'SCP_START_BESKT_NOT_SUBMITTED', 'ST5.2 a preparation the candidate has not submitted starts no interview');
  PERFORM pg_temp.ok(pg_temp.world() = _before, 'ST5.3 and leaves nothing behind');
  PERFORM pg_temp.submit_prep(r.cand_1, r.bassign);
  PERFORM pg_temp.ok((SELECT lifecycle_state FROM public.bcp_assignments WHERE id = r.bassign) = 'submitted',
    'ST5.4 the candidate submits the preparation through the ordinary functions');
END $$;

-- A failure at the very last step of the start must take everything with it.
DO $$
DECLARE r st%ROWTYPE; _before text;
BEGIN
  SELECT * INTO r FROM st;
  CREATE FUNCTION public.st_forced_link_failure() RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN RAISE EXCEPTION 'ST_FORCED_FAILURE: the link write fails on purpose'; END $t$;
  CREATE TRIGGER st_forced_link_failure BEFORE INSERT ON public.bcp_case_links
    FOR EACH ROW EXECUTE FUNCTION public.st_forced_link_failure();
  _before := pg_temp.world();
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt'),
    'ST_FORCED_FAILURE', 'ST5.5 a failure while the BESKT link is written fails the start');
  PERFORM pg_temp.ok(pg_temp.world() = _before,
    'ST5.6 and rolls ALL of it back: no case, setup, material, link or start row remains');
  DROP TRIGGER st_forced_link_failure ON public.bcp_case_links;
  DROP FUNCTION public.st_forced_link_failure();
END $$;

DO $$
DECLARE r st%ROWTYPE; _b jsonb; _again jsonb; _trust jsonb; _l public.bcp_case_links%ROWTYPE;
BEGIN
  SELECT * INTO r FROM st;
  _b := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt');
  _again := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'beskt_assignment', r.bassign, 'beskt');
  _trust := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust');
  UPDATE st SET case_b = (_b ->> 'case_id')::uuid;
  PERFORM pg_temp.ok((_b ->> 'created')::boolean AND (_again ->> 'case_id') = (_b ->> 'case_id')
                     AND NOT (_again ->> 'created')::boolean
                     AND (_b ->> 'case_id')::uuid <> r.case_t AND (_trust ->> 'case_id')::uuid = r.case_t,
    'ST5.7 the BESKT start has its own case, a retry returns it, and neither method ever returns the other''s');
  SELECT * INTO _l FROM public.bcp_case_links WHERE case_id = (_b ->> 'case_id')::uuid AND unlinked_at IS NULL;
  PERFORM pg_temp.ok(_l.assignment_id = r.bassign AND _l.bound_method_version_id = r.bv
                     AND _l.bound_content_hash = r.bhash AND _l.candidate_user_id = r.cand_1,
    'ST5.8 the case is created WITH its governed link, bound to the assignment''s method version and content');
  PERFORM pg_temp.ok((SELECT candidate_user_id = r.cand_1 AND application_id = r.app_1
                        FROM public.scp_interview_cases WHERE id = (_b ->> 'case_id')::uuid)
                     AND (SELECT method = 'beskt' AND beskt_assignment_id = r.bassign
                            FROM public.scp_recruitment_setups WHERE interview_case_id = (_b ->> 'case_id')::uuid)
                     AND (SELECT count(*) FROM public.bcp_case_links WHERE assignment_id = r.bassign AND unlinked_at IS NULL) = 1
                     AND (SELECT count(*) FROM public.scp_interview_starts WHERE start_key = 'beskt:' || r.bassign) = 1,
    'ST5.9 the assignment''s candidate, setup and one link and one start -- the retry added nothing');
  PERFORM pg_temp.ok((SELECT content_text IS NULL FROM public.scp_interview_case_sources
                       WHERE case_id = (_b ->> 'case_id')::uuid AND source_kind = 'beskt_preparation')
                     AND NOT EXISTS (SELECT 1 FROM public.scp_interview_case_sources
                                      WHERE case_id = (_b ->> 'case_id')::uuid
                                        AND source_kind NOT IN ('employer_requirements', 'job_description', 'beskt_preparation')),
    'ST5.10 the preparation reaches the case as a pointer; no answer is copied into the case material');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'beskt_assignment', r.bassign, 'beskt'),
    'SCP_START_SOURCE_MISMATCH', 'ST5.11 a BESKT assignment cannot start another application''s interview');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST9 — BESKT from an accepted standalone invitation'; END $$;

DO $$
DECLARE r st%ROWTYPE; _res jsonb; _acc jsonb;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_create_invitation(gen_random_uuid(), r.emp_a, 'st-invitee@synthetic.test', 'SYNTETISK Inbjuden',
    'Larmoperatör (syntetisk)', 'recruitment_support', r.bv, r.bprof, r.bhash, r.owner_a, 'Kontakt: HR, hr@synthetic.test');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = r.invitee;
  PERFORM pg_temp.become(r.invitee); SET LOCAL ROLE authenticated;
  _acc := public.bcp_accept_invitation(gen_random_uuid(), _res ->> 'token');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE st SET inv_assign = (_acc ->> 'assignment_id')::uuid;
  PERFORM pg_temp.submit_prep(r.invitee, (_acc ->> 'assignment_id')::uuid);
  PERFORM pg_temp.as_user('authenticated', r.owner_a,
    format('SELECT public.scp_record_recruitment_setup(%L, %L, %L, %L, %L, NULL, %L)',
           r.emp_a, 'beskt', 'operational', 'vaktare', 'general', (_acc ->> 'assignment_id')::uuid));
END $$;

DO $$
DECLARE r st%ROWTYPE; _s jsonb; _s2 jsonb; _c public.scp_interview_cases%ROWTYPE;
BEGIN
  SELECT * INTO r FROM st;
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_1, 'beskt_assignment', r.inv_assign, 'beskt'),
    'SCP_START_SOURCE_MISMATCH', 'ST9.1 an invitation is never carried into some application''s interview');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, NULL, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general'),
    'SCP_START_INVALID', 'ST9.2 only a BESKT invitation starts without an application');
  _s := pg_temp.start_as(r.owner_a, r.emp_a, NULL, 'beskt_assignment', r.inv_assign, 'beskt');
  _s2 := pg_temp.start_as(r.owner_a, r.emp_a, NULL, 'beskt_assignment', r.inv_assign, 'beskt');
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = (_s ->> 'case_id')::uuid;
  PERFORM pg_temp.ok((_s ->> 'created')::boolean AND (_s2 ->> 'case_id') = (_s ->> 'case_id')
                     AND _c.application_id IS NULL AND _c.candidate_user_id = r.invitee
                     AND _c.candidate_external_ref IS NULL AND _c.title LIKE 'Larmoperatör (syntetisk)%',
    'ST9.3 the accepted invitation starts ONE case, bound to the account that accepted it, with no invented application');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.bcp_case_links
                              WHERE case_id = _c.id AND assignment_id = r.inv_assign AND unlinked_at IS NULL
                                AND application_id IS NULL)
                     AND (SELECT application_id IS NULL FROM public.scp_interview_starts WHERE interview_case_id = _c.id),
    'ST9.4 with its governed link and its start, neither naming an application');
  PERFORM pg_temp.must_fail_as('authenticated', r.invitee,
    pg_temp.start_sql(r.emp_a, NULL, 'beskt_assignment', r.inv_assign, 'beskt'),
    'SCP_START_NOT_FOUND', 'ST9.5 the invited candidate cannot start or reach the employer''s case');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_b,
    pg_temp.start_sql(r.emp_a, NULL, 'beskt_assignment', r.inv_assign, 'beskt'),
    'SCP_START_NOT_FOUND', 'ST9.6 nor can another organisation');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST10 — a security vetting stays the security function''s'; END $$;

DO $$
DECLARE r st%ROWTYPE; _vv uuid; _res jsonb; _vprof uuid; _vhash text;
BEGIN
  SELECT * INTO r FROM st;
  _vv := pg_temp.build_method('synthetic-st-vetting', 'security_vetting_support');
  -- Read as the harness owner: RLS hides method rows from the officer's role.
  SELECT id INTO _vprof FROM public.beskt_exposure_profiles
   WHERE method_version_id = _vv AND permitted_mode = 'security_vetting_support' LIMIT 1;
  SELECT content_hash INTO _vhash FROM public.beskt_method_versions WHERE id = _vv;
  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000ad'); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_grant_internal_test_activation(gen_random_uuid(), r.emp_a, _vv,
    'SYNTETISKT ägarbeslut: intern funktionstest av säkerhetsprövningen.', current_date + 30);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(r.owner_a); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_appoint_security_officer(gen_random_uuid(), r.emp_a, r.officer, 'SYNTETISK säkerhetsskyddschef');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  _res := public.bcp_start_beskt(gen_random_uuid(), r.app_2, 'security_vetting_support', _vv,
    _vprof, _vhash,
    r.officer, 'Kontakt: säkerhetsskyddschefen, 08-000 00 00', r.officer,
    'Befattningen deltar i säkerhetskänslig verksamhet enligt vår analys.',
    'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE st SET vet_assign = (_res ->> 'assignment_id')::uuid;
  PERFORM pg_temp.submit_prep(r.cand_2, (_res ->> 'assignment_id')::uuid);
  PERFORM pg_temp.as_user('authenticated', r.officer,
    format('SELECT public.scp_record_recruitment_setup(%L, %L, %L, %L, %L, NULL, %L)',
           r.emp_a, 'beskt', 'operational', 'vaktare', 'general', (_res ->> 'assignment_id')::uuid));
END $$;

DO $$
DECLARE r st%ROWTYPE; _before text; _v jsonb; _v2 jsonb; _read boolean; _seen integer; _officer_reads boolean;
BEGIN
  SELECT * INTO r FROM st;
  _before := pg_temp.world();
  PERFORM pg_temp.must_fail_as('authenticated', r.member_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'beskt_assignment', r.vet_assign, 'beskt'),
    'SCP_START_SOURCE_MISMATCH', 'ST10.1 a plain member cannot start the security vetting''s interview');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'beskt_assignment', r.vet_assign, 'beskt'),
    'SCP_START_SOURCE_MISMATCH', 'ST10.2 nor the owner: the vetting belongs to the security function');
  PERFORM pg_temp.must_fail_as('authenticated', r.cand_2,
    pg_temp.start_sql(r.emp_a, r.app_2, 'beskt_assignment', r.vet_assign, 'beskt'),
    'SCP_START_NOT_FOUND', 'ST10.3 nor the candidate');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner_b,
    pg_temp.start_sql(r.emp_a, r.app_2, 'beskt_assignment', r.vet_assign, 'beskt'),
    'SCP_START_NOT_FOUND', 'ST10.4 nor another organisation');
  PERFORM pg_temp.ok(pg_temp.world() = _before, 'ST10.5 and none of them wrote anything');

  _v := pg_temp.start_as(r.officer, r.emp_a, r.app_2, 'beskt_assignment', r.vet_assign, 'beskt');
  _v2 := pg_temp.start_as(r.officer, r.emp_a, r.app_2, 'beskt_assignment', r.vet_assign, 'beskt');
  PERFORM pg_temp.become(r.member_a); SET LOCAL ROLE authenticated;
  _read := public.scp_iv_can_read_case((_v ->> 'case_id')::uuid);
  -- Direct reads, as the member: the case ROW (its policy follows the
  -- security-function rule since 20261203090000, which db-test.sh applies
  -- before this suite) and the start row (scp_iv_can_read_case).
  SELECT (SELECT count(*) FROM public.scp_interview_cases WHERE id = (_v ->> 'case_id')::uuid)
       + (SELECT count(*) FROM public.scp_interview_starts WHERE interview_case_id = (_v ->> 'case_id')::uuid) INTO _seen;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  _officer_reads := public.scp_iv_can_read_case((_v ->> 'case_id')::uuid);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok((_v ->> 'created')::boolean AND (_v2 ->> 'case_id') = (_v ->> 'case_id')
                     AND EXISTS (SELECT 1 FROM public.bcp_case_links WHERE case_id = (_v ->> 'case_id')::uuid
                                   AND assignment_id = r.vet_assign AND unlinked_at IS NULL),
    'ST10.6 the security officer starts it once, linked in the same transaction');
  PERFORM pg_temp.ok(NOT _read AND _seen = 0 AND _officer_reads,
    'ST10.7 from its first moment a plain member reads neither the case row nor its start row, and scp_iv_can_read_case agrees; the security officer reads it');
  PERFORM pg_temp.must_fail_as('authenticated', r.member_a,
    pg_temp.start_sql(r.emp_a, r.app_2, 'beskt_assignment', r.vet_assign, 'beskt'),
    'SCP_START_SOURCE_MISMATCH', 'ST10.8 a retry by a plain member neither reveals nor replaces it');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP ST11 — a started case keeps its guide version'; END $$;

DO $$
DECLARE r st%ROWTYPE; _v2 uuid := 'b7100000-0000-4000-8000-000000000004'; _x jsonb; _y jsonb; _z jsonb;
BEGIN
  SELECT * INTO r FROM st;
  -- A newer version of the Väktare guide appears in the catalogue.
  INSERT INTO public.scp_interview_pack_versions
    (id, pack_id, version_number, content_status, validation_label, locale, role_version_id,
     source_reference, source_document_version, content_hash, summary_sv, pilot_availability)
  SELECT _v2, v.pack_id, v.version_number + 1, v.content_status, v.validation_label, v.locale, v.role_version_id,
         'SYNTETISK version 2', v.source_document_version, md5('st-vaktare-v2') || md5('guide'), 'SYNTETISK', v.pilot_availability
    FROM public.scp_interview_pack_versions v WHERE v.id = r.pack_v;
  _x := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust');
  _y := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'assessment_assignment', r.assign_1, 'trust', NULL, NULL, NULL, _v2);
  PERFORM pg_temp.ok((_x ->> 'case_id')::uuid = r.case_t AND (_y ->> 'case_id')::uuid = r.case_t
                     AND (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = r.case_t) = r.pack_v,
    'ST11.1 reopening a started case keeps the guide version it pinned, even when the newer one is named');
  _z := pg_temp.start_as(r.owner_a, r.emp_a, r.app_1, 'chosen_setup', NULL, 'trust', 'operational', 'vaktare', 'general');
  PERFORM pg_temp.ok((_z ->> 'created')::boolean
                     AND (SELECT pack_version_id FROM public.scp_interview_cases WHERE id = (_z ->> 'case_id')::uuid) = _v2,
    'ST11.2 while a NEW start takes the newest version this employer may start');
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
  PERFORM pg_temp.ok(_n = (SELECT count(*) FROM public.scp_interview_starts
                             WHERE employer_id = r.emp_a AND start_key <> 'beskt:' || r.vet_assign)
                     AND _n >= 5,
    'ST7.7 a colleague reads every start whose case they may read -- all but the security vetting''s');
END $$;

ROLLBACK;
