-- Layer 4 (profession-level Career Intelligence) — small, additive extension
-- of the existing cd_professions schema from
-- 20260730090000_career_discovery_v3_1_schema.sql. That migration already
-- built the hard part: profession_id (SP001..SP037), career_area_id
-- linkage, the ai_researched -> ... -> approved_for_ranking review
-- lifecycle, and the cd_profession_profiles per-CID-dimension band table,
-- all enforced by cd_guard_profession_ranking_approval(). Nothing here
-- touches that design or its trigger.
--
-- What was missing, and what this migration adds:
--   1. A soft link to the Career Intelligence Graph (cig_professions.slug),
--      so profession-level content — formal requirements, education
--      pathways, certifications, work environments, experience
--      requirements, career transitions/pathways, source references — is
--      READ from the existing cig_* tables, never duplicated. Deliberately
--      NOT a hard FK (same pattern as jobs.profession_slug): existence is
--      checked by the authoring script, not enforced by the database,
--      because cd_professions must remain insertable even for a profession
--      CIG has not authored yet (derived_from_area stubs, future waves).
--   2. Explainability text CIG has no field for: why THIS profession is
--      surfaced as a personalised recommendation (not just "it exists"),
--      and an optional limitation/exclusion note.
--   3. next_review_date, completing the review-lifecycle fields the
--      existing review_state column started.
--
-- No new tables. No change to any existing column, constraint, or trigger.

ALTER TABLE public.cd_professions
  ADD COLUMN IF NOT EXISTS cig_profession_slug text,
  ADD COLUMN IF NOT EXISTS inclusion_rationale_sv text,
  ADD COLUMN IF NOT EXISTS inclusion_rationale_en text,
  ADD COLUMN IF NOT EXISTS limitation_note_sv text,
  ADD COLUMN IF NOT EXISTS limitation_note_en text,
  ADD COLUMN IF NOT EXISTS next_review_date date;

COMMENT ON COLUMN public.cd_professions.cig_profession_slug IS
  'Soft link to cig_professions.slug (existence checked by the authoring '
  'script, not FK-enforced -- same pattern as jobs.profession_slug). Bridges '
  'this profession to its CIG-owned formal requirements, education '
  'pathways, certifications, work environments, experience requirements, '
  'career transitions and source references, so none of that content is '
  'ever re-authored here.';

COMMENT ON COLUMN public.cd_professions.inclusion_rationale_sv IS
  'Why this profession is surfaced as a personalised recommendation, in '
  'plain language a candidate reads directly -- not a scoring-weight dump.';

COMMENT ON COLUMN public.cd_professions.limitation_note_sv IS
  'Optional. A caveat worth stating alongside the recommendation (e.g. '
  '"typically requires X first"), distinct from a formal requirement.';

CREATE INDEX IF NOT EXISTS cd_professions_cig_slug_idx
  ON public.cd_professions (cig_profession_slug);
