-- 20270319090000: the candidate list judges the caller's standing once per
-- read, not once per application -- with exactly the same answers.
--
--   CV0   the reference: the rollback's body (20270308090000) is loaded as
--         rec_cv_reference.candidate_view by scripts/db-test.sh, so every
--         comparison below is against the function this slot replaced.
--   CV1   owner, admin and the responsible recruiter read the list; can_manage
--         is true for owner/admin everywhere and for the recruiter on the job
--         they are responsible for only.
--   CV2   a plain member reads the same population, can_manage false.
--   CV3   refused, with the same error: removed, suspended and invited
--         members, an inactive organisation's owner, company B's owner (both
--         for company A and with A's job under B's id), an outsider, no user.
--         anon has no EXECUTE at all.
--   CV4   filters, sort, pages, totals and counts: explicit numbers.
--   CV5   old = new for every principal x every view: the WHOLE envelope
--         (rows, every field, ordering, page, total, counts) or the error.
--   CV6   an application whose organisation differs from its job's is
--         handled by the full rec_can_manage, as before.
--   CV7   no cache: a role change, a new responsibility and a removed
--         membership count from the very next call -- both bodies agree.
--   CV8   a revoked session: the database read is unchanged by this slot,
--         which touches no session rule. The function never consulted
--         auth.sessions; the session rule is the next slot's, 20270320090000
--         (supabase/tests/rec_session_required_test.sql).
--   CV9   the regression guard: the shared checks run a FIXED number of times
--         per read, whatever the number of applications; the reference body
--         grows with the rows.
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
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Both GUCs: the harness's flat sub, and the claim set PostgREST sets.
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid, ''), true);
  PERFORM set_config('request.jwt.claims', CASE WHEN nullif(_uid, '') IS NULL THEN '' ELSE json_build_object('sub', _uid, 'role', 'authenticated')::text END, true);
END $$;
-- One read as a signed-in user, exactly as PostgREST would run it: role
-- authenticated, the user's claims. The envelope as text, or 'err:<message>'.
CREATE OR REPLACE FUNCTION pg_temp.read(_fn text, _uid text, _emp uuid, _job uuid, _filters jsonb,
                                        _sort text, _dir text, _page integer, _size integer, _around uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _r text;
BEGIN
  PERFORM pg_temp.as_user(_uid);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE format('SELECT %s($1,$2,$3,$4,$5,$6,$7,$8)::text', _fn)
      INTO _r USING _emp, _job, _filters, _sort, _dir, _page, _size, _around;
  EXCEPTION WHEN OTHERS THEN _r := 'err:' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.cur(_uid text, _emp uuid, _job uuid, _filters jsonb DEFAULT '{"stage":"received"}',
                                       _sort text DEFAULT 'requirements', _dir text DEFAULT NULL, _page integer DEFAULT 1,
                                       _size integer DEFAULT 25, _around uuid DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.read('public.rec_ri_candidate_view', _uid, _emp, _job, _filters, _sort, _dir, _page, _size, _around)
$$;
CREATE OR REPLACE FUNCTION pg_temp.ref(_uid text, _emp uuid, _job uuid, _filters jsonb DEFAULT '{"stage":"received"}',
                                       _sort text DEFAULT 'requirements', _dir text DEFAULT NULL, _page integer DEFAULT 1,
                                       _size integer DEFAULT 25, _around uuid DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.read('rec_cv_reference.candidate_view', _uid, _emp, _job, _filters, _sort, _dir, _page, _size, _around)
$$;
-- Calls of the shared checks made by ONE read, from this transaction's own
-- function statistics (track_functions = all above).
CREATE OR REPLACE FUNCTION pg_temp.calls() RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_object_agg(funcname, calls), '{}')
    FROM pg_stat_xact_user_functions
   WHERE schemaname = 'public'
     AND funcname IN ('rec_can_manage', 'rec_is_member', 'has_employer_role', 'employer_is_active_status')
$$;
CREATE OR REPLACE FUNCTION pg_temp.calls_of(_fn text, _uid text, _emp uuid, _job uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE b jsonb; a jsonb; r text;
BEGIN
  b := pg_temp.calls();
  r := pg_temp.read(_fn, _uid, _emp, _job, '{"stage":"all"}', 'requirements', NULL, 1, 25, NULL);
  IF r LIKE 'err:%' THEN RAISE EXCEPTION 'read failed: %', r; END IF;
  a := pg_temp.calls();
  RETURN jsonb_build_object(
    'rec_can_manage',            coalesce((a->>'rec_can_manage')::int, 0)            - coalesce((b->>'rec_can_manage')::int, 0),
    'rec_is_member',             coalesce((a->>'rec_is_member')::int, 0)             - coalesce((b->>'rec_is_member')::int, 0),
    'has_employer_role',         coalesce((a->>'has_employer_role')::int, 0)         - coalesce((b->>'has_employer_role')::int, 0),
    'employer_is_active_status', coalesce((a->>'employer_is_active_status')::int, 0) - coalesce((b->>'employer_is_active_status')::int, 0));
END $$;

-- An organisation's status changes only through moderation; the suite sets
-- the same transaction-local marker moderate_employer() sets.
CREATE OR REPLACE FUNCTION pg_temp.set_status(_emp uuid, _s text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.employer_moderation_in_progress', 'on', true);
  UPDATE public.employers SET status = _s WHERE id = _emp;
  PERFORM set_config('app.employer_moderation_in_progress', '', true);
END $$;

-- ── Fixture ─────────────────────────────────────────────────────────────
-- E1 Ankarvakt (active): owner O, admin A, recruiter R (member, responsible
--    for J1), plain member M, removed X, suspended Y, invited I.
-- E2 Bergvakt (active, "company B"): owner B.  E3 Carlvakt (suspended): owner S.
-- C a candidate and outsider.  J1 60 and J2 40 applications at E1, J3 10 at
-- E2, J4 5 at E3. Statuses, archiving, withdrawal, answers and names vary.
CREATE TEMP TABLE f AS SELECT
  'cf19e000-0000-4000-8000-000000000001'::uuid e1, 'cf19e000-0000-4000-8000-000000000002'::uuid e2,
  'cf19e000-0000-4000-8000-000000000003'::uuid e3,
  'cf190000-0000-4000-8000-0000000000a0'::uuid o,  'cf190000-0000-4000-8000-0000000000a1'::uuid a,
  'cf190000-0000-4000-8000-0000000000a2'::uuid r,  'cf190000-0000-4000-8000-0000000000a3'::uuid m,
  'cf190000-0000-4000-8000-0000000000a4'::uuid x,  'cf190000-0000-4000-8000-0000000000a5'::uuid y,
  'cf190000-0000-4000-8000-0000000000a6'::uuid i,  'cf190000-0000-4000-8000-0000000000b0'::uuid b,
  'cf190000-0000-4000-8000-0000000000c0'::uuid s,  'cf190000-0000-4000-8000-0000000000d0'::uuid c,
  'cf191000-0000-4000-8000-000000000001'::uuid j1, 'cf191000-0000-4000-8000-000000000002'::uuid j2,
  'cf191000-0000-4000-8000-000000000003'::uuid j3, 'cf191000-0000-4000-8000-000000000004'::uuid j4,
  'cf192000-0000-4000-8000-000000000001'::uuid q1;
GRANT SELECT ON f TO PUBLIC;

INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT u, 'cv-' || n || '@synthetic.invalid', now(), jsonb_build_object('display_name', n)
  FROM f, LATERAL (VALUES (o, 'Olga Ägare'), (a, 'Adam Admin'), (r, 'Rut Rekryterare'), (m, 'Måns Medlem'),
                          (x, 'Xena Borttagen'), (y, 'Ylva Avstängd'), (i, 'Ivar Inbjuden'), (b, 'Bodil B'),
                          (s, 'Sven Vilande'), (c, 'Cilla Kandidat')) v(u, n);
INSERT INTO public.employers (id, name, slug, status)
SELECT e1, 'Ankarvakt AB (syntetisk)', 'cv-ankarvakt', 'active' FROM f UNION ALL
SELECT e2, 'Bergvakt AB (syntetisk)',  'cv-bergvakt',  'active' FROM f UNION ALL
SELECT e3, 'Carlvakt AB (syntetisk)',  'cv-carlvakt',  'active' FROM f;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
SELECT e1, o, 'owner',  'active'    FROM f UNION ALL SELECT e1, a, 'admin',  'active'  FROM f UNION ALL
SELECT e1, r, 'member', 'active'    FROM f UNION ALL SELECT e1, m, 'member', 'active'  FROM f UNION ALL
SELECT e1, x, 'member', 'removed'   FROM f UNION ALL SELECT e1, y, 'member', 'suspended' FROM f UNION ALL
SELECT e1, i, 'member', 'invited'   FROM f UNION ALL SELECT e2, b, 'owner',  'active'  FROM f UNION ALL
SELECT e3, s, 'owner',  'active'    FROM f;

-- Jobs are written by their organisations' owners, as the application does.
CREATE OR REPLACE FUNCTION pg_temp.job_as(_owner uuid, _job uuid, _emp uuid, _slug text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_user(_owner::text);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
  VALUES (_job, _slug, upper(left(replace(_slug, '-', ''), 10)), _emp, 'Syntetisk ' || _slug, 'Synthetic ' || _slug, 'internal', 'draft');
  UPDATE public.jobs SET status = 'published', expires_at = now() + interval '30 days' WHERE id = _job;
  RESET ROLE;
  PERFORM pg_temp.as_user('');
END $$;
SELECT pg_temp.job_as(o, j1, e1, 'cv-job-1') FROM f;
SELECT pg_temp.job_as(o, j2, e1, 'cv-job-2') FROM f;
SELECT pg_temp.job_as(b, j3, e2, 'cv-job-3') FROM f;
SELECT pg_temp.job_as(s, j4, e3, 'cv-job-4') FROM f;
INSERT INTO public.recruitment_questions (id, job_id, employer_id, requirement_id, prompt_sv, prompt_en, answer_kind, is_required, position)
SELECT q1, j1, e1, NULL, 'Har du körkort B?', 'Do you hold a B licence?', 'yes_no', false, 0 FROM f;
INSERT INTO public.recruitment_settings (job_id, employer_id, responsible_user_id)
SELECT j1, e1, r FROM f UNION ALL SELECT j2, e1, NULL FROM f;

CREATE TEMP TABLE apps AS
SELECT g AS n, k, job, emp,
       ('cf19a' || lpad(to_hex(k), 3, '0') || '-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS uid,
       ('cf19b' || lpad(to_hex(k), 3, '0') || '-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid AS app,
       'Sökande ' || k || '-' || lpad(g::text, 3, '0') AS name
  FROM f, LATERAL (VALUES (1, j1, e1, 60), (2, j2, e1, 40), (3, j3, e2, 10), (4, j4, e3, 5)) v(k, job, emp, cnt),
       generate_series(1, cnt) g;
GRANT SELECT ON apps TO PUBLIC;
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT uid, 'cv-app-' || app || '@synthetic.invalid', now(), jsonb_build_object('display_name', name) FROM apps;
INSERT INTO public.profiles (id, display_name) SELECT uid, name FROM apps
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, cv_source, consent_given_at, created_at)
SELECT app, job, emp, uid,
       CASE WHEN n % 10 = 0 THEN 'rejected' WHEN n % 10 = 1 THEN 'reviewing' WHEN n % 10 = 2 THEN 'interview'
            WHEN n % 10 = 3 THEN 'hired' WHEN n % 10 = 4 THEN 'withdrawn' ELSE 'submitted' END,
       'upload', now(), timestamptz '2026-10-01 00:00:00Z' + (n * interval '1 minute') + (k * interval '1 day')
  FROM apps;
UPDATE public.job_applications SET employer_archived_at = now() WHERE id IN (SELECT app FROM apps WHERE n % 7 = 0);
UPDATE public.job_applications SET withdrawn_at = now() WHERE status = 'withdrawn' AND id IN (SELECT app FROM apps);
INSERT INTO public.job_application_answers (application_id, question_id, employer_id, answer_kind, answer_bool)
SELECT app, (SELECT q1 FROM f), emp, 'yes_no', n % 2 = 1 FROM apps WHERE job = (SELECT j1 FROM f);
-- Some applications have a named responsible person (the owner filter).
INSERT INTO public.recruitment_application_meta (application_id, job_id, employer_id, responsible_user_id)
SELECT app, job, emp, (SELECT r FROM f) FROM apps WHERE job = (SELECT j1 FROM f) AND n % 3 = 0;
-- E3 becomes inactive only now, after its job and applications exist.
SELECT pg_temp.set_status(e3, 'suspended') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP CV0 — the reference body'; END $$;
SELECT pg_temp.ok(to_regprocedure('rec_cv_reference.candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid)') IS NOT NULL
                  AND position('public.rec_can_manage(a.job_id)can_manage' IN
                      (SELECT prosrc FROM pg_proc WHERE oid = 'rec_cv_reference.candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid)'::regprocedure)) > 0,
                  'CV0.1 the reference is the 20270308090000 body (per-application rec_can_manage)');
SELECT pg_temp.ok(position('rec_can_manage(a.job_id)' IN
                      (SELECT prosrc FROM pg_proc WHERE oid = 'public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid)'::regprocedure)) = 0,
                  'CV0.2 the installed body no longer calls rec_can_manage per application');

DO $$ BEGIN RAISE NOTICE 'GROUP CV1 — owner, admin, responsible recruiter'; END $$;
SELECT pg_temp.ok((v->>'total')::int = 60 AND jsonb_array_length(v->'rows') = 25
                  AND (SELECT bool_and((x->>'can_manage')::boolean) FROM jsonb_array_elements(v->'rows') x),
                  'CV1.1 the owner reads all 60 of J1, may manage every row')
  FROM (SELECT pg_temp.cur(o::text, e1, j1)::jsonb v FROM f) t;
SELECT pg_temp.ok((v->>'total')::int = 100
                  AND (SELECT bool_and((x->>'can_manage')::boolean) FROM jsonb_array_elements(v->'rows') x),
                  'CV1.2 the admin reads both jobs (100), may manage every row')
  FROM (SELECT pg_temp.cur(a::text, e1, NULL, '{"stage":"received"}', 'applied', 'asc', 1, 100)::jsonb v FROM f) t;
SELECT pg_temp.ok((SELECT bool_and((x->>'can_manage')::boolean = (x->>'job_id' = (SELECT j1::text FROM f)))
                     FROM jsonb_array_elements(v->'rows') x)
                  AND (SELECT count(DISTINCT x->>'job_id') FROM jsonb_array_elements(v->'rows') x) = 2,
                  'CV1.3 the responsible recruiter may manage J1 rows and not J2 rows, in one read')
  FROM (SELECT pg_temp.cur(r::text, e1, NULL, '{"stage":"received"}', 'applied', 'asc', 1, 100)::jsonb v FROM f) t;

DO $$ BEGIN RAISE NOTICE 'GROUP CV2 — a plain member'; END $$;
SELECT pg_temp.ok((v->>'total')::int = 100
                  AND NOT (SELECT bool_or((x->>'can_manage')::boolean) FROM jsonb_array_elements(v->'rows') x),
                  'CV2.1 a plain member reads the same population and may manage nothing')
  FROM (SELECT pg_temp.cur(m::text, e1, NULL, '{"stage":"received"}', 'applied', 'asc', 1, 100)::jsonb v FROM f) t;

DO $$ BEGIN RAISE NOTICE 'GROUP CV3 — refusals'; END $$;
SELECT pg_temp.ok(bool_and(pg_temp.cur(u::text, e1, j1) = 'err:RECRUITMENT_NOT_PERMITTED'),
                  'CV3.1 removed, suspended and invited members are refused')
  FROM f, LATERAL (VALUES (x), (y), (i)) v(u);
SELECT pg_temp.ok(pg_temp.cur(s::text, e3, j4) = 'err:RECRUITMENT_NOT_PERMITTED',
                  'CV3.2 the owner of an inactive organisation is refused') FROM f;
SELECT pg_temp.ok(pg_temp.cur(b::text, e1, j1) = 'err:RECRUITMENT_NOT_PERMITTED'
                  AND pg_temp.cur(b::text, e1, NULL) = 'err:RECRUITMENT_NOT_PERMITTED'
                  AND pg_temp.cur(b::text, e2, j1) = 'err:RECRUITMENT_NOT_PERMITTED',
                  'CV3.3 company B''s owner reads nothing of company A, not even under B''s own id') FROM f;
SELECT pg_temp.ok(pg_temp.cur(c::text, e1, j1) = 'err:RECRUITMENT_NOT_PERMITTED'
                  AND pg_temp.cur('', e1, j1) = 'err:RECRUITMENT_NOT_PERMITTED',
                  'CV3.4 an outsider and a request without a user are refused') FROM f;
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid)', 'EXECUTE')
                  AND has_function_privilege('authenticated', 'public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid)', 'EXECUTE')
                  AND (SELECT prosecdef FROM pg_proc WHERE oid = 'public.rec_ri_candidate_view(uuid,uuid,jsonb,text,text,integer,integer,uuid)'::regprocedure),
                  'CV3.5 anon has no EXECUTE; authenticated has; still SECURITY DEFINER');
SELECT pg_temp.ok((v->>'total')::int = 10, 'CV3.6 company B''s owner reads company B''s own job (control)')
  FROM (SELECT pg_temp.cur(b::text, e2, j3)::jsonb v FROM f) t;

DO $$ BEGIN RAISE NOTICE 'GROUP CV4 — filters, sort, pages, totals'; END $$;
SELECT pg_temp.ok((p1->>'pages')::int = 3 AND (p3->>'from')::int = 51 AND (p3->>'to')::int = 60
                  AND (pp->>'page')::int = 3 AND (pp->'rows') = (p3->'rows')
                  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p1->'rows') a1 JOIN jsonb_array_elements(p2->'rows') a2 ON a1->>'id' = a2->>'id'),
                  'CV4.1 pages are disjoint, the last page is 51-60 and a page past the end clamps to it')
  FROM (SELECT pg_temp.cur(o::text, e1, j1)::jsonb p1, pg_temp.cur(o::text, e1, j1, '{"stage":"received"}', 'requirements', NULL, 2)::jsonb p2,
               pg_temp.cur(o::text, e1, j1, '{"stage":"received"}', 'requirements', NULL, 3)::jsonb p3,
               pg_temp.cur(o::text, e1, j1, '{"stage":"received"}', 'requirements', NULL, 99)::jsonb pp FROM f) t;
SELECT pg_temp.ok((yes->>'total')::int = 30 AND (no->>'total')::int = 30,
                  'CV4.2 the answer filter splits J1 30/30 over the whole list')
  FROM (SELECT pg_temp.cur(o::text, e1, j1, jsonb_build_object('stage', 'received', 'answers', jsonb_build_array(jsonb_build_object('question_id', q1, 'value', true))))::jsonb yes,
               pg_temp.cur(o::text, e1, j1, jsonb_build_object('stage', 'received', 'answers', jsonb_build_array(jsonb_build_object('question_id', q1, 'value', false))))::jsonb no FROM f) t;
SELECT pg_temp.ok((v->>'total')::int = 1 AND v->'rows'->0->>'display_name' = 'Sökande 1-041',
                  'CV4.3 search finds one applicant by name')
  FROM (SELECT pg_temp.cur(o::text, e1, j1, '{"stage":"received","q":"Sökande 1-041"}')::jsonb v FROM f) t;
SELECT pg_temp.ok((v->>'total')::int = (SELECT count(*) FROM apps WHERE job = (SELECT j1 FROM f) AND n % 3 = 0),
                  'CV4.4 the owner filter applies over the whole list')
  FROM (SELECT pg_temp.cur(o::text, e1, j1, jsonb_build_object('stage', 'received', 'owner', r))::jsonb v FROM f) t;
SELECT pg_temp.ok((v->'counts'->>'total')::int = (SELECT count(*) FROM apps WHERE job = (SELECT j1 FROM f) AND n % 7 <> 0)
                  AND (v->'intelligenceCounts'->>'archived')::int = (SELECT count(*) FROM apps WHERE job = (SELECT j1 FROM f) AND n % 7 = 0)
                  AND (v->'intelligenceCounts'->>'received')::int = 60,
                  'CV4.5 counts exclude archived applications; received keeps them')
  FROM (SELECT pg_temp.cur(o::text, e1, j1)::jsonb v FROM f) t;
SELECT pg_temp.ok(jsonb_array_length(v->'rows') = 3 AND v->'rows'->1->>'id' = (SELECT app::text FROM apps WHERE job = (SELECT j1 FROM f) AND n = 30),
                  'CV4.6 the neighbours of one application come from the same ordering')
  FROM (SELECT pg_temp.cur(o::text, e1, j1, '{"stage":"received"}', 'applied', 'asc', 1, 25, (SELECT app FROM apps WHERE job = j1 AND n = 30))::jsonb v FROM f) t;

DO $$ BEGIN RAISE NOTICE 'GROUP CV5 — old = new, every principal x every view'; END $$;
CREATE TEMP TABLE principals AS
SELECT * FROM f, LATERAL (VALUES ('owner', o), ('admin', a), ('recruiter', r), ('member', m), ('removed', x), ('suspended', y),
                                 ('invited', i), ('company B', b), ('inactive org', s), ('outsider', c), ('no user', NULL::uuid)) p(who, uid);
CREATE TEMP TABLE views AS
SELECT row_number() OVER () id, * FROM f, LATERAL (VALUES
  (e1, j1, '{"stage":"all"}'::jsonb, 'requirements', NULL::text, 1, 25, NULL::uuid),
  (e1, j1, '{"stage":"all"}', 'requirements', NULL, 3, 25, NULL),
  (e1, j1, '{"stage":"all"}', 'requirements', NULL, 99, 25, NULL),
  (e1, j1, '{"stage":"open"}', 'requirements', NULL, 1, 25, NULL),
  (e1, j1, '{}', 'requirements', NULL, 1, 25, NULL),
  (e1, j1, '{"stage":"received"}', 'applied', 'asc', 1, 100, NULL),
  (e1, j1, '{"stage":"archived"}', 'applied', 'desc', 1, 25, NULL),
  (e1, j1, '{"stage":"decided"}', 'stage', 'asc', 1, 25, NULL),
  (e1, j1, '{"stage":"new"}', 'name', 'asc', 1, 25, NULL),
  (e1, j1, '{"stage":"review"}', 'name', 'desc', 1, 25, NULL),
  (e1, j1, '{"stage":"interview"}', 'activity', 'asc', 1, 25, NULL),
  (e1, j1, '{"stage":"all","status":"hired"}', 'stage', 'desc', 1, 25, NULL),
  (e1, j1, '{"stage":"all","q":"Sökande 1-04"}', 'name', 'asc', 1, 5, NULL),
  (e1, j1, '{"stage":"all","owner":"none"}', 'requirements', NULL, 2, 10, NULL),
  (e1, j1, jsonb_build_object('stage', 'all', 'owner', r), 'requirements', NULL, 1, 25, NULL),
  (e1, j1, jsonb_build_object('stage', 'all', 'answers', jsonb_build_array(jsonb_build_object('question_id', q1, 'value', true))), 'applied', 'asc', 2, 10, NULL),
  (e1, j1, '{"stage":"all","requirement":"not_established","review":"remaining"}', 'requirements', NULL, 1, 25, NULL),
  (e1, j1, '{"stage":"all","review":"pending"}', 'requirements', NULL, 1, 25, NULL),
  (e1, j1, '{"stage":"all","assessment":"open"}', 'requirements', NULL, 1, 25, NULL),
  (e1, j1, '{"stage":"all"}', 'applied', 'asc', 1, 25, (SELECT app FROM apps WHERE job = j1 AND n = 26)),
  (e1, NULL, '{"stage":"all"}', 'applied', 'asc', 1, 100, NULL),
  (e1, NULL, jsonb_build_object('stage', 'open', 'job', j2), 'requirements', NULL, 1, 25, NULL),
  (e1, j2, '{"stage":"all"}', 'name', 'asc', 2, 25, NULL),
  (e2, j3, '{"stage":"all"}', 'requirements', NULL, 1, 25, NULL),
  (e2, j1, '{"stage":"all"}', 'requirements', NULL, 1, 25, NULL),
  (e3, j4, '{"stage":"all"}', 'requirements', NULL, 1, 25, NULL),
  (e1, j1, '{"stage":"bogus"}', 'requirements', NULL, 1, 25, NULL),
  (e1, j1, '{"stage":"all"}', 'requirements', NULL, 1, 101, NULL)
) v(emp, job, filters, sort, dir, page, size, around);
CREATE TEMP TABLE compared AS
SELECT p.who, v.id,
       pg_temp.read('public.rec_ri_candidate_view', p.uid::text, v.emp, v.job, v.filters, v.sort, v.dir, v.page, v.size, v.around) AS new,
       pg_temp.read('rec_cv_reference.candidate_view', p.uid::text, v.emp, v.job, v.filters, v.sort, v.dir, v.page, v.size, v.around) AS old
  FROM principals p CROSS JOIN views v;
SELECT pg_temp.ok((SELECT count(*) FROM compared) = 11 * 28
                  AND NOT EXISTS (SELECT 1 FROM compared WHERE new IS DISTINCT FROM old),
                  'CV5.1 every principal x every view: the whole envelope, or the error, is the previous function''s');
SELECT pg_temp.ok((SELECT count(*) FROM compared WHERE new NOT LIKE 'err:%') >= 4 * 23
                  AND (SELECT count(*) FROM compared WHERE new = 'err:RECRUITMENT_NOT_PERMITTED') >= 7 * 28
                  AND (SELECT count(*) FROM compared WHERE new = 'err:CANDIDATE_VIEW_INVALID') >= 4 * 2,
                  'CV5.2 the comparison covers answers, refusals and invalid views alike (not vacuous)');
SELECT pg_temp.ok((SELECT bool_and(new::jsonb ? 'counts' AND new::jsonb ? 'intelligenceCounts' AND new::jsonb ? 'total')
                     FROM compared WHERE new NOT LIKE 'err:%'),
                  'CV5.3 every answer carries rows, total and both count blocks');

DO $$ BEGIN RAISE NOTICE 'GROUP CV6 — an application filed under another organisation than its job'; END $$;
UPDATE public.job_applications SET employer_id = (SELECT e1 FROM f)
 WHERE id = (SELECT app FROM apps WHERE job = (SELECT j3 FROM f) AND n = 1);
SELECT pg_temp.ok((v->>'total')::int = 1 AND (v->'rows'->0->>'can_manage')::boolean = false
                  AND v::text = pg_temp.ref(o::text, e1, NULL, jsonb_build_object('stage', 'received', 'job', j3))
                  AND pg_temp.cur(o::text, e1, NULL, '{"stage":"received"}', 'applied', 'asc', 2, 100)
                      = pg_temp.ref(o::text, e1, NULL, '{"stage":"received"}', 'applied', 'asc', 2, 100)
                  AND (pg_temp.cur(o::text, e1, NULL, '{"stage":"received"}', 'applied', 'asc', 2, 100)::jsonb->>'total')::int = 101,
                  'CV6.1 such a row is judged by the full rec_can_manage of its own job, exactly as before')
  FROM f, LATERAL (SELECT pg_temp.cur(o::text, e1, NULL, jsonb_build_object('stage', 'received', 'job', j3))::jsonb v) t;
UPDATE public.job_applications SET employer_id = (SELECT e2 FROM f)
 WHERE id = (SELECT app FROM apps WHERE job = (SELECT j3 FROM f) AND n = 1);

DO $$ BEGIN RAISE NOTICE 'GROUP CV7 — no cache: the next call sees the change'; END $$;
CREATE OR REPLACE FUNCTION pg_temp.manage_all(_uid uuid, _fn text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  v := pg_temp.read(_fn, _uid::text, (SELECT e1 FROM f), (SELECT j2 FROM f), '{"stage":"all"}', 'requirements', NULL, 1, 25, NULL);
  IF v LIKE 'err:%' THEN RETURN v; END IF;
  RETURN (SELECT CASE WHEN bool_and((x->>'can_manage')::boolean) THEN 'manage' WHEN bool_or((x->>'can_manage')::boolean) THEN 'mixed' ELSE 'read' END
            FROM jsonb_array_elements(v::jsonb->'rows') x);
END $$;
SELECT pg_temp.ok(pg_temp.manage_all(m, 'public.rec_ri_candidate_view') = 'read', 'CV7.1 control: the member reads J2 without managing') FROM f;
UPDATE public.employer_memberships SET role = 'admin' WHERE user_id = (SELECT m FROM f) AND employer_id = (SELECT e1 FROM f);
SELECT pg_temp.ok(pg_temp.manage_all(m, 'public.rec_ri_candidate_view') = 'manage'
                  AND pg_temp.manage_all(m, 'rec_cv_reference.candidate_view') = 'manage',
                  'CV7.2 made admin: the very next call may manage') FROM f;
UPDATE public.employer_memberships SET role = 'member' WHERE user_id = (SELECT m FROM f) AND employer_id = (SELECT e1 FROM f);
SELECT pg_temp.ok(pg_temp.manage_all(m, 'public.rec_ri_candidate_view') = 'read'
                  AND pg_temp.manage_all(m, 'rec_cv_reference.candidate_view') = 'read',
                  'CV7.3 made member again: the very next call may not') FROM f;
UPDATE public.recruitment_settings SET responsible_user_id = (SELECT m FROM f) WHERE job_id = (SELECT j2 FROM f);
SELECT pg_temp.ok(pg_temp.manage_all(m, 'public.rec_ri_candidate_view') = 'manage'
                  AND pg_temp.manage_all(r, 'public.rec_ri_candidate_view') = 'read'
                  AND pg_temp.manage_all(r, 'rec_cv_reference.candidate_view') = 'read',
                  'CV7.4 made responsible for J2: the next call manages J2; nobody else gains it') FROM f;
UPDATE public.employer_memberships SET status = 'removed' WHERE user_id = (SELECT m FROM f) AND employer_id = (SELECT e1 FROM f);
SELECT pg_temp.ok(pg_temp.manage_all(m, 'public.rec_ri_candidate_view') = 'err:RECRUITMENT_NOT_PERMITTED'
                  AND pg_temp.manage_all(m, 'rec_cv_reference.candidate_view') = 'err:RECRUITMENT_NOT_PERMITTED',
                  'CV7.5 membership removed: the very next call is refused, responsibility or not') FROM f;
UPDATE public.employer_memberships SET status = 'active' WHERE user_id = (SELECT m FROM f) AND employer_id = (SELECT e1 FROM f);
UPDATE public.recruitment_settings SET responsible_user_id = NULL WHERE job_id = (SELECT j2 FROM f);
SELECT pg_temp.set_status(e1, 'suspended') FROM f;
SELECT pg_temp.ok(pg_temp.cur(o::text, e1, j1) = 'err:RECRUITMENT_NOT_PERMITTED'
                  AND pg_temp.ref(o::text, e1, j1) = 'err:RECRUITMENT_NOT_PERMITTED',
                  'CV7.6 the organisation suspended: even the owner is refused on the next call') FROM f;
SELECT pg_temp.set_status(e1, 'active') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP CV8 — a revoked session'; END $$;
INSERT INTO auth.sessions (id, user_id) SELECT 'cf195000-0000-4000-8000-0000000000a0', o FROM f;
DELETE FROM auth.sessions WHERE id = 'cf195000-0000-4000-8000-0000000000a0';
SELECT pg_temp.ok(pg_temp.cur(o::text, e1, j1) = pg_temp.ref(o::text, e1, j1),
                  'CV8.1 the database read after a revoked session is unchanged by this slot') FROM f;

DO $$ BEGIN RAISE NOTICE 'GROUP CV9 — the shared checks run a fixed number of times per read'; END $$;
CREATE TEMP TABLE guard AS
SELECT pg_temp.calls_of('public.rec_ri_candidate_view', o::text, e1, j1) new60,
       pg_temp.calls_of('rec_cv_reference.candidate_view', o::text, e1, j1) old60 FROM f;
-- Double J1 to 120 applications and read again.
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
SELECT ('cf19c000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, 'cv-more-' || g || '@synthetic.invalid', now(), '{}'::jsonb FROM generate_series(1, 60) g;
INSERT INTO public.job_applications (id, job_id, employer_id, applicant_user_id, status, cv_source, consent_given_at, created_at)
SELECT ('cf19d000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, j1, e1, ('cf19c000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid,
       'submitted', 'upload', now(), timestamptz '2026-10-05 00:00:00Z' + g * interval '1 minute'
  FROM f, generate_series(1, 60) g;
ALTER TABLE guard ADD COLUMN new120 jsonb, ADD COLUMN old120 jsonb;
UPDATE guard SET new120 = (SELECT pg_temp.calls_of('public.rec_ri_candidate_view', o::text, e1, j1) FROM f),
                 old120 = (SELECT pg_temp.calls_of('rec_cv_reference.candidate_view', o::text, e1, j1) FROM f);
SELECT pg_temp.ok((old60->>'rec_can_manage')::int = 60 AND (old120->>'rec_can_manage')::int = 120,
                  'CV9.0 control: the reference body calls rec_can_manage once per application (60, then 120)') FROM guard;
SELECT pg_temp.ok(new60 = '{"rec_can_manage":0,"rec_is_member":1,"has_employer_role":2,"employer_is_active_status":1}'::jsonb,
                  'CV9.1 the installed body: no rec_can_manage; membership once, owner/admin once') FROM guard;
SELECT pg_temp.ok(new120 = new60, 'CV9.2 and the same counts for twice the applications: independent of the rows') FROM guard;

ROLLBACK;
