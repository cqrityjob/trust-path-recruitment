-- Rollback for 20261129090000_bcp_internal_test_activation.
--
-- Restores the five gates exactly as they were, then drops the activation and
-- content-role objects. Refuses while any test activation exists, so a
-- rollback can never silently strand a recorded decision.

BEGIN;

DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bcp_internal_test_activations) THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_ROLLBACK_BLOCKED: test activations exist; revoke and archive them deliberately first.';
  END IF;
END $pre$;

CREATE OR REPLACE FUNCTION public.bcp_assign(_operation_id uuid, _application_id uuid, _method_version_id uuid, _exposure_profile_id uuid, _expected_content_hash text, _notice_version text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _ja public.job_applications%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.beskt_exposure_profiles%ROWTYPE;
  _id uuid; _result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _request := jsonb_build_object('op', 'assign', 'application_id', _application_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'expected_content_hash', _expected_content_hash, 'notice_version', _notice_version,
    'due_at', _due_at);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- ---- the existing spine: application, employer, job, candidate ---------
  SELECT * INTO _ja FROM public.job_applications WHERE id = _application_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_APPLICATION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(auth.uid(), _ja.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: starting a preparation requires an active membership of the employer that owns this application.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT coalesce(public.employer_is_active_status(_ja.employer_id), false) THEN
    RAISE EXCEPTION 'BCP_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start preparations.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _ja.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_APPLICATION_WITHDRAWN: the candidate withdrew this application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _ja.applicant_user_id IS NULL THEN
    RAISE EXCEPTION 'BCP_CANDIDATE_UNKNOWN: this application has no signed-in applicant, so there is nobody to prepare.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.id = _ja.job_id AND j.employer_id = _ja.employer_id) THEN
    RAISE EXCEPTION 'BCP_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ---- the governed method: published, recruitment support, pinned ------
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _method_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_METHOD_VERSION_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF _v.content_status <> 'published' THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_PUBLISHED: this method version is "%"; only a published version may be assigned.', _v.content_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF _v.mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED: BESKT PR 3 assigns recruitment-support content only.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.bcp_version_is_candidate_safe(_method_version_id) THEN
    RAISE EXCEPTION 'BCP_METHOD_NOT_CANDIDATE_SAFE: this version holds security-vetting content and can never be put in front of a candidate here.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _exposure_profile_id;
  IF NOT FOUND OR _p.method_version_id IS DISTINCT FROM _method_version_id THEN
    RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION: the exposure profile does not belong to this method version.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.permitted_mode <> 'recruitment_support' THEN
    RAISE EXCEPTION 'BCP_PROFILE_MODE_NOT_PERMITTED: this exposure profile is not recruitment support.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The caller names the content it was looking at; a method edited or
  -- republished since is a different question set and is refused.
  IF _expected_content_hash IS NULL OR _v.content_hash IS DISTINCT FROM _expected_content_hash THEN
    RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH: this method version is at content hash %, not %. Reload and retry.',
      coalesce(_v.content_hash, '(null)'), coalesce(_expected_content_hash, '(null)')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- the explicit release gate ----------------------------------------
  IF NOT public.bcp_pilot_grant_active(_ja.employer_id, _method_version_id) THEN
    RAISE EXCEPTION 'BCP_NOT_ASSIGNABLE: this employer holds no live grant for this BESKT method version.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _notice_version IS DISTINCT FROM public.bcp_notice_version() THEN
    RAISE EXCEPTION 'BCP_NOTICE_VERSION_UNKNOWN: the current candidate notice is "%".', public.bcp_notice_version()
      USING ERRCODE = 'check_violation';
  END IF;

  -- One live preparation per application. Serialise so two members cannot
  -- both pass the check.
  PERFORM pg_advisory_xact_lock(hashtextextended('bcp_application:' || _application_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.bcp_assignments a
              WHERE a.application_id = _application_id AND a.lifecycle_state <> 'cancelled') THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_EXISTS: this application already has a live BESKT preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.bcp_assignments
    (employer_id, job_id, application_id, candidate_user_id, method_version_id,
     exposure_profile_id, pinned_content_hash, pinned_release_scope, notice_version,
     due_at, assigned_by)
  VALUES
    (_ja.employer_id, _ja.job_id, _application_id, _ja.applicant_user_id, _method_version_id,
     _exposure_profile_id, _v.content_hash, _v.release_scope, _notice_version,
     _due_at, auth.uid())
  RETURNING id INTO _id;

  _result := jsonb_build_object(
    'assignment_id', _id, 'application_id', _application_id, 'employer_id', _ja.employer_id,
    'job_id', _ja.job_id, 'candidate_user_id', _ja.applicant_user_id,
    'method_version_id', _method_version_id, 'exposure_profile_id', _exposure_profile_id,
    'content_hash', _v.content_hash, 'notice_version', _notice_version,
    'lifecycle_state', 'assigned', 'revision', 1, 'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_id, NULL, _ja.employer_id, _method_version_id,
    'assignment_created', NULL, 'assigned', NULL, _v.content_hash, 1, _operation_id, _hash, _result);
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_assignable_exposure_profiles(_employer_id uuid, _method_version_id uuid)
 RETURNS TABLE(exposure_profile_id uuid, profile_key text, display_order integer, exposure_area text, duties_sv text, duties_en text, role_relevance_rationale_sv text, role_relevance_rationale_en text, retention_class text, candidate_item_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false)
     OR NOT public.bcp_pilot_grant_active(_employer_id, _method_version_id)
     OR NOT public.bcp_version_is_candidate_safe(_method_version_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.profile_key, p.display_order, p.exposure_area,
           p.duties_sv, p.duties_en,
           p.role_relevance_rationale_sv, p.role_relevance_rationale_en,
           p.retention_class,
           (SELECT count(*)::integer FROM public.beskt_items i
             WHERE i.exposure_profile_id = p.id
               AND i.phase = 'candidate_preparation'
               AND i.permitted_mode = 'recruitment_support')
      FROM public.beskt_exposure_profiles p
     WHERE p.method_version_id = _method_version_id
       AND p.permitted_mode = 'recruitment_support'
     ORDER BY p.display_order, p.profile_key;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_assignable_method_versions(_employer_id uuid)
 RETURNS TABLE(method_version_id uuid, pack_id uuid, pack_slug text, name_sv text, name_en text, purpose_sv text, version_number integer, mode text, validation_label text, release_scope text, content_hash text, summary_sv text, summary_en text, grant_expires_on date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member'])
     OR NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en, g.expires_on
      FROM public.beskt_method_versions v
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
      JOIN public.bcp_pilot_grants g
        ON g.method_version_id = v.id AND g.employer_id = _employer_id
     WHERE p.pack_kind = 'beskt_method'
       AND v.content_status = 'published'
       AND v.mode = 'recruitment_support'
       AND public.bcp_version_is_candidate_safe(v.id)
       AND g.revoked_at IS NULL
       AND current_date >= g.starts_on
       AND current_date < g.expires_on
     ORDER BY p.name_sv, v.version_number DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_party_can_read_method_version(_method_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND public.bcp_version_is_candidate_safe(_method_version_id)
    AND EXISTS (
      SELECT 1 FROM public.bcp_assignments a
       WHERE a.method_version_id = _method_version_id
         AND a.lifecycle_state <> 'cancelled'
         AND (a.candidate_user_id = auth.uid()
              OR public.has_employer_role(auth.uid(), a.employer_id,
                                          ARRAY['owner', 'admin', 'member'])));
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_topic_prompts(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The EXISTING case authority. A caller who cannot read the case cannot
  -- learn anything here, including whether the session exists in a readable
  -- state -- the refusal above is reached only for a session id that is not
  -- a session at all.
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;

  -- A version that is no longer published stops answering. Not an error: the
  -- interview's own record is unaffected and the screen says the wordings are
  -- unavailable, which is true and is different from inventing them.
  IF _v.id IS NULL
     OR _v.content_status <> 'published'
     OR _v.mode <> 'recruitment_support' THEN
    RETURN jsonb_build_object(
      'session_id', _session_id,
      'method_version_id', _s.bound_method_version_id,
      'available', false,
      'reason', CASE WHEN _v.id IS NULL THEN 'version_not_found'
                     WHEN _v.mode <> 'recruitment_support' THEN 'mode_not_permitted'
                     ELSE 'version_not_published' END,
      'topics', '[]'::jsonb,
      'stage_prompts', '[]'::jsonb,
      'produces_score', false,
      'interpretation', 'none');
  END IF;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'method_version_id', _v.id,
    'content_hash', _s.bound_content_hash,
    'available', true,
    'reason', NULL,

    -- Per frozen topic: the item's own governed wording and purpose, and the
    -- prompts that name that item. Ordered by the method's own display order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'prompts', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'prompt_key', pr.prompt_key,
                'display_order', pr.display_order,
                'prompt_kind', pr.prompt_kind,
                'peace_stage', pr.peace_stage,
                'addressee', pr.addressee,
                'question_form', pr.question_form,
                'permitted_probe_bases', public.beskt_sorted_array(pr.permitted_probe_bases),
                'wording_sv', pr.wording_sv,
                'wording_en', pr.wording_en)
              ORDER BY pr.display_order, pr.prompt_key)
              FROM public.beskt_prompts pr
              JOIN public.beskt_items pi ON pi.id = pr.item_id
             WHERE pr.method_version_id = _v.id
               AND pr.item_id = t.item_id
               AND pr.exposure_profile_id = _a.exposure_profile_id
               AND pr.permitted_mode = 'recruitment_support'
               AND pi.permitted_mode = 'recruitment_support'
               AND pi.access_class <> 'authorised_security_function'), '[]'::jsonb))
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id
         AND i.permitted_mode = 'recruitment_support'
         AND i.access_class <> 'authorised_security_function'), '[]'::jsonb),

    -- The method's own structure for the conversation, which belongs to no
    -- single item.
    'stage_prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key,
          'display_order', pr.display_order,
          'prompt_kind', pr.prompt_kind,
          'peace_stage', pr.peace_stage,
          'addressee', pr.addressee,
          'question_form', pr.question_form,
          'wording_sv', pr.wording_sv,
          'wording_en', pr.wording_en)
        ORDER BY pr.display_order, pr.prompt_key)
        FROM public.beskt_prompts pr
       WHERE pr.method_version_id = _v.id
         AND pr.item_id IS NULL
         AND pr.exposure_profile_id = _a.exposure_profile_id
         AND pr.permitted_mode = 'recruitment_support'), '[]'::jsonb),

    -- Said in the payload itself, as every BESKT read says it.
    'produces_score', false,
    'interpretation', 'none');
END;
$function$;
DROP FUNCTION public.beskt_set_content_role(uuid, text, text, boolean, text);
DROP TABLE public.scp_content_role_changes;
DROP FUNCTION public.bcp_internal_test_activations_for(uuid, uuid);
DROP FUNCTION public.bcp_revoke_internal_test_activation(uuid, uuid, text);
DROP FUNCTION public.bcp_grant_internal_test_activation(uuid, uuid, uuid, text, date);
DROP TRIGGER bcp_ita_guard ON public.bcp_internal_test_activations;
DROP TABLE public.bcp_internal_test_activations;
DROP FUNCTION public.bcp_guard_internal_test_activation();
DROP FUNCTION public.bcp_internal_test_activation_covers(uuid, uuid, text);
DROP FUNCTION public.bcp_internal_test_activation_active(uuid, uuid);
DROP FUNCTION public.bcp_version_is_structurally_candidate_safe(uuid);

DO $proof$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assign') <> '17fe1068d9bc3df2bbe8714db5933173'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assignable_exposure_profiles') <> 'd9b541a310219692fe9073c58e25aa07'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assignable_method_versions') <> '000658663cb432406dc1a56128faa796'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_party_can_read_method_version') <> '10873ada27198366eafa06e708fb7edf'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_topic_prompts') <> '91709981bb9f04816c80d3203b36ec7d' THEN
    RAISE EXCEPTION 'BCP_TEST_ACTIVATION_ROLLBACK: a gate was not restored exactly.';
  END IF;
  RAISE NOTICE 'BCP_INTERNAL_TEST_ACTIVATION_ROLLBACK ok';
END $proof$;

COMMIT;
