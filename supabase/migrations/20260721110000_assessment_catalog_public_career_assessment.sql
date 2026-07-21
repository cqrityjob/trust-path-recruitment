-- Assessment Catalog: register the Public Career Assessment definition.
--
-- This is an additive-only registration into the pre-existing assessments /
-- assessment_versions catalog (no schema change, no RLS change -- existing
-- own-row / is_platform_admin() policies already cover any new assessment_id
-- automatically). Nothing about the 'career-guidance' definition or its
-- historical assessment_runs / assessment_run_reports rows is touched here.
--
-- Public Career Assessment v1.0 assembles 8 Universal Core + 8 Profile
-- questions (student_or_new / security_professional / career_changer) from
-- the shared Question Library / Competency Library at runtime -- see
-- docs/job-intelligence/public-career-assessment-v1-spec.md and
-- docs/architecture/assessment-catalog.md.

INSERT INTO public.assessments (id, name_sv, name_en, kind)
VALUES (
  'public-career-assessment',
  'Publikt karriärtest',
  'Public Career Assessment',
  'career_guidance'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, published_at, notes)
VALUES (
  'public-career-assessment',
  '2026-pca-v1.0',
  'v1',
  now(),
  'Public Career Assessment v1.0 -- 8 Universal Core + 8 Profile questions, assembled per Current Situation (student_or_new / security_professional / career_changer) from the shared Question Library / Competency Library. See docs/job-intelligence/public-career-assessment-v1-spec.md.'
)
ON CONFLICT (assessment_id, model_version, disclaimer_version) DO NOTHING;
