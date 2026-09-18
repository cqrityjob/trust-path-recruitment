-- scp_iv_create_case — a candidate ACCOUNT is bound only as the application's
-- own applicant (20261128090000).
--
-- Every call below is made through a real `authenticated` session with the
-- caller's identity set the way PostgREST sets it. The defect was reachable
-- exactly that way: an employer member calling the RPC directly could bind
-- any user to a case of theirs.
--
-- Everything is synthetic and everything rolls back.

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

CREATE OR REPLACE FUNCTION pg_temp.cb_ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(cond, false) THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.cb_refused(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — the call unexpectedly SUCCEEDED', label;
END $$;

CREATE TEMP TABLE cb (
  emp_1 uuid, emp_2 uuid, member_1 uuid, member_2 uuid,
  applicant_1 uuid, applicant_2 uuid, stranger uuid,
  app_1 uuid, app_2 uuid, pack_v uuid
) ON COMMIT DROP;
INSERT INTO cb DEFAULT VALUES;
GRANT ALL ON cb TO authenticated;

DO $seed$
DECLARE
  _emp_1 uuid := 'b6000000-0000-4000-8000-0000000000e1';
  _emp_2 uuid := 'b6000000-0000-4000-8000-0000000000e2';
  _member_1 uuid := 'b6000000-0000-4000-8000-0000000000d1';
  _member_2 uuid := 'b6000000-0000-4000-8000-0000000000d2';
  _applicant_1 uuid := 'b6000000-0000-4000-8000-0000000000c1';
  _applicant_2 uuid := 'b6000000-0000-4000-8000-0000000000c2';
  _stranger uuid := 'b6000000-0000-4000-8000-0000000000c3';
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _job_1 uuid; _job_2 uuid; _app_1 uuid; _app_2 uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_member_1, 'cb-member-1@synthetic.test'),
    (_member_2, 'cb-member-2@synthetic.test'),
    (_applicant_1, 'cb-applicant-1@synthetic.test'),
    (_applicant_2, 'cb-applicant-2@synthetic.test'),
    (_stranger, 'cb-stranger@synthetic.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employers (id, name, slug, status)
  VALUES (_emp_1, 'SYNTETISK Kandidatbindning AB', 'synthetic-cb-one', 'active'),
         (_emp_2, 'SYNTETISK Annan Arbetsgivare AB', 'synthetic-cb-two', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
  VALUES (_emp_1, _member_1, 'member', 'active'),
         (_emp_2, _member_2, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  -- Jobs are published on the platform's moderation path, as the fixture's
  -- platform administrator, rather than around the job guard.
  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('cb-job-1', 'CBJOB1', _emp_1, 'internal', 'Väktare (syntetisk)', 'Security officer (synthetic)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_1;
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en,
                           status, published_at, expires_at)
  VALUES ('cb-job-2', 'CBJOB2', _emp_2, 'internal', 'Väktare 2 (syntetisk)', 'Security officer 2 (synthetic)',
          'published', now(), now() + interval '90 days')
  RETURNING id INTO _job_2;
  PERFORM pg_temp.nobody();

  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_1, _emp_1, _applicant_1, now()) RETURNING id INTO _app_1;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job_2, _emp_2, _applicant_2, now()) RETURNING id INTO _app_2;

  UPDATE cb SET emp_1 = _emp_1, emp_2 = _emp_2, member_1 = _member_1, member_2 = _member_2,
                applicant_1 = _applicant_1, applicant_2 = _applicant_2, stranger = _stranger,
                app_1 = _app_1, app_2 = _app_2;
END $seed$;

-- The pack version is the one the startable list offers this employer, read
-- as the employer member -- so every create below is refused or accepted for
-- the candidate rule alone, never for the pack.
DO $pack$
DECLARE _m uuid; _e uuid; _v uuid;
BEGIN
  SELECT member_1, emp_1 INTO _m, _e FROM cb;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _m::text, true);
  SELECT s.pack_version_id INTO _v FROM public.scp_iv_startable_pack_versions(_e) s LIMIT 1;
  RESET ROLE;
  UPDATE cb SET pack_v = _v;
  PERFORM pg_temp.cb_ok(_v IS NOT NULL, 'CB0 the employer has a startable interview pack');
END $pack$;


DO $$ BEGIN RAISE NOTICE 'GROUP CB1 — the applicant of the application is accepted'; END $$;

DO $$
DECLARE r cb%ROWTYPE; _case uuid; _bound uuid;
BEGIN
  SELECT * INTO r FROM cb;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', r.member_1::text, true);
  _case := public.scp_iv_create_case(r.emp_1, 'CB-accepted', r.pack_v, 'Sökande Ett',
                                     r.applicant_1, NULL, NULL, r.app_1);
  RESET ROLE;
  SELECT candidate_user_id INTO _bound FROM public.scp_interview_cases WHERE id = _case;
  PERFORM pg_temp.cb_ok(_bound = r.applicant_1,
    'CB1.1 the application''s own applicant is accepted and bound to the case');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP CB2 — anybody else is refused, and nothing is written'; END $$;

DO $$
DECLARE r cb%ROWTYPE;
BEGIN
  SELECT * INTO r FROM cb;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', r.member_1::text, true);

  PERFORM pg_temp.cb_refused(format(
    'SELECT public.scp_iv_create_case(%L, %L, %L, %L, %L, NULL, NULL, %L)',
    r.emp_1, 'CB-refused', r.pack_v, 'Fel', r.stranger, r.app_1),
    'SCP_IV_CANDIDATE_NOT_APPLICANT',
    'CB2.1 a stranger''s account on the employer''s own application is refused');

  PERFORM pg_temp.cb_refused(format(
    'SELECT public.scp_iv_create_case(%L, %L, %L, %L, %L, NULL, NULL, %L)',
    r.emp_1, 'CB-refused', r.pack_v, 'Fel', r.applicant_2, r.app_1),
    'SCP_IV_CANDIDATE_NOT_APPLICANT',
    'CB2.2 an applicant of ANOTHER employer, named on this application, is refused');

  PERFORM pg_temp.cb_refused(format(
    'SELECT public.scp_iv_create_case(%L, %L, %L, %L, %L, NULL, NULL, %L)',
    r.emp_1, 'CB-refused', r.pack_v, 'Fel', r.applicant_2, r.app_2),
    'SCP_IV_CROSS_TENANT_APPLICATION',
    'CB2.3 another employer''s application, even with its real applicant, is refused');

  PERFORM pg_temp.cb_refused(format(
    'SELECT public.scp_iv_create_case(%L, %L, %L, %L, %L, NULL, NULL, %L)',
    r.emp_2, 'CB-refused', r.pack_v, 'Fel', r.applicant_2, r.app_2),
    'SCP_IV_NOT_EMPLOYER_MEMBER',
    'CB2.4 creating under an employer the caller does not belong to is refused');

  PERFORM pg_temp.cb_refused(format(
    'SELECT public.scp_iv_create_case(%L, %L, %L, %L, %L, NULL, NULL, NULL)',
    r.emp_1, 'CB-refused', r.pack_v, 'Fel', r.stranger),
    'SCP_IV_CANDIDATE_REQUIRES_APPLICATION',
    'CB2.5 a user id with no application to bind it is refused');

  PERFORM pg_temp.cb_refused(format(
    'SELECT public.scp_iv_create_case(%L, %L, %L, %L, %L, NULL, NULL, NULL)',
    r.emp_1, 'CB-refused', r.pack_v, 'Fel', r.applicant_1),
    'SCP_IV_CANDIDATE_REQUIRES_APPLICATION',
    'CB2.6 even the real applicant is refused without the application that binds them');
  RESET ROLE;

  PERFORM pg_temp.cb_ok(
    NOT EXISTS (SELECT 1 FROM public.scp_interview_cases WHERE title = 'CB-refused'),
    'CB2.7 no refused call wrote a case');
  PERFORM pg_temp.cb_ok(
    NOT EXISTS (SELECT 1 FROM public.scp_interview_cases WHERE candidate_user_id = r.stranger),
    'CB2.8 the stranger is the candidate of no case');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP CB3 — a candidate without an account is unchanged'; END $$;

DO $$
DECLARE r cb%ROWTYPE; _with_app uuid; _without uuid;
BEGIN
  SELECT * INTO r FROM cb;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', r.member_1::text, true);
  _with_app := public.scp_iv_create_case(r.emp_1, 'CB-external-app', r.pack_v, 'Extern',
                                         NULL, 'CB-EXT-1', NULL, r.app_1);
  _without := public.scp_iv_create_case(r.emp_1, 'CB-external', r.pack_v, 'Extern',
                                        NULL, 'CB-EXT-2');
  RESET ROLE;
  PERFORM pg_temp.cb_ok(_with_app IS NOT NULL,
    'CB3.1 an external reference on an application is still accepted');
  PERFORM pg_temp.cb_ok(_without IS NOT NULL,
    'CB3.2 an external reference with no application is still accepted');
  PERFORM pg_temp.cb_ok(
    (SELECT candidate_user_id IS NULL AND candidate_external_ref = 'CB-EXT-1'
       FROM public.scp_interview_cases WHERE id = _with_app),
    'CB3.3 and it binds no account');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP CB4 — nothing else about the function changed'; END $$;

DO $$
DECLARE _oid oid;
BEGIN
  SELECT p.oid INTO _oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scp_iv_create_case';
  PERFORM pg_temp.cb_ok(
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'scp_iv_create_case') = 1,
    'CB4.1 one overload');
  PERFORM pg_temp.cb_ok((SELECT prosecdef FROM pg_proc WHERE oid = _oid),
    'CB4.2 still SECURITY DEFINER');
  PERFORM pg_temp.cb_ok((SELECT 'search_path=public' = ANY (proconfig) FROM pg_proc WHERE oid = _oid),
    'CB4.3 still a fixed search_path');
  PERFORM pg_temp.cb_ok(NOT has_function_privilege('anon', _oid, 'EXECUTE'),
    'CB4.4 still not executable by anon');
  PERFORM pg_temp.cb_ok(
    position('scp_iv_case_start_basis' in (SELECT prosrc FROM pg_proc WHERE oid = _oid)) > 0
    AND position('SCP_IV_PACK_KIND_NOT_STARTABLE' in (SELECT prosrc FROM pg_proc WHERE oid = _oid)) > 0,
    'CB4.5 the later start-basis and pack-kind rules are still in the body');
END $$;

ROLLBACK;
