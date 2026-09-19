-- Rollback for 20261130090000_bcp_beskt_complete.
--
-- Refuses while any security-vetting or invitation-based assignment, officer,
-- invitation, supplement, stance or action exists: those records have no
-- representation in the previous schema, and a rollback must never strand or
-- silently drop them. Restores every re-created function verbatim (md5-proved)
-- and the previous policies, constraints and columns.

BEGIN;

DO $pre$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bcp_assignments
              WHERE mode <> 'recruitment_support' OR invitation_id IS NOT NULL OR role_title IS NOT NULL
                 OR responsible_interviewer_id IS NOT NULL OR contact_statement IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.bcp_security_officers)
     OR EXISTS (SELECT 1 FROM public.bcp_invitations)
     OR EXISTS (SELECT 1 FROM public.bcp_candidate_supplements)
     OR EXISTS (SELECT 1 FROM public.bcp_conduct_stances)
     OR EXISTS (SELECT 1 FROM public.bcp_conduct_actions)
     OR EXISTS (SELECT 1 FROM public.bcp_case_topics WHERE topic_reason = 'candidate_disclosed')
     OR EXISTS (SELECT 1 FROM public.bcp_conduct_entries
                 WHERE coalesce(event_timing, consequence, supporting_information, contradicting_information,
                                measures_taken, role_link, information_gap, candidate_response) IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.bcp_events WHERE event IN ('security_officer_appointed',
                 'security_officer_revoked', 'invitation_created', 'invitation_revoked', 'invitation_accepted',
                 'supplement_submitted', 'conduct_stance_recorded', 'conduct_action_recorded')) THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK_BLOCKED: records exist that the previous schema cannot hold; archive them deliberately first.';
  END IF;
END $pre$;

DROP FUNCTION public.bcp_candidate_assignments();
CREATE OR REPLACE FUNCTION public.scp_iv_can_read_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id), NULL);
$function$;

CREATE OR REPLACE FUNCTION public.scp_iv_can_write_case(_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), public.scp_iv_case_employer(_case_id),
                                  ARRAY['owner','admin','member'])
     AND EXISTS (SELECT 1 FROM public.scp_interview_cases c
                  WHERE c.id = _case_id
                    AND c.status <> 'cancelled'
                    AND c.retention_state = 'active');
$function$;

CREATE OR REPLACE FUNCTION public.scp_iv_create_case(_employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text, _candidate_user_id uuid DEFAULT NULL::uuid, _candidate_external_ref text DEFAULT NULL::text, _job_id uuid DEFAULT NULL::uuid, _application_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _pack public.scp_interview_pack_versions%ROWTYPE;
  _method_id uuid;
  _usage text;
  _basis text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'SCP_IV_NOT_EMPLOYER_MEMBER: creating an interview case requires an active membership of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT coalesce(public.employer_is_active_status(_employer_id), false) THEN
    RAISE EXCEPTION 'SCP_IV_EMPLOYER_NOT_ACTIVE: this employer account is not active, so it cannot start interviews.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _pack FROM public.scp_interview_pack_versions WHERE id = _pack_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_PACK_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- BESKT PR 2: a case is started with a role-interview pack version only.
  -- A BESKT method version cannot exist in this table, and if a pack of
  -- another kind ever reaches here it is refused before any entitlement.
  IF NOT EXISTS (SELECT 1 FROM public.scp_interview_packs p
                  WHERE p.id = _pack.pack_id AND p.pack_kind = 'role_interview') THEN
    RAISE EXCEPTION 'SCP_IV_PACK_KIND_NOT_STARTABLE: only a role-interview pack version can start an interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The authoritative decision, shared with the list.
  _basis := public.scp_iv_case_start_basis(_employer_id, _pack_version_id, auth.uid());

  IF _basis IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_PACK_NOT_USABLE: pack version is "%" and is neither published, openly available for pilot use, nor covered by a live pilot grant for you.',
      _pack.content_status USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _job_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_JOB: that job belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _application_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.job_applications a
        WHERE a.id = _application_id AND a.employer_id = _employer_id) THEN
    RAISE EXCEPTION 'SCP_IV_CROSS_TENANT_APPLICATION: that application belongs to a different employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20261128090000: a case names a candidate ACCOUNT only as the applicant
  -- of the application it is bound to. Without this, any member of any
  -- active employer could bind an arbitrary user to a case of theirs, and
  -- that user would be treated as the case's candidate everywhere
  -- (scp_iv_is_case_candidate, the candidate's own interview status, and the
  -- BESKT preparation bridge, which matches on it). A case without an
  -- account -- a candidate identified by an external reference -- is
  -- unchanged. The employer's authority over the application is the check
  -- directly above; this one binds the person to it.
  IF _candidate_user_id IS NOT NULL THEN
    IF _application_id IS NULL THEN
      RAISE EXCEPTION 'SCP_IV_CANDIDATE_REQUIRES_APPLICATION: a candidate account can be named only through the application that account applied with.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (
         SELECT 1 FROM public.job_applications a
          WHERE a.id = _application_id
            AND a.employer_id = _employer_id
            AND a.applicant_user_id = _candidate_user_id) THEN
      RAISE EXCEPTION 'SCP_IV_CANDIDATE_NOT_APPLICANT: that account is not the applicant of this application.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  _usage := CASE WHEN _pack.content_status = 'published' THEN 'production' ELSE 'internal_qa' END;
  _method_id := public.scp_trust_eligible_method(_usage);

  INSERT INTO public.scp_interview_cases
    (employer_id, job_id, application_id, candidate_user_id, candidate_external_ref,
     candidate_display_name, pack_version_id, role_version_id, pack_content_hash, title,
     created_by, trust_method_id)
  VALUES
    (_employer_id, _job_id, _application_id, _candidate_user_id, _candidate_external_ref,
     _candidate_display_name, _pack_version_id, _pack.role_version_id, _pack.content_hash,
     _title, auth.uid(), _method_id)
  RETURNING id INTO _id;

  PERFORM public.scp_iv_record_event(_id, 'case_created', 'human', NULL, NULL, 'draft', NULL,
    jsonb_build_object('pack_version_id', _pack_version_id,
                       'pack_content_status', _pack.content_status,
                       'validation_label', _pack.validation_label,
                       'trust_method_version',
                         (SELECT version_number FROM public.scp_interview_methods WHERE id = _method_id),
                       'trust_usage_mode', _usage,
                       'entitlement_basis', _basis,
                       'used_pilot_grant', _basis = 'pilot_grant'));
  RETURN _id;
END; $function$;

CREATE OR REPLACE FUNCTION public.bcp_employer_can_read_assignment(_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.bcp_assignments a
      JOIN public.job_applications ja ON ja.id = a.application_id
      JOIN public.jobs j ON j.id = a.job_id
     WHERE a.id = _assignment_id
       AND ja.employer_id = a.employer_id
       AND j.employer_id = a.employer_id
       AND ja.applicant_user_id = a.candidate_user_id
       AND public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin', 'member']));
$function$;

CREATE OR REPLACE FUNCTION public.bcp_party_can_read_method_version(_method_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bcp_assignments a
       WHERE a.method_version_id = _method_version_id
         AND a.lifecycle_state <> 'cancelled'
         AND (a.candidate_user_id = auth.uid()
              OR public.has_employer_role(auth.uid(), a.employer_id,
                                          ARRAY['owner', 'admin', 'member']))
         -- 20261129090000: a published candidate-safe version, or the exact
         -- content an internal test activation of THIS employer covered.
         AND (public.bcp_version_is_candidate_safe(_method_version_id)
              OR public.bcp_internal_test_activation_covers(a.employer_id, _method_version_id,
                                                             a.pinned_content_hash)));
$function$;

CREATE OR REPLACE FUNCTION public.bcp_version_is_structurally_candidate_safe(_method_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
      SELECT 1 FROM public.beskt_method_versions v
       WHERE v.id = _method_version_id
         AND v.mode = 'recruitment_support'
         AND v.release_scope = 'synthetic_internal_only')
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_exposure_profiles p
       WHERE p.method_version_id = _method_version_id
         AND (p.permitted_mode = 'security_vetting_support'
              OR p.access_class = 'authorised_security_function'
              OR p.retention_class = 'security_vetting_record'))
    AND NOT EXISTS (
      SELECT 1 FROM public.beskt_items i
       WHERE i.method_version_id = _method_version_id
         AND (i.permitted_mode = 'security_vetting_support'
              OR i.sensitivity_class = 'security_vetting_only'
              OR i.access_class = 'authorised_security_function'));
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
    UNION ALL
    -- 20261129090000: versions this employer may use under a live internal
    -- test activation, and not already under a pilot grant.
    SELECT v.id, p.id, p.slug, p.name_sv, p.name_en, p.purpose_sv, v.version_number,
           v.mode, v.validation_label, v.release_scope, v.content_hash,
           v.summary_sv, v.summary_en, t.expires_on
      FROM public.bcp_internal_test_activations t
      JOIN public.beskt_method_versions v ON v.id = t.method_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE t.employer_id = _employer_id
       AND p.pack_kind = 'beskt_method'
       AND public.bcp_internal_test_activation_active(_employer_id, v.id)
       AND t.revoked_at IS NULL
       AND NOT (v.content_status = 'published' AND public.bcp_pilot_grant_active(_employer_id, v.id))
     ORDER BY 4, 7 DESC;
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
     OR NOT ((public.bcp_pilot_grant_active(_employer_id, _method_version_id)
              AND public.bcp_version_is_candidate_safe(_method_version_id))
             OR public.bcp_internal_test_activation_active(_employer_id, _method_version_id)) THEN
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

CREATE OR REPLACE FUNCTION public.bcp_save_answers(_operation_id uuid, _assignment_id uuid, _expected_revision integer, _answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _request jsonb; _hash text; _replay jsonb;
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _visible uuid[];
  _entry jsonb;
  _item public.beskt_items%ROWTYPE;
  _state text; _key text;
  _opts text[];
  _saved integer := 0;
  _result jsonb;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_CANDIDATE: only the candidate this preparation belongs to may answer it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RAISE EXCEPTION 'BCP_ANSWERS_NOT_STRUCTURED: answers must be a JSON array of typed entries.'
      USING ERRCODE = 'check_violation';
  END IF;
  _request := jsonb_build_object('op', 'save_answers', 'assignment_id', _assignment_id,
    'expected_revision', _expected_revision, 'answers', _answers);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: this preparation was cancelled.' USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state = 'submitted' THEN
    RAISE EXCEPTION 'BCP_ALREADY_SUBMITTED: this preparation has been submitted and is read-only.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.acknowledged_at IS NULL THEN
    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the candidate notice must be read and acknowledged before any question is answered.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- compare-and-swap on the DRAFT, before any write ------------------
  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: a save names the revision it was looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'draft' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NO_OPEN_DRAFT: this preparation has no open draft.' USING ERRCODE = 'check_violation';
  END IF;
  IF _r.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the draft is at revision % but the request expected revision %. Reload and retry.',
      _r.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;

  -- ---- what the candidate can currently see -----------------------------
  SELECT coalesce(array_agg(v.item_id), '{}'::uuid[]) INTO _visible
    FROM public.bcp_visible_items(_assignment_id, _r.id) v;

  FOR _entry IN SELECT jsonb_array_elements(_answers) LOOP
    IF jsonb_typeof(_entry) <> 'object' THEN
      RAISE EXCEPTION 'BCP_ANSWERS_NOT_STRUCTURED: every answer entry must be a JSON object.'
        USING ERRCODE = 'check_violation';
    END IF;
    _key := _entry ->> 'item_key';
    _state := _entry ->> 'response_state';
    IF _key IS NULL OR _state IS NULL THEN
      RAISE EXCEPTION 'BCP_ANSWER_INCOMPLETE: every answer entry names an item_key and a response_state.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _state NOT IN ('answered', 'omitted', 'discuss_orally') THEN
      RAISE EXCEPTION 'BCP_ANSWER_STATE_UNKNOWN: "%" is not a candidate response state.', _state
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO _item FROM public.beskt_items i
     WHERE i.method_version_id = _a.method_version_id AND i.item_key = _key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_IN_VERSION: "%" is not an item of the assigned method version.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.exposure_profile_id IS DISTINCT FROM _a.exposure_profile_id THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_IN_PROFILE: "%" does not belong to the assigned exposure profile.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.phase <> 'candidate_preparation' THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_CANDIDATE_PHASE: "%" is not a candidate-preparation item.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _item.permitted_mode <> 'recruitment_support'
       OR _item.sensitivity_class = 'security_vetting_only' THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_PERMITTED: "%" is security-vetting content and is never answered here.', _key
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (_item.id = ANY (_visible)) THEN
      RAISE EXCEPTION 'BCP_ITEM_NOT_VISIBLE: "%" is not currently shown to this candidate, so it cannot be answered.', _key
        USING ERRCODE = 'check_violation';
    END IF;
    IF _state = 'discuss_orally' AND NOT _item.discuss_orally_allowed THEN
      RAISE EXCEPTION 'BCP_ORAL_NOT_ALLOWED: "%" is not marked as one that may be taken orally.', _key
        USING ERRCODE = 'check_violation';
    END IF;

    _opts := NULL;
    IF _state = 'answered' AND _item.answer_type IN ('single_choice', 'multi_choice') THEN
      SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO _opts
        FROM jsonb_array_elements_text(coalesce(_entry -> 'option_keys', '[]'::jsonb)) AS k;
      IF EXISTS (
        SELECT 1 FROM unnest(_opts) AS k
         WHERE NOT EXISTS (SELECT 1 FROM public.beskt_item_options o
                            WHERE o.item_id = _item.id AND o.option_key = k)) THEN
        RAISE EXCEPTION 'BCP_OPTION_NOT_IN_ITEM: an option selected for "%" is not a governed option of that item.', _key
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    INSERT INTO public.bcp_answers
      (response_id, item_id, item_key, answer_type, response_state,
       value_boolean, value_text, value_date, selected_option_keys)
    VALUES (
      _r.id, _item.id, _item.item_key, _item.answer_type, _state,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('boolean', 'acknowledgement')
           THEN (_entry ->> 'value_boolean')::boolean END,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('short_text', 'long_text')
           THEN _entry ->> 'value_text' END,
      CASE WHEN _state = 'answered' AND _item.answer_type = 'date'
           THEN (_entry ->> 'value_date')::date END,
      CASE WHEN _state = 'answered' AND _item.answer_type IN ('single_choice', 'multi_choice')
           THEN _opts END)
    ON CONFLICT (response_id, item_id) DO UPDATE SET
      answer_type = EXCLUDED.answer_type,
      response_state = EXCLUDED.response_state,
      value_boolean = EXCLUDED.value_boolean,
      value_text = EXCLUDED.value_text,
      value_date = EXCLUDED.value_date,
      selected_option_keys = EXCLUDED.selected_option_keys;
    _saved := _saved + 1;
  END LOOP;

  UPDATE public.bcp_responses SET revision = revision + 1 WHERE id = _r.id;
  IF _a.lifecycle_state = 'notice_acknowledged' THEN
    UPDATE public.bcp_assignments
       SET lifecycle_state = 'in_progress', revision = revision + 1 WHERE id = _assignment_id;
  END IF;

  _result := jsonb_build_object('assignment_id', _assignment_id, 'response_id', _r.id,
    'revision', _r.revision + 1, 'saved', _saved,
    'lifecycle_state', (SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _assignment_id),
    'operation_id', _operation_id);
  PERFORM public.bcp_record_event(_assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'response_saved', _a.lifecycle_state,
    (SELECT lifecycle_state FROM public.bcp_assignments WHERE id = _assignment_id),
    NULL, _a.pinned_content_hash, _r.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('items_saved', _saved));
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_candidate_preparation(_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
  _prof public.beskt_exposure_profiles%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
BEGIN
  IF NOT public.bcp_is_assignment_candidate(_assignment_id) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: this preparation does not belong to you.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _a.method_version_id;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;
  SELECT * INTO _prof FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;

  -- The latest response: the open draft while there is one, otherwise the
  -- submitted version the candidate may re-read but not change.
  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id
   ORDER BY response_version DESC LIMIT 1;

  RETURN jsonb_build_object(
    'assignment_id', _a.id,
    'application_id', _a.application_id,
    'job_id', _a.job_id,
    'employer_id', _a.employer_id,
    'lifecycle_state', _a.lifecycle_state,
    'available_from', _a.available_from,
    'due_at', _a.due_at,
    'submitted_at', _a.submitted_at,
    'read_only', _a.lifecycle_state IN ('submitted', 'cancelled'),
    'method', jsonb_build_object(
      'method_version_id', _v.id, 'pack_slug', _p.slug,
      'name_sv', _p.name_sv, 'name_en', _p.name_en, 'purpose_sv', _p.purpose_sv,
      'version_number', _v.version_number, 'mode', _v.mode,
      'validation_label', _v.validation_label, 'release_scope', _v.release_scope,
      'summary_sv', _v.summary_sv, 'summary_en', _v.summary_en,
      'content_hash', _a.pinned_content_hash,
      'content_hash_algorithm', _a.pinned_content_hash_algorithm),
    'exposure_profile', jsonb_build_object(
      'profile_key', _prof.profile_key, 'exposure_area', _prof.exposure_area,
      'duties_sv', _prof.duties_sv, 'duties_en', _prof.duties_en,
      'role_relevance_rationale_sv', _prof.role_relevance_rationale_sv,
      'role_relevance_rationale_en', _prof.role_relevance_rationale_en,
      'retention_class', _prof.retention_class,
      'lawful_basis_reference', _prof.lawful_basis_reference,
      'jurisdiction_reference', _prof.jurisdiction_reference),
    -- PER LOCALE, because the hash is now per locale. The client renders one
    -- language and echoes back the hash for THAT language; the server
    -- recomputes it from its own governed digest and refuses a mismatch, so
    -- nothing here is a client-selected authority.
    'notice', jsonb_build_object(
      'notice_version', _a.notice_version,
      'acknowledged_at', _a.acknowledged_at,
      'locales', to_jsonb(public.bcp_notice_locales()),
      'by_locale', (
        SELECT jsonb_object_agg(loc, jsonb_build_object(
                 'notice_content_hash', public.bcp_notice_hash(_assignment_id, loc),
                 'descriptor', public.bcp_notice_descriptor(_assignment_id, loc)))
          FROM unnest(public.bcp_notice_locales()) AS loc)),
    'response', CASE WHEN _r.id IS NULL THEN NULL ELSE jsonb_build_object(
      'response_id', _r.id, 'response_version', _r.response_version,
      'response_state', _r.response_state, 'revision', _r.revision,
      'submitted_at', _r.submitted_at,
      'submitted_content_hash', _r.submitted_content_hash) END,
    -- The governed questions currently in front of this candidate, in
    -- governed order, resolved through PR #218's routing authority.
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'sequence_position', vis.sequence_position,
          'item_key', i.item_key, 'section_key', vis.section_key,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en,
          'answer_type', i.answer_type, 'requiredness', i.requiredness,
          'discuss_orally_allowed', i.discuss_orally_allowed,
          'options', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'option_key', o.option_key, 'display_order', o.display_order,
                'label_sv', o.label_sv, 'label_en', o.label_en)
              ORDER BY o.display_order, o.option_key)
              FROM public.beskt_item_options o WHERE o.item_id = i.id), '[]'::jsonb),
          'answer', (
            SELECT jsonb_build_object(
                'response_state', an.response_state,
                'value_boolean', to_jsonb(an.value_boolean),
                'value_text', to_jsonb(an.value_text),
                'value_date', to_jsonb(an.value_date),
                'option_keys', to_jsonb(coalesce(an.selected_option_keys, '{}'::text[])))
              FROM public.bcp_answers an
             WHERE an.response_id = _r.id AND an.item_id = i.id))
        ORDER BY vis.sequence_position)
        FROM public.bcp_visible_items(_assignment_id, _r.id) vis
        JOIN public.beskt_items i ON i.id = vis.item_id), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_employer_assignments(_employer_id uuid)
 RETURNS TABLE(assignment_id uuid, application_id uuid, job_id uuid, job_title_sv text, job_title_en text, candidate_user_id uuid, method_name_sv text, method_name_en text, method_version_number integer, content_hash text, lifecycle_state text, assigned_at timestamp with time zone, due_at timestamp with time zone, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_employer_role(auth.uid(), _employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.application_id, a.job_id, j.title_sv, j.title_en, a.candidate_user_id,
           p.name_sv, p.name_en, v.version_number, a.pinned_content_hash,
           a.lifecycle_state, a.assigned_at, a.due_at, a.submitted_at
      FROM public.bcp_assignments a
      JOIN public.jobs j ON j.id = a.job_id
      JOIN public.beskt_method_versions v ON v.id = a.method_version_id
      JOIN public.scp_interview_packs p ON p.id = v.pack_id
     WHERE a.employer_id = _employer_id
     ORDER BY a.assigned_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_case_preparation_basis(_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _l public.bcp_case_links%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _l FROM public.bcp_case_links
   WHERE case_id = _case_id AND unlinked_at IS NULL;
  IF NOT FOUND THEN
    -- Absent, not empty: a case with no linked preparation has none, and
    -- saying so is different from refusing.
    RETURN jsonb_build_object('case_id', _case_id, 'linked', false);
  END IF;

  IF NOT public.has_employer_role(_caller, _l.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'case_id', _case_id,
    'linked', true,
    'link_id', _l.id,
    'assignment_id', _l.assignment_id,
    'application_id', _l.application_id,
    'linked_at', _l.linked_at,
    'bound', jsonb_build_object(
      'response_id', _l.bound_response_id,
      'response_version', _l.bound_response_version,
      'assignment_revision', _l.bound_assignment_revision,
      'method_version_id', _l.bound_method_version_id,
      'content_hash', _l.bound_content_hash,
      'answers_content_hash', _l.bound_answers_content_hash,
      'notice_version', _l.bound_notice_version,
      'notice_content_hash', _l.bound_notice_content_hash,
      'notice_locale', _l.bound_notice_locale),
    -- The candidate's own words, exactly as submitted.
    'answers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'response_state', an.response_state,
          'value_boolean', an.value_boolean,
          'value_text', an.value_text,
          'value_date', an.value_date,
          'selected_option_keys', to_jsonb(coalesce(an.selected_option_keys, ARRAY[]::text[])),
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY s.display_order, i.display_order, an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
        JOIN public.beskt_sections s ON s.id = i.section_id
       WHERE an.response_id = _l.bound_response_id), '[]'::jsonb),
    -- The frozen topics, in their derived order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _l.id), '[]'::jsonb),
    'produces_score', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_linkable_interview_cases(_assignment_id uuid)
 RETURNS TABLE(case_id uuid, title text, status text, created_at timestamp with time zone, already_linked boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.title, c.status, c.created_at,
         EXISTS (SELECT 1 FROM public.bcp_case_links l
                  WHERE l.case_id = c.id AND l.unlinked_at IS NULL)
    FROM public.bcp_assignments a
    JOIN public.scp_interview_cases c
      ON c.employer_id = a.employer_id
     AND c.application_id IS NOT DISTINCT FROM a.application_id
     AND c.candidate_user_id IS NOT DISTINCT FROM a.candidate_user_id
   WHERE a.id = _assignment_id
     AND a.lifecycle_state = 'submitted'
     AND c.status <> 'cancelled'
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(auth.uid(), a.employer_id, ARRAY['owner', 'admin', 'member'])
   ORDER BY c.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_unlink_preparation_from_case(_operation_id uuid, _link_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _l public.bcp_case_links%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _request jsonb;
  _hash text;
  _replay jsonb;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'BCP_REASON_REQUIRED: say why, so the history can be read afterwards.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object(
    'op', 'bcp_unlink_preparation_from_case',
    'link_id', _link_id,
    'reason', _reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NOT_FOUND: no such link.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.has_employer_role(_caller, _l.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _l.unlinked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_ALREADY_UNLINKED: this link is already unlinked.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_l.assignment_id::text, 0));

  UPDATE public.bcp_case_links
     SET unlinked_at = now(), unlinked_by = _caller, unlinked_reason = _reason,
         unlink_operation_id = _operation_id
   WHERE id = _link_id;

  -- The source row on the case is marked erased rather than removed: the case
  -- keeps the fact that material was once attached, which is what an audit of
  -- the interview would need to see.
  UPDATE public.scp_interview_case_sources
     SET retention_state = 'erased', erased_at = now(), content_text = NULL
   WHERE id = _l.source_id AND retention_state <> 'erased';

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _l.assignment_id;

  _result := jsonb_build_object('link_id', _link_id, 'case_id', _l.case_id, 'unlinked', true);

  PERFORM public.bcp_record_event(
    _l.assignment_id, _l.bound_response_id, _l.employer_id, _l.bound_method_version_id,
    'case_unlinked', _a.lifecycle_state, _a.lifecycle_state, _reason,
    _l.bound_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('case_id', _l.case_id, 'link_id', _link_id));

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_link_preparation_to_case(_operation_id uuid, _assignment_id uuid, _case_id uuid, _expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _ack public.bcp_notice_acknowledgements%ROWTYPE;
  _request jsonb;
  _hash text;
  _replay jsonb;
  _source_id uuid;
  _link_id uuid;
  _topics integer := 0;
  _label text;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object(
    'op', 'bcp_link_preparation_to_case',
    'assignment_id', _assignment_id,
    'case_id', _case_id,
    'expected_revision', _expected_revision);
  _hash := public.beskt_request_hash(_request);

  -- Replay BEFORE any write, so a retried request is answered rather than
  -- repeated. The same operation id with a different payload is refused.
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  -- Serialise against the preparation, so two members of the same employer
  -- pressing the button at once produce one link and one refusal rather than
  -- two links or a torn write.
  PERFORM pg_advisory_xact_lock(hashtextextended(_assignment_id::text, 0));

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NOT_FOUND: no such preparation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- AUTHORISATION: an employer action. The candidate is not a party to it.
  IF NOT public.has_employer_role(_caller, _a.employer_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'BCP_NOT_EMPLOYER_MEMBER: you are not a member of this employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.revision <> _expected_revision THEN
    RAISE EXCEPTION 'BCP_STALE_REVISION: the preparation is at revision % but the request expected %. Reload and retry.',
      _a.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;

  IF _a.lifecycle_state = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED: a cancelled preparation cannot be linked.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state <> 'submitted' THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: only a submitted preparation may be linked to a case.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.bcp_responses
   WHERE assignment_id = _assignment_id AND response_state = 'submitted'
   ORDER BY response_version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: this preparation has no submitted response.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _ack FROM public.bcp_notice_acknowledgements
   WHERE assignment_id = _assignment_id
   ORDER BY acknowledged_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED: the preparation carries no acknowledgement.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_NOT_FOUND: no such interview case.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Same employer, same application, same candidate. Tenancy alone is not
  -- enough: it would admit another candidate's case at the same employer.
  IF _c.employer_id <> _a.employer_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case belongs to another employer.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _c.application_id IS DISTINCT FROM _a.application_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case is not about this job application.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.candidate_user_id IS DISTINCT FROM _a.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case is not about this candidate.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.status = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_CASE_CANCELLED: a cancelled case takes no new source.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bcp_case_links
              WHERE assignment_id = _assignment_id AND unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_EXISTS: this preparation is already linked to a case.'
      USING ERRCODE = 'unique_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bcp_case_links
              WHERE case_id = _case_id AND unlinked_at IS NULL) THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_EXISTS: this case already has a linked preparation.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- The source row on the EXISTING case. A pointer, not a copy: the answers
  -- stay in bcp_answers, and the label says what this is in plain words.
  _label := 'BESKT-förberedelse, inskickad ' || to_char(_r.submitted_at, 'YYYY-MM-DD');
  INSERT INTO public.scp_interview_case_sources
    (case_id, source_kind, label, content_text, linked_application_id,
     purpose_code, lawful_basis_note, provided_by, origin)
  VALUES
    (_case_id, 'beskt_preparation', _label, NULL, _a.application_id,
     'recruitment_interview',
     'Kandidatens egen inskickade BESKT-förberedelse för denna ansökan. '
     'Underlaget är kandidatens egna ord; det innehåller ingen poäng, '
     'rangordning eller bedömning.',
     _caller, 'candidate_application')
  RETURNING id INTO _source_id;

  INSERT INTO public.bcp_case_links
    (assignment_id, case_id, employer_id, application_id, candidate_user_id,
     bound_response_id, bound_response_version, bound_assignment_revision,
     bound_method_version_id, bound_content_hash, bound_answers_content_hash,
     bound_notice_version, bound_notice_content_hash, bound_notice_locale,
     source_id, linked_by, link_operation_id)
  VALUES
    (_assignment_id, _case_id, _a.employer_id, _a.application_id, _a.candidate_user_id,
     _r.id, _r.response_version, _a.revision,
     _a.method_version_id, _a.pinned_content_hash, _r.submitted_content_hash,
     _ack.notice_version, _ack.notice_content_hash, _ack.locale,
     _source_id, _caller, _operation_id)
  RETURNING id INTO _link_id;

  -- ── THE DETERMINISTIC DERIVATION ────────────────────────────────────
  --
  -- One row per question the candidate left omitted or asked to take orally,
  -- in the governed content's own order. Nothing is selected, weighted or
  -- prioritised: the set is exactly the submitted answers in those two states,
  -- and the order is the order the questions were asked in.
  INSERT INTO public.bcp_case_topics
    (link_id, derived_from_response_id, item_id, item_key, topic_reason, display_order)
  SELECT _link_id, _r.id, an.item_id, an.item_key, an.response_state,
         row_number() OVER (ORDER BY s.display_order, i.display_order, an.item_key)
    FROM public.bcp_answers an
    JOIN public.beskt_items i ON i.id = an.item_id
    JOIN public.beskt_sections s ON s.id = i.section_id
   WHERE an.response_id = _r.id
     AND an.response_state IN ('omitted', 'discuss_orally');
  GET DIAGNOSTICS _topics = ROW_COUNT;

  _result := jsonb_build_object(
    'link_id', _link_id,
    'case_id', _case_id,
    'source_id', _source_id,
    'topic_count', _topics,
    'bound_response_id', _r.id,
    'bound_response_version', _r.response_version,
    'bound_assignment_revision', _a.revision,
    'bound_content_hash', _a.pinned_content_hash,
    'bound_answers_content_hash', _r.submitted_content_hash,
    'bound_notice_version', _ack.notice_version,
    'bound_notice_content_hash', _ack.notice_content_hash,
    'bound_notice_locale', _ack.locale);

  PERFORM public.bcp_record_event(
    _assignment_id, _r.id, _a.employer_id, _a.method_version_id,
    'case_linked', _a.lifecycle_state, _a.lifecycle_state, NULL,
    _a.pinned_content_hash, _a.revision, _operation_id, _hash, _result,
    jsonb_build_object('case_id', _case_id, 'link_id', _link_id, 'topic_count', _topics));

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_case_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _r public.bcp_responses%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _src public.scp_interview_case_sources%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NO_DELETE: a link is unlinked, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The only permitted change is an unlink, once, and nothing else may move
    -- with it. A link that could be re-pointed would break the binding this
    -- table exists to provide.
    IF OLD.unlinked_at IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_IMMUTABLE: this link is already unlinked.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id
       OR NEW.assignment_id <> OLD.assignment_id
       OR NEW.case_id <> OLD.case_id
       OR NEW.employer_id <> OLD.employer_id
       OR NEW.application_id <> OLD.application_id
       OR NEW.candidate_user_id <> OLD.candidate_user_id
       OR NEW.bound_response_id <> OLD.bound_response_id
       OR NEW.bound_response_version <> OLD.bound_response_version
       OR NEW.bound_assignment_revision <> OLD.bound_assignment_revision
       OR NEW.bound_method_version_id <> OLD.bound_method_version_id
       OR NEW.bound_content_hash <> OLD.bound_content_hash
       OR NEW.bound_answers_content_hash <> OLD.bound_answers_content_hash
       OR NEW.bound_notice_version <> OLD.bound_notice_version
       OR NEW.bound_notice_content_hash <> OLD.bound_notice_content_hash
       OR NEW.bound_notice_locale <> OLD.bound_notice_locale
       OR NEW.source_id <> OLD.source_id
       OR NEW.linked_by <> OLD.linked_by
       OR NEW.linked_at <> OLD.linked_at
       OR NEW.link_operation_id <> OLD.link_operation_id THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_IMMUTABLE: only the unlink columns may change.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.unlinked_at IS NULL THEN
      RAISE EXCEPTION 'BCP_CASE_LINK_UNLINK_ONLY: an update must be an unlink.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT -------------------------------------------------------------
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = NEW.assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NOT_FOUND: no such preparation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ONLY A SUBMITTED SNAPSHOT. Checked here, not only in the RPC, because a
  -- draft reaching an employer's case is the failure this whole domain is
  -- arranged to prevent.
  SELECT * INTO _r FROM public.bcp_responses WHERE id = NEW.bound_response_id;
  IF NOT FOUND OR _r.assignment_id <> NEW.assignment_id THEN
    RAISE EXCEPTION 'BCP_RESPONSE_NOT_IN_ASSIGNMENT: the bound response is not this preparation''s.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _r.response_state <> 'submitted' OR _r.submitted_at IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: only a submitted preparation may be linked to a case.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.lifecycle_state <> 'submitted' THEN
    RAISE EXCEPTION 'BCP_NOT_SUBMITTED: the preparation is in state %, not submitted.', _a.lifecycle_state
      USING ERRCODE = 'check_violation';
  END IF;

  -- The bound identity must be the snapshot's own, not a caller's assertion.
  IF NEW.bound_response_version <> _r.response_version
     OR NEW.bound_assignment_revision <> _a.revision
     OR NEW.bound_method_version_id <> _a.method_version_id
     OR NEW.bound_content_hash <> _a.pinned_content_hash
     OR NEW.bound_answers_content_hash <> _r.submitted_content_hash
     OR NEW.bound_notice_version <> _a.notice_version
     OR NEW.application_id <> _a.application_id
     OR NEW.employer_id <> _a.employer_id
     OR NEW.candidate_user_id <> _a.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_BOUND_SNAPSHOT_MISMATCH: the bound identity is not the preparation''s own.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The acknowledged notice, in the locale it was acknowledged in.
  IF NOT EXISTS (
    SELECT 1 FROM public.bcp_notice_acknowledgements ack
     WHERE ack.assignment_id = NEW.assignment_id
       AND ack.notice_version = NEW.bound_notice_version
       AND ack.notice_content_hash = NEW.bound_notice_content_hash
       AND ack.locale = NEW.bound_notice_locale) THEN
    RAISE EXCEPTION 'BCP_NOTICE_BINDING_UNKNOWN: no acknowledgement matches the bound notice.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── SAME EMPLOYER, SAME APPLICATION, SAME CANDIDATE ──────────────────
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = NEW.case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_NOT_FOUND: no such interview case.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.employer_id <> NEW.employer_id
     OR _c.application_id IS DISTINCT FROM NEW.application_id
     OR _c.candidate_user_id IS DISTINCT FROM NEW.candidate_user_id THEN
    RAISE EXCEPTION 'BCP_CASE_MISMATCH: the case and the preparation are not about the same application and candidate.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _c.status = 'cancelled' THEN
    RAISE EXCEPTION 'BCP_CASE_CANCELLED: a cancelled case takes no new source.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The source row must be this case's, and must be the governed kind.
  SELECT * INTO _src FROM public.scp_interview_case_sources WHERE id = NEW.source_id;
  IF NOT FOUND OR _src.case_id <> NEW.case_id OR _src.source_kind <> 'beskt_preparation' THEN
    RAISE EXCEPTION 'BCP_SOURCE_MISMATCH: the source row is not a beskt_preparation source of this case.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_case_topic()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _l public.bcp_case_links%ROWTYPE;
  _state text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'BCP_CASE_TOPIC_APPEND_ONLY: a derived topic is never updated or deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _l FROM public.bcp_case_links WHERE id = NEW.link_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CASE_LINK_NOT_FOUND: no such link.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.derived_from_response_id <> _l.bound_response_id THEN
    RAISE EXCEPTION 'BCP_TOPIC_NOT_FROM_BOUND_SNAPSHOT: a topic must come from the link''s own bound response.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- THE DERIVATION IS NOT THE CALLER'S TO ASSERT. The reason recorded has to
  -- be the reason the candidate actually gave, read from the submitted answer
  -- itself. Without this, a caller could write 'omitted' against a question
  -- the candidate answered in full.
  SELECT an.response_state INTO _state
    FROM public.bcp_answers an
   WHERE an.response_id = _l.bound_response_id
     AND an.item_id = NEW.item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_TOPIC_ITEM_NOT_ANSWERED: the item is not in the bound snapshot.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _state <> NEW.topic_reason THEN
    RAISE EXCEPTION 'BCP_TOPIC_REASON_MISMATCH: the snapshot records % for this item, not %.',
      _state, NEW.topic_reason USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _permitted text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_ASSIGNMENT_NO_DELETE: a preparation assignment is cancelled, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- What was assigned can never change. A different method version, a
    -- different profile, a different hash or a different party is a
    -- different assignment.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.candidate_user_id IS DISTINCT FROM OLD.candidate_user_id
       OR NEW.method_version_id IS DISTINCT FROM OLD.method_version_id
       OR NEW.exposure_profile_id IS DISTINCT FROM OLD.exposure_profile_id
       OR NEW.mode IS DISTINCT FROM OLD.mode
       OR NEW.pinned_content_hash IS DISTINCT FROM OLD.pinned_content_hash
       OR NEW.pinned_content_hash_algorithm IS DISTINCT FROM OLD.pinned_content_hash_algorithm
       OR NEW.pinned_release_scope IS DISTINCT FROM OLD.pinned_release_scope
       OR NEW.notice_version IS DISTINCT FROM OLD.notice_version
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR NEW.available_from IS DISTINCT FROM OLD.available_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: what was assigned cannot be changed; cancel and assign again.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- A submitted preparation is finished. It is not reopened, not
    -- re-answered and not silently rewound.
    IF OLD.lifecycle_state = 'submitted' AND NEW.lifecycle_state <> 'submitted' THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_SUBMITTED_IMMUTABLE: a submitted preparation cannot return to an earlier state.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.lifecycle_state = 'cancelled' AND NEW.lifecycle_state <> 'cancelled' THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_CANCELLED_IMMUTABLE: a cancelled preparation cannot be revived.'
        USING ERRCODE = 'check_violation';
    END IF;

    _permitted := CASE OLD.lifecycle_state
      WHEN 'assigned'            THEN ARRAY['assigned', 'notice_acknowledged', 'cancelled']
      WHEN 'notice_acknowledged' THEN ARRAY['notice_acknowledged', 'in_progress', 'submitted', 'cancelled']
      WHEN 'in_progress'         THEN ARRAY['in_progress', 'submitted', 'cancelled']
      WHEN 'submitted'           THEN ARRAY['submitted']
      WHEN 'cancelled'           THEN ARRAY['cancelled']
      ELSE ARRAY[]::text[] END;
    IF NOT (NEW.lifecycle_state = ANY (_permitted)) THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_TRANSITION: "%" -> "%" is not a permitted transition.',
        OLD.lifecycle_state, NEW.lifecycle_state USING ERRCODE = 'check_violation';
    END IF;

    -- Timestamps are recorded once.
    IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the acknowledgement time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the submission time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.first_opened_at IS NOT NULL AND NEW.first_opened_at IS DISTINCT FROM OLD.first_opened_at THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_IMMUTABLE: the first-opened time is recorded once.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revision < OLD.revision THEN
      RAISE EXCEPTION 'BCP_ASSIGNMENT_REVISION: the revision never moves backwards.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _prev public.bcp_conduct_entries%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NO_DELETE: a recorded entry is superseded, never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- The ONLY permitted update is stepping out of the live slot when a
    -- correction supersedes this row. Everything the entry says is frozen.
    IF OLD.superseded_by_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_FROZEN: this entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id
       OR NEW.position_id <> OLD.position_id
       OR NEW.session_id <> OLD.session_id
       OR NEW.item_id <> OLD.item_id
       OR NEW.item_key <> OLD.item_key
       OR NEW.topic_id IS DISTINCT FROM OLD.topic_id
       OR NEW.topic_basis <> OLD.topic_basis
       OR NEW.observable_fact IS DISTINCT FROM OLD.observable_fact
       OR NEW.candidate_explanation IS DISTINCT FROM OLD.candidate_explanation
       OR NEW.interviewer_interpretation IS DISTINCT FROM OLD.interviewer_interpretation
       OR NEW.alternative_explanation IS DISTINCT FROM OLD.alternative_explanation
       OR NEW.protective_factor IS DISTINCT FROM OLD.protective_factor
       OR NEW.verification_need IS DISTINCT FROM OLD.verification_need
       OR NEW.sensitivity_class <> OLD.sensitivity_class
       OR NEW.recorded_by <> OLD.recorded_by
       OR NEW.recorded_at <> OLD.recorded_at
       OR NEW.entry_version <> OLD.entry_version
       OR NEW.supersedes_entry_id IS DISTINCT FROM OLD.supersedes_entry_id
       OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_ENTRY_EDITED_IN_PLACE: correct an entry by superseding it, so what was '
        'first recorded survives. An entry that could be edited would leave no trace that it changed.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- EXACTLY TWO SHAPES OF UPDATE ARE PERMITTED, and nothing else reaches here.
    --
    -- One: a supersede, which vacates the live slot and changes nothing the
    -- entry says.
    --
    -- Two: the verification state and its source moving forward. That is the
    -- only thing on an entry that is genuinely current rather than historical,
    -- and it is permitted ONLY when the append-only history already records
    -- the move. A direct write with no history row behind it is refused, so
    -- the state on the entry can never disagree with the history that explains
    -- it.
    IF NEW.verification_state IS DISTINCT FROM OLD.verification_state
       OR NEW.verification_source IS DISTINCT FROM OLD.verification_source THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.bcp_conduct_verifications v
         WHERE v.entry_id = NEW.id
           AND v.new_state = NEW.verification_state
           AND v.seq = (SELECT max(seq) FROM public.bcp_conduct_verifications
                         WHERE entry_id = NEW.id)) THEN
        RAISE EXCEPTION
          'BCP_CONDUCT_VERIFICATION_UNRECORDED: a verification state moves only with a history row '
          'behind it, so what the entry says and what the history explains can never disagree.'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.superseded_by_entry_id IS NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOOP_UPDATE: the only permitted update is a supersede.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- ---- INSERT -------------------------------------------------------------
  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = NEW.position_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.session_id <> NEW.session_id THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_MISMATCH: the position is not in this session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOTHING IS RECORDED INTO A LOCKED POSITION. Not by the RPC, not by the
  -- owner, not by a direct write.
  IF _p.state = 'locked' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The entry belongs to the person whose position it is.
  IF NEW.recorded_by <> _p.assessor_id THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_OWN: an entry is recorded by the assessor whose position it is.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = NEW.session_id;
  IF _s.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_CONCLUDED: this conduct session is concluded.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── THE GOVERNED BASIS IS NOT THE CALLER'S TO INVENT ────────────────
  --
  -- The item must belong to the method version the session is bound to, and
  -- the item_key must be that item's own. An interview subject with no
  -- governed question behind it has no basis to be asked about.
  IF NOT EXISTS (SELECT 1 FROM public.beskt_items i
                  WHERE i.id = NEW.item_id
                    AND i.method_version_id = _s.bound_method_version_id
                    AND i.item_key = NEW.item_key) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ITEM_NOT_IN_VERSION: "%" is not an item of the method version this session is bound to.',
      NEW.item_key USING ERRCODE = 'check_violation';
  END IF;

  -- A derived topic must be one of THIS link's topics, and must name the same
  -- item. A topic borrowed from another case would carry another candidate.
  IF NEW.topic_basis = 'derived_neutral_topic' THEN
    IF NEW.topic_id IS NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_TOPIC_REQUIRED: a derived-topic entry names the topic it came from.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bcp_case_topics t
                    WHERE t.id = NEW.topic_id
                      AND t.link_id = _s.link_id
                      AND t.item_id = NEW.item_id) THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_TOPIC_NOT_IN_LINK: the topic is not one of this link''s derived topics for that item.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.topic_id IS NOT NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_TOPIC_UNEXPECTED: an entry on a governed method item does not also claim a derived topic.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A correction continues its own chain, on the same position and item.
  IF NEW.supersedes_entry_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.bcp_conduct_entries WHERE id = NEW.supersedes_entry_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_CONDUCT_SUPERSEDES_UNKNOWN: no such entry to correct.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _prev.position_id <> NEW.position_id OR _prev.item_id <> NEW.item_id THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_CORRECTION_CROSSES: a correction stays on the same position and the same item.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- The predecessor must not already be spoken for BY SOMEONE ELSE. It may
    -- well already name THIS row: the governed path vacates the live slot
    -- before the successor is inserted, which is the only way both can respect
    -- the one-live-entry index.
    IF _prev.superseded_by_entry_id IS NOT NULL
       AND _prev.superseded_by_entry_id <> NEW.id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_CORRECTED: that entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.entry_version <> _prev.entry_version + 1 THEN
      RAISE EXCEPTION 'BCP_CONDUCT_VERSION_SKIPPED: a correction is exactly one version on.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_save_entry(_operation_id uuid, _position_id uuid, _expected_revision integer, _entry jsonb, _corrects_entry_id uuid DEFAULT NULL::uuid, _correction_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _p public.bcp_conduct_positions%ROWTYPE;
  _s public.bcp_conduct_sessions%ROWTYPE;
  _prev public.bcp_conduct_entries%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _item_id uuid; _item_key text; _topic_id uuid; _basis text;
  _new_id uuid; _version integer := 1; _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _entry IS NULL OR jsonb_typeof(_entry) <> 'object' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_STRUCTURED: an entry is a JSON object of named fields.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_save_entry',
    'position_id', _position_id, 'expected_revision', _expected_revision,
    'entry', _entry, 'corrects_entry_id', _corrects_entry_id,
    'correction_reason', _correction_reason);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_position_id::text, 0));

  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _position_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_NOT_FOUND: no such position.' USING ERRCODE = 'check_violation';
  END IF;

  -- YOUR OWN POSITION ONLY. Recording into someone else's is exactly the
  -- contamination the independence rule exists to prevent.
  IF _p.assessor_id <> _caller THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: you may only record in your own position.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _p.session_id;
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _expected_revision IS NULL THEN
    RAISE EXCEPTION 'BCP_REVISION_REQUIRED: name the revision you were looking at.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _p.revision <> _expected_revision THEN
    RAISE EXCEPTION
      'BCP_STALE_REVISION: the position is at revision % but the request expected %. Reload and retry.',
      _p.revision, _expected_revision USING ERRCODE = 'check_violation';
  END IF;
  IF _p.state <> 'open' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_POSITION_LOCKED: this position is locked; reopen it deliberately first.'
      USING ERRCODE = 'check_violation';
  END IF;

  _item_key := _entry ->> 'item_key';
  _topic_id := (_entry ->> 'topic_id')::uuid;
  IF _item_key IS NULL THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ITEM_REQUIRED: an entry names the governed item it is about.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.id INTO _item_id FROM public.beskt_items i
   WHERE i.method_version_id = _s.bound_method_version_id AND i.item_key = _item_key;
  IF _item_id IS NULL THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_ITEM_NOT_IN_VERSION: "%" is not an item of the method version this session is bound to.',
      _item_key USING ERRCODE = 'check_violation';
  END IF;
  _basis := CASE WHEN _topic_id IS NULL THEN 'governed_method_item' ELSE 'derived_neutral_topic' END;

  -- ---- a correction continues the chain -----------------------------------
  IF _corrects_entry_id IS NOT NULL THEN
    SELECT * INTO _prev FROM public.bcp_conduct_entries
     WHERE id = _corrects_entry_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BCP_CONDUCT_SUPERSEDES_UNKNOWN: no such entry to correct.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _prev.position_id <> _position_id THEN
      RAISE EXCEPTION 'BCP_CONDUCT_NOT_OWN_POSITION: that entry is not in your position.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF _prev.superseded_by_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'BCP_CONDUCT_ALREADY_CORRECTED: that entry has already been superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF length(btrim(coalesce(_correction_reason, ''))) < 3 THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_CORRECTION_REASON_REQUIRED: say why the record changed, so the history can be read.'
        USING ERRCODE = 'check_violation';
    END IF;
    _version := _prev.entry_version + 1;
    _item_id := _prev.item_id;
    _item_key := _prev.item_key;
    _topic_id := _prev.topic_id;
    _basis := _prev.topic_basis;
  END IF;

  -- Vacate the live slot FIRST. The successor's id is generated here so the
  -- old row can name it before it exists; the deferred foreign key above is
  -- what makes that legal, and it is still checked at commit.
  _new_id := gen_random_uuid();
  IF _corrects_entry_id IS NOT NULL THEN
    UPDATE public.bcp_conduct_entries
       SET superseded_by_entry_id = _new_id
     WHERE id = _corrects_entry_id;
  END IF;

  INSERT INTO public.bcp_conduct_entries
    (id, position_id, session_id, topic_id, item_id, item_key, topic_basis,
     observable_fact, candidate_explanation, interviewer_interpretation,
     alternative_explanation, protective_factor,
     verification_need, verification_state, verification_source,
     sensitivity_class, recorded_by, save_operation_id,
     entry_version, supersedes_entry_id, correction_reason)
  VALUES
    (_new_id, _position_id, _p.session_id, _topic_id, _item_id, _item_key, _basis,
     nullif(btrim(coalesce(_entry ->> 'observable_fact', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'candidate_explanation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'interviewer_interpretation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'alternative_explanation', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'protective_factor', '')), ''),
     nullif(btrim(coalesce(_entry ->> 'verification_need', '')), ''),
     coalesce(_entry ->> 'verification_state', 'not_required'),
     nullif(btrim(coalesce(_entry ->> 'verification_source', '')), ''),
     coalesce(_entry ->> 'sensitivity_class', 'ordinary'),
     _caller, _operation_id,
     _version, _corrects_entry_id, nullif(btrim(coalesce(_correction_reason, '')), ''));

  UPDATE public.bcp_conduct_positions SET revision = revision + 1 WHERE id = _position_id;

  _result := jsonb_build_object(
    'entry_id', _new_id, 'position_id', _position_id, 'session_id', _p.session_id,
    'item_key', _item_key, 'entry_version', _version,
    'supersedes_entry_id', _corrects_entry_id,
    'position_revision', _p.revision + 1);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    CASE WHEN _corrects_entry_id IS NULL THEN 'conduct_entry_saved' ELSE 'conduct_entry_corrected' END,
    NULL, NULL, nullif(btrim(coalesce(_correction_reason, '')), ''),
    _s.bound_content_hash, _p.revision + 1, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _p.session_id, 'entry_id', _new_id, 'item_key', _item_key));

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_workspace(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _me public.bcp_conduct_positions%ROWTYPE;
  _reveal boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _me FROM public.bcp_conduct_positions
   WHERE session_id = _session_id AND assessor_id = _caller;
  _reveal := public.bcp_conduct_may_see_others(_session_id);

  RETURN jsonb_build_object(
    'session_id', _s.id,
    'case_id', _s.case_id,
    'link_id', _s.link_id,
    'state', _s.state,
    'session_revision', _s.revision,
    -- THE BOUND SNAPSHOT STAYS VISIBLE AND BOUND throughout the interview.
    'bound', jsonb_build_object(
      'response_id', _s.bound_response_id,
      'response_version', _s.bound_response_version,
      'method_version_id', _s.bound_method_version_id,
      'content_hash', _s.bound_content_hash,
      'answers_content_hash', _s.bound_answers_content_hash),
    -- PR 4's deterministic themes, in their derived order, with the
    -- candidate's own state carried through NEUTRALLY and nothing added.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id), '[]'::jsonb),
    'my_position', CASE WHEN _me.id IS NULL THEN NULL ELSE jsonb_build_object(
      'position_id', _me.id, 'state', _me.state, 'position_role', _me.position_role,
      'revision', _me.revision, 'locked_at', _me.locked_at,
      'reopen_count', _me.reopen_count) END,
    'my_entries', CASE WHEN _me.id IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'entry_id', e.id, 'item_key', e.item_key, 'topic_id', e.topic_id,
          'entry_version', e.entry_version,
          'observable_fact', e.observable_fact,
          'candidate_explanation', e.candidate_explanation,
          'interviewer_interpretation', e.interviewer_interpretation,
          'alternative_explanation', e.alternative_explanation,
          'protective_factor', e.protective_factor,
          'verification_need', e.verification_need,
          'verification_state', e.verification_state,
          'verification_source', e.verification_source,
          'sensitivity_class', e.sensitivity_class,
          'recorded_at', e.recorded_at)
        ORDER BY e.item_key)
        FROM public.bcp_conduct_entries e
       WHERE e.position_id = _me.id AND e.superseded_by_entry_id IS NULL), '[]'::jsonb) END,
    -- Other people's positions: withheld until the reader has locked theirs.
    -- Absent is not empty, so the client can say WHY rather than show nothing.
    'others_visible', _reveal,
    'others', CASE WHEN NOT _reveal THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'position_id', p.id, 'assessor_id', p.assessor_id,
          'position_role', p.position_role, 'state', p.state, 'locked_at', p.locked_at,
          'entries', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'entry_id', e.id, 'item_key', e.item_key,
                'observable_fact', e.observable_fact,
                'candidate_explanation', e.candidate_explanation,
                'interviewer_interpretation', e.interviewer_interpretation,
                'alternative_explanation', e.alternative_explanation,
                'protective_factor', e.protective_factor,
                'verification_state', e.verification_state)
              ORDER BY e.item_key)
              FROM public.bcp_conduct_entries e
             WHERE e.position_id = p.id AND e.superseded_by_entry_id IS NULL), '[]'::jsonb))
        ORDER BY p.created_at)
        FROM public.bcp_conduct_positions p
       WHERE p.session_id = _session_id AND p.assessor_id <> _caller), '[]'::jsonb) END,
    'panel', (
      SELECT jsonb_build_object('panel_id', pn.id, 'state', pn.state,
               'revision', pn.revision, 'revealed_at', pn.revealed_at,
               'resolutions', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                     'resolution_id', r.id, 'item_key', r.item_key,
                     'resolution_kind', r.resolution_kind,
                     'agreed_statement', r.agreed_statement,
                     'divergent_statement', r.divergent_statement,
                     'rationale', r.rationale, 'recorded_at', r.recorded_at)
                   ORDER BY r.recorded_at)
                   FROM public.bcp_conduct_panel_resolutions r
                  WHERE r.panel_id = pn.id), '[]'::jsonb))
        FROM public.bcp_conduct_panels pn WHERE pn.session_id = _session_id),
    -- Said in the payload itself, so a client cannot render a total by mistake.
    'produces_score', false,
    'produces_ranking', false,
    'produces_recommendation', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_entry_history(_entry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _e public.bcp_conduct_entries%ROWTYPE;
  _p public.bcp_conduct_positions%ROWTYPE;
  _root uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _e FROM public.bcp_conduct_entries WHERE id = _entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_ENTRY_NOT_FOUND: no such entry.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _p FROM public.bcp_conduct_positions WHERE id = _e.position_id;

  IF _p.assessor_id <> auth.uid()
     AND NOT public.bcp_conduct_may_see_others(_e.session_id) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_NOT_VISIBLE_YET: lock your own position before reading another assessor''s record.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.scp_iv_can_read_case((SELECT case_id FROM public.bcp_conduct_sessions
                                       WHERE id = _e.session_id)) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'entry_id', _entry_id,
    'item_key', _e.item_key,
    'versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'entry_id', h.id, 'entry_version', h.entry_version,
          'observable_fact', h.observable_fact,
          'candidate_explanation', h.candidate_explanation,
          'interviewer_interpretation', h.interviewer_interpretation,
          'alternative_explanation', h.alternative_explanation,
          'protective_factor', h.protective_factor,
          'verification_need', h.verification_need,
          'verification_state', h.verification_state,
          'verification_source', h.verification_source,
          'sensitivity_class', h.sensitivity_class,
          'correction_reason', h.correction_reason,
          'supersedes_entry_id', h.supersedes_entry_id,
          'superseded_by_entry_id', h.superseded_by_entry_id,
          'recorded_by', h.recorded_by, 'recorded_at', h.recorded_at)
        ORDER BY h.entry_version)
        FROM public.bcp_conduct_entries h
       WHERE h.position_id = _e.position_id AND h.item_id = _e.item_id), '[]'::jsonb),
    'verifications', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'seq', v.seq, 'previous_state', v.previous_state, 'new_state', v.new_state,
          'source', v.source, 'note', v.note,
          'recorded_by', v.recorded_by, 'recorded_at', v.recorded_at)
        ORDER BY v.seq)
        FROM public.bcp_conduct_verifications v
        JOIN public.bcp_conduct_entries h ON h.id = v.entry_id
       WHERE h.position_id = _e.position_id AND h.item_id = _e.item_id), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_build_report_basis(_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.bcp_conduct_sessions%ROWTYPE;
  _l public.bcp_case_links%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _l FROM public.bcp_case_links WHERE id = _s.link_id;
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _s.case_id;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;

  RETURN jsonb_build_object(
    -- ---- what this document is about ------------------------------------
    'case', jsonb_build_object(
      'case_id', _c.id,
      'employer_id', _c.employer_id,
      'application_id', _c.application_id,
      'candidate_user_id', _c.candidate_user_id,
      'candidate_display_name', _c.candidate_display_name,
      'job_id', _c.job_id,
      'title', _c.title),

    'session', jsonb_build_object(
      'session_id', _s.id,
      'link_id', _s.link_id,
      'assignment_id', _s.assignment_id,
      'opened_at', _s.opened_at,
      'state', _s.state),

    -- ---- what it rests on, exactly --------------------------------------
    'bound', jsonb_build_object(
      'method_version_id', _v.id,
      'pack_slug', _p.slug,
      'method_name_sv', _p.name_sv,
      'method_name_en', _p.name_en,
      'version_number', _v.version_number,
      'mode', _v.mode,
      'validation_label', _v.validation_label,
      'release_scope', _v.release_scope,
      'content_hash', _s.bound_content_hash,
      'answers_content_hash', _s.bound_answers_content_hash,
      'response_id', _s.bound_response_id,
      'response_version', _s.bound_response_version,
      'notice_version', _l.bound_notice_version,
      'notice_content_hash', _l.bound_notice_content_hash,
      'linked_at', _l.linked_at),

    -- ---- the candidate's own frozen words --------------------------------
    'candidate_preparation', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'response_state', an.response_state,
          'value_boolean', an.value_boolean,
          'value_text', an.value_text,
          'value_date', an.value_date,
          'selected_option_keys', to_jsonb(coalesce(an.selected_option_keys, ARRAY[]::text[])),
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
       WHERE an.response_id = _s.bound_response_id), '[]'::jsonb),

    -- ---- the themes the interview had to cover ---------------------------
    'themes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id), '[]'::jsonb),

    -- ---- every independent position, whole, and never averaged -----------
    'positions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'position_id', pos.id,
          'assessor_id', pos.assessor_id,
          'position_role', pos.position_role,
          'state', pos.state,
          'locked_at', pos.locked_at,
          'reopen_count', pos.reopen_count,

          'entries', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'entry_id', e.id,
                'item_key', e.item_key,
                'entry_version', e.entry_version,
                'observable_fact', e.observable_fact,
                'candidate_explanation', e.candidate_explanation,
                'interviewer_interpretation', e.interviewer_interpretation,
                'alternative_explanation', e.alternative_explanation,
                'protective_factor', e.protective_factor,
                'verification_need', e.verification_need,
                'verification_state', e.verification_state,
                'verification_source', e.verification_source,
                'sensitivity_class', e.sensitivity_class,
                'recorded_by', e.recorded_by,
                'recorded_at', e.recorded_at,

                -- The whole chain, not only the live version: a record whose
                -- corrections were dropped would read as if it had always
                -- said what it says now.
                'corrections', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'entry_id', h.id,
                      'entry_version', h.entry_version,
                      'correction_reason', h.correction_reason,
                      'superseded_by_entry_id', h.superseded_by_entry_id,
                      'observable_fact', h.observable_fact,
                      'candidate_explanation', h.candidate_explanation,
                      'interviewer_interpretation', h.interviewer_interpretation,
                      'alternative_explanation', h.alternative_explanation,
                      'protective_factor', h.protective_factor,
                      'recorded_by', h.recorded_by,
                      'recorded_at', h.recorded_at)
                    ORDER BY h.entry_version)
                    FROM public.bcp_conduct_entries h
                   WHERE h.position_id = pos.id
                     AND h.item_key = e.item_key
                     AND h.id <> e.id), '[]'::jsonb),

                'verifications', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'seq', vr.seq,
                      'previous_state', vr.previous_state,
                      'new_state', vr.new_state,
                      'source', vr.source,
                      'note', vr.note,
                      'recorded_by', vr.recorded_by,
                      'recorded_at', vr.recorded_at)
                    ORDER BY vr.seq)
                    FROM public.bcp_conduct_verifications vr
                   WHERE vr.entry_id = e.id), '[]'::jsonb))
              ORDER BY e.item_key)
              FROM public.bcp_conduct_entries e
             WHERE e.position_id = pos.id
               AND e.superseded_by_entry_id IS NULL), '[]'::jsonb),

          -- What this assessor did NOT document, said as a gap rather than
          -- left to be noticed. A gap is the opposite of a score: it reports
          -- what is not known instead of compressing what is.
          'information_gaps', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', t.item_key,
                'gap', 'not_documented')
              ORDER BY t.display_order)
              FROM public.bcp_case_topics t
             WHERE t.link_id = _s.link_id
               AND NOT EXISTS (
                 SELECT 1 FROM public.bcp_conduct_entries e2
                  WHERE e2.position_id = pos.id
                    AND e2.item_key = t.item_key
                    AND e2.superseded_by_entry_id IS NULL)), '[]'::jsonb))
        ORDER BY pos.created_at)
        FROM public.bcp_conduct_positions pos
       WHERE pos.session_id = _session_id), '[]'::jsonb),

    -- ---- the panel, including what it did not resolve --------------------
    'panel', (
      SELECT jsonb_build_object(
          'panel_id', pn.id,
          'state', pn.state,
          'revealed_at', pn.revealed_at,
          'resolutions', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', r.item_key,
                'resolution_kind', r.resolution_kind,
                'agreed_statement', r.agreed_statement,
                'divergent_statement', r.divergent_statement,
                'rationale', r.rationale,
                'recorded_by', r.recorded_by,
                'recorded_at', r.recorded_at)
              ORDER BY r.item_key, r.recorded_at)
              FROM public.bcp_conduct_panel_resolutions r
             WHERE r.panel_id = pn.id), '[]'::jsonb))
        FROM public.bcp_conduct_panels pn WHERE pn.session_id = _session_id),

    -- ---- the governed ledger for this assignment -------------------------
    'audit_events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'event', ev.event,
          'recorded_at', ev.recorded_at,
          'actor_id', ev.actor_id,
          'reason', ev.reason)
        ORDER BY ev.recorded_at, ev.id)
        FROM public.bcp_events ev
       WHERE ev.assignment_id = _s.assignment_id), '[]'::jsonb),

    -- ---- said by the document itself -------------------------------------
    'produces_score', false,
    'produces_ranking', false,
    'produces_recommendation', false,
    'interpretation', 'none');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_conduct_report_blockers(_session_id uuid)
 RETURNS TABLE(code text, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _s public.bcp_conduct_sessions%ROWTYPE;
  _positions integer;
  _unlocked integer;
  _entries integer;
  _panel public.bcp_conduct_panels%ROWTYPE;
  _undocumented integer;
BEGIN
  -- THE SECOND FIX. This function had no authorisation of ANY kind: not
  -- authentication, not the case authority. It is SECURITY DEFINER and
  -- granted to `authenticated`, so any signed-in user holding a session id
  -- learned how many assessors a stranger's interview has, how many are
  -- still open, whether anything is documented, whether a panel exists and
  -- has revealed, and how many themes two assessors disagree about.
  --
  -- That is metadata about somebody else's interview and about a named
  -- candidate's process, and none of it was ever meant to be readable
  -- outside the case.
  --
  -- It stays reachable on its own for a caller who MAY read the case: a
  -- screen that wants to say what is still missing without rendering the
  -- document calls exactly this, and the preview is no longer a substitute
  -- for it now that the preview waits for the independence rule.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    code := 'BCP_CONDUCT_SESSION_NOT_FOUND';
    message := 'No such conduct session.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE state <> 'locked')
    INTO _positions, _unlocked
    FROM public.bcp_conduct_positions WHERE session_id = _session_id;

  IF _positions = 0 THEN
    code := 'BCP_CONDUCT_NO_POSITION';
    message := 'Nobody holds a position in this conversation yet.';
    RETURN NEXT;
  END IF;

  IF _unlocked > 0 THEN
    code := 'BCP_CONDUCT_POSITION_OPEN';
    message := format('%s position(s) are still open. Every participant locks their own before the report is written.', _unlocked);
    RETURN NEXT;
  END IF;

  SELECT count(*) INTO _entries
    FROM public.bcp_conduct_entries e
    JOIN public.bcp_conduct_positions p ON p.id = e.position_id
   WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL;

  IF _entries = 0 THEN
    code := 'BCP_CONDUCT_NOTHING_DOCUMENTED';
    message := 'No documentation has been recorded, so there is nothing to report.';
    RETURN NEXT;
  END IF;

  -- A panel is required only where there is more than one position: a single
  -- assessor has nobody to disagree with, and demanding a panel would be
  -- demanding a ceremony rather than a safeguard.
  IF _positions > 1 THEN
    SELECT * INTO _panel FROM public.bcp_conduct_panels WHERE session_id = _session_id;
    IF _panel.id IS NULL THEN
      code := 'BCP_CONDUCT_PANEL_REQUIRED';
      message := 'More than one position was taken, so the panel has to meet before the report is written.';
      RETURN NEXT;
    ELSIF _panel.state = 'open' THEN
      code := 'BCP_CONDUCT_PANEL_NOT_REVEALED';
      message := 'The panel has not revealed the locked positions yet.';
      RETURN NEXT;
    ELSE
      -- Every theme both assessors documented differently needs the panel to
      -- have said SOMETHING about it -- agreement or a recorded difference.
      SELECT count(*) INTO _undocumented
        FROM (SELECT DISTINCT e.item_key
                FROM public.bcp_conduct_entries e
                JOIN public.bcp_conduct_positions p ON p.id = e.position_id
               WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL
               GROUP BY e.item_key
              HAVING count(DISTINCT e.position_id) > 1) shared
       WHERE NOT EXISTS (
         SELECT 1 FROM public.bcp_conduct_panel_resolutions r
          WHERE r.session_id = _session_id AND r.item_key = shared.item_key);
      IF _undocumented > 0 THEN
        code := 'BCP_CONDUCT_RESOLUTION_MISSING';
        message := format('%s theme(s) documented by more than one assessor have no recorded panel outcome.', _undocumented);
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  RETURN;
END;
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
  -- 20261129090000: unless it is the exact content an internal test
  -- activation of the assignment's employer covered -- the same rule as the
  -- party read, so a started test keeps its wordings after a revocation.
  IF _v.id IS NULL
     OR (_v.content_status <> 'published'
         AND NOT public.bcp_internal_test_activation_covers(_a.employer_id, _v.id,
                                                             _a.pinned_content_hash))
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

CREATE OR REPLACE FUNCTION public.bcp_notice_copy_digest(_notice_version text, _locale text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _notice_version = 'beskt-prep-notice-1' AND _locale = 'sv-SE'
      THEN 'dd2abc9db2c26293d6ac577f860e4fcd2795ef7f62ac2bb142c8ccf7100cc4fa'
    WHEN _notice_version = 'beskt-prep-notice-1' AND _locale = 'en-GB'
      THEN '37abcf8f2ef3629adda4a9eee6b5e7b4745edb2599f571375aa6ca7443da40c9'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_notice_descriptor(_assignment_id uuid, _locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _a public.bcp_assignments%ROWTYPE;
  _p public.beskt_exposure_profiles%ROWTYPE;
  _digest text;
BEGIN
  IF NOT (public.bcp_is_assignment_candidate(_assignment_id)
          OR public.bcp_employer_can_read_assignment(_assignment_id)) THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHORISED: you are not party to this preparation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _locale IS NULL OR NOT (_locale = ANY (public.bcp_notice_locales())) THEN
    RAISE EXCEPTION 'BCP_NOTICE_LOCALE_UNSUPPORTED: the candidate notice exists in % only.',
      array_to_string(public.bcp_notice_locales(), ', ')
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _assignment_id;
  SELECT * INTO _p FROM public.beskt_exposure_profiles WHERE id = _a.exposure_profile_id;

  -- The governed digest of the copy this locale actually renders. A locale
  -- this notice version does not govern has none, and is refused here rather
  -- than hashed to something meaningless.
  _digest := public.bcp_notice_copy_digest(_a.notice_version, _locale);
  IF _digest IS NULL THEN
    RAISE EXCEPTION 'BCP_NOTICE_COPY_UNGOVERNED: no governed notice copy exists for "%" in %.',
      _a.notice_version, _locale
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'notice_version', _a.notice_version,
    'sections', to_jsonb(public.bcp_notice_sections()),
    -- Locale and the governed digest of the WORDS, not just the matters.
    -- These are what make the Swedish and English hashes differ, and what
    -- make a reworded notice a different notice.
    'locale', _locale,
    'notice_copy_digest', _digest,
    -- The template's SHAPE, not only its content. Dropping a field from
    -- bcp_notice_copy_keys() -- the not-consent hint, say -- changes the
    -- notice hash even though the digest constant is a literal, so a
    -- narrowed template cannot inherit an old acknowledgement either.
    'notice_copy_keys', to_jsonb(public.bcp_notice_copy_keys()),
    -- The governed references the candidate is entitled to. NOT consent:
    -- the lawful basis is the employer's and is stated on the profile.
    'retention_class', _p.retention_class,
    'lawful_basis_reference', _p.lawful_basis_reference,
    'jurisdiction_reference', _p.jurisdiction_reference,
    -- Who can read a submitted preparation, as data rather than as prose.
    'recipients', jsonb_build_array('employer_members_of_this_employer'),
    'decision_maker', 'accountable_employer_human',
    'produces_score', false,
    'method_content_hash', _a.pinned_content_hash);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bcp_candidate_assignments()
 RETURNS TABLE(assignment_id uuid, application_id uuid, job_id uuid, job_title_sv text, job_title_en text, employer_id uuid, employer_name text, method_name_sv text, method_name_en text, lifecycle_state text, available_from timestamp with time zone, due_at timestamp with time zone, assigned_at timestamp with time zone, submitted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.application_id, a.job_id, j.title_sv, j.title_en, a.employer_id, e.name,
         p.name_sv, p.name_en, a.lifecycle_state, a.available_from, a.due_at,
         a.assigned_at, a.submitted_at
    FROM public.bcp_assignments a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.employers e ON e.id = a.employer_id
    JOIN public.beskt_method_versions v ON v.id = a.method_version_id
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE auth.uid() IS NOT NULL
     AND a.candidate_user_id = auth.uid()
     AND a.lifecycle_state <> 'cancelled'
   ORDER BY a.assigned_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.bcp_candidate_assignments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_candidate_assignments() TO authenticated, service_role;

-- ---- policies back to membership ------------------------------------------
DROP POLICY bcp_assignments_party_read ON public.bcp_assignments;
CREATE POLICY bcp_assignments_party_read ON public.bcp_assignments FOR SELECT
  USING ((auth.uid() IS NOT NULL) AND ((candidate_user_id = auth.uid()) OR has_employer_role(auth.uid(), employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])));
DROP POLICY bcp_answers_party_read ON public.bcp_answers;
CREATE POLICY bcp_answers_party_read ON public.bcp_answers FOR SELECT
  USING ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1 FROM (bcp_responses r JOIN bcp_assignments a ON ((a.id = r.assignment_id))) WHERE ((r.id = bcp_answers.response_id) AND ((a.candidate_user_id = auth.uid()) OR ((r.response_state = 'submitted'::text) AND has_employer_role(auth.uid(), a.employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])))))));
DROP POLICY bcp_responses_party_read ON public.bcp_responses;
CREATE POLICY bcp_responses_party_read ON public.bcp_responses FOR SELECT
  USING ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1 FROM bcp_assignments a WHERE ((a.id = bcp_responses.assignment_id) AND ((a.candidate_user_id = auth.uid()) OR ((bcp_responses.response_state = 'submitted'::text) AND has_employer_role(auth.uid(), a.employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])))))));
DROP POLICY bcp_case_links_party_read ON public.bcp_case_links;
CREATE POLICY bcp_case_links_party_read ON public.bcp_case_links FOR SELECT
  USING (has_employer_role(auth.uid(), employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]) OR (candidate_user_id = auth.uid()));
DROP POLICY bcp_case_topics_party_read ON public.bcp_case_topics;
CREATE POLICY bcp_case_topics_party_read ON public.bcp_case_topics FOR SELECT
  USING (EXISTS ( SELECT 1 FROM bcp_case_links l WHERE ((l.id = bcp_case_topics.link_id) AND (has_employer_role(auth.uid(), l.employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]) OR (l.candidate_user_id = auth.uid())))));
DROP POLICY bcp_events_party_read ON public.bcp_events;
CREATE POLICY bcp_events_party_read ON public.bcp_events FOR SELECT
  USING ((auth.uid() IS NOT NULL) AND (is_platform_admin(auth.uid()) OR ((assignment_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM bcp_assignments a WHERE ((a.id = bcp_events.assignment_id) AND ((a.candidate_user_id = auth.uid()) OR has_employer_role(auth.uid(), a.employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]))))))));
DROP POLICY bcp_notice_acknowledgements_party_read ON public.bcp_notice_acknowledgements;
CREATE POLICY bcp_notice_acknowledgements_party_read ON public.bcp_notice_acknowledgements FOR SELECT
  USING ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1 FROM bcp_assignments a WHERE ((a.id = bcp_notice_acknowledgements.assignment_id) AND ((a.candidate_user_id = auth.uid()) OR has_employer_role(auth.uid(), a.employer_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]))))));

-- ---- new functions ----------------------------------------------------------
DROP FUNCTION public.bcp_conduct_decision(uuid);
DROP FUNCTION public.bcp_conduct_report_extensions(uuid);
DROP FUNCTION public.bcp_conduct_record_action(uuid, uuid, uuid, integer, text, text, date, text, date, text);
DROP FUNCTION public.bcp_conduct_record_stance(uuid, uuid, integer, text, text, text, text, text, text, text);
DROP FUNCTION public.bcp_conduct_may_record_stance(uuid);
DROP FUNCTION public.bcp_interview_preparation(uuid);
DROP FUNCTION public.bcp_assignment_supplements(uuid);
DROP FUNCTION public.bcp_submit_supplement(uuid, uuid, text, text, text);
DROP FUNCTION public.bcp_employer_beskt_assignments(uuid);
DROP FUNCTION public.bcp_method_preview(uuid, uuid, uuid);
DROP FUNCTION public.bcp_employer_invitations(uuid);
DROP FUNCTION public.bcp_accept_invitation(uuid, text);
DROP FUNCTION public.bcp_invitation_for_token(text);
DROP FUNCTION public.bcp_revoke_invitation(uuid, uuid, text);
DROP FUNCTION public.bcp_create_invitation(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, text, uuid, text, text, timestamptz);
DROP FUNCTION public.bcp_invitation_token_digest(text);
DROP FUNCTION public.bcp_start_beskt(uuid, uuid, text, uuid, uuid, text, uuid, text, uuid, text, text, timestamptz);
DROP FUNCTION public.bcp_check_start(uuid, text, uuid, uuid, text, uuid, text, uuid, text, text);
DROP FUNCTION public.bcp_version_is_runnable(uuid);
DROP FUNCTION public.bcp_notice_copy_keys_for(text);
DROP FUNCTION public.bcp_notice_sections_for(text);
DROP FUNCTION public.bcp_notice_version_for(text);
DROP FUNCTION public.bcp_employer_people(uuid);
DROP FUNCTION public.bcp_revoke_security_officer(uuid, uuid, text);
DROP FUNCTION public.bcp_appoint_security_officer(uuid, uuid, uuid, text);

-- ---- tables and columns -------------------------------------------------------
DROP TABLE public.bcp_conduct_actions;
DROP TABLE public.bcp_conduct_stances;
DROP TABLE public.bcp_candidate_supplements;

ALTER TABLE public.bcp_events DROP CONSTRAINT bcp_events_event_check;
ALTER TABLE public.bcp_events ADD CONSTRAINT bcp_events_event_check CHECK (event = ANY (ARRAY['assignment_created'::text, 'notice_acknowledged'::text, 'response_saved'::text, 'response_submitted'::text, 'assignment_cancelled'::text, 'assignment_opened'::text, 'pilot_granted'::text, 'pilot_revoked'::text, 'case_linked'::text, 'case_unlinked'::text, 'conduct_session_started'::text, 'conduct_entry_saved'::text, 'conduct_entry_corrected'::text, 'conduct_verification_requested'::text, 'conduct_verification_updated'::text, 'conduct_position_locked'::text, 'conduct_position_reopened'::text, 'conduct_panel_opened'::text, 'conduct_panel_revealed'::text, 'conduct_panel_resolution_recorded'::text, 'conduct_report_finalised'::text]));

ALTER TABLE public.bcp_case_topics DROP CONSTRAINT bcp_case_topics_trigger_shape;
ALTER TABLE public.bcp_case_topics DROP COLUMN trigger_rule_key;
ALTER TABLE public.bcp_case_topics DROP CONSTRAINT bcp_case_topics_topic_reason_check;
ALTER TABLE public.bcp_case_topics ADD CONSTRAINT bcp_case_topics_topic_reason_check CHECK (topic_reason = ANY (ARRAY['omitted'::text, 'discuss_orally'::text]));
ALTER TABLE public.bcp_case_links ALTER COLUMN application_id SET NOT NULL;

ALTER TABLE public.bcp_conduct_entries DROP CONSTRAINT bcp_conduct_entries_not_empty;
ALTER TABLE public.bcp_conduct_entries
  DROP COLUMN event_timing, DROP COLUMN consequence, DROP COLUMN supporting_information,
  DROP COLUMN contradicting_information, DROP COLUMN measures_taken, DROP COLUMN role_link,
  DROP COLUMN information_gap, DROP COLUMN candidate_response;
ALTER TABLE public.bcp_conduct_entries ADD CONSTRAINT bcp_conduct_entries_not_empty CHECK (
    length(btrim(coalesce(observable_fact, ''))) > 0
    OR length(btrim(coalesce(candidate_explanation, ''))) > 0
    OR length(btrim(coalesce(interviewer_interpretation, ''))) > 0
    OR length(btrim(coalesce(alternative_explanation, ''))) > 0
    OR length(btrim(coalesce(protective_factor, ''))) > 0
    OR length(btrim(coalesce(verification_need, ''))) > 0);

ALTER TABLE public.bcp_assignments DROP CONSTRAINT bcp_assignments_invitation_fk;
DROP INDEX public.bcp_assignments_live_invitation_idx;
DROP INDEX public.bcp_assignments_invitation_idx;
ALTER TABLE public.bcp_assignments DROP CONSTRAINT bcp_assignments_spine_check;
ALTER TABLE public.bcp_assignments DROP CONSTRAINT bcp_assignments_vetting_requirements_check;
ALTER TABLE public.bcp_assignments DROP CONSTRAINT bcp_assignments_text_bounds_check;
ALTER TABLE public.bcp_assignments
  DROP COLUMN invitation_id, DROP COLUMN role_title, DROP COLUMN responsible_interviewer_id,
  DROP COLUMN contact_statement, DROP COLUMN security_owner_id, DROP COLUMN role_security_attestation,
  DROP COLUMN lawful_basis_statement;
ALTER TABLE public.bcp_assignments ALTER COLUMN job_id SET NOT NULL;
ALTER TABLE public.bcp_assignments ALTER COLUMN application_id SET NOT NULL;
ALTER TABLE public.bcp_assignments DROP CONSTRAINT bcp_assignments_mode_check;
ALTER TABLE public.bcp_assignments ADD CONSTRAINT bcp_assignments_mode_check CHECK (mode = 'recruitment_support');

DROP TRIGGER bcp_invitations_guard ON public.bcp_invitations;
DROP TABLE public.bcp_invitations;
DROP FUNCTION public.bcp_guard_invitation();
DROP FUNCTION public.bcp_case_access_ok(uuid);
DROP FUNCTION public.bcp_case_vetting_restricted(uuid);
DROP FUNCTION public.bcp_employer_party(uuid);
DROP TRIGGER bcp_security_officers_guard ON public.bcp_security_officers;
DROP TABLE public.bcp_security_officers;
DROP FUNCTION public.bcp_is_security_officer(uuid, uuid);
DROP FUNCTION public.bcp_guard_security_officer();

DO $proof$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'scp_iv_can_read_case') <> 'ab702ede783d97d78a730de52cd197f2' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: scp_iv_can_read_case was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'scp_iv_can_write_case') <> '93e71cd11e0de4345e003140947893bd' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: scp_iv_can_write_case was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'scp_iv_create_case') <> '945372c712b96b9c29f0683f5bae70ec' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: scp_iv_create_case was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_employer_can_read_assignment') <> 'b83a70eae81f318c436c50846688dbbe' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_employer_can_read_assignment was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_party_can_read_method_version') <> '78db634ed36fcc975886e872b1a67f3a' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_party_can_read_method_version was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_version_is_structurally_candidate_safe') <> 'eb73148d35f25e135e800a4f5e09574b' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_version_is_structurally_candidate_safe was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assignable_method_versions') <> '1efd54d66a2e827d5a4bc763826d877f' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_assignable_method_versions was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_assignable_exposure_profiles') <> '2d9fba1e411f8c9a8f589a691eacb3ea' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_assignable_exposure_profiles was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_save_answers') <> '036a726d4b0665cc31c45770132c9ebb' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_save_answers was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_candidate_preparation') <> 'e0842f8b8823fb5496e6e5e6adab9782' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_candidate_preparation was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_employer_assignments') <> 'f09ffaeb5ca3473e59c99c4910474f0e' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_employer_assignments was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_case_preparation_basis') <> '00cd8a959536456b7b45285a6ae7b78d' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_case_preparation_basis was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_linkable_interview_cases') <> '24defa1951aa4796aad136bff10d08eb' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_linkable_interview_cases was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_unlink_preparation_from_case') <> 'a709479455171b80287650f522c98534' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_unlink_preparation_from_case was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_link_preparation_to_case') <> 'eb08d453eba12c5d7dad34e1d32c4e14' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_link_preparation_to_case was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_guard_case_link') <> 'b54d4695599fdec8cb6a629fc55bb534' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_guard_case_link was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_guard_case_topic') <> '2f5c68ec3d3d44b29da43425a0002855' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_guard_case_topic was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_guard_assignment') <> 'd71f08d70abfb27a799dd4068c7b616e' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_guard_assignment was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_guard_conduct_entry') <> '810ec8d79dbb9455cf2ef3df0ef015ec' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_guard_conduct_entry was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_save_entry') <> 'a7147256e257190ef567cea1776e00be' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_conduct_save_entry was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_workspace') <> '8a8b9889c50f0bc03ae35f43e218bb86' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_conduct_workspace was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_entry_history') <> 'dc03d230f9da655235af56f5dbe0ee34' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_conduct_entry_history was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_build_report_basis') <> '933a941b6fb8a502807d8c582f7d22f3' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_conduct_build_report_basis was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_report_blockers') <> '286f9bec7e6bea3bf68823756eefff84' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_conduct_report_blockers was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_conduct_topic_prompts') <> '8eed9c0dd9b0b910262aa92627de7d7d' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_conduct_topic_prompts was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_notice_copy_digest') <> '1183ff140143529234326937a2685d58' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_notice_copy_digest was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_notice_descriptor') <> 'e98e31779bfb79d8c971111a2d2e1b04' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_notice_descriptor was not restored exactly.';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'bcp_candidate_assignments') <> 'b5b16a2cae551842e537d0c1a6192fbc' THEN
    RAISE EXCEPTION 'BCP_COMPLETE_ROLLBACK: bcp_candidate_assignments was not restored exactly.';
  END IF;
  
  RAISE NOTICE 'BCP_BESKT_COMPLETE_ROLLBACK ok';
END $proof$;

COMMIT;
