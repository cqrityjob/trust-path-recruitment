-- Employer Assessment Center foundation: additive catalog metadata only.
--
-- The employer-facing Assessment Center needs two things the catalog
-- (public.assessments) does not yet express: (1) whether a given
-- Assessment Definition is allowed to appear in the employer portal at
-- all, and (2) which of the two employer-facing primary categories
-- (operational / strategic roles) it belongs to. Both are pure additive
-- columns -- nullable/defaulted, no existing row's `kind`, `name_sv`,
-- `name_en` or scoring behaviour changes, no RLS change (the existing
-- `assessments_public_read` / `assessments_admin_write` policies already
-- cover any column on the table).
--
-- employer_visible defaults to false so every existing and future catalog
-- row (including 'public-career-assessment') stays invisible to the
-- employer portal unless explicitly opted in here -- this is what makes
-- "the public career assessment must not automatically be presented as an
-- employer professional assessment" a real data guarantee rather than a
-- hardcoded UI allowlist.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS employer_visible BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS role_category TEXT
    CHECK (role_category IN ('operational', 'strategic'));

COMMENT ON COLUMN public.assessments.employer_visible IS
  'Whether this Assessment Definition may appear in the employer-facing Assessment Center. Default false -- must be explicitly opted in.';
COMMENT ON COLUMN public.assessments.role_category IS
  'Employer Assessment Center primary category: operational (frontline security roles) or strategic (specialist/analytical/management roles). Null for non-employer-facing definitions.';

-- Opt the one existing employer-facing definition in. Byte-for-byte the
-- same row this repo's own docs/architecture/assessment-catalog.md
-- already describes as "registered as the first of what will be many
-- Assessment Catalog definitions for organisations" -- this UPDATE only
-- populates the two brand-new columns above, it does not touch `kind`,
-- `name_sv`, `name_en`, or any assessment_versions row.
UPDATE public.assessments
SET employer_visible = true, role_category = 'operational'
WHERE id = 'security-guard-foundation';
