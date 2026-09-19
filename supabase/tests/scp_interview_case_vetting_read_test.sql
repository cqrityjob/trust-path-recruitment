-- 20261203090000 — a security vetting's case ROW is the security function's.
--
-- Proves with DIRECT reads of scp_interview_cases, as real `authenticated` and
-- `anon` sessions -- not only through scp_iv_can_read_case -- that a
-- security vetting's case row, and its metadata, is invisible to a plain
-- member, to an owner and an admin who are not the security function, to the
-- candidate, to another organisation and to anonymous callers; that the
-- appointed security function reads the same row (positive control); that
-- revoking the appointment removes it; that ordinary TRUST cases keep their
-- access; that the list count, the related rows, the quality view and the
-- RPCs keep the same boundary; that the candidate's own views still work;
-- and that the atomic start and its retry still work.
--
-- scripts/db-test.sh also runs this suite against the OLD membership policy
-- (the migration's rollback) and requires it to FAIL there.
-- Everything is synthetic and rolls back.

BEGIN;

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

\i supabase/tests/beskt_governed_content_fixture.sql

CREATE TEMP TABLE cv (
  emp uuid, emp_b uuid, owner uuid, admin_u uuid, member uuid, officer uuid, cand uuid, cand_t uuid,
  other uuid, job uuid, app uuid, app_t uuid, vet uuid, vet_case uuid, trust_case uuid, officer_row uuid
) ON COMMIT DROP;
INSERT INTO cv DEFAULT VALUES;
GRANT ALL ON cv TO authenticated;

-- A count read AS a principal, through the real role and its RLS.
CREATE FUNCTION pg_temp.n_as(_who uuid, _sql text) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE _n bigint;
BEGIN
  PERFORM pg_temp.become(_who); SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _n;
  RESET ROLE; PERFORM pg_temp.nobody();
  RETURN _n;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM pg_temp.nobody(); RAISE;
END $f$;

CREATE FUNCTION pg_temp.fill(_assignment uuid) RETURNS void LANGUAGE plpgsql AS $fill$
DECLARE _doc jsonb; _entries jsonb; _round integer := 0;
BEGIN
  LOOP
    _round := _round + 1;
    IF _round > 20 THEN RAISE EXCEPTION 'CV: the preparation never settled.'; END IF;
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

-- ---- setup ---------------------------------------------------------------------
DO $setup$
DECLARE
  _admin uuid := 'b2000000-0000-4000-8000-0000000000ad';
  _emp uuid := 'b7300000-0000-4000-8000-0000000000e1';
  _emp_b uuid := 'b7300000-0000-4000-8000-0000000000e2';
  _owner uuid := 'b7300000-0000-4000-8000-0000000000d1';
  _admin_u uuid := 'b7300000-0000-4000-8000-0000000000d2';
  _member uuid := 'b7300000-0000-4000-8000-0000000000d3';
  _officer uuid := 'b7300000-0000-4000-8000-0000000000a1';
  _cand uuid := 'b7300000-0000-4000-8000-0000000000c1';
  _cand_t uuid := 'b7300000-0000-4000-8000-0000000000c2';
  _other uuid := 'b7300000-0000-4000-8000-0000000000d9';
  _job uuid; _app uuid; _app_t uuid; _vv uuid; _vprof uuid; _vhash text; _res jsonb; _notice text;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (_owner, 'cv-owner@synthetic.test'), (_admin_u, 'cv-admin@synthetic.test'),
    (_member, 'cv-member@synthetic.test'), (_officer, 'cv-officer@synthetic.test'),
    (_cand, 'cv-cand@synthetic.test'), (_cand_t, 'cv-cand-t@synthetic.test'),
    (_other, 'cv-other@synthetic.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.employers (id, name, slug, status) VALUES
    (_emp, 'SYNTETISK Prövning AB', 'synthetic-cv-a', 'active'),
    (_emp_b, 'SYNTETISK Annan AB', 'synthetic-cv-b', 'active');
  INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
    (_emp, _owner, 'owner', 'active'), (_emp, _admin_u, 'admin', 'active'),
    (_emp, _member, 'member', 'active'), (_emp, _officer, 'member', 'active'),
    (_emp_b, _other, 'owner', 'active');

  PERFORM pg_temp.become(_admin);
  INSERT INTO public.jobs (slug, short_id, employer_id, application_method, title_sv, title_en, status, published_at, expires_at)
  VALUES ('cv-job', 'CVJOB1', _emp, 'internal', 'Säkerhetssamordnare (syntetisk)', 'Security coordinator (synthetic)',
          'published', now(), now() + interval '90 days') RETURNING id INTO _job;
  PERFORM pg_temp.nobody();
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job, _emp, _cand, now()) RETURNING id INTO _app;
  INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, consent_given_at)
  VALUES (_job, _emp, _cand_t, now()) RETURNING id INTO _app_t;

  -- The security vetting: an unreviewed method activated for internal test,
  -- the security function appointed by the owner, started by it.
  _vv := pg_temp.build_method('synthetic-cv-vetting', 'security_vetting_support');
  SELECT id INTO _vprof FROM public.beskt_exposure_profiles
   WHERE method_version_id = _vv AND permitted_mode = 'security_vetting_support' LIMIT 1;
  SELECT content_hash INTO _vhash FROM public.beskt_method_versions WHERE id = _vv;
  PERFORM pg_temp.become(_admin); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_grant_internal_test_activation(gen_random_uuid(), _emp, _vv,
    'SYNTETISKT ägarbeslut: intern funktionstest av säkerhetsprövningen.', current_date + 30);
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(_owner); SET LOCAL ROLE authenticated;
  _res := public.bcp_appoint_security_officer(gen_random_uuid(), _emp, _officer, 'SYNTETISK säkerhetsskyddschef');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(_officer); SET LOCAL ROLE authenticated;
  _res := public.bcp_start_beskt(gen_random_uuid(), _app, 'security_vetting_support', _vv, _vprof, _vhash,
    _officer, 'Kontakt: säkerhetsskyddschefen, 08-000 00 00', _officer,
    'Befattningen deltar i säkerhetskänslig verksamhet enligt vår analys.',
    'Säkerhetsskyddslagen 3 kap. och GDPR art. 6.1 c.');
  RESET ROLE; PERFORM pg_temp.nobody();

  -- The candidate prepares and submits, as themselves.
  SELECT notice_version INTO _notice FROM public.bcp_assignments WHERE id = (_res ->> 'assignment_id')::uuid;
  PERFORM pg_temp.become(_cand); SET LOCAL ROLE authenticated;
  PERFORM public.bcp_acknowledge_notice(gen_random_uuid(), (_res ->> 'assignment_id')::uuid, _notice,
    public.bcp_notice_hash((_res ->> 'assignment_id')::uuid, 'sv-SE'), 'sv-SE');
  PERFORM pg_temp.fill((_res ->> 'assignment_id')::uuid);
  PERFORM public.bcp_submit(gen_random_uuid(), (_res ->> 'assignment_id')::uuid,
    (SELECT (d -> 'response' ->> 'revision')::integer
       FROM public.bcp_candidate_preparation((_res ->> 'assignment_id')::uuid) d));
  RESET ROLE; PERFORM pg_temp.nobody();

  UPDATE cv SET emp = _emp, emp_b = _emp_b, owner = _owner, admin_u = _admin_u, member = _member,
    officer = _officer, cand = _cand, cand_t = _cand_t, other = _other, job = _job, app = _app, app_t = _app_t,
    vet = (_res ->> 'assignment_id')::uuid,
    officer_row = (SELECT id FROM public.bcp_security_officers WHERE employer_id = _emp AND user_id = _officer AND revoked_at IS NULL);
END $setup$;

-- The two cases, each through the atomic start: the vetting's by the security
-- function (linked in the same transaction), and an ordinary TRUST case.
DO $cases$
DECLARE r cv%ROWTYPE; _v jsonb; _v2 jsonb; _t jsonb;
BEGIN
  SELECT * INTO r FROM cv;
  PERFORM pg_temp.become(r.officer); SET LOCAL ROLE authenticated;
  PERFORM public.scp_record_recruitment_setup(r.emp, 'beskt', 'operational', 'vaktare', 'general', NULL, r.vet);
  _v := public.scp_iv_start_interview(r.emp, r.app, 'beskt_assignment', r.vet, 'beskt');
  _v2 := public.scp_iv_start_interview(r.emp, r.app, 'beskt_assignment', r.vet, 'beskt');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.become(r.owner); SET LOCAL ROLE authenticated;
  _t := public.scp_iv_start_interview(r.emp, r.app_t, 'chosen_setup', NULL, 'trust', NULL, 'operational', 'vaktare', 'general');
  RESET ROLE; PERFORM pg_temp.nobody();
  UPDATE cv SET vet_case = (_v ->> 'case_id')::uuid, trust_case = (_t ->> 'case_id')::uuid;
  PERFORM pg_temp.ok((_v ->> 'created')::boolean AND (_v2 ->> 'case_id') = (_v ->> 'case_id')
                     AND NOT (_v2 ->> 'created')::boolean AND (_t ->> 'created')::boolean
                     AND EXISTS (SELECT 1 FROM public.bcp_case_links WHERE case_id = (_v ->> 'case_id')::uuid AND unlinked_at IS NULL),
    'CV0.1 the atomic starts still work: the vetting case linked in its transaction, a retry returns it, and a TRUST case beside it');
END $cases$;


DO $$ BEGIN RAISE NOTICE 'GROUP CV1 — the vetting case ROW, read directly'; END $$;

DO $$
DECLARE r cv%ROWTYPE; _sql text; _meta text;
BEGIN
  SELECT * INTO r FROM cv;
  _sql := format('SELECT count(*) FROM public.scp_interview_cases WHERE id = %L', r.vet_case);
  -- Metadata: the same row found by what a curious member would search for.
  _meta := format('SELECT count(*) FROM public.scp_interview_cases WHERE employer_id = %L AND (application_id = %L OR candidate_user_id = %L OR candidate_display_name = %L)',
                  r.emp, r.app, r.cand, (SELECT candidate_display_name FROM public.scp_interview_cases WHERE id = r.vet_case));
  PERFORM pg_temp.ok(pg_temp.n_as(r.member, _sql) = 0 AND pg_temp.n_as(r.member, _meta) = 0,
    'CV1.1 a plain member reads neither the vetting case row nor any of its metadata');
  PERFORM pg_temp.ok(pg_temp.n_as(r.owner, _sql) = 0 AND pg_temp.n_as(r.owner, _meta) = 0,
    'CV1.2 nor does the owner, who is not the security function');
  PERFORM pg_temp.ok(pg_temp.n_as(r.admin_u, _sql) = 0 AND pg_temp.n_as(r.admin_u, _meta) = 0,
    'CV1.3 nor an admin who is not the security function');
  PERFORM pg_temp.ok(pg_temp.n_as(r.cand, _sql) = 0,
    'CV1.4 nor the candidate');
  PERFORM pg_temp.ok(pg_temp.n_as(r.other, _sql) = 0,
    'CV1.5 nor another organisation');
  PERFORM pg_temp.ok(pg_temp.n_as(r.officer, _sql) = 1
                     AND pg_temp.n_as(r.officer, format('SELECT count(*) FROM public.scp_interview_cases WHERE id = %L AND title ILIKE %L', r.vet_case, '%Säkerhetssamordnare%')) = 1,
    'CV1.6 the appointed security function reads the same row, title included (positive control)');
  PERFORM pg_temp.must_fail(
    format('SET LOCAL ROLE anon; SELECT count(*) FROM public.scp_interview_cases WHERE id = %L', r.vet_case),
    'permission denied', 'CV1.7 an anonymous caller cannot read the case table at all');
  RESET ROLE;
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP CV2 — lists, related rows, the view and the RPCs keep the same boundary'; END $$;

DO $$
DECLARE r cv%ROWTYPE; _all bigint;
BEGIN
  SELECT * INTO r FROM cv;
  _all := (SELECT count(*) FROM public.scp_interview_cases WHERE employer_id = r.emp);
  PERFORM pg_temp.ok(
    pg_temp.n_as(r.member, format('SELECT count(*) FROM public.scp_interview_cases WHERE employer_id = %L', r.emp)) = _all - 1
    AND pg_temp.n_as(r.officer, format('SELECT count(*) FROM public.scp_interview_cases WHERE employer_id = %L', r.emp)) = _all,
    'CV2.1 the interview list and its count leave the vetting out for a member, and include it for the security function');
  PERFORM pg_temp.ok(
    pg_temp.n_as(r.member, format('SELECT count(*) FROM public.scp_interview_cases WHERE application_id = %L', r.app)) = 0
    AND pg_temp.n_as(r.officer, format('SELECT count(*) FROM public.scp_interview_cases WHERE application_id = %L', r.app)) = 1,
    'CV2.2 the application''s list of interviews does the same');
  PERFORM pg_temp.ok(
    pg_temp.n_as(r.owner, format(
      'SELECT (SELECT count(*) FROM public.scp_interview_case_sources WHERE case_id = %1$L)
            + (SELECT count(*) FROM public.scp_interview_starts WHERE interview_case_id = %1$L)
            + (SELECT count(*) FROM public.scp_recruitment_setups WHERE interview_case_id = %1$L)
            + (SELECT count(*) FROM public.scp_interview_reports WHERE case_id = %1$L)
            + (SELECT count(*) FROM public.scp_interview_process_quality WHERE case_id = %1$L)
            + (SELECT count(*) FROM public.bcp_case_links WHERE case_id = %1$L)', r.vet_case)) = 0
    AND pg_temp.n_as(r.officer, format('SELECT count(*) FROM public.scp_interview_case_sources WHERE case_id = %L', r.vet_case)) > 0,
    'CV2.3 its material, start, setup, reports, quality row and link stay hidden from the owner, and reach the security function');
  PERFORM pg_temp.become(r.owner); SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ok(NOT public.scp_iv_can_read_case(r.vet_case) AND NOT public.scp_iv_can_write_case(r.vet_case),
    'CV2.4 the read and write predicates agree with the row');
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(
    pg_temp.n_as(r.owner, format('SELECT count(*) FROM public.scp_iv_report_blockers(%L) b WHERE b.code <> %L', r.vet_case, 'NOT_PERMITTED')) = 0
    AND pg_temp.n_as(r.owner, format('SELECT count(*) FROM public.scp_iv_report_blockers(%L) b WHERE b.code = %L', r.vet_case, 'NOT_PERMITTED')) = 1,
    'CV2.5 a direct link to the report''s basis answers only NOT_PERMITTED -- nothing about the case');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner,
    format('SELECT public.scp_iv_finalise_report(%L, NULL)', r.vet_case),
    'SCP_IV_REPORT_BLOCKED', 'CV2.5b and finalising its report is refused');
  PERFORM pg_temp.must_fail_as('authenticated', r.owner,
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L, %L, %L, %L)', r.vet_case,
           'Syntetisk grund', 'Syntetiskt informerad', 'recruitment_interview', current_date + 30),
    'SCP_IV_NOT_CASE_MEMBER', 'CV2.6 the owner cannot confirm the vetting''s transcript basis around the security function');
  PERFORM pg_temp.must_fail_as('authenticated', r.member,
    format('SELECT public.scp_iv_start_interview(%L, %L, %L, %L, %L)', r.emp, r.app, 'beskt_assignment', r.vet, 'beskt'),
    'SCP_START_SOURCE_MISMATCH', 'CV2.7 a start retried by a member neither reveals nor replaces the case');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP CV3 — ordinary cases and the candidate''s own views are unchanged'; END $$;

DO $$
DECLARE r cv%ROWTYPE; _sql text; _status bigint; _prep jsonb;
BEGIN
  SELECT * INTO r FROM cv;
  _sql := format('SELECT count(*) FROM public.scp_interview_cases WHERE id = %L', r.trust_case);
  PERFORM pg_temp.ok(pg_temp.n_as(r.member, _sql) = 1 AND pg_temp.n_as(r.owner, _sql) = 1
                     AND pg_temp.n_as(r.admin_u, _sql) = 1 AND pg_temp.n_as(r.officer, _sql) = 1,
    'CV3.1 an ordinary TRUST case is read by every member, as before');
  PERFORM pg_temp.ok(pg_temp.n_as(r.cand_t, _sql) = 0 AND pg_temp.n_as(r.other, _sql) = 0,
    'CV3.2 and by nobody outside the employer, as before');
  PERFORM pg_temp.as_user('authenticated', r.owner,
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L, %L, %L, %L)', r.trust_case,
           'Syntetisk grund', 'Syntetiskt informerad', 'recruitment_interview', current_date + 30));
  PERFORM pg_temp.ok((SELECT transcript_lawful_basis_confirmed_at IS NOT NULL FROM public.scp_interview_cases WHERE id = r.trust_case),
    'CV3.3 the owner still confirms an ordinary case''s transcript basis');
  PERFORM pg_temp.become(r.cand); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _status FROM public.scp_iv_candidate_interview_status();
  SELECT d INTO _prep FROM public.bcp_candidate_preparation(r.vet) d;
  RESET ROLE; PERFORM pg_temp.nobody();
  PERFORM pg_temp.ok(_status IS NOT NULL AND jsonb_typeof(_prep -> 'items') = 'array'
                     AND jsonb_array_length(_prep -> 'items') > 0,
    'CV3.4 the candidate''s own preparation and interview-status views still answer');
  PERFORM pg_temp.ok(pg_temp.n_as(r.cand, format('SELECT count(*) FROM public.scp_interview_reports WHERE case_id = %L', r.vet_case)) = 0,
    'CV3.5 without giving the candidate the employer''s case or report');
END $$;


DO $$ BEGIN RAISE NOTICE 'GROUP CV4 — a revoked appointment takes the access with it'; END $$;

DO $$
DECLARE r cv%ROWTYPE;
BEGIN
  SELECT * INTO r FROM cv;
  PERFORM pg_temp.as_user('authenticated', r.owner,
    format('SELECT public.bcp_revoke_security_officer(gen_random_uuid(), %L, %L)', r.officer_row, 'SYNTETISK: uppdraget avslutat'));
  PERFORM pg_temp.ok(pg_temp.n_as(r.officer, format('SELECT count(*) FROM public.scp_interview_cases WHERE id = %L', r.vet_case)) = 0,
    'CV4.1 once the appointment is revoked, the former security officer reads the row no more');
  PERFORM pg_temp.ok(pg_temp.n_as(r.owner, format('SELECT count(*) FROM public.scp_interview_cases WHERE id = %L', r.vet_case)) = 0,
    'CV4.2 and the revocation opened it to nobody else');
END $$;

ROLLBACK;
