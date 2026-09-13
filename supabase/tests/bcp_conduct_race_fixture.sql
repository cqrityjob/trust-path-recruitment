-- ===========================================================================
-- BESKT PR 5A -- fixture for the CONCURRENT LOCK race.
-- ===========================================================================
--
-- The behavioural suite runs in one transaction and is rolled back, which is
-- right for everything it proves -- and makes it structurally unable to prove
-- one thing: that two SEPARATE connections pressing "lock my position" at the
-- same instant settle deterministically. That needs two real sessions, so it
-- needs committed rows, so it needs this.
--
-- Everything here is SYNTHETIC and carries its own b6 prefix so it cannot
-- collide with the suite's b5 actors. scripts/db-test.sh commits it, races
-- against it, and then deletes it before the rollback runs.
-- ===========================================================================
\i supabase/tests/beskt_governed_content_fixture.sql

-- Read a count AS a named principal, through the real role. Lives here rather
-- than in the shared fixture because that is where PR 3 put it, and copying one
-- small helper beats widening a fixture every suite depends on.
CREATE OR REPLACE FUNCTION pg_temp.count_as(_u uuid, _sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  PERFORM pg_temp.become(_u);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _n;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _n;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

-- ---------------------------------------------------------------------------
-- L0 -- The spine. Existing tables only: employers, jobs, applications,
--       candidates, an interview case. PR 4 creates no parallel anything, and
--       this fixture proves it by having nothing of its own to create.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE lk (
  emp_a uuid, emp_b uuid,
  job_a uuid, job_b uuid,
  app_a uuid, app_b uuid, app_other uuid,
  cand_a uuid, cand_b uuid,
  rec_a uuid, rec_b uuid, admin_u uuid,
  v uuid, prof uuid, hash text,
  pack_v uuid, role_v uuid,
  case_a uuid, case_wrong_cand uuid, case_other_emp uuid, case_cancelled uuid,
  assignment uuid, response uuid, ack_hash text, ack_locale text,
  link uuid, n bigint, scratch text
) ON COMMIT DROP;
INSERT INTO lk DEFAULT VALUES;
GRANT ALL ON lk TO authenticated;

DO $seed$
DECLARE
  _emp_a uuid := 'b6000000-0000-4000-8000-00000000ea01';
  _emp_b uuid := 'b6000000-0000-4000-8000-00000000eb01';
  _cand_a uuid := 'b6000000-0000-4000-8000-0000000000c1';
  _cand_b uuid := 'b6000000-0000-4000-8000-0000000000c2';
  _rec_a uuid := 'b6000000-0000-4000-8000-0000000000d1';
  _rec_b uuid := 'b6000000-0000-4000-8000-0000000000d2';
  -- The fixture's own platform administrator, reused rather than minted
  -- again: it already carries the 'admin' user_role the governed RPCs check.
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _job_a uuid; _job_b uuid;
  _app_a uuid; _app_b uuid; _app_other uuid;
  _v uuid; _prof uuid; _hash text;
  _pack_v uuid; _role_v uuid;
BEGIN
  -- Users
  INSERT INTO auth.users (id, email) VALUES
    (_cand_a, 'race-cand-a@synthetic.test'),
    (_cand_b, 'race-cand-b@synthetic.test'),
    (_rec_a,  'race-rec-a@synthetic.test'),
    (_rec_b,  'race-rec-b@synthetic.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_emp_a, 'SYNTETISK Race AB', 'synthetic-race-ab', 'active'),
         (_emp_b, 'SYNTETISK Race Rival AB', 'synthetic-race-rival', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES (_emp_a, _rec_a, 'admin', 'active'),
         (_emp_b, _rec_b, 'admin', 'active')
  ON CONFLICT DO NOTHING;

  -- Published on the platform's own moderation path, as the fixture's planted
  -- platform administrator: the product refuses an employer who tries to
  -- create a job already published, and the suite goes through that guard
  -- rather than around it.
  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('race-job-a', 'RACEA1', _emp_a, 'internal',
          'Väktare (syntetisk brygga)', 'Security officer (synthetic bridge)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_a;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('race-job-b', 'RACEB1', _emp_b, 'internal',
          'Väktare B (syntetisk brygga)', 'Security officer B (synthetic bridge)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_b;
  PERFORM pg_temp.nobody();

  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a, _emp_a, _cand_a, now()) RETURNING id INTO _app_a;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a, _emp_a, _cand_b, now()) RETURNING id INTO _app_b;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_b, _emp_b, _cand_a, now()) RETURNING id INTO _app_other;

  -- The governed BESKT method, built and published through the fixture's own
  -- governed path -- the same one PR 3's suite uses. Nothing here reaches
  -- around the review gates.
  _v := pg_temp.build_method('race-synthetic', 'recruitment_support');
  PERFORM pg_temp.submit(_v);
  PERFORM pg_temp.approve_all(_v);
  PERFORM pg_temp.publish(_v);
  SELECT id INTO _prof FROM public.beskt_exposure_profiles
   WHERE method_version_id = _v AND profile_key = 'lone_working';
  SELECT content_hash INTO _hash FROM public.beskt_method_versions WHERE id = _v;

  -- An interview pack version and role version, so a real case can exist.
  SELECT pv.id, rv.id INTO _pack_v, _role_v
    FROM public.scp_interview_pack_versions pv
    CROSS JOIN public.scp_role_versions rv
   LIMIT 1;

  UPDATE lk SET
    emp_a = _emp_a, emp_b = _emp_b,
    job_a = _job_a, job_b = _job_b,
    app_a = _app_a, app_b = _app_b, app_other = _app_other,
    cand_a = _cand_a, cand_b = _cand_b,
    rec_a = _rec_a, rec_b = _rec_b, admin_u = _admin,
    v = _v, prof = _prof, hash = _hash,
    pack_v = _pack_v, role_v = _role_v;
END $seed$;

-- The suite needs a real interview pack and role version to build a case. If
-- this database has none, say so loudly rather than skipping silently: a
-- suite that quietly proves nothing is worse than one that fails.
DO $$
BEGIN
  IF (SELECT pack_v FROM lk) IS NULL OR (SELECT role_v FROM lk) IS NULL THEN
    RAISE EXCEPTION
      'BRIDGE_SUITE: no interview pack version or role version exists, so no case can be built. '
      'The bridge cannot be proved against a database without the Interview Intelligence spine.';
  END IF;
END $$;

-- Four cases: the right one, one about another candidate, one at another
-- employer, and one already cancelled.
DO $cases$
DECLARE
  _r lk%ROWTYPE;
  _c1 uuid; _c2 uuid; _c3 uuid; _c4 uuid;
BEGIN
  SELECT * INTO _r FROM lk;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, created_by)
  VALUES (_r.emp_a, _r.job_a, _r.app_a, _r.cand_a, 'SYNTETISK Kandidat A',
          _r.pack_v, _r.role_v, 'SYNTETISK intervju A', _r.rec_a)
  RETURNING id INTO _c1;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, created_by)
  VALUES (_r.emp_a, _r.job_a, _r.app_b, _r.cand_b, 'SYNTETISK Kandidat B',
          _r.pack_v, _r.role_v, 'SYNTETISK intervju B', _r.rec_a)
  RETURNING id INTO _c2;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, created_by)
  VALUES (_r.emp_b, _r.job_b, _r.app_other, _r.cand_a, 'SYNTETISK Kandidat A hos rival',
          _r.pack_v, _r.role_v, 'SYNTETISK intervju hos rival', _r.rec_b)
  RETURNING id INTO _c3;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, status, created_by)
  VALUES (_r.emp_a, _r.job_a, _r.app_a, _r.cand_a, 'SYNTETISK avbruten',
          _r.pack_v, _r.role_v, 'SYNTETISK avbruten intervju', 'cancelled', _r.rec_a)
  RETURNING id INTO _c4;

  UPDATE lk SET case_a = _c1, case_wrong_cand = _c2, case_other_emp = _c3, case_cancelled = _c4;
END $cases$;

-- ---------------------------------------------------------------------------
-- L1 -- A preparation that is still a DRAFT cannot be bridged.
-- ---------------------------------------------------------------------------
DO $l1$
DECLARE
  _r lk%ROWTYPE;
  _res jsonb;
  _assignment uuid;
BEGIN
  SELECT * INTO _r FROM lk;

  PERFORM pg_temp.become(_r.admin_u);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_grant_pilot(gen_random_uuid(), _r.emp_a, _r.v,
    'Syntetisk pilot för bryggtestet.', (current_date + 30));
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_assign(gen_random_uuid(), _r.app_a, _r.v, _r.prof, _r.hash,
                            public.bcp_notice_version(), NULL);
  _assignment := (_res ->> 'assignment_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();

  UPDATE lk SET assignment = _assignment;

END $l1$;

-- The candidate now acknowledges, answers and submits.
--
-- The payload is composed from the CANDIDATE'S OWN DOCUMENT rather than from
-- the method catalogue, for two reasons. The catalogue is deliberately
-- invisible to `authenticated` -- PR 3's suite asserts a candidate reads zero
-- rows from beskt_items -- so composing from it inside the candidate's role
-- would have produced an empty aggregate and proved nothing. And which items
-- are shown is a ROUTING decision (PR #218's beskt_resolve_item_sequence):
-- answering one question can reveal or hide another, so the set is not known
-- until the answers settle. The fill below therefore repeats until the
-- document stops offering unanswered questions, exactly as a candidate
-- working through the form would.
CREATE FUNCTION pg_temp.bridge_fill(_assignment uuid, _omit_key text, _oral_key text)
RETURNS void LANGUAGE plpgsql AS $fill$
DECLARE
  _doc jsonb;
  _entries jsonb;
  _round integer := 0;
BEGIN
  LOOP
    _round := _round + 1;
    IF _round > 20 THEN
      RAISE EXCEPTION 'BRIDGE_SUITE: the preparation never settled after 20 fill rounds.';
    END IF;

    SELECT d INTO _doc FROM public.bcp_candidate_preparation(_assignment) d;

    SELECT jsonb_agg(jsonb_build_object(
             'item_key', it ->> 'item_key',
             'response_state', 'answered',
             'value_text', CASE WHEN it ->> 'answer_type' IN ('short_text', 'long_text')
               THEN to_jsonb('SYNTETISKT svar.'::text) END,
             'value_boolean', CASE WHEN it ->> 'answer_type' IN ('boolean', 'acknowledgement')
               THEN to_jsonb(true) END,
             'value_date', CASE WHEN it ->> 'answer_type' = 'date'
               THEN to_jsonb(current_date - 30) END,
             'option_keys', CASE
               WHEN it ->> 'answer_type' IN ('single_choice', 'multi_choice')
                 THEN jsonb_build_array(it -> 'options' -> 0 ->> 'option_key')
               ELSE '[]'::jsonb END)
           ORDER BY (it ->> 'sequence_position')::integer)
      INTO _entries
      FROM jsonb_array_elements(_doc -> 'items') it
     WHERE it -> 'answer' IS NULL OR jsonb_typeof(it -> 'answer') = 'null'
       AND true
       AND (it ->> 'item_key') IS DISTINCT FROM _omit_key
       AND (it ->> 'item_key') IS DISTINCT FROM _oral_key;

    EXIT WHEN _entries IS NULL OR jsonb_array_length(_entries) = 0;

    PERFORM public.bcp_save_answers(gen_random_uuid(), _assignment,
      (_doc -> 'response' ->> 'revision')::integer, _entries);
  END LOOP;
END $fill$;

DO $l2seed$
DECLARE
  _r lk%ROWTYPE;
  _hash text;
  _locale text := 'sv-SE';
  _doc jsonb;
  _omit_key text;
  _oral_key text;
  _resp uuid;
BEGIN
  SELECT * INTO _r FROM lk;

  PERFORM pg_temp.become(_r.cand_a);
  SET LOCAL ROLE authenticated;

  _hash := public.bcp_notice_hash(_r.assignment, _locale);
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), _r.assignment,
    public.bcp_notice_version(), _hash, _locale);

  -- First settle the whole form, so the visible set is known.
  PERFORM pg_temp.bridge_fill(_r.assignment, NULL, NULL);

  SELECT d INTO _doc FROM public.bcp_candidate_preparation(_r.assignment) d;

  -- The two neutral states are taken at the END of the settled sequence, so
  -- changing them cannot strand an earlier routing decision.
  SELECT it ->> 'item_key' INTO _omit_key
    FROM jsonb_array_elements(_doc -> 'items') it
   ORDER BY (it ->> 'sequence_position')::integer DESC LIMIT 1;
  SELECT it ->> 'item_key' INTO _oral_key
    FROM jsonb_array_elements(_doc -> 'items') it
   WHERE (it ->> 'discuss_orally_allowed')::boolean
     AND (it ->> 'item_key') IS DISTINCT FROM _omit_key
   ORDER BY (it ->> 'sequence_position')::integer DESC LIMIT 1;

  IF _omit_key IS NULL OR _oral_key IS NULL THEN
    RAISE EXCEPTION
      'BRIDGE_SUITE: the settled preparation has no item to omit or none that may be '
      'taken orally, so the two neutral states the bridge exists to carry cannot be planted.';
  END IF;

  PERFORM public.bcp_save_answers(gen_random_uuid(), _r.assignment,
    (_doc -> 'response' ->> 'revision')::integer,
    jsonb_build_array(
      jsonb_build_object('item_key', _omit_key, 'response_state', 'omitted'),
      jsonb_build_object('item_key', _oral_key, 'response_state', 'discuss_orally')));

  -- Re-settle: the two neutral states may have changed what is shown.
  PERFORM pg_temp.bridge_fill(_r.assignment, _omit_key, _oral_key);

  PERFORM public.bcp_submit(gen_random_uuid(), _r.assignment,
    (SELECT (d -> 'response' ->> 'revision')::integer
       FROM public.bcp_candidate_preparation(_r.assignment) d));

  RESET ROLE; PERFORM pg_temp.nobody();

  SELECT id INTO _resp FROM public.bcp_responses
   WHERE assignment_id = _r.assignment AND response_state = 'submitted'
   ORDER BY response_version DESC LIMIT 1;

  UPDATE lk SET response = _resp, ack_hash = _hash, ack_locale = _locale,
    scratch = _omit_key || '|' || _oral_key;
END $l2seed$;

-- Link, open a session, and print what the two racers need.
DO $race$
DECLARE
  _r lk%ROWTYPE; _rev integer; _res jsonb;
BEGIN
  SELECT * INTO _r FROM lk;
  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _r.assignment;

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_link_preparation_to_case(gen_random_uuid(), _r.assignment, _r.case_a, _rev);
  _res := public.bcp_conduct_start_session(gen_random_uuid(), (_res ->> 'link_id')::uuid);
  -- A position with nothing in it cannot be locked, which is itself a rule, so
  -- the racers are given something real to lock.
  PERFORM public.bcp_conduct_save_entry(gen_random_uuid(), (_res ->> 'position_id')::uuid,
    (SELECT revision FROM public.bcp_conduct_positions WHERE id = (_res ->> 'position_id')::uuid),
    jsonb_build_object('item_key', split_part((SELECT scratch FROM lk), '|', 1),
                       'observable_fact', 'SYNTETISKT: underlag för kapplöpningen.'));
  RESET ROLE; PERFORM pg_temp.nobody();

  RAISE NOTICE 'POS=% REV=%', (_res ->> 'position_id'),
    (SELECT revision FROM public.bcp_conduct_positions WHERE id = (_res ->> 'position_id')::uuid);
END $race$;
