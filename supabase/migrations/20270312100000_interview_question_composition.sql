-- Canonical forward slot 20270312100000 ("composition121"), slutuppdrag 2026-10-09.
-- Additive. The interview SETUP a recruitment agrees on before comparative
-- interviews: which governed questions and approved follow-ups are used, in
-- which order and groups, from exactly one pack version.
--
-- What it is NOT, by design:
--   - not a subset of the pack. Every core question of the version is part of
--     every composition (RI_COMPOSITION_CORE_REQUIRED). The eight core
--     questions, the six competency areas and their order stay what the
--     historical tests pin; scp_iv_start_session and scp_iv_report_blockers
--     are untouched and keep reading the pack version.
--   - not new content. Only rows that already exist in the pack version can be
--     selected: core questions and approved probes. New SV/EN texts are a
--     content review, not a selection.
--   - not retroactive. A case pins the composition version current when the
--     case was created (or none, for cases older than this slot). A later
--     version is a NEW row; the pinned one is still read by the frozen case.
--
-- No AI, no scoring, no stage mutation, no messages.
BEGIN;

CREATE TABLE public.rec_interview_compositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  pack_version_id uuid NOT NULL REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  -- [{ "group": "...", "kind": "core_question" | "approved_probe", "itemId": uuid, "position": n }]
  selection jsonb NOT NULL CHECK (jsonb_typeof(selection) = 'array' AND jsonb_array_length(selection) BETWEEN 1 AND 200),
  -- Required from the second version on: changing a shared setup has a
  -- consequence (cases already prepared keep the old version) and a reason.
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 2000),
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, version)
);
ALTER TABLE public.rec_interview_compositions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rec_interview_compositions FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.rec_interview_compositions IS
  'Versioned, immutable interview setup per recruitment over ONE pack version: '
  'every core question of the version plus chosen approved probes, in groups and '
  'order. Cases pin the version current at creation.';

CREATE FUNCTION public.rec_interview_composition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 AND NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = OLD.job_id) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 AND NEW.confirmed_by IS NULL AND OLD.confirmed_by IS NOT NULL
     AND (to_jsonb(NEW) - 'confirmed_by') = (to_jsonb(OLD) - 'confirmed_by') THEN
    RETURN NEW; -- the confirming user was deleted; the row stays as history
  END IF;
  RAISE EXCEPTION 'RI_COMPOSITION_IMMUTABLE' USING ERRCODE = 'check_violation';
END $$;
REVOKE ALL ON FUNCTION public.rec_interview_composition_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER rec_interview_compositions_immutable
  BEFORE UPDATE OR DELETE ON public.rec_interview_compositions
  FOR EACH ROW EXECUTE FUNCTION public.rec_interview_composition_guard();

-- The case pins its composition. Nullable: every case created before this
-- slot, and every case for a recruitment without a composition, has none.
ALTER TABLE public.scp_interview_cases
  ADD COLUMN composition_id uuid REFERENCES public.rec_interview_compositions(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.scp_interview_cases.composition_id IS
  'The recruitment''s interview setup version current when the case was created, '
  'when its pack version matched. Never re-pointed.';

CREATE FUNCTION public.rec_interview_case_pin_composition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.composition_id IS DISTINCT FROM OLD.composition_id THEN
      RAISE EXCEPTION 'RI_COMPOSITION_BIND_IMMUTABLE' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.composition_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT c.id INTO NEW.composition_id
      FROM public.rec_interview_compositions c
     WHERE c.job_id = NEW.job_id AND c.pack_version_id = NEW.pack_version_id
     ORDER BY c.version DESC LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rec_interview_case_pin_composition() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER scp_interview_cases_pin_composition
  BEFORE INSERT OR UPDATE OF composition_id ON public.scp_interview_cases
  FOR EACH ROW EXECUTE FUNCTION public.rec_interview_case_pin_composition();

-- What can be chosen for one pack version: the content that already exists,
-- read verbatim. Members of the organisation read it; nothing is written.
CREATE FUNCTION public.rec_ri_composition_catalog(_employer_id uuid, _pack_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pv public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  IF NOT public.rec_is_member(_employer_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO pv FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RI_PACK_VERSION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN jsonb_build_object(
    'packVersionId', pv.id,
    'packId', pv.pack_id,
    'versionNumber', pv.version_number,
    'contentStatus', pv.content_status,
    'validationLabel', pv.validation_label,
    'locale', pv.locale,
    'packName', (SELECT jsonb_build_object('sv', p.name_sv, 'en', p.name_en) FROM public.scp_interview_packs p WHERE p.id = pv.pack_id),
    'competencies', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'nameSv', c.name_sv, 'nameEn', c.name_en) ORDER BY c.display_order)
        FROM public.scp_interview_pack_competencies c WHERE c.pack_version_id = pv.id), '[]'::jsonb),
    'coreQuestions', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'code', q.code, 'displayOrder', q.display_order, 'questionType', q.question_type,
        'promptSv', q.prompt_sv, 'promptEn', q.prompt_en,
        'durationMin', q.recommended_duration_min_minutes, 'durationMax', q.recommended_duration_max_minutes,
        'competencyCodes', coalesce((SELECT jsonb_agg(c.code ORDER BY qc.is_primary DESC, c.display_order)
                                       FROM public.scp_interview_question_competencies qc
                                       JOIN public.scp_interview_pack_competencies c ON c.id = qc.pack_competency_id
                                      WHERE qc.question_id = q.id), '[]'::jsonb)) ORDER BY q.display_order)
        FROM public.scp_interview_core_questions q WHERE q.pack_version_id = pv.id), '[]'::jsonb),
    'approvedProbes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id, 'questionId', pr.question_id, 'purpose', pr.purpose,
        'wordingSv', pr.wording_sv, 'wordingEn', pr.wording_en, 'displayOrder', pr.display_order)
        ORDER BY pr.question_id NULLS FIRST, pr.display_order)
        FROM public.scp_interview_approved_probes pr WHERE pr.pack_version_id = pv.id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_composition_catalog(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_composition_catalog(uuid, uuid) TO authenticated;

CREATE FUNCTION recruiter_intelligence.composition_json(_job_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'jobId', c.job_id, 'compositionId', c.id, 'version', c.version,
      'packVersionId', c.pack_version_id, 'selection', c.selection, 'reason', c.reason,
      'confirmedBy', c.confirmed_by, 'confirmedAt', c.confirmed_at,
      'boundCases', (SELECT count(*) FROM public.scp_interview_cases k WHERE k.composition_id = c.id),
      'olderBoundCases', (SELECT count(*) FROM public.scp_interview_cases k
                            JOIN public.rec_interview_compositions o ON o.id = k.composition_id
                           WHERE o.job_id = c.job_id AND o.version < c.version))
      FROM public.rec_interview_compositions c WHERE c.job_id = _job_id
     ORDER BY c.version DESC LIMIT 1),
    jsonb_build_object('jobId', _job_id, 'compositionId', NULL, 'version', 0, 'packVersionId', NULL,
                       'selection', '[]'::jsonb, 'reason', NULL, 'confirmedBy', NULL, 'confirmedAt', NULL,
                       'boundCases', 0, 'olderBoundCases', 0));
$$;
REVOKE ALL ON FUNCTION recruiter_intelligence.composition_json(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.rec_ri_get_composition(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND public.rec_is_member(j.employer_id)) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN recruiter_intelligence.composition_json(_job_id)
         || jsonb_build_object('canManage', public.rec_can_manage(_job_id));
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_get_composition(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_get_composition(uuid) TO authenticated;

-- Save a new version: CAS on the current version, idempotent by operation id,
-- every item verified against the pack version, every core question present
-- exactly once, no duplicates, positions unique, a reason from version 2 on.
CREATE FUNCTION public.rec_ri_save_composition(
  _job_id uuid, _expected_version integer, _operation_id uuid,
  _pack_version_id uuid, _selection jsonb, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; v integer; request jsonb; result jsonb; item jsonb; n integer;
        cores integer; selected_cores integer; prev_pack uuid; _reason_clean text;
BEGIN
  SELECT * INTO j FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rec_can_manage(_job_id) THEN
    RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL OR _expected_version IS NULL OR _pack_version_id IS NULL
     OR _selection IS NULL OR jsonb_typeof(_selection) <> 'array'
     OR jsonb_array_length(_selection) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'RI_COMPOSITION_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  _reason_clean := nullif(btrim(_reason), '');
  request := jsonb_build_object('version', _expected_version, 'pack', _pack_version_id,
                                'selection', _selection, 'reason', _reason_clean);
  result := recruiter_intelligence.operation_result(_operation_id, _job_id, 'composition', request);
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT coalesce(max(version), 0) INTO v FROM public.rec_interview_compositions WHERE job_id = _job_id;
  IF v <> _expected_version THEN
    RAISE EXCEPTION 'RI_STALE_VERSION' USING ERRCODE = 'PT409';
  END IF;
  IF v > 0 AND (_reason_clean IS NULL OR char_length(_reason_clean) > 2000) THEN
    RAISE EXCEPTION 'RI_COMPOSITION_REASON_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_pack_versions pv
                  WHERE pv.id = _pack_version_id AND pv.content_status NOT IN ('retired')) THEN
    RAISE EXCEPTION 'RI_PACK_VERSION_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  -- Every item is a row of THIS pack version, with a group, a kind and a position.
  FOR item IN SELECT * FROM jsonb_array_elements(_selection) LOOP
    IF nullif(btrim(item->>'group'), '') IS NULL OR char_length(item->>'group') > 60
       OR coalesce(item->>'kind', '') NOT IN ('core_question', 'approved_probe')
       OR (item->>'itemId') IS NULL OR jsonb_typeof(item->'position') <> 'number' THEN
      RAISE EXCEPTION 'RI_COMPOSITION_INVALID' USING ERRCODE = 'check_violation';
    END IF;
    IF item->>'kind' = 'core_question' AND NOT EXISTS (
         SELECT 1 FROM public.scp_interview_core_questions q
          WHERE q.id::text = item->>'itemId' AND q.pack_version_id = _pack_version_id) THEN
      RAISE EXCEPTION 'RI_COMPOSITION_FOREIGN_ITEM' USING ERRCODE = 'check_violation';
    END IF;
    IF item->>'kind' = 'approved_probe' AND NOT EXISTS (
         SELECT 1 FROM public.scp_interview_approved_probes pr
          WHERE pr.id::text = item->>'itemId' AND pr.pack_version_id = _pack_version_id) THEN
      RAISE EXCEPTION 'RI_COMPOSITION_FOREIGN_ITEM' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  SELECT count(*), count(DISTINCT x->>'itemId'), count(DISTINCT (x->>'position')::numeric)
    INTO n, selected_cores, cores FROM jsonb_array_elements(_selection) x;
  IF selected_cores <> n OR cores <> n THEN
    RAISE EXCEPTION 'RI_COMPOSITION_DUPLICATE' USING ERRCODE = 'check_violation';
  END IF;
  -- The core is never a subset: every core question of the version, once.
  SELECT count(*) INTO cores FROM public.scp_interview_core_questions q WHERE q.pack_version_id = _pack_version_id;
  SELECT count(*) INTO selected_cores FROM jsonb_array_elements(_selection) x
   WHERE x->>'kind' = 'core_question';
  IF selected_cores <> cores THEN
    RAISE EXCEPTION 'RI_COMPOSITION_CORE_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  -- Changing the pack version between compositions is a new recruitment
  -- setup, not a revision; it is refused so pinned cases stay comparable.
  SELECT pack_version_id INTO prev_pack FROM public.rec_interview_compositions
   WHERE job_id = _job_id ORDER BY version DESC LIMIT 1;
  IF prev_pack IS NOT NULL AND prev_pack <> _pack_version_id THEN
    RAISE EXCEPTION 'RI_COMPOSITION_PACK_FIXED' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.rec_interview_compositions
    (job_id, employer_id, version, pack_version_id, selection, reason, confirmed_by)
  VALUES (j.id, j.employer_id, v + 1, _pack_version_id, _selection, _reason_clean, auth.uid());
  result := recruiter_intelligence.composition_json(_job_id);
  INSERT INTO recruiter_intelligence.operations
    VALUES (_operation_id, auth.uid(), _job_id, 'composition', md5(request::text), result, now(), j.id);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_save_composition(uuid, integer, uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_save_composition(uuid, integer, uuid, uuid, jsonb, text) TO authenticated;

-- What a case reads: ITS pinned composition, never the recruitment's current one.
CREATE FUNCTION public.rec_ri_case_composition(_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k public.scp_interview_cases%ROWTYPE;
BEGIN
  SELECT * INTO k FROM public.scp_interview_cases WHERE id = _case_id;
  IF NOT FOUND OR NOT public.scp_iv_can_read_case(_case_id) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_CASE_MEMBER' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF k.composition_id IS NULL THEN
    RETURN jsonb_build_object('caseId', k.id, 'compositionId', NULL, 'version', 0, 'selection', '[]'::jsonb,
                              'currentVersion', (recruiter_intelligence.composition_json(k.job_id)->>'version')::integer);
  END IF;
  RETURN (SELECT jsonb_build_object('caseId', k.id, 'compositionId', c.id, 'version', c.version,
                                    'packVersionId', c.pack_version_id, 'selection', c.selection,
                                    'confirmedAt', c.confirmed_at,
                                    'currentVersion', (recruiter_intelligence.composition_json(k.job_id)->>'version')::integer)
            FROM public.rec_interview_compositions c WHERE c.id = k.composition_id);
END $$;
REVOKE ALL ON FUNCTION public.rec_ri_case_composition(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rec_ri_case_composition(uuid) TO authenticated;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.rec_interview_compositions', 'SELECT') THEN
    RAISE EXCEPTION 'RI_COMPOSITION_TABLE_EXPOSED';
  END IF;
  IF pg_get_functiondef('public.scp_iv_start_session(uuid,text)'::regprocedure) LIKE '%composition%' THEN
    RAISE EXCEPTION 'RI_COMPOSITION_TOUCHED_SESSION_SEEDING';
  END IF;
END $$;
COMMIT;
