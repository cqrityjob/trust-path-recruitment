-- ===========================================================================
-- BESKT PR 6 -- the governed prompts and the report chain: behavioural suite
-- ===========================================================================
--
-- Proves what PR 6 claims:
--
--   the prompt reader answers ONE session with the wordings of the version
--   that session froze, and refuses or omits everything else;
--
--   the report chain refuses until the human steps have happened, refuses a
--   basis that moved, produces ONE immutable document, returns the same
--   document on a second finalisation, and cannot be edited afterwards by
--   anybody -- including the table owner.
--
-- Everything planted here is SYNTHETIC. The whole suite runs inside ONE
-- transaction and is rolled back, so it seeds nothing.
--
-- Run:  psql -v ON_ERROR_STOP=1 -f supabase/tests/bcp_conduct_prompts_and_report_test.sql
-- ===========================================================================
BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

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

/** Read a jsonb answer AS a named principal, through the real role. */
CREATE OR REPLACE FUNCTION pg_temp.json_as(_u uuid, _sql text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE _j jsonb;
BEGIN
  PERFORM pg_temp.become(_u);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _j;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _j;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $$;

CREATE TEMP TABLE rp (
  emp_a uuid, emp_b uuid,
  job_a uuid, app_a uuid,
  cand_a uuid, rec_a uuid, rec_b uuid, as2 uuid, admin_u uuid,
  v uuid, v_other uuid, prof uuid, prof_other uuid, hash text,
  pack_v uuid, role_v uuid, case_a uuid,
  assignment uuid, response uuid, link uuid,
  sess uuid, pos1 uuid, pos2 uuid, panel uuid,
  topic_item uuid, topic_key text, basis text, report_id uuid,
  n bigint, scratch text
) ON COMMIT DROP;
INSERT INTO rp DEFAULT VALUES;
GRANT ALL ON rp TO authenticated;

-- ---------------------------------------------------------------------------
-- S0 -- The spine: existing tables only, the governed path only.
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
  _emp_a uuid := 'b6000000-0000-4000-8000-00000000ea01';
  _emp_b uuid := 'b6000000-0000-4000-8000-00000000eb01';
  _cand_a uuid := 'b6000000-0000-4000-8000-0000000000c1';
  _rec_a uuid := 'b6000000-0000-4000-8000-0000000000d1';
  _rec_b uuid := 'b6000000-0000-4000-8000-0000000000d2';
  _as2 uuid := 'b6000000-0000-4000-8000-0000000000d3';
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _job_a uuid; _app_a uuid;
  _v uuid; _v_other uuid; _prof uuid; _prof_other uuid; _hash text;
  _pack_v uuid; _role_v uuid; _case uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_cand_a, 'pr6-cand-a@synthetic.test'),
    (_rec_a,  'pr6-rec-a@synthetic.test'),
    (_rec_b,  'pr6-rec-b@synthetic.test'),
    (_as2,    'pr6-assessor-2@synthetic.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_emp_a, 'SYNTETISK PR6 AB', 'synthetic-pr6-ab', 'active'),
         (_emp_b, 'SYNTETISK PR6 Rival AB', 'synthetic-pr6-rival', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES (_emp_a, _rec_a, 'admin', 'active'),
         (_emp_a, _as2,   'admin', 'active'),
         (_emp_b, _rec_b, 'admin', 'active')
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('pr6-job-a', 'PR6JA1', _emp_a, 'internal',
          'Väktare (syntetisk PR6)', 'Security officer (synthetic PR6)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_a;
  PERFORM pg_temp.nobody();

  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_a, _emp_a, _cand_a, now()) RETURNING id INTO _app_a;

  -- The bound method, and a SECOND published method that nothing pins. The
  -- second exists so "only the version this session froze" is observable
  -- rather than notional.
  _v := pg_temp.build_method('pr6-synthetic', 'recruitment_support');
  PERFORM pg_temp.submit(_v); PERFORM pg_temp.approve_all(_v); PERFORM pg_temp.publish(_v);
  _v_other := pg_temp.build_method('pr6-synthetic-other', 'recruitment_support');
  PERFORM pg_temp.submit(_v_other); PERFORM pg_temp.approve_all(_v_other);
  PERFORM pg_temp.publish(_v_other);

  SELECT id INTO _prof FROM public.beskt_exposure_profiles
   WHERE method_version_id = _v AND profile_key = 'lone_working';
  SELECT id INTO _prof_other FROM public.beskt_exposure_profiles
   WHERE method_version_id = _v_other AND profile_key = 'lone_working';
  SELECT content_hash INTO _hash FROM public.beskt_method_versions WHERE id = _v;

  SELECT pv.id, rv.id INTO _pack_v, _role_v
    FROM public.scp_interview_pack_versions pv CROSS JOIN public.scp_role_versions rv LIMIT 1;
  IF _pack_v IS NULL OR _role_v IS NULL THEN
    RAISE EXCEPTION 'PR6_SUITE: no interview pack or role version exists, so no case can be built.';
  END IF;

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, created_by)
  VALUES (_emp_a, _job_a, _app_a, _cand_a, 'SYNTETISK PR6 kandidat',
          _pack_v, _role_v, 'SYNTETISK PR6 intervju', _rec_a)
  RETURNING id INTO _case;

  PERFORM pg_temp.become(_admin);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_grant_pilot(gen_random_uuid(), _emp_a, _v,
    'Syntetisk pilot för PR6-sviten.', (current_date + 30));
  RESET ROLE; PERFORM pg_temp.nobody();

  UPDATE rp SET emp_a=_emp_a, emp_b=_emp_b, job_a=_job_a, app_a=_app_a,
    cand_a=_cand_a, rec_a=_rec_a, rec_b=_rec_b, as2=_as2, admin_u=_admin,
    v=_v, v_other=_v_other, prof=_prof, prof_other=_prof_other, hash=_hash,
    pack_v=_pack_v, role_v=_role_v, case_a=_case;
END $seed$;

-- The preparation, answered and submitted through the governed RPCs. Same
-- shape as PR 4's suite, and for the same reasons: the catalogue is invisible
-- to `authenticated`, and routing means the visible set is not known until the
-- answers settle.
CREATE FUNCTION pg_temp.pr6_fill(_assignment uuid, _omit_key text, _oral_key text,
                                 _route_item text DEFAULT NULL, _route_option text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $fill$
DECLARE _doc jsonb; _entries jsonb; _round integer := 0;
BEGIN
  LOOP
    _round := _round + 1;
    IF _round > 20 THEN RAISE EXCEPTION 'PR6_SUITE: the preparation never settled.'; END IF;
    SELECT d INTO _doc FROM public.bcp_candidate_preparation(_assignment) d;
    SELECT jsonb_agg(jsonb_build_object(
             'item_key', it ->> 'item_key', 'response_state', 'answered',
             'value_text', CASE WHEN it ->> 'answer_type' IN ('short_text','long_text')
               THEN to_jsonb('SYNTETISKT svar.'::text) END,
             'value_boolean', CASE WHEN it ->> 'answer_type' IN ('boolean','acknowledgement')
               THEN to_jsonb(true) END,
             'value_date', CASE WHEN it ->> 'answer_type' = 'date'
               THEN to_jsonb(current_date - 30) END,
             -- The routing question is answered the way that REVEALS the
             -- conditional item, because that item is the one the method binds
             -- interviewer prompts to. Taking option 0 blindly hid it, and the
             -- prompt reader's item-bound branch then had nothing to return --
             -- so the suite was proving the branch worked by never reaching it.
             'option_keys', CASE
               WHEN it ->> 'item_key' = _route_item AND _route_option IS NOT NULL
                 THEN jsonb_build_array(_route_option)
               WHEN it ->> 'answer_type' IN ('single_choice','multi_choice')
                 THEN jsonb_build_array(it -> 'options' -> 0 ->> 'option_key')
               ELSE '[]'::jsonb END)
           ORDER BY (it ->> 'sequence_position')::integer)
      INTO _entries FROM jsonb_array_elements(_doc -> 'items') it
     WHERE (it -> 'answer' IS NULL OR jsonb_typeof(it -> 'answer') = 'null')
       AND (it ->> 'item_key') IS DISTINCT FROM _omit_key
       AND (it ->> 'item_key') IS DISTINCT FROM _oral_key;
    EXIT WHEN _entries IS NULL OR jsonb_array_length(_entries) = 0;
    PERFORM public.bcp_save_answers(gen_random_uuid(), _assignment,
      (_doc -> 'response' ->> 'revision')::integer, _entries);
  END LOOP;
END $fill$;

DO $prepare$
DECLARE
  _r rp%ROWTYPE; _res jsonb; _assignment uuid; _doc jsonb;
  _omit text; _oral text; _resp uuid; _rev integer;
  _route_item text; _route_option text; _prompt_item text;
BEGIN
  SELECT * INTO _r FROM rp;

  -- Read as the OWNER, before anyone signs in: routing rules and item options
  -- are governance content and the candidate cannot see either.
  SELECT i.item_key, o.option_key INTO _route_item, _route_option
    FROM public.beskt_routing_rules r
    JOIN public.beskt_items i ON i.id = r.source_item_id
    JOIN public.beskt_item_options o ON o.id = r.condition_option_id
   WHERE r.method_version_id = _r.v
     AND r.action = 'show'
     AND r.condition_kind = 'option_selected'
   ORDER BY r.evaluation_order LIMIT 1;

  -- Likewise as the owner: which item the method binds interviewer prompts to.
  -- The candidate cannot see beskt_items or beskt_prompts at all, so asking
  -- this question from inside their role silently answered "none" and the
  -- suite quietly chose a theme with no prompts on it.
  SELECT i.item_key INTO _prompt_item
    FROM public.beskt_items i
   WHERE i.method_version_id = _r.v
     AND EXISTS (SELECT 1 FROM public.beskt_prompts p WHERE p.item_id = i.id)
   ORDER BY i.display_order LIMIT 1;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_assign(gen_random_uuid(), _r.app_a, _r.v, _r.prof, _r.hash,
                            public.bcp_notice_version(), NULL);
  _assignment := (_res ->> 'assignment_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.become(_r.cand_a); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), _assignment,
    public.bcp_notice_version(), public.bcp_notice_hash(_assignment, 'sv-SE'), 'sv-SE');
  PERFORM pg_temp.pr6_fill(_assignment, NULL, NULL, _route_item, _route_option);
  SELECT d INTO _doc FROM public.bcp_candidate_preparation(_assignment) d;
  -- The item to SKIP is chosen deliberately: the one the method already
  -- carries interviewer prompts for, so the prompt reader's item-bound branch
  -- is exercised against the method's OWN content rather than against a prompt
  -- this suite planted. Only the document is consulted here -- the catalogue
  -- is invisible to the candidate -- and _prompt_item was resolved as the
  -- owner above.
  SELECT it ->> 'item_key' INTO _omit
    FROM jsonb_array_elements(_doc -> 'items') it
   WHERE it ->> 'item_key' = _prompt_item
   LIMIT 1;
  IF _omit IS NULL THEN
    RAISE EXCEPTION
      'PR6_SUITE: the prompt-bearing item % is not in the settled preparation, so the prompt reader cannot be proved against a real theme.',
      coalesce(_prompt_item, '(none)');
  END IF;
  SELECT it ->> 'item_key' INTO _oral FROM jsonb_array_elements(_doc -> 'items') it
   WHERE (it ->> 'discuss_orally_allowed')::boolean
     AND (it ->> 'item_key') IS DISTINCT FROM _omit
   ORDER BY (it ->> 'sequence_position')::integer DESC LIMIT 1;
  IF _omit IS NULL OR _oral IS NULL THEN
    RAISE EXCEPTION 'PR6_SUITE: no item to skip or take orally, so no theme can exist.';
  END IF;
  PERFORM public.bcp_save_answers(gen_random_uuid(), _assignment,
    (_doc -> 'response' ->> 'revision')::integer,
    jsonb_build_array(
      jsonb_build_object('item_key', _omit, 'response_state', 'omitted'),
      jsonb_build_object('item_key', _oral, 'response_state', 'discuss_orally')));
  PERFORM pg_temp.pr6_fill(_assignment, _omit, _oral, _route_item, _route_option);
  PERFORM public.bcp_submit(gen_random_uuid(), _assignment,
    (SELECT (d -> 'response' ->> 'revision')::integer
       FROM public.bcp_candidate_preparation(_assignment) d));
  RESET ROLE; PERFORM pg_temp.nobody();

  SELECT id INTO _resp FROM public.bcp_responses
   WHERE assignment_id = _assignment AND response_state = 'submitted'
   ORDER BY response_version DESC LIMIT 1;
  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _assignment;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_link_preparation_to_case(gen_random_uuid(), _assignment, _r.case_a, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();

  UPDATE rp SET assignment = _assignment, response = _resp,
    link = (SELECT id FROM public.bcp_case_links
             WHERE case_id = _r.case_a AND unlinked_at IS NULL);
END $prepare$;

-- ---------------------------------------------------------------------------
-- P -- GAP A: the governed prompts.
--
-- The fixture's own prompts hang off an item that is NOT one of the derived
-- themes, so the item-bound branch would return nothing and prove nothing.
-- One prompt is therefore planted ON A THEME'S ITEM, through the governance
-- editor and the draft path -- never by reaching around a guard -- so the
-- branch is exercised with a row that has to come back.
-- ---------------------------------------------------------------------------
DO $prompts$
DECLARE
  _r rp%ROWTYPE; _sess uuid; _res jsonb; _j jsonb;
  _topic_item uuid; _topic_key text; _expected integer; _got integer;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_start_session(gen_random_uuid(), _r.link);
  _sess := (_res ->> 'session_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();

  SELECT t.item_id, t.item_key INTO _topic_item, _topic_key
    FROM public.bcp_case_topics t WHERE t.link_id = _r.link ORDER BY t.display_order LIMIT 1;
  UPDATE rp SET sess = _sess, pos1 = (_res ->> 'position_id')::uuid,
                topic_item = _topic_item, topic_key = _topic_key;

  _j := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_topic_prompts(%L)', _sess));

  PERFORM pg_temp.ok(_j ->> 'available' = 'true',
    'P1.1 the prompt reader answers for a published bound version');
  PERFORM pg_temp.ok((_j ->> 'method_version_id')::uuid = _r.v,
    'P1.2 it answers for the version the session FROZE');

  -- EXACTLY the bound version's prompts for the frozen themes: not fewer
  -- (the item-bound branch works) and not more (nothing leaks in from another
  -- version or another exposure profile).
  SELECT count(*) INTO _expected
    FROM public.beskt_prompts p
    JOIN public.bcp_case_topics t ON t.item_id = p.item_id
   WHERE t.link_id = _r.link
     AND p.method_version_id = _r.v
     AND p.exposure_profile_id = _r.prof
     AND p.permitted_mode = 'recruitment_support';
  SELECT count(*) INTO _got
    FROM jsonb_array_elements(_j -> 'topics') t, jsonb_array_elements(t -> 'prompts') p;

  PERFORM pg_temp.ok(_expected > 0,
    format('P1.3 the fixture binds prompts to a frozen theme, so the branch is exercised (%s)', _expected));
  PERFORM pg_temp.ok(_got = _expected,
    format('P1.4 the reader returns exactly the bound version''s theme prompts (got %s, expected %s)',
           _got, _expected));

  -- A second published version exists and is never reached: every returned
  -- prompt key belongs to a prompt of the BOUND version.
  SELECT count(*) INTO _got
    FROM jsonb_array_elements(_j -> 'topics') t, jsonb_array_elements(t -> 'prompts') p
   WHERE NOT EXISTS (SELECT 1 FROM public.beskt_prompts pr
                      WHERE pr.method_version_id = _r.v
                        AND pr.prompt_key = p ->> 'prompt_key');
  PERFORM pg_temp.ok(_got = 0,
    'P1.5 no returned prompt belongs to anything but the bound version');

  PERFORM pg_temp.ok(jsonb_array_length(_j -> 'stage_prompts') > 0,
    'P1.6 the method''s own stage wordings are returned under stage_prompts');

  PERFORM pg_temp.ok(_j ->> 'produces_score' = 'false' AND _j ->> 'interpretation' = 'none',
    'P1.7 the prompt payload says what it is not');
END $prompts$;

-- ---------------------------------------------------------------------------
-- P2 -- Who is refused, and what a withdrawn version answers.
-- ---------------------------------------------------------------------------
DO $prompts_refusals$
DECLARE _r rp%ROWTYPE; _j jsonb;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.must_fail_as('anon', NULL,
    format('SELECT public.bcp_conduct_topic_prompts(%L)', _r.sess),
    'permission denied',
    'P2.1 anon cannot execute the prompt reader at all');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_topic_prompts(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'P2.2 a member of another employer is refused the prompts');

  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_conduct_topic_prompts(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'P2.3 the candidate is refused the interviewer prompts');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_topic_prompts(%L)', gen_random_uuid()),
    'BCP_CONDUCT_SESSION_NOT_FOUND',
    'P2.4 an unknown session is a refusal rather than an empty answer');

END $prompts_refusals$;

-- ---------------------------------------------------------------------------
-- R1 -- The blockers, in the order a human meets them.
-- ---------------------------------------------------------------------------
DO $blockers$
DECLARE
  _r rp%ROWTYPE; _res jsonb; _prev jsonb; _rev integer; _item text; _pos2 uuid; _panel uuid;
BEGIN
  SELECT * INTO _r FROM rp;

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(
    _prev -> 'blockers' @> '[{"code":"BCP_CONDUCT_NOTHING_DOCUMENTED"}]'::jsonb,
    'R1.1 an empty conversation is blocked for having nothing to report');

  -- The blocker reader answers directly too, not only through the preview:
  -- a screen that wants to say what is missing without rendering the whole
  -- document calls it on its own, and it has to be reachable that way.
  PERFORM pg_temp.ok(
    pg_temp.count_as(_r.rec_a,
      format('SELECT count(*) FROM public.bcp_conduct_report_blockers(%L)', _r.sess)) > 0,
    'R1.1b the blocker reader is reachable on its own, not only through the preview');

  -- And finalising while a blocker stands is refused BY NAME. Proving the
  -- preview lists a blocker is not the same as proving the signature path
  -- honours it -- a report written over an open blocker is the failure this
  -- whole chain exists to prevent.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, _prev ->> 'basis_hash'),
    'BCP_CONDUCT_REPORT_BLOCKED',
    'R1.1c and finalising while a blocker stands is refused, even with the correct basis hash');

  -- Document both themes as the first assessor.
  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _r.pos1;
  FOR _item IN SELECT item_key FROM public.bcp_case_topics WHERE link_id = _r.link
                ORDER BY display_order LOOP
    _res := public.bcp_conduct_save_entry(gen_random_uuid(), _r.pos1, _rev,
      jsonb_build_object('item_key', _item,
        'observable_fact', 'SYNTETISKT observerbart faktum för ' || _item,
        'candidate_explanation', 'SYNTETISK kandidatförklaring',
        'interviewer_interpretation', 'SYNTETISK tolkning',
        'alternative_explanation', 'SYNTETISK alternativ förklaring',
        'protective_factor', 'SYNTETISK skyddande faktor',
        'verification_need', 'SYNTETISKT verifieringsbehov'));
    _rev := (_res ->> 'position_revision')::integer;
  END LOOP;
  -- One correction, so the report has a chain to carry.
  _res := public.bcp_conduct_save_entry(gen_random_uuid(), _r.pos1, _rev,
    jsonb_build_object('item_key', _r.topic_key,
      'observable_fact', 'SYNTETISKT RÄTTAT faktum'),
    (SELECT id FROM public.bcp_conduct_entries
      WHERE position_id = _r.pos1 AND item_key = _r.topic_key
        AND superseded_by_entry_id IS NULL),
    'SYNTETISKT skäl: kandidaten förtydligade efteråt');
  _rev := (_res ->> 'position_revision')::integer;
  -- One verification, so the report has a history to carry.
  PERFORM public.bcp_conduct_record_verification(gen_random_uuid(),
    (SELECT id FROM public.bcp_conduct_entries
      WHERE position_id = _r.pos1 AND item_key = _r.topic_key
        AND superseded_by_entry_id IS NULL),
    _rev, 'verified', 'SYNTETISK källa', 'SYNTETISK anteckning');
  RESET ROLE; PERFORM pg_temp.nobody();

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(
    _prev -> 'blockers' @> '[{"code":"BCP_CONDUCT_POSITION_OPEN"}]'::jsonb,
    'R1.2 an open position blocks the report');

  -- A second assessor joins, documents the SAME theme differently, and locks.
  PERFORM pg_temp.become(_r.as2); SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_join_session(gen_random_uuid(), _r.sess, 'assessor');
  _pos2 := (_res ->> 'position_id')::uuid;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _pos2;
  _res := public.bcp_conduct_save_entry(gen_random_uuid(), _pos2, _rev,
    jsonb_build_object('item_key', _r.topic_key,
      'observable_fact', 'SYNTETISKT ANNAT faktum om samma tema'));
  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _pos2,
    (_res ->> 'position_revision')::integer);
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE rp SET pos2 = _pos2;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _r.pos1;
  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _r.pos1, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(
    _prev -> 'blockers' @> '[{"code":"BCP_CONDUCT_PANEL_REQUIRED"}]'::jsonb,
    'R1.3 two positions require a panel before a report exists');

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_open_panel(gen_random_uuid(), _r.sess);
  _panel := (_res ->> 'panel_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE rp SET panel = _panel;

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(
    _prev -> 'blockers' @> '[{"code":"BCP_CONDUCT_PANEL_NOT_REVEALED"}]'::jsonb,
    'R1.4 an unrevealed panel blocks the report');

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_reveal_panel(gen_random_uuid(), _panel,
    (SELECT revision FROM public.bcp_conduct_panels WHERE id = _panel));
  RESET ROLE; PERFORM pg_temp.nobody();

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(
    _prev -> 'blockers' @> '[{"code":"BCP_CONDUCT_RESOLUTION_MISSING"}]'::jsonb,
    'R1.5 a theme both assessors documented needs a recorded panel outcome');

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_record_resolution(gen_random_uuid(), _panel,
    (SELECT revision FROM public.bcp_conduct_panels WHERE id = _panel),
    _r.topic_key, 'disagreed', NULL,
    'SYNTETISK avvikande ståndpunkt, bevarad ordagrant',
    'SYNTETISK motivering till panelens hantering');
  RESET ROLE; PERFORM pg_temp.nobody();

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok((_prev ->> 'blocker_count')::integer = 0,
    format('R1.6 with every human step taken there is nothing left blocking (got %s)',
           _prev ->> 'blocker_count'));
  UPDATE rp SET basis = _prev ->> 'basis_hash';
END $blockers$;

-- ---------------------------------------------------------------------------
-- R2 -- What the payload carries, and what it must never carry.
-- ---------------------------------------------------------------------------
DO $payload$
DECLARE _r rp%ROWTYPE; _prev jsonb; _p jsonb; _n integer;
BEGIN
  SELECT * INTO _r FROM rp;
  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  _p := _prev -> 'payload';

  PERFORM pg_temp.ok((_p -> 'case' ->> 'case_id')::uuid = _r.case_a
                 AND (_p -> 'case' ->> 'application_id')::uuid = _r.app_a
                 AND (_p -> 'case' ->> 'candidate_user_id')::uuid = _r.cand_a,
    'R2.1 the report names the case, the application and the candidate');

  PERFORM pg_temp.ok((_p -> 'bound' ->> 'method_version_id')::uuid = _r.v
                 AND _p -> 'bound' ->> 'content_hash' = _r.hash,
    'R2.2 it carries the bound method version and its content hash');

  PERFORM pg_temp.ok(_p -> 'bound' ->> 'answers_content_hash' ~ '^[0-9a-f]{64}$'
                 AND (_p -> 'bound' ->> 'response_id')::uuid = _r.response,
    'R2.3 it carries the answers hash and the frozen submission');

  PERFORM pg_temp.ok(jsonb_array_length(_p -> 'candidate_preparation') > 0,
    'R2.4 it carries the candidate''s own frozen answers');
  PERFORM pg_temp.ok(jsonb_array_length(_p -> 'themes') = 2,
    'R2.5 it carries the derived themes');
  PERFORM pg_temp.ok(jsonb_array_length(_p -> 'positions') = 2,
    'R2.6 it carries BOTH independent positions, whole');

  SELECT count(*) INTO _n
    FROM jsonb_array_elements(_p -> 'positions') pos,
         jsonb_array_elements(pos -> 'entries') e
   WHERE jsonb_array_length(e -> 'corrections') > 0;
  PERFORM pg_temp.ok(_n >= 1, 'R2.7 it carries the correction chain, not only the live version');

  SELECT count(*) INTO _n
    FROM jsonb_array_elements(_p -> 'positions') pos,
         jsonb_array_elements(pos -> 'entries') e
   WHERE jsonb_array_length(e -> 'verifications') > 0;
  PERFORM pg_temp.ok(_n >= 1, 'R2.8 it carries the verification history');

  SELECT count(*) INTO _n
    FROM jsonb_array_elements(_p -> 'positions') pos
   WHERE jsonb_array_length(pos -> 'information_gaps') > 0;
  PERFORM pg_temp.ok(_n >= 1,
    'R2.9 a theme an assessor did not document is reported as an information GAP');

  PERFORM pg_temp.ok(jsonb_array_length(_p -> 'panel' -> 'resolutions') = 1,
    'R2.10 it carries the panel resolution');
  PERFORM pg_temp.ok(
    _p -> 'panel' -> 'resolutions' -> 0 ->> 'divergent_statement'
      = 'SYNTETISK avvikande ståndpunkt, bevarad ordagrant',
    'R2.11 the divergent position is preserved word for word');

  PERFORM pg_temp.ok(jsonb_array_length(_p -> 'audit_events') > 0,
    'R2.12 it carries the governed event ledger');

  -- What the method does not produce, said by the document itself.
  PERFORM pg_temp.ok(_p ->> 'produces_score' = 'false'
                 AND _p ->> 'produces_ranking' = 'false'
                 AND _p ->> 'produces_recommendation' = 'false'
                 AND _p ->> 'interpretation' = 'none',
    'R2.13 the payload states that it produces no score, ranking or recommendation');

  -- And no key ANYWHERE in the payload reaches for a judgement vocabulary.
  SELECT count(*) INTO _n
    FROM jsonb_object_keys(_p) k
   WHERE k ~ '(score|rank|verdict|suitab|credib|truthful|recommend|risk|grade|rating)';
  PERFORM pg_temp.ok(_n = 3,
    format('R2.14 the only judgement words at the top level are the three DENIALS (got %s)', _n));
END $payload$;

-- ---------------------------------------------------------------------------
-- R3 -- Finalisation: what is signed is what was read.
-- ---------------------------------------------------------------------------
DO $finalise$
DECLARE _r rp%ROWTYPE; _fin jsonb; _prev jsonb; _id uuid;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, NULL)',
           gen_random_uuid(), _r.sess),
    'BCP_CONDUCT_PREVIEW_REQUIRED',
    'R3.1 finalising without a preview hash is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, repeat('a', 64)),
    'BCP_CONDUCT_STALE_PREVIEW',
    'R3.2 finalising a basis that is not the current one is refused');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, _r.basis),
    'BCP_CONDUCT_NOT_PERMITTED',
    'R3.3 a member of another employer cannot finalise');

  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, _r.basis),
    'BCP_CONDUCT_NOT_PERMITTED',
    'R3.4 the candidate cannot finalise a report about themselves');

  _fin := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, _r.basis));
  PERFORM pg_temp.ok((_fin ->> 'version_number')::integer = 1
                 AND _fin ->> 'unchanged' = 'false',
    'R3.5 the first finalisation writes version 1');
  UPDATE rp SET report_id = (_fin ->> 'report_id')::uuid;

  -- The act of finalising appends an event. The BASIS must not move because
  -- of it, or the document could never be recognised as unchanged again.
  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(_prev ->> 'basis_hash' = _r.basis,
    'R3.6 the basis hash is stable across the write it describes');
  PERFORM pg_temp.ok(_prev ->> 'content_hash' <> _r.basis,
    'R3.7 the content hash still covers the whole payload, ledger included');

  _fin := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, _prev ->> 'basis_hash'));
  PERFORM pg_temp.ok(_fin ->> 'unchanged' = 'true'
                 AND (_fin ->> 'report_id')::uuid = _r.report_id,
    'R3.8 finalising an unchanged record returns the SAME report, not a second one');

  SELECT count(*) INTO _r.n FROM public.bcp_conduct_reports WHERE session_id = _r.sess;
  PERFORM pg_temp.ok(_r.n = 1,
    format('R3.9 and the table still holds exactly one report (got %s)', _r.n));
END $finalise$;

-- ---------------------------------------------------------------------------
-- R4 -- Readback, and immutability against every caller.
-- ---------------------------------------------------------------------------
DO $immutable$
DECLARE _r rp%ROWTYPE; _read jsonb; _n bigint;
BEGIN
  SELECT * INTO _r FROM rp;

  _read := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_final_report(%L)', _r.sess));
  PERFORM pg_temp.ok(_read ->> 'finalised' = 'true'
                 AND (_read ->> 'report_id')::uuid = _r.report_id,
    'R4.1 the readback returns the finalised document');
  PERFORM pg_temp.ok(_read ->> 'content_hash' ~ '^[0-9a-f]{64}$'
                 AND _read ->> 'content_hash_algorithm' = 'sha256',
    'R4.2 it carries its own content hash and names the algorithm');
  PERFORM pg_temp.ok((_read ->> 'bound_method_version_id')::uuid = _r.v,
    'R4.3 it carries the bound method version as a column, not only inside the payload');

  _n := pg_temp.count_as(_r.rec_a,
    format('SELECT jsonb_array_length(public.bcp_conduct_report_versions(%L))', _r.sess));
  PERFORM pg_temp.ok(_n = 1, 'R4.4 the version list answers the reader');

  -- Reading is the CASE's authority, and nobody else's.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_final_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'R4.5 a member of another employer cannot read the report');
  PERFORM pg_temp.must_fail_as('anon', NULL,
    format('SELECT public.bcp_conduct_final_report(%L)', _r.sess),
    'permission denied',
    'R4.6 anon cannot execute the readback');

  _n := pg_temp.count_as(_r.rec_b,
    'SELECT count(*) FROM public.bcp_conduct_reports');
  PERFORM pg_temp.ok(_n = 0,
    'R4.7 the report table itself shows another employer nothing');

  -- IMMUTABLE AGAINST THE TABLE OWNER, not only against a client. These run
  -- as the migration owner with no role set, which is the strongest caller
  -- the database has.
  BEGIN
    UPDATE public.bcp_conduct_reports SET payload = '{}'::jsonb WHERE id = _r.report_id;
    PERFORM pg_temp.ok(false, 'R4.8 FAILED: the owner rewrote a finalised payload');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.ok(SQLERRM LIKE '%BCP_CONDUCT_REPORT_IMMUTABLE%',
      'R4.8 the owner cannot rewrite a finalised payload');
  END;

  BEGIN
    UPDATE public.bcp_conduct_reports SET content_hash = repeat('b', 64) WHERE id = _r.report_id;
    PERFORM pg_temp.ok(false, 'R4.9 FAILED: the owner rewrote a content hash');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.ok(SQLERRM LIKE '%BCP_CONDUCT_REPORT_IMMUTABLE%',
      'R4.9 the owner cannot rewrite a content hash');
  END;

  BEGIN
    UPDATE public.bcp_conduct_reports SET finalised_by = _r.rec_b WHERE id = _r.report_id;
    PERFORM pg_temp.ok(false, 'R4.10 FAILED: the owner changed who signed a report');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.ok(SQLERRM LIKE '%BCP_CONDUCT_REPORT_IMMUTABLE%',
      'R4.10 the owner cannot change who signed a report');
  END;

  BEGIN
    DELETE FROM public.bcp_conduct_reports WHERE id = _r.report_id;
    PERFORM pg_temp.ok(false, 'R4.11 FAILED: the owner deleted a finalised report');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.ok(SQLERRM LIKE '%BCP_CONDUCT_REPORT_IMMUTABLE%',
      'R4.11 the owner cannot delete a finalised report');
  END;

  BEGIN
    UPDATE public.bcp_conduct_reports SET status = 'final'
     WHERE id = _r.report_id AND status = 'final';
    PERFORM pg_temp.ok(false, 'R4.12 FAILED: a no-op status update was accepted');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.ok(SQLERRM LIKE '%BCP_CONDUCT_REPORT_IMMUTABLE%',
      'R4.12 status may only step DOWN from final to superseded');
  END;
END $immutable$;

-- ---------------------------------------------------------------------------
-- R5 -- A changed record makes a NEW version, and the old one steps down.
-- ---------------------------------------------------------------------------
DO $supersede$
DECLARE _r rp%ROWTYPE; _prev jsonb; _fin jsonb; _n bigint; _other text;
BEGIN
  SELECT * INTO _r FROM rp;

  -- The record has to genuinely MOVE for a second version to be honest. It
  -- cannot move by reopening a position: PR 5A refuses that once the panel has
  -- revealed, precisely so a recorded view cannot be revised in the light of
  -- somebody else's. So it moves the way the product actually allows after a
  -- reveal -- the panel records its handling of the OTHER theme.
  SELECT item_key INTO _other FROM public.bcp_case_topics
   WHERE link_id = _r.link AND item_key <> _r.topic_key LIMIT 1;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_conduct_record_resolution(gen_random_uuid(), _r.panel,
    (SELECT revision FROM public.bcp_conduct_panels WHERE id = _r.panel),
    _other, 'agreed', 'SYNTETISK gemensam formulering om det andra temat', NULL,
    'SYNTETISK motivering till det andra temat');
  RESET ROLE; PERFORM pg_temp.nobody();

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(_prev ->> 'basis_hash' <> _r.basis,
    'R5.1 a record that actually changed produces a different basis');

  -- The hash the owner previewed BEFORE the change is now stale, and refused.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, _r.basis),
    'BCP_CONDUCT_STALE_PREVIEW',
    'R5.2 the previous basis is refused once the record has moved');

  _fin := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_finalise_report(%L, %L, %L)',
           gen_random_uuid(), _r.sess, _prev ->> 'basis_hash'));
  PERFORM pg_temp.ok((_fin ->> 'version_number')::integer = 2,
    'R5.3 finalising the changed record writes version 2');

  SELECT count(*) INTO _n FROM public.bcp_conduct_reports
   WHERE session_id = _r.sess AND status = 'final';
  PERFORM pg_temp.ok(_n = 1,
    format('R5.4 exactly one report is final at a time (got %s)', _n));

  SELECT count(*) INTO _n FROM public.bcp_conduct_reports
   WHERE id = _r.report_id AND status = 'superseded';
  PERFORM pg_temp.ok(_n = 1,
    'R5.5 the previous report is superseded rather than deleted');

  SELECT count(*) INTO _n FROM public.bcp_conduct_reports WHERE session_id = _r.sess;
  PERFORM pg_temp.ok(_n = 2,
    'R5.6 both versions remain readable, so the history is not rewritten');

  -- And the superseded document is still byte-for-byte what it was.
  SELECT count(*) INTO _n FROM public.bcp_conduct_reports
   WHERE id = _r.report_id AND basis_hash = _r.basis;
  PERFORM pg_temp.ok(_n = 1,
    'R5.7 the superseded report still carries the basis it was signed at');
END $supersede$;

-- ---------------------------------------------------------------------------
-- R6 -- The privilege shape, read from the catalogue rather than assumed.
-- ---------------------------------------------------------------------------
DO $privileges$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'bcp_conduct_reports'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND grantee IN ('anon', 'authenticated', 'service_role');
  PERFORM pg_temp.ok(_n = 0,
    format('R6.1 no client role holds table DML on the report table (got %s)', _n));

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'bcp_conduct_reports' AND cmd <> 'SELECT';
  PERFORM pg_temp.ok(_n = 0, 'R6.2 the report table has no write policy');

  PERFORM pg_temp.ok(
    NOT has_function_privilege('authenticated',
      'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE'),
    'R6.3 the unguarded basis builder is not client-callable');

  PERFORM pg_temp.ok(
    NOT has_function_privilege('authenticated', 'public.bcp_guard_conduct_report()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.bcp_guard_conduct_report()', 'EXECUTE'),
    'R6.4 the immutability guard is not published as an API');

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'bcp_conduct_reports'
     AND column_name ~ '(score|rank|verdict|suitab|credib|truthful|recommend|risk|grade|rating|level|weight|threshold|total)';
  PERFORM pg_temp.ok(_n = 0,
    format('R6.5 the report table has nowhere to store a judgement (got %s such column(s))', _n));
END $privileges$;

-- ---------------------------------------------------------------------------
-- P3 -- A version that is withdrawn stops answering. Deliberately LAST: the
--       governed lifecycle publishes from 'in_review', never from
--       'suspended', so a version taken down here cannot be put back for the
--       rest of the suite -- and reaching around that guard to restore it
--       would be proving the reader against a state the product cannot reach.
-- ---------------------------------------------------------------------------
DO $withdrawn$
DECLARE _r rp%ROWTYPE; _j jsonb;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.become('b2000000-0000-4000-8000-0000000000b1');
  SET LOCAL ROLE authenticated;
  PERFORM public.beskt_suspend_version(gen_random_uuid(), _r.v,
    (SELECT revision FROM public.beskt_method_versions WHERE id = _r.v),
    'SYNTETISKT skäl: sviten prövar vad en indragen version svarar.');
  RESET ROLE; PERFORM pg_temp.nobody();

  _j := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_topic_prompts(%L)', _r.sess));
  PERFORM pg_temp.ok(_j ->> 'available' = 'false' AND _j ->> 'reason' = 'version_not_published',
    'P3.1 a suspended version answers "unavailable" with a reason, not wordings');
  PERFORM pg_temp.ok(jsonb_array_length(_j -> 'topics') = 0
                 AND jsonb_array_length(_j -> 'stage_prompts') = 0,
    'P3.2 and returns no prompt of any kind while suspended');

  -- The REPORT is unaffected: it froze its own content hash and version, and a
  -- later governance decision about the method cannot reach back into a
  -- document somebody already signed.
  _j := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_final_report(%L)', _r.sess));
  PERFORM pg_temp.ok(_j ->> 'finalised' = 'true'
                 AND (_j ->> 'bound_method_version_id')::uuid = _r.v,
    'P3.3 a finalised report still reads back after its method version is withdrawn');
END $withdrawn$;

-- ---------------------------------------------------------------------------
DO $done$
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'BESKT PR 6 prompts-and-report suite: all groups passed';
  RAISE NOTICE '====================================================';
END $done$;

ROLLBACK;
