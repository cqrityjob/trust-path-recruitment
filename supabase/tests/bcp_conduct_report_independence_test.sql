-- ===========================================================================
-- BESKT — the report preview obeys the independence rule.
--
-- Proves 20261124090000 against a replayed schema, through REAL authenticated
-- sessions, at the database boundary. Not a UI test: every assertion below
-- calls the RPC the browser calls, as the role the browser holds
-- (`authenticated`), with the caller's identity set the way PostgREST sets it.
--
-- ── WHAT THIS HAS TO PROVE ─────────────────────────────────────────────
--
-- Before the fix, `bcp_conduct_preview_report` returned every assessor's
-- entries to anyone who could read the case, and `bcp_conduct_report_blockers`
-- answered anybody at all. So the suite proves both directions:
--
--   REFUSED   an assessor whose own position is open cannot obtain a
--             colleague's record — and the refusal is a refusal, not an empty
--             list that a client might render as "nothing recorded";
--   PERMITTED the same assessor, after locking, gets the document;
--   ABSENT    the colleague's text does not appear ANYWHERE in the returned
--             value, which is checked against the whole jsonb rendered to
--             text rather than against the field it is supposed to be in.
--
-- The last one matters most. A payload that withholds `positions` but leaks
-- the same sentence through an audit event or a gap list has not withheld it.
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
-- B0 -- The scenario: one session, two assessors, one documented theme each.
--
-- rec_a opens the session (which gives rec_a a position), as2 joins, and only
-- as2 locks. That is the exact state the defect lived in: one assessor
-- finished, one still thinking, and a document that handed the first one's
-- words to the second.
-- ---------------------------------------------------------------------------
DO $scenario$
DECLARE
  _r rp%ROWTYPE; _res jsonb; _rev integer; _pos2 uuid;
  _topic_item uuid; _topic_key text;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_start_session(gen_random_uuid(), _r.link);
  UPDATE rp SET sess = (_res ->> 'session_id')::uuid,
                pos1 = (_res ->> 'position_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();

  SELECT * INTO _r FROM rp;
  SELECT t.item_id, t.item_key INTO _topic_item, _topic_key
    FROM public.bcp_case_topics t WHERE t.link_id = _r.link
    ORDER BY t.display_order LIMIT 1;
  UPDATE rp SET topic_item = _topic_item, topic_key = _topic_key;

  -- Assessor TWO documents a distinctive sentence and LOCKS. This is the
  -- material that must not reach assessor one while assessor one is open.
  PERFORM pg_temp.become(_r.as2); SET LOCAL ROLE authenticated;
  _res := public.bcp_conduct_join_session(gen_random_uuid(), _r.sess, 'assessor');
  _pos2 := (_res ->> 'position_id')::uuid;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _pos2;
  _res := public.bcp_conduct_save_entry(gen_random_uuid(), _pos2, _rev,
    jsonb_build_object('item_key', _topic_key,
      'observable_fact', 'KANARIE-AS2-IAKTTAGELSE',
      'candidate_explanation', 'KANARIE-AS2-FORKLARING',
      'interviewer_interpretation', 'KANARIE-AS2-TOLKNING'));
  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _pos2,
    (_res ->> 'position_revision')::integer);
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE rp SET pos2 = _pos2;

  -- Assessor ONE documents too, and deliberately does NOT lock.
  SELECT * INTO _r FROM rp;
  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _r.pos1;
  PERFORM public.bcp_conduct_save_entry(gen_random_uuid(), _r.pos1, _rev,
    jsonb_build_object('item_key', _r.topic_key,
      'observable_fact', 'KANARIE-REC-A-IAKTTAGELSE'));
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (SELECT state FROM public.bcp_conduct_positions WHERE id = _r.pos1) = 'open'
      AND (SELECT state FROM public.bcp_conduct_positions WHERE id = _pos2) = 'locked',
    'B0.1 the scenario stands: assessor one is open, assessor two is locked');

  -- The predicate the fix leans on must actually be false here, or every
  -- refusal below would pass for the wrong reason.
  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ok(
    NOT public.bcp_conduct_may_see_others(_r.sess),
    'B0.2 and bcp_conduct_may_see_others is FALSE for the open assessor');
  RESET ROLE; PERFORM pg_temp.nobody();
END $scenario$;

-- ---------------------------------------------------------------------------
-- B1 -- The boundary itself, before the lock.
-- ---------------------------------------------------------------------------
DO $before_lock$
DECLARE _r rp%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_VISIBLE_YET',
    'B1.1 an assessor with an OPEN position is refused the report, by name');

  -- A refusal, not an empty document. An empty payload would be rendered by
  -- a client as "nobody recorded anything", which is a false statement about
  -- a colleague who recorded plenty.
  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.bcp_conduct_positions p
       WHERE p.session_id = _r.sess AND p.state = 'locked'
         AND p.assessor_id = _r.rec_a),
    'B1.2 and the refusal is not a side effect of the caller having locked');

  -- The blocker reader stays reachable: it is how a screen says what is
  -- still missing without disclosing anybody's record.
  PERFORM pg_temp.ok(
    pg_temp.count_as(_r.rec_a,
      format('SELECT count(*) FROM public.bcp_conduct_report_blockers(%L)', _r.sess)) > 0,
    'B1.3 the blocker reader still answers the same caller, so "what is missing" survives');
END $before_lock$;

-- ---------------------------------------------------------------------------
-- B2 -- Everyone else, before and after: the refusal is not only about locks.
-- ---------------------------------------------------------------------------
DO $outsiders$
DECLARE _r rp%ROWTYPE;
BEGIN
  SELECT * INTO _r FROM rp;

  -- Another employer's recruiter. Refused on the CASE authority, which is
  -- checked before the independence rule, so the message names the case.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B2.1 another employer is refused the report');
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT count(*) FROM public.bcp_conduct_report_blockers(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B2.2 and is refused the blocker list too — it describes a case that is not theirs');

  -- The candidate the interview is ABOUT. They own their own answers; the
  -- interviewers' notes about them are not theirs to read here.
  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B2.3 the candidate is refused the report');
  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT count(*) FROM public.bcp_conduct_report_blockers(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B2.4 and the candidate is refused the blocker list');

  -- Signed in, but nobody in particular.
  PERFORM pg_temp.must_fail_as('authenticated', gen_random_uuid(),
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B2.5 a roleless authenticated user is refused the report');
  PERFORM pg_temp.must_fail_as('authenticated', gen_random_uuid(),
    format('SELECT count(*) FROM public.bcp_conduct_report_blockers(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B2.6 and a roleless authenticated user is refused the blocker list — this answered ANYONE before');

  -- A forged session id buys nothing: it is not a session, and the answer
  -- says so without saying anything about any real one.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_preview_report(%L)', gen_random_uuid()),
    'BCP_CONDUCT_SESSION_NOT_FOUND',
    'B2.7 a forged session id is refused as not-a-session');
END $outsiders$;

-- ---------------------------------------------------------------------------
-- B3 -- anon, and the internal helper.
-- ---------------------------------------------------------------------------
DO $anon_and_helper$
DECLARE _r rp%ROWTYPE; _msg text;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.ok(
    NOT has_function_privilege('anon', 'public.bcp_conduct_preview_report(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.bcp_conduct_report_blockers(uuid)', 'EXECUTE'),
    'B3.1 anon cannot execute either report reader');

  -- The helper the preview delegates to must not be an alternative oracle:
  -- it is the function that actually reads past the row policies.
  PERFORM pg_temp.ok(
    NOT has_function_privilege('authenticated',
          'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon',
          'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE'),
    'B3.2 the basis builder is not client-callable, so the fix cannot be walked around');

  -- And prove it by trying, as the open assessor, through the real role.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_build_report_basis(%L)', _r.sess),
    'permission denied',
    'B3.3 and calling the helper directly is refused at the privilege, not by convention');
END $anon_and_helper$;

-- ---------------------------------------------------------------------------
-- B4 -- NO LEAKAGE. The colleague's words appear nowhere in what the open
--       assessor can obtain, from any of the report readers.
--
-- Checked against the whole answer rendered to text. A payload that withheld
-- `positions` but carried the same sentence in an audit event, a gap list or
-- a panel resolution would pass a field-by-field check and still have leaked.
-- ---------------------------------------------------------------------------
DO $no_leak$
DECLARE _r rp%ROWTYPE; _blob text; _final jsonb; _versions jsonb;
BEGIN
  SELECT * INTO _r FROM rp;

  _blob := '';

  -- Everything the open assessor CAN still read from this family, gathered
  -- AS that assessor. Reading it as nobody would prove nothing about what
  -- they can obtain -- and, as the first run of this suite demonstrated,
  -- now raises BCP_NOT_AUTHENTICATED from the very check this migration adds.
  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  _blob := _blob || coalesce((
    SELECT string_agg(b.code || ' ' || b.message, ' ')
      FROM (SELECT * FROM public.bcp_conduct_report_blockers(_r.sess)) b), '');
  _final := public.bcp_conduct_final_report(_r.sess);
  _versions := public.bcp_conduct_report_versions(_r.sess);
  RESET ROLE; PERFORM pg_temp.nobody();

  _blob := _blob || coalesce(_final::text, '') || coalesce(_versions::text, '');

  PERFORM pg_temp.ok(
    position('KANARIE-AS2-IAKTTAGELSE' in _blob) = 0,
    'B4.1 the colleague''s observation appears nowhere the open assessor can reach');
  PERFORM pg_temp.ok(
    position('KANARIE-AS2-FORKLARING' in _blob) = 0,
    'B4.2 nor does the explanation they recorded');
  PERFORM pg_temp.ok(
    position('KANARIE-AS2-TOLKNING' in _blob) = 0,
    'B4.3 nor their interpretation');

  -- And there IS no finalised report to read, which is the honest answer
  -- rather than an empty document.
  PERFORM pg_temp.ok(
    (_final ->> 'finalised')::boolean IS FALSE,
    'B4.4 and the finalised readback says plainly that no report exists yet');
END $no_leak$;

-- ---------------------------------------------------------------------------
-- B5 -- After the lock, the document is permitted. The fix must not have
--       replaced a leak with a wall.
-- ---------------------------------------------------------------------------
DO $after_lock$
DECLARE _r rp%ROWTYPE; _rev integer; _prev jsonb; _blob text;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _r.pos1;
  PERFORM public.bcp_conduct_lock_position(gen_random_uuid(), _r.pos1, _rev);
  PERFORM pg_temp.ok(
    public.bcp_conduct_may_see_others(_r.sess),
    'B5.1 with every position locked the predicate turns true');
  RESET ROLE; PERFORM pg_temp.nobody();

  _prev := pg_temp.json_as(_r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));

  PERFORM pg_temp.ok(
    _prev ? 'payload' AND _prev ? 'basis_hash' AND _prev ? 'content_hash',
    'B5.2 and the report is returned, whole, to the assessor who locked');

  _blob := _prev::text;
  PERFORM pg_temp.ok(
    position('KANARIE-AS2-IAKTTAGELSE' in _blob) > 0
      AND position('KANARIE-REC-A-IAKTTAGELSE' in _blob) > 0,
    'B5.3 and it now carries BOTH assessors, which is what the document is for');

  -- The second assessor, who locked first, may read it too.
  _prev := pg_temp.json_as(_r.as2,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess));
  PERFORM pg_temp.ok(
    _prev ? 'payload',
    'B5.4 and so may the assessor who locked first');

  -- The outsiders are still out. Locking changed the independence state, not
  -- the case authority.
  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_b,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B5.5 another employer is still refused after the lock');
  PERFORM pg_temp.must_fail_as('authenticated', _r.cand_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_PERMITTED',
    'B5.6 and so is the candidate');
END $after_lock$;

-- ---------------------------------------------------------------------------
-- B6 -- Reopening closes it again. The boundary is a live predicate, not a
--       one-way latch that a single lock opens for good.
-- ---------------------------------------------------------------------------
DO $reopen$
DECLARE _r rp%ROWTYPE; _rev integer;
BEGIN
  SELECT * INTO _r FROM rp;

  PERFORM pg_temp.become(_r.rec_a); SET LOCAL ROLE authenticated;
  SELECT revision INTO _rev FROM public.bcp_conduct_positions WHERE id = _r.pos1;
  PERFORM public.bcp_conduct_reopen_position(gen_random_uuid(), _r.pos1, _rev,
    'SYNTETISK anledning att öppna igen');
  RESET ROLE; PERFORM pg_temp.nobody();

  PERFORM pg_temp.ok(
    (SELECT state FROM public.bcp_conduct_positions WHERE id = _r.pos1) <> 'locked',
    'B6.1 the position is open again');

  PERFORM pg_temp.must_fail_as('authenticated', _r.rec_a,
    format('SELECT public.bcp_conduct_preview_report(%L)', _r.sess),
    'BCP_CONDUCT_NOT_VISIBLE_YET',
    'B6.2 and the report closes again with it');
END $reopen$;

-- ---------------------------------------------------------------------------
-- B7 -- The catalogue facts the migration claims, re-proved from the suite.
-- ---------------------------------------------------------------------------
DO $catalogue$
DECLARE _n integer;
BEGIN
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('bcp_conduct_preview_report', 'bcp_conduct_report_blockers')
     AND p.prosecdef
     AND 'search_path=public' = ANY (coalesce(p.proconfig, ARRAY[]::text[]));
  PERFORM pg_temp.ok(_n = 2,
    'B7.1 both readers are SECURITY DEFINER with a pinned search_path');

  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('bcp_conduct_preview_report', 'bcp_conduct_report_blockers');
  PERFORM pg_temp.ok(_n = 2,
    'B7.2 exactly one signature each — no overload answers without the checks');

  PERFORM pg_temp.ok(
    has_function_privilege('authenticated', 'public.bcp_conduct_preview_report(uuid)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.bcp_conduct_preview_report(uuid)', 'EXECUTE'),
    'B7.3 the grants the application needs are intact');
END $catalogue$;

DO $done$
BEGIN
  RAISE NOTICE 'BESKT report independence boundary: every assertion passed.';
END $done$;

ROLLBACK;
