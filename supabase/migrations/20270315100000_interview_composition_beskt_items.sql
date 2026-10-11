-- Canonical forward slot 20270315100000 ("beskt151"), slutuppdrag 2026-10-11.
-- The interview setup of a recruitment may include BESKT items that already
-- exist in a PUBLISHED BESKT method version and are permitted for ordinary
-- recruitment support. Security vetting stays a separate act.
--
-- What this slot does and does not do:
--   - rec_ri_composition_catalog (same signature) additionally lists the
--     published BESKT method versions in recruitment_support mode and their
--     interview-phase items of ordinary sensitivity, each with its section,
--     wording and purpose in SV/EN, so a recruiter can pick from governed
--     content that was approved through the five BESKT review gates. Nothing
--     is listed for a version that is draft, in review, suspended or retired.
--   - rec_ri_save_composition (same signature) accepts a third kind,
--     `beskt_item`, in the group `beskt`, verified against that published
--     content under the same mode and sensitivity limits. Every core question
--     of the pack version is still mandatory; probes are still verified
--     against the pack version; positions stay unique; the pack stays fixed;
--     a reason is still required from version 2.
--   - items whose permitted_mode is security_vetting_support, or whose
--     sensitivity_class is not `ordinary`, are never selectable here. That
--     content belongs to the BESKT vetting flow (bcp assignments, with a
--     security owner, a role attestation and a lawful basis), not to a
--     recruitment interview. The refusal names it: RI_COMPOSITION_VETTING_ONLY.
--   - no BESKT content is created, approved or published by this slot. Today
--     no BESKT method version is published on the hosted database, so the
--     catalog's BESKT lists are honestly empty until a human publishes one.
--
-- No AI, no stage mutation, no messages, no client DML.
BEGIN;

CREATE OR REPLACE FUNCTION public.rec_ri_composition_catalog(_employer_id uuid, _pack_version_id uuid)
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
        FROM public.scp_interview_approved_probes pr WHERE pr.pack_version_id = pv.id), '[]'::jsonb),
    -- Published BESKT method versions for ordinary recruitment support, and the
    -- interview-phase items of ordinary sensitivity a recruitment may use.
    'besktMethodVersions', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', mv.id, 'packId', mv.pack_id, 'versionNumber', mv.version_number, 'mode', mv.mode,
        'localeSv', mv.locale_sv, 'localeEn', mv.locale_en, 'summarySv', mv.summary_sv, 'summaryEn', mv.summary_en,
        'publishedAt', mv.published_at,
        'packName', (SELECT jsonb_build_object('sv', p.name_sv, 'en', p.name_en) FROM public.scp_interview_packs p WHERE p.id = mv.pack_id))
        ORDER BY mv.published_at DESC)
        FROM public.beskt_method_versions mv
       WHERE mv.content_status = 'published' AND mv.mode = 'recruitment_support'), '[]'::jsonb),
    'besktItems', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'methodVersionId', i.method_version_id, 'itemKey', i.item_key, 'displayOrder', i.display_order,
        'sectionKey', s.section_key, 'sectionTitleSv', s.title_sv, 'sectionTitleEn', s.title_en,
        'wordingSv', i.wording_sv, 'wordingEn', i.wording_en, 'purposeSv', i.purpose_sv, 'purposeEn', i.purpose_en,
        'answerType', i.answer_type, 'requiredness', i.requiredness, 'sensitivityClass', i.sensitivity_class)
        ORDER BY s.display_order, i.display_order)
        FROM public.beskt_items i
        JOIN public.beskt_method_versions mv ON mv.id = i.method_version_id
        LEFT JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE mv.content_status = 'published' AND mv.mode = 'recruitment_support'
         AND i.permitted_mode = 'recruitment_support' AND i.sensitivity_class = 'ordinary'
         AND i.phase = 'interview'), '[]'::jsonb),
    -- Said once, read by the client: vetting content is not selectable here.
    'vettingSelectable', false);
END $$;
-- Grants of composition121 stand: authenticated may execute, anon may not.

CREATE OR REPLACE FUNCTION public.rec_ri_save_composition(
  _job_id uuid, _expected_version integer, _operation_id uuid,
  _pack_version_id uuid, _selection jsonb, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.jobs%ROWTYPE; v integer; request jsonb; result jsonb; item jsonb; n integer;
        cores integer; selected_cores integer; prev_pack uuid; _reason_clean text; bi public.beskt_items%ROWTYPE;
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
  -- Every item is a row of THIS pack version or of a published BESKT method
  -- version permitted for recruitment, with a group, a kind and a position.
  FOR item IN SELECT * FROM jsonb_array_elements(_selection) LOOP
    IF nullif(btrim(item->>'group'), '') IS NULL OR char_length(item->>'group') > 60
       OR coalesce(item->>'kind', '') NOT IN ('core_question', 'approved_probe', 'beskt_item')
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
    IF item->>'kind' = 'beskt_item' THEN
      IF item->>'group' <> 'beskt' THEN
        RAISE EXCEPTION 'RI_COMPOSITION_INVALID' USING ERRCODE = 'check_violation';
      END IF;
      SELECT i.* INTO bi FROM public.beskt_items i
        JOIN public.beskt_method_versions mv ON mv.id = i.method_version_id
       WHERE i.id::text = item->>'itemId' AND mv.content_status = 'published';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RI_COMPOSITION_FOREIGN_ITEM' USING ERRCODE = 'check_violation';
      END IF;
      IF bi.permitted_mode <> 'recruitment_support' OR bi.sensitivity_class <> 'ordinary' OR bi.phase <> 'interview'
         OR EXISTS (SELECT 1 FROM public.beskt_method_versions mv WHERE mv.id = bi.method_version_id AND mv.mode <> 'recruitment_support') THEN
        RAISE EXCEPTION 'RI_COMPOSITION_VETTING_ONLY' USING ERRCODE = 'check_violation';
      END IF;
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
-- Grants of composition121 stand: authenticated may execute, anon may not.

COMMIT;
