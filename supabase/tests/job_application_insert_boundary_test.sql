-- P1 2026-10-01 (20261230090000): a candidate creates their own application in
-- its initial state only. Proved as the real `authenticated` role, through the
-- real submission functions and straight at the table, the way PostgREST would
-- send it. All records are synthetic and rolled back.
--
--   JA0  reproduction: on the pre-fix boundary (the real rollback, inside a
--        savepoint) a candidate creates a `hired` application with an employer
--        note the employer then reads, a composed CV snapshot, and a path into
--        another person's CV folder -- through the table AND through the RPC
--   JA1  the real submission paths still work: upload and CqrityJob CV
--   JA2  every forged field is refused at the table
--   JA3  the CV path must be the candidate's own, for this application
--   JA4  a CqrityJob CV snapshot must be the database's own
--   JA5  privileges and policy shape
--   JA6  the row check alone holds the line where a stack's default
--        privileges grant every column back

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.refused(stmt text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception
                 OR no_data_found THEN
    RAISE NOTICE 'ok  % (refused: %)', label, SQLERRM; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- statement was ACCEPTED', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.accepted(stmt text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'ok  %', label;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'ASSERTION FAILED: % -- refused: %', label, SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.refused(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.accepted(text, text) TO PUBLIC;

-- ── Fixture ──────────────────────────────────────────────────────────────
--   cand    the attacker, a candidate with a ready CqrityJob CV
--   victim  another candidate, whose CV folder the attacker aims at
--   rec     a member of the employer the job belongs to
INSERT INTO auth.users (id, email) VALUES
  ('a9000000-0000-4000-8000-000000000001', 'ja-cand@synthetic.test'),
  ('a9000000-0000-4000-8000-000000000002', 'ja-victim@synthetic.test'),
  ('a9000000-0000-4000-8000-000000000003', 'ja-rec@synthetic.test'),
  ('a9000000-0000-4000-8000-00000000000a', 'ja-admin@synthetic.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('b9000000-0000-4000-8000-000000000001', 'JA Bevakning', 'ja-bevakning', 'active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000003', 'owner', 'active', now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('a9000000-0000-4000-8000-00000000000a', 'admin') ON CONFLICT DO NOTHING;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-00000000000a';
INSERT INTO public.jobs (id, employer_id, title_sv, title_en, status, application_method,
                         slug, short_id, published_at, expires_at)
SELECT ('c9000000-0000-4000-8000-00000000000' || n)::uuid, 'b9000000-0000-4000-8000-000000000001',
       'Väktare ' || n, 'Guard ' || n, 'published', 'internal', 'ja-job-' || n, 'JA00000' || n,
       now(), now() + interval '30 days'
  FROM generate_series(1, 9) n
ON CONFLICT (id) DO NOTHING;
RESET request.jwt.claim.sub;

INSERT INTO public.sp_experience_periods
  (id, holder_user_id, employer_name, role_title, started_on, ended_on, lifecycle_state)
VALUES ('f9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
        'Bevakning AB', 'Väktare', DATE '2016-01-01', NULL, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cv_documents (id, owner_user_id, title, locale, purpose, origin,
                                 source_bundle, presentation) VALUES
  ('d9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'Mitt CV', 'sv', 'general', 'factual',
   jsonb_build_object(
     'bundleVersion', 'cv-source-bundle-v1', 'locale', 'sv',
     'identity', jsonb_build_object('displayName', 'JA Kandidat', 'headline', 'Väktare',
                                    'country', 'Sverige', 'currentProfession', 'Väktare',
                                    'yearsOfExperience', '5-10'),
     'employment', jsonb_build_array(jsonb_build_object(
        'id', 'f9000000-0000-4000-8000-000000000001',
        'employerName', 'Bevakning AB', 'roleTitle', 'Väktare',
        'startedOn', '2016-01-01', 'endedOn', NULL, 'employmentType', 'full_time',
        'assertionLevel', 'self_declared')),
     'education', '[]'::jsonb, 'credentials', '[]'::jsonb,
     'skills', '[]'::jsonb, 'languages', '[]'::jsonb,
     'careerInsight', NULL, 'targetJobText', NULL),
   '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- A direct POST to /rest/v1/job_applications, as the candidate, with one
-- column overridden. Everything else is what the real upload path writes.
CREATE OR REPLACE FUNCTION pg_temp.direct_insert(_app uuid, _job int, _extra_cols text, _extra_vals text,
                                                 _path text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT format(
    'INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_storage_path, consent_given_at%s) '
    'VALUES (%L, %L, auth.uid(), ''upload'', %s, now()%s)',
    _extra_cols, _app, ('c9000000-0000-4000-8000-00000000000' || _job)::uuid,
    coalesce(quote_literal(_path), 'NULL'), _extra_vals);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.direct_insert(uuid, int, text, text, text) TO PUBLIC;

-- ── JA0 · reproduction on the pre-fix boundary ──────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP JA0 -- reproduction on the pre-fix boundary'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20261230090000_job_application_insert_boundary_rollback.sql

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.accepted(
  pg_temp.direct_insert('e9000000-0000-4000-8000-0000000000f1', 1,
    ', status, employer_note, created_at',
    ', ''hired'', ''Strong hire -- reference checked by HR'', now() - interval ''30 days''',
    'a9000000-0000-4000-8000-000000000002/e9000000-0000-4000-8000-0000000000f1/cv.pdf'),
  'JA0.1 PRE-FIX: a candidate creates a hired, back-dated application with an employer note and the victim''s CV folder');
SELECT pg_temp.accepted(
  $q$SELECT public.rec_submit_application('e9000000-0000-4000-8000-0000000000f2', 'c9000000-0000-4000-8000-000000000002',
       NULL, NULL, 'a9000000-0000-4000-8000-000000000002/e9000000-0000-4000-8000-0000000000f2/cv.pdf',
       'cv.pdf', 1000, 'upload', NULL, false, '[]'::jsonb)$q$,
  'JA0.2 PRE-FIX: the submission RPC stores a path into the victim''s CV folder');
RESET ROLE;
SELECT pg_temp.ok(
  (SELECT status = 'hired' AND created_at < now() - interval '29 days'
     FROM public.job_applications WHERE id = 'e9000000-0000-4000-8000-0000000000f1'),
  'JA0.3 PRE-FIX: the forged row is stored hired and back-dated');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000003';
SELECT pg_temp.ok(
  public.rec_application_employer_note('e9000000-0000-4000-8000-0000000000f1') LIKE 'Strong hire%',
  'JA0.4 PRE-FIX: the employer reads the candidate''s note as its own');
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.accepted(
  $q$INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_document_id,
       cv_document_snapshot, consent_given_at)
     VALUES ('e9000000-0000-4000-8000-0000000000f4', 'c9000000-0000-4000-8000-000000000004', auth.uid(),
       'cqrityjob_cv', 'd9000000-0000-4000-8000-000000000001',
       '{"snapshot_version":"application-cv-snapshot-v2","source_bundle":{"employment":[{"employerName":"Säpo","roleTitle":"Chef"}]}}'::jsonb,
       now())$q$,
  'JA0.5 PRE-FIX: a candidate composes their own CqrityJob CV snapshot');
RESET ROLE; RESET request.jwt.claim.sub;
ROLLBACK TO SAVEPOINT before_fix;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications WHERE id::text LIKE 'e9000000-0000-4000-8000-0000000000f%') = 0,
  'JA0.6 the reproduction left nothing behind');

-- ── JA1 · the real submission paths still work ──────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP JA1 -- the real submission paths still work'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.ok(
  (public.rec_submit_application('e9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
     '0701234567', 'Hej', 'a9000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000001/Mitt_CV.pdf',
     'Mitt CV.pdf', 1000, 'upload', NULL, false, '[]'::jsonb) ->> 'status') = 'submitted',
  'JA1.1 an uploaded CV in the candidate''s own folder submits');
SELECT pg_temp.ok(
  (public.rec_submit_application('e9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000002',
     NULL, NULL, NULL, NULL, NULL, 'cqrityjob_cv', 'd9000000-0000-4000-8000-000000000001', false, '[]'::jsonb)
     ->> 'cv_source') = 'cqrityjob_cv',
  'JA1.2 a CqrityJob CV submits');
SELECT pg_temp.ok(
  (public.rec_submit_application('e9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000003',
     NULL, NULL, NULL, NULL, NULL, 'upload', NULL, false, '[]'::jsonb) ->> 'status') = 'submitted',
  'JA1.3 an application with no CV file submits');
SELECT pg_temp.ok(
  (public.rec_submit_application('e9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
     NULL, NULL, NULL, NULL, NULL, 'upload', NULL, false, '[]'::jsonb) ->> 'replayed')::boolean,
  'JA1.4 a retry is still answered as a replay');
RESET ROLE;
SELECT pg_temp.ok(
  (SELECT bool_and(status = 'submitted' AND employer_note IS NULL AND withdrawn_at IS NULL
                   AND employer_id = 'b9000000-0000-4000-8000-000000000001')
     FROM public.job_applications WHERE id::text LIKE 'e9000000-0000-4000-8000-00000000000_'),
  'JA1.5 every real submission is stored in its initial state');
SELECT pg_temp.ok(
  (SELECT cv_document_snapshot ->> 'snapshot_version' = 'application-cv-snapshot-v2'
     FROM public.job_applications WHERE id = 'e9000000-0000-4000-8000-000000000002'),
  'JA1.6 the CqrityJob CV is the database''s snapshot');

-- ── JA2 · every forged field is refused at the table ────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP JA2 -- every forged field is refused at the table'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000021', 4, ', status', ', ''hired'''),
  'JA2.1 status hired');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000022', 4, ', status', ', ''submitted'''),
  'JA2.2 even status submitted, named explicitly (the column is not the candidate''s)');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000023', 4, ', employer_note', ', ''Strong hire'''),
  'JA2.3 an employer note');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000024', 4, ', withdrawn_at', ', now()'),
  'JA2.4 withdrawn_at');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000025', 4, ', created_at', ', now() - interval ''30 days'''),
  'JA2.5 a back-dated created_at');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000026', 4, ', updated_at', ', now()'),
  'JA2.6 updated_at');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000027', 4, ', employer_id', ', ''b9000000-0000-4000-8000-000000000001'''),
  'JA2.7 employer_id');
SELECT pg_temp.refused(
  replace(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000028', 4, '', ''), 'auth.uid()', '''a9000000-0000-4000-8000-000000000002'''),
  'JA2.8 an application in somebody else''s name');
SELECT pg_temp.accepted(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000029', 4, '', ''),
  'JA2.9 the same direct insert with only candidate columns is accepted (the boundary is the fields, not the door)');
RESET ROLE;
SELECT pg_temp.ok(
  (SELECT status = 'submitted' AND created_at = now() FROM public.job_applications
    WHERE id = 'e9000000-0000-4000-8000-000000000029'),
  'JA2.10 and it is stored in its initial state');

-- ── JA3 · the CV path ───────────────────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP JA3 -- the CV path is the candidate''s own, for this application'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.refused(
  $q$SELECT public.rec_submit_application('e9000000-0000-4000-8000-000000000031', 'c9000000-0000-4000-8000-000000000005',
       NULL, NULL, 'a9000000-0000-4000-8000-000000000002/e9000000-0000-4000-8000-000000000031/cv.pdf',
       'cv.pdf', 1000, 'upload', NULL, false, '[]'::jsonb)$q$,
  'JA3.1 the RPC refuses a path in the victim''s folder');
SELECT pg_temp.refused(
  pg_temp.direct_insert('e9000000-0000-4000-8000-000000000032', 5, '', '',
    'a9000000-0000-4000-8000-000000000002/e9000000-0000-4000-8000-000000000032/cv.pdf'),
  'JA3.2 the table refuses a path in the victim''s folder');
SELECT pg_temp.refused(
  pg_temp.direct_insert('e9000000-0000-4000-8000-000000000033', 5, '', '',
    'a9000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000001/Mitt_CV.pdf'),
  'JA3.3 a path under the candidate''s OTHER application');
SELECT pg_temp.refused(
  pg_temp.direct_insert('e9000000-0000-4000-8000-000000000034', 5, '', '',
    'a9000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000034/../../a9000000-0000-4000-8000-000000000002/x/cv.pdf'),
  'JA3.4 a traversal out of the folder');
SELECT pg_temp.refused(
  pg_temp.direct_insert('e9000000-0000-4000-8000-000000000035', 5, '', '',
    'a9000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000035/..'),
  'JA3.5 a file name of dots');
SELECT pg_temp.refused(
  pg_temp.direct_insert('e9000000-0000-4000-8000-000000000036', 5, '', '',
    'a9000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000036/'),
  'JA3.6 no file name');
SELECT pg_temp.accepted(
  pg_temp.direct_insert('e9000000-0000-4000-8000-000000000037', 5, '', '',
    'a9000000-0000-4000-8000-000000000001/e9000000-0000-4000-8000-000000000037/.cv_2026-v1.pdf'),
  'JA3.7 any file name the server can produce is accepted');
RESET ROLE;

-- ── JA4 · the CqrityJob CV snapshot ─────────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP JA4 -- a CqrityJob CV snapshot is the database''s own'; END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.refused(
  $q$INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_document_id,
       cv_document_snapshot, consent_given_at)
     VALUES ('e9000000-0000-4000-8000-000000000041', 'c9000000-0000-4000-8000-000000000006', auth.uid(),
       'cqrityjob_cv', 'd9000000-0000-4000-8000-000000000001',
       '{"snapshot_version":"application-cv-snapshot-v2","source_bundle":{"employment":[{"employerName":"Säpo","roleTitle":"Chef"}]}}'::jsonb,
       now())$q$,
  'JA4.1 a composed snapshot of the candidate''s own document');
SELECT pg_temp.refused(
  $q$INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_document_id,
       cv_document_snapshot, consent_given_at)
     VALUES ('e9000000-0000-4000-8000-000000000042', 'c9000000-0000-4000-8000-000000000006', auth.uid(),
       'cqrityjob_cv', 'd9000000-0000-4000-8000-000000000099', '{}'::jsonb, now())$q$,
  'JA4.2 a snapshot claiming a document that is not the candidate''s');
SELECT pg_temp.accepted(
  $q$INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_document_id,
       cv_document_snapshot, consent_given_at)
     VALUES ('e9000000-0000-4000-8000-000000000043', 'c9000000-0000-4000-8000-000000000006', auth.uid(),
       'cqrityjob_cv', 'd9000000-0000-4000-8000-000000000001',
       public.cv_owned_application_snapshot('d9000000-0000-4000-8000-000000000001'), now())$q$,
  'JA4.3 the database''s own snapshot, inserted directly, is accepted (nothing was composed)');
RESET ROLE;
UPDATE public.sp_experience_periods SET employer_name = 'Changed after saving'
 WHERE id = 'f9000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.refused(
  $q$INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_document_id,
       cv_document_snapshot, consent_given_at)
     SELECT 'e9000000-0000-4000-8000-000000000044', 'c9000000-0000-4000-8000-000000000007', auth.uid(),
       'cqrityjob_cv', 'd9000000-0000-4000-8000-000000000001', cv_document_snapshot, now()
       FROM public.job_applications WHERE id = 'e9000000-0000-4000-8000-000000000002'$q$,
  'JA4.4 a snapshot copied from an earlier application after its facts went stale');
RESET ROLE; RESET request.jwt.claim.sub;

-- ── JA5 · privileges and policy shape ───────────────────────────────────
DO $$ BEGIN RAISE NOTICE 'GROUP JA5 -- privileges and policy shape'; END $$;
SELECT pg_temp.ok(
  NOT has_column_privilege('authenticated', 'public.job_applications', 'status', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.job_applications', 'employer_note', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.job_applications', 'withdrawn_at', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.job_applications', 'created_at', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.job_applications', 'updated_at', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.job_applications', 'employer_id', 'INSERT'),
  'JA5.1 the employer''s and the database''s columns are not granted for INSERT');
SELECT pg_temp.ok(NOT has_table_privilege('anon', 'public.job_applications', 'INSERT'),
  'JA5.2 anon cannot INSERT');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'job_applications'
      AND cmd IN ('INSERT', 'ALL') AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) = 1,
  'JA5.3 exactly one client INSERT policy');
SELECT pg_temp.ok(
  NOT (SELECT prosecdef FROM pg_proc
        WHERE oid = 'public.sp_submit_application_with_cv_source(uuid,uuid,text,text,text,text,bigint,text,uuid,boolean)'::regprocedure),
  'JA5.4 the submission still inserts as the caller, so the boundary applies to it');

-- ── JA6 · the row check holds without the column privileges ─────────────
DO $$ BEGIN RAISE NOTICE 'GROUP JA6 -- the row check alone holds where every column is granted back'; END $$;
SAVEPOINT regranted;
GRANT INSERT ON public.job_applications TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a9000000-0000-4000-8000-000000000001';
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000061', 8, ', status', ', ''hired'''),
  'JA6.1 status hired, by the policy');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000062', 8, ', employer_note', ', ''Strong hire'''),
  'JA6.2 an employer note, by the policy');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000063', 8, ', withdrawn_at', ', now()'),
  'JA6.3 withdrawn_at, by the policy');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000064', 8, ', created_at', ', now() - interval ''30 days'''),
  'JA6.4 a back-dated created_at, by the policy');
SELECT pg_temp.refused(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000065', 8, ', updated_at', ', now() + interval ''1 day'''),
  'JA6.5 a forged updated_at, by the policy');
SELECT pg_temp.accepted(pg_temp.direct_insert('e9000000-0000-4000-8000-000000000066', 8, ', status', ', ''submitted'''),
  'JA6.6 the initial status, named, is what the policy allows');
RESET ROLE; RESET request.jwt.claim.sub;
ROLLBACK TO SAVEPOINT regranted;
SELECT pg_temp.ok(NOT has_column_privilege('authenticated', 'public.job_applications', 'status', 'INSERT'),
  'JA6.7 the re-grant was confined to this group');

ROLLBACK;
