-- An assessment can say what it was DESIGNED for, without that being permission.
--
-- ── THE DISTINCTION THIS MIGRATION EXISTS TO KEEP ───────────────────────
--
-- There are two different questions about a piece of content and the platform
-- currently answers only one of them:
--
--   1. "May this organisation run this, and on what basis?"
--      Answered by scp_grant_permits_assignment -> development | closed_test |
--      recruitment | NULL. This is GOVERNANCE. It is decided by content status,
--      validation status and an explicit, time-bounded grant. Nothing in this
--      migration touches it.
--
--   2. "What kind of assessment is this, as a product?"
--      Unanswered. A recruiter browsing the library cannot tell a competence
--      development programme from an assessment written for a hiring
--      conversation, because both are `development_programme` in the family
--      taxonomy and both read as generic.
--
-- Conflating those two is the failure mode worth naming: a column called
-- "recruitment" that a reader mistakes for permission to select people. So the
-- column is deliberately named for DESIGN INTENT, its values are deliberately
-- not the governance vocabulary, and it is deliberately surfaced beside the
-- governance mode rather than instead of it. An assessment can be designed for
-- recruitment support and still be assignable only as a closed test — that is
-- in fact exactly the state the Security Officer assessment is in, and the
-- library has to be able to show both facts at once without either being read
-- as the other.
--
-- ── WHY NOT A NEW FAMILY ────────────────────────────────────────────────
--
-- scp_assessment_families.product_type carries a guard
-- (scp_guard_family_product_separation) tying it to scp_assessment_definitions
-- .purpose, and scp_employer_content_library filters on it. Adding a
-- 'recruitment' product type would mean a new family, a new purpose value, a
-- widened guard and a widened library query — four changes to load-bearing
-- governance to express one product label. A nullable column with a default
-- expresses it in one.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- Additive. One column with a safe default, one CREATE OR REPLACE of the
-- library read model that appends ONE column to its return type. Every existing
-- definition is 'competence_development', which is what the library implied
-- before. No governance function is read, written or altered.
--
-- Remediation: restore scp_employer_content_library from 20260829093000 and
-- drop the column.

ALTER TABLE public.scp_assessment_definitions
  ADD COLUMN IF NOT EXISTS designed_for text NOT NULL
    DEFAULT 'competence_development'
    CHECK (designed_for IN ('competence_development', 'recruitment_support'));

COMMENT ON COLUMN public.scp_assessment_definitions.designed_for IS
  'PRODUCT DESIGN INTENT, never a governance basis. recruitment_support means '
  'the content was written to inform a hiring conversation -- role-specific '
  'scenarios, an employer brief and an interview guide. It confers NOTHING: '
  'whether an organisation may run the assessment, and under what mode, is '
  'decided solely by scp_grant_permits_assignment, and a recruitment-designed '
  'assessment that is still draft content remains assignable only as a closed '
  'test. Surfaces must show this label BESIDE the governance mode, never '
  'instead of it.';

-- ═══════════════════════════════════════════════════════════════════════════
-- The library carries the label
--
-- Body copied from 20260829093000 with one column appended to the return type
-- and one expression appended to each branch. Training programmes have no
-- design-intent concept, so they report the default -- honestly, rather than
-- being given a recruitment label they never earned.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.scp_employer_content_library(uuid);

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
    0,
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

COMMENT ON FUNCTION public.scp_employer_content_library(uuid) IS
  'The durable content library for one organisation, across assessments and '
  'training. Assignability is decided by asking the same governance function '
  'the assign path asks, so the library can never advertise something the '
  'assign path would refuse. designed_for is a product label and is never part '
  'of that decision.';

REVOKE ALL     ON FUNCTION public.scp_employer_content_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_content_library(uuid) TO authenticated;

-- Design intent is not permission: proven, not asserted in a comment.
DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public.scp_grant_permits_assignment(uuid,uuid,text,text,boolean)'::regprocedure);
  IF _def ILIKE '%designed_for%' THEN
    RAISE EXCEPTION
      'SCP_DESIGN_INTENT_IS_NOT_PERMISSION: the governance function now reads '
      'designed_for. A product label must never influence whether an '
      'organisation may run an assessment.';
  END IF;
  RAISE NOTICE 'design-intent separation proven: the governance function does not read the label';
END $$;
