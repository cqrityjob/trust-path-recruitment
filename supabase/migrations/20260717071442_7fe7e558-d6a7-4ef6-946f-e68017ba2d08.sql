-- Sprint 09C Phase A hardening: self-loop guard, dimension category, ESCO/SSYK, ISO-3166 country checks

ALTER TABLE public.cig_career_transitions
  ADD CONSTRAINT cig_transitions_no_self_loop
  CHECK (from_profession_id <> to_profession_id);

ALTER TABLE public.cig_assessment_dimensions
  ADD COLUMN category text;

ALTER TABLE public.cig_professions
  ADD COLUMN esco_uri text,
  ADD COLUMN ssyk_code text;
CREATE INDEX IF NOT EXISTS cig_professions_ssyk_idx ON public.cig_professions(ssyk_code);

ALTER TABLE public.cig_professions
  ADD CONSTRAINT cig_professions_country_iso
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

ALTER TABLE public.cig_formal_requirements
  ADD CONSTRAINT cig_fr_country_iso
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

ALTER TABLE public.cig_profession_formal_requirements
  ADD CONSTRAINT cig_pfr_country_iso
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
