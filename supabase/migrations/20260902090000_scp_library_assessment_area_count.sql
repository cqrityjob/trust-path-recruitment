-- Five assessment areas, counted instead of reported as zero.
--
-- scp_employer_content_library returns module_count for every library row. The
-- training branch counts scp_module_versions; the assessment branch has always
-- returned a literal 0, because when the read model was written an assessment
-- had no internal structure to count.
--
-- It does now. 20260830091000 introduced scp_form_blocks, and the Vaktare
-- recruitment assessment is built from five of them -- Sakerhetsbedomning,
-- Observation och rapportering, Arbetsbeteende inom sakerhetsarbete,
-- Integritet och tillforlitlighet, Reflektion. An employer deciding whether to
-- run it should be able to see that it covers five areas, in the same line
-- that already tells them how many questions it holds and how long it takes.
--
-- ── WHAT THIS CHANGES ────────────────────────────────────────────────
--
-- One expression: the literal 0 becomes a count of the blocks belonging to
-- this assessment version's forms. Everything else in the function is copied
-- forward verbatim from 20260830092000. No column is added or removed, no
-- filter changes, no governance call changes, and an assessment with no blocks
-- still reports 0 -- so nothing that reads this function has to change.
--
-- Deliberately NOT a governance surface: module_count is descriptive metadata
-- for a catalogue row. It is not consulted by scp_grant_permits_assignment and
-- carries no assignability meaning.

BEGIN;

CREATE OR REPLACE FUNCTION public.scp_employer_content_library(_employer_id uuid)
RETURNS TABLE(
  library_kind text, item_id uuid, parent_id uuid, slug text,
  name_sv text, name_en text, summary_sv text, summary_en text,
  lifecycle_state text, content_status text, validation_status text,
  version_number integer, is_test_fixture boolean, owner_employer_id uuid,
  ownership text, assignable boolean, unassignable_reason text,
  governance_mode public.scp_governance_mode, item_count integer,
  module_count integer, minutes_min integer, minutes_max integer,
  languages text[], requires_human_review boolean,
  target_role_sv text, target_role_en text,
  competencies_sv text[], competencies_en text[],
  does_not_measure_sv text[], does_not_measure_en text[],
  published_at timestamptz, updated_at timestamptz,
  designed_for text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _may_see_fixtures boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.scp_fixture_access fa
                  WHERE fa.employer_id = _employer_id)
    INTO _may_see_fixtures;

  -- ── Competence assessments ────────────────────────────────────────────
  RETURN QUERY
  SELECT
    'assessment'::text, av.id, d.id, d.slug,
    coalesce(d.display_name_sv, d.name_sv),
    coalesce(d.display_name_en, d.name_en),
    pv.purpose_sv, pv.purpose_en,
    public.scp_lifecycle_state(av.content_status, av.retired_at, d.is_test_fixture),
    av.content_status, av.validation_status, av.version_number, d.is_test_fixture,
    d.owner_employer_id,
    CASE WHEN d.owner_employer_id IS NULL THEN 'cqrityjob' ELSE 'employer' END,
    (public.scp_grant_permits_assignment(
       _employer_id, d.id, av.content_status, av.validation_status,
       d.is_test_fixture) IS NOT NULL
     AND av.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)),
    CASE
      WHEN av.retired_at IS NOT NULL THEN 'retired'
      WHEN NOT EXISTS (SELECT 1 FROM public.scp_forms f
                         JOIN public.scp_form_items fi ON fi.form_id = f.id
                        WHERE f.assessment_version_id = av.id) THEN 'no_items'
      WHEN public.scp_grant_permits_assignment(
             _employer_id, d.id, av.content_status, av.validation_status,
             d.is_test_fixture) IS NULL THEN 'not_permitted'
      ELSE NULL
    END,
    public.scp_grant_permits_assignment(
      _employer_id, d.id, av.content_status, av.validation_status, d.is_test_fixture),
    coalesce((SELECT count(*)::int FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
               WHERE f.assessment_version_id = av.id), 0),
    coalesce((SELECT count(*)::int FROM public.scp_forms f
                JOIN public.scp_form_blocks fb ON fb.form_id = f.id
               WHERE f.assessment_version_id = av.id), 0),
    (SELECT min(f.target_minutes_min) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    (SELECT max(f.target_minutes_max) FROM public.scp_forms f WHERE f.assessment_version_id = av.id),
    av.language_scope,
    EXISTS (SELECT 1 FROM public.scp_forms f
              JOIN public.scp_form_items fi ON fi.form_id = f.id
              JOIN public.scp_review_requirements rr ON rr.item_version_id = fi.item_version_id
             WHERE f.assessment_version_id = av.id AND rr.required),
    prof.name_sv, prof.name_en,
    coalesce((SELECT array_agg(DISTINCT cv.name_sv) FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
                JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = iv.primary_behaviour_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE f.assessment_version_id = av.id), ARRAY[]::text[]),
    coalesce((SELECT array_agg(DISTINCT cv.name_en) FROM public.scp_forms f
                JOIN public.scp_form_items fi ON fi.form_id = f.id
                JOIN public.scp_item_versions iv ON iv.id = fi.item_version_id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = iv.primary_behaviour_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE f.assessment_version_id = av.id), ARRAY[]::text[]),
    coalesce(pv.does_not_measure_sv, ARRAY[]::text[]),
    coalesce(pv.does_not_measure_en, ARRAY[]::text[]),
    av.published_at, av.updated_at,
    d.designed_for
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  JOIN public.scp_assessment_families fam ON fam.id = d.family_id
  LEFT JOIN public.scp_program_versions pv ON pv.id = av.program_version_id
  LEFT JOIN public.scp_professions prof ON prof.id = d.profession_id
  WHERE fam.product_type = 'development_programme'
    AND (NOT d.is_test_fixture OR _may_see_fixtures)
    AND (d.owner_employer_id IS NULL OR d.owner_employer_id = _employer_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.scp_forms f
       WHERE f.assessment_version_id = av.id
         AND EXISTS (SELECT 1 FROM public.scp_form_items fi WHERE fi.form_id = f.id)
      HAVING bool_and(
        (SELECT DISTINCT iv2.mode
           FROM public.scp_form_items fi2
           JOIN public.scp_item_versions iv2 ON iv2.id = fi2.item_version_id
          WHERE fi2.form_id = f.id) = 'learning')
    );

  -- ── Training and development programmes ───────────────────────────────
  RETURN QUERY
  SELECT
    'training'::text, pv.id, p.id, p.slug,
    coalesce(p.display_name_sv, pv.name_sv),
    coalesce(p.display_name_en, pv.name_en),
    pv.purpose_sv, pv.purpose_en,
    public.scp_lifecycle_state(pv.content_status, pv.retired_at, p.is_test_fixture),
    pv.content_status, pv.validation_status, pv.version_number, p.is_test_fixture,
    p.owner_employer_id,
    CASE WHEN p.owner_employer_id IS NULL THEN 'cqrityjob' ELSE 'employer' END,
    (public.scp_training_permits_assignment(
       _employer_id, pv.content_status, pv.validation_status,
       coalesce(p.is_test_fixture, false)) IS NOT NULL
     AND pv.retired_at IS NULL
     AND EXISTS (SELECT 1 FROM public.scp_module_versions mv
                  WHERE mv.program_version_id = pv.id)),
    CASE
      WHEN pv.retired_at IS NOT NULL THEN 'retired'
      WHEN NOT EXISTS (SELECT 1 FROM public.scp_module_versions mv
                        WHERE mv.program_version_id = pv.id) THEN 'no_items'
      WHEN public.scp_training_permits_assignment(
             _employer_id, pv.content_status, pv.validation_status,
             coalesce(p.is_test_fixture, false)) IS NULL THEN 'not_permitted'
      ELSE NULL
    END,
    public.scp_training_permits_assignment(
      _employer_id, pv.content_status, pv.validation_status,
      coalesce(p.is_test_fixture, false)),
    0,
    coalesce((SELECT count(*)::int FROM public.scp_module_versions mv
               WHERE mv.program_version_id = pv.id), 0),
    (SELECT sum(mv.estimated_minutes)::int FROM public.scp_module_versions mv
      WHERE mv.program_version_id = pv.id),
    (SELECT sum(mv.estimated_minutes)::int FROM public.scp_module_versions mv
      WHERE mv.program_version_id = pv.id),
    ARRAY['sv-SE','en-GB']::text[],
    false,
    role_v.name_sv, role_v.name_en,
    coalesce((SELECT array_agg(DISTINCT cv.name_sv)
                FROM public.scp_module_versions mv
                JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id = mv.id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = mbm.behaviour_version_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE mv.program_version_id = pv.id), ARRAY[]::text[]),
    coalesce((SELECT array_agg(DISTINCT cv.name_en)
                FROM public.scp_module_versions mv
                JOIN public.scp_module_behaviour_map mbm ON mbm.module_version_id = mv.id
                JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = mbm.behaviour_version_id
                JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
               WHERE mv.program_version_id = pv.id), ARRAY[]::text[]),
    coalesce(pv.does_not_measure_sv, ARRAY[]::text[]),
    coalesce(pv.does_not_measure_en, ARRAY[]::text[]),
    pv.published_at, pv.updated_at,
    'competence_development'::text
  FROM public.scp_program_versions pv
  JOIN public.scp_programs p ON p.id = pv.program_id
  LEFT JOIN public.scp_role_versions role_v ON role_v.role_id = p.role_id
  WHERE (p.owner_employer_id IS NULL OR p.owner_employer_id = _employer_id)
    AND (NOT coalesce(p.is_test_fixture, false) OR _may_see_fixtures)
    AND EXISTS (SELECT 1 FROM public.scp_module_versions mv
                 WHERE mv.program_version_id = pv.id);
END;
$function$;

-- The one behaviour this migration exists for, asserted rather than assumed.
DO $$
DECLARE _blocks integer; _reported integer;
BEGIN
  SELECT count(*)::int INTO _blocks
    FROM public.scp_forms f
    JOIN public.scp_form_blocks fb ON fb.form_id = f.id
    JOIN public.scp_assessment_versions av ON av.id = f.assessment_version_id
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE d.slug = 'security-officer-recruitment';

  IF _blocks = 0 THEN
    RAISE NOTICE 'no form blocks present for the recruitment assessment; area count stays 0';
  ELSIF _blocks <> 5 THEN
    RAISE EXCEPTION 'SCP_UNEXPECTED_BLOCK_COUNT: the recruitment assessment reports % areas, expected 5.', _blocks;
  END IF;

  -- module_count must stay descriptive. If it ever became an input to
  -- assignability, changing how it is counted would change who may run what.
  SELECT count(*)::int INTO _reported
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'scp_grant_permits_assignment'
     AND pg_get_functiondef(p.oid) ILIKE '%module_count%';
  IF _reported > 0 THEN
    RAISE EXCEPTION 'SCP_MODULE_COUNT_IS_GOVERNANCE: scp_grant_permits_assignment reads module_count.';
  END IF;
END $$;

COMMIT;
