-- 20261202090000 -- the committed world for the BESKT interview-start race.
--
-- Two separate connections must start the SAME BESKT interview at once, so the
-- rows they race over must be committed. scripts/db-test.sh commits this into a
-- THROWAWAY copy of the test database (CREATE DATABASE ... TEMPLATE), races,
-- and drops the copy -- nothing here is ever cleaned out of the main replay.
--
-- The preparation is built and submitted through the ordinary governed
-- functions: a published synthetic method, bcp_start_beskt by the owner, the
-- candidate's notice acknowledgement, answers and submission. SYNTHETIC only.

\i supabase/tests/beskt_governed_content_fixture.sql

CREATE FUNCTION pg_temp.race_fill(_assignment uuid) RETURNS void LANGUAGE plpgsql AS $fill$
DECLARE _doc jsonb; _entries jsonb; _round integer := 0;
BEGIN
  LOOP
    _round := _round + 1;
    IF _round > 20 THEN RAISE EXCEPTION 'START_RACE: the preparation never settled.'; END IF;
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

DO $race$
DECLARE
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _emp uuid := 'bf200000-0000-4000-8000-0000000000e1';
  _owner uuid := 'bf200000-0000-4000-8000-0000000000d1';
  _cand uuid := 'bf200000-0000-4000-8000-0000000000c1';
  _job uuid; _app uuid; _v uuid; _prof uuid; _hash text; _res jsonb; _assign uuid; _notice text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_owner, 'start-race-owner@synthetic.test'), (_cand, 'start-race-cand@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_emp, 'SYNTETISK Startrace AB', 'synthetic-start-race', 'active');
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES (_emp, _owner, 'owner', 'active');

  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('start-race-job', 'STRCE2', _emp, 'internal', 'Väktare (syntetisk)', 'Security officer (synthetic)',
          'published', now(), now() + interval '90 days') RETURNING id INTO _job;
  PERFORM pg_temp.nobody();
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job, _emp, _cand, now()) RETURNING id INTO _app;

  _v := pg_temp.build_method('synthetic-start-race', 'recruitment_support', _store => false);
  PERFORM pg_temp.submit(_v); PERFORM pg_temp.approve_all(_v); PERFORM pg_temp.publish(_v);
  SELECT id INTO _prof FROM public.beskt_exposure_profiles WHERE method_version_id = _v AND profile_key = 'lone_working';
  SELECT content_hash INTO _hash FROM public.beskt_method_versions WHERE id = _v;

  PERFORM pg_temp.become(_owner); SET LOCAL ROLE authenticated;
  _res := public.bcp_start_beskt(gen_random_uuid(), _app, 'recruitment_support', _v, _prof, _hash,
    _owner, 'Kontakt: rekryteraren, 08-000 00 00');
  _assign := (_res ->> 'assignment_id')::uuid;
  PERFORM public.scp_record_recruitment_setup(_emp, 'beskt', 'operational', 'vaktare', 'general', NULL, _assign);
  RESET ROLE; PERFORM pg_temp.nobody();

  SELECT notice_version INTO _notice FROM public.bcp_assignments WHERE id = _assign;
  PERFORM pg_temp.become(_cand); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), _assign, _notice,
    public.bcp_notice_hash(_assign, 'sv-SE'), 'sv-SE');
  PERFORM pg_temp.race_fill(_assign);
  PERFORM public.bcp_submit(gen_random_uuid(), _assign,
    (SELECT (d -> 'response' ->> 'revision')::integer FROM public.bcp_candidate_preparation(_assign) d));
  RESET ROLE; PERFORM pg_temp.nobody();

  IF (SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _assign) <> 'submitted' THEN
    RAISE EXCEPTION 'START_RACE: the preparation did not reach submitted.';
  END IF;
  RAISE NOTICE 'RACE EMP=% APP=% ASSIGN=% OWNER=%', _emp, _app, _assign, _owner;
END $race$;
