-- BESKT PR 5B -- the LOCAL-ONLY fixture the routed interview-tool walk runs
-- against.
--
-- Everything here is SYNTHETIC. No real employer, candidate, job, application
-- or method is represented; the passwords are throwaways for a disposable
-- database on loopback; nothing here is a product seed and nothing here is
-- ever applied to a hosted project.
--
-- It builds the one state PR 5B's surface needs and cannot build for itself:
-- a BESKT preparation that has been SUBMITTED and LINKED to an existing
-- interview case. Every step goes through the governed RPCs, as the person who
-- is allowed to take it -- the employer assigns, the candidate acknowledges,
-- answers, skips one question, asks to take another orally and submits, and
-- the employer links. Nothing is forced past a guard and no state is written
-- directly, because a walk that starts from a state the product cannot reach
-- proves nothing about the product.
--
-- It runs AFTER scripts/fixtures/beskt-candidate-preparation-fixture.sql and
-- depends on its employers, its published synthetic method and its pilot
-- grant.
--
--   beskt-interviewer@local.test   first assessor, owner of BESKT Journey AB
--   beskt-assessor@local.test      SECOND assessor, admin of the same employer
--   beskt-interviewee@local.test   the applicant whose preparation is bridged
--   beskt-outsider@local.test      (from PR 3's fixture) must be refused
--
-- Password for all of them: LocalJourney!2026
--
-- Run against a LOCAL stack only:
--   psql "$LOCAL_DB_URL" -f scripts/fixtures/beskt-interview-tool-fixture.sql

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() NOT IN ('postgres', 'beskt_e2e', 'scp_ci_test') THEN
    RAISE EXCEPTION
      'BCP_FIXTURE_WRONG_DATABASE: this fixture creates sign-in credentials and runs only against a disposable local database (got "%").',
      current_database();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.become(_u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _u::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.nobody() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · The people. Two assessors, because independence is not observable with
--     one: the whole point is that the second must not see the first's record
--     until the second has locked their own.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'b5000000-0000-4000-8000-0000000000d5',
   'authenticated', 'authenticated', 'beskt-interviewer@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Intervjuare Ett"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b5000000-0000-4000-8000-0000000000d6',
   'authenticated', 'authenticated', 'beskt-assessor@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Bedömare Två"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b5000000-0000-4000-8000-0000000000c5',
   'authenticated', 'authenticated', 'beskt-interviewee@local.test',
   crypt('LocalJourney!2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Kandidat Intervju"}'::jsonb, now(), now(), '', '', '', '', '', '', '', '')
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      confirmation_token = '', recovery_token = '', email_change_token_new = '',
      email_change = '', email_change_token_current = '', phone_change = '',
      phone_change_token = '', reauthentication_token = '';

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  FROM auth.users u
 WHERE u.id IN ('b5000000-0000-4000-8000-0000000000d5',
                'b5000000-0000-4000-8000-0000000000d6',
                'b5000000-0000-4000-8000-0000000000c5')
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('b5000000-0000-4000-8000-0000000000d5', 'b4000000-0000-4000-8000-00000000ee01', 'owner', 'active'),
  ('b5000000-0000-4000-8000-0000000000d6', 'b4000000-0000-4000-8000-00000000ee01', 'admin', 'active')
ON CONFLICT (user_id, employer_id) DO UPDATE SET status = 'active', role = EXCLUDED.role;

-- ---------------------------------------------------------------------------
-- 2 · A job of its own and the application the preparation hangs off.
--
--     Its own job rather than PR 3's, so this walk and PR 3's walk cannot
--     disturb each other's state when both are run against one stack.
-- ---------------------------------------------------------------------------
DO $job$
BEGIN
  PERFORM pg_temp.become('b4000000-0000-4000-8000-00000000ad01');
  INSERT INTO public.jobs (id, slug, short_id, employer_id, application_method,
                           title_sv, title_en, status, published_at, expires_at)
  VALUES ('b5000000-0000-4000-8000-00000000ff05', 'beskt-tool-skyddsvakt', 'BTSKY5',
          'b4000000-0000-4000-8000-00000000ee01', 'internal',
          'Skyddsvakt (syntetisk annons)', 'Protective officer (synthetic listing)',
          'published', now(), now() + interval '90 days')
  ON CONFLICT (id) DO UPDATE SET status = 'published', published_at = now();
  PERFORM pg_temp.nobody();
END $job$;

INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, consent_given_at)
VALUES ('b5000000-0000-4000-8000-00000000aa05', 'b5000000-0000-4000-8000-00000000ff05',
        'b4000000-0000-4000-8000-00000000ee01', 'b5000000-0000-4000-8000-0000000000c5', now())
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- 3 · The preparation: assigned, acknowledged, answered, submitted.
--
--     The answer payload is composed from the CANDIDATE'S OWN document rather
--     than from the method catalogue, which is deliberately invisible to
--     `authenticated`; and it repeats until the document stops offering
--     unanswered questions, because routing means one answer can reveal
--     another. This is the same shape the PR 4 suite uses, and for the same
--     reasons.
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.tool_fill(_assignment uuid, _omit_key text, _oral_key text)
RETURNS void LANGUAGE plpgsql AS $fill$
DECLARE
  _doc jsonb;
  _entries jsonb;
  _round integer := 0;
BEGIN
  LOOP
    _round := _round + 1;
    IF _round > 20 THEN
      RAISE EXCEPTION 'BCP_TOOL_FIXTURE: the preparation never settled after 20 fill rounds.';
    END IF;

    SELECT d INTO _doc FROM public.bcp_candidate_preparation(_assignment) d;

    SELECT jsonb_agg(jsonb_build_object(
             'item_key', it ->> 'item_key',
             'response_state', 'answered',
             'value_text', CASE WHEN it ->> 'answer_type' IN ('short_text', 'long_text')
               THEN to_jsonb('SYNTETISKT svar från den lokala genomgången.'::text) END,
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
  _emp uuid := 'b4000000-0000-4000-8000-00000000ee01';
  _app uuid := 'b5000000-0000-4000-8000-00000000aa05';
  _cand uuid := 'b5000000-0000-4000-8000-0000000000c5';
  _rec uuid := 'b5000000-0000-4000-8000-0000000000d5';
  _v uuid; _prof uuid; _hash text;
  _res jsonb; _assignment uuid;
  _doc jsonb; _omit_key text; _oral_key text; _ack text;
  _pack_v uuid; _role_v uuid; _case uuid; _rev integer;
BEGIN
  SELECT v.id INTO _v
    FROM public.beskt_method_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE p.slug = 'beskt-journey-synthetic' AND v.content_status = 'published'
   ORDER BY v.version_number DESC LIMIT 1;
  IF _v IS NULL THEN
    RAISE EXCEPTION
      'BCP_TOOL_FIXTURE: no published synthetic BESKT method exists. '
      'Apply scripts/fixtures/beskt-candidate-preparation-fixture.sql first.';
  END IF;

  SELECT id INTO _prof FROM public.beskt_exposure_profiles
   WHERE method_version_id = _v AND profile_key = 'lone_working';
  SELECT content_hash INTO _hash FROM public.beskt_method_versions WHERE id = _v;

  -- ---- the employer assigns ------------------------------------------------
  PERFORM pg_temp.become(_rec);
  SET LOCAL ROLE authenticated;
  _res := public.bcp_assign(gen_random_uuid(), _app, _v, _prof, _hash,
                            public.bcp_notice_version(), NULL);
  _assignment := (_res ->> 'assignment_id')::uuid;
  RESET ROLE; PERFORM pg_temp.nobody();

  -- ---- the candidate reads the notice, answers, and submits ---------------
  PERFORM pg_temp.become(_cand);
  SET LOCAL ROLE authenticated;

  _ack := public.bcp_notice_hash(_assignment, 'sv-SE');
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), _assignment,
    public.bcp_notice_version(), _ack, 'sv-SE');

  PERFORM pg_temp.tool_fill(_assignment, NULL, NULL);

  SELECT d INTO _doc FROM public.bcp_candidate_preparation(_assignment) d;

  -- The two neutral states are taken at the END of the settled sequence, so
  -- changing them cannot strand an earlier routing decision. They are what
  -- PR 4 turns into the interview themes PR 5B renders, so the walk needs
  -- both to exist.
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
      'BCP_TOOL_FIXTURE: the settled preparation has no item to skip or none that may be '
      'taken orally, so the interview themes the tool exists to render cannot be planted.';
  END IF;

  PERFORM public.bcp_save_answers(gen_random_uuid(), _assignment,
    (_doc -> 'response' ->> 'revision')::integer,
    jsonb_build_array(
      jsonb_build_object('item_key', _omit_key, 'response_state', 'omitted'),
      jsonb_build_object('item_key', _oral_key, 'response_state', 'discuss_orally')));

  PERFORM pg_temp.tool_fill(_assignment, _omit_key, _oral_key);

  PERFORM public.bcp_submit(gen_random_uuid(), _assignment,
    (SELECT (d -> 'response' ->> 'revision')::integer
       FROM public.bcp_candidate_preparation(_assignment) d));

  RESET ROLE; PERFORM pg_temp.nobody();

  -- ---- the interview case, and the bridge ---------------------------------
  SELECT pv.id, rv.id INTO _pack_v, _role_v
    FROM public.scp_interview_pack_versions pv
    CROSS JOIN public.scp_role_versions rv
   LIMIT 1;
  IF _pack_v IS NULL OR _role_v IS NULL THEN
    RAISE EXCEPTION
      'BCP_TOOL_FIXTURE: no interview pack version or role version exists, so no case can be '
      'built. The BESKT tool lives INSIDE an interview case and cannot be walked without one.';
  END IF;

  INSERT INTO public.scp_interview_cases
    (id, employer_id, job_id, application_id, candidate_user_id, candidate_display_name,
     pack_version_id, role_version_id, title, created_by)
  VALUES ('b5000000-0000-4000-8000-00000000cc05', _emp,
          'b5000000-0000-4000-8000-00000000ff05', _app, _cand,
          'SYNTETISK Kandidat Intervju', _pack_v, _role_v,
          'SYNTETISK intervju för BESKT-metodstöd', _rec)
  RETURNING id INTO _case;

  SELECT revision INTO _rev FROM public.bcp_assignments WHERE id = _assignment;

  PERFORM pg_temp.become(_rec);
  SET LOCAL ROLE authenticated;
  PERFORM public.bcp_link_preparation_to_case(gen_random_uuid(), _assignment, _case, _rev);
  RESET ROLE; PERFORM pg_temp.nobody();

  RAISE NOTICE 'BESKT tool fixture: assignment % linked to case % (skipped %, oral %)',
    _assignment, _case, _omit_key, _oral_key;
END $prepare$;

-- ---------------------------------------------------------------------------
-- What the walk needs to address the routes it will visit.
-- ---------------------------------------------------------------------------
SELECT 'E2E_TOOL_EMPLOYER_SLUG=' || e.slug AS env FROM public.employers e
 WHERE e.id = 'b4000000-0000-4000-8000-00000000ee01'
UNION ALL
SELECT 'E2E_TOOL_CASE_ID=b5000000-0000-4000-8000-00000000cc05'
UNION ALL
SELECT 'E2E_TOOL_LINK_ID=' || l.id::text
  FROM public.bcp_case_links l
 WHERE l.case_id = 'b5000000-0000-4000-8000-00000000cc05' AND l.unlinked_at IS NULL
UNION ALL
SELECT 'E2E_TOOL_TOPICS=' || count(*)::text
  FROM public.bcp_case_topics t
  JOIN public.bcp_case_links l ON l.id = t.link_id
 WHERE l.case_id = 'b5000000-0000-4000-8000-00000000cc05'
UNION ALL
SELECT 'fixture ready: ' || count(*)::text || ' live case link(s)'
  FROM public.bcp_case_links WHERE unlinked_at IS NULL;
