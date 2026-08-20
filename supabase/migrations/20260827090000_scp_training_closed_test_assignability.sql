-- #50 — Real development content becomes testable without being published.
--
-- ── THE PROBLEM ─────────────────────────────────────────────────────────
--
-- Assessments already have a way to be run before they are validated. A
-- closed-test grant (scp_test_grants, purpose 'closed_test') lets one named
-- organisation run draft/design content as an explicitly unvalidated pilot, and
-- scp_grant_permits_assignment returns 'closed_test' so every downstream
-- surface can say so.
--
-- Training had no such path. #47 made training assignability
--
--     content_status = 'published' AND retired_at IS NULL AND has modules
--
-- which is right for a live product and wrong for a pilot: the real Security
-- Guard development programme is draft/design, pending expert validation, and
-- therefore could not be run at all — not even by the organisation running the
-- closed test. That left an employer looking at real content they could see and
-- could not use, with no mechanism short of publishing it.
--
-- Publishing it would be the wrong fix. Published means validated, and this
-- content is not. The governance model already has the right answer for
-- "unvalidated but runnable under a named grant"; training simply was not
-- wired into it.
--
-- ── THE SHAPE OF THE FIX ────────────────────────────────────────────────
--
-- scp_training_permits_assignment mirrors scp_grant_permits_assignment for the
-- programme side, and returns the same scp_governance_mode vocabulary so the
-- library, the assign guard and the UI keep speaking one language:
--
--   published + operational validation   -> 'recruitment'   (a live product)
--   draft/approved/published + design or
--     pilot + closed-test grant          -> 'closed_test'   (a named pilot)
--   test fixture + fixture access or a
--     development grant                  -> 'development'   (scaffolding)
--   otherwise                            -> NULL            (not assignable)
--
-- The important property is the one it does NOT have: there is no path from
-- "draft" to assignable without an explicit, revocable, attributable grant row
-- naming the organisation and the reason. Nothing here weakens a gate; it
-- routes real content through the gate that already exists.
--
-- A closed-test assignment stays visibly unvalidated everywhere downstream,
-- because governance_mode travels with it — the same way an assessment pilot
-- already does.
--
-- ── ADDITIVE-ONLY ───────────────────────────────────────────────────────
--
-- One new function; two existing bodies replaced via CREATE OR REPLACE. No
-- table, column, constraint, policy or row is dropped, and no content status or
-- validation status is changed anywhere. Nothing is published by this
-- migration.
--
-- Dependencies, verified present: scp_test_grants, scp_has_test_grant,
-- scp_fixture_access, scp_governance_mode, scp_program_versions, scp_programs,
-- scp_module_versions, scp_employer_content_library,
-- scp_guard_training_target_assignable.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. On what basis may this organisation run this programme?
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_training_permits_assignment(
  _employer_id       uuid,
  _content_status    text,
  _validation_status text,
  _is_test_fixture   boolean
)
RETURNS public.scp_governance_mode
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A live, validated product.
  IF _content_status = 'published'
     AND NOT coalesce(_is_test_fixture, false)
     AND _validation_status IN ('operational-development', 'operational-selection') THEN
    RETURN 'recruitment';
  END IF;

  -- Internal scaffolding: runnable only where fixtures are deliberately visible.
  IF coalesce(_is_test_fixture, false) THEN
    IF public.scp_has_test_grant(_employer_id, 'development', NULL)
       OR EXISTS (SELECT 1 FROM public.scp_fixture_access fa
                   WHERE fa.employer_id = _employer_id) THEN
      RETURN 'development';
    END IF;
    RETURN NULL;
  END IF;

  -- Real content, not yet validated, run as a named closed test. The grant is
  -- the authorisation: without a row naming this organisation, this returns
  -- NULL and the content stays unassignable.
  IF _content_status IN ('draft', 'approved', 'published')
     AND _validation_status IN ('design', 'pilot')
     AND public.scp_has_test_grant(_employer_id, 'closed_test', NULL) THEN
    RETURN 'closed_test';
  END IF;

  RETURN NULL;
END; $function$;

COMMENT ON FUNCTION public.scp_training_permits_assignment(uuid, text, text, boolean) IS
  'The programme-side twin of scp_grant_permits_assignment. Returns the basis on '
  'which one organisation may run one development programme version, or NULL. '
  'Draft content is never assignable without an explicit, revocable closed-test '
  'grant naming the organisation, so this routes real unvalidated content '
  'through the existing gate rather than around it.';

REVOKE ALL     ON FUNCTION public.scp_training_permits_assignment(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_training_permits_assignment(uuid, text, text, boolean) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The assign guard asks it
--
-- The guard is the wall, the RPC is the door. Both must agree, and the guard is
-- what makes a crafted request fail even if a surface is wrong.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_guard_training_target_assignable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _status text; _validation text; _retired timestamptz;
        _owner uuid; _fixture boolean; _mode public.scp_governance_mode;
BEGIN
  SELECT pv.content_status, pv.validation_status, pv.retired_at,
         p.owner_employer_id, coalesce(p.is_test_fixture, false)
    INTO _status, _validation, _retired, _owner, _fixture
    FROM public.scp_program_versions pv
    JOIN public.scp_programs p ON p.id = pv.program_id
   WHERE pv.id = NEW.program_version_id;

  IF _status IS NULL THEN
    RAISE EXCEPTION 'SCP_TRAINING_NOT_ASSIGNABLE: that programme version does not exist.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Retirement is absolute: history stays valid, nothing new attaches.
  IF _retired IS NOT NULL THEN
    RAISE EXCEPTION
      'SCP_TRAINING_RETIRED: that programme version is retired and cannot '
      'receive new assignments.' USING ERRCODE = 'check_violation';
  END IF;

  IF _owner IS NOT NULL AND _owner <> NEW.employer_id THEN
    RAISE EXCEPTION
      'SCP_TRAINING_CROSS_TENANT: that programme belongs to another '
      'organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  _mode := public.scp_training_permits_assignment(
             NEW.employer_id, _status, _validation, _fixture);

  IF _mode IS NULL THEN
    RAISE EXCEPTION
      'SCP_TRAINING_NOT_ASSIGNABLE: programme version is "%" / "%" and this '
      'organisation holds no grant permitting it.', _status, _validation
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The library reports the same answer, and says on what basis
--
-- Only the training branch changes: it now asks the same function the guard
-- asks, and surfaces governance_mode instead of a hard-coded NULL. The
-- assessment branch is byte-identical to 20260825092000.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_employer_content_library(_employer_id uuid)
RETURNS TABLE(
  library_kind        text,
  item_id             uuid,
  parent_id           uuid,
  slug                text,
  name_sv             text,
  name_en             text,
  summary_sv          text,
  summary_en          text,
  lifecycle_state     text,
  content_status      text,
  validation_status   text,
  version_number      integer,
  is_test_fixture     boolean,
  owner_employer_id   uuid,
  ownership           text,
  assignable          boolean,
  unassignable_reason text,
  governance_mode     public.scp_governance_mode,
  item_count          integer,
  module_count        integer,
  minutes_min         integer,
  minutes_max         integer,
  languages           text[],
  requires_human_review boolean,
  target_role_sv      text,
  target_role_en      text,
  competencies_sv     text[],
  competencies_en     text[],
  does_not_measure_sv text[],
  does_not_measure_en text[],
  published_at        timestamptz,
  updated_at          timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
    av.published_at, av.updated_at
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
    pv.published_at, pv.updated_at
  FROM public.scp_program_versions pv
  JOIN public.scp_programs p ON p.id = pv.program_id
  LEFT JOIN public.scp_role_versions role_v ON role_v.role_id = p.role_id
  WHERE (p.owner_employer_id IS NULL OR p.owner_employer_id = _employer_id)
    AND (NOT coalesce(p.is_test_fixture, false) OR _may_see_fixtures);
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_employer_content_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_content_library(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _def text;
BEGIN
  -- 4a. Draft content is NOT assignable to an organisation with no grant.
  IF public.scp_training_permits_assignment(
       '00000000-0000-0000-0000-000000000000'::uuid, 'draft', 'design', false) IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_TRAINING_OPEN_DOOR: draft content is assignable without a grant';
  END IF;

  -- 4b. Retired-equivalent and unvalidated-published content still needs a grant.
  IF public.scp_training_permits_assignment(
       '00000000-0000-0000-0000-000000000000'::uuid, 'published', 'design', false) IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_TRAINING_OPEN_DOOR: unvalidated published content is assignable without a grant';
  END IF;

  -- 4c. A validated live product needs no grant.
  IF public.scp_training_permits_assignment(
       '00000000-0000-0000-0000-000000000000'::uuid, 'published', 'operational-development', false)
     IS DISTINCT FROM 'recruitment' THEN
    RAISE EXCEPTION 'SCP_TRAINING_VALIDATED_BLOCKED: validated published content is not assignable';
  END IF;

  -- 4d. Fixtures still require fixture access or a development grant.
  IF public.scp_training_permits_assignment(
       '00000000-0000-0000-0000-000000000000'::uuid, 'published', 'design', true) IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_TRAINING_FIXTURE_LEAK: scaffolding is assignable without fixture access';
  END IF;

  -- 4e. The guard and the library ask the SAME question.
  IF pg_get_functiondef('public.scp_guard_training_target_assignable()'::regprocedure)
       NOT LIKE '%scp_training_permits_assignment%' THEN
    RAISE EXCEPTION 'SCP_TRAINING_GUARD_DRIFT: the assign guard does not consult the grant function';
  END IF;
  _def := pg_get_functiondef('public.scp_employer_content_library(uuid)'::regprocedure);
  IF _def NOT LIKE '%scp_training_permits_assignment%' THEN
    RAISE EXCEPTION 'SCP_TRAINING_LIBRARY_DRIFT: the library does not consult the grant function';
  END IF;
  IF _def NOT LIKE '%scp_grant_permits_assignment%' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_GOVERNANCE: the assessment side stopped delegating assignability';
  END IF;

  -- 4f. Nothing was published by this migration.
  IF EXISTS (SELECT 1 FROM public.scp_program_versions pv
               JOIN public.scp_programs p ON p.id = pv.program_id
              WHERE p.slug = 'security-guard-operational-development'
                AND pv.content_status <> 'draft') THEN
    RAISE EXCEPTION 'SCP_REAL_CONTENT_PUBLISHED: the Security Guard programme must stay draft';
  END IF;
END $$;
