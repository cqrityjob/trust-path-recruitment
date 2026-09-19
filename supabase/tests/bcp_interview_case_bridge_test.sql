-- ===========================================================================
-- BESKT PR 4 -- the bridge to the interview case: behavioural database suite
-- ===========================================================================
--
-- Proves what PR 4 claims: a SUBMITTED BESKT preparation can be bound to the
-- employer's EXISTING interview case for the same application and the same
-- candidate, that the binding carries the exact snapshot identity, that the
-- derived topics are the candidate's own two neutral states and nothing else,
-- and that every other shape of this operation is refused.
--
-- Everything planted here is SYNTHETIC. The whole suite runs inside ONE
-- transaction and is rolled back, so it seeds nothing.
--
-- Run:  psql -v ON_ERROR_STOP=1 -f supabase/tests/bcp_interview_case_bridge_test.sql
-- ===========================================================================

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

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

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, 1)',
           gen_random_uuid(), _assignment, _r.case_a),
    'BCP_NOT_SUBMITTED',
    'L1.1 a preparation that has not been submitted cannot be linked to a case');
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
-- L2 -- Every WRONG case is refused, before the right one is accepted.
-- ---------------------------------------------------------------------------
DO $l2$
DECLARE
  _r lk%ROWTYPE;
  _rev integer;
BEGIN
  SELECT * INTO _r FROM lk;
  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _r.assignment;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, %s)',
           gen_random_uuid(), _r.assignment, _r.case_wrong_cand, _rev),
    'BCP_CASE_MISMATCH',
    'L2.1 a case about ANOTHER candidate at the same employer is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, %s)',
           gen_random_uuid(), _r.assignment, _r.case_other_emp, _rev),
    'BCP_CASE_MISMATCH',
    'L2.2 a case belonging to another employer is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, %s)',
           gen_random_uuid(), _r.assignment, _r.case_cancelled, _rev),
    'BCP_CASE_CANCELLED',
    'L2.3 a cancelled case takes no new source');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, %s)',
           gen_random_uuid(), _r.assignment, _r.case_a, _rev),
    'BCP_NOT_EMPLOYER_MEMBER',
    'L2.4 a member of another employer cannot link this preparation');

  -- THE CANDIDATE IS NOT A PARTY TO THIS OPERATION. They submitted; what the
  -- employer does with its own interview case is not a candidate mutation.
  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, %s)',
           gen_random_uuid(), _r.assignment, _r.case_a, _rev),
    'BCP_NOT_EMPLOYER_MEMBER',
    'L2.5 the candidate themselves cannot link their preparation to a case');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, %s)',
           gen_random_uuid(), _r.assignment, _r.case_a, _rev + 99),
    'BCP_STALE_REVISION',
    'L2.6 a stale revision is refused without writing');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_case_links) = 0,
    'L2.7 and not one of those refusals left a link behind');
END $l2$;

-- ---------------------------------------------------------------------------
-- L3 -- The right case is accepted, and binds the exact snapshot.
-- ---------------------------------------------------------------------------
DO $l3$
DECLARE
  _r lk%ROWTYPE;
  _rev integer;
  _res jsonb;
  _l public.bcp_case_links%ROWTYPE;
  _resp public.bcp_responses%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM lk;
  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _r.assignment;

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_link_preparation_to_case(gen_random_uuid(), _r.assignment, _r.case_a, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();

  UPDATE lk SET link = (_res ->> 'link_id')::uuid;

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = (_res ->> 'link_id')::uuid;
  SELECT * INTO _resp FROM public.bcp_responses WHERE id = _r.response;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _r.assignment;

  PERFORM pg_temp.ok(_l.bound_response_id = _resp.id
                 AND _l.bound_response_version = _resp.response_version,
    'L3.1 the link binds the exact submitted response and its version');
  PERFORM pg_temp.ok(_l.bound_assignment_revision = _rev,
    'L3.2 and the assignment revision it was made against');
  PERFORM pg_temp.ok(_l.bound_content_hash = _a.pinned_content_hash
                 AND _l.bound_method_version_id = _a.method_version_id,
    'L3.3 and the pinned method version and content hash');
  PERFORM pg_temp.ok(_l.bound_answers_content_hash = _resp.submitted_content_hash,
    'L3.4 and the submitted answers content hash');
  PERFORM pg_temp.ok(_l.bound_notice_content_hash = _r.ack_hash
                 AND _l.bound_notice_locale = _r.ack_locale,
    'L3.5 and the notice the candidate actually acknowledged, in the locale they read it in');

  -- The source row lands on the EXISTING case, as the governed kind.
  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.scp_interview_case_sources s
     WHERE s.id = _l.source_id AND s.case_id = _r.case_a
       AND s.source_kind = 'beskt_preparation'
       AND s.content_text IS NULL
       AND length(btrim(s.lawful_basis_note)) > 0),
    'L3.6 a governed source row is registered on the existing case, as a pointer and not a copy');

  -- No case was created, and the case status was not advanced.
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_interview_cases) = 4,
    'L3.7 no new interview case was created; the bridge uses the one that existed');
  PERFORM pg_temp.ok(
    (SELECT status FROM public.scp_interview_cases WHERE id = _r.case_a) = 'draft',
    'L3.8 and the case status is untouched -- the bridge advances nothing');

  -- The append-only ledger recorded it, on the SAME ledger the rest of BESKT
  -- uses. One assignment, one history.
  PERFORM pg_temp.ok(EXISTS (
    SELECT 1 FROM public.bcp_events e
     WHERE e.assignment_id = _r.assignment AND e.event = 'case_linked'),
    'L3.9 the operation is recorded on the existing BESKT event ledger');
END $l3$;

-- ---------------------------------------------------------------------------
-- L4 -- The derived topics are the candidate's own two neutral states.
-- ---------------------------------------------------------------------------
DO $l4$
DECLARE
  _r lk%ROWTYPE;
  _expected bigint;
BEGIN
  SELECT * INTO _r FROM lk;

  SELECT count(*) INTO _expected FROM public.bcp_answers an
   WHERE an.response_id = _r.response AND an.response_state IN ('omitted', 'discuss_orally');

  PERFORM pg_temp.ok(
    -- 20261130090000: disclosed topics (an explicit answer that fired a
    -- governed rule) sit beside these; the two neutral states are counted.
    (SELECT count(*) FROM public.bcp_case_topics WHERE link_id = _r.link
       AND topic_reason IN ('omitted', 'discuss_orally')) = _expected
    AND _expected > 0,
    'L4.1 exactly one topic per question the candidate omitted or deferred, and there is at least one');

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.bcp_case_topics t
      JOIN public.bcp_answers an ON an.item_id = t.item_id AND an.response_id = _r.response
     WHERE t.link_id = _r.link AND an.response_state = 'answered'
       -- 20261130090000 (§4.5): except an answer that FIRED a governed
       -- show-rule, which is a disclosed topic naming that rule.
       AND NOT (t.topic_reason = 'candidate_disclosed' AND EXISTS (
             SELECT 1 FROM public.beskt_routing_rules rr
              WHERE rr.rule_key = t.trigger_rule_key AND rr.source_item_id = t.item_id
                AND rr.action = 'show'))),
    'L4.2 no question the candidate ANSWERED became a topic, unless their answer fired a governed rule');

  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.bcp_case_topics t
      JOIN public.bcp_answers an ON an.item_id = t.item_id AND an.response_id = _r.response
     WHERE t.link_id = _r.link
       AND an.response_state <> CASE t.topic_reason WHEN 'candidate_disclosed' THEN 'answered'
                                                    ELSE t.topic_reason END),
    'L4.3 every topic carries the state the candidate actually gave');

  PERFORM pg_temp.ok((SELECT bool_and(derived_from_response_id = _r.response)
                        FROM public.bcp_case_topics WHERE link_id = _r.link),
    'L4.4 and every topic names the bound snapshot it was derived from');

  -- The derivation is not the caller's to assert.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.bcp_case_topics
              (link_id, derived_from_response_id, item_id, item_key, topic_reason, display_order)
              SELECT %L, %L, an.item_id, an.item_key, 'omitted', 99
                FROM public.bcp_answers an
               WHERE an.response_id = %L AND an.response_state = 'answered' LIMIT 1$q$,
           _r.link, _r.response, _r.response),
    'BCP_TOPIC_REASON_MISMATCH',
    'L4.5 a topic claiming a state the snapshot does not record is refused, owner included');

  PERFORM pg_temp.must_fail(
    format('UPDATE public.bcp_case_topics SET topic_reason = ''omitted'' WHERE link_id = %L', _r.link),
    'BCP_CASE_TOPIC_APPEND_ONLY',
    'L4.6 a derived topic cannot be updated');
  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_case_topics WHERE link_id = %L', _r.link),
    'BCP_CASE_TOPIC_APPEND_ONLY',
    'L4.7 nor deleted');

  -- There is nowhere to record a READING of an omission. Two independent
  -- refusals, because either one alone would be weaker than it looks: the
  -- row trigger refuses this particular insert, and the column's vocabulary
  -- refuses the word at all -- so a future change that drops the trigger
  -- still cannot introduce a judgemental reason, and a future change that
  -- widens the vocabulary still cannot get a row past the trigger.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.bcp_case_topics
              (link_id, derived_from_response_id, item_id, item_key, topic_reason, display_order)
              VALUES (%L, %L, (SELECT item_id FROM public.bcp_answers WHERE response_id = %L LIMIT 1),
                      'x', 'refused', 50)$q$, _r.link, _r.response, _r.response),
    'BCP_TOPIC_REASON_MISMATCH',
    'L4.8 a judgemental reason is refused for a real snapshot item');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'public.bcp_case_topics'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%topic_reason%'
        AND pg_get_constraintdef(oid) LIKE '%omitted%'
        AND pg_get_constraintdef(oid) LIKE '%discuss_orally%') = 1
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.bcp_case_topics'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%topic_reason%'
         AND pg_get_constraintdef(oid) ~ '(refused|declined|risk|concern|flag)'),
    'L4.9 and the reason vocabulary itself admits the two neutral states and nothing judgemental');
END $l4$;

-- ---------------------------------------------------------------------------
-- L5 -- One live link, under concurrency, by index rather than by hope.
-- ---------------------------------------------------------------------------
DO $l5$
DECLARE
  _r lk%ROWTYPE;
  _rev integer;
BEGIN
  SELECT * INTO _r FROM lk;
  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _r.assignment;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_link_preparation_to_case(%L, %L, %L, %s)',
           gen_random_uuid(), _r.assignment, _r.case_a, _rev),
    'BCP_CASE_LINK_EXISTS',
    'L5.1 the same preparation cannot be linked twice');

  -- And the database refuses it even with the RPC's own check bypassed.
  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.bcp_case_links
              (assignment_id, case_id, employer_id, application_id, candidate_user_id,
               bound_response_id, bound_response_version, bound_assignment_revision,
               bound_method_version_id, bound_content_hash, bound_answers_content_hash,
               bound_notice_version, bound_notice_content_hash, bound_notice_locale,
               source_id, linked_by, link_operation_id)
              SELECT assignment_id, case_id, employer_id, application_id, candidate_user_id,
                     bound_response_id, bound_response_version, bound_assignment_revision,
                     bound_method_version_id, bound_content_hash, bound_answers_content_hash,
                     bound_notice_version, bound_notice_content_hash, bound_notice_locale,
                     source_id, linked_by, gen_random_uuid()
                FROM public.bcp_case_links WHERE id = %L$q$, _r.link),
    'bcp_case_links_one_live_per_assignment_idx',
    'L5.2 and the unique index refuses a second live link for the owner too');
END $l5$;

-- ---------------------------------------------------------------------------
-- L6 -- Idempotency: a retried request is answered, not repeated.
-- ---------------------------------------------------------------------------
DO $l6$
DECLARE
  _r lk%ROWTYPE;
  _op uuid := gen_random_uuid();
  _before bigint;
  _first jsonb; _second jsonb;
BEGIN
  SELECT * INTO _r FROM lk;
  SELECT count(*) INTO _before FROM public.bcp_case_links;

  -- Unlink first, so there is a live slot to link into again.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_unlink_preparation_from_case(gen_random_uuid(), _r.link,
    'Syntetisk avlänkning för idempotenstestet.');

  _first := public.bcp_link_preparation_to_case(_op, _r.assignment, _r.case_a,
    (SELECT revision FROM public.bcp_assignments WHERE id = _r.assignment));
  _second := public.bcp_link_preparation_to_case(_op, _r.assignment, _r.case_a,
    (SELECT revision FROM public.bcp_assignments WHERE id = _r.assignment));
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(_first ->> 'link_id' = _second ->> 'link_id',
    'L6.1 the same operation id returns the same receipt rather than linking twice');
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.bcp_case_links WHERE unlinked_at IS NULL) = 1,
    'L6.2 and exactly one live link exists afterwards');

  UPDATE lk SET link = (_first ->> 'link_id')::uuid;
END $l6$;

-- ---------------------------------------------------------------------------
-- L7 -- Unlink marks; it never deletes, and never rewrites.
-- ---------------------------------------------------------------------------
DO $l7$
DECLARE
  _r lk%ROWTYPE;
  _before bigint;
BEGIN
  SELECT * INTO _r FROM lk;
  SELECT count(*) INTO _before FROM public.bcp_case_links;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_unlink_preparation_from_case(%L, %L, %L)',
           gen_random_uuid(), _r.link, 'x'),
    'BCP_REASON_REQUIRED',
    'L7.1 unlinking without a usable reason is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_unlink_preparation_from_case(%L, %L, %L)',
           gen_random_uuid(), _r.link, 'Syntetiskt försök från fel arbetsgivare.'),
    'BCP_NOT_EMPLOYER_MEMBER',
    'L7.2 and a member of another employer cannot unlink it');

  PERFORM pg_temp.as_user('authenticated', _r.rec_a,
    format('SELECT public.bcp_unlink_preparation_from_case(%L, %L, %L)',
           gen_random_uuid(), _r.link, 'Syntetisk avlänkning, fel intervjufall.'));

  PERFORM pg_temp.ok((SELECT count(*) FROM public.bcp_case_links) = _before,
    'L7.3 unlinking removed no row -- the history of the attachment survives');
  PERFORM pg_temp.ok(
    (SELECT unlinked_at IS NOT NULL AND unlinked_by IS NOT NULL
            AND length(btrim(unlinked_reason)) >= 3
       FROM public.bcp_case_links WHERE id = _r.link),
    'L7.4 and it is marked with who, when and why');

  PERFORM pg_temp.must_fail(
    format('DELETE FROM public.bcp_case_links WHERE id = %L', _r.link),
    'BCP_CASE_LINK_NO_DELETE',
    'L7.5 a link cannot be deleted, owner included');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.bcp_case_links SET case_id = %L WHERE id = %L',
           _r.case_wrong_cand, _r.link),
    'BCP_CASE_LINK_IMMUTABLE',
    'L7.6 nor re-pointed at another case');
END $l7$;

-- ---------------------------------------------------------------------------
-- L8 -- Who may read what.
-- ---------------------------------------------------------------------------
DO $l8$
DECLARE
  _r lk%ROWTYPE;
  _rev integer;
  _basis jsonb;
BEGIN
  SELECT * INTO _r FROM lk;

  -- Re-link so there is a live link to read.
  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _r.assignment;
  PERFORM public.bcp_link_preparation_to_case(gen_random_uuid(), _r.assignment, _r.case_a, _rev);
  _basis := public.bcp_case_preparation_basis(_r.case_a);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok((_basis ->> 'linked')::boolean
                 AND jsonb_array_length(_basis -> 'answers') > 0
                 AND (_basis ->> 'produces_score') = 'false',
    'L8.1 the employer reads the bound basis, the candidate''s own words, and no score');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_case_preparation_basis(%L)', _r.case_a),
    'BCP_NOT_EMPLOYER_MEMBER',
    'L8.2 a member of another employer is refused the basis');

  -- The candidate sees THAT it is linked, and nothing about the case.
  PERFORM pg_temp.become(_r.cand_a);
  SET LOCAL ROLE authenticated;
  _basis := public.bcp_my_preparation_link(_r.assignment);
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok((_basis ->> 'linked')::boolean
                 AND NOT (_basis ? 'case_id')
                 AND NOT (_basis ? 'link_id'),
    'L8.3 the candidate learns their preparation was attached, and nothing about the case itself');

  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_b,
    format('SELECT public.bcp_my_preparation_link(%L)', _r.assignment),
    'BCP_NOT_CANDIDATE',
    'L8.4 and another candidate is refused it entirely');

  -- Row-level reads: anon has no way in at all. The refusal is at the GRANT,
  -- not at the policy -- an unauthenticated request never reaches a row to be
  -- filtered -- so the assertion names that, rather than an empty result it
  -- would also have got from a table that simply had no rows.
  PERFORM pg_temp.nobody();
  PERFORM pg_temp.must_fail_as('anon', NULL,
    'SELECT count(*) FROM public.bcp_case_links',
    'permission denied for table bcp_case_links',
    'L8.5 anon is refused the link table outright');
  PERFORM pg_temp.must_fail_as('anon', NULL,
    'SELECT count(*) FROM public.bcp_case_topics',
    'permission denied for table bcp_case_topics',
    'L8.6 and the topic table outright');
END $l8$;

-- ---------------------------------------------------------------------------
-- L9 -- The linkable-cases read model offers only what the RPC would accept.
-- ---------------------------------------------------------------------------
DO $l9$
DECLARE
  _r lk%ROWTYPE;
  _n bigint;
BEGIN
  SELECT * INTO _r FROM lk;

  PERFORM pg_temp.become(_r.rec_a);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.bcp_linkable_interview_cases(_r.assignment);
  PERFORM pg_temp.ok(_n = 1,
    'L9.1 exactly the one case that matches this application and candidate is offered');
  PERFORM pg_temp.ok(NOT EXISTS (
    SELECT 1 FROM public.bcp_linkable_interview_cases(_r.assignment) c
     WHERE c.case_id IN (_r.case_wrong_cand, _r.case_other_emp, _r.case_cancelled)),
    'L9.2 and neither another candidate''s case, another employer''s, nor a cancelled one');
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.become(_r.rec_b);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.bcp_linkable_interview_cases(_r.assignment);
  PERFORM pg_temp.ok(_n = 0,
    'L9.3 a member of another employer is offered nothing');
  RESET ROLE; PERFORM pg_temp.nobody();
END $l9$;

-- ---------------------------------------------------------------------------
-- L10 -- No interpretation anywhere in the bridge.
-- ---------------------------------------------------------------------------
DO $l10$
DECLARE
  _n bigint;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name IN ('bcp_case_links', 'bcp_case_topics')
     AND (c.column_name ~* '(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire|confidence)'
          OR c.column_name = 'points');
  PERFORM pg_temp.ok(_n = 0, 'L10.1 the bridge carries no column that could hold a judgement');

  SELECT count(*) INTO _n FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name IN ('bcp_case_links', 'bcp_case_topics')
     AND c.data_type = 'jsonb';
  PERFORM pg_temp.ok(_n = 0, 'L10.2 and no free-form jsonb a judgement could hide inside');
END $l10$;

DO $done$
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'BESKT PR 4 interview-case bridge suite: all groups passed';
  RAISE NOTICE '====================================================';
END $done$;

ROLLBACK;
