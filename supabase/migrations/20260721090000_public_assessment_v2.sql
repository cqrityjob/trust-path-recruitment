-- =============================================================================
-- Public Assessment v2.0 -- redesigned 16-question public Security Career
-- Assessment (question content/mappings live in application code:
-- src/lib/assessment-content.ts, src/lib/career-assessment/question-mappings.ts;
-- see docs/job-intelligence/public-assessment-v2-questions.md for the full
-- authoring specification). This migration handles the two things that
-- genuinely need a database change:
--
--   1. A new assessment_versions row for the existing 'career-guidance'
--      assessment, so new completions are attributed to v2.0 while every
--      existing completed run keeps its already-stored, immutable
--      assessment_version_id untouched -- reuses the existing "latest
--      published version" resolution in saveMyCareerReport()
--      (report.functions.ts), no code change needed for this part. Purely
--      additive: one new row, zero existing rows modified.
--
--   2. Admin-read RLS policies on assessment_runs / assessment_run_reports,
--      the genuine schema gap identified during the Phase B review (no read
--      path exists for anyone but the row's own owner). Mirrors the exact
--      is_platform_admin() pattern already used throughout this schema
--      (e.g. requirement_profile_versions, Phase 1) -- additive SELECT-only
--      policies, no existing policy is dropped or narrowed, no write access
--      is granted. This is what the Employer Report MVP preview route
--      (platform-admin-only today, per the Phase E scoping decision) relies
--      on; it is explicitly NOT a general employer-self-service sharing
--      mechanism, which would require new consent-tracking schema and is
--      deliberately deferred.
--
-- Additive only. No existing row, column, or policy is altered or dropped.
-- =============================================================================

-- --- 1. New assessment_versions row for Public Assessment v2.0 ---
INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, published_at, notes)
VALUES (
  'career-guidance',
  '2026.07-v2.0',
  'v2',
  now(),
  'Public Assessment v2.0 -- redesigned 16 questions per the approved Assessment DNA and Question Library frameworks. See docs/job-intelligence/public-assessment-v2-questions.md.'
);

-- --- 2. Admin-read RLS: assessment_runs ---
CREATE POLICY "admin runs select" ON public.assessment_runs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- --- 3. Admin-read RLS: assessment_run_reports ---
CREATE POLICY "admin reports select" ON public.assessment_run_reports
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

COMMENT ON POLICY "admin runs select" ON public.assessment_runs IS
  'Public Assessment v2.0 / Employer Report MVP. Platform-admin-only read
  access across all users'' runs, additive to the existing owner-only
  policy. Powers the admin-only candidate-report preview route
  (/_authenticated/admin/candidate-reports/$runId); not a general
  employer-facing sharing mechanism.';
COMMENT ON POLICY "admin reports select" ON public.assessment_run_reports IS
  'Same rationale as "admin runs select" on assessment_runs.';
