-- A definition-level pilot designation must never admit a freshly authored
-- version. New authored snapshots remain blocked until a separately reviewed
-- release migration explicitly clears this flag. Ordinary content authors
-- cannot clear it, including via the direct REST table API.
ALTER TABLE public.scp_assessment_versions
  ADD COLUMN authoring_release_required boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.scp_guard_authoring_release()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.authoring_release_required AND NOT NEW.authoring_release_required
     AND current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION 'SCP_CONTENT_RELEASE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER scp_authoring_release_guard BEFORE UPDATE ON public.scp_assessment_versions
FOR EACH ROW EXECUTE FUNCTION public.scp_guard_authoring_release();
CREATE OR REPLACE FUNCTION public.scp_guard_authored_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_assessment_versions
              WHERE id=NEW.scp_assessment_version_id AND authoring_release_required) THEN
    RAISE EXCEPTION 'SCP_CONTENT_RELEASE_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER scp_authored_assignment_guard BEFORE INSERT ON public.assessment_assignments
FOR EACH ROW EXECUTE FUNCTION public.scp_guard_authored_assignment();
REVOKE ALL ON FUNCTION public.scp_guard_authoring_release() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scp_guard_authored_assignment() FROM PUBLIC, anon, authenticated;

-- Atomic authoring of a NEW draft snapshot. Existing versions, forms, items,
-- assignments, grants and release decisions are never updated here.
-- Generated using `supabase migration new assessment_draft_authoring`, then
-- ordered after the repository's future-dated migrations for monotonic deploys.
CREATE OR REPLACE FUNCTION public.scp_author_assessment_draft(
  _source_version_id uuid, _notes text, _item_version_ids uuid[],
  _new_slug text DEFAULT NULL, _name_sv text DEFAULT NULL, _name_en text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _source public.scp_assessment_versions%ROWTYPE;
  _definition public.scp_assessment_definitions%ROWTYPE;
  _version uuid := gen_random_uuid(); _definition_id uuid;
  _block public.scp_form_blocks%ROWTYPE;
  _form public.scp_forms%ROWTYPE; _new_form uuid; _old_form uuid;
  _number integer; _count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.scp_can_author(auth.uid()) THEN
    RAISE EXCEPTION 'SCP_AUTHOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF length(coalesce(_notes,'')) > 10000 OR cardinality(_item_version_ids) NOT BETWEEN 1 AND 200
     OR _item_version_ids IS NULL THEN
    RAISE EXCEPTION 'SCP_DRAFT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT _source FROM public.scp_assessment_versions WHERE id=_source_version_id;
  SELECT * INTO STRICT _definition FROM public.scp_assessment_definitions WHERE id=_source.definition_id FOR UPDATE;
  -- Only recruitment tests belong in this administration surface. This is
  -- not a shortcut into another product's question bank or governance model.
  IF _definition.designed_for <> 'recruitment_support' THEN
    RAISE EXCEPTION 'SCP_NOT_RECRUITMENT_CONTENT' USING ERRCODE='22023';
  END IF;
  SELECT count(DISTINCT fi.item_version_id) INTO _count FROM public.scp_form_items fi
    JOIN public.scp_forms f ON f.id=fi.form_id
    WHERE f.assessment_version_id=_source.id AND fi.item_version_id=ANY(_item_version_ids);
  IF _count <> cardinality(_item_version_ids) THEN
    RAISE EXCEPTION 'SCP_DRAFT_ITEM_NOT_IN_SOURCE' USING ERRCODE='22023';
  END IF;
  _definition_id := _source.definition_id;
  IF _new_slug IS NOT NULL THEN
    IF _new_slug !~ '^[a-z0-9][a-z0-9-]{2,79}$' OR length(btrim(coalesce(_name_sv,''))) NOT BETWEEN 1 AND 200
       OR length(btrim(coalesce(_name_en,''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'SCP_DRAFT_INVALID_NAME' USING ERRCODE='22023';
    END IF;
    _definition.id := gen_random_uuid(); _definition.slug := _new_slug;
    _definition.standard_for_recruitment := false;
    _definition.display_name_sv := NULL; _definition.display_name_en := NULL;
    _definition.name_sv := btrim(_name_sv); _definition.name_en := btrim(_name_en);
    _definition.created_at := now(); _definition.updated_at := now();
    INSERT INTO public.scp_assessment_definitions SELECT _definition.*;
    _definition_id := _definition.id;
  END IF;
  SELECT coalesce(max(version_number),0)+1 INTO _number FROM public.scp_assessment_versions WHERE definition_id=_definition_id;
  _source.id := _version; _source.definition_id := _definition_id;
  _source.version_number := _number; _source.content_status := 'draft'; _source.validation_status := 'design';
  _source.authoring_release_required := true;
  _source.notes := _notes; _source.content_hash := NULL;
  _source.approved_by := NULL; _source.approved_at := NULL;
  _source.published_by := NULL; _source.published_at := NULL;
  _source.retired_at := NULL; _source.retired_reason := NULL;
  _source.created_at := now(); _source.updated_at := now();
  INSERT INTO public.scp_assessment_versions SELECT _source.*;
  FOR _form IN SELECT * FROM public.scp_forms WHERE assessment_version_id=_source_version_id LOOP
    IF NOT EXISTS (SELECT 1 FROM public.scp_form_items WHERE form_id=_form.id AND item_version_id=ANY(_item_version_ids)) THEN CONTINUE; END IF;
    _new_form := gen_random_uuid();
    _old_form := _form.id;
    _form.id := _new_form; _form.assessment_version_id := _version;
    _form.content_hash := NULL; _form.created_at := now(); _form.updated_at := now();
    INSERT INTO public.scp_forms SELECT _form.*;
    FOR _block IN SELECT * FROM public.scp_form_blocks b WHERE b.form_id=_old_form
      AND EXISTS (SELECT 1 FROM public.scp_form_items fi WHERE fi.form_id=_old_form
                   AND fi.block_key=b.block_key AND fi.item_version_id=ANY(_item_version_ids)) LOOP
      _block.id := gen_random_uuid(); _block.form_id := _new_form; _block.created_at := now();
      INSERT INTO public.scp_form_blocks SELECT _block.*;
    END LOOP;
    INSERT INTO public.scp_form_items(form_id,item_version_id,block_key,display_order,randomise_options)
      SELECT _new_form,fi.item_version_id,fi.block_key,array_position(_item_version_ids,fi.item_version_id),fi.randomise_options
      FROM public.scp_form_items fi WHERE fi.form_id=_old_form AND fi.item_version_id=ANY(_item_version_ids);
  END LOOP;
  INSERT INTO public.scp_content_events(subject_type,subject_id,action,actor_id,reason,metadata)
    VALUES('assessment_version',_version,'created',auth.uid(),'New draft snapshot from assessment administration',
      jsonb_build_object('source_version_id',_source_version_id,'item_count',_count));
  RETURN _version;
END;
$$;
REVOKE ALL ON FUNCTION public.scp_author_assessment_draft(uuid,text,uuid[],text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_author_assessment_draft(uuid,text,uuid[],text,text,text) TO authenticated;
COMMENT ON FUNCTION public.scp_author_assessment_draft(uuid,text,uuid[],text,text,text) IS
  'Content authors only. Creates a new draft/version or definition from existing governed items. Never changes assigned content, releases a draft or grants access.';

-- Same library and tenant checks; a held version is visible but never sendable.
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
     AND NOT av.authoring_release_required
     AND EXISTS (SELECT 1 FROM public.scp_forms f
                   JOIN public.scp_form_items fi ON fi.form_id = f.id
                  WHERE f.assessment_version_id = av.id)),
    CASE
      WHEN av.authoring_release_required THEN 'not_permitted'
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
