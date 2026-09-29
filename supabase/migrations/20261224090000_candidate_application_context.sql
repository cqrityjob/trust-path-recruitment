-- =============================================================================
-- Applications -- the candidate keeps the context of their own application
-- =============================================================================
--
-- Resolves JB-01 of docs/release/2026-09-28-release-uat-report.md.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────
--
-- The candidate's application history read the job's title and the
-- employer's name by embedding `jobs(…, employers(name))` through the
-- candidate's own RLS-scoped client. The only jobs policy a candidate has is
-- jobs_public_active_select (published, before the deadline and expiry, of an
-- active employer), and employers_public_active_select needs a live job. So
-- the moment a vacancy closed -- deadline passed, expired, archived, or the
-- employer's last live ad went -- the candidate's card lost its title, its
-- employer and its link and read "—". Verified on the hosted database on
-- 2026-09-28: both applications to an archived job return no job and no
-- employer to their applicants.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────
--
-- One SECURITY DEFINER read that returns, for the CALLER'S OWN applications
-- only, the job's slug and titles and the employer's name, plus whether the
-- advertisement is still open to the public. It reads jobs and employers as
-- the owner, so the context survives the vacancy closing, and it never
-- returns a row the caller did not apply for.
--
-- The public jobs and employers policies are NOT touched: a closed
-- advertisement stays invisible to everyone else, and the candidate's page
-- links to the advertisement only while `job_open` is true.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rec_my_application_context()
RETURNS TABLE (
  application_id uuid,
  job_id uuid,
  job_slug text,
  title_sv text,
  title_en text,
  employer_name text,
  job_open boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id,
         a.job_id,
         j.slug,
         j.title_sv,
         j.title_en,
         e.name,
         coalesce(public.job_is_active(j.status, j.published_at, j.deadline_at, j.expires_at), false)
           AND coalesce(public.employer_is_active_status(j.employer_id), false)
    FROM public.job_applications a
    JOIN public.jobs j ON j.id = a.job_id
    LEFT JOIN public.employers e ON e.id = j.employer_id
   WHERE auth.uid() IS NOT NULL
     AND a.applicant_user_id = auth.uid();
$$;
COMMENT ON FUNCTION public.rec_my_application_context() IS
  'The job title, slug and employer name of each of the CALLER''S OWN '
  'applications, whether or not the advertisement is still public, plus '
  'job_open (still visible under the public jobs policy). Never another '
  'person''s application. Fixes JB-01: application history after a vacancy closes.';
REVOKE ALL ON FUNCTION public.rec_my_application_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_my_application_context() TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.rec_my_application_context()', 'EXECUTE') THEN
    RAISE EXCEPTION 'JB01_PROOF failed: anon may execute the context read';
  END IF;
  RAISE NOTICE 'JB01_PROOF ok: rec_my_application_context() present, authenticated only';
END $$;
