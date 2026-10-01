-- =============================================================================
-- P1 -- a candidate creates an application, never the employer's side of it
-- =============================================================================
--
-- THE DEFECT (2026-10-01 pre-release security audit, P1-1 and P1-2, reproduced
-- on a replayed database with production's grants and rolled back):
--
--   job_applications_owner_insert checked one thing: applicant_user_id =
--   auth.uid(). Every column was granted for INSERT to `authenticated`. So a
--   candidate posting straight to /rest/v1/job_applications could create an
--   application that was already:
--     - `hired` (or `interview`, `rejected`), with no status event behind it;
--     - carrying an `employer_note`, which the employer then reads through
--       rec_application_employer_note() as if a colleague had written it;
--     - `withdrawn_at`, `created_at` or `updated_at` of the candidate's choice;
--     - a `cqrityjob_cv` application whose cv_document_snapshot the candidate
--       composed, skipping the fact verification that
--       sp_submit_application_with_cv_source runs (20261102090000 says the
--       guarantee that an employer never reads a fabricated CV "is held by"
--       that function -- but the table accepted the row without it);
--     - pointing cv_storage_path at ANOTHER person's CV object. The CV link is
--       signed with service-role access from whatever path the row holds, and
--       job_cvs_employer_select shows the object to the employer the row
--       names (P1-2).
--
-- THE INVARIANT, in two independent layers:
--
--   A candidate's new application row holds only what a candidate submits.
--   Its status starts at 'submitted', it carries no employer note, it is not
--   withdrawn, its timestamps are the database's, an uploaded CV lies in the
--   candidate's own folder for THIS application, and a CqrityJob CV is the
--   snapshot the database itself makes of the candidate's own document.
--
--   1. Column privileges. `authenticated` may INSERT exactly the columns
--      sp_submit_application_with_cv_source writes -- the only legitimate
--      writer, which runs as the caller (SECURITY INVOKER) -- and nothing
--      else. status, employer_note, withdrawn_at, created_at and updated_at
--      take their defaults; employer_id is stamped by
--      job_applications_stamp_employer_id from the job.
--
--   2. The insert policy restates every rule as a row check, so the boundary
--      holds even where a stack's default privileges re-grant a column.
--
-- PATH RULE: the server writes `<applicant>/<application id>/<filename>` with
-- the filename reduced to [A-Za-z0-9._-] (applications.functions.ts). The
-- policy requires exactly that shape, under auth.uid() and the row's own id.
--
-- NOT CHANGED: sp_submit_application_with_cv_source, rec_submit_application,
-- the employer and admin read paths, every UPDATE path (there is no candidate
-- UPDATE policy), the storage bucket policies, any stored row.
--
-- HISTORICAL DATA: the migration refuses to apply if any stored CV path lies
-- outside its applicant's folder for its own application. Hosted read-only
-- check on 2026-10-01: 14 applications, 10 with a path, 0 off the rule; 0
-- non-submitted applications without a status event; 0 employer notes on a
-- never-updated row.
--
-- Rollback: supabase/rollback/20261230090000_job_application_insert_boundary_rollback.sql
-- Suite:    supabase/tests/job_application_insert_boundary_test.sql
-- =============================================================================

-- ── 0. Precondition ──────────────────────────────────────────────────────
DO $$
DECLARE _bad bigint;
BEGIN
  IF to_regprocedure('public.sp_submit_application_with_cv_source(uuid,uuid,text,text,text,text,bigint,text,uuid,boolean)') IS NULL
     OR to_regprocedure('public.cv_owned_application_snapshot(uuid)') IS NULL THEN
    RAISE EXCEPTION 'JOB_APPLICATION_INSERT_PRECONDITION: the submission function or the owned-snapshot function is missing';
  END IF;
  IF (SELECT prosecdef FROM pg_proc
       WHERE oid = 'public.sp_submit_application_with_cv_source(uuid,uuid,text,text,text,text,bigint,text,uuid,boolean)'::regprocedure) THEN
    RAISE EXCEPTION 'JOB_APPLICATION_INSERT_PRECONDITION: sp_submit_application_with_cv_source is SECURITY DEFINER; this migration assumes it inserts as the caller';
  END IF;
  SELECT count(*) INTO _bad FROM public.job_applications
   WHERE cv_storage_path IS NOT NULL
     AND (split_part(cv_storage_path, '/', 1) <> applicant_user_id::text
          OR split_part(cv_storage_path, '/', 2) <> id::text);
  IF _bad > 0 THEN
    RAISE EXCEPTION 'JOB_APPLICATION_INSERT_PRECONDITION: % stored application(s) point at a CV outside their applicant''s folder. Resolve them deliberately first.', _bad;
  END IF;
END $$;

-- ── 1. Column privileges: what a candidate submits, and nothing else ─────
REVOKE INSERT ON public.job_applications FROM PUBLIC, anon, authenticated;
GRANT INSERT (
  id, job_id, applicant_user_id, phone, cover_note,
  cv_storage_path, cv_original_filename, cv_mime_type, cv_size_bytes,
  cv_source, cv_document_id, cv_document_snapshot, consent_given_at
) ON public.job_applications TO authenticated;

-- ── 2. The row check ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "job_applications_owner_insert" ON public.job_applications;
CREATE POLICY "job_applications_owner_insert" ON public.job_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    applicant_user_id = auth.uid()
    -- The employer's side starts empty.
    AND status = 'submitted'
    AND employer_note IS NULL
    AND withdrawn_at IS NULL
    AND created_at = now()
    AND updated_at = now()
    -- An uploaded CV lies in the candidate's own folder for this application.
    AND (cv_storage_path IS NULL
         OR (cv_storage_path ~ ('^' || auth.uid()::text || '/' || id::text || '/[A-Za-z0-9._-]{1,120}$')
             AND split_part(cv_storage_path, '/', 3) !~ '^\.+$'))
    -- A CqrityJob CV is the database's own snapshot of the candidate's own
    -- document: owned, ready and fact-checked by cv_owned_application_snapshot,
    -- which raises otherwise. now() is the transaction's, so the legitimate
    -- path's snapshot compares equal. CASE, not OR: OR does not promise to
    -- skip the function for an upload, and the function raises on NULL.
    AND CASE WHEN cv_source = 'cqrityjob_cv'
             THEN cv_document_snapshot = public.cv_owned_application_snapshot(cv_document_id)
             ELSE true END
  );

COMMENT ON POLICY "job_applications_owner_insert" ON public.job_applications IS
  'P1 2026-10-01 (20261230090000): a candidate creates their own application '
  'in its initial state only -- submitted, no employer note, not withdrawn, '
  'database timestamps, a CV path in their own folder for this application, '
  'and a CqrityJob CV snapshot the database made. Column INSERT privileges '
  'hold the same line independently.';

-- ── 3. Postflight ────────────────────────────────────────────────────────
DO $$
DECLARE _col text;
BEGIN
  FOREACH _col IN ARRAY ARRAY['status', 'employer_note', 'withdrawn_at', 'created_at', 'updated_at', 'employer_id'] LOOP
    IF has_column_privilege('authenticated', 'public.job_applications', _col, 'INSERT') THEN
      RAISE EXCEPTION 'JOB_APPLICATION_INSERT_PROOF: authenticated may still INSERT job_applications.%', _col;
    END IF;
  END LOOP;
  FOREACH _col IN ARRAY ARRAY['id', 'job_id', 'applicant_user_id', 'phone', 'cover_note',
                              'cv_storage_path', 'cv_original_filename', 'cv_mime_type',
                              'cv_size_bytes', 'cv_source', 'cv_document_id',
                              'cv_document_snapshot', 'consent_given_at'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.job_applications', _col, 'INSERT') THEN
      RAISE EXCEPTION 'JOB_APPLICATION_INSERT_PROOF: the submission path lost its INSERT on job_applications.%', _col;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.job_applications', 'INSERT') THEN
    RAISE EXCEPTION 'JOB_APPLICATION_INSERT_PROOF: anon may INSERT job_applications';
  END IF;
  -- Exactly one client INSERT policy, and it is this one.
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'job_applications'
         AND cmd IN ('INSERT', 'ALL')
         AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) <> 1
     OR position('cv_owned_application_snapshot' IN
          (SELECT with_check FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'job_applications'
              AND policyname = 'job_applications_owner_insert')) = 0 THEN
    RAISE EXCEPTION 'JOB_APPLICATION_INSERT_PROOF: the client INSERT policy is not the bounded one';
  END IF;
  RAISE NOTICE 'JOB_APPLICATION_INSERT_PROOF ok: a candidate creates only the initial state of their own application';
END $$;
