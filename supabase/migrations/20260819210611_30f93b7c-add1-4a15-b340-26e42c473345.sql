-- #47 — One durable content library across assessments and training.
--
-- ── WHAT THIS CLOSES ────────────────────────────────────────────────────
--
-- 1. THE LIBRARY IS HALF THE PRODUCT. scp_employer_library returns rows from
--    scp_assessment_versions only. Six real Security Guard training modules and
--    the programme that contains them exist, are governed, are mapped to
--    behaviours -- and are invisible to every employer, because nothing reads
--    the programme side of the same content spine.
--
-- 2. FIXTURE NAMES ARE THE CUSTOMER-FACING PRODUCT. The two most prominent
--    library entries are literally called "TESTFIXTUR — leveranskedja" and
--    "TESTFIXTUR — övningsläge". The internal identity is worth keeping; the
--    label is not something to show an employer.
--
-- 3. TWO STATUS VOCABULARIES, NO SHARED PRESENTATION. Assessment versions use
--    (draft, in_review, approved, published, retired). Programme and module
--    versions use (draft, expert_review, legal_review, cognitive_review,
--    published, suspended, retired). Both are correct for their own governance
--    and NEITHER is changed here. The library normalises them at read time into
--    the five states the product actually presents.
--
-- 4. RECOMMENDATIONS POINT AT UNASSIGNABLE CONTENT.
--    scp_development_recommendations joins scp_module_versions with no filter on
--    content_status or retired_at, so it will happily recommend a draft or
--    retired module. Harmless while nothing consumes it; actively misleading the
--    moment a recommendation grows an Assign button.
--
-- ── WHY NORMALISE IN THE READ MODEL, NOT IN STORAGE ─────────────────────
--
-- Collapsing the two vocabularies into one stored enum would mean rewriting two
-- CHECK constraints and every row under them, and would destroy real
-- information: `legal_review` and `cognitive_review` are different review gates
-- with different owners, and an assessment's `approved` is not a programme's
-- `published`. Storage keeps the precision; presentation gets the five states.
--
-- ── ADDITIVE-ONLY ───────────────────────────────────────────────────────
--
-- Four nullable presentation columns, two new read functions, one existing read
-- function replaced via CREATE OR REPLACE, and an UPDATE that sets clean labels
-- on the two rows whose names are test scaffolding. No table, constraint, policy
-- or governed content row is dropped or rewritten. No status value changes.
--
-- Dependencies, verified present: scp_assessment_versions/_definitions/_families,
-- scp_programs, scp_program_versions, scp_modules, scp_module_versions,
-- scp_module_behaviour_map, scp_behaviour_competency_map, scp_competency_versions,
-- scp_forms, scp_form_items, scp_item_versions, scp_review_requirements,
-- scp_professions, scp_roles, scp_role_versions, scp_grant_permits_assignment,
-- employer_memberships, scp_fixture_access, and owner_employer_id from
-- 20260825090000.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A presentation label that is not the internal identity
--
-- Nullable on purpose. NULL means "the governed name is already the right
-- label", which is true for all real content. It is an override for scaffolding,
-- not a second naming system, and nothing may write it for published customer
-- content.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_assessment_definitions
  ADD COLUMN IF NOT EXISTS display_name_sv text NULL,
  ADD COLUMN IF NOT EXISTS display_name_en text NULL;

ALTER TABLE public.scp_programs
  ADD COLUMN IF NOT EXISTS display_name_sv text NULL,
  ADD COLUMN IF NOT EXISTS display_name_en text NULL;

COMMENT ON COLUMN public.scp_assessment_definitions.display_name_sv IS
  'Optional clean customer-facing label. NULL = use the governed name_sv. Exists '
  'so internal test scaffolding can keep its honest internal identity while the '
  'library shows an employer something meaningful.';

UPDATE public.scp_assessment_definitions
   SET display_name_sv = 'Internt testmaterial — leveranskedja',
       display_name_en = 'Internal test material — delivery chain'
 WHERE slug = 'fixture-delivery-e2e' AND display_name_sv IS NULL;

UPDATE public.scp_assessment_definitions
   SET display_name_sv = 'Internt testmaterial — övningsläge',
       display_name_en = 'Internal test material — practice mode'
 WHERE slug = 'fixture-learning-e2e' AND display_name_sv IS NULL;

UPDATE public.scp_programs
   SET display_name_sv = 'Internt testmaterial — utvecklingsspår',
       display_name_en = 'Internal test material — development track'
 WHERE slug = 'fixture-learning-programme' AND display_name_sv IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The five presentation states, derived not stored
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_lifecycle_state(
  _content_status text,
  _retired_at timestamptz,
  _is_test_fixture boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    -- Retirement outranks everything: history stays valid, nothing new attaches.
    WHEN _retired_at IS NOT NULL OR _content_status = 'retired' THEN 'retired'
    -- Scaffolding is scaffolding whatever its content_status says. This is what
    -- keeps a `published` fixture out of the customer-facing sections.
    WHEN coalesce(_is_test_fixture, false)                       THEN 'internal_testing'
    WHEN _content_status IN ('in_review','expert_review',
                             'legal_review','cognitive_review')  THEN 'under_review'
    WHEN _content_status = 'published'                           THEN 'published'
    WHEN _content_status = 'suspended'                           THEN 'under_review'
    ELSE 'draft'
  END;
$function$;

COMMENT ON FUNCTION public.scp_lifecycle_state(text, timestamptz, boolean) IS
  'Normalises the two governed content_status vocabularies into the five states '
  'the product presents: draft, internal_testing, under_review, published, '
  'retired. Presentation only -- it never decides assignability, which remains '
  'scp_grant_permits_assignment''s job alone.';

REVOKE ALL ON FUNCTION public.scp_lifecycle_state(text, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_lifecycle_state(text, timestamptz, boolean) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The unified library
--
-- One row per library item, whether it is an assessment or a training
-- programme. `library_kind` discriminates; everything else is the same shape so
-- the client renders one list with filters rather than two products.
--
-- Assignability is NOT re-decided here. Assessments ask
-- scp_grant_permits_assignment, exactly as the previous library did and exactly
-- as the assign path does. Training reports assignable = false with an explicit
-- reason, because the training assignment carrier does not exist yet: claiming
-- otherwise would put a button in front of an employer that cannot work.
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
  -- The route's employerId is a claim. This is where it becomes a fact.
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
    'assessment'::text,
    av.id,
    d.id,
    d.slug,
    coalesce(d.display_name_sv, d.name_sv),
    coalesce(d.display_name_en, d.name_en),
    pv.purpose_sv,
    pv.purpose_en,
    public.scp_lifecycle_state(av.content_status, av.retired_at, d.is_test_fixture),
    av.content_status,
    av.validation_status,
    av.version_number,
    d.is_test_fixture,
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
    prof.name_sv,
    prof.name_en,
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
    av.published_at,
    av.updated_at
  FROM public.scp_assessment_versions av
  JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
  JOIN public.scp_assessment_families fam ON fam.id = d.family_id
  LEFT JOIN public.scp_program_versions pv ON pv.id = av.program_version_id
  LEFT JOIN public.scp_professions prof ON prof.id = d.profession_id
  WHERE fam.product_type = 'development_programme'
    AND (NOT d.is_test_fixture OR _may_see_fixtures)
    -- Tenancy: global content, or content this employer owns. Mirrors the RLS
    -- predicate, restated because a SECURITY DEFINER function bypasses RLS.
    AND (d.owner_employer_id IS NULL OR d.owner_employer_id = _employer_id);

  -- ── Training and development programmes ───────────────────────────────
  RETURN QUERY
  SELECT
    'training'::text,
    pv.id,
    p.id,
    p.slug,
    coalesce(p.display_name_sv, pv.name_sv),
    coalesce(p.display_name_en, pv.name_en),
    pv.purpose_sv,
    pv.purpose_en,
    public.scp_lifecycle_state(pv.content_status, pv.retired_at, fx.is_fixture),
    pv.content_status,
    pv.validation_status,
    pv.version_number,
    fx.is_fixture,
    p.owner_employer_id,
    CASE WHEN p.owner_employer_id IS NULL THEN 'cqrityjob' ELSE 'employer' END,
    false,
    'training_delivery_pending'::text,
    NULL::public.scp_governance_mode,
    0,
    coalesce((SELECT count(*)::int FROM public.scp_module_versions mv
               WHERE mv.program_version_id = pv.id), 0),
    (SELECT sum(mv.estimated_minutes)::int FROM public.scp_module_versions mv
      WHERE mv.program_version_id = pv.id),
    (SELECT sum(mv.estimated_minutes)::int FROM public.scp_module_versions mv
      WHERE mv.program_version_id = pv.id),
    -- Module content is authored as sv/en column pairs, so a programme is
    -- bilingual by construction rather than by declaration.
    ARRAY['sv-SE','en-GB']::text[],
    false,
    role_v.name_sv,
    role_v.name_en,
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
    pv.published_at,
    pv.updated_at
  FROM public.scp_program_versions pv
  JOIN public.scp_programs p ON p.id = pv.program_id
  LEFT JOIN public.scp_role_versions role_v ON role_v.role_id = p.role_id
  -- A programme is scaffolding when every assessment definition built on it is.
  CROSS JOIN LATERAL (
    SELECT coalesce(bool_and(d2.is_test_fixture), false) AS is_fixture
      FROM public.scp_assessment_versions av2
      JOIN public.scp_assessment_definitions d2 ON d2.id = av2.definition_id
     WHERE av2.program_version_id = pv.id
  ) fx
  WHERE (p.owner_employer_id IS NULL OR p.owner_employer_id = _employer_id)
    AND (NOT fx.is_fixture OR _may_see_fixtures);
END;
$function$;

COMMENT ON FUNCTION public.scp_employer_content_library(uuid) IS
  'The durable Assessment & Training Library for one organisation. One row per '
  'library item across both product types, discriminated by library_kind. '
  'Assignability for assessments is delegated to scp_grant_permits_assignment '
  'so the library can never advertise something the assign path would refuse; '
  'training reports assignable = false with an explicit reason until the '
  'training assignment carrier exists. Tenancy is enforced in the WHERE clause '
  'because SECURITY DEFINER bypasses RLS.';

REVOKE ALL     ON FUNCTION public.scp_employer_content_library(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_content_library(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Development recommendations stop pointing at unassignable content
--
-- Three added predicates. The recommendation logic, the maturity window and the
-- graph traversal are untouched.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_development_recommendations(_subject_id uuid)
RETURNS TABLE (
  module_version_id uuid,
  module_name_sv text,
  module_name_en text,
  summary_sv text,
  summary_en text,
  estimated_minutes integer,
  addresses_competency_sv text,
  addresses_competency_en text,
  maturity_level text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM public.scp_subject_identities si
         WHERE si.subject_id = _subject_id AND si.user_id = auth.uid())
     AND NOT EXISTS (
        SELECT 1 FROM public.scp_attempts a
          JOIN public.employer_memberships m
            ON m.employer_id = a.issuer_organization_id
           AND m.user_id = auth.uid() AND m.status = 'active'
         WHERE a.subject_id = _subject_id AND a.released_at IS NOT NULL)
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT ON (mv.id)
    mv.id, mv.name_sv, mv.name_en, mv.summary_sv, mv.summary_en,
    mv.estimated_minutes, cv.name_sv, cv.name_en,
    public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
  FROM public.scp_competency_evidence e
  JOIN public.scp_behaviour_versions bv ON bv.id = e.behaviour_version_id
  JOIN public.scp_behaviour_competency_map bcm ON bcm.behaviour_version_id = bv.id
  JOIN public.scp_competency_versions cv ON cv.id = bcm.competency_version_id
  JOIN public.scp_module_behaviour_map mbm ON mbm.behaviour_version_id = bv.id
  JOIN public.scp_module_versions mv ON mv.id = mbm.module_version_id
  JOIN public.scp_modules m ON m.id = mv.module_id
  WHERE e.subject_id = _subject_id
    AND e.superseded_by IS NULL
    -- #47: recommend only content that could actually be delivered. A draft or
    -- retired module is not a development option, it is an authoring artefact.
    AND mv.content_status = 'published'
    AND mv.retired_at IS NULL
    -- And never recommend another employer's private content.
    AND m.owner_employer_id IS NULL
    AND public.scp_compute_maturity(_subject_id, cv.id, 'v1', now())
        IN ('no_evidence','limited_evidence','developing_evidence')
  ORDER BY mv.id, mv.display_order;
END; $function$;

COMMENT ON FUNCTION public.scp_development_recommendations(uuid) IS
  'Published, non-retired, globally-owned modules addressing behaviours behind a '
  'competency whose evidence is not yet settled. A development ACTIVITY '
  'suggestion, never a claim that completing it verifies competence: training '
  'completion is excluded from maturity by counts_toward_maturity.';

REVOKE ALL     ON FUNCTION public.scp_development_recommendations(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_development_recommendations(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _n int; _def text;
BEGIN
  -- 5a. Lifecycle normalisation covers every stored status in both vocabularies.
  IF public.scp_lifecycle_state('draft', NULL, false) <> 'draft'
     OR public.scp_lifecycle_state('published', NULL, false) <> 'published'
     OR public.scp_lifecycle_state('published', NULL, true) <> 'internal_testing'
     OR public.scp_lifecycle_state('in_review', NULL, false) <> 'under_review'
     OR public.scp_lifecycle_state('legal_review', NULL, false) <> 'under_review'
     OR public.scp_lifecycle_state('cognitive_review', NULL, false) <> 'under_review'
     OR public.scp_lifecycle_state('expert_review', NULL, false) <> 'under_review'
     OR public.scp_lifecycle_state('published', now(), false) <> 'retired'
     OR public.scp_lifecycle_state('retired', NULL, false) <> 'retired'
  THEN
    RAISE EXCEPTION 'SCP_LIFECYCLE_MAPPING: scp_lifecycle_state does not cover the governed vocabularies';
  END IF;

  -- 5b. No stored content_status falls through to an unintended state.
  SELECT count(*) INTO _n FROM (
    SELECT DISTINCT content_status FROM public.scp_assessment_versions
    UNION SELECT DISTINCT content_status FROM public.scp_program_versions
    UNION SELECT DISTINCT content_status FROM public.scp_module_versions
  ) s WHERE public.scp_lifecycle_state(s.content_status, NULL, false) NOT IN
      ('draft','internal_testing','under_review','published','retired');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_LIFECYCLE_UNMAPPED: % stored status value(s) normalise to nothing', _n;
  END IF;

  -- 5c. The library still delegates assignability rather than deciding it.
  _def := pg_get_functiondef('public.scp_employer_content_library(uuid)'::regprocedure);
  IF _def NOT LIKE '%scp_grant_permits_assignment%' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_GOVERNANCE: the library decides assignability on its own';
  END IF;
  IF _def NOT LIKE '%employer_memberships%' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_UNVERIFIED_CLAIM: the library does not verify membership';
  END IF;
  IF _def NOT LIKE '%owner_employer_id%' THEN
    RAISE EXCEPTION 'SCP_LIBRARY_NO_TENANCY: the library does not filter by ownership';
  END IF;

  -- 5d. Recommendations are filtered.
  _def := pg_get_functiondef('public.scp_development_recommendations(uuid)'::regprocedure);
  IF _def NOT LIKE '%content_status = ''published''%' OR _def NOT LIKE '%retired_at IS NULL%' THEN
    RAISE EXCEPTION 'SCP_RECOMMENDATION_UNFILTERED: draft or retired modules can still be recommended';
  END IF;

  -- 5e. The fixtures now carry customer-safe labels.
  SELECT count(*) INTO _n FROM public.scp_assessment_definitions
   WHERE is_test_fixture AND display_name_sv IS NULL;
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_FIXTURE_LABEL_MISSING: % test fixture(s) would still show a raw internal name', _n;
  END IF;
END $$;