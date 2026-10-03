-- The candidate-CV bucket has no client write path. Migration 20270201090000.
--
-- A candidate used to be able, through the Storage API with their own JWT, to
-- overwrite or delete the CV of an application already submitted, and to store
-- any bytes at their own CV path. Proved as the real `authenticated` role
-- against the real policies; synthetic data, everything rolls back.
--
--   CV0  reproduction: with the four applicant policies back (the real
--        rollback, inside a savepoint) a candidate replaces, deletes and plants
--        a CV object
--   CV1  the candidate can no longer write, replace, delete or list
--   CV2  nobody else can reach the candidate's objects either
--   CV3  the legitimate reads are intact: the employer's, and the server's
--   CV4  a directly-inserted application cannot point at an arbitrary object
--   CV5  policy inventory

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(_cond boolean, _label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', _label;
  END IF;
  RAISE NOTICE 'ok  %', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(_sql text, _needle text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%' || _needle || '%' THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % -- refused, but with "%"', _label, _msg;
    END IF;
    RAISE NOTICE 'ok  %', _label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % -- it was allowed', _label;
END $$;

-- Rows touched by a statement, as the current role.
CREATE OR REPLACE FUNCTION pg_temp.rows_of(_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE _n bigint;
BEGIN
  EXECUTE _sql;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_u text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', _u, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', NULL, true);
END $$;

-- ── Fixture ──────────────────────────────────────────────────────────────
--   C  the candidate who applied     D  another candidate
--   R  a member of the employer the job belongs to
--   X  a member of an unrelated employer
INSERT INTO auth.users (id, email) VALUES
  ('7a1e0000-0000-4000-8000-000000000001','cand@cvbucket.invalid'),
  ('7a1e0000-0000-4000-8000-000000000002','other@cvbucket.invalid'),
  ('7a1e0000-0000-4000-8000-000000000003','rec@cvbucket.invalid'),
  ('7a1e0000-0000-4000-8000-000000000004','stranger@cvbucket.invalid');
INSERT INTO public.employers (id, name, slug, status) VALUES
  ('7a1e0000-1111-4000-8000-000000000001','CV Hink AB','cv-hink','active'),
  ('7a1e0000-1111-4000-8000-000000000002','CV Annan AB','cv-annan','active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status, accepted_at) VALUES
  ('7a1e0000-1111-4000-8000-000000000001','7a1e0000-0000-4000-8000-000000000003','member','active',now()),
  ('7a1e0000-1111-4000-8000-000000000002','7a1e0000-0000-4000-8000-000000000004','member','active',now());
INSERT INTO public.jobs (id, employer_id, slug, short_id, title_sv, description_sv, status,
                         application_method, expires_at)
VALUES ('7a1e0000-2222-4000-8000-000000000001','7a1e0000-1111-4000-8000-000000000001',
        'cv-job-1','cvjob00001','Väktare','Beskrivning','draft','internal', now() + interval '30 days');
SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000003');
UPDATE public.jobs SET status = 'published' WHERE id = '7a1e0000-2222-4000-8000-000000000001';
SELECT pg_temp.as_owner();

INSERT INTO storage.buckets (id, name, public) VALUES ('job-application-cvs', 'job-application-cvs', false)
ON CONFLICT (id) DO NOTHING;

-- C applies with an uploaded CV: the application row, as the candidate through
-- the row policy, and the object, as the server's service role stores it.
SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000001');
INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_storage_path, consent_given_at)
VALUES ('7a1e0000-3333-4000-8000-000000000001','7a1e0000-2222-4000-8000-000000000001',
        '7a1e0000-0000-4000-8000-000000000001','upload',
        '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf', now());
SELECT pg_temp.as_owner();
INSERT INTO storage.objects (id, bucket_id, name, owner) VALUES
  ('7a1e0000-4444-4000-8000-000000000001','job-application-cvs',
   '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf',
   '7a1e0000-0000-4000-8000-000000000001');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.job_applications WHERE applicant_user_id = '7a1e0000-0000-4000-8000-000000000001') = 1
  AND (SELECT count(*) FROM storage.objects WHERE bucket_id = 'job-application-cvs') = 1,
  'CV-F the candidate''s application and its stored CV exist');

-- ═══════════════════════════════════════════════════════════════════════════
-- CV0  Reproduction on the pre-fix policies
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN RAISE NOTICE 'GROUP CV0 -- reproduction on the pre-fix policies'; END $$;
SAVEPOINT before_fix;
\ir ../rollback/20270201090000_job_cvs_no_client_writes_rollback.sql

SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000001');
SELECT pg_temp.ok(
  pg_temp.rows_of($q$UPDATE storage.objects SET name = '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf', owner = '7a1e0000-0000-4000-8000-000000000001'
                       WHERE id = '7a1e0000-4444-4000-8000-000000000001'$q$) = 1,
  'CV0.1 PRE-FIX: the candidate REPLACES the CV of a submitted application (UPDATE matched the object)');
SELECT pg_temp.ok(
  pg_temp.rows_of($q$INSERT INTO storage.objects (bucket_id, name, owner)
                     VALUES ('job-application-cvs',
                             '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-0000000000aa/not-a.pdf',
                             '7a1e0000-0000-4000-8000-000000000001')$q$) = 1,
  'CV0.2 PRE-FIX: the candidate plants any bytes at their own CV path (no PDF check, no size check)');
SELECT pg_temp.ok(
  pg_temp.rows_of($q$DELETE FROM storage.objects WHERE id = '7a1e0000-4444-4000-8000-000000000001'$q$) = 1,
  'CV0.3 PRE-FIX: the candidate DELETES the CV the employer has already been shown');
SELECT pg_temp.as_owner();
ROLLBACK TO SAVEPOINT before_fix;

-- ═══════════════════════════════════════════════════════════════════════════
-- CV1  The candidate can no longer write, replace, delete or list
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  (SELECT count(*) FROM storage.objects WHERE id = '7a1e0000-4444-4000-8000-000000000001') = 1,
  'CV1.0 the reproduction was undone: the stored CV is back');

SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000001');
SELECT pg_temp.must_fail(
  $q$INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('job-application-cvs',
             '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-0000000000aa/not-a.pdf',
             '7a1e0000-0000-4000-8000-000000000001')$q$,
  'row-level security', 'CV1.1 the candidate cannot store an object under their own CV folder');
SELECT pg_temp.must_fail(
  $q$INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('job-application-cvs',
             '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv2.pdf',
             '7a1e0000-0000-4000-8000-000000000001')$q$,
  'row-level security', 'CV1.2 ...not even into the folder of the application already submitted');
SELECT pg_temp.ok(
  pg_temp.rows_of($q$UPDATE storage.objects SET owner = '7a1e0000-0000-4000-8000-000000000001',
                            name = '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf'
                      WHERE id = '7a1e0000-4444-4000-8000-000000000001'$q$) = 0,
  'CV1.3 the candidate cannot replace the submitted CV (UPDATE matches no object)');
SELECT pg_temp.ok(
  pg_temp.rows_of($q$DELETE FROM storage.objects WHERE id = '7a1e0000-4444-4000-8000-000000000001'$q$) = 0,
  'CV1.4 the candidate cannot delete the submitted CV (DELETE matches no object)');
SELECT pg_temp.ok(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'job-application-cvs') = 0,
  'CV1.5 the candidate cannot list or read objects in the bucket through the API at all (the server signs the link)');
SELECT pg_temp.as_owner();
SELECT pg_temp.ok(
  (SELECT name FROM storage.objects WHERE id = '7a1e0000-4444-4000-8000-000000000001')
    = '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf'
  AND (SELECT count(*) FROM storage.objects WHERE bucket_id = 'job-application-cvs') = 1,
  'CV1.6 the stored CV is exactly what the server stored');

-- ═══════════════════════════════════════════════════════════════════════════
-- CV2  Nobody else reaches the candidate's objects
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000002');
SELECT pg_temp.must_fail(
  $q$INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('job-application-cvs',
             '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf.bak',
             '7a1e0000-0000-4000-8000-000000000002')$q$,
  'row-level security', 'CV2.1 another candidate cannot write into the candidate''s folder');
SELECT pg_temp.ok(
  pg_temp.rows_of($q$DELETE FROM storage.objects WHERE id = '7a1e0000-4444-4000-8000-000000000001'$q$) = 0
  AND (SELECT count(*) FROM storage.objects WHERE bucket_id = 'job-application-cvs') = 0,
  'CV2.2 ...nor delete or read it');
SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000004');
SELECT pg_temp.ok(
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'job-application-cvs') = 0
  AND pg_temp.rows_of($q$DELETE FROM storage.objects WHERE id = '7a1e0000-4444-4000-8000-000000000001'$q$) = 0,
  'CV2.3 a member of an UNRELATED employer cannot read or delete it');
SELECT pg_temp.as_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- CV3  The legitimate reads are intact
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000003');
SELECT pg_temp.ok(
  (SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'job-application-cvs'
      AND name = '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf') = 1,
  'CV3.1 a member of the employer the application belongs to can still read the CV (read-only policy kept)');
SELECT pg_temp.ok(
  pg_temp.rows_of($q$DELETE FROM storage.objects WHERE id = '7a1e0000-4444-4000-8000-000000000001'$q$) = 0,
  'CV3.2 ...and still cannot delete it');
SELECT pg_temp.as_owner();

-- The server's own client is the service role, which bypasses RLS.
DO $$
DECLARE _n bigint;
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('job-application-cvs',
          '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-0000000000bb/cv.pdf',
          '7a1e0000-0000-4000-8000-000000000001');
  DELETE FROM storage.objects
   WHERE name = '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-0000000000bb/cv.pdf';
  GET DIAGNOSTICS _n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.ok(_n = 1, 'CV3.3 the server (service role) still uploads and cleans up as before');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CV4  A directly-inserted application cannot point at an arbitrary object
-- ═══════════════════════════════════════════════════════════════════════════
-- job_applications_owner_insert (20261230090000) pins the path to
-- <own uid>/<this application's id>/<file>. With no client write path into the
-- bucket, the only object that can exist at such a path is one the server stored.

SELECT pg_temp.as_user('7a1e0000-0000-4000-8000-000000000002');
SELECT pg_temp.must_fail(
  $q$INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_storage_path, consent_given_at)
     VALUES ('7a1e0000-3333-4000-8000-0000000000d1','7a1e0000-2222-4000-8000-000000000001',
             '7a1e0000-0000-4000-8000-000000000002','upload',
             '7a1e0000-0000-4000-8000-000000000001/7a1e0000-3333-4000-8000-000000000001/cv.pdf', now())$q$,
  'row-level security', 'CV4.1 an application cannot point at ANOTHER person''s CV object');
SELECT pg_temp.must_fail(
  $q$INSERT INTO public.job_applications (id, job_id, applicant_user_id, cv_source, cv_storage_path, consent_given_at)
     VALUES ('7a1e0000-3333-4000-8000-0000000000d2','7a1e0000-2222-4000-8000-000000000001',
             '7a1e0000-0000-4000-8000-000000000002','upload',
             '7a1e0000-0000-4000-8000-000000000002/7a1e0000-3333-4000-8000-000000000001/cv.pdf', now())$q$,
  'row-level security', 'CV4.2 ...nor at an object of their own that belongs to a different application');
SELECT pg_temp.as_owner();

-- ═══════════════════════════════════════════════════════════════════════════
-- CV5  Policy inventory
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname LIKE 'job_cvs_applicant_%'),
  'CV5.1 none of the four applicant policies exists');
SELECT pg_temp.ok(
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                 AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
                 AND (coalesce(qual, '') LIKE '%job-application-cvs%'
                      OR coalesce(with_check, '') LIKE '%job-application-cvs%')),
  'CV5.2 no client write policy mentions the CV bucket');
SELECT pg_temp.ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual, '') LIKE '%job-application-cvs%' OR coalesce(with_check, '') LIKE '%job-application-cvs%')) = 1
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                AND policyname = 'job_cvs_employer_select' AND cmd = 'SELECT'),
  'CV5.3 the one policy left on the bucket is the employer''s read-only select');

DO $$ BEGIN RAISE NOTICE 'job_cvs_no_client_writes suite complete'; END $$;

ROLLBACK;
