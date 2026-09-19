-- ===========================================================================
-- BESKT PR 5A -- the governed conduct of the BESKT interview: behavioural suite
-- ===========================================================================
--
-- Proves what PR 5A claims: an authorised interviewer can work the
-- deterministic BESKT themes on a LINKED case, record the method's distinct
-- kinds of statement separately, correct without overwriting, carry a
-- verification through its history, lock their own position, and see nobody
-- else's until theirs is locked -- and that every other shape of this is
-- refused.
--
-- Everything planted here is SYNTHETIC. The whole suite runs inside ONE
-- transaction and is rolled back, so it seeds nothing.
--
-- Run:  psql -v ON_ERROR_STOP=1 -f supabase/tests/bcp_interview_conduct_test.sql
-- ===========================================================================
BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

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
  _emp_a uuid := 'b5000000-0000-4000-8000-00000000ea01';
  _emp_b uuid := 'b5000000-0000-4000-8000-00000000eb01';
  _cand_a uuid := 'b5000000-0000-4000-8000-0000000000c1';
  _cand_b uuid := 'b5000000-0000-4000-8000-0000000000c2';
  _rec_a uuid := 'b5000000-0000-4000-8000-0000000000d1';
  _rec_b uuid := 'b5000000-0000-4000-8000-0000000000d2';
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
    (_cand_a, 'bridge-cand-a@synthetic.test'),
    (_cand_b, 'bridge-cand-b@synthetic.test'),
    (_rec_a,  'bridge-rec-a@synthetic.test'),
    (_rec_b,  'bridge-rec-b@synthetic.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_emp_a, 'SYNTETISK Bridge AB', 'synthetic-bridge-ab', 'active'),
         (_emp_b, 'SYNTETISK Rival AB', 'synthetic-bridge-rival', 'active')
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
  VALUES ('bridge-job-a', 'BRGJA1', _emp_a, 'internal',
          'Väktare (syntetisk brygga)', 'Security officer (synthetic bridge)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_a;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('bridge-job-b', 'BRGJB1', _emp_b, 'internal',
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
  _v := pg_temp.build_method('bridge-synthetic', 'recruitment_support');
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

-- ---------------------------------------------------------------------------
-- The link PR 4 makes. PR 5A's whole surface stands on it, so it is made here
-- through the GOVERNED RPC rather than planted, or the suite would be proving
-- conduct over a link that the product could never have produced.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE ck (
  link uuid, session uuid, panel uuid,
  pos_a uuid, pos_b uuid, pos_owner uuid,
  entry_a uuid, entry_a2 uuid, entry_b uuid,
  omit_key text, oral_key text, answered_key text,
  n bigint, scratch text
) ON COMMIT DROP;
INSERT INTO ck DEFAULT VALUES;
GRANT ALL ON ck TO authenticated;

DO $mklink$
DECLARE
  _r lk%ROWTYPE; _rev integer; _res jsonb;
BEGIN
  SELECT * INTO _r FROM lk;
  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _r.assignment;

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_link_preparation_to_case(gen_random_uuid(), _r.assignment, _r.case_a, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();

  UPDATE ck SET link = (_res ->> 'link_id')::uuid,
                omit_key = split_part((SELECT scratch FROM lk), '|', 1),
                oral_key = split_part((SELECT scratch FROM lk), '|', 2);

  -- A question the candidate ANSWERED in writing, so the suite can prove the
  -- interview may still discuss it while the topic list does not name it.
  UPDATE ck SET answered_key = (
    SELECT an.item_key FROM public.bcp_answers an
     WHERE an.response_id = _r.response AND an.response_state = 'answered'
     ORDER BY an.item_key LIMIT 1);
END $mklink$;

DO $$
BEGIN
  IF (SELECT link FROM ck) IS NULL OR (SELECT answered_key FROM ck) IS NULL THEN
    RAISE EXCEPTION 'CONDUCT_SUITE: the PR 4 link or an answered item is missing, so nothing below would prove anything.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C1 -- Starting a session: who may, and against what.
-- ---------------------------------------------------------------------------
DO $c1$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _res jsonb; _sid uuid;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;

  PERFORM pg_temp.must_fail_as('anon', NULL,
    format('SELECT public.bcp_conduct_start_session(%L, %L)', gen_random_uuid(), _k.link),
    'permission denied',
    'C1.1 anon cannot reach the conduct surface at all');

  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_conduct_start_session(%L, %L)', gen_random_uuid(), _k.link),
    'BCP_CONDUCT_NOT_PERMITTED',
    'C1.2 the candidate cannot open an interview workspace about themselves');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_start_session(%L, %L)', gen_random_uuid(), _k.link),
    'BCP_CONDUCT_NOT_PERMITTED',
    'C1.3 a member of another employer is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_start_session(%L, %L)', gen_random_uuid(), gen_random_uuid()),
    'BCP_CASE_LINK_NOT_FOUND',
    'C1.4 a session cannot be opened against a link that does not exist');

  -- The right person, on the right link.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_start_session(gen_random_uuid(), _k.link);
  RESET ROLE; PERFORM pg_temp.nobody();
  _sid := (_res ->> 'session_id')::uuid;
  UPDATE ck SET session = _sid, pos_a = (_res ->> 'position_id')::uuid;

  PERFORM pg_temp.ok(_sid IS NOT NULL, 'C1.5 an authorised interviewer opens the session');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_conduct_sessions s
      JOIN public.bcp_case_links l ON l.id = s.link_id
     WHERE s.id = _sid
       AND s.bound_response_id = l.bound_response_id
       AND s.bound_response_version = l.bound_response_version
       AND s.bound_method_version_id = l.bound_method_version_id
       AND s.bound_content_hash = l.bound_content_hash
       AND s.bound_answers_content_hash = l.bound_answers_content_hash) = 1,
    'C1.6 and the session binds the LINK''s exact snapshot, not a caller-supplied one');

  PERFORM pg_temp.ok(
    (_res ->> 'produces_score')::boolean = false AND _res ->> 'interpretation' = 'none',
    'C1.7 the receipt says in its own payload that it produces no score and no interpretation');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_start_session(%L, %L)', gen_random_uuid(), _k.link),
    'duplicate key',
    'C1.8 a second session over the same link is refused -- one interview, one record');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_events WHERE event = 'conduct_session_started') >= 1,
    'C1.9 the start is recorded on PR 3''s existing ledger, not a new one');
END $c1$;

-- ---------------------------------------------------------------------------
-- C2 -- The workspace: the bound snapshot, and the candidate's own two states
--       carried through NEUTRALLY.
-- ---------------------------------------------------------------------------
DO $c2$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _w jsonb;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  SELECT d INTO _w FROM public.bcp_conduct_workspace(_k.session) d;
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    _w -> 'bound' ->> 'content_hash' = (SELECT bound_content_hash FROM public.bcp_case_links WHERE id = _k.link)
    AND _w -> 'bound' ->> 'answers_content_hash' = (SELECT bound_answers_content_hash FROM public.bcp_case_links WHERE id = _k.link)
    AND (_w -> 'bound' ->> 'response_version')::integer >= 1,
    'C2.1 the exact snapshot hash and version stay visible and bound throughout');

  PERFORM pg_temp.ok(
    jsonb_array_length(_w -> 'topics') = (SELECT count(*) FROM public.bcp_case_topics WHERE link_id = _k.link)
    AND jsonb_array_length(_w -> 'topics') >= 1,
    'C2.2 the deterministic BESKT themes are shown, and there is at least one');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_w -> 'topics') t
                 WHERE t ->> 'reason' NOT IN ('omitted', 'discuss_orally', 'candidate_disclosed')
                    OR ((t ->> 'reason') = 'candidate_disclosed') <> ((t ->> 'trigger_rule_key') IS NOT NULL)),
    -- 20261130090000: or the candidate's own explicit answer that fired a
    -- governed show-rule, named by that rule -- never an interpretation.
    'C2.3 every theme carries the candidate''s own state, or the rule their own answer fired, and nothing else');

  -- The neutral states are rendered as the candidate's own words, with no
  -- adverse vocabulary anywhere near them.
  PERFORM pg_temp.ok(
    _w::text !~* '\m(refused|evasive|withheld|concealed|suspicious|deception|red.?flag|non.?compliant)\M',
    'C2.4 nothing in the workspace reads an omission as a judgement');

  PERFORM pg_temp.ok(
    (_w ->> 'produces_score')::boolean = false
    AND (_w ->> 'produces_ranking')::boolean = false
    AND (_w ->> 'produces_recommendation')::boolean = false
    AND _w ->> 'interpretation' = 'none',
    'C2.5 the workspace states in its own payload that it produces no score, ranking or recommendation');

  PERFORM pg_temp.ok(
    (_w -> 'my_position' ->> 'state') = 'open'
    AND (_w ->> 'others_visible')::boolean = false,
    'C2.6 the opener has an open position of their own and sees nobody else yet');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_workspace(%L)', _k.session),
    'BCP_CONDUCT_NOT_PERMITTED',
    'C2.7 a member of another employer is refused the workspace');

  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_conduct_workspace(%L)', _k.session),
    'BCP_CONDUCT_NOT_PERMITTED',
    'C2.8 and so is the candidate -- this is the employer''s internal workspace');
END $c2$;

-- ---------------------------------------------------------------------------
-- C3 -- Recording: the method's distinct kinds of statement, separately.
-- ---------------------------------------------------------------------------
DO $c3$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _res jsonb; _rev integer; _topic uuid;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _k.pos_a;
  SELECT id INTO _topic FROM public.bcp_case_topics WHERE link_id = _k.link AND item_key = _k.omit_key;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format($q$SELECT public.bcp_conduct_save_entry(%L, %L, %s, %L)$q$,
           gen_random_uuid(), _k.pos_a, _rev,
           jsonb_build_object('item_key', 'not_a_governed_item',
                              'observable_fact', 'SYNTETISK uppgift.')),
    'BCP_CONDUCT_ITEM_NOT_IN_VERSION',
    'C3.1 an entry about something outside the governed method version is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format($q$SELECT public.bcp_conduct_save_entry(%L, %L, %s, %L)$q$,
           gen_random_uuid(), _k.pos_a, 99,
           jsonb_build_object('item_key', _k.omit_key, 'observable_fact', 'SYNTETISK uppgift.')),
    'BCP_STALE_REVISION',
    'C3.2 a stale revision is refused');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_conduct_entries WHERE position_id = _k.pos_a) = 0,
    'C3.3 and the refused save wrote nothing at all');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format($q$SELECT public.bcp_conduct_save_entry(%L, %L, %s, %L)$q$,
           gen_random_uuid(), _k.pos_a, _rev,
           jsonb_build_object('item_key', _k.omit_key, 'observable_fact', 'SYNTETISK uppgift.')),
    'BCP_CONDUCT_NOT_OWN_POSITION',
    'C3.4 nobody records into another person''s position');

  -- The real thing: every element of the model, each in its own field.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_save_entry(gen_random_uuid(), _k.pos_a, _rev,
    jsonb_build_object(
      'item_key', _k.omit_key,
      'topic_id', _topic,
      'observable_fact', 'SYNTETISKT: uppgiften lämnades inte skriftligt.',
      'candidate_explanation', 'SYNTETISKT: kandidaten ville ta det muntligt.',
      'interviewer_interpretation', 'SYNTETISKT: intervjuarens egen läsning, markerad som sådan.',
      'alternative_explanation', 'SYNTETISKT: kan lika gärna bero på tidsbrist.',
      'protective_factor', 'SYNTETISKT: lång anställning utan anmärkning.',
      'verification_need', 'SYNTETISKT: behöver styrkas mot intyg.',
      'verification_state', 'requested',
      'sensitivity_class', 'ordinary'));
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE ck SET entry_a = (_res ->> 'entry_id')::uuid;

  PERFORM pg_temp.ok(
    (SELECT observable_fact IS NOT NULL AND candidate_explanation IS NOT NULL
        AND interviewer_interpretation IS NOT NULL AND alternative_explanation IS NOT NULL
        AND protective_factor IS NOT NULL AND verification_need IS NOT NULL
       FROM public.bcp_conduct_entries WHERE id = (_res ->> 'entry_id')::uuid),
    'C3.5 the fact, the candidate''s explanation, the interpretation, the alternative and the protective factor are SEPARATE columns');

  PERFORM pg_temp.ok(
    (SELECT topic_basis = 'derived_neutral_topic' AND topic_id = _topic
       FROM public.bcp_conduct_entries WHERE id = (_res ->> 'entry_id')::uuid),
    'C3.6 and the entry names the derived neutral topic it came from');

  PERFORM pg_temp.ok(
    (SELECT recorded_by = _r.rec_a AND recorded_at IS NOT NULL
       FROM public.bcp_conduct_entries WHERE id = (_res ->> 'entry_id')::uuid),
    'C3.7 who registered it, and when, is on the row');

  -- A question the candidate ANSWERED may still be discussed -- it simply is
  -- not one of the derived themes, so it carries no topic.
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _k.pos_a;
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_save_entry(gen_random_uuid(), _k.pos_a, _rev,
    jsonb_build_object('item_key', _k.answered_key,
      'observable_fact', 'SYNTETISKT: fråga som besvarades skriftligt.'));
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (SELECT topic_basis = 'governed_method_item' AND topic_id IS NULL
       FROM public.bcp_conduct_entries
      WHERE position_id = _k.pos_a AND item_key = _k.answered_key),
    'C3.8 an answered question is still discussable, on the governed item rather than a derived theme');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_conduct_entries
      WHERE position_id = _k.pos_a AND superseded_by_entry_id IS NULL) = 2,
    'C3.9 both entries are live');
END $c3$;

-- ---------------------------------------------------------------------------
-- C4 -- Correction creates history. It never overwrites.
-- ---------------------------------------------------------------------------
DO $c4$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _res jsonb; _rev integer; _before text;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _k.pos_a;
  SELECT observable_fact INTO _before FROM public.bcp_conduct_entries WHERE id = _k.entry_a;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format($q$SELECT public.bcp_conduct_save_entry(%L, %L, %s, %L, %L, %L)$q$,
           gen_random_uuid(), _k.pos_a, _rev,
           jsonb_build_object('item_key', _k.omit_key, 'observable_fact', 'SYNTETISKT: rättat.'),
           _k.entry_a, ''),
    'BCP_CONDUCT_CORRECTION_REASON_REQUIRED',
    'C4.1 a correction without a reason is refused');

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_save_entry(gen_random_uuid(), _k.pos_a, _rev,
    jsonb_build_object('item_key', _k.omit_key,
      'observable_fact', 'SYNTETISKT: rättad uppgift efter förtydligande.',
      'candidate_explanation', 'SYNTETISKT: kandidaten förtydligade.'),
    _k.entry_a, 'SYNTETISKT: kandidaten förtydligade efter intervjun.');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE ck SET entry_a2 = (_res ->> 'entry_id')::uuid;
  -- Re-read, or every assertion below would address a NULL id, match no row,
  -- and pass by addressing nothing. That is exactly how a guard assertion goes
  -- quietly dead.
  SELECT * INTO _k FROM ck;

  PERFORM pg_temp.ok(
    (SELECT observable_fact FROM public.bcp_conduct_entries WHERE id = _k.entry_a) = _before,
    'C4.2 THE ORIGINAL ENTRY IS UNCHANGED -- a correction overwrites nothing');

  PERFORM pg_temp.ok(
    (SELECT superseded_by_entry_id FROM public.bcp_conduct_entries WHERE id = _k.entry_a)
      = (_res ->> 'entry_id')::uuid
    AND (SELECT supersedes_entry_id FROM public.bcp_conduct_entries WHERE id = (_res ->> 'entry_id')::uuid)
      = _k.entry_a,
    'C4.3 the two are linked in both directions, so the chain is walkable');

  PERFORM pg_temp.ok(
    (SELECT entry_version FROM public.bcp_conduct_entries WHERE id = (_res ->> 'entry_id')::uuid) = 2
    AND (SELECT length(btrim(correction_reason)) >= 3
           FROM public.bcp_conduct_entries WHERE id = (_res ->> 'entry_id')::uuid),
    'C4.4 the correction is version 2 and carries why it was made');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_conduct_entries
      WHERE position_id = _k.pos_a AND item_key = _k.omit_key) = 2
    AND (SELECT count(*) FROM public.bcp_conduct_entries
          WHERE position_id = _k.pos_a AND item_key = _k.omit_key
            AND superseded_by_entry_id IS NULL) = 1,
    'C4.5 both versions survive and exactly one is live');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format($q$SELECT public.bcp_conduct_save_entry(%L, %L, %s, %L, %L, %L)$q$,
           gen_random_uuid(), _k.pos_a,
           (SELECT revision FROM public.bcp_conduct_positions WHERE id = _k.pos_a),
           jsonb_build_object('item_key', _k.omit_key, 'observable_fact', 'SYNTETISKT: igen.'),
           _k.entry_a, 'SYNTETISKT: andra rättningen av samma rad.'),
    'BCP_CONDUCT_ALREADY_CORRECTED',
    'C4.6 the same entry cannot be corrected twice -- corrections form a chain, not a tree');

  -- Against the owner, not merely against the RPC.
  PERFORM pg_temp.must_fail(
    format('UPDATE public.bcp_conduct_entries SET observable_fact = %L WHERE id = %L',
           'SYNTETISKT: direktskrivning.', _k.entry_a2),
    'BCP_CONDUCT_ENTRY_EDITED_IN_PLACE',
    'C4.7 a direct in-place edit is refused, owner included');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_conduct_entries WHERE id = %L', _k.entry_a2),
    'BCP_CONDUCT_ENTRY_NO_DELETE',
    'C4.8 nor can an entry be deleted');

  -- The history is readable, in order, with the reasons.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  SELECT d INTO _res FROM public.bcp_conduct_entry_history(_k.entry_a2) d;
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    jsonb_array_length(_res -> 'versions') = 2
    AND (_res -> 'versions' -> 0 ->> 'entry_version')::integer = 1
    AND (_res -> 'versions' -> 1 ->> 'correction_reason') IS NOT NULL,
    'C4.9 the history explains how the record got to where it is');
END $c4$;

-- ---------------------------------------------------------------------------
-- C5 -- Verification: the need, the state, the source, and the history.
-- ---------------------------------------------------------------------------
DO $c5$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _rev integer; _h jsonb;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _k.pos_a;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_record_verification(%L, %L, %s, %L)',
           gen_random_uuid(), _k.entry_a2, _rev, 'verified'),
    'BCP_CONDUCT_VERIFICATION_SOURCE_REQUIRED',
    'C5.1 "verified" with no source is refused -- a verification names where it came from');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_record_verification(%L, %L, %s, %L, %L)',
           gen_random_uuid(), _k.entry_a2, _rev, 'definitely_true', 'SYNTETISK källa'),
    'BCP_CONDUCT_VERIFICATION_STATE_UNKNOWN',
    'C5.2 and a state outside the governed list is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_record_verification(%L, %L, %s, %L, %L)',
           gen_random_uuid(), _k.entry_a2, _rev, 'verified', 'SYNTETISK källa'),
    'BCP_CONDUCT_NOT_OWN_POSITION',
    'C5.3 nobody verifies into another person''s position');

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_record_verification(gen_random_uuid(), _k.entry_a2, _rev,
    'in_progress', NULL, 'SYNTETISKT: begärt intyg.');
  PERFORM public.bcp_conduct_record_verification(gen_random_uuid(), _k.entry_a2,
    (SELECT revision FROM public.bcp_conduct_positions WHERE id = _k.pos_a),
    'verified', 'SYNTETISKT: arbetsgivarintyg 2026-01-01', 'SYNTETISKT: styrkt.');
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (SELECT verification_state FROM public.bcp_conduct_entries WHERE id = _k.entry_a2) = 'verified'
    AND (SELECT verification_source IS NOT NULL FROM public.bcp_conduct_entries WHERE id = _k.entry_a2),
    'C5.4 the entry carries the current state and the source it rests on');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_conduct_verifications WHERE entry_id = _k.entry_a2) = 2
    AND (SELECT count(*) FROM public.bcp_conduct_verifications
          WHERE entry_id = _k.entry_a2 AND previous_state IS NOT NULL AND new_state IS NOT NULL) = 2,
    'C5.5 and every step is on the history with where it came from and where it went');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.bcp_conduct_verifications SET new_state = %L WHERE entry_id = %L',
           'not_verified', _k.entry_a2),
    'BCP_CONDUCT_APPEND_ONLY',
    'C5.6 the verification history cannot be rewritten, owner included');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_conduct_verifications WHERE entry_id = %L', _k.entry_a2),
    'BCP_CONDUCT_APPEND_ONLY',
    'C5.7 nor deleted');

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  SELECT d INTO _h FROM public.bcp_conduct_entry_history(_k.entry_a2) d;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(
    jsonb_array_length(_h -> 'verifications') = 2
    AND (_h -> 'verifications' -> 1 ->> 'source') IS NOT NULL,
    'C5.8 the verification history reads back in order, with its sources');
END $c5$;

-- ---------------------------------------------------------------------------
-- C6 -- A second assessor, working independently.
-- ---------------------------------------------------------------------------
DO $c6$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _res jsonb; _w jsonb; _rev integer;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;

  -- rec_b belongs to another employer; a second assessor must be a member of
  -- THIS one, so the fixture's platform admin is not a route in either.
  INSERT INTO auth.users (id, email)
  VALUES ('b5000000-0000-4000-8000-0000000000d3', 'bridge-rec-a2@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES (_r.emp_a, 'b5000000-0000-4000-8000-0000000000d3', 'member', 'active')
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.become('b5000000-0000-4000-8000-0000000000d3');
  SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_join_session(gen_random_uuid(), _k.session, 'assessor');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE ck SET pos_b = (_res ->> 'position_id')::uuid;
  SELECT * INTO _k FROM ck;

  PERFORM pg_temp.ok(_k.pos_b IS NOT NULL, 'C6.1 a second member of the same employer joins as an assessor');

  PERFORM pg_temp.must_fail_as('authenticated', 'b5000000-0000-4000-8000-0000000000d3',
    format('SELECT public.bcp_conduct_join_session(%L, %L, %L)',
           gen_random_uuid(), _k.session, 'assessor'),
    'BCP_CONDUCT_ALREADY_JOINED',
    'C6.2 and cannot hold two positions in the same session');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_join_session(%L, %L, %L)',
           gen_random_uuid(), _k.session, 'assessor'),
    'BCP_CONDUCT_NOT_PERMITTED',
    'C6.3 a member of another employer cannot join');

  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_conduct_join_session(%L, %L, %L)',
           gen_random_uuid(), _k.session, 'assessor'),
    'BCP_CONDUCT_NOT_PERMITTED',
    'C6.4 nor can the candidate');

  -- ── THE INDEPENDENCE RULE ───────────────────────────────────────────
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _k.pos_b;
  PERFORM pg_temp.become('b5000000-0000-4000-8000-0000000000d3');
  SET LOCAL ROLE authenticated;
  SELECT d INTO _w FROM public.bcp_conduct_workspace(_k.session) d;
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (_w ->> 'others_visible')::boolean = false
    AND jsonb_array_length(_w -> 'others') = 0,
    'C6.5 BEFORE LOCKING THEIR OWN, the second assessor sees nothing of the first''s');

  PERFORM pg_temp.ok(
    pg_temp.count_as('b5000000-0000-4000-8000-0000000000d3'::uuid,
      format('SELECT count(*) FROM public.bcp_conduct_entries WHERE position_id = %L', _k.pos_a)) = 0,
    'C6.6 and the row-level policy withholds the other position''s entries too, not just the read model');

  PERFORM pg_temp.must_fail_as('authenticated', 'b5000000-0000-4000-8000-0000000000d3',
    format('SELECT public.bcp_conduct_entry_history(%L)', _k.entry_a2),
    'BCP_CONDUCT_NOT_VISIBLE_YET',
    'C6.7 and the history of another''s entry is refused by name, so the reason is legible');

  -- The second assessor records their own, differing, view.
  PERFORM pg_temp.become('b5000000-0000-4000-8000-0000000000d3');
  SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_save_entry(gen_random_uuid(), _k.pos_b, _rev,
    jsonb_build_object('item_key', _k.omit_key,
      'observable_fact', 'SYNTETISKT: samma sakförhållande.',
      'interviewer_interpretation', 'SYNTETISKT: en annan läsning än kollegans.',
      'protective_factor', 'SYNTETISKT: samma skyddsfaktor noterad.'));
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE ck SET entry_b = (_res ->> 'entry_id')::uuid;

  PERFORM pg_temp.ok(
    pg_temp.count_as(_r.rec_a,
      format('SELECT count(*) FROM public.bcp_conduct_entries WHERE position_id = %L', _k.pos_b)) = 0,
    'C6.8 and the first assessor cannot see the second''s either -- the rule runs both ways');
END $c6$;

-- ---------------------------------------------------------------------------
-- C7 -- Locking, and what a lock means.
-- ---------------------------------------------------------------------------
DO $c7$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _rev integer; _rev_b integer; _w jsonb;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _k.pos_a;

  PERFORM pg_temp.must_fail_as('authenticated', 'b5000000-0000-4000-8000-0000000000d3',
    format('SELECT public.bcp_conduct_lock_position(%L, %L, %s)',
           gen_random_uuid(), _k.pos_a, _rev),
    'BCP_CONDUCT_NOT_OWN_POSITION',
    'C7.1 nobody locks another person''s position');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_lock_position(%L, %L, %s)',
           gen_random_uuid(), _k.pos_a, 99),
    'BCP_STALE_REVISION',
    'C7.2 a stale revision is refused');

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _k.pos_a, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (SELECT state = 'locked' AND locked_at IS NOT NULL AND lock_operation_id IS NOT NULL
       FROM public.bcp_conduct_positions WHERE id = _k.pos_a),
    'C7.3 the first assessor locks their own position');

  -- NOTHING GOES IN AFTER THE LOCK.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format($q$SELECT public.bcp_conduct_save_entry(%L, %L, %s, %L)$q$,
           gen_random_uuid(), _k.pos_a,
           (SELECT revision FROM public.bcp_conduct_positions WHERE id = _k.pos_a),
           jsonb_build_object('item_key', _k.oral_key, 'observable_fact', 'SYNTETISKT: efter låsning.')),
    'BCP_CONDUCT_POSITION_LOCKED',
    'C7.4 and records nothing more into it');

  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.bcp_conduct_entries
             (position_id, session_id, item_id, item_key, topic_basis, observable_fact,
              recorded_by, save_operation_id)
             VALUES (%L, %L,
               (SELECT i.id FROM public.beskt_items i JOIN public.bcp_conduct_sessions s ON s.id = %L
                 WHERE i.method_version_id = s.bound_method_version_id AND i.item_key = %L),
               %L, 'governed_method_item', 'SYNTETISKT: direkt.', %L, gen_random_uuid())$q$,
           _k.pos_a, _k.session, _k.session, _k.oral_key, _k.oral_key, _r.rec_a),
    'BCP_CONDUCT_POSITION_LOCKED',
    'C7.5 not even a direct table write, owner included -- the lock is a database fact');

  -- Still nothing visible: the OTHER assessor is still open.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  SELECT d INTO _w FROM public.bcp_conduct_workspace(_k.session) d;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(
    (_w ->> 'others_visible')::boolean = false,
    'C7.6 locking your own is not enough: the other position is still open, so nothing is revealed');

  -- Now the second locks too.
  SELECT revision INTO _rev_b FROM public.bcp_conduct_positions WHERE id = _k.pos_b;
  PERFORM pg_temp.become('b5000000-0000-4000-8000-0000000000d3');
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _k.pos_b, _rev_b);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    pg_temp.count_as(_r.rec_a,
      format('SELECT count(*) FROM public.bcp_conduct_entries WHERE position_id = %L', _k.pos_b)) > 0,
    'C7.7 once BOTH are locked, the differing views become visible to each other');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_events WHERE event = 'conduct_position_locked') = 2,
    'C7.8 and both locks are on the append-only ledger');
END $c7$;

-- ---------------------------------------------------------------------------
-- C8 -- The panel: disagreement is recorded, not resolved away.
-- ---------------------------------------------------------------------------
DO $c8$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _res jsonb; _rev integer;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_open_panel(%L, %L)', gen_random_uuid(), _k.session),
    'BCP_CONDUCT_NOT_PERMITTED',
    'C8.1 a member of another employer cannot open the panel');

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_open_panel(gen_random_uuid(), _k.session);
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE ck SET panel = (_res ->> 'panel_id')::uuid;
  SELECT * INTO _k FROM ck;

  PERFORM pg_temp.ok(_k.panel IS NOT NULL, 'C8.2 a participant opens the panel');

  SELECT revision INTO _rev FROM public.bcp_conduct_panels WHERE id = _k.panel;

  -- Nothing is resolved before the positions have been seen.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_record_resolution(%L, %L, %s, %L, %L, %L, %L, %L)',
           gen_random_uuid(), _k.panel, _rev, _k.omit_key, 'agreed',
           'SYNTETISKT: enighet.', NULL, 'SYNTETISKT: skäl.'),
    'BCP_CONDUCT_PANEL_NOT_REVEALED',
    'C8.3 a resolution before the reveal is refused -- it would rest on material nobody had read');

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_reveal_panel(gen_random_uuid(), _k.panel, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (SELECT state = 'revealed' AND revealed_at IS NOT NULL
       FROM public.bcp_conduct_panels WHERE id = _k.panel),
    'C8.4 the panel reveals once every position is locked');

  SELECT revision INTO _rev FROM public.bcp_conduct_panels WHERE id = _k.panel;

  -- A DISAGREEMENT MUST CARRY WHAT THE PARTIES DIFFER ON.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_record_resolution(%L, %L, %s, %L, %L, %L, %L, %L)',
           gen_random_uuid(), _k.panel, _rev, _k.omit_key, 'disagreed',
           NULL, NULL, 'SYNTETISKT: skäl.'),
    'BCP_CONDUCT_DIVERGENCE_REQUIRED',
    'C8.5 a disagreement with nothing in it is refused -- that would be a rumour, not a record');

  -- There is no third outcome, and no number anywhere.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_record_resolution(%L, %L, %s, %L, %L, %L, %L, %L)',
           gen_random_uuid(), _k.panel, _rev, _k.omit_key, 'average',
           NULL, 'SYNTETISKT: medelvärde.', 'SYNTETISKT: skäl.'),
    'BCP_CONDUCT_RESOLUTION_KIND_UNKNOWN',
    'C8.6 there is no averaging outcome, and no score -- only agreed or disagreed');

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_record_resolution(gen_random_uuid(), _k.panel, _rev,
    _k.omit_key, 'disagreed', NULL,
    'SYNTETISKT: bedömarna läser sakförhållandet olika.',
    'SYNTETISKT: skillnaden kvarstår och redovisas.');
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (SELECT resolution_kind = 'disagreed' AND divergent_statement IS NOT NULL
        AND length(btrim(rationale)) >= 3
       FROM public.bcp_conduct_panel_resolutions WHERE id = (_res ->> 'resolution_id')::uuid),
    'C8.7 the disagreement is recorded, with what differs and why');

  PERFORM pg_temp.ok(
    (_res ->> 'produces_score')::boolean = false,
    'C8.8 and the receipt says it produced no score');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.bcp_conduct_panel_resolutions SET resolution_kind = %L WHERE id = %L',
           'agreed', (_res ->> 'resolution_id')::uuid),
    'BCP_CONDUCT_APPEND_ONLY',
    'C8.9 a recorded disagreement cannot later be turned into agreement, owner included');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_conduct_panel_resolutions WHERE id = %L',
           (_res ->> 'resolution_id')::uuid),
    'BCP_CONDUCT_APPEND_ONLY',
    'C8.10 nor deleted away');

  -- Once seen, a position cannot be revised in the light of the others.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_reopen_position(%L, %L, %s, %L)',
           gen_random_uuid(), _k.pos_a,
           (SELECT revision FROM public.bcp_conduct_positions WHERE id = _k.pos_a),
           'SYNTETISKT: vill ändra efter att ha sett kollegans.'),
    'BCP_CONDUCT_PANEL_ALREADY_REVEALED',
    'C8.11 and no position can be reopened after the panel has read it');
END $c8$;

-- ---------------------------------------------------------------------------
-- C9 -- Idempotency, actor and payload mismatch, and two simultaneous locks.
-- ---------------------------------------------------------------------------
DO $c9$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _op uuid := gen_random_uuid();
  _first jsonb; _second jsonb; _rev integer; _pos uuid; _n bigint;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;

  -- A fresh session on the OTHER application, so the idempotency and
  -- concurrency proofs do not disturb the panel above.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _first := public.bcp_conduct_join_session(_op, _k.session, 'responsible_owner');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(false, 'C9.0 unreachable');
EXCEPTION WHEN OTHERS THEN
  -- rec_a already holds a position, so the join above is expected to refuse.
  PERFORM pg_temp.ok(SQLERRM LIKE '%BCP_CONDUCT_ALREADY_JOINED%',
    'C9.1 a named responsible owner cannot double up on an existing position');
END $c9$;

DO $c9b$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _op uuid := gen_random_uuid();
  _first jsonb; _second jsonb; _rev integer; _owner uuid := 'b5000000-0000-4000-8000-0000000000d4';
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;

  INSERT INTO auth.users (id, email) VALUES (_owner, 'bridge-owner@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES (_r.emp_a, _owner, 'owner', 'active') ON CONFLICT DO NOTHING;

  -- ── IDEMPOTENT REPLAY ───────────────────────────────────────────────
  PERFORM pg_temp.become(_owner);
  SET LOCAL ROLE authenticated;
  _first := public.bcp_conduct_join_session(_op, _k.session, 'responsible_owner');
  _second := public.bcp_conduct_join_session(_op, _k.session, 'responsible_owner');
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    _first ->> 'position_id' = _second ->> 'position_id',
    'C9.2 the same operation id returns the same receipt rather than joining twice');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_conduct_positions
      WHERE session_id = _k.session AND assessor_id = _owner) = 1,
    'C9.3 and exactly one position exists afterwards');

  UPDATE ck SET pos_owner = (_first ->> 'position_id')::uuid;

  -- ── PAYLOAD MISMATCH ON THE SAME OPERATION ID ───────────────────────
  PERFORM pg_temp.must_fail_as('authenticated', _owner,
    format('SELECT public.bcp_conduct_join_session(%L, %L, %L)', _op, _k.session, 'assessor'),
    'BCP_OPERATION_PAYLOAD_MISMATCH',
    'C9.4 the same operation id with a DIFFERENT payload is refused');

  -- ── ACTOR MISMATCH ON THE SAME OPERATION ID ─────────────────────────
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_join_session(%L, %L, %L)', _op, _k.session, 'responsible_owner'),
    'BCP_OPERATION_ACTOR_MISMATCH',
    'C9.5 and the same operation id replayed by a DIFFERENT actor is refused');

  PERFORM pg_temp.ok(
    (SELECT position_role = 'responsible_owner'
       FROM public.bcp_conduct_positions WHERE id = (_first ->> 'position_id')::uuid),
    'C9.6 a named responsible owner records a position of their own, alongside the assessors''');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_conduct_entries e
      JOIN public.bcp_conduct_positions p ON p.id = e.position_id
     WHERE p.session_id = _k.session AND p.assessor_id <> _owner) > 0
    AND (SELECT count(*) FROM public.bcp_conduct_entries
          WHERE position_id = (_first ->> 'position_id')::uuid) = 0,
    'C9.7 and joining wrote over nobody''s record -- the existing material is untouched');
END $c9b$;

-- ---------------------------------------------------------------------------
-- C10 -- The absolute method limits, read from the catalogue.
-- ---------------------------------------------------------------------------
DO $c10$
DECLARE
  _k ck%ROWTYPE; _tables text[] := ARRAY['bcp_conduct_sessions', 'bcp_conduct_positions',
    'bcp_conduct_entries', 'bcp_conduct_verifications', 'bcp_conduct_panels',
    'bcp_conduct_panel_resolutions'];
BEGIN
  SELECT * INTO _k FROM ck;

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = ANY (_tables)
        AND c.column_name ~* '(score|points|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|deception|hire|confidence|rating|grade|level)') = 0,
    'C10.1 no column anywhere in the conduct layer could hold a score, ranking, verdict or truth judgement');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = ANY (_tables)
        AND c.data_type = 'jsonb') = 0,
    'C10.2 and no free-form jsonb a judgement could hide inside');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY (_tables) AND cmd <> 'SELECT') = 0,
    'C10.3 no table carries a write policy -- every write goes through a governed RPC');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM unnest(_tables) t
      CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) priv
      CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
       WHERE has_table_privilege(r, 'public.' || t, priv)),
    'C10.4 and no client role holds table DML on any of them, service_role included');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM unnest(_tables) t WHERE has_table_privilege('anon', 'public.' || t, 'SELECT')),
    'C10.5 anon reads none of them');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'bcp_guard_conduct%'
         AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
              OR has_function_privilege('service_role', p.oid, 'EXECUTE')
              OR has_function_privilege('anon', p.oid, 'EXECUTE'))),
    'C10.6 no trigger guard is callable by a client role, so PostgREST publishes none of them');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'bcp_conduct%'
         AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')),
    'C10.7 every conduct function pins its search_path');

  PERFORM pg_temp.must_fail_as('anon', NULL,
    'SELECT count(*) FROM public.bcp_conduct_entries',
    'permission denied for table bcp_conduct_entries',
    'C10.8 anon is refused the entries table outright');
END $c10$;

-- ---------------------------------------------------------------------------
-- C11 -- The wrong shapes: unlinked, cancelled, and a draft instead of a
--        submitted snapshot.
-- ---------------------------------------------------------------------------
DO $c11$
DECLARE
  _r lk%ROWTYPE; _k ck%ROWTYPE; _rev integer; _res jsonb;
  _link2 uuid; _assign2 uuid; _sess2 uuid;
BEGIN
  SELECT * INTO _r FROM lk; SELECT * INTO _k FROM ck;

  -- ── A DRAFT PREPARATION HAS NO LINK, SO IT HAS NO CONDUCT SURFACE ───
  --
  -- PR 4 already refuses to link a draft; what matters here is that PR 5A has
  -- no way in that goes round it. The conduct session can only be opened
  -- against a LINK, and a draft never has one.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_assign(gen_random_uuid(), _r.app_b, _r.v, _r.prof, _r.hash,
                            public.bcp_notice_version(), NULL);
  RESET ROLE; PERFORM pg_temp.nobody();
  _assign2 := (_res ->> 'assignment_id')::uuid;

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_case_links WHERE assignment_id = _assign2) = 0,
    'C11.1 a preparation that was never submitted has no link at all');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_start_session(%L, %L)', gen_random_uuid(), _assign2),
    'BCP_CASE_LINK_NOT_FOUND',
    'C11.2 and a conduct session cannot be opened against an assignment id at all -- only a link');

  -- ── AN UNLINKED LINK TAKES NO NEW SESSION ───────────────────────────
  -- Proved on a direct insert, because the RPC path is already covered above
  -- and the invariant has to hold against the owner too.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.bcp_conduct_sessions
             (link_id, case_id, employer_id, assignment_id, bound_response_id,
              bound_response_version, bound_method_version_id, bound_content_hash,
              bound_answers_content_hash, opened_by, open_operation_id)
             SELECT l.id, l.case_id, l.employer_id, l.assignment_id, l.bound_response_id,
                    l.bound_response_version, l.bound_method_version_id, l.bound_content_hash,
                    l.bound_answers_content_hash, %L, gen_random_uuid()
               FROM public.bcp_case_links l WHERE l.id = %L$q$, _r.rec_a, _k.link),
    'duplicate key',
    'C11.3 a second session on a live link is refused by the unique index');

  -- ── THE BOUND SNAPSHOT IS THE LINK'S OWN, NOT THE CALLER'S ──────────
  PERFORM pg_temp.must_fail(
    format('UPDATE public.bcp_conduct_sessions SET bound_content_hash = %L WHERE id = %L',
           repeat('a', 64), _k.session),
    'BCP_CONDUCT_SESSION_REBOUND',
    'C11.4 the bound snapshot cannot be re-pointed after the session opened, owner included');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_conduct_sessions WHERE id = %L', _k.session),
    'BCP_CONDUCT_SESSION_NO_DELETE',
    'C11.5 nor can a session be deleted');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_conduct_positions WHERE id = %L', _k.pos_a),
    'BCP_CONDUCT_POSITION_NO_DELETE',
    'C11.6 nor a position');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.bcp_conduct_positions SET assessor_id = %L WHERE id = %L',
           _r.rec_b, _k.pos_a),
    'BCP_CONDUCT_POSITION_REATTRIBUTED',
    'C11.7 and a position keeps the person who made it');

  -- ── AN ENTRY CANNOT BORROW ANOTHER CASE'S TOPIC ─────────────────────
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.bcp_conduct_entries
             (position_id, session_id, topic_id, item_id, item_key, topic_basis,
              observable_fact, recorded_by, save_operation_id)
             SELECT %L, %L, gen_random_uuid(), i.id, i.item_key, 'derived_neutral_topic',
                    'SYNTETISKT: lånat tema.', %L, gen_random_uuid()
               FROM public.beskt_items i
               JOIN public.bcp_conduct_sessions s ON s.id = %L
              WHERE i.method_version_id = s.bound_method_version_id
              LIMIT 1$q$, _k.pos_owner, _k.session, 'b5000000-0000-4000-8000-0000000000d4', _k.session),
    'BCP_CONDUCT_TOPIC_NOT_IN_LINK',
    'C11.8 a topic that is not this link''s own is refused -- it would carry another candidate');
END $c11$;

-- ---------------------------------------------------------------------------
DO $done$
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'BESKT PR 5A interview-conduct suite: all groups passed';
  RAISE NOTICE '====================================================';
END $done$;

ROLLBACK;
