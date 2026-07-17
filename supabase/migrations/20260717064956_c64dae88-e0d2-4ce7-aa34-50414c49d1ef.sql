
-- ============================================================
-- Sprint 09C Phase A — Career Intelligence Graph foundation
-- Additive only. Sprint 08 / 09B tables untouched.
-- ============================================================

-- Enums ------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.cig_content_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cig_quality_level AS ENUM ('A','B','C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cig_link_status AS ENUM ('healthy','redirected','failed','needs_check');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cig_source_type AS ENUM ('official','primary','secondary','community','internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cig_alias_kind AS ENUM ('alias','specialisation','seniority','context','destination');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cig_relationship_criticality AS ENUM ('mandatory','preferred','informative');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: common trigger already exists as public.set_updated_at()

-- ============================================================
-- Entity tables
-- ============================================================

-- Profession families
CREATE TABLE IF NOT EXISTS public.cig_profession_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  last_verified timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Professions
CREATE TABLE IF NOT EXISTS public.cig_professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  canonical_key text NOT NULL UNIQUE,
  primary_family_id uuid REFERENCES public.cig_profession_families(id) ON DELETE SET NULL,
  quality_level public.cig_quality_level NOT NULL DEFAULT 'C',
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  is_regulated boolean NOT NULL DEFAULT false,
  country text,
  jurisdiction text,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  summary_sv text,
  summary_en text,
  overview_sv text,
  overview_en text,
  disclaimer_sv text,
  disclaimer_en text,
  graph_version text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  last_verified timestamptz,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cig_professions_family_idx ON public.cig_professions(primary_family_id);
CREATE INDEX IF NOT EXISTS cig_professions_status_idx ON public.cig_professions(content_status);
CREATE INDEX IF NOT EXISTS cig_professions_quality_idx ON public.cig_professions(quality_level);

-- Aliases
CREATE TABLE IF NOT EXISTS public.cig_profession_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  alias_sv text,
  alias_en text,
  alias_kind public.cig_alias_kind NOT NULL DEFAULT 'alias',
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cig_aliases_profession_idx ON public.cig_profession_aliases(profession_id);

-- Specialisations
CREATE TABLE IF NOT EXISTS public.cig_profession_specialisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, slug)
);

-- Sectors
CREATE TABLE IF NOT EXISTS public.cig_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Employer types
CREATE TABLE IF NOT EXISTS public.cig_employer_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Work environments
CREATE TABLE IF NOT EXISTS public.cig_work_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Competencies
CREATE TABLE IF NOT EXISTS public.cig_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Skills
CREATE TABLE IF NOT EXISTS public.cig_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  esco_uri text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Knowledge areas
CREATE TABLE IF NOT EXISTS public.cig_knowledge_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Work preferences
CREATE TABLE IF NOT EXISTS public.cig_work_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Assessment dimensions (registry mirroring the existing 16-Q engine dimensions)
CREATE TABLE IF NOT EXISTS public.cig_assessment_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Formal requirements
CREATE TABLE IF NOT EXISTS public.cig_formal_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  country text,
  jurisdiction text,
  authority_sv text,
  authority_en text,
  legal_basis text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Education pathways
CREATE TABLE IF NOT EXISTS public.cig_education_pathways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  typical_duration_months integer,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Certifications
CREATE TABLE IF NOT EXISTS public.cig_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  issuer_sv text,
  issuer_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Experience types
CREATE TABLE IF NOT EXISTS public.cig_experience_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Assessment signals (guidance-only signals surfaced by the existing engine)
CREATE TABLE IF NOT EXISTS public.cig_assessment_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_sv text NOT NULL,
  title_en text NOT NULL,
  description_sv text,
  description_en text,
  dimension_id uuid REFERENCES public.cig_assessment_dimensions(id) ON DELETE SET NULL,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Source references
CREATE TABLE IF NOT EXISTS public.cig_source_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_key text NOT NULL UNIQUE,
  organisation text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  jurisdiction text,
  language text,
  source_type public.cig_source_type NOT NULL DEFAULT 'secondary',
  accessed_at timestamptz,
  last_checked_at timestamptz,
  link_status public.cig_link_status NOT NULL DEFAULT 'needs_check',
  replacement_source_id uuid REFERENCES public.cig_source_references(id) ON DELETE SET NULL,
  notes text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Career transitions (canonical from → to)
CREATE TABLE IF NOT EXISTS public.cig_career_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  to_profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  transition_kind text NOT NULL DEFAULT 'lateral',
  rationale_sv text,
  rationale_en text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_profession_id, to_profession_id, transition_kind)
);
CREATE INDEX IF NOT EXISTS cig_transitions_from_idx ON public.cig_career_transitions(from_profession_id);
CREATE INDEX IF NOT EXISTS cig_transitions_to_idx ON public.cig_career_transitions(to_profession_id);

-- ============================================================
-- Relationship tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cig_profession_family_rel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.cig_profession_families(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, family_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_sector_rel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL REFERENCES public.cig_sectors(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, sector_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_employer_type_rel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  employer_type_id uuid NOT NULL REFERENCES public.cig_employer_types(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, employer_type_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_work_environment_rel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  work_environment_id uuid NOT NULL REFERENCES public.cig_work_environments(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, work_environment_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_competency_req (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.cig_competencies(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  criticality public.cig_relationship_criticality NOT NULL DEFAULT 'informative',
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, competency_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_skill_req (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.cig_skills(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  criticality public.cig_relationship_criticality NOT NULL DEFAULT 'informative',
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_knowledge_req (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  knowledge_area_id uuid NOT NULL REFERENCES public.cig_knowledge_areas(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  criticality public.cig_relationship_criticality NOT NULL DEFAULT 'informative',
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, knowledge_area_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_work_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  work_preference_id uuid NOT NULL REFERENCES public.cig_work_preferences(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, work_preference_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_assessment_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES public.cig_assessment_signals(id) ON DELETE CASCADE,
  signal_polarity smallint NOT NULL DEFAULT 1,
  signal_weight numeric NOT NULL DEFAULT 1.0,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, signal_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_formal_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  formal_requirement_id uuid NOT NULL REFERENCES public.cig_formal_requirements(id) ON DELETE CASCADE,
  criticality public.cig_relationship_criticality NOT NULL DEFAULT 'mandatory',
  legal_blocker boolean NOT NULL DEFAULT true,
  country text,
  jurisdiction text,
  source_id uuid REFERENCES public.cig_source_references(id) ON DELETE SET NULL,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, formal_requirement_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_education_pathways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  education_pathway_id uuid NOT NULL REFERENCES public.cig_education_pathways(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, education_pathway_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_certification_rel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  certification_id uuid NOT NULL REFERENCES public.cig_certifications(id) ON DELETE CASCADE,
  criticality public.cig_relationship_criticality NOT NULL DEFAULT 'informative',
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, certification_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_experience_req (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  experience_type_id uuid NOT NULL REFERENCES public.cig_experience_types(id) ON DELETE CASCADE,
  importance smallint NOT NULL DEFAULT 1,
  criticality public.cig_relationship_criticality NOT NULL DEFAULT 'informative',
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, experience_type_id)
);

CREATE TABLE IF NOT EXISTS public.cig_profession_source_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES public.cig_professions(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.cig_source_references(id) ON DELETE CASCADE,
  purpose text,
  content_status public.cig_content_status NOT NULL DEFAULT 'draft',
  graph_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profession_id, source_id, purpose)
);

-- ============================================================
-- GRANTs — catalogue is publicly readable when published
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'cig_profession_families','cig_professions','cig_profession_aliases',
      'cig_profession_specialisations','cig_sectors','cig_employer_types',
      'cig_work_environments','cig_competencies','cig_skills','cig_knowledge_areas',
      'cig_work_preferences','cig_assessment_dimensions','cig_formal_requirements',
      'cig_education_pathways','cig_certifications','cig_experience_types',
      'cig_assessment_signals','cig_source_references','cig_career_transitions',
      'cig_profession_family_rel','cig_profession_sector_rel',
      'cig_profession_employer_type_rel','cig_profession_work_environment_rel',
      'cig_profession_competency_req','cig_profession_skill_req',
      'cig_profession_knowledge_req','cig_profession_work_preferences',
      'cig_profession_assessment_signals','cig_profession_formal_requirements',
      'cig_profession_education_pathways','cig_profession_certification_rel',
      'cig_profession_experience_req','cig_profession_source_references'
    ])
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS "cig read published" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "cig read published" ON public.%I FOR SELECT TO anon, authenticated USING (content_status = ''published'');',
      t);
  END LOOP;
END $$;

-- ============================================================
-- updated_at triggers
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'cig_profession_families','cig_professions','cig_profession_aliases',
      'cig_profession_specialisations','cig_sectors','cig_employer_types',
      'cig_work_environments','cig_competencies','cig_skills','cig_knowledge_areas',
      'cig_work_preferences','cig_assessment_dimensions','cig_formal_requirements',
      'cig_education_pathways','cig_certifications','cig_experience_types',
      'cig_assessment_signals','cig_source_references','cig_career_transitions',
      'cig_profession_family_rel','cig_profession_sector_rel',
      'cig_profession_employer_type_rel','cig_profession_work_environment_rel',
      'cig_profession_competency_req','cig_profession_skill_req',
      'cig_profession_knowledge_req','cig_profession_work_preferences',
      'cig_profession_assessment_signals','cig_profession_formal_requirements',
      'cig_profession_education_pathways','cig_profession_certification_rel',
      'cig_profession_experience_req','cig_profession_source_references'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t);
  END LOOP;
END $$;
