-- 20270320090000: private recruitment data requires a live Auth session, on
-- the Passport's principle. A token whose session was signed out, revoked or
-- has expired is refused at the database on the next call, whichever door it
-- comes through (the app's server functions or PostgREST directly).
--
--   SR1   an active session works: reads, counts, review, table rows, writes.
--   SR2   after a local sign-out the old token is refused everywhere:
--         RPC reads, table reads (no rows), RPC writes and direct writes, and
--         a refused write leaves nothing behind.
--   SR3   another session of the same user, still active, keeps working.
--   SR4   the session is bound to its user: someone else's live session id,
--         an unknown id, a malformed id or no id at all is refused.
--   SR5   an expired session (not_after passed) is refused.
--   SR6   a global sign-out refuses every token; a new sign-in works.
--   SR7   the candidate's own paths: the application context, own rows,
--         booking reply, message reply and a direct application insert.
--   SR8   a platform administrator's read through the admin policy.
--   SR9   scp_application_candidate and the submitted CV in Storage are out
--         of reach on a dead session.
--   SR10  roles and organisations are unchanged with a live session: a plain
--         member still may not manage, company B still reads nothing.
--   SR11  calls without an Auth JWT (SQL/maintenance) and the service role are
--         unaffected; anon has no EXECUTE on the check.
--   SR12  the regression guard: one session check per read, the same for 30
--         and 90 applications; reading a whole table checks once.
--   SR13  the shape: the check, the twelve restrictive policies, the member
--         policies on the session-free core. Last, so that a planted defect is
--         caught by the behaviour it breaks first.
--
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;
BEGIN;
SET LOCAL track_functions = 'all';

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
-- The claims PostgREST sets for a GoTrue access token: sub, role and the
-- token's session_id. _sid NULL leaves the claim out entirely.
CREATE OR REPLACE FUNCTION pg_temp.as_token(_uid uuid, _sid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  PERFORM set_config('request.jwt.claims', CASE WHEN _uid IS NULL THEN '' ELSE
    (jsonb_build_object('sub', _uid, 'role', 'authenticated', 'aud', 'authenticated')
     || CASE WHEN _sid IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('session_id', _sid) END)::text END, true);
END $$;
-- One request with a token: role authenticated, the token's claims, one
-- statement. The first column of the first row as text ('' for no row), or
-- 'err:<message>'.
CREATE OR REPLACE FUNCTION pg_temp.req(_uid uuid, _sid text, _sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM pg_temp.as_token(_uid, _sid);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE _sql INTO _r;
    _r := coalesce(_r, '');
  EXCEPTION WHEN OTHERS THEN _r := 'err:' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.as_token(NULL, NULL);
  RETURN _r;
END $$;
-- Calls of the session check made by ONE request.
CREATE OR REPLACE FUNCTION pg_temp.checks(_uid uuid, _sid text, _sql text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE b bigint; a bigint; r text;
BEGIN
  SELECT coalesce(sum(calls), 0) INTO b FROM pg_stat_xact_user_functions WHERE schemaname = 'public' AND funcname = 'rec_session_active';
  r := pg_temp.req(_uid, _sid, _sql);
  IF r LIKE 'err:%' THEN RAISE EXCEPTION 'request failed: %', r; END IF;
  SELECT coalesce(sum(calls), 0) INTO a FROM pg_stat_xact_user_functions WHERE schemaname = 'public' AND funcname = 'rec_session_active';
  RETURN a - b;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.set_status(_emp uuid, _s text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = _emp;
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;

-- ── Fixture ─────────────────────────────────────────────────────────────
-- E1 Ankarvakt: owner O (sessions o1, o2), plain member M (m1).
-- E2 Bergvakt ("company B"): owner B (b1).  P a platform admin (p1).
-- C a candidate (c1) who applied to J1.  J1 30 and J2 90 applications at E1.
CREATE TEMP TABLE f AS SELECT
  '5e20e000-0000-4000-8000-000000000001'::uuid e1, '5e20e000-0000-4000-8000-000000000002'::uuid e2,
  '5e200000-0000-4000-8000-0000000000a0'::uuid o,  '5e200000-0000-4000-8000-0000000000a3'::uuid m,
  '5e200000-0000-4000-8000-0000000000b0'::uuid b,  '5e200000-0000-4000-8000-0000000000e0'::uuid p,
  '5e200000-0000-4000-8000-0000000000d0'::uuid c,
  '5e205000-0000-4000-8000-0000000000a1'::text o1, '5e205000-0000-4000-8000-0000000000a2'::text o2,
  '5e205000-0000-4000-8000-0000000000a3'::text m1, '5e205000-0000-4000-8000-0000000000b1'::text b1,
  '5e205000-0000-4000-8000-0000000000e1'::text p1, '5e205000-0000-4000-8000-0000000000d1'::text c1,
  '5e201000-0000-4000-8000-000000000001'::uuid j1, '5e201000-0000-4000-8000-000000000002'::uuid j2,
  '5e201000-0000-4000-8000-000000000003'::uuid j3,
  '5e202000-0000-4000-8000-000000000001'::uuid q1,
  '5e203000-0000-4000-8000-000000000001'::uuid capp,
  '5e204000-0000-4000-8000-000000000001'::uuid bk;
GRANT SELECT ON f TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT u, 'sr-' || n || '@synthetic.invalid', now(), jsonb_build_object('display_name', n)
  FROM f, LATERAL (VALUES (o, 'Olga Ägare'), (m, 'Måns Medlem'), (b, 'Bodil B'), (p, 'Pia Plattform'),
                          (c, 'Cilla Kandidat')) v(u, n);
INSERT INTO auth.sessions (id, user_id)
SELECT s::uuid, u FROM f, LATERAL (VALUES (o1, o), (o2, o), (m1, m), (b1, b), (p1, p), (c1, c)) v(s, u);
INSERT INTO public.user_roles (user_id, role) SELECT p, 'admin' FROM f;
INSERT INTO public.employers (id, name, slug, status)
SELECT e1, 'Ankarvakt AB (syntetisk)', 'sr-ankarvakt', 'active' FROM f UNION ALL
SELECT e2, 'Bergvakt AB (syntetisk)',  'sr-bergvakt',  'active' FROM f;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e1, o, 'owner', 'active' FROM f UNION ALL SELECT e1, m, 'member', 'active' FROM f UNION ALL
SELECT e2, b, 'owner', 'active' FROM f;

CREATE OR REPLACE FUNCTION pg_temp.job_as(_owner uuid, _sid text, _job uuid, _emp uuid, _slug text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_token(_owner, _sid);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
  VALUES (_job, _slug, upper(left(replace(_slug, '-', ''), 10)), _emp, 'Syntetisk ' || _slug, 'Synthetic ' || _slug, 'internal', 'draft');
  UPDATE public.jobs SET status = 'published', expires_at = now() + interval '30 days' WHERE id = _job;
  RESET ROLE;
  PERFORM pg_temp.as_token(NULL, NULL);
END $$;
SELECT pg_temp.job_as(o, o1, j1, e1, 'sr-job-1') FROM f;
SELECT pg_temp.job_as(o, o1, j2, e1, 'sr-job-2') FROM f;
SELECT pg_temp.job_as(o, o1, j3, e1, 'sr-job-3') FROM f;
INSERT INTO public.recruitment_questions (id, job_id, employer_id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required, position)
SELECT q1, j1, e1, NULL, 'Har du körkort B?', 'Do you hold a B licence?', 'yes_no', false, 0 FROM f;
INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id)
SELECT j1, e1, NULL::uuid FROM f UNION ALL SELECT j2, e1, NULL FROM f;

CREATE TEMP TABLE apps AS
SELECT g AS n, k, job, emp,
       ('5e20a' || lpad(to_hex(k), 3, '0') || '-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS uid,
       ('5e20b' || lpad(to_hex(k), 3, '0') || '-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS app
  FROM f, LATERAL (VALUES (1, j1, e1, 29), (2, j2, e1, 90)) v(k, job, emp, cnt), generate_series(1, cnt) g;
GRANT SELECT ON apps TO PUBLIC;
INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT uid, 'sr-app-' || app || '@synthetic.invalid', now() FROM apps;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, cv_source, consent_given_at)
SELECT app, job, emp, uid, 'submitted', 'upload', now() FROM apps;
-- The candidate's own application is the 30th on J1.
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, cv_source, consent_given_at)
SELECT capp, j1, e1, c, 'submitted', 'upload', now() FROM f;
INSERT INTO public.job_application_answers (application_id, question_id, employer_id, answer_kind, answer_bool)
SELECT app, (SELECT q1 FROM f), emp, 'yes_no', n % 2 = 1 FROM apps WHERE k = 1;
INSERT INTO public.recruitment_interview_bookings (id, application_id, job_id, employer_id, starts_at, duration_minutes,
                                                   timezone, location_kind, status, invited_at)
SELECT bk, capp, j1, e1, now() + interval '7 days', 30, 'Europe/Stockholm', 'phone', 'invited', now() FROM f;

-- ── Probes ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE probe (k text PRIMARY KEY, q text);
GRANT SELECT ON probe TO PUBLIC;
INSERT INTO probe SELECT k, replace(replace(replace(replace(q, ':e1', e1::text), ':j1', j1::text), ':app', (SELECT app FROM apps WHERE k = 1 AND n = 1)::text), ':capp', capp::text)
  FROM f, LATERAL (VALUES
  ('list',    $q$SELECT (public.rec_ri_candidate_view(':e1', ':j1', '{"stage":"all"}', 'requirements', NULL, 1, 25, NULL)->>'total')$q$),
  ('counts',  $q$SELECT public.rec_ri_overview_counts(':e1')::text$q$),
  ('jobs',    $q$SELECT sum(total)::text FROM public.rec_job_counts(':e1', ':j1')$q$),
  ('legacy',  $q$SELECT max(total)::text FROM public.rec_candidate_view(':j1', 'all', NULL, NULL, '[]', 'applied', 'desc', 1, 25, NULL)$q$),
  ('next',    $q$SELECT public.rec_ri_next_unreviewed(':e1', ':j1')::text$q$),
  ('review',  $q$SELECT (public.rec_ri_get_review(':app')->>'applicationId')$q$),
  ('events',  $q$SELECT count(*)::text FROM public.rec_application_status_events(':app')$q$),
  ('note',    $q$SELECT coalesce(public.rec_application_employer_note(':app'), '<none>')$q$),
  ('t_apps',  $q$SELECT count(*)::text FROM public.job_applications WHERE employer_id = ':e1'$q$),
  ('t_ans',   $q$SELECT count(*)::text FROM public.job_application_answers WHERE employer_id = ':e1'$q$),
  ('t_set',   $q$SELECT count(*)::text FROM public.recruitment_settings WHERE employer_id = ':e1'$q$)) v(k, q);
CREATE OR REPLACE FUNCTION pg_temp.p(_k text) RETURNS text LANGUAGE sql AS $$ SELECT q FROM probe WHERE k = _k $$;
-- Every probe with a token: k -> answer.
CREATE OR REPLACE FUNCTION pg_temp.all_probes(_uid uuid, _sid text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_object_agg(k, pg_temp.req(_uid, _sid, q)) FROM probe
$$;
CREATE OR REPLACE FUNCTION pg_temp.refused(_r jsonb) RETURNS boolean LANGUAGE sql AS $$
  -- RPC reads raise; table reads see no rows.
  SELECT bool_and(CASE WHEN k LIKE 't\_%' THEN v = '0' ELSE v LIKE 'err:%' END) FROM jsonb_each_text(_r) e(k, v)
$$;
CREATE OR REPLACE FUNCTION pg_temp.counted() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'comments', (SELECT count(*) FROM public.recruitment_comments WHERE employer_id = (SELECT e1 FROM f)),
    'events',   (SELECT count(*) FROM public.job_application_status_events WHERE employer_id = (SELECT e1 FROM f)),
    'status',   (SELECT string_agg(status, ',' ORDER BY id) FROM public.job_applications WHERE employer_id = (SELECT e1 FROM f)),
    'settings', (SELECT string_agg(coalesce(responsible_user_id::text, '-'), ',' ORDER BY job_id) FROM public.recruitment_settings WHERE employer_id = (SELECT e1 FROM f)),
    'booking',  (SELECT status FROM public.recruitment_interview_bookings WHERE id = (SELECT bk FROM f)),
    'apps',     (SELECT count(*) FROM public.job_applications));
$$;

DO $$ BEGIN RAISE NOTICE 'GROUP SR1 — an active session works'; END $$;
SELECT pg_temp.ok(r->>'list' = '30' AND r->>'legacy' = '30' AND r->>'jobs' = '30' AND r->>'t_apps' = '120'
                  AND r->>'t_ans' = '29' AND r->>'t_set' = '2' AND r->>'review' = (SELECT app FROM apps WHERE k = 1 AND n = 1)::text
                  AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(r) e(k, v) WHERE v LIKE 'err:%'),
                  'SR1.1 the owner on o1: list, counts, job counts, legacy list, next, review, events, note and table rows')
  FROM (SELECT pg_temp.all_probes(o, o1) r FROM f) t;
-- A write and its effect are read in separate statements: one statement sees
-- one snapshot.
CREATE TEMP TABLE w AS SELECT pg_temp.req(o, o1, format($q$SELECT public.rec_add_comment(%L, 'SR1 kommentar')::text$q$, (SELECT app FROM apps WHERE k = 1 AND n = 1))) r FROM f;
SELECT pg_temp.ok((SELECT r FROM w) ~ '^[0-9a-f-]{36}$'
                  AND (SELECT count(*) FROM public.recruitment_comments WHERE body = 'SR1 kommentar') = 1,
                  'SR1.2 the owner on o1 writes a comment');
SELECT pg_temp.ok(pg_temp.req(o, o1, format($q$SELECT new_status FROM public.rec_set_application_stage(%L, 'submitted', 'reviewing', NULL)$q$, (SELECT app FROM apps WHERE k = 1 AND n = 2))) = 'reviewing',
                  'SR1.3 the owner on o1 moves an application') FROM f;
SELECT pg_temp.ok(pg_temp.req(m, m1, pg_temp.p('list')) = '30',
                  'SR1.4 the plain member on m1 reads the same population') FROM f;

-- The interview composition has its own case membership; with a live session
-- the refusal is that rule's, not the session's.
SELECT pg_temp.ok(pg_temp.req(o, o1, format('SELECT public.rec_ri_case_composition(%L)::text', (SELECT app FROM apps WHERE k = 1 AND n = 1))) = 'err:SCP_IV_NOT_CASE_MEMBER',
                  'SR1.5 the interview composition passes the session check and applies its own case rule') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR2 — local sign-out: the old token is refused'; END $$;
CREATE TEMP TABLE before_sr2 AS SELECT pg_temp.counted() c;
DELETE FROM auth.sessions WHERE id = (SELECT o1::uuid FROM f);
SELECT pg_temp.ok(pg_temp.refused(r) AND r->>'list' = 'err:RECRUITMENT_NOT_PERMITTED',
                  'SR2.1 every read with o1 is refused: RPCs raise, tables return no rows')
  FROM (SELECT pg_temp.all_probes(o, o1) r FROM f) t;
SELECT pg_temp.ok(pg_temp.req(o, o1, format($q$SELECT public.rec_add_comment(%L, 'SR2 kommentar')::text$q$, (SELECT app FROM apps WHERE k = 1 AND n = 1))) LIKE 'err:%'
                  AND pg_temp.req(o, o1, format($q$SELECT new_status FROM public.rec_set_application_stage(%L, 'submitted', 'reviewing', NULL)$q$, (SELECT app FROM apps WHERE k = 1 AND n = 3))) LIKE 'err:%'
                  AND pg_temp.req(o, o1, format($q$SELECT new_status FROM public.set_application_status(%L, 'reviewing', NULL)$q$, (SELECT app FROM apps WHERE k = 1 AND n = 4))) = 'err:REC_SESSION_REVOKED'
                  AND pg_temp.req(o, o1, format($q$SELECT public.rec_save_vacancy_structure(%L, '[]', '[]')::text$q$, (SELECT j1 FROM f))) = 'err:REC_SESSION_REVOKED'
                  AND pg_temp.req(o, o1, format('SELECT public.rec_ri_case_composition(%L)::text', (SELECT app FROM apps WHERE k = 1 AND n = 1))) = 'err:REC_SESSION_REVOKED',
                  'SR2.2 every write RPC with o1 is refused (comment, stage, legacy status, vacancy structure), and the composition read') FROM f;
-- A client may write these tables directly only where it is granted to:
-- the applicant's INSERT into job_applications and job_application_answers
-- (SR7.4). Every other write is an RPC, refused above or gated by
-- rec_is_member; a direct UPDATE/DELETE is refused by privilege.
SELECT pg_temp.ok((SELECT string_agg(DISTINCT table_name || ':' || privilege_type, ',' ORDER BY table_name || ':' || privilege_type)
                     FROM (SELECT table_name, privilege_type FROM information_schema.role_table_grants
                            WHERE grantee = 'authenticated' AND table_schema = 'public' AND privilege_type <> 'SELECT'
                           UNION ALL
                           SELECT table_name, privilege_type FROM information_schema.column_privileges
                            WHERE grantee = 'authenticated' AND table_schema = 'public' AND privilege_type <> 'SELECT') g
                    WHERE table_name IN (SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'rec_session_required'))
                  = 'job_application_answers:INSERT,job_applications:INSERT'
                  AND pg_temp.req(o, o1, format($q$UPDATE public.recruitment_settings SET responsible_user_id = %L WHERE employer_id = %L$q$, m, e1)) LIKE 'err:permission denied%',
                  'SR2.3 the only direct client writes are the applicant''s two inserts; a direct update with o1 is refused') FROM f;
SELECT pg_temp.ok(pg_temp.counted() = (SELECT c FROM before_sr2),
                  'SR2.4 the refused writes left no change: comments, events, statuses, settings, booking');

DO $$ BEGIN RAISE NOTICE 'GROUP SR3 — another active session of the same user'; END $$;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM jsonb_each_text(r) e(k, v) WHERE v LIKE 'err:%') AND r->>'list' = '30' AND r->>'t_apps' = '120',
                  'SR3.1 the owner on o2 still reads everything')
  FROM (SELECT pg_temp.all_probes(o, o2) r FROM f) t;
SELECT pg_temp.ok(pg_temp.req(o, o2, format($q$SELECT public.rec_add_comment(%L, 'SR3 kommentar')::text$q$, (SELECT app FROM apps WHERE k = 1 AND n = 1))) ~ '^[0-9a-f-]{36}$',
                  'SR3.2 the owner on o2 still writes') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR4 — the session is bound to its user'; END $$;
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(o, m1)), 'SR4.1 the owner with the member''s live session id is refused') FROM f;
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(m, o2)), 'SR4.2 the member with the owner''s live session id is refused') FROM f;
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(o, '5e205000-0000-4000-8000-00000000ffff')), 'SR4.3 an unknown session id is refused') FROM f;
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(o, 'not-a-uuid')) AND pg_temp.refused(pg_temp.all_probes(o, '')),
                  'SR4.4 a malformed or empty session id is refused (no cast error)') FROM f;
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(o, NULL)), 'SR4.5 an authenticated token without session_id is refused') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR5 — an expired session'; END $$;
UPDATE auth.sessions SET not_after = now() - interval '1 second' WHERE id = (SELECT m1::uuid FROM f);
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(m, m1)), 'SR5.1 not_after in the past: refused') FROM f;
UPDATE auth.sessions SET not_after = now() + interval '1 hour' WHERE id = (SELECT m1::uuid FROM f);
SELECT pg_temp.ok(pg_temp.req(m, m1, pg_temp.p('list')) = '30', 'SR5.2 not_after in the future: works') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR6 — global sign-out, then a new sign-in'; END $$;
DELETE FROM auth.sessions WHERE user_id = (SELECT o FROM f);
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(o, o2)) AND pg_temp.refused(pg_temp.all_probes(o, o1)),
                  'SR6.1 after a global sign-out every one of the owner''s tokens is refused') FROM f;
SELECT pg_temp.ok(pg_temp.req(m, m1, pg_temp.p('list')) = '30', 'SR6.2 another user''s session is untouched') FROM f;
INSERT INTO auth.sessions (id, user_id) SELECT '5e205000-0000-4000-8000-0000000000a9'::uuid, o FROM f;
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM jsonb_each_text(r) e(k, v) WHERE v LIKE 'err:%') AND r->>'list' = '30',
                  'SR6.3 a new sign-in (new session) reads everything again')
  FROM (SELECT pg_temp.all_probes(o, '5e205000-0000-4000-8000-0000000000a9') r FROM f) t;
SELECT pg_temp.ok(pg_temp.refused(pg_temp.all_probes(o, o2)), 'SR6.4 and the old tokens stay refused') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR7 — the candidate''s own paths'; END $$;
SELECT pg_temp.ok(pg_temp.req(c, c1, 'SELECT count(*)::text FROM public.rec_my_application_context()') = '1'
                  AND pg_temp.req(c, c1, 'SELECT count(*)::text FROM public.job_applications') = '1'
                  AND pg_temp.req(c, c1, 'SELECT count(*)::text FROM public.recruitment_interview_bookings') = '1',
                  'SR7.1 the candidate on c1 sees their application context, application and booking') FROM f;
CREATE TEMP TABLE before_sr7 AS SELECT pg_temp.counted() c;
DELETE FROM auth.sessions WHERE id = (SELECT c1::uuid FROM f);
SELECT pg_temp.ok(pg_temp.req(c, c1, 'SELECT count(*)::text FROM public.rec_my_application_context()') = '0'
                  AND pg_temp.req(c, c1, 'SELECT count(*)::text FROM public.job_applications') = '0'
                  AND pg_temp.req(c, c1, 'SELECT count(*)::text FROM public.recruitment_interview_bookings') = '0',
                  'SR7.2 after sign-out: no context, no application, no booking') FROM f;
SELECT pg_temp.ok(pg_temp.req(c, c1, format($q$SELECT public.rec_respond_to_booking(%L, 'confirmed')$q$, bk)) = 'err:REC_SESSION_REVOKED'
                  AND pg_temp.req(c, c1, format($q$SELECT public.rec_candidate_reply_to_message(%L, 'svar', 'sv')::text$q$, gen_random_uuid())) = 'err:REC_SESSION_REVOKED',
                  'SR7.3 booking reply and message reply are refused before anything is read') FROM f;
SELECT pg_temp.ok(pg_temp.req(c, c1, format($q$INSERT INTO public.job_applications (job_id, applicant_user_id, cv_source, consent_given_at)
                                               VALUES (%L, %L, 'upload', now()) RETURNING id::text$q$, j3, c)) LIKE 'err:%row-level security%'
                  AND pg_temp.req(c, c1, format($q$INSERT INTO public.job_application_answers (application_id, question_id, answer_bool)
                                               VALUES (%L, %L, true) RETURNING 1$q$, capp, q1)) LIKE 'err:%row-level security%',
                  'SR7.4 the direct application and answer inserts are refused by row security') FROM f;
SELECT pg_temp.ok(pg_temp.counted() = (SELECT c FROM before_sr7), 'SR7.5 the booking is still invited and no application was added');
INSERT INTO auth.sessions (id, user_id) SELECT '5e205000-0000-4000-8000-0000000000d9'::uuid, c FROM f;
SELECT pg_temp.ok(pg_temp.req(c, '5e205000-0000-4000-8000-0000000000d9', format($q$INSERT INTO public.job_applications (job_id, applicant_user_id, cv_source, consent_given_at)
                                               VALUES (%L, %L, 'upload', now()) RETURNING (employer_id = %L)::text$q$, j3, c, e1)) = 'true'
                  AND pg_temp.req(c, '5e205000-0000-4000-8000-0000000000d9', format($q$INSERT INTO public.job_application_answers (application_id, question_id, answer_bool)
                                               VALUES (%L, %L, true) RETURNING 'inserted'$q$, capp, q1)) = 'inserted',
                  'SR7.6 signed in again, the same two inserts go through (the refusal was the session''s)') FROM f;
TRUNCATE w;
INSERT INTO w SELECT pg_temp.req(c, '5e205000-0000-4000-8000-0000000000d9', format($q$SELECT public.rec_respond_to_booking(%L, 'confirmed')$q$, bk)) FROM f;
SELECT pg_temp.ok((SELECT r FROM w) NOT LIKE 'err:%'
                  AND (SELECT status FROM public.recruitment_interview_bookings WHERE id = bk) = 'confirmed',
                  'SR7.7 signed in again, the same booking reply goes through') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR8 — a platform administrator'; END $$;
SELECT pg_temp.ok(pg_temp.req(p, p1, 'SELECT (count(*) >= 120)::text FROM public.job_applications') = 'true',
                  'SR8.1 the platform admin on p1 reads applications through the admin policy') FROM f;
DELETE FROM auth.sessions WHERE id = (SELECT p1::uuid FROM f);
SELECT pg_temp.ok(pg_temp.req(p, p1, 'SELECT count(*)::text FROM public.job_applications') = '0',
                  'SR8.2 signed out, the platform admin reads nothing') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR9 — scp_application_candidate and the CV in Storage'; END $$;
SELECT pg_temp.ok(pg_temp.req(m, m1, format('SELECT application_id::text FROM public.scp_application_candidate(%L)', capp)) = capp::text,
                  'SR9.1 the member on m1 reads the application header') FROM f;
UPDATE auth.sessions SET not_after = now() - interval '1 second' WHERE id = (SELECT m1::uuid FROM f);
SELECT pg_temp.ok(pg_temp.req(m, m1, format('SELECT count(*)::text FROM public.scp_application_candidate(%L)', capp)) = '0',
                  'SR9.2 expired, it returns nothing') FROM f;
UPDATE auth.sessions SET not_after = NULL WHERE id = (SELECT m1::uuid FROM f);

-- The submitted CV in Storage: its only read policy looks the file up in
-- job_applications AS THE CALLER, so the restrictive policy applies inside it.
UPDATE public.job_applications SET cv_storage_path = c || '/' || capp || '/cv.pdf' FROM f WHERE id = capp;
INSERT INTO storage.buckets (id, name, public) VALUES ('job-application-cvs', 'job-application-cvs', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) SELECT 'job-application-cvs', c || '/' || capp || '/cv.pdf' FROM f;
SELECT pg_temp.ok(pg_temp.req(m, m1, $q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'job-application-cvs' AND name LIKE '5e200000-%'$q$) = '1',
                  'SR9.3 the member on m1 reaches the submitted CV object in Storage') FROM f;
UPDATE auth.sessions SET not_after = now() - interval '1 second' WHERE id = (SELECT m1::uuid FROM f);
SELECT pg_temp.ok(pg_temp.req(m, m1, $q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'job-application-cvs' AND name LIKE '5e200000-%'$q$) = '0',
                  'SR9.4 expired, the CV object is out of reach too') FROM f;
UPDATE auth.sessions SET not_after = NULL WHERE id = (SELECT m1::uuid FROM f);

DO $$ BEGIN RAISE NOTICE 'GROUP SR10 — roles and organisations unchanged'; END $$;
SELECT pg_temp.ok(NOT (SELECT bool_or((x->>'can_manage')::boolean) FROM jsonb_array_elements(
                    pg_temp.req(m, m1, format($q$SELECT public.rec_ri_candidate_view(%L, %L, '{"stage":"all"}', 'requirements', NULL, 1, 25, NULL)::text$q$, e1, j1))::jsonb->'rows') x),
                  'SR10.1 a plain member with a live session still may not manage') FROM f;
SELECT pg_temp.ok(pg_temp.req(b, b1, pg_temp.p('list')) = 'err:RECRUITMENT_NOT_PERMITTED'
                  AND pg_temp.req(b, b1, pg_temp.p('t_apps')) = '0' AND pg_temp.req(b, b1, pg_temp.p('t_ans')) = '0',
                  'SR10.2 company B''s owner with a live session still reads nothing of company A') FROM f;
SELECT pg_temp.ok(pg_temp.req(c, '5e205000-0000-4000-8000-0000000000d9', pg_temp.p('list')) = 'err:RECRUITMENT_NOT_PERMITTED'
                  AND pg_temp.req(c, '5e205000-0000-4000-8000-0000000000d9', 'SELECT string_agg(id::text, '','' ORDER BY id) FROM public.job_applications')
                      = (SELECT string_agg(id::text, ',' ORDER BY id) FROM public.job_applications WHERE applicant_user_id = c),
                  'SR10.3 the candidate with a live session reads only their own applications') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR11 — contexts without an Auth JWT'; END $$;
SELECT pg_temp.ok(public.rec_session_active(), 'SR11.1 no JWT at all (SQL, maintenance): the check does not apply');
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_temp.ok(public.rec_session_active(), 'SR11.2 the service role: the check does not apply');
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.rec_session_active()', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'recruiter_intelligence.rec_member_without_session(uuid)', 'EXECUTE')
                  AND has_function_privilege('authenticated', 'public.rec_session_active()', 'EXECUTE'),
                  'SR11.3 anon cannot execute the check or the session-free core');

DO $$ BEGIN RAISE NOTICE 'GROUP SR12 — one session check per read'; END $$;
SELECT pg_temp.ok(pg_temp.checks(m, m1, pg_temp.p('list')) = 1
                  AND pg_temp.checks(m, m1, replace(pg_temp.p('list'), j1::text, j2::text)) = 1,
                  'SR12.1 the candidate list checks the session once, for 30 and for 90 applications') FROM f;
SELECT pg_temp.ok(pg_temp.checks(m, m1, replace(pg_temp.p('list'), '''' || j1::text || '''', 'NULL')) = 1,
                  'SR12.2 once for the whole organisation (120 applications)') FROM f;
SELECT pg_temp.ok(pg_temp.checks(m, m1, pg_temp.p('t_apps')) = 1 AND pg_temp.checks(m, m1, pg_temp.p('t_ans')) = 1,
                  'SR12.3 a table read checks once, not per row (120 applications, 29 answers)') FROM f;
SELECT pg_temp.ok(pg_temp.checks(m, m1, pg_temp.p('jobs')) = 1 AND pg_temp.checks(m, m1, pg_temp.p('legacy')) = 1
                  AND pg_temp.checks(m, m1, pg_temp.p('next')) = 1 AND pg_temp.checks(m, m1, pg_temp.p('review')) <= 3
                  AND pg_temp.checks(m, m1, pg_temp.p('events')) <= 2 AND pg_temp.checks(m, m1, pg_temp.p('note')) <= 2,
                  'SR12.4 job counts, legacy list and next once; review, events and note a small fixed number (one per gated step)') FROM f;
-- The overview counts gate once and then once per job (rec_can_manage), never
-- per application: 60 more applications on J3 change nothing.
CREATE TEMP TABLE oc AS SELECT pg_temp.checks(m, m1, pg_temp.p('counts')) n FROM f;
INSERT INTO auth.users (id, email, email_confirmed_at)
SELECT ('5e20c000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'sr-more-' || g || '@synthetic.invalid', now() FROM generate_series(1, 60) g;
INSERT INTO public.job_applications (job_id, employer_id, applicant_user_id, status, cv_source, consent_given_at)
SELECT j3, e1, ('5e20c000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'submitted', 'upload', now() FROM f, generate_series(1, 60) g;
SELECT pg_temp.ok((SELECT n FROM oc) = pg_temp.checks(m, m1, pg_temp.p('counts'))
                  AND (SELECT n FROM oc) <= 1 + 2 * (SELECT count(*) FROM public.jobs WHERE employer_id = e1),
                  'SR12.5 the overview counts check per job, not per application (same count with 60 more applications)') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP SR13 — the shape'; END $$;
SELECT pg_temp.ok((SELECT prosecdef AND provolatile = 's' FROM pg_proc WHERE oid = 'public.rec_session_active()'::regprocedure)
                  AND position('s.user_id = auth.uid()' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.rec_session_active()'::regprocedure)) > 0,
                  'SR13.1 rec_session_active is STABLE SECURITY DEFINER and binds the session to auth.uid()');
SELECT pg_temp.ok((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname = 'rec_session_required'
                     AND permissive = 'RESTRICTIVE' AND cmd = 'ALL' AND roles = '{authenticated}'
                     AND qual ~ 'rec_session_active\(\)' AND with_check ~ 'rec_session_active\(\)') = 12,
                  'SR13.2 twelve restrictive policies require the session for reads and writes (once per statement: SR12.3)');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND qual ~ 'rec_is_member\(')
                  AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND qual ~ 'rec_member_without_session\(') = 10,
                  'SR13.3 no row policy calls rec_is_member (which now checks the session); ten use the session-free core');
SELECT pg_temp.ok(position('rec_session_active()' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.rec_is_member(uuid)'::regprocedure)) > 0,
                  'SR13.4 rec_is_member, the gate of every rec_* RPC, requires the session');

ROLLBACK;
