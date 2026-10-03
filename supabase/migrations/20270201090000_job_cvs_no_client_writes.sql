-- =============================================================================
-- The candidate-CV bucket has no client write path
-- =============================================================================
--
-- THE DEFECT (launch-readiness audit of the job board). 20260721085020 gave an
-- applicant, through Supabase Storage with their own JWT, INSERT, UPDATE,
-- DELETE and SELECT on every object under `<their uid>/...` in the private
-- `job-application-cvs` bucket (job_cvs_applicant_insert / _update / _delete /
-- _select; docs/security/2026-09-27/production-metadata.json lists all five
-- policies as live). Two things follow:
--
--   1. A candidate can overwrite or delete the CV of an application that was
--      already submitted -- after the employer has opened it, screened on it,
--      or exported it. `job_applications.cv_storage_path` keeps pointing at the
--      object, so the employer's "CV" button then serves whatever the candidate
--      put there, or nothing.
--   2. A candidate can put ANY bytes at `<uid>/<application id>/<file>`, then
--      insert the application row directly with that path (the row policy
--      job_applications_owner_insert accepts exactly that path shape,
--      20261230090000). That skips the checks submitJobApplication makes before
--      anything is stored: the %PDF- magic number and the 5 MB limit.
--
-- THE CODE NEVER NEEDED THEM. applications.functions.ts says the bucket has
-- "zero client-facing policies": the browser never talks to this bucket.
-- Every read and write -- the upload, the clean-up of a failed submission, the
-- five-minute signed URL an applicant or an employer member opens, the account
-- erasure sweep -- is made with the service role, which bypasses these
-- policies. A search of src/, supabase/functions/, scripts/ and e2e/ finds
-- every Storage call on this bucket (upload, remove, createSignedUrl,
-- getBucket, createBucket) made with supabaseAdmin (applications.functions.ts,
-- admin-storage-erasure.functions.ts) or an admin client in a script.
--
-- THE FIX: drop the four applicant policies. A candidate then has no way to
-- create, replace, remove or list an object in this bucket through the API; the
-- server is the only writer, so every stored CV has been through its checks, and
-- the existing row policy (own folder, this application's id) is sufficient
-- to keep a directly-inserted application from pointing anywhere else.
--
-- KEPT: job_cvs_employer_select. An active member of the employer a stored path
-- belongs to may read that one object -- the same authorisation
-- getApplicationCvSignedUrl applies, and read-only. Nothing in the application
-- uses it either; removing it is a separate decision.
--
-- App order: no application change is needed and none depends on this
-- migration; it can be applied before or after any code deploy. A client that
-- really did call the Storage API for this bucket as the applicant would now be
-- refused -- the repository has none.
--
-- HOSTED PRE-CHECK (read-only): list storage.objects policies and confirm there
-- is no OTHER write policy that admits this bucket (a bucket-agnostic one the
-- repository does not hold). The postflight below fails the migration, and so
-- rolls it back, if one that names the bucket remains.
--
-- Rollback: supabase/rollback/20270201090000_job_cvs_no_client_writes_rollback.sql
-- Suite:    supabase/tests/job_cvs_no_client_writes_test.sql
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'JOB_CVS_NO_CLIENT_WRITES_PRECONDITION: storage.objects is missing';
  END IF;
END $$;

DROP POLICY IF EXISTS "job_cvs_applicant_insert" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_update" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_delete" ON storage.objects;
DROP POLICY IF EXISTS "job_cvs_applicant_select" ON storage.objects;

-- ── Postflight ─────────────────────────────────────────────────────────────
DO $$
DECLARE _bad text;
BEGIN
  SELECT string_agg(policyname || ' (' || cmd || ')', ', ') INTO _bad
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
     AND (coalesce(qual, '') LIKE '%job-application-cvs%'
          OR coalesce(with_check, '') LIKE '%job-application-cvs%');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'JOB_CVS_NO_CLIENT_WRITES_PROOF: a client write policy still admits the CV bucket: %', _bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'storage' AND tablename = 'objects'
                AND policyname LIKE 'job_cvs_applicant_%') THEN
    RAISE EXCEPTION 'JOB_CVS_NO_CLIENT_WRITES_PROOF: an applicant policy on the CV bucket survived';
  END IF;

  RAISE NOTICE 'JOB_CVS_NO_CLIENT_WRITES_PROOF ok: no client role can write, replace, delete or list a CV object through the API';
END $$;
