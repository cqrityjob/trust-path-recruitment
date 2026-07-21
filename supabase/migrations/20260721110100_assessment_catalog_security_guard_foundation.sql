-- Assessment Catalog: register the preserved 16-question content as its own
-- Assessment Definition -- one entry among what will be many (Datacenter
-- Security, SOC Analyst, Security Supervisor, etc. all follow this identical
-- additive pattern), not a numbered "Employer Assessment #1" special case.
--
-- A NEW assessment_id is minted (not a reuse of 'career-guidance') so that id
-- remains the untouched historical record of the original public-facing run.
-- No content, mapping, or scoring change of any kind -- catalog registration
-- only. Question content, dimension mappings and scoring live unchanged in
-- src/lib/assessment-content.ts and src/lib/career-assessment/*, which are
-- frozen per the architecture plan.

INSERT INTO public.assessments (id, name_sv, name_en, kind)
VALUES (
  'security-guard-foundation',
  'Väktare / Ordningsvakt (grundbedömning)',
  'Security Guard / Public Order Guard Foundation Assessment',
  'professional'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, published_at, notes)
VALUES (
  'security-guard-foundation',
  'v1.0',
  'v1',
  now(),
  'Question content, dimension mappings and scoring are the byte-for-byte preserved Public Assessment v2.1 content (originally published under assessment_id=career-guidance, model_version=2026.07-v2.0). No content or scoring change -- catalog registration only. First of N definitions in the Assessment Catalog.'
)
ON CONFLICT (assessment_id, model_version, disclaimer_version) DO NOTHING;
